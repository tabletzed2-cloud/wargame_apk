// ⚡ v13.063: регрессии интерфейса — панель операционных приказов и
//    список отрядов вкладки «Бой» (запускать после regression_v13062.js).
//    Запуск: node 'test_harness /regression_v13063.js'
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const names = [
  // список отрядов вкладки «Бой»
  'renderSquadSelector', 'getSquadGroupState', 'getNoPlatoonLabel', 'getSquadPlatoonName',
  'getSquadBattleStatus', 'toggleSquadGroup', 'expandAllSquadGroups',
  // панель операционных приказов
  'getOrderDraft', 'getSeriesPlan', 'updateOrderActionButtons', 'updateShowOrderPanelButton',
  'submitOrderMain', 'minimizeOrderPanel', 'hideOrderPanel', 'isOrderPanelOpen',
  'updateOrderFieldVisibility', 'submitOrderQueue', 'cancelOrder', 'getOrderTypeLabel',
  // ⚡ v13.069 (R48#3): скрытное движение — галочка в панели приказов
  'orderUnitForStealthCheck', 'isVehicleMobilityUnit',
  // ⚡ v13.064: зависимости списка приказов (срок исполнения в подтверждениях)
  'getOrderEta', 'orderEtaMessage', 'getOpTurnMinutes', 'formatOrderTime', 'getAllOrdersList'
];
fs.writeFileSync('/tmp/wg_part.js', names.map(n => sliceFunction(HTML, n)).join('\n'));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗ ' + name + ' — ' + e.message); }
}

function fresh() {
  const s = createSandbox(freshAppData());
  s.run(`var orderWaypoints = [], isPlanningRoute = false, orderPanelMinimized = false,
                squadGroupCollapsed = {}, currentSquadIndex = 0,
                calls = [], pickedTargetHex = false;
    hardMode = { enabled: true, hqUnitId: 0, orderQueue: [], orders: [], pendingOrders: [], messengerQueue: [] };
    hardMode = hardMode;
    function submitOrder() { calls.push('single'); }
    function addOrderToQueue() {
      calls.push('queue');
      hardMode.orderQueue.push({ toUnitId: parseInt(document.getElementById('orderTargetUnit').value, 10),
        type: document.getElementById('orderType').value, waypoints: [] });
    }
    function createOrder() { return { deliveryMethod: 'radio', deliveryTurnsNeeded: 0 }; }
    function updateOrderWaypointsDisplay() {}
    function renderOrderQueue() {}
    function renderActiveOrders() {}
    function redrawOperationalMap() {}
    appData.campaign.opUnits = [{ name: '1-й взвод', col: 1, row: 1 }, { name: '2-й взвод', col: 2, row: 2 }];`);
  return s;
}
function setDraft(s, type, unit) {
  s.run(`document.getElementById('orderType').value = '${type}';
         document.getElementById('orderTargetUnit').value = '${unit}';
         updateOrderActionButtons();`);
}
const count = (html, re) => (html.match(re) || []).length;

// ============ 1. Вкладка «Бой»: группы взводов ============
function battleSandbox() {
  const s = fresh();
  s.run(`
    function mk(name, platoon, alive, extra) {
      const sq = { name, opUnitName: platoon, faction: 'BeVe', icon: '',
        fighters: Array.from({ length: 4 }, (_, i) => ({ name: 'f' + i, hp: i < alive ? 3 : 0, maxHp: 3 })),
        currentMorale: 5, baseMorale: 5 };
      Object.assign(sq, extra || {});
      return sq;
    }
    appData.squads = [
      mk('Стрелковое №1', '1-й взвод', 4),
      mk('Стрелковое №2', '1-й взвод', 0),
      mk('Пулемётное', '2-й взвод', 3, { isRetreated: true, status: 'retreated' }),
      mk('Сапёрное', '2-й взвод', 2)
    ];
    currentSquadIndex = 0; squadGroupCollapsed = {};
    renderSquadSelector();
  `);
  return s;
}

test('Отделения сгруппированы по взводу; раскрыт только взвод текущего отряда', () => {
  const s = battleSandbox();
  const html = s.elements.activeSquadArea.innerHTML;
  assert.equal(count(html, /platoon-group-header/g), 2, 'две шапки взводов');
  assert.equal(count(html, /class="platoon-group collapsed"/g), 1, 'чужой взвод свёрнут');
  assert.equal(count(html, /squad-select-card/g), 2, 'видны только отделения раскрытого взвода');
  assert.ok(html.includes('1-й взвод') && html.includes('2-й взвод'));
});

test('Уничтоженное отделение помечено и опущено вниз группы', () => {
  const s = battleSandbox();
  const html = s.elements.activeSquadArea.innerHTML;
  assert.ok(html.includes('💀 Уничтожен'), 'есть метка «уничтожен»');
  assert.ok(html.indexOf('💀 Уничтожен') > html.indexOf('Стрелковое №1'), 'уничтоженное ниже живого');
  assert.ok(html.includes('потери: 1'), 'в шапке взвода учтена потеря');
  assert.ok(html.includes('бойцов: 0/4'), 'счётчик живых бойцов');
});

