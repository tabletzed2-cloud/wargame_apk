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
      appData.currentBattleId=null;appData.campaign.online=false;appData.campaign.active=false;
      appData.campaign.activeBattles=[];appData.campaign.opUnits=[];appData.campaign.enemyOpUnits=[];
      appData.modifiers=[];appData.enemyFlareAvailable=false;currentTurn=1;TACTICAL_MAP_SIZE=20;
      // Keep real data/rules/AI/attacks; just silence persistence/UI side effects.
      saveData=()=>{};updateUI=()=>{};redrawMap=()=>{};const messages=[];log=m=>messages.push(m);
      const foot=(name,faction,x)=>({name,faction,hexPos:[x,5],fighters:[0,1,2,3].map(i=>({name:'rifle '+i,hp:3,maxHp:3,weapon:(getFactionWeapons(faction)[0]||{}).name})),baseMorale:100,currentMorale:100,ammoSmall:0,ammoOrdnance:0,grenades:0,effects:{},tacticalAP:0,hidden:false,detected:false,opUnitName:name});
      const setup=(players,enemies)=>{
        appData.squads=players;appData.map={grid:{},enemySquads:enemies,activeSide:'enemy',attackerSide:'player',mapSize:20};
        for(let r=0;r<20;r++)for(let c=0;c<20;c++)appData.map.grid[c+','+r]={type:'grass',level:0,squadIds:[],enemySquadIds:[],markers:[]};
        players.forEach((s,i)=>appData.map.grid[s.hexPos.join(',')].squadIds.push(i));
        enemies.forEach((s,i)=>appData.map.grid[s.hexPos.join(',')].enemySquadIds.push(i));
        actionPoints={};currentSquadIndex=0;currentSquad=players[0]||null;
      };
      const observer=foot('moving','BeVe',2),close=foot('noise','A.I.R.F.',3),far=foot('far','A.I.R.F.',5),camo=foot('camo','A.I.R.F.',3);
      close.noiseMarker=true;close.hidden=true;camo.camouflaged=true;
      setup([observer],[close,far,camo]);
      const oldRandom=Math.random;Math.random=()=>0.5;
      tacticalSetArmoredNoise(close,{pos:getBattleSquadHex(appData.map.grid,0,true),isPlayerUnit:false});
      check(tacticalMovementContactChecks(observer).detected===1,'movement detects actual nearby hidden noise source');
      check(close.detected && !close.hidden && !close.noiseMarker,'detection clears both concealed flags');
      check(!far.detected && !camo.detected,'distant and camouflaged contacts unchanged');
      check(!appData.map.tacticalNoiseMarkers.some(m=>m.sourceKey===tacticalArmoredNoiseSourceKey(close)),'anonymous markers cleared after discovery');
      // Actual per-step player movement invokes the hook, rather than only a direct helper test.
      observer.hexPos=[0,5];close.hexPos=[2,5];close.detected=false;close.hidden=true;
      setup([observer],[close]);appData.map.activeSide='player';ensureAP(0);actionPoints[0].ap=8;
      check(tacticalMoveAlongPath(0,['1,5'],'1,5')!==false,'start player movement');
      await new Promise(r=>setTimeout(r,900));
      check(observer.hexPos.join(',')==='1,5' && close.detected && !close.hidden,'actual player step reveals adjacent contact');
      // Real runPhase must dispatch an errand even without AP left to fire/move.
      const target=foot('player target','BeVe',7),ai=foot('Отделение поддержки','A.I.R.F.',2);
      target.detected=true;setup([target],[ai]);
      appData.campaign.enemyOpUnits=[{name:ai.opUnitName,squads:[ai],ammoReserve:{small:60,ordnance:0}}];
      syncLiveMapSupplyPoints();
      check(activeSupplyPointKeys(appData.map,'enemy').length>0,'actual enemy supply point generated');
      const first=tacticalEnemyAI.runPhase();
      check(first.supply===1 && ai.fighters.some(f=>f.ammoRun && f.isAway),'actual AI phase dispatches runner');
      processTacticalAmmoRunners('player');check(ai.ammoSmall===0,'player phase cannot advance enemy runner');
      processTacticalAmmoRunners('enemy');processTacticalAmmoRunners('enemy');
      check(ai.ammoSmall===30 && !ai.fighters.some(f=>f.isAway),'enemy runner returns with actual cargo');
      ai.tacticalAP=8;ai.actionsThisTurn={};
      const firing=tacticalEnemyAI.runPhase();
      check(firing.attacks>0 && ai.ammoSmall<30,'AI resumes live fire after resupply: '+JSON.stringify({firing,ai,messages:messages.slice(-20)}));
      // Actual binocular action: cost is paid, noise supplies candidate evidence.
      const scout=foot('Штаб батальона','A.I.R.F.',1),concealed=foot('concealed','BeVe',3);
      scout.tacticalAP=6;concealed.hidden=true;setup([concealed],[scout]);
      appData.map.tacticalNoiseMarkers=[{col:3,row:5,viewerSide:'enemy',expiresTurn:currentTurn}];
      const before=getTacticalSideAP(scout,'enemy'),recon=tacticalEnemyAI.runPhase();
      check(recon.recon===1 && concealed.detected && !concealed.hidden,'actual AI reconnaissance finds noise contact: '+JSON.stringify({recon,scout,concealed,messages:messages.slice(-15)}));
      check(getTacticalSideAP(scout,'enemy')<=before-2,'binocular action spends normal AP');
      // Actual AI movement must also invoke the same local detection hook.
      const advancing=foot('Стрелковое отделение','A.I.R.F.',2),bait=foot('visible bait','BeVe',8),nearby=foot('near moving AI','BeVe',3),remote=foot('remote hidden','BeVe',16);
      nearby.hexPos=[3,4];nearby.hidden=true;remote.hidden=true;bait.detected=true;advancing.tacticalAP=4;
      setup([bait,nearby,remote],[advancing]);appData.map.attackerSide='enemy';
      const advancingPhase=tacticalEnemyAI.runPhase();
      check(advancingPhase.moves>0 && nearby.detected && !nearby.hidden,'actual AI step discovers nearby player');
      check(!remote.detected && remote.hidden,'AI step does not roll remote hidden player');
      // Mounted MG remains usable after the cannon ammunition has run out.
      const vehicle=foot('CL-39','BeVe',1),victim=foot('rifle target','A.I.R.F.',3);
      const mg=(getFactionCrewWeapons('BeVe')||[]).find(w=>w.type==='mg');check(!!mg,'MG catalog');
      vehicle.armor={front:4,side:3,rear:2,turret:3};vehicle.facing='e';vehicle.ammoSmall=20;vehicle.ammoOrdnance=0;vehicle.tacticalAP=8;
      vehicle.crewInstances=[{weaponName:mg.name,uniqueKey:'ai-mg',fighterIndices:[0],active:true,deployed:true,sectorRole:'turret'}];
      victim.detected=true;setup([victim],[vehicle]);
      const shot=tacticalEnemyAI.selectShot(vehicle,0);
      check(shot && shot.id==='smallArms' && shot.extra.vehicleWeaponKey==='ai-mg','AI selects mounted MG without shells');
      const mgResult=runTacticalAIAction(vehicle,0,shot.id,shot.extra);
      check(mgResult.ok && mgResult.spentAP && vehicle.ammoSmall<20,'actual enemy dispatch fires selected mounted MG');
      // Operational logistics uses the real roster capacities, route terrain,
      // finite stock and ordinary cargo distribution (no operational stubs).
      appData.currentBattleId=null;
      const cargoSquad=foot('Носильщики','A.I.R.F.',0),supplyUnit={name:'Взвод снабжения',type:'supply_platoon',col:1,row:5,squads:[cargoSquad]},
        rifleSquad=foot('Стрелковое отделение','A.I.R.F.',0),recipient={name:'Получатель БК',type:'infantry_platoon',col:2,row:5,squads:[rifleSquad]};
      appData.campaign={active:true,online:false,playerFaction:'BeVe',opUnits:[],enemyOpUnits:[supplyUnit,recipient],activeBattles:[],currentTurn:1,opMapGrid:{}};
      operationalAIProcessSupply();
      const logistics=appData.campaign.enemyAISupply;
      check(logistics && logistics.deliveries.length===1 && logistics.stock.ammoSmall===SUPPLY_DEPOT_MAX.ammoSmall-40,'real operational dispatch debits finite stock');
      check(rifleSquad.ammoSmall===0,'operational delivery is not instantaneous');
      appData.campaign.currentTurn++;
      operationalAIProcessSupply();
      check(rifleSquad.ammoSmall===40,'real operational route and cargo delivery replenish the unit');
      check(!appData.campaign.supply,'enemy supply never initializes or borrows player depot');
      Math.random=oldRandom;
    });
    assert.deepEqual(errors, []);
    console.log('PASS browser v13.204: actual movement contact hook, AI runner dispatch/delivery and resumed fire, AI binocular reconnaissance and mounted-MG dispatch.');
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
