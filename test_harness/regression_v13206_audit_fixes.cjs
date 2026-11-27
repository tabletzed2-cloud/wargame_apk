'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {HTML,sliceFunction,ROOT}=require('./extract.js');
const source=f=>fs.readFileSync(ROOT+'/'+f,'utf8');
function context(extra={}) {
 const c=vm.createContext({console,currentTurn:1,currentSquadIndex:0,actionPoints:{0:{ap:6}},
  appData:{currentBattleId:206,campaign:{activeBattles:[]},squads:[],map:{grid:{},enemySquads:[]}},
  log(){},saveData(){},updateUI(){},redrawMap(){},
  getTacticalActiveSide:()=> 'player',tacticalIsHeadquartersSquad:s=>!!s.hq,
  isBicycleTacticalSquad:()=>false,tacticalIsMeleeEngaged:()=>false,tacticalMaraudingBlocksAction:()=>false,
  tacticalMoraleIsSuppressed:s=>Number(s.currentMorale)<30,tacticalSquadIsSuppressed:s=>!!s.suppressed,
  tacticalIsDotSquad:()=>false,tacticalMoraleBattleKey:()=> 'battle206',
  getBattleSquadHex:(g,i,e)=>{const key=Object.keys(g).find(k=>(g[k][e?'enemySquadIds':'squadIds']||[]).includes(i));if(!key)return null;const [col,row]=key.split(',').map(Number);return {key,col,row};},
  document:{getElementById:()=>null},...extra});
 c.run=s=>vm.runInContext(s,c);c.load=(src,names)=>names.forEach(n=>c.run(sliceFunction(src,n)));return c;
}
// Only approved obsolete mechanics are gone; retained public helpers still exist.
for(const n of ['moveSquad','checkDetection','manualDetect','hideSquad']) assert.throws(()=>sliceFunction(HTML,n));
assert(!/onclick="moveSquad\(/.test(HTML));
for(const n of ['showShootingConfirm','calculateOpShootDamage','autoBuildRoute','activateFlemishFury']) assert(sliceFunction(HTML,n));
assert(HTML.includes("/tacticalRegroupSquadAtHQ/.test(handler) ? 'regroup'"));
// Full discovery, firing, armored contact and flare refresh clear the hidden veto.
{
 const c=context({rollD10:()=>10,autoTacticalDetectionMod:()=>0,isArmoredTacticalSquad:s=>!!s.armor,
  tacticalSameHexContactDetect:()=>false,tacticalSmokeAllEnemyObserversBlocked:()=>false,
  tacticalResolveArmoredContact:s=>{s.detected=true;return {result:'detected'};},tacticalWeakLongRangeNoiseContact:()=>false});
 c.load(HTML,['autoDetectOneSquad']);
 for(const extra of [{},{firedThisTurn:true},{armor:{front:10}}]){
  const s={name:'hidden',hidden:true,detected:false,fighters:[{hp:3}],...extra};c.target=s;
  c.run('autoDetectOneSquad(target)');assert.equal(s.detected,true);assert.equal(s.hidden,false);
 }
 c.load(source('js/map_actions.js'),['mapActionEvalTarget']);
 // Reaches the next stage rather than rejecting discovery (unplaced target).
 const result=c.run("mapActionEvalTarget({id:'smallArms'},0,0)");
 assert.notEqual(result.reason,'не обнаружен');
}
// Shared dispatch guards every caller: last present soldier, last gun crew member,
// commander and repeat/concurrent dispatch cannot bypass source accounting.
{
 const c=context({tacticalReserveRunnerCargo:()=>{c.debits++;return true;},debits:0,
  getFactionCrewWeapons:()=>[{name:'gun',type:'at_gun'}]});
 c.load(source('js/map_actions.js'),['mapActionCrewWeapons','mapActionEligibleAmmoRunners']);
 c.load(source('js/playtest_rules.js'),['tacticalDispatchAmmoRunner']);
 c.run("var f={name:'rifle',hp:3}, other={name:'rifle',hp:3};var s={fighters:[f]};var p={key:'0,0'}, supply={key:'1,0',distance:1};");
 assert.equal(c.run("tacticalDispatchAmmoRunner(s,f,'player',p,supply,'1')"),false);assert.equal(c.debits,0);
 c.run("s.fighters.push(other);s.crewInstances=[{weaponName:'gun',fighterIndices:[0],active:true}]");
 assert.equal(c.run("tacticalDispatchAmmoRunner(s,f,'player',p,supply,'1')"),false);assert.equal(c.debits,0);
 c.run('s.crewInstances[0].fighterIndices=[0,1]');
 assert.equal(c.run("tacticalDispatchAmmoRunner(s,f,'player',p,supply,'1')"),true);assert.equal(c.debits,1);
 assert.equal(c.run("tacticalDispatchAmmoRunner(s,other,'player',p,supply,'1')"),false);assert.equal(c.debits,1);
 c.run('f.isAway=false;f.isCommander=true');
 assert.equal(c.run("tacticalDispatchAmmoRunner(s,f,'player',p,supply,'1')"),false);
}
// Casualties can leave the only surviving crew member away AFTER a legal
// dispatch. Such a crew cannot fire until its runner returns.
{
 const c=context({getFactionCrewWeapons:()=>[{name:'gun',type:'at_gun',effectiveRange:8}],
  mapActionHasSniper:()=>false,mapActionAvailableTargetsForSide:(_i,id)=>id==='ordnance'?[{squad:c.target,idx:0,evaluation:{ok:true,dist:3}}]:[],
  tacticalSquadsDistance:()=>3,getWeaponShotCount:()=>0,getWeaponMaxShots:()=>1,getTacticalCrewWeaponRange:()=>8});
 c.run(source('js/tactical_rules.js'));c.run(source('js/tactical_ai.js'));
 c.target={name:'target',detected:true,hidden:false,fighters:[{hp:3}]};
 c.s={name:'gun',faction:'A.I.R.F.',ammoSmall:0,ammoOrdnance:3,grenades:0,fighters:[{hp:3,isAway:true},{hp:0}],crewInstances:[{weaponName:'gun',active:true,deployed:true,fighterIndices:[0,1]}]};
 c.appData.squads=[c.target];c.appData.map.enemySquads=[c.s];
 assert.equal(c.run('tacticalEnemyAI.selectShot(s,0)'),null);
 c.run('s.fighters[0].isAway=false');assert.equal(c.run('tacticalEnemyAI.selectShot(s,0).id'),'ordnance');
 for(const name of ['attackVehicle','attackAmpulometAtVehicle','attackMolotovCrew','attackSmallArms','attackOrdnance','fireDOTMG']) {
  assert(/!currentSquad\.fighters\[(?:idx|i)\]\.isAway/.test(sliceFunction(HTML,name)),name+' excludes absent crew');
 }
}
// Fury uses raw dice, repeats ones, and does not add an extra damage activation.
{
 const c=context({getFactionWeapons:()=>[],rolls:[1,1,6],rollD6:()=>c.rolls.shift()});
 c.load(source('js/playtest_rules.js'),['tacticalMeleeRollDamage']);
 c.s={flemishFury:true,fighters:[{hp:3}]};
 assert.equal(c.run('tacticalMeleeRollDamage(s)'),3);assert.equal(c.rolls.length,0);
 c.rolls=[1];c.s.flemishFury=false;assert.equal(c.run('tacticalMeleeRollDamage(s)'),0);
 assert(HTML.includes('while (rawDie === 1) rawDie = rollD6()'));
}
// Last Breath runs through the REAL damage/death path, once, for both sides;
// chained vengeance cannot recur, distant/armored targets are not selected.
{
 const c=context({rollD6:()=>6,tacticalSquadsDistance:(a,b)=>Math.abs(a.x-b.x),
  tacticalChangeMorale(){},mapActionSideOfSquad:s=>c.appData.squads.includes(s)?'player':'enemy'});
 c.load(source('js/map_actions.js'),['mapActionTacticalSide','mapActionEnemyAlive','applyDamagePointsToEnemy']);
 c.load(HTML,['tacticalResolveLastBreath']);
 const squad=(name,x,hp,card=false)=>({name,x,fighters:[{name:'rifle',hp,maxHp:3}],effects:card?{lastBreath:true}:{},appliedCards:card?['Длинное дыхание']:[]});
 const a=squad('A',0,1,true),b=squad('B',1,1,true),d=squad('D',4,3);
 c.appData.squads=[a];c.appData.map.enemySquads=[d,b];c.a=a;
 c.run('applyDamagePointsToEnemy(a,1,{damage:0,killed:[],wounded:[],notes:[]})');
 assert.equal(a.isDestroyed,true);assert.equal(b.isDestroyed,true);assert.equal(d.fighters[0].hp,3);
 assert.equal(c.run('tacticalResolveLastBreath(a)'),false);
 assert.equal(c.run('tacticalResolveLastBreath(appData.map.enemySquads[1])'),false);
 // Enemy card retaliates against a living player, ignoring armored units.
 const e=squad('E',0,1,true),p=squad('P',1,3),armor=squad('armor',0,3);armor.armor={front:10};
 c.appData.squads=[armor,p];c.appData.map.enemySquads=[e];c.e=e;
 c.run('applyDamagePointsToEnemy(e,1,{damage:0,killed:[],wounded:[],notes:[]})');
 assert.equal(p.fighters[0].hp,2);assert.equal(armor.fighters[0].hp,3);
 const far=squad('far',4,3),dead=squad('dead',0,0,true);c.appData.squads=[dead];c.appData.map.enemySquads=[far];c.dead=dead;
 assert.equal(c.run('tacticalResolveLastBreath(dead)'),true);assert.equal(far.fighters[0].hp,3);
 // The common morale death path is wired too (fire, melee, ordinary damage).
 assert(sliceFunction(HTML,'tacticalApplyFighterMoraleLoss').includes('tacticalResolveLastBreath(squad)'));
 assert(sliceFunction(HTML,'handleFighterDeath').includes('tacticalResolveLastBreath(squad)'));
}
// HQ rest: v13.207 forbids rest during a rout; suppressed non-routing squads may rest.
// UI uses the same action;
// an unplaced/occupied first HQ no longer hides another available HQ.
{
 const c=context({tacticalSquadsDistance:()=>1,tacticalMoraleScale:()=>100});
 c.load(HTML,['tacticalActionAllowed','tacticalRegroupSquadAtHQ']);
 c.run("var s={name:'inf',faction:'BeVe',opUnitName:'P',isRouting:true,currentMorale:5,suppressed:true,fighters:[{hp:3}]};var h0={name:'unplaced',hq:true,faction:'BeVe',fighters:[{hp:3}]};var h1={name:'HQ',hq:true,faction:'BeVe',opUnitName:'P',fighters:[{hp:3}]};appData.squads=[s,h0,h1];appData.map.grid={'0,0':{squadIds:[0]},'1,0':{squadIds:[2]}};");
 assert.equal(c.run("tacticalActionAllowed(s,'utility',true)"),false);
 assert.equal(c.run("tacticalActionAllowed(s,'regroup',true)"),false);
 assert.equal(c.run('tacticalRegroupSquadAtHQ(0)'),false);
 c.run('s.isRouting=false');
 assert.equal(c.run("tacticalActionAllowed(s,'regroup',true)"),true);
 assert.equal(c.run('tacticalRegroupSquadAtHQ(0)'),true);
 assert.equal(c.run('s.currentMorale'),50);assert.equal(c.run('s.isRouting'),false);assert.equal(c.run('s.suppressed'),false);
 assert.equal(c.actionPoints[0].ap,0);assert.equal(c.run('appData.map.grid["1,0"].squadIds.includes(0)'),true);
 assert.equal(c.run('tacticalRegroupSquadAtHQ(0)'),false,'one rest per turn');
 c.run('currentTurn=2');c.getTacticalActiveSide=()=> 'enemy';assert.equal(c.run('tacticalRegroupSquadAtHQ(0)'),false);
}
// Real catalog naming contains numbers BEFORE nationality, and dynamic effect
// counters must not prevent manual regroup. Preserve fighters and finite ammo.
{
 const c=context({showTacticalBattleResult(){}});
 c.load(HTML,['tacticalMergeSquadTypeKey','tacticalManualRegroupTypeKey','tacticalPostBattleRegroupOptions','regroupTacticalBattleSurvivors']);
 c.run(`function foot(n){return {name:'Пехотное отделение №'+n+' Бельгийцы',faction:'BeVe',tacticalOriginalRosterSize:4,ammoSmall:10,grenades:2,fighters:[0,1,2,3].map(i=>({name:'Боец '+i,weapon:'rifle',maxHp:3,hp:i<n?3:0})),effects:{adrenaline:{used:n===1}}};}
 var a=foot(1),b=foot(2);appData.campaign.opUnits=[{name:'P',squads:[a,b],ammoReserve:{small:100}}];appData.campaign.lastTacticalBattleReport={sides:{player:{squads:[a,b].map(s=>({name:s.name,opUnitName:'P',initial:4,remaining:s.fighters.filter(f=>f.hp>0).length,losses:4-s.fighters.filter(f=>f.hp>0).length}))}}};`);
 assert.equal(c.run('tacticalPostBattleRegroupOptions(appData.campaign.lastTacticalBattleReport).length'),2);
 assert.equal(c.run('regroupTacticalBattleSurvivors(0,0,1)'),true);
 assert.equal(c.run('b.fighters.filter(f=>f.hp>0).length'),3);assert.equal(c.run('a.fighters.filter(f=>f.hp>0).length'),0);
 assert.equal(c.run('b.ammoSmall'),20);assert.equal(c.run('b.grenades'),4);assert.equal(c.run('a.ammoSmall'),0);
 assert.equal(c.run('appData.campaign.opUnits[0].ammoReserve.small'),100);
 assert.equal(c.run('regroupTacticalBattleSurvivors(0,0,1)'),false);
 c.run('b.fighters[0].isAway=true');assert.equal(c.run('tacticalManualRegroupTypeKey(b)'),null);
}
console.log('PASS v13.206: authorized cleanup, visibility, runner crew guards, repeated Fury rerolls, automatic symmetric Last Breath, HQ rest and manual regroup/ammo conservation.');
