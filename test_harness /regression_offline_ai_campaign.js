'use strict';
// Multi-turn offline campaign simulation: doctrine orders, save/reload,
// retargeting, movement and contact-battle handoff.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AI_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'operational_ai.js'), 'utf8');

function route(fromCol, fromRow, toCol, toRow) {
  const result = [];
  let col = Number(fromCol), row = Number(fromRow);
  while (col !== Number(toCol)) { col += Math.sign(Number(toCol) - col); result.push({ col, row }); }
  while (row !== Number(toRow)) { row += Math.sign(Number(toRow) - row); result.push({ col, row }); }
  return result;
}
function makeContext(campaign) {
  const battles = [];
  const context = {
    appData: { campaign }, hardMode: { enemyPhoneLines: [] },
    signalEquipmentFor: () => ({ radios: 0, companyRadios: 0, radioRange: 20 }),
    getOpHexDistance: (a, b, x, y) => Math.abs(Number(a) - Number(x)) + Math.abs(Number(b) - Number(y)),
    getRouteToTarget: route, getOpPlannedMoveCost: () => 1,
    isStaticOpUnit: unit => unit && unit.type === 'fortification',
    isMediumArtillery: unit => !!(unit && unit.isArtillery), hasAtGunWeapons: () => false, hasMgWeapons: () => true,
    isArmoredUnit: unit => !!(unit && unit.armored),
    isOpUnitWipedOut: () => false,
    operationalUnitInTacticalBattle: unit => !!(unit && unit.isInBattle),
    operationalAmmoSquads: unit => unit.squads || [],
    operationalUnitHasAmmo: () => true,
    log: () => {}, saveData: () => {}, redrawOperationalMap: () => {},
    startTacticalBattle: (players, enemies) => {
      battles.push({ players: players.map(unit => unit.name), enemies: enemies.map(unit => unit.name) });
      players.concat(enemies).forEach(unit => { unit.isInBattle = true; });
    },
    battles
  };
  vm.createContext(context);
  vm.runInContext(AI_SOURCE, context);
  // Replace only combat resolution; the campaign planner, command delivery,
  // movement and battle-contact handoff remain production code.
  context.operationalAIEngage = () => false;
  return context;
}
function makeInfantry(name, col, row, ap = 2) {
  return { name, col, row, ap, squads: [{ name: 'Пехотное отделение', fighters: [{ hp: 1, maxHp: 1 }] }] };
}
function makeDoctrine(faction, strategyId, mode, routePoints) {
  return { version: 1, faction, strategyId, mode, label: strategyId,
    plan: { route: routePoints, objectives: [], followUpTargets: [] } };
}

// AIRF follows a saved route over multiple turns. A serialized/reloaded campaign
// keeps its doctrine, command signature and messenger deadline. A changed target
// at the same route step is a new order and restarts delivery.
{
  const hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 0, row: 1, ap: 0 };
  const mover = makeInfantry('1-й пехотный взвод', 0, 0, 2);
  const artillery = { name: '82-мм миномёт', type: 'mortar_battery', isArtillery: true, col: 0, row: 1, ap: 1,
    squads: [{ name: 'Миномётный расчёт', fighters: [{ hp: 1, maxHp: 1 }] }] };
  const campaign = { active: true, online: false, currentTurn: 1, playerFaction: 'BeVe', scenario: 'ai-test',
    enemyOpUnits: [hq, mover, artillery], opUnits: [], opMapGrid: {}, enemyAIDoctrine: makeDoctrine('A.I.R.F.', 'airf_southern_dot_bypass', 'dot_bypass', [[4, 0], [8, 0]]) };
  let context = makeContext(campaign);
  context.processOfflineCampaignAI();
  let order = campaign.enemyAIState.orders.find(entry => entry.unitName === mover.name);
  const hqOrder = campaign.enemyAIState.orders.find(entry => entry.unitName === hq.name);
  const artilleryOrder = campaign.enemyAIState.orders.find(entry => entry.unitName === artillery.name);
  assert.equal(order.type, 'move');
  assert.equal(hqOrder.type, 'hold');
  assert.equal(artilleryOrder.type, 'shoot');
  assert.deepEqual({ ...order.target }, { col: 4, row: 0 });
  assert.equal(order.delivery, 'messenger');
  assert.equal(order.readyTurn, 2);
  assert.deepEqual({ col: mover.col, row: mover.row }, { col: 0, row: 0 }, 'wait for messenger before movement');

  campaign.currentTurn = 2;
  context.processOfflineCampaignAI();
  assert.deepEqual({ col: mover.col, row: mover.row }, { col: 2, row: 0 }, 'spend only available movement points');
  const saved = JSON.parse(JSON.stringify(campaign));
  context = makeContext(saved);
  const restoredMover = saved.enemyOpUnits.find(unit => unit.name === mover.name);
  saved.currentTurn = 3;
  saved.enemyOpUnits.find(unit => unit.name === restoredMover.name).ap = 2;
  saved.enemyAIDoctrine.plan.route[0] = [5, 0]; // same objective ID, revised coordinates
  context.processOfflineCampaignAI();
  order = saved.enemyAIState.orders.find(entry => entry.unitName === restoredMover.name);
  assert.deepEqual({ ...order.target }, { col: 5, row: 0 });
  assert.equal(order.issuedTurn, 3, 'retargeting issues a fresh order after reload');
  assert.equal(order.readyTurn, 4, 'new messenger delivery deadline is recorded');
  assert.deepEqual({ col: restoredMover.col, row: restoredMover.row }, { col: 2, row: 0 }, 'retargeted order waits for delivery');
  saved.currentTurn = 4;
  restoredMover.ap = 2;
  context.processOfflineCampaignAI();
  assert.deepEqual({ col: restoredMover.col, row: restoredMover.row }, { col: 4, row: 0 });
}

