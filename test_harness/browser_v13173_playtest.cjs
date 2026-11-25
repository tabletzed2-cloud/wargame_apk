'use strict';
// npm install jsdom; NODE_PATH=<node_modules containing jsdom> node this-file
const {JSDOM}=require('jsdom');
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {HTML,sliceFunction}=require('./extract');
const dom=new JSDOM('<body><div id="reconPanel"></div><div id="opCampaignFieldStatus" aria-live="polite"></div></body>',
  {runScripts:'outside-only',url:'https://game.example/'});
const w=dom.window;
w.appData={templates:[],campaign:{active:true,currentTurn:1,opUnits:[{
  name:'Штаб батальона',type:'battalion_hq',col:0,row:0,squads:[{name:'Мотоциклист-разведчик',fighters:[{hp:3}]}]
}],enemyOpUnits:[],opCenters:[{key:'2,0',x:100,y:0}],reconMissions:[]}};
w.saveData=()=>{};w.log=()=>{};w.redrawOperationalMap=()=>{};
w.getOpHexTypes=()=>['grass'];
w.getOpHexNeighbors=(col,row)=>[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]].map(([x,y])=>({col:col+x,row:row+y})).filter(p=>p.col>=0&&p.row>=0&&p.col<8&&p.row<8);
w.eval(sliceFunction(HTML,'escapeCardHtml'));
w.eval(fs.readFileSync(path.join(__dirname,'..','js/recon.js'),'utf8'));
w.showReconPanel(true);
assert.equal(w.document.querySelector('select').value,'beve_motorcycle_scout');
assert(w.reconIsPickingRoute());
w.handleReconRouteDraftClick(100,0,40);
assert(w.document.getElementById('reconPanel').textContent.includes('(2,0)'));
assert(w.reconSubmitMission());
assert(w.document.getElementById('reconMissionFeedback').textContent.includes('Задача разведки передана'));
for(const name of ['operationalAmmoSquads','supplyRecipientIconHtml','campaignPrisonerCount','renderCampaignFieldStatus',
  'recordEnemyPrisoners','showCampaignFieldNotice','dismissCampaignFieldNotice'])w.eval(sliceFunction(HTML,name));
const row=w.document.createElement('div');row.innerHTML=w.supplyRecipientIconHtml({name:'САУ',squads:[{icon:'images/SAU.png',fighters:[{hp:3}]}]});
assert.equal(row.querySelector('img').getAttribute('src'),'images/SAU.png');
w.recordEnemyPrisoners({name:'Противник',opUnitName:'Взвод',fighters:[{hp:3},{hp:0},{hp:1}]});
w.recordEnemyPrisoners({name:'Противник',opUnitName:'Взвод',fighters:[{hp:3},{hp:0},{hp:1}]});
assert.equal(w.campaignPrisonerCount(),2);
assert(w.document.getElementById('campaignFieldToast').textContent.includes('Взято в плен: 2'));
assert(w.document.querySelector('.campaign-prisoner-count').textContent.includes('2'));
assert.equal(w.document.querySelectorAll('.campaign-field-notice').length,1);
w.dismissCampaignFieldNotice(w.appData.campaign.fieldNotifications[0].id);
assert.equal(w.document.querySelectorAll('.campaign-field-notice').length,0);
assert.equal(w.campaignPrisonerCount(),2,'dismissing a notice does not erase prisoners');
w.showCampaignFieldNotice('⭕ Наш взвод окружён','encirclement');
assert(w.document.querySelector('.campaign-field-notice').textContent.includes('окружён'));
dom.window.close();
console.log('v13.173 DOM: battalion scout picker/route, dispatch confirmation, recipient icon, prisoner badge and dismissible notices: PASS');
