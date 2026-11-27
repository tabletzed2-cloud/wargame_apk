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
    await page.evaluate(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg);};
      setCampaignTutorialEnabled(false);showOnlyAppScreen('battleApp');
      appData.currentBattleId=null;appData.modifiers=[];appData.enemyFlareAvailable=false;
      inStandaloneBattle=true;appData._tacticalMoraleStandaloneBattleId='browser207';currentTurn=1;TACTICAL_MAP_SIZE=20;
      const foot=(name,side,routing=false)=>({name,faction:side==='enemy'?'A.I.R.F.':'BeVe',
        fighters:[0,1].map(i=>({name:'Рядовой '+i,hp:3,maxHp:3,weapon:getFactionWeapons(side==='enemy'?'A.I.R.F.':'BeVe')[0].name})),
        tacticalMoraleScaleVersion:1,tacticalMoraleInitializedBattleId:'browser207',baseMorale:100,tacticalMoraleMax:100,
        currentMorale:routing?5:100,isRouting:routing,retreatReason:routing?'morale':null,ammoSmall:20,ammoOrdnance:0,grenades:0,
        effects:{},appliedCards:[],detected:true,hidden:false,tacticalAP:8});
      function setup(attacker='enemy',entry='W'){
        appData.squads=[];appData.campaign={active:false,online:false,opUnits:[],enemyOpUnits:[],activeBattles:[]};
        appData.map={grid:{},enemySquads:[],mapSize:20,activeSide:'player',mode:'view',selectedMoveSquadIdx:0,baseHexSize:45,zoomLevel:1,
          placement:{attackerSide:attacker,entryDir:entry,battleMode:'normal',phase:'done'}};
        for(let r=0;r<20;r++)for(let c=0;c<20;c++)appData.map.grid[c+','+r]={type:'grass',level:0,markers:[],squadIds:[],enemySquadIds:[]};
        actionPoints={};
      }
      function place(s,side,key){const list=side==='enemy'?appData.map.enemySquads:appData.squads;const i=list.push(s)-1;
        appData.map.grid[key][side==='enemy'?'enemySquadIds':'squadIds'].push(i);s.hexPos=key.split(',').map(Number);return i;}
      setup();let s=foot('Бегущее отделение','player',true);place(s,'player','18,10');currentSquad=s;currentSquadIndex=0;morale=5;ensureAP(0);
      renderActiveCardButtons();
      const btn=document.querySelector('#specialPanel button[onclick="tacticalRegroupSquadAtHQ()"]');
      check(btn&&btn.disabled,'HQ button remains unavailable during rout');check(!tacticalRegroupSquadAtHQ(),'direct HQ invocation also refused');
      check(!document.querySelector('[onclick*="showDetectionDialog"]')&&!document.getElementById('detectionModal'),'manual hide controls and modal removed');
      check(typeof executeDetectionCheck==='undefined','no hidden old execution API');
      const ap=getAP(0);check(ap>0,'routed fixture has movement AP');processTacticalRouts('player');
      check(s.isRetreated&&s.status==='retreated','reaching opposite outer edge removes routed player');
      check(!getBattleSquadHex(appData.map.grid,0,false),'exited player has no tactical hex');
      check(s.fighters.every(f=>f.hp===3),'escape does not kill survivors');
      setup();s=foot('Всё ещё бежит','player',true);place(s,'player','0,10');currentSquad=s;morale=5;ensureAP(0);actionPoints[0].ap=0;
      processTacticalRouts('player');check(s.isRouting&&!s.isRetreated,'wrong boundary cannot act as exit');
      check(tacticalRoutExitDirection('player')==='E','enemy coming from west fixes escape to east');
      appData.map=JSON.parse(JSON.stringify(appData.map));
      check(tacticalRoutExitDirection('player')==='E','escape direction survives map serialization');
      // A real AI movement step into a distant exit-sector cell immediately
      // captures routed players without waiting for their phase or empty ammo.
      setup();s=foot('Окружённое бегством отделение','player',true);place(s,'player','2,10');currentSquad=s;morale=5;ensureAP(0);
      const blocker=foot('Фланговый отряд','enemy');place(blocker,'enemy','18,10');appData.map.activeSide='enemy';
      check(tacticalEnemyAI.moveSquad(blocker,0,{path:['19,10'],doctrine:'assault'}),'real enemy movement into exit sector');
      check(s.isSurrendered&&s.surrenderReason==='rout_exit_occupied','exit occupation causes surrender despite remaining ammunition');
      check(s.ammoSmall===20,'surrender did not require spending ammo');
      check(getBattleSquadHex(appData.map.grid,0,false).key==='2,10','surrender leaves a prisoner on their hex');
      check(appData.map.grid['2,10'].markers.includes('surrenderedFriendly'),'surrender marker visible on the map');
      // The same route-to-exit rule is used by the opponent.
      setup('player','W');const e=foot('Бегущий противник','enemy',true);place(e,'enemy','18,10');
      currentSquad=null;currentSquadIndex=-1;appData.map.activeSide='enemy';
      processTacticalRouts('enemy');check(e.isRetreated&&!getBattleSquadHex(appData.map.grid,0,true),'opponent also exits at the fixed opposite boundary');
    });
    assert.deepEqual(errors, []);
    console.log('PASS browser v13.207: routing HQ refusal, removed hide controls/API, actual opposite-edge evacuation, saved direction, real AI movement triggering exit-occupation surrender, and enemy evacuation.');
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
