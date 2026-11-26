// ⚡ BUILD-МАРКЕР: v13.205
// Shared operational playtest rules. No timers or hidden mission entities.
function reconRouteCheckpoint(unit, order) {
    if (!unit || !order || !order.reconRoute || unit.isInBattle) return false;
    const turn = Number(appData.campaign.currentTurn) || 1;
    if (order.reconPauseTurn === turn) return true;
    const points = order.reconPoints || [];
    const done = order.reconObservedPoints || (order.reconObservedPoints = []);
    const index = points.findIndex((p, i) => !done.includes(i) && p.observe !== false &&
        Number(p.col) === Number(unit.col) && Number(p.row) === Number(unit.row));
    if (index < 0) return false;
    const mission = {id:'route-'+order.id,unitId:appData.campaign.opUnits.indexOf(unit),assetName:unit.name,
        currentHex:{col:unit.col,row:unit.row},reportMethod:'radio'};
    observeInRange(unit, mission, typeof RECON_RANGE_STANDING === 'number' ? RECON_RANGE_STANDING : 5,
        {isScout:true,pauseBonus:2});
    done.push(index); order.reconPauseTurn = turn; order.status = 'active'; unit.ap = 0;
    log(`🔍 ${unit.name}: остановка для разведки (${unit.col},${unit.row}); движение продолжится в следующем оперативном ходу.`);
    return true;
}

// A live cable follows its endpoints; a physically cut cable is never healed here.
function extendMovingPhoneLines(unit) {
    if (typeof hardMode === 'undefined' || !hardMode.enabled || !Array.isArray(hardMode.phoneLines)) return 0;
    const units = appData.campaign.opUnits || [], id = units.indexOf(unit);
    if (id < 0) return 0;
    let count = 0;
    hardMode.phoneLines.forEach(line => {
        if (!line || ![Number(line.fromUnitId),Number(line.toUnitId)].includes(id) || (line.laying && !line.relayPending)) return;
        if (line.intact === false && !['movement','range'].includes(line.cutReason) && !line.relayPending) return;
        const from = units[line.fromUnitId], to = units[line.toUnitId];
        if (!from || !to || !hasActivePhoneAt(line.fromUnitId) || !hasActivePhoneAt(line.toUnitId)) return;
        const built = buildPhoneSignalRouteTo(from,to);
        if (!built.ok) {line.intact=false;line.laying=false;line.cutReason='range';return;}
        line.path = built.route.map(p => ({col:p.col,row:p.row}));
        line.fromHex = `${from.col},${from.row}`; line.toHex = `${to.col},${to.row}`;
        line.intact=true;line.laying=false;delete line.relayPending;
        if (['range','movement'].includes(line.cutReason)) {delete line.cutReason;delete line.cutHex;}
        count++;
    });
    return count;
}

