'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {HTML,ROOT,sliceFunction}=require('./extract');
const src=f=>fs.readFileSync(ROOT+'/'+f,'utf8');
const ctx=vm.createContext({console,appData:{squads:[],map:{grid:{},enemySquads:[]},campaign:{online:false}},currentTurn:1,
 log(){},getFactionCrewWeapons:()=>[],tacticalActionAllowed:()=>true,tacticalIsMeleeEngaged:()=>false,
 isNightTime:()=>false,tacticalIlluminationActive:()=>false,isArmoredTacticalSquad:s=>!!s.armor,
 hexGridDistance:(a,b,c,d)=>Math.max(Math.abs(a-c),Math.abs(b-d)),
 tacticalObserverCanSeeHex:()=>true,rollD10:()=>10,autoTacticalDetectionMod:()=>0,tacticalClearArmoredNoise:s=>ctx.cleared.push(s),cleared:[],
 getBattleSquadHex:(grid,index,enemy)=>{const key=Object.keys(grid).find(k=>(grid[k][enemy?'enemySquadIds':'squadIds']||[]).includes(index));if(!key)return null;const [col,row]=key.split(',').map(Number);return {key,col,row};},
 getTacticalSideAP:s=>s.tacticalAP||0,mapActionCanUseBinoculars:s=>!!s.binoculars,
 mapActionEligibleAmmoRunners:s=>(s.fighters || []).map(fighter=>({fighter})).filter(({fighter:f})=>f.hp>0&&!f.isAway&&!f.isCommander&&!f.isMachineGunner),
 });
const run=s=>vm.runInContext(s,ctx),load=(s,names)=>names.forEach(n=>run(sliceFunction(s,n)));
run(src('js/playtest_rules.js'));
load(HTML,['operationalAmmoSquads','platoonAmmoReserveInit']);
run('const PLATOON_AMMO_RESERVE_RATIO=0.5;');
ctx.supplySquadCapacity=(s,f)=>f==='ammoSmall'?60:10;
run(`function foot(name,x){return {name,hexPos:[x,0],fighters:[{hp:3},{hp:3}],detected:false,ammoSmall:0};}
 function place(players,enemies){appData.squads=players;appData.map={grid:{},enemySquads:enemies};for(let x=0;x<12;x++)appData.map.grid[x+',0']={type:'grass',squadIds:[],enemySquadIds:[],markers:[]};
 players.forEach((s,i)=>appData.map.grid[s.hexPos.join(',')].squadIds.push(i));enemies.forEach((s,i)=>appData.map.grid[s.hexPos.join(',')].enemySquadIds.push(i));}
 var observer=foot('observer',0),near=foot('near',1),two=foot('noise',2),far=foot('far',3),armor=foot('armor',1),camo=foot('camo',1),dead=foot('dead',1),seen=foot('seen',2);
 two.noiseMarker=true;two.hidden=true;armor.armor={front:4};camo.camouflaged=true;dead.isDestroyed=true;seen.detected=true;
 place([observer],[near,two,far,armor,camo,dead,seen]);Math.random=()=>0.5;`);
