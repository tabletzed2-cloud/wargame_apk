'use strict';
// NODE_PATH=<modules containing playwright-core and @sparticuz/chromium> node this-file
// Real Chromium: reload an existing Hard Mode save; catch supply TDZ errors during startup.
const {chromium} = require('playwright-core');
const chromiumPackage = require('@sparticuz/chromium');
const portable = chromiumPackage.default || chromiumPackage;
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(process.env.WARGAME_ROOT || path.join(__dirname, '..'));
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
    const saved=await page.evaluate(()=>{
      const data=JSON.parse(JSON.stringify(appData));
      data.hardMode={enabled:true};data.currentBattleId=null;
      data.campaign={active:true,scenario:'valencia',playerFaction:'A.I.R.F.',currentTurn:5,currentTime:40,
        online:null,activeBattles:[],battalions:{player:null,enemy:null},enemyOpUnits:[],
        opUnits:[{name:'Штаб батальона',type:'battalion_hq',faction:'A.I.R.F.',col:4,row:4,
          squads:[{name:'Штаб',fighters:[{name:'Командир',hp:3,maxHp:3}]}]},
          {name:'Взвод снабжения',type:'supply_platoon',faction:'A.I.R.F.',col:4,row:4,
          squads:[{name:'Носильщики',fighters:Array.from({length:8},()=>({name:'Носильщик',hp:3,maxHp:3}))}]}],
        supply:{max:{ammoSmall:1500},stock:{ammoSmall:123,grenades:45,ammoOrdnance:6},deliveries:[]}};
      return data;
    });
    await page.addInitScript(data=>localStorage.setItem('wargameV10',JSON.stringify(data)),saved);
    const issues=[];page.on('console',message=>{
      if(['warning','error'].includes(message.type()))issues.push(message.text());
    });page.on('pageerror',error=>issues.push(error.message));
    await page.reload({waitUntil:'load'});
    const state=await page.evaluate(()=>({stock:appData.campaign.supply.stock,max:appData.campaign.supply.max,
      assets:appData.campaign.supply.assets,enabled:hardMode.enabled}));
    const supplyErrors=issues.filter(text=>text.includes('supply:')||text.includes('before initialization'));
    console.log(JSON.stringify({state,supplyErrors},null,2));
    assert.equal(state.enabled,true,'saved Hard Mode restored');
    assert.deepEqual(supplyErrors,[],'supply must initialize during actual saved-game startup');
    assert.deepEqual(state.stock,{ammoSmall:123,grenades:45,ammoOrdnance:6},'saved stock must not reset');
    assert.equal(state.max.ammoSmall,1500,'custom saved capacity preserved');
    assert.equal(state.max.grenades,300,'missing capacity migrated');
    assert(state.assets.porter.total>=8,'transport roster synchronized');
    console.log('PASS: saved Hard Mode startup initializes supply before early migrations, preserves stock and custom capacity');
  } finally { if (browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(err=>{console.error(err);process.exitCode=1;});
