'use strict';
// NODE_PATH=<modules containing playwright-core and @sparticuz/chromium> node this-file
// Real Chromium: production deployment, combat, phase authority, runners and order delivery.
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
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil:'load'});
    await page.waitForFunction(() => typeof openHexEditorForBattle === 'function');
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const checks = await page.evaluate(() => {
      let n=0;
      const check=(ok,label)=>{if(!ok)throw new Error(label);n++;};
      ONLINE.started=false;ONLINE.docRef=null;ONLINE.match=null;
      const c=appData.campaign;c.active=true;c.online=false;c.activeBattles=[];
      const squad=name=>({name,faction:'BeVe',fighters:[{name:'rifleman',weapon:'Винтовка FN model 24/30',hp:3,maxHp:3}],crewInstances:[],armor:null,baseMorale:100,currentMorale:100,tacticalMoraleMax:100,tacticalMoraleScaleVersion:1,ammoSmall:30,grenades:0});
      const grid={};for(let r=0;r<20;r++)for(let col=0;col<20;col++)grid[`${col},${r}`]={type:'grass',level:0,squadIds:[],enemySquadIds:[],markers:[]};
      appData.squads=[squad('one'),squad('two')];
      appData.map={grid,w:20,h:20,width:20,height:20,baseHexSize:25,zoomLevel:1,mode:'place',enemySquads:[],activeSide:'player'};
      const b={id:180,hexKey:'2,2',playerSquads:appData.squads,enemySquads:[],tacticalMap:appData.map,currentTurn:1,activeSide:'player',placement:{phase:'placing',entryDir:'W',attackerSide:'player',playerReady:false,enemyReady:false}};
      c.activeBattles=[b];appData.currentBattleId=b.id;currentTurn=1;
      currentSquadIndex=0;currentSquad=appData.squads[0];resetAP();
      renderPlacementPanel();renderPlacementPanel();renderPlacementPanel();
      check(!!document.getElementById('squadToPlace'),'repeated panel rendering preserves persistent selector');
      appData.map.placementSquadIdx=0;handleHexAction('0,0',null);
      check(grid['0,0'].squadIds.includes(0),'placement uses explicit dragged squad');
      // Missing toolbar must not crash: drag identity lives in map state.
      const wrap=document.getElementById('battleSquadToPlaceWrap');const home=wrap.parentNode;wrap.remove();
      appData.map.placementSquadIdx=1;handleHexAction('0,1',null);home.appendChild(wrap);
      check(grid['0,1'].squadIds.includes(1),'placement succeeds with missing select rather than reading null.value');
      b.placement.phase='done';renderPlacementPanel();
      check(document.getElementById('battlePlacementTray').style.display==='none','last placed reinforcement clears tray');
      check(placementReinforcementUnplaced(b).length===0,'placed squads not offered as reserves');
      const fresh=squad('fresh');fresh.fighters=Array.from({length:10},()=>({hp:3}));fresh.ammoSmall=0;
      initializeInfantryAmmo(fresh);check(fresh.ammoSmall===150,'fresh infantry receives 15 rounds per living fighter');
      fresh.fighters[0].hp=0;syncInfantryAmmoStrength(fresh);check(fresh.ammoSmall===135,'one death removes ten percent of current ammunition');
      syncInfantryAmmoStrength(fresh);check(fresh.ammoSmall===135,'re-render does not repeat casualty ammunition loss');
      const old=squad('spent');old.ammoSmall=0;syncInfantryAmmoStrength(old);check(old.ammoSmall===0,'legacy/resumed empty squad is not refilled on load');
      check(supplySquadCapacity(fresh,'ammoSmall')===135,'resupply capacity follows living infantry');
      check(mapExtraButtonBlocked({},'🌋 Тяжёлая / камни'),'terrain duplicate blocked despite spaces around slash');
      check(mapExtraButtonBlocked({armor:{}},'Орудия / миномёты'),'slash normalization preserves armored action filters');
      check(!document.getElementById('movementPanel').textContent.includes('Тяжёлая / камни'),'terrain button removed from original source panel');
      const arriving=squad('reinforcement');arriving.placementArrivalDir='E';
      const zone=placementReinforcementZone(b,arriving);
      check(zone.keys.length>0,'entry strip exists');
      zone.keys.forEach(k=>{grid[k].enemySquadIds=[0];});
      check(placementReinforcementZone(b,arriving).keys.length===0,'full strip never falls back to opposite edge');
      zone.keys.forEach(k=>{grid[k].enemySquadIds=[];});
      const owner={name:'owner',prevCol:1,prevRow:2,col:2,row:2};tacticalSetReinforcementArrival(arriving,owner,b);
      check(arriving.placementArrivalDir===opDirectionBetween(2,2,1,2),'arrival direction derives from actual previous operational hex');
      const op={name:'participant',isInBattle:false};c.opUnits=[op];c.enemyOpUnits=[];b.playerUnitNames=[op.name];
      check(operationalUnitInTacticalBattle(op),'active battle membership overrides stale false flag');
      check(!canUnitShoot(op),'participant cannot shoot operationally');
      opShootingState.shooter=op;op.ammoSmall=20;executeOpShoot([{}],1);check(op.ammoSmall===20,'execution guard rejects shooter before spending ammunition');
      check(!operationalUnitInTacticalBattle({name:'unrelated'}),'unrelated units remain operational');
      c.playerFaction='A.I.R.F.';check(supplyAssetName('truck')==='Лёгкий грузовик CLg-37 Vicuña','AIRF supply label is faction-specific');
      c.playerFaction='BeVe';check(supplyAssetName('truck').includes('DAF'),'Belgian truck label unchanged');
      const savedNearest=window.nearestSupplyPoint;window.nearestSupplyPoint=()=>({key:'4,0',distance:4});
      check(estimateAmmoDeliveryTurns(appData.map,'0,0','player')===2,'runner covers four hexes each way in two own turns');
      window.nearestSupplyPoint=()=>({key:'5,0',distance:5});check(estimateAmmoDeliveryTurns(appData.map,'0,0','player')===4,'outward and return legs are rounded separately');window.nearestSupplyPoint=savedNearest;
      const phase={activeSide:'enemy',phaseRevision:4,tacticalPhasesCompleted:1,currentTurn:2,placement:{attackerSide:'player'}};
      check(!onlineAcceptBattlePhase(phase,{activeSide:'attacker',phaseRevision:99,tacticalPhasesCompleted:1,turn:2},false),'higher revision without completed phase cannot hand attacker another turn');
      check(!onlineAcceptBattlePhase(phase,{activeSide:'attacker',phaseRevision:99,tacticalPhasesCompleted:10,turn:2},false),'old-window phase counter cannot hand attacker another turn');
      // Real suppression from an MG-only crew through the two map clicks.
      const gun=getFactionCrewWeapons('BeVe').find(w=>w.type==='mg');
      const support=squad('Отделение поддержки');support.fighters=Array.from({length:3},(_,i)=>({name:'crew '+i,weapon:'',hp:3,maxHp:3}));
      support.crewInstances=[{weaponName:gun.name,uniqueKey:'test-mg',active:true,status:'ok',fighterIndices:[0,1,2]}];support.effects={coordinatedBarrage:true};support.ammoSmall=100;
      appData.squads=[support];b.playerSquads=appData.squads;
      Object.values(grid).forEach(cell=>{cell.squadIds=[];cell.enemySquadIds=[];});grid['2,2'].squadIds=[0];
      const foes=[squad('target one'),squad('target two')];appData.map.enemySquads=foes;b.enemySquads=foes;
      grid['3,2'].enemySquadIds=[0];grid['4,2'].enemySquadIds=[1];appData.map.activeSide='player';b.activeSide='player';
      currentSquad=support;currentSquadIndex=0;resetAP();
      check(beginCoordinatedSuppression(),'coordinated suppression enters two-hex selection');
      handleHexAction('3,2',null);handleHexAction('4,2',null);
      check(foes.every(e=>e.suppressed),'MG-only crew actually suppresses both selected hexes');
      check(support.ammoSmall<100,'suppression consumes real ammunition');
      check(getAP(0)===getMaxAP(support)-5,'coordinated suppression spends exactly 2.5 AP');
      check(!appData.map.pendingCoordinatedSuppression,'selection finishes after two hexes');
      support.isRouting=true;renderActiveCardButtons();
      check(document.body.innerHTML.includes('onclick="tacticalRegroupSquadAtHQ()"'),'routing infantry retain regroup-at-HQ button');
      support.isRouting=false;
      support.suppressed=true;check(tacticalActionAllowed(support,'shoot',true),'suppression alone does not forbid shooting');
      check(!tacticalActionAllowed(support,'move',true),'fire suppression still blocks ordinary movement');
      // Exercise the real end-phase button handler, not only its merge helper.
      c.online=true;support.suppressed=false;b.tacticalPhasesCompleted=0;b.phaseRevision=0;b.currentTurn=1;currentTurn=1;
      nextTurn();
      check(b.activeSide==='enemy' && !tacticalActionAllowed(support,'move',true),'attacker cannot move after ending own phase');
      const stale={activeSide:'attacker',phaseRevision:99,tacticalPhasesCompleted:1,turn:b.currentTurn};
      check(!onlineAcceptBattlePhase(b,stale,true) && b.activeSide==='enemy','echo snapshot does not return attacker control');
      const handed=onlineAcceptBattlePhase(b,{activeSide:'attacker',phaseRevision:b.phaseRevision+1,tacticalPhasesCompleted:2,turn:b.currentTurn+1},true);
      check(handed && b.activeSide==='player','only defender completion returns attacker control');
      // Routes A→B and B→C, with no platoon relay envelope on the HQ.
      c.online=false;c.opUnits=[{name:'route unit',col:0,row:0}];c.selectedOpUnit=c.opUnits[0];
      hardMode.orders=[{id:1,toUnitId:0,type:'move',status:'active',turnIssued:1,waypoints:[{col:2,row:0}]},
        {id:2,toUnitId:0,type:'move',status:'active',turnIssued:2,waypoints:[{col:4,row:0}]},
        {id:3,toUnitId:0,type:'company_order',orderType:'move',status:'active',subUnitIds:[1],waypoints:[{col:9,row:0}]}];
      hardMode.pendingOrders=[];
      check(collectOperationalOrdersForUnit(0).length===2,'HQ selection excludes subordinate relay envelope');
      const starts=[];const ctx=new Proxy({moveTo:(x,y)=>starts.push({x,y}),measureText:()=>({width:20})},{get:(obj,key)=>key in obj?obj[key]:(()=>{})});
      drawSelectedUnitOrdersOnMap(ctx,45);
      const secondX=2*Math.sqrt(3)*45+Math.sqrt(3)*45/2;
      check(starts.some(p=>Math.abs(p.x-secondX)<.01 && p.y===45),'second route begins at B, not current unit position A');
      // Casualty handler must not apply the previous proportional loss AND 10%.
      const casualty=squad('casualty');casualty.fighters=Array.from({length:10},(_,i)=>({name:'f'+i,hp:3}));initializeInfantryAmmo(casualty);
      casualty.fighters[0].hp=0;handleFighterDeath(casualty);syncInfantryAmmoStrength(casualty);
      check(casualty.ammoSmall===135,'actual casualty handler deducts 10% once, not twice');
      handleFighterDeath(casualty);check(casualty.ammoSmall===135,'repeated casualty notification does not deduct ammo again');
      const progress={digProgress:0};check(!onlineMergeUnitDamage(progress,{digProgress:2}) && progress.digProgress===2,'digging progress merges without reporting damage');
      const identities={squads:[{name:'alpha',fighters:[{name:'a',hp:3},{name:'b',hp:3}]},{name:'beta',fighters:[{name:'c',hp:3}]}]};
      check(onlineMergeUnitDamage(identities,{squads:[{name:'beta',fighters:[{name:'c',hp:2}]},{name:'alpha',fighters:[{name:'b',hp:1},{name:'a',hp:3}]}]}),'reordered damage snapshot applies real losses');
      check(identities.squads[0].fighters[0].hp===3 && identities.squads[0].fighters[1].hp===1 && identities.squads[1].fighters[0].hp===2,'damage follows squad and fighter identities instead of list positions');
      check(!onlineMergeUnitDamage(identities,{squads:[{name:'absent',fighters:[{name:'a',hp:0}]}]}),'removed foreign squad never damages first local squad');
      const vehicles={vehicleList:[{id:1,name:'same',fighters:[{id:10,hp:3}]},{id:2,name:'same',fighters:[{id:20,hp:3}]}]};
      onlineMergeUnitDamage(vehicles,{vehicleList:[{id:2,name:'same',isImmobilized:true,fighters:[{id:20,hp:1}]},{id:1,name:'same',fighters:[{id:10,hp:3}]}]});
      check(vehicles.vehicleList[0].fighters[0].hp===3 && vehicles.vehicleList[1].fighters[0].hp===1 && vehicles.vehicleList[1].isImmobilized,'vehicle IDs override duplicated names and list order');
      // Real runner positions: no ammunition before visiting supply and coming back.
      const savedMap=appData.map,savedSquads=appData.squads;
      const runnerGrid={};for(let x=0;x<=5;x++)runnerGrid[x+',0']={type:'grass',squadIds:x===0?[0]:[],enemySquadIds:[],markers:x===4?[SUPPLY_POINT_MARKER]:[]};
      appData.map={grid:runnerGrid,enemySquads:[],autoSupplyKeysPlayer:['4,0']};
      const runner={name:'test runner',hp:3,isAway:true,turnsToReturn:2,ammoType:'1',ammoSupplyHex:'4,0',ammoRun:{hex:'0,0',stage:'outbound',loaded:false,distance:4}};
      appData.squads=[{name:'runner squad',fighters:[runner],ammoSmall:10}];
      check(nearestSupplyPoint(appData.map,'0,0','player').path.length===5,'supply selection returns an adjacent-hex route');
      processTacticalAmmoRunners();check(runner.ammoRun.hex==='4,0' && runner.ammoRun.loaded && runner.isAway && appData.squads[0].ammoSmall===10,'first own turn reaches supply but does not deliver remotely');
      appData.squads=JSON.parse(JSON.stringify(appData.squads)); // save/reload mid-trip
      runnerGrid['0,0'].squadIds=[];runnerGrid['1,0'].squadIds=[0];
      processTacticalAmmoRunners();check(!appData.squads[0].fighters[0].isAway && appData.squads[0].ammoSmall===40,'saved runner returns to current squad hex and delivers once');
      processTacticalAmmoRunners();check(appData.squads[0].ammoSmall===40,'physical delivery is idempotent');
      runnerGrid['1,0'].squadIds=[];runnerGrid['0,0'].squadIds=[0];runnerGrid['4,0'].markers=[];runnerGrid['5,0'].markers=[SUPPLY_POINT_MARKER];appData.map.autoSupplyKeysPlayer=['5,0'];
      const interrupted={name:'interrupted',hp:3,isAway:true,turnsToReturn:4,ammoType:'1',ammoSupplyHex:'5,0',ammoRun:{hex:'0,0',stage:'outbound',loaded:false,distance:5}};
      appData.squads=[{fighters:[interrupted],ammoSmall:0}];processTacticalAmmoRunners();
      check(interrupted.ammoRun.hex==='4,0' && !interrupted.ammoRun.loaded,'runner travels at most four hexes, not five');
      runnerGrid['5,0'].markers=[];processTacticalAmmoRunners();
      check(!interrupted.isAway && appData.squads[0].ammoSmall===0,'lost supply point forces empty return, not free ammunition');
      runnerGrid['5,0'].markers=[SUPPLY_POINT_MARKER];runnerGrid['2,0'].type='water';
      check(nearestSupplyPoint(appData.map,'0,0','player')===null,'unreachable supply beyond water cannot be selected');
      runnerGrid['2,0'].type='grass';runnerGrid['2,0'].enemySquadIds=[0];appData.map.enemySquads=[{fighters:[{hp:3}]}];
      check(nearestSupplyPoint(appData.map,'0,0','player')===null,'runner cannot pass through live enemy positions');
      runnerGrid['2,0'].enemySquadIds=[];appData.map.enemySquads=[];
      const waiting={name:'waiting',hp:3,isAway:true,turnsToReturn:4,ammoType:'1',ammoSupplyHex:'5,0',ammoRun:{hex:'0,0',stage:'outbound',loaded:false,distance:5}};
      appData.squads=[{fighters:[waiting],ammoSmall:0}];runnerGrid['2,0'].type='water';
      processTacticalAmmoRunners();check(waiting.isAway && waiting.ammoRun.hex==='0,0' && waiting.ammoRun.blocked && appData.squads[0].ammoSmall===0,'blocked runner cannot finish by countdown');
      runnerGrid['2,0'].type='grass';processTacticalAmmoRunners();check(waiting.ammoRun.hex==='4,0' && !waiting.ammoRun.blocked,'runner resumes when path opens');
      const detourGrid={};for(let y=0;y<3;y++)for(let x=0;x<6;x++)detourGrid[x+','+y]={type:x===2 && y<2?'water':'grass',markers:[],enemySquadIds:[]};
      const detour=ammoRunnerFindPath({grid:detourGrid,enemySquads:[]},'0,0','5,0','player');
      check(detour && detour.length-1>5 && detour.every(key=>detourGrid[key].type!=='water'),'path planner walks around a river instead of using straight-line distance');
      appData.map=savedMap;appData.squads=savedSquads;
      // Late defender and partially missing platoon must appear in placement.
      const incoming={name:'late defender',type:'infantry_platoon',col:2,row:2,prevCol:3,prevRow:2,squads:[squad('late one'),squad('late two')]};
      c.opUnits=[incoming];const reinforcementBattle={id:999,hexKey:'2,2',playerSquads:[],enemySquads:[],placement:{phase:'done',attackerSide:'enemy',entryDir:'W'}};
      c.activeBattles=[reinforcementBattle];check(operationalUnitInTacticalBattle(incoming),'unregistered arrival on active battle hex cannot fire operationally');
      check(battleEnsureParticipantSquads(reinforcementBattle)===2 && reinforcementBattle.playerUnitNames.includes(incoming.name),'unregistered defending platoon joins battle roster');
      reinforcementBattle.playerSquads.pop();check(battleEnsureParticipantSquads(reinforcementBattle)===1,'partial owner roster does not hide missing second squad');
      check(battleEnsureParticipantSquads(reinforcementBattle)===0 && reinforcementBattle.playerSquads.length===2,'repair is idempotent');
      appData.currentBattleId=999;appData.squads=reinforcementBattle.playerSquads;
      appData.map={...savedMap,grid:JSON.parse(JSON.stringify(savedMap.grid))};Object.values(appData.map.grid).forEach(cell=>cell.squadIds=[]);
      check(placementReinforcementUnplaced(reinforcementBattle).length===2 && appData.squads.every(s=>s.placementArrivalDir==='E'),'late defending squads are deployable from their arrival edge');
      appData.currentBattleId=b.id;appData.map=savedMap;appData.squads=savedSquads;c.activeBattles=[b];
      // Recon shares the same compact slots as ordinary units, not their centres.
      const ordinary={name:'ordinary',col:2,row:2};c.opUnits=[ordinary];c.enemyOpUnits=[];
      const mission={id:'slot-test',assetName:'scout',assetKind:'foot',status:'active',currentHex:{col:2,row:2},originHex:{col:0,row:0},route:[{col:4,row:2}],currentIndex:0};
      c.reconMissions=[mission];const layout=operationalUnitIconLayout(55,18);const ownEntry=layout.find(e=>e.unit===ordinary);const scoutPoint=reconMissionIconCenter(mission,55);
      check(layout.length===2 && Math.hypot(ownEntry.x-scoutPoint.x,ownEntry.y-scoutPoint.y)>=ownEntry.radius+scoutPoint.radius,'recon and ordinary icons never occupy the same slot');
      check(opReconMissionAtPoint(ownEntry.x,ownEntry.y,55)===null && opOwnUnitAtPoint(ownEntry.x,ownEntry.y,55)===ordinary,'ordinary icon is not intercepted by recon picking');
      check(opReconMissionAtPoint(scoutPoint.x,scoutPoint.y,55)===mission && opOwnUnitAtPoint(scoutPoint.x,scoutPoint.y,55)===null,'recon draw and hit test use the identical slot');
      openReconAssetPopup(mission.id);check(document.querySelectorAll('#reconAssetPopup button[onclick^="reconStartRecallPointPick"]').length===1 && !document.querySelector('#reconAssetPopup button[onclick^="recallReconMission"]'),'recall UI offers one destination-selection action');
      recallReconMission(mission.id,{col:3,row:2});check(mission.status==='returning' && mission.recallHex.col===3,'chosen recall destination becomes the active return order');
      let recallSaves=0;const oldSave=window.saveData;window.saveData=()=>recallSaves++;
      try {recallReconMission(mission.id,{col:4,row:2});} finally {window.saveData=oldSave;}
      check(mission.recallHex.col===4 && recallSaves>0,'retargeting an already returning scout is saved');
      showReconPanel(true);reconStartRecallPointPick(mission.id);
      check(reconIsPickingRecall() && document.getElementById('reconPanel').style.display==='none','recall picking closes panel instead of covering the map');
      c.opCenters=[{key:'3,2',x:10,y:20}];handleReconRecallPickClick(10,20,55);
      check(!reconIsPickingRecall() && mission.recallHex.col===3,'map click dispatches recall to the chosen destination');
      c.opUnits=Array.from({length:10},(_,i)=>({name:'stack '+i,col:2,row:2}));
      c.reconMissions=Array.from({length:10},(_,i)=>({...mission,id:'dense '+i}));
      const dense=operationalUnitIconLayout(55,18);const missions=dense.filter(e=>e.mission);
      check(missions.every(e=>opReconMissionAtPoint(e.x,e.y,55)===e.mission),'all ten dense recon slots can be picked separately');
      check(missions.every(e=>dense.filter(other=>other!==e).every(other=>Math.abs(other.x-e.x)>=(other.radius+e.radius) || Math.abs(other.y-e.y)>=(other.radius+e.radius))),'dense recon markers do not overlap ordinary or other recon icons');
      closeReconAssetPopup();c.reconMissions=[];
      // The real order queue delivers detached scout orders to the scout's
      // position, not to its stationary HQ carrier, without spending HQ orders.
      const previousHardMode=hardMode;hardMode=JSON.parse(JSON.stringify(previousHardMode));
      hardMode.enabled=true;hardMode.orders=[];hardMode.pendingOrders=[];hardMode.messengerQueue=[];
      hardMode.phoneLines=[];hardMode.signalPlatoon.radios.assigned=[];
      hardMode.messengers={battalion:{total:2,available:2,active:[]},companies:{}};hardMode.hqUnitId=0;
      const scoutSquad=squad('detached scout');scoutSquad.onReconMission=true;
      const commandHQ={name:'Штаб батальона',type:'battalion_hq',col:0,row:0,squads:[scoutSquad],faction:'A.I.R.F.'};
      c.opUnits=[commandHQ];c.enemyOpUnits=[];c.playerFaction='A.I.R.F.';c.online=false;c.activeBattles=[];c.currentTurn=1;c.currentTime=600;
      const queuedMission={id:'queued-scout',unitId:0,unitName:commandHQ.name,squadName:scoutSquad.name,assetName:'detached',assetKind:'foot',status:'observing',currentHex:{col:6,row:0},originHex:{col:0,row:0},route:[],reportMethod:'radio'};
      c.reconMissions=[queuedMission];
      const queuedRecall=recallReconMission(queuedMission.id,{col:3,row:0});
      check(queuedRecall && queuedRecall.type==='recon_control' && queuedRecall.status==='delivering','scout recall is a real messenger order');
      check(queuedRecall.deliveryTurnsNeeded===2 && queuedMission.status==='observing' && !queuedMission.recallHex,'detached scout receives no instant order through its HQ carrier');
      check(reconControlRecipient(queuedRecall).col===6 && hardMode.messengers.battalion.available===1,'messenger is reserved and travels to actual scout position');
      check(commandHQ.behavior===undefined && collectOperationalOrdersForUnit(0).length===0,'scout order does not change HQ behavior or draw its route');
      renderActiveOrders();check(document.getElementById('ordersContainer').innerHTML.includes('detached'),'ordinary orders list displays scout recipient');
      // Delivery progress is exercised through the production dispatcher below;
      // isolate mission movement to assert delivery precedes that single budget.
      const originalAdvance=window.advanceReconMissions;let deliveredBeforeAdvance=false;
      window.advanceReconMissions=()=>{deliveredBeforeAdvance=queuedMission.status==='returning';};
      try {processOrders();check(queuedMission.status==='observing','first messenger turn cannot apply recall');c.currentTurn++;processOrders();}
      finally {window.advanceReconMissions=originalAdvance;}
      check(queuedRecall.status==='completed' && queuedMission.status==='returning' && queuedMission.recallHex.col===3,'production delivery applies scout recall after travel');
      check(deliveredBeforeAdvance,'new scout order applies before that turn movement budget');
      check(commandHQ.col===0 && commandHQ.row===0,'detached scout orders never move its HQ');
      hardMode.messengers.battalion.available=0;
      const waitingControl=changeReconMissionOrder(queuedMission.id,{route:[{col:4,row:0}],observeMode:'stationary'});
      check(waitingControl && waitingControl.status==='queued' && queuedMission.status==='returning','route changes without radios wait for a messenger instead of rejection or teleport');
      check(reconControlOrderStatus(queuedMission).includes('ждёт посыльного'),'scout drawer exposes queued delivery status');
      cancelOrder(waitingControl.id,true);check(waitingControl.status==='cancelled' && queuedMission.status==='returning','cancelled scout order never changes its current mission');
      hardMode.signalPlatoon.radios.assigned=[{unitId:0,isHQ:true,status:'active'}];
      hardMode.signalPlatoon.radios.reconOrgans=[{unitId:0,squadName:scoutSquad.name}];
      const radioControl=changeReconMissionOrder(queuedMission.id,{route:[{col:5,row:0}],observeMode:'stationary'});
      check(radioControl && radioControl.deliveryMethod==='radio' && radioControl.status==='active','issued scout radio uses real instant order delivery');
      check(JSON.parse(JSON.stringify(radioControl)).reconControl.missionId===queuedMission.id,'scout recipient and route survive order serialization');
      executeOrder(radioControl);check(radioControl.status==='completed' && queuedMission.status==='active','delivered radio route is applied through ordinary executor');
      const lostRadio=recallReconMission(queuedMission.id,{col:2,row:0});hardMode.signalPlatoon.radios.reconOrgans=[];
      executeOrder(lostRadio);check(lostRadio.status==='queued' && queuedMission.status==='active','lost scout radio with no courier waits instead of ghost delivery');
      // Detached return to an arbitrary point must not teleport back into HQ.
      hardMode.enabled=false;queuedMission.status='returning';queuedMission.currentHex={col:3,row:0};queuedMission.recallHex={col:3,row:0};
      advanceReconMissions();check(queuedMission.status==='observing' && queuedMission.currentHex.col===3 && scoutSquad.onReconMission,'detached scout holds chosen recall point instead of rejoining a distant HQ');
      const template=appData.templates.find(t=>t && t.faction==='BeVe' && /Мотоциклист-разведчик/.test(t.name));
      check(!!template,'real detached scout template exists');
      commandHQ.squads=[JSON.parse(JSON.stringify(template))];c.playerFaction='BeVe';c.reconMissions=[];
      hardMode.enabled=true;hardMode.orders=[];hardMode.pendingOrders=[];hardMode.messengerQueue=[];
      hardMode.signalPlatoon.radios.assigned=[];hardMode.signalPlatoon.radios.reconOrgans=[];hardMode.messengers.battalion={total:2,available:2,active:[]};
      const source=reconListAssetSources().find(source=>source.unitId===0 && source.squadName===template.name);
      check(!!source,'real scout can be selected as deployment source');
      const deployment=queueReconDeployment({assetKey:source.assetKey,unitId:0,squadName:template.name,route:[{col:1,row:0}],observeMode:'stationary',reportMethod:'radio'});
      check(deployment && deployment.status==='delivering' && c.reconMissions.length===0,'initial scout mission waits for normal order delivery');
      check(queueReconDeployment({assetKey:source.assetKey,unitId:0,squadName:template.name,route:[{col:1,row:0}]})===deployment,'repeated submit cannot reserve the same scout twice');
      deployment.deliveryTurnsPassed=deployment.deliveryTurnsNeeded;
      processOrders();check(c.reconMissions.length===1 && deployment.status==='completed','delivered initial order creates exactly one real mission');
      const scoutUnit={name:'scout op unit',type:'recon_platoon',col:0,row:0,reconMissionId:c.reconMissions[0].id,squads:[squad('scout')],ap:4};
      c.opUnits.push(scoutUnit);const oldMove={type:'move',toUnitId:1,waypoints:[{col:4,row:0}],status:'active'};
      executeOrder(oldMove);check(scoutUnit.col===0 && scoutUnit.ap===4 && oldMove.status==='active','old op movement waits during a mission instead of spending a second movement budget');
      check(!canUnitShoot(scoutUnit) && consumeOperationalAmmo(scoutUnit,'small',1)===0,'mission cannot spend hidden unit ammunition through old firing orders');
      hardMode=previousHardMode;c.reconMissions=[];c.activeBattles=[b];c.online=false;
      const grouped={name:'late cars',type:'armored_vehicle_platoon',isGroup:true,col:2,row:2,prevCol:3,prevRow:2,vehicleList:[
        {name:'car one',fighters:[{name:'crew',hp:3}],armor:{front:4},ammoSmall:12,isRouting:true,suppressed:true},
        {name:'car two',fighters:[{name:'crew',hp:3}],armor:{front:4},ammoSmall:8},
        {name:'dead car',fighters:[{hp:0}],armor:{front:4},isDestroyed:true}]};
      c.opUnits=[grouped];const carBattle={id:1000,hexKey:'2,2',playerSquads:[],enemySquads:[],placement:{phase:'done',attackerSide:'enemy',entryDir:'W'}};
      check(battleEnsureParticipantSquads(carBattle)===2,'late vehicle group adds each surviving car separately');
      check(carBattle.playerSquads.every(s=>s.isVehicle && s.armor && s.placementArrivalDir==='E'),'vehicle reinforcements retain armor and their actual arrival edge');
      check(!carBattle.playerSquads[0].isRouting && !carBattle.playerSquads[0].suppressed && carBattle.playerSquads[0].currentMorale===100,'new battle copy drops previous fight movement locks');
      check(carBattle.playerSquads[0].ammoSmall===12 && battleEnsureParticipantSquads(carBattle)===0,'vehicle repair neither refills ammunition nor duplicates vehicles');
      const freshCyclist={name:'arriving cycle',type:'bicycle_platoon',col:2,row:2,prevCol:3,prevRow:2,dismounted:true,squads:[{...squad('old retreat cycle'),isRetreated:true,isRouting:true,retreatToHQ:true,suppressed:true,mobilityType:'bicycle',dismounted:false}]};
      c.opUnits=[freshCyclist];const cycleBattle={hexKey:'2,2',playerSquads:[],enemySquads:[]};
      check(battleEnsureParticipantSquads(cycleBattle)===1,'prior tactical retreat flag cannot hide a newly arriving operational platoon');
      const cycleCopy=cycleBattle.playerSquads[0];check(!cycleCopy.isRouting && !cycleCopy.isRetreated && !cycleCopy.retreatToHQ && cycleCopy.dismounted,'new arrival uses operational dismounting and clears old retreat movement locks');
      c.activeBattles=[cycleBattle];check(consumeOperationalAmmo(freshCyclist,'small',1)===0 && cycleCopy.ammoSmall===30,'central ammunition deduction refuses a tactical participant even if a caller bypasses UI checks');

      // Incoming repeated damage snapshots must not open a blocking dialog.
      const alertOriginal=window.alert;let damageAlerts=0;window.alert=message=>{if(String(message).includes('получили урон в бою'))damageAlerts++;};
      const damagedUnit={name:'notice fixture',squads:[{name:'notice squad',fighters:[{hp:3}]}]};
      c.opUnits=[damagedUnit];c.enemyOpUnits=[];c.online=true;
      ONLINE.role='p1';ONLINE.started=true;ONLINE.match={status:'playing',players:{p1:{faction:'BeVe'},p2:{faction:'A.I.R.F.'}},state:{p2:{inflictedOnOpponent:[{name:'notice fixture',squads:[{fighters:[{hp:1}]}]}]}}};
      try { onlineApplyCloudState();onlineApplyCloudState();onlineApplyCloudState(); }
      finally {window.alert=alertOriginal;ONLINE.started=false;ONLINE.match=null;c.online=false;}
      check(damagedUnit.squads[0].fighters[0].hp===1,'incoming operational damage still applies');
      check(damageAlerts===0,'repeated damage sync never opens its blocking damage alert during tactical play');
      return n;
    });
    console.log('PASS: v13.180 browser regression checks: '+checks);
    for(const file of process.argv.slice(2)) {
      const saved=JSON.parse(fs.readFileSync(file,'utf8'));
      const replay=await browser.newPage({viewport:{width:420,height:850},serviceWorkers:'block'});
      await replay.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
      replay.on('dialog',d=>d.dismiss());
      await replay.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
      const result=await replay.evaluate(saved=>{
        ONLINE.started=false;ONLINE.docRef=null;ONLINE.match=null;
        appData.campaign=saved.campaign;
        const c=appData.campaign;
        const b=c.activeBattles.find(b=>b.hexKey==='8,9');
        if(!b)throw new Error('latest fixture missing battle 8,9');
        appData.squads=JSON.parse(JSON.stringify(b.playerSquads));
        appData.map=JSON.parse(JSON.stringify(b.tacticalMap));
        appData.map.enemySquads=JSON.parse(JSON.stringify(b.enemySquads));
        appData.currentBattleId=b.id;currentTurn=b.currentTurn || 1;appData.currentTurn=currentTurn;
        currentSquadIndex=0;currentSquad=appData.squads[0];resetAP();
        renderPlacementPanel();renderPlacementPanel();
        if(!document.getElementById('squadToPlace'))throw new Error('selector lost on private battle');
        const pending=placementTrayUnplacedSquads(b);
        let placed=false;
        if(pending.length){
          const item=pending[0];
          const key=Object.keys(appData.map.grid).find(k=>placementSideAllowed(b,'player',k,item.s));
          if(key){appData.map.placementSquadIdx=item.i;appData.map.mode='place';handleHexAction(key,null);placed=appData.map.grid[key].squadIds.includes(item.i);}
          if(!placed)throw new Error('private battle placement did not complete');
          if(placementTrayUnplacedSquads(b).some(x=>x.i===item.i))throw new Error('private placed unit remains in reserve');
        }
        const locked=(c.opUnits || []).filter(u=>u && !u.isInBattle && operationalUnitInTacticalBattle(u)).length;
        return {faction:c.playerFaction,hex:b.hexKey,unplacedBefore:pending.length,placed,staleFalseFlagsProtected:locked};
      },saved);
      console.log('PRIVATE REPLAY: '+JSON.stringify(result));
    }

  } finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
