'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {HTML,ROOT,sliceFunction,sliceConst}=require('./extract');
const source=f=>fs.readFileSync(ROOT+'/'+f,'utf8');
const rules=source('js/playtest_rules.js'),placement=source('js/placement.js'),hexmaps=source('js/hexmaps.js'),actions=source('js/map_actions.js');
const ctx=vm.createContext({console,appData:{campaign:{opUnits:[],enemyOpUnits:[],activeBattles:[]},map:{grid:{},enemySquads:[]},squads:[],factions:{}},
  hardMode:{orders:[],pendingOrders:[],messengerQueue:[]},currentTurn:1,log(){},saveData(){},redrawMap(){},updateUI(){},
  tacticalMoraleCurrent:s=>Number(s.currentMorale??100),tacticalChangeMorale:(s,d)=>s.currentMorale=Math.max(0,s.currentMorale+d),
  tacticalMoraleIsSuppressed:s=>s.currentMorale<30,tacticalDotMeleeImmune:()=>false,tacticalSquadsDistance:(a,b)=>Math.abs(a.x-b.x),
  getFactionWeapons:()=>[],rollD6:()=>6,tacticalClearMeleeEngagement(){},
  getBattleSquadHex:()=>null,hexGridDistance:(a,b,c,d)=>Math.max(Math.abs(a-c),Math.abs(b-d)),
  mapActionSideOfSquad:s=>ctx.appData.squads.includes(s)?'player':'enemy',mapActionDefById:kind=>({label:kind}),mapActionInfo(){},document:{getElementById:()=>null},
  getOpHexNeighbors:()=>[],isHexInPlayableArea:()=>true,getOpHexBaseTypes:()=>['grass']});
