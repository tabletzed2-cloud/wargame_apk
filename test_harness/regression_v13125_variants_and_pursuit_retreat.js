const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const maps = fs.readFileSync(path.join(__dirname, '..', 'js', 'hexmaps.js'), 'utf8');
if (!html.includes('((rawVariantIndex % imgs.length) + imgs.length) % imgs.length')) throw new Error('terrain image variant must wrap to a loaded image');
if (!html.includes('const rawVariantIndex = Number.isFinite(Number(hexData.variant))')) throw new Error('terrain variant must handle invalid saved indices');
const queueAt = html.indexOf('function queueTacticalWithdrawal(');
const queueEnd = html.indexOf('\nfunction retreatFromBattle(', queueAt);
const queue = html.slice(queueAt, queueEnd);
for (const token of ['s.isRouting = true', "s.retreatReason = 'command'", 'processTacticalRouts(\'player\')', 'battle.playerRetreatPending = true']) {
  if (!queue.includes(token)) throw new Error(`manual withdrawal missing ${token}`);
}
const routingAt = html.indexOf('function processTacticalRouts(');
const routingEnd = html.indexOf('\nfunction ', routingAt + 10);
const routing = html.slice(routingAt, routingEnd);
for (const token of ['commandedWithdrawal', 'retreatEdges', 'tacticalRetreatDirection', "? 'command' : 'morale'"]) {
  if (!routing.includes(token)) throw new Error(`tactical pursuit route missing ${token}`);
}
if (!html.includes('ещё движутся к зоне выхода')) throw new Error('battle must remain open during withdrawal');
console.log('v13.125 terrain variant bounds and continued tactical withdrawal: PASS');
