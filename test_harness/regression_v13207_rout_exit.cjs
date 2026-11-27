'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {HTML,sliceFunction,ROOT}=require('./extract.js');
const placement=fs.readFileSync(ROOT+'/js/placement.js','utf8');
const playtest=fs.readFileSync(ROOT+'/js/playtest_rules.js','utf8');
function make(attacker='enemy',entry='W') {
 const c=vm.createContext({console,currentTurn:1,TACTICAL_MAP_SIZE:7,actionPoints:{0:{ap:2}},
  appData:{squads:[],campaign:{online:false,opUnits:[]},map:{mapSize:7,grid:{},enemySquads:[]}},
  battle:{placement:{attackerSide:attacker,entryDir:entry,battleMode:'normal'}},
  log(){},saveData(){},updateUI(){},redrawMap(){},updateTacticalTurnUI(){},
  tacticalApplyHeadquartersLossMoralePenalties(){},tacticalRecordNearbyMoraleLoss(){},
  tacticalIsHeadquartersSquad:s=>!!s.hq,tacticalIsDotSquad:()=>false,tacticalStubbornAtStartingHex:()=>false,
  tacticalSquadHasStubbornCard:()=>false,tacticalHasLiveHeadquartersFor:()=>true,
  tacticalMoraleIsCritical:s=>s.currentMorale<=10,tacticalMoralePercent:s=>s.currentMorale,
  tacticalMoraleCurrent:s=>s.currentMorale,tacticalClearMeleeEngagement(){},recordEnemyPrisoners(){},
  getMovementCost:()=>1,getMaxAP:()=>2,
  getBattleSquadHex:(g,i,e)=>{const key=Object.keys(g).find(k=>(g[k][e?'enemySquadIds':'squadIds']||[]).includes(i));if(!key)return null;const [col,row]=key.split(',').map(Number);return {key,col,row};},
  isNightTime:()=>false,tacticalIlluminationActive:()=>false,
 });
 c.run=s=>vm.runInContext(s,c);
 c.getTacticalBattleRecord=()=>c.battle;c.getAP=i=>c.actionPoints[i]?.ap||0;
 c.getHexNeighbors=key=>{const [x,y]=key.split(',').map(Number);return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(p=>p.join(',')).filter(k=>c.appData.map.grid[k]);};
 for(let y=0;y<7;y++)for(let x=0;x<7;x++)c.appData.map.grid[x+','+y]={type:'grass',squadIds:[],enemySquadIds:[],markers:[]};
 for(const name of ['opHexCenterUnits','opDirectionBetween'])c.run(sliceFunction(placement,name));
 c.run(sliceFunction(playtest,'tacticalSurrenderEligible'));
 c.run(sliceFunction(playtest,'tacticalMovementContactChecks'));
 for(const name of ['tacticalMapEdgeHexKeys','tacticalRoutExitDirection','tacticalRoutExitZoneKeys','tacticalRoutExitIsOccupied','tacticalCheckRoutExitZones','processTacticalRouts','tacticalSurrenderUnit','tacticalPlaceSurrenderMarker','tacticalRetreatUnit','tacticalRemoveUnitFromMap','tacticalSideSquads','tacticalMaybeAutoRetreat'])c.run(sliceFunction(HTML,name));
 c.place=(side,name,key,routing=true)=>{
  const s={name,fighters:[{hp:3}],isRouting:routing,retreatReason:routing?'morale':null,currentMorale:routing?5:100,ammoSmall:20,tacticalAP:2,detected:true,hexPos:key.split(',').map(Number)};
  const list=side==='enemy'?c.appData.map.enemySquads:c.appData.squads;const i=list.push(s)-1;
  c.appData.map.grid[key][side==='enemy'?'enemySquadIds':'squadIds'].push(i);return s;
 };
 return c;
}
// All six enemy entry directions use the opposite OUTER boundary only.
const opposite={W:'E',E:'W',NW:'SE',SE:'NW',NE:'SW',SW:'NE'};
for(const [entry,exit] of Object.entries(opposite)){
 const c=make('enemy',entry);assert.equal(c.run("tacticalRoutExitDirection('player')"),exit);
 const keys=c.run("tacticalRoutExitZoneKeys('player')");assert(keys.length>0);
 for(const key of keys){const [x,y]=key.split(',').map(Number);assert(x===0||x===6||y===0||y===6);}
 assert(!keys.includes('5,3')&&!keys.includes('1,3'),'penultimate row is not an exit');
}
{
 const c=make('player','W');assert.equal(c.run("tacticalRoutExitDirection('player')"),'W','attacker flees away from defenders');
 assert.equal(c.run("tacticalRoutExitDirection('enemy')"),'E','defender flees away from attacker');
}
{
 const c=make();c.battle.placement={battleMode:'meeting',entryDirs:{player:'NW',enemy:'SE'}};
 assert.equal(c.run("tacticalRoutExitDirection('player')"),'NW');assert.equal(c.run("tacticalRoutExitDirection('enemy')"),'SE');
 c.appData=JSON.parse(JSON.stringify(c.appData));c.battle.placement.entryDirs.enemy='W';
 assert.equal(c.run("tacticalRoutExitDirection('player')"),'NW','saved exit cannot rotate with a flanking enemy');
}
// One step from the designated border: actual removal, not rally at HQ.
{
 const c=make();const s=c.place('player','routed','5,3');const hq=c.place('player','HQ','4,3',false);hq.hq=true;
 c.run("processTacticalRouts('player')");assert.equal(s.isRetreated,true);assert.equal(s.status,'retreated');
 assert.equal(Object.values(c.appData.map.grid).some(h=>h.squadIds.includes(0)),false);
 assert.equal(hq.isRetreated,undefined);assert.equal(s.currentMorale,5,'not healed at a nearby HQ');
}
// Cannot disappear through a nearer but incorrect border, or at AP=0.
{
 const c=make();const s=c.place('player','routed','0,3');c.actionPoints[0].ap=1;
 c.run("processTacticalRouts('player')");assert.equal(s.isRetreated,undefined);assert.equal(s.isRouting,true);
 assert.equal(c.getBattleSquadHex(c.appData.map.grid,0,false).key,'1,3');assert.equal(c.actionPoints[0].ap,0);
 c.appData=JSON.parse(JSON.stringify(c.appData));c.run("processTacticalRouts('player')");
 assert.equal(c.getBattleSquadHex(c.appData.map.grid,0,false).key,'1,3','save/restore does not grant movement');
}
// Both sides exit; enemy zero AP stays zero rather than silently refilling.
{
 const c=make('player','W');const s=c.place('enemy','routed enemy','5,3');s.tacticalAP=0;
 c.run("processTacticalRouts('enemy')");assert.equal(s.isRetreated,undefined);assert.equal(s.tacticalAP,0);
 s.tacticalAP=1;c.run("processTacticalRouts('enemy')");assert.equal(s.isRetreated,true);
 assert.equal(Object.values(c.appData.map.grid).some(h=>h.enemySquadIds.includes(0)),false);
}
// Occupation of ANY cell in the chosen zone is the new explicit surrender
// exception: ammunition and nonzero morale do not protect a routed squad.
{
 const c=make();const a=c.place('player','routed A','2,3'),b=c.place('player','routed B','4,4');c.actionPoints[1]={ap:2};
 const enemy=c.place('enemy','blocker','6,0',false);enemy.detected=false;enemy.hidden=true;
 c.run('tacticalCheckRoutExitZones()');
 for(const s of [a,b]){assert.equal(s.isSurrendered,true);assert.equal(s.surrenderReason,'rout_exit_occupied');assert.equal(s.ammoSmall,20);}
 assert(c.appData.map.grid['2,3'].squadIds.includes(0),'surrendered squads remain with markers, not evacuated');
 assert(c.appData.map.grid['2,3'].markers.includes('surrenderedFriendly'));
}
// Symmetric surrender for the AI; online mirrors never decide for the opponent.
{
 const c=make('player','W');const s=c.place('enemy','routing opponent','3,3');c.place('player','blocker','6,0',false);
 c.appData.campaign.online=true;c.run('tacticalCheckRoutExitZones()');assert(!s.isSurrendered);
 c.appData.campaign.online=false;c.run('tacticalCheckRoutExitZones()');assert.equal(s.isSurrendered,true);
 assert(c.appData.map.grid['3,3'].markers.includes('surrenderedEnemy'));
}
// A non-routing squad, an already escaped squad, a dead/away enemy and an
// enemy on another boundary do not activate the exception. No forged bypass.
{
 const c=make();const s=c.place('player','not routing','3,3',false);const e=c.place('enemy','blocker','6,1',false);c.s=s;
 assert.equal(c.run("tacticalSurrenderUnit(s,'player',0,'rout_exit_occupied')"),false);
 s.isRouting=true;s.retreatReason='morale';e.fighters[0].isAway=true;c.run('tacticalCheckRoutExitZones()');assert(!s.isSurrendered);
 e.fighters[0].isAway=false;e.fighters[0].hp=0;c.run('tacticalCheckRoutExitZones()');assert(!s.isSurrendered);
 e.fighters[0].hp=3;c.appData.map.grid['6,1'].enemySquadIds=[];c.appData.map.grid['0,1'].enemySquadIds=[0];c.run('tacticalCheckRoutExitZones()');assert(!s.isSurrendered);
}
// Movement hook checks occupation immediately, not just at the routed side's end turn.
{
 const c=make();const s=c.place('player','routed','3,3');const e=c.place('enemy','moving blocker','6,2',false);c.e=e;
 c.run('tacticalMovementContactChecks(e)');assert.equal(s.isSurrendered,true);
}
// Terrain obstruction away from the exit does not invent a surrender reason;
// explicit command withdrawal remains separate and keeps its chosen direction.
{
 const c=make();const s=c.place('player','routed','3,3');c.getMovementCost=()=>Infinity;
 c.run("processTacticalRouts('player')");assert.equal(s.isRouting,true);assert(!s.isSurrendered&&!s.isRetreated);
}
{
 const c=make();const s=c.place('player','commanded','1,3');s.retreatReason='command';s.tacticalRetreatDirection='W';
 c.place('enemy','at morale exit','6,3',false);c.run("processTacticalRouts('player')");assert.equal(s.isRetreated,true);assert(!s.isSurrendered);
}
// No manual hiding remains, including invocation through the old modal API.
for(const name of ['showDetectionDialog','closeDetectionModal','executeDetectionCheck','tacticalRoutRallyAtHQ'])assert.throws(()=>sliceFunction(HTML,name));
assert(!HTML.includes('id="detectionModal"'));assert(!HTML.includes('🥷 Скрыться'));
console.log('PASS v13.207: fixed opposite outer exit zones, routing to removal for both sides, occupation surrender exception, movement trigger, saved direction/AP, no HQ rally or manual hiding.');
