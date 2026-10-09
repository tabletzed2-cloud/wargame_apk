// ⚡ v13.076: F3 — гейты новичка (UX_GATES): БТР, спешивание, разведка и редкие
//    пункты «⚡ Ещё» до нужного пункта чек-листа. Только профиль «Новичок», не онлайн.
// ⚡ v13.077: РЕШЕНИЕ ИГРОКА — гейты отменены: функционал новичку НЕ режется,
//    вместо скрытия — подсказки (💡 в строке чипов + пульсация кнопки шага).
//    Этот файл теперь проверяет НОВОЕ поведение (всё открыто, подсказки вместо
//    гейтов). Структурные проверки (атрибуты data-ux-gate, таблицы UX_GATES/
//    UX_CHIP_GATE, CSS-классы) сохранены — механизм остался в коде как «предохранитель».
//    Подробности: CHANGELOG-v13.077.md.
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

// ─── 1. разметка: атрибуты-предохранители на нужных элементах ───
test('v13.076: .ux-locked существует как предохранитель, стили подсказок v13.077 есть', () => {
  assert.ok(/\.ux-locked \{ display:none !important; \}/.test(HTML), 'класс-предохранитель');
  assert.ok(/\.ux-action-bar \.ux-ab-lock \{/.test(HTML), 'стиль старой строки сохранён');
  assert.ok(/\.ux-action-bar \.ux-ab-hint \{/.test(HTML), 'стиль новой подсказки 💡');
  assert.ok(/\.ux-chip-hint \{/.test(HTML), 'стиль подсказочного чипа');
  assert.ok(/@keyframes uxHintGlow/.test(HTML), 'анимация пульсации кнопки шага');
  assert.ok(/\.ux-hint-glow \{/.test(HTML), 'класс пульсации');
});
test('v13.076: количество атрибутов data-ux-gate в разметке — 9 (БТР 3, спешивание 2, разведка 1, «Ещё» 3)', () => {
  assert.equal((HTML.match(/data-ux-gate="/g) || []).length, 9);
});
test('v13.076: БТР-панель и её кнопки — атрибут btr (в v13.077 не скрывается)', () => {
  assert.ok(tag(/<div id="btrPanel"[^>]*>/).includes('data-ux-gate="btr"'), 'btrPanel');
  assert.ok(tag(/<button[^>]*id="btrEmbarkBtn"[^>]*>/).includes('data-ux-gate="btr"'), 'btrEmbarkBtn');
  assert.ok(tag(/<button[^>]*id="btrDisembarkBtn"[^>]*>/).includes('data-ux-gate="btr"'), 'btrDisembarkBtn');
});
test('v13.076: спешивание — атрибут dismount (панель и кнопка)', () => {
  assert.ok(tag(/<div id="dismountPanel"[^>]*>/).includes('data-ux-gate="dismount"'), 'dismountPanel');
  assert.ok(tag(/<button[^>]*id="dismountBtn"[^>]*>/).includes('data-ux-gate="dismount"'), 'dismountBtn');
});
test('v13.076: 🔍 «Проверить обнаружение» — атрибут recon', () => {
  assert.ok(tag(/<button onclick="checkOpDetection\(\)"[^>]*>/).includes('data-ux-gate="recon"'));
});
test('v13.076: в «⚙️ Ещё» атрибуты turn только у Разбить / Переименовать / Состав', () => {
  const a = HTML.indexOf('<div id="uxMoreMenu"');
  const b = HTML.indexOf('<div id="opHexMenuStatus"', a);
  const menu = HTML.slice(a, b);
  assert.ok(/id="splitBtn"[^>]*data-ux-gate="turn"/.test(menu), 'splitBtn');
  assert.ok(/id="renameBtn"[^>]*data-ux-gate="turn"/.test(menu), 'renameBtn');
  assert.ok(/id="detailsBtn"[^>]*data-ux-gate="turn"/.test(menu), 'detailsBtn');
  assert.equal((menu.match(/data-ux-gate="turn"/g) || []).length, 3, 'ровно три');
});
test('v13.076: минимум новичку без атрибутов — размещение, ДОТы, авторазмещение, финиш', () => {
  assert.ok(!tag(/<button onclick="setOpMapMode\('placePlayer'\)"[^>]*>/).includes('data-ux-gate'), 'размещение');
  assert.ok(!tag(/<button[^>]*id="btnInitialFortificationSetup"[^>]*>/).includes('data-ux-gate'), 'ДОТы');
  assert.ok(!tag(/<button onclick="autoPlaceUnplacedUnits\(\{ manual: true \}\)"[^>]*>/).includes('data-ux-gate'), 'авторазмещение');
  assert.ok(!tag(/<button[^>]*id="btnFinishPlacement"[^>]*>/).includes('data-ux-gate'), 'завершить размещение');
});
test('v13.076: минимум новичку без атрибутов — перемещение, обстрел, завершить ход', () => {
  assert.ok(!tag(/<button onclick="setOpMapMode\('move'\)"[^>]*>/).includes('data-ux-gate'), 'перемещение');
  assert.ok(!tag(/<button onclick="startOpShooting\(\)"[^>]*>/).includes('data-ux-gate'), 'обстрел');
  assert.ok(!tag(/<button id="opEndTurnBtn"[^>]*>/).includes('data-ux-gate'), 'завершить ход');
});
test('v13.076: «⚙️ Ещё», «📦 Объединить» и талреп-якорь без атрибутов', () => {
  assert.ok(!tag(/<button id="uxMoreBtn"[^>]*>/).includes('data-ux-gate'), 'кнопка «Ещё»');
  assert.ok(!tag(/<button onclick="showGroupDialog\(\)" id="groupBtn"[^>]*>/).includes('data-ux-gate'), 'объединение');
  const winch = tag(/<button id="winchBtn"[^>]*>/);
  assert.ok(winch && !winch.includes('data-ux-gate'), 'талреп-якорь');
});
test('v13.076: приказы не гейтятся (видимость — только Hard Mode, как и раньше)', () => {
  assert.ok(!/data-ux-gate="order"/.test(HTML));
  assert.ok(!/uxChipOpen\('order'\)|UX_CHIP_GATE\.order/.test(HTML));
});

// ─── 2. таблицы и логика (v13.077: гейты отменены — всё открыто) ───
const CONSTS = ['UX_GATES', 'UX_CHIP_GATE', 'UX_CHECKLIST_KEY'];
const FNS = ['uxEsc', 'uxPhaseNow', 'uxIsBtrUnit', 'uxIsVehicleUnit', 'uxBikeLike', 'uxHasBikePark', 'uxFindEmbarkBtr',
  'uxBuildChips', 'uxActionBarState', 'uxRenderActionBar', 'uxDoMove', 'uxOpenOrder', 'uxInstallRedrawHook',
  'uxGatesOn', 'uxChecklistDone', 'uxGateOpen', 'uxChipOpen', 'uxApplyGates', 'uxLockHint', 'uxHintNote', 'uxHintGlowTargets', 'uxApplyHintGlow',
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
  if (opts.profile !== undefined) s.run("window.uxProfile = { get: () => '" + opts.profile + "', data: () => ({ showOnboarding: '" + opts.profile + "' !== 'veteran' }) };");
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
const hintIds = (s) => JSON.parse(JSON.stringify(s.evalCtx('uxActionBarState().hints.map(c => c.id)')));
const barHtml = (s) => s.evalCtx("document.getElementById('uxActionBar').innerHTML");
const render = (s) => s.run('uxRenderActionBar();');

test('v13.076: таблицы UX_GATES/UX_CHIP_GATE сохранены (задают подсказки, а не скрытие)', () => {
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
test('v13.077: uxGateOpen/uxChipOpen — ВСЕГДА true (гейты отменены)', () => {
  const s = setup({ profile: 'novice' }); // чек-лист пуст
  assert.equal(s.evalCtx("uxGateOpen('recon')"), true);
  assert.equal(s.evalCtx("uxChipOpen('recon')"), true);
  assert.equal(s.evalCtx("uxChipOpen('embark')"), true);
  s.sandbox.localStorage.getItem = () => JSON.stringify({ move: true, shoot: true, turn: true });
  assert.equal(s.evalCtx("uxGateOpen('btr')"), true);
});
test('v13.077: новичок, чек-лист пуст — ВСЕ чипы видны, разведка — в подсказках', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  assert.deepEqual(chipIds(s), ['move', 'shoot', 'recon'], 'все чипы в строке');
  assert.deepEqual(hiddenIds(s), [], 'ничего не скрыто');
  assert.deepEqual(hintIds(s), ['recon'], 'разведка — подсказка');
});
test('v13.077: новичок — посадка в БТР видна сразу; после «Двинуть отряд» уходит из подсказок', () => {
  const s = setup({ profile: 'novice', checklist: { move: true } });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  assert.ok(chipIds(s).includes('embark'), 'посадка видна');
  assert.ok(!hintIds(s).includes('embark'), 'после move — не подсказка');
  assert.ok(hintIds(s).includes('recon'), 'разведка — ещё подсказка');
  s.sandbox.localStorage.getItem = () => JSON.stringify({});
  render(s);
  assert.ok(hintIds(s).includes('embark'), 'до move — в подсказках (но видна!)');
});
test('v13.077: новичок, без move — чип «Сесть в БТР» В СТРОКЕ, подсказка 💡 называет «Двинуть отряд»', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  assert.ok(chipIds(s).includes('embark'), 'посадка видна');
  render(s);
  const html = barHtml(s);
  assert.ok(html.includes('💡 Всё открыто'), 'подсказка 💡: ' + html.slice(0, 200));
  assert.ok(html.includes('🚌 Сесть в БТР — по мере освоения: «Двинуть отряд»'), 'текст подсказки');
  assert.ok(html.includes('ux-chip-hint'), 'чип помечен классом подсказки');
  assert.ok(!html.includes('🔒'), 'старого «🔒 Откроется позже» нет');
});
test('v13.077: новичок — спешивание велосипеда видно и до, и после move', () => {
  const bike = unit({ name: 'Велосипедный взвод', type: 'bicycle_platoon', mobility: 'bicycle', dismounted: false });
  const s = setup({ profile: 'novice' });
  select(s, bike);
  assert.ok(chipIds(s).includes('dismount'), 'до move — виден');
  s.sandbox.localStorage.getItem = () => JSON.stringify({ move: true });
  s.run('uxRenderActionBar();');
  assert.ok(chipIds(s).includes('dismount'), 'после move — виден');
});
test('v13.077: новичок — разведка видна сразу; после «Открыть огонь» исчезает из подсказок', () => {
  const s = setup({ profile: 'novice', checklist: { move: true } });
  select(s, unit());
  assert.ok(chipIds(s).includes('recon'), 'разведка видна');
  assert.ok(hintIds(s).includes('recon'), 'до shoot — подсказка');
  s.sandbox.localStorage.getItem = () => JSON.stringify({ move: true, shoot: true });
  s.run('uxRenderActionBar();');
  assert.ok(chipIds(s).includes('recon'), 'разведка видна');
  assert.equal(hintIds(s).length, 0, 'подсказок больше нет');
});
test('v13.077: «Двинуть» и «Обстрел» новичку не подсказываются (это база)', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  assert.ok(!hintIds(s).includes('move'));
  assert.ok(!hintIds(s).includes('shoot'));
});
test('v13.077: «Приказ» (Hard Mode) — и чип, и без подсказки', () => {
  const s = setup({ profile: 'novice' });
  s.run('hardMode.enabled = true;');
  select(s, unit());
  assert.ok(chipIds(s).includes('order'), 'приказ виден');
  assert.ok(!hintIds(s).includes('order'));
});
test('v13.077: «Обычный» и «Ветеран» — все чипы, подсказок нет', () => {
  ['normal', 'veteran'].forEach((p) => {
    const s = setup({ profile: p });
    select(s, unit());
    assert.ok(chipIds(s).includes('recon'), p + ': разведка');
    assert.equal(hiddenIds(s).length, 0, p + ': скрытых нет');
    assert.equal(hintIds(s).length, 0, p + ': подсказок нет');
  });
});
test('v13.077: без записанного профиля действует умолчание «Новичок» — подсказки на', () => {
  const s = setup({});
  select(s, unit());
  assert.deepEqual(chipIds(s), ['move', 'shoot', 'recon'], 'всё видно');
  assert.deepEqual(hintIds(s), ['recon'], 'но новичок подсвечивается');
});
test('v13.077: онлайн-матч — все чипы и без подсказок (Hard Mode и приказы нужны для игры)', () => {
  const s = setup({ profile: 'novice', online: true });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  assert.ok(chipIds(s).includes('recon'), 'разведка');
  assert.ok(chipIds(s).includes('embark'), 'посадка');
  assert.equal(hiddenIds(s).length, 0);
  assert.equal(hintIds(s).length, 0, 'в онлайне подсказок нет');
});
test('v13.077: испорченный чек-лист не роняет строку — подсказки как при пустом', () => {
  const s = setup({ profile: 'novice', rawChecklist: '{не json' });
  select(s, unit());
  assert.ok(hintIds(s).includes('recon'));
  assert.deepEqual(hiddenIds(s), []);
});
test('v13.077: 0 ОД — чип разведки в строке, «нет действий» не показывается, подсказка есть', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit({ ap: 0, maxAp: 4, canShootStub: false }));
  render(s);
  const html = barHtml(s);
  assert.ok(!html.includes('Сейчас для этого отряда нет доступных действий'), 'ложной фразы нет');
  assert.ok(html.includes('🔍 Разведка — по мере освоения: «Открыть огонь»'), 'подсказка про разведку');
});
test('v13.077: у «Ветерана» строки «💡 Всё открыто» нет', () => {
  const s = setup({ profile: 'veteran' });
  select(s, unit());
  render(s);
  assert.ok(!barHtml(s).includes('💡 Всё открыто'), 'подсказки нет');
  assert.ok(!barHtml(s).includes('🔒'), '🔒 нет');
});
test('v13.077: DOM строки обновляется при отметке чек-листа (подсказка исчезает)', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  render(s);
  const before = barHtml(s);
  s.sandbox.localStorage.getItem = () => JSON.stringify({ move: true });
  render(s);
  const after = barHtml(s);
  assert.notEqual(before, after);
  assert.ok(after.includes('🚌 Сесть в БТР'), 'посадка видна и после');
  assert.ok(!after.includes('🚌 Сесть в БТР — по мере освоения'), 'из подсказок ушла');
});
test('v13.077: uxChip — действие доступно сразу, независимо от чек-листа (гейтов нет)', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  s.run("uxChip('recon');");
  assert.ok(s.sandbox.logs.includes('recon'), 'разведка запущена сразу');
});
test('v13.077: uxChip «Сесть в БТР» открывает диалог сразу (до move)', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit(), [BTR({ col: 5, row: 4, isGroup: true, groupSize: 5 })]);
  s.run("uxChip('embark');");
  assert.ok(s.sandbox.logs.includes('embark'), 'диалог открыт');
});
test('v13.077: uxChip на несуществующем/уходящем чипе — безопасно (строка перечитывается)', () => {
  const s = setup({ profile: 'novice' });
  select(s, unit());
  s.run("uxChip('order');"); // чипа «Приказ» нет (Hard Mode выкл.)
  assert.ok(!s.sandbox.logs.includes('order'), 'панель приказов не открыта');
});

// ─── 3. применение к элементам (фиктивный DOM) — гейты НЕСКРЫВАЮТ НИЧЕГО ───
function fakeEls(s, gates) {
  s.run("window.__els = " + JSON.stringify(gates) + ".map(g => { const set = new Set(); " +
    "return { g: g, getAttribute: () => g, classList: { toggle: (n, f) => { if (f) set.add(n); else set.delete(n); }, " +
    "add: (n) => set.add(n), remove: (n) => set.delete(n) }, set: set }; });" +
    "document.querySelectorAll = () => window.__els;");
  return () => JSON.parse(JSON.stringify(s.evalCtx('window.__els.map(e => e.set.has("ux-locked"))')));
}
test('v13.077: uxApplyGates — новичок с пустым чек-листом: ничего НЕ скрыто', () => {
  const s = setup({ profile: 'novice' });
  const locked = fakeEls(s, ['btr', 'dismount', 'recon', 'turn']);
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [false, false, false, false]);
});
test('v13.077: uxApplyGates — снимает устаревший .ux-locked (наследие v13.076)', () => {
  const s = setup({ profile: 'novice' });
  fakeEls(s, ['recon']);
  s.run('window.__els[0].set.add("ux-locked"); uxApplyGates();');
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx('window.__els.map(e => e.set.has("ux-locked"))'))), [false], 'класс снят');
});
test('v13.077: uxApplyGates — у «Ветерана» и в онлайне тоже ничего не скрыто', () => {
  let s = setup({ profile: 'veteran' });
  let locked = fakeEls(s, ['btr', 'dismount', 'recon', 'turn']);
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [false, false, false, false], 'ветеран');
  s = setup({ profile: 'novice', online: true });
  locked = fakeEls(s, ['btr', 'dismount', 'recon', 'turn']);
  s.run('uxApplyGates();');
  assert.deepEqual(locked(), [false, false, false, false], 'онлайн');
});

