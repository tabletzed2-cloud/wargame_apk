'use strict';
// NODE_PATH=<modules containing playwright-core and @sparticuz/chromium> node this-file
// Offline replay against an external exported campaign. No campaign data is bundled.
// Usage: node this-file /path/to/campaign.json
// Optional WARGAME_ROOT=/path/to/baseline-checkout compares the previous build.
const {chromium} = require('playwright-core');
const chromiumPackage = require('@sparticuz/chromium');
const portable = chromiumPackage.default || chromiumPackage;
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(process.env.WARGAME_ROOT || path.join(__dirname, '..'));
const uploaded = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
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
    await page.route('**/*', route => {
      if (route.request().url().startsWith('http://127.0.0.1:')) return route.continue();
      return route.abort();
    });
    const errors=[]; page.on('pageerror',err=>errors.push(err.message));
    const session=await page.context().newCDPSession(page);
    await session.send('Profiler.enable'); await session.send('Profiler.start');
    const result = await page.evaluate(upload => {
      appData.campaign=upload.campaign;
      appData.currentTime=upload.currentTime;
      appData.currentTurn=upload.currentTurn;
      ONLINE.role=appData.campaign.online.role;
      // Do not subscribe to, or write to, the user's actual match.
      ONLINE.docRef=null; ONLINE.started=false;
      const calls={}; const elapsed={};
      for(const name of ['startTacticalBattle','onlineCreateMirrorBattle','onlineReanchorBattleToHex','saveData','redrawMap','updateUI','log']) {
        const original=window[name]; if(typeof original!=='function') continue;
        window[name]=function(...args) { const t=performance.now(); calls[name]=(calls[name]||0)+1;try{return original.apply(this,args);}finally{elapsed[name]=(elapsed[name]||0)+performance.now()-t;} };
      }
      const battle=appData.campaign.activeBattles[0];
      const openStart=performance.now(); switchToBattle(battle.id); const openMs=performance.now()-openStart;
      ONLINE.docRef={update:()=>Promise.resolve()};
      const snapshot={id:battle.onlineOppBattleId,oppBattleId:battle.id,hexKey:'7,9',
        myUnitNames:battle.enemyUnitNames.slice(),oppUnitNames:battle.playerUnitNames.slice(),
        attacker:'opp',startedBy:'me',entryDir:'E',status:'active',turn:battle.currentTurn,
        placed:true,phaseRevision:battle.phaseRevision||0,tacticalPhasesCompleted:battle.tacticalPhasesCompleted||0,
        squads:(battle.tacticalMap.enemySquads||battle.enemySquads).map((sq,id)=>({...JSON.parse(JSON.stringify(sq)),
          pos:Object.keys(battle.tacticalMap.grid).find(key=>(battle.tacticalMap.grid[key].enemySquadIds||[]).includes(id))||null}))};
      const before={logs:battle.eventLog.length,squads:battle.playerSquads.length,hex:battle.hexKey};
      for(const key of Object.keys(calls)) {calls[key]=0;elapsed[key]=0;}
      const timings=[];
      for(let i=0;i<20;i++) {
        const t=performance.now();
        onlineApplyCloudBattles({[onlineOppRole()]:{battles:{h7_9:{...snapshot,updatedAt:1000+i}}}});
        timings.push(performance.now()-t);
      }
      ONLINE.docRef=null;
      const after={logs:battle.eventLog.length,squads:battle.playerSquads.length,hex:battle.hexKey,
        attacker:battle.placement.attackerSide,battles:appData.campaign.activeBattles.length};
      return {openMs,before,after,calls,elapsed,timings};
    },uploaded);
    const profile=(await session.send('Profiler.stop')).profile;
    const label=process.env.WARGAME_ROOT?'baseline':'fixed';
    fs.writeFileSync('/tmp/campaign-freeze-'+label+'.cpuprofile',JSON.stringify(profile));
    console.log(JSON.stringify({...result,errors},null,2));
    if (!process.env.WARGAME_ROOT) {
      assert.equal(result.calls.onlineCreateMirrorBattle || 0, 0, 'existing clash must not be recreated');
      assert.equal(result.calls.startTacticalBattle || 0, 0, 'no duplicate battle start');
      assert(result.after.logs-result.before.logs <= 2, 'no repeated join log spam');
      assert.equal(errors.length,0);
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(err=>{console.error(err);process.exitCode=1;});
