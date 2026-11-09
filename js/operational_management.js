// v13.181 — automatic logistics, platoon consolidation and read-only order ETA.
'use strict';
const AUTO_SUPPLY_KINDS = ['ammoSmall', 'grenades', 'ammoOrdnance'];
function autoSupplyNeeds(unit, index) {
    const status = unitAmmoStatus(unit), pending = supplyPendingCargoForUnit(index);
    return AUTO_SUPPLY_KINDS.filter(kind => status[kind].max > 0 &&
        (status[kind].cur + pending[kind]) / status[kind].max < 0.8);
}
function autoSupplyTransport(destination, needs) {
    const state = ensureSupplyState(), depot = getSupplyDepotHex();
    if (!state || !depot || !destination) return null;
    for (const id of supplyAssetIds()) {
        if (!(state.assets[id] && state.assets[id].available > 0)) continue;
        const cargo = supplyCargoOf([{id, count:1}]);
        if (needs && !needs.some(kind => cargo[kind] > 0 && state.stock[kind] > 0)) continue;
        const reach = supplyReachForMobility(supplyAssetMobilityClass(id), depot.col, depot.row, destination);
        if (!reach) continue;
        const probe = {col:depot.col,row:depot.row,assets:[{id,count:1}],mobility:supplyAssetsMobility([{id,count:1}])};
        if (findSupplyRoute(probe,reach.col,reach.row) !== null) return [{id,count:1}];
    }
    return null;
}
function runAutomaticSupply() {
    const campaign = appData.campaign, state = ensureSupplyState();
    if (!campaign || !state || !state.automatic || (campaign.online && typeof onlineMyTurnActive==='function' && !onlineMyTurnActive())) return 0;
    syncSupplyDepotStatus();syncSupplyAssetsFromPlatoon();
    if (!getSupplyDepotHex() || supplyDepotCaptured() || supplyRearConnectionIsLost()) return 0;
    let sent = 0;
    const requests = supplyUnitList().filter(({unit})=>!unit.reconMissionId && !unit.embarkedInBtr && Number.isFinite(unit.col) && Number.isFinite(unit.row))
        .map(entry=>({...entry,needs:autoSupplyNeeds(entry.unit,entry.idx)})).filter(entry=>entry.needs.length);
    requests.sort((a,b)=>{
        const ratio = entry => {const s=unitAmmoStatus(entry.unit);return Math.min(...entry.needs.map(k=>s[k].cur/s[k].max));};
        return ratio(a)-ratio(b);
    });
    requests.forEach(({unit,idx,needs})=>{
        const assets=autoSupplyTransport({col:unit.col,row:unit.row},needs);
        if (assets && sendSupplyDelivery(idx,assets,'unit')) sent++;
    });
    const rearNeeded=AUTO_SUPPLY_KINDS.some(kind=>state.max[kind]>0 && state.stock[kind]/state.max[kind]<0.8);
    if (rearNeeded && !state.deliveries.some(d=>d.kind==='rear') && !supplyRearRouteBlocked()) {
        const assets=autoSupplyTransport(supplyRearPoint(),null);
        if (assets && sendSupplyDelivery(-1,assets,'rear')) sent++;
    }
    return sent;
}
function toggleAutomaticSupply() {
    if (appData.campaign.online && typeof onlineMyTurnActive==='function' && !onlineMyTurnActive()) return;
    const state=ensureSupplyState();if (!state) return;
    state.automatic=!state.automatic;
    if (state.automatic) runAutomaticSupply();
    saveData();renderSupplyPanel();
}

