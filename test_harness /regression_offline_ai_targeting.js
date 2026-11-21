'use strict';
// Operational AI must skip targets it cannot legally or safely engage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let selectedTarget = null;
const context = {
  appData: { campaign: { opUnits: [], enemyOpUnits: [] } },
  opShootingState: { active: false, shooter: null, targets: [], weaponType: null },
  isMediumArtillery: () => false,
  isStaticOpUnit: () => false,
  operationalUnitInTacticalBattle: () => false,
  operationalAIRole: () => 'infantry',
  operationalFireAtWillRange: () => 5,
  operationalAIAmmoAllowsShot: (_unit, target) => target.ammoAvailable !== false,
  isArmoredUnit: unit => !!unit.armored,
  hasAtGunWeapons: () => false,
  hasMgWeapons: () => true,
  getOpHexDistance: (a, b, x, y) => Math.max(Math.abs(a - x), Math.abs(b - y)),
  opLineOfSightBlocked: () => false,
  executeOpShoot: targets => { selectedTarget = targets[0]; context.opShootingState.active = false; context.opShootingState.shooter.firedThisTurn = true; },
  executeOpShootAt: targets => { selectedTarget = targets[0]; context.opShootingState.active = false; context.opShootingState.shooter.firedThisTurn = true; }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'operational_ai.js'), 'utf8'), context);
context.operationalAIAmmoAllowsShot = (_unit, target) => target.ammoAvailable !== false;

const shooter = { name: 'Пехотный взвод', col: 0, row: 0, fighters: [{}] };
const nearestArmor = { name: 'Танк', col: 1, row: 0, armored: true };
const fartherInfantry = { name: 'Пехота', col: 2, row: 0 };
assert.equal(context.operationalAIEngage(shooter, [nearestArmor, fartherInfantry]), true);
assert.equal(selectedTarget, fartherInfantry, 'without an anti-tank weapon, skip the nearer armored unit');

shooter.firedThisTurn = false;
selectedTarget = null;
const dryNearest = { name: 'Ближний отряд', col: 1, row: 0, ammoAvailable: false };
const suppliedFarther = { name: 'Отряд с боеприпасами', col: 3, row: 0, ammoAvailable: true };
assert.equal(context.operationalAIEngage(shooter, [dryNearest, suppliedFarther]), true);
assert.equal(selectedTarget, suppliedFarther, 'preserve ammunition and use a farther valid target instead');

console.log('PASS: operational targeting skips incompatible and ammo-starved nearest targets.');
