'use strict';
// ⚡ v13.146: механика «перерезания путей» — что её прерывает и что нет.
//
//   • Враг, вошедший на подконтрольный гекс (даже если просто шёл через него),
//     получает тактический бой ИМЕННО в этом гексе: заслон выдвигается туда.
//   • Перерезание прекращается ТОЛЬКО если взвод отступил по духу, побеждён
//     или уничтожен в бою, либо получил другой приказ вне своих гексов.
//   • Внутри своих трёх гексов взвод может ходить, окапываться, расчищать
//     местность и вести разведку — перерезание сохраняется.
const fs = require('fs');
const path = require('path');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

const HELPERS = [
    'opHexKeyOf', 'opNormalizeHexKeys', 'opCampaignSideUnits', 'opUnitCampaignSide',
    'opCutPathsReleaseReason', 'opCutPathsRelease', 'opCutPathsHeldByUnit', 'opCutPathHexList',
    'opPlayerCutPathHexes', 'opEnemyCutPathHexes', 'opHexIsCutByPlayer', 'opHexIsCutByEnemy',
    'opHexChainIsAdjacent', 'opCutPathRings', 'opHexInsideRing', 'opRefreshCutPathsEncirclement',
    'opCutPathsOrderHexKeys', 'opCutPathsOrderKeepsCut', 'opCutPathsApplyNewOrder',
    'opCutPathsOwnersOfHex', 'opTryCutPathsInterception', 'opResolveCutPathsContacts',
    'tacticalChainPointFor', 'tacticalPolygonArea', 'tacticalSegmentsCross',
    'tacticalPolygonIsSimple', 'tacticalPointInPolygon', 'getOpHexDistance'
];

const PROLOGUE = `
var OP_CUT_PATHS_HEXES = 3;
var OP_CUT_PATHS_RING_MAX_HEXES = 18;
var OP_CUT_PATHS_RINGS_LIMIT = 40;
var OP_CUT_PATHS_KEEPING_ORDERS = ['move', 'recon', 'dig_in', 'prep_positions', 'hold', 'defend', 'cut_paths', 'series'];
var opCutPathsReleasingFlag = false;
var battleCalls = [];
function startTacticalBattle(playerUnits, enemyUnits, opts) {
    battleCalls.push({
        hex: (opts && opts.battleHexKey) || null,
        player: (playerUnits || []).map(u => u && u.name),
        enemy: (enemyUnits || []).map(u => u && u.name)
    });
    return true;
}
function opRecordPrevPos() {}
function changeOperationalMorale(unit, delta) {
    unit.operationalMorale = Math.max(0, (Number(unit.operationalMorale) || 100) + delta);
    return unit.operationalMorale;
}
function getOrderTypeLabel(type) {
    const names = { move: 'Движение', attack: 'Атака', dig_in: 'Окопаться', prep_positions: 'Подготовка позиций',
        recon: 'Разведка', hold: 'Удержание', cut_paths: 'Перерезать пути' };
    return names[type] || type;
}
`;

