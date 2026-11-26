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
    await page.evaluate(async () => {
      const check=(ok,message)=>{if(!ok)throw Error(message);};
      setCampaignTutorialEnabled(false);selectScenario('valencia');
      await new Promise((resolve,reject)=>{
        const started=Date.now(),timer=setInterval(()=>{
          if(appData.campaign.opLayers && Object.keys(appData.campaign.opMapGrid || {}).length){clearInterval(timer);resolve();}
          else if(Date.now()-started>8000){clearInterval(timer);reject(Error('terrain load timeout'));}
        },30);
      });
      const camp=appData.campaign;
      camp.online=false;camp.active=false;camp.currentTurn=1;
      const foot={name:'Разведвзвод',type:'recon_platoon',mobility:'foot',col:8,row:11,ap:20,maxAp:20,squads:[]};
      const entries=getOpHexNeighbors(8,12).map(n=>({from:n,types:getOpHexBaseTypes(8,12,n.col,n.row),cost:getOpMoveCost(foot,n.col,n.row,8,12)}));
      check(entries.some(e=>e.types.includes('swamp_impassable') && Number.isFinite(e.cost)),'8,12 mixed swamp hex must have a foot corridor: '+JSON.stringify(entries));
      // Actual series executor: move to observation points, pause, and keep later orders.
      camp.opLayers=null;camp.opRoadEdges=[];camp.opMapGrid={};
      for(let r=0;r<OP_MAP_ROWS;r++)for(let c=0;c<OP_MAP_COLS;c++)camp.opMapGrid[c+','+r]=['grass'];
      foot.col=1;foot.row=2;camp.opUnits=[foot];camp.enemyOpUnits=[];
      hardMode.enabled=true;hardMode.phoneLines=[];hardMode.orders=[];
      const order={id:102,toUnitId:0,fromUnitId:0,type:'series',status:'active',turnIssued:1,turnReceived:1,
        series:[{type:'recon',status:'pending',startHex:'1,2',behavior:'ignore',waypoints:[{col:2,row:2},{col:4,row:2}]},
          {type:'move',status:'pending',behavior:'ignore',targetHex:'5,2'}]};
      hardMode.orders=[order];
      executeSeriesOrder(foot,order);
      check(foot.col===2 && foot.row===2 && foot.ap===0,'first reconnaissance pause stays on operational unit: '+JSON.stringify(foot));
      check(order.series.length===2 && order.status==='active','later orders preserved');
      camp.currentTurn++;foot.ap=20;executeSeriesOrder(foot,order);
      check(foot.col===4 && foot.ap===0,'second point pauses instead of detaching scout');
      camp.currentTurn++;foot.ap=20;executeSeriesOrder(foot,order);
      check(foot.col===5 && order.status==='completed','remaining move executes after final pause');
      check(!(camp.reconMissions || []).some(m=>m.unitId===0),'route scout never becomes a separate mission');
      // Both user zooms survive opening their map again.
      showOnlyAppScreen('campaignMapScreen');camp.opZoomFitKey=null;zoomOpMap(1.2);const oz=camp.opZoomLevel;
      applyOpMapFitZoom({cols:OP_MAP_COLS});check(camp.opZoomLevel===oz,'operational fit must not reset manual zoom');
      showOnlyAppScreen('battleApp');appData.currentBattleId=null;
      appData.map={grid:{'0,0':{type:'grass',level:1,squadIds:[],enemySquadIds:[]}},baseHexSize:20,zoomLevel:1,enemySquads:[],mode:'view'};
      appData.squads=[];zoomMap(1.5);openTab({currentTarget:document.querySelector('.tablinks')},'mapTab');check(appData.map.zoomLevel===1.5,'tab change must preserve tactical zoom');
      // Actual reinforcement panel/placement/completion, including last-reserve state.
      const squad={name:'Reinforcement',opUnitName:'wave',faction:'BeVe',fighters:[{name:'soldier',hp:3}],baseMorale:100,currentMorale:100,placementArrivalDir:'W'};
      appData.squads=[squad];appData.map.grid={};
      for(let r=0;r<20;r++)for(let c=0;c<20;c++)appData.map.grid[c+','+r]={type:'grass',level:0,squadIds:[],enemySquadIds:[]};
      const battle={id:'wave-battle',hexKey:'1,2',placement:{phase:'done',attackerSide:'player',entryDir:'W',reinforcementUnitNames:['wave']},
        playerSquads:[squad],enemySquads:[],currentTurn:4,cardsChosen:true,tacticalMap:{grid:appData.map.grid}};
      camp.activeBattles=[battle];appData.currentBattleId=battle.id;currentTurn=4;appData.currentTurn=4;renderPlacementPanel();
      check(placementAutoPlaceReinforcements()===1,'autoplacement must place the wave');
      renderPlacementPanel();
      check(document.querySelector('button[onclick="placementFinishReinforcements()"]'),'finish button must remain after the last reserve is placed');
      check(placementTrayUnplacedSquads(battle).length===0,'placed wave disappears from reserve');
      check(placementFinishReinforcements(),'finish returns success');
      check(placementPendingReason()===null && appData.map.mode==='move','combat actions unlocked after finish');
      check(battle.currentTurn===4,'reinforcement confirmation must not restart the battle turn');
    });
    assert.deepEqual(errors, []);
    console.log('PASS browser v13.202: real 8,12 terrain corridor, route reconnaissance and following series steps, persistent map zoom, reinforcement completion.');
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
