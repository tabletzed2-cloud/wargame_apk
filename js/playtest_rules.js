// ⚡ BUILD-МАРКЕР: v13.202
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
