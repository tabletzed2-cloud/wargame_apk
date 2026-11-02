// ⚡ v13.144: регрессии новых пунктов плейтеста (A–D) + проверки исходников.
//   A. метки/иконки на тактической карте крупнее
//   B. пунктирные стрелки «кто по кому стрелял» в начале хода (оперативная карта)
//   C. доставка снабжения в обход врага, в том числе в бой; запрет только при окружении
//   D. статус «окружён»: точка эвакуации, перекрытые пути отхода (оперативка),
//      контроль ≥4 направлений (тактика), падение боевого духа
'use strict';

const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

const HELPERS = [
    'opHexHasEnemyBlocker', 'opEvacPointCaptured', 'opUnitExitAnalysis',
    'operationalEncirclementReasons', 'isOperationalUnitEncircled', 'opRefreshEncirclementFlags',
    'opShotLinesCurrent', 'recordOpShotLine', 'snapshotOpShotLinesForNewTurn', 'opHexPixelCenter',
    'drawOperationalShotLines', 'drawOperationalEncirclementBadge',
    'tacticalSquadIsCombatCapable', 'tacticalLiveEncirclementContext', 'tacticalHexHasLivingSquadOfSide',
    'tacticalChainPointFor', 'tacticalChainNodes', 'tacticalChainLinked', 'tacticalPolygonArea',
    'tacticalSegmentsCross', 'tacticalPolygonIsSimple', 'tacticalPointInPolygon', 'tacticalChainCycles',
    'tacticalChainEncirclementForSide', 'tacticalApplyEncirclementMorale', 'updateTacticalEncirclement',
    'tacticalChainPayload', 'tacticalEncirclementSignature', 'updateTacticalEncirclementIfChanged',
    'drawTacticalChainRings', 'drawTacticalEncirclementMark', 'tacticalEncirclementNotice',
    'supplyBattleAtHex', 'supplySquadBelongsToUnit', 'supplyBattleSquadList',
    'supplyDistributeCargoToBattle', 'tacticalBattleEncirclementBlocksSupply',
    'supplyRecipientCutOffReason', 'supplyRecipientIsCutOff',
    'supplyDeliveryDestination', 'findSupplyRoute', 'supplyMoveCost'
];

const PROLOGUE = `
var TACTICAL_MAP_SIZE = 20;
${sliceConst(HTML, 'OP_ENCIRCLE_MIN_BLOCKED_EXITS')}
${sliceConst(HTML, 'OP_SHOT_LINES_LIMIT')}
${sliceConst(HTML, 'TACTICAL_CHAIN_MAX_GAP')}
${sliceConst(HTML, 'TACTICAL_CHAIN_MIN_LENGTH')}
${sliceConst(HTML, 'TACTICAL_CHAIN_MAX_LENGTH')}
${sliceConst(HTML, 'TACTICAL_CHAIN_MAX_CYCLES')}
${sliceConst(HTML, 'TACTICAL_ENCIRCLE_MORALE_FIRST')}
${sliceConst(HTML, 'TACTICAL_ENCIRCLE_MORALE_PHASE')}
function hexGridDistance(c1, r1, c2, r2) {
    const cube = (c, r) => { const x = c - (r - (r & 1)) / 2; const z = r; return { x, y: -x - z, z }; };
    const a = cube(c1, r1), b = cube(c2, r2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}
function getBattleSquadHex(grid, idx, isEnemy) {
    for (const k in grid) {
        const cell = grid[k] || {};
        const arr = isEnemy ? cell.enemySquadIds : cell.squadIds;
        if (Array.isArray(arr) && arr.includes(idx)) { const p = k.split(',').map(Number); return { col: p[0], row: p[1], key: k }; }
    }
    return null;
}
function tacticalMoraleScale(squad) {
    return Math.max(1, Number(squad && squad.tacticalMoraleMax) || Number(squad && squad.baseMorale) || 100);
}
var surrenderedCalls = [];
function tacticalSurrenderUnit(squad, side, index, reason) {
    squad.isSurrendered = true;
    squad.surrenderReason = reason;
    surrenderedCalls.push({ index: index, reason: reason });
    return true;
}
var SUPPLY_AMMO_PER_MAN = 40, SUPPLY_GREN_PER_MAN = 4;
function isHexInPlayableArea() { return true; }
function isHexRemovedFromOperationalMap() { return false; }
function getMovementCost() { return 1; }
function changeOperationalMorale(unit, delta) { unit.operationalMorale = (unit.operationalMorale || 100) + delta; return unit.operationalMorale; }
function supplyDistributeCargo(unit, cargo) {
    // упрощённый оригинал: раздаём первому отряду, пока есть место
    const left = { ammoSmall: cargo.ammoSmall || 0, grenades: cargo.grenades || 0, ammoOrdnance: cargo.ammoOrdnance || 0 };
    ((unit && unit.squads) || []).forEach(sq => {
        const cap = 400;
        const take = Math.min(left.ammoSmall, Math.max(0, cap - (Number(sq.ammoSmall) || 0)));
        sq.ammoSmall = (Number(sq.ammoSmall) || 0) + take; left.ammoSmall -= take;
    });
    return left;
}
function supplyOrdnanceFull() { return 0; }
function operationalHexHasActiveBattle() {
    const m = appData && appData.campaign && appData.campaign.__battleHexes;
    if (!m) return false;
    return m.includes(arguments[0] + ',' + arguments[1]);
}
`;

