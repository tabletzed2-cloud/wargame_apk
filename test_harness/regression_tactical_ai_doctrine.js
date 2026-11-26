'use strict';
// Adaptive offline tactical doctrine, specialist preservation, fallback,
// breakthrough exit, HQ binocular use, and night illumination.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'tactical_ai.js'), 'utf8');

function unit(name, coords, extra = {}) {
  return { name, hexPos: coords, detected: true, tacticalAP: 2, ammoSmall: 0,
    fighters: [{ hp: 1 }, { hp: 1 }, { hp: 1 }, { hp: 1 }], ...extra };
}
function makeContext({ attackerSide = 'player', own, players, grid, extra = {} }) {
  const appData = { squads: players, map: { attackerSide, grid, enemySquads: [own], mapSize: 4 }, campaign: { online: false }, ...extra };
  const context = {
    appData, currentTurn: 1, console,
    getBattleSquadHex: (_grid, index, enemy) => {
      const squad = (enemy ? appData.map.enemySquads : appData.squads)[index];
      return squad && { key: squad.hexPos.join(','), col: squad.hexPos[0], row: squad.hexPos[1] };
    },
    getTacticalBattleRecord: () => null,
    getTacticalSideAP: squad => Number(squad.tacticalAP) || 0,
    tacticalActionAllowed: () => true,
    spendTacticalSideAP: (squad, amount) => { if (squad.tacticalAP < amount) return false; squad.tacticalAP -= amount; return true; },
    getMovementCost: () => 1,
    getHexNeighbors: key => ({
      '0,2': ['1,2'], '1,2': ['0,2', '2,2', '1,1'], '2,2': ['1,2', '3,2', '2,1'],
      '3,2': ['2,2'], '1,1': ['1,2'], '2,1': ['2,2']
    }[key] || []),
    hexGridDistance: (a, b, x, y) => Math.max(Math.abs(a - x), Math.abs(b - y)),
    tacticalIsHeadquartersSquad: squad => /штаб/i.test(squad.name || ''),
    tacticalIsDotSquad: squad => /дот|дзот|бункер/i.test(squad.name || ''),
    tacticalIsMeleeEngaged: () => false,
    activeSupplyPointKeys: () => [],
    tacticalMaraudingBlocksAction: () => false,
    tacticalMaybeTriggerFireField: () => null,
    tacticalCheckMaraudingOnEntry: () => false,
    tacticalMarkTacticalHexOccupied: () => {},
    tacticalAutoEngageMelee: () => {},
    tacticalBreakCamouflage: () => {},
    tacticalMapEdgeHexKeys: map => Object.keys(map.grid).filter(key => {
      const [c, r] = key.split(',').map(Number); return c === 0 || r === 0 || c >= map.mapSize - 1 || r >= map.mapSize - 1;
    }),
    tacticalRetreatUnit: (squad, side, index, reason) => {
      assert.equal(side, 'enemy'); assert.equal(index, 0);
      squad.isRetreated = true; squad.status = 'retreated'; squad.retreatReason = reason;
      for (const cell of Object.values(appData.map.grid)) cell.enemySquadIds = (cell.enemySquadIds || []).filter(i => i !== index);
      return true;
    },
    spendTacticalSideAP: (squad, amount) => { if (squad.tacticalAP < amount) return false; squad.tacticalAP -= amount; return true; },
    getTacticalCoverMod: type => type === 'cover' ? 2 : 0,
    tacticalSquadsDistance: (a, b) => Math.max(Math.abs(a.hexPos[0] - b.hexPos[0]), Math.abs(a.hexPos[1] - b.hexPos[1])),
    mapActionHasSniper: () => false,
    mapActionCanUseBinoculars: squad => /штаб|развед|OIP/i.test(squad.name || ''),
    getFactionCrewWeapons: () => [],
    log: () => {}, saveData: () => {}, updateUI: () => {}, redrawMap: () => {},
    getTacticalActiveSide: () => 'enemy',
    mapActionAvailableTargetsForSide: () => [],
    ...extra,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/tactical_rules.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/playtest_rules.js'), 'utf8'), context);
  vm.runInContext(source, context);
  return context;
}

// Defenders adapt by role and immediate threat; HQ remains a command/support asset.
{
  const own = unit('Штаб роты', [2, 2]);
  const player = unit('Пехота', [3, 2]);
  const context = makeContext({ own, players: [player], grid: {
    '2,2': { enemySquadIds: [0] }, '3,2': { squadIds: [0] }, '1,2': { type: 'cover' }
  } });
  assert.equal(vm.runInContext('tacticalEnemyAI.squadRole(appData.map.enemySquads[0])', context), 'headquarters');
  player.hexPos = [5, 2];
  assert.equal(vm.runInContext('tacticalEnemyAI.chooseDoctrine(appData.map.enemySquads[0])', context), 'hold');
  const weak = unit('Стрелковое отделение', [2, 2], { currentMorale: 20, tacticalMoraleMax: 100 });
  player.hexPos = [3, 2];
  context.appData.map.enemySquads[0] = weak;
  assert.equal(vm.runInContext('tacticalEnemyAI.chooseDoctrine(appData.map.enemySquads[0])', context), 'fallback');
  const fallback = vm.runInContext('tacticalEnemyAI.movementPlan(appData.map.enemySquads[0], 0)', context);
  assert.equal(fallback && fallback.destination, '1,2', 'weak defender withdraws to a safer supported cover hex');
}

// An attacker in critical shape chooses a safe edge automatically, traverses
// toward it, then exits using the battle's normal retreated-unit bookkeeping.
{
  const own = unit('Штурмовое отделение', [2, 2], {
    fighters: [{ hp: 1 }], tacticalOriginalRosterSize: 6, tacticalAP: 1, currentMorale: 70
  });
  const player = unit('Защитники', [3, 2]);
  const context = makeContext({ attackerSide: 'enemy', own, players: [player], grid: {
    '0,2': {}, '1,2': { type: 'cover' }, '2,2': { enemySquadIds: [0] }, '3,2': { squadIds: [0] }
  } });
  assert.equal(vm.runInContext('tacticalEnemyAI.chooseDoctrine(appData.map.enemySquads[0])', context), 'breakthrough');
  const plan = vm.runInContext('tacticalEnemyAI.movementPlan(appData.map.enemySquads[0], 0)', context);
  assert.equal(plan.exitKey, '0,2');
  assert.equal(plan.destination, '1,2');
  context.appData.map.enemySquads[0].hexPos = [1, 2];
  context.appData.map.grid['1,2'].enemySquadIds = [0];
  context.appData.map.grid['2,2'].enemySquadIds = [];
  context.exitPlan = { path: ['0,2'], doctrine: 'breakthrough', exitKey: '0,2' };
  assert.equal(vm.runInContext('tacticalEnemyAI.moveSquad(appData.map.enemySquads[0], 0, exitPlan)', context), true);
  assert.equal(own.status, 'retreated');
  assert.equal(own.retreatReason, 'breakthrough');
  assert.equal(own.tacticalAIBreakthroughExited, true);
}

// HQ reconnaissance uses the shared binocular action and spends its ordinary AP.
{
  const own = unit('Штаб батальона', [1, 1]);
  own.tacticalAP = 2;
  const hidden = unit('Скрытая цель', [2, 1], { hidden: true, detected: false });
  let used = 0;
  const context = makeContext({ own, players: [hidden], grid: {
    '1,1': { enemySquadIds: [0] }, '2,1': { squadIds: [0] }
  }, extra: {
    mapActionUseBinocularsForSide: (index, key, side) => {
      assert.equal(index, 0); assert.equal(key, '2,1'); assert.equal(side, 'enemy');
      used++; own.tacticalAP = 0; hidden.hidden = false; hidden.detected = true; return true;
    }
  } });
  vm.runInContext('tacticalEnemyAI.runPhase()', context);
  assert.equal(used, 1);
  assert.equal(hidden.detected, true);
}

// An attacker with no spotted target can spend AP to conceal riflemen on
// suitable terrain for an ambush; attacking/moving later reveals them normally.
{
  const own = unit('Штурмовое отделение', [1, 1]);
  own.tacticalAP = 2;
  const context = makeContext({ attackerSide: 'enemy', own, players: [], grid: {
    '1,1': { enemySquadIds: [0], type: 'forest' }
  } });
  assert.equal(vm.runInContext('tacticalEnemyAI.chooseDoctrine(appData.map.enemySquads[0])', context), 'stealth');
  assert.equal(vm.runInContext('tacticalEnemyAI.prepareStealthManeuver(appData.map.enemySquads[0], 0)', context), true);
  assert.equal(own.camouflaged, true);
  assert.equal(own.detected, false);
  assert.equal(own.tacticalAP, 0);
}

// A qualifying suppression card spends its follow-up on a nearby unpinned
// infantry target, not on a duplicate target or vehicle.
{
  const own = unit('Отделение поддержки', [0, 0]);
  const first = unit('Первая цель', [2, 1], { suppressed: true });
  const second = unit('Вторая цель', [2, 2]);
  const vehicle = unit('Бронемашина', [3, 1], { armor: { side: 4 } });
  const context = makeContext({ own, players: [first, second, vehicle], grid: {
    '0,0': { enemySquadIds: [0] }, '2,1': { squadIds: [0] }, '2,2': { squadIds: [1] }, '3,1': { squadIds: [2] }
  }, extra: {
    mapActionCanUseCoordinatedBarrage: () => true,
    tacticalIsDotSquad: squad => /дот/i.test(squad.name || ''),
    markTacticalSuppressed: (squad, side) => { squad.suppressed = true; squad.suppressedBySide = side; },
  } });
  assert.equal(vm.runInContext('tacticalEnemyAI.applyCoordinatedSuppression(appData.map.enemySquads[0], appData.squads[0])', context), true);
  assert.equal(second.suppressed, true);
  assert.equal(second.suppressedBySide, 'enemy');
  assert.equal(vehicle.suppressed, undefined, 'the card follow-up only targets infantry');
}

// A defensive squad uses its existing smoke grenades only when a visible
// threat is close and it can still afford to move afterward.
{
  const own = unit('Стрелковое отделение', [2, 2], { smokeGrenades: 3 }); own.tacticalAP = 4;
  const threat = unit('Противник', [3, 2]);
  let smokeSide = null;
  const context = makeContext({ own, players: [threat], grid: {
    '2,2': { enemySquadIds: [0] }, '3,2': { squadIds: [0] }, '1,2': {}
  }, extra: {
    tacticalCreateSmokeCloud: (_key, side) => { smokeSide = side; return { center: '2,2' }; },
    tacticalSmokeWindDestination: key => key,
    rollD12: () => 12,
  } });
  assert.equal(vm.runInContext('tacticalEnemyAI.deployDefensiveSmoke(appData.map.enemySquads[0], 0)', context), true);
  assert.equal(smokeSide, 'enemy');
  assert.equal(own.smokeGrenades, 0);
  assert.equal(own.tacticalAP, 3);
}

// The shared binocular helper is side-aware, checks normal visibility rules,
// spends enemy AP, and marks a hidden unit discovered at the selected hex.
{
  const observer = unit('Штаб батальона', [1, 1]); observer.tacticalAP = 2;
  const target = unit('Скрытая пехота', [2, 1], { hidden: true, detected: false });
  const context = {
    appData: { squads: [target], map: { grid: { '1,1': { enemySquadIds: [0] }, '2,1': { squadIds: [0] } }, enemySquads: [observer] } },
    currentTurn: 3, window: { tacticalHasLineOfSight: () => true },
    getBattleSquadHex: (_grid, index, enemy) => {
      const squad = (enemy ? context.appData.map.enemySquads : context.appData.squads)[index];
      return { key: squad.hexPos.join(','), col: squad.hexPos[0], row: squad.hexPos[1] };
    },
    tacticalActionAllowed: (_squad, _action, _quiet, options) => options.side === 'enemy' && options.ai,
    getTacticalSideAP: squad => squad.tacticalAP,
    spendTacticalSideAP: (squad, amount) => { squad.tacticalAP -= amount; return true; },
    log: () => {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/tactical_rules.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'map_actions.js'), 'utf8'), context);
  assert.equal(vm.runInContext("mapActionUseBinocularsForSide(0, '2,1', 'enemy')", context), true);
  assert.equal(target.detected, true);
  assert.equal(target.hidden, false);
  assert.equal(observer.tacticalAP, 0);
  assert.ok(context.appData.map.reconRevealedHexes.some(x => x.key === '2,1'));
}

