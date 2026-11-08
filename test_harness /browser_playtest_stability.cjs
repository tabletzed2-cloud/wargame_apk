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
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const checks = await page.evaluate(() => {
      let checks = 0;
      const check = (condition, text) => { if (!condition) throw new Error(text); checks++; };
      ONLINE.started = false; ONLINE.match = null; ONLINE.docRef = null;
      const c = appData.campaign;
      c.online = false; c.currentTurn = 5; c.currentTime = 40;
      c.opUnits = []; c.enemyOpUnits = [];
      const complete = {id:100,hexKey:'8,10',currentTurn:11,tacticalPhasesCompleted:10,windowStartTurn:1,tacticalMap:{grid:{}},playerSquads:[],enemySquads:[]};
      const unfinished = {id:200,hexKey:'6,9',currentTurn:2,tacticalPhasesCompleted:1,windowStartTurn:1,tacticalMap:{grid:{}},playerSquads:[],enemySquads:[]};
      c.activeBattles = [complete,unfinished];
      c.tacticalOrdersBarrier = false;
      appData.currentBattleId = unfinished.id; appData.map = unfinished.tacticalMap;
      let returns = 0, notices = 0;
      const returnOriginal = window.returnToCampaign, noticeOriginal = window.showTacticalOrdersPauseNotice;
      window.returnToCampaign = () => { returns++; };
      window.showTacticalOrdersPauseNotice = () => { notices++; };
      const pause = {active:true,operationalTurn:5,campaignTime:40,campaignTurn:5,sourceBattleId:100};
      onlineHandleGlobalTacticalPause(pause);
      check(returns===0,'unfinished 6,9 must not be forced to campaign');
      check(!unfinished.pausedForOrders && complete.pausedForOrders,'per-battle window pause retained');
      onlineHandleGlobalTacticalPause(pause);
      check(returns===0 && notices===1,'repeated remote pause must not eject or repeat notice');
      appData.currentBattleId = complete.id; appData.map = complete.tacticalMap;
      onlineHandleGlobalTacticalPause(pause);
      check(returns===1,'completed live battle still returns to campaign');
      window.returnToCampaign = returnOriginal; window.showTacticalOrdersPauseNotice = noticeOriginal;
      appData.currentBattleId = null;

      // Dense deployment must not enumerate all permutations after reaching its cap.
      appData.map = {grid:{},enemySquads:[]}; appData.squads = [];
      for(let i=0;i<25;i++) {
        const key = `${i%5},${Math.floor(i/5)}`;
        appData.map.grid[key] = {squadIds:[i],enemySquadIds:[]};
        appData.squads.push({name:`unit ${i}`,fighters:[{hp:3}]});
      }
      const t = performance.now(); const cycles = tacticalChainCycles(false); const duration = performance.now()-t;
      check(duration<1000,`dense 25-squad search bounded: ${duration}ms`);
      check(cycles.length>0 && cycles.length<=TACTICAL_CHAIN_MAX_CYCLES,'valid rings still found within cap');
      // 25 co-located squads used to make a huge degenerate search with no cycles.
      appData.map.grid = {'0,0':{squadIds:appData.squads.map((_,i)=>i),enemySquadIds:[]}};
      const t2=performance.now();
      check(tacticalChainCycles(false).length===0,'co-located squads cannot make a ring');
      check(performance.now()-t2<100,'co-located squads deduplicated before search');
      check(!tacticalSquadIsCombatCapable({hidden:true,fighters:[{hp:3}]}),'embarked infantry cannot close a ring');
      appData.map.tacticalChains={player:[{polygon:[{x:0,y:0},{x:1,y:0},{x:0,y:1}]}]};
      let drawn=0; drawTacticalChainRings(new Proxy({}, {get:()=>()=>{drawn++;}}),20);
      check(drawn===0,'large yellow ring overlays disabled by default');

      const now=Date.now();
      __tacticalMovement={token:1,startedAt:now-60000,lastProgressAt:now-100};
      check(!tacticalMovementLockStale(),'long active route is not stale while making progress');
      __tacticalMovement.lastProgressAt=now-16000;
      check(tacticalMovementLockStale(),'genuinely stalled movement still expires');
      __tacticalMovement=null;

      c.opUnits = Array.from({length:8},(_,i)=>({name:`own ${i}`,col:2,row:2}));
      c.enemyOpUnits = [{name:'enemy',col:2,row:2,detected:true}];
      c.opZoomLevel = 1;
      const entries=operationalUnitIconLayout(45,18);
      check(entries.length===9,'layout includes both sides');
      for(let i=0;i<entries.length;i++) for(let j=i+1;j<entries.length;j++) {
        const a=entries[i],b=entries[j];
        check(Math.abs(a.x-b.x)>=1.1*(a.radius+b.radius)-.01 || Math.abs(a.y-b.y)>=1.1*(a.radius+b.radius)-.01,'square icon footprints do not overlap');
      }
      check(entries.every(e=>Math.abs(e.dx)+1.1*e.radius<=45*.8 && Math.abs(e.dy)+1.1*e.radius<=45*.8),'compact icons stay within hex');
      check(reconStandaloneKeyForUnit({name:'Отряд Бронеавтомобиль',isGroup:true,groupSize:3,vehicleList:[{name:'Landsverk 1'},{name:'Landsverk 2'},{name:'Landsverk 3'}]})==='beve_armored_car','whole armored-car detachment eligible for recon');
      check(reconStandaloneKeyForUnit({name:'Отряд Бронеавтомобиль',isGroup:true,vehicleList:[{name:'Landsverk',destroyed:true}]})===null,'destroyed cars cannot recon');
      for(const label of ['Стрелковое/пулеметы','Бросок гранат','Рукопашная','Связка гранат','Тяжелая/камни']) check(mapExtraButtonBlocked({},label),'duplicate extra action hidden: '+label);

      appData.squads=[{fighters:[{name:'runner',hp:3,isAway:true,turnsToReturn:0,ammoType:2}],ammoOrdnance:'2'}];
      processTacticalAmmoRunners();
      check(appData.squads[0].ammoOrdnance===12 && !appData.squads[0].fighters[0].isAway,'zero ETA numeric ammunition type completes');
      processTacticalAmmoRunners(); check(appData.squads[0].ammoOrdnance===12,'delivery paid exactly once');

      const troops=[{name:'БТР 1',armor:{front:1},opUnitName:'БТР',fighters:[{hp:3}]},
        {name:'БТР 2',armor:{front:1},opUnitName:'БТР',fighters:[{hp:3}]},
        ...[1,2,3].map(n=>({name:'inf '+n,opUnitName:'infantry',fighters:[{hp:3}]}))];
      const units=[{name:'БТР',type:'btr_platoon',col:2,row:2},{name:'infantry',col:2,row:2}];
      tacticalLinkInitialBtrPassengers(troops,units,units);
      check(troops[0].embarkedSquadIndex===2 && troops[1].embarkedSquadIndex===3,'one passenger per carrier at new battle start');
      check(troops[2].hidden && troops[3].hidden && !troops[4].hidden,'overflow stays outside, never orphaned hidden');
      appData.squads=troops; appData.map={grid:{'2,2':{squadIds:[0,1,4],enemySquadIds:[]},'3,2':{squadIds:[],enemySquadIds:[]}},enemySquads:[]};
      currentSquadIndex=0;currentSquad=troops[0];
      const originals={};for(const name of ['tacticalActionAllowed','spendAP','saveData','renderSquadSelector','renderEmbarkPanel','updateUI','redrawMap']) originals[name]=window[name];
      window.tacticalActionAllowed=()=>true;let spent=0;window.spendAP=()=>{spent++;return true;};
      for(const name of ['saveData','renderSquadSelector','renderEmbarkPanel','updateUI','redrawMap']) window[name]=()=>{};
      disembarkSquad();
      check(!troops[2].hidden && appData.map.grid['2,2'].squadIds.includes(2),'passenger disembarks into carrier hex');
      check(tacticalBtrBoardingCandidates(0).includes(2),'same-hex infantry can board');
      appData.map.grid['2,2'].squadIds=appData.map.grid['2,2'].squadIds.filter(id=>id!==2);
      appData.map.grid['3,2'].squadIds=[2];
      embarkSelectedSquad(2);check(spent===1 && troops[0].embarkedSquadIndex==null,'distant infantry cannot teleport aboard or spend AP');
      appData.map.grid['3,2'].squadIds=[];appData.map.grid['2,2'].squadIds.push(2);
      embarkSelectedSquad(2);
      check(spent===2 && troops[2].hidden && !appData.map.grid['2,2'].squadIds.includes(2),'boarding spends AP and removes passenger from map');
      check(troops[0].embarkedSquadName===troops[2].name,'boarding identity survives index relinking');
      window.tacticalActionAllowed=()=>false;disembarkSquad();
      check(troops[2].hidden && spent===2,'cannot unload in forbidden phase');
      Object.assign(window,originals);

      c.opUnits=[{name:'friendly'}];c.enemyOpUnits=[{name:'enemy'}];
      check(operationalNoiseViewerSide({sourceKey:'recon:enemy',viewerSide:'enemy'})==='player','legacy enemy observation noise stays on observing player');
      check(operationalNoiseViewerSide({sourceKey:'recon:friendly',viewerSide:'player'})==='enemy','friendly noise is not drawn for its owner');

      const battery={name:'САУ test',type:'sau_battery',isGroup:true,col:0,row:0,
        vehicleList:[1,2,3].map(i=>({name:'САУ '+i,squads:[{name:'gun '+i,ammoSmall:0,ammoOrdnance:40,fighters:[{hp:3}]}]}))};
      const victim={name:'target platoon',type:'infantry_platoon',col:1,row:0,detected:true,operationalMorale:100,squads:[{name:'target',fighters:[{hp:1000}]}]};
      c.opUnits=[battery];c.enemyOpUnits=[victim];c.opMapGrid={};c.currentTurn=5;
      const artilleryOriginals={};
      for(const name of ['opCheckUnitDetection','renderShellNotices','redrawOperationalMap','showShootNotification']) {artilleryOriginals[name]=window[name];window[name]=()=>{};}
      const randomOriginal=Math.random;Math.random=()=>.99; // all miss, but expenditure and shock still apply
      const ammoBefore=unitOperationalAmmoTotal(battery,'ordnance');
      executeMortarSalvo(battery,[victim],1,21,'1d10');
      check(ammoBefore-unitOperationalAmmoTotal(battery,'ordnance')===21,'three-SAU salvo consumes 21 rounds, including misses');
      check(victim.operationalMorale===97,'direct artillery applies shell shock even on all misses');
      applyOperationalShellShock(victim,5);check(victim.operationalMorale===97,'shell shock not doubled by outer order');
      Math.random=randomOriginal;Object.assign(window,artilleryOriginals);

      const liveVehicle={name:'retired vehicle',armor:{front:1},opUnitName:'retired group',fighters:[{hp:3}],hexPos:[1,1]};
      const unknownVehicle={name:'unknown vehicle',armor:{front:1},opUnitName:'unknown group',fighters:[{hp:3}],hexPos:[1,1]};
      const retirementMap={grid:{'1,1':{squadIds:[0,1],enemySquadIds:[0]}}};
      c.opUnits=[{name:'retired group',isDestroyed:true}];
      const retirementSquads=[liveVehicle,unknownVehicle];
      check(reconcileOwnDestroyedOperationalVehicles(retirementSquads,retirementMap)===1,'owner retires an explicitly destroyed operational vehicle');
      check(liveVehicle.isDestroyed && liveVehicle.fighters[0].hp===3,'retiring vehicle does not kill its crew retrospectively');
      check(!unknownVehicle.isDestroyed && retirementMap.grid['1,1'].squadIds.join(',')==='1','missing operational owner is not destruction evidence');
      check(retirementMap.grid['1,1'].enemySquadIds.length===1,'never retire opponent from non-authoritative roster');
      check(reconcileOwnDestroyedOperationalVehicles(retirementSquads,retirementMap)===0,'retirement replay idempotent');

      const panelSquad=JSON.parse(JSON.stringify(SQUAD_TEMPLATES.find(s=>s.fighters && s.fighters.length>=7 && !s.armor)));
      appData.squads=[panelSquad];currentSquadIndex=0;currentSquad=panelSquad;
      appData.map={grid:{'2,2':{squadIds:[0],enemySquadIds:[]}},enemySquads:[],mode:'move',selectedMoveSquadIdx:0};
      ensureAP(0);renderMapActionPanel();
      const panel=document.getElementById('battleMapActionPanel'),first=panel.firstChild;
      renderMapActionPanel();check(panel.firstChild===first,'unchanged action panel keeps existing DOM');
      panelSquad.ammoSmall=(Number(panelSquad.ammoSmall)||0)+1;
      renderMapActionPanel();check(panel.firstChild!==first,'ammunition change invalidates action-panel cache');

      const rosterTab=document.getElementById('battleTab'),mapTab=document.getElementById('mapTab');
      const oldRosterDisplay=rosterTab.style.display,oldMapDisplay=mapTab.style.display;
      const rosterNode=document.getElementById('activeSquadArea').firstChild;
      const detailsNode=document.getElementById('squadContainer').firstChild;
      appData.currentBattleId=777;rosterTab.style.display='none';mapTab.style.display='block';
      selectSquad(0);
      check(document.getElementById('activeSquadArea').firstChild===rosterNode,'map selection does not rebuild hidden roster');
      check(document.getElementById('squadContainer').firstChild===detailsNode,'map selection does not rebuild hidden fighter card');
      openTab({currentTarget:document.querySelector('.tablinks')},'battleTab');
      check(document.getElementById('squadContainer').textContent.includes(panelSquad.name),'opening roster renders current squad details');
      rosterTab.style.display=oldRosterDisplay;mapTab.style.display=oldMapDisplay;appData.currentBattleId=null;
      renderActiveCardButtons();
      const activeButton=Array.from(document.querySelectorAll('#movementPanel button')).find(b=>!b.disabled);
      check(!!activeButton,'control regression fixture has an enabled action');
      const activeHandler=activeButton.getAttribute('onclick');
      const currentAction=()=>Array.from(document.querySelectorAll('#shootingPanel button,#movementPanel button,#specialPanel button')).find(b=>b.getAttribute('onclick')===activeHandler);
      const allowedOriginal=window.tacticalActionAllowed;
      window.tacticalActionAllowed=()=>false;renderActiveCardButtons();
      check(currentAction()?.disabled,'stable controls still disable when actions are forbidden');
      window.tacticalActionAllowed=allowedOriginal;renderActiveCardButtons();
      check(currentAction() && !currentAction().disabled,'stable controls re-enable when guard allows action again');

      c.opUnits=[{name:'HQ',type:'company_hq',col:0,row:0},{name:'platoon',col:1,row:0}];
      hardMode.orders=[];
      const executeOriginal=window.executeOrder, commOriginal=window.checkCommunication;
      const calls=[]; window.executeOrder=o=>calls.push(o); window.checkCommunication=()=> 'radio';
      const order={id:123,toUnitId:0,type:'company_order',orderType:'move',subUnitIds:[1],waypoints:[{col:3,row:0}],status:'active'};
      executeCompanyOrder(c.opUnits[0],order);
      check(calls.length===2 && calls[0].toUnitId===1 && calls[1].toUnitId===0,'platoon receives order before HQ moves in same turn');
      check(calls[0].waypoints!==calls[1].waypoints,'HQ route independent of platoon');
      executeCompanyOrder(c.opUnits[0],order); check(calls.length===2,'relay retry must not duplicate HQ order');
      window.executeOrder=executeOriginal; window.checkCommunication=commOriginal;
      return {checks,denseSearchMs:duration};
    });
    // Optional external exports: never commit saves or contact their online rooms.
    for(const file of process.argv.slice(2)) {
      const upload=JSON.parse(fs.readFileSync(file,'utf8'));
      const replay=await browser.newPage({viewport:{width:1100,height:850},serviceWorkers:'block'});
      await replay.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
      replay.on('dialog',d=>d.dismiss());
      await replay.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
      const result=await replay.evaluate(upload=>{
        ONLINE.started=false;ONLINE.docRef=null;ONLINE.match=null;
        appData.campaign=upload.campaign;appData.currentTime=upload.currentTime;appData.currentTurn=upload.currentTurn;
        ONLINE.role=(upload.campaign.online||{}).role || 'p1';
        window.saveData=()=>{};
        const battle=appData.campaign.activeBattles.find(b=>b.hexKey==='6,9');
        if(!battle) throw new Error('export must include 6,9');
        const started=performance.now();switchToBattle(battle.id);const openMs=performance.now()-started;
        const draws=[];for(let i=0;i<3;i++){const t=performance.now();redrawMap();draws.push(performance.now()-t);}
        let returns=0;window.returnToCampaign=()=>{returns++;};
        const completed=appData.campaign.activeBattles.find(b=>b.hexKey==='8,10');
        const pause={active:true,operationalTurn:appData.campaign.currentTurn,campaignTime:appData.campaign.currentTime,campaignTurn:appData.campaign.currentTurn,sourceBattleId:completed.id};
        for(let i=0;i<5;i++) onlineHandleGlobalTacticalPause(pause);
        if(returns || battle.pausedForOrders) throw new Error('unfinished 6,9 ejected or paused');
        const summary={role:ONLINE.role,hex:battle.hexKey,own:appData.squads.length,enemy:appData.map.enemySquads.length,openMs,drawMs:draws,globalPauseReplays:5,forcedReturns:returns};
        const retired=appData.squads.filter(s=>s.operationalVehicleRetired);
        const snapshot=onlineBattleSnapshot(battle);
        for(const unit of retired) {
          const exported=snapshot.squads.find(s=>s.name===unit.name && s.opUnitName===unit.opUnitName);
          if(!exported || !exported.isDestroyed || exported.pos!==null) throw new Error('retired vehicle reappears in outgoing snapshot');
        }
        summary.retiredOwnVehicles=retired.length;

        // Create a genuinely NEW battle from exported operational rosters, not a
        // resume. A resumed battle must keep disembarkations and combat morale.
        const camp=appData.campaign;camp.online=null;camp.activeBattles=[];camp.tacticalOrdersBarrier=false;appData.currentBattleId=null;
        const own=camp.opUnits.filter(u=>u && !u.isDestroyed && u.col===6 && u.row===9);
        const enemy=camp.enemyOpUnits.filter(u=>u && !u.isDestroyed && u.col===6 && u.row===9);
        startTacticalBattle(own,enemy,{silent:true,battleHexKey:'6,9'});
        const fresh=camp.activeBattles.find(b=>b.hexKey==='6,9');
        if(!fresh) throw new Error('new battle failed to start');
        const freshSquads=[...fresh.playerSquads,...fresh.enemySquads];
        const hosts=freshSquads.filter(s=>/БТР/.test(s.name || ''));
        const aboard=hosts.filter(s=>s.embarkedSquadIndex!=null).length;
        if(hosts.length && aboard===0) throw new Error('BTR entrants did not start with infantry aboard');
        if(freshSquads.some(s=>s.baseMorale!==100 || s.tacticalMoraleMax!==100)) throw new Error('new tactical squad still on old morale scale');
        summary.newBattle={carriers:hosts.length,aboard,allOn100Scale:true};
        const excluded=[...camp.opUnits,...camp.enemyOpUnits].filter(u=>u && u.isDestroyed && u.col===6 && u.row===9);
        if(freshSquads.some(s=>excluded.some(u=>u.name===s.opUnitName))) throw new Error('destroyed operational unit recreated in new battle');
        summary.newBattle.destroyedUnitsExcluded=excluded.length;
        camp.activeBattles=[];appData.currentBattleId=null;
        // Unengaged 5/5 specialist from this export, moved only in an offline
        // test fixture; the completed 8,10 platoon may already be destroyed.
        const source=[...camp.opUnits,...camp.enemyOpUnits].flatMap(u=>u.squads || []).find(s=>/Мином[её]т/i.test(s.name || '') && s.baseMorale===5);
        if(!source) throw new Error('legacy mortar fixture missing');
        const fixture={name:'Mortar regression unit',type:'infantry_platoon',col:8,row:10,squads:[JSON.parse(JSON.stringify(source))]};
        const vehicle=JSON.parse(JSON.stringify([...camp.opUnits,...camp.enemyOpUnits].flatMap(u=>u.vehicleList || []).find(v=>v.squads && v.squads.length)));
        vehicle.name='Regression vehicle';vehicle.isDestroyed=false;vehicle.destroyed=false;
        vehicle.ammoOrdnance=40;vehicle.squads[0].ammoOrdnance=39;
        const vehicleUnit={name:'Vehicle regression unit',type:'sau_battery',isGroup:true,groupSize:1,col:8,row:10,vehicleList:[vehicle]};
        camp.opUnits.push(fixture,vehicleUnit);
        const mortarEnemy=camp.enemyOpUnits.filter(u=>u && !u.isDestroyed && u.col===8 && u.row===10);
        startTacticalBattle([fixture,vehicleUnit],mortarEnemy,{silent:true,battleHexKey:'8,10'});
        const mortarBattle=camp.activeBattles.find(b=>b.hexKey==='8,10');
        const mortars=[...mortarBattle.playerSquads,...mortarBattle.enemySquads].filter(s=>/Мином[её]т/i.test(s.name || ''));
        if(!mortars.length || mortars.some(s=>s.currentMorale!==100 || s.baseMorale!==100)) throw new Error('fresh mortar morale not 100/100');
        const tacticalVehicle=mortarBattle.playerSquads.find(s=>s.name==='Regression vehicle');
        if(!tacticalVehicle || tacticalVehicle.ammoOrdnance!==39) throw new Error('tactical vehicle restored stale 40-round ammo duplicate');
        summary.canonicalVehicleAmmo=tacticalVehicle.ammoOrdnance;
        summary.freshMortarsOn100Scale=mortars.length;
        return summary;
      },upload);
      console.log(JSON.stringify({externalReplay:result}));
    }
    console.log(JSON.stringify(checks));
    console.log('PASS: tactical pause, bounded encirclement, compact icons, grouped recon, extra actions, ammo runners, company HQ');
  } finally { if (browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(err=>{console.error(err);process.exitCode=1;});