console.log('== v13.144 playtest fixes (A–D) ==');

// ───────────────────────────── A: размеры меток ─────────────────────────────
{
    ok(/TACTICAL_MARKER_SCALE\s*=\s*1\.4/.test(HTML), 'A: введён коэффициент TACTICAL_MARKER_SCALE = 1.4');
    ok(/let iconSize = size \* 0\.3 \* TACTICAL_MARKER_SCALE;/.test(HTML), 'A: метки гекса рисуются 0.42 гекса вместо 0.3');
    ok(/markerY \+= iconSize \* 0\.95;/.test(HTML), 'A: шаг между метками тоже вырос');
    fs.writeFileSync('/tmp/wg_part.js', sliceFunction(HTML, 'tacticalHexIconLayout'));
    const s = createSandbox(freshAppData());
    s.run('TACTICAL_MARKER_SCALE = 1.4;');
    ok(s.evalCtx('tacticalHexIconLayout(1, 0, 0, 100).iconSize') === 92,
        'A: иконка одного отряда — 0.92 гекса (было 0.85)',
        String(s.evalCtx('tacticalHexIconLayout(1, 0, 0, 100).iconSize')));
    ok(s.evalCtx('tacticalHexIconLayout(5, 0, 0, 100).iconSize') >= 38,
        'A: минимальный размер иконки в «толпе» — не меньше 0.38 гекса');
    ok(/Math\.max\(14, size \* 0\.4\)/.test(HTML) && /'💫', \(size \* 0\.4\)/.test(HTML),
        'A: статус-иконки подавления/сдачи крупнее (0.4)');
}

