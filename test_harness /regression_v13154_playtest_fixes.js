'use strict';
// ⚡ v13.154 — партия 4 «правка шансов зажигательного + приказы»:
//  32. у ампуломёта и бутылкомёта ОДИНАКОВЫЕ шансы: попадание 5+ по
//      эффективному броску, поджог 7+ на d10, ослепление 5–6 (раньше ампуломёт
//      требовал 6+/9+ и поджигал только по сырому d10);
//  21. все приказы выполняются последовательно: движение → спешиться →
//      движение спешенными идут ПОДРЯД в одном оперативном ходу;
//  15. последовательные приказы на движение: маршрут нового приказа начинается
//      из конечной точки предыдущего (а не из текущей позиции);
//  12. при выборе взвода на опкарте видны только его маршрут и приказы.
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

// ─────────────── 32. Одинаковые шансы зажигательного ───────────────
{
    ok(/const INCENDIARY_HIT_THRESHOLD = 5;/.test(HTML), 'порог попадания зажигательного — 5+');
    ok(/const INCENDIARY_FIRE_THRESHOLD = 7;/.test(HTML), 'порог поджога — 7+ (40 %)');
    ok(/const INCENDIARY_BLIND_THRESHOLD = 5;/.test(HTML), 'порог ослепления — 5+');

    const amp = sliceFunction(HTML, 'attackAmpulometAtVehicle');
    ok(/effRoll >= INCENDIARY_HIT_THRESHOLD/.test(amp), 'ампуломёт: попадание по общему порогу');
    ok(/roll >= INCENDIARY_FIRE_THRESHOLD/.test(amp), 'ампуломёт: поджог по общему порогу');
    ok(!/effRoll >= 6\b/.test(amp) && !/roll >= 9\b/.test(amp), 'ампуломёт: прежние 6+/9+ убраны');

    const crew = sliceFunction(HTML, 'attackMolotovCrew');
    ok(/effRoll >= INCENDIARY_HIT_THRESHOLD/.test(crew), 'бутылкомёт (расчёт): попадание по общему порогу');
    ok(/effectRoll >= INCENDIARY_FIRE_THRESHOLD/.test(crew), 'бутылкомёт (расчёт): поджог по общему порогу');
    ok(/effectRoll >= INCENDIARY_BLIND_THRESHOLD/.test(crew), 'бутылкомёт (расчёт): ослепление по общему порогу');

    const thrown = sliceFunction(HTML, 'throwMolotovAtVehicle');
    ok(/effRoll >= INCENDIARY_HIT_THRESHOLD/.test(thrown), 'бросок бутылки: попадание по общему порогу, а не по укрытию');
    ok(!/effRoll >= cover/.test(thrown), 'бросок бутылки: сравнение с укрытием убрано — шансы равны');
    ok(/0, 6\)/.test('0, 6)') && /INCENDIARY_BLIND_THRESHOLD/.test(thrown), 'бросок бутылки: ослепление по общему порогу');
    ok(!/roll >= 5 && roll <= 6/.test(thrown), 'бросок бутылки: литерал 5–6 убран');
}

// ─────────────── 21. Серии: блокирующие типы + шаги подряд ───────────────
{
    const block = sliceConst(HTML, 'OP_ORDER_BLOCKING_TYPES');
    ok(/dismount/.test(block), 'OP_ORDER_BLOCKING_TYPES содержит «спешиться»');
    ok(/remount/.test(block), 'OP_ORDER_BLOCKING_TYPES содержит «сесть на велосипеды»');

    const series = sliceFunction(HTML, 'executeSeriesOrder');
    ok(/_stepsThisTurn/.test(series), 'executeSeriesOrder считает шаги текущего хода');
    ok(/return executeSeriesOrder\(unit, order\)/.test(series), 'серия продолжается в том же ходу');
    ok(/stepsDone < 6/.test(series), 'лимит — не больше 6 шагов за ход');
    ok(/Number\(unit\.ap\) > 0/.test(series), 'продолжение только пока есть ОД');
    ok(/!unit\.isInBattle/.test(series), 'в бою серия не продолжается');
    ok(/!unit\.embarkedInBtr/.test(series), 'в БТР серия не продолжается');
}

