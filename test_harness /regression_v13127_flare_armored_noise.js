'use strict';
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');
const fs = require('fs');
const path = require('path');
const online = fs.readFileSync(path.join(ROOT, 'js/online_battles.js'), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('✓ ' + name); } catch (e) { fail++; console.error('✗ ' + name + ' — ' + e.message); } }
function assert(v, message) { if (!v) throw new Error(message || 'assertion failed'); }
function tacticalHarness({distance = 3, los = false} = {}) {
  const s = createSandbox(freshAppData());
  for (const fn of ['isArmoredTacticalSquad', 'tacticalIlluminationActive', 'tacticalArmoredContact', 'tacticalArmoredNoiseSourceKey', 'tacticalClearArmoredNoise', 'tacticalSetArmoredNoise', 'tacticalResolveArmoredContact', 'autoDetectOneSquad']) {
    s.run(sliceFunction(HTML, fn));
  }
  s.run(`
    var currentTurn=1, lineIsClear=${los};
    function hexGridDistance(a,b,c,d){return Math.abs(a-c)+Math.abs(b-d);}
    function getBattleSquadHex(grid,index,enemy){
      for (const key in grid) { const ids=enemy?grid[key].enemySquadIds:grid[key].squadIds; if(ids&&ids.includes(index)){const p=key.split(',').map(Number);return {key,col:p[0],row:p[1]};} }
      return null;
    }
    function getHexNeighbors(){return ['2,1','3,1','4,1','2,2','3,2','4,2'];}
    function isNightTime(){return false;}
    function tacticalSameHexContactDetect(){return false;}
    function tacticalSmokeAllEnemyObserversBlocked(){return false;}
    function log(){}
    window.tacticalHasLineOfSight=function(){return lineIsClear;};
    var viewer={name:'Пехота',fighters:[{hp:3}],visionRange:6};
    var tank={name:'Танк №1',armor:'heavy',hidden:true,detected:false,fighters:[{hp:3}]};
    var grid={'0,0':{squadIds:[0],enemySquadIds:[]},'${distance},0':{squadIds:[],enemySquadIds:[0]}};
    appData.squads=[viewer]; appData.map={grid,enemySquads:[tank],tacticalNoiseMarkers:[]};
    autoDetectOneSquad(tank,'enemy');
  `);
  return s;
}

test('тактическая броня в прямой видимости обнаружена, скрытый флаг сброшен', () => {
  const s = tacticalHarness({distance:3, los:true});
  assert(s.evalCtx('tank.detected === true && tank.hidden === false'), 'direct LOS must reveal armor');
  assert(s.evalCtx('appData.map.tacticalNoiseMarkers.length === 0'), 'direct visibility must not leave noise decoys');
});

test('тактическая броня вне прямой видимости в радиусе 4 даёт ровно три смежных маркера', () => {
  const s = tacticalHarness({distance:3, los:false});
  assert(s.evalCtx('tank.detected === false && tank.noiseMarker === true'), 'vehicle identity/position remains hidden');
  assert(s.evalCtx('appData.map.tacticalNoiseMarkers.length === 3'), 'three adjacent noise markers are created');
  assert(s.evalCtx("appData.map.tacticalNoiseMarkers.every(m => m.viewerSide === 'player' && m.label === 'Шум')"), 'only the opposing viewer receives anonymous markers');
  assert(s.evalCtx("appData.map.tacticalNoiseMarkers.every(m => !(m.col === 3 && m.row === 0))"), 'exact tank hex is not disclosed');
});

test('тактическая броня дальше радиуса 4 без линии видимости не раскрывается и не создаёт шум', () => {
  const s = tacticalHarness({distance:5, los:false});
  assert(s.evalCtx('tank.detected === false && appData.map.tacticalNoiseMarkers.length === 0'), 'no detection/noise beyond range four');
});

