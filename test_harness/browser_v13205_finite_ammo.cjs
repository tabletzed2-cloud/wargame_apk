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
      setCampaignTutorialEnabled(false);showOnlyAppScreen('battleApp');
      appData.currentBattleId=null;appData.modifiers=[];appData.enemyFlareAvailable=false;
      currentTurn=1;TACTICAL_MAP_SIZE=20;updateUI=()=>{};redrawMap=()=>{};renderMapActionPanel=()=>{};
      const foot=(name,owner,ammo)=>({name,opUnitName:owner,faction:'BeVe',hexPos:[2,5],fighters:[0,1,2,3].map(i=>({name:'rifle '+i,hp:3,maxHp:3,weapon:getFactionWeapons('BeVe')[0].name})),baseMorale:100,currentMorale:100,ammoSmall:ammo,ammoSmallFull:60,ammoOrdnance:0,grenades:0,effects:{},tacticalAP:0,hidden:false,detected:false});
      const first=foot('first','P',5),second=foot('second','P',0),op={name:'P',type:'infantry_platoon',squads:JSON.parse(JSON.stringify([first,second])),ammoReserve:{small:35,ordnance:0,grenades:0}};
      appData.campaign={active:true,online:false,opUnits:[op],enemyOpUnits:[],activeBattles:[],currentTurn:1};
      appData.squads=[first,second];appData.map={grid:{},enemySquads:[],activeSide:'player',mode:'view',selectedMoveSquadIdx:0,supplyFallbackOriginsPlayer:{P:'4,5'}};
      for(let r=0;r<20;r++)for(let c=0;c<20;c++)appData.map.grid[c+','+r]={type:'grass',level:0,markers:[],squadIds:[],enemySquadIds:[]};
      appData.map.grid['2,5'].squadIds=[0,1];currentSquad=first;currentSquadIndex=0;actionPoints={};ensureAP(0);ensureAP(1);
      const oldPrompt=window.prompt;window.prompt=()=> '1';
      // The actual card action and map action must share the SAME finite source.
      sendForAmmo(0);
      check(op.ammoReserve.small===5 && first.fighters[0].ammoCargo.amount===30,'card dispatch debits canonical finite reserve immediately');
      currentSquad=second;currentSquadIndex=1;appData.map.selectedMoveSquadIdx=1;
      mapBeginAmmoRun();
      const last=second.fighters.find(f=>f.isAway);
      check(last && last.ammoCargo.amount===5 && op.ammoReserve.small===0,'map action only reserves remaining five rounds');
      mapBeginAmmoRun();
      check(second.fighters.filter(f=>f.isAway).length===1 && op.ammoReserve.small===0,'empty stock rejects another map dispatch');
      processTacticalAmmoRunners('player');
      check(first.ammoSmall===5 && last.ammoRun.loaded,'loading at point is not remote delivery');
      check(saveData()!==false,'real save succeeds while finite cargo is in flight');
      const saved=JSON.parse(safeLocalStorage('getItem',STORAGE_KEY));
      check(saved.campaign.opUnits[0].ammoReserve.small===0,'reserve zero persisted');
      check(saved.squads[0].fighters[0].ammoCargo.amount===30 && saved.squads[0].fighters[0].ammoRun.loaded,'charged cargo persisted');
      // Restore the actual storage payload, not shared in-memory source references.
      appData=saved;currentSquad=appData.squads[0];currentSquadIndex=0;
      processTacticalAmmoRunners('player');processTacticalAmmoRunners('player');
      check(appData.squads[0].ammoSmall===35 && appData.squads[1].ammoSmall===5,'only 35 reserved rounds delivered after restore');
      check(appData.campaign.opUnits[0].ammoReserve.small===0,'restore and repeated processing do not replenish or debit twice');
      sendForAmmo(0);check(!appData.squads[0].fighters[0].isAway,'empty reserve refuses card dispatch too');
      window.prompt=oldPrompt;
      // A live AI phase with 20% left must request supply BEFORE ammo hits zero.
      const ai=foot('Отделение поддержки','Enemy',12);ai.faction='A.I.R.F.';
      appData.squads=[];appData.map.enemySquads=[ai];appData.map.activeSide='enemy';
      for(const c of Object.values(appData.map.grid)){c.squadIds=[];c.enemySquadIds=[];}
      appData.map.grid['2,5'].enemySquadIds=[0];appData.map.supplyFallbackOriginsEnemy={Enemy:'4,5'};
      const enemyOp={name:'Enemy',type:'infantry_platoon',squads:[JSON.parse(JSON.stringify(ai))],ammoReserve:{small:60,ordnance:0,grenades:0}};
      appData.campaign.enemyOpUnits=[enemyOp];appData.campaign.active=false; // no UI campaign automation
      ai.ammoSmall=13;check(tacticalEnemyAI.runPhase().supply===0,'21.67% does not request tactical supply');
      ai.ammoSmall=12;check(tacticalEnemyAI.runPhase().supply===1,'20% requests tactical supply while ammunition remains');
      check(enemyOp.ammoReserve.small===30 && ai.ammoSmall===12,'AI finite reservation uses enemy reserve only');
      processTacticalAmmoRunners('enemy');processTacticalAmmoRunners('enemy');
      check(ai.ammoSmall===42 && enemyOp.ammoReserve.small===30,'AI cargo is a transfer, not newly created ammunition');
      // Real operational route/capacity/distribution: include carried + reserve
      // in the threshold and refill both from a finite depot, not free top-ups.
      const carrier=foot('Носильщики','Depot',0),supplyUnit={name:'Взвод снабжения',type:'supply_platoon',col:1,row:5,squads:[carrier]},
        rifle=foot('rifle','Recipient',0),recipient={name:'Recipient',type:'infantry_platoon',col:2,row:5,squads:[rifle],ammoReserve:{small:19,ordnance:0,grenades:0,initialsmall:90,initialordnance:0,initialgrenades:0,caps:{rifle:{small:60,ordnance:0,grenades:0}}}};
      appData.campaign={active:true,online:false,playerFaction:'BeVe',opUnits:[],enemyOpUnits:[supplyUnit,recipient],activeBattles:[],currentTurn:1,opMapGrid:{}};
      operationalAIProcessSupply();check(appData.campaign.enemyAISupply.deliveries.length===0,'19/90 is above 20% despite empty squad');
      recipient.ammoReserve.small=18;appData.campaign.currentTurn++;
      operationalAIProcessSupply();
      check(appData.campaign.enemyAISupply.deliveries.length===1,'18/90 triggers real operational dispatch');
      check(appData.campaign.enemyAISupply.stock.ammoSmall===SUPPLY_DEPOT_MAX.ammoSmall-40,'operational cargo debited at dispatch');
      appData.campaign.currentTurn++;operationalAIProcessSupply();
      check(rifle.ammoSmall===40 && recipient.ammoReserve.small===18,'cargo delivered without changing unneeded reserve');
      const left=operationalAIReceiveSupply(recipient,{ammoSmall:50,ammoOrdnance:0,grenades:0});
      check(rifle.ammoSmall===60 && recipient.ammoReserve.small===30 && left.ammoSmall===18,'bounded reserve refill returns excess cargo');
    });
    assert.deepEqual(errors, []);
    console.log('PASS browser v13.205: both player dispatch actions share finite reserve; partial cargo and real saved-state restore; proactive 20% live AI dispatch; aggregate operational threshold and bounded reserve replenishment.');
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
