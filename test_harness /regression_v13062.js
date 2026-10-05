// v13.062: executable regressions for the 22-point field report (run sequentially).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const names = [
 'applySolidarityWeapons','applyInterbrigadeAwards','applyCardToPlatoon','addAppliedCardName','getCardTargetSpec',
 'advanceTacticalClock','isNightTime','syncNightModifier','isStaticOpUnit',
 'getTacticalBattleRecord','getTacticalActiveSide','setTacticalActiveSide','tacticalEnemyIsNeutralized',
 'tacticalActionAllowed','tacticalIsMeleeEngaged','tacticalClearMeleeEngagement','isBicycleTacticalSquad',
 'tacticalMaybeAutoRetreat','processTacticalRouts','tacticalRetreatUnit','tacticalRemoveUnitFromMap',
 'getAP','getMaxAP','hasBicycleBlitz','spendAP','resetAP','getHexNeighbors','getMovementCost','calculateReachableHexes','recalcReachable','shouldShowTacticalReachability',
 'getOpHexNeighbors','getOpMoveCost','getOpPlannedMoveCost','getRouteToTarget','buildOrderRoute','autoDismountOperational','validateRoute',
 'getTacticalBattleAnchor','getTacticalTargetDistance','throwGrenades','meleeAttack','finishBattle',
 'getOperationalCombatFighters','isOperationalMoraleUnit','getOperationalMorale','findOperationalRallyHQ','findOperationalRetreatPath',
 'changeOperationalMorale','triggerOperationalRetreat','cancelOrdersForMoraleRetreat','retreatFromMelee'
];
fs.writeFileSync('/tmp/wg_part.js', names.map(n => sliceFunction(HTML,n)).join('\n'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ '+name); }
function fresh() {
 const ad = freshAppData();
 const s = createSandbox(ad);
 for (const f of ['js/placement.js','js/map_actions.js','js/online_battles.js']) vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),s.ctx,{filename:f});
 s.run(`var currentSquad = null, currentSquadIndex = 0, currentTurn = 1, morale = 5, actionPoints = [], TACTICAL_MAP_SIZE = 8;
 function placementPendingReason() { return null; }
 function getScopedActiveCardsForSquad() { return []; }
 function getEffectiveMorale() { return morale; }
 function getSuppressionThreshold() { return 2; }
 function getScopedActiveModifiersForSquad() { return []; }
 function getTacticalCoverInfoForEnemy() { return { mod: 0 }; }
 function smallArmsBlockedByForest() { return null; }
 appData.map = { grid: {}, enemySquads: [], mode: 'move', activeSide: 'player', selectedMoveSquadIdx: 0 };
 appData.factions = { 'A.I.R.F.': { weapons: [] } };
 appData.modifiers = [];
 function soldier(name) { return { name, hp: 3, maxHp: 3, weapon: 'Винтовка Vz.24' }; }
 function squad(name) { return { name, faction:'A.I.R.F.', fighters:[soldier('a'),soldier('b')], currentMorale:5, baseMorale:5, crewInstances:[] }; }
 function cell() { return { type:'grass', level:0, squadIds:[], enemySquadIds:[], markers:[] }; }
 function grid(size) { appData.map.grid={}; for(var c=0;c<size;c++) for(var r=0;r<size;r++) appData.map.grid[c+','+r]=cell(); TACTICAL_MAP_SIZE=size; }
 `);
 return s;
}
test('ИПП выдается всем отделениям взвода, игнорируя старые два targetNames',()=>{
 const s=fresh(); s.run(`appData.squads=Array.from({length:6},(_,i)=>squad('s'+i)); applyCardToPlatoon({name:'Индивидуальный перевязочный пакет'},'A.I.R.F.',{name:'p'},appData.squads,['s0','s1'],{});`);
 assert(s.evalCtx('appData.squads.every(s=>s.fighters.every(f=>f.hasIPP))'));
 assert.equal(s.evalCtx("getCardTargetSpec('Индивидуальный перевязочный пакет')"),null);
});
test('Интербригада: ровно 2 случайных отделения, все бойцы; повтор не добавляет наград',()=>{
 const s=fresh();s.run(`appData.squads=Array.from({length:6},(_,i)=>squad('s'+i)); var owner={}; applyInterbrigadeAwards(appData.squads,owner); applyInterbrigadeAwards(appData.squads,owner);`);
 assert.equal(s.evalCtx('appData.squads.filter(s=>s.fighters.every(f=>f.awards && f.awards.length===1 && f.awards[0]==="interbrigade")).length'),2);
});
test('Оружие солидарности: одна винтовка на каждый отряд, не командирский ПП и без повторной выдачи',()=>{
 const s=fresh();s.run(`appData.squads=Array.from({length:6},(_,i)=>squad('s'+i)); appData.squads.forEach(s=>s.fighters.unshift({...soldier('commander'),weapon:'ПП Star Si-35',isCommander:true})); applySolidarityWeapons(appData.squads); applySolidarityWeapons(appData.squads);`);
 assert(s.evalCtx(`appData.squads.every(s=>s.fighters[0].weapon==='ПП Star Si-35' && s.fighters.filter(f=>['АВС-36','ППД-40','ДП-27'].includes(f.weapon)).length===1)`));
});
test('Часы: +2 минуты на фазу, полночь и граница операционного хода',()=>{
 const s=fresh();s.run('appData.currentTime=1438; appData.campaign.opTurnStartTime=1430; advanceTacticalClock(2);');
 assert.equal(s.evalCtx('appData.currentTime'),0);assert.equal(s.evalCtx('appData.campaign.currentTurn'),2);
 s.run('advanceTacticalClock(2)'); assert.equal(s.evalCtx('appData.currentTime'),2);
 s.run('appData.currentTime=17; appData.campaign.opTurnStartTime=0; advanceTacticalClock(2)');assert.equal(s.evalCtx('appData.currentTime'),19);
});
test('Ночь активна с 23:00 до 05:00, 00:00 не подменяется дневным временем',()=>{
 const s=fresh();for(const [time,expected] of [[0,true],[299,true],[300,false],[1379,false],[1380,true]]) {
 s.run(`appData.currentTime=${time}; syncNightModifier();`); assert.equal(s.evalCtx('appData.modifiers.find(m=>m.name==="Ночь").active'),expected);
 }
});
test('Зона движения использует остаток ОД и исчезает при 0, смерти и чужой фазе',()=>{
 const s=fresh();s.run(`grid(5); appData.squads=[squad('inf')]; actionPoints=[{ap:2,maxAp:6}]; recalcReachable(appData.squads[0],'2,2');`);
 assert(s.evalCtx('Object.values(appData.map.reachableCosts).every(c=>c<=2)'));
 s.run('actionPoints[0].ap=0; recalcReachable(appData.squads[0],"2,2")');assert.equal(s.evalCtx('appData.map.reachableHexes.length'),0); assert(!s.evalCtx('shouldShowTacticalReachability()'));
 s.run('actionPoints[0].ap=6; appData.squads[0].isDestroyed=true'); assert(!s.evalCtx('shouldShowTacticalReachability()'));
});
test('Все действия заблокированы для уничтоженного отряда и в фазу оппонента',()=>{
 const s=fresh();s.run(`var u=squad('inf'); u.fighters.forEach(f=>f.hp=0);`);
 for(const action of ['attack','shoot','melee','move','utility','retreatMelee','ap']) assert(!s.evalCtx(`tacticalActionAllowed(u,'${action}',true)`));
 s.run(`u=squad('inf');appData.map.activeSide='enemy'`);assert(!s.evalCtx("tacticalActionAllowed(u,'shoot',true)"));
});
test('Самокатчики не стреляют до спешивания; кнопка есть на карте',()=>{
 const s=fresh();s.run(`var u=squad('Самокатное отделение'); u.mobilityType='bicycle';`);
 assert(!s.evalCtx("tacticalActionAllowed(u,'shoot',true)"));assert(s.evalCtx("tacticalActionAllowed(u,'utility',true)"));s.run('u.dismounted=true');assert(s.evalCtx("tacticalActionAllowed(u,'shoot',true)"));
 assert(fs.readFileSync(path.join(ROOT,'js/map_actions.js'),'utf8').includes('dismountBicycle(); renderMapActionPanel();'));
});
test('Гранаты 1 гекс, рукопашная 0; участники рукопашной защищены от сторонней стрельбы',()=>{
 const s=fresh();s.run(`grid(5); appData.squads=[squad('p')]; appData.map.enemySquads=[squad('e')]; appData.map.grid['1,1'].squadIds=[0]; appData.map.grid['2,1'].enemySquadIds=[0];`);
 assert(s.evalCtx("mapActionEvalTarget(mapActionDefById('grenades'),0,0).ok")); assert(!s.evalCtx("mapActionEvalTarget(mapActionDefById('melee'),0,0).ok"));
 s.run(`appData.map.grid['2,1'].enemySquadIds=[]; appData.map.grid['1,1'].enemySquadIds=[0]`);
 assert(s.evalCtx("mapActionEvalTarget(mapActionDefById('melee'),0,0).ok"));
 s.run(`appData.squads[0].meleeOpponentName='e'; appData.map.enemySquads[0].meleeOpponentName='p';`);
 assert(!s.evalCtx("mapActionEvalTarget(mapActionDefById('smallArms'),0,0).ok"));assert(!s.evalCtx("tacticalActionAllowed(appData.squads[0],'shoot',true)"));assert(s.evalCtx("tacticalActionAllowed(appData.squads[0],'melee',true)"));
});
test('Неверная ручная дистанция не расходует ОД/гранаты',()=>{
 const s=fresh();s.run(`currentSquad=squad('p'); appData.squads=[currentSquad];currentSquad.grenades=5;actionPoints=[{ap:6,maxAp:6}];document.getElementById('targetDistance').value='2';throwGrenades();meleeAttack();`);
 assert.equal(s.evalCtx('getAP(0)'),6);assert.equal(s.evalCtx('currentSquad.grenades'),5);
});
test('Танковое орудие доступно в орудиях и ПТО',()=>{
 const s=fresh();s.run(`function getFactionCrewWeapons(){return [{name:'cannon',type:'tank_gun'}]}; var tank={crewInstances:[{weaponName:'cannon',active:true}]};`);
 assert(s.evalCtx("mapActionDefById('ordnance').show(tank) && mapActionDefById('vehicle').show(tank)"));
});
test('Монотонная передача хода: дубликат/старый снимок не переключает фазу и не добавляет время',()=>{
 const s=fresh();s.run(`appData.currentTime=0;appData.campaign.opTurnStartTime=0;var b={phaseRevision:0,currentTurn:1,activeSide:'enemy',placement:{attackerSide:'enemy'},playerSquads:[]};var e={phaseRevision:1,activeSide:'defender'};`);
 assert(s.evalCtx('onlineAcceptBattlePhase(b,e,true)'));assert.equal(s.evalCtx('appData.currentTime'),2);
 assert(!s.evalCtx('onlineAcceptBattlePhase(b,e,true)'));assert(!s.evalCtx("onlineAcceptBattlePhase(b,{phaseRevision:0,activeSide:'attacker'},true)"));assert.equal(s.evalCtx('b.activeSide'),'player');assert.equal(s.evalCtx('appData.currentTime'),2);
 assert(!s.evalCtx("onlineAcceptBattlePhase(b,{phaseRevision:2,activeSide:'defender'},true)"));
});
test('Бой привязан к гексу обороняющегося, в том числе когда атакует противник',()=>{
 const s=fresh();s.run(`var p=[{col:2,row:3}],e=[{col:4,row:3}];`);assert.equal(s.evalCtx("JSON.stringify(getTacticalBattleAnchor(p,e))"),' {"col":4,"row":3}'.trim());
 s.run(`var pendingBattleEntry={attackerSide:'enemy'};`);assert.equal(s.evalCtx('getTacticalBattleAnchor(p,e).col'),2);
});
test('При красном духе отряд остается целью и отступает за ОД только в свою фазу до края',()=>{
 const s=fresh();s.run(`grid(8);var u=squad('inf');u.currentMorale=1;appData.squads=[u];actionPoints=[{ap:2,maxAp:6}];appData.map.grid['5,4'].squadIds=[0];tacticalMaybeAutoRetreat(u,'player',0);`);
 assert(s.evalCtx('u.isRouting && !u.isRetreated && mapActionEnemyTargetable(u)'));
 s.run("processTacticalRouts('player')");assert(!s.evalCtx('u.isRetreated'));assert.equal(s.evalCtx('getAP(0)'),0);
 s.run(`actionPoints[0].ap=20;processTacticalRouts('player')`);assert(s.evalCtx('u.isRetreated'));assert(s.evalCtx('Object.values(appData.map.grid).every(c=>!c.squadIds.includes(0))'));
});
test('Спешивание перед непроходимой велосипеду местностью и обход непроходимой точки',()=>{
 const s=fresh();s.run(`appData.campaign.opMapGrid={'1,0':{types:['hill'],markers:[]}};var bike={name:'b',col:0,row:0,mobility:'bicycle',squads:[squad('Самокатный')]};`);
 assert.equal(s.evalCtx('getOpMoveCost(bike,0,0,1,0)'),Infinity);assert.equal(s.evalCtx('getOpPlannedMoveCost(bike,0,0,1,0)'),3);
 s.run('autoDismountOperational(bike)');assert(s.evalCtx("bike.dismounted && bike.squads[0].dismounted && appData.campaign.opMapGrid['0,0'].markers.includes('bicyclePark')"));
 s.run(`appData.campaign.opMapGrid['1,0']={types:['water']}; var planned=buildOrderRoute(bike,[{col:1,row:0},{col:3,row:0}]);`);
 assert(s.evalCtx("planned.route.length>0 && planned.route.every(h=>!(h.col===1 && h.row===0)) && planned.target.col===3"));
});
test('Оперативный дух <=25 запускает отход к ближайшему своему штабу',()=>{
 const s=fresh();s.run(`var u={name:'p',col:4,row:4,type:'infantry_platoon',squads:[squad('inf')],operationalMorale:28}; var hq={name:'hq',type:'company_hq',col:1,row:4};appData.campaign.opUnits=[u,hq];changeOperationalMorale(u,-4,'test');`);
 assert(s.evalCtx("u.operationalRouted && u.operationalRetreatTargetHQ==='hq'"));assert(s.evalCtx('findOperationalRetreatPath(u,hq).length>0'));
});
test('Начальные 8 окопов и дополнительный бюджет приказа 6 отделений независимы',()=>{
 const s=fresh();s.run(`grid(5);var ov=getHexOverlay('1,1',true);ov.initialFortifications.trenchCells=['0,0','0,1','0,2','0,3','0,4','1,0','1,1','1,2'];grantTrenchPoints('1,1',6,'p',false);var st={hexKey:'1,1',kind:'initialFortification',tool:'trenches',rule:hexEditRuleFor('initialFortification')};hexEditorState=st;st.baseGrid=JSON.parse(JSON.stringify(appData.map.grid));initialFortificationEditClick(st,'4,4',cell(),appData.map.grid['4,4']);`);
 assert.equal(s.evalCtx('ov.initialFortifications.trenchCells.length'),8);assert.equal(s.evalCtx('ov.trenchPoints'),6);
});
test('Реальный ДОТ сохраняет клетку и автоматически стоит на ней в следующем бою',()=>{
 const s=fresh();s.run(`grid(5);var dot=squad('ДОТ Bosh');appData.campaign.opUnits=[{name:'ДОТы',squads:[dot]}];var st={hexKey:'1,1',dotId:'0:0'};bindInitialDot(st,'2,2');var b={hexKey:'1,1',playerSquads:[dot],tacticalMap:appData.map};applyFixedDotPositions(b);`);
 assert(s.evalCtx("appData.map.grid['2,2'].squadIds.includes(0) && dot.fixedTacticalPosition.key==='2,2'"));assert.equal(s.evalCtx("getMovementCost(dot,'2,2','3,2',false)"),Infinity);
 assert(s.evalCtx("placementCheckPlace('player','3,2',true,dot)!==null"));
});
test('Завершение боя запрещено при живом неотступившем противнике',()=>{
 const s=fresh();s.run(`appData.currentBattleId=1;appData.campaign.activeBattles=[{id:1}];appData.map.enemySquads=[squad('enemy')];`);
 s.run(sliceFunction(HTML,'tacticalUnresolvedEnemies'));s.run('finishBattle()');assert(s.alerts.some(x=>x.includes('Бой продолжается')));
});
test('Иконка разведывательного штаба АИРФ существует и привязана к шаблону',()=>{
 const s=fresh();assert(s.evalCtx(`SQUAD_TEMPLATES.find(s=>s.name==='Штаб развед. взвода' && s.faction==='A.I.R.F.').icon.endsWith('штаб развед взвода АИРФ №1.png')`));assert(fs.existsSync(path.join(ROOT,'images/AIRF/штаб развед взвода АИРФ №1.png')));
});
test('Два тактических клиента: снимки фаз и потери духа не применяются повторно',()=>{
 const a=fresh(), b=fresh();
 for (const [client,mine,opp,id,attacker] of [[a,'A','B',1,'player'],[b,'B','A',2,'enemy']]) {
  client.run(`grid(6);appData.currentTime=0;appData.campaign.opTurnStartTime=0;appData.campaign.online=true;
   appData.squads=[squad('${mine}')];appData.map.enemySquads=[squad('${opp}')];
   appData.squads[0].currentMorale=2;appData.map.enemySquads[0].currentMorale=2;
   appData.map.grid['2,2'].squadIds=[0];appData.map.grid['2,2'].enemySquadIds=[0];
   var battle={id:${id},hexKey:'3,3',activeSide:'${attacker}',phaseRevision:0,currentTurn:1,
    placement:{attackerSide:'${attacker}',phase:'done',playerReady:true,enemyReady:true},
    playerSquads:appData.squads,enemySquads:appData.map.enemySquads,tacticalMap:appData.map};
   appData.currentBattleId=${id};appData.campaign.activeBattles=[battle];actionPoints=[{ap:0,maxAp:6}];`);
 }
 a.run(`battle.phaseRevision=1;battle.currentTurn=2;currentTurn=2;battle.activeSide='enemy';battle.onlineMoraleOut={B:1};appData.squads[0].meleeOpponentName='B';`);
 const outgoing=a.evalCtx('JSON.stringify(onlineBattleSnapshot(battle))');
 b.run(`var snapshot=${outgoing}; onlineMergeOppBattle(battle,snapshot);onlineMergeOppBattle(battle,snapshot);`);
 assert.equal(b.evalCtx('battle.activeSide'),'player');assert.equal(b.evalCtx('appData.currentTime'),2);
 assert.equal(b.evalCtx('appData.squads[0].currentMorale'),1);assert(b.evalCtx('appData.squads[0].isRouting && !appData.squads[0].isRetreated'));
 assert(b.evalCtx('tacticalIsMeleeEngaged(appData.squads[0])'));
 assert.equal(b.evalCtx('getAP(0)'),6);
 const stale=b.evalCtx('JSON.stringify(onlineBattleSnapshot(battle))');
 a.run(`onlineMergeOppBattle(battle,${stale});`);assert.equal(a.evalCtx('battle.activeSide'),'enemy');
 b.run(`battle.phaseRevision=2;battle.currentTurn=3;currentTurn=3;battle.activeSide='enemy';`);
 a.run(`onlineMergeOppBattle(battle,${b.evalCtx('JSON.stringify(onlineBattleSnapshot(battle))')});`);
 assert.equal(a.evalCtx('battle.activeSide'),'player');assert.equal(a.evalCtx('battle.phaseRevision'),2);
 a.run(`onlineMergeOppBattle(battle,${stale});`);assert.equal(a.evalCtx('battle.activeSide'),'player');
});
console.log(`v13.062 PASS ${passed}`);