// Stealth is checked once per enemy per turn, not once per route step/UI refresh.
// At distance 2+: +3 concealment => only a natural 10 detects within normal LOS.
function signalRepairContact(task, opponents, col, row) {
    const turn = Number(appData.campaign.currentTurn) || 1;
    if (task.contactTurn !== turn) {task.contactTurn=turn;task.contactsChecked=[];task.detectedBy=[];}
    for (const enemy of opponents || []) {
        if (!enemy || enemy.isDestroyed || enemy.isSurrendered || enemy.isInBattle ||
            !Number.isFinite(enemy.col) || !Number.isFinite(enemy.row)) continue;
        const distance = getOpHexDistance(col,row,enemy.col,enemy.row);
        if (distance > 3) continue;
        const key = `${enemy.name}:${enemy.col},${enemy.row}`;
        if (distance === 0 || task.detectedBy.includes(key)) return enemy;
        if (task.contactsChecked.includes(key)) continue;
        if (typeof opLineOfSightBlocked === 'function' && opLineOfSightBlocked(enemy.col,enemy.row,col,row)) continue;
        task.contactsChecked.push(key);
        const roll = typeof rollD10 === 'function' ? rollD10() : Math.floor(Math.random()*10)+1;
        if (distance === 0 || roll >= (distance === 1 ? 8 : 10)) {
            task.detectedBy.push(key); return enemy;
        }
    }
    return null;
}
function signalRepairsHitByShelling(hexKey) {
    if (typeof hardMode === 'undefined') return;
    const hit = () => (typeof rollD6 === 'function' ? rollD6() : Math.floor(Math.random()*6)+1) >= 5;
    (hardMode.phoneLineRepairTasks || []).slice().forEach(task => {
        if (`${task.col},${task.row}` !== String(hexKey) || !hit()) return;
        const line = (hardMode.phoneLines || []).find(l => l.id === task.lineId);
        if (line) losePhoneLineRepairTeam(task,line,{name:'артиллерийский обстрел'});
    });
    hardMode.enemyPhoneRepairs = (hardMode.enemyPhoneRepairs || []).filter(task => {
        if (String(task.cutHex) !== String(hexKey) || !hit()) return true;
        const line = (hardMode.enemyPhoneLines || []).find(l => l.id === task.lineId);
        if (line) {line.repairCooldownTurn=(Number(appData.campaign.currentTurn)||1)+2;line.repairBlockedByPlayer=true;}
        // No report to the player: losses of a concealed enemy repair party are private.
        return false;
    });
}
function enemyCableCutPublicNotice(line) {
    const key = String(line && line.cutHex || '');
    return /^-?\d+,-?\d+$/.test(key) ? `✂️ На гексе (${key}) перерезан телефонный кабель противника.` : '✂️ Перерезан телефонный кабель противника.';
}

// Depots are laid out after the fighting units, using a real wheeled-truck proxy.
function operationalSupplyDeployment(unit, zone, allies, opponents) {
    const truck = {name:'Грузовик снабжения',type:'supply_truck',mobility:'vehicle'};
    const distance = (a,b) => getOpHexDistance(a.col,a.row,b.col,b.row);
    const friends = (allies || []).filter(u => u && u!==unit && !u.isDestroyed && Number.isFinite(u.col) && Number.isFinite(u.row));
    const threats = (opponents || []).filter(u => u && !u.isDestroyed && Number.isFinite(u.col) && Number.isFinite(u.row));
    return (zone || []).filter(p => Number.isFinite(getOpMoveCost(truck,p.col,p.row,p.col,p.row)) &&
        (typeof getOpHexNeighbors !== 'function' || getOpHexNeighbors(p.col,p.row).some(n => Number.isFinite(getOpMoveCost(truck,p.col,p.row,n.col,n.row)))))
        .map(p => {
            const distances = friends.map(u => distance(p,u)), mean=distances.length?distances.reduce((a,b)=>a+b,0)/distances.length:0;
            const variance=distances.length?distances.reduce((a,b)=>a+(b-mean)**2,0)/distances.length:0;
            const danger=threats.length?Math.min(...threats.map(u => distance(p,u))):8;
            const occupied=friends.filter(u => distance(p,u)===0).length;
            return {...p,score:mean+Math.sqrt(variance)*0.8+Math.max(0,6-danger)*4+occupied*3};
        }).sort((a,b)=>a.score-b.score || a.row-b.row || a.col-b.col)[0] || null;
}

