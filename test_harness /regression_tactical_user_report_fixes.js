'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const vm = require('vm');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const MAP_ACTIONS = fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8');
const TACTICAL_AI = fs.readFileSync(path.join(ROOT, 'js/tactical_ai.js'), 'utf8');
const PLACEMENT = fs.readFileSync(path.join(ROOT, 'js/placement.js'), 'utf8');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }

function sandbox(extra) {
  const ctx = Object.assign({
    appData: { squads: [], map: { grid: {}, enemySquads: [] } },
    log() {}, Math: Object.create(Math), getFactionCrewWeapons: () => [],
    tacticalActionAllowed: () => true, currentSquad: null, currentSquadIndex: 0,
    prompt: () => '1', spendAP: () => true, getActionCost: () => 1,
    spendTacticalAmmo() {}, saveData() {}, updateUI() {}, redrawMap() {},
    getTacticalSideAP: () => 0, getBattleSquadHex: () => null,
    getHexNeighbors: () => [], hexGridDistance: (a,b,c,d) => Math.max(Math.abs(a-c), Math.abs(b-d)),
    placementBattleGrid: battle => battle && battle.tacticalMap && battle.tacticalMap.grid || {},
    appDataBattle: null
  }, extra || {});
  ctx.globalThis = ctx; ctx.window = ctx;
  return vm.createContext(ctx);
}

test('1: связка гранат запрашивает целое количество, показывает доступный максимум и не расходует ОД при отмене', () => {
  const fn = sliceFunction(HTML, 'satchelCharge');
  assert.match(fn, /Сколько гранат в связке\? \(1–\$\{currentSquad\.grenades\}\)/);
  assert.match(fn, /answer === null\) return/);
  assert.match(fn, /!Number\.isInteger\(count\)/);
  assert.match(fn, /count > currentSquad\.grenades/);
});

