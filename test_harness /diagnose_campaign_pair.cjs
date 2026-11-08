'use strict';
// NODE_PATH=<modules containing playwright-core and @sparticuz/chromium> node this-file
// Offline replay against an external exported campaign. No campaign data is bundled.
// Usage: node this-file /path/to/first-campaign.json /path/to/second-campaign.json
// Optional WARGAME_ROOT=/path/to/baseline-checkout compares the previous build.
const {chromium} = require('playwright-core');
const chromiumPackage = require('@sparticuz/chromium');
const portable = chromiumPackage.default || chromiumPackage;
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(process.env.WARGAME_ROOT || path.join(__dirname, '..'));
const uploads=process.argv.slice(2,4).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
assert.equal(uploads.length,2,'Provide two exported campaigns');
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
    const pages=[]; const errors=[];
    for(const upload of uploads) {
      const page=await browser.newPage({viewport:{width:1100,height:850},serviceWorkers:'block'});
      await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
      page.on('dialog',d=>d.dismiss());page.on('pageerror',err=>errors.push(err.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
      await page.waitForFunction(()=>typeof onlineBattleSnapshot==='function');
      await page.evaluate(upload=>{
        appData.campaign=upload.campaign;appData.currentTime=upload.currentTime;appData.currentTurn=upload.currentTurn;
        ONLINE.role=upload.campaign.online.role;ONLINE.docRef=null;ONLINE.started=false;
        window.replayCalls={};
        for(const name of ['onlineCreateMirrorBattle','startTacticalBattle','saveData','redrawMap','log']) {
          const original=window[name];window[name]=function(...args){window.replayCalls[name]=(window.replayCalls[name]||0)+1;return original.apply(this,args);};
        }
        switchToBattle(appData.campaign.activeBattles[0].id);
        ONLINE.docRef={update:()=>Promise.resolve()};
        window.replayCalls={};
      },upload);
      pages.push(page);
    }
    const summaries=async()=>Promise.all(pages.map(page=>page.evaluate(()=>{
      const b=appData.campaign.activeBattles[0];return {
        role:ONLINE.role,hex:b.hexKey,authority:b.onlineAuthority,attacker:b.placement.attackerSide,
        currentHex:campaignMiniMapCurrentHex(),own:appData.squads.length,enemy:appData.map.enemySquads.length,
        participants:b.playerUnitNames,logs:b.eventLog.length,calls:{...window.replayCalls},
        ownKeys:appData.squads.map(s=>JSON.stringify([s.opUnitName,s.name])),
        enemyKeys:appData.map.enemySquads.map(s=>JSON.stringify([s.opUnitName,s.name])),
        ownParticipantLocks:appData.campaign.opUnits.filter(u=>(b.playerUnitNames||[]).includes(u.name)).map(u=>({name:u.name,locked:!!u.isInBattle}))
      };
    })));
    const before=await summaries();const rounds=[];
    for(let round=0;round<12;round++) {
      const snapshots=await Promise.all(pages.map(page=>page.evaluate(()=>onlineBattleSnapshot(appData.campaign.activeBattles[0]))));
      const durations=await Promise.all(pages.map((page,i)=>page.evaluate(snapshot=>{
        const t=performance.now();onlineApplyCloudBattles({[onlineOppRole()]:{battles:{[onlineBattleKey(snapshot.hexKey)]:snapshot}}});return performance.now()-t;
      },snapshots[1-i])));
      rounds.push(durations);
    }
    const after=await summaries();
    for(const page of pages)await page.evaluate(()=>{ONLINE.docRef=null;});
    const mismatch=after.map((side,i)=>({role:side.role,extraEnemyKeys:side.enemyKeys.filter(key=>!after[1-i].ownKeys.includes(key)),
      missingEnemyKeys:after[1-i].ownKeys.filter(key=>!side.enemyKeys.includes(key))}));
    console.log(JSON.stringify({before,after,rounds,mismatch,errors},null,2));
    assert.equal(after[0].hex,after[1].hex,'shared operational battle hex');
    assert.notEqual(after[0].attacker,after[1].attacker,'opposite local attacker sides');
    for(const side of after)assert.equal(side.calls.onlineCreateMirrorBattle||0,0,'do not recreate existing battle');
    assert.equal(errors.length,0);
  } finally { if (browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(err=>{console.error(err);process.exitCode=1;});
