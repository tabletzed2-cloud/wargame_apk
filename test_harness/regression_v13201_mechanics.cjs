'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {HTML,ROOT,sliceFunction}=require('./extract');
const rules=fs.readFileSync(path.join(ROOT,'js/tactical_rules.js'),'utf8');
const placement=fs.readFileSync(path.join(ROOT,'js/placement.js'),'utf8');
const online=fs.readFileSync(path.join(ROOT,'js/online_battles.js'),'utf8');
const ai=fs.readFileSync(path.join(ROOT,'js/operational_ai.js'),'utf8');
const ctx=vm.createContext({console,appData:{campaign:{currentTurn:7,opUnits:[],enemyOpUnits:[]},squads:[],map:{grid:{}}},
  TACTICAL_MAP_SIZE:20, PLACEMENT_STRIP_DEPTH:2, isNightTime:()=>false,tacticalIlluminationActive:()=>false,
  PLACEMENT_DIRS:['E','SE','SW','W','NW','NE'],placementMapSize:()=>20,placementBicycleBlitzEligible:()=>false,
  opDirectionBetween:(c,r,x,y)=>x<c?'W':x>c?'E':y<r?'NW':'SE',
  tacticalHasLineOfSight:()=>true,tacticalSmokeBlocksSight:()=>false,
  vehicleFacingDir:s=>s.facing||'e',vehicleFamilyFor:()=>null,
  getFactionCrewWeapons:()=>[{name:'rear',type:'mg'}],vehicleWeaponSectorSpec:(s,n,t,ci)=>({role:ci.sectorRole}),
  hexGridDistance:(c,r,x,y)=>{const q=(c,r)=>c-(r-(r&1))/2;return Math.max(Math.abs(q(c,r)-q(x,y)),Math.abs(r-y),Math.abs(q(c,r)+r-q(x,y)-y));},
  tacticalSquadHexPosition:s=>s.pos||null,isStaticOpUnit:u=>u.type==='dots',isArmoredUnit:()=>false});
