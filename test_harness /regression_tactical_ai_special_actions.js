'use strict';
// Verify special-weapon targeting and closing into infantry melee use legal targets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'tactical_ai.js'), 'utf8');

function makeSelectionContext(actionId, distance, target, weapon = null) {
  const shooter = {
    name: 'ИИ-отряд', faction: 'A.I.R.F.', detected: true, ammoSmall: 12,
    ammoOrdnance: 3, grenades: 2, atRifleGrenades: 1,
    fighters: [{ hp: 2 }], armor: null,
    crewInstances: weapon ? [{ weaponName: weapon.name, active: true, deployed: true, fighterIndices: [0] }] : []
  };
  const context = {
    appData: { squads: [target], map: { enemySquads: [shooter], grid: {} } },
    tacticalIsDotSquad: () => false,
    getFactionCrewWeapons: () => weapon ? [weapon] : [],
    mapActionHasSniper: () => false,
    mapActionAvailableTargetsForSide: (_index, id, _extra, side) =>
      side === 'enemy' && id === actionId ? [{ squad: target, idx: 0, evaluation: { ok: true, dist: distance } }] : [],
    tacticalSquadsDistance: () => distance,
    tacticalIsHeadquartersSquad: () => false,
    tacticalIsMeleeEngaged: () => false,
    getTacticalCrewWeaponRange: w => Number(w.effectiveRange || 99),
    getWeaponShotCount: () => 0,
    getWeaponMaxShots: () => 3,
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, shooter };
}

const vehicle = { name: 'Бронемашина', detected: true, armor: { side: 10 }, fighters: [{ hp: 2 }] };
for (const [id, range, weapon] of [
  ['satchel', 1, null],
  ['atGrenade', 2, null],
  ['molotovCrew', 3, { name: 'Бутылкомёт', type: 'mortar', isMolotov: true, effectiveRange: 3 }],
  ['ampulomet', 6, { name: 'Ампуломёт', type: 'mortar', isAmpulomet: true, effectiveRange: 8 }],
]) {
  const { context } = makeSelectionContext(id, range, vehicle, weapon);
  const shot = vm.runInContext('tacticalEnemyAI.selectShot(appData.map.enemySquads[0], 0)', context);
  assert.equal(shot && shot.id, id, `${id} should be considered against a legal vehicle target`);
  if (id === 'satchel') assert.equal(shot.extra, 2, 'satchel charges are bounded by available grenades');
}

const infantry = { name: 'Пехота', detected: true, fighters: [{ hp: 2 }] };
{
  const { context } = makeSelectionContext('melee', 0, infantry);
  const shot = vm.runInContext('tacticalEnemyAI.selectShot(appData.map.enemySquads[0], 0)', context);
  assert.equal(shot && shot.id, 'melee', 'melee is selected only for same-hex infantry contact');
}

// A reachable visible infantry target occupies the destination; the movement
// planner may enter that hex to trigger the game's normal automatic melee hook.
{
  const enemy = { name: 'ИИ-пехота', detected: true, fighters: [{ hp: 2 }], tacticalAP: 2, hexPos: [0, 0] };
  const player = { name: 'Целевая пехота', detected: true, fighters: [{ hp: 2 }], hexPos: [1, 0] };
  const grid = { '0,0': { enemySquadIds: [0] }, '1,0': { squadIds: [0] }, '0,1': {} };
  const context = {
    appData: { squads: [player], campaign: { online: false }, map: { grid, enemySquads: [enemy] } },
    getBattleSquadHex: (_grid, index, isEnemy) => {
      const unit = (isEnemy ? context.appData.map.enemySquads : context.appData.squads)[index];
      return unit && { key: unit.hexPos.join(','), col: unit.hexPos[0], row: unit.hexPos[1] };
    },
    getTacticalSideAP: () => 2,
    tacticalActionAllowed: () => true,
    getMovementCost: () => 1,
    getHexNeighbors: key => key === '0,0' ? ['1,0', '0,1'] : key === '0,1' ? ['0,0'] : ['0,0'],
    hexGridDistance: (a, b, x, y) => Math.max(Math.abs(a - x), Math.abs(b - y)),
    tacticalSquadsDistance: (a, b) => Math.max(Math.abs(a.hexPos[0] - b.hexPos[0]), Math.abs(a.hexPos[1] - b.hexPos[1])),
    tacticalIsDotSquad: () => false,
    tacticalActionAllowed: () => true,
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const plan = vm.runInContext('tacticalEnemyAI.movementPlan(appData.map.enemySquads[0], 0)', context);
  assert.equal(plan && plan.destination, '1,0', 'AI can close into a sole visible infantry target to enter melee');
}
console.log('PASS: special anti-vehicle actions, same-hex melee selection, and melee-closing movement are available.');
