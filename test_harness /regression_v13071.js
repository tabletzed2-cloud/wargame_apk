// ⚡ v13.071: UX — фазовый интерфейс + чек-лист + быстрый старт + авторазмещение врага
//    + профили «Новичок/Обычный/Ветеран» + toast-плашки.
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
['js/data.js','js/hexmaps.js','js/templates.js','js/cards.js'].forEach((m) => {
  test('v13.071: BUILD-маркер в ' + m, () => {
    const first = fs.readFileSync(path.join(ROOT, m), 'utf8').split('\n')[0];
    assert.ok(first.includes('BUILD-МАРКЕР: v13.071'), 'первая строка: ' + first);
  });
});

// ─── фазовый UI ───
test('v13.071: три группы кнопок на карте операции', () => {
  assert.ok(/id="opPhaseDeploy"/.test(HTML));
  assert.ok(/id="opPhaseBattle"/.test(HTML));
  assert.ok(/id="opPhaseRare"/.test(HTML));
});
test('v13.071: строка «Следующий шаг» и чек-лист присутствуют', () => {
  assert.ok(/id="opNextStepBar"/.test(HTML));
  assert.ok(/id="opNextStepText"/.test(HTML));
  assert.ok(/id="opOnboardingPanel"/.test(HTML));
});
test('v13.071: меню «⚙️ Ещё»', () => {
  assert.ok(/id="uxMoreBtn"/.test(HTML));
  assert.ok(/id="uxMoreMenu"/.test(HTML));
  assert.ok(/toggleUxMoreMenu/.test(HTML));
});
test('v13.071: applyUxPhase и рендер чек-листа', () => {
  assert.ok(/function applyUxPhase\(/.test(HTML));
  assert.ok(/renderChecklist/.test(HTML));
  assert.ok(/phase === 'deploy'/.test(HTML));
});

// ─── чек-лист ───
test('v13.071: 4 пункта чек-листа (разместить/двинуть/огонь/ход)', () => {
  assert.ok(HTML.includes("id: 'place'"));
  assert.ok(HTML.includes("id: 'move'"));
  assert.ok(HTML.includes("id: 'shoot'"));
  assert.ok(HTML.includes("id: 'turn'"));
  assert.ok(/opOnboardingChecklist_v1/.test(HTML));
});

// ─── быстрый старт ───
test('v13.071: в меню есть «⚡ Быстрый старт»', () => {
  assert.ok(/quickStartCampaign\(\)/.test(HTML));
  assert.ok(/⚡ Быстрый старт/.test(HTML));
});
test('v13.071: quickStartCampaign использует дефолтные поддержки и авторазмещение', () => {
  const fn = sliceFunction(HTML, 'quickStartCampaign');
  assert.ok(/DEFAULT_SUPPORT/.test(fn));
  assert.ok(/dots.*sau_battery.*armored_vehicle_platoon/.test(fn));
  assert.ok(/btr_platoon.*tank_platoon/.test(fn));
  assert.ok(/autoPlaceUnplacedUnits/.test(fn));
  assert.ok(/autoPlaceEnemyUnits/.test(fn));
});

// ─── авторазмещение врага ───
test('v13.071: autoPlaceEnemyUnits существует и отключено в онлайне', () => {
  assert.ok(/function autoPlaceEnemyUnits\(/.test(HTML));
  const fn = sliceFunction(HTML, 'autoPlaceEnemyUnits');
  assert.ok(fn.includes('camp.online'));
});
test('v13.071: враг расставляется один раз при входе на карту в соло', () => {
  assert.ok(/enemyAutoPlaced/.test(HTML));
});

// ─── Профили сложности ───
test('v13.071: профили «Новичок/Обычный/Ветеран» объявлены', () => {
  assert.ok(/🌱 Новичок/.test(HTML));
  assert.ok(/⚔️ Обычный/.test(HTML));
  assert.ok(/🎖️ Ветеран/.test(HTML));
  assert.ok(/uxProfile_v1/.test(HTML), 'ключ в localStorage');
});
test('v13.071: функция uxProfile существует и переключает профиль', () => {
  assert.ok(/window\.uxProfile\s*=/.test(HTML) || /uxProfile\s*=\s*\{/.test(HTML));
  assert.ok(/toggleProfileMenu/.test(HTML));
  assert.ok(/hardByDefault/.test(HTML));
});
test('v13.071: по умолчанию профиль «Новичок»', () => {
  // get() без сохранённого значения возвращает 'novice'
  assert.ok(/return PROFILES\[p\]\s*\?\s*p\s*:\s*'novice'/.test(HTML) ||
            /:\s*'novice'\s*;?\s*\}\s*catch/.test(HTML));
});
test('v13.071: профиль «Новичок» скрывает редакторские инструменты и включает авторазмещение врага', () => {
  assert.ok(/autoPlaceEnemy:\s*true/.test(HTML));
  assert.ok(/devToolsHidden:\s*true/.test(HTML));
});
test('v13.071: профиль «Ветеран» включает Hard Mode по умолчанию', () => {
  assert.ok(/hardByDefault:\s*true/.test(HTML));
});

// ─── Toast-плашки ───
test('v13.071: есть toast-функция и контейнер', () => {
  assert.ok(/id="toastContainer"/.test(HTML));
  assert.ok(/function toast\(/.test(HTML) || /window\.toast\s*=/.test(HTML));
  assert.ok(/\.ux-toast/.test(HTML), 'CSS-класс плашки');
  assert.ok(/kind-success|kind-error|kind-warn|kind-info/.test(HTML), 'цвета плашек');
});
test('v13.071: toast сам исчезает (timeout) и закрывается крестиком', () => {
  assert.ok(/setTimeout\(\(\)\s*=>\s*dismiss/.test(HTML), 'авто-закрытие');
  assert.ok(/ux-toast-x/.test(HTML), 'кнопка закрытия');
});

// ─── ключевые id кнопок сохранены ───
['btnInitialFortificationSetup','opEndTurnBtn','opHexMapsBtn','groupBtn','splitBtn',
 'renameBtn','detailsBtn','dismountBtn','btrEmbarkBtn','btrDisembarkBtn','hardModeBtn','opHardModeBtn']
  .forEach((id) => {
  test('v13.071: кнопка ' + id + ' сохранена', () => {
    assert.ok(new RegExp('id="' + id + '"').test(HTML), 'id=' + id);
  });
});

console.log(`\nИтог v13.071: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) { console.log(failures.map(f => ' - ' + f).join('\n')); process.exit(1); }
