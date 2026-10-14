// Regression tests for v13.094 (user report, items 1-14).
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');

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

// 1. BeVe deployment zone explicitly contains 10,6 and 9,5.
test('1: зона BeVe включает гексы 10,6 и 9,5', () => {
  const data = source('js/data.js');
  includes(data, '[[2,7],[3,7],[4,7],[11,8],[10,7],[9,6],[10,6],[9,5]]', 'список дополнительных гексов BeVe (10,6 и 9,5)');
});

// 5. BeVe armored cars: route cost through swamp edge must not throw
//    (TypeError from destructuring {col,row} neighbours killed redraw + orders).
test('5: бронеавтомобиль BeVe — болотоход не бросает, маршрут строится', () => {
  const s = createSandbox(freshAppData());
  s.run('function isHexInPlayableArea() { return true; }');
  loadHtml(s, ['getOpHexNeighbors', 'getOpHexTypes', 'isBeveSwampTraversable', 'getOpMoveCost', 'getOpPlannedMoveCost', 'getRouteToTarget']);
  s.run(`
    appData.campaign.scenario = 'valencia';
    appData.campaign.playerFaction = 'BeVe';
    appData.campaign.opMapGrid = {
      '5,5': ['grass'], '6,5': ['swamp_passable'], '7,5': ['grass'],
      '5,4': ['grass'], '6,4': ['grass'], '7,4': ['grass'],
      '5,6': ['grass'], '6,6': ['grass'], '7,6': ['grass']
    };
    var OP_MAP_COLS = 13, OP_MAP_ROWS = 15;
    var ba = { name: 'Бронеавтомобиль Landsverk 183 №1', type: 'vehicle', mobility: 'vehicle', faction: 'BeVe', maxAp: 4 };
    var costSwamp = getOpMoveCost(ba, 5, 5, 6, 5);
    var route = getRouteToTarget(5, 5, 7, 5, ba);
  `);
  equal(s.evalCtx('costSwamp'), 4, 'крайнее болото для BeVe стоит весь ход');
  assert(s.evalCtx('route.length') > 0, 'маршрут БА не построен');
});

// 14+6. processOrders: company relay first, per-order error isolation.
test('6/14: приказы — сначала ретрансляция рот, ошибка одного не вешает остальных', () => {
  includes(HTML, "b.type === 'company_order'", 'нет приоритета company_order');
  includes(HTML, 'order.executionErrors', 'нет изоляции ошибок приказов');
  includes(HTML, 'executeOrder(order);', 'нет исполнения приказов');
});

// 3. DOT sector by clicking a map cell.
test('3: сектор ДОТа по клику — направление от клетки ДОТа', () => {
  const s = createSandbox(freshAppData());
  const hex = source('js/hexmaps.js');
  // js/hexmaps.js уже загружен песочницей — функции секторов доступны сразу
  equal(s.evalCtx("tacticalSectorIdBetween('5,5','8,5')"), 'e', 'клик восточнее — сектор восток');
  equal(s.evalCtx("tacticalSectorIdBetween('5,5','5,5')"), null, 'клик по самому ДОТу — нет направления');
  includes(hex, 'setInitialDotSectorPick', 'нет кнопки указания сектора на карте');
  includes(HTML, "hexEditorState.kind === 'initialFortification'", 'линии секторов не рисуются в редакторе');
});

// 4. Signal recall during distribution stage is instant.
test('4: отзыв связи на стадии распределения — мгновенно', () => {
  includes(HTML, 'signalSetupStage', 'нет мгновенного отзыва на стадии связи');
  includes(HTML, "opSetupStage === 'communications'", 'стадия communications не учитывается');
});

// 7. Sapper platoon: all faction cards available.
test('7: сапёрному взводу доступны все карточки фракции', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['isCardAvailableToUnit']);
  s.run(`
    var unit = { type: 'engineer_platoon', name: '1-й Саперный взвод', squads: [] };
    var card = { name: 'Нестабильные гранаты' };
    var ok = isCardAvailableToUnit(card, unit, []);
  `);
  equal(s.evalCtx('ok'), true, 'карточка заблокирована для сапёров');
});

// 11. Grenade-type cards go to every infantry/sapper squad of the platoon.
test('11: гранаты и термит — всем пехотным/сапёрным отделениям', () => {
  includes(HTML, 'thermiteTargets.forEach', 'термит не раздаётся всем сапёрам');
  assert(!HTML.includes('.filter(s => isAirfSapperSquad(s)).slice(0, 2)'), 'остался лимит 2 сапёра на термит');
  includes(HTML, 'Сап[её]рное отделение', 'сапёрные отделения не в пехотном фильтре');
});

