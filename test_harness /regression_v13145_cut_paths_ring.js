'use strict';
// ⚡ v13.145: новый приказ «Перерезать пути» (оперативная карта).
//    Игрок выбирает 3 СМЕЖНЫХ гекса цепочкой; взвод встаёт на средний гекс,
//    все три гекса становятся контролируемыми противником. Замкнутое кольцо
//    из таких гексов вокруг вражеского взвода = окружение: дух −10 сразу,
//    −5 за каждый следующий оперативный ход.
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}
const UI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');

const HELPERS = [
    'opCampaignSideUnits', 'opUnitCampaignSide', 'opCutPathsReleaseReason', 'opCutPathsRelease',
    'opCutPathsHeldByUnit', 'opCutPathHexList', 'opEnemyCutPathHexes', 'opHexIsCutByEnemy',
    'opCutPathsOwnersOfHex', 'opResolveCutPathsContacts',
    'opHexKeyOf', 'opNormalizeHexKeys', 'opPlayerCutPathHexes', 'opHexIsCutByPlayer',
    'opHexChainIsAdjacent', 'opCutPathRings', 'opHexInsideRing', 'opRefreshCutPathsEncirclement',
    'executeCutPathsOrder',
    'tacticalChainPointFor', 'tacticalPolygonArea', 'tacticalSegmentsCross',
    'tacticalPolygonIsSimple', 'tacticalPointInPolygon',
    'getOpHexDistance'
];

const PROLOGUE = `
var OP_CUT_PATHS_HEXES = 3;
var OP_CUT_PATHS_RING_MAX_HEXES = 18;
var OP_CUT_PATHS_RINGS_LIMIT = 40;
function changeOperationalMorale(unit, delta) {
    unit.operationalMorale = Math.max(0, (Number(unit.operationalMorale) || 100) + delta);
    moraleChanges.push({ name: unit.name, delta: delta });
    return unit.operationalMorale;
}
var moraleChanges = [];
var opCutPathsReleasingFlag = false;
function opTryCutPathsInterception() { return false; }
function startTacticalBattle() { return true; }
function opRecordPrevPos() {}
var stepCalls = [];
function stepUnitTowardTarget(unit, targetCol, targetRow) {
    stepCalls.push({ name: unit.name, col: targetCol, row: targetRow });
    if (stepCalls.blocked) return 'no_route';
    unit.col = targetCol;
    unit.row = targetRow;
    return 'reached';
}
`;