function platoonMergeReason(receiver, donor) {
    const types=['infantry_platoon','bicycle_platoon','motorcycle_platoon','recon_platoon','engineer_platoon'];
    if (!receiver || !donor || receiver===donor) return 'Выберите два разных взвода.';
    if (!types.includes(receiver.type) || receiver.type!==donor.type) return 'Объединяются взводы одного типа.';
    if (receiver.faction && donor.faction && receiver.faction!==donor.faction) return 'Взводы должны принадлежать одной фракции.';
    if (receiver.col==null || receiver.row==null || receiver.col!==donor.col || receiver.row!==donor.row) return 'Взводы должны находиться в одном гексе.';
    if ([receiver,donor].some(u=>u.isDestroyed || u.isSurrendered || u.embarkedInBtr || u.reconMissionId || u.operationalRouted || u.operationalAmmoRouted || operationalUnitInTacticalBattle(u))) return 'Нельзя объединяться в бою, на разведке, в транспорте или при отходе.';
    if ([receiver,donor].some(u=>(u.squads || []).some(s=>s.onReconMission))) return 'Сначала верните отделения из разведки.';
    if (!(receiver.squads || []).some(s=>/штаб/i.test(s.name || '') && (s.fighters || []).some(f=>f.hp>0))) return 'У принимающего взвода должен быть живой штаб.';
    if (!(donor.squads || []).some(s=>(s.fighters || []).some(f=>f.hp>0))) return 'В передаваемом взводе нет живых бойцов.';
    const id=appData.campaign.opUnits.indexOf(donor);
    const signals=hardMode.signalPlatoon || {};
    if (['radios','phones'].some(kind=>(signals[kind] && signals[kind].assigned || []).some(e=>Number(e.unitId)===id && !e.isDestroyed))) return 'Сначала отзовите рацию/телефон у передаваемого взвода.';
    return '';
}
function platoonMergeMarkup(receiver) {
    const units=appData.campaign.opUnits || [], receiverId=units.indexOf(receiver);
    const candidates=units.map((unit,id)=>({unit,id})).filter(x=>!platoonMergeReason(receiver,x.unit));
    if (!candidates.length) return '';
    return '<div class="op-unit-drawer-cards"><b>🔗 Пополнение взвода</b><p>Принять все отделения другого взвода. Его приказы отменяются; остаток ОД — меньший из двух.</p>'+candidates.map(x=>`<button type="button" onclick="mergeOperationalPlatoons(${receiverId},${x.id})">Принять ${escapeCardHtml(x.unit.name)}</button>`).join('')+'</div>';
}
function mergeOperationalPlatoons(receiverId, donorId, confirmed) {
    const c=appData.campaign, units=c.opUnits, receiver=units[receiverId], donor=units[donorId];
    if (c.online && typeof onlineMyTurnActive==='function' && !onlineMyTurnActive()) return false;
    const reason=platoonMergeReason(receiver,donor);if (reason) {log(reason);return false;}
    if (!confirmed && !confirm(`Влить «${donor.name}» в «${receiver.name}»? Приказы второго взвода отменятся. Отменить объединение нельзя.`)) return false;
    const orders=[...(hardMode.orders || []),...(hardMode.pendingOrders || []),...(hardMode.messengerQueue || [])];
    orders.filter(o=>o.toUnitId!=null && Number(o.toUnitId)===donorId && !['completed','cancelled'].includes(o.status)).forEach(o=>cancelOrder(o.id,true));
    orders.filter(o=>o.type==='company_order' && Array.isArray(o.subUnitIds)).forEach(o=>{o.subUnitIds=o.subUnitIds.filter(id=>Number(id)!==donorId);});
    const reserveSnapshots=new Map([receiver,donor].map(u=>{
        const reserve={...(u.ammoReserve || {}),caps:{...((u.ammoReserve || {}).caps || {})}};
        ['small','ordnance'].forEach(kind=>{
            reserve[kind]=Number(reserve[kind]) || 0;
            if (!Number.isFinite(Number(reserve['initial'+kind]))) reserve['initial'+kind]=reserve[kind]+(u.squads || []).reduce((sum,s)=>sum+(Number(s[kind==='small'?'ammoSmall':'ammoOrdnance'])||0),0);
        });
        return [u,reserve];
    }));
    const names=new Set((receiver.squads || []).map(s=>s.name)), renamed=new Map();
    (donor.squads || []).forEach(s=>{
        const original=s.name;let name=original, n=1;
        while(names.has(name)) name=`${original} (${donor.name}${n++>1?' '+n:''})`;
        names.add(name);renamed.set(original,name);s.name=name;s.operationalMergedFrom=donor.name;
        if (s.opUnitName) s.opUnitName=receiver.name;
        receiver.squads.push(s);
    });
    const combined={small:0,ordnance:0,initialsmall:0,initialordnance:0,caps:{}};
    [receiver,donor].forEach(u=>{
        const reserve=reserveSnapshots.get(u);
        ['small','ordnance','initialsmall','initialordnance'].forEach(k=>combined[k]+=Number(reserve[k]) || 0);
        Object.entries(reserve.caps || {}).forEach(([name,cap])=>combined.caps[u===donor ? (renamed.get(name)||name) : name]=cap);
    });
    receiver.ammoReserve=combined;
    receiver.ap=Math.min(Number(receiver.ap)||0,Number(donor.ap)||0);
    receiver.detected=!!(receiver.detected || donor.detected);
    // Keep every unrelated index reference correct after removing the donor.
    const remap=id=>Number(id)===donorId ? receiverId-(receiverId>donorId?1:0) : Number(id)-(Number(id)>donorId?1:0);
    const idKeys=new Set(['unitId','fromUnitId','toUnitId','targetUnitId','escortInfantryId','escortMirrorInfantryId','btrUnitId','disembarkUnitId','ownerUnitId','hqUnitId','selectedUnitId','companyId','parentCompanyId','relayCompanyId','viaCompanyId','embarkedUnitId','batteryUnitId','escortedByUnitId','queueUnitId','selectedPlaceUnitId','uxOrderRouteUnitId','orderJournalSelectedUnitIndex','subUnitId']);
    const arrayKeys=new Set(['subUnitIds','subUnitIdsAll','linkedEscortIds','embarkedUnitIds']);
    const seen=new Set();
    const walk=node=>{
        if (!node || typeof node!=='object' || seen.has(node)) return;seen.add(node);
        Object.entries(node).forEach(([key,value])=>{
            if (['enemyOpUnits','enemyBattalion','battalions','activeBattles','opUnits'].includes(key)) return;
            if (idKeys.has(key) && value!=null && value!=='' && Number.isInteger(Number(value)) && Number(value)>=0) node[key]=remap(value);
            else if (arrayKeys.has(key) && Array.isArray(value)) node[key]=[...new Set(value.map(remap))];
            else walk(value);
        });
    };
    const companyPools=hardMode.messengers && hardMode.messengers.companies;
    walk(c);walk(hardMode);units.filter(u=>u && u!==donor).forEach(walk);
    if (companyPools) hardMode.messengers.companies=Object.fromEntries(Object.entries(companyPools).map(([id,pool])=>[remap(id),pool]));
    c.mergedPlatoonNames=[...new Set([...(c.mergedPlatoonNames || []),donor.name])];
    c.platoonMerges=(c.platoonMerges || []).concat({receiver:receiver.name,donor:donor.name,turn:c.currentTurn}).slice(-50);
    units.splice(donorId,1);
    c.selectedOpUnit=receiver;
    if (window.uxOrderRouteUnitId!=null) window.uxOrderRouteUnitId=remap(window.uxOrderRouteUnitId);
    if (typeof window.opOperationalUiState==='object') {window.opOperationalUiState.selectedUnitId=units.indexOf(receiver);window.opOperationalUiState.menuOpen=false;}
    resetSupplyPanelSelection();
    log(`🔗 «${donor.name}» влит в «${receiver.name}»; бойцы и боеприпасы сохранены.`);
    saveData();closeOpUnitInfoPopup();renderBattalionRoster();renderActiveOrders();redrawOperationalMap();
    return true;
}