const run=s=>vm.runInContext(s,ctx),load=(s,names)=>names.forEach(n=>run(sliceFunction(s,n)));
run(rules);run(source('js/weapons.js'));load(source('js/data.js'),['resolveCrewWeaponCatalog','getFactionCrewWeapons']);
// 1. Offline/direct deployment uses exactly the configured green-zone predicate.
load(HTML,['opPlacementHexSafety']);ctx.isHexInPlacementZone=(sc,f,c,r)=>({ok:c<3});
assert.equal(run("opPlacementHexSafety({},4,2).ok"),false);assert.equal(run("opPlacementHexSafety({},2,2).ok"),true);
// 2–3. Restored yellow selection and forced vertical mobile-safe captions.
assert.match(source('css/style.css'),/\.card-item\.selected\s*\{[^}]*#f1c40f/);
assert.match(HTML,/initial-card-option\$\{checked \? ' selected'/);
assert.match(source('css/operational_ui.css'),/#opPanelTabs button\[data-op-side-tab\][^}]*writing-mode:vertical-rl !important/);
// 4. Relay envelope's toUnitId is the receiving HQ, not a route owner.
load(HTML,['operationalOrderEndHex','operationalMoveOrderEndForUnit']);run(sliceConst(HTML,'OP_MOVE_CHAIN_TYPES'));
run("hardMode.orders=[{id:10,type:'company_order',relayOnly:true,toUnitId:0,subUnitIdsAll:[1],status:'active',series:[{type:'move',targetHex:'9,8',status:'pending'}]}]");
assert.equal(run('operationalMoveOrderEndForUnit(0)'),null);
assert.deepEqual(JSON.parse(run('JSON.stringify(operationalMoveOrderEndForUnit(1))')),{col:9,row:8});
run("hardMode.orders.push({id:11,type:'move',toUnitId:0,targetHex:'2,3',status:'active'})");
assert.equal(run('operationalMoveOrderEndForUnit(0).col'),2);
run("hardMode.orders[0].series[0].status='completed'");assert.equal(run('operationalMoveOrderEndForUnit(1)'),null);
// 5. Escort follows active leader step, not its own old movement toggle.
ctx.getAllOrdersList=()=>ctx.hardMode.orders;
run("appData.campaign.opUnits=[{name:'leader',stealthMove:false}];hardMode.orders=[{type:'move',toUnitId:0,status:'active',stealth:true}]");
assert.equal(run('operationalEscortStealth(appData.campaign.opUnits[0])'),true);
run("hardMode.orders.push({type:'move',toUnitId:0,status:'pending',stealth:false})");
assert.equal(run('operationalEscortStealth(appData.campaign.opUnits[0])'),true,'future pending order cannot change current movement mode');
run('hardMode.orders[0].stealth=false;appData.campaign.opUnits[0].stealthMove=true');
assert.equal(run('operationalEscortStealth(appData.campaign.opUnits[0])'),false);
// 6. Placed tokens have a capture-phase drag path before confirmation only.
assert.match(placement,/p && p.phase !== 'done' && !p.playerReady/);assert.match(placement,/capture:true/);
assert.match(placement,/const ids=key && appData.map.grid\[key\]\?\.squadIds/);
// 7. Battle id beats stale editor/map keys, even before activating the battle tab.
load(HTML,['campaignMiniMapCurrentHex']);run("var hexEditorState={hexKey:'1,1'};appData.map={mode:'hexEdit',hexKey:'2,2'};appData.currentBattleId='current';appData.campaign.activeBattles=[{id:'current',hexKey:'8,12'}]");
assert.equal(run('campaignMiniMapCurrentHex()'),'8,12');
// 8. Saved ambush identity is owner+name; restore exact cells and camouflage.
load(hexmaps,['applySavedAmbushDeployment']);
run("var ambushers=[{name:'rifles',opUnitName:'ambush'},{name:'rifles',opUnitName:'other'}];var ambushMap={hexKey:'8,12',grid:{'3,4':{squadIds:[]},'5,6':{squadIds:[]}}};var owners=[{name:'ambush',ambushDeployment:{ready:true,hexKey:'8,12',positions:{rifles:'3,4'}}}]");
assert.equal(run('applySavedAmbushDeployment(ambushMap,ambushers,owners)'),1);
assert.equal(run('ambushers[0].camouflaged'),true);assert.equal(run('ambushers[1].camouflaged'),undefined);
assert.equal(run('ambushMap.grid["3,4"].squadIds[0]'),0);
// 9. Embarked infantry with null coordinates belongs to its carrier's battle.
run("var passenger={name:'infantry',embarkedInBtr:true,col:null,row:null};var carrier={name:'BTR group',col:8,row:12,embarkedUnitId:1};appData.campaign.opUnits=[carrier,passenger]");
assert.equal(run('tacticalOperationalPassengerOnHex(passenger,[carrier,passenger],{col:8,row:12})'),true);
assert.equal(run('tacticalOperationalPassengerOnHex(passenger,[carrier,passenger],{col:9,row:12})'),false);
load(HTML,['tacticalLinkInitialBtrPassengers','relinkBattlePassengers']);
run("carrier.type='btr_platoon';var troops=[0,1].map(i=>({name:'inf'+i,opUnitName:'infantry',fighters:[{hp:3}]}));var hosts=[0,1].map(i=>({name:'БТР Llanero №'+i,opUnitName:'BTR group',armor:{front:25},fighters:[{hp:3}],embarkedSquadIndex:null}));var roster=[...hosts,...troops];tacticalLinkInitialBtrPassengers(roster,[carrier,passenger],appData.campaign.opUnits);appData.squads=roster;appData.map={grid:{},enemySquads:[]}");
assert.equal(run('hosts[0].embarkedSquadIndex'),2);assert.equal(run('hosts[1].embarkedSquadIndex'),3);
assert.equal(run('tacticalBtrCanFire(hosts[0])'),true);run('troops[0].hidden=false');assert.equal(run('tacticalBtrCanFire(hosts[0])'),false);
// 10. Deterministic simultaneous melee: even a killed defender returns its hit.
load(actions,['mapActionTacticalSide','applyDamagePointsToEnemy','mapActionEnemyAlive']);
run("var a={name:'a',x:0,currentMorale:100,fighters:[{name:'a1',hp:3}]},b={name:'b',x:0,currentMorale:100,fighters:[{name:'b1',hp:3}]};appData.squads=[a];appData.map={grid:{},enemySquads:[b]}");
assert.equal(run('tacticalResolveMeleePair(a,b)'),true);assert.equal(run('a.fighters[0].hp'),0);assert.equal(run('b.fighters[0].hp'),0);
assert.equal(run('tacticalResolveMeleePair(a,b)'),false);
run("a.isDestroyed=false;b.isDestroyed=false;a.fighters[0].hp=3;b.fighters[0].hp=3;a.currentMorale=100;b.currentMorale=100;currentTurn=2");
assert.equal(run('tacticalResolveMeleePair(b,a)'),true);assert.equal(run('a.fighters[0].hp'),0);assert.equal(run('b.fighters[0].hp'),0);
// 11. Every conjunct, every squad, proximity to each — numbers cannot surrender.
run("var loser={x:0,currentMorale:0,ammoSmall:0,ammoOrdnance:0,grenades:0,fighters:[{hp:3}]},foe={x:3,currentMorale:100,fighters:[{hp:3}]}");
assert.equal(run('tacticalSurrenderEligible([loser],[foe])'),true);
for(const patch of ['loser.currentMorale=1','loser.ammoSmall=1','loser.ammoOrdnance=1','loser.grenades=1','foe.x=4']) {
  run('loser.currentMorale=0;loser.ammoSmall=0;loser.ammoOrdnance=0;loser.grenades=0;foe.x=3;'+patch);
  assert.equal(run('tacticalSurrenderEligible([loser],[foe])'),false,patch);
}
run('foe.x=3;loser.currentMorale=0');assert.equal(run('tacticalSurrenderEligible([loser,{...loser,currentMorale:1}],[foe])'),false);
load(HTML,['tacticalSideSquads']);run('appData.squads=[{currentMorale:100,fighters:[{hp:3}]}];appData.map.enemySquads=[{fighters:Array.from({length:8},()=>({hp:3}))}]');
run('tacticalApplySuperiorityPressure("player")');assert.equal(run('appData.squads[0].currentMorale'),95);
// 12. Prior OWN turn movement, aim mitigation and no stationary-turn penalty.
load(HTML,['tacticalVehicleMovementAccuracyPenalty','tacticalAdvanceStationaryPhase']);ctx.tacticalVehicleAimBonus=()=>ctx.aim || 0;
run('var v={armor:{},movedThisTurn:true};appData.squads=[v];appData.map.enemySquads=[];tacticalAdvanceStationaryPhase("player");v.movedThisTurn=false');
assert.equal(run('tacticalVehicleMovementAccuracyPenalty(v,"mg")'),-2);ctx.aim=1;assert.equal(run('tacticalVehicleMovementAccuracyPenalty(v,"mg")'),-1);
run('tacticalAdvanceStationaryPhase("enemy")');assert.equal(run('tacticalVehicleMovementAccuracyPenalty(v,"mg")'),-1);
run('tacticalAdvanceStationaryPhase("player")');assert.equal(run('tacticalVehicleMovementAccuracyPenalty(v,"mg")'),0);
assert.match(HTML,/family.id === 'llanero' && type === 'mg'.*deg:90/);
// 13. Highlight delegates to the same occupied-filtered edge as actual placement.
assert.match(sliceFunction(placement,'drawPlacementZone'),/reinforcement \? placementReinforcementZone\(battle,selectedSquad\).keys/);
// 14. Old saved catalog restores the CL/39 cannon without replacing edited data.
run("appData.factions={'A.I.R.F.':{crewWeapons:[{name:'Пулемёт Hotchkiss танковый',type:'mg',custom:true}]}}");
assert.equal(run("getFactionCrewWeapons('A.I.R.F.').some(w=>w.name==='45-мм 53К танковая')"),true);
assert.equal(run("getFactionCrewWeapons('A.I.R.F.').find(w=>w.name==='Пулемёт Hotchkiss танковый').custom"),true);
// Direct damage dispatcher protects armor on both sides, not merely UI filters.
load(actions,['mapActionEnemyIsVehicle','reportAttackOutcome']);
run("var shooter={name:'rifles',fighters:[{hp:3}]},armor={name:'tank',armor:{front:40},fighters:[{hp:3}],detected:true};appData.squads=[shooter];appData.map={grid:{},enemySquads:[armor],attackTargetEnemyIdx:0};var currentSquad=shooter,currentSquadIndex=0");
run('reportAttackOutcome("smallArms",{hits:99,shots:99});reportAttackOutcome("sniper",{hits:1,damage:99})');assert.equal(run('armor.fighters[0].hp'),3);
run('appData.squads=[armor];appData.map.enemySquads=[shooter];currentSquad=shooter;reportAttackOutcome("smallArms",{hits:99,shots:99})');assert.equal(run('armor.fighters[0].hp'),3);
assert.match(actions,/mapVehicleFireButtons\(squad,idx/);
console.log('PASS v13.203: all 14 gameplay regressions, symmetric melee, surrender conjunction, previous-own-turn MG penalty, passenger distribution, saved ambush positions and armored crew immunity.');
