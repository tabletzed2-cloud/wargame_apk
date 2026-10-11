'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');
const UI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');

(async () => {
  assert.match(HTML, /var APP_VERSION = 'v13\.085'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8'), /wargame-v13\.085/);
  assert.match(HTML, /src="js\/firebase-offline\.js"/);
  assert.ok(fs.statSync(path.join(ROOT, 'js/firebase-offline.js')).size > 100000);

  // A saved online game must not silently bypass the create/join lobby.
  const lobby = createSandbox(freshAppData());
  lobby.run(`appData.campaign.online = {code:'ABCD',role:'p1'};
    var firebase = {}; var ONLINE = {db:{}, started:true};
    var ONLINE_CONFIG = {firebase:{apiKey:'test',projectId:'test'}};
    function onlineFirebaseReady(){return true;}
    function onlineDiagnostics(){return '';}
    function onlineBody(html){document.getElementById('onlineModalBody').innerHTML=html;}
    function onlineGoToCampaign(){throw Error('unexpected redirect');}`);
  lobby.run(sliceFunction(HTML, 'openOnlineMenu'));
  lobby.run('openOnlineMenu()');
  assert.match(lobby.elements.onlineModalBody.innerHTML, /Создать комнату/);
  assert.match(lobby.elements.onlineModalBody.innerHTML, /Вернуться к текущему матчу/);

  // Async room creation must not listen before the write succeeds.
  const room = createSandbox(freshAppData());
  room.run(`var ONLINE={db:{collection:()=>({doc:()=>({set:()=>Promise.resolve()})})}};
    function onlineGetPlayerId(){return 'p1';}
    function onlineBody(text){document.getElementById('onlineModalBody').innerHTML=text;}
    var listens=0;
    function onlineListen(){listens++;}`);
  for (const fn of ['onlineEscape', 'onlineGenCode', 'onlineLeaveCurrentRoom', 'onlineCreateRoom']) room.run(sliceFunction(HTML, fn));
  room.run('onlineCreateRoom()');
  assert.equal(room.evalCtx('listens'), 0);
  await Promise.resolve();
  assert.equal(room.evalCtx('listens'), 1);

  // Compact commands to one recipient in one turn become a single delivered series.
  const s = createSandbox(freshAppData());
  s.run(`appData.campaign.opUnits=[{name:'HQ',type:'battalion_hq',col:0,row:0},{name:'Infantry',type:'infantry_platoon',col:1,row:1}];
    appData.campaign.selectedOpUnit=appData.campaign.opUnits[1];
    hardMode.enabled=true; hardMode.hqUnitId=0; hardMode.orders=[];
    function createOrder(from,to,type,options){let o={fromUnitId:from,toUnitId:to,type,turnIssued:1,status:'active',...options};hardMode.orders.push(o);return o;}
    function getAllOrdersList(){return hardMode.orders;}
    function renderActiveOrders(){};function redrawOperationalMap(){};
    function getUnplacedOpUnits(){return [];}`);
  s.run("document.readyState='loading';");
  s.run(UI);
  s.run(`opOperationalUiState.draft={category:'fire_at_will',time:'14:00',behavior:'hold'}; opIssueQuickOrder();
    opOperationalUiState.draft={category:'move',mode:'simple',time:'14:10',behavior:'hold',waypoints:[{col:2,row:2}]}; opIssueQuickOrder();`);
  const orders = s.evalCtx('hardMode.orders');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].type, 'series');
  assert.deepEqual(Array.from(orders[0].series, step => step.type), ['fire_at_will', 'move']);
  assert.equal(orders[0].series[1].startTimeMin, 850);
  s.run(`appData.campaign.currentTurn=2;
    opOperationalUiState.draft={category:'fire_at_will',time:'14:20',behavior:'hold'}; opIssueQuickOrder();`);
  assert.equal(s.evalCtx('hardMode.orders.length'), 2, 'new turn starts a new delivery');

  // The series executor routes compact-only steps through standalone logic.
  assert.match(sliceFunction(HTML, 'executeSeriesOrder'), /\['shoot_enemy', 'sector_fire', 'embark', 'prep_positions', 'escort'\]/);
  assert.match(sliceFunction(HTML, 'executeSeriesOrder'), /orderShouldExecuteNow\(currentAction\)/);
  assert.match(UI, /if \(stage === 'orders'\)/); // stage switch handled by the UI module
  assert.match(UI, /positionUnitActions\(\)/);
  assert.match(UI, /scrollTop = scrollTop/);
  console.log('v13.085: online lobby, async room, sequential compact orders, mobile tray and floating controls OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
