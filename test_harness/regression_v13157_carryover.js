// ⚡ v13.157: регрессия по пунктам, которые оставались без покрытия —
//    п.4 (перерезанная линия: видна, восстановление связистами),
//    п.5 (коммутатор в штабе роты, два участка по 7 гексов),
//    п.7 (помехи 20 % в горах/лесу + выбор «посыльный / повторить»),
//    п.12 (при выборе взвода — только его приказы),
//    п.15 (цепочка маршрутов от конца предыдущего приказа),
//    п.21 (приказы выполняются последовательно),
//    а также кнопки «🔍 Разведка» в карточке юнита (v13.157).
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail !== undefined ? ' | ' + detail : '')); }
}
const sliceOf = name => sliceFunction(HTML, name);

function base(appData) {
    const s = createSandbox(appData || freshAppData());
    s.run(`
var currentTurn = 1;
function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }
function getOpHexNeighbors(col, row) {
    return [{col: col + 1, row: row}, {col: col - 1, row: row}, {col: col, row: row + 1}, {col: col, row: row - 1}];
}
function isHexInPlayableArea() { return true; }
function getOpHexTypes() { return ['grass']; }
function redrawOperationalMap() {}
function saveData() {}
function updateUI() {}
`);
    return s;
}

console.log('== v13.157: пункты 4/5/7/12/15/21 и кнопка разведки ==');

// ───────────────────── п.4: перерезанная линия ─────────────────────
{
    ok(/line\.intact/.test(HTML) && /lineCut/.test(sliceOf('redrawOperationalMapNow')),
       'п.4: оборванная линия остаётся на карте с пометкой (lineCut)');
    const draw = (function () {
        const i = HTML.indexOf('телефонные кабели рисуются по фактическому маршруту');
        return HTML.slice(i, i + 3000);
    })();
    ok(/lineCut \? '#ff5a5a'/.test(draw), 'п.4: перерезанная линия рисуется красным');
    ok(/ctx\.setLineDash\(line\.laying \? \[6, 4\] : \[3, 3\]\)/.test(draw),
       'п.4: оборванная линия не исчезает (пунктир сохраняется)');

    // связисты потеряны → линия отключается
    const s = base();
    s.run(`
hardMode = { enabled: true, phoneLines: [], signalPlatoon: null };
function hasActivePhoneAt() { return false; }
function refreshSignalLosses() {}
var __logs = []; log = (m) => { __logs.push(String(m)); };
appData.campaign.opUnits = [{ name: 'Штаб батальона', type: 'battalion_hq', col: 4, row: 4 },
                            { name: '1-й взвод', type: 'infantry_platoon', col: 6, row: 4 }];
hardMode.phoneLines = [{ id: 'l1', fromUnitId: 0, toUnitId: 1, intact: true, path: [{col:4,row:4},{col:5,row:4},{col:6,row:4}] }];
`);
    s.run(sliceOf('checkPhoneLinesIntact'));
    s.run('checkPhoneLinesIntact();');
    ok(s.evalCtx('hardMode.phoneLines[0].intact') === false,
       'п.4: без действующих связистов линия обрывается');
    ok(s.evalCtx('__logs.some(l => /нет действующей команды связистов/.test(l))') === true,
       'п.4: обрыв объясняется потерей команды связистов');

    // враг на линии → обрыв
    const s2 = base();
    s2.run(`
hardMode = { enabled: true, phoneLines: [] };
function hasActivePhoneAt() { return true; }
function refreshSignalLosses() {}
var __logs = []; log = (m) => { __logs.push(String(m)); };
appData.campaign.opUnits = [{ name: 'Штаб батальона', type: 'battalion_hq', col: 4, row: 4 },
                            { name: '1-й взвод', type: 'infantry_platoon', col: 6, row: 4 }];
appData.campaign.enemyOpUnits = [{ name: 'Враг', col: 5, row: 4, detected: true, hidden: false, isInBattle: false }];
hardMode.phoneLines = [{ id: 'l1', fromUnitId: 0, toUnitId: 1, intact: true, path: [{col:4,row:4},{col:5,row:4},{col:6,row:4}] }];
`);
    s2.run(sliceOf('normalizePhoneRoutePoints'));
    s2.run(sliceOf('phoneLinePathHexKeys'));
    s2.run(sliceOf('isHexOnLine'));
    s2.run(sliceOf('checkPhoneLinesIntact'));
    s2.run('checkPhoneLinesIntact();');
    ok(s2.evalCtx('hardMode.phoneLines[0].intact') === false, 'п.4: враг на линии связи рвёт кабель');
    ok(s2.evalCtx("__logs.some(l => /Враг .* на линии связи/.test(l))") === true,
       'п.4: в лог записано, кто перерезал линию');

    // связь после перекладки восстанавливается
    ok(/line\.intact = true;/.test(sliceOf('checkPhoneLinesIntact')) &&
       /reconnectedAtTurn/.test(sliceOf('checkPhoneLinesIntact')),
       'п.4: связисты перекладывают кабель и линия снова intact');
}

