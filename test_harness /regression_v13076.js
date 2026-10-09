// ⚡ v13.076: F3 — постепенная разблокировка интерфейса для новичка.
//    Гейты (UX_GATES) скрывают БТР, спешивание, разведку и редкие пункты «⚙️ Ещё»
//    до нужного пункта чек-листа. Только профиль «Новичок» и не в онлайн-матче.
//    Минимальный набор (размещение, «Двигать», «Обстрел», «Завершить ход») не трогается.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { HTML, ROOT, sliceFunction, sliceConst } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗', name, '—', e.message); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tag = (re) => { const m = re.exec(HTML); return m ? m[0] : null; };

// ─── 1. разметка: гейты на нужных элементах и не на минимальном наборе ───
test('v13.076: .ux-locked скрывает с !important, строка подсказки стилизована', () => {
  assert.ok(/\.ux-locked \{ display:none !important; \}/.test(HTML), 'класс скрытия');
  assert.ok(/\.ux-action-bar \.ux-ab-lock \{/.test(HTML), 'стиль подсказки');
});
test('v13.076: количество гейтов в разметке — 9 (БТР 3, спешивание 2, разведка 1, «Ещё» 3)', () => {
  assert.equal((HTML.match(/data-ux-gate="/g) || []).length, 9);
});
test('v13.076: БТР-панель и её кнопки — гейт btr', () => {
  assert.ok(tag(/<div id="btrPanel"[^>]*>/).includes('data-ux-gate="btr"'), 'btrPanel');
  assert.ok(tag(/<button[^>]*id="btrEmbarkBtn"[^>]*>/).includes('data-ux-gate="btr"'), 'btrEmbarkBtn');
  assert.ok(tag(/<button[^>]*id="btrDisembarkBtn"[^>]*>/).includes('data-ux-gate="btr"'), 'btrDisembarkBtn');
});
test('v13.076: спешивание — гейт dismount (панель и кнопка)', () => {
  assert.ok(tag(/<div id="dismountPanel"[^>]*>/).includes('data-ux-gate="dismount"'), 'dismountPanel');
  assert.ok(tag(/<button[^>]*id="dismountBtn"[^>]*>/).includes('data-ux-gate="dismount"'), 'dismountBtn');
});
test('v13.076: 🔍 «Проверить обнаружение» — гейт recon', () => {
  assert.ok(tag(/<button onclick="checkOpDetection\(\)"[^>]*>/).includes('data-ux-gate="recon"'));
});
test('v13.076: в «⚙️ Ещё» гейтятся только Разбить / Переименовать / Состав (turn)', () => {
  const a = HTML.indexOf('<div id="uxMoreMenu"');
  const b = HTML.indexOf('<div id="opHexMenuStatus"', a);
  const menu = HTML.slice(a, b);
  assert.ok(/id="splitBtn"[^>]*data-ux-gate="turn"/.test(menu), 'splitBtn');
  assert.ok(/id="renameBtn"[^>]*data-ux-gate="turn"/.test(menu), 'renameBtn');
  assert.ok(/id="detailsBtn"[^>]*data-ux-gate="turn"/.test(menu), 'detailsBtn');
  assert.equal((menu.match(/data-ux-gate="turn"/g) || []).length, 3, 'ровно три');
});
test('v13.076: минимум новичку без гейтов — размещение, ДОТы, авторазмещение, финиш', () => {
  assert.ok(!tag(/<button onclick="setOpMapMode\('placePlayer'\)"[^>]*>/).includes('data-ux-gate'), 'размещение');
  assert.ok(!tag(/<button[^>]*id="btnInitialFortificationSetup"[^>]*>/).includes('data-ux-gate'), 'ДОТы');
  assert.ok(!tag(/<button onclick="autoPlaceUnplacedUnits\(\{ manual: true \}\)"[^>]*>/).includes('data-ux-gate'), 'авторазмещение');
  assert.ok(!tag(/<button[^>]*id="btnFinishPlacement"[^>]*>/).includes('data-ux-gate'), 'завершить размещение');
});
test('v13.076: минимум новичку без гейтов — перемещение, обстрел, завершить ход', () => {
  assert.ok(!tag(/<button onclick="setOpMapMode\('move'\)"[^>]*>/).includes('data-ux-gate'), 'перемещение');
  assert.ok(!tag(/<button onclick="startOpShooting\(\)"[^>]*>/).includes('data-ux-gate'), 'обстрел');
  assert.ok(!tag(/<button id="opEndTurnBtn"[^>]*>/).includes('data-ux-gate'), 'завершить ход');
});
test('v13.076: «⚙️ Ещё», «📦 Объединить» и талреп-якорь не гейтятся (см. CHANGELOG)', () => {
  assert.ok(!tag(/<button id="uxMoreBtn"[^>]*>/).includes('data-ux-gate'), 'кнопка «Ещё»');
  assert.ok(!tag(/<button onclick="showGroupDialog\(\)" id="groupBtn"[^>]*>/).includes('data-ux-gate'), 'объединение');
  const winch = tag(/<button id="winchBtn"[^>]*>/);
  assert.ok(winch && !winch.includes('data-ux-gate'), 'талреп-якорь');
});
test('v13.076: приказы не гейтятся (видимость — только Hard Mode, как и раньше)', () => {
  assert.ok(!/data-ux-gate="order"/.test(HTML));
  assert.ok(!/uxChipOpen\('order'\)|UX_CHIP_GATE\.order/.test(HTML));
});

// ─── 2. таблица гейтов и логика ───
const CONSTS = ['UX_GATES', 'UX_CHIP_GATE', 'UX_CHECKLIST_KEY'];
const FNS = ['uxEsc', 'uxPhaseNow', 'uxIsBtrUnit', 'uxIsVehicleUnit', 'uxBikeLike', 'uxHasBikePark', 'uxFindEmbarkBtr',
  'uxBuildChips', 'uxActionBarState', 'uxRenderActionBar', 'uxDoMove', 'uxOpenOrder', 'uxInstallRedrawHook',
  'uxGatesOn', 'uxChecklistDone', 'uxGateOpen', 'uxChipOpen', 'uxApplyGates', 'uxLockHint',
  'isStaticOpUnit', 'getUnitBtrRequirement'];
function sliceUxChip(html) {
  const start = html.indexOf('window.uxChip = function (id) {');
  if (start < 0) throw new Error('uxChip not found');
  return html.slice(start, html.indexOf('\n};', start) + 3);
}
// Песочница «как в приложении»: профиль и чек-лист задаются явно
function setup(opts) {
  opts = opts || {};
  const s = createSandbox(freshAppData());
  s.run("let uxActionBarSig = '';\n" +
    CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
    FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n' +
    sliceUxChip(HTML) + '\n' +
    "function canUnitShoot(u) { return !!(u && u.canShootStub); }\n" +
    "function getOpReachableHexesForUnit(u) { return [{ col: u.col + 1, row: u.row }]; }\n" +
    "function startOpShooting() { log('shoot'); }\n" +
    "function checkOpDetection() { log('recon'); }\n" +
    "function showBtrEmbarkDialog() { log('embark'); }\n" +
    "function showBtrDisembarkDialog() { log('disembark'); }\n" +
    "function toggleDismount() { log('dismount'); }\n" +
    "function showOrderPanel() { log('order'); }\n" +
    "function onOrderTargetUnitChange() { log('orderChange'); }\n" +
    "var orderPanelMinimized = false;\n" +
    "window.uxCurrentPhase = () => '" + (opts.phase || 'battle') + "';\n");
  if (opts.profile !== undefined) s.run("window.uxProfile = { get: () => '" + opts.profile + "' };");
  s.sandbox.localStorage = {
    getItem: () => (opts.rawChecklist !== undefined ? opts.rawChecklist : JSON.stringify(opts.checklist || {})),
    setItem: () => {}, removeItem: () => {}
  };
  if (opts.online) s.sandbox.appData.campaign.online = true;
  return s;
}
function unit(over) {
  return Object.assign({
    name: 'Стрелковый взвод', type: 'infantry_platoon', mobility: 'foot', col: 5, row: 4,
    ap: 4, maxAp: 4, isInBattle: false, embarkedInBtr: false, embarkedUnit: null,
    dismounted: false, operationalRouted: false, canShootStub: true
  }, over || {});
}
function select(s, u, others) {
  s.sandbox.appData.campaign.opUnits = [u].concat(others || []);
  s.sandbox.appData.campaign.selectedOpUnit = u;
}
const BTR = (over) => unit(Object.assign({ name: 'БТР-80', type: 'btr_platoon', mobility: 'vehicle', ap: 6, maxAp: 6, canShootStub: false }, over || {}));
const chipIds = (s) => JSON.parse(JSON.stringify(s.evalCtx('uxActionBarState().chips.map(c => c.id)')));
const hiddenIds = (s) => JSON.parse(JSON.stringify(s.evalCtx('uxActionBarState().hidden.map(c => c.id)')));
const barHtml = (s) => s.evalCtx("document.getElementById('uxActionBar').innerHTML");
const render = (s) => s.run('uxRenderActionBar();');

test('v13.076: таблица гейтов — UX_GATES и UX_CHIP_GATE по согласованному плану', () => {
  const s = setup({ profile: 'novice' });
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx('UX_GATES'))), {
    btr: { need: 'move', needLabel: '«Двинуть отряд»' },
    dismount: { need: 'move', needLabel: '«Двинуть отряд»' },
    recon: { need: 'shoot', needLabel: '«Открыть огонь»' },
    turn: { need: 'turn', needLabel: '«Завершить ход»' }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx('UX_CHIP_GATE'))),
    { embark: 'btr', disembark: 'btr', dismount: 'dismount', mount: 'dismount', recon: 'recon' });
});
test('v13.076: новичок, чек-лист пуст — пехота в бою: видны «Двигать» и «Обстрел», разведка скрыта', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  assert.deepEqual(chipIds(s), ['move', 'shoot']);
  assert.deepEqual(hiddenIds(s), ['recon']);
});
test('v13.076: новичок — после «Двинуть отряд» (move) открыты посадка/высадка/спешивание', () => {
  const s = setup({ profile: 'novice', checklist: { move: true } });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  assert.ok(chipIds(s).includes('embark'), 'посадка открыта');
  assert.ok(!hiddenIds(s).includes('embark'));
  assert.ok(hiddenIds(s).includes('recon'), 'разведка по-прежнему закрыта');
});
test('v13.076: новичок, без move — посадка в БТР скрыта, подсказка называет «Двинуть отряд»', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  assert.ok(!chipIds(s).includes('embark'), 'посадка скрыта');
  assert.ok(hiddenIds(s).includes('embark'));
  render(s);
  const html = barHtml(s);
  assert.ok(html.includes('🔒 Откроется позже:'), 'подсказка');
  assert.ok(html.includes('🚌 Сесть в БТР (после «Двинуть отряд»)'), 'текст подсказки: ' + html.slice(0, 200));
});
test('v13.076: новичок — спешивание велосипедистов скрыто до move, открыто после', () => {
  const bike = unit({ name: 'Велосипедный взвод', type: 'bicycle_platoon', mobility: 'bicycle', dismounted: false });
  const s = setup({ profile: 'novice' });
  select(s, bike);
  assert.ok(!chipIds(s).includes('dismount'), 'до move');
  s.sandbox.localStorage.getItem = () => JSON.stringify({ move: true });
  s.run('uxRenderActionBar();');
  assert.ok(chipIds(s).includes('dismount'), 'после move');
});
test('v13.076: новичок — разведка открывается после «Открыть огонь» (shoot)', () => {
  const s = setup({ profile: 'novice', checklist: { move: true } });
  select(s, unit());
  assert.ok(hiddenIds(s).includes('recon'));
  s.sandbox.localStorage.getItem = () => JSON.stringify({ move: true, shoot: true });
  s.run('uxRenderActionBar();');
  assert.ok(chipIds(s).includes('recon'), 'разведка открыта');
  assert.equal(hiddenIds(s).length, 0, 'скрытых больше нет');
});
test('v13.076: «Двинуть» и «Обстрел» новичку не гейтятся даже с пустым чек-листом', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  assert.ok(chipIds(s).includes('move') && chipIds(s).includes('shoot'));
});
test('v13.076: «Приказ» (Hard Mode) — не гейтится у новичка', () => {
  const s = setup({ profile: 'novice' });
  s.run('hardMode.enabled = true;');
  select(s, unit());
  assert.ok(chipIds(s).includes('order'), 'приказ виден');
  assert.ok(!hiddenIds(s).includes('order'));
});
test('v13.076: «Обычный» и «Ветеран» — гейтов нет, всё видно сразу', () => {
  ['normal', 'veteran'].forEach((p) => {
    const s = setup({ profile: p });
    select(s, unit());
    assert.ok(chipIds(s).includes('recon'), p + ': разведка');
    assert.equal(hiddenIds(s).length, 0, p + ': скрытых нет');
  });
});
test('v13.076: без записанного профиля действует умолчание «Новичок» (как в приложении)', () => {
  const s = setup({});
  select(s, unit());
  assert.ok(hiddenIds(s).includes('recon'));
});
test('v13.076: онлайн-матч — гейтов нет даже у новичка (Hard Mode и приказы нужны для игры)', () => {
  const s = setup({ profile: 'novice', online: true });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  assert.ok(chipIds(s).includes('recon'), 'разведка');
  assert.ok(chipIds(s).includes('embark'), 'посадка');
  assert.equal(hiddenIds(s).length, 0);
});
test('v13.076: испорченный чек-лист не роняет строку — пункты считаются не отмеченными', () => {
  const s = setup({ profile: 'novice', rawChecklist: '{не json' });
  select(s, unit());
  assert.ok(hiddenIds(s).includes('recon'));
});
test('v13.076: строка без открытых действий, но с закрытыми — нет «нет действий», есть подсказка', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit({ ap: 0, maxAp: 4, canShootStub: false }));
  render(s);
  const html = barHtml(s);
  assert.ok(!html.includes('Сейчас для этого отряда нет доступных действий'), 'ложной фразы нет');
  assert.ok(html.includes('🔍 Разведка (после «Открыть огонь»)'), 'подсказка про разведку');
});
test('v13.076: без закрытых действий подсказки нет', () => {
  const s = setup({ profile: 'veteran' });
  select(s, unit());
  render(s);
  assert.ok(!barHtml(s).includes('🔒'), 'подсказки нет');
});
test('v13.076: подпись строки меняется при открытии гейта — DOM переписывается сразу', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  render(s);
  const before = barHtml(s);
  s.sandbox.localStorage.getItem = () => JSON.stringify({ move: true });
  render(s);
  const after = barHtml(s);
  assert.notEqual(before, after);
  assert.ok(after.includes('🚌 Сесть в БТР') && !after.includes('🔒 Откроется позже: 🚌'), 'посадка появилась');
});
test('v13.076: защита uxChip — закрытый чип не срабатывает (даже если строка устарела)', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  s.run("uxChip('recon');");
  assert.ok(!s.sandbox.logs.includes('recon'), 'разведка не запущена');
  s.sandbox.localStorage.getItem = () => JSON.stringify({ shoot: true });
  s.run("uxChip('recon');");
  assert.ok(s.sandbox.logs.includes('recon'), 'после «Обстрел» — запущена');
});
test('v13.076: uxChip закрытой посадки не открывает диалог до move', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  s.run("uxChip('embark');");
  assert.ok(!s.sandbox.logs.includes('embark'));
});

