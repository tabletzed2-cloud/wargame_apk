// ⚡ v13.070: регрессии надёжного обновления сборки —
//    1) маркеры сборки в модулях ядра совпадают с APP_VERSION;
//    2) сервис-воркер кэширует ядро В ОБХОД HTTP-кэша (cache: 'reload') и
//       проверяет версию файлов, отменяя установку «чужой» сборки;
//    3) приложение при запуске сверяет загруженные модули с APP_VERSION и один
//       раз за сессию выполняет глубокое обновление (unregister + чистка кэшей).
//    Запуск: node 'test_harness /regression_v13070.js' (после regression_v13069.js)
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const SW = fs.readFileSync(ROOT + '/service-worker.js', 'utf8');
const MANIFEST = fs.readFileSync(ROOT + '/manifest.json', 'utf8');
const MARKED_MODULES = ['js/data.js', 'js/hexmaps.js', 'js/templates.js'];
// свежая песочница: чужой /tmp/wg_part.js от предыдущих прогонов не подмешиваем
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

const APP = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
const MARKER = '⚡ BUILD-МАРКЕР: ' + APP;

let passed = 0;
const failures = [];
const asyncChecks = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗ ' + name + ' — ' + e.message); }
}
function testAsync(name, fn) {
  asyncChecks.push(Promise.resolve().then(fn).then(
    () => { passed++; console.log('✓ ' + name); },
    (e) => { failures.push(name + ': ' + e.message); console.log('✗ ' + name + ' — ' + e.message); }
  ));
}

// ─────────────────────── 1. Маркеры сборки в модулях ядра ───────────────────────
test('v13.070: маркеры сборки в модулях ядра совпадают с APP_VERSION', () => {
  assert.match(APP, /^v\d+\.\d+$/, 'APP_VERSION вида vX.YYY');
  MARKED_MODULES.forEach((m) => {
    const text = fs.readFileSync(path.join(ROOT, m), 'utf8');
    assert.ok(text.indexOf(MARKER) >= 0, `${m}: есть «${MARKER}»`);
  });
});

test('v13.070: маркер стоит первой строкой модуля (виден без загрузки кода)', () => {
  MARKED_MODULES.forEach((m) => {
    const first = fs.readFileSync(path.join(ROOT, m), 'utf8').split('\n')[0];
    assert.ok(first.indexOf(MARKER) >= 0, `${m}: маркер в первой строке, а не ${JSON.stringify(first.slice(0, 60))}`);
  });
});

// ─────────────────────── 2. Сервис-воркер ───────────────────────
test('v13.070: SW — кэш ядра скачивается в обход HTTP-кэша (cache: reload)', () => {
  assert.match(SW, /function precacheCore\(cache\)/, 'есть precacheCore()');
  assert.match(SW, /new Request\(url, \{ cache: 'reload' \}\)/, 'ядро кэшируется через cache: reload');
  assert.match(SW, /return precacheCore\(cache\)/, 'установка использует precacheCore()');
});

