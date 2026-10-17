const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML } = require('./extract');

const s = createSandbox(freshAppData());
s.run(sliceFunction(HTML, 'tacticalVehicleAimBonus'));
s.run(sliceFunction(HTML, 'consumeTacticalVehicleAim'));
s.run(`
  appData.map = { attackTargetEnemyIdx: 4 };
  var aimedVehicle = { vehicleAim: { targetIdx: 4, bonus: 1 } };
  var aimApplies = tacticalVehicleAimBonus(aimedVehicle);
  appData.map.attackTargetEnemyIdx = 5;
  var wrongTargetBonus = tacticalVehicleAimBonus(aimedVehicle);
  appData.map.attackTargetEnemyIdx = 4;
  var aimConsumed = consumeTacticalVehicleAim(aimedVehicle);
  var aimAfterConsume = tacticalVehicleAimBonus(aimedVehicle);
`);
assert.equal(s.evalCtx('aimApplies'), 1);
assert.equal(s.evalCtx('wrongTargetBonus'), 0);
assert.equal(s.evalCtx('aimConsumed'), true);
assert.equal(s.evalCtx('aimAfterConsume'), 0);
assert.ok(HTML.includes('Выбрать сектор: ') && HTML.includes('setTacticalVehicleFireWeapon'), 'restricted MGs get a dedicated weapon button');
assert.ok(HTML.includes('id=\"fieldVehiclePanel\"') && HTML.includes('Управление бронетехникой на поле боя'), 'vehicle controls are rendered on the battlefield tab');
assert.ok(HTML.includes("openTargetModal(\'vehicleAim\')") && HTML.includes("case \'vehicleAim\': vehicleAcquireTarget(true)"), 'aim action offers target selection before spending AP');
assert.ok(HTML.includes('Цели в секторе:'), 'the field panel names targets in that weapon sector');
assert.ok(HTML.includes('Броня Л${squad.armor.front} · Б${squad.armor.side} · К${squad.armor.rear}'), 'selected armored vehicles display armor on the map');
assert.match(HTML, /function drawTacticalVehicleSectorLines[\s\S]*?spec\.deg < 360/, 'only limited firing sectors are drawn');
const cards = fs.readFileSync(path.join(__dirname, '..', 'js', 'cards.js'), 'utf8');
const weapons = fs.readFileSync(path.join(__dirname, '..', 'js', 'weapons.js'), 'utf8');
assert.match(cards, /"name": "Ветераны колониальной службы"[\s\S]*?"moraleMod": 1/);
assert.match(HTML, /card\.name === 'Ветераны колониальной службы'[\s\S]*?grantTacticalAwardToFighter\(s, fighter, 'colonial'\)/);
assert.match(weapons, /"id": "colonial"[\s\S]*?обнаружению противника/);
assert.match(HTML, /if \(hasColonialSpotters\) mod \+= 1/, 'colonial award improves detection of opposing units');
const detection = createSandbox(freshAppData());
detection.run(sliceFunction(HTML, 'autoDetectOneSquad'));
detection.run(`
  var __logs = [];
  function autoTacticalDetectionMod() { return 0; }
  function tacticalSmokeAllEnemyObserversBlocked() { return false; }
  function rollD10() { return 1; }
  function log(message) { __logs = (__logs || []).concat(String(message)); }
  var observer = { fighters: [{ hp: 1, awards: ['colonial'] }] };
  var observedEnemy = { name: 'enemy', fighters: [{ hp: 1 }], actionsThisTurn: {} };
  appData.squads = [observer]; appData.map = { enemySquads: [observedEnemy], grid: {} };
  autoDetectOneSquad(observedEnemy, 'враг');
  var spottingApplied = __logs.join(' ');
`);
assert.match(detection.evalCtx('spottingApplied'), /d10=1 \+ мод=1/, 'colonial medallion adds +1 to the observer-side detection roll');
console.log('v13.102 vehicle and BeVe-card regressions: PASS');
