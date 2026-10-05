// ⚡ v13.064: регрессии списка отданных приказов — приказ «через штаб роты»,
//    подтверждение удаления и справка о сроке исполнения.
//    Запуск: node 'test_harness /regression_v13064.js' (после regression_v13063.js)
'use strict';
const fs = require('fs');
const assert = require('assert/strict');
const { sliceFunction, HTML } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const names = [
  'getAllOrdersList', 'getOpTurnMinutes', 'formatOrderTime', 'getOrderEta', 'orderEtaMessage',
  'getCompanyOrderRecipients', 'getOrderDetailsHtml', 'toggleOrderDetails', 'renderActiveOrders',
  'getOrderTypeLabel', 'cancelOrder', 'moveOrderPriority'
];
fs.writeFileSync('/tmp/wg_part.js', names.map(n => sliceFunction(HTML, n)).join('\n'));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗ ' + name + ' — ' + e.message); }
}
const has = (html, re) => re.test(html);

function fresh() {
  const s = createSandbox(freshAppData());
  s.sandbox.canIssueArtilleryStrike = () => false;
  s.run(`
    var orderDetailsOpen = {};
    hardMode = { enabled: true, hqUnitId: 0, orderQueue: [], orders: [], pendingOrders: [], messengerQueue: [] };
    function formatTime(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
    appData.campaign.opUnits = [
      { name: 'Штаб батальона', col: 0, row: 0 },
      { name: 'Штаб 1-й роты', col: 2, row: 2 },
      { name: '1-й взвод', col: 3, row: 3 },
      { name: '2-й взвод', col: 4, row: 4 }
    ];
    appData.campaign.currentTurn = 3;
    appData.campaign.currentTime = 600; // 10:00
    confirm = () => true;
  `);
  return s;
}

// ============ 1. Приказ через штаб роты ============
function companySandbox() {
  const s = fresh();
  s.run(`
    var companyOrder = { id: 101, fromUnitId: 0, toUnitId: 1, type: 'company_order', orderType: 'move',
      status: 'active', waypoints: [{ col: 3, row: 3 }, { col: 5, row: 5 }], behavior: 'engage',
      deliveryMethod: 'radio', subUnitIds: [3], subUnitIdsAll: [2, 3] };
    var relayOrder = { id: 102, fromUnitId: 1, toUnitId: 2, type: 'move', status: 'delivering',
      deliveryMethod: 'messenger', deliveryTurnsNeeded: 2, deliveryTurnsPassed: 0,
      waypoints: [{ col: 3, row: 3 }], relayParentId: 101, relayOrderType: 'move', relayCompanyId: 1 };
    hardMode.orders = [companyOrder, relayOrder];
    renderActiveOrders();
  `);
  return s;
}

test('Приказ через роту показывает РЕАЛЬНЫЙ приказ, а не «company_order»', () => {
  const s = companySandbox();
  const html = s.elements.ordersContainer.innerHTML;
  assert.ok(!has(html, /company_order/), 'служебный тип в список не выводится');
  assert.ok(has(html, /📋\s*🚶 Движение · через Штаб 1-й роты/), 'виден реальный приказ и рота');
  assert.ok(has(html, /2 взводам/), 'видно число взводов-получателей');
});

test('Копия приказа для взвода помечена как переданная через роту', () => {
  const s = companySandbox();
  assert.ok(has(s.elements.ordersContainer.innerHTML, /↳ через Штаб 1-й роты/));
});

test('«ℹ️ приказ» раскрывает приказ через роту: получатели, маршрут, поведение', () => {
  const s = companySandbox();
  s.run('toggleOrderDetails(101);');
  const html = s.elements.ordersContainer.innerHTML;
  assert.ok(has(html, /1\. \(3,3\) → 2\. \(5,5\)/), 'маршрут');
  assert.ok(has(html, /• 1-й взвод — 🚶 посыльный в пути/), 'переданный взвод и его состояние');
  assert.ok(has(html, /• 2-й взвод — ⏳ ещё не передан/), 'взвод, ожидающий передачи');
  assert.ok(has(html, /При встрече с врагом/), 'поведение при встрече');
  s.run('toggleOrderDetails(102);');
  assert.ok(has(s.elements.ordersContainer.innerHTML, /Передан через/), 'у копии указан штаб роты');
});