// Seek a continuous passable lane through the incoming edge, not the worst
// terrain anywhere in the destination hex. Samples stay inside the two hexes.
function opLayerSegmentHitsPolygon(a, b, points) {
    if (opPointInPolygon(a.x,a.y,points) || opPointInPolygon(b.x,b.y,points)) return true;
    const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    const on=(p,q,r)=>Math.abs(cross(p,q,r))<1e-7 &&
        r.x>=Math.min(p.x,q.x)-1e-7 && r.x<=Math.max(p.x,q.x)+1e-7 &&
        r.y>=Math.min(p.y,q.y)-1e-7 && r.y<=Math.max(p.y,q.y)+1e-7;
    return points.some((point,i)=>{
        const next=points[(i+1)%points.length],c={x:point[0],y:point[1]},d={x:next[0],y:next[1]};
        return (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) ||
            on(a,b,c) || on(a,b,d) || on(c,d,a) || on(c,d,b);
    });
}
function opLayerFootCorridor(fromCol,fromRow,toCol,toRow) {
    if (!opLayersReady() || !Number.isFinite(fromCol) || !Number.isFinite(fromRow)) return null;
    const a=opHexSourcePoint(fromCol,fromRow),b=opHexSourcePoint(toCol,toRow);
    if (!a || !b) return null;
    const dx=b.x-a.x,dy=b.y-a.y;
    const layers=appData.campaign.opLayers.layers;
    const typesAt=(x,y)=>Object.keys(layers).filter(id => (layers[id] || []).some(poly =>
        Array.isArray(poly.points) && opPointInPolygon(x,y,poly.points)));
    let best=null;
    for (const offset of [-0.27,-0.18,-0.09,0,0.09,0.18,0.27]) {
        const terrain=new Set();let blocked=false;
        const point=t=>({x:a.x+dx*t-dy*offset,y:a.y+dy*t+dx*offset});
        // Exact intersection for blockers prevents skipping a thin river or bog
        // between samples. Sampling below is only for traversable terrain cost.
        if (['water','swamp_impassable'].some(id=>(layers[id] || []).some(poly=>
            Array.isArray(poly.points) && opLayerSegmentHitsPolygon(point(0.40),point(0.82),poly.points)))) continue;
        for (let step=0;step<=12;step++) {
            const t=0.40+step*0.035;
            const types=typesAt(a.x+dx*t-dy*offset,a.y+dy*t+dx*offset);
            if (types.includes('water') || types.includes('swamp_impassable')) {blocked=true;break;}
            types.forEach(type=>terrain.add(type));
        }
        if (blocked) continue;
        const cost=[...terrain].some(t=>/^height[123]$/.test(t)) || terrain.has('swamp_passable')?3:2;
        if (!best || cost<best.cost) best={cost,types:[...terrain]};
    }
    return best;
}

// No tactical commitment without intelligence, unless the commander explicitly
// accepts a blind assault after a bounded, unsuccessful reconnaissance phase.
function operationalAIReconPreparation(campaign, faction, units) {
    const intel=(campaign.opUnits || []).filter(u=>u && !u.isDestroyed && !u.isSurrendered && u.detected===true);
    const state=campaign.enemyAIRecon || (campaign.enemyAIRecon={startedTurn:Number(campaign.currentTurn)||1});
    if (intel.length) {state.reportTurn=Number(campaign.currentTurn)||1;state.reportCount=intel.length;return null;}
    if (state.blindAssault || campaign.enemyAIBlindAssault) return null;
    const turn=Number(campaign.currentTurn)||1;
    if (turn-state.startedTurn>=3) {
        state.blindAssault=true;state.blindAssaultTurn=turn;
        log('🧠 Противник: разведка не дала контактов за три хода; командир сознательно допускает наступление вслепую.');
        return null;
    }
    let scouts=(units || []).filter(u=>!u.isDestroyed && !u.isSurrendered && operationalAIRole(u)==='recon');
    if (!scouts.length) scouts=(units || []).filter(u=>['mobile','infantry'].includes(operationalAIRole(u))).slice(0,1);
    state.scoutNames=scouts.map(u=>u.name);
    return {version:0,faction,strategyId:'recon_pending',label:'Разведка перед выбором тактики',mode:'recon_prepare',
        selectedAtTurn:turn,plan:{},reconPending:true};
}