{
    const prologue = PROLOGUE + '\n' + HELPERS.map(n => sliceFunction(HTML, n)).join('\n\n') + '\n' +
        '';
    fs.writeFileSync('/tmp/wg_part.js', prologue);
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      appData.campaign.currentTurn = 3;
      appData.campaign.opUnits = [
        { name: 'Пехота 1', col: 1, row: 1, ap: 4, cutPathHexes: ['6,5','6,4','5,4'] },
        { name: 'Пехота 2', col: 2, row: 2, ap: 4, cutPathHexes: ['4,5','5,6','6,6'] }
      ];
      appData.campaign.enemyOpUnits = [
        { name: 'Враг в кольце', col: 5, row: 5, operationalMorale: 100 },
        { name: 'Враг снаружи', col: 9, row: 9, operationalMorale: 100 }
      ];
    `);

    // 1. Цепочка из трёх смежных гексов.
    s.run(`
      var chainOk = opHexChainIsAdjacent(['4,4','4,5','5,6']);
      var chainBad = opHexChainIsAdjacent(['0,0','7,7','1,1']);
      var chainShort = opHexChainIsAdjacent(['4,4','4,5']);
    `);
    ok(s.evalCtx('chainOk') === true, 'цепочка из трёх смежных гексов принимается');
    ok(s.evalCtx('chainBad') === false, 'несмежные гексы отвергаются');
    ok(s.evalCtx('chainShort') === false, 'два гекса — не приказ «перерезать пути»');

    // 2. Перерезанные гексы известны и блокируют проход.
    s.run(`
      var cutCount = opPlayerCutPathHexes().length;
      var cutYes = opHexIsCutByPlayer(6, 5);
      var cutNo = opHexIsCutByPlayer(9, 9);
    `);
    ok(s.evalCtx('cutCount') === 6, 'шесть перерезанных гексов от двух взводов');
    ok(s.evalCtx('cutYes') === true, 'перерезанный гекс определяется');
    ok(s.evalCtx('cutNo') === false, 'свободный гекс не считается перерезанным');

    // 3. Замкнутое кольцо вокруг врага.
    s.run(`
      var rings = opCutPathRings();
      var ringCount = rings.length;
      var inside = opHexInsideRing(5, 5, rings[0]);
      var outside = opHexInsideRing(9, 9, rings[0]);
      var onRing = opHexInsideRing(6, 5, rings[0]);
      var st = opRefreshCutPathsEncirclement({ applyMorale: true });
    `);
    ok(s.evalCtx('ringCount') >= 1, 'кольцо из перерезанных гексов найдено');
    ok(s.evalCtx('inside') === true, 'враг в центре кольца окружён');
    ok(s.evalCtx('outside') === false, 'враг вне кольца не окружён');
    ok(s.evalCtx('onRing') === false, 'гекс самого кольца не считается «внутри»');
    ok(s.evalCtx('st.encircled') === 1, 'окружён ровно один вражеский взвод');
    ok(s.evalCtx("appData.campaign.enemyOpUnits[0].cutPathsEncircled") === true,
        'у окружённого взвода выставлен флаг');
    ok(s.evalCtx("appData.campaign.enemyOpUnits[1].cutPathsEncircled") === false,
        'взвод вне кольца без флага');
    ok(s.evalCtx("appData.campaign.enemyOpUnits[0].operationalMorale") === 90,
        'при замыкании кольца дух −10');

    // 4. Давление на дух — раз в ход, дальше −5.
    s.run(`
      opRefreshCutPathsEncirclement({ applyMorale: true });
      var moraleSameTurn = appData.campaign.enemyOpUnits[0].operationalMorale;
      appData.campaign.currentTurn = 4;
      opRefreshCutPathsEncirclement({ applyMorale: true });
      var moraleNextTurn = appData.campaign.enemyOpUnits[0].operationalMorale;
    `);
    ok(s.evalCtx('moraleSameTurn') === 90, 'в том же ходу дух повторно не списывается');
    ok(s.evalCtx('moraleNextTurn') === 85, 'за следующий ход окружения дух −5');

    // 5. Кольцо прорвано — статус снимается.
    s.run(`
      appData.campaign.opUnits[1].cutPathHexes = [];
      var stBroken = opRefreshCutPathsEncirclement({ applyMorale: true });
      var flagAfter = appData.campaign.enemyOpUnits[0].cutPathsEncircled;
      var moraleAfter = appData.campaign.enemyOpUnits[0].operationalMorale;
    `);
    ok(s.evalCtx('stBroken.encircled') === 0, 'прорванное кольцо не окружение');
    ok(s.evalCtx('flagAfter') === false, 'флаг окружения снят');
    ok(s.evalCtx('moraleAfter') === 85, 'после прорыва дух не падает');

    // 6. Исполнение приказа: взвод идёт на СРЕДНИЙ гекс цепочки.
    s.run(`
      var unit = { name: 'Штурмовики', col: 1, row: 1, ap: 5 };
      appData.campaign.opUnits.push(unit);
      var order = { type: 'cut_paths', status: 'active', targetHexes: ['4,4','4,5','5,6'], cutPathsMiddle: '4,5' };
      executeCutPathsOrder(unit, order);
      var afterStatus = order.status;
      var placedCol = unit.col, placedRow = unit.row;
      var marks = (unit.cutPathHexes || []).slice();
    `);
    ok(s.evalCtx('afterStatus') === 'completed', 'приказ выполняется сразу, если взвод дошёл');
    ok(s.evalCtx('placedCol') === 4 && s.evalCtx('placedRow') === 5, 'взвод встаёт на средний гекс цепочки');
    ok(JSON.stringify(s.evalCtx('marks')) === JSON.stringify(['4,4', '4,5', '5,6']),
        'все три гекса помечены как перерезанные', JSON.stringify(s.evalCtx('marks')));

    // 7. Неверная цепочка — приказ отменяется, гексы не помечаются.
    s.run(`
      var badUnit = { name: 'Плохой', col: 1, row: 1, ap: 5 };
      var badOrder = { type: 'cut_paths', status: 'active', targetHexes: ['0,0','7,7','1,1'] };
      executeCutPathsOrder(badUnit, badOrder);
      var badStatus = badOrder.status;
      var badMarks = badUnit.cutPathHexes || null;
    `);
    ok(s.evalCtx('badStatus') === 'cancelled', 'несмежные гексы — приказ отменён');
    ok(s.evalCtx('badMarks') === null, 'при отмене гексы не перерезаются');
}

// ─────────────── подключение приказа к движку и интерфейсу ───────────────
{
    ok(/case 'cut_paths':/.test(HTML), 'приказ «cut_paths» есть в исполнителе приказов');
    ok(/executeCutPathsOrder\(unit, order\)/.test(HTML), 'исполнитель приказа вызывается из executeOrder');
    ok(/function executeCutPathsOrder/.test(HTML), 'реализован executeCutPathsOrder');
    ok(/'cut_paths': '✂️ Перерезать пути'/.test(HTML), 'приказ имеет понятное название в журнале');
    ok(/opRefreshCutPathsEncirclement\(\{ applyMorale: true \}\)/.test(HTML),
        'давление на дух окружённых путями подключено к ходу');
    ok(/drawOperationalCutPaths\(ctx, size\)/.test(HTML), 'перерезанные пути рисуются на оперативной карте');
    ok(/typeof opHexIsCutByPlayer === 'function'/.test(HTML) && /cutting\(Number\(toCol\), Number\(toRow\)\)/.test(HTML),
        'перерезанные пути непроходимы для противника');
    ok(/'cut_paths': '✂️ Перерезать пути'/.test(HTML) && /cutPathsMiddle/.test(HTML),
        'средний гекс цепочки сохраняется в приказе');
    ok(/const OP_CUT_PATHS_HEXES = 3;/.test(HTML), 'размер приказа — ровно 3 гекса');

    // интерфейс: отдельный пункт «Специальное» + выбор трёх гексов на карте
    ok(/\['cut_paths', '✂️ Перерезать пути'\]/.test(UI), 'пункт меню «Перерезать пути» в интерфейсе');
    ok(/action === 'cut_paths'/.test(UI), 'доступность приказа проверяется в canIssueSpecial');
    ok(/state\.mapPick === 'cutpaths'/.test(UI), 'выбор гексов на карте для приказа');
    ok(/function opDraftCutToggleHex/.test(UI), 'выбор трёх смежных гексов цепочкой');
    ok(/type = 'cut_paths'/.test(UI), 'тип приказа формируется в parseDraftOptions');
    ok(/options\.cutPathsMiddle = keys\[1\]/.test(UI), 'средний гекс передаётся в приказ');
}

// ─────────────── п.2: серия приказов только внутри одного хода ───────────────
{
    ok(/Number\(order\.turnIssued\) !== Number\(campaign\(\)\.currentTurn \|\| 1\)\) return null;/.test(UI),
        'приказ следующего хода не дописывается в серию другого хода');
    ok(/Number\(o\.turnIssued\) === turn/.test(UI), 'appendTurnOrder ищет приказы только текущего хода');
    ok(/operationalOrderWaitsForPredecessor/.test(HTML), 'исполнение ждёт предыдущий приказ получателя');
}

console.log(`\n== итог v13.145 (перерезать пути): ${pass} ok, ${fail} fail ==`);
// Песочница других регрессий читает /tmp/wg_part.js — не оставляем мусор.
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}
process.exit(fail ? 1 : 0);
