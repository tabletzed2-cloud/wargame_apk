'use strict';
// ⚡ v13.137: три правки после playtest'а.
//   1. «Спешиться»/«Сесть» — у велосипедистов И мотоциклов; обычной пехоте
//      без такой функции кнопок нет (переопределяет v13.136 (п.9)).
//   2. Отряд, потерявший дух, отходит к штабу ИЛИ к краю карты и остаётся в
//      бою; если путь к отходу перекрыт — отряд СДАЁТСЯ: появляется маркер
//      «🏳️» (surrenderedFriendly/Enemy), но отряд НЕ исчезает с карты
//      (переопределяет v13.136 (п.7) «перекрытый путь — ожидание»).
//   3. Без патронов кнопки стрельбы и подавления недоступны (disabled/скрыты).
const assert = require('assert');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML } = require('./extract');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + ': ' + e.message); process.exitCode = 1; }
}

const mapActions = fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8');
const operationalUi = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const hexmaps = fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8');
const dataJs = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');

// ================= п.1: спешивание велосипедов и мотоциклов =================

ok('п.1 uxBikeLike: велосипед и мотоцикл — да; пехота/техника — нет', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'uxBikeLike'));
  assert.strictEqual(s.evalCtx('uxBikeLike({ mobility: "bicycle" })'), true);
  assert.strictEqual(s.evalCtx('uxBikeLike({ mobility: "motorcycle" })'), true, 'мотоциклы спешиваются');
  assert.strictEqual(s.evalCtx('uxBikeLike({ mobility: "foot" })'), false, 'пехота без функции');
  assert.strictEqual(s.evalCtx('uxBikeLike({ mobility: "vehicle" })'), false);
  assert.strictEqual(s.evalCtx('uxBikeLike(null)'), false);
});

ok('п.1 canIssueSpecial: dismount/remount — велосипедистам и мотоциклам', () => {
  assert.ok(/if \(action === 'dismount'\) return \(unit\.mobility === 'bicycle' \|\| unit\.mobility === 'motorcycle'\) && !unit\.dismounted;/.test(operationalUi),
    'dismount — bicycle|motorcycle верхом');
  assert.ok(/if \(action === 'remount'\) return !!unit\.dismounted && \(unit\.dismountedFromMobility === 'bicycle' \|\| unit\.dismountedFromMobility === 'motorcycle' \|\| unit\.mobility === 'bicycle' \|\| unit\.mobility === 'motorcycle'\);/.test(operationalUi),
    'remount — спешенный bicycle|motorcycle');
});

ok('п.1 unitCanExecuteOrderType + unitDismountOptionAllowed: мотоцикл как велосипед', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'unitCanExecuteOrderType'));
  s.run(sliceFunction(HTML, 'unitDismountOptionAllowed'));
  s.run(`var uMoto = { mobility: 'motorcycle', dismounted: false };
         var uMotoDism = { mobility: 'foot', dismounted: true, dismountedFromMobility: 'motorcycle' };
         var uFoot = { mobility: 'foot', dismounted: false };`);
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uMoto, 'dismount')"), true);
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uMotoDism, 'remount')"), true);
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uFoot, 'dismount')"), false, 'пехота не спешивается');
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uFoot, 'remount')"), false);
  assert.strictEqual(s.evalCtx("unitDismountOptionAllowed({ mobility: 'motorcycle' }, 'dismount')"), true);
  assert.strictEqual(s.evalCtx("unitDismountOptionAllowed({ mobility: 'motorcycle', dismounted: true, dismountedFromMobility: 'motorcycle' }, 'remount')"), true);
  assert.strictEqual(s.evalCtx("unitDismountOptionAllowed({ mobility: 'foot' }, 'dismount')"), false);
});

ok('п.1 updateDismountPanel/toggleDismount: мотоциклы получают панель, пехота — нет', () => {
  assert.ok(/unit\.mobility === 'bicycle' \|\| unit\.mobility === 'motorcycle' \|\| unit\.dismountedFromMobility === 'bicycle' \|\| unit\.dismountedFromMobility === 'motorcycle'/.test(HTML),
    'updateDismountPanel принимает мотоциклы');
  assert.ok(/Спешивание доступно только велосипедистам и мотоциклистам/.test(HTML),
    'toggleDismount отказывает пехоте с понятным сообщением');
});

