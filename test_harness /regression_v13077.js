// ⚡ v13.077: подсказки вместо гейтов (F3), туман окопов для A.I.R.F., векторные
//    знаки местности + легенда, рельеф тактической карты (без цифр), исправления
//    «⚡ Быстрого старта» и молчания «🔍 Разведки».
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

// ─── 1. «⚡ Быстрый старт» открывает карту (гонка 400 мс убрана) ───
test('v13.077: selectScenario принимает opts.onMapReady и вызывает его после загрузки', () => {
  const fn = sliceFunction(HTML, 'selectScenario');
  assert.ok(fn.includes('function selectScenario(scenarioId, opts)'), 'параметр opts');
  assert.ok(fn.includes("typeof opts.onMapReady === 'function'"), 'колбэк проверяется');
  assert.ok(fn.includes('opts.onMapReady(data)'), 'колбэк вызван с данными карты');
  assert.ok(fn.includes('finishSelect(null)'), 'при ошибке загрузки — finishSelect(null)');
});
test('v13.077: quickStartCampaign — колбэк в onMapReady, без setTimeout 400 мс', () => {
  const fn = sliceFunction(HTML, 'quickStartCampaign');
  assert.ok(fn.includes('onMapReady: function () { quickStartEnterMap(); }'), 'вход на карту через onMapReady');
  assert.ok(fn.includes('confirmBattalion(faction, supportIds)'), 'батальон формируется');
  assert.ok(!/setTimeout\(/.test(fn), 'таймера нет — гонки нет');
  assert.ok(!/selectCampaignFaction\(faction\)/.test(fn), 'вызов selectCampaignFaction убран');
});
test('v13.077: quickStartEnterMap — карта, свои, враг, toast', () => {
  const fn = sliceFunction(HTML, 'quickStartEnterMap');
  assert.ok(fn.includes('showOperationalMap()'), 'переход на карту');
  assert.ok(fn.includes('autoPlaceUnplacedUnits({ manual: false })'), 'свои расставлены');
  assert.ok(fn.includes('autoPlaceEnemyUnits()'), 'враг расставлен');
  assert.ok(fn.includes('applyUxPhase()'), 'фазы обновлены');
});
test('v13.077: finishSelect не ломает онлайн (pendingStart обрабатывается раньше колбэка)', () => {
  const fn = sliceFunction(HTML, 'selectScenario');
  const iOnline = fn.indexOf('ONLINE.pendingStart');
  const iCb = fn.indexOf("typeof opts.onMapReady === 'function'");
  assert.ok(iOnline > 0 && iOnline < iCb, 'онлайн-ветка до колбэка');
});

// ─── 2. «🔍 Разведка» — видимый результат вместо тишины ───
test('v13.077: засада — сообщение в строке карты + toast (не только лог)', () => {
  const fn = sliceFunction(HTML, 'checkOpDetection');
  const iAmbush = fn.indexOf('unit.isAmbush');
  const block = fn.slice(iAmbush, fn.indexOf('// ⚡ v13.046', iAmbush));
  assert.ok(block.includes('mapInfo'), 'mapInfo обновляется');
  assert.ok(/засад/i.test(block), 'текст про засаду');
});
test('v13.077: «не обнаружен» (дистанция/линия видимости) — сообщение в строке карты + toast', () => {
  const fn = sliceFunction(HTML, 'checkOpDetection');
  const i = fn.indexOf('unitCanBeDetected');
  const block = fn.slice(i, i + 1600);
  assert.ok(block.includes('mapInfo') && block.includes('обнаружение невозможно'), 'текст в mapInfo');
});

// ─── 3. Туман войны: A.I.R.F. не видит окопов BeVe до боя на гексе ───
const FOG_FNS = ['opFogRevealHex', 'opMarkerIsFogged', 'opVisibleMarkers'];
function fogSandbox(opts) {
  opts = opts || {};
  const s = createSandbox(freshAppData());
  s.run(FOG_FNS.map(n => sliceFunction(HTML, n)).join('\n'));
  if (opts.faction) s.sandbox.appData.campaign.playerFaction = opts.faction;
  if (opts.revealed) s.sandbox.appData.campaign.fogRevealedHexes = opts.revealed;
  if (opts.battleHex) {
    s.sandbox.appData.currentBattleId = 1;
    s.sandbox.appData.map = { hexKey: opts.battleHex };
  }
  return s;
}
test('v13.077: A.I.R.F. — окопы и подготовка позиций скрыты на старте', () => {
  const s = fogSandbox({ faction: 'A.I.R.F.' });
  assert.equal(s.evalCtx('opMarkerIsFogged("trenches", 3, 3)'), true, 'trenches скрыты');
  assert.equal(s.evalCtx('opMarkerIsFogged("prep_positions", 3, 3)'), true, 'prep скрыты');
  assert.equal(s.evalCtx('opMarkerIsFogged("crater", 3, 3)'), false, 'воронки не скрываются');
  assert.equal(s.evalCtx('opMarkerIsFogged("forest", 3, 3)'), false, 'лес не скрывается');
});
test('v13.077: BeVe — свои окопы видны; и для других меток — без тумана', () => {
  const s = fogSandbox({ faction: 'BeVe' });
  assert.equal(s.evalCtx('opMarkerIsFogged("trenches", 3, 3)'), false);
  assert.equal(s.evalCtx('opMarkerIsFogged("prep_positions", 3, 3)'), false);
});
test('v13.077: после боя на гексе метки открываются (fogRevealedHexes)', () => {
  const s = fogSandbox({ faction: 'A.I.R.F.', revealed: ['3,3'] });
  assert.equal(s.evalCtx('opMarkerIsFogged("trenches", 3, 3)'), false, 'открытый гекс виден');
  assert.equal(s.evalCtx('opMarkerIsFogged("trenches", 5, 6)'), true, 'другой гекс — в тумане');
});
test('v13.077: бой прямо сейчас на гексе — позиции видны (без сохранения)', () => {
  const s = fogSandbox({ faction: 'A.I.R.F.', battleHex: '8,8' });
  assert.equal(s.evalCtx('opMarkerIsFogged("trenches", 8, 8)'), false, 'в бою — видно');
  assert.equal(s.evalCtx('opMarkerIsFogged("trenches", 3, 3)'), true, 'не тот гекс — в тумане');
});
test('v13.077: opFogRevealHex — добавляет гекс один раз, сохраняется в campaign', () => {
  const s = fogSandbox({ faction: 'A.I.R.F.' });
  s.run('opFogRevealHex("3,3"); opFogRevealHex("3,3");');
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx('appData.campaign.fogRevealedHexes'))), ['3,3'], 'без дублей');
  assert.equal(s.evalCtx('opMarkerIsFogged("trenches", 3, 3)'), false);
});
test('v13.077: opVisibleMarkers фильтрует метки гекса (оба формата ячеек)', () => {
  const s = fogSandbox({ faction: 'A.I.R.F.' });
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx(
    'opVisibleMarkers({ markers: ["trenches", "rocks"] }, 3, 3)'
  ))), ['rocks'], 'объектная ячейка');
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx(
    'opVisibleMarkers({ types: ["grass"], markers: ["trenches"] }, 3, 3)'
  ))), [], 'только окопы — пусто');
  assert.deepEqual(JSON.parse(JSON.stringify(s.evalCtx(
    'opVisibleMarkers(null, 3, 3)'
  ))), [], 'null-ячейка не падает');
});
test('v13.077: отрисовка карты и мини-карты используют opVisibleMarkers', () => {
  const i1 = HTML.indexOf('function redrawOperationalMapNow');
  const block1 = HTML.slice(i1, HTML.indexOf('// ⚡ ОТРИСОВКА ЦЕЛЕВОГО ГЕКСА', i1));
  assert.ok(block1.includes('opVisibleMarkers(hexData, col, row)'), 'главная карта');
  assert.ok(!/case 'trenches': icon = '🕳️'/.test(block1), 'старый эмодзи-switch в отрисовке удалён');
  const i2 = HTML.indexOf('function renderCampaignMiniMap');
  const block2 = HTML.slice(i2, i2 + 4000);
  assert.ok(block2.includes('opVisibleMarkers(cell, col, row)'), 'мини-карта');
});
test('v13.077: хук раскрытия стоит в openHexMapForBattle (js/hexmaps.js)', () => {
  const hex = read('js/hexmaps.js');
  const fn = hex.slice(hex.indexOf('function openHexMapForBattle'), hex.indexOf('// ─────────────────── ПРАВИЛА', hex.indexOf('function openHexMapForBattle')));
  assert.ok(fn.includes('typeof opFogRevealHex === \'function\'') && fn.includes('opFogRevealHex(hexKey)'), 'вызов есть');
});
test('v13.077: легенда A.I.R.F. объясняет туман окопов', () => {
  assert.ok(/Окопы и позиции противника видны после боя на этом гексе \(туман войны\)/.test(HTML), 'плашка легенды');
});

