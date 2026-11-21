'use strict';
// Shared attack-result application must route damage/statuses to the opposing side.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const playerTarget = { name: 'Пехота игрока', fighters: [{ name: 'Боец игрока', hp: 2, maxHp: 2 }] };
const enemyShooter = { name: 'Пехота ИИ', fighters: [{ name: 'Боец ИИ', hp: 2, maxHp: 2 }] };
const context = {
  appData: { squads: [playerTarget], map: { grid: {}, enemySquads: [enemyShooter], attackTargetEnemyIdx: 0 } },
  currentSquad: enemyShooter,
  currentSquadIndex: 0,
  currentTurn: 1,
  mapActionInfo: () => {},
  log: () => {},
  getBattleSquadHex: (_grid, idx, enemySide) => {
    const squad = (enemySide ? context.appData.map.enemySquads : context.appData.squads)[idx];
    return squad ? { key: squad.hexPos.join(','), col: squad.hexPos[0], row: squad.hexPos[1] } : null;
  },
  tacticalSmokeBlocksSight: () => false,
  tacticalAreaOccupantsAtTarget: (_shooter, idx) => [context.appData.squads[idx]],
  tacticalApplyFighterMoraleLoss: () => {},
  tacticalMaybeAutoRetreat: () => false,
  tacticalClearMeleeEngagement: () => {},
  markTacticalSuppressed: (squad, bySide) => { squad.suppressed = true; squad.suppressedBySide = bySide; },
  getTacticalBattleRecord: () => null,
  saveData: () => {},
  console
};
playerTarget.hexPos = [1, 1];
enemyShooter.hexPos = [1, 3];
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'map_actions.js'), 'utf8'), context);

const outcome = vm.runInContext("reportAttackOutcome('smallArms', {hits:1, shots:1})", context);
assert.equal(playerTarget.fighters[0].hp, 1, 'enemy-side results damage the player target');
assert.equal(outcome.target, 'Пехота игрока');
assert.equal(outcome.damage, 1);

vm.runInContext("reportAttackOutcome('suppressiveFire', {hits:0, shots:1})", context);
assert.equal(playerTarget.suppressed, true);
assert.equal(playerTarget.suppressedBySide, 'enemy', 'suppression owner follows the shooter side');

context.currentSquad = playerTarget;
context.currentSquadIndex = 0;
vm.runInContext("reportAttackOutcome('smallArms', {hits:1, shots:1})", context);
assert.equal(enemyShooter.fighters[0].hp, 1, 'the legacy player -> enemy direction still resolves normally');

console.log('PASS: shared attack outcomes apply both directions and preserve attacker-side suppression metadata.');