// Night illumination is opportunistic, but withheld when the AI has a hidden
// or camouflaged force whose concealment is more valuable.
{
  const own = unit('Штаб батальона', [1, 1]);
  const hidden = unit('Скрытая цель', [2, 1], { hidden: true, detected: false });
  let fired = 0;
  const context = makeContext({ own, players: [hidden], grid: {
    '1,1': { enemySquadIds: [0] }, '2,1': { squadIds: [0] }
  }, extra: {
    appData: { squads: [hidden], modifiers: [{ name: 'Ночь', active: true }], enemyFlareAvailable: true, enemyFlareTurn: 1,
      map: { attackerSide: 'enemy', grid: { '1,1': { enemySquadIds: [0] }, '2,1': { squadIds: [0] } }, enemySquads: [own] }, campaign: { online: false } },
    enemyFlare: () => { fired++; }
  } });
  assert.equal(vm.runInContext('tacticalEnemyAI.considerEnemyFlare()', context), true);
  assert.equal(fired, 1);
  own.camouflaged = true;
  assert.equal(vm.runInContext('tacticalEnemyAI.considerEnemyFlare()', context), false);
  assert.equal(fired, 1);
}

console.log('PASS: adaptive doctrines, specialist holding, safe fallback, breakthrough exit, HQ binoculars, and conditional night flare.');
