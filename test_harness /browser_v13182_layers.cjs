'use strict';
// NODE_PATH=/tmp/browsertest/node_modules LD_LIBRARY_PATH=/tmp/chromlibs/lib node this-file
// Реальная проверка v13.182: загрузка слоёв Валенсии, отрисовка уровней и дороги,
// движение по дороге и по высотам в живом приложении.
const {chromium} = require('playwright-core');
const chromiumPackage = require('@sparticuz/chromium');
const portable = chromiumPackage.default || chromiumPackage;
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.env.WARGAME_ROOT || path.join(__dirname, '..'));
(async () => {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      const t = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
      res.setHeader('Content-Type', t[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '0.0.0.0', r));
  let browser;
  try {
    browser = await chromium.launch({executablePath: await portable.executablePath(), args: portable.args, headless: true});
    const page = await browser.newPage({viewport:{width:900,height:900}, serviceWorkers:'block'});
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    page.on('dialog', d => d.dismiss());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil:'load'});
    await page.waitForFunction(() => typeof selectScenario === 'function');
    const result = await page.evaluate(async () => {
      let n = 0; const check = (ok, text) => { if (!ok) throw new Error(text); n++; };
      setCampaignTutorialEnabled(false);
      try { ONLINE.started = false; ONLINE.docRef = null; ONLINE.match = null; } catch (e) {}
      selectScenario('valencia');
      // selectScenario не возвращает промис — ждём загрузку слоёв из maps/*.json
      await new Promise(res => {
        const t0 = Date.now();
        const timer = setInterval(() => {
          const g = appData.campaign.opMapGrid;
          if ((Array.isArray(appData.campaign.opRoadEdges) || Date.now() - t0 > 8000) &&
              (g && Object.keys(g).length === 280 || Date.now() - t0 > 8000)) { clearInterval(timer); res(); }
        }, 50);
      });
      const c = appData.campaign;
      check(typeof c.opRoadEdges !== 'undefined', 'поле opRoadEdges отсутствует');
      check(Array.isArray(c.opRoadEdges) && c.opRoadEdges.length === 27, 'рёбра дороги не загрузились: ' + (c.opRoadEdges && c.opRoadEdges.length));
      check(!!(c.opLayers && c.opLayers.layers), 'зоны не загрузились');
      check(Object.keys(c.opLayers.layers).length === 8, 'ожидалось 8 групп зон');
      check(Object.keys(c.opMapGrid).length === 280, 'гексов: ' + Object.keys(c.opMapGrid).length);
      // уровни
      const lv = {}; Object.keys(c.opMapGrid).forEach(k => {
        const v = getOpHexLevel(...k.split(',').map(Number)); lv[v] = (lv[v] || 0) + 1;
      });
      check(lv[0] === 248 && lv[1] === 19 && lv[2] === 9 && lv[3] === 4, 'уровни: ' + JSON.stringify(lv));
      // зоны: уровни считаются по контурам, а не по гексам
      check(getOpHexLevel(3, 1) === 1 || getOpHexLevel(3, 1) === 0, 'уровень вне ожидаемого');
      check(typeof opZoneCovers === 'function' && opZoneCovers('forest', 0, 0), 'зона леса не читается');
      // карта кампании: из новых слоёв ничего не рисуется
      check(!/ff54cb/.test(document.documentElement.innerHTML), 'в разметке остался розовый слой');
      // дорога по связи
      const e0 = c.opRoadEdges[0], a = e0[0].split(',').map(Number), b = e0[1].split(',').map(Number);
      check(opRoadConnected(a[0], a[1], b[0], b[1]), 'первое ребро не связывает');
      check(!opRoadConnected(a[0], a[1], b[0] + 5, b[1] + 5), 'ложная связь');
      // отрисовка не падает
      const canvas = document.getElementById('opMapCanvas');
      initOperationalMap(); redrawOperationalMapNow();
      check(canvas.width > 0 && canvas.height > 0, 'canvas без размера');
      const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let nonEmpty = 0; for (let i = 3; i < px.length; i += 4 * 97) if (px[i] > 0) nonEmpty++;
      check(nonEmpty > 100, 'карта не нарисована: ' + nonEmpty);
      // правила движения
      const tank = { name: 'Танк', type: 'tank_platoon', mobility: 'vehicle', maxAp: 4, col: a[0], row: a[1] };
      check(getOpMoveCost(tank, a[0], a[1], b[0], b[1]) === 1, 'дорога: ' + getOpMoveCost(tank, a[0], a[1], b[0], b[1]));
      const foot = { name: 'Пехота', mobility: 'foot', maxAp: 4 };
      check(getOpMoveCost(foot, a[0], a[1], b[0], b[1]) === 1, 'пехота по дороге: ' + getOpMoveCost(foot, a[0], a[1], b[0], b[1]));
      // снабжение читает слои
      check(supplyMoveCost('vehicle', b[0], b[1], a[0], a[1]) === 1, 'снабжение по дороге');
      check(supplyMoveCost('foot', b[0], b[1], a[0], a[1]) === 1, 'пешее снабжение');
      return { n, edges: c.opRoadEdges.length, hexes: Object.keys(c.opMapGrid).length, levels: lv };
    });
    checkNoErrors(errors);
    console.log(`PASS v13.182 browser: ${result.n} проверок · ${result.hexes} гексов · ${result.edges} рёбер · уровни ${JSON.stringify(result.levels)}`);
    function checkNoErrors(list) { if (list.length) throw new Error('ошибки страницы: ' + list.join(' | ')); }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