vm.runInContext(rules,ctx);
const load=(source,names)=>names.forEach(name=>vm.runInContext(sliceFunction(source,name),ctx));
const run=code=>vm.runInContext(code,ctx),plain=x=>JSON.parse(JSON.stringify(x));
load(placement,['placementZoneKeys','resolveBattleEntry','initBattlePlacement','placementSideAllowed']);
load(HTML,['cardDraftBonusLimit','bonusCardSelectionLimit','hasCardNamed','cardSelectionNeedsDebuff']);
// Every forbidden edge ring, not just the attacker's entry strip.
for(let r=0;r<20;r++)for(let c=0;c<20;c++){
  ctx.key=`${c},${r}`;
  assert.equal(run("placementSideAllowed({placement:{attackerSide:'enemy',entryDir:'W'},playerSquads:[]},'player',key,{})"),Math.min(c,r,19-c,19-r)>3);
}
assert.equal(run("placementSideAllowed({hexKey:'4,4',placement:{attackerSide:'enemy',entryDir:'W'}},'player','0,0',{fixedTacticalPosition:{key:'0,0',hexKey:'4,4'}})"),true);
assert.equal(run("placementSideAllowed({placement:{attackerSide:'enemy',entryDir:'W'}},'player','0,0',{placementArrivalDir:'W'})"),true);
// Current-turn movement is required on both sides; old previous coordinates do not qualify.
run("var a={col:4,row:4,prevCol:3,prevRow:4,opLastMoveTurn:7}, b={col:4,row:4,prevCol:5,prevRow:4,opLastMoveTurn:7};");
assert.equal(run("tacticalMeetingEntry([a],[b],'4,4',7,()=>0).firstSide"),'player');
assert.equal(run("tacticalMeetingEntry([a],[b],'4,4',7,()=>1).firstSide"),'enemy');
assert.equal(run("tacticalMeetingEntry([a],[{...b,opLastMoveTurn:6}],'4,4',7)"),null);
run("var entry=resolveBattleEntry([a],[b],'4,4',{entry:{attackerSide:'enemy'}}), battle={id:2,hexKey:'4,4',tacticalMap:{},playerSquads:[]};initBattlePlacement(battle,entry.attackerSide,entry.entryDir,entry.source,entry);");
assert.equal(run('battle.placement.battleMode'),'meeting');
assert.equal(run("placementSideAllowed(battle,'player','0,10',{})"),true);
assert.equal(run("placementSideAllowed(battle,'enemy','19,10',{})"),true);
assert.equal(run("placementSideAllowed(battle,'enemy','0,10',{})"),false);
const mirror=run("resolveBattleEntry([],[],'4,4',{mirrorOf:{attacker:'me',entryDir:'W',battleMode:'meeting',entryDirs:{player:'W',enemy:'E'},firstSide:'player'}})");
assert.deepEqual(plain(mirror.entryDirs),{player:'E',enemy:'W'});assert.equal(mirror.firstSide,'enemy');
// A single elected online authority carries absolute first role and both entry directions.
ctx.ONLINE={role:'p1'};ctx.onlineBattleIsLive=()=>false;ctx.onlineReanchorBattleToHex=()=>false;
load(online,['onlineBattleAuthority','onlineReconcileBattleAuthority']);
run("battle.placement.firstSide='enemy';var authority=onlineBattleAuthority(battle);");
assert.equal(run('authority.firstRole'),'p2');
run("ONLINE.role='p2';var otherBattle={id:9,hexKey:'4,4',placement:{attackerSide:'player',entryDir:'E'},tacticalMap:{}};onlineReconcileBattleAuthority(otherBattle,{authority},'p1');");
assert.equal(run('otherBattle.activeSide'),'player');
assert.deepEqual(plain(run('otherBattle.placement.entryDirs')),{player:'E',enemy:'W'});
run("otherBattle.phaseRevision=1;otherBattle.activeSide='enemy';onlineReconcileBattleAuthority(otherBattle,{authority},'p1');");
assert.equal(run('otherBattle.activeSide'),'enemy','resync must not reroll or overwrite a later phase');
assert.equal(run("cardDraftBonusLimit([], {type:'engineer_platoon'})"),3);
assert.equal(run("cardDraftBonusLimit(['Комиссар'], {name:'Сапёрный взвод'})"),4);
assert.equal(run("cardDraftBonusLimit(['Торговый дух'], {name:'Сапёрный взвод'})"),5);
assert.equal(run("cardDraftBonusLimit([], {type:'infantry_platoon'})"),2);
assert.equal(run("cardSelectionNeedsDebuff(2,[],{type:'engineer_platoon'})"),false);
assert.equal(run("cardSelectionNeedsDebuff(3,[],{type:'engineer_platoon'})"),true);
load(ai,['operationalAIRole','operationalAIRoleCanAdvance','operationalAICardScore']);
assert.equal(run("operationalAIRole({name:'Разведывательный взвод',type:'hq'})"),'recon');
assert.equal(run("operationalAIRole({name:'Сапёрный взвод'})"),'sapper');
assert.equal(run("operationalAIRoleCanAdvance('sapper')"),true);
assert.ok(run("operationalAICardScore({name:'Термитный заряд'},{name:'Сапёрный взвод',squads:[]}) > operationalAICardScore({name:'Ранцевый огнемёт РОКС-3'},{name:'Сапёрный взвод',squads:[]})"));
// Aim footprint: seven by day; two wings behind target at night, never a line.
run("for(let r=0;r<20;r++)for(let c=0;c<20;c++)appData.map.grid[c+','+r]={};var tank={armor:{turret:20},facing:'e',fighters:[{hp:1}],pos:{key:'5,10',col:5,row:10},vehicleAim:{hexKey:'10,10',fromKey:'5,10'}};");
assert.equal(run("tacticalAimZoneKeys(tank,'5,10',false,appData.map.grid,20).length"),7);
assert.deepEqual(plain(run("tacticalAimZoneKeys(tank,'5,10',true,appData.map.grid,20)")),['10,10','10,9','10,11']);
assert.equal(run("tacticalAimZoneKeys(tank,'6,10',false,appData.map.grid,20).length"),0);
for(const [key,night,expected] of [['10,10',false,true],['11,10',false,false],['2,10',false,false],['5,12',false,true],['5,13',false,false],['8,10',true,true],['9,10',true,false],['5,12',true,false]]){
 ctx.key=key;ctx.night=night;assert.equal(run('tacticalObserverCanSeeHex({...tank,vehicleAim:null},tank.pos.key,key,night,appData.map)'),expected,key);
}
run("tank.crewInstances=[{weaponName:'rear',sectorRole:'rear',fighterIndices:[0]}];");
assert.equal(run("tacticalObserverCanSeeHex(tank,'5,10','0,10',false,appData.map)"),true);
assert.equal(run("tacticalObserverCanSeeHex(tank,'5,10','2,10',true,appData.map)"),true);
assert.equal(run("tacticalObserverCanSeeHex(tank,'5,10','1,10',true,appData.map)"),false);
for(const role of ['bow','rear','parallel','coax']){ctx.role=role;assert.equal(run("tacticalAimedWeaponBonus(tank,{sectorRole:role},{type:'mg'},'10,10')"),role==='coax'?1:0);}
assert.equal(run("tacticalAimedWeaponBonus(tank,{sectorRole:'turret'},{type:'tank_gun'},'10,10')"),1);
ctx.tacticalHasLineOfSight=()=>false;
assert.equal(run("tacticalAimedWeaponBonus(tank,{sectorRole:'coax'},{type:'mg'},'10,10')"),0);
console.log('PASS v13.201: edge rings, meeting freshness/mirroring/authority, engineer cards, directional sight and weapon-scoped aim.');
// First-turn offline scheduling follows the persisted draw, not the transport role.
ctx.window=ctx;ctx.tacticalEnemyAI={schedulePhase:()=>true};
load(placement,['placementScheduleOfflineAI']);
run("battle.cardsChosen=true;battle.placement.phase='done';battle.activeSide='enemy';");
assert.equal(run('placementScheduleOfflineAI(battle)'),true);
run("battle.activeSide='player';");assert.equal(run('placementScheduleOfflineAI(battle)'),false);
// Three actual AI picks, prioritizing thermite and ROKS, with idempotent re-entry.
ctx.isOfflineCampaignAIEnabled=()=>true;ctx.getUnitCardFactionContext=()=>({faction:'A.I.R.F.'});
ctx.collectCardLibraryForContext=()=>[{name:'Дополнительный паёк'},{name:'Термитный заряд'},{name:'Ранцевый огнемёт РОКС-3'},{name:'Двойной БК'}];
ctx.isCardAvailableToUnit=()=>true;ctx.isCardSelectableOpUnit=()=>true;ctx.log=()=>{};ctx.saveData=()=>{};
let applied=[];ctx.applyCardToPlatoon=card=>applied.push(card.name);
load(ai,['operationalAICardEligible','operationalAIEnsureEnemyCards']);
run("appData.campaign.enemyOpUnits=[{name:'Сапёрный взвод',type:'engineer_platoon',squads:[{name:'Сапёрное отделение',fighters:[{hp:5}]}]}];operationalAIEnsureEnemyCards();");
assert.deepEqual(applied,['Термитный заряд','Ранцевый огнемёт РОКС-3','Двойной БК']);
run('operationalAIEnsureEnemyCards()');assert.equal(applied.length,3);
console.log('PASS v13.201: meeting AI initiative and three prioritized, idempotent engineer card applications.');
