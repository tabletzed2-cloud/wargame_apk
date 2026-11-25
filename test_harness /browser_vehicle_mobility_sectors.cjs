'use strict';
// npm install --no-save --no-package-lock playwright-core @sparticuz/chromium
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const pkg = require('@sparticuz/chromium');
const portable = pkg.default || pkg;
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end();
      const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '0.0.0.0', r));
  let browser;
  try {
    browser = await chromium.launch({executablePath:await portable.executablePath(), args:portable.args, headless:true});
    const page = await browser.newPage({viewport:{width:1000,height:900},serviceWorkers:'block'});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.dismiss());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil:'load'});
    await page.waitForFunction(() => typeof mapSelectSquadOnMap === 'function');
    const results = await page.evaluate(async () => {
      const check = (ok, text) => { if (!ok) throw new Error(text); };
      setCampaignTutorialEnabled(false);
      showOnlyAppScreen('battleApp');
      appData.currentBattleId = null;
      appData.campaign.active = false;
      currentTurn = 1;
      TACTICAL_MAP_SIZE = 7;
      const templates = SQUAD_TEMPLATES.filter(t => /Landsverk|CL\/39/.test(t.name));
      const results = [];
      for (const template of templates) {
        const squad = JSON.parse(JSON.stringify(template));
        squad.hexPos = [3,3];
        appData.squads = [squad];
        currentSquad = squad; currentSquadIndex = 0;
        actionPoints = {};
        appData.map = {mode:'view',baseHexSize:40,zoomLevel:1,grid:{},centers:[],enemySquads:[],
          selectedMoveSquadIdx:null,selectedEnemyMoveIdx:null,reachableHexes:[],isCrouchMode:false};
        for (let row=0;row<7;row++) for(let col=0;col<7;col++) {
          appData.map.grid[col+','+row] = {type:'grass',level:0,squadIds:[],enemySquadIds:[],markers:[]};
        }
        appData.map.grid['3,3'].squadIds = [0];
        ensureAP(0);
        const ap = getAP(0);
        mapSelectSquadOnMap(0,'3,3');
        check(shouldShowTacticalReachability(), template.name + ': movement zone gate');
        check(appData.map.reachableHexes.includes('4,3'), template.name + ': reachable neighbor');
        handleHexAction('4,3');
        check(squad.hexPos.join(',') === '4,3', template.name + ': actual map movement');
        check(appData.map.grid['4,3'].squadIds.includes(0), 'new cell membership');
        check(!appData.map.grid['3,3'].squadIds.includes(0), 'old cell membership removed');
        check(getAP(0) === ap - 1, template.name + ': correct AP cost');
        check(!__tacticalMovement, 'movement lock released');
        results.push({name:template.name,apBefore:ap,apAfter:getAP(0)});
      }
      // Pixel-level regression: a circular cannon sector must tint cells BOTH
      // above and below its origin, including cells drawn after the vehicle.
      const squad = appData.squads[0];
      squad.hexPos = [3,3];
      appData.map.grid['4,3'].squadIds = [];
      appData.map.grid['3,3'].squadIds = [0];
      appData.map.mode = 'view';
      appData.map.selectedMoveSquadIdx = null; currentSquadIndex = -1;
      redrawMap();
      const canvas = document.getElementById('gameMap');
      const ctx = canvas.getContext('2d');
      const scale = canvasBackingScale(canvas);
      const sample = key => {
        const c = appData.map.centers.find(c => c.key === key);
        return [...ctx.getImageData(Math.round(c.x*scale),Math.round(c.y*scale),1,1).data];
      };
      const aboveBefore = sample('3,2'), belowBefore = sample('3,4');
      appData.map.selectedMoveSquadIdx = 0;
      redrawMap();
      check(sample('3,2').join() !== aboveBefore.join(), 'sector above origin is visible');
      check(sample('3,4').join() !== belowBefore.join(), 'sector below origin is not overwritten by later hex');
      return results;
    });
    assert.equal(results.length, 8);
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log(JSON.stringify(results, null, 2));
    console.log('PASS: browser selection, movement/AP for all 8 vehicles, and sector pixels above/below origin.');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
