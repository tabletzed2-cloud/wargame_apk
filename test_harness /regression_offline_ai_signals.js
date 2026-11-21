'use strict';
// Offline enemy signal links should save radios and determine delivery delays.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 0, row: 0 };
const infantry = { name: 'Пехотный взвод на линии', col: 6, row: 0 };
const mobile = { name: 'Подвижный резерв', col: 4, row: 0 };
const campaign = { active: true, online: false, currentTurn: 5, playerFaction: 'BeVe', enemyOpUnits: [hq, infantry, mobile] };
const context = {
  appData: { campaign },
  hardMode: { enemyPhoneLines: [
    { fromName: hq.name, toName: 'Штаб роты', intact: true },
    { fromName: 'Штаб роты', toName: infantry.name, intact: true }
  ] },
  signalEquipmentFor: () => ({ radios: 1, companyRadios: 0, radioRange: 15 }),
  getOpHexDistance: (a, b, x, y) => Math.max(Math.abs(a - x), Math.abs(b - y)),
  log: () => {}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'operational_ai.js'), 'utf8'), context);

assert.equal(context.operationalAIHasEnemyPhoneConnection(hq, infantry), true, 'phone connectivity follows a relay chain');
assert.equal(context.operationalAIHasEnemyPhoneConnection(hq, mobile), false);
const assignments = [
  { unitName: infantry.name, role: 'infantry', strategyId: 'test', objectiveId: 'hold', orderType: 'move', planTarget: { col: 6, row: 0 } },
  { unitName: mobile.name, role: 'mobile', strategyId: 'test', objectiveId: 'maneuver', orderType: 'move', planTarget: { col: 8, row: 0 } }
];
context.operationalAIAllocateRadios(assignments, new Map(), { faction: 'A.I.R.F.', mode: 'main_breakthrough' });
assert.equal(mobile.enemyAI.commandMethod, 'radio', 'radio goes to maneuver unit not already on phone net');
assert.equal(infantry.enemyAI.commandMethod, 'phone');
assert.equal(infantry.enemyAI.commandReadyTurn, campaign.currentTurn, 'phone command is available this turn');

// A cut in the chain removes phone connectivity; with no spare radios, the AI
// falls back to a messenger and accounts for travel distance.
context.hardMode.enemyPhoneLines[1].intact = false;
context.signalEquipmentFor = () => ({ radios: 0, companyRadios: 0, radioRange: 15 });
const updated = [{ ...assignments[0] }];
context.operationalAIAllocateRadios(updated, new Map([[infantry, infantry.enemyAI]]), { faction: 'A.I.R.F.', mode: 'main_breakthrough' });
assert.equal(infantry.enemyAI.commandMethod, 'messenger');
assert.equal(infantry.enemyAI.commandReadyTurn, campaign.currentTurn + 2, 'messenger delay reflects six-hex distance at three hexes per turn');

// A changed destination or order type must create a fresh delivery timer even
// when the objective id and communication method are unchanged.
campaign.currentTurn++;
const retargeted = [{ ...updated[0], targetHex: { col: 9, row: 0 } }];
context.operationalAIAllocateRadios(retargeted, new Map([[infantry, infantry.enemyAI]]), { faction: 'A.I.R.F.', mode: 'main_breakthrough' });
assert.equal(infantry.enemyAI.commandReadyTurn, campaign.currentTurn + 2, 'changed target reissues the command');
campaign.currentTurn++;
const changedOrder = [{ ...retargeted[0], orderType: 'attack' }];
context.operationalAIAllocateRadios(changedOrder, new Map([[infantry, infantry.enemyAI]]), { faction: 'A.I.R.F.', mode: 'main_breakthrough' });
assert.equal(infantry.enemyAI.commandReadyTurn, campaign.currentTurn + 2, 'changed order type reissues the command');

// The operational AI must remain inert if the same campaign state is online.
const assignmentBeforeOnline = infantry.enemyAI;
const positionBeforeOnline = { col: infantry.col, row: infantry.row };
campaign.online = true;
assert.deepEqual({ ...context.processOfflineCampaignAI() }, { moved: 0, fired: 0 });
assert.equal(infantry.enemyAI, assignmentBeforeOnline);
assert.deepEqual({ col: infantry.col, row: infantry.row }, positionBeforeOnline);

console.log('PASS: offline phone graph, radio priority, messenger fallback, and online safety gate.');
