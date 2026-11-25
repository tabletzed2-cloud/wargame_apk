'use strict';
// NODE_PATH=<modules containing playwright-core and @sparticuz/chromium> node this-file
// Real Chromium: production HTML, scripts, CSS, canvas clicks and rotation buttons.
const {chromium} = require('playwright-core');
const chromiumPackage = require('@sparticuz/chromium');
const portable = chromiumPackage.default || chromiumPackage;
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
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
    await page.evaluate(() => {
      appData.campaign.active = true;
      appData.campaign.online = true;
      appData.campaign.currentTurn = 1;
      appData.campaign.hexOverlays = {};
      appData.campaign.opUnits = [{name:'Rotation test',col:4,row:4,squads:[{name:'Squad',fighters:Array.from({length:16},()=>({hp:3}))}]}];
      appData.currentBattleId = null;
      const grid = {};
      for(let r=0;r<20;r++) for(let c=0;c<20;c++) grid[`${c},${r}`] = {type:'grass',rotation:0,variant:0,squadIds:[],enemySquadIds:[],markers:[]};
      TACTICAL_HEX_MAPS['4,4'] = {grid,w:20,h:20};
      document.getElementById('battleApp').classList.add('online-player-mode');
      beginPendingHexEditDraft('4,4','trenches','Rotation test');
      openHexEditorForBattle('4,4','trenches','Rotation test');
    });
    await page.evaluate(() => closeHexEditor());
    const results = await page.evaluate(() => {
      const checks=[];
      function check(value, name) { if(!value) throw new Error(name); checks.push(name); }
      const camp=appData.campaign;
      // Two units plan on the same operational hex before either finishes.
      camp.pendingHexEdits={}; camp.pendingHexEditDrafts={}; camp.hexOverlays={};
      const unit=camp.opUnits[0];
      camp.opUnits.push({...JSON.parse(JSON.stringify(unit)),name:'Second unit'});
      beginPendingHexEditDraft('4,4','trenches',unit.name);
      openHexEditorForBattle('4,4','trenches',unit.name);
      hexEditClick('0,0'); rotateSelectedHex(60); hexEditClick('1,0'); closeHexEditor();
      beginPendingHexEditDraft('4,4','trenches','Second unit');
      openHexEditorForBattle('4,4','trenches','Second unit');
      hexEditClick('2,0');
      check(pendingHexEditDraft('4,4').cells['2,0']==='trenches','second unit has its own free limit');
      closeHexEditor();
      check(Object.keys(pendingHexEditDraft('4,4',unit.name,'trenches').cells).length===2,'first draft preserved');
      // Simulate a save/reload (no shared object identity between aliases).
      camp.pendingHexEdits=JSON.parse(JSON.stringify(camp.pendingHexEdits));
      camp.pendingHexEditDrafts=JSON.parse(JSON.stringify(camp.pendingHexEditDrafts));
      grantTrenchPoints('4,4',2,unit.name,false);
      check(getHexOverlay('4,4',false).hexRotations['0,0']===60,'first order applies its angle');
      check(!!pendingHexEditDraft('4,4','Second unit','trenches'),'first completion does not consume second draft');
      check(!getHexOverlay('4,4',false).hexEdits['2,0'],'second trench not applied early');
      grantTrenchPoints('4,4',2,'Second unit',false);
      check(getHexOverlay('4,4',false).hexEdits['2,0']==='trenches','second completion applies its own trench');
      check(getHexOverlay('4,4',false).trenchPoints===1,'second unit retains its unused allowance');
      grantTrenchPoints('4,4',2,'Second unit',false);
      check(getHexOverlay('4,4',false).trenchPoints===1,'duplicate completion does not inflate allowance');
      // Real canvas drawing: own noise hidden, enemy noise visible.
      const text=[];
      const ctx=new Proxy({}, {get(_,key) { if(key==='fillText')return value=>text.push(value);return ()=>{}; },set(){return true;}});
      camp.currentTurn=8; camp.opNoiseMarkers=[{col:1,row:1,expiresTurn:8,viewerSide:'enemy'}, {col:2,row:1,expiresTurn:8,viewerSide:'player'}];
      drawOperationalNoiseMarkers(ctx);
      check(text.filter(t=>t==='Шум').length===1,'own operational noise is hidden');
      appData.map.tacticalNoiseMarkers=[{col:1,row:1,expiresTurn:currentTurn,viewerSide:'enemy'},{col:2,row:1,expiresTurn:currentTurn,viewerSide:'player'}];
      appData.map.remoteTacticalNoiseMarkers=[]; text.length=0;
      drawTacticalNoiseMarkers(ctx,45);
      check(text.filter(t=>t==='Шум').length===1,'own tactical noise is hidden');
      recordOperationalShelling('7,9',8); camp.currentTurn=9; text.length=0;
      drawOperationalShellingMarkers(ctx);
      check(text.includes('Обстрел'),'last-turn artillery impact remains visible');
      camp.currentTurn=10; text.length=0; drawOperationalShellingMarkers(ctx);
      check(!text.includes('Обстрел'),'older impact marker expires');
      // Shared layouts include both sides; hidden enemies do not affect geometry.
      appData.squads=[{name:'AA',fighters:[{hp:3}]}];
      appData.map.enemySquads=[{name:'BB',detected:true,fighters:[{hp:3}]},{name:'Hidden',hidden:true}];
      const icons=tacticalCellIconLayout({squadIds:[0],enemySquadIds:[0,1]},100,100,45,'0,0');
      const p=icons.playerPositions[0], e=icons.enemyPositions[0];
      check(icons.enemy.length===1,'hidden enemy excluded from layout');
      check(Math.abs(p.x-e.x)>=icons.iconSize || Math.abs(p.y-e.y)>=icons.iconSize,'opposing tactical icons never overlap');
      camp.opUnits=[{name:'AA',col:7,row:9,squads:[]}];
      camp.enemyOpUnits=[{name:'BB',col:7,row:9,detected:true,squads:[]}];
      camp.opZoomLevel=1;
      const op=operationalUnitIconLayout(45,18);
      check(op.length===2 && (Math.abs(op[0].x-op[1].x)>=1.1*(op[0].radius+op[1].radius) || Math.abs(op[0].y-op[1].y)>=1.1*(op[0].radius+op[1].radius)),'opposing operational icons separated');
      // Two independent originals, stale coordinates, 4 squads: elect same
      // authority on both clients and do not flip it on repeated snapshots.
      ONLINE.role='p1';
      const battle={id:200,hexKey:'6,9',playerUnitNames:['AA'],enemyUnitNames:['BB'],playerSquads:[],enemySquads:[],
        placement:{attackerSide:'player',entryDir:'W',playerReady:false,enemyReady:false},tacticalMap:{grid:{}},phaseRevision:0};
      camp.activeBattles=[battle]; appData.currentBattleId=null;
      const remote={id:100,hexKey:'7,9',myUnitNames:['BB'],oppUnitNames:['AA'],attacker:'me',startedBy:'me',entryDir:'E',
        turn:1,phaseRevision:0,tacticalPhasesCompleted:0,placed:false,status:'active',squads:[],updatedAt:1};
      check(onlineFindLocalBattleByParticipants(remote)===battle,'same battle matched across different hexes');
      check(onlineReconcileBattleAuthority(battle,remote,'p2'),'authority reconciles initial disagreement');
      check(battle.hexKey==='7,9' && battle.placement.attackerSide==='enemy','defender uses shared battle hex and role');
      const legacyMirror={id:300,hexKey:'6,9',onlineMirror:true,onlineOppBattleId:100,
        placement:{attackerSide:'player'},tacticalMap:{grid:{}},phaseRevision:0};
      onlineReconcileBattleAuthority(legacyMirror,remote,'p2');
      check(legacyMirror.hexKey==='7,9' && legacyMirror.placement.attackerSide==='enemy','old mirrored save repairs wrong defender role on first sync');
      const stable=JSON.stringify(battle.onlineAuthority);
      const start=performance.now();
      for(let i=0;i<100;i++) {
        check(!onlineReconcileBattleAuthority(battle,{...remote,hexKey:'6,9',attacker:i%2?'opp':'me'},'p2'),'replayed metadata is stable '+i);
        repairBattleHexAnchor(battle);
      }
      check(stable===JSON.stringify(battle.onlineAuthority) && battle.hexKey==='7,9','stale operational positions cannot move online battle');
      ONLINE.role='p2';
      const inverse={id:100,hexKey:'7,9',placement:{attackerSide:'player',entryDir:'E'},tacticalMap:{grid:{}},phaseRevision:0};
      onlineReconcileBattleAuthority(inverse,{id:200,hexKey:'6,9',attacker:'me',startedBy:'me'},'p1');
      check(inverse.hexKey===battle.hexKey && inverse.onlineAuthority.role===battle.onlineAuthority.role,'both clients elect identical authority');
      ONLINE.role='p1';
      for(let i=0;i<4;i++)remote.squads.push({name:'Vehicle '+i,opUnitName:'BB',fighters:[{name:'Crew',hp:3,maxHp:3}],pos:null,currentMorale:100});
      onlineMergeOppBattle(battle,remote);
      for(let i=0;i<50;i++) {
        const changed=onlineMergeOppBattle(battle,{...remote,updatedAt:i+2});
        check(!changed,'timestamp-only snapshot does not rebuild battle '+i);
      }
      check(battle.enemySquads.length===4,'repeated snapshots never duplicate four squads');
      appData.currentBattleId=battle.id; appData.squads=battle.playerSquads; appData.map=battle.tacticalMap;
      check(campaignMiniMapCurrentHex()==='7,9','defender minimap highlights canonical battle hex');
      ONLINE.docRef={update:()=>Promise.resolve()};
      for(let i=0;i<20;i++) onlineApplyCloudBattles({p2:{battles:{h6_9:{...remote,updatedAt:100+i}}}});
      ONLINE.docRef=null;
      check(camp.activeBattles.length===1 && battle.enemySquads.length===4 && battle.placement.attackerSide==='enemy',
        'full cloud replay does not create another battle, duplicate squads or flip defender');

      check(performance.now()-start<3000,'repeated synchronization bounded in time');
      camp.opUnits[0].col=6; camp.opUnits[0].isInBattle=true;
      check(healBattleFlags()===0 && camp.opUnits[0].isInBattle,'stale position cannot clear participant battle lock');
      check(stepUnitTowardTarget(camp.opUnits[0],8,9)==='battle','unit in battle cannot continue along route');
      const location=camp.opUnits[0].col;
      executeMoveOrder(camp.opUnits[0],{targetHex:'8,9'});
      check(camp.opUnits[0].col===location,'direct movement call respects battle lock');
      appData.currentBattleId=null; camp.activeBattles=[];
      camp.opUnits[0].squads=[{name:'AA squad',fighters:[{name:'Fighter',hp:3,maxHp:3}],ammoSmall:10}];
      camp.enemyOpUnits[0].squads=remote.squads.map(s=>JSON.parse(JSON.stringify(s)));
      const mirror=onlineCreateMirrorBattle(remote,{quiet:true});
      check(!!mirror && mirror.hexKey==='7,9','mirror survives explicit participant with stale operational coordinates');
      check(mirror.playerSquads.length>0 && mirror.enemySquads.length===4,'mirror includes all four enemy squads and local defender');

      const globalLog=document.getElementById('log');
      globalLog.style.display='none';
      log('Preserved entry'); const preserved=globalLog.lastElementChild;
      log('Incremental entry');
      check(preserved.isConnected,'logging preserves existing DOM nodes instead of reparsing');
      for(let i=0;i<610;i++)log('Bounded diagnostic '+i);
      check(globalLog.children.length===600,'global log DOM is bounded');
      return checks.length;
    });
    console.log('PASS: v13.175 browser checks: '+results+' (independent dig orders, noise, mixed-side layouts, impact history, two-client authority and four-squad replay stability)');
  } finally { if (browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(err=>{console.error(err);process.exitCode=1;});