test('2: размещённые отряды остаются выбираемыми до подтверждения фазы размещения', () => {
  assert.match(sliceFunction(HTML, 'refreshSquadToPlaceDropdown'), /placement\.phase !== 'done' && !placement\.playerReady/);
  const tray = sliceFunction(PLACEMENT, 'placementTrayUnplacedSquads');
  assert.match(tray, /canReposition \|\| !placedIdx\.has\(x\.i\)/);
  assert.match(sliceFunction(HTML, 'handleHexAction'), /placementCheckPlace\('player', key, wasPlaced/);
  const ctx = sandbox({
    appData: { squads: [{name:'placed',fighters:[{hp:1}]},{name:'reserve',fighters:[{hp:1}]}], map:{grid:{}} },
    placementBattleGrid: battle => battle.tacticalMap.grid
  });
  vm.runInContext(sliceFunction(PLACEMENT, 'placementTrayUnplacedSquads'), ctx);
  const placing = { placement:{phase:'placing',playerReady:false}, tacticalMap:{grid:{'0,0':{squadIds:[0]}}} };
  ctx.battle = placing;
  assert.deepEqual(Array.from(vm.runInContext('placementTrayUnplacedSquads(battle).map(x => x.i)', ctx)), [0,1]);
  placing.placement.phase = 'done';
  assert.deepEqual(Array.from(vm.runInContext('placementTrayUnplacedSquads(battle).map(x => x.i)', ctx)), [1]);
});

test('3: въезд бронетехники уничтожает орудие/миномёт с вероятностью 70%, не убивая расчёт', () => {
  const ctx = sandbox();
  vm.runInContext(sliceFunction(HTML, 'tacticalResolveArmoredWeaponContact'), ctx);
  vm.runInContext(`
    appData.map.enemySquads = [{name:'Расчёт',faction:'X',fighters:[{hp:3}],crewInstances:[{weaponName:'ПТО',fighterIndices:[0],active:true}]}];
    appData.map.grid['1,0'] = {enemySquadIds:[0]};
    getFactionCrewWeapons = () => [{name:'ПТО',type:'at_gun'}];
    Math.random = () => 0.69;
    var vehicle = {armor:{front:4}};
    var result = tacticalResolveArmoredWeaponContact(vehicle,'player','1,0',appData.map);
  `, ctx);
  assert.equal(ctx.result, 1);
  assert.equal(ctx.appData.map.enemySquads[0].crewInstances[0].status, 'destroyed');
  assert.equal(ctx.appData.map.enemySquads[0].fighters[0].hp, 3);
  assert.match(sliceFunction(HTML, 'getMovementCost'), /isVehicleUnit && squad\.isImmobilized/);
});

test('4: tactical AI unloads a linked BTR passenger near player forces', () => {
  assert.match(TACTICAL_AI, /function disembarkBtrPassengerWhenUseful/);
  assert.match(TACTICAL_AI, /disembarkBtrPassengerWhenUseful\(squad\)/);
  assert.match(TACTICAL_AI, /passenger\.hidden = false/);
  assert.match(TACTICAL_AI, /spendTacticalSideAP\(carrier, cost, 'utility', context\)/);
  assert.match(TACTICAL_AI, /carrier\.embarkedSquadIndex = null/);
});

test('5: obsolete weapon buttons are filtered from the map extras menu', () => {
  const ctx = sandbox();
  vm.runInContext(sliceConst(MAP_ACTIONS, 'MAP_EXTRA_BLOCKED_LABELS'), ctx);
  vm.runInContext(sliceConst(MAP_ACTIONS, 'MAP_EXTRA_BLOCKED_TERRAIN'), ctx);
  vm.runInContext(sliceConst(MAP_ACTIONS, 'MAP_EXTRA_DIRECTION_LABELS'), ctx);
  vm.runInContext(sliceConst(MAP_ACTIONS, 'MAP_EXTRA_INFANTRY_ONLY'), ctx);
  vm.runInContext(sliceFunction(MAP_ACTIONS, 'mapExtraButtonBlocked'), ctx);
  assert.equal(vm.runInContext(`mapExtraButtonBlocked({}, '💥 Орудия / Миномёты')`, ctx), true);
  assert.equal(vm.runInContext(`mapExtraButtonBlocked({}, '🚀 Атака ПТО по технике')`, ctx), true);
});

test('6: окоп не добавляет штраф ПТО при стрельбе по бронетехнике в окопе', () => {
  const attack = sliceFunction(HTML, 'attackVehicle');
  assert.match(attack, /armoredTarget && targetInTrenches/);
  assert.match(attack, /const crossed = coverMod > 0 && !\(armoredTarget && targetInTrenches\)/);
  assert.match(sliceFunction(require('fs').readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8'), 'getTacticalCoverMod'), /type === 'trenches'/);
});

test('7: обездвиженная тактическая бронетехника не получает маршрут движения', () => {
  assert.match(sliceFunction(HTML, 'getMovementCost'), /if \(isVehicleUnit && squad\.isImmobilized\) return Infinity/);
  assert.match(TACTICAL_AI, /getMovementCost\(squad, current\.key, next/);
});

test('8: телефонная линия теряется только на шаге пересечения, не от простого нахождения в бою', () => {
  const integrity = sliceFunction(HTML, 'checkPhoneLinesIntact');
  assert.match(integrity, /Number\.isFinite\(Number\(e\.prevCol\)\)/);
  assert.match(integrity, /Number\(e\.prevCol\) !== Number\(e\.col\)/);
  assert.match(integrity, /пересёк кабель/);
  assert.match(sliceFunction(HTML, 'tryMoveSelectedOpUnitToHex'), /checkPhoneLineCrossing\(selectedUnit/);
  const crossing = sliceFunction(HTML, 'checkPhoneLineCrossing');
  assert.match(crossing, /Number\(fromCol\) === Number\(toCol\).*return false/s);
  assert.match(crossing, /cutEnemyPhoneLinesOnHex\(toCol, toRow, unit\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'js/operational_ai.js'), 'utf8'), /checkPhoneLineCrossing\(unit, unit\.prevCol/);
  const ctx = sandbox({
    hardMode: { phoneLines: [{intact:true,fromUnitId:0,toUnitId:1,fromHex:'0,0',toHex:'2,0',path:[{col:0,row:0},{col:1,row:0},{col:2,row:0}]}] },
    appData: { squads:[], map:{grid:{},enemySquads:[]}, campaign:{ opUnits:[{name:'HQ',col:0,row:0},{name:'unit',col:2,row:0}], enemyOpUnits:[{name:'enemy',col:1,row:0,prevCol:1,prevRow:0}], currentTurn:1 } },
    refreshSignalLosses() {}, hasActivePhoneAt: () => true, renderCommunicationPanel() {},
    phoneLinePathHexKeys: line => line.path.map(p => `${p.col},${p.row}`)
  });
  vm.runInContext(crossing, ctx);
  vm.runInContext(integrity + '\ncheckPhoneLinesIntact();', ctx);
  assert.equal(ctx.hardMode.phoneLines[0].intact, true, 'неподвижный отряд на трассе сам не рвёт линию');
  vm.runInContext('appData.campaign.enemyOpUnits[0].prevCol = 0; checkPhoneLinesIntact();', ctx);
  assert.equal(ctx.hardMode.phoneLines[0].intact, false, 'фактический шаг на гекс кабеля рвёт линию');
});

test('9: самокатчики быстрее пехоты, мотоциклисты быстрее самокатчиков, пулемёты и ПТО медленнее', () => {
  const pieces = ['tacticalCrewWeaponsByType','tacticalPtoCrewState','tacticalEnsurePtoCrewOrigins','tacticalIsPtoCrewSquad','tacticalIsSlowWeaponCrew','getMovementAPForStep','getMovementCost'];
  const ctx = sandbox({
    TERRAIN_DATA: { grass: {} },
    getScopedActiveCardsForSquad: () => [],
    tacticalFireFieldAt: () => false,
    getMaxAP: () => 6,
    getAP: () => 6,
    getFactionCrewWeapons: () => [{name:'ПТО',type:'at_gun'},{name:'Пулемёт',type:'mg'}]
  });
  for (const name of pieces) vm.runInContext(sliceFunction(HTML, name), ctx);
  vm.runInContext(`
    const map = appData.map;
    map.grid['0,0'] = {level:0,type:'grass'};
    map.grid['1,0'] = {level:0,type:'grass'};
    map.grid['2,0'] = {level:0,type:'grass'};
    map.grid['3,0'] = {level:0,type:'grass'};
    var infantry = {name:'Пехота',fighters:[{hp:1}]};
    var scooter = {name:'Верховые самокатчики',mobilityType:'bicycle',fighters:[{hp:1}]};
    var motorcycle = {name:'Мотоциклисты',mobilityType:'motorcycle',fighters:[{hp:1}]};
    var mg = {name:'Пулемётчики',faction:'X',fighters:[{hp:1}],crewInstances:[{weaponName:'Пулемёт',fighterIndices:[0]}]};
    var pto = {name:'Расчёт ПТО',faction:'X',fighters:[{hp:1,tacticalPtoOriginalCrew:true},{hp:1,tacticalPtoOriginalCrew:true},{hp:1,tacticalPtoOriginalCrew:true}],crewInstances:[{weaponName:'ПТО',fighterIndices:[0,1,2]}],tacticalPtoOriginalCrewMarked:true};
    var costs = [getMovementCost(infantry,'0,0','1,0'),getMovementCost(scooter,'0,0','1,0'),getMovementCost(motorcycle,'0,0','1,0'),getMovementCost(mg,'0,0','1,0'),getMovementCost(pto,'0,0','1,0')];
    var dismountedScooter = {...scooter,dismounted:true};
    var dismountedCost = getMovementCost(dismountedScooter,'0,0','1,0');
    var underCrew = {...pto,fighters:[{hp:1,tacticalPtoOriginalCrew:true},{hp:1,tacticalPtoOriginalCrew:true}],crewInstances:[{weaponName:'ПТО',fighterIndices:[0,1]}]};
    var blocked = getMovementCost(underCrew,'0,0','1,0');
    map.grid['4,0'] = {level:0,type:'grass'}; map.grid['4,1'] = {level:1,type:'hill'};
    var climbCost = getMovementCost(pto,'4,0','4,1',false,3);
  `, ctx);
  const costs = Array.from(ctx.costs);
  assert(costs[1] < costs[0], 'mounted scooters beat foot infantry');
  assert(costs[2] < costs[1], 'motorcycles beat scooters');
  assert(costs[3] > costs[0], 'machine-gun teams move more slowly');
  assert(costs[4] > costs[0], 'anti-tank teams move more slowly');
  assert.equal(ctx.dismountedCost, costs[0], 'dismounted scooter troops use ordinary infantry speed');
  assert.equal(ctx.blocked, Infinity, 'PTO with fewer than three live crew cannot move');
  assert.equal(ctx.climbCost, 3, 'a PTO climb consumes all remaining AP');
  assert.match(sliceFunction(HTML,'getMovementCost'), /if \(ptoCrew\).*getMovementAPForStep\(squad, apBudget\)/);
});

test('10: PTO accuracy counts a completed stationary phase; maneuvering is a vehicle-only defense', () => {
  const attack = sliceFunction(HTML, 'attackVehicle');
  assert.match(attack, /Number\(tacTgt && tacTgt\.tacticalStationaryPhases\) >= 1 \? 2 : 0/);
  assert.match(attack, /tacticalManeuveringThisPhase \? -1 : 0/);
  assert.match(sliceFunction(HTML, 'nextTurn'), /tacticalAdvanceStationaryPhase\(completedSide\)/);
  assert.match(sliceFunction(HTML, 'renderActiveCardButtons'), /setTacticalVehicleManeuvering/);
  assert.match(TACTICAL_AI, /aiShouldUseVehicleManeuvering/);
  const ctx = sandbox({ appData:{squads:[{movedThisTurn:false}],map:{grid:{},enemySquads:[]}} });
  vm.runInContext(sliceFunction(HTML,'tacticalSideSquads'),ctx);
  vm.runInContext(sliceFunction(HTML,'tacticalAdvanceStationaryPhase'),ctx);
  vm.runInContext(`tacticalAdvanceStationaryPhase('player');`,ctx);
  assert.equal(ctx.appData.squads[0].tacticalStationaryPhases,1);
  vm.runInContext(`appData.squads[0].movedThisTurn=true;tacticalAdvanceStationaryPhase('player');`,ctx);
  assert.equal(ctx.appData.squads[0].tacticalStationaryPhases,0);
});

test('11: dead original PTO crew abandons the gun and detaches surviving infantry at their current hex', () => {
  const ctx = sandbox({
    appData: { squads: [], map: {grid:{'4,4':{squadIds:[0],enemySquadIds:[]}},enemySquads:[]} },
    actionPoints: [],
    getFactionCrewWeapons: () => [{name:'ПТО',type:'at_gun'}],
    tacticalSquadIsPlayerSide: () => true,
    getMaxAP: () => 4
  });
  for (const name of ['tacticalCrewWeaponsByType','tacticalPtoCrewState','tacticalEnsurePtoCrewOrigins','tacticalIsPtoCrewSquad','tacticalSideSquads','tacticalFindSquadHexKey','tacticalResolvePtoCrewLosses']) {
    vm.runInContext(sliceFunction(HTML,name),ctx);
  }
  vm.runInContext(`
    appData.squads = [{name:'ПТО',opUnitName:'Взвод',faction:'X',hexPos:[4,4],fighters:[
      {name:'расчёт 1',hp:0,tacticalPtoOriginalCrew:true},{name:'расчёт 2',hp:0,tacticalPtoOriginalCrew:true},
      {name:'расчёт 3',hp:0,tacticalPtoOriginalCrew:true},{name:'пехотинец',hp:2}],
      crewInstances:[{weaponName:'ПТО',fighterIndices:[0,1,2],active:true}],tacticalPtoOriginalCrewMarked:true}];
    tacticalResolvePtoCrewLosses(appData.squads[0]);
  `,ctx);
  assert.equal(ctx.appData.squads.length,2);
  assert.equal(ctx.appData.squads[0].tacticalPtoAbandoned,true);
  assert.equal(ctx.appData.squads[1].fighters[0].name,'пехотинец');
  assert.equal(ctx.appData.squads[1].fighters[0].hp,2);
  assert.deepEqual(Array.from(ctx.appData.squads[1].hexPos),[4,4]);
  assert.deepEqual(Array.from(ctx.appData.map.grid['4,4'].squadIds),[0,1]);
  assert.match(sliceFunction(HTML,'tacticalMergeSquadTypeKey'),/squad\.tacticalPtoDetachedFrom/);
  assert.match(sliceFunction(HTML,'tacticalPtoReinforceFromAdjacent'),/getHexNeighbors\(sourceIdx\)/);
  assert.match(sliceFunction(HTML,'tacticalPtoReinforceFromAdjacent'),/source\.tacticalPtoReinforcementsTransferred = true/);
  assert.match(sliceFunction(MAP_ACTIONS,'applyDamagePointsToEnemy'),/tacticalResolvePtoCrewLosses\(enemy\)/);
});

test('12: manual PTO resupply transfers selected fighters from one adjacent friendly squad without duplication', () => {
  const prompts = ['0','0,1'];
  const ctx = sandbox({
    appData:{squads:[],map:{grid:{'1,1':{squadIds:[0],enemySquadIds:[]},'2,1':{squadIds:[1],enemySquadIds:[]}},enemySquads:[]}},
    getFactionCrewWeapons:()=>[{name:'ПТО',type:'at_gun'}],
    getHexNeighbors:()=>['2,1'],
    tacticalActionAllowed:()=>true,
    prompt:()=>prompts.shift(),
    saveData(){},updateUI(){},redrawMap(){},
    log(){}
  });
  for(const name of ['tacticalCrewWeaponsByType','tacticalPtoCrewState','tacticalIsPtoCrewSquad','tacticalFindSquadHexKey','tacticalPtoReinforceFromAdjacent'])
    vm.runInContext(sliceFunction(HTML,name),ctx);
  vm.runInContext(`
    appData.squads=[
      {name:'ПТО',faction:'X',fighters:[{name:'наводчик',hp:2,tacticalPtoOriginalCrew:true}],crewInstances:[{weaponName:'ПТО',fighterIndices:[0]}],tacticalPtoOriginalCrewMarked:true},
      {name:'Пехота',faction:'X',fighters:[{name:'первый',hp:1},{name:'второй',hp:1}],crewInstances:[]}
    ];
    currentSquad=appData.squads[0]; currentSquadIndex=0;
    var res=tacticalPtoReinforceFromAdjacent();
  `,ctx);
  assert.equal(ctx.res,true);
  assert.equal(ctx.appData.squads[0].fighters.length,3);
  assert.equal(ctx.appData.squads[0].crewInstances[0].fighterIndices.length,3);
  assert.equal(ctx.appData.squads[1].fighters.length,0);
  assert.equal(ctx.appData.squads[1].tacticalPtoReinforcementsTransferred,true);
});

test('13: firing targets/highlights remain limited to detected, living, non-camouflaged enemy squads', () => {
  const ctx = sandbox();
  vm.runInContext(sliceFunction(MAP_ACTIONS, 'mapActionEnemyAlive'), ctx);
  vm.runInContext(sliceFunction(MAP_ACTIONS, 'mapActionEnemyTargetable'), ctx);
  const undetected = { detected:false, fighters:[{hp:1}] };
  const detected = { detected:true, fighters:[{hp:1}] };
  assert.equal(ctx.mapActionEnemyTargetable(undetected), false);
  assert.equal(ctx.mapActionEnemyTargetable(detected), true);
  assert.equal(ctx.mapActionEnemyTargetable({...detected,camouflaged:true}), false);
  assert.match(sliceFunction(MAP_ACTIONS, 'drawMapActionTargetHighlights'), /if \(!mapActionEnemyTargetable\(e\)\) return/);
  assert.match(sliceFunction(MAP_ACTIONS, 'mapActionEvalTarget'), /enemy\.camouflaged \|\| !enemy\.detected/);
});

test('14: long-range/night detection can yield a rare anonymous contact, including armor', () => {
  const helper = sliceFunction(HTML, 'tacticalWeakLongRangeNoiseContact');
  const ctx = sandbox({
    tacticalObserverProximity:()=>({nearestDist:12,losDist:null}),
    isNightTime:()=>true,
    tacticalIlluminationActive:()=>false,
    Math:Object.assign(Object.create(Math),{random:()=>0.01})
  });
  vm.runInContext(helper,ctx);
  assert.equal(vm.runInContext(`tacticalWeakLongRangeNoiseContact({armor:true})`,ctx),true);
  assert.equal(vm.runInContext(`tacticalWeakLongRangeNoiseContact({armor:false})`,ctx),false);
  assert.match(sliceFunction(HTML,'autoDetectOneSquad'),/result >= NOISE \|\| \(typeof tacticalWeakLongRangeNoiseContact === 'function' && tacticalWeakLongRangeNoiseContact\(squad\)\)/);
});

test('15: tactical opponent-phase attacks record shooter-to-target lines for the map', () => {
  const record = sliceFunction(HTML,'recordTacticalShotLine');
  const ctx = sandbox({
    appData:{squads:[],map:{grid:{},centers:[],enemySquads:[]}},
    getBattleSquadHex:(grid,index,isEnemy)=>({key:isEnemy?'4,2':'1,2'})
  });
  vm.runInContext(record,ctx);
  vm.runInContext(`
    const shooter={name:'Пехота'}; const target={name:'Танк'};
    var first=recordTacticalShotLine(shooter,target,0,0,'enemy');
    var second=recordTacticalShotLine(shooter,target,0,0,'enemy');
  `,ctx);
  assert.equal(ctx.appData.map.tacticalShotLines.length,1);
  assert.equal(ctx.appData.map.tacticalShotLines[0].shooter,'Пехота');
  assert.equal(ctx.appData.map.tacticalShotLines[0].target,'Танк');
  assert.equal(ctx.appData.map.tacticalShotLines[0].count,2);
  assert.match(sliceFunction(MAP_ACTIONS,'reportAttackOutcome'),/recordTacticalShotLine/);
  const draw = sliceFunction(HTML,'drawTacticalShotLines');
  assert.match(draw,/setLineDash\(\[/, 'shot lines are dashed');
  assert.doesNotMatch(draw,/strokeText|fillText/, 'shot lines have no shooter/target label');
  const renderCtx = sandbox({
    appData:{map:{tacticalShotLines:[{from:'0,0',to:'1,0',side:'enemy',shooter:'Secret squad',target:'Target'}],centers:[{key:'0,0',x:0,y:0},{key:'1,0',x:200,y:0}]}}
  });
  const drawnText=[]; const dash=[];
  renderCtx.ctx2 = { save(){},restore(){},setLineDash(v){dash.push(v)},beginPath(){},moveTo(){},lineTo(){},stroke(){},
    fillText(v){drawnText.push(v)},strokeText(v){drawnText.push(v)},
    set strokeStyle(v){},set fillStyle(v){},set lineWidth(v){},set font(v){},set textAlign(v){},set textBaseline(v){} };
  vm.runInContext(draw,renderCtx);
  vm.runInContext('drawTacticalShotLines(ctx2,40)',renderCtx);
  assert(dash.some(v=>Array.from(v).length===2),'renderer applies a dash pattern');
  assert.equal(drawnText.length,0,'renderer draws no shooter label');
});

test('17: every mounted vehicle weapon gets an individual sector-aware fire action', () => {
  const panel = sliceFunction(HTML,'renderActiveCardButtons');
  assert.match(panel,/prepareTacticalVehicleWeaponAndFire/);
  assert.match(panel,/\['mg', 'at_gun', 'tank_gun', 'mortar'\]/);
  assert.doesNotMatch(panel,/Огонь артиллерией ·/);
  assert.match(sliceFunction(HTML,'vehicleWeaponSectorSpec'),/type === 'at_gun'.*deg: 360/);
  assert.match(sliceFunction(HTML,'tacticalVehicleWeaponCanTarget'),/vehicleWeaponSectorSpec/);
});

test('18: company and battalion HQ icons receive silver and gold frames', () => {
  assert.match(HTML,/const hqFrameColor = unit\.type === 'company_hq'[\s\S]*?'#c0c0c0'[\s\S]*?'#ffd700'/);
});


test('19: multiple hostile squads on one hex remain separately targetable', () => {
  const ctx = sandbox({
    appData:{ squads:[{name:'Friendly',fighters:[{hp:1}]}], map:{grid:{},enemySquads:[
      {name:'Enemy A',detected:true,fighters:[{hp:1}]},{name:'Enemy B',detected:true,fighters:[{hp:1}]}
    ]}},
    getBattleSquadHex:(grid,index,isEnemy)=>isEnemy
      ? {key:'4,4',col:4,row:4} : {key:'2,4',col:2,row:4},
    hexGridDistance:(a,b,c,d)=>Math.max(Math.abs(a-c),Math.abs(b-d)),
    getTacticalCoverInfoForSquad:()=>({}), getTacticalCoverInfoForEnemy:()=>({}),
    tacticalSmokeBlocksSight:()=>false
  });
  for (const fn of ['mapActionEnemyAlive','mapActionEnemyIsVehicle','mapActionEnemyIsDot','mapActionEvalTarget']) {
    vm.runInContext(sliceFunction(MAP_ACTIONS,fn),ctx);
  }
  const result = vm.runInContext(`mapActionEvalTarget({id:'smallArms',targets:'infantry'},0,1,null,'player')`,ctx);
  assert.equal(result.ok,true);
  assert.equal(result.enemy.name,'Enemy B');
  const colocatedFriendly = {name:'Friendly on target hex',fighters:[{hp:1}]};
  ctx.appData.squads.push(colocatedFriendly);
  ctx.getBattleSquadHex=(grid,index,isEnemy)=>isEnemy
    ? {key:'4,4',col:4,row:4} : (index===0?{key:'2,4',col:2,row:4}:{key:'4,4',col:4,row:4});
  assert.equal(vm.runInContext(`mapActionEvalTarget({id:'smallArms',targets:'infantry'},0,0,null,'player').reason`,ctx),'в гексе цели стоят свои — огонь запрещён');
});


test('20: battle results include losses for both sides and allow a half-strength squad to regroup survivors', () => {
  const ctx = sandbox({
    appData:{campaign:{opUnits:[]}},
    tacticalMergeSquadTypeKey:squad=>squad && squad.type || null,
    saveData(){},initOperationalMap(){},
    document:{body:{appendChild(node){this.child=node}},getElementById(id){return this.body.child && this.body.child.id===id ? this.body.child : null},createElement(){return {style:{},remove(){},set innerHTML(v){this.html=v}}}}
  });
  for(const name of ['tacticalBattleReportSquadKey','buildTacticalBattleResultReport','tacticalPostBattleRegroupOptions','regroupTacticalBattleSurvivors','closeTacticalBattleResult','showTacticalBattleResult'])
    vm.runInContext(sliceFunction(HTML,name),ctx);
  const battle={id:44,result:'victory',
    awardInitialPlayerSquads:[{name:'Platoon A',opUnitName:'Unit',fighters:[{hp:1},{hp:1},{hp:1},{hp:1}]},{name:'Platoon B',opUnitName:'Unit',fighters:[{hp:1},{hp:1},{hp:1},{hp:1}]}],
    playerSquads:[{name:'Platoon A',opUnitName:'Unit',fighters:[{hp:1},{hp:1},{hp:0},{hp:0}]},{name:'Platoon B',opUnitName:'Unit',fighters:[{hp:1},{hp:1},{hp:0},{hp:0}]}],
    awardInitialEnemySquads:[{name:'Enemy',opUnitName:'Enemy unit',fighters:[{hp:1},{hp:1},{hp:1}]}],
    enemySquads:[{name:'Enemy',opUnitName:'Enemy unit',fighters:[{hp:0},{hp:1},{hp:0}]}]};
  ctx.battle=battle;
  vm.runInContext('var report=buildTacticalBattleResultReport(battle);',ctx);
  assert.equal(ctx.report.sides.player.losses,4);
  assert.equal(ctx.report.sides.enemy.losses,2);
  assert.equal(ctx.report.sides.player.squads[0].remaining,2);
  const donor={name:'Platoon A',type:'infantry',tacticalOriginalRosterSize:4,fighters:[{hp:1},{hp:1},{hp:0},{hp:0}]};
  const receiver={name:'Platoon B',type:'infantry',tacticalOriginalRosterSize:4,fighters:[{hp:1},{hp:1},{hp:0},{hp:0}]};
  ctx.appData.campaign.opUnits=[{name:'Unit',squads:[donor,receiver]}];
  ctx.appData.campaign.lastTacticalBattleReport=ctx.report;
  assert.equal(vm.runInContext('showTacticalBattleResult()',ctx),true);
  assert.match(ctx.document.body.child.html,/Свои: потери 4 из 8/);
  assert.match(ctx.document.body.child.html,/Противник: потери 2 из 3/);
  assert.match(ctx.document.body.child.html,/Перенести 2 из/);
  assert.equal(vm.runInContext('tacticalPostBattleRegroupOptions(appData.campaign.lastTacticalBattleReport).length',ctx),2);
  assert.equal(vm.runInContext('regroupTacticalBattleSurvivors(0,0,1)',ctx),true);
  assert.equal(donor.fighters.filter(f=>f&&f.hp>0).length,0);
  assert.equal(receiver.fighters.filter(f=>f&&f.hp>0).length,4);
  assert.equal(donor.regroupedIntoSquadName,'Platoon B');
  assert.match(ctx.document.body.child.html,/Перенесено 2: «Platoon A» → «Platoon B»/);
});


test('21: supply-panel route reachability is cached per mobility and destination', () => {
  let calls=0;
  const ctx=sandbox({supplyReachForMobility:(mobility,fromCol,fromRow,dest)=>{calls++;return {col:dest.col,row:dest.row,adjacent:false}}});
  vm.runInContext(sliceFunction(HTML,'supplyReachForMobilityCached'),ctx);
  vm.runInContext(`var cache=new Map(); var a=supplyReachForMobilityCached(cache,'foot',1,2,{col:8,row:9}); var b=supplyReachForMobilityCached(cache,'foot',1,2,{col:8,row:9});`,ctx);
  assert.equal(calls,1);
  assert.equal(ctx.cache.size,1);
  assert.match(sliceFunction(HTML,'renderSupplyPanel'),/supplyReachForMobilityCached\(reachCache/);
});


test('22: selecting a DOT embrasure machine gun explicitly highlights its firing sector', () => {
  const ctx=sandbox({
    currentSquad:{name:'ДОТ',crewInstances:[{uniqueKey:'mg-1',weaponName:'МГ'}]},
    appData:{squads:[],map:{selectedMoveSquadIdx:0,selectedDotFireWeaponKey:null}},
    getFactionCrewWeapons:()=>[{name:'МГ',type:'mg'}],
    tacticalIsDotSquad:()=>true,redrawMap(){},updateUI(){}
  });
  vm.runInContext(sliceFunction(HTML,'setTacticalDotFireWeapon'),ctx);
  assert.equal(vm.runInContext("setTacticalDotFireWeapon('mg-1')",ctx),true);
  assert.equal(ctx.appData.map.selectedDotFireWeaponKey,'mg-1');
  assert.match(sliceFunction(HTML,'renderActiveCardButtons'),/Показать сектор/);
  const draw = sliceFunction(HTML,'drawTacticalDotSectorLines');
  assert.match(draw,/selectedDotFireWeaponKey/);
  assert.match(draw,/isSelectedSector \? 1 : 0\.62/);
});


test('23: reinforcements use their arrival edge while the normal placement phase remains player-controlled', () => {
  const ctx=sandbox({appData:{currentBattleId:null,map:{}}});
  for(const name of ['PLACEMENT_STRIP_DEPTH','PLACEMENT_DIRS','placementOppositeDir','placementZoneKeys','placementMapSize','placementBattleGrid','placementReinforcementZone']) {
    const piece=name===name.toUpperCase() ? sliceConst(PLACEMENT,name) : sliceFunction(PLACEMENT,name);
    vm.runInContext(piece,ctx);
  }
  vm.runInContext(sliceFunction(HTML,'tacticalSetReinforcementArrival'),ctx);
  const battle={id:4,hexKey:'4,4',placement:{phase:'placing',attackerSide:'player',entryDir:'W'},tacticalMap:{mapSize:8,grid:{}}};
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) battle.tacticalMap.grid[`${c},${r}`]={squadIds:[],enemySquadIds:[]};
  const arriving={name:'Reinforcement',placementArrivalDir:'E'};
  const zone=vm.runInContext('placementReinforcementZone(battle,arriving)',Object.assign(ctx,{battle,arriving}));
  assert.equal(zone.dir,'E');
  assert(zone.keys.every(key=>Number(key.split(',')[0])>=6),'east-arriving platoon is restricted to east-edge deployment strip');
  assert.match(sliceFunction(PLACEMENT,'placementReinforcementUnplaced'),/phase === 'placing'\) return \[\]/,
    'ordinary placement is not auto-classified as reinforcements');
  assert.match(sliceFunction(PLACEMENT,'renderPlacementPanel'),/placementAutoPlaceReinforcements/,
    'reinforcements have a dedicated placement operation after initial placement');
});

test('24: closing the supply tab does not perform a hidden expensive rerender', () => {
  const ctx=sandbox();
  let open=true,renders=0;
  ctx.document={getElementById:()=>({style:{display:'block'}})};
  ctx.openOperationalSidePanel=()=>{open=!open};
  ctx.isOperationalSidePanelOpen=()=>open;
  ctx.renderSupplyPanel=()=>{renders++};
  vm.runInContext(sliceFunction(HTML,'showSupplyPanel'),ctx);
  vm.runInContext('showSupplyPanel()',ctx);
  assert.equal(renders,0,'closing an already-open supply dock does not rebuild rows/routes');
  vm.runInContext('showSupplyPanel(true)',ctx);
  assert.equal(renders,1,'explicitly opening still renders the supply panel');
});

test('16: relief overlay labels level differences and tactical zoom supports smaller scale', () => {
  const relief = sliceFunction(HTML,'buildReliefOverlay');
  assert.match(relief,/rgba\(62, 166, 224/);
  assert.match(relief,/octx\.fillText\(\(lvl > 0 \? '\+' : ''\) \+ String\(lvl\)/);
  assert.match(HTML,/newZoom = Math\.max\(0\.2, Math\.min\(5, newZoom\)\)/);
  assert.match(sliceFunction(HTML,'syncTacticalCanvasSize'),/Math\.max\(0\.2, Math\.min\(6/);
});

console.log(`Tactical user report regressions: ${passed} passed`);
