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
      appData.campaign={active:false,online:false,opUnits:[],enemyOpUnits:[],activeBattles:[]};
      currentTurn=1;inStandaloneBattle=true;appData._tacticalMoraleStandaloneBattleId='browser206';
      const foot=(name,hp=3)=>({name,faction:'BeVe',opUnitName:'P',fighters:[{name:'Рядовой',hp,maxHp:3,weapon:getFactionWeapons('BeVe')[0].name}],
        effects:{},appliedCards:[],tacticalMoraleScaleVersion:1,tacticalMoraleInitializedBattleId:'browser206',currentMorale:100,baseMorale:100,tacticalMoraleMax:100,hidden:false,detected:true,ammoSmall:10,ammoOrdnance:0,grenades:0});
      const s=foot('Пехотное отделение'),missing=foot('Штаб взвода №1'),hq=foot('Штаб взвода №2');
      appData.squads=[s,missing,hq];
      appData.map={grid:{},enemySquads:[],activeSide:'player',mode:'view',selectedMoveSquadIdx:0,baseHexSize:45,zoomLevel:1};
      for(let r=0;r<20;r++)for(let c=0;c<20;c++)appData.map.grid[c+','+r]={type:'grass',level:0,markers:[],squadIds:[],enemySquadIds:[]};
      appData.map.grid['5,5'].squadIds=[0];appData.map.grid['7,5'].squadIds=[2];
      s.hexPos=[5,5];hq.hexPos=[7,5];currentSquad=s;currentSquadIndex=0;actionPoints={};ensureAP(0);
      s.isRouting=true;s.retreatReason='morale';s.currentMorale=5;s.suppressed=true;
      // Actual generated DOM control, not a direct call to a stubbed executor.
      renderActiveCardButtons();
      const btn=document.querySelector('#specialPanel button[onclick="tacticalRegroupSquadAtHQ()"]');
      check(btn&&btn.disabled,'v13.207: routing squad cannot use HQ rest');
      check(!tacticalRegroupSquadAtHQ(),'routing squad cannot bypass HQ button');
      s.isRouting=false;renderActiveCardButtons();
      check(!document.querySelector('[onclick^="moveSquad("]'),'obsolete movement buttons removed');
      document.querySelector('#specialPanel button[onclick="tacticalRegroupSquadAtHQ()"]').click();
      check(!s.isRouting&&!s.suppressed&&s.currentMorale===50,'HQ click restores suppressed non-routing squad '+JSON.stringify({morale:s.currentMorale,routing:s.isRouting,suppressed:s.suppressed,refusal:__tacticalActionRefusal,info:document.getElementById('mapInfo').textContent,hq:tacticalIsHeadquartersSquad(hq)}));
      check(getBattleSquadHex(appData.map.grid,0,false).key==='7,5','skips unplaced first HQ');
      check(getAP(0)===0,'HQ rest spends remaining AP');
      // Full discovery makes an initially hidden enemy eligible for real target evaluation.
      const enemy=foot('Enemy');enemy.faction='A.I.R.F.';enemy.hidden=true;enemy.detected=false;enemy.firedThisTurn=true;
      enemy.hexPos=[8,5];appData.map.enemySquads=[enemy];appData.map.grid['8,5'].enemySquadIds=[0];
      autoDetectOneSquad(enemy,'enemy');
      check(enemy.detected&&!enemy.hidden,'firing reveal clears both visibility flags');
      const ev=mapActionEvalTarget(mapActionDefById('smallArms'),0,0);
      check(ev.reason!=='не обнаружен','discovered enemy no longer vetoed by hidden flag');
      // Single survivor cannot leave through either player action, no prompt/debit.
      let prompts=0;const oldPrompt=window.prompt;window.prompt=()=>{prompts++;return '1';};
      currentTurn=2;mapBeginAmmoRun();
      check(!s.fighters[0].isAway&&prompts===0,'map UI rejects last survivor before prompt');
      const point={key:'9,5',distance:2};
      check(!tacticalDispatchAmmoRunner(s,s.fighters[0],'player',{key:'7,5'},point,'1'),'shared dispatch rejects last survivor');
      window.prompt=oldPrompt;
      // Last Breath runs from real death/morale handling and is saved as consumed.
      const avenger=foot('Avenger',1),victim=foot('Victim',3);
      avenger.appliedCards=['Длинное дыхание'];avenger.effects.lastBreath=true;
      victim.faction='A.I.R.F.';avenger.hexPos=[7,5];victim.hexPos=[8,5];
      appData.squads=[avenger];appData.map.enemySquads=[victim];appData.map.grid['7,5'].squadIds=[0];appData.map.grid['8,5'].enemySquadIds=[0];
      currentSquad=avenger;currentSquadIndex=0;
      const oldD6=window.rollD6;window.rollD6=()=>6;
      applyDamagePointsToEnemy(avenger,1,{damage:0,killed:[],wounded:[],notes:[]});
      check(avenger.isDestroyed&&victim.fighters[0].hp===2,'death triggers actual revenge damage');
      check(!tacticalResolveLastBreath(avenger)&&victim.fighters[0].hp===2,'cannot repeat revenge');
      const restored=JSON.parse(JSON.stringify(avenger));appData.squads=[restored];
      check(!tacticalResolveLastBreath(restored),'consumed revenge survives serialization');
      let dice=[1,1,6];window.rollD6=()=>dice.shift();
      const fury=foot('Fury');fury.opUnitName='Fury platoon';fury.flemishFury=true;
      const fd=tacticalMeleeRollDamage(fury);check(fd===3&&dice.length===0,'Fury rerolls consecutive ones in live phase resolver '+JSON.stringify({fd,dice,fury,eff:tacticalEffectiveMoraleForSquad(fury)}));
      window.rollD6=oldD6;
      // If the runner's remaining crew mates die meanwhile, the absent
      // survivor cannot operate the gun or spend AP/ammunition remotely.
      const gun=foot('Орудие');gun.opUnitName='gun platoon';gun.ammoOrdnance=5;
      gun.fighters=[{name:'Наводчик',hp:3,maxHp:3,isAway:true},{name:'Заряжающий',hp:0,maxHp:3}];
      const cw=getFactionCrewWeapons('BeVe').find(w=>w.type==='at_gun');check(cw,'canonical AT gun exists');
      gun.crewInstances=[{weaponName:cw.name,uniqueKey:'browser-gun',fighterIndices:[0,1],active:true,deployed:true}];
      appData.squads=[gun];currentSquad=gun;currentSquadIndex=0;actionPoints={};ensureAP(0);appData.map.attackTargetEnemyIdx=0;
      const gunAP=getAP(0);attackOrdnance();
      check(getAP(0)===gunAP&&gun.ammoOrdnance===5,'absent crew cannot fire or consume resources');
      // Actual postbattle overlay buttons with default catalog-style squad names.
      const donor=foot('Пехотное отделение №1 Бельгийцы'),receiver=foot('Пехотное отделение №2 Бельгийцы');
      for(const [i,sq] of [donor,receiver].entries()){
        sq.tacticalOriginalRosterSize=4;sq.fighters=[0,1,2,3].map(k=>({name:'Рядовой '+k,weapon:'rifle',maxHp:3,hp:k<i+1?3:0}));
        sq.effects={adrenaline:{used:i===0}};
      }
      appData.campaign.opUnits=[{name:'P',squads:[donor,receiver],ammoReserve:{small:100}}];
      appData.campaign.lastTacticalBattleReport={battleId:'b',result:'victory',sides:{player:{initial:8,remaining:3,losses:5,squads:[donor,receiver].map(sq=>({name:sq.name,opUnitName:'P',initial:4,remaining:sq.fighters.filter(f=>f.hp>0).length,losses:4-sq.fighters.filter(f=>f.hp>0).length}))},enemy:{initial:1,remaining:0,losses:1,squads:[]}}};
      showTacticalBattleResult();
      const transfer=document.querySelector('#tacticalBattleResultOverlay button[onclick="regroupTacticalBattleSurvivors(0,0,1)"]');
      check(transfer,'manual regroup offered for real numbered names');transfer.click();
      check(donor.fighters.every(f=>f.hp===0)&&receiver.fighters.filter(f=>f.hp>0).length===3,'overlay transfer preserves survivors');
      check(donor.ammoSmall===0&&receiver.ammoSmall===20,'manual regroup conserves finite ammunition');
      closeTacticalBattleResult();
      check(!document.querySelector('[onclick*="showDetectionDialog"]'),'hide action removed from UI');
      check(typeof showDetectionDialog==='undefined'&&typeof executeDetectionCheck==='undefined','manual hide cannot bypass removed UI');
    });
    assert.deepEqual(errors, []);
    console.log('PASS browser v13.206: real HQ/merge buttons, removed movement controls, revealed target eligibility, last-survivor dispatch, automatic Last Breath + serialized consumption, repeated Fury rerolls and removal of manual hide.');
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
