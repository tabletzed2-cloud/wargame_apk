// ⚡ v13.061: regressions for deployment highlight, trench editing/limits, enemy prompts, mortar range, retreat, and turn phases.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const FNS = [
    'shouldDrawOperationalPlacementZone', 'getTacticalTargetDistance', 'getTacticalCrewWeaponRange',
    'artilleryCaliberMm', 'isMortarUnit', 'getOperationalArtilleryMaxRange', 'isMediumArtillery',
    'getOpHexDistance', 'unitAutoFire', 'executeShootOrder', 'attackOrdnance', 'executeDigInOrder', 'rotateSelectedHex',
    'getTacticalBattleRecord', 'getTacticalActiveSide', 'setTacticalActiveSide', 'tacticalEnemyIsNeutralized',
    'tacticalRemoveUnitFromMap', 'tacticalIsMeleeEngaged', 'tacticalClearMeleeEngagement',
    'isBicycleTacticalSquad', 'tacticalRetreatUnit', 'tacticalMaybeAutoRetreat', 'retreatSelectedEnemySquad',
    'tacticalUnresolvedEnemies', 'tacticalActionAllowed', 'finishBattle', 'getAP', 'getMaxAP', 'resetAP', 'nextTurn'
];
fs.writeFileSync('/tmp/wg_part.js', FNS.map(name => sliceFunction(HTML, name)).join('\n\n'));

let pass = 0, fail = 0;
function ok(condition, name, detail) {
    if (condition) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (detail ? ' | ' + detail : '')); }
}
function makeSandbox() {
    const appData = freshAppData();
    return { appData, s: createSandbox(appData) };
}
function loadModule(s, file) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), s.ctx, { filename: file });
}

console.log('== v13.061 regressions ==');

// The deployment-zone overlay remains visible through auto-placement until setup is locked.
{
    const { s } = makeSandbox();
    const visibleInitially = s.evalCtx(`shouldDrawOperationalPlacementZone({ scenario: 'valencia', playerFaction: 'BeVe', currentTurn: 1, opMapMode: 'view' })`);
    const stillVisibleWithUnitsPlaced = s.evalCtx(`shouldDrawOperationalPlacementZone({ scenario: 'valencia', playerFaction: 'BeVe', currentTurn: 1, opMapMode: 'view', opUnits: [{ col: 2, row: 2 }] })`);
    const hiddenAfterSetup = s.evalCtx(`shouldDrawOperationalPlacementZone({ scenario: 'valencia', playerFaction: 'BeVe', currentTurn: 2, opMapMode: 'view' })`);
    ok(visibleInitially && stillVisibleWithUnitsPlaced && !hiddenAfterSetup &&
       HTML.includes('if (shouldDrawOperationalPlacementZone(campForZone))'),
       'Подсветка зоны размещения рисуется и после авторазмещения, пока стартовая расстановка не завершена');
}

// Five initial operational hexes are capped; selecting the fifth begins the ordered editor sequence.
{
    const { appData, s } = makeSandbox();
    const opened = [];
    s.sandbox.openHexEditorForBattle = (key, kind) => { opened.push([key, kind]); };
    s.run(`appData.campaign.initialFortificationSetup = { phase: 'select', hexKeys: [], nextIndex: 0, complete: false };
          appData.campaign.opMapMode = 'selectInitialFortificationHexes';`);
    ['1,1', '2,2', '3,3', '4,4', '5,5'].forEach(key => s.sandbox.selectInitialFortificationHex(key));
    const state = JSON.parse(s.evalCtx('JSON.stringify(appData.campaign.initialFortificationSetup)'));
    const sixthRejected = s.sandbox.selectInitialFortificationHex('6,6') === false;
    ok(state.hexKeys.length === 5 && state.phase === 'edit' && state.nextIndex === 0 &&
       opened.length === 1 && opened[0][0] === '1,1' && opened[0][1] === 'initialFortification' && sixthRejected,
       'Выбор ограничен пятью оперативными гексами и запускает последовательное редактирование');
}

