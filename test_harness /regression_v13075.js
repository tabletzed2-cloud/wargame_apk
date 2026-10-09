// ⚡ v13.075: безрежимные действия — клик по своему отряду сразу показывает
//    строку чипов #uxActionBar (без предварительного выбора режима).
//    Набор чипов зависит от фазы, ОД, посадки, типа/мобильности и состояния боя.
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

// ─── 1. разметка и место строки ───
test('v13.075: #uxActionBar есть и скрыт по умолчанию', () => {
  assert.equal((HTML.match(/id="uxActionBar"/g) || []).length, 1, 'ровно один элемент');
  assert.ok(/id="uxActionBar" class="ux-action-bar"[^>]*style="display:none;"/.test(HTML), 'display:none по умолчанию');
});
test('v13.075: строка стоит внутри #uxPhaseBar, под #opNextStepBar и до групп фаз', () => {
  const bar = HTML.indexOf('id="uxPhaseBar"');
  const step = HTML.indexOf('id="opNextStepBar"');
  const act = HTML.indexOf('id="uxActionBar"');
  const onb = HTML.indexOf('id="opOnboardingPanel"');
  const phase = HTML.indexOf('id="opPhaseDeploy"');
  assert.ok(bar > 0 && step > bar, 'uxPhaseBar содержит opNextStepBar');
  assert.ok(act > step && act < onb, 'строка между «Следующим шагом» и чек-листом');
  assert.ok(act < phase, 'строка выше групп фаз');
});
test('v13.075: старые кнопки фаз и панели не удалены', () => {
  ['opPhaseDeploy', 'opPhaseBattle', 'opPhaseRare', 'btrPanel', 'dismountPanel', 'uxMoreMenu', 'uxMoreBtn', 'opBtrSlot', 'opNextStepBar', 'opOnboardingPanel', 'orderTargetUnit', 'opMapCanvas']
    .forEach((id) => assert.ok(new RegExp('id="' + id + '"').test(HTML), 'id ' + id + ' на месте'));
});
test('v13.075: стили чипов и строки определены', () => {
  assert.ok(/\.ux-action-bar \{/.test(HTML), 'контейнер');
  assert.ok(/\.ux-action-bar \.ux-chip \{/.test(HTML), 'чип');
  assert.ok(/\.ux-action-bar \.ux-chip:disabled/.test(HTML), 'состояние «ход оппонента»');
});

// ─── 2. связки: перерисовка, фазы, выбор отряда ───
test('v13.075: обёртка redrawOperationalMap ставится при загрузке', () => {
  assert.ok(/^uxInstallRedrawHook\(\);$/m.test(HTML), 'вызов установки обёртки');
  assert.ok(/window\.redrawOperationalMap = wrapped;/.test(HTML), 'подмена глобала');
});
test('v13.075: applyUxPhase тоже обновляет строку (периодическое обновление)', () => {
  assert.ok(/typeof window\.uxRenderActionBar === 'function'\) window\.uxRenderActionBar\(\)/.test(HTML), 'вызов в applyUxPhase');
  assert.ok(/window\.uxCurrentPhase = currentPhase;/.test(HTML), 'фаза экспортирована');
});
test('v13.075: смена выбранного отряда сбрасывает старую подсветку маршрута', () => {
  assert.ok(/if \(appData\.campaign\.selectedOpUnit !== clickedUnitView\) \{/.test(HTML), 'условие смены выбора');
  assert.ok(/delete u\.availableHexes/.test(HTML), 'очистка availableHexes');
});
test('v13.075: «Двигать» не вызывает setOpMapMode (тот очищает выбор отряда)', () => {
  const i = HTML.indexOf('function uxDoMove');
  const chunk = HTML.slice(i, HTML.indexOf('\n}', i));
  assert.ok(!chunk.includes('setOpMapMode('), 'uxDoMove не трогает setOpMapMode');
  assert.ok(chunk.includes('getOpReachableHexesForUnit'), 'подсветка через досягаемость');
});
test('v13.075: «Приказ» в чипах только при включённом Hard Mode', () => {
  const i = HTML.indexOf('function uxBuildChips');
  const chunk = HTML.slice(i, HTML.indexOf('\n}', i));
  assert.ok(/if \(hardMode && hardMode\.enabled\) add\('order'/.test(chunk), 'гейт Hard Mode');
});
test('v13.075: нажатие чипа перепроверяет доступность (устаревшая строка не действует)', () => {
  const i = HTML.indexOf('window.uxChip = function (id) {');
  const chunk = HTML.slice(i, HTML.indexOf('\n};', i));
  assert.ok(/!st\.chips\.some\(c => c\.id === id\)/.test(chunk), 'проверка по актуальному набору');
  assert.ok(/st\.locked/.test(chunk), 'блок во время хода оппонента');
});

// ─── 3. поведение чипов (песочница) ───
function sliceUxChip(html) {
  const start = html.indexOf('window.uxChip = function (id) {');
  if (start < 0) throw new Error('uxChip not found');
  return html.slice(start, html.indexOf('\n};', start) + 3);
}
// ⚡ v13.076: к модулю добавлены гейты F3 (функции и таблицы). Набор v13.075 их не трогает:
//    профиль в песочнице — «Ветеран» (гейты выключены), поэтому проверки чипов остаются прежними.
const FNS = ['uxEsc', 'uxPhaseNow', 'uxIsBtrUnit', 'uxIsVehicleUnit', 'uxBikeLike', 'uxHasBikePark', 'uxFindEmbarkBtr',
  'uxBuildChips', 'uxActionBarState', 'uxRenderActionBar', 'uxDoMove', 'uxOpenOrder', 'uxInstallRedrawHook',
  'uxGatesOn', 'uxChecklistDone', 'uxGateOpen', 'uxChipOpen', 'uxApplyGates', 'uxLockHint',
  'isStaticOpUnit', 'getUnitBtrRequirement'];
const CONSTS = ['UX_GATES', 'UX_CHIP_GATE', 'UX_CHECKLIST_KEY'];

function setup(phase) {
  const s = createSandbox(freshAppData());
  s.run("let uxActionBarSig = '';\n" +
    CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
    "window.uxProfile = { get: () => 'veteran' };\n" +
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
    "window.uxCurrentPhase = () => '" + (phase || 'battle') + "';\n");
  return s;
}
function unit(over) {
  return Object.assign({
    name: 'Стрелковый взвод', type: 'infantry_platoon', mobility: 'foot', col: 5, row: 4,
    ap: 4, maxAp: 4, isInBattle: false, embarkedInBtr: false, embarkedUnit: null,
    dismounted: false, operationalRouted: false, canShootStub: true
  }, over || {});
}
// Ставит отряд выбранным; opUnits — весь список (БТР на гексе и т.п.)
function select(s, u, others) {
  s.sandbox.appData.campaign.opUnits = [u].concat(others || []);
  s.sandbox.appData.campaign.selectedOpUnit = u;
}
function chipIds(s) {
  return JSON.parse(JSON.stringify(s.evalCtx('uxBuildChips(appData.campaign.selectedOpUnit, uxPhaseNow()).map(c => c.id)')));
}
function render(s) { s.run('uxRenderActionBar();'); }
function barState(s) {
  return s.evalCtx("({ display: document.getElementById('uxActionBar').style.display, html: document.getElementById('uxActionBar').innerHTML })");
}
const BTR = (over) => unit(Object.assign({ name: 'БТР-80', type: 'btr_platoon', mobility: 'vehicle', ap: 6, maxAp: 6, canShootStub: false }, over || {}));

test('v13.075: без выбранного отряда строка скрыта', () => {
  const s = setup('battle');
  s.sandbox.appData.campaign.selectedOpUnit = null;
  render(s);
  assert.equal(barState(s).display, 'none');
});
test('v13.075: пехота в бою — движение, обстрел, разведка (без приказа, т.к. Hard Mode выкл.)', () => {
  const s = setup('battle');
  select(s, unit());
  assert.deepEqual(chipIds(s), ['move', 'shoot', 'recon']);
  render(s);
  const st = barState(s);
  assert.equal(st.display, 'flex', 'строка показана');
  assert.ok(st.html.includes('data-chip="move"') && st.html.includes('data-chip="shoot"') && st.html.includes('data-chip="recon"'));
  assert.ok(!st.html.includes('data-chip="order"'), 'приказа нет при выключенном Hard Mode');
});
test('v13.075: в развёртывании боевых действий нет (пояснение вместо пустоты)', () => {
  const s = setup('deploy');
  select(s, unit());
  assert.deepEqual(chipIds(s), []);
  render(s);
  assert.ok(barState(s).html.includes('нет доступных действий'), 'пояснение вместо пустоты');
});
test('v13.075: 0 ОД — нет «Двигать» и «Обстрел», разведка остаётся', () => {
  const s = setup('battle');
  select(s, unit({ ap: 0 }));
  assert.deepEqual(chipIds(s), ['recon']);
});
test('v13.075: «Обстрел» — только если canUnitShoot разрешает', () => {
  const s = setup('battle');
  select(s, unit({ canShootStub: false }));
  assert.deepEqual(chipIds(s), ['move', 'recon']);
});
test('v13.075: отряд в БТР — «Высадить» (и без координат, и на карте)', () => {
  const s = setup('battle');
  select(s, unit({ embarkedInBtr: true, col: null, row: null }));
  assert.deepEqual(chipIds(s), ['disembark']);
  render(s);
  assert.ok(!barState(s).html.includes('ещё не на карте'), 'в БТР — не «не на карте»');
  select(s, unit({ embarkedInBtr: true, col: 5, row: 4 }));
  assert.deepEqual(chipIds(s), ['disembark']);
});
test('v13.075: пехота на гексе с БТР — «Сесть в БТР» (при достаточной группе)', () => {
  const s = setup('battle');
  select(s, unit({ name: 'Стрелковый взвод' }), [BTR({ isGroup: true, groupSize: 5 })]);
  assert.ok(chipIds(s).includes('embark'), 'группа из 5 машин на том же гексе — чип посадки');
});
test('v13.075: посадка проверяет размер группы БТР (как в диалоге)', () => {
  const s = setup('battle');
  select(s, unit({ name: 'Стрелковый взвод' }), [BTR({ isGroup: true, groupSize: 3 })]);   // нужно 5
  assert.ok(!chipIds(s).includes('embark'), 'группа из 3 машин не берёт взвод на 5');
  s.sandbox.appData.campaign.opUnits[1].groupSize = 5;
  assert.ok(chipIds(s).includes('embark'), 'группа из 5 машин берёт');
});
test('v13.075: занятый БТР (с десантом) не предлагается для посадки', () => {
  const s = setup('battle');
  select(s, unit(), [BTR({ isGroup: true, groupSize: 5 })]);
  assert.ok(chipIds(s).includes('embark'), 'контроль: свободная группа из 5 — посадка есть');
  select(s, unit(), [BTR({ isGroup: true, groupSize: 5, embarkedUnit: 'Другой взвод' })]);
  assert.ok(!chipIds(s).includes('embark'), 'занятый — нет');
});
test('v13.075: техника и БТР не садятся в БТР', () => {
  const s = setup('battle');
  const bigBtr = BTR({ isGroup: true, groupSize: 9 });   // размер достаточен: исключает только тип
  select(s, unit({ name: 'Танковый взвод', type: 'tank_platoon', mobility: 'vehicle' }), [bigBtr]);
  assert.ok(!chipIds(s).includes('embark'), 'танк не садится');
  select(s, BTR({ name: 'БТР-82', isGroup: true, groupSize: 9 }), [BTR({ isGroup: true, groupSize: 9 })]);
  assert.ok(!chipIds(s).includes('embark'), 'сам БТР не садится');
});
test('v13.075: БТР с десантом — «Высадить» и без «Сесть в БТР»', () => {
  const s = setup('battle');
  select(s, BTR({ embarkedUnit: 'Стрелковый взвод' }));
  const ids = chipIds(s);
  assert.ok(ids.includes('disembark'), 'высадка');
  assert.ok(!ids.includes('embark'));
});
test('v13.075: ДОТ стационарен — ни движения, ни посадки', () => {
  const s = setup('battle');
  select(s, unit({ name: 'ДОТ «Север»', type: 'dots', ap: 0, maxAp: 0 }), [BTR({ isGroup: true, groupSize: 9 })]);
  const ids = chipIds(s);
  assert.ok(!ids.includes('move') && !ids.includes('embark'), 'ДОТ не двигается и не садится (размер БТР достаточен)');
});
test('v13.075: велосипед в бою — «Спешиться»; спешенный с велостоянкой — «На технику»', () => {
  const s = setup('battle');
  const bike = unit({ name: 'Самокатный взвод', type: 'bicycle_platoon', mobility: 'bicycle' });
  select(s, bike);
  assert.ok(chipIds(s).includes('dismount'), 'спешиться');
  s.run("appData.campaign.opMapGrid['5,4'] = { markers: ['bicyclePark'] };");
  bike.dismounted = true;
  bike.mobility = 'foot';
  assert.ok(!chipIds(s).includes('dismount'), 'уже спешен');
  assert.ok(chipIds(s).includes('mount'), 'на технику — есть велостоянка');
});
test('v13.075: спешенный без велостоянки — «На технику» не предлагается', () => {
  const s = setup('battle');
  select(s, unit({ name: 'Самокатный взвод', type: 'bicycle_platoon', mobility: 'foot', dismounted: true }));
  assert.ok(!chipIds(s).includes('mount'));
});
test('v13.075: Hard Mode включён — «Приказ» последним', () => {
  const s = setup('battle');
  s.run('hardMode.enabled = true;');
  select(s, unit());
  assert.deepEqual(chipIds(s), ['move', 'shoot', 'recon', 'order']);
});
test('v13.075: отряд в тактическом бою — пояснение; карточные чипы скрыты, приказ остаётся', () => {
  const s = setup('battle');
  select(s, unit({ isInBattle: true }));
  assert.deepEqual(chipIds(s), []);
  render(s);
  assert.ok(barState(s).html.includes('тактическом бою'));
  s.run('hardMode.enabled = true;');
  assert.deepEqual(chipIds(s), ['order'], 'приказ при Hard Mode доступен и в бою');
});
test('v13.075: отряд не на карте — пояснение «сначала разместите»', () => {
  const s = setup('deploy');
  select(s, unit({ col: null, row: null }));
  render(s);
  assert.ok(barState(s).html.includes('сначала разместите'));
});
test('v13.075: ход оппонента — чипы видны, но disabled, и чип не срабатывает', () => {
  const s = setup('battle');
  s.run("var ONLINE = { started: true }; function onlineMyTurnActive() { return false; }");
  s.sandbox.appData.campaign.online = true;
  select(s, unit());
  render(s);
  const st = barState(s);
  assert.ok(st.html.includes('disabled'), 'кнопки заблокированы');
  assert.ok(st.html.includes('Ход оппонента'), 'пояснение');
  s.run("uxChip('shoot');");
  assert.equal(s.sandbox.logs.filter(l => l === 'shoot').length, 0, 'огонь не запущен');
});
test('v13.075: нажатие «Двигать» подсвечивает гексы и не меняет режим карты', () => {
  const s = setup('battle');
  const u = unit();
  select(s, u);
  s.run("appData.campaign.opMapMode = 'view'; uxChip('move');");
  assert.equal(s.evalCtx('appData.campaign.opMapMode'), 'view', 'режим не сменился');
  assert.equal(s.evalCtx('appData.campaign.selectedOpUnit.name'), u.name, 'выбор сохранён');
  assert.equal(s.evalCtx('appData.campaign.selectedOpUnit.availableHexes.length'), 1, 'подсветка получена');
});
test('v13.075: «Двигать» из режима обстрела сначала отменяет обстрел', () => {
  const s = setup('battle');
  select(s, unit());
  s.sandbox.appData.campaign.opMapMode = 'selectTarget';
  s.run("function cancelOpShooting() { appData.campaign.opMapMode = 'view'; log('cancel'); }\nuxChip('move');");
  assert.ok(s.sandbox.logs.includes('cancel'), 'обстрел отменён');
  assert.equal(s.evalCtx('appData.campaign.opMapMode'), 'view');
});
test('v13.075: чипы вызывают существующие обработчики', () => {
  const s = setup('battle');
  s.run('hardMode.enabled = true;');
  select(s, unit());
  s.run("uxChip('shoot'); uxChip('recon');");
  assert.ok(s.sandbox.logs.includes('shoot') && s.sandbox.logs.includes('recon'));
  select(s, unit({ name: 'Самокатный взвод', type: 'bicycle_platoon', mobility: 'bicycle' }));
  s.run("uxChip('dismount');");
  assert.ok(s.sandbox.logs.includes('dismount'), 'спешивание');
});
test('v13.075: устаревший чип не срабатывает (огонь уже недоступен)', () => {
  const s = setup('battle');
  select(s, unit({ canShootStub: false }));
  s.run("uxChip('shoot');");
  assert.equal(s.sandbox.logs.filter(l => l === 'shoot').length, 0);
});
test('v13.075: «Приказ» открывает панель на этом отряде (индекс выставлен)', () => {
  const s = setup('battle');
  s.run('hardMode.enabled = true;');
  const u = unit();
  select(s, u, [unit({ name: 'Второй взвод' })]);
  s.run("uxChip('order');");
  assert.ok(s.sandbox.logs.includes('order'), 'панель открыта');
  assert.equal(s.evalCtx("document.getElementById('orderTargetUnit').value"), '0', 'выбран этот отряд');
});
test('v13.075: свёрнутый черновик приказа не перезаписывается', () => {
  const s = setup('battle');
  s.run('hardMode.enabled = true;');
  select(s, unit(), [unit({ name: 'Второй взвод' })]);
  s.run("orderPanelMinimized = true; appData.campaign.selectedOpUnit = appData.campaign.opUnits[1];" +
        " document.getElementById('orderTargetUnit').value = '1'; uxChip('order');");
  assert.equal(s.evalCtx("document.getElementById('orderTargetUnit').value"), '1', 'черновик сохранён');
});
test('v13.075: строка не переписывается, если состав не изменился (без лишних перерисовок)', () => {
  const s = setup('battle');
  select(s, unit());
  render(s);
  s.run("document.getElementById('uxActionBar').innerHTML = 'SENTINEL';");
  render(s);
  assert.equal(barState(s).html, 'SENTINEL', 'тот же состав — DOM не трогаем');
  s.run('appData.campaign.selectedOpUnit.ap = 2;');
  render(s);
  assert.ok(barState(s).html.includes('ОД 2/4'), 'ОД изменился — строка обновилась');
});
test('v13.075: обёртка redrawOperationalMap обновляет строку сразу', () => {
  const s = setup('battle');
  s.run('uxInstallRedrawHook();');
  select(s, unit());
  s.run('redrawOperationalMap();');       // обёртка -> uxRenderActionBar
  assert.equal(barState(s).display, 'flex', 'после перерисовки карты строка уже видна');
  s.run("appData.campaign.selectedOpUnit = null; redrawOperationalMap();");
  assert.equal(barState(s).display, 'none', 'без выбора — скрыта сразу');
});
test('v13.075: обёртка ставится один раз (повторный вызов не накапливает)', () => {
  const s = setup('battle');
  s.run('uxInstallRedrawHook(); uxInstallRedrawHook();');
  assert.equal(s.evalCtx('window.redrawOperationalMap.__uxBar'), true);
  assert.equal(s.evalCtx('uxInstallRedrawHook()'), false, 'второй вызов ничего не оборачивает');
});
test('v13.075: имена в строке экранируются', () => {
  const s = setup('battle');
  select(s, unit({ name: 'Взвод <img src=x onerror=1>' }));
  render(s);
  assert.ok(!barState(s).html.includes('<img'), 'разметка имени экранирована');
});

// ─── 4. версия и сопутствующие файлы ───
// ⚡ v13.076: проверка согласованности относительно APP_VERSION (без жёсткой версии)
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const APP = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
const APP_RE = APP.replace('.', '\\.');
test('v13.075: APP_VERSION, title, h1, бейдж и модуль — согласованы с APP_VERSION', () => {
  assert.ok(/^v13\.07\d$/.test(APP), 'формат: ' + APP);
  assert.ok(new RegExp('<title>Боевой модуль ' + APP_RE).test(HTML), 'title');
  assert.ok(new RegExp('<h1>⚔️ Боевой модуль ' + APP_RE + '</h1>').test(HTML), 'h1');
  assert.ok(new RegExp('id="appVersionBadge"[^>]*>' + APP_RE + '<').test(HTML), 'badge');
  assert.ok(new RegExp('id="battleModuleTitle">⚔️ Боевой модуль ' + APP_RE).test(HTML), 'battleModuleTitle');
});
test('v13.075: SW-кэш и манифест — согласованы с APP_VERSION', () => {
  assert.ok(read('service-worker.js').includes("const CACHE_NAME = 'wargame-" + APP + "';"), 'кэш SW');
  assert.ok(read('manifest.json').includes('"short_name": "БМ ' + APP + '"'), 'манифест');
});
test('v13.075: BUILD-маркер в шапке service-worker.js — согласован с APP_VERSION', () => {
  assert.ok(read('service-worker.js').split('\n')[0].includes('BUILD-МАРКЕР: ' + APP), 'шапка SW');
});
test('v13.075: BUILD-маркеры js/*.js — согласованы с APP_VERSION', () => {
  ['js/cards.js', 'js/data.js', 'js/hexmaps.js', 'js/templates.js'].forEach((f) => {
    assert.ok(read(f).split('\n')[0].includes('BUILD-МАРКЕР: ' + APP), f);
  });
});
test('v13.075: CHANGELOG-v13.075.md на месте', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'CHANGELOG-v13.075.md')));
});

console.log(`\nИтог v13.075: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) { console.log(failures.map(f => ' - ' + f).join('\n')); process.exit(1); }
