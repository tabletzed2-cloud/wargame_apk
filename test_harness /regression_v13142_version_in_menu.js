'use strict';
// ⚡ v13.142: актуальная версия должна отображаться в начальном меню игры.
//    Проверяем и статическую разметку (до выполнения JS), и то, что рантайм
//    берёт номер из единственной константы APP_VERSION.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const VERSION = (function () {
  const m = /var APP_VERSION = '([^']+)'/.exec(HTML);
  if (!m) throw new Error('APP_VERSION не найден в index.html');
  return m[1];
})();

console.log('Проверка версии ' + VERSION + ' в начальном меню:');

// ─── статическая разметка (видна до выполнения JS) ───
ok('заголовок главного меню содержит актуальную версию', () => {
  const m = /<div id="mainMenu"[^>]*>\s*<h1>([^<]*)<\/h1>/.exec(HTML);
  assert(m, 'h1 главного меню найден');
  assert(m[1].indexOf(VERSION) >= 0, 'h1 = "' + m[1] + '", ожидалась ' + VERSION);
});

ok('бейдж версии под кнопками меню показывает актуальную версию', () => {
  const m = /id="appVersionBadge"[^>]*>\s*([^<]+?)\s*<\/p>/.exec(HTML);
  assert(m, 'appVersionBadge найден');
  assert(m[1] === VERSION, 'бейдж = "' + m[1] + '", ожидалась ' + VERSION);
});

ok('заголовок вкладки браузера содержит актуальную версию', () => {
  const m = /<title>([^<]*)<\/title>/.exec(HTML);
  assert(m, 'title найден');
  assert(m[1].indexOf(VERSION) >= 0, 'title = "' + m[1] + '"');
});

ok('шапка боевого модуля содержит актуальную версию', () => {
  const m = /id="battleModuleTitle"[^>]*>([^<]*)</.exec(HTML);
  assert(m, 'battleModuleTitle найден');
  assert(m[1].indexOf(VERSION) >= 0, 'шапка = "' + m[1] + '"');
});

// ─── рантайм берёт номер из APP_VERSION, а не из захардкоженной строки ───
ok('рантайм подставляет APP_VERSION в меню, шапку и title', () => {
  const runtime = [
    "document.title = '⚔️ Боевой модуль ' + APP_VERSION",
    "document.querySelector('#mainMenu h1')",
    "h1m.innerHTML = '⚔️ Боевой модуль <b style=\"color:#f1c40f;\">' + APP_VERSION + '</b>'",
    "document.getElementById('battleModuleTitle')",
    "h2b.textContent = '⚔️ Боевой модуль ' + APP_VERSION + ' — операция'",
    "document.getElementById('appVersionBadge')",
    "vBadge.textContent = APP_VERSION"
  ];
  runtime.forEach(snippet => assert(HTML.indexOf(snippet) >= 0, 'не найден код: ' + snippet));
});

// ─── синхронизация сборки ───
ok('BUILD-маркеры модулей, service-worker и manifest на актуальной версии', () => {
  const modules = ['js/data.js', 'js/hexmaps.js', 'js/templates.js', 'js/operational_ui.js',
    'js/cards.js', 'js/map_actions.js', 'js/online_battles.js', 'js/placement.js', 'js/weapons.js'];
  modules.forEach(f => {
    const first = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')[0];
    assert(first.indexOf('BUILD-МАРКЕР') >= 0, f + ': нет BUILD-маркера в первой строке');
    assert(first.indexOf(VERSION) >= 0, f + ': маркер не на ' + VERSION);
  });
  const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  assert(/BUILD-МАРКЕР:/.test(sw.split('\n')[0]) && sw.split('\n')[0].indexOf(VERSION) >= 0,
    'service-worker: маркер сборки не на ' + VERSION);
  assert(sw.indexOf("CACHE_NAME = 'wargame-" + VERSION + "'") >= 0,
    'service-worker: CACHE_NAME не на ' + VERSION);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert(String(manifest.short_name).indexOf(VERSION) >= 0,
    'manifest short_name = ' + manifest.short_name);
});

// ─── самопроверка сборки найдёт маркеры (иначе forceDeepUpdate на каждом старте) ───
ok('самопроверка сборки сверяет те же модули, что несут маркер', () => {
  const m = /const BUILD_MARKED_MODULES = \[([^\]]+)\]/.exec(HTML);
  assert(m, 'BUILD_MARKED_MODULES найден');
  const listed = m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
  assert(listed.length >= 4, 'ожидалось не менее 4 модулей, найдено ' + listed.length);
  listed.forEach(f => {
    const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(txt.indexOf('BUILD-МАРКЕР: ' + VERSION) >= 0,
      f + ': маркер не совпадает с APP_VERSION — игра уйдёт в принудительное обновление');
  });
});

console.log(fail ? `\nv13.142 (версия в меню): FAIL ${fail}` : `\nv13.142 (версия в меню): PASS (${pass})`);
process.exit(fail ? 1 : 0);
