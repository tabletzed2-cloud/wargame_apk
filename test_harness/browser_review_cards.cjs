'use strict';
// DOM integration (no browser binary required): npm install jsdom; NODE_PATH=... node this-file
const assert = require('assert');
const { JSDOM } = require('jsdom');
const { sliceFunction, sliceConst, HTML } = require('./extract');
const dom = new JSDOM('<body><div id="initialCardStageOverlay" style="display:none"></div></body>', { runScripts: 'outside-only', url: 'https://game.example/' });
const w = dom.window;
w.alerts=[]; w.alert = text => w.alerts.push(text);
w.saveData = () => {}; w.log = () => {}; w.redrawOperationalMap = () => {};
w.appData={campaign:{active:true,opSetupStage:'cards',initialPlatoonCardsAssigned:false,initialCardBriefingSeen:true,
  playerFaction:'BeVe',opUnits:[],initialCardDraft:[]}};
w.isCardSelectableOpUnit = unit => unit.type === 'infantry_platoon';
w.getUnitCardFactionContext = () => ({faction:'BeVe'});
w.collectCardLibraryForContext = () => ['Shared','Other','Third'].map(name=>({name,faction:'BeVe',type:'bonus',effect:'test'}));
w.countBattalionBonusCardCopies = () => 0;
for (let i=0;i<4;i++) w.appData.campaign.opUnits.push({name:'Unit '+i,type:'infantry_platoon',squads:[]});
w.appData.campaign.opUnits.push({name:'Mortars',type:'mortar_battery'});
w.eval(sliceConst(HTML,'INITIAL_CAMPAIGN_CARD_CATEGORIES').replace('const ', 'var '));
for(const name of ['escapeCardHtml','cardDraftBonusLimit','saveInitialCampaignCardDraft','openInitialUnitCardMenu',
  'initialCardDistributionHtml','initialCampaignCardUnitHtml','toggleInitialCampaignCard',
  'openInitialCardDistributionStage','beginInitialCardDistribution','minimizeInitialCardDistributionStage',
  'updateInitialCardStageRestoreBar']) w.eval(sliceFunction(HTML,name));
function selectCard(unitIndex,name,checked=true) {
  const input=w.document.querySelector(`[data-unit-index="${unitIndex}"][data-card-name="${name}"]`);
  assert(input); input.checked=checked; w.toggleInitialCampaignCard(input); return input;
}
for(let i=0;i<3;i++) {
  assert(w.openInitialUnitCardMenu(i)); selectCard(i,'Shared'); w.minimizeInitialCardDistributionStage();
}
assert.equal(w.appData.campaign.initialCardDraft.length,3,'single-unit saves preserve previous units');
w.openInitialUnitCardMenu(3);
assert.equal(selectCard(3,'Shared').checked,false,'fourth battalion copy is rejected across hidden draft entries');
assert(w.alerts.at(-1).includes('трижды'));
selectCard(3,'Other'); selectCard(3,'Third');
assert.equal(selectCard(3,'Shared').checked,false,'per-unit limit still enforced');
w.minimizeInitialCardDistributionStage();
w.openInitialCardDistributionStage();
assert.equal(w.document.querySelectorAll('.initial-campaign-card:checked').length,5,'general editor restores all unit choices');
selectCard(1,'Shared',false); w.minimizeInitialCardDistributionStage();
w.openInitialUnitCardMenu(1);
assert(!w.document.querySelector('[data-card-name="Shared"]').checked,'general changes visible in unit editor');
w.minimizeInitialCardDistributionStage();
assert.equal(w.openInitialUnitCardMenu(4),false);
assert.equal(w.alerts.at(-1),'Для этого подразделения бонусы не предусмотрены');
assert(!w.appData.campaign.initialPlatoonCardsAssigned,'unit editor never commits random bonus cards');
// Feedback is visible even after recon dock closes; errors do not silently disappear in a log.
const fs=require('fs'),path=require('path');
const recon=fs.readFileSync(path.join(__dirname,'..','js/recon.js'),'utf8');
w.eval(sliceFunction(recon,'reconMissionFeedback'));
w.reconMissionFeedback('✅ Задача передана',true);
assert.equal(w.document.querySelector('[role="status"]').textContent,'✅ Задача передана');
w.reconMissionFeedback('⛔ Нет маршрута',false);
assert(w.document.getElementById('reconMissionFeedback').classList.contains('error'));
// The actual operational click wrapper opens cards even on a second click of
// an already selected unit, rather than toggling selection or opening orders.
const ui=fs.readFileSync(path.join(__dirname,'..','js/operational_ui.js'),'utf8');
w.state={lastDragAt:0,mapPick:null};
w.campaign=()=>w.appData.campaign; w.units=()=>w.appData.campaign.opUnits;
w.getStage=()=>w.appData.campaign.opSetupStage; w.isOnlineTurn=()=>true;
w.closeCommandMenu=()=>{}; w.closeOpUnitInfoPopup=()=>{};
w.OP_HEX_SIZE=20; w.canvasBackingScale=()=>2;
const canvas=w.document.createElement('canvas'); canvas.id='opMapCanvas'; canvas.width=200;canvas.height=200;
canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});w.document.body.appendChild(canvas);
w.opOwnUnitAtPoint=()=>w.appData.campaign.opUnits[0];
w.handleOpMapClick=()=>{throw Error('ordinary selection should not run in cards phase');};
w.eval(sliceFunction(ui,'patchMapClick'));w.patchMapClick();
w.handleOpMapClick({clientX:50,clientY:50});
assert(w.document.querySelector('[data-initial-card-group="0"]'));
w.minimizeInitialCardDistributionStage();w.handleOpMapClick({clientX:50,clientY:50});
assert.equal(w.document.getElementById('initialCardStageOverlay').style.display,'block');
// Danger painting uses CSS coordinates on a high-DPI backing canvas.
const panel=w.document.createElement('div');panel.id='supplyPanel';panel.style.display='block';w.document.body.appendChild(panel);
w.appData.campaign.opCenters=[{key:'2,2',x:50,y:50}];
w.appData.campaign.supplyDangerHexes=[];w.renderSupplyPanel=()=>{};
w.eval('var supplyDangerPicking=true;');
w.eval(sliceFunction(HTML,'handleSupplyDangerPick'));
w.handleSupplyDangerPick({clientX:50,clientY:50});
assert.equal(w.appData.campaign.supplyDangerHexes.join(','),'2,2');
w.handleSupplyDangerPick({clientX:50,clientY:50});
assert.equal(w.appData.campaign.supplyDangerHexes.length,0);
panel.style.display='none';assert.equal(w.handleSupplyDangerPick({clientX:50,clientY:50}),false);
w.close();
console.log('DOM: per-unit cards ↔ battalion draft, both limits, unsupported unit notice, mission feedback: PASS');