// ─── 4. подсказка-пульсация кнопки текущего шага (v13.077) ───
test('v13.077: uxHintGlowTargets — новичок в бою с пустым чек-листом: «Перемещение»', () => {
  const s = setup({ profile: 'novice', phase: 'battle' });
  const t = JSON.parse(JSON.stringify(s.evalCtx('uxHintGlowTargets()')));
  assert.ok(t.includes("#opPhaseBattle button[onclick=\"setOpMapMode('move')\"]"), 'светится «Перемещение»: ' + t.join(' '));
});
test('v13.077: uxHintGlowTargets — после move: «Обстрел», после shoot: «Завершить ход», после turn: пусто', () => {
  let s = setup({ profile: 'novice', phase: 'battle', checklist: { move: true } });
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx('uxHintGlowTargets()'))),
    ["#opPhaseBattle button[onclick=\"startOpShooting()\"]"]);
  s = setup({ profile: 'novice', phase: 'battle', checklist: { move: true, shoot: true } });
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx('uxHintGlowTargets()'))), ['#opEndTurnBtn']);
  s = setup({ profile: 'novice', phase: 'battle', checklist: { move: true, shoot: true, turn: true } });
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx('uxHintGlowTargets()'))), [], 'все шаги пройдены — без пульсации');
});
test('v13.077: uxHintGlowTargets — развёртывание: «Размещение»+«Авторазмещение», затем «Завершить размещение»', () => {
  let s = setup({ profile: 'novice', phase: 'deploy' });
  s.run('getUnplacedOpUnits = () => [{ col: null, row: null }];');
  const t1 = JSON.parse(JSON.stringify(s.evalCtx('uxHintGlowTargets()')));
  assert.ok(t1.some(x => x.indexOf('placePlayer') >= 0) && t1.some(x => x.indexOf('autoPlaceUnplacedUnits') >= 0), 'кнопки размещения: ' + t1.join(' '));
  s = setup({ profile: 'novice', phase: 'deploy' });
  s.run('getUnplacedOpUnits = () => [];');
  const t2 = JSON.parse(JSON.stringify(s.evalCtx('uxHintGlowTargets()')));
  assert.deepEqual(t2, ['#btnFinishPlacement'], '«Завершить размещение»');
});
test('v13.077: uxHintGlowTargets — не новичку и в онлайне — пусто', () => {
  let s = setup({ profile: 'veteran', phase: 'battle' });
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx('uxHintGlowTargets()'))), [], 'ветеран');
  s = setup({ profile: 'novice', phase: 'battle', online: true });
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx('uxHintGlowTargets()'))), [], 'онлайн');
});
test('v13.077: applyUxPhase вызывает uxApplyHintGlow (раз в 1.5 с и на смене фазы)', () => {
  const i = HTML.indexOf('function applyUxPhase() {');
  const body = HTML.slice(i, HTML.indexOf('function toggleUxMoreMenu()', i));
  assert.ok(body.includes('window.uxApplyHintGlow === \'function\'') && body.includes('window.uxApplyHintGlow()'), 'вызов есть');
});

