'use strict';
// ⚡ v13.141: осветительная ракета — немедленная повторная проверка обнаружения,
//    сглаженные модификаторы близости (1 гекс +3, 2 +2, 3 +1, 4–5 0, 6+ −2).
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

// ─── 1. Таблица близости ───
test('близость: 1→+3, 2→+2, 3→+1, 4–5→0, 6+→−2 на обеих картах', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    function log(){}
    function getOpHexTypes(){ return ['grass']; }
    function isNightTime(){ return false; }
    function opDetectionIsArmored(){ return false; }
    function opLineOfSightBlocked(){ return false; }
    function getOpHexDistance(){ return 99; }
    function tacticalIlluminationActive(){ return false; }
  `);
  for (const fn of ['opDetectionProximityModifier', 'tacticalProximityModifier', 'getOpDetectionModifier']) {
    s.run(sliceFunction(HTML, fn));
  }
  const table = [[1, 3], [2, 2], [3, 1], [4, 0], [5, 0], [6, -2], [9, -2]];
  for (const [dist, expected] of table) {
    assertEqual(s.evalCtx(`opDetectionProximityModifier(${dist}, ${dist})`), expected, 'оперативно, дистанция ' + dist);
    assertEqual(s.evalCtx(`tacticalProximityModifier({nearestDist:${dist}, losDist:${dist}})`), expected, 'тактика, дистанция ' + dist);
  }
  // без линии видимости — только звук (на 3 слабее, но не ниже −5)
  assertEqual(s.evalCtx('opDetectionProximityModifier(null, 1)'), 0, 'звук в упор без ЛВ');
  assertEqual(s.evalCtx('tacticalProximityModifier({nearestDist:9, losDist:null})'), -5, 'звук далеко без ЛВ');
});

// ─── 2. Ракета: немедленная проверка обнаружения ───
function flareHarness({ night = true, distance = 2, los = true, roll = 6, flareStock = 1 } = {}) {
  const appData = freshAppData();
  appData.currentTime = night ? 60 : 840;
  const s = createSandbox(appData);
  s.run(`
    var currentTurn = 1, currentSquadIndex = 0, __roll = ${roll}, __los = ${los};
    function rollD10(){ return __roll; }
    function log(){}
    function isNightTime(){ return ${night}; }
    function tacticalIlluminationActive(t){ return appData.flareActive === true; }
    function getScopedActiveCardsForSquad(){ return []; }
    function tacticalCardDetectionModifier(){ return 0; }
    function isArmoredTacticalSquad(){ return false; }
    function tacticalSmokeAllEnemyObserversBlocked(){ return false; }
    function tacticalActionAllowed(){ return true; }
    function spendAP(){ return true; }
    function redrawMap(){}
    function onlinePushBattles(){}
    window.tacticalHasLineOfSight = function(){ return __los; };
    function getHexNeighbors(){ return []; }
    appData.flareActive = false;
    appData.modifiers = [];
    appData.map = {
      grid: {
        '0,0': {type:'grass', squadIds:[0], enemySquadIds:[]},
        '${distance},0': {type:'grass', squadIds:[], enemySquadIds:[0]}
      },
      enemySquads: [
        {name:'Враг близко', faction:'A.I.R.F.', fighters:[{hp:5}], visionRange:6, detected:false}
      ]
    };
    appData.squads = [
      {name:'Наш отряд', faction:'BeVe', fighters:[{hp:5}], visionRange:6, flares:${flareStock}, detected:false}
    ];
    currentSquad = appData.squads[0];
  `);
  for (const fn of ['tacticalSquadHexPosition', 'tacticalSameHexContactDetect', 'tacticalObserverProximity',
    'tacticalProximityModifier', 'autoTacticalDetectionMod', 'autoDetectOneSquad',
    'tacticalIlluminationObserversFor', 'tacticalSquadVisibleInIllumination',
    'tacticalFlareRecheckDetection', 'createTacticalFlareEvent', 'fireFlare']) {
    s.run(sliceFunction(HTML, fn));
  }
  return s;
}

test('ракета: в момент пуска сразу проверяются освещённые цели', () => {
  const s = flareHarness({ night: true, distance: 2, roll: 6 });
  s.run('fireFlare();');
  assert(s.evalCtx('appData.flareActive === true'), 'ракета активирована');
  assert(s.evalCtx('appData.squads[0].flares === 0'), 'ракета израсходована');
  const detected = s.evalCtx('appData.map.enemySquads[0].detected');
  // близость +2, неподвижность −2, свет снимает ночной штраф → 0; d10=6 → 6 (шум);
  // проверяем именно факт немедленного броска, а не конкретный исход
  assert(s.evalCtx('appData.map.enemySquads[0].noiseMarker === true || appData.map.enemySquads[0].detected === true'),
    'немедленная проверка выполнена (шум или обнаружение), detected=' + detected);
});

test('ракета: без ракеты цель в тех же условиях не проверяется', () => {
  const s = flareHarness({ night: true, distance: 2, roll: 6 });
  const before = s.evalCtx('JSON.stringify({d: appData.map.enemySquads[0].detected, n: !!appData.map.enemySquads[0].noiseMarker})');
  assertEqual(before, '{"d":false,"n":false}', 'до пуска ракеты отметок нет');
});

test('ракета: свет отменяет ночной штраф при немедленной проверке', () => {
  const night = flareHarness({ night: true, distance: 2, roll: 5 });
  night.run('fireFlare();');
  const litMod = night.evalCtx('autoTacticalDetectionMod(appData.map.enemySquads[0])');
  const day = flareHarness({ night: false, distance: 2, roll: 5 });
  const dayMod = day.evalCtx('autoTacticalDetectionMod(appData.map.enemySquads[0])');
  assertEqual(litMod, dayMod, 'под ракетой мод такой же, как днём');
  assert(litMod > dayMod - 1, 'ночного штрафа нет');
});

test('ракета: цели вне зоны видимости не проверяются', () => {
  const s = flareHarness({ night: true, distance: 2, roll: 10, los: false });
  s.run('fireFlare();');
  assert(s.evalCtx('appData.map.enemySquads[0].detected === false'), 'без линии видимости ракета не раскрывает цель');
  assert(s.evalCtx('!appData.map.enemySquads[0].noiseMarker'), 'и шум не ставится');
});

test('ракета: цель дальше обзора наблюдателя не проверяется', () => {
  const s = flareHarness({ night: true, distance: 9, roll: 10 });
  s.run('appData.squads[0].visionRange = 6;');
  s.run('fireFlare();');
  assert(s.evalCtx('appData.map.enemySquads[0].detected === false'), 'дальше обзора — без проверки');
});

test('ракета: уже обнаруженная цель не прячется обратно', () => {
  const s = flareHarness({ night: true, distance: 2, roll: 1 });
  s.run('appData.map.enemySquads[0].detected = true;');
  s.run('fireFlare();');
  assert(s.evalCtx('appData.map.enemySquads[0].detected === true'), 'обнаруженная цель остаётся обнаруженной');
});

test('ракета противника тоже запускает немедленную проверку своих целей', () => {
  const s = flareHarness({ night: true, distance: 2, roll: 8 });
  s.run('tacticalFlareRecheckDetection("enemy");');
  // освещён наш отряд, наблюдатель — вражеский
  assert(s.evalCtx('appData.squads[0].detected === true || appData.squads[0].noiseMarker === true'),
    'наши отряды перепроверены ракетой противника');
});

console.log(`\nИтог v13.141 (ракета + близость): PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