// ─── 4. Векторные знаки + легенда ───
test('v13.077: drawOpMarkerGlyph — все типы меток обработаны', () => {
  const fn = sliceFunction(HTML, 'drawOpMarkerGlyph');
  ['trenches', 'prep_positions', 'building', 'forest', 'bushes', 'rocks', 'crater', 'destroyedVehicle', 'bicyclePark'].forEach(t => {
    assert.ok(fn.includes("case '" + t + "'"), t + ' есть');
  });
  assert.ok(fn.includes('default:'), 'default-знак');
});
test('v13.077: эмодзи-метки из отрисовки карты убраны (fillText-иконки не рисуются)', () => {
  const i = HTML.indexOf('function redrawOperationalMapNow');
  const block = HTML.slice(i, HTML.indexOf('// ⚡ ОТРИСОВКА ЦЕЛЕВОГО ГЕКСА', i));
  assert.ok(!/case 'forest': icon = '🌲'/.test(block), 'нет старого switch');
  assert.ok(block.includes('drawOpMarkerGlyph(ctx, type, x, markerY, size)'), 'новый вызов');
});
test('v13.077: легенда — контейнер, список знаков, перерисовка по сигнатуре', () => {
  assert.ok(tag(/<div id="opMapLegend"><\/div>/), 'контейнер в разметке');
  const items = sliceConst(HTML, 'OP_LEGEND_ITEMS');
  assert.ok(items.includes('trenches') && items.includes('destroyedVehicle'), 'список знаков');
  const fn = sliceFunction(HTML, 'initOpMapLegend');
  assert.ok(fn.includes('opMapLegendSig'), 'сигнатура (не рижует каждый тик)');
  assert.ok(fn.includes('drawOpMarkerGlyph(ctx, OP_LEGEND_ITEMS[idx][0]'), 'микрокадры — те же функции');
});
test('v13.077: applyUxPhase обновляет легенду и пульсацию подсказки', () => {
  const i = HTML.indexOf('function applyUxPhase() {');
  const body = HTML.slice(i, HTML.indexOf('function toggleUxMoreMenu()', i));
  assert.ok(body.includes('window.initOpMapLegend === \'function\''), 'легенда');
  assert.ok(body.includes('window.uxApplyHintGlow === \'function\''), 'пульсация');
});