// ─── 5. хук «Двинуть отряд» (вырезан из HTML и запущен в песочнице) ───
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

// ─── 6. чек-лист обновляет строку и подсказки сразу ───
test('v13.076: renderChecklist вызывает uxGatesRefresh (мгновенное обновление)', () => {
  const i = HTML.indexOf('function renderChecklist(st) {');
  const body = HTML.slice(i, HTML.indexOf('function currentPhase()', i));
  assert.ok(body.includes("window.uxGatesRefresh === 'function'") && body.includes('window.uxGatesRefresh()'), 'вызов есть');
});
test('v13.077: uxGatesRefresh = снять предохранители + строка; пульсация экспортирована', () => {
  assert.ok(HTML.includes('window.uxGatesRefresh = function () { uxApplyGates(); uxRenderActionBar(); };'));
  assert.ok(HTML.includes('window.uxApplyGates = uxApplyGates;'));
  assert.ok(HTML.includes('window.uxApplyHintGlow = uxApplyHintGlow;'));
  assert.ok(HTML.includes('window.uxHintGlowTargets = uxHintGlowTargets;'));
});
test('v13.076: профиль по умолчанию — «Новичок» (get() без записи возвращает novice)', () => {
  assert.ok(/return PROFILES\[p\] \? p : 'novice';/.test(HTML));
  assert.ok(/catch \(e\) \{ return 'novice'; \}/.test(HTML));
});
test('v13.077: описание профиля «Новичок» — функционал не режется', () => {
  assert.ok(HTML.includes('Весь функционал открыт, подсказки ведут по шагам'), 'текст профиля');
  assert.ok(!/desc: 'Меньше кнопок, больше подсказок/.test(HTML), 'старый текст убран');
});

// ─── 7. версия и сопутствующие файлы (⚡ v13.077: относительно APP_VERSION) ───
const APP = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
const APP_RE = APP.replace('.', '\\.');
test('v13.076: APP_VERSION, title, h1, бейдж и модуль — согласованы с APP_VERSION', () => {
  assert.ok(HTML.includes('<title>Боевой модуль ' + APP + ' — операция</title>'));
  assert.ok(HTML.includes('<h1>⚔️ Боевой модуль ' + APP + '</h1>'));
  assert.ok(HTML.includes('id="appVersionBadge" style="color:#f1c40f; margin-top:24px; font-size:0.95rem;">' + APP + '</p>'));
  assert.ok(HTML.includes('<h2 id="battleModuleTitle">⚔️ Боевой модуль ' + APP + ' — операция </h2>'));
});
test('v13.076: SW-кэш и манифест — согласованы с APP_VERSION', () => {
  assert.ok(read('service-worker.js').includes("const CACHE_NAME = 'wargame-" + APP + "';"));
  assert.ok(read('manifest.json').includes('"short_name": "БМ ' + APP + '"'));
});
test('v13.076: BUILD-маркеры в шапках service-worker.js и js/*.js — согласованы с APP_VERSION', () => {
  assert.ok(read('service-worker.js').split('\n')[0].includes('BUILD-МАРКЕР: ' + APP));
  ['js/cards.js', 'js/data.js', 'js/hexmaps.js', 'js/templates.js'].forEach((f) => {
    assert.ok(read(f).split('\n')[0].includes('BUILD-МАРКЕР: ' + APP), f);
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
test('v13.077: CHANGELOG-v13.077.md на месте и описывает отмену гейтов', () => {
  const p = path.join(ROOT, 'CHANGELOG-v13.077.md');
  assert.ok(fs.existsSync(p), 'файл есть');
  const t = fs.readFileSync(p, 'utf8');
  assert.ok(t.includes('F3') && /подсказк/i.test(t), 'F3 + подсказки');
  assert.ok(/A\.I\.R\.F/i.test(t) && /окоп/i.test(t), 'туман войны по окопам');
  assert.ok(/легенд/i.test(t), 'легенда знаков');
  assert.ok(/рельеф/i.test(t), 'рельеф тактической карты');
  assert.ok(/Быстрый старт/i.test(t), 'исправление быстрого старта');
});

console.log(`\nИтог v13.076: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) process.exitCode = 1;