function tacticalOperationalPassengerOnHex(passenger, units, anchor) {
    return !!(passenger && passenger.embarkedInBtr && (units || []).some(carrier => carrier &&
        Number(carrier.col) === Number(anchor.col) && Number(carrier.row) === Number(anchor.row) &&
        (carrier.embarkedUnit === passenger.name ||
         (appData.campaign.opUnits || [])[carrier.embarkedUnitId] === passenger ||
         (appData.campaign.enemyOpUnits || [])[carrier.embarkedUnitId] === passenger ||
         (carrier.embarkedUnitIds || []).some(i => (appData.campaign.opUnits || [])[i] === passenger ||
             (appData.campaign.enemyOpUnits || [])[i] === passenger))));
}
function tacticalBtrCanFire(squad) {
    if (!squad || !squad.armor || !/БТР|BTR|Llanero/i.test(squad.name || '')) return true;
    const list = (appData.map?.enemySquads || []).includes(squad) ? appData.map.enemySquads : appData.squads;
    const passenger = (list || [])[squad.embarkedSquadIndex];
    return squad.embarkedSquadIndex != null && !!(passenger && passenger.hidden && !passenger.isDestroyed &&
        !passenger.isRetreated && (passenger.fighters || []).some(f => f && f.hp > 0));
}
function operationalEscortStealth(leader) {
    const id = (appData.campaign.opUnits || []).indexOf(leader);
    const orders = typeof getAllOrdersList === 'function' ? getAllOrdersList() : [];
    const active = orders.filter(o => o && !['completed','cancelled'].includes(o.status) &&
        (o.type === 'company_order' ? (o.subUnitIdsAll || o.subUnitIds || []).map(Number).includes(id) : Number(o.toUnitId) === id));
    const executing=active.filter(order=>order.status==='active');
    const latest = executing[executing.length - 1] || active[active.length - 1];
    const step = latest?.series?.find(s => s && !['completed','cancelled'].includes(s.status)) || latest;
    return !!(step ? step.stealth : leader.stealthMove);
}
function tacticalSurrenderEligible(losers, opponents) {
    const living = list => (list || []).filter(s => s && !s.isDestroyed && !s.isRetreated &&
        !s.isSurrendered && !['destroyed','retreated','surrendered'].includes(s.status) &&
        (s.fighters || []).some(f => f && f.hp > 0));
    const surrendering = living(losers), foes = living(opponents);
    return surrendering.length > 0 && surrendering.every(s =>
        tacticalMoraleCurrent(s) === 0 &&
        ['ammoSmall','ammoOrdnance','grenades'].every(key => !(Number(s[key]) > 0)) &&
        foes.some(enemy => {const d=tacticalSquadsDistance(s,enemy);return d !== null && d <= 3;}));
}
function tacticalApplySuperiorityPressure(side) {
    const own = tacticalSideSquads(side), other = tacticalSideSquads(side === 'player' ? 'enemy' : 'player');
    const count = list => (list || []).filter(s => s && !s.isDestroyed && !s.isRetreated && !s.isSurrendered)
        .reduce((n,s) => n+(s.fighters || []).filter(f=>f && f.hp>0).length,0);
    const ours=count(own), theirs=count(other);
    if (!ours || theirs < ours*2 || theirs-ours < 4) return;
    own.forEach(s => {
        if (!s || s.isDestroyed || s.isRetreated || s.isSurrendered) return;
        // Five percentage points, not five legacy morale units per soldier.
        s.currentMorale=Math.max(0,tacticalMoraleCurrent(s)-5);
        if (typeof currentSquad !== 'undefined' && currentSquad === s) morale=s.currentMorale;
    });
    log('🫡 Численное давление: меньшая сторона теряет 5 пунктов духа за завершённый ход.');
}