test('Отступившее отделение видно как потеря после раскрытия группы', () => {
  const s = battleSandbox();
  s.run('expandAllSquadGroups(true);');
  const html = s.elements.activeSquadArea.innerHTML;
  assert.equal(count(html, /squad-select-card/g), 4, 'развёрнуты все четыре отделения');
  assert.ok(html.includes('🏳️ Отступил'), 'есть метка «отступил»');
  assert.ok(html.includes('в строю: 2'), 'в сводке два боеспособных отделения');
});

test('Группу можно свернуть и развернуть вручную, «⇱/⇲» работают на все группы', () => {
  const s = battleSandbox();
  s.run(`toggleSquadGroup('platoon:1-й взвод');`);
  assert.equal(count(s.elements.activeSquadArea.innerHTML, /squad-select-card/g), 0, 'взвод текущего отряда свёрнут вручную');
  s.run(`expandAllSquadGroups(true);`);
  assert.equal(count(s.elements.activeSquadArea.innerHTML, /squad-select-card/g), 4);
  s.run(`expandAllSquadGroups(false);`);
  assert.equal(count(s.elements.activeSquadArea.innerHTML, /squad-select-card/g), 0);
});

test('Одиночный бой: отделения без взвода попадают в общую группу', () => {
  const s = fresh();
  s.run(`appData.squads = [
      { name: 'Отделение А', faction: 'BeVe', fighters: [{ name: 'a', hp: 3, maxHp: 3 }], currentMorale: 5, baseMorale: 5 },
      { name: 'Отделение Б', faction: 'BeVe', fighters: [{ name: 'b', hp: 3, maxHp: 3 }], currentMorale: 5, baseMorale: 5 }
    ]; currentSquadIndex = 0; squadGroupCollapsed = {}; renderSquadSelector();`);
  const html = s.elements.activeSquadArea.innerHTML;
  assert.equal(count(html, /platoon-group-header/g), 1);
  assert.ok(html.includes('Отдельные отряды'));
});

// ============ 2. Панель приказов: единая кнопка ============
test('Пустая очередь: кнопка «✅ Отдать приказ» отправляет одиночный приказ', () => {
  const s = fresh();
  setDraft(s, 'move', '0');
  assert.equal(s.elements.submitOrderMainBtn.textContent, '✅ Отдать приказ');
  s.run('submitOrderMain();');
  assert.equal(s.evalCtx('calls.join("|")'), 'single');
});

test('Серия: кнопка становится «✅ Выполнить серию (N)» и отправляет всю серию', () => {
  const s = fresh();
  s.run(`hardMode.orderQueue = [{ toUnitId: 0, type: 'move', waypoints: [] }, { toUnitId: 0, type: 'dig_in', waypoints: [] }];`);
  setDraft(s, 'attack', '0');
  assert.equal(s.elements.submitOrderMainBtn.textContent, '✅ Выполнить серию (3)');
  assert.equal(s.evalCtx('getSeriesPlan().addDraft'), true, 'текущий приказ тому же отряду входит в серию');
  s.run('submitOrderMain();');
  assert.equal(s.evalCtx('calls.join("|")'), 'queue', 'черновик добавлен в очередь');
  assert.equal(s.evalCtx('hardMode.orderQueue.length'), 0, 'вся серия ушла в приказ (очередь очищена)');
});

test('Пустой черновик-дубль последнего приказа серии не дублируется', () => {
  const s = fresh();
  s.run(`hardMode.orderQueue = [{ toUnitId: 0, type: 'dig_in', waypoints: [] }];`);
  setDraft(s, 'dig_in', '0'); // поля панели после «Добавить в серию» остались теми же
  assert.equal(s.evalCtx('getSeriesPlan().addDraft'), false);
  assert.equal(s.evalCtx('getSeriesPlan().reason'), 'duplicate');
  assert.equal(s.elements.submitOrderMainBtn.textContent, '\u2705 \u0412\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u0441\u0435\u0440\u0438\u044e (1)');
  // но как только появился маршрут — черновик становится новым приказом серии
  s.run(`orderWaypoints = [{ col: 3, row: 4 }]; updateOrderActionButtons();`);
  assert.equal(s.evalCtx('getSeriesPlan().addDraft'), true);
  assert.equal(s.elements.submitOrderMainBtn.textContent, '\u2705 \u0412\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u0441\u0435\u0440\u0438\u044e (2)');
});

test('Черновик другому отряду в серию не попадает, но серия отправляется', () => {
  const s = fresh();
  s.run(`hardMode.orderQueue = [{ toUnitId: 0, type: 'move', waypoints: [] }];`);
  setDraft(s, 'move', '1');
  assert.equal(s.elements.submitOrderMainBtn.textContent, '✅ Выполнить серию (1)');
  assert.equal(s.evalCtx('getSeriesPlan().reason'), 'other');
  assert.ok(s.elements.orderSubmitHint.innerHTML.includes('другому'), 'игрок предупреждён подсказкой');
  s.run('submitOrderMain();');
  assert.equal(s.evalCtx('calls.join("|")'), '', 'черновик в серию не добавлен');
  assert.equal(s.evalCtx('hardMode.orderQueue.length'), 0, 'серия отправлена');
});