ok('п.1 тактика: кнопки и перенос спешивания в бой для мотоциклов', () => {
  assert.ok(/\(currentSquad\.mobilityType === 'bicycle' \|\| currentSquad\.mobilityType === 'motorcycle'\) && !currentSquad\.dismounted/.test(HTML),
    'кнопка «Спешиться» во вкладке «Ход»');
  assert.ok(/\(isBicycleTacticalSquad\(squad\) \|\| \(typeof isMotorcycleTacticalSquad === 'function' && isMotorcycleTacticalSquad\(squad\)\)\) && !squad\.dismounted/.test(mapActions),
    'кнопки в map-панели и быстром меню');
  assert.ok(/!\(isBicycleTacticalSquad\(currentSquad\) \|\| isMotorcycleTacticalSquad\(currentSquad\)\)/.test(HTML),
    'dismountBicycle/remountBicycle принимают мотоциклы');
  assert.ok(/opUnit\.type === 'motorcycle_platoon' \|\| opUnit\.mobility === 'motorcycle' \|\| isMotorcycleTacticalSquad\(battleSquad\)/.test(HTML),
    'tacticalApplyOperationalMobilityToBattleSquad переносит dismounted мотоциклов');
});

// ================= п.2: сдача с маркером, без исчезновения =================

function surrenderFixture(side) {
  const s = createSandbox(freshAppData());
  s.run('var currentTurn = 1; function log() {} function saveData() {}' +
    'function updateTacticalTurnUI() {} function updateUI() {} function redrawMap() {}' +
    'function tacticalClearMeleeEngagement() {} function tacticalIsHeadquartersSquad() { return false; }' +
    'function tacticalApplyHeadquartersLossMoralePenalty() { return false; }' +
    'function tacticalSquadHasStubbornCard() { return false; }' +
    'function tacticalHasLiveHeadquartersFor() { return false; }' +
    'function recordTacticalAwardEnemyDefeat() {}');
  s.run(sliceFunction(HTML, 'tacticalPlaceSurrenderMarker'));
  s.run(sliceFunction(HTML, 'tacticalSurrenderUnit'));
  if (side === 'enemy') {
    s.run(`appData.map = { grid: { '5,5': { squadIds: [], enemySquadIds: [0], markers: [] } }, enemySquads: [{ name: 'В', fighters: [{ hp: 3 }], hidden: true, hexPos: [5,5] }] };`);
  } else {
    s.run(`appData.map = { grid: { '3,3': { squadIds: [0], enemySquadIds: [], markers: [] } }, enemySquads: [] };
           appData.squads = [{ name: 'О', fighters: [{ hp: 3 }], hexPos: [3,3] }];`);
  }
  return s;
}

ok('п.2 tacticalSurrenderUnit: свой отряд сдаётся, остаётся на карте с маркером', () => {
  const s = surrenderFixture('player');
  s.run(`tacticalSurrenderUnit(appData.squads[0], 'player', 0, 'retreat_blocked');`);
  assert.strictEqual(s.evalCtx('appData.squads[0].isSurrendered'), true, 'флаг сдачи установлен');
  assert.strictEqual(s.evalCtx('appData.squads[0].status'), 'surrendered');
  assert.strictEqual(s.evalCtx('appData.squads[0].isRouting'), false);
  assert.strictEqual(s.evalCtx('appData.squads.length'), 1, 'отряд НЕ удалён из списка');
  assert.strictEqual(s.evalCtx("appData.map.grid['3,3'].squadIds.includes(0)"), true,
    'отряд НЕ исчез с карты (squadIds на месте)');
  assert.strictEqual(s.evalCtx("appData.map.grid['3,3'].markers.includes('surrenderedFriendly')"), true,
    'маркер «🏳️» появился');
});

ok('п.2 tacticalSurrenderUnit: враг сдаётся с маркером и становится видимым', () => {
  const s = surrenderFixture('enemy');
  s.run(`tacticalSurrenderUnit(appData.map.enemySquads[0], 'enemy', 0, 'numerical_superiority');`);
  assert.strictEqual(s.evalCtx('appData.map.enemySquads[0].isSurrendered'), true);
  assert.strictEqual(s.evalCtx("appData.map.grid['5,5'].enemySquadIds.includes(0)"), true, 'враг остался на карте');
  assert.strictEqual(s.evalCtx("appData.map.grid['5,5'].markers.includes('surrenderedEnemy')"), true, 'маркер сдачи врага');
  assert.strictEqual(s.evalCtx('appData.map.enemySquads[0].detected'), true, 'сдавшийся враг виден');
  assert.strictEqual(s.evalCtx('appData.map.enemySquads[0].hidden'), false);
});

