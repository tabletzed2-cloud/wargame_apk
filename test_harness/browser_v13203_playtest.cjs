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
      setCampaignTutorialEnabled(false);
      showOnlyAppScreen('battleApp');
      appData.currentBattleId=null;appData.campaign.online=false;appData.campaign.active=false;
      appData.campaign.activeBattles=[];appData.campaign.opUnits=[];appData.campaign.enemyOpUnits=[];
      currentTurn=1;TACTICAL_MAP_SIZE=20;
      const foot=(name,faction='BeVe')=>({name,faction,hexPos:[0,5],fighters:[{name:'rifle',hp:3,maxHp:3}],baseMorale:100,currentMorale:100,ammoSmall:20,ammoOrdnance:0,grenades:0,effects:{}});
      const squad=foot('dragged squad');appData.squads=[squad];
      appData.map={grid:{},centers:[],enemySquads:[],mode:'place',baseHexSize:20,zoomLevel:1,activeSide:'player',placementSquadIdx:0};
      for(let r=0;r<20;r++)for(let c=0;c<20;c++)appData.map.grid[c+','+r]={type:'grass',level:0,squadIds:[],enemySquadIds:[],markers:[]};
      appData.map.grid['0,5'].squadIds=[0];
      const battle={id:'drag',hexKey:'8,12',placement:{phase:'placing',attackerSide:'player',entryDir:'W',enemyReady:true},
        playerSquads:[squad],enemySquads:[],currentTurn:1,cardsChosen:true,tacticalMap:appData.map};
      appData.campaign.activeBattles=[battle];appData.currentBattleId=battle.id;
      currentSquad=squad;currentSquadIndex=0;actionPoints={};ensureAP(0);
      document.querySelectorAll('.tabcontent').forEach(e=>e.style.display='none');document.getElementById('mapTab').style.display='block';
      refreshSquadToPlaceDropdown();renderPlacementPanel();initMap();redrawMap();installBattlePlacementTray();
      const canvas=document.getElementById('gameMap');
      // Real document capture listener and target canvas, deterministic projection
      // isolates pointer event routing from scroll/viewport placement.
      const oldHexAt=tacticalCanvasHexAt;tacticalCanvasHexAt=x=>x<150?'0,5':'1,5';
      const rect=canvas.getBoundingClientRect();
      const event=(type,x)=>new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:19,pointerType:'mouse',clientX:x,clientY:rect.top+10,button:0,buttons:type==='pointerup'?0:1});
      const dropX=Math.max(rect.left+20,200);
      // clientX must be inside the canvas; use projection based on chosen points.
      const downX=rect.left+10,upX=rect.left+50;
      tacticalCanvasHexAt=x=>x<downX+20?'0,5':'1,5';
      canvas.dispatchEvent(event('pointerdown',downX));canvas.dispatchEvent(event('pointermove',upX));canvas.dispatchEvent(event('pointerup',upX));
      check(appData.map.grid['1,5'].squadIds.includes(0),'placed squad must drag to a new legal cell');
      check(!appData.map.grid['0,5'].squadIds.includes(0),'old tactical cell is cleared');
      await new Promise(r=>setTimeout(r,5));
      battle.placement.playerReady=true;
      tacticalCanvasHexAt=()=> '1,5';
      canvas.dispatchEvent(event('pointerdown',downX));
      check(!window.__battlePlacementDragging,'confirmed deployment cannot begin another placement drag');
      tacticalCanvasHexAt=oldHexAt;
      await new Promise(r=>setTimeout(r,5));
      battle.placement.phase='done';battle.placement.attackerSide='enemy';battle.placement.entryDir='W';
      battle.placement.reinforcementPending=true;battle.placement.reinforcementUnitNames=['wave'];
      const wave={...foot('wave'),opUnitName:'wave',placementArrivalDir:'E'};
      appData.squads.push(wave);battle.playerSquads=appData.squads;
      appData.map.placementSquadIdx=0; // stale original defender selection
      const paths=[],fake={save(){},restore(){},beginPath(){},moveTo(x,y){paths.push([x,y]);},lineTo(){},closePath(){},fill(){}};
      drawPlacementZone(fake,20);
      const expected=placementReinforcementZone(battle,wave).keys;
      check(paths.length===expected.length,'reinforcement highlight follows actual arrival edge even with stale selection');
      check(paths.every(([x,y])=>expected.some(k=>{const c=appData.map.centers.find(p=>p.key===k);return c && Math.abs(x-c.x-20*Math.cos(-Math.PI/6))<.01 && Math.abs(y-c.y+10)<.01;})),'no defending center hex is highlighted for reinforcement');
      battle.placement.reinforcementPending=false;battle.placement.reinforcementUnitNames=[];appData.squads.pop();
      // Two separate UI surfaces must identify the CL/39 cannon and mount.
      const tank=JSON.parse(JSON.stringify(SQUAD_TEMPLATES.find(s=>/CL\/39/.test(s.name))));
      tank.hexPos=[5,5];assignUniqueCrewKeys(tank);
      const stored=appData.factions['A.I.R.F.'].crewWeapons;
      appData.factions['A.I.R.F.'].crewWeapons=stored.filter(w=>w.name!=='45-мм 53К танковая');
      const html=mapVehicleFireButtons(tank,0,false);
      check(html.includes('45-мм 53К танковая') && html.includes('Hotchkiss'),'map panel restores cannon and actual MG name from stale catalog');
      check(!html.includes('Стрелковое /'),'no generic vehicle small-arms label');
      appData.factions['A.I.R.F.'].crewWeapons=stored;
      // Immediate minimap lookup must use the record, not stale edit state.
      hexEditorState={hexKey:'1,1'};appData.map.hexKey='2,2';
      check(campaignMiniMapCurrentHex()==='8,12','minimap selects current battle in battle menu');hexEditorState=null;
      const card=document.createElement('div');card.className='card-item selected';document.body.appendChild(card);
      check(getComputedStyle(card).borderTopColor==='rgb(241, 196, 15)','selected cards are yellow');card.remove();
      const tab=document.querySelector('#opPanelTabs button[data-op-side-tab]');
      check(tab && getComputedStyle(tab).writingMode==='vertical-rl','side action caption is vertical');
      // Real ambush editor, no active battle or fake enemy is created.
      appData.currentBattleId=null;appData.campaign.activeBattles=[];
      const ambush={name:'ambush foot',type:'infantry_platoon',faction:'BeVe',col:8,row:12,isAmbush:true,ambushHex:'8,12',squads:[foot('ambush squad')]};
      appData.campaign.opUnits=[ambush];
      TACTICAL_HEX_MAPS['8,12']={w:20,h:20,grid:JSON.parse(JSON.stringify(appData.map.grid))};
      check(openAmbushDeployment(ambush),'arrival opens ambush setup');
      check(hexEditorState?.kind==='ambush' && !appData.currentBattleId,'setup is not a battle');
      check(document.getElementById('hexEditorBanner').textContent.includes('Расстановка засады'),'ambush placement UI shown');
      hexEditClick('4,5');
      check(ambush.ambushDeployment.positions['ambush squad']==='4,5','advance position saved');
      check(finishAmbushDeployment(),'all squads placed, setup confirmed');
      // Trigger a real battle on enemy entry, retaining saved positions/camouflage.
      const enemy={name:'entrant',type:'infantry_platoon',faction:'A.I.R.F.',col:8,row:12,prevCol:7,prevRow:12,movedThisTurn:true,squads:[foot('enemy infantry','A.I.R.F.')]};
      appData.campaign.enemyOpUnits=[enemy];appData.campaign.activeBattles=[];
      appData.campaign.scenario='valencia';appData.campaign.playerFaction='BeVe';
      startTacticalBattle([ambush],[enemy]);
      const ambushSquad=appData.squads.find(s=>s.name==='ambush squad');
      check(ambushSquad?.camouflaged,'triggered ambusher is camouflaged');
      check(getBattleSquadHex(appData.map.grid,appData.squads.indexOf(ambushSquad),false)?.key==='4,5','triggered battle uses saved position');
      check(appData.campaign.activeBattles[0].placement.playerReady,'saved setup does not ask for another deployment');
      // A second real battle includes passengers whose operational position is null.
      appData.currentBattleId=null;appData.campaign.activeBattles=[];
      const vehicles=SQUAD_TEMPLATES.filter(s=>/БТР Llanero/.test(s.name)).slice(0,2).map(s=>JSON.parse(JSON.stringify(s)));
      const carrier={name:'БТР group',type:'btr_platoon',faction:'A.I.R.F.',col:3,row:3,isGroup:true,vehicleList:vehicles,embarkedUnitId:1};
      const passenger={name:'passenger platoon',type:'infantry_platoon',faction:'A.I.R.F.',col:null,row:null,embarkedInBtr:true,squads:[foot('passenger1','A.I.R.F.'),foot('passenger2','A.I.R.F.')]};
      const target={...enemy,name:'opponent',col:3,row:3,prevCol:3,prevRow:3,movedThisTurn:false};
      appData.campaign.playerFaction='A.I.R.F.';appData.campaign.opUnits=[carrier,passenger];appData.campaign.enemyOpUnits=[target];
      startTacticalBattle([carrier],[target]);
      const btrs=appData.squads.filter(s=>/БТР/.test(s.name));
      check(btrs.length===2 && appData.squads.length===4,'two vehicles and two passenger squads survive final roster filtering');
      check(btrs.every(s=>tacticalBtrCanFire(s)),'passengers assigned to different vehicles');
      const mounted=appData.squads[btrs[0].embarkedSquadIndex];mounted.hidden=false;
      check(!tacticalBtrCanFire(btrs[0]) && tacticalBtrCanFire(btrs[1]),'disembark disables only its own BTR gun');
      const armor=btrs[0],before=armor.fighters.reduce((n,f)=>n+f.hp,0);
      currentSquad=appData.map.enemySquads[0];currentSquadIndex=0;appData.map.attackTargetEnemyIdx=appData.squads.indexOf(armor);
      reportAttackOutcome('smallArms',{hits:99,shots:99});
      check(armor.fighters.reduce((n,f)=>n+f.hp,0)===before,'enemy ordinary fire cannot wound friendly armored crew');
    });
    assert.deepEqual(errors, []);
    console.log('PASS browser v13.203: pointer drag/reposition/confirmation, ambush editor + real triggered battle, BTR roster and mount UI, direct armor immunity, minimap and yellow/vertical styles.');
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