test('Серия для разных отрядов: предупреждение и отказ при «Отмена»', () => {
  const s = fresh();
  s.run(`hardMode.orderQueue = [{ toUnitId: 0, type: 'move', waypoints: [] }, { toUnitId: 1, type: 'dig_in', waypoints: [] }];`);
  s.run('submitOrderQueue();'); // confirm() по умолчанию true
  assert.equal(s.evalCtx('hardMode.orderQueue.length'), 0, 'серия отправлена и очередь очищена');
  assert.equal(s.evalCtx('isPlanningRoute'), false, 'режим планирования маршрута выключен');
  const s2 = fresh();
  s2.run(`hardMode.orderQueue = [{ toUnitId: 0, type: 'move', waypoints: [] }, { toUnitId: 1, type: 'dig_in', waypoints: [] }];
          confirm = () => false; submitOrderQueue();`);
  assert.equal(s2.evalCtx('hardMode.orderQueue.length'), 2, 'по «Отмена» серия не уходит');
});

test('Пустая очередь не отправляется как серия', () => {
  const s = fresh();
  s.run('submitOrderQueue();');
  assert.deepEqual(s.alerts, ['Очередь пуста!']);
});

// ============ 3. Панель приказов: кнопка-открывашка ============
test('Пока панель раскрыта, кнопка «🎯 Отдать приказ» скрыта (защита от сброса приказа)', () => {
  const s = fresh();
  setDraft(s, 'move', '0');
  s.run(`document.getElementById('hardModePanel').style.display = 'block'; updateOrderActionButtons();`);
  assert.equal(s.elements.showOrderPanelBtn.style.display, 'none', 'кнопка скрыта — промахнуться нельзя');
  s.run('hideOrderPanel();');
  assert.equal(s.elements.showOrderPanelBtn.style.display, 'inline-block');
  assert.ok(s.elements.showOrderPanelBtn.textContent.includes('Отдать приказ'));
});

test('«✖ Свернуть» сохраняет маршрут, «❌ Отмена» его очищает', () => {
  const s = fresh();
  s.run(`orderWaypoints = [{ col: 1, row: 1 }, { col: 2, row: 2 }];
         document.getElementById('hardModePanel').style.display = 'block';
         minimizeOrderPanel();`);
  assert.equal(s.evalCtx('orderWaypoints.length'), 2, 'маршрут сохранён');
  assert.equal(s.evalCtx('isPlanningRoute'), false, 'клики по карте вернулись в обычный режим');
  assert.ok(s.elements.showOrderPanelBtn.textContent.includes('Продолжить приказ'), 'кнопка зовёт продолжить');
  s.run('hideOrderPanel();');
  assert.equal(s.evalCtx('orderWaypoints.length'), 0, 'отмена очищает маршрут');
  assert.equal(s.evalCtx('orderPanelMinimized'), false);
});

// ============ 4. Панель приказов: видимость полей ============
test('Поля панели показываются только нужным типам приказа', () => {
  const s = fresh();
  const vis = (type) => { s.run(`updateOrderFieldVisibility('${type}')`); return {
    hex: s.elements.orderTargetHexBlock.style.display,
    route: s.elements.orderWaypointsBlock.style.display,
    behavior: s.elements.orderBehaviorBlock.style.display }; };
  assert.deepEqual(vis('move'), { hex: 'none', route: 'block', behavior: 'block' });
  assert.deepEqual(vis('attack'), { hex: 'block', route: 'none', behavior: 'block' });
  assert.deepEqual(vis('dig_in'), { hex: 'none', route: 'none', behavior: 'none' });
  assert.deepEqual(vis('shoot'), { hex: 'block', route: 'none', behavior: 'none' });
});

test('Отмена активного приказа подтверждается (защита от случайного «✕»)', () => {
  const s = fresh();
  s.run(`hardMode.orders = [{ id: 7, type: 'move', toUnitId: 0, fromUnitId: 0, status: 'active' }];
         confirm = () => false; cancelOrder(7);`);
  assert.equal(s.evalCtx('hardMode.orders.length'), 1, 'по «Отмена» приказ остался');
  s.run('confirm = () => true; cancelOrder(7);');
  assert.equal(s.evalCtx('hardMode.orders.length'), 0, 'по «ОК» приказ снят');
  s.run(`hardMode.orders = [{ id: 8, type: 'move', toUnitId: 0, fromUnitId: 0, status: 'active' }];
         confirm = () => false; cancelOrder(8, true);`);
  assert.equal(s.evalCtx('hardMode.orders.length'), 0, 'программный вызов — без подтверждения');
  assert.equal(s.evalCtx("getOrderTypeLabel('dig_in')"), '🕳️ Окопаться');
  assert.equal(s.evalCtx("getOrderTypeLabel('что-то')"), 'что-то');
});

console.log(`\nИтог v13.063: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) { failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