ok('п.2 tacticalSurrenderUnit: без tacticalRemoveUnitFromMap, маркер через tacticalPlaceSurrenderMarker', () => {
  const body = sliceFunction(HTML, 'tacticalSurrenderUnit');
  assert.ok(!/tacticalRemoveUnitFromMap/.test(body), 'удаление с карты убрано');
  assert.ok(/tacticalPlaceSurrenderMarker\(squad, side\)/.test(body), 'маркер ставится');
});

ok('п.2 processTacticalRouts: перекрытый путь (штаб/край) → сдача, не ожидание', () => {
  assert.ok(/if \(!destination\) \{[\s\S]{0,240}?tacticalSurrenderUnit\(s, side, idx, 'retreat_blocked'\)/.test(HTML),
    'заблокированный маршрут приводит к сдаче');
  assert.ok(!/путь сейчас перекрыт — отряд остаётся на месте/.test(HTML),
    'старое правило ожидания удалено');
  assert.ok(/if \(!goals\.size\) \{[\s\S]{0,420}?tacticalSurrenderUnit\(s, side, idx, 'retreat_blocked'\)/.test(HTML),
    'полное отсутствие целей отхода — тоже сдача');
});

ok('п.2 processTacticalRouts: цель по духу — штаб ИЛИ край карты', () => {
  assert.ok(/if \(!stubborn\) retreatEdges\.forEach/.test(HTML),
    'край карты входит в цели отхода (и по духу)');
  assert.ok(/tacticalRoutRallyAtHQ\(s, side, idx, destinationInfo\.type\)/.test(HTML),
    'прибытие на цель по духу — ралли (остаётся в бою)');
  assert.ok(/placeLabel = place === 'edge' \? 'к краю карты' : 'к штабу'/.test(HTML),
    'текст ралли различает штаб и край карты');
});

ok('п.2 ДОТ и «Упрямство» сохраняют прежние исключения', () => {
  assert.ok(/tacticalIsDotSquad\(s\) && s\.retreatReason !== 'command'/.test(HTML),
    'ДОТ держится до конца (v13.136 п.6)');
  assert.ok(/if \(stubborn\) \{[\s\S]{0,200}?s\.isRouting = false;/.test(HTML),
    '«Упрямство» держит позицию вместо сдачи');
  assert.ok(/reason === 'retreat_blocked' && tacticalSquadHasStubbornCard\(squad\)/.test(HTML),
    'сдача уважает «Упрямство» без живого штаба');
});

ok('п.2 маркер сдачи виден: markerIconMap, PNG-иконка, бейджи, фильтр целей', () => {
  assert.ok(/'surrenderedFriendly':\s*\{ icon: null, fallback: '🏳️'/.test(dataJs) &&
    /'surrenderedEnemy':\s*\{ icon: null, fallback: '🏳️'/.test(dataJs),
    'markerIconMap содержит метки сдачи (fallback 🏳️)');
  assert.ok(fs.existsSync(path.join(ROOT, 'images/status/surrendered.png')), 'PNG images/status/surrendered.png существует');
  assert.ok(/surrendered: 'images\/status\/surrendered\.png'/.test(HTML), 'TACTICAL_STATUS_ICONS знает surrendered');
  assert.ok(/squad\.isSurrendered \|\| squad\.status === 'surrendered'\) statusNames\.push\('surrendered'\)/.test(HTML),
    'бейдж «сдался» у своих');
  assert.ok(/drawTacticalStatusIcon\(ctx, 'surrendered', drawX - iconSize\/2/.test(HTML),
    'бейдж «🏳️» у врагов');
  assert.ok(/e\.isSurrendered \|\| e\.status === 'surrendered'/.test(hexmaps),
    'сдавшиеся не предлагаются целями в fillModalTargets');
});

ok('п.2 действия сдавшегося отряда заблокированы (isSurrendered)', () => {
  assert.ok(/squad\.isDestroyed \|\| squad\.isSurrendered \|\| squad\.status === 'surrendered'/.test(HTML),
    'гейты действий учитывают isSurrendered');
  const body = sliceFunction(HTML, 'tacticalActionAllowed');
  assert.ok(/isSurrendered/.test(body), 'tacticalActionAllowed блокирует сдавшихся');
});

// ================= п.3: патроны — гейты стрельбы и подавления =================

ok('п.3 MAP_ACTION_DEFS: smallArms/suppressiveFire/sniper без патронов скрыты', () => {
  const m = mapActions.match(/var MAP_ACTION_DEFS = \[[\s\S]*?\n\];/);
  assert.ok(m, 'MAP_ACTION_DEFS найден');
  const s = createSandbox(freshAppData());
  s.run('function mapActionHasSniper(x) { return !!x.sniper; }' +
    'function mapActionHasSmallArms() { return true; }' +
    'function mapActionHasCrewType() { return true; }' +
    'function mapActionCanUseBinoculars() { return false; }');
  s.run(m[0]);
  assert.strictEqual(s.evalCtx(`MAP_ACTION_DEFS.find(d => d.id === 'smallArms').show({ name: 'Пехота', ammoSmall: 0 })`), false, 'smallArms без патронов скрыт');
  assert.strictEqual(s.evalCtx(`MAP_ACTION_DEFS.find(d => d.id === 'smallArms').show({ name: 'Пехота', ammoSmall: 10 })`), true);
  assert.strictEqual(s.evalCtx(`MAP_ACTION_DEFS.find(d => d.id === 'suppressiveFire').show({ name: 'Пехота', ammoSmall: 0 })`), false, 'подавление без патронов скрыто');
  assert.strictEqual(s.evalCtx(`MAP_ACTION_DEFS.find(d => d.id === 'suppressiveFire').show({ name: 'Пехота', ammoSmall: 5 })`), true);
  assert.strictEqual(s.evalCtx(`MAP_ACTION_DEFS.find(d => d.id === 'sniper').show({ name: 'Снайпер', sniper: true, ammoSmall: 0 })`), false, 'снайпер без патронов скрыт');
  assert.strictEqual(s.evalCtx(`MAP_ACTION_DEFS.find(d => d.id === 'sniper').show({ name: 'Снайпер', sniper: true, ammoSmall: 3 })`), true);
});

ok('п.3 вкладка «Бой»: стрельба и подавление без патронов недоступны', () => {
  const body = sliceFunction(HTML, 'attackSmallArms');
  assert.ok(true, 'attackSmallArms доступна для среза');
  assert.ok(/Number\(currentSquad\.ammoSmall\) <= 0\) return 'Кончились патроны/.test(HTML),
    'smallArmsBlockReason: без патронов кнопка стрельбы disabled');
  assert.ok(/!isDotCurrent && currentSquad\.ammoSmall > 0/.test(HTML),
    'кнопка «Подавить» показывается только с патронами');
  assert.ok(/disabled title=\\\\"Нет патронов/.test(HTML) || /Нет патронов — ОД не будут потрачены/.test(HTML),
    'снайперский выстрел без патронов disabled');
});

// ================= маркеры версии =================

ok('маркеры версии синхронизированы на v13.137', () => {
  const files = [ROOT + '/index.html', ROOT + '/js/cards.js', ROOT + '/js/data.js', ROOT + '/js/hexmaps.js',
    ROOT + '/js/map_actions.js', ROOT + '/js/online_battles.js', ROOT + '/js/operational_ui.js',
    ROOT + '/js/placement.js', ROOT + '/js/templates.js', ROOT + '/js/weapons.js',
    ROOT + '/service-worker.js', ROOT + '/manifest.json'];
  files.forEach(f => {
    const txt = fs.readFileSync(f, 'utf8');
    assert.ok(/v13\.137/.test(txt), path.basename(f) + ' должен содержать v13.137');
  });
});

console.log(`\n${passed} проверок пройдено${process.exitCode ? ' (ЕСТЬ ПАДЕНИЯ)' : ''}`);
if (!process.exitCode) console.log('v13.137 (playtest fixes) regression: PASS');
else console.log('v13.137 (playtest fixes) regression: FAIL');
