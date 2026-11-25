'use strict';
// Offline tactical phase orchestration: shared shots run, AP is respected, online is excluded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const target = { name: 'Цель', detected: true, fighters: [{ hp: 2 }] , hexPos: [3, 2] };
const shooter = { name: 'ИИ-пехота', faction: 'A.I.R.F.', detected: true, ammoSmall: 10, tacticalAP: 4,
  fighters: [{ hp: 2, weapon: 'Винтовка' }], hexPos: [1, 2] };
let delayed = null;
const context = {
  appData: { squads: [target], map: { grid: { '1,2': { enemySquadIds: [0] }, '3,2': { squadIds: [0] } }, enemySquads: [shooter], activeSide: 'enemy' }, campaign: { online: false } },
  currentTurn: 1,
  getBattleSquadHex: (grid, idx, isEnemy) => {
    const squad = (isEnemy ? context.appData.map.enemySquads : context.appData.squads)[idx];
    return squad && { key: squad.hexPos.join(','), col: squad.hexPos[0], row: squad.hexPos[1] };
  },
  getTacticalActiveSide: () => context.appData.map.activeSide,
  getTacticalBattleRecord: () => null,
  hexGridDistance: (a, b, x, y) => Math.max(Math.abs(a - x), Math.abs(b - y)),
  getTacticalSideAP: squad => squad.tacticalAP,
  tacticalIsDotSquad: () => false,
  getFactionCrewWeapons: () => [],
  mapActionHasSniper: () => false,
  mapActionAvailableTargetsForSide: (idx, id, extra, side) => side === 'enemy' && id === 'smallArms'
    ? [{ squad: target, idx: 0, evaluation: { ok: true, dist: 2 } }] : [],
  tacticalSquadsDistance: () => 2,
  tacticalIsHeadquartersSquad: () => false,
  tacticalIsMeleeEngaged: () => false,
  mapActionSideOfSquad: squad => squad === shooter ? 'enemy' : 'player',
  tacticalActionAllowed: () => true,
  tacticalMoraleIsSuppressed: () => false,
  tacticalMaraudingBlocksAction: () => false,
  runTacticalAIAction: (squad, targetIndex, id) => {
    context.calls.push({ squad: squad.name, targetIndex, id });
    squad.tacticalAP -= 2;
    return { ok: true, spentAP: 2, outcome: { kind: id } };
  },
  calls: [],
  log: () => {},
  saveData: () => {},
  updateUI: () => {},
  redrawMap: () => {},
  setTimeout: fn => { delayed = fn; return 1; },
  nextTurn: () => { context.turnAdvances++; },
  turnAdvances: 0,
  console
};
vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/tactical_rules.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'tactical_ai.js'), 'utf8'), context);

const stats = vm.runInContext('tacticalEnemyAI.runPhase()', context);
assert.equal(stats.attacks, 2, 'AI uses available AP for two legal shared attacks');
assert.equal(context.calls.length, 2);
assert.ok(context.calls.every(call => call.id === 'smallArms' && call.targetIndex === 0));
assert.equal(shooter.tacticalAP, 0);

shooter.tacticalAP = 4;
context.appData.map.activeSide = 'enemy';
assert.equal(vm.runInContext('tacticalEnemyAI.schedulePhase()', context), true);
assert.equal(vm.runInContext('tacticalEnemyAI.isPhaseRunning()', context), true);
delayed();
assert.equal(context.turnAdvances, 1, 'scheduled enemy phase hands control back after finishing');
assert.equal(vm.runInContext('tacticalEnemyAI.isPhaseRunning()', context), false);

context.appData.campaign.online = true;
assert.equal(vm.runInContext('tacticalEnemyAI.schedulePhase()', context), false, 'online battles are never automated');
console.log('PASS: tactical AI executes a complete offline enemy phase and never takes online control.');