// One dig order grants at most eight trench cells, texture clicks cost no point, and rotation persists.
{
    const { appData, s } = makeSandbox();
    s.sandbox.confirm = () => false;
    s.run(`grantTrenchPoints('2,2', 20, 'Тестовый взвод');
          var trenchBase = {}, trenchGrid = {};
          for (var ti = 0; ti < 9; ti++) { var tk = ti + ',0'; trenchBase[tk] = { type: 'grass', variant: 0, level: 2, markers: [] }; trenchGrid[tk] = { ...trenchBase[tk] }; }
          TACTICAL_HEX_MAPS['2,2'] = { grid: trenchBase, w: 9, h: 1 };
          appData.map = { grid: trenchGrid, enemySquads: [], mode: 'hexEdit', lastEditedHex: null };
          hexEditorState = { hexKey: '2,2', kind: 'trenches', rule: hexEditRuleFor('trenches'), baseGrid: trenchBase, undo: [], placed: 0 };`);
    const initialBudget = s.evalCtx(`getHexEditPoints('2,2', 'trenchPoints')`);
    s.run(`hexEditClick('0,0'); hexEditClick('0,0'); rotateSelectedHex();
          for (var pi = 1; pi < 8; pi++) hexEditClick(pi + ',0');
          grantTrenchPoints('2,2', 5, 'Дополнительный взвод');
          hexEditClick('8,0');`);
    const result = JSON.parse(s.evalCtx(`JSON.stringify({
        budget: getHexEditPoints('2,2', 'trenchPoints'),
        count: countPlacedTrenches(getHexOverlay('2,2', false)),
        variant: getHexOverlay('2,2', false).hexVariants['0,0'],
        rotation: getHexOverlay('2,2', false).hexRotations['0,0'],
        ninth: getHexOverlay('2,2', false).hexEdits['8,0'] || null,
        level: appData.map.grid['0,0'].level,
        storedRotation: getHexOverlay('2,2', false).hexRotations['0,0']
    })`));
    const freshGrid = { '0,0': { type: 'grass', variant: 0, level: 2, markers: [] } };
    s.sandbox.__freshGrid = freshGrid;
    s.run(`applyHexOverlays(__freshGrid, '2,2');`);
    ok(initialBudget === 8 && result.budget === 0 && result.count === 8 && result.ninth === null,
       'Очки окапывания и размещение вместе ограничены восемью клетками на оперативный гекс');
    ok(result.variant === 1 && result.rotation === 60 && result.level === 2 &&
       freshGrid['0,0'].type === 'trenches' && freshGrid['0,0'].variant === 1 && freshGrid['0,0'].rotation === 60,
       'Повторные щелчки меняют текстуру бесплатно; поворот и уровень сохраняются и переносятся в бой');
}

// Completing an enemy dig order marks the operational hex but gives no local points, alert, or editor prompt.
{
    const { appData, s } = makeSandbox();
    let confirms = 0;
    s.sandbox.confirm = () => { confirms++; return true; };
    s.run(`var enemyDigUnit = { name: 'Вражеский взвод', type: 'infantry', col: 7, row: 4, ap: 4, isInBattle: false };
          appData.campaign.enemyOpUnits = [enemyDigUnit];
          appData.campaign.opMapGrid = {};
          var enemyDigOrder = { digProgress: 2 };`);
    s.run('executeDigInOrder(enemyDigUnit, enemyDigOrder);');
    const result = s.evalCtx(`JSON.stringify({ status: enemyDigOrder.status,
        markers: appData.campaign.opMapGrid['7,4'].markers,
        overlays: appData.campaign.hexOverlays || null,
        completionLog: logs.some(x => x.includes('завершил окапывание')) })`);
    const state = JSON.parse(result);
    ok(state.status === 'completed' && state.markers.includes('trenches') && !state.overlays &&
       !state.completionLog && confirms === 0 && s.alerts.length === 0,
       'Вражеское окапывание сохраняется без локального уведомления, бюджета и предложения редактора');
}

