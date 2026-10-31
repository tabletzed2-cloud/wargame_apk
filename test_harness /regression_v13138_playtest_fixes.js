'use strict';
// ⚡ v13.138: два исправления по playtest-фидбеку.
//   1. «При размещении ДОТов меню закрывает весь экран и невозможно разместить ДОТ,
//      не видно карты!» — шапка редактора расстановки ДОТов ограничена 42vh
//      (overflow-y:auto), карта остаётся видимой (52vh); длинные справки
//      (секторы амбразур, подсказка) свёрнуты в <details>/сокращены.
//   2. «На стадии распределения связи так и не открывается меню связи!» —
//      меню связи раскрывается САМО при входе на этап (showCommunicationPanel(true)):
//      v13.136 раскрывал только тело панели (commCollapsed) внутри скрытого
//      контейнера — боковая панель #communicationPanel оставалась закрытой.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML } = require('./extract');
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + ': ' + e.message); process.exitCode = 1; }
}

const operationalUi = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const hexmaps = fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8');

// ================= Баг 2: меню связи на этапе «Связь» =================

ok('баг2 setStage: вход на этап связи раскрывает меню САМО (force, без toggle)', () => {
  const s = createSandbox(freshAppData());
  s.run('var state = { commCollapsed: true };' +
    'var __commCalls = [];' +
    'let placementLocked = false; let placementUnlockCount = 0;' +
    'var STAGES = ["placement","fortifications","communications","cards","orders"];' +
    'var __camp = { opSetupStage: "fortifications" };' +
    'function campaign() { return __camp; }' +
    'function renderSetup() {} function renderPinnedActions() {} function ensureHardMode() {}' +
    'function showCommunicationPanel(force) { __commCalls.push(force); }');
  s.run(sliceFunction(operationalUi, 'setStage'));
  s.evalCtx("setStage('communications')");
  assert.strictEqual(s.evalCtx('__camp.opSetupStage'), 'communications');
  assert.strictEqual(s.evalCtx('state.commCollapsed'), false, 'commCollapsed сброшен (правило v13.136 сохранено)');
  assert.strictEqual(JSON.stringify(s.evalCtx('__commCalls')), '[true]',
    'showCommunicationPanel(true) вызван — меню связи раскрыто автоматически');
  s.evalCtx('__commCalls.length = 0;');
  s.evalCtx("setStage('orders')");
  assert.strictEqual(JSON.stringify(s.evalCtx('__commCalls')), '[]', 'на других этапах авто-открытия нет');
});

ok('баг2 setInitialStage: восстановление на этапе связи раскрывает меню САМО', () => {
  const s = createSandbox(freshAppData());
  s.run('var state = { commCollapsed: true };' +
    'var __commCalls = [];' +
    'let placementLocked = true;' +
    'var STAGES = ["placement","fortifications","communications","cards","orders"];' +
    'var __camp = { opSetupStage: "communications", initialPlatoonCardsAssigned: false };' +
    'function campaign() { return __camp; }' +
    'function ensureHardMode() {}' +
    'function showCommunicationPanel(force) { __commCalls.push(force); }');
  s.run(sliceFunction(operationalUi, 'setInitialStage'));
  s.evalCtx('setInitialStage()');
  assert.strictEqual(s.evalCtx('state.commCollapsed'), false, 'commCollapsed сброшен');
  assert.strictEqual(JSON.stringify(s.evalCtx('__commCalls')), '[true]',
    'showCommunicationPanel(true) вызван при восстановлении на этапе связи');
});

ok('баг2 openOperationalSidePanel: force=true отключает toggle-закрытие', () => {
  assert.ok(/window\.openOperationalSidePanel = function \(kind, force\)/.test(HTML),
    'openOperationalSidePanel принимает force');
  assert.ok(/if \(!force && activeOperationalSidePanel === kind && workspace\.classList\.contains\('op-left-open'\)\)/.test(HTML),
    'toggle-закрытие только без force');
});

ok('баг2 showCommunicationPanel/showSupplyPanel: force пробрасывается в сайд-панель', () => {
  assert.ok(/function showCommunicationPanel\(force\)/.test(HTML), 'showCommunicationPanel(force)');
  assert.ok(/openOperationalSidePanel\('communication', force\)/.test(HTML), 'force проброшен в openOperationalSidePanel');
  assert.ok(/function showSupplyPanel\(force\)/.test(HTML), 'showSupplyPanel(force)');
  assert.ok(/openOperationalSidePanel\('supply', force\)/.test(HTML), 'force проброшен для снабжения');
});