function previewOperationalArrival(unit, options, sender) {
    const c=appData.campaign;
    if (!unit || !sender || !options.waypoints || !options.waypoints.length) return {message:'Выберите маршрут для расчёта времени.'};
    if (unit.embarkedInBtr || operationalUnitInTacticalBattle(unit)) return {message:'Срок неизвестен: выполнение ждёт высадки или окончания боя.'};
    if ((hardMode.orders || []).some(o=>o && !['completed','cancelled'].includes(o.status) && operationalOrderIsBlocking(o) && (Number(o.toUnitId)===c.opUnits.indexOf(unit) || (o.subUnitIds || []).includes(c.opUnits.indexOf(unit))))) return {message:'Срок неизвестен: сначала выполняется предыдущий приказ.'};
    const probe={...unit,stealthMove:!!options.stealth};
    const plan=buildOrderRoute(probe,options.waypoints.map(p=>({...p})));
    if (!plan || !plan.target || plan.target.col!==options.waypoints[options.waypoints.length-1].col || plan.target.row!==options.waypoints[options.waypoints.length-1].row) return {message:'Нет проходимого маршрута — время прибытия не определено.'};
    const relay=typeof getRelayCompanyForOrder==='function' ? getRelayCompanyForOrder(sender,unit) : null;
    const legs=relay ? [[sender,relay],[relay,unit]] : [[sender,unit]];
    let delivery=0;
    for (const [from,to] of legs) {
        if (checkCommunication(from,to)!=='messenger') continue;
        const pool=['battalion_hq','hq'].includes(from.type) ? hardMode.messengers.battalion : hardMode.messengers.companies[c.opUnits.indexOf(from)];
        // Production forwards directly when the company has no messenger pool.
        if (!pool && from.type==='company_hq') continue;
        if (!pool || pool.available<=0) return {message:'Срок неизвестен: приказ будет ждать свободного посыльного.'};
        delivery+=previewCourierTurns(from,to);
    }
    const estimate=getOrderEta({...options,type:'move',toUnitId:c.opUnits.indexOf(unit),status:delivery?'delivering':'active',deliveryTurnsNeeded:delivery,deliveryTurnsPassed:0});
    return {arrival:estimate && estimate.etaTime,delivery,message:estimate ? `Ожидаемое прибытие: ${estimate.text}. Доставка: ${delivery ? delivery+' ход' : 'сразу'}. Оценка без боя, новых препятствий и помех связи.` : 'Время пока не определено.'};
}

// Same movement allowance as dispatchMessenger; never reserves a courier.
function previewCourierTurns(from,to) {
    const beve=appData.campaign.playerFaction==='BeVe';
    const fallback=Math.max(1,Math.ceil(getOpHexDistance(from.col,from.row,to.col,to.row)/(beve?4:3)));
    if (!beve) return fallback;
    const route=getRouteToTarget(from.col,from.row,to.col,to.row,{mobility:'motorcycle',type:'infantry_platoon'});
    if (!route || !route.length) return fallback;
    let turns=0,cursor=0;
    while(cursor<route.length) {turns++;let used=0,freeRoad=2;
        while(used<4 && cursor<route.length) {const p=route[cursor++];if(getOpHexTypes(p.col,p.row).includes('road') && freeRoad>0) freeRoad--;else used++;}
    }
    return turns;
}
