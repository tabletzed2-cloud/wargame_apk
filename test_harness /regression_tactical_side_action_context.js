'use strict';
// Side-aware action authorization and AP spending for the shared tactical engine.
const assert = require('node:assert/strict');
const { sliceFunction, HTML } = require('./extract');
const vm = require('node:vm');

const player = { name: 'Игрок', fighters: [{ hp: 2 }], detected: false };
const enemy = { name: 'ИИ', fighters: [{ hp: 2 }], tacticalAP: 6, detected: false };
const context = {
  appData: { squads: [player], currentBattleId: undefined, campaign: { online: false }, map: { activeSide: 'enemy', enemySquads: [enemy], attackTargetEnemyIdx: 0 } },
  getTacticalActiveSide: () => context.appData.map.activeSide,
  getMaxAP: () => 6,
  getAP: idx => context.actionPoints[idx] ? context.actionPoints[idx].ap : 0,
  releaseStaleTacticalMovementLock: () => {},
  __tacticalMovement: null,
  placementPendingReason: () => null,
  tacticalMaraudingBlocksAction: () => false,
  tacticalMoraleIsSuppressed: () => false,
  tacticalSquadIsSuppressed: () => false,
  tacticalIsMeleeEngaged: () => false,
  isBicycleTacticalSquad: () => false,
  isMotorcycleTacticalSquad: () => false,
  pushTacticalUndoSnapshot: () => false,
  updateUI: () => {},
  setTimeout: () => 0,
  actionPoints: [{ ap: 6, maxAp: 6 }],
  __tacticalUndoArmed: false,
  console
};
context.appData.currentBattleId = undefined;
vm.createContext(context);
for (const name of ['tacticalActionAllowed', 'spendAP', 'getTacticalSideAP', 'spendTacticalSideAP']) {
  vm.runInContext(sliceFunction(HTML, name), context);
}

assert.equal(vm.runInContext("tacticalActionAllowed(appData.map.enemySquads[0], 'shoot', true, {side:'enemy', ai:true, targetIndex:0})", context), true);
assert.equal(vm.runInContext("tacticalActionAllowed(appData.map.enemySquads[0], 'shoot', true)", context), false, 'enemy-side authorization is opt-in');
assert.equal(vm.runInContext("tacticalActionAllowed(appData.map.enemySquads[0], 'shoot', true, {side:'enemy', ai:false})", context), false);
assert.equal(vm.runInContext("spendTacticalSideAP(appData.map.enemySquads[0], 2, 'shoot', {side:'enemy', ai:true, targetIndex:0})", context), true);
assert.equal(enemy.tacticalAP, 4);
assert.equal(enemy.detected, true);
assert.equal(vm.runInContext("spendTacticalSideAP(appData.map.enemySquads[0], 5, 'shoot', {side:'enemy', ai:true, targetIndex:0})", context), false);
assert.equal(enemy.tacticalAP, 4, 'failed action does not spend AP');

context.appData.map.activeSide = 'player';
assert.equal(vm.runInContext("spendTacticalSideAP(appData.squads[0], 1, 'utility', {side:'player'})", context), true);
assert.equal(context.actionPoints[0].ap, 5);
context.appData.campaign.online = true;
context.appData.map.activeSide = 'enemy';
assert.equal(vm.runInContext("tacticalActionAllowed(appData.map.enemySquads[0], 'shoot', true, {side:'enemy', ai:true, targetIndex:0})", context), false, 'offline AI authorization is denied online');

console.log('PASS: tactical authorization and AP spending are side-aware, opt-in for enemy AI, and offline-only.');