assert.equal(run('tacticalMovementContactChecks(observer).detected'),2);
for(const name of ['far','armor','camo','dead'])assert.equal(run(`${name}.detected`),false,name+' unchanged');
assert.equal(run('two.hidden'),false);assert.equal(run('two.noiseMarker'),false);
assert.equal(run('tacticalMovementContactChecks(observer).checked'),0,'revealed units never rerolled');
run('near.detected=false;Math.random=()=>0.995;');assert.equal(run('tacticalMovementContactChecks(observer).detected'),0,'1% adjacent escape');
ctx.tacticalObserverCanSeeHex=()=>false;
run('Math.random=()=>0;');assert.equal(run('tacticalMovementContactChecks(observer).detected'),0,'no discovery through smoke/blocked LOS');ctx.tacticalObserverCanSeeHex=()=>true;
run("place([near],[observer]);near.detected=false;");assert.equal(run('tacticalMovementContactChecks(observer).detected'),1,'enemy movement detects player too');
// Local proximity modifier must ignore a different, closer observer.
load(HTML,['tacticalObserverProximity']);
ctx.tacticalSquadHexPosition=s=>({key:s.hexPos.join(','),col:s.hexPos[0],row:s.hexPos[1]});
run("var distantObserver=foot('distant',8);place([observer,distantObserver],[two]);");
assert.equal(run('tacticalObserverProximity(two,distantObserver).nearestDist'),6);
// Same real per-side path/return routine, not a magic refill.
load(src('js/hexmaps.js'),['activeSupplyPointKeys','ammoRunnerFindPath','nearestSupplyPoint','advanceTacticalAmmoRunner']);
run("const SUPPLY_POINT_MARKER='supply';place([far],[observer]);appData.map.enemySupplyPointKeys=['2,0'];appData.map.grid['2,0'].markers=['supply'];");
run("appData.campaign.enemyOpUnits=[{name:'unit',squads:[observer],ammoReserve:{small:90,ordnance:10}}];");
// actual helper uses the shared side state-name resolver
ctx.supplyPointStateKey=side=>side==='enemy'?'enemySupplyPointKeys':'supplyPointKeys';
assert.equal(run('tacticalAISupplyAction(observer,0)'),true);
assert.equal(run('observer.fighters[0].isAway'),true);
assert.equal(run('tacticalAISupplyAction(observer,0)'),false,'no duplicate runners');
load(HTML,['processTacticalAmmoRunners']);
run("processTacticalAmmoRunners('player')");assert.equal(run('observer.ammoSmall'),0);
run("processTacticalAmmoRunners('enemy')");assert.equal(run('observer.ammoSmall'),0,'must return before delivery');
run("processTacticalAmmoRunners('enemy')");assert.equal(run('observer.ammoSmall'),30);assert.equal(run('observer.fighters[0].isAway'),false);
// No enemy route through a living player / no ammunition if supply was lost.
run("observer.ammoSmall=0;near.hexPos=[1,0];place([near],[observer]);appData.map.enemySupplyPointKeys=['2,0'];appData.map.grid['2,0'].markers=['supply'];");
assert.equal(run('tacticalAISupplyAction(observer,0)'),false,'occupied route rejected');
run("place([],[observer]);appData.map.enemySupplyPointKeys=['2,0'];appData.map.grid['2,0'].markers=['supply'];tacticalAISupplyAction(observer,0);appData.map.grid['2,0'].markers=[];processTacticalAmmoRunners('enemy');");assert.equal(run('observer.ammoSmall'),0,'supply loss prevents cargo');
// Recon is evidence/terrain based, exact hidden target coordinates never read.
run("place([],[observer]);observer.binoculars=true;observer.tacticalAP=4;appData.map.tacticalNoiseMarkers=[{col:2,row:0,viewerSide:'enemy',expiresTurn:1}];");
let searches=[];ctx.mapActionUseBinocularsForSide=(i,k,s)=>{searches.push(k);return true;};
assert.equal(run('tacticalAIReconAction(observer,0)'),true);assert.equal(searches[0],'2,0');
assert.equal(run('tacticalAIReconAction(observer,0)'),false,'one recon action per observer per phase');
run('currentTurn=2;');searches=[];assert.equal(run('tacticalAIReconAction(observer,0)'),true);assert.notEqual(searches[0],'2,0','rotate search cells');
const unseen={detected:false,get hexPos(){throw Error('omniscient recon');}};
ctx.appData.squads=[unseen];run('currentTurn=3;');assert.equal(run('tacticalAIReconAction(observer,0)'),true);
ctx.operationalAIRole=u=>u.role;
// Operational recon already has bounded reconnaissance preparation.
run("appData.campaign={currentTurn:1,opUnits:[{detected:false}],enemyOpUnits:[]};var scout={name:'scout',role:'recon'};");
assert.equal(run("operationalAIReconPreparation(appData.campaign,'BeVe',[scout]).mode"),'recon_prepare');
// Guards: movement hooks remain on both live movement paths, supply runs by
// completed side, and AI uses the shared recon/supply instead of dead code.
assert.match(HTML,/processTacticalAmmoRunners\(completedSide\)/);
assert.match(HTML,/tacticalMovementContactChecks\(squad\)/);
assert.match(src('js/tactical_ai.js'),/tacticalMovementContactChecks\(squad\)/);
assert.match(src('js/tactical_ai.js'),/tacticalAISupplyAction\(squad,index\)/);
assert.match(src('js/tactical_ai.js'),/tacticalAIReconAction\(s,i\)/);
// Finite operational supply: dispatch debits stock; moving convoy delivers later.
load(src('js/operational_ai.js'),['operationalAIProcessSupply','operationalAISupplyRoute']);
Object.assign(ctx,{isOfflineCampaignAIEnabled:()=>true,isSupplyOperationalUnit:u=>u.type==='supply',operationalUnitInTacticalBattle:()=>false,
 SUPPLY_DEPOT_MAX:{ammoSmall:100,ammoOrdnance:10,grenades:5},supplyAssetCounts:()=>({mule:1}),supplyAssetIds:()=>['mule'],
 supplyAssetsMobility:()=> 'foot',supplyCargoOf:()=>({ammoSmall:30,ammoOrdnance:0,grenades:0}),
 unitAmmoStatus:u=>({ammoSmall:{cur:u.ammoSmall||0,max:60},ammoOrdnance:{cur:0,max:0},grenades:{cur:0,max:0}}),supplyAmmoPercent:u=>(u.ammoSmall||0)/60,
 getRouteToTarget:(x,y,c,r)=>x===c?[]:[{col:c,row:r}],supplyMoveCost:()=>2,getOpHexNeighbors:(x,y)=>[{col:x===0?1:0,row:0}],
 supplyDistributeCargo:(u,c)=>{u.ammoSmall+=c.ammoSmall;return {ammoSmall:0,ammoOrdnance:0,grenades:0};}});
run("var depot={name:'depot',type:'supply',col:0,row:0},recipient={name:'rifle',col:1,row:0,ammoSmall:0};appData.campaign={currentTurn:1,opUnits:[],enemyOpUnits:[depot,recipient]};operationalAIProcessSupply();");
assert.equal(run('appData.campaign.enemyAISupply.stock.ammoSmall'),70);assert.equal(run('recipient.ammoSmall'),0);
run('operationalAIProcessSupply()');assert.equal(run('recipient.ammoSmall'),0,'no double processing same turn');
run('appData.campaign.currentTurn++;operationalAIProcessSupply()');assert.equal(run('recipient.ammoSmall'),30,'real convoy arrives');
run('appData.campaign.currentTurn++;operationalAIProcessSupply()');assert.equal(run('appData.campaign.enemyAISupply.deliveries.length'),0,'transport returns');
console.log('PASS v13.204: local two-hex detection, adjacent 99%, armor/camouflage/LOS exclusions, symmetric runners, blocked/lost supply, non-omniscient repeated recon, finite operational convoy.');