// ─── 3. применение гейтов к элементам (фиктивный DOM) ───
function fakeEls(s, gates) {
  s.run("window.__els = " + JSON.stringify(gates) + ".map(g => { const set = new Set(); " +
    "return { g: g, getAttribute: () => g, classList: { toggle: (n, f) => { if (f) set.add(n); else set.delete(n); } }, set: set }; });" +
    "document.querySelectorAll = () => window.__els;");
  return () => JSON.parse(JSON.stringify(s.evalCtx('window.__els.map(e => e.set.has("ux-locked"))')));
}
test('v13.076: uxApplyGates — новичок с пустым чек-листом: БТР, спешивание, разведка, «Ещё» — закрыты', () => {
  const s = setup({ profile: 'novice' });
  const locked = fakeEls(s, ['btr', 'dismount', 'recon', 'turn']);
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [true, true, true, true]);
});
test('v13.076: uxApplyGates — после move открыты БТР и спешивание, разведка и «Ещё» закрыты', () => {
  const s = setup({ profile: 'novice', checklist: { move: true } });
  const locked = fakeEls(s, ['btr', 'dismount', 'recon', 'turn']);
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [false, false, true, true]);
});
test('v13.076: uxApplyGates — после move, shoot и turn открыто всё', () => {
  const s = setup({ profile: 'novice', checklist: { move: true, shoot: true, turn: true } });
  const locked = fakeEls(s, ['btr', 'dismount', 'recon', 'turn']);
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [false, false, false, false]);
});
test('v13.076: uxApplyGates — у «Ветерана» и в онлайне ничего не скрыто', () => {
  let s = setup({ profile: 'veteran' });
  let locked = fakeEls(s, ['btr', 'dismount', 'recon', 'turn']);
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [false, false, false, false], 'ветеран');
  s = setup({ profile: 'novice', online: true });
  locked = fakeEls(s, ['btr', 'dismount', 'recon', 'turn']);
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [false, false, false, false], 'онлайн');
});
test('v13.076: uxApplyGates — класс снимается, когда пункт отмечен (обратимо)', () => {
  const s = setup({ profile: 'novice' });
  const locked = fakeEls(s, ['recon']);
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [true]);
  s.sandbox.localStorage.getItem = () => JSON.stringify({ shoot: true });
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [false]);
});