// An enemy unit that reaches a player-occupied hex starts the tactical battle
// through the normal campaign callback rather than stopping silently.
{
  const hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 0, row: 2, ap: 0 };
  const mover = makeInfantry('Штурмовой взвод', 0, 0, 2);
  const player = { name: 'Наш взвод', col: 1, row: 0, detected: true, squads: [{ fighters: [{ hp: 1, maxHp: 1 }] }] };
  const campaign = { active: true, online: false, currentTurn: 1, playerFaction: 'BeVe', scenario: 'ai-test',
    enemyOpUnits: [hq, mover], opUnits: [player], opMapGrid: {},
    enemyAIDoctrine: makeDoctrine('A.I.R.F.', 'airf_road_breakthrough', 'main_breakthrough', []) };
  const context = makeContext(campaign);
  context.CAMPAIGN_OBJECTIVE_DEFINITIONS = { 'ai-test': { 'A.I.R.F.': { primary: [{ id: 'enemy-contact', col: 1, row: 0, kind: 'primary' }], additional: [] } } };
  context.processOfflineCampaignAI(); // issue attack order; messenger is not ready yet
  let attackOrder = campaign.enemyAIState.orders.find(entry => entry.unitName === mover.name);
  assert.equal(attackOrder.type, 'attack');
  assert.deepEqual({ ...attackOrder.target }, { col: 1, row: 0 });
  campaign.currentTurn = 2;
  context.processOfflineCampaignAI();
  assert.equal(context.battles.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(context.battles[0])), { players: ['Наш взвод'], enemies: ['Штурмовой взвод'] });
  assert.equal(mover.isInBattle, true);
}

// A BeVe defensive plan records the concrete dig-in order, occupies the selected
// support hex, and finishes fieldworks after three quiet operational turns.
{
  const hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 4, row: 6, ap: 0 };
  const screen = makeInfantry('1-й экранный взвод', 2, 7, 2);
  const infantry = makeInfantry('2-й пехотный взвод обороны', 4, 7, 2);
  const campaign = { active: true, online: false, currentTurn: 1, playerFaction: 'A.I.R.F.', scenario: 'ai-test',
    enemyOpUnits: [hq, screen, infantry], opUnits: [], opMapGrid: { '4,7': { types: ['grass'], markers: [] }, '2,7': { types: ['grass'], markers: [] } },
    enemyAIDoctrine: { version: 1, faction: 'BeVe', strategyId: 'beve_defense', mode: 'defense', label: 'Оборона',
      plan: { objectives: [[4, 7]], retreatHexes: [[3, 5], [4, 5], [5, 6], [4, 7]] } } };
  const context = makeContext(campaign);
  for (let turn = 1; turn <= 4; turn++) {
    campaign.currentTurn = turn;
    infantry.ap = 2;
    context.processOfflineCampaignAI();
    const order = campaign.enemyAIState.orders.find(entry => entry.unitName === infantry.name);
    const screenOrder = campaign.enemyAIState.orders.find(entry => entry.unitName === screen.name);
    assert.equal(order.type, 'dig_in');
    assert.equal(screenOrder.type, 'defend');
    assert.deepEqual({ ...screenOrder.target }, { col: 2, row: 7 });
    assert.deepEqual({ ...order.target }, { col: 4, row: 7 });
    assert.deepEqual({ col: infantry.col, row: infantry.row }, { col: 4, row: 7 });
  }
  assert.ok(campaign.opMapGrid['4,7'].markers.includes('trenches'), 'fieldworks appear after three quiet turns');
}