// ───────────────────── п.5: коммутатор роты, 7 + 7 ─────────────────────
{
    const s = base();
    s.run(sliceConst(HTML, 'SWITCHBOARD_SEGMENT_STEPS'));
    s.run(sliceConst(HTML, 'SWITCHBOARD_TOTAL_STEPS'));
    s.run(sliceConst(HTML, 'PHONE_LINE_MAX_STEPS'));
    ok(s.evalCtx('SWITCHBOARD_SEGMENT_STEPS') === 7, 'п.5: участок кабеля — 7 гексов');
    ok(s.evalCtx('SWITCHBOARD_TOTAL_STEPS') === 14, 'п.5: через коммутатор — 7 + 7 = 14 гексов');
    s.run(sliceOf('isSwitchboardUnit'));
    ok(s.evalCtx("isSwitchboardUnit({ type: 'company_hq', name: 'Штаб роты №1' })") === true,
       'п.5: штаб роты — коммутатор');
    ok(s.evalCtx("isSwitchboardUnit({ type: 'battalion_hq', name: 'Штаб батальона' })") === false,
       'п.5: штаб батальона коммутатором не считается');
    s.run(sliceOf('phoneRouteSegmentsFit'));
    const straight = Array.from({ length: 8 }, (_, i) => ({ col: i, row: 0 }));
    const longWithSwitch = Array.from({ length: 15 }, (_, i) => ({ col: i, row: 0 }));
    ok(s.evalCtx(`phoneRouteSegmentsFit(${JSON.stringify(straight)}, -1)`) === true,
       'п.5: без коммутатора 7 гексов кабеля — можно');
    ok(s.evalCtx(`phoneRouteSegmentsFit(${JSON.stringify(longWithSwitch)}, -1)`) === false,
       'п.5: без коммутатора 14 гексов — нельзя');
    ok(s.evalCtx(`phoneRouteSegmentsFit(${JSON.stringify(longWithSwitch)}, 7)`) === true,
       'п.5: через коммутатор в середине — 7 + 7 разрешено');
    ok(s.evalCtx(`phoneRouteSegmentsFit(${JSON.stringify(longWithSwitch)}, 5)`) === false,
       'п.5: перекос участков (5 + 9) запрещён');
}

