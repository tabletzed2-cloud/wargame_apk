'use strict';
// ⚡ v13.140: единая шкала обнаружения (8+ обнаружен, 6–7 шум, ≤5 скрыт),
//    близость как главный фактор, соседний гекс — не автообнаружение.
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML } = require('./extract');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('✓ ' + name); }
  catch (e) { fail++; console.error('✗ ' + name + ' — ' + e.message); }
}
function assert(v, m) { if (!v) throw new Error(m || 'assertion failed'); }
function assertEqual(a, b, m) {
  if (a !== b) throw new Error((m || 'assertion failed') + ` (${JSON.stringify(a)} !== ${JSON.stringify(b)})`);
}

// ─── 1. Статические пороги ───
test('пороги: 8+ обнаружен, 6–7 шум на обеих картах', () => {
  assert(/const OP_DETECT_THRESHOLD = 8;/.test(HTML), 'оперативный порог 8');
  assert(/const OP_NOISE_THRESHOLD = 6;/.test(HTML), 'оперативный шум 6');
  assert(/const TACTICAL_DETECT_THRESHOLD = 8;/.test(HTML), 'тактический порог 8');
  assert(/const TACTICAL_NOISE_THRESHOLD = 6;/.test(HTML), 'тактический шум 6');
  assert(!/result >= 9\b/.test(HTML), 'старый порог 9+ больше не используется');
});

// ─── 2. Местность: положительные моды работают ───
function opModifierSandbox() {
  const s = createSandbox(freshAppData());
  s.run(`
    function log(){}
    function isNightTime(){ return false; }
    function opLineOfSightBlocked(){ return false; }
    function getOpHexDistance(a,b,c,d){ return Math.abs(a-c)+Math.abs(b-d); }
    function opUnitInPlayerSight(){ return false; }
  `);
  for (const fn of ['opDetectionIsArmored', 'getOpDetectionModifier', 'opNearestFoeInfo', 'opDetectionProximityModifier', 'opDetectionModifier']) {
    s.run(sliceFunction(HTML, fn));
  }
  return s;
}

test('местность: открытая трава/дорога/вода теперь дают положительный мод', () => {
  const s = opModifierSandbox();
  const cases = [
    [['grass'], 1], [['road'], 1], [['water'], 2],
    [['forest'], -2], [['trenches'], -3], [['bushes'], -1],
    [['grass', 'forest'], -2]
  ];
  for (const [terrain, expected] of cases) {
    s.sandbox.appData.campaign.opMapGrid['1,1'] = terrain;
    const got = s.evalCtx("getOpDetectionModifier({name:'X', type:'infantry_platoon', col:1, row:1})");
    assertEqual(got, expected, 'местность ' + terrain.join('+'));
  }
});

// ─── 3. Близость на оперативной карте ───
function opDetectionHarness({ night = true, terrain = ['grass'], dist = 1, los = true, moved = false, roll = 5, sameHex = false } = {}) {
  const appData = freshAppData();
  appData.campaign.currentTime = night ? 60 : 840;
  const s = createSandbox(appData);
  s.run(`
    var __roll = ${roll}, __los = ${los};
    function rollD10(){ return __roll; }
    function log(){}
    function isNightTime(){ return ${night}; }
    function getOpHexTypes(){ return ${JSON.stringify(terrain)}; }
    function opLineOfSightBlocked(){ return !__los; }
    function getOpHexDistance(a,b,c,d){ return Math.abs(a-c) + Math.abs(b-d); }
    function opUnitInPlayerSight(){ return false; }
    function addOperationalArtilleryNoise(){}
    appData.campaign.currentTurn = 3;
    appData.campaign.opUnits = [];
    appData.campaign.enemyOpUnits = [];
    appData.campaign.opMapGrid['2,2'] = ${JSON.stringify(terrain)};
    var foeCol = ${sameHex ? 2 : 2 + dist};
    var player = {name:'Наш взвод', type:'infantry_platoon', col:2, row:2,
                  movedThisTurn:${moved}, firedThisTurn:false};
    var foe = {name:'Враг', type:'infantry_platoon', col:foeCol, row:2};
    appData.campaign.opUnits = [player];
    appData.campaign.enemyOpUnits = [foe];
  `);
  for (const fn of ['opDetectionIsArmored', 'opIsIndirectFireUnit', 'getOpDetectionModifier', 'opNearestFoeInfo',
    'opDetectionProximityModifier', 'opDetectionModifier', 'unitCanBeDetected', 'opCheckUnitDetection']) {
    s.run(sliceFunction(HTML, fn));
  }
  return s;
}