// ──────────────────── B: линии «кто по кому стрелял» ────────────────────
{
    const prologue = PROLOGUE + '\n' + HELPERS.map(n => sliceFunction(HTML, n)).join('\n\n');
    fs.writeFileSync('/tmp/wg_part.js', prologue);
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      var shooter = { name: 'MG-взвод', col: 3, row: 3 };
      var victim  = { name: 'Пехота врага', col: 6, row: 5 };
      var farUnit = { name: 'Артиллерия', col: 1, row: 1 };
      appData.campaign.opUnits = [shooter, farUnit];
      appData.campaign.enemyOpUnits = [victim];
      recordOpShotLine(shooter, victim, { kind: 'mg' });
      recordOpShotLine(shooter, victim, { kind: 'mg' });
      recordOpShotLine(shooter, { col: 10, row: 2 }, { kind: 'art' });
    `);
    ok(s.evalCtx('opShotLinesCurrent().length') === 2, 'B: два разных обстрела — две линии',
        String(s.evalCtx('opShotLinesCurrent().length')));
    ok(s.evalCtx('opShotLinesCurrent()[0].count') === 2, 'B: повторный обстрел по той же цели объединяется');
    ok(s.evalCtx('opShotLinesCurrent()[0].side') === 'player', 'B: сторона стрелка определяется по списку своих юнитов');
    s.run(`appData.campaign.enemyOpUnits.push({ name: 'Враг', col: 7, row: 7 }); 
           var foe = appData.campaign.enemyOpUnits[0];
           recordOpShotLine(foe, shooter, { kind: 'mg' });`);
    ok(s.evalCtx("opShotLinesCurrent().filter(l => l.side === 'enemy').length") === 1,
        'B: обстрел по нам помечается стороной enemy');
    ok(s.evalCtx('snapshotOpShotLinesForNewTurn()') === 3, 'B: снимок хода забирает все линии');
    ok(s.evalCtx('opShotLinesCurrent().length') === 0, 'B: текущий журнал обнуляется после снимка');
    ok(s.evalCtx('appData.campaign.opShotLinesShown.length') === 3, 'B: снимок хранится для отрисовки');
    // отрисовка: ctx-счётчик вызовов
    s.run(`
      var drawCalls = 0;
      var fakeCtx = new Proxy({}, {
        get(t, k) { if (k === 'canvas') return { width: 800, height: 600 }; return function () { drawCalls++; }; },
        set() { return true; }
      });
      drawOperationalShotLines(fakeCtx, 55);
    `);
    ok(s.evalCtx('drawCalls') > 10, 'B: линии реально рисуются (пунктир + наконечники)', String(s.evalCtx('drawCalls')));
    ok(/try \{ drawOperationalShotLines\(ctx, size\); \}/.test(HTML), 'B: слой стрелок подключён в redrawOperationalMapNow');
    ok(/snapshotOpShotLinesForNewTurn\(\)/.test(HTML), 'B: снимок делается при завершении оперативного хода');
    ok(/recordOpShotLine\(shooter, shotTarget/.test(HTML) && /recordOpShotLine\(shooter, atTarget/.test(HTML) &&
        /recordOpShotLine\(unit, aliveFirst\[0\]/.test(HTML) && /recordOpShotLine\(unit, victim/.test(HTML),
        'B: обстрелы (МГ, ПТО, миномёты, лёгкая артиллерия) записываются в журнал');
}

// ───────────────────── C: снабжение — обход, бой, запрет ─────────────────────
{
    const prologue = PROLOGUE + '\n' + sliceFunction(HTML, 'getOpHexNeighbors') + '\n' +
        HELPERS.map(n => sliceFunction(HTML, n)).join('\n\n');
    fs.writeFileSync('/tmp/wg_part.js', prologue);
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      function getOpMoveCost(unit, fc, fr, tc, tr) {
        if (tc < 0 || tr < 0 || tc > 7 || tr > 5) return Infinity;
        return 1;
      }
      var target = { name: 'Штурмовая рота', type: 'infantry', col: 5, row: 2, squads: [{ name: 'A', fighters: [{ hp: 3 }] }] };
      appData.campaign.opUnits = [target];
      // враг перекрывает ПРЯМУЮ дорогу, но не запирает получателя
      appData.campaign.enemyOpUnits = [
        { name: 'Заставa', col: 3, row: 2 },
        { name: 'Заставa-2', col: 4, row: 2 }
      ];
      appData.campaign.supply = { deliveries: [], stock: {}, max: {}, rearPointCaptured: false };
      var delivery = { kind: 'unit', targetUnitId: 0, status: 'outbound', col: 0, row: 2, mobility: 'foot', assets: [], cargo: { ammoSmall: 100, grenades: 0, ammoOrdnance: 0 } };
    `);
    ok(s.evalCtx('isOperationalUnitEncircled(appData.campaign.opUnits[0])') === false,
        'C/D: получатель не окружён — доставка разрешена');
    s.run('var route = findSupplyRoute(delivery, 5, 2);');
    ok(s.evalCtx('Array.isArray(route) && route.length > 0'), 'C: маршрут найден в обход перекрытой прямой дороги');
    ok(s.evalCtx("route.every(h => !(h.col === 3 && h.row === 2) && !(h.col === 4 && h.row === 2))"),
        'C: обходной маршрут не проходит через гексы противника');
    ok(s.evalCtx('route[route.length - 1].col === 5 && route[route.length - 1].row === 2'),
        'C: маршрут всё равно приводит к получателю');

    // получатель в бою
    s.run(`
      target.isInBattle = true;
      appData.campaign.__battleHexes = ['5,2'];
      var dest = supplyDeliveryDestination(delivery);
    `);
    ok(s.evalCtx('dest.inBattle') === true, 'C: получатель в бою — доставка не блокируется');
    ok(s.evalCtx('dest.col') === 5 && s.evalCtx('dest.row') === 2, 'C: цель доставки — гекс боя');
    s.run('var battleRoute = findSupplyRoute(delivery, 5, 2);');
    ok(s.evalCtx('Array.isArray(battleRoute) && battleRoute.length > 0'),
        'C: маршрут к гексу боя строится (гекс-цель не считается перекрытым)');

    // запрет: все пути отхода перекрыты
    s.run(`
      target.isInBattle = false;
      appData.campaign.__battleHexes = [];
      var neighbors = getOpHexNeighbors(5, 2);
      appData.campaign.enemyOpUnits = neighbors.map(function (n, i) { return { name: 'Блок-' + i, col: n.col, row: n.row }; });
      var cutReason = supplyRecipientCutOffReason(target);
      var cut = supplyRecipientIsCutOff(target);
    `);
    ok(s.evalCtx('cut') === true, 'C/D: все пути отхода перекрыты — доставка запрещена');
    ok(/пути отхода/.test(String(s.evalCtx('cutReason'))), 'C/D: причина запрета объясняет окружение',
        String(s.evalCtx('cutReason')));

    // пропуск одного выхода снимает запрет
    s.run(`appData.campaign.enemyOpUnits.pop(); cut = supplyRecipientIsCutOff(target);`);
    ok(s.evalCtx('cut') === false, 'C/D: один свободный выход — уже не окружение (нет ложного запрета)');

    // захват точки эвакуации
    s.run(`appData.campaign.supply.rearPointCaptured = true; cut = supplyRecipientIsCutOff(target);`);
    ok(s.evalCtx('cut') === true, 'D: захваченная точка эвакуации = окружение');
    ok(/эвакуац/.test(String(s.evalCtx('supplyRecipientCutOffReason(target)'))),
        'D: причина — захваченная точка эвакуации');
    ok(/supplyRecipientIsCutOff\(target\)/.test(HTML) && /recipient_encircled/.test(HTML),
        'C: advanceSupplyDeliveries отменяет доставку только при окружении');
    ok(/const deliveryBattle = \(typeof supplyBattleAtHex === 'function'\) \? supplyBattleAtHex\(target\) : null;/.test(HTML),
        'C: прибывший груз раздаётся отрядам боя');
    ok(!/waitingForBattle/.test(HTML), 'C: блокировка «ждём конца боя» удалена из снабжения');
}