// ───────────────────── п.7: помехи и выбор способа ─────────────────────
{
    const s = base();
    s.run(sliceConst(HTML, 'RADIO_JAM_CHANCE'));
    ok(s.evalCtx('RADIO_JAM_CHANCE') === 0.2, 'п.7: вероятность помех — 20 %');
    s.run(sliceOf('radioJamTerrainOf'));
    s.run(sliceOf('radioJamRoll'));
    s.run(`
function getOpHexTypes(col, row) { return (__terrain || ['grass']); }
var __terrain = ['grass'];
`);
    s.run('Math.random = () => 0.10; globalThis.__jamHill = (__terrain = ["hill"], radioJamRoll({ col: 1, row: 1 }));');
    s.run('globalThis.__jamForest = (__terrain = ["forest"], radioJamRoll({ col: 1, row: 1 }));');
    s.run('globalThis.__jamGrass = (__terrain = ["grass"], radioJamRoll({ col: 1, row: 1 }));');
    ok(s.evalCtx('__jamHill.jammed') === true, 'п.7: в горах помехи возможны');
    ok(s.evalCtx('__jamForest.jammed') === true, 'п.7: в лесу помехи возможны');
    ok(s.evalCtx('__jamGrass.jammed') === false, 'п.7: на траве помех нет');
    s.run('Math.random = () => 0.90; globalThis.__jamHill90 = (__terrain = ["hill"], radioJamRoll({ col: 1, row: 1 }));');
    ok(s.evalCtx('__jamHill90.jammed') === false, 'п.7: бросок 0.90 (вне 20 %) — помех нет');

    // выбор «посыльный / повторить»
    const s2 = base();
    s2.run(sliceOf('askRadioJammingPrompt'));
    s2.run('globalThis.__answer = true; function confirm(text) { globalThis.__promptText = text; return __answer; } log = () => {};');
    ok(s2.evalCtx("askRadioJammingPrompt({ name: '1-й взвод' }, 'помехи в лесу')") === true,
       'п.7: «ОК» — отправить посыльным сейчас');
    s2.run('__answer = false;');
    ok(s2.evalCtx("askRadioJammingPrompt({ name: '1-й взвод' }, 'помехи в лесу')") === false,
       'п.7: «Отмена» — повторить передачу в следующем ходу');
    ok(/посыльн/i.test(s2.evalCtx('globalThis.__promptText')) && /повторить/i.test(s2.evalCtx('globalThis.__promptText')),
       'п.7: в диалоге оба варианта названы словами');
    ok(/radioRetry/.test(sliceOf('createOrder')) || /radioRetry/.test(HTML),
       'п.7: приказ запоминает, что передаётся повторно по рации');
    ok(/function retryRadioDelivery/.test(HTML) && /order\.radioRetry && typeof retryRadioDelivery/.test(HTML),
       'п.7: повтор передачи выполняется в следующем ходу (processOrders)');
}

// ───────────────────── п.12: только приказы выбранного взвода ─────────────────────
{
    const orders = sliceOf('renderActiveOrders');
    ok(/selectedOpUnit/.test(orders), 'п.12: панель приказов смотрит на выбранный взвод');
    ok(/Показаны приказы выбранного взвода/.test(orders), 'п.12: подписано, чьи приказы показаны');
    ok(/selectedOpUnit=null;renderActiveOrders/.test(orders), 'п.12: есть ссылка «показать все»');
    ok(/focusedOrders/.test(orders), 'п.12: список фильтруется (focusedOrders)');
}