// ─── 4. хук «Двинуть отряд» (вырезан из HTML и запущен в песочнице) ───
const HOOK_START = HTML.indexOf('    // ⚡ v13.076: «Двинуть отряд»');
const HOOK_END = HTML.indexOf('    // Периодически подновляем', HOOK_START);
test('v13.076: старый хук на say() удалён; новый хук стоит в IIFE', () => {
  assert.ok(HOOK_START > 0 && HOOK_END > HOOK_START, 'блок найден');
  assert.ok(!HTML.includes('window.say = function'), 'старой подмены say нет');
  assert.ok(!HTML.includes("const _say = (typeof say === 'function')"), 'старого проверочного кода нет');
});
function runHook(s) {
  s.run("function setChecklistDone(id) { log('done:' + id); }\n(function () {\n" + HTML.slice(HOOK_START, HOOK_END) + "\n})();");
}
function fakeMove(s, mode) {
  s.run("window.__mode = " + JSON.stringify(mode) + ";\n" +
    "window.tryMoveSelectedOpUnitToHex = function () {\n" +
    "  const u = appData.campaign.selectedOpUnit;\n" +
    "  if (window.__mode === 'move' && u) u.col = u.col + 1;\n" +   // настоящий ход: гекс сменился
    "  return true;\n" +                                             // как и в игре: true даже при отказе
    "};");
}
test('v13.076: настоящий ход отмечает «Двинуть отряд»', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  fakeMove(s, 'move');
  runHook(s);
  s.run('tryMoveSelectedOpUnitToHex(1, 1);');
  assert.ok(s.sandbox.logs.includes('done:move'), 'пункт отмечен');
  assert.equal(s.evalCtx('window.tryMoveSelectedOpUnitToHex.__uxMove'), true, 'обёртка помечена');
});
test('v13.076: отказ (true без смены гекса, например нет ОД) пункт не отмечает', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  fakeMove(s, 'refuse');
  runHook(s);
  s.run('tryMoveSelectedOpUnitToHex(1, 1);');
  assert.ok(!s.sandbox.logs.some(l => l.startsWith('done:')), 'ничего не отмечено');
});
test('v13.076: без выбранного отряда обёртка не падает и возвращает результат', () => {
  const s = setup({ profile: 'novice' });
  s.sandbox.appData.campaign.selectedOpUnit = null;
  fakeMove(s, 'move');
  runHook(s);
  assert.equal(s.evalCtx('tryMoveSelectedOpUnitToHex(1, 1)'), true);
  assert.ok(!s.sandbox.logs.some(l => l.startsWith('done:')));
});
test('v13.076: обёртка ставится один раз (повторный запуск не накапливает)', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  fakeMove(s, 'move');
  runHook(s);
  runHook(s);
  s.run('tryMoveSelectedOpUnitToHex(1, 1);');
  assert.equal(s.sandbox.logs.filter(l => l === 'done:move').length, 1, 'одна отметка');
});