// Tactical and operational 82-mm mortar fire both stop at five hexes, inclusive.
{
    const { appData, s } = makeSandbox();
    loadModule(s, 'js/map_actions.js');
    const data = JSON.parse(s.evalCtx(`JSON.stringify({ beve: BEVE_CREW_WEAPONS.find(w => /82мм/.test(w.name)),
        airf: AIRF_CREW_WEAPONS.find(w => /82мм/.test(w.name)) })`));
    const forcedRange = s.evalCtx(`getTacticalCrewWeaponRange({ type: 'mortar', name: 'Минометный расчёт 82мм', effectiveRange: 15 })`);
    const operationalRange = s.evalCtx(`getOperationalArtilleryMaxRange({ type: 'mortar_battery', name: '82-мм миномётная батарея' }, 10)`);
    const ordinaryRange = s.evalCtx(`getOperationalArtilleryMaxRange({ type: 'mortar_battery', name: '50-мм миномётная батарея' }, 10)`);
    ok(data.beve.effectiveRange === 5 && data.airf.effectiveRange === 5 && forcedRange === 5 &&
       operationalRange === 5 && ordinaryRange === 10,
       '82-мм миномёты обеих сторон ограничены пятью гексами без изменения дальности прочих батарей');

    // The operational order accepts exactly five, rejects six; automatic fire also excludes a target at six.
    s.sandbox.executeMortarSalvo = (_unit, _targets, distance) => { s.sandbox.__salvoDistance = distance; };
    s.sandbox.canUnitShoot = () => true;
    s.sandbox.getNearestOpUnit = (units, col, row) => ({ unit: units[0], dist: s.sandbox.getOpHexDistance(col, row, units[0].col, units[0].row) });
    s.sandbox.mortarRoundsForUnit = (_unit, rounds) => rounds;
    s.sandbox.isStaticOpUnit = () => false;
    s.sandbox.isArmoredUnit = () => false;
    s.run(`var mortarUnit = { name: '82-мм миномётная батарея', type: 'mortar_battery', col: 0, row: 0, ap: 4, squads: [] };
          var orderTooFar = { targetHex: '6,0' }; appData.campaign.enemyOpUnits = [{ name: 'Цель', col: 6, row: 0, detected: true }];`);
    s.run('executeShootOrder(mortarUnit, orderTooFar);');
    const sixHexCancelled = s.evalCtx(`orderTooFar.status === 'cancelled' && logs.some(x => x.includes('максимум 5'))`);
    s.run(`var orderAtFive = { targetHex: '5,0' }; appData.campaign.enemyOpUnits = [{ name: 'Цель', col: 5, row: 0, detected: true }];`);
    s.run('executeShootOrder(mortarUnit, orderAtFive);');
    const fiveHexAllowed = s.evalCtx(`orderAtFive.status === 'completed' && __salvoDistance === 5`);
    s.run(`appData.campaign.enemyOpUnits = [{ name: 'Цель', col: 6, row: 0, detected: true }];
          var autoTooFar = unitAutoFire(mortarUnit, 10);`);
    const autoFireBlocked = s.evalCtx('autoTooFar === false');
    ok(sixHexCancelled && fiveHexAllowed && autoFireBlocked,
       'Оперативный приказ и автоматический огонь соблюдают предел 5 гексов');

    // The map action picker exposes the same max range and attackOrdnance refuses a manual six-hex shot.
    const mortar = data.beve;
    s.sandbox.getFactionCrewWeapons = () => [mortar];
    s.run(`appData.squads = [{ name: 'Миномётный расчёт', faction: 'BeVe', fighters: [{ hp: 1 }],
        crewInstances: [{ weaponName: 'Минометный расчёт 82мм', active: true, deployed: true, fighterIndices: [0] }], ammoOrdnance: 4 }];
        appData.map = { grid: {
          '0,0': { squadIds: [0], enemySquadIds: [] },
          '5,0': { squadIds: [], enemySquadIds: [0] },
          '6,0': { squadIds: [], enemySquadIds: [1] }
        }, enemySquads: [{ name: 'В пяти гексах', fighters: [{ hp: 1 }] }, { name: 'В шести гексах', fighters: [{ hp: 1 }] }], activeSide: 'player' };
        var ordnanceDef = MAP_ACTION_DEFS.find(d => d.id === 'ordnance');`);
    const tacticalDistances = JSON.parse(s.evalCtx(`JSON.stringify({ five: mapActionEvalTarget(ordnanceDef, 0, 0), six: mapActionEvalTarget(ordnanceDef, 0, 1) })`));
    s.run(`var currentSquadIndex = 0; var currentSquad = appData.squads[0];
          var actionPoints = [{ ap: 4, maxAp: 4 }];
          function getEffectiveMorale() { return 5; }
          function getSuppressionThreshold() { return 2; }
          function getScopedActiveModifiersForSquad() { return []; }
          document.getElementById('targetDistance').value = '6';`);
    s.run('attackOrdnance();');
    const tacticalShotRejected = s.evalCtx('actionPoints[0].ap === 4 && appData.squads[0].ammoOrdnance === 4');
    ok(tacticalDistances.five.ok && tacticalDistances.five.dist === 5 && !tacticalDistances.six.ok &&
       tacticalDistances.six.reason === 'далеко (6 > 5)' && tacticalShotRejected,
       'Карта тактического боя не разрешает цель дальше пяти гексов и выстрел не тратит ОД/боезапас');
}

