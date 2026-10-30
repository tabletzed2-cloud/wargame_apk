const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(source.includes('Number(squad.visionRange) || 6'), 'tactical sight fallback must be six hexes');
assert(source.includes('getOpHexDistance(observer.col, observer.row, unit.col, unit.row) <= visionRange') && source.includes("? 1 : 3"), 'operational sight radius is three hexes by day and one at night');
assert(source.includes("workspace.className = 'op-map-workspace'") && source.includes('op-right-open'), 'non-overlay side-panel workspace must be initialized');
const operationalCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'operational_ui.css'), 'utf8');
assert(operationalCss.includes('.op-panel-tabs') && operationalCss.includes('position: fixed') && operationalCss.includes('width: calc(100% - 104px)'), 'side controls must stay fixed at screen edges while drawers reserve map space');
assert(source.includes('entry.unitName}</strong> — ${entry.typeLabel}') || source.includes('unitName}</strong> — ${typeLabel}'), 'order row must lead with recipient before order type');
assert(source.includes('через штаб роты'), 'company relay must be secondary information');
assert(source.includes('Ожидаемое время выполнения: ${eta.text}') && source.includes('ожидается к ${formatOrderTime(etaTime)}'), 'order rows must prominently show an expected execution clock time');
assert(source.includes('function toggleUxActionBar()') && source.includes('uxActionBarCollapsed ? \'none\' : \'flex\''), 'selected-unit action card must be collapsible');
assert(source.includes('Недоступные клетки не выделяем вообще') && source.includes('if (hardBlocked || unsafeForSelected) continue;'), 'unsafe setup hexes must be omitted, not marked with crosses');
assert(source.includes('initialCardBriefingHtml()') && source.includes('initialCardBriefingSeen') && source.includes('beginInitialCardDistribution()'), 'card memo must be acknowledged before showing the distribution controls');
assert(source.includes('🃏 Памятка перед распределением карт'), 'pre-distribution memo title missing');

const fnStart = source.indexOf('function getAllOrdersList()');
const fnEnd = source.indexOf('\n// ⚡ v13.064: один операционный ход', fnStart);
assert(fnStart >= 0 && fnEnd > fnStart, 'order queue helper block not found');
const helperBlock = source.slice(fnStart, fnEnd);
const journal = [{ id:'journal-record' }];
const ctx = {
  hardMode: {
    messengerQueue: [{ id:'done', status:'completed' }, { id:'pending', status:'pending' }],
    pendingOrders: [], orders: []
  },
  appData: { campaign: { currentTurn: 5, orderJournal: journal } },
  currentTurn: 5, Number, Array
};
vm.runInNewContext(helperBlock, ctx);
ctx.stampCompletedOrderTurns();
assert(ctx.hardMode.messengerQueue[0].completedTurn === 5, 'completion turn should be stamped when the order completes');
ctx.appData.campaign.currentTurn = 6;
ctx.pruneExpiredCompletedOrders();
assert(ctx.hardMode.messengerQueue.some(o => o.id === 'done'), 'completed order must remain for the following full turn');
ctx.appData.campaign.currentTurn = 7;
ctx.pruneExpiredCompletedOrders();
assert(!ctx.hardMode.messengerQueue.some(o => o.id === 'done'), 'completed order should be removed after the extra turn');
assert(ctx.hardMode.messengerQueue.some(o => o.id === 'pending'), 'active orders must not be pruned');
assert(ctx.appData.campaign.orderJournal === journal && journal.length === 1, 'pruning must preserve the order journal');

const etaStart = source.indexOf('function getOpTurnMinutes()');
const etaEnd = source.indexOf('\n// ⚡ v13.064: приказ «через штаб роты»', etaStart);
assert(etaStart >= 0 && etaEnd > etaStart, 'ETA helper block not found');
const etaCtx = {
  appData: { campaign: { currentTurn: 3, currentTime: 14 * 60, opUnits: [{ col:0, row:0, maxAp:4 }] } },
  Number, Math,
  formatTime: minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
  orderStartDelayMinutes: (order, at) => ((Number(order.startTimeMin) - at) % 1440 + 1440) % 1440,
  operationalOrderWaitsForDisembark: () => false,
  isVehicleMobilityUnit: unit => !!unit && (unit.type === 'vehicle' || unit.type === 'tank_platoon' || unit.type === 'btr_platoon'),
  buildOrderRoute: (unit, waypoints) => ({ route: Array.from({ length: Math.max(0, waypoints[0].col - unit.col) }, (_, i) => ({ col: unit.col + i + 1, row: unit.row })), target: waypoints[0] }),
  getOpMoveCost: () => 1
};
vm.runInNewContext(source.slice(etaStart, etaEnd), etaCtx);
const activeEta = etaCtx.getOrderEta({ status:'active', toUnitId:0 });
assert(activeEta.etaTime === 14 * 60 + 10 && activeEta.etaTurn === 4 && activeEta.text.includes('14:10'), 'active order ETA should identify clock time and turn');
const movementEta = etaCtx.getOrderEta({ status:'active', type:'move', toUnitId:0, targetHex:'5,0' });
assert(movementEta.etaTime === 14 * 60 + 20 && movementEta.etaTurn === 5, 'long movement ETA should include AP turns needed to reach its target');
const messengerEta = etaCtx.getOrderEta({ status:'delivering', toUnitId:0, deliveryTurnsNeeded:3, deliveryTurnsPassed:1 });
assert(messengerEta.etaTime === 14 * 60 + 20 && messengerEta.etaTurn === 5, 'messenger delivery ETA should include remaining delivery turns');
const scheduledEta = etaCtx.getOrderEta({ status:'active', toUnitId:0, startTimeMin:15 * 60 });
assert(scheduledEta.etaTime === 15 * 60 && scheduledEta.text.includes('15:00'), 'time-scheduled order ETA should reflect its assigned clock time');
console.log('Operational UI panels, sight radii, recipient-first order list, expiry, and order ETA: PASS');