// ─── 5. чек-лист обновляет гейты сразу ───
test('v13.076: renderChecklist вызывает uxGatesRefresh (мгновенное открытие)', () => {
  const i = HTML.indexOf('function renderChecklist(st) {');
  const body = HTML.slice(i, HTML.indexOf('function currentPhase()', i));
  assert.ok(body.includes("window.uxGatesRefresh === 'function'") && body.includes('window.uxGatesRefresh()'), 'вызов есть');
});
test('v13.076: uxGatesRefresh = гейты + строка (определён в модуле)', () => {
  assert.ok(HTML.includes('window.uxGatesRefresh = function () { uxApplyGates(); uxRenderActionBar(); };'));
  assert.ok(HTML.includes('window.uxApplyGates = uxApplyGates;'));
});
test('v13.076: профиль по умолчанию — «Новичок» (get() без записи возвращает novice)', () => {
  assert.ok(/return PROFILES\[p\] \? p : 'novice';/.test(HTML));
  assert.ok(/catch \(e\) \{ return 'novice'; \}/.test(HTML));
});

// ─── 6. версия и сопутствующие файлы ───
const APP = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
test('v13.076: APP_VERSION — v13.076 во всех местах (title, h1, бейдж, модуль)', () => {
  assert.equal(APP, 'v13.076');
  assert.ok(HTML.includes('<title>Боевой модуль v13.076 — операция</title>'));
  assert.ok(HTML.includes('<h1>⚔️ Боевой модуль v13.076</h1>'));
  assert.ok(HTML.includes('id="appVersionBadge" style="color:#f1c40f; margin-top:24px; font-size:0.95rem;">v13.076</p>'));
  assert.ok(HTML.includes('<h2 id="battleModuleTitle">⚔️ Боевой модуль v13.076 — операция </h2>'));
});
test('v13.076: SW-кэш, манифест и BUILD-маркеры — v13.076', () => {
  assert.ok(read('service-worker.js').includes("const CACHE_NAME = 'wargame-v13.076';"));
  assert.ok(read('manifest.json').includes('"short_name": "БМ v13.076"'));
  assert.ok(read('service-worker.js').split('\n')[0].includes('BUILD-МАРКЕР: v13.076'));
  ['js/cards.js', 'js/data.js', 'js/hexmaps.js', 'js/templates.js'].forEach((f) => {
    assert.ok(read(f).split('\n')[0].includes('BUILD-МАРКЕР: v13.076'), f);
  });
});
test('v13.076: CHANGELOG-v13.076.md описывает значения по умолчанию и исправления', () => {
  const p = path.join(ROOT, 'CHANGELOG-v13.076.md');
  assert.ok(fs.existsSync(p), 'файл есть');
  const t = fs.readFileSync(p, 'utf8');
  assert.ok(t.includes('F3'), 'F3');
  assert.ok(/по умолчанию/i.test(t), 'значения по умолчанию названы');
  assert.ok(t.includes('say'), 'исправление хука say');
  assert.ok(/талреп/i.test(t), 'решение по талрепу');
  assert.ok(/Объединить/.test(t), 'решение по «Объединить»');
});

console.log(`\nИтог v13.076: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) process.exitCode = 1;
