'use strict';
// ⚡ v13.087: регрессия по правкам оперативной карты (размещение, талреп, высадка, связь, UI).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');
const UI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/operational_ui.css'), 'utf8');
const HEX = fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8');
const DATA = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('✓ ' + name); }
  catch (e) { fail++; console.log('✗ ' + name + ' — ' + e.message.split('\n')[0]); }
}
function mkOpUnit(name, faction, mobility, type) {
  return { name, faction, mobility, type, col: 5, row: 5, ap: 4, maxAp: 4, squads: [], detected: false, noiseMarker: false };
}

test('v13.087: версия и маркеры синхронизированы', () => {
  // ⚡ v13.088: сверяем маркеры с текущим APP_VERSION, а не с жёстко зашитой
  //    версией — иначе тест падал бы после каждого следующего номера сборки.
  const ver = /var APP_VERSION = '(v[\d.]+)'/.exec(HTML)[1];
  assert.ok(ver, 'APP_VERSION найден');
  const esc = ver.replace(/\./g, '\\.');
  assert.match(fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8'), new RegExp('wargame-' + esc + "'"));
  assert.match(UI, new RegExp('BUILD-МАРКЕР: ' + esc));
  assert.match(DATA, new RegExp('BUILD-МАРКЕР: ' + esc));
  assert.match(HEX, new RegExp('BUILD-МАРКЕР: ' + esc));
});

test('v13.087 (п.13): талреп — hill→hill запрещён, hill с плейна — разрешён', () => {
  const s = createSandbox(freshAppData());
  s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
  s.sandbox.appData.campaign.opMapGrid['5,5'] = ['hill'];
  s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
  s.sandbox.appData.campaign.opMapGrid['4,5'] = ['grass'];
  s.run(sliceFunction(HTML, 'getOpHexTypes'));
  s.run(sliceFunction(HTML, 'getOpMoveCost'));
  s.run('function tacticalHexHasSublevel2(){ return true; } function isBeveSwampTraversable(){ return true; } function isNightTime(){ return false; }');
  const tank = mkOpUnit('tank-1', 'A.I.R.F.', 'vehicle', 'tank_platoon');
  tank.winch = true;
  const fromPlain = s.evalCtx('getOpMoveCost(' + JSON.stringify(tank) + ', 4, 5, 5, 5)');
  const hillToHill = s.evalCtx('getOpMoveCost(' + JSON.stringify(tank) + ', 5, 5, 6, 5)');
  assert.ok(Number.isFinite(fromPlain), 'с плейна на холм: ' + fromPlain);
  assert.equal(hillToHill, Infinity, 'холм → холм: ' + hillToHill);
});

test('v13.087 (п.12): скрытный подъём на холм стоит OP_STEALTH_HILL_COST (не 0 и не блок)', () => {
  assert.match(HTML, /const OP_STEALTH_HILL_COST = 2;/);
  const s = createSandbox(freshAppData());
  s.sandbox.appData.campaign.opMapGrid['5,5'] = ['hill'];
  s.sandbox.appData.campaign.opMapGrid['4,5'] = ['grass'];
  s.run('const OP_STEALTH_HILL_COST = 2; function tacticalHexHasSublevel2(){ return true; } function isNightTime(){ return false; }');
  s.run(sliceFunction(HTML, 'getOpHexTypes'));
  s.run(sliceFunction(HTML, 'getOpMoveCost'));
  const inf = mkOpUnit('inf-1', 'A.I.R.F.', 'foot', 'at_platoon');
  inf.stealthMove = true;
  const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(inf) + ', 4, 5, 5, 5)');
  assert.equal(cost, 2, 'стоимость скрытного подъёма: ' + cost);
});

test('v13.087 (п.6): талреп-якорь не выдаётся автоматически при создании юнита', () => {
  const addFn = sliceFunction(HTML, 'addOpUnit');
  assert.ok(!/winch\s*=\s*true/.test(addFn), 'addOpUnit не ставит winch=true');
});

test('v13.087 (п.7/14): панель связи сворачивается, справка есть в разметке', () => {
  assert.match(HTML, /id="commCollapseBtn"/);
  assert.match(HTML, /id="commPanelBody"/);
  assert.match(HTML, /class="op-comm-help"/);
  assert.match(UI, /window\.toggleCommPanelBody/);
});

test('v13.087 (п.1): выпадающий выбор юнита скрыт (#opPlaceSelectWrap)', () => {
  assert.match(HTML, /id="opPlaceSelectWrap"/);
  assert.match(CSS, /#opPlaceSelectWrap \{ display: none !important; \}/);
});

test('v13.087 (п.3–4): док этапа размещения закреплён внизу', () => {
  assert.match(CSS, /#opStageDock \{[\s\S]*?position: fixed;[\s\S]*?bottom: 0;/);
  assert.match(UI, /function ensureDock/);
  assert.match(UI, /function syncStageLayout/);
  assert.match(UI, /installCanvasDrag\(\);/);
});

test('v13.087 (п.5): трей группирует отряды по строкам', () => {
  assert.match(UI, /function placementRows/);
  assert.match(CSS, /\.op-placement-row \{/);
});

test('v13.087 (п.8): меню приказа скрывается во время выбора маршрута или гекса', () => {
  const rc = sliceFunction(UI.includes('function renderCommandMenu') ? UI : HTML, 'renderCommandMenu');
  assert.ok(rc.includes('state.mapPick'), 'проверка state.mapPick в renderCommandMenu');
});

test('v13.087 (п.10): приказы пассажиру и кнопка «Приказы десанту»', () => {
  assert.match(UI, /data-cmd="select-passenger"/);
  assert.match(UI, /function carrierOf/);
  assert.match(UI, /function passengerOf/);
});

test('v13.087 (п.9/16): специальные приказы — разведка и посадка/высадка, гекс выполнения', () => {
  assert.match(UI, /\['recon', '🔍 Разведка'\]/);
  // ⚡ v13.089: машине — «Высадить десант», десанту — «Выйти из БТР»
  assert.match(UI, /\['disembark', \(isBtrUnit\(unit\) && !unit\.embarkedInBtr\) \? '🚌 Высадить десант' : '🚶 Выйти из БТР'\]/);
  assert.match(UI, /options\.targetHex = draft\.targetHex/);
  assert.match(HTML, /case 'disembark':/);
});

test('v13.087 (п.11): панель всех приказов выводится в #activeOrdersList', () => {
  assert.match(HTML, /id="activeOrdersList"/);
});

test('v13.087 (п.15): редкие кнопки перенесены в #opBottomActions', () => {
  const i = HTML.indexOf('id="opBottomActions"');
  assert.ok(i > 0, 'блок найден');
  const block = HTML.slice(i, i + 4000);
  assert.ok(block.includes('uxMoreMenu'), 'ещё-меню внутри блока');
  assert.ok(block.includes('opPhaseRare') || block.includes('op-rare'), 'редкие действия внутри блока');
});

test('v13.087 (п.17): лесоповал → «лес поваленный1», вырубка → «трава1»', () => {
  assert.match(HEX, /лес поваленный1\.png/);
  assert.match(HEX, /трава1\.png/);
});

console.log(`\nИтог v13.087: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exit(1);