// Roll both forces BEFORE applying either loss. A wiped defender still strikes
// in this exchange; combat is resolved once per pair per tactical phase.
function tacticalMeleeRollDamage(squad) {
    if (squad.isRouting || squad.isRetreated || squad.isSurrendered ||
        (typeof tacticalMoraleIsSuppressed==='function' && tacticalMoraleIsSuppressed(squad))) return 0;
    let bonus=0;
    for (const key of ['spanishFury','porLaRevolucion']) {
        const effect=squad.effects?.[key];
        if (effect?.active && !effect.used) {bonus++;effect.used=true;}
    }
    if (squad.effects?.calvinistRestraint) bonus--;
    const weapons=getFactionWeapons(squad.faction) || [];
    squad.lastMeleeRolls=[];
    return (squad.fighters || []).reduce((damage,f) => {
        if (!f || f.hp<=0) return damage;
        const weapon=weapons.find(w=>w.name===f.weapon);
        const mod=bonus+(/винтовка|карабин/i.test(weapon?.name || '')?1:0)+
            ((f.awards || []).includes('melee')?1:0);
        let die=rollD6();
        if (die===1 && (squad.flemishFury || squad.meleeNoOne || (squad.appliedCards || []).includes('Фламандская Фурия'))) die=2;
        squad.lastMeleeRolls.push(die);
        return damage+(die+mod>=5?3:0);
    },0);
}
function tacticalResolveMeleePair(a,b) {
    if (!a || !b || a.armor || b.armor || a.isDestroyed || b.isDestroyed ||
        tacticalDotMeleeImmune(a) || tacticalDotMeleeImmune(b) || tacticalSquadsDistance(a,b)!==0) return false;
    const turn = typeof currentTurn !== 'undefined' ? currentTurn : 1;
    const all=[...(appData.squads || []),...(appData.map.enemySquads || [])];
    const key=[all.indexOf(a),all.indexOf(b)].sort((x,y)=>x-y).join(':');
    const rounds=appData.map.meleePairRounds || (appData.map.meleePairRounds={});
    if (rounds[key]===turn) return false;
    rounds[key]=turn;
    const aDamage=a.meleeResolvedTurn===turn?0:tacticalMeleeRollDamage(a), bDamage=b.meleeResolvedTurn===turn?0:tacticalMeleeRollDamage(b);
    const result=()=>({damage:0,killed:[],wounded:[],notes:[]});
    applyDamagePointsToEnemy(b,aDamage,result());
    applyDamagePointsToEnemy(a,bDamage,result());
    a.meleeResolvedTurn=turn;b.meleeResolvedTurn=turn;
    tacticalChangeMorale(a,-1);tacticalChangeMorale(b,-1);
    if (!a.isDestroyed && (b.isDestroyed || aDamage>0)) tacticalChangeMorale(a,b.isDestroyed?3:1);
    if (!b.isDestroyed && (a.isDestroyed || bDamage>0)) tacticalChangeMorale(b,a.isDestroyed?3:1);
    [[a,b,aDamage],[b,a,bDamage]].forEach(([attacker,target,damage])=>{
        const index=(appData.squads || []).indexOf(attacker);
        if (index<0) return;
        target.lastAwardAttackerSquadName=attacker.name;target.lastAwardAttackerSquadIdx=index;
        if (typeof recordTacticalAwardCombatEvent==='function') recordTacticalAwardCombatEvent(attacker,'melee',target);
        if (target.isDestroyed && typeof recordTacticalAwardEnemyDefeat==='function')
            recordTacticalAwardEnemyDefeat(attacker,target,(appData.map.enemySquads || []).indexOf(target));
    });
    log(`⚔️ Рукопашная «${a.name}» ↔ «${b.name}»: одновременный урон ${aDamage} / ${bDamage}.`);
    if (typeof tacticalClearMeleeEngagement==='function') {
        if (a.isDestroyed) tacticalClearMeleeEngagement(a);
        if (b.isDestroyed) tacticalClearMeleeEngagement(b);
    }
    saveData();updateUI();redrawMap();
    return true;
}

// A movement event is local intelligence: only this observer and opposing
// infantry within two actual hexes may participate. Never rescan distant units.
function tacticalMovementContactChecks(observer) {
    const map=appData && appData.map;
    const alive=s=>s && !s.isDestroyed && !s.isRetreated && !s.isSurrendered &&
        !['destroyed','retreated','surrendered'].includes(s.status) &&
        (s.fighters || []).some(f=>f && f.hp>0 && !f.isAway);
    if (!map?.grid || !alive(observer)) return {checked:0,detected:0};
    const enemy=(map.enemySquads || []).includes(observer);
    const own=enemy?map.enemySquads:appData.squads;
    const pos=getBattleSquadHex(map.grid,own.indexOf(observer),enemy);
    const result={checked:0,detected:0};
    if (!pos) return result;
    const night=typeof isNightTime==='function' && isNightTime() && !tacticalIlluminationActive();
    (enemy?appData.squads:map.enemySquads || []).forEach((target,index)=>{
        if (!alive(target) || (target.detected && !target.hidden) || target.camouflaged ||
            (typeof isArmoredTacticalSquad==='function' && isArmoredTacticalSquad(target))) return;
        const tp=getBattleSquadHex(map.grid,index,!enemy);
        if (!tp) return;
        const distance=hexGridDistance(pos.col,pos.row,tp.col,tp.row);
        if (distance>2) return;
        result.checked++;
        // Noise is evidence, not permission to see through hills or smoke.
        const visible=tacticalObserverCanSeeHex(observer,pos.key,tp.key,night,map);
        if (!visible && distance>0) return;
        const revealed=distance===0 || (distance===1 ? Math.random()<0.99 :
            rollD10()+autoTacticalDetectionMod(target,observer)+(target.noiseMarker?2:0)>=8);
        if (!revealed) return;
        target.hidden=false;target.detected=true;target.noiseMarker=false;
        if (typeof tacticalClearArmoredNoise==='function') tacticalClearArmoredNoise(target);
        result.detected++;
        // Never expose names/coordinates of a still concealed player to the UI.
        log(enemy?'🔍 Противник обнаружил ваше отделение при сближении.':`🔍 При сближении обнаружен «${target.name || 'отряд'}».`);
    });
    return result;
}

