'use strict';
// Shared tactical target validation must work symmetrically for the offline AI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const player = { name: 'Игрок', detected: true, fighters: [{ hp: 2 }] };
const enemy = { name: 'Противник', detected: true, fighters: [{ hp: 2 }] };
const context = {
  appData: { squads: [player], map: { grid: {}, enemySquads: [enemy] } },
  mapActionSquadsForSide: undefined,
  mapActionEnemyAlive: undefined,
  mapActionEnemyIsVehicle: () => false,
  mapActionEnemyIsDot: () => false,
  getBattleSquadHex: (_grid, idx, isEnemy) => {
    const squad = (isEnemy ? context.appData.map.enemySquads : context.appData.squads)[idx];
    return squad ? { key: squad.hexPos.join(','), col: squad.hexPos[0], row: squad.hexPos[1] } : null;
  },
  getTacticalCoverInfoForEnemy: () => ({ mod: 0, side: 'enemy' }),
  getTacticalCoverInfoForSquad: (_grid, _idx, side) => ({ mod: 0, side }),
  tacticalSmokeBlocksSight: () => false,
  tacticalIsMeleeEngaged: () => false,
  hexGridDistance: (ac, ar, bc, br) => Math.max(Math.abs(ac - bc), Math.abs(ar - br)),
  mapActionDotCrewIndices: () => [],
  smallArmsBlockedByForest: (_grid, _s, _t, side) => { context.forestSide = side; return null; },
  console,
  appDataPlaceholder: null
};
context.appData.squads[0].hexPos = [2, 2];
context.appData.map.enemySquads[0].hexPos = [2, 4];
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'map_actions.js'), 'utf8'), context);

const evaluated = vm.runInContext("mapActionEvalTarget({id:'smallArms',targets:'any',small:true},0,0,null,'enemy')", context);
assert.equal(evaluated.ok, true, evaluated.reason);
assert.equal(evaluated.dist, 2);
assert.equal(evaluated.cover.side, 'player', 'enemy shots use the player target’s terrain cover');
assert.equal(context.forestSide, 'enemy', 'forest depth is evaluated from the enemy shooter’s side');
assert.equal(vm.runInContext("mapActionSideOfSquad(appData.map.enemySquads[0])", context), 'enemy');
assert.equal(vm.runInContext("mapActionSideOfSquad(appData.squads[0])", context), 'player');
assert.equal(vm.runInContext("mapActionAvailableTargetsForSide(0,'smallArms',null,'enemy').length", context), 1);
assert.equal(vm.runInContext("mapActionAvailableTargetsForSide(0,'smallArms',null,'enemy')[0].squad.name", context), 'Игрок');

// Existing callers omit shooterSide and retain the player -> enemy default.
const playerEval = vm.runInContext("mapActionEvalTarget({id:'smallArms',targets:'any',small:true},0,0)", context);
assert.equal(playerEval.ok, true, playerEval.reason);
assert.equal(playerEval.cover.side, 'enemy');
assert.equal(context.forestSide, 'player');

console.log('PASS: shared tactical target evaluation is symmetric and legacy player defaults are unchanged.');