test('v13.070: SW — проверка версии файлов в кэше перед активацией', () => {
  assert.match(SW, /const CACHE_VERSION = CACHE_NAME\.replace\(\/\^wargame-\//, 'версия кэша выводится из CACHE_NAME');
  assert.match(SW, /const MARKED_ASSETS = \[/, 'есть список MARKED_ASSETS');
  assert.match(SW, /function verifyCachedBuild\(cache\)/, 'есть verifyCachedBuild()');
  assert.match(SW, /\.then\(\(\) => verifyCachedBuild\(cache\)\)/, 'проверка вызывается при установке');
  assert.ok(SW.indexOf("needle: \"var APP_VERSION = '\" + CACHE_VERSION") >= 0, 'index.html проверяется по APP_VERSION');
  MARKED_MODULES.forEach((m) => {
    assert.ok(SW.indexOf("url: './" + m + "'") >= 0, `в MARKED_ASSETS есть ${m}`);
  });
});

test('v13.070: SW — установка отменяется, если в кэш попал файл другой версии', () => {
  assert.match(SW, /в кэш попал файл другой версии/, 'есть сообщение о чужой версии');
  assert.match(SW, /\[SW\] установка отменена/, 'есть отмена установки');
  assert.match(SW, /return caches\.delete\(CACHE_NAME\)\.then\(\(\) => \{ throw err; \}\)/, 'кэш удаляется и установка прерывается');
});

test('v13.070: SW — кэш этой версии пересобирается с нуля', () => {
  const i = SW.indexOf("self.addEventListener('install'");
  assert.ok(i > 0, 'install-обработчик найден');
  const body = SW.slice(i, i + 1400);
  assert.ok(/caches\.delete\(CACHE_NAME\)\s*\n?\s*\.then\(\(\) => caches\.open\(CACHE_NAME\)\)/.test(body),
    'старый кэш версии удаляется до пересборки');
  assert.ok(SW.includes("const CACHE_NAME = 'wargame-" + APP + "';"), 'CACHE_NAME совпадает с APP_VERSION');
});

// ─────────────────────── 3. Самопроверка сборки в приложении ───────────────────────
test('v13.070: приложение проверяет сборку при запуске', () => {
  assert.match(HTML, /const BUILD_MARKER_PREFIX = '⚡ BUILD-МАРКЕР:'/, 'есть BUILD_MARKER_PREFIX');
  assert.match(HTML, /const BUILD_MARKED_MODULES = \['js\/data\.js', 'js\/hexmaps\.js', 'js\/templates\.js'\]/,
    'проверяются модули ядра');
  assert.match(HTML, /function buildFreshnessProbe\(moduleUrl, expected\)/, 'есть buildFreshnessProbe()');
  assert.match(HTML, /function verifyBuildFreshness\(\)/, 'есть verifyBuildFreshness()');
  assert.match(HTML, /function forceDeepUpdate\(reason\)/, 'есть forceDeepUpdate()');
  assert.match(HTML, /setTimeout\(verifyBuildFreshness, 700\)/, 'проверка запускается после загрузки страницы');
});

test('v13.070: проверка модуля идёт в обход кэша сервис-воркера', () => {
  assert.match(HTML, /fetch\(url, \{ cache: 'no-store' \}\)/, 'модуль скачивается с cache: no-store');
  assert.match(HTML, /\+ 'build=' \+ encodeURIComponent\(APP_VERSION\)/, 'к URL модуля добавляется уникальный query');
});

test('v13.070: глубокая очистка снимает SW и удаляет все кэши', () => {
  assert.match(HTML, /getRegistrations\(\)\.then\(rs => Promise\.all\(rs\.map\(r => r\.unregister\(\)\)\)\)/, 'регистрации SW снимаются');
  assert.match(HTML, /caches\.keys\(\)\.then\(keys => Promise\.all\(keys\.map\(k => caches\.delete\(k\)\)\)\)/, 'все кэши удаляются');
  assert.match(HTML, /url\.searchParams\.set\('_build', String\(Date\.now\(\)\)\)/, 'перезагрузка с обходом кэша браузера');
});

testAsync('v13.070: глубокое обновление выполняется не более одного раза за сессию', () => {
  const s = createSandbox(freshAppData());
  s.run(fnCode('verifyBuildFreshness') + '\n' + fnCode('forceDeepUpdate') + '\n' + fnCode('buildFreshnessProbe'));
  s.run(`
    APP_VERSION = '${APP}';
    BUILD_MARKER_PREFIX = '⚡ BUILD-МАРКЕР:';
    globalThis.__unregistered = 0;
    globalThis.__cachesCleared = 0;
    sessionStorage = { __v: {}, getItem: function (k) { return this.__v[k] === undefined ? null : this.__v[k]; }, setItem: function (k, v) { this.__v[k] = String(v); } };
    navigator = { serviceWorker: { getRegistrations: () => Promise.resolve([{ unregister: () => { globalThis.__unregistered++; return Promise.resolve(true); } }]) } };
    caches = { keys: () => Promise.resolve(['wargame-v13.069']), delete: () => { globalThis.__cachesCleared++; return Promise.resolve(true); } };
    location = { href: 'https://game.test/index.html', replace: () => {} };
  `);
  assert.equal(s.evalCtx('forceDeepUpdate("тест")'), true, 'первый вызов выполняет очистку');
  assert.equal(s.evalCtx('forceDeepUpdate("тест")'), false, 'второй вызов в той же сессии — уже нет (защита от цикла)');
  assert.equal(s.evalCtx('sessionStorage.getItem("__deepUpdate")'), APP, 'флаг сессии хранит версию сборки');
  // очистка выполняется в промисах — дожидаемся её
  return new Promise(resolve => setTimeout(resolve, 20)).then(() => {
    assert.equal(s.evalCtx('__unregistered'), 1, 'SW снят с регистрации один раз');
    assert.equal(s.evalCtx('__cachesCleared'), 1, 'кэш удалён один раз');
  });
});

testAsync('v13.070: устаревший модуль запускает глубокое обновление', () => {
  const s = createSandbox(freshAppData());
  s.run(fnCode('verifyBuildFreshness') + '\n' + fnCode('forceDeepUpdate') + '\n' + fnCode('buildFreshnessProbe'));
  s.run(`
    APP_VERSION = '${APP}';
    BUILD_MARKER_PREFIX = '⚡ BUILD-МАРКЕР:';
    BUILD_MARKED_MODULES = ['js/data.js', 'js/hexmaps.js', 'js/templates.js'];
    sessionStorage = { __v: {}, getItem: function (k) { return this.__v[k] === undefined ? null : this.__v[k]; }, setItem: function (k, v) { this.__v[k] = String(v); } };
    navigator = { serviceWorker: { getRegistrations: () => Promise.resolve([]) } };
    caches = { keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) };
    location = { href: 'https://game.test/index.html', replace: () => {} };
    globalThis.__asked = [];
    fetch = (url) => {
      globalThis.__asked.push(url);
      const stale = url.indexOf('hexmaps') >= 0 ? '// старый модуль без маркера' : '// ${MARKER}';
      return Promise.resolve({ ok: true, text: () => Promise.resolve(stale) });
    };
  `);
  return s.evalCtx('verifyBuildFreshness()').then((staleFound) => {
    assert.equal(staleFound, true, 'устаревший модуль обнаружен');
    assert.equal(s.evalCtx('sessionStorage.getItem("__deepUpdate")'), APP, 'запущено глубокое обновление');
    assert.equal(s.evalCtx('__asked.length'), 3, 'опрошены все три модуля ядра');
    assert.ok(s.evalCtx('__asked').every(u => u.indexOf('build=' + APP) > 0), 'запросы идут с обходом кэша');
    // повторная проверка после обновления (новый кэш) — тишина
    s.run(`fetch = (url) => Promise.resolve({ ok: true, text: () => Promise.resolve('// ${MARKER}') });`);
    return s.evalCtx('verifyBuildFreshness()').then(fresh => assert.equal(fresh, false, 'свежая сборка обновление не запускает'));
  });
});

// ─────────────────────── 4. Версии согласованы ───────────────────────
test('v13.070: версия одинакова в приложении, манифесте и кэше', () => {
  assert.ok(JSON.stringify(JSON.parse(MANIFEST)).includes(APP.replace(/^v/, '')), 'манифест на ту же версию');
  assert.ok(SW.includes("'wargame-" + APP + "'"), 'кэш service-worker на ту же версию');
  assert.ok(SW.indexOf("const BUILD_MARKER = '⚡ BUILD-МАРКЕР: ' + CACHE_VERSION;") >= 0,
    'BUILD_MARKER в SW собирается из CACHE_VERSION');
  assert.ok(SW.includes("const CACHE_VERSION = CACHE_NAME.replace(/^wargame-/, '');"),
    'CACHE_VERSION выводится из CACHE_NAME');
});

function fnCode(name) { return sliceFunction(HTML, name); }

Promise.all(asyncChecks).then(() => {
  console.log(`\nИтог v13.070: PASS ${passed} · FAIL ${failures.length}`);
  if (failures.length) console.log(failures.map(f => ' - ' + f).join('\n'));
});
