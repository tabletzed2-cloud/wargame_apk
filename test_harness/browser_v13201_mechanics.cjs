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
      const check=(ok,message)=>{if(!ok)throw Error(message);};
      setCampaignTutorialEnabled(false);
      showOnlyAppScreen('battleApp');
      appData.currentBattleId=null;appData.campaign.online=false;appData.campaign.active=false;
      currentTurn=1;TACTICAL_MAP_SIZE=20;
      const setup=(players,enemies)=>{
        appData.squads=players;appData.map={grid:{},centers:[],enemySquads:enemies,mode:'view',baseHexSize:20,zoomLevel:1,activeSide:'player',selectedMoveSquadIdx:0};
        for(let r=0;r<20;r++)for(let c=0;c<20;c++)appData.map.grid[c+','+r]={type:'grass',level:0,squadIds:[],enemySquadIds:[],markers:[]};
        players.forEach((s,i)=>appData.map.grid[s.hexPos.join(',')].squadIds.push(i));
        enemies.forEach((s,i)=>appData.map.grid[s.hexPos.join(',')].enemySquadIds.push(i));
        actionPoints={};players.forEach((s,i)=>ensureAP(i));
        currentSquad=players[0];currentSquadIndex=0;
      };
      const tank=JSON.parse(JSON.stringify(SQUAD_TEMPLATES.find(s=>/Landsverk/.test(s.name))));
      tank.hexPos=[5,10];tank.facing='e';tank.detected=true;
      setup([tank],[]);
      const before=getAP(0);
      vehicleAcquireTarget();
      check(!!appData.map.vehicleAimPick && getAP(0)===before,'aim always enters hex selection without spending AP');
      vehicleAimClickHex('12,10');
      check(tank.vehicleAim.hexKey==='12,10' && getAP(0)===before-VEHICLE_AIM_AP_COST,'empty hex aim spends exactly 1 AP');
      check(tacticalObserverCanSeeHex(tank,'5,10','12,10',false,appData.map),'aim reveals remote hex');
      const coax={sectorRole:'coax'},hull={sectorRole:'bow'},weapon={type:'mg'};
      check(tacticalAimedWeaponBonus(tank,coax,weapon,'12,10')===1,'coax bonus');
      check(tacticalAimedWeaponBonus(tank,hull,weapon,'12,10')===0,'hull never gets aim bonus');
      appData.map.grid['8,10'].type='forest';
      check(!tacticalObserverCanSeeHex(tank,'5,10','12,10',false,appData.map),'aim does not bypass forest LOS');
      appData.map.grid['8,10'].type='grass';
      vehicleSetFacing(tank,'w');check(!tank.vehicleAim,'turn invalidates aim');
      const sapper={name:'Сапёрное отделение',faction:'A.I.R.F.',hexPos:[5,5],detected:true,fighters:[{name:'Сапёр',hp:5,maxHp:5}],thermiteCharges:3,effects:{},tacticalAP:30,baseMorale:100,currentMorale:100};
      const target={name:'Бронетехника',armor:{front:1000,side:1000,rear:1000},faction:'BeVe',hexPos:[6,5],detected:true,fighters:[{name:'Экипаж',hp:5,maxHp:5}],baseMorale:100,currentMorale:100};
      setup([target],[sapper]);appData.map.activeSide='enemy';
      const oldD6=rollD6;rollD6=()=>2;
      try {
        const result=runTacticalAIAction(sapper,0,'thermite');
        check(result.ok && result.spentAP>0,'AI thermite dispatch spends enemy AP: '+JSON.stringify(result));
        check(sapper.thermiteCharges===2 && target.isDestroyed,'AI thermite consumes one charge and destroys PLAYER armor');
        check(appData.map.grid['6,5'].squadIds.length===0,'destroyed player removed from correct side');
      } finally {rollD6=oldD6;}
      const infantry={name:'Пехота',faction:'BeVe',hexPos:[6,5],detected:true,fighters:[{name:'Боец',hp:5,maxHp:5}],baseMorale:100,currentMorale:100};
      sapper.effects={flamethrower:{charges:3}};sapper.tacticalAP=30;
      setup([infantry],[sapper]);appData.map.activeSide='enemy';
      const flame=runTacticalAIAction(sapper,0,'flamethrower');
      check(flame.ok && flame.spentAP>0,'AI ROKS dispatch: '+JSON.stringify(flame));
      check(infantry.fighters[0].hp<5 && sapper.effects.flamethrower.charges===2,'ROKS hurts player and consumes enemy charge');
      check(sapper.fighters[0].hp===5,'ROKS does not damage its own sapper');
      const far={...infantry,hexPos:[10,5],fighters:[{hp:5}]};
      setup([far],[sapper]);appData.map.activeSide='enemy';
      check(!runTacticalAIAction(sapper,0,'flamethrower').ok,'ROKS rejects distant target without spending');
    });
    assert.deepEqual(errors, []);
    console.log('PASS browser v13.201: hex aim/AP/fog, AI thermite and ROKS use the real side-aware action dispatcher.');
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