test('оперативная броня игнорирует старое скрытие и создаёт decoy noise только вне прямой видимости', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    var currentTurn=3, losClear=false, generated=[];
    function isNightTime(){return false;}
    function getOpHexDistance(a,b,c,d){return Math.abs(a-c)+Math.abs(b-d);}
    function opLineOfSightBlocked(){return !losClear;}
    function addOperationalArtilleryNoise(unit,key,viewer){generated.push({key,viewer});return [1,2,3];}
    function log(){}
    appData.campaign={currentTurn:3,online:false,opUnits:[],enemyOpUnits:[],opNoiseMarkers:[]};
    var spotter={name:'Пехота',col:0,row:0};
    var armor={name:'Танк',type:'tank_platoon',col:3,row:0,hidden:true,stealthMove:true};
    appData.campaign.opUnits=[spotter]; appData.campaign.enemyOpUnits=[armor];
  `);
  s.run(sliceFunction(HTML, 'opDetectionIsArmored'));
  s.run(sliceFunction(HTML, 'opCheckUnitDetection'));
  s.run('var outcome=opCheckUnitDetection(armor,{log:false});');
  assert(s.evalCtx("outcome.result === 'noise' && armor.hidden === false && armor.stealthMove === false"), 'old stealth state is removed and armor remains anonymous');
  assert(s.evalCtx("generated.length === 1 && generated[0].viewer === 'player'"), 'noise goes to the opposing viewer');
  s.run('armor.col=5; armor.detected=true; armor.noiseMarker=true; armor.fireDetectionResolvedTurn=0; var distant=opCheckUnitDetection(armor,{log:false});');
  assert(s.evalCtx("distant.result === 'hidden' && armor.detected === false && armor.noiseMarker === false"), 'no exact contact appears beyond four operational hexes');
  s.run('armor.col=3; losClear=true; armor.fireDetectionResolvedTurn=0; var direct=opCheckUnitDetection(armor,{log:false});');
  assert(s.evalCtx("direct.result === 'detected' && armor.detected === true && generated.length === 1"), 'operational armor in direct LOS is revealed without stale decoy markers');
});

test('flare restores daytime accuracy for both sides during the tactical round only', () => {
  const s = createSandbox(freshAppData());
  for (const fn of ['tacticalIlluminationActive', 'getNightModifier', 'getScopedActiveModifiersForSquad']) s.run(sliceFunction(HTML, fn));
  s.run(`var currentTurn=4; function isNightTime(){return true;}
    function getBicycleBlitzFlankBonus(){return 0;} function getScopedActiveCardsForSquad(){return [];}
    appData.currentBattleId=null; appData.squads=[{name:'отряд'}];
    appData.map={grid:{'0,0':{}},illuminationFlare:{id:'flare-test',turn:4,expiresTurn:5}};
    appData.flareEventId='flare-test'; appData.flareActive=true; appData.flareTurn=4; appData.flareExpiresTurn=5;
    appData.modifiers=[{name:'Ночь',active:true,accuracyMod:-1}];`);
  assert(s.evalCtx('getNightModifier() === 1'), 'flare cancels tactical night accuracy penalty');
  assert(s.evalCtx("getScopedActiveModifiersForSquad({}).find(m => m.name === 'Ночь').accuracyMod === 0"), 'global tactical night accuracy modifier is also canceled');
  s.run(`appData.squads=[]; appData.map={grid:{}};`);
  assert(s.evalCtx('getNightModifier() === 0.5'), 'tactical flare does not leak into operational fire after leaving battle');
});

test('flare and tactical noise are transmitted in online battle snapshots and flare receipt is announced', () => {
  assert(online.includes('illuminationFlare: tacticalMap.illuminationFlare'), 'snapshot carries the local flare event');
  assert(online.includes('noiseMarkers: (Array.isArray(tacticalMap.tacticalNoiseMarkers)'), 'snapshot carries only opponent-facing tactical noise');
  assert(online.includes('tacticalMap.remoteTacticalNoiseMarkers = nextMarkers'), 'opponent noise markers are merged into the receiving map');
  assert(online.includes('Противник запустил осветительную ракету'), 'receiving player is notified about a flare');
});

console.log(`Итог v13.127: PASS ${pass} · FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