// Retreat neutralizes only the unit that retreated; the battle cannot finish while anyone remains.
{
    const { appData, s } = makeSandbox();
    s.run(`var currentTurn = 3; var currentSquad = null;
          function placementPendingReason() { return null; }
          function updateTacticalTurnUI() {}
          function syncBattleLossesToCampaign() {}
          var enemySquad = { name: 'Защитник', fighters: [{ hp: 2 }], currentMorale: 5 };
          var battleRecord = { id: 701, hexKey: '4,4', placement: { attackerSide: 'player' }, activeSide: 'enemy', tacticalMap: { grid: {} } };
          appData.currentBattleId = 701; appData.campaign.activeBattles = [battleRecord];
          appData.map = { grid: { '2,2': { squadIds: [], enemySquadIds: [0] } }, enemySquads: [enemySquad], activeSide: 'enemy', selectedEnemyMoveIdx: 0 };
          appData.squads = [];`);
    s.run('finishBattle();');
    const blockedWhileAlive = s.evalCtx('appData.campaign.activeBattles.length === 1 && alerts.length > 0');
    s.run('var explicitlyRetreated = retreatSelectedEnemySquad();');
    const explicitResult = s.evalCtx('explicitlyRetreated && enemySquad.isRetreated && tacticalUnresolvedEnemies().length === 0');
    s.run(`var lowMorale = { name: 'Бегущий отряд', currentMorale: 1, fighters: [{ hp: 1 }] };
          appData.squads = [lowMorale]; appData.map.grid['3,3'] = { squadIds: [0], enemySquadIds: [] };
          var autoRetreated = tacticalMaybeAutoRetreat(lowMorale, 'player', 0);`);
    const automaticResult = s.evalCtx('autoRetreated && lowMorale.isRetreated && lowMorale.status === "retreated"');
    ok(blockedWhileAlive && explicitResult && automaticResult,
       'Явный и автоматический отход исключают отряды из боя; завершить бой можно только после нейтрализации всех врагов');
}