// 8. Trench/prep panel only for own unused points, notification on grant.
test('8: окопы — уведомление, панель только по своим очкам и скрывается после', () => {
  const hex = source('js/hexmaps.js');
  includes(hex, 'Окопы готовы', 'нет уведомления о готовности окопов');
  includes(hex, 'Расчистка позиций готова', 'нет уведомления о расчистке');
  includes(hex, 'ov.placedByMe = true', 'нет флага владельца правок');
  includes(HTML, 'delete sharedOverlays[key].placedByMe', 'флаг владельца уходит противнику');
});

// 9/12/13. Tactical panel buttons: card abilities, undo, APC disembark.
test('9/12/13: панель боя — карточные способности, отмена, высадка из БТР', () => {
  const ma = source('js/map_actions.js');
  includes(ma, 'useThermiteCharge()', 'нет кнопки термита');
  includes(ma, 'usePanzerblinde()', 'нет кнопки ослепляющей гранаты');
  includes(ma, 'deploySmokeScreen()', 'нет кнопки дымовой завесы');
  includes(ma, 'disembarkSquad()', 'нет кнопки высадки десанта');
  includes(ma, 'undoLastTacticalAction()', 'нет кнопки отмены действия');
  includes(HTML, 'function undoLastTacticalAction', 'нет функции отмены');
  includes(HTML, 'function pushTacticalUndoSnapshot', 'нет снимков для отмены');
});

// 13. Destroyed APC: every passenger rolls D6, 1-2 dies, rest disembark on that hex.
test('13: подбитый БТР — D6 десанта (1-2 гибель), остальные в гексе БТР', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalDisembarkFromDestroyedCarrier']);
  s.run(`
    var rolls = [1, 3, 6, 2];
    function rollD6() { return rolls.shift(); }
    var passenger = { name: 'Десант', hidden: true, fighters: [
      { name: 'A', hp: 3 }, { name: 'B', hp: 3 }, { name: 'C', hp: 3 }, { name: 'D', hp: 3 }] };
    var carrier = { name: 'БТР', embarkedSquadIndex: 1, fighters: [{ name: 'Экипаж', hp: 3 }] };
    appData.squads = [carrier, passenger];
    appData.map = { enemySquads: [], grid: { '4,4': { squadIds: [0], enemySquadIds: [] } } };
    function getBattleSquadHex(grid, idx, isEnemy) { return { col: 4, row: 4, key: '4,4' }; }
    var out = tacticalDisembarkFromDestroyedCarrier(carrier);
  `);
  equal(s.evalCtx('out.fighters[0].hp'), 0, 'D6=1 — боец должен погибнуть');
  equal(s.evalCtx('out.fighters[1].hp'), 3, 'D6=3 — боец высаживается');
  equal(s.evalCtx('out.fighters[3].hp'), 0, 'D6=2 — боец должен погибнуть');
  equal(s.evalCtx('appData.map.grid["4,4"].squadIds.includes(1)'), true, 'десант не в гексе БТР');
  equal(s.evalCtx('out.hidden'), false, 'десант остался скрытым');
});

// 10. Enemy placement menu hidden/guarded in online tactical battle.
test('10: онлайн-бой — меню размещения врага скрыто и запрещено', () => {
  includes(HTML, 'id="tacticalEnemyPlacementPanel"', 'нет отдельной панели врага');
  includes(HTML, 'function syncTacticalEnemyPlacementPanel', 'нет синхронизации скрытия');
  includes(HTML, "mode === 'placeEnemy'", 'нет запрета режимов врага в онлайне');
});

// 2. Reload during tactical battle returns to the battle, errors do not reset screen.
test('2: перезагрузка в бою возвращает в бой; ошибки перехватываются', () => {
  includes(HTML, "appData.lastUiScreen === 'battle'", 'нет восстановления боя после перезагрузки');
  includes(HTML, "window.addEventListener('unhandledrejection'", 'нет перехвата promise-ошибок');
});

// Version synchronisation.
test('текущая версия приложения и маркеры сборки синхронны', () => {
  const version = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
  includes(source('service-worker.js'), `const CACHE_NAME = 'wargame-${version}';`, 'CACHE_NAME');
  ['js/data.js', 'js/hexmaps.js', 'js/templates.js', 'js/operational_ui.js'].forEach(f =>
    includes(source(f), 'BUILD-МАРКЕР: ' + version, f));
});

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