function tacticalAISupplyAction(squad,index) {
    const map=appData.map;
    if (!squad || squad.hidden || squad.isDestroyed || squad.isRetreated || squad.isSurrendered || squad.isRouting ||
        (squad.fighters || []).some(f=>f && f.isAway && f.ammoRun) || tacticalIsMeleeEngaged(squad)) return false;
    const pos=getBattleSquadHex(map.grid,index,true);
    if (!pos || !activeSupplyPointKeys(map,'enemy').length) return false;
    const weapons=getFactionCrewWeapons(squad.faction) || [];
    const hasGun=(squad.crewInstances || []).some(ci=>ci && ci.active!==false &&
        weapons.some(w=>w.name===ci.weaponName && ['at_gun','tank_gun','mortar'].includes(w.type)));
    const fields=[...(hasGun?['ammoOrdnance']:[]),'ammoSmall'];
    const source=tacticalAmmoSourceUnit(squad,'enemy');
    const field=fields.find(f=>{
        const full=tacticalAmmoCapacity(squad,f,'enemy');
        const kind=f==='ammoOrdnance'?'ordnance':'small';
        return full>0 && Number(squad[f])<=full*0.2 && Number(source?.ammoReserve?.[kind])>0;
    });
    if (!field) return false;
    const context={side:'enemy',ai:true,squad,index};
    if (!tacticalActionAllowed(squad,'utility',true,context)) return false;
    const point=nearestSupplyPoint(map,pos.key,'enemy');
    if (!point) return false;
    const runners=mapActionEligibleAmmoRunners(squad);
    // Match player runner eligibility; never send the last available soldier.
    if (!runners.length ||
        (squad.fighters || []).filter(f=>f && f.hp>0 && !f.isAway).length<2) return false;
    const fighter=runners[0].fighter;
    if (!tacticalDispatchAmmoRunner(squad,fighter,'enemy',pos,point,field==='ammoOrdnance'?'2':'1')) return false;
    log('📦 Противник отправил бойца к своему пункту боепитания.');
    return true;
}

// Search actual evidence or unexamined terrain; do not read undiscovered
// opponents' positions to choose where to point binoculars.
function tacticalAIReconAction(squad,index) {
    const map=appData.map,turn=Number(currentTurn)||1;
    if (!squad || squad.hidden || squad.isDestroyed || squad.isSurrendered || squad.isRetreated || squad.isRouting ||
        !mapActionCanUseBinoculars(squad) || tacticalIsMeleeEngaged(squad) ||
        squad.tacticalAIReconTurn===turn || getTacticalSideAP(squad,'enemy')<2) return false;
    const pos=getBattleSquadHex(map.grid,index,true);
    if (!pos) return false;
    const noise=new Set((map.tacticalNoiseMarkers || []).filter(m=>m && m.viewerSide==='enemy' && Number(m.expiresTurn)>=turn)
        .map(m=>`${m.col},${m.row}`));
    const visible=(appData.squads || []).filter(s=>s && s.detected && !s.hidden && !s.camouflaged && !s.isDestroyed && !s.isRetreated);
    const known=visible.map(s=>getBattleSquadHex(map.grid,appData.squads.indexOf(s),false)).filter(Boolean);
    const examined=map.tacticalAIReconExamined || (map.tacticalAIReconExamined={});
    const candidates=Object.keys(map.grid).map(key=>{
        const [col,row]=key.split(',').map(Number),distance=hexGridDistance(pos.col,pos.row,col,row);
        const age=turn-Number(examined[key] ?? -100);
        const contact=known.some(p=>hexGridDistance(p.col,p.row,col,row)<=1);
        return {key,col,row,distance,score:(noise.has(key)?100:0)+(contact?10:0)+Math.min(10,age)-Math.abs(distance-4)};
    }).filter(p=>p.distance>0 && p.distance<=8 && (examined[p.key]==null || turn-Number(examined[p.key])>=2))
        .sort((a,b)=>b.score-a.score || a.key.localeCompare(b.key));
    for (const candidate of candidates) {
        if (!mapActionUseBinocularsForSide(index,candidate.key,'enemy')) continue;
        examined[candidate.key]=turn;squad.tacticalAIReconTurn=turn;return true;
    }
    return false;
}

