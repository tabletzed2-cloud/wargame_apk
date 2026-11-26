'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {HTML,ROOT,sliceFunction,sliceConst}=require('./extract');
const src=f=>fs.readFileSync(ROOT+'/'+f,'utf8');
const ctx=vm.createContext({console,appData:{campaign:{active:true,opUnits:[],enemyOpUnits:[],activeBattles:[]},squads:[],map:{grid:{},enemySquads:[]}},
 log(){},tacticalIsMeleeEngaged:()=>false,tacticalActionAllowed:()=>true,mapActionEligibleAmmoRunners:s=>s.fighters.map(fighter=>({fighter})).filter(x=>x.fighter.hp>0&&!x.fighter.isAway),
 getFactionCrewWeapons:()=>[{name:'gun',type:'tank_gun'}],syncInfantryAmmoStrength(){},infantryAmmoEligible:()=>false,
 getBattleSquadHex:(g,i,enemy)=>{const key=Object.keys(g).find(k=>(g[k][enemy?'enemySquadIds':'squadIds']||[]).includes(i));if(!key)return null;const [col,row]=key.split(',').map(Number);return {key,col,row};},
 supplySquadCapacity:(s,f)=>Number(s[f+'Full'])||0,
 isOfflineCampaignAIEnabled:()=>ctx.appData.campaign.active&&!ctx.appData.campaign.online,isSupplyOperationalUnit:u=>u.type==='supply',
 operationalUnitInTacticalBattle:u=>!!u.isInBattle,supplyAssetCounts:()=>({cart:1}),supplyAssetIds:()=>['cart'],supplyAssetsMobility:()=> 'foot',
 supplyCargoOf:()=>({ammoSmall:200,ammoOrdnance:20,grenades:20}),supplyMoveCost:()=>2,
 getOpHexNeighbors:(x,y)=>[{col:x===0?1:0,row:0}],supplyAmmoPercent:()=>0,
 SUPPLY_DEPOT_MAX:{ammoSmall:1200,ammoOrdnance:80,grenades:300},SUPPLY_AMMO_PER_MAN:15,SUPPLY_GREN_PER_MAN:2,
});
const run=s=>vm.runInContext(s,ctx),load=(s,names)=>names.forEach(n=>run(sliceFunction(s,n)));
run(src('js/playtest_rules.js'));
load(HTML,['operationalAmmoSquads','platoonAmmoReserveInit','processTacticalAmmoRunners','unitAmmoStatus','supplyDistributeCargo']);
run(sliceConst(HTML,'PLATOON_AMMO_RESERVE_RATIO'));
ctx.supplyAmmoSquads=u=>ctx.operationalAmmoSquads(u);ctx.supplyOrdnanceFull=s=>s.ammoOrdnanceFull||0;
load(src('js/hexmaps.js'),['supplyPointStateKey','activeSupplyPointKeys','ammoRunnerFindPath','nearestSupplyPoint','advanceTacticalAmmoRunner']);
load(src('js/operational_ai.js'),['operationalAIProcessSupply','operationalAISupplyRoute']);
run(`const SUPPLY_POINT_MARKER='supply';
 function foot(name,owner,ammo=0){return {name,opUnitName:owner,ammoSmall:ammo,ammoSmallFull:600,ammoOrdnance:0,ammoOrdnanceFull:50,grenades:0,grenadesFull:10,fighters:[{name:'a',hp:3},{name:'b',hp:3}]};}
 function prepare(side='player',stock=35){
  var s=foot('rifle','P',20),peer=foot('peer','P'),op={name:'P',squads:[JSON.parse(JSON.stringify(s)),JSON.parse(JSON.stringify(peer))],ammoReserve:{small:stock,ordnance:12,grenades:7,caps:{rifle:{small:600,ordnance:50,grenades:10},peer:{small:600,ordnance:50,grenades:10}},initialsmall:1800,initialordnance:150,initialgrenades:30}};
  appData.campaign={active:true,online:false,opUnits:side==='player'?[op]:[],enemyOpUnits:side==='enemy'?[op]:[],activeBattles:[],currentTurn:1};
  appData.squads=side==='player'?[s,peer]:[];appData.map={grid:{},enemySquads:side==='enemy'?[s,peer]:[],autoSupplyKeysPlayer:[],autoSupplyKeysEnemy:[]};
  for(let i=0;i<4;i++)appData.map.grid[i+',0']={type:'grass',markers:[],squadIds:[],enemySquadIds:[]};
  appData.map.grid['0,0'][side==='enemy'?'enemySquadIds':'squadIds']=[0,1];
  appData.map[side==='enemy'?'autoSupplyKeysEnemy':'autoSupplyKeysPlayer']=['2,0'];appData.map.grid['2,0'].markers=['supply'];
  return {s,peer,op,side,pos:{key:'0,0',col:0,row:0},point:{key:'2,0',distance:2}};
 }
 function dispatch(w,s=w.s,type='1'){return tacticalDispatchAmmoRunner(s,s.fighters.find(f=>!f.isAway),w.side,w.pos,w.point,type);}
 var w=prepare();`);