// Urgent BeVe withdrawal updates the saved order and moves immediately despite
// messenger latency; the general retreat test separately checks morale/losses.
{
  const hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 2, row: 9, ap: 0 };
  const defender = makeInfantry('Заслон 2,7', 2, 7, 2);
  const attackers = { name: 'Превосходящие силы', col: 2, row: 5, detected: true,
    squads: [{ fighters: [{ hp: 1 }, { hp: 1 }, { hp: 1 }] }] };
  const campaign = { active: true, online: false, currentTurn: 1, playerFaction: 'A.I.R.F.', scenario: 'ai-test',
    enemyOpUnits: [hq, defender], opUnits: [attackers], opMapGrid: {},
    enemyAIDoctrine: { version: 1, faction: 'BeVe', strategyId: 'beve_defense', mode: 'defense', label: 'Оборона',
      plan: { objectives: [[4, 7]], retreatHexes: [[3, 5], [4, 5], [5, 6], [4, 7]] } } };
  const context = makeContext(campaign);
  context.processOfflineCampaignAI();
  const order = campaign.enemyAIState.orders.find(entry => entry.unitName === defender.name);
  assert.equal(order.type, 'retreat');
  assert.deepEqual({ ...order.target }, { col: 4, row: 7 });
  assert.deepEqual({ col: defender.col, row: defender.row }, { col: 4, row: 7 }, 'emergency withdrawal does not wait for courier');
}

// Both BeVe plans are selectable and persisted. AIRF selection uses the stored
// positive weights and every plan can be selected by an appropriate roll.
function chooseDoctrine(playerFaction, roll, extraUnits = []) {
  const unit = makeInfantry('1-й пехотный взвод', 0, 0);
  const campaign = { active: true, online: false, currentTurn: 1, playerFaction,
    enemyOpUnits: [unit, ...extraUnits], opUnits: [] };
  const context = makeContext(campaign);
  vm.runInContext(`Math.random = () => ${roll};`, context);
  const selected = context.operationalAIEnsureStrategy();
  const result = JSON.parse(JSON.stringify(selected));
  vm.runInContext('Math.random = () => 0.999999;', context);
  assert.equal(context.operationalAIEnsureStrategy().strategyId, result.strategyId, 'doctrine is not rerolled after selection');
  return result;
}
assert.equal(chooseDoctrine('A.I.R.F.', 0).strategyId, 'beve_defense');
assert.equal(chooseDoctrine('A.I.R.F.', 0.999999).strategyId, 'beve_aggressive_raids');
const infantryOnlyWeights = chooseDoctrine('BeVe', 0).weights;
const armorHeavyWeights = chooseDoctrine('BeVe', 0, [{ name: 'Танк Landsverk', type: 'tank', col: 0, row: 1, ap: 3 }]).weights;
const planWeight = (weights, id) => weights.find(entry => entry.id === id).weight;
assert.ok(planWeight(armorHeavyWeights, 'airf_road_breakthrough') > planWeight(infantryOnlyWeights, 'airf_road_breakthrough'),
  'armor-heavy roster increases the weighted road-breakthrough chance');
const airfPlans = new Set();
for (let i = 0; i < 500; i++) airfPlans.add(chooseDoctrine('BeVe', i / 500).strategyId);
assert.equal(airfPlans.size, 5, 'all five weighted AIRF plans are reachable');

console.log('PASS: multi-turn campaign orders, reload, retarget, battle handoff, and weighted doctrines.');