// ───────────────────── D: окружение на оперативной карте ─────────────────────
{
    const prologue = PROLOGUE + '\n' + sliceFunction(HTML, 'getOpHexNeighbors') + '\n' +
        HELPERS.map(n => sliceFunction(HTML, n)).join('\n\n');
    fs.writeFileSync('/tmp/wg_part.js', prologue);
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      function getOpMoveCost(unit, fc, fr, tc, tr) { return 1; }
      var unit = { name: 'Рота', col: 4, row: 4, operationalMorale: 90 };
      appData.campaign.opUnits = [unit];
      appData.campaign.supply = { deliveries: [], stock: {}, max: {}, rearPointCaptured: false };
      appData.campaign.currentTurn = 3;
      var exits = opUnitExitAnalysis(unit);
    `);
    ok(s.evalCtx('exits.total') === 6, 'D: у гекса в центре карты 6 путей отхода');
    ok(s.evalCtx('isOperationalUnitEncircled(unit)') === false, 'D: открытые пути — не окружён');
    s.run(`
      appData.campaign.enemyOpUnits = getOpHexNeighbors(4, 4).slice(0, 2).map(function (n, i) { return { name: 'E' + i, col: n.col, row: n.row }; });
    `);
    ok(s.evalCtx('isOperationalUnitEncircled(unit)') === false,
        'D: два занятых выхода из шести — не окружение (нет ложного срабатывания)');
    s.run(`
      appData.campaign.enemyOpUnits = getOpHexNeighbors(4, 4).map(function (n, i) { return { name: 'E' + i, col: n.col, row: n.row }; });
      var changed = opRefreshEncirclementFlags({ applyMorale: true });
    `);
    ok(s.evalCtx('unit.encircled') === true, 'D: все 6 выходов заняты — статус «окружён»');
    ok(s.evalCtx('changed') === 1, 'D: смена статуса зафиксирована');
    ok(s.evalCtx('unit.operationalMorale') === 80, 'D4: первый ход окружения — дух −10',
        String(s.evalCtx('unit.operationalMorale')));
    s.run('appData.campaign.currentTurn = 4; opRefreshEncirclementFlags({ applyMorale: true });');
    ok(s.evalCtx('unit.operationalMorale') === 75, 'D4: каждый следующий ход окружения — дух −5',
        String(s.evalCtx('unit.operationalMorale')));
    s.run('opRefreshEncirclementFlags({ applyMorale: true });');
    ok(s.evalCtx('unit.operationalMorale') === 75, 'D4: за один ход дух списывается один раз');
    s.run('appData.campaign.enemyOpUnits = []; opRefreshEncirclementFlags({ applyMorale: true });');
    ok(s.evalCtx('unit.encircled') === false, 'D: пути освободились — статус снят');
    ok(/opRefreshEncirclementFlags\(\{ applyMorale: true \}\)/.test(HTML),
        'D: пересчёт статуса подключён к началу оперативного хода');
    ok(/drawOperationalEncirclementBadge\(ctx, unit, isEnemy, drawX, drawY, radius\)/.test(HTML),
        'D: на карте у окружённого юнита красный значок');
}

// ───────────── D3: окружение на тактической карте — кольцо отрядов ─────────────
// v13.145: прежнее правило «≥4 направлений» отменено. Теперь окружение — это
// замкнутое кольцо отрядов противника: между соседними отрядами кольца ≤4 гекса,
// а окружённый стоит внутри кольца. Дух: −10 сразу, −5 за завершённую свою фазу,
// при нуле — СДАЧА (не отступление).
{
    const prologue = PROLOGUE + '\n' + sliceFunction(HTML, 'getHexNeighbors') + '\n' +
        HELPERS.map(n => sliceFunction(HTML, n)).join('\n\n');
    fs.writeFileSync('/tmp/wg_part.js', prologue);
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      function addEnemy(name, col, row) {
        var e = { name: name, fighters: [{ hp: 3 }], currentMorale: 100, baseMorale: 100 };
        var idx = appData.map.enemySquads.push(e) - 1;
        var key = col + ',' + row;
        appData.map.grid[key] = appData.map.grid[key] || { squadIds: [], enemySquadIds: [] };
        appData.map.grid[key].enemySquadIds.push(idx);
        return idx;
      }
      function resetBattle() {
        appData.map = { grid: {}, enemySquads: [] };
        appData.squads = [];
        appData.currentTurn = 5;
        var player = { name: 'Отделение', fighters: [{ hp: 3 }], currentMorale: 100, baseMorale: 100 };
        appData.squads = [player];
        appData.map.grid['5,5'] = { squadIds: [0], enemySquadIds: [] };
        surrenderedCalls = [];
        return player;
      }
    `);

    // 1. Два врага рядом — кольца нет (нужно минимум 3 отряда).
    s.run(`
      var player = resetBattle();
      addEnemy('E1', 4, 4); addEnemy('E2', 7, 5);
      var stTwo = tacticalChainEncirclementForSide(true);
      var twoEncircled = stTwo.encircled.size;
      var statsTwo = updateTacticalEncirclement({});
    `);
    ok(s.evalCtx('twoEncircled') === 0, 'D3: два отряда не могут образовать кольцо');
    ok(s.evalCtx('statsTwo.player') === 0, 'D3: без кольца окружённых нет');

    // 2. Полное кольцо: (4,3) (4,4) (5,7) (7,4) вокруг игрока в (5,5).
    s.run(`
      var player = resetBattle();
      var ring = [[4,3],[4,4],[5,7],[7,4]];
      ring.forEach(function (p, i) { addEnemy('R' + i, p[0], p[1]); });
      var cycles = tacticalChainCycles(true);
      var st = tacticalChainEncirclementForSide(true);
      var stCount = st.encircled.size;
      var stCycles = st.cycles.length;
      var stats = updateTacticalEncirclement({});
      var moraleAfterFirst = player.currentMorale;
      var afterFlags = player.tacticalEncircled;
      var chainsOnMap = (appData.map.tacticalChains.enemy || []).length;
      var playerChainsOnMap = (appData.map.tacticalChains.player || []).length;
      // повторный пересчёт в той же фазе не должен списывать дух ещё раз
      updateTacticalEncirclement({});
      var moraleAfterRepeat = player.currentMorale;
      // завершение фазы игрока: −5
      appData.currentTurn = 6;
      updateTacticalEncirclement({ phaseSide: 'player' });
      var moraleAfterPhase = player.currentMorale;
    `);
    ok(s.evalCtx('cycles.length') > 0, 'D3: кольцо из 4 отрядов с шагом ≤4 гекса найдено');
    ok(s.evalCtx('stCount') === 1, 'D3: отряд внутри кольца признан окружённым');
    ok(s.evalCtx('stCycles') >= 1, 'D3: кольцо возвращается вместе со статусом');
    ok(s.evalCtx('afterFlags') === true, 'D3: флаг окружения выставлен на отряде');
    ok(s.evalCtx('moraleAfterFirst') === 90, 'D3: −10 духа сразу при замыкании кольца');
    ok(s.evalCtx('moraleAfterRepeat') === 90, 'D3: в той же фазе дух повторно не списывается');
    ok(s.evalCtx('moraleAfterPhase') === 85, 'D3: −5 за каждую завершённую фазу игрока');
    ok(s.evalCtx('chainsOnMap') >= 1, 'D3: кольцо противника сохранено на карте');
    ok(s.evalCtx('playerChainsOnMap') === 0, 'D3: игрок не получает чужое кольцо как своё');

    // 3. Разрыв кольца: одного отряда не хватает — статус снимается.
    s.run(`
      appData.map.enemySquads[3].isDestroyed = true;
      appData.map.grid['7,4'].enemySquadIds = [];
      var statsBreak = updateTacticalEncirclement({});
      var afterBreak = player.tacticalEncircled;
      var moraleAfterBreak = player.currentMorale;
    `);
    ok(s.evalCtx('statsBreak.player') === 0, 'D3: прорванное кольцо не окружение');
    ok(s.evalCtx('afterBreak') === false, 'D3: статус окружения снят после разрыва кольца');
    ok(s.evalCtx('moraleAfterBreak') === 85, 'D3: после разрыва дух больше не падает');

    // 4. Большой разрыв (>4 гексов) кольцом не считается.
    s.run(`
      var player = resetBattle();
      addEnemy('A', 4, 3); addEnemy('B', 4, 4); addEnemy('C', 5, 7); addEnemy('D', 12, 12);
      var gapStats = updateTacticalEncirclement({});
      var gapFlag = player.tacticalEncircled;
    `);
    ok(s.evalCtx('gapStats.player') === 0, 'D3: шаг кольца больше 4 гексов — не окружение');
    ok(s.evalCtx('gapFlag') === false, 'D3: флаг не выставлен при разомкнутой цепи');

    // 5. Дух 0 у окружённого — СДАЧА, а не отступление.
    s.run(`
      var player = resetBattle();
      [[4,3],[4,4],[5,7],[7,4]].forEach(function (p, i) { addEnemy('S' + i, p[0], p[1]); });
      player.currentMorale = 8;
      updateTacticalEncirclement({});
      var surrenderReasons = surrenderedCalls.map(function (c) { return c.reason; });
      var routing = !!player.isRouting;
    `);
    ok(s.evalCtx('surrenderReasons[0]') === 'encircled', 'D3: обнулённый дух в кольце — сдача, не отступление');
    ok(s.evalCtx('routing') === false, 'D3: окружённый отряд не помечается бегущим');

    // 6. Цепочка видна только окружающему: рисуем кольца лишь своей стороны.
    ok(/function drawTacticalChainRings/.test(HTML), 'D3: кольцо рисуется отдельной функцией');
    ok(/map\.tacticalChains\.player/.test(HTML) || /\(map\.tacticalChains\.player \|\| \[\]\)/.test(HTML),
        'D3: на карте рисуются только кольца игрока (окружённый видит лишь уведомление)');
    ok(/function tacticalEncirclementNotice/.test(HTML), 'D3: окружённому показывается уведомление');
    ok(/updateTacticalEncirclement\(\{[^}]*phaseSide: completedSide/.test(HTML),
        'D3: пересчёт на границе тактических фаз передаёт завершившую фазу сторону');
    ok(/drawTacticalEncirclementMark/.test(HTML), 'D3: окружённый отряд помечен на тактической карте');
    ok(/tacticalSurrenderUnit\(squad, side, index, 'encircled'\)/.test(HTML),
        'D3: при нулевом духе в кольце отряд сдаётся');
}

// ─────────────────── общие требования к версии/логике ───────────────────
{
    ok(/const TACTICAL_CHAIN_MAX_GAP = 4;/.test(HTML), 'D3: шаг кольца (≤4 гекса) задан в одном месте');
    ok(!/TACTICAL_ENCIRCLE_MIN_DIRECTIONS/.test(HTML), 'D3: старая система «≥4 направлений» удалена');
    ok(/encirclementMoraleTurn/.test(HTML), 'D4: давление на дух от окружения — раз в ход');
    ok(!/if \(surrounded\) changeOperationalMorale\(unit, -10, 'окружение'\);/.test(HTML),
        'D4: старый двойной штраф за окружение убран');
}

console.log(`\n== итог: ${pass} ok, ${fail} fail ==`);
process.exit(fail ? 1 : 0);
