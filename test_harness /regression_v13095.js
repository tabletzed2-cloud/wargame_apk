// Regression tests for v13.095: cards after communications, DOT sector widths,
// tactical-retreat consequences (3 hexes back + orders cancelled).
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.log(`✗ ${name} — ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function equal(a, b, m) { assert(a === b, `${m || 'equality'}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }
function includes(a, b, m) { assert(String(a).includes(b), `${m || 'includes'}: missing ${JSON.stringify(b)}`); }
function loadHtml(s, names) { names.forEach(n => s.run(sliceFunction(HTML, n))); }
function source(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

// ── П.1: раздача карт — этап ПОСЛЕ связи, отдельное меню ─────────────────────
test('1a: этапы: placement→fortifications→communications→cards→orders', () => {
  const ui = source('js/operational_ui.js');
  includes(ui, "const STAGES = ['placement', 'fortifications', 'communications', 'cards', 'orders'];", 'нет этапа cards после communications');
  includes(ui, 'window.completeInitialCardStage = completeCardStage;', 'нет экспорта завершения этапа карт');
  includes(ui, 'window.openInitialCardDistributionStage()', 'этап карт не открывает меню раздачи');
  includes(ui, "placementLocked = stage === 'orders' || stage === 'cards'", 'размещение должно быть заблокировано на этапе карт');
});

test('1b: confirmBattalion больше НЕ раздаёт карты до карты', () => {
  const confirm = sliceFunction(HTML, 'confirmBattalion');
  assert(!confirm.includes('renderInitialCampaignCardDistribution();'), 'раздача всё ещё вызывается до оперативной карты');
  includes(confirm, 'showCampaignReadyAfterCardDistribution();', 'нет экрана готовности батальона');
});

test('1c: отдельное меню раздачи (оверлей) и переход к приказам после него', () => {
  includes(HTML, 'function openInitialCardDistributionStage()', 'нет функции открытия меню этапа карт');
  includes(HTML, "overlay.id = 'initialCardStageOverlay';", 'нет оверлея меню карт');
  includes(HTML, "appData.campaign.opSetupStage === 'cards'", 'завершение раздачи не проверяет этап карт');
  includes(HTML, 'window.completeInitialCardStage();', 'после раздачи нет перехода к приказам');
  const css = source('css/style.css');
  includes(css, '#initialCardStageOverlay', 'нет стилей оверлея меню карт');
  includes(css, 'grid-template-columns: 1fr;', 'на телефоне карты не в одну колонку');
});

test('1d: лимиты карт сохранены (3 на взвод / 3я = дебафф / 3 копии на батальон)', () => {
  const commit = sliceFunction(HTML, 'commitInitialCampaignCardAssignments');
  includes(commit, 'choices.length > 3', 'нет лимита 3 карт на взвод');
  includes(commit, 'bonusCount === 3', 'третья карта не даёт дебафф');
  includes(commit, 'cardCopies + savedCopies > 3', 'нет лимита 3 копий на батальон');
});

// ── П.2: ширина секторов ДОТов ───────────────────────────────────────────────
test('2a: ширина сектора по типу ДОТа и оружия', () => {
  const s = createSandbox(freshAppData());
  // js/hexmaps.js загружен песочницей: dotSectorWidthDeg доступен сразу
  s.run(`
    var vanHees = { name: 'ДОТ Van Hees №1', crewInstances: [{ weaponName: 'ПТО Bohler M37' }, { weaponName: 'Станковый пулемёт Schwarzlose' }] };
    var Bosh = { name: 'ДОТ Bosh №1', crewInstances: [{ weaponName: 'ПТО Bohler M37' }, { weaponName: 'Станковый пулемёт Schwarzlose' }, { weaponName: 'Станковый пулемёт Schwarzlose' }] };
    var wVHGun = dotSectorWidthDeg(vanHees, 0);
    var wVHmg = dotSectorWidthDeg(vanHees, 1);
    var wBoshGun = dotSectorWidthDeg(Bosh, 0);
    var wBoshMg1 = dotSectorWidthDeg(Bosh, 1);
    var wBoshMg2 = dotSectorWidthDeg(Bosh, 2);
  `);
  equal(s.evalCtx('wVHGun'), 360, 'Van Hees ПТ — 360°');
  equal(s.evalCtx('wVHmg'), 90, 'Van Hees пулемёт — 90°');
  equal(s.evalCtx('wBoshGun'), 90, 'Bosh орудие — 90°');
  equal(s.evalCtx('wBoshMg1'), 60, 'Bosh пулемёт 1 — 60°');
  equal(s.evalCtx('wBoshMg2'), 60, 'Bosh пулемёт 2 — 60°');
});

test('2b: tacticalHexInFireSector учитывает ширину (360/90/60)', () => {
  const s = createSandbox(freshAppData());
  // сектор на восток от 5,5
  equal(s.evalCtx("tacticalHexInFireSector('5,5','8,5','e',60)"), true, 'восток внутри 60°');
  equal(s.evalCtx("tacticalHexInFireSector('5,5','2,5','e',60)"), false, 'запад вне 60°');
  equal(s.evalCtx("tacticalHexInFireSector('5,5','2,5','e',360)"), true, '360° — любая цель');
  equal(s.evalCtx("tacticalHexInFireSector('5,5','5,2','e',90)"), false, 'север вне 90° (90° от оси)');
  equal(s.evalCtx("tacticalHexInFireSector('5,5','7,4','e',90)"), true, 'северо-восток внутри 90°');
  equal(s.evalCtx("tacticalHexInFireSector('5,5','6,3','e',60)"), false, 'крутой северо-восток вне 60°');
});

test('2c: сектора действуют на оперативной карте (operationalDotSectorAllows + обстрелы)', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    var dotUnit = { name: 'ДОТы', col: 5, row: 5, squads: [{ name: 'ДОТ Bosh №1',
      crewInstances: [{ weaponName: 'ПТО Bohler M37' }, { weaponName: 'Станковый пулемёт Schwarzlose' }],
      fixedTacticalPosition: { hexKey: '5,5', key: '3,3', weaponSectors: { '0': 'e', '1': 'e' } } }] };
    var east = operationalDotSectorAllows(dotUnit, 8, 5);
    var west = operationalDotSectorAllows(dotUnit, 2, 5);
    var plain = operationalDotSectorAllows({ name: 'Пехота', col: 5, row: 5, squads: [] }, 2, 5);
  `);
  equal(s.evalCtx('east'), true, 'цель в секторе — обстрел разрешён');
  equal(s.evalCtx('west'), false, 'цель вне секторов — обстрел запрещён');
  equal(s.evalCtx('plain'), true, 'обычный юнит без ДОТов не ограничивается');
  includes(HTML, 'operationalDotSectorAllows(unit, targetCol, targetRow)', 'executeShootOrder не проверяет сектор ДОТа');
  includes(HTML, 'operationalDotSectorAllows(unit, e.col, e.row)', 'автоогонь не фильтрует цели по сектору');
  includes(HTML, 'operationalDotSectorAllows(shooter, t.col, t.row)', 'ручной обстрел не проверяет сектор ДОТа');
  const hex = source('js/hexmaps.js');
  includes(hex, 'dotSectorWidthDeg(squad, crewIndex)', 'тактическая проверка цели не использует ширину сектора');
});

// ── П.3: поражение + отступление в тактическом бою ───────────────────────────
test('3a: отступивший отряд — отмена приказов и отход на 3 гекса от гекса боя', () => {
  const s = createSandbox(freshAppData());
  s.run('function isHexInPlayableArea() { return true; }');
  s.run('function operationalHexHasActiveBattle() { return false; }');
  s.run('var logs095 = []; function log(m) { logs095.push(m); }');
  loadHtml(s, ['getOpHexNeighbors', 'getOpHexTypes', 'getOpMoveCost', 'getOpPlannedMoveCost', 'getRouteToTarget',
    'getOpHexDistance', 'opRecordPrevPos', 'cancelOrdersForMoraleRetreat',
    'cancelAllOrdersAfterTacticalRetreat', 'findTacticalDefeatRetreatHex', 'applyTacticalRetreatConsequences']);
  s.run(`
    var OP_MAP_COLS = 20, OP_MAP_ROWS = 20;
    appData.campaign.opMapGrid = {};
    for (var c = 0; c < 20; c++) for (var r = 0; r < 20; r++) appData.campaign.opMapGrid[c + ',' + r] = ['grass'];
    var unit = { name: '1-й пехотный взвод', type: 'infantry_platoon', col: 10, row: 10, ap: 4,
      squads: [{ name: 'Отделение 1', fighters: [{ name: 'A', hp: 3 }] }] };
    var enemy = { name: 'Враг', col: 11, row: 10, squads: [] };
    appData.campaign.opUnits = [unit];
    appData.campaign.enemyOpUnits = [enemy];
    hardMode.orders = [{ id: 1, toUnitId: 0, type: 'move', status: 'active' }, { id: 2, toUnitId: 0, type: 'shoot', status: 'pending' }];
    hardMode.pendingOrders = [];
    hardMode.messengerQueue = [{ id: 3, toUnitId: 0, type: 'move' }];
    var battle = { id: 'b095', hexKey: '10,10',
      playerSquads: [{ name: 'Отделение 1', opUnitName: '1-й пехотный взвод', isRetreated: true, fighters: [{ name: 'A', hp: 3 }] }],
      enemySquads: [] };
    applyTacticalRetreatConsequences(battle);
    var distFromBattle = getOpHexDistance(unit.col, unit.row, 10, 10);
    var distFromEnemy = getOpHexDistance(unit.col, unit.row, 11, 10);
    var ordersLeft = hardMode.orders.length + hardMode.pendingOrders.length + hardMode.messengerQueue.length;
  `);
  equal(s.evalCtx('ordersLeft'), 0, 'все последующие приказы отменены');
  equal(s.evalCtx('distFromBattle'), 3, 'юнит отошёл ровно на 3 гекса от гекса боя');
  assert(s.evalCtx('distFromEnemy') >= 3, 'юнит отошёл ОТ противника (дистанция до врага >= 3)');
  assert(s.evalCtx('logs095.length') > 0, 'нет записи в логе об отступлении');
});

test('3b: applyTacticalRetreatConsequences вызывается при завершении и при отступлении из боя', () => {
  const finish = sliceFunction(HTML, 'finishBattle');
  includes(finish, 'applyTacticalRetreatConsequences(battle)', 'finishBattle не применяет последствия отступления');
  const occurrences = (HTML.match(/applyTacticalRetreatConsequences\(battle\)/g) || []).length;
  assert(occurrences >= 2, 'нужен вызов и в retreatFromBattle');
  includes(HTML, 'function applyTacticalRetreatConsequences(battle)', 'нет функции последствий отступления');
  includes(HTML, 'function findTacticalDefeatRetreatHex(', 'нет поиска гекса отхода на 3 гекса');
});

// ── Версия ───────────────────────────────────────────────────────────────────
test('4: версия v13.095 синхронизирована', () => {
  includes(HTML, "var APP_VERSION = 'v13.095';", 'APP_VERSION');
  includes(source('service-worker.js'), "const CACHE_NAME = 'wargame-v13.095';", 'CACHE_NAME');
  includes(source('manifest.json'), '"БМ v13.095"', 'manifest');
});

console.log(`\n=== v13.095 regression: ${pass} PASS, ${fail} FAIL ===`);
process.exitCode = fail ? 1 : 0;
