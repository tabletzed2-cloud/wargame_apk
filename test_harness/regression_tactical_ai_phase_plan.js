'use strict';
// The enemy plans the phase collectively: pick a meaningful shared target,
// split mobile squads into distinct assault/flank lanes, and reserve specialists.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'tactical_ai.js'), 'utf8');

const attackers = [
  { name: 'Стрелковое отделение 1', faction: 'A.I.R.F.', hexPos: [1, 2], tacticalAP: 4, ammoSmall: 8, fighters: [{ hp: 1 }, { hp: 1 }] },
  { name: 'Стрелковое отделение 2', faction: 'A.I.R.F.', hexPos: [1, 3], tacticalAP: 4, ammoSmall: 8, fighters: [{ hp: 1 }, { hp: 1 }] },
  { name: 'Пулемётный расчёт', faction: 'A.I.R.F.', hexPos: [0, 2], tacticalAP: 4, ammoSmall: 8, fighters: [{ hp: 1 }, { hp: 1 }] },
];
const defenders = [
  { name: 'Штаб роты', faction: 'BeVe', hexPos: [4, 2], detected: true, fighters: [{ hp: 1 }, { hp: 1 }] },
  { name: 'Пехота', faction: 'BeVe', hexPos: [4, 4], detected: true, fighters: [{ hp: 1 }, { hp: 1 }] },
];
const grid = {};
for (const key of ['0,2', '1,2', '1,3', '2,2', '2,3', '3,2', '3,3', '4,1', '4,2', '4,3', '4,4', '5,1', '5,2']) grid[key] = {};
grid['0,2'].enemySquadIds = [2];
grid['1,2'].enemySquadIds = [0];
grid['1,3'].enemySquadIds = [1];
grid['4,2'].squadIds = [0];
grid['4,4'].squadIds = [1];
grid['3,2'].type = 'forest';
grid['4,1'].type = 'cover';
const context = {
  appData: { squads: defenders, map: { grid, mapSize: 8, attackerSide: 'enemy', enemySquads: attackers } },
  tacticalIsHeadquartersSquad: squad => /штаб/i.test(squad.name || ''),
  tacticalIsDotSquad: squad => /дот|дзот|бункер/i.test(squad.name || ''),
  mapActionHasSniper: () => false,
  getFactionCrewWeapons: () => [],
  getBattleSquadHex: (_grid, index, enemySide) => {
    const squad = (enemySide ? context.appData.map.enemySquads : context.appData.squads)[index];
    return squad && { key: squad.hexPos.join(','), col: squad.hexPos[0], row: squad.hexPos[1] };
  },
  getTacticalBattleRecord: () => null,
  hexGridDistance: (a, b, x, y) => Math.max(Math.abs(a - x), Math.abs(b - y)),
  getHexNeighbors: key => ({
    '4,2': ['3,2', '4,1', '4,3', '5,2'],
    '3,2': ['2,2', '3,3', '4,2'], '4,1': ['3,2', '5,1', '4,2'],
    '4,3': ['3,3', '4,2'], '5,2': ['4,2'],
  }[key] || []),
  getTacticalCoverMod: type => type === 'cover' ? 2 : (type === 'forest' ? 1 : 0),
  tacticalSquadsDistance: (a, b) => Math.max(Math.abs(a.hexPos[0] - b.hexPos[0]), Math.abs(a.hexPos[1] - b.hexPos[1])),
  console,
};
vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/tactical_rules.js'), 'utf8'), context);
vm.runInContext(source, context);
const plan = vm.runInContext('tacticalEnemyAI.buildPhasePlan(appData.map.enemySquads)', context);
assert.equal(plan.attacking, true);
assert.equal(plan.focusTargetIndex, 0, 'the company HQ is the shared priority target');
assert.equal(plan.maneuver, 'assault-and-flank');
assert.deepEqual(
  [plan.assignments[0].doctrine, plan.assignments[1].doctrine, plan.assignments[2].doctrine],
  ['assault', 'encircle', 'support'],
  'mobile squads get maneuver lanes while the machine-gun crew supports'
);
assert.ok(plan.assignments[0].goalKey && plan.assignments[1].goalKey);
assert.notEqual(plan.assignments[0].goalKey, plan.assignments[1].goalKey, 'the assault and flank do not converge on one approach hex');
const assaultGoal = plan.assignments[0].goalKey.split(',').map(Number);
const flankGoal = plan.assignments[1].goalKey.split(',').map(Number);
assert.equal(context.hexGridDistance(...assaultGoal, 4, 2), 1, 'assault takes the direct contact approach');
assert.equal(context.hexGridDistance(...flankGoal, 4, 2), 2, 'flank group first moves to a wider outer approach lane');
assert.equal(plan.assignments[2].goalKey, null, 'the support weapon crew is not sent into the assault');
console.log('PASS: phase plan selects a shared high-value objective and assigns separate assault, flank, and support tasks.');