test('Старые сохранения без subUnitIdsAll: получатели берутся из копий приказа', () => {
  const s = fresh();
  s.run(`
    var old = { id: 201, fromUnitId: 0, toUnitId: 1, type: 'company_order', orderType: 'dig_in',
      status: 'active', deliveryMethod: 'radio', subUnitIds: [] };
    var relay = { id: 202, fromUnitId: 1, toUnitId: 3, type: 'dig_in', status: 'completed',
      deliveryMethod: 'radio', relayParentId: 201 };
    hardMode.orders = [old, relay];
  `);
  assert.equal(s.evalCtx('getCompanyOrderRecipients(hardMode.orders[0])[0].name'), '2-й взвод');
  assert.equal(s.evalCtx('getCompanyOrderRecipients(hardMode.orders[0])[0].stateLabel'), '✅ выполнен');
});

// ============ 2. Справка о сроке исполнения ============
test('Срок: посыльный в пути — остаток ходов доставки', () => {
  const s = fresh();
  s.run(`hardMode.pendingOrders = [{ id: 1, type: 'move', status: 'delivering', toUnitId: 2,
    deliveryMethod: 'messenger', deliveryTurnsNeeded: 3, deliveryTurnsPassed: 1 }];`);
  const eta = s.evalCtx('getOrderEta(hardMode.pendingOrders[0])');
  assert.equal(eta.turns, 2);
  assert.equal(eta.etaTime, 620); // 10:00 + 2×10 мин
  assert.equal(eta.etaTurn, 5);
  assert.ok(eta.text.includes('через 2 хода') && eta.text.includes('10:20'));
});

test('Срок: активный приказ — конец этого хода; завершённый — без срока', () => {
  const s = fresh();
  s.run(`hardMode.orders = [{ id: 2, type: 'dig_in', status: 'active', toUnitId: 2, deliveryMethod: 'radio' },
                            { id: 3, type: 'dig_in', status: 'completed', toUnitId: 2, deliveryMethod: 'radio' }];`);
  assert.ok(s.evalCtx("getOrderEta(hardMode.orders[0]).text").includes('в конце этого хода'));
  assert.equal(s.evalCtx('getOrderEta(hardMode.orders[0]).turns'), 1);
  assert.equal(s.evalCtx('getOrderEta(hardMode.orders[1])'), null);
});

test('Срок: приказ «на время» ждёт назначенного времени', () => {
  const s = fresh();
  s.run(`hardMode.orders = [{ id: 4, type: 'attack', status: 'active', toUnitId: 2,
    deliveryMethod: 'radio', startTimeMin: 640 }];`); // 10:40
  const eta = s.evalCtx('getOrderEta(hardMode.orders[0])');
  assert.equal(eta.turns, 4); // 40 минут / 10 минут за ход
  assert.equal(eta.etaTime, 640);
  assert.ok(eta.text.includes('10:40'));
});

test('Срок: очередь без посыльного — срока нет, но это не «выполнено»', () => {
  const s = fresh();
  s.run(`hardMode.messengerQueue = [{ id: 5, type: 'move', status: 'queued', toUnitId: 2 }];`);
  const eta = s.evalCtx('getOrderEta(hardMode.messengerQueue[0])');
  assert.equal(eta.turns, null);
  assert.ok(eta.text.includes('посыльного'));
});

