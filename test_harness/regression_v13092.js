// Регрессия v13.092 — три правки по просьбе игрока:
//   п.1) оперативная карта листается перетаскиванием (мышь и один палец) и
//        занимает больше места;
//   п.2) и свои, и вражеские отряды стартуют по координатам из js/data.js,
//        ДОТы — ВСЕГДА на гексах стартовых позиций (игрок за BeVe выбирает
//        только клетку на карте гекса);
//   п.3) у BeVe поддержка «ДОТы» отмечена в сборке батальона по умолчанию.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');
const VERSION = /var APP_VERSION = '(v[\d.]+)'/.exec(HTML)[1];
const OP_UI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const HEXMAPS = fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8');
const OP_CSS = fs.readFileSync(path.join(ROOT, 'css/operational_ui.css'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.log(`✗ ${name} — ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'утверждение не выполнено'); }
assert.equal = (a, b, m) => assert(a === b, (m || 'равенство') + `: получили ${JSON.stringify(a)}, ждали ${JSON.stringify(b)}`);
assert.deepEqual = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), (m || 'список') + `: получили ${JSON.stringify(a)}, ждали ${JSON.stringify(b)}`);
assert.includes = (hay, needle, m) => assert(String(hay).includes(needle), (m || 'поиск') + `: не найдено «${needle}»`);
assert.match = (hay, re, m) => assert(re.test(String(hay)), (m || 'поиск по шаблону') + `: не найдено ${re}`);
assert.notIncludes = (hay, needle, m) => assert(!String(hay).includes(needle), (m || 'отсутствие') + `: найдено «${needle}»`);

function campaignData(faction) {
  const data = freshAppData();
  data.campaign.scenario = 'valencia';
  data.campaign.playerFaction = faction || 'BeVe';
  data.campaign.currentTurn = 1;
  data.campaign.opUnits = [];
  data.campaign.enemyOpUnits = [];
  data.campaign.battalions = { player: { faction: data.campaign.playerFaction } };
  return data;
}
// функции оперативной карты, нужные для размещения
function loadPlacementFns(s) {
  s.run('function isOpUnitEmbarkedOnPlacedBtr(){ return false; }');
  s.run('function getOpMoveCost(){ return 2; }');
  [  'pointInPolygon', 'zoneExtraHexes', 'isHexInPlacementZone',
     'getFactionPlacementHexes', 'getConfiguredStartHex', 'isStaticOpUnit',
     'getOpHexDistance', 'getUnplacedOpUnits', 'autoPlaceEnemyUnits'
  ].forEach(fn => s.run(sliceFunction(HTML, fn)));
}

// ── п.1: прокрутка карты перетаскиванием ────────────────────────────────
test('v13.092 (п.1): карта тянется мышью и одним пальцем (пан есть на всех этапах)', () => {
  assert.includes(OP_UI, 'function beginPan(', 'начало прокрутки');
  assert.includes(OP_UI, 'function movePan(', 'сдвиг карты');
  assert.includes(OP_UI, 'function endPan(', 'завершение прокрутки');
  assert.includes(OP_UI, 'pan.suppressUntil', 'клик после прокрутки гасится');
  // прокрутка запускается на любом этапе, а перетаскивание отряда — только на размещении
  assert.includes(OP_UI, "if (event.button > 0 || !activeMap() || !campaign()) return;",
    'пан включается без проверки этапа размещения');
  assert.includes(OP_UI, "const dragUnits = getStage() === 'placement' && isOnlineTurn();",
    'иконку отряда тянем только на этапе размещения');
  assert.includes(OP_UI, "if (pan.id != null && event.pointerId !== pan.id) { endPan(); return; }",
    'второй палец отдаёт жест щипку');
});

test('v13.092 (п.1): прокрутка не ломает клик по гексу и не мешает щипку', () => {
  assert.includes(OP_UI, 'const PAN_THRESHOLD = 7;', 'порог «прокрутка, а не клик»');
  assert.includes(OP_UI, "viewport.addEventListener('click'", 'перехватчик клика на контейнере');
  assert.includes(OP_UI, 'true);\n      // колесо/тачпад', 'перехватчик работает в фазе перехвата (capture)');
  assert.includes(OP_UI, 'op-map-panning', 'во время прокрутки курсор «grabbing»');
});

test('v13.092 (п.1): сенсорный жест берёт игра, поэтому touch-action: none на всех этапах', () => {
  assert.includes(OP_CSS, '#opMapCanvas { cursor: grab; touch-action: none;',
    'браузерная прокрутка на канвасе отключена');
  assert.includes(OP_CSS, '#opMapCanvas.op-map-panning { cursor: grabbing; }', 'курсор при прокрутке');
  assert.includes(OP_CSS, '#opMapContainer { overscroll-behavior: contain;',
    'прокрутка не уходит на страницу');
  // старая привязка к этапу размещения сохранена (её проверяет регрессия пользовательских правок)
  assert.includes(OP_CSS, 'body.op-placement-stage #opMapCanvas', 'стадия развёртывания оформлена');
});

test('v13.092 (п.1): жест прокрутки двигает карту и отличает клик от протяжки', () => {
  // вынимаем блок прокрутки из модуля и гоняем его на заглушках DOM
  const vm = require('vm');
  const start = OP_UI.indexOf('  const PAN_THRESHOLD = 7;');
  const end = OP_UI.indexOf('  function installCanvasDrag() {');
  assert(start > 0 && end > start, 'блок прокрутки найден в js/operational_ui.js');
  const viewport = { scrollLeft: 100, scrollTop: 40 };
  const canvas = { classList: { set: new Set(),
    add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } } };
  const sandbox = {
    console, Date, Math,
    performance: { now: () => Date.now() },
    document: { getElementById: (id) => (id === 'opMapContainer' ? viewport : canvas) },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {}
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(OP_UI.slice(start, end) + '\nvar api = { beginPan, movePan, endPan, pan };', ctx);
  const api = vm.runInContext('api', ctx);
  const down = (x, y) => ({ pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, buttons: 1 });

  // короткий «клик» — карту не двигаем, клик по гексу сохраняем
  api.beginPan(down(200, 200));
  api.movePan(down(203, 202));
  assert.equal(viewport.scrollLeft, 100, 'короткое движение карту не двигает');
  assert.equal(api.pan.moved, false, 'короткое движение — не прокрутка');
  api.endPan();
  assert.equal(api.pan.suppressUntil > Date.now(), false, 'клик по гексу не гасится');

  // настоящая протяжка вправо-вниз — карта едет влево-вверх
  api.beginPan(down(200, 200));
  api.movePan(down(260, 240));
  api.endPan();
  assert.equal(viewport.scrollLeft, 40, 'карта прокручена по X');
  assert.equal(viewport.scrollTop, 0, 'карта прокручена по Y');
  assert.equal(canvas.classList.contains('op-map-panning'), false, 'курсор «grabbing» снят');
  assert.equal(api.pan.suppressUntil > Date.now(), true, 'клик после прокрутки погашен');
  assert(Math.abs(api.pan.vx) <= 45 && Math.abs(api.pan.vy) <= 45, 'инерция ограничена по скорости');
});

test('v13.092 (п.1): панель карты стала выше (82vh, на телефоне 88vh)', () => {
  const mapPanel = /<div id="opMapContainer"[^>]*height:(\d+)vh/.exec(HTML);
  assert(mapPanel, 'панель #opMapContainer найдена в index.html');
  assert.equal(mapPanel[1], '82', 'высота панели карты (было 70vh)');
  const mobile = /#opMapContainer \{\s*width: 100vw !important;\s*height: (\d+)vh !important;/.exec(BASE_CSS);
  assert(mobile, 'мобильная высота панели найдена в css/style.css');
  assert.equal(mobile[1], '88', 'высота панели карты на телефоне (было 80vh)');
});

// ── п.2: стартовые позиции из js/data.js ────────────────────────────────
test('v13.092 (п.2): стартовые гексы читаются из SCENARIO_START_POSITIONS для обеих фракций', () => {
  const s = createSandbox(campaignData('BeVe'));
  loadPlacementFns(s);
  s.run(`
    var beve = getConfiguredStartHex('valencia', 'BeVe', { name: 'ДОТ Bosh', type: 'dots' });
    var airf = getConfiguredStartHex('valencia', 'A.I.R.F.', { name: 'Штаб Батальона', type: 'battalion_hq' });
    var supply = getConfiguredStartHex('valencia', 'BeVe', { name: 'Взвод снабжения', type: 'hq' });
    var unknown = getConfiguredStartHex('valencia', 'BeVe', { name: 'Нет такого', type: 'hq' });
  `);
  assert.deepEqual(s.evalCtx('beve'), { col: 4, row: 7 }, 'ДОТ Bosh — гекс из js/data.js');
  assert.deepEqual(s.evalCtx('airf'), { col: 1, row: 13 }, 'штаб A.I.R.F. — гекс из js/data.js');
  assert.deepEqual(s.evalCtx('supply'), { col: 4, row: 4 }, 'взвод снабжения BeVe — гекс из js/data.js');
  assert.equal(s.evalCtx('unknown'), null, 'юнита без координат в data — как «не задан»');
});

test('v13.092 (п.2): враг тоже встаёт по координатам своей фракции из js/data.js', () => {
  const s = createSandbox(campaignData('BeVe'));
  loadPlacementFns(s);
  s.run(`
    appData.campaign.enemyOpUnits = [
      { name: 'Штаб Батальона', type: 'battalion_hq', col: null, row: null },
      { name: '1-й стрелковый взвод', type: 'infantry_platoon', col: null, row: null },
      { name: 'БТР Llanero №1', type: 'btr_platoon', col: null, row: null },
      { name: 'Без координат в data', type: 'infantry_platoon', col: null, row: null }
    ];
    var placed = autoPlaceEnemyUnits();
    var enemies = appData.campaign.enemyOpUnits;
    var hq = enemies[0].col + ',' + enemies[0].row;
    var platoon = enemies[1].col + ',' + enemies[1].row;
    var btr = enemies[2].col + ',' + enemies[2].row;
    var auto = (enemies[3].col !== null && enemies[3].row !== null);
  `);
  assert.equal(s.evalCtx('hq'), '1,13', 'штаб врага — по стартовым позициям A.I.R.F.');
  assert.equal(s.evalCtx('platoon'), '3,12', 'взвод врага — по стартовым позициям A.I.R.F.');
  assert.equal(s.evalCtx('btr'), '1,11', 'БТР врага — по стартовым позициям A.I.R.F.');
  assert.equal(s.evalCtx('auto'), true, 'кому гекса в data нет — тот доразмещается в зоне');
  assert(s.evalCtx('placed') >= 4, 'все вражеские отряды получили гексы');
  assert.match(s.logs.join('\n'), /Стартовые позиции противника из js\/data\.js: 3 юнит\(ов\)/, 'в журнале — откуда позиции');
});

test('v13.092 (п.2): ДОТы врага (BeVe под ИИ) стоят на гексах стартовых позиций', () => {
  const s = createSandbox(campaignData('A.I.R.F.'));
  loadPlacementFns(s);
  s.run(`
    appData.campaign.enemyOpUnits = [
      { name: 'ДОТ Bosh', type: 'dots', col: null, row: null },
      { name: 'ДОТ Van Hees', type: 'dots', col: null, row: null }
    ];
    autoPlaceEnemyUnits();
    var dots = appData.campaign.enemyOpUnits.map(u => u.col + ',' + u.row);
  `);
  assert.deepEqual(s.evalCtx('dots'), ['4,7', '8,10'], 'ДОТы BeVe под ИИ — на своих гексах из js/data.js');
});

test('v13.092 (п.2): гексы ДОТов берутся из стартовых позиций, а не выбираются игроком', () => {
  const s = createSandbox(campaignData('BeVe'));
  loadPlacementFns(s);
  s.run(`
    appData.campaign.opUnits = [
      { name: 'ДОТ Bosh', type: 'dots', col: null, row: null, squads: [{ name: 'ДОТ Bosh' }] },
      { name: 'ДОТ Van Hees', type: 'dots', col: null, row: null, squads: [{ name: 'ДОТ Van Hees' }] }
    ];
    var hexes = initialDotStartHexes();
    var unitHexes = appData.campaign.opUnits.map(u => u.col + ',' + u.row);
    var firstUnfixed = initialDotFirstUnfixedIndex(hexes);
    appData.campaign.opUnits[0].squads[0].fixedTacticalPosition = { hexKey: '4,7', key: '3,3' };
    var afterFirst = initialDotFirstUnfixedIndex(hexes);
  `);
  assert.deepEqual(s.evalCtx('hexes'), ['4,7', '8,10'], 'гексы ДОТов — из SCENARIO_START_POSITIONS');
  assert.deepEqual(s.evalCtx('unitHexes'), ['4,7', '8,10'], 'юниты ДОТов поставлены на эти гексы');
  assert.equal(s.evalCtx('firstUnfixed'), 0, 'первым открываем гекс незакреплённого ДОТа');
  assert.equal(s.evalCtx('afterFirst'), 1, 'после закрепления первого — второй гекс');
});

test('v13.092 (п.2): мастер ДОТов не просит выбирать оперативные гексы', () => {
  const setup = sliceFunction(HEXMAPS, 'startInitialFortificationSetup');
  assert.includes(setup, 'initialDotStartHexes()', 'гексы берутся из стартовых позиций');
  assert.notIncludes(setup, "state.phase = 'select'", 'этап выбора гексов убран');
  assert.notIncludes(setup, "setOpMapMode('selectInitialFortificationHexes')", 'режим выбора гексов не включается');
  assert.includes(setup, "openHexEditorForBattle(keys[0], 'initialFortification')",
    'сразу открывается карта гекса — там игрок и выбирает клетку');
  assert.includes(HEXMAPS, 'function initialDotFirstUnfixedIndex(', 'есть возврат к незакреплённому ДОТу');
});

test('v13.092 (п.2): ДОТ нельзя переставить на другой оперативный гекс вручную', () => {
  const placePlayer = HTML.slice(HTML.indexOf("// ====== РЕЖИМ РАЗМЕЩЕНИЯ ИГРОКА ======"), HTML.indexOf("// ====== РЕЖИМ РАЗМЕЩЕНИЯ ВРАГА ======"));
  assert.includes(placePlayer, 'isStaticOpUnit(targetUnit)', 'проверка стационарного юнита');
  assert.includes(placePlayer, 'getConfiguredStartHex(appData.campaign.scenario', 'гекс сверяется со стартовыми позициями');
  assert.includes(placePlayer, 'переставить на другой гекс нельзя', 'игроку объясняют, почему нельзя');
});

// ── п.3: ДОТы в поддержке BeVe по умолчанию ────────────────────────────
test('v13.092 (п.3): у BeVe «ДОТы» отмечены при сборке батальона по умолчанию', () => {
  const s = createSandbox(campaignData('BeVe'));
  s.run(sliceFunction(HTML, 'defaultSupportIdsFor'));
  assert.deepEqual(s.evalCtx("defaultSupportIdsFor('BeVe')"), ['dots'], 'BeVe — ДОТы по умолчанию');
  assert.deepEqual(s.evalCtx("defaultSupportIdsFor('A.I.R.F.')"), [], 'A.I.R.F. — без навязанной поддержки');
});

test('v13.092 (п.3): галочка ДОТов стоит в сборке батальона и в онлайн-лобби', () => {
  const assembly = sliceFunction(HTML, 'startBattalionAssembly');
  assert.includes(assembly, 'const defaultSupport = defaultSupportIdsFor(faction);', 'сборка берёт поддержку по умолчанию');
  assert.includes(assembly, 'class="support-check" onchange="updateAssemblySupportCheck()"${checked}',
    'галочка может быть отмечена заранее');
  const lobby = sliceFunction(HTML, 'onlineSetFaction');
  assert.includes(lobby, 'supportIds\']: defaultSupportIdsFor(v)', 'в лобби фракция ставит ту же поддержку');
  // снять галочку можно — проверка «ровно 3 из 4» осталась
  assert.includes(HTML, "if (total === 4 && supportIds.length !== 3)", 'правило «ровно 3 из 4» не сломано');
});

test('текущая версия приложения, маркеры и кэш сервис-воркера синхронизированы', () => {
  assert.match(VERSION, /^v\d+\.\d+$/, `APP_VERSION = ${VERSION}`);
  const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  assert.includes(sw, `const CACHE_NAME = 'wargame-${VERSION}';`, 'кэш сервис-воркера обновлён');
  ['js/data.js', 'js/hexmaps.js', 'js/templates.js', 'js/operational_ui.js'].forEach(mod => {
    const text = fs.readFileSync(path.join(ROOT, mod), 'utf8');
    assert.includes(text, `⚡ BUILD-МАРКЕР: ${VERSION}`, `маркер сборки в ${mod}`);
  });
});

console.log(`\nИтог v13.092: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
