'use strict';
// NODE_PATH=<modules containing playwright-core and @sparticuz/chromium> node this-file
// Real Chromium: production HTML, scripts, CSS, canvas clicks and rotation buttons.
const {chromium} = require('playwright-core');
const chromiumPackage = require('@sparticuz/chromium');
const portable = chromiumPackage.default || chromiumPackage;
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json'};
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath: await portable.executablePath(), args: portable.args, headless:true});
    const page = await browser.newPage({viewport:{width:420,height:850}, serviceWorkers:'block'});
    page.on('dialog', d => d.dismiss());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil:'load'});
    await page.waitForFunction(() => typeof openHexEditorForBattle === 'function');
    await page.evaluate(() => {
      appData.campaign.active = true;
      appData.campaign.online = true;
      appData.campaign.currentTurn = 1;
      appData.campaign.hexOverlays = {};
      appData.campaign.opUnits = [{name:'Rotation test',col:4,row:4,squads:[{name:'Squad',fighters:Array.from({length:16},()=>({hp:3}))}]}];
      appData.currentBattleId = null;
      const grid = {};
      for(let r=0;r<20;r++) for(let c=0;c<20;c++) grid[`${c},${r}`] = {type:'grass',rotation:0,variant:0,squadIds:[],enemySquadIds:[],markers:[]};
      TACTICAL_HEX_MAPS['4,4'] = {grid,w:20,h:20};
      document.getElementById('battleApp').classList.add('online-player-mode');
      beginPendingHexEditDraft('4,4','trenches','Rotation test');
      openHexEditorForBattle('4,4','trenches','Rotation test');
    });
    const right = page.locator('#hexEditorRotateButton');
    await right.waitFor({state:'visible',timeout:3000});
    assert(await right.isDisabled(), 'no selection: rotation disabled');
    const canvas = page.locator('#gameMap');
    await canvas.scrollIntoViewIfNeeded();
    const point = await page.evaluate(() => appData.map.centers.find(p=>p.key==='0,0'));
    await canvas.click({position:{x:point.x,y:point.y}});
    await page.waitForFunction(() => !document.getElementById('hexEditorRotateButton').disabled);
    assert(await right.isEnabled(), 'map click enables rotation');
    await page.waitForFunction(() => loadedImages.trenches && loadedImages.trenches[0] && loadedImages.trenches[0].complete && loadedImages.trenches[0].naturalWidth > 0);
    // Observe the production renderer, not a replacement: it must rotate an actual loaded texture.
    await page.evaluate(() => {
      window.trenchRenderAngles = [];
      const rotate = CanvasRenderingContext2D.prototype.rotate;
      CanvasRenderingContext2D.prototype.rotate = function(angle) { window.trenchRenderAngles.push(angle); return rotate.call(this,angle); };
    });
    await right.click();
    assert.equal(await page.evaluate(()=>appData.map.grid['0,0'].rotation),60);
    assert.equal(await page.evaluate(()=>pendingHexEditDraft('4,4').rotations['0,0']),60);
    assert(await page.evaluate(()=>window.trenchRenderAngles.some(a=>Math.abs(a-Math.PI/3)<1e-8)), 'texture renderer receives 60 degrees');
    assert.equal(await page.evaluate(()=>(getHexOverlay('4,4',false).hexRotations || {})['0,0']),undefined,'no premature battle overlay');
    await page.locator('#hexEditorRotateLeftButton').click();
    assert.equal(await page.evaluate(()=>appData.map.grid['0,0'].rotation),0);
    await page.locator('#hexEditorRotateLeftButton').click();
    assert.equal(await page.evaluate(()=>appData.map.grid['0,0'].rotation),300);
    await page.locator('#hexEditorRotateResetButton').click();
    assert.equal(await page.evaluate(()=>appData.map.grid['0,0'].rotation),0);
    await right.click(); await right.click();
    await page.locator('#hexEditorBanner button[onclick="closeHexEditor()"]' ).click();
    await page.evaluate(()=>openHexEditorForBattle('4,4','trenches','Rotation test'));
    assert.equal(await page.evaluate(()=>appData.map.grid['0,0'].rotation),120,'reopen restores draft angle');
    await page.evaluate(()=>applyPendingHexEdits('4,4','trenches'));
    assert.equal(await page.evaluate(()=>getHexOverlay('4,4',false).hexRotations['0,0']),120,'order execution preserves rotation');
    // The unrestricted editor must remain unavailable to online players.
    await page.evaluate(()=>document.getElementById('battleApp').classList.remove('hex-editor-mode'));
    assert.equal(await right.isVisible(),false,'online raw editor remains blocked');
    console.log('PASS: online order draft on mobile viewport: visible/enabled button, real canvas selection, ±60/reset, texture renderer, reopen, execution, raw-editor guard');
  } finally { if (browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(err=>{console.error(err);process.exitCode=1;});