ok('баг2 в мастере этапа есть кнопка «📡 Меню связи» (btnOpenCommMenu)', () => {
  assert.ok(/btnOpenCommMenu/.test(operationalUi), 'кнопка btnOpenCommMenu в панели этапа');
  const cnt = (operationalUi.match(/showCommunicationPanel\(true\)/g) || []).length;
  assert.ok(cnt >= 3, 'авто-открытие: setStage + setInitialStage + кнопка (>=3 вызова с force)');
  assert.ok(!/Нажмите закреплённую кнопку «Связь»/.test(operationalUi),
    'устаревшая инструкция про «закреплённую кнопку» заменена');
  assert.ok(/меню связи раскрыто само/i.test(operationalUi), 'текст мастера сообщает об автооткрытии');
});

// ================= Баг 1: меню ДОТ не перекрывает карту =================

ok('баг1 CSS: шапка редактора ≤42vh с прокруткой (не перекрывает экран)', () => {
  const m = /#battleApp\.hex-editor-mode #mapTab > #hexEditorBanner \{[^}]+\}/.exec(HTML);
  assert.ok(m, 'правило hexEditorBanner в режиме редактора найдено');
  assert.ok(/max-height:\s*42vh/.test(m[0]), 'max-height:42vh');
  assert.ok(/overflow-y:\s*auto/.test(m[0]), 'overflow-y:auto');
});

ok('баг1 CSS: карта в режиме редактора видима (height:52vh !important)', () => {
  const m = /#battleApp\.hex-editor-mode #mapTab > #mapContainer \{[^}]+\}/.exec(HTML);
  assert.ok(m, 'правило mapContainer в режиме редактора найдено');
  assert.ok(/height:\s*52vh\s*!important/.test(m[0]), 'height:52vh !important (побеждает inline 70vh)');
});

ok('баг1 hexmaps: длинная справка секторов свёрнута в <details>', () => {
  assert.ok(/<details[^>]*><summary[^>]*>ℹ️ Секторы амбразур[^<]*<\/summary><div[^>]*>У каждого расчёта свой сектор/.test(hexmaps),
    'справка секторов внутри <details>');
  assert.ok(/ДОТа\.<\/div><\/details>/.test(hexmaps), '</details> закрывает справку');
});

ok('баг1 hexmaps: подсказка расстановки ДОТов сокращена', () => {
  const m = /title: '🪖 Расстановка ДОТов',\s*\n\s*hint: '([^']+)'/.exec(hexmaps);
  assert.ok(m, 'hint для initialFortification найден');
  assert.ok(m[1].length < 160, 'подсказка короткая (сейчас ' + m[1].length + ' символов)');
});

ok('баг1 initialDotSectorControls: секторы настраиваются, справка свёрнута', () => {
  const s = createSandbox(freshAppData());
  s.run('initialDotCandidates = () => [{ id: 7, unit: { name: "u" }, ' +
    'squad: { name: "ДОТ Bosh", faction: "BeVe", crewInstances: [{ weaponName: "MG-42" }], ' +
    'fixedTacticalPosition: null } }];' +
    'getFactionCrewWeapons = () => [{ name: "MG-42", type: "mg" }];');
  const out = s.evalCtx('initialDotSectorControls({ dotId: 7, dotWeaponSectors: null, dotSectorCandidateId: null })');
  assert.ok(typeof out === 'string' && out.length > 0, 'контролы построены');
  assert.ok(out.includes('<details'), 'длинная справка свёрнута в details');
  assert.ok(out.includes('</details>'), 'details закрыт');
  assert.ok(out.includes('<select'), 'выбор сектора амбразуры доступен');
  assert.ok(out.includes('Указать на карте'), 'кнопка указания сектора на карте на месте');
  assert.ok(out.indexOf('<details') > out.indexOf('<select'), 'справка ПОСЛЕ настроек — карта и контролы видны сразу');
});

// ================= версия =================

ok('APP_VERSION поднят до v13.138', () => {
  const m = /var APP_VERSION = '([^']+)'/.exec(HTML);
  assert.ok(m, 'APP_VERSION найден');
  assert.strictEqual(m[1], 'v13.138');
});

ok('маркеры версии синхронизированы на v13.138', () => {
  const files = [ROOT + '/index.html', ROOT + '/js/cards.js', ROOT + '/js/data.js', ROOT + '/js/hexmaps.js',
    ROOT + '/js/map_actions.js', ROOT + '/js/online_battles.js', ROOT + '/js/operational_ui.js',
    ROOT + '/js/placement.js', ROOT + '/js/templates.js', ROOT + '/js/weapons.js',
    ROOT + '/service-worker.js', ROOT + '/manifest.json'];
  files.forEach(f => {
    const txt = fs.readFileSync(f, 'utf8');
    assert.ok(/v13\.138/.test(txt), path.basename(f) + ' должен содержать v13.138');
  });
  const sw = fs.readFileSync(ROOT + '/service-worker.js', 'utf8');
  assert.ok(/CACHE_NAME = 'wargame-v13\.138'/.test(sw), 'CACHE_NAME service-worker обновлён');
});

if (!process.exitCode) console.log('v13.138 (playtest fixes) regression: PASS (' + passed + ')');
else console.log('v13.138 (playtest fixes) regression: FAIL');
