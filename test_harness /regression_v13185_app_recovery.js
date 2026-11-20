'use strict';
// Регрессия восстановления запуска приложения и синхронизации сборки v13.185.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const version = 'v13.185';

const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let blocks = 0;
while ((match = scriptRe.exec(html))) {
  blocks++;
  assert.doesNotThrow(() => new vm.Script(match[1]), `inline script block ${blocks} must parse`);
}
assert(blocks > 0, 'inline scripts must be present');

for (const id of ['campaignApp', 'campaignContent', 'campaignMapScreen', 'opLogContainer']) {
  assert(new RegExp(`<[^>]+\\bid=["']${id}["']`).test(html), `missing required UI element #${id}`);
}
assert.match(html, /\blet selectedFaction\s*=\s*null\s*;/, 'selectedFaction must be declared globally');
assert.match(html, /\blet selectedSubFaction\s*=\s*null\s*;/, 'selectedSubFaction must be declared globally');
assert.match(html, /savedFactionChoice\s*=\s*JSON\.parse\(safeLocalStorage\('getItem',\s*'wargame_choice'\)/,
  'saved faction choice must be restored before it is written');
assert.match(html, /\blet appData\s*;/, 'appData must be declared by the main application script');
assert.match(html, new RegExp(`var APP_VERSION = '${version}';`));
assert(html.includes(`<title>Боевой модуль ${version} — операция</title>`));
assert(html.includes(`id="appVersionBadge"` ) && html.includes(`>${version}</p>`));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.strictEqual(manifest.short_name, `БМ ${version}`);
const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
assert(sw.includes(`const CACHE_NAME = 'wargame-${version}';`));
for (const file of ['data.js', 'hexmaps.js', 'templates.js', 'operational_ui.js']) {
  const src = fs.readFileSync(path.join(root, 'js', file), 'utf8');
  assert(src.startsWith(`// ⚡ BUILD-МАРКЕР: ${version}`), `${file} build marker must match APP_VERSION`);
}

const dataJs = fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8');
const markerBlock = dataJs.match(/const markerIconMap = \{([\s\S]*?)\n\};/);
assert(markerBlock, 'markerIconMap must be defined');
for (const item of markerBlock[1].matchAll(/'[^']+'\s*:\s*\{\s*icon:\s*'([^']+)'/g)) {
  assert(fs.existsSync(path.join(root, item[1])), `marker icon is missing: ${item[1]}`);
}
assert.match(html, /if \(!def \|\| !def\.icon\) continue;/, 'marker preloader must not request null image URLs');
assert.match(html, /onclick="setMapMode\('marker'\)"[^>]*>📌 Установить метку/, 'marker button must switch to a defined map mode');
assert.match(html, /function setMapMode\(mode\)/, 'setMapMode handler must exist');
const mapIndex = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'index.json'), 'utf8'));
for (const item of mapIndex.filter(x => x.file && x.file.startsWith('maps/Карты Валенсия/'))) {
  assert(fs.existsSync(path.join(root, item.file)), `map index path does not exist: ${item.file}`);
}
const hexmaps = fs.readFileSync(path.join(root, 'js', 'hexmaps.js'), 'utf8');
assert.match(hexmaps, /const HEX_MAP_INDEX_FILES = \[HEX_MAP_DIR_ALT \+ 'index\.json'\];/,
  'tactical map loader must not request a nonexistent secondary index');

console.log(`v13.185 app recovery: PASS (${blocks} inline script blocks, UI elements, assets and build markers synchronized)`);