{
    const prologue = PROLOGUE + '\n' + HELPERS.map(n => sliceFunction(HTML, n)).join('\n\n');
    fs.writeFileSync('/tmp/wg_part.js', prologue);
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      appData.campaign.currentTurn = 3;
      function makeUnit(name, col, row, hexes) {
        return { name: name, col: col, row: row, ap: 4, maxAp: 4, cutPathHexes: hexes || [] };
      }
      appData.campaign.opUnits = [];
      appData.campaign.enemyOpUnits = [];
    `);

    // ─── 1. Состояние перерезания: жив / отступил / уничтожен ───
    s.run(`
      var alive = makeUnit('Заслон', 5, 5, ['4,4','5,5','6,5']);
      appData.campaign.opUnits.push(alive);
      var reasonAlive = opCutPathsReleaseReason(alive);
      var heldAlive = opCutPathsHeldByUnit(alive).length;

      var routed = makeUnit('Отступивший', 5, 5, ['1,1','1,2','1,3']);
      routed.operationalRouted = true;
      appData.campaign.opUnits.push(routed);
      var releasedRouted = opCutPathsHeldByUnit(routed).length;
      var routedReason = routed.cutPathsReleaseReason;

      var beaten = makeUnit('Разбитый', 5, 5, ['2,1','2,2','2,3']);
      beaten.isDestroyed = true;
      appData.campaign.opUnits.push(beaten);
      var releasedBeaten = opCutPathsHeldByUnit(beaten).length;
    `);
    ok(s.evalCtx('reasonAlive') === '', 'живой взвод держит перерезание');
    ok(s.evalCtx('heldAlive') === 3, 'у живого взвода три подконтрольных гекса');
    ok(s.evalCtx('releasedRouted') === 0, 'при падении духа и отступлении перерезание снимается');
    ok(/боевой дух/.test(String(s.evalCtx('routedReason'))), 'причина снятия — падение духа',
        String(s.evalCtx('routedReason')));
    ok(s.evalCtx('releasedBeaten') === 0, 'уничтоженный в бою взвод перерезание не держит');

    // ─── 2. Приказы внутри своих гексов — сохраняют, вне — снимают ───
    s.run(`
      var gate = makeUnit('Внутри', 5, 5, ['4,4','5,5','6,5']);
      appData.campaign.opUnits.push(gate);
      battleCalls = [];
      var keepsDigIn = opCutPathsOrderKeepsCut(gate, { type: 'dig_in', targetHex: '5,5' });
      var keepsPrep = opCutPathsOrderKeepsCut(gate, { type: 'prep_positions', targetHex: '4,4' });
      var keepsMoveInside = opCutPathsOrderKeepsCut(gate, { type: 'move', targetHex: '6,5', waypoints: [{ col: 4, row: 4 }] });
      var keepsMoveOutside = opCutPathsOrderKeepsCut(gate, { type: 'move', targetHex: '9,9', waypoints: [{ col: 6, row: 5 }] });
      var keepsAttack = opCutPathsOrderKeepsCut(gate, { type: 'attack', targetHex: '5,5' });
      var keepsSeriesInside = opCutPathsOrderKeepsCut(gate, { type: 'series', series: [
        { type: 'move', targetHex: '4,4', status: 'pending' }, { type: 'dig_in', targetHex: '4,4', status: 'pending' }] });
      var keepsSeriesOutside = opCutPathsOrderKeepsCut(gate, { type: 'series', series: [
        { type: 'move', targetHex: '9,9', status: 'pending' }] });
      var appliedInside = opCutPathsApplyNewOrder(gate, { type: 'dig_in', targetHex: '5,5' });
      var stillHeld = opNormalizeHexKeys(gate.cutPathHexes).length;
      var appliedOutside = opCutPathsApplyNewOrder(gate, { type: 'attack', targetHex: '9,9' });
      var heldAfterAttack = opNormalizeHexKeys(gate.cutPathHexes).length;
    `);
    ok(s.evalCtx('keepsDigIn') === true, 'окапывание на своём гексе сохраняет перерезание');
    ok(s.evalCtx('keepsPrep') === true, 'расчистка местности на своём гексе сохраняет перерезание');
    ok(s.evalCtx('keepsMoveInside') === true, 'перемещение внутри трёх гексов сохраняет перерезание');
    ok(s.evalCtx('keepsMoveOutside') === false, 'маршрут за пределы гексов снимает перерезание');
    ok(s.evalCtx('keepsAttack') === false, 'атака снимает перерезание');
    ok(s.evalCtx('keepsSeriesInside') === true, 'серия внутри своих гексов сохраняет перерезание');
    ok(s.evalCtx('keepsSeriesOutside') === false, 'серия с выходом наружу снимает перерезание');
    ok(s.evalCtx('appliedInside') === false && s.evalCtx('stillHeld') === 3,
        'приказ внутри гексов не снимает перерезание');
    ok(s.evalCtx('appliedOutside') === true && s.evalCtx('heldAfterAttack') === 0,
        'другой приказ вне гексов снимает перерезание');

    // ─── 3. Перехват: враг вошёл на подконтрольный гекс ───
    s.run(`
      appData.campaign.opUnits = [];
      appData.campaign.enemyOpUnits = [];
      battleCalls = [];
      var blocker = makeUnit('Заслон-2', 5, 5, ['4,4','5,5','6,5']);
      appData.campaign.opUnits.push(blocker);
      var intruder = { name: 'Пехота врага', col: 6, row: 5, ap: 4 };
      appData.campaign.enemyOpUnits.push(intruder);
      var intercepted = opTryCutPathsInterception(intruder);
      var blockerHex = blocker.col + ',' + blocker.row;
      var heldAfterIntercept = opNormalizeHexKeys(blocker.cutPathHexes).length;
    `);
    ok(s.evalCtx('intercepted') === true, 'враг на подконтрольном гексе — перехват');
    ok(JSON.stringify(s.evalCtx('battleCalls')) !== '[]', 'тактический бой действительно начат');
    ok(s.evalCtx('battleCalls[0].hex') === '6,5', 'бой идёт ИМЕННО в подконтрольном гексе',
        String(s.evalCtx('battleCalls[0] && JSON.stringify(battleCalls[0])')));
    ok(s.evalCtx('battleCalls[0].player[0]') === 'Заслон-2', 'в бою участвует наш взвод-заслон');
    ok(s.evalCtx('blockerHex') === '6,5', 'заслон выдвинулся в гекс вторжения');
    ok(s.evalCtx('heldAfterIntercept') === 3, 'перерезание сохраняется после перехвата');

    // ─── 4. Свободный гекс и свой собственный взвод — не перехват ───
    s.run(`
      battleCalls = [];
      var freeHexIntruder = { name: 'Враг мимо', col: 11, row: 11, ap: 4 };
      appData.campaign.enemyOpUnits.push(freeHexIntruder);
      var noIntercept = opTryCutPathsInterception(freeHexIntruder);
      var ownOnHex = { name: 'Свой на гексе', col: 4, row: 4, ap: 4 };
      appData.campaign.opUnits.push(ownOnHex);
      var selfIntercept = opTryCutPathsInterception(ownOnHex);
    `);
    ok(s.evalCtx('noIntercept') === false, 'на свободном гексе перехвата нет');
    ok(s.evalCtx('selfIntercept') === false, 'свой взвод на своём гексе боя не вызывает');

    // ─── 5. Контакт на начало хода: проверка всех стоящих ───
    s.run(`
      battleCalls = [];
      appData.campaign.opUnits = [];
      appData.campaign.enemyOpUnits = [];
      var keeper = makeUnit('Заслон-3', 5, 5, ['3,3','3,4','3,5']);
      appData.campaign.opUnits.push(keeper);
      var sitOnHex = { name: 'Враг стоит на гексе', col: 3, row: 4, ap: 0 };
      appData.campaign.enemyOpUnits.push(sitOnHex);
      var swept = opResolveCutPathsContacts();
      var keeperHex = keeper.col + ',' + keeper.row;
    `);
    ok(s.evalCtx('swept') === 1, 'проверка контактов находит стоящего на гексе врага');
    ok(s.evalCtx('battleCalls.length') >= 1, 'начался бой на подконтрольном гексе');
    ok(s.evalCtx('keeperHex') === '3,4', 'бой идёт в гексе, а не на среднем гексе цепочки');

    // ─── 6. Кольцо окружения работает и для пути, удержанного через контроль ───
    s.run(`
      appData.campaign.opUnits = [];
      appData.campaign.enemyOpUnits = [];
      appData.campaign.opUnits.push(makeUnit('Кольцо A', 6, 6, ['6,5','6,4','5,4']));
      appData.campaign.opUnits.push(makeUnit('Кольцо B', 6, 6, ['4,5','5,6','6,6']));
      var victim = { name: 'Враг в кольце', col: 5, row: 5, operationalMorale: 100 };
      appData.campaign.enemyOpUnits.push(victim);
      var ringStats = opRefreshCutPathsEncirclement({ applyMorale: true });
      var victimMorale = victim.operationalMorale;
    `);
    ok(s.evalCtx('ringStats.encircled') === 1, 'враг внутри кольца окружён');
    ok(s.evalCtx('victimMorale') === 90, 'окружённому −10 к духу');

    // ─── 7. Отступивший заслон кольцо не держит ───
    s.run(`
      appData.campaign.opUnits[1].operationalRouted = true;
      appData.campaign.currentTurn = 4;
      var brokenStats = opRefreshCutPathsEncirclement({ applyMorale: true });
      var victimAfter = victim.operationalMorale;
      var victimFlag = victim.cutPathsEncircled;
    `);
    ok(s.evalCtx('brokenStats.encircled') === 0, 'отступивший взвод перерезание не держит — кольцо распалось');
    ok(s.evalCtx('victimAfter') === 90, 'окружение снято — дух больше не падает');
    ok(s.evalCtx('victimFlag') === false, 'флаг окружения снят');
}

// ─────────────── исходники: подключение к движку и интерфейсу ───────────────
{
    const UI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
    ok(/function opCutPathsReleaseReason/.test(HTML), 'реализованы причины снятия перерезания');
    ok(/function opCutPathsHeldByUnit/.test(HTML), 'перерезание держится только живым взводом');
    ok(/function opTryCutPathsInterception/.test(HTML), 'реализован перехват на подконтрольном гексе');
    ok(/function opResolveCutPathsContacts/.test(HTML), 'реализована проверка контактов');
    ok(/function opCutPathsApplyNewOrder/.test(HTML), 'приказ вне своих гексов снимает перерезание');
    ok(/opTryCutPathsInterception\(unit\)/.test(HTML), 'перехват встроен в движение по карте');
    ok(/opResolveCutPathsContacts\(\)/.test(HTML), 'проверка контактов вызывается на границе хода');
    ok(/opCutPathsApplyNewOrder\(unit, order\)/.test(HTML), 'гейт приказов встроен в executeOrder');
    ok(/OP_CUT_PATHS_KEEPING_ORDERS/.test(HTML), 'список приказов, сохраняющих перерезание');
    ok(/typeof opHexIsCutByEnemy === 'function'/.test(HTML) && /cutting\(Number\(toCol\), Number\(toRow\)\)/.test(HTML),
        'перерезания противника непроходимы для игрока');
    ok(/cutPathsReleasedTurn/.test(HTML) && /cutPathsReleaseReason/.test(HTML),
        'состояние снятия перерезания сохраняется');
    ok(/function cutPathsMenuNote/.test(UI), 'в меню приказов видно, какие гексы перерезаны');
    ok(/перерезание сохраняется/.test(UI), 'игроку объяснено, что сохраняет перерезание');
}

console.log(`\n== итог v13.146 (перерезание путей: контроль): ${pass} ok, ${fail} fail ==`);
// Песочница других регрессий читает /tmp/wg_part.js — не оставляем мусор.
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}
process.exit(fail ? 1 : 0);