assert.equal(run('dispatch(w)'),true);assert.equal(run('w.op.ammoReserve.small'),5,'debit at dispatch, from canonical owner');
assert.equal(run('w.s.ammoSmall'),20,'not yet delivered');
assert.equal(run('dispatch(w,w.peer)'),true);assert.equal(run('w.peer.fighters[0].ammoCargo.amount'),5,'partial cargo, shared finite pool');
assert.equal(run('w.op.ammoReserve.small'),0);assert.equal(run('dispatch(w)'),false,'concurrent runners cannot oversubscribe');
run("processTacticalAmmoRunners('enemy')");assert.equal(run('w.s.ammoSmall'),20);
run("processTacticalAmmoRunners('player')");assert.equal(run('w.s.ammoSmall'),20,'must reach point AND return');
// Save both the source and the live snapshots with reserved cargo; restore as separate objects.
run("appData=JSON.parse(JSON.stringify(appData));w.op=appData.campaign.opUnits[0];w.s=appData.squads[0];w.peer=appData.squads[1];processTacticalAmmoRunners('player');processTacticalAmmoRunners('player');");
assert.equal(run('w.s.ammoSmall'),50);assert.equal(run('w.peer.ammoSmall'),5);assert.equal(run('w.op.ammoReserve.small'),0,'no second debit or regeneration');
assert.equal(run('dispatch(w)'),false,'exhausted reserve remains empty after save/reload');
// Both other ammunition types have finite, independently debited stocks.
run('w=prepare();');assert.equal(run("dispatch(w,w.s,'2')"),true);assert.equal(run('w.op.ammoReserve.ordnance'),2);
assert.equal(run("dispatch(w,w.peer,'2')"),true);assert.equal(run('w.peer.fighters[0].ammoCargo.amount'),2);
run("processTacticalAmmoRunners('player');processTacticalAmmoRunners('player');");assert.equal(run('w.s.ammoOrdnance'),10);assert.equal(run('w.peer.ammoOrdnance'),2);
run('w=prepare();');assert.equal(run("dispatch(w,w.s,'3')"),true);assert.equal(run('w.op.ammoReserve.grenades'),2);
assert.equal(run("dispatch(w,w.peer,'3')"),true);run("processTacticalAmmoRunners('player');processTacticalAmmoRunners('player');");
assert.equal(run('w.s.grenades+w.peer.grenades'),7);assert.equal(run('w.op.ammoReserve.grenades'),0);
// Cancellation before loading refunds reserved stock once; carried cargo is lost with its runner.
run("w=prepare();dispatch(w);appData.map.grid['2,0'].markers=[];processTacticalAmmoRunners('player');processTacticalAmmoRunners('player');");
assert.equal(run('w.op.ammoReserve.small'),35);assert.equal(run('w.s.ammoSmall'),20);
run("w=prepare();dispatch(w);processTacticalAmmoRunners('player');w.s.fighters[0].hp=0;processTacticalAmmoRunners('player');");
assert.equal(run('w.op.ammoReserve.small'),5);assert.equal(run('w.s.ammoSmall'),20);
// Old saved countdowns or already-loaded missions must not mint fixed +30 anymore.
run("w=prepare('player',0);w.s.fighters[0].isAway=true;w.s.fighters[0].turnsToReturn=0;w.s.fighters[0].ammoType='1';processTacticalAmmoRunners('player');");assert.equal(run('w.s.ammoSmall'),20);
run("w=prepare('player',9);w.s.fighters[0].isAway=true;w.s.fighters[0].turnsToReturn=0;w.s.fighters[0].ammoType='1';processTacticalAmmoRunners('player');");assert.equal(run('w.s.ammoSmall'),29);assert.equal(run('w.op.ammoReserve.small'),0);
// Enemy and friendly reserves stay separate even when the platoon names coincide.
run("w=prepare('enemy',35);appData.campaign.opUnits=[{name:'P',squads:[],ammoReserve:{small:777}}];dispatch(w);processTacticalAmmoRunners('enemy');processTacticalAmmoRunners('enemy');");
assert.equal(run('w.s.ammoSmall'),50);assert.equal(run('appData.campaign.opUnits[0].ammoReserve.small'),777);
// Large rifle and cannon capacities use percentages, not hard-coded 6/1.
run("w=prepare('enemy',300);w.s.ammoSmall=121;");assert.equal(run('tacticalAISupplyAction(w.s,0)'),false,'20.17%: no dispatch');
run('w.s.ammoSmall=120;');assert.equal(run('tacticalAISupplyAction(w.s,0)'),true,'20% nonempty: proactive dispatch');
run("w=prepare('enemy',300);w.s.ammoSmall=600;w.s.crewInstances=[{weaponName:'gun',active:true}];w.s.ammoOrdnance=11;");assert.equal(run('tacticalAISupplyAction(w.s,0)'),false,'22% shells: wait');
run('w.s.ammoOrdnance=10;');assert.equal(run('tacticalAISupplyAction(w.s,0)'),true,'20% shells: dispatch');assert.equal(run('w.s.fighters[0].ammoType'),'2');
// Depleted shell reserve must not block a useful rifle-ammo errand.
run("w=prepare('enemy',300);w.op.ammoReserve.ordnance=0;w.s.crewInstances=[{weaponName:'gun',active:true}];w.s.ammoSmall=120;w.s.ammoOrdnance=0;");
assert.equal(run('tacticalAISupplyAction(w.s,0)'),true);assert.equal(run('w.s.fighters[0].ammoType'),'1');
// Campaign missing owners fail closed instead of inventing a new reserve.
run("w=prepare();appData.campaign.opUnits=[];");assert.equal(run('dispatch(w)'),false);
// Standalone map reserves are one-time finite saved pools, too.
run("w=prepare();appData.campaign={active:false};w.s.ammoSmall=60;tacticalAmmoSourceUnit(w.s,'player');w.s.ammoSmall=0;dispatch(w);processTacticalAmmoRunners('player');processTacticalAmmoRunners('player');");
assert.equal(run('w.s.ammoSmall'),30);assert.equal(run("tacticalAmmoSourceUnit(w.s,'player').ammoReserve.small"),0);
// Full squad loadout must not permit reserving extra ammunition.
run('w=prepare();w.s.ammoSmall=600;');assert.equal(run('dispatch(w)'),false);assert.equal(run('w.op.ammoReserve.small'),35);
// Operational trigger includes the platoon reserve. 18/90 = 20%, 19/90 > 20%.
run(`function opPrepare(carried,reserve){
 var sq=foot('rifle','P',carried);sq.ammoSmallFull=60;sq.ammoOrdnanceFull=0;sq.grenadesFull=0;
 var unit={name:'P',col:1,row:0,squads:[sq],ammoReserve:{small:reserve,ordnance:0,grenades:0,initialsmall:90,initialordnance:0,initialgrenades:0,caps:{rifle:{small:60,ordnance:0,grenades:0}}}};
 appData.campaign={active:true,currentTurn:1,opUnits:[],enemyOpUnits:[{name:'depot',type:'supply',col:0,row:0,squads:[]},unit]};return unit;
} var recipient=opPrepare(0,19);operationalAIProcessSupply();`);
assert.equal(run('appData.campaign.enemyAISupply.deliveries.length'),0,'reserve counted in operational threshold');
run('recipient=opPrepare(0,18);operationalAIProcessSupply();');assert.equal(run('appData.campaign.enemyAISupply.deliveries.length'),1,'20% requests before exhaustion');
assert.equal(run('appData.campaign.enemyAISupply.stock.ammoSmall'),1128,'72 rounds removed from depot');
run('appData.campaign=JSON.parse(JSON.stringify(appData.campaign));appData.campaign.currentTurn++;operationalAIProcessSupply();recipient=appData.campaign.enemyOpUnits[1];');
assert.equal(run('recipient.squads[0].ammoSmall'),60);assert.equal(run('recipient.ammoReserve.small'),30,'real delivery refills finite platoon reserve too');
assert.equal(run('appData.campaign.enemyAISupply.stock.ammoSmall'),1128,'save/reload never debits cargo twice');
assert.match(HTML,/tacticalDispatchAmmoRunner\(currentSquad/);assert.match(src('js/map_actions.js'),/tacticalDispatchAmmoRunner\(squad/);
console.log('PASS v13.205: finite canonical/standalone reserves, partial/concurrent cargo, all ammo types, cancellation/loss/reload/legacy conservation, both sides, and proactive 20% tactical/operational supply.');