// ─── 5. Рельеф тактической карты ───
test('v13.077: buildReliefOverlay — кэш, тонировка, полосы рёбер, изогипса', () => {
  const fn = sliceFunction(HTML, 'buildReliefOverlay');
  assert.ok(fn.includes('reliefOverlayCache'), 'кэш');
  assert.ok(fn.includes('rgba(255, 210, 140,'), 'гипсометрический тон');
  assert.ok(fn.includes('RELIEF_EDGE_NEIGHBORS'), 'соседи по рёбрам');
  assert.ok(fn.includes('RELIEF_EDGE_LIGHT'), 'освещение с СЗ');
  assert.ok(fn.includes('octx.clip()'), 'полосы обрезаны по гексу');
  assert.ok(/изогипса/.test(fn) || fn.includes('rgba(74, 52, 30, 0.30)'), 'линия границы уровней');
});
test('v13.077: redrawMap рисует рельеф поверх местности (кроме hexEdit)', () => {
  const fn = sliceFunction(HTML, 'redrawMap');
  assert.ok(fn.includes('buildReliefOverlay(canvas)'), 'вызов есть');
  assert.ok(fn.includes("appData.map.mode !== 'hexEdit'"), 'в редакторе не рисуется');
  assert.ok(fn.includes('ctx.drawImage(relief, 0, 0, rw, rh)'), 'offscreen на канвас');
});
// вычистить «const NAME = … ;» в чистое выражение (sliceConst оставляет отступ строки)
const asExpr = (name) => sliceConst(HTML, name).replace(/^[ \t]*const [A-Za-z_][A-Za-z0-9_]* [^=]*=/, '').replace(/;+\s*$/, '');