test('Справка о сроке попадает в список приказов и в сообщение об отправке', () => {
  const s = companySandbox();
  assert.ok(has(s.elements.ordersContainer.innerHTML, /🕓/), 'в списке есть строка срока');
  assert.ok(s.evalCtx("orderEtaMessage({ id: 9, type: 'move', status: 'active', toUnitId: 2, deliveryMethod: 'radio' })").includes('🕓'));
  assert.equal(s.evalCtx("orderEtaMessage({ id: 9, type: 'move', status: 'completed' })"), '');
});

// ============ 3. Удаление приказов ============
test('Завершённый приказ убирается крестиком сразу, выполняющийся — с подтверждением', () => {
  const s = fresh();
  s.run(`hardMode.orders = [{ id: 11, type: 'dig_in', status: 'completed', toUnitId: 2, deliveryMethod: 'radio' },
                            { id: 12, type: 'move', status: 'active', toUnitId: 2, deliveryMethod: 'radio' }];
         confirm = () => false; cancelOrder(11);`);
  assert.equal(s.evalCtx('hardMode.orders.length'), 1, 'завершённый убран без вопроса');
  s.run('cancelOrder(12);');
  assert.equal(s.evalCtx('hardMode.orders.length'), 1, 'выполняющийся остался — в диалоге «Отмена»');
  s.run('confirm = () => true; cancelOrder(12);');
  assert.equal(s.evalCtx('hardMode.orders.length'), 0, 'по «ОК» выполняющийся снят');
});

test('Отмена приказа «через роту» снимает и копии, переданные взводам', () => {
  const s = companySandbox();
  s.run('confirm = () => true; cancelOrder(101);');
  assert.equal(s.evalCtx('hardMode.orders.length'), 0, 'сняты и приказ роте, и копия взводу');
});

test('Кнопка «Убрать» — у завершённых, «Отменить» — у выполняющихся', () => {
  const s = fresh();
  s.run(`hardMode.orders = [{ id: 21, type: 'dig_in', status: 'completed', toUnitId: 2, deliveryMethod: 'radio' },
                            { id: 22, type: 'move', status: 'delivering', toUnitId: 2, deliveryMethod: 'messenger',
                              deliveryTurnsNeeded: 2, deliveryTurnsPassed: 0 }];
         renderActiveOrders();`);
  const html = s.elements.ordersContainer.innerHTML;
  assert.ok(has(html, /✕ Убрать/), 'у завершённого — «Убрать»');
  assert.ok(has(html, /✕ Отменить/), 'у выполняющегося — «Отменить»');
});

// ============ 4. Приоритет ============
test('«▲/▼» двигают приказ только внутри своей очереди и по экранным индексам', () => {
  const s = fresh();
  s.run(`hardMode.pendingOrders = [{ id: 31, type: 'move', status: 'delivering', toUnitId: 2 },
                                   { id: 32, type: 'dig_in', status: 'delivering', toUnitId: 3 }];
         hardMode.orders = [{ id: 33, type: 'recon', status: 'active', toUnitId: 2 }];
         moveOrderPriority(0, 1);`);
  assert.equal(s.evalCtx('hardMode.pendingOrders.map(o => o.id).join(",")'), '32,31');
  // граница списков: pending → orders не меняем
  s.run('moveOrderPriority(1, 1);');
  assert.equal(s.evalCtx('hardMode.pendingOrders.map(o => o.id).join(",")'), '32,31');
  assert.equal(s.evalCtx('hardMode.orders.map(o => o.id).join(",")'), '33');
  // очередь посыльных не путается с активными приказами
  s.run(`hardMode.messengerQueue = [{ id: 30, type: 'move', status: 'queued', toUnitId: 3 }];
         moveOrderPriority(0, 1);`);
  assert.equal(s.evalCtx('hardMode.messengerQueue.map(o => o.id).join(",")'), '30');
  assert.equal(s.evalCtx('hardMode.pendingOrders.map(o => o.id).join(",")'), '32,31');
});

console.log(`\nИтог v13.064: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) { failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