// Finite platoon stocks. Tactical squads are snapshots; their owner's reserve
// remains on the operational unit and must never be cloned/re-created per trip.
function tacticalAmmoInitializeUnit(unit) {
    const reserve=platoonAmmoReserveInit(unit);
    if (!reserve) return null;
    const squads=operationalAmmoSquads(unit);
    if (!Number.isFinite(Number(reserve.grenades))) {
        reserve.grenades=Math.ceil(squads.reduce((n,s)=>n+Math.max(0,Number(s.grenades)||0),0)*PLATOON_AMMO_RESERVE_RATIO);
    }
    if (!Number.isFinite(Number(reserve.initialgrenades))) {
        reserve.initialgrenades=reserve.grenades+squads.reduce((n,s)=>n+Math.max(0,Number(s.grenades)||0),0);
    }
    squads.forEach((s,i)=>{
        const cap=reserve.caps[String(s.name || `squad${i}`)];
        if (cap && cap.grenades==null) cap.grenades=Math.max(0,Number(s.grenades)||0);
    });
    return reserve;
}

function tacticalAmmoSourceUnit(squad,side) {
    if (!squad) return null;
    const campaign=appData.campaign || {},map=appData.map;
    const units=side==='enemy'?(campaign.enemyOpUnits || []):(campaign.opUnits || []);
    const find=list=>{
        for (const unit of list) {
            if (!unit) continue;
            if (squad.opUnitName ? unit.name===squad.opUnitName : operationalAmmoSquads(unit).includes(squad)) return unit;
            const nested=find(unit.vehicleList || []);
            if (nested) return nested;
        }
        return null;
    };
    let unit=find(units);
    if (!unit && campaign.active) return null; // missing owner is NOT an unlimited supply point
    if (!unit && map) {
        // Standalone scenarios have no operational roster. Keep one finite pool
        // per side/platoon in the saved map, never a new pool per runner.
        const groups=map.tacticalAmmoReserves ||= {player:{},enemy:{}};
        const pools=groups[side] ||= {};
        const owner=String(squad.opUnitName || 'standalone');
        const squads=(side==='enemy'?(map.enemySquads || []):(appData.squads || []))
            .filter(s=>s && String(s.opUnitName || 'standalone')===owner);
        if (!pools[owner]) {
            const initial={name:owner,squads};
            tacticalAmmoInitializeUnit(initial);
            pools[owner]=initial.ammoReserve;
        }
        unit={name:owner,squads,ammoReserve:pools[owner]};
    }
    if (!unit || unit.isDestroyed || unit.isSurrendered) return null;
    tacticalAmmoInitializeUnit(unit);
    return unit;
}

function tacticalAmmoCapacity(squad,field,side) {
    const full=Number(squad[field+'Full']);
    if (Number.isFinite(full) && full>0) return full;
    const source=tacticalAmmoSourceUnit(squad,side);
    const kind={ammoSmall:'small',ammoOrdnance:'ordnance',grenades:'grenades'}[field];
    const recorded=Number(source?.ammoReserve?.caps?.[squad.name]?.[kind]) || 0;
    const capacity=typeof supplySquadCapacity==='function'?supplySquadCapacity(squad,field):0;
    return Math.max(recorded,capacity,Number(squad[field])||0);
}