test('v13.077: таблица соседей RELIEF_EDGE_NEIGHBORS верна для odd-r (проверка по геометрии)', () => {
  const S = 1, SQ3 = Math.sqrt(3);
  const NEIGH = JSON.parse(JSON.stringify((0, eval)('(' + asExpr('RELIEF_EDGE_NEIGHBORS') + ')')));
  assert.equal(NEIGH.length, 6);
  const center = (col, row) => ({ x: col * SQ3 * S + (row % 2) * SQ3 * S / 2, y: row * 1.5 * S });
  const vertices = (x, y) => {
    const v = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); v.push([x + S * Math.cos(a), y + S * Math.sin(a)]); }
    return v;
  };
  let bad = 0;
  for (let row = 1; row < 9; row++) for (let col = 1; col < 9; col++) {
    const c = center(col, row);
    const v = vertices(c.x, c.y);
    for (let e = 0; e < 6; e++) {
      const mx = (v[e][0] + v[(e + 1) % 6][0]) / 2, my = (v[e][1] + v[(e + 1) % 6][1]) / 2;
      const off = NEIGH[e][row % 2];
      let best = null, bd = Infinity;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        if (!dc && !dr) continue;
        const p = center(col + dc, row + dr);
        const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
        if (d < bd) { bd = d; best = [col + dc, row + dr]; }
      }
      if (best[0] !== col + off[0] || best[1] !== row + off[1]) bad++;
    }
  }
  assert.equal(bad, 0, 'все 784 рёбра: сосед по таблице = ближайший центр');
});
test('v13.077: освещение — свет с СЗ; таблицы роялей и склонов соответствуют геометрии', () => {
  const N = JSON.parse(JSON.stringify((0, eval)('(' + asExpr('RELIEF_EDGE_NORMALS') + ')')));
  const Lc = JSON.parse(JSON.stringify((0, eval)('(' + asExpr('RELIEF_EDGE_LIGHT') + ')')));
  const Ls = JSON.parse(JSON.stringify((0, eval)('(' + asExpr('RELIEF_EDGE_SLOPE_LIGHT') + ')')));
  assert.equal(Lc.length, 6);
  assert.equal(Ls.length, 6);
  const LIGHT_DIR = [0.7071, 0.7071]; // СЗ (вектор распространения вправо-вниз)
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  for (let e = 0; e < 6; e++) {
    const n = N[e];
    const dot = n[0] * LIGHT_DIR[0] + n[1] * LIGHT_DIR[1];
    // обрыв: внешняя нормаль смотрит навстречу свету → max(0, −dot)
    assert.ok(Math.abs(Lc[e] - clamp01(-dot)) < 1e-3, 'обрыв e' + e + ': ' + Lc[e] + ' ≠ ' + clamp01(-dot));
    // склон вверх: поверхность спускается к нам, нормаль = −n → max(0, +dot)
    assert.ok(Math.abs(Ls[e] - clamp01(dot)) < 1e-3, 'склон e' + e + ': ' + Ls[e] + ' ≠ ' + clamp01(dot));
  }
  // смысл: запад/СЗ-рёбра освещены для обрыва, восток/ЮВ — нет
  assert.ok(Lc[3] > 0.5 && Lc[4] > 0.9 && Lc[0] === 0 && Lc[1] === 0, 'обрыв: СЗ-сторона на свету');
  assert.ok(Ls[0] > 0.5 && Ls[1] > 0.9 && Ls[3] === 0 && Ls[4] === 0, 'склон: свет там, где спуск к СЗ');
});
test('v13.077: отрисовка полос — обрыв и склон берут разные таблицы освещения', () => {
  const fn = sliceFunction(HTML, 'buildReliefOverlay');
  assert.ok(fn.includes('d < 0 ? RELIEF_EDGE_LIGHT[e] : RELIEF_EDGE_SLOPE_LIGHT[e]'), 'ветка обрыв/склон');
});
test('v13.077: подписи: легенда на карте операции и пояснение рельефа под тактической картой', () => {
  const note = tag(/<div id="tacticalReliefNote">[\s\S]*?<\/div>/);
  assert.ok(note && /Рельеф/.test(note), 'подпись рельефа: ' + (note || 'нет'));
  assert.ok(/op-legend-note \{/.test(HTML), 'стиль плашки легенды');
});
test('v13.077: «▲N» в режиме редактора сохранён (для автора карты)', () => {
  const fn = sliceFunction(HTML, 'drawHex');
  assert.ok(fn.includes('appData.map.mode === \'edit\' && hexData.level !== undefined && hexData.level !== 0'), 'режим edit');
  assert.ok(fn.includes('▲'), 'маркер ▲N');
});

// ─── 6. версия ───
const APP = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
test('v13.077: APP_VERSION = v13.077 и CHANGELOG на месте', () => {
  assert.equal(APP, 'v13.077');
  assert.ok(fs.existsSync(path.join(ROOT, 'CHANGELOG-v13.077.md')));
});

console.log(`\nИтог v13.077: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) process.exitCode = 1;
