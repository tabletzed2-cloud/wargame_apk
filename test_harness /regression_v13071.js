// ⚡ v13.071: UX — фазовый интерфейс + чек-лист освоения + быстрый старт + авторазмещение врага.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗', name, '—', e.message); }
}
const APP = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];

// ─── версии ───
test('v13.071: версия в приложении / манифесте / SW согласована', () => {
  assert.equal(APP, 'v13.071');
  assert.ok(MANIFEST.includes('БМ v13.071'), 'манифест');
  assert.ok(SW.includes("'wargame-v13.071'"), 'кэш SW');
  assert.ok(/<title>Боевой модуль v13\.071/.test(HTML), 'title');
  assert.ok(/<h1>[^<]*v13\.071/.test(HTML), 'h1');
  assert.ok(/appVersionBadge[^>]*>v13\.071</.test(HTML), 'badge');
});
['js/data.js','js/hexmaps.js','js/templates.js'].forEach((m) => {
  test('v13.071: BUILD-маркер в ' + m, () => {
    const first = fs.readFileSync(path.join(ROOT, m), 'utf8').split('\n')[0];
    assert.ok(first.includes('BUILD-МАРКЕР: v13.071'), 'первая строка: ' + first);
  });
});

// ─── фазовый UI ───
test('v13.071: есть три группы кнопок на карте операции (deploy/battle/rare)', () => {
  assert.ok(/id="opPhaseDeploy"/.test(HTML), 'группа развёртывания');
  assert.ok(/id="opPhaseBattle"/.test(HTML), 'группа боя');
  assert.ok(/id="opPhaseRare"/.test(HTML), 'группа редких действий');
});
test('v13.071: строка «Следующий шаг» и чек-лист освоения присутствуют', () => {
  assert.ok(/id="opNextStepBar"/.test(HTML), 'полоса следующего шага');
  assert.ok(/id="opNextStepText"/.test(HTML), 'текст шага');
  assert.ok(/id="opOnboardingPanel"/.test(HTML), 'чек-лист');
});
test('v13.071: меню «⚙️ Ещё» скрывает редкие действия', () => {
  assert.ok(/id="uxMoreBtn"/.test(HTML), 'кнопка Ещё');
  assert.ok(/id="uxMoreMenu"/.test(HTML), 'выпадающее меню');
  assert.ok(/toggleUxMoreMenu/.test(HTML), 'обработчик');
});
test('v13.071: applyUxPhase существует и вызывает рендер чек-листа', () => {
  assert.ok(/function applyUxPhase\(/.test(HTML), 'applyUxPhase() есть');
  assert.ok(/renderChecklist/.test(HTML), 'чек-лист рендерится');
  assert.ok(/opPhaseDeploy.*opPhaseBattle.*display.*===/.test(HTML) || /phase === 'deploy'/.test(HTML),
    'видимость зависит от фазы');
});

// ─── чек-лист ───
test('v13.071: чек-лист содержит 4 пункта освоения', () => {
  assert.ok(HTML.includes("id: 'place'"), 'пункт «разместить»');
  assert.ok(HTML.includes("id: 'move'"),  'пункт «двинуть»');
  assert.ok(HTML.includes("id: 'shoot'"), 'пункт «огонь»');
  assert.ok(HTML.includes("id: 'turn'"),  'пункт «завершить ход»');
});
test('v13.071: чек-лист сохраняет прогресс в localStorage', () => {
  assert.ok(/opOnboardingChecklist_v1/.test(HTML), 'ключ localStorage');
  assert.ok(/localStorage\.setItem/.test(HTML), 'запись прогресса');
});

// ─── быстрый старт ───
test('v13.071: в главном меню есть кнопка «⚡ Быстрый старт»', () => {
  assert.ok(/quickStartCampaign\(\)/.test(HTML), 'обработчик quickStartCampaign');
  assert.ok(/⚡ Быстрый старт/.test(HTML), 'текст кнопки');
});
test('v13.071: quickStartCampaign использует дефолтные поддержки и авторазмещение', () => {
  const fn = sliceFunction(HTML, 'quickStartCampaign');
  assert.ok(fn, 'функция quickStartCampaign найдена');
  assert.ok(/DEFAULT_SUPPORT/.test(fn), 'есть DEFAULT_SUPPORT');
  assert.ok(/dots.*sau_battery.*armored_vehicle_platoon/.test(fn), 'поддержки BeVe по умолчанию');
  assert.ok(/btr_platoon.*tank_platoon/.test(fn), 'поддержки AIRF по умолчанию');
  assert.ok(/autoPlaceUnplacedUnits/.test(fn), 'авторазмещение своих');
  assert.ok(/autoPlaceEnemyUnits/.test(fn), 'авторазмещение врага');
});
test('v13.071: confirmBattalion поддерживает fixedSupportIds (не ломаем быстрый старт)', () => {
  const fn = sliceFunction(HTML, 'confirmBattalion');
  assert.ok(/fixedSupportIds/.test(fn), 'сигнатура принимает fixedSupportIds');
});

// ─── авторазмещение врага ───
test('v13.071: есть autoPlaceEnemyUnits', () => {
  assert.ok(/function autoPlaceEnemyUnits\(/.test(HTML), 'функция есть');
});
test('v13.071: авторазмещение врага НЕ работает в онлайне', () => {
  const fn = sliceFunction(HTML, 'autoPlaceEnemyUnits');
  assert.ok(fn.includes('camp.online'), 'проверка онлайн');
});
test('v13.071: при входе на карту в соло враг расставляется один раз', () => {
  assert.ok(/enemyAutoPlaced/.test(HTML), 'флаг одноразового расставления');
  assert.ok(/autoPlaceEnemyUnits/.test(HTML), 'вызов в showOperationalMap');
});

// ─── группировка кнопок не ломает ключевые id ───
['btnInitialFortificationSetup','btnFinishPlacement','opEndTurnBtn','opHexMapsBtn',
 'groupBtn','splitBtn','renameBtn','detailsBtn','dismountBtn','btrEmbarkBtn','btrDisembarkBtn']
  .forEach((id) => {
  test('v13.071: кнопка ' + id + ' сохранена', () => {
    assert.ok(new RegExp('id="' + id + '"').test(HTML), 'id=' + id);
  });
});

console.log(`\nИтог v13.071: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) console.log(failures.map(f => ' - ' + f).join('\n'));
if (failures.length) process.exit(1);
