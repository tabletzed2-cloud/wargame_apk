const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(source.includes('Number(squad.visionRange) || 6'), 'tactical sight fallback must be six hexes');
assert(source.includes('getOpHexDistance(observer.col, observer.row, unit.col, unit.row) <= 3'), 'operational sight radius must be three hexes');
assert(source.includes("workspace.className = 'op-map-workspace'") && source.includes('op-right-open'), 'non-overlay side-panel workspace must be initialized');
assert(source.includes('unitName}</strong> — ${typeLabel}'), 'order row must lead with recipient before order type');
assert(source.includes('через штаб роты'), 'company relay must be secondary information');
assert(source.includes('function toggleUxActionBar()') && source.includes('uxActionBarCollapsed ? \'none\' : \'flex\''), 'selected-unit action card must be collapsible');

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
console.log('Operational UI panels, sight radii, recipient-first order list and expiry: PASS');
