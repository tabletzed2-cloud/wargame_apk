'use strict';
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('✓ ' + name); } catch (e) { fail++; console.error('✗ ' + name + ' — ' + e.message); } }
function assert(v, message) { if (!v) throw new Error(message || 'assertion failed'); }

// Elevated terrain, not the mere hill terrain class, blocks campaign LOS.
test('operational LOS distinguishes hills, forests, and explicit elevation', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    function getOpHexTypes(c,r) { const cell=appData.campaign.opMapGrid[c+','+r]; return cell && cell.types || ['grass']; }
    appData.campaign.opMapGrid = {'1,0': {types:['hill'], level:0}};
  `);
  s.run(sliceFunction(HTML, 'opLineOfSightBlocked'));
  assert(s.evalCtx('opLineOfSightBlocked(0,0,2,0) === false'), 'ordinary hill must not block LOS');
  s.run(`appData.campaign.opMapGrid['1,0'].level=1;`);
  assert(s.evalCtx('opLineOfSightBlocked(0,0,2,0) === true'), 'raised intermediary must block a lower observer');
  s.run(`appData.campaign.opMapGrid['0,0']={types:['grass'],level:1}; appData.campaign.opMapGrid['1,0']={types:['hill'],level:1};`);
  assert(s.evalCtx('opLineOfSightBlocked(0,0,2,0) === false'), 'same-level hill must not block from elevated observation');
  s.run(`appData.campaign.opMapGrid['1,0']={types:['forest'],level:0}; appData.campaign.opMapGrid['0,0']={types:['grass'],level:0};`);
  assert(s.evalCtx('opLineOfSightBlocked(0,0,2,0) === true'), 'forest blocks at ground level');
  s.run(`appData.campaign.opMapGrid['0,0'].level=1;`);
  assert(s.evalCtx('opLineOfSightBlocked(0,0,2,0) === false'), 'forest below an elevated observer does not block');
  s.run(`appData.campaign.opMapGrid['1,0']={types:['hill'],level:2};`);
  assert(s.evalCtx('opLineOfSightBlocked(0,0,1,0) === false'), 'an elevated target hex itself remains visible');
});

test('company HQ waits only while orders to platoons are undelivered', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'companyRelayDeliveryPending'));
  s.run(`hardMode={orders:[{relayCompanyId:2,status:'delivering'}],pendingOrders:[],messengerQueue:[]};`);
  assert(s.evalCtx('companyRelayDeliveryPending(2) === true'), 'a messenger in transit blocks HQ execution');
  s.run(`hardMode.orders=[{relayCompanyId:2,status:'active'}];`);
  assert(s.evalCtx('companyRelayDeliveryPending(2) === false'), 'once the message arrives the HQ can proceed');
  s.run(`hardMode.orders=[{type:'company_order',toUnitId:2,status:'active',subUnitIds:[4]}];`);
  assert(s.evalCtx('companyRelayDeliveryPending(2) === true'), 'a child still waiting for dispatch blocks HQ execution');
});

test('delivery ETA and execution ETA are independently calculated', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    function getOpTurnMinutes(){return 10;}
    function formatOrderTime(v){return String(v).padStart(4,'0');}
    function estimateOrderMovementTurns(){return 3;}
    function operationalOrderWaitsForDisembark(){return false;}
    appData.campaign.currentTurn=7; appData.campaign.currentTime=100; appData.campaign.opUnits=[{}];
    var order={status:'delivering',deliveryTurnsNeeded:3,deliveryTurnsPassed:1,toUnitId:0,type:'move'};
  `);
  s.run(sliceFunction(HTML, 'getOrderEta'));
  const data = JSON.parse(s.evalCtx('JSON.stringify(getOrderEta(order))'));
  assert(data.deliveryText.includes('0120') && data.deliveryText.includes('ход 9'), 'delivery ETA reflects 2 remaining delivery turns');
  assert(data.text.includes('0140') && data.etaTurn === 11, 'execution ETA includes delivery plus movement');
});

test('series fire waits at the planned endpoint and uses that hex for range', () => {
  const html = read('index.html');
  assert(html.includes('currentAction.expectedFireHex = order.lastSeriesMoveHex'), 'series shoot is tied to completed movement endpoint');
  assert(html.includes('getOpHexDistance(fireOrigin.col, fireOrigin.row, targetCol, targetRow)'), 'shot distance originates at intended final hex');
  assert(html.includes('ожидается прибытие'), 'fire waits until the shooter actually reaches that endpoint');
});

test('tactical fog and binoculars share terrain LOS, and online map editor controls are gated', () => {
  const html = read('index.html');
  const actions = read('js/map_actions.js');
  const css = read('css/operational_ui.css');
  assert(html.includes('window.tacticalHasLineOfSight = tacticalHasLineOfSight'), 'tactical LOS is exposed to action handling');
  assert(html.includes('const elevated=height > eye'), 'only higher intermediate elevations block tactical visibility');
  assert(actions.includes('window.tacticalHasLineOfSight'), 'binoculars reject obstructed sight lines');
  assert(html.includes("ctx.fillStyle = 'rgba(0,0,0,0.40)'"), 'fog is lighter than before');
  assert(css.includes('#battleApp.online-player-mode .online-editor-control'), 'online player cannot use editor-only map actions');
  assert(html.includes('Карточки по взводам') === false, 'platoon card list is generated by placement renderer, not static markup');
  const placement = read('js/placement.js');
  assert(placement.includes('Карточки по взводам') && placement.includes('battleSquadToPlaceWrap'), 'placement frame groups taken cards and contains squad selector');
});

test('v13.110 release markers, selected-unit info, placement feedback, and bicycle deployment are wired', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const sw = read('service-worker.js');
  const css = read('css/operational_ui.css');
  const placement = read('js/placement.js');
  const appVersion = (HTML.match(/var APP_VERSION = '([^']+)'/) || [])[1];
  assert(!!appVersion && manifest.short_name === `БМ ${appVersion}` && sw.includes(`const CACHE_NAME = 'wargame-${appVersion}'`), 'manifest and service-worker cache match application release');
  assert(HTML.includes('showOpUnitInfoPopup(clickedUnit)') && HTML.includes('opUnitInfoPopup'), 'selecting an operational unit shows its info popup');
  assert(HTML.includes('placementSafety.reason') && HTML.includes("setAttribute('role', 'alert')"), 'failed placement clearly explains why without painting unavailable hexes');
  assert(HTML.includes('opDeployDismountSlot') && HTML.includes('Спешен — стоянка при размещении'), 'dismount control is available during deployment and leaves the bike park at placement');
  assert(css.includes('position: fixed !important') && css.includes('op-map-workspace { width: calc(100% - 112px)'), 'communication, supply, and log docks reserve side rails beside the map');
  assert(css.includes('.legacy-menu-exit { display: none !important; }') && HTML.includes("btn.textContent = '🏠'"), 'legacy exits are hidden in favor of the house button');
  assert(HTML.includes('(unit && unit.faction)') && placement.includes('Карточки по взводам'), 'AIRF unit faction fallback and platoon card display are present');
});

console.log(`Итог текущих исправлений: PASS ${pass} · FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
