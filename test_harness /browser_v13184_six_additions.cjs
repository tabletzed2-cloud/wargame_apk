'use strict';
// NODE_PATH=/tmp/browsertest/node_modules LD_LIBRARY_PATH=/tmp/chromlibs/lib node this-file
// Реальная проверка v13.184: зона видимости на опкарте, панель расстановки по взводам,
// цвет подсветки по взводу, обзор из-под холма, пленные в карточке, окружение в окопах.
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
  let failures = 0;
  try {
    browser = await chromium.launch({executablePath: await portable.executablePath(), args: portable.args, headless: true});
    const page = await browser.newPage({viewport: {width: 900, height: 900}, serviceWorkers: 'block'});
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    page.on('dialog', d => d.dismiss());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'load'});
    await page.waitForFunction(() => typeof selectScenario === 'function');

    const result = await page.evaluate(async () => {
      const checks = [];
      const check = (name, ok, extra) => checks.push({name, ok: !!ok, extra});
      setCampaignTutorialEnabled(false);
      try { ONLINE.started = false; ONLINE.docRef = null; ONLINE.match = null; } catch (e) {}
      selectScenario('valencia');
      await new Promise(res => {
        const t0 = Date.now();
        const timer = setInterval(() => {
          const g = appData.campaign.opMapGrid;
          if ((g && Object.keys(g).length === 280) || Date.now() - t0 > 8000) { clearInterval(timer); res(); }
        }, 50);
      });

      check('версия v13.184', APP_VERSION === 'v13.184', APP_VERSION);

      // ── п.1 зона видимости ─────────────────────────────────────────────
      const unit = {name: 'тест', col: 5, row: 7, squads: []};
      const day = opUnitVisionHexes(unit);
      // в сценарии может быть ночь — сравниваем с фактическим правилом
      const expectRadius = isNightTime() ? 1 : 3;
      check('п.1 радиус соответствует времени суток', day.radius === expectRadius, `${day.radius} при ночь=${isNightTime()}`);
      check('п.1 центральный гекс в зоне', day.keys.has('5,7'));
      check('п.1 зона не пустая', day.keys.size > 0, day.keys.size);
      const ranNight = (() => {
        const wasNight = (typeof isNightTimeCached !== 'undefined') ? isNightTimeCached : null;
        return wasNight;
      })();
      // зона рисуется без исключений
      appData.campaign.selectedOpUnit = Object.assign({}, unit, {isInBattle: false});
      let drawError = null;
      try {
        const ctx2 = document.createElement('canvas').getContext('2d');
        drawSelectedUnitVisionZone(ctx2, 40);
      } catch (e) { drawError = String(e.message); }
      check('п.1 зона рисуется без ошибок', drawError === null, drawError);
      check('п.1 ночная константа 1', OP_VISION_RANGE_NIGHT === 1 && OP_VISION_RANGE_DAY === 3);

      // ── п.2 панель расстановки выше карты ───────────────────────────────
      const tray = document.getElementById('battlePlacementTray');
      const panel = document.getElementById('battlePlacementPanel');
      const mapContainer = document.getElementById('mapContainer');
      check('п.2 трай и панель есть', !!tray && !!panel);
      const order = Array.from(document.querySelectorAll('#battlePlacementTray, #battlePlacementPanel, #mapContainer, #battleEventLogPanel'));
      check('п.2 трай раньше холста в документе? (панель ПОД холстом, но выше журнала)',
        order.indexOf(tray) < order.indexOf(document.getElementById('battleEventLogPanel')),
        order.map(e => e.id).join(' > '));
      check('п.2 трай идёт сразу после холста',
        order.indexOf(tray) === order.indexOf(mapContainer) + 1 ||
        order.indexOf(tray) === order.indexOf(mapContainer) + 2,
        order.map(e => e.id).join(' > '));
      check('п.2 панель сразу после трая', order.indexOf(panel) === order.indexOf(tray) + 1);
      check('п.2 группы по взводам рисуются', (() => {
        tray.style.display = 'block';
        tray.innerHTML = placementTrayGroupsHtml([
          {i: 0, s: {name: 'A', opUnitName: '3-й взвод'}},
          {i: 1, s: {name: 'B', opUnitName: '7-й взвод'}},
          {i: 2, s: {name: 'C', opUnitName: '3-й взвод'}}
        ], {});
        const groups = tray.querySelectorAll('.battle-placement-group');
        const chips = tray.querySelectorAll('.battle-placement-chip');
        const leftBorder = getComputedStyle(groups[0]).borderLeftWidth;
        tray.innerHTML = ''; tray.style.display = 'none';
        return groups.length === 2 && chips.length === 3 && leftBorder === '3px';
      })());

      // ── п.3 цвет подсветки по взводу ────────────────────────────────────
      const battle = {
        id: 'b1',
        playerSquads: [{name: 'A', opUnitName: '3-й взвод', fighters: [{hp: 3}]},
                       {name: 'B', opUnitName: '7-й взвод', fighters: [{hp: 3}]}],
        enemySquads: []
      };
      appData.campaign.activeBattles = [battle];
      appData.currentBattleId = 'b1';
      appData.squads = battle.playerSquads.slice();
      const c3 = tacticalSquadHighlightColor(appData.squads[0]);
      const c7 = tacticalSquadHighlightColor(appData.squads[1]);
      check('п.3 цвета взводов разные', c3 !== c7, `${c3} / ${c7}`);
      check('п.3 цвет не жёлтый по умолчанию', c3 !== '#ff0' && c3 !== '#ffff00', c3);
      const orderSaved = Array.isArray(battle.platoonColorOrder) && battle.platoonColorOrder.length === 2;
      check('п.3 порядок цветов сохранён в бою', orderSaved, JSON.stringify(battle.platoonColorOrder));
      // другой бой — другое назначение
      const battle2 = {
        id: 'b2',
        playerSquads: [{name: 'G', opUnitName: 'голландский №1'}, {name: 'B', opUnitName: 'бельгийский №1'}],
        enemySquads: []
      };
      appData.campaign.activeBattles = [battle2];
      appData.currentBattleId = 'b2';
      appData.squads = battle2.playerSquads;
      check('п.3 в другом бою первый цвет достаётся первому взводу этого боя',
        tacticalPlatoonColor('голландский №1') === c3 && tacticalPlatoonColor('бельгийский №1') === c7,
        `${tacticalPlatoonColor('голландский №1')} / ${tacticalPlatoonColor('бельгийский №1')}`);

      // ── п.4 обзор из-под холма ──────────────────────────────────────────
      const savedGrid = appData.map && appData.map.grid;
      const grid = {};
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        grid[`${c},${r}`] = {type: 'grass', level: r === 0 ? 0 : 1};
      }
      appData.map = appData.map || {};
      appData.map.grid = grid;
      check('п.4 гребень виден', tacticalHasLineOfSight({col: 2, row: 0}, {col: 2, row: 1}));
      check('п.4 2 гекса в глубину за гребнем видны',
        tacticalHasLineOfSight({col: 2, row: 0}, {col: 2, row: 2}) &&
        tacticalHasLineOfSight({col: 2, row: 0}, {col: 2, row: 3}));
      check('п.4 глубже 2 гексов не видно', !tacticalHasLineOfSight({col: 2, row: 0}, {col: 2, row: 4}));
      appData.map.grid = savedGrid;

      // ── п.5 пленные в карточке взвода ───────────────────────────────────
      const popupUnit = {
        name: 'Взвод пленных', faction: 'Испания', type: 'пехота', col: 3, row: 4,
        squads: [
          {name: 'Живое отделение', fighters: [{hp: 4}, {hp: 2}], currentMorale: 70, ammoSmall: 20, grenades: 1, ammoOrdnance: 0},
          {name: 'Пленное отделение', fighters: [{hp: 3}], isSurrendered: true},
          {name: 'Выбитое отделение', fighters: [{hp: 0}]}
        ]
      };
      showOpUnitInfoPopup(popupUnit);
      const popup = document.getElementById('opUnitInfoPopup');
      const text = popup ? popup.textContent : '';
      check('п.5 сводка по пленным есть', /в плену/.test(text) && /уничтожено/.test(text), text.slice(0, 120));
      check('п.5 живое отделение показано', /Живое отделение/.test(text));
      check('п.5 пленное отделение НЕ показано строкой', !/Пленное отделение/.test(text));
      check('п.5 выбитое отделение НЕ показано строкой', !/Выбитое отделение/.test(text));
      closeOpUnitInfoPopup();

      // ── п.6 окопы: ворвавшийся не окружён ──────────────────────────────
      check('п.6 функция проверки прорыва есть', typeof tacticalBreachExemptsEncirclement === 'function');
      check('п.6 порог отсечения 4', TACTICAL_CUTOFF_MIN_DISTANCE === 4);
      const g2 = {};
      for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) g2[`${c},${r}`] = {type: 'grass', squadIds: [], enemySquadIds: []};
      appData.map.grid = g2;
      appData.map.enemySquads = [];
      appData.squads = [{name: 'штурм', fighters: [{hp: 5}]}, {name: 'свой', fighters: [{hp: 5}]}];
      g2['5,1'] = {type: 'trenches', squadIds: [0], enemySquadIds: []};
      g2['5,3'] = {type: 'grass', squadIds: [1], enemySquadIds: []};
      const breach = tacticalBreachExemptsEncirclement(appData.squads[0], false);
      check('п.6 в окопах врага и свои рядом → не окружён', breach.exempt === true, JSON.stringify(breach));
      // отсечение: свои далеко, стена врагов
      g2['5,3'] = {type: 'grass', squadIds: [], enemySquadIds: []};
      g2['5,14'] = {type: 'grass', squadIds: [1], enemySquadIds: []};
      for (let c = 0; c < 20; c++) {
        appData.map.enemySquads.push({name: 'стена-' + c, fighters: [{hp: 5}]});
        g2[`${c},5`] = {type: 'trenches', squadIds: [], enemySquadIds: [appData.map.enemySquads.length - 1]};
        appData.map.enemySquads.push({name: 'стена2-' + c, fighters: [{hp: 5}]});
        g2[`${c},6`] = {type: 'grass', squadIds: [], enemySquadIds: [appData.map.enemySquads.length - 1]};
      }
      const cut = tacticalBreachExemptsEncirclement(appData.squads[0], false);
      check('п.6 после контратаки (отсечён, свои далеко) → окружение засчитывается',
        cut.exempt === false && cut.nearest > 4, JSON.stringify(cut));

      return {checks, errors: []};
    });

    for (const c of result.checks) {
      if (c.ok) console.log(`PASS ${c.name}`);
      else { failures++; console.log(`FAIL ${c.name}${c.extra !== undefined ? ' → ' + c.extra : ''}`); }
    }
    const pageErrors = errors.filter(e => !/ResizeObserver|favicon/i.test(e));
    if (pageErrors.length) { failures++; console.log('FAIL ошибки страницы: ' + pageErrors.slice(0, 5).join(' | ')); }
    else console.log('PASS нет ошибок JS на странице');
    console.log(`\nИтог v13.184: PASS ${result.checks.filter(c => c.ok).length} · FAIL ${result.checks.filter(c => !c.ok).length}`);
  } catch (e) {
    failures++;
    console.log('CRASH ' + (e && e.message));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  process.exit(failures ? 1 : 0);
})();