// Reserve cargo now, not when the soldier returns. Concurrent runners cannot
// promise the same ammunition, and saving/reloading never charges it twice.
function tacticalReserveRunnerCargo(squad,fighter,side) {
    if (fighter.ammoCargo?.version===1) return fighter.ammoCargo.amount>0;
    const spec={'1':['ammoSmall','small',30],'2':['ammoOrdnance','ordnance',10],'3':['grenades','grenades',5]}[String(fighter.ammoType || '1')];
    if (!spec) return false;
    const [field,kind,limit]=spec,unit=tacticalAmmoSourceUnit(squad,side);
    const incoming=(squad.fighters || []).filter(f=>f && f!==fighter && f.isAway && f.ammoCargo?.field===field)
        .reduce((n,f)=>n+Math.max(0,Number(f.ammoCargo.amount)||0),0);
    const need=Math.max(0,tacticalAmmoCapacity(squad,field,side)-(Number(squad[field])||0)-incoming);
    const amount=unit?Math.min(limit,Math.max(0,Math.floor(Number(unit.ammoReserve[kind])||0)),need):0;
    fighter.ammoCargo={version:1,field,kind,amount,ownerName:unit?.name || null,sourceSide:side};
    if (amount<=0) return false;
    unit.ammoReserve[kind]-=amount;
    return true;
}

function tacticalRefundRunnerCargo(squad,fighter,side) {
    const cargo=fighter.ammoCargo;
    if (!cargo || cargo.amount<=0) return;
    const unit=tacticalAmmoSourceUnit(squad,side);
    if (unit && unit.name===cargo.ownerName && side===cargo.sourceSide) {
        unit.ammoReserve[cargo.kind]=(Number(unit.ammoReserve[cargo.kind])||0)+cargo.amount;
    }
    cargo.amount=0;
}

function tacticalDispatchAmmoRunner(squad,fighter,side,pos,supply,type) {
    if (!fighter || fighter.isAway || fighter.hp<=0 || !supply || !pos) return false;
    fighter.ammoType=String(type);
    if (!tacticalReserveRunnerCargo(squad,fighter,side)) {
        delete fighter.ammoCargo;delete fighter.ammoType;
        return false;
    }
    fighter.isAway=true;fighter.ammoSupplyHex=supply.key;
    fighter.turnsToReturn=Math.max(1,Math.ceil(supply.distance/4)*2);
    fighter.ammoRun={hex:pos.key,stage:'outbound',loaded:false,distance:supply.distance,side};
    return true;
}

// Include reserve + carried ammunition in the operational low-stock ratio.
function operationalAIAmmoSupplyStatus(unit) {
    const status=unitAmmoStatus(unit),reserve=tacticalAmmoInitializeUnit(unit);
    const reserves={};
    for (const [field,kind] of [['ammoSmall','small'],['ammoOrdnance','ordnance'],['grenades','grenades']]) {
        const initialCaps=Object.values(reserve.caps || {}).reduce((n,c)=>n+(Number(c[kind])||0),0);
        const max=Math.max(0,(Number(reserve['initial'+kind])||0)-initialCaps,Math.ceil(status[field].max*PLATOON_AMMO_RESERVE_RATIO));
        reserves[field]={kind,max};
        status[field]={cur:status[field].cur+Math.max(0,Number(reserve[kind])||0),max:status[field].max+max};
    }
    return {status,reserves};
}

function operationalAIReceiveSupply(unit,cargo) {
    const left=supplyDistributeCargo(unit,cargo),{reserves}=operationalAIAmmoSupplyStatus(unit);
    for (const field of ['ammoSmall','ammoOrdnance','grenades']) {
        const {kind,max}=reserves[field],have=Math.max(0,Number(unit.ammoReserve[kind])||0);
        const take=Math.min(Number(left[field])||0,Math.max(0,max-have));
        unit.ammoReserve[kind]=have+take;left[field]-=take;
    }
    return left;
}