// Local turns alternate attacker/defender; online devices accept only their own active phase and map cloud roles locally.
{
    const { appData, s } = makeSandbox();
    s.sandbox.checkNightTime = () => {};
    s.sandbox.syncBattleLossesToCampaign = () => {};
    s.sandbox.getMaxAP = () => 4;
    s.run(`var currentTurn = 1; var currentSquadIndex = 0; var actionPoints = [];
          var turnBattle = { id: 702, placement: { attackerSide: 'player' }, activeSide: 'player', currentTurn: 1 };
          appData.currentBattleId = 702; appData.campaign.activeBattles = [turnBattle];
          appData.campaign.opTurnStartTime = 1000; appData.campaign.currentTime = 840;
          appData.currentTime = 840; appData.squads = [{ name: 'Атакующий', fighters: [{ hp: 1, maxHp: 1 }], effects: {} }];
          appData.map = { grid: {}, enemySquads: [], activeSide: 'player' };`);
    s.run('nextTurn();');
    const localDefender = s.evalCtx('turnBattle.activeSide === "enemy" && appData.map.activeSide === "enemy" && currentTurn === 2');
    s.run('nextTurn();');
    const localAttacker = s.evalCtx('turnBattle.activeSide === "player" && appData.map.activeSide === "player" && currentTurn === 3');
    s.run(`appData.campaign.online = true; setTacticalActiveSide('enemy', turnBattle); var heldTurn = currentTurn; nextTurn();`);
    const onlineBlocked = s.evalCtx('currentTurn === heldTurn && turnBattle.activeSide === "enemy" && alerts.length > 0');
    loadModule(s, 'js/online_battles.js');
    s.run(`turnBattle.placement = { attackerSide: 'player', playerReady: true, enemyReady: true, phase: 'done' };
          var ownRetreatedSquad = { name: 'Свои', isRetreated: true, status: 'retreated', retreatReason: 'morale', retreatTurn: 3, fighters: [{ hp: 1 }] };
          appData.squads = [ownRetreatedSquad]; appData.map.grid = { '0,0': { squadIds: [0], enemySquadIds: [] } };
          var outgoingSnapshot = onlineBattleSnapshot(turnBattle);`);
    const snapshot = JSON.parse(s.evalCtx(`JSON.stringify({ side: outgoingSnapshot.activeSide, retreated: outgoingSnapshot.squads[0].isRetreated,
        status: outgoingSnapshot.squads[0].status, reason: outgoingSnapshot.squads[0].retreatReason })`));
    // A mirrored defender receives the attacker's/defender's phase in local player/enemy coordinates.
    s.run(`turnBattle.onlineOppBattleId = 799; turnBattle.placement = { attackerSide: 'enemy', playerReady: true, enemyReady: true, phase: 'done' };
          turnBattle.activeSide = 'enemy'; appData.map.activeSide = 'enemy';
          var cloudRetreat = { id: 799, oppBattleId: 702, status: 'active', placed: true, turn: 4, activeSide: 'defender',
            squads: [{ name: 'Противник', isRetreated: true, status: 'retreated', retreatReason: 'command', retreatTurn: 4,
              fighters: [{ name: 'Боец', hp: 1, maxHp: 1 }] }], dmgIn: {}, dmgOut: {}, supOut: {} };
          var remoteEnemy = { name: 'Противник', fighters: [{ hp: 1, maxHp: 1 }] };
          appData.map.enemySquads = [remoteEnemy]; appData.map.grid = { '5,5': { squadIds: [], enemySquadIds: [0] } };
          var merged = onlineMergeOppBattle(turnBattle, cloudRetreat);`);
    const merged = s.evalCtx(`merged && turnBattle.activeSide === 'player' && appData.map.activeSide === 'player' &&
        appData.map.enemySquads[0].isRetreated && !appData.map.grid['5,5'].enemySquadIds.includes(0)`);
    ok(localDefender && localAttacker && onlineBlocked,
       'Локальные фазы чередуют атакующего и обороняющегося; онлайн нельзя переключить в чужую фазу');
    ok(snapshot.side === 'defender' && snapshot.retreated && snapshot.status === 'retreated' && snapshot.reason === 'morale' && merged,
       'Онлайн-снимок синхронизирует отход, а облачная фаза переводится в локальную сторону устройства');
}

console.log(`\nИтог v13.061: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exitCode = 1;