test('оперативная карта: близость — главный фактор (соседний гекс ночью в траве)', () => {
  const s = opDetectionHarness({ night: true, terrain: ['grass'], dist: 1, roll: 5 });
  const mod = s.evalCtx('opDetectionModifier(appData.campaign.opUnits[0])');
  // трава +1, близость +3, неподвижность в упор −1, ночь в упор −1 → +2 = 50 %
  assertEqual(mod, 2, 'трава +1, близость +3, неподвижность −1, ночь в упор −1');
  s.run("var out = opCheckUnitDetection(appData.campaign.opUnits[0], {log:false});");
  assertEqual(s.evalCtx('out.result'), 'noise', 'd10=5 + мод 2 = 7 → шум');
});

test('оперативная карта: в упор ночью в лесу — шанс, а не гарантия', () => {
  const s = opDetectionHarness({ night: true, terrain: ['forest'], dist: 1, roll: 3 });
  assertEqual(s.evalCtx('opDetectionModifier(appData.campaign.opUnits[0])'), -1, 'лес −2, близость +3, неподвижность −1, ночь −1');
  s.run("var out = opCheckUnitDetection(appData.campaign.opUnits[0], {log:false});");
  assertEqual(s.evalCtx('out.result'), 'hidden', 'd10=3 + мод −1 = 2 → скрыт');
});

test('оперативная карта: шум 6–7, ниже 6 — скрыт', () => {
  const noise = opDetectionHarness({ night: true, terrain: ['grass'], dist: 1, roll: 5 });
  noise.run("var out = opCheckUnitDetection(appData.campaign.opUnits[0], {log:false});");
  assertEqual(noise.evalCtx('out.result'), 'noise', 'd10=5 + мод 2 = 7 → шум');

  const hidden = opDetectionHarness({ night: true, terrain: ['grass'], dist: 1, roll: 3 });
  hidden.run("var out = opCheckUnitDetection(appData.campaign.opUnits[0], {log:false});");
  assertEqual(hidden.evalCtx('out.result'), 'hidden', 'd10=3 + мод 2 = 5 → скрыт');
});

test('оперативная карта: один гекс — обнаружение без броска', () => {
  const s = opDetectionHarness({ night: true, terrain: ['trenches'], dist: 0, roll: 1, sameHex: true });
  s.run("var out = opCheckUnitDetection(appData.campaign.opUnits[0], {log:false});");
  assertEqual(s.evalCtx('out.result'), 'detected', 'контакт в упор обнаружен без броска');
  assert(s.evalCtx('out.sameHex === true'), 'причина — контакт в одном гексе');
});

test('оперативная карта: без линии видимости остаётся только звук (мод слабее)', () => {
  const los = opDetectionHarness({ night: false, terrain: ['grass'], dist: 1, los: true, roll: 5 });
  const noLos = opDetectionHarness({ night: false, terrain: ['grass'], dist: 1, los: false, roll: 5 });
  const withLos = los.evalCtx('opDetectionModifier(appData.campaign.opUnits[0])');
  const withoutLos = noLos.evalCtx('opDetectionModifier(appData.campaign.opUnits[0])');
  assert(withLos > withoutLos, 'без ЛВ бонус меньше (' + withLos + ' vs ' + withoutLos + ')');
});