// ───────────────────── п.15: цепочка маршрутов ─────────────────────
{
    const s = base();
    s.run(sliceConst(HTML, 'OP_MOVE_CHAIN_TYPES'));
    s.run(sliceOf('operationalOrderEndHex'));
    s.run(sliceOf('operationalMoveOrderEndForUnit'));
    s.run(sliceOf('operationalMoveChainStart'));
    s.run(`
hardMode = { enabled: true, orders: [] };
appData.campaign.opUnits = [
  { name: '1-й взвод', type: 'infantry_platoon', col: 3, row: 3 },
  { name: '2-й взвод', type: 'infantry_platoon', col: 9, row: 9 }
];
hardMode.orders = [{ id: 1, type: 'move', status: 'active', toUnitId: 0, turnIssued: 1,
  targetCol: 6, targetRow: 4, waypoints: [{ col: 5, row: 4 }, { col: 6, row: 4 }] }];
`);
    const chain = s.evalCtx('JSON.stringify(operationalMoveChainStart(appData.campaign.opUnits[0]))');
    ok(/"col":6,"row":4/.test(chain || ''), 'п.15: старт нового маршрута — конец предыдущего приказа', chain);
    ok(s.evalCtx('operationalMoveChainStart(appData.campaign.opUnits[1])') === null,
       'п.15: у отряда без предыдущего приказа цепочки нет');
    ok(/operationalMoveChainStart\(/.test(sliceOf('submitOrder')),
       'п.15: submitOrder берёт старт из цепочки');
}

// ───────────────────── п.21: последовательные приказы ─────────────────────
{
    const s = base();
    s.run(sliceConst(HTML, 'OP_ORDER_BLOCKING_TYPES'));
    s.run(sliceOf('operationalOrderEffectiveType'));
    s.run(sliceOf('operationalOrderIsBlocking'));
    s.run(sliceOf('operationalOrderPredecessor'));
    s.run(sliceOf('operationalOrderWaitsForPredecessor'));
    s.run(`
hardMode = { enabled: true, orders: [
  { id: 1, type: 'move', status: 'active', toUnitId: 0, turnIssued: 1 },
  { id: 2, type: 'dismount', status: 'active', toUnitId: 0, turnIssued: 2 },
  { id: 3, type: 'move', status: 'active', toUnitId: 0, turnIssued: 3 }
] };
appData.campaign.opUnits = [{ name: '1-й взвод', type: 'bicycle_platoon', col: 3, row: 3 }];
getOrderTypeLabel = (t) => t;
__logs = [];
`);
    ok(s.evalCtx('operationalOrderWaitsForPredecessor(hardMode.orders[1])') === true,
       'п.21: спешивание ждёт завершения движения (предыдущий приказ ещё активен)');
    s.run('hardMode.orders[0].status = "completed";');
    ok(s.evalCtx('operationalOrderWaitsForPredecessor(hardMode.orders[1])') === false,
       'п.21: движение завершено — спешивание выполняется');
    ok(s.evalCtx('operationalOrderWaitsForPredecessor(hardMode.orders[2])') === true,
       'п.21: следующий приказ ждёт спешивание');
    s.run('hardMode.orders[1].status = "completed";');
    ok(s.evalCtx('operationalOrderWaitsForPredecessor(hardMode.orders[2])') === false,
       'п.21: цепочка движение → спешиться → движение проходит по шагам');
    ok(/operationalOrderWaitsForPredecessor\(order\)/.test(sliceOf('processOrders')),
       'п.21: processOrders не запускает приказ раньше предыдущего');
    // приказ другого отряда не блокирует
    s.run(`hardMode.orders = [
      { id: 10, type: 'move', status: 'active', toUnitId: 0, turnIssued: 1 },
      { id: 11, type: 'attack', status: 'active', toUnitId: 1, turnIssued: 2 }
    ]; appData.campaign.opUnits.push({ name: '2-й взвод', type: 'infantry_platoon', col: 8, row: 8 });`);
    ok(s.evalCtx('operationalOrderWaitsForPredecessor(hardMode.orders[1])') === false,
       'п.21: приказы разных отрядов друг друга не ждут');
}

// ───────────────────── кнопка «🔍 Разведка» в карточке ─────────────────────
{
    ok(/function openReconMissionModal/.test(read('js/recon.js')), 'разведка: openReconMissionModal есть');
    // ⚡ v13.164: в карточке — только свои активы, поэтому кнопка ведёт в
    //    openReconMissionModalForAsset (а старая openReconMissionModal осталась
    //    в общем API разведки и вызывается из панели)
    ok(/openReconMissionModalForAsset\(/.test(sliceOf('showOpUnitInfoPopup')),
       'п.9.1: кнопка «🔍 Разведка» в карточке юнита создаёт миссию');
    ok(/getOwnReconAssetList\(unit\)/.test(sliceOf('showOpUnitInfoPopup')),
       'п.9.1: кнопка показывается только при наличии СВОИХ активов');
    ok(/reconMissionId/.test(sliceOf('showOpUnitInfoPopup')),
       'п.9.1: у актива на миссии карточка предлагает панель разведки');
    ok(/showReconPanel\(\)/.test(sliceOf('showOpUnitInfoPopup')), 'п.9.1: из карточки открывается список миссий');
}

console.log(`\nИтог v13.157 (перенос пунктов): PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
