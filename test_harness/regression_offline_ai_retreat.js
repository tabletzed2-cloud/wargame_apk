'use strict';
// Focused regression coverage for BeVe defensive withdrawal decisions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {
  appData: { campaign: { currentTurn: 4, enemyOpUnits: [], opUnits: [] } },
  operationalAmmoSquads: unit => unit.squads || [],
  getOperationalMorale: unit => unit.operationalMorale,
  isOperationalMoraleUnit: () => true,
  isArmoredUnit: () => false,
  isStaticOpUnit: () => false,
  hasAtGunWeapons: () => false,
  operationalUnitInTacticalBattle: () => false,
  getOpHexDistance: (a, b, x, y) => Math.max(Math.abs(a - x), Math.abs(b - y)),
  getRouteToTarget: (a, b, x, y) => a === x && b === y ? [] : [{ col: x, row: y }],
  log: () => {}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'operational_ai.js'), 'utf8'), context);

function makeUnit(name, alive, initial, morale) {
  return {
    name, col: 2, row: 7, operationalInitialStrength: initial, operationalMorale: morale,
    enemyAI: {}, squads: [{ fighters: Array.from({ length: initial }, (_, i) => ({ hp: i < alive ? 1 : 0, maxHp: 1 })) }]
  };
}
function useStrength(defender, attackers) {
  context.operationalAIUnitStrength = unit => (unit.squads || []).reduce((sum, squad) =>
    sum + squad.fighters.filter(fighter => fighter.hp > 0).length, 0);
  context.appData.campaign.enemyOpUnits = [defender];
  context.appData.campaign.opUnits = attackers;
}
const doctrine = { faction: 'BeVe', strategyId: 'beve_defense', plan: { retreatHexes: [[3, 5], [4, 5], [5, 6], [4, 7]] } };

// Intact defenders should hold against modest pressure.
let defender = makeUnit('Свежий заслон', 10, 10, 85);
let attacker = makeUnit('Атакующие', 12, 12, 85);
attacker.col = 4; attacker.row = 7;
useStrength(defender, [attacker]);
assert.equal(context.operationalAIRetreatTask(defender, doctrine, [attacker]), null);

// Heavy losses alone do not trigger a retreat without a nearby threat.
defender = makeUnit('Потрёпанный заслон', 5, 10, 70);
useStrength(defender, []);
assert.equal(context.operationalAIRetreatTask(defender, doctrine, []), null);

// Heavy losses plus even moderate local pressure do trigger a withdrawal.
attacker = makeUnit('Атакующие', 4, 4, 85);
attacker.col = 4; attacker.row = 7;
useStrength(defender, [attacker]);
const casualtyRetreat = context.operationalAIRetreatTask(defender, doctrine, [attacker]);
assert.ok(casualtyRetreat && casualtyRetreat.route.length);
assert.equal(defender.enemyAI.orderType, 'retreat');
assert.equal(context.operationalAIUnitCasualtyRatio(defender), 0.5);

// Low morale lowers the pressure threshold without making a fresh high-morale screen flee.
defender = makeUnit('Деморализованный заслон', 10, 10, 30);
attacker = makeUnit('Атакующие', 9, 9, 85);
attacker.col = 4; attacker.row = 7;
useStrength(defender, [attacker]);
assert.ok(context.operationalAIRetreatTask(defender, doctrine, [attacker]));

console.log('PASS: BeVe retreat balances local pressure, morale, and casualties.');
