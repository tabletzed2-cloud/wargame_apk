// Regression tests for requested tactical fixes 14–17.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData, setRandom } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.log(`✗ ${name} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function equal(actual, expected, message) {
  assert(actual === expected, `${message || 'equality'}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function includes(actual, expected, message) {
  assert(String(actual).includes(expected), `${message || 'includes'}: missing ${JSON.stringify(expected)} in ${JSON.stringify(actual)}`);
}
function loadHtml(s, names) { names.forEach(name => s.run(sliceFunction(HTML, name))); }
function loadModule(s, filename) {
  s.run(fs.readFileSync(path.join(ROOT, filename), 'utf8'));
}

// 14. Mounted bicycle and motorcycle units can climb one level, spending all remaining AP.
test('14: cyclists and motorcyclists spend all remaining AP to climb one level', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['getMovementAPForStep', 'getMovementCost', 'getHexNeighbors', 'calculateReachableHexes']);
  s.run(`
    var TACTICAL_MAP_SIZE = 5;
    var actionPoints = [
      { ap: 6, maxAp: 6 }, { ap: 5, maxAp: 5 },
      { ap: 6, maxAp: 6 }, { ap: 6, maxAp: 6 }
    ];
    function getAP(i) { return actionPoints[i] ? actionPoints[i].ap : 0; }
    function getMaxAP(unit) { return unit.maxAp || 6; }
    function getScopedActiveCardsForSquad() { return []; }
    var bicycle = { name: 'Взвод велосипедистов', mobilityType: 'bicycle', maxAp: 6, dismounted: false };
    var motorcycle = { name: 'Мотоциклетный взвод', mobilityType: 'motorcycle', maxAp: 5, dismounted: false };
    var footedBicycle = { name: 'Взвод велосипедистов', mobilityType: 'bicycle', maxAp: 6, dismounted: true };
    var footedMotorcycle = { name: 'Мотоциклетный взвод', mobilityType: 'motorcycle', maxAp: 6, dismounted: true };
    appData.squads = [bicycle, motorcycle, footedBicycle, footedMotorcycle];
    appData.map = { grid: {
      '0,0': { type: 'grass', level: 0 }, '1,0': { type: 'grass', level: 1 },
      '0,1': { type: 'road', level: 0 }, '1,1': { type: 'forest', level: 1 },
      '2,1': { type: 'forest', level: 1 }, '3,0': { type: 'grass', level: 2 },
      '2,0': { type: 'swamp_passable', level: 0 }
    } };
    var bikeClimb = getMovementCost(bicycle, '0,0', '1,0', false);
    var motorcycleClimb = getMovementCost(motorcycle, '0,0', '1,0', false);
    var climbAfterRoad = getMovementCost(bicycle, '0,1', '1,1', false, 5);
    var tooHighClimb = getMovementCost(bicycle, '0,0', '3,0', false);
    var reachable = calculateReachableHexes(bicycle, '0,0', 6, false);
    var footedBikeCost = getMovementCost(footedBicycle, '0,0', '2,0', false);
    var footedMotorcycleCost = getMovementCost(footedMotorcycle, '0,0', '2,0', false);
  `);
  equal(s.evalCtx('bikeClimb'), 6, 'велосипедист тратит все 6 доступных полу-ОД на подъём');
  equal(s.evalCtx('motorcycleClimb'), 5, 'мотоциклист тратит все 5 оставшихся полу-ОД на подъём');
  equal(s.evalCtx('climbAfterRoad'), 5, 'подъём после шага тратит оставшийся запас ОД');
  equal(s.evalCtx('reachable["1,1"]'), 6, 'маршрут с подъёмом допустим и полностью расходует ОД');
  equal(s.evalCtx('reachable["2,1"]'), undefined, 'после подъёма нельзя продолжить движение в этот ход');
  equal(s.evalCtx('tooHighClimb'), Infinity, 'нельзя перепрыгнуть через несколько уровней');
  equal(s.evalCtx('footedBikeCost'), 4, 'спешенный велосипедист проходит по правилам обычной пехоты');
  equal(s.evalCtx('footedMotorcycleCost'), 4, 'спешенный мотоциклист проходит по правилам обычной пехоты');
});

// 15. DOT machine guns must not damage vehicles, including when the normal target picker is bypassed.
test('15: пулемёт ДОТа не выбирает бронетехнику и не наносит ей урон', () => {
  const s = createSandbox(freshAppData());
  loadModule(s, 'js/map_actions.js');
  loadHtml(s, ['fireDOTMG']);
  s.run(`
    var currentTurn = 1, currentSquadIndex = 0, apSpent = 0;
    var targetVehicle = { name: 'Танк', isVehicle: true, armor: { front: 20 }, detected: true, hidden: false,
      fighters: [{ name: 'Экипаж', hp: 3, maxHp: 3 }] };
    var dot = { name: 'ДОТ Bosh', faction: 'BeVe', ammoSmall: 8,
      crewInstances: [{ weaponName: 'Пулемёт ДОТа', fighterIndices: [0], active: true, uniqueKey: 'mg-1' }],
      fighters: [{ name: 'Пулемётчик', hp: 3 }] };
    appData.squads = [dot];
    appData.map = { attackTargetEnemyIdx: 0, enemySquads: [targetVehicle], grid: {
      '0,0': { squadIds: [0], enemySquadIds: [] }, '1,0': { squadIds: [], enemySquadIds: [0] }
    } };
    var currentSquad = dot;
    function getBattleSquadHex(grid, idx, enemy) {
      var field = enemy ? 'enemySquadIds' : 'squadIds';
      var key = Object.keys(grid).find(k => (grid[k][field] || []).includes(idx));
      return key ? { key, col: Number(key.split(',')[0]), row: Number(key.split(',')[1]) } : null;
    }
    function hexGridDistance() { return 1; }
    function getTacticalCoverInfoForEnemy() { return { mod: 0, label: '' }; }
    function tacticalIsMeleeEngaged() { return false; }
    function tacticalActionAllowed() { return true; }
    function getFactionCrewWeapons() { return [{ name: 'Пулемёт ДОТа', type: 'mg', shotRule: 'sum_d6', fullCrewDice: 1, minCrewDice: 1, effectiveRange: 5 }]; }
    function getScopedActiveModifiersForSquad() { return []; }
    function spendAP() { apSpent++; return true; }
    function getWeaponShotCount() { return 0; }
    function getWeaponMaxShots() { return 2; }
    function incrementWeaponShotCount() {}
    function getTacticalTargetDistance() { return 1; }
    function getEffectiveMorale() { return 5; }
    function getSuppressionThreshold() { return 2; }
    var vehicleEval = mapActionEvalTarget(mapActionDefById('dotmg'), 0, 0);
    var damageResult = reportAttackOutcome('dotmg', { hits: 3, shots: 3 });
    fireDOTMG(0);
  `);
  equal(s.evalCtx("mapActionDefById('dotmg').targets"), 'infantry', 'выбор цели пулемёта ограничен пехотой');
  equal(s.evalCtx('vehicleEval.ok'), false, 'бронетехника отклоняется при выборе цели');
  equal(s.evalCtx('damageResult.damage'), 0, 'защитная проверка результата не применяет урон');
  equal(s.evalCtx('targetVehicle.fighters[0].hp'), 3, 'здоровье экипажа бронетехники не меняется');
  equal(s.evalCtx('apSpent'), 0, 'нельзя потратить ОД на пулемёт ДОТа против бронетехники');
  equal(s.evalCtx('dot.ammoSmall'), 8, 'нельзя потратить патроны пулемёта ДОТа против бронетехники');
});

// 16. Suppression blocks movement for the target's next phase, but leaves fire available at −2 accuracy.
test('16: подавленный отряд не двигается, стреляет со штрафом, а статус снимается после своей фазы', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['isBicycleTacticalSquad', 'tacticalActionAllowed', 'markTacticalSuppressed', 'clearTacticalSuppressionForSide', 'getTacticalSuppressionAccuracyPenalty', 'resetAP']);
  s.run(`
    var currentTurn = 4, actionPoints = [];
    function getMaxAP() { return 6; }
    var player = { name: 'Пехотное отделение', fighters: [{ hp: 3 }], suppressed: true };
    var enemy = { name: 'Вражеское отделение', fighters: [{ hp: 3 }], suppressed: false };
    appData.squads = [player]; appData.map = { activeSide: 'player', attackTargetEnemyIdx: null, enemySquads: [enemy] };
    function getTacticalActiveSide() { return 'player'; }
    function placementPendingReason() { return null; }
    function tacticalIsMeleeEngaged() { return false; }
    var moveAllowed = tacticalActionAllowed(player, 'move', true);
    var fireAllowed = tacticalActionAllowed(player, 'shoot', true);
    var penalty = getTacticalSuppressionAccuracyPenalty(player);
    markTacticalSuppressed(enemy, 'player');
    var enemySuppressedTurn = enemy.suppressedTurn;
    var enemySuppressedBySide = enemy.suppressedBySide;
    clearTacticalSuppressionForSide('enemy');
    var playerStillSuppressed = player.suppressed;
    var enemyCleared = !enemy.suppressed;
    resetAP();
    var playerSuppressedAfterAPReset = player.suppressed;
    clearTacticalSuppressionForSide('player');
    var playerClearedAfterOwnPhase = !player.suppressed;
  `);
  equal(s.evalCtx('moveAllowed'), false, 'движение заблокировано на подавленном ходу');
  equal(s.evalCtx('fireAllowed'), true, 'стрельба остаётся разрешённой');
  equal(s.evalCtx('penalty'), -2, 'к точности применяется штраф −2');
  equal(s.evalCtx('enemySuppressedTurn'), 4, 'сохраняется ход, когда наложили подавление');
  equal(s.evalCtx('enemySuppressedBySide'), 'player', 'сохраняется сторона, наложившая подавление');
  equal(s.evalCtx('playerStillSuppressed'), true, 'окончание чужой фазы не снимает подавление с игрока');
  equal(s.evalCtx('playerSuppressedAfterAPReset'), true, 'пересчёт ОД не снимает подавление до конца собственной фазы');
  equal(s.evalCtx('enemyCleared'), true, 'статус цели снимается после её собственной фазы');
  equal(s.evalCtx('playerClearedAfterOwnPhase'), true, 'свой статус снимается после завершения своей фазы');
});

test('16: онлайн-передача хода сохраняет подавление своего отряда до конца его фазы', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['clearTacticalSuppressionForSide']);
  loadModule(s, 'js/online_battles.js');
  s.run(`
    var currentTurn = 1;
    var player = { name: 'Свой отряд', suppressed: true, actionsThisTurn: {} };
    var enemy = { name: 'Отряд оппонента', suppressed: true };
    var battle = { id: 55, phaseRevision: 0, activeSide: 'enemy', currentTurn: 1,
      placement: { attackerSide: 'player' }, playerSquads: [player], enemySquads: [enemy],
      actionPoints: [], tacticalMap: { enemySquads: [enemy] } };
    appData.squads = [player];
    appData.map = { activeSide: 'enemy', enemySquads: [enemy] };
    var accepted = onlineAcceptBattlePhase(battle, { phaseRevision: 1, activeSide: 'attacker' }, true);
  `);
  equal(s.evalCtx('accepted'), true, 'принята следующая фаза онлайн-боя');
  equal(s.evalCtx('player.suppressed'), true, 'подавление собственного отряда не сбрасывается при начале его фазы');
  equal(s.evalCtx('enemy.suppressed'), false, 'подавление противника снимается после его фазы');
});

// 17. The end of a resolved melee round is surfaced as a visible toast.
test('17: после разрешённой рукопашной показывается уведомление с итогом', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['meleeAttack']);
  setRandom(s, [0.99]);
  s.run(`
    var currentTurn = 1, currentSquadIndex = 0;
    var notifications = [];
    var currentSquad = { name: 'Штурмовое отделение', faction: 'BeVe', baseMorale: 5, currentMorale: 5,
      fighters: [{ name: 'Боец', weapon: 'Винтовка', hp: 3, maxHp: 3 }], effects: {} };
    function tacticalActionAllowed() { return true; }
    function tacticalMeleeTarget() { return null; }
    function getTacticalTargetDistance(fallback) { return fallback; }
    function tacticalAutoEngageMelee() { return null; }
    function getEffectiveMorale() { return 5; }
    function getFactionWeapons() { return []; }
    function reportAttackOutcome() { return { killed: ['Вражеский боец'], notes: [] }; }
    window.toast = function (text, kind) { notifications.push({ text, kind }); };
    meleeAttack(true);
  `);
  equal(s.evalCtx('notifications.length'), 1, 'показано одно уведомление по итогам раунда');
  includes(s.evalCtx('notifications[0].text'), 'попаданий 1, урон 3', 'уведомление содержит попадания и урон');
  includes(s.evalCtx('notifications[0].text'), 'Потери противника: 1', 'уведомление показывает потери цели');
  equal(s.evalCtx('notifications[0].kind'), 'success', 'успешная рукопашная выделена зелёным уведомлением');
});

console.log(`\nИтог критериев 14–17: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