// ─── 4. Тактика: соседний гекс — не автообнаружение ───
function tacticalHarness({ distance = 1, los = true, roll = 5, night = true, stationSquad = true } = {}) {
  const appData = freshAppData();
  appData.currentTime = night ? 60 : 840;
  const s = createSandbox(appData);
  s.run(`
    var currentTurn = 1, __roll = ${roll}, __los = ${los};
    function rollD10(){ return __roll; }
    function log(){}
    function isNightTime(){ return ${night}; }
    function tacticalIlluminationActive(){ return false; }
    function getScopedActiveCardsForSquad(){ return []; }
    function tacticalCardDetectionModifier(){ return 0; }
    function isArmoredTacticalSquad(){ return false; }
    function tacticalSmokeAllEnemyObserversBlocked(){ return false; }
    window.tacticalHasLineOfSight = function(){ return __los; };
    var grid = {
      '0,0': {type:'grass', squadIds:[0], enemySquadIds:[]},
      '${distance},0': {type:'grass', squadIds:[], enemySquadIds:[0]}
    };
    var viewer = {name:'Наш отряд', faction:'BeVe', fighters:[{hp:5}], visionRange:6, detected:false};
    var foe = {name:'Враг', faction:'A.I.R.F.', fighters:[{hp:5}], visionRange:6,
               detected:false, hidden:true, movedThisTurn:${stationSquad ? 'false' : 'true'}};
    appData.squads = [viewer];
    appData.map = {grid: grid, enemySquads:[foe]};
    appData.modifiers = [];
  `);
  for (const fn of ['tacticalSquadHexPosition', 'tacticalSameHexContactDetect', 'tacticalObserverProximity',
    'tacticalProximityModifier', 'autoTacticalDetectionMod', 'autoDetectOneSquad']) {
    s.run(sliceFunction(HTML, fn));
  }
  return s;
}

test('тактика: гекс вражеского отряда определяется (раньше был null)', () => {
  const s = tacticalHarness({ distance: 1 });
  const pos = s.evalCtx('tacticalSquadHexPosition(appData.map.enemySquads[0])');
  assert(pos && pos.key === '1,0', 'позиция вражеского отряда находится: ' + JSON.stringify(pos));
});

test('тактика: соседний гекс не даёт автообнаружения', () => {
  const s = tacticalHarness({ distance: 1, los: true, roll: 1 });
  s.run("autoDetectOneSquad(appData.map.enemySquads[0], 'враг');");
  assert(s.evalCtx('appData.map.enemySquads[0].detected === false'), 'низкий бросок — отряд скрыт');
});

test('тактика: соседний гекс повышает вероятность (+3)', () => {
  const s = tacticalHarness({ distance: 1, los: true, roll: 1 });
  const mod = s.evalCtx('autoTacticalDetectionMod(appData.map.enemySquads[0])');
  // близость +3, неподвижность в упор −1, ночь в упор −1
  assertEqual(mod, 1, 'мод за близость с ЛВ');
  const prox = s.evalCtx('tacticalProximityModifier({nearestDist:1, losDist:1})');
  assertEqual(prox, 3, 'таблица близости');
});

test('тактика: без линии видимости бонус за близость слабее', () => {
  const s = tacticalHarness({ distance: 1, los: false });
  const prox = s.evalCtx('tacticalProximityModifier({nearestDist:1, losDist:null})');
  assertEqual(prox, 0, 'только звук: 3 − 3');
});

test('тактика: контакт в одном гексе остаётся автобнаружением', () => {
  const s = tacticalHarness({ distance: 1, los: true, roll: 1 });
  s.run(`
    appData.map.grid['0,0'].enemySquadIds = [0];
    appData.map.grid['1,0'].enemySquadIds = [];
  `);
  s.run("var same = tacticalSameHexContactDetect(appData.map.enemySquads[0]);");
  assert(s.evalCtx('same === true'), 'один гекс — обнаружение без броска');
  assert(s.evalCtx('appData.map.enemySquads[0].detected === true'), 'враг помечен обнаруженным');
});

test('тактика: в лесу ночью обнаружение в упор — вероятностное', () => {
  const s = tacticalHarness({ distance: 1, los: true, roll: 10 });
  s.run("appData.map.grid['0,0'].type = 'forest'; appData.map.grid['1,0'].type = 'forest';");
  s.run("autoDetectOneSquad(appData.map.enemySquads[0], 'враг');");
  // лес −1, близость +3, неподвижность −1, ночь −1 → 0; d10=10 → 10 → обнаружен
  assert(s.evalCtx('appData.map.enemySquads[0].detected === true'), 'на высоком броске в упор в лесу обнаруживается');

  const low = tacticalHarness({ distance: 1, los: true, roll: 5 });
  low.run("appData.map.grid['0,0'].type = 'forest'; appData.map.grid['1,0'].type = 'forest';");
  low.run("autoDetectOneSquad(appData.map.enemySquads[0], 'враг');");
  assert(low.evalCtx('appData.map.enemySquads[0].detected === false'), 'ночью в лесу гарантии нет');
});

console.log(`\nИтог v13.140 (обнаружение): PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