// ─────────────── 15. Цепочка маршрутов ───────────────
{
    const consts = sliceConst(HTML, 'OP_MOVE_CHAIN_TYPES');
    ok(/move/.test(consts) && /retreat/.test(consts) && /attack/.test(consts), 'цепочку образуют приказы движения/отхода/атаки');
    ok(typeof sliceFunction(HTML, 'operationalOrderEndHex') === 'string', 'есть operationalOrderEndHex');
    ok(typeof sliceFunction(HTML, 'operationalMoveOrderEndForUnit') === 'string', 'есть operationalMoveOrderEndForUnit');
    ok(typeof sliceFunction(HTML, 'operationalMoveChainStart') === 'string', 'есть operationalMoveChainStart');

    const submit = sliceFunction(HTML, 'submitOrder');
    ok(/operationalMoveChainStart\(/.test(submit), 'submitOrder берёт старт маршрута из предыдущего приказа');
    ok(/chainFromHex/.test(submit), 'в приказ пишется chainFromHex');
    ok(/validateRoute\(routeOrigin/.test(submit), 'маршрут проверяется от начала цепочки');

    const draw = sliceFunction(HTML, 'drawOrderRoute');
    ok(/operationalMoveChainStart\(/.test(draw), 'предпросмотр маршрута начинается от конца предыдущего приказа');

    // функция находит конец активного приказа движения и игнорирует завершённые
    const s = createSandbox(freshAppData());
    s.run(sliceConst(HTML, 'OP_MOVE_CHAIN_TYPES'));
    s.run(sliceFunction(HTML, 'operationalOrderEndHex'));
    s.run(sliceFunction(HTML, 'operationalMoveOrderEndForUnit'));
    s.run(sliceFunction(HTML, 'operationalMoveChainStart'));
    s.run(`
        var hardMode = { enabled: true, orders: [], pendingOrders: [], orderQueue: [] };
        appData.campaign.opUnits = [{ name: '1-й взвод', col: 1, row: 1, ap: 3 }];
        hardMode.orders.push({ id: 7, type: 'move', toUnitId: 0, status: 'active',
            waypoints: [{ col: 4, row: 2 }, { col: 6, row: 3 }] });
        hardMode.orders.push({ id: 8, type: 'move', toUnitId: 0, status: 'completed', targetHex: '9,9' });
        hardMode.pendingOrders.push({ id: 9, type: 'move', toUnitId: 0, status: 'queued', targetHex: '2,5' });
    `);
    ok(s.evalCtx('JSON.stringify(operationalMoveOrderEndForUnit(0))') === '{"col":2,"row":5}',
        'конец цепочки — по последнему незавершённому заказу', s.evalCtx('JSON.stringify(operationalMoveOrderEndForUnit(0))'));
    ok(s.evalCtx('JSON.stringify(operationalMoveChainStart(appData.campaign.opUnits[0]))') === '{"col":2,"row":5}',
        'chainStart возвращает точку продолжения', s.evalCtx('JSON.stringify(operationalMoveChainStart(appData.campaign.opUnits[0]))'));
    ok(s.evalCtx('operationalMoveOrderEndForUnit(0, 9) !== null'), 'исключение своего приказа работает');
    ok(s.evalCtx('operationalMoveOrderEndForUnit(5) === null'), 'для чужого взвода цепочки нет');
    s.run(`appData.campaign.opUnits[0].col = 2; appData.campaign.opUnits[0].row = 5;`);
    ok(s.evalCtx('operationalMoveChainStart(appData.campaign.opUnits[0]) === null'),
        'если взвод уже в конце маршрута — продолжения нет');
}

// ─────────────── 12. Фильтр маршрутов/приказов по выбранному взводу ───────────────
{
    const redraw = sliceFunction(HTML, 'redrawOperationalMapNow');
    ok(/selectedOpUnit/.test(redraw), 'отрисовка карты смотрит на выбранный взвод');
    ok(/routeFocusId/.test(redraw), 'маршруты фильтруются по routeFocusId');
    ok(/Number\(order\.toUnitId\) !== routeFocusId/.test(redraw), 'чужие маршруты не рисуются');

    const list = sliceFunction(HTML, 'renderActiveOrders');
    ok(/focusedOrders/.test(list), 'renderActiveOrders фильтрует список приказов');
    ok(/focusLine/.test(list), 'есть строка «показаны приказы выбранного взвода»');
    ok(/selectedOpUnit=null;renderActiveOrders/.test(list), 'есть ссылка «показать все»');
}

console.log(`\nитог: passed ${pass}, failed ${fail}`);
if (fail) process.exit(1);
