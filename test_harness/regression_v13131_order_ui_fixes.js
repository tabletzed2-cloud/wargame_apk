'use strict';
// ⚡ v13.131: регрессия правок «новых» пунктов 1–11:
//   1 — меню окопов открывается по прибытии (а не при отдаче приказа);
//   2 — клик по гексу не раскрывает скрытых врагов и не показывает меню врага;
//   3 — приказы двух юнитов не смешиваются (серии по юнитам + глубокие копии);
//   4 — приказы взводов показываются по взводам, шаги серии удаляются поштучно;
//   5 — панель перетаскивания отрядов при размещении (размещённые исчезают);
//   6 — «Спешиться» не включается переносом панели в слот;
//   7 — уведомление о завершении фазы противника при нескольких боях;
//   8 — тактическая карта двигается перетаскиванием;
//   9 — патроны бронетехники ×5 (однократно);
//   10 — бронетехника не ходит скрытно на оперативной карте;
//   11 — «Скрытный темп» доступен при выборе любого юнита.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { HTML, ROOT, sliceFunction, sliceConst } = require('./extract');
const PLACEMENT = fs.readFileSync(path.join(ROOT, 'js/placement.js'), 'utf8');
const HEXMAPS = fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8');
const OPUI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (error) { fail++; console.error(`✗ ${name} — ${error.message}`); }
}
function assert(value, message) { if (!value) throw new Error(message || 'assertion failed'); }
function equal(actual, expected, message) {
  assert(actual === expected, `${message}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// #3: шаги серии копируются ГЛУБОКО — два взвода не делят один массив waypoints.
test('#3: relayed sub-orders own independent copies of series waypoints', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    var captured = [];
    var hardMode = { messengerQueue: [], pendingOrders: [], orders: [], messengers: { battalion: { available: 0, active: [] }, companies: {} } };
    function log() {}
    function saveData() {}
    function saveAndRefresh() {}
    function checkCommunication() { return 'radio'; }
    function getOpHexDistance() { return 1; }
    function assignMessenger() { return null; }
    function isVehicleMobilityUnit() { return false; }
    function executeOrder(o) { captured.push(o); }
    var company = { name: '1-я рота', type: 'company_hq', col: 0, row: 0, isDestroyed: false };
    var platoonA = { name: '1-й взвод', type: 'infantry_platoon', col: 1, row: 0, isDestroyed: false };
    var platoonB = { name: '2-й взвод', type: 'infantry_platoon', col: 2, row: 0, isDestroyed: false };
    appData.campaign.opUnits = [company, platoonA, platoonB];
    var order = {
      id: 77, type: 'company_order', orderType: 'series', fromUnitId: 0, toUnitId: 0,
      subUnitIds: [1, 2], status: 'active',
      series: [{ type: 'move', status: 'pending', waypoints: [{ col: 5, row: 5 }, { col: 6, row: 6 }] }]
    };
  `);
  s.run(sliceFunction(HTML, 'executeCompanyOrder'));
  s.run('executeCompanyOrder(company, order);');
  s.run(`
    var a = captured[0], b = captured[1];
    var shared = a.series[0].waypoints === b.series[0].waypoints;
    var sharedWithParent = a.series[0].waypoints === order.series[0].waypoints;
    a.series[0].waypoints.splice(0, 1);
    var bKeptRoute = b.series[0].waypoints.length === 2;
  `);
  equal(s.evalCtx('captured.length'), 2, 'both platoons receive their own sub-order');
  equal(s.evalCtx('shared'), false, 'the two sub-orders do not share a waypoints array');
  equal(s.evalCtx('sharedWithParent'), false, 'sub-orders do not share waypoints with the parent');
  equal(s.evalCtx('bKeptRoute'), true, "mutating one platoon's route leaves the other intact");
});

// #3: очередь приказов группируется по исполнителю — каждый юнит ведёт свою серию.
test('#3: submitOrderQueue splits queued steps into one series per unit', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    var created = [];
    var hardMode = { orderQueue: [], hqUnitId: 0 };
    function log() {}
    function alert() {}
    function confirm() { return true; }
    function saveData() {}
    function redrawOperationalMap() {}
    function hideOrderPanel() {}
    function renderOrderQueue() {}
    function renderActiveOrders() {}
    function updateOrderWaypointsDisplay() {}
    function getOrderEta() { return null; }
    function orderEtaMessage() { return ''; }
    var orderWaypoints = [], isPlanningRoute = false, pickingTargetHex = false;
    appData.campaign.opUnits = [
      { name: 'Штаб' }, { name: 'Взвод А' }, { name: 'Взвод Б' }
    ];
    hardMode.orderQueue = [
      { toUnitId: 1, type: 'move', waypoints: [{ col: 1, row: 1 }], targetHex: null, series: [] },
      { toUnitId: 2, type: 'dig_in', waypoints: [], targetHex: '4,4', series: [] },
      { toUnitId: 1, type: 'defend', waypoints: [], targetHex: '2,2', series: [] }
    ];
    function createOrder(hqIdx, toUnitId, type, opts) {
      created.push({ toUnitId: toUnitId, type: type, series: (opts.series || []).map(x => ({ type: x.type, toUnitId: x.toUnitId })) });
      return { id: created.length, deliveryMethod: 'radio' };
    }
  `);
  s.run(sliceFunction(HTML, 'submitOrderQueue'));
  s.run('submitOrderQueue();');
  s.run(`
    var unitASteps = created.filter(c => c.toUnitId === 1);
    var unitBSteps = created.filter(c => c.toUnitId === 2);
    var mixed = created.some(c => c.series.some(x => x.toUnitId !== c.toUnitId));
  `);
  equal(s.evalCtx('created.length'), 2, 'one series per unit is created');
  equal(s.evalCtx('unitASteps.length && unitASteps[0].series.length'), 2, 'unit A keeps its two own steps');
  equal(s.evalCtx('unitBSteps.length && unitBSteps[0].series.length'), 1, 'unit B keeps its own step');
  equal(s.evalCtx('mixed'), false, 'no series contains steps addressed to another unit');
});

// #4: шаг серии удаляется поштучно, остальные сохраняются.
test('#4: a single series step can be deleted without touching the others', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    var confirmAnswer = true;
    function confirm() { return confirmAnswer; }
    function saveData() {}
    function renderActiveOrders() {}
    function renderOrderJournalRows() {}
    function recordOrderJournal() {}
    function getOrderTypeLabel(t) { return t; }
    var order = {
      id: 10, type: 'series', status: 'active',
      series: [
        { type: 'move', status: 'completed' },
        { type: 'dig_in', status: 'pending' },
        { type: 'defend', status: 'pending' }
      ]
    };
    function getAllOrdersList() { return [order]; }
  `);
  s.run(sliceFunction(HTML, 'removeOrderSeriesStep'));
  s.run('removeOrderSeriesStep(10, 1);');
  s.run(`
    var typesLeft = order.series.map(x => x.type).join(',');
  `);
  equal(s.evalCtx('order.series.length'), 2, 'exactly one step is removed');
  equal(s.evalCtx('typesLeft'), 'move,defend', 'the right step (dig_in) is deleted, the rest stay');
  s.run('removeOrderSeriesStep(10, 0);');
  s.run('removeOrderSeriesStep(10, 0);');
  equal(s.evalCtx('order.series.length'), 0, 'all steps can be removed');
  equal(s.evalCtx('order.status'), 'completed', 'an emptied series completes its order');
});

// #4: приказ через штаб роты можно отменить для одного взвода.
test('#4: cancelCompanyOrderRecipient cancels only one platoon of a company order', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    function confirm() { return true; }
    function saveData() {}
    function renderActiveOrders() {}
    function renderOrderJournalRows() {}
    function recordOrderJournal() {}
    var cancelled = [];
    function cancelOrder(id, skip) { cancelled.push({ id: id, skip: skip }); }
    var parent = { id: 5, type: 'company_order', subUnitIds: [1, 2], subUnitIdsAll: [1, 2], status: 'active' };
    function getAllOrdersList() { return [parent]; }
    appData.campaign.opUnits = [{ name: 'Рота' }, { name: 'Взвод А' }, { name: 'Взвод Б' }];
  `);
  s.run(sliceFunction(HTML, 'cancelCompanyOrderRecipient'));
  s.run('cancelCompanyOrderRecipient(5, 1);');
  s.run('var afterFirst = parent.subUnitIds.join(",");');
  equal(s.evalCtx('afterFirst'), '2', 'only the chosen platoon is removed');
  s.run('cancelCompanyOrderRecipient(5, 2);');
  equal(s.evalCtx('cancelled.length'), 1, 'the parent order is cancelled once the last platoon is removed');
  equal(s.evalCtx('cancelled[0].id'), 5, 'the parent company order is the cancelled one');
});

// #1: редактор окопов открывается по прибытии на гекс, один раз, не для врага.
test('#1: trench menu opens on arrival at the target hex, once per order', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    hexEditorState = null;
    var opened = [];
    var drafted = [];
    function setTimeout(fn) { fn(); }
    function isEnemyOperationalUnit(u) { return !!u.isEnemy; }
    function pendingHexEditDraftActive() { return false; }
    function beginPendingHexEditDraft(hexKey, kind, name) { drafted.push({ hexKey: hexKey, kind: kind, name: name }); }
    function openHexEditorForBattle(hexKey, kind, name) { opened.push({ hexKey: hexKey, kind: kind, name: name }); }
  `);
  s.run(sliceFunction(HEXMAPS, 'openHexEditorOnFortificationArrival'));
  s.run(`
    var order = {};
    var unit = { name: 'Взвод', col: 3, row: 4 };
    openHexEditorOnFortificationArrival(order, unit, 'trenches');
    openHexEditorOnFortificationArrival(order, unit, 'trenches');
  `);
  equal(s.evalCtx('opened.length'), 1, 'the menu opens exactly once per order');
  equal(s.evalCtx('opened[0].hexKey'), '3,4', 'the menu is for the hex the unit reached');
  equal(s.evalCtx('opened[0].kind'), 'trenches', 'the trench placement menu opens');
  s.run(`
    var enemyOrder = {};
    openHexEditorOnFortificationArrival(enemyOrder, { name: 'Враг', isEnemy: true, col: 1, row: 1 }, 'trenches');
  `);
  equal(s.evalCtx('opened.length'), 1, 'enemy diggers never open the player menu');
  equal(s.evalCtx('enemyOrder.hexMenuOpened'), undefined, 'the enemy order is not marked');
  // приказ «окопаться» больше не открывает редактор сразу
  assert(OPUI.includes('openHexEditorOnFortificationArrival'), 'operational UI knows the arrival-based opener');
  const issueFn = sliceFunction(OPUI, 'openHexEditorForIssuedOrder');
  assert(!issueFn.includes('openHexEditorForBattle(hexKey, kind, unitName)'), 'issuing the order no longer opens the hex editor immediately');
  assert(HTML.includes("openHexEditorOnFortificationArrival(order, unit, 'trenches')"), 'dig-in opens the menu when digging starts on the hex');
});

// #2: видимость врага на оперативной карте — только обнаруженные; меню врага убрано.
test('#2: hidden enemies stay invisible to clicks and no enemy unit menu is shown', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'opEnemyVisibleToPlayer'));
  s.run(`
    var scout = { name: 'Разведка', detected: true };
    var hidden = { name: 'Скрытый' };
    var noisy = { name: 'Шумный', noiseMarker: true };
    var dot = { name: 'ДОТ', type: 'dots' };
    var visible = opEnemyVisibleToPlayer(scout);
    var invisible = opEnemyVisibleToPlayer(hidden);
    var noiseVisible = opEnemyVisibleToPlayer(noisy);
    var dotVisible = opEnemyVisibleToPlayer(dot);
  `);
  equal(s.evalCtx('visible'), true, 'a detected enemy is visible');
  equal(s.evalCtx('invisible'), false, 'an undetected enemy is not shown to clicks');
  equal(s.evalCtx('noiseVisible'), true, 'a noise marker reveals the unit');
  equal(s.evalCtx('dotVisible'), true, 'static fortifications stay visible');
  assert(!HTML.includes('showOpUnitInfoPopup(clickedEnemyView)'), 'clicking an enemy no longer opens the unit menu');
  assert(HTML.includes('Обнаружен противник на гексе'), 'the click shows just a detected-unit info line');
  assert(HTML.includes('. Обнаруженные враги:'), 'tactical hex info lists only detected enemies');
});

// #9: патроны бронетехники ×5, однократно и не для пехоты/ДОТов.
test('#9: armored vehicle ammo is multiplied by five exactly once', () => {
  const s = createSandbox(freshAppData());
  const m = /\(function applyVehicleAmmoScaleX5\(\)[\s\S]*?\}\)\(\);/.exec(HTML);
  assert(m, 'the vehicle ammo scale migration exists');
  s.run(`
    appData.squads = [
      { name: 'Танк', ammoSmall: 200 },
      { name: 'Пехотное отделение', ammoSmall: 200 },
      { name: 'ДОТ Bosh', ammoSmall: 200, armor: 3 }
    ];
    appData.templates = [{ name: 'Бронеавтомобили Landsverk', ammoSmall: 100, armor: 2 }];
    appData.campaign.opUnits = [{ name: 'Взвод', squads: [{ name: 'САУ', ammoSmall: 50 }], vehicleList: [{ name: 'БТР', ammoSmall: 40 }] }];
  `);
  s.run(m[0]);
  s.run(m[0]); // повторная загрузка не должна умножить ещё раз
  s.run(`
    var tank = appData.squads[0].ammoSmall;
    var infantry = appData.squads[1].ammoSmall;
    var dot = appData.squads[2].ammoSmall;
    var template = appData.templates[0].ammoSmall;
    var squad = appData.campaign.opUnits[0].squads[0].ammoSmall;
    var vehicle = appData.campaign.opUnits[0].vehicleList[0].ammoSmall;
  `);
  equal(s.evalCtx('tank'), 1000, 'tank ammo is 200×5');
  equal(s.evalCtx('infantry'), 200, 'infantry ammo is untouched');
  equal(s.evalCtx('dot'), 200, 'static forts are untouched');
  equal(s.evalCtx('template'), 500, 'vehicle templates scale too');
  equal(s.evalCtx('squad'), 250, 'operational vehicle squads scale');
  equal(s.evalCtx('vehicle'), 200, 'vehicle group entries scale');
});

// #10: executeMoveOrder гасит скрытый марш у бронетехники.
test('#10: executeMoveOrder strips stealth movement from vehicles', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    function log() {}
    function isStaticOpUnit() { return false; }
    function isVehicleMobilityUnit(u) { return !!u.isVehicle; }
    var unit = { name: 'Танк', isVehicle: true, col: 3, row: 0, ap: 2, isAmbush: false, stealthMove: true };
    var order = { targetHex: '3,0', waypoints: [], stealth: true };
  `);
  s.run(sliceFunction(HTML, 'executeMoveOrder'));
  s.run('executeMoveOrder(unit, order);');
  equal(s.evalCtx('order.stealth'), false, 'vehicle orders lose the stealth flag');
  equal(s.evalCtx('unit.stealthMove'), false, 'the unit stealth marker is cleared too');
});

// #6: перенос панели в слот не включает «Спешиться» всем подряд.
test('#6: moveIntoSlot no longer forces the dismount panel visible', () => {
  const fn = sliceFunction(HTML, 'moveIntoSlot');
  assert(fn.includes("elId !== 'dismountPanel'"), 'the dismount panel keeps updateDismountPanel as its only visibility source');
  assert(HTML.includes('try { if (typeof updateDismountPanel === \'function\') updateDismountPanel(); } catch (e) {}'),
    'visibility rules are re-applied after moving the panel');
});

// #11: галочка скрытого перемещения работает для любого выбранного юнита.
test('#11: tactical stealth toggle works for armored units too', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    var cbEl = { checked: true };
    document.getElementById = function (id) {
      if (id === 'crouchMoveCheck') return cbEl;
      return { style: {}, checked: false };
    };
    var logged = [];
    function log(msg) { logged.push(String(msg)); }
    function recalcReachable() {}
    function redrawMap() {}
    appData.map = { isCrouchMode: false, selectedMoveSquadIdx: null };
    appData.squads = [];
  `);
  s.run(sliceFunction(HTML, 'toggleCrouchMove'));
  s.run('toggleCrouchMove();');
  equal(s.evalCtx('appData.map.isCrouchMode'), true, 'the stealth flag applies without armor checks');
  equal(s.evalCtx('logged.some(x => x.indexOf("Бронетехника") >= 0)'), false, 'no armored-vehicle denial is logged');
  const pace = sliceFunction(HTML, 'setTacticalMovePace');
  assert(!pace.includes('isArmoredTacticalSquad'), 'setTacticalMovePace has no armored restriction');
  const select = sliceFunction(HTML, 'selectSquad');
  assert(!select.includes('isArmoredTacticalSquad(currentSquad) && appData.map && appData.map.isCrouchMode'),
    'selecting a unit does not silently disable the stealth flag');
});

// #7: уведомление о завершении фазы противника при нескольких боях.
test('#7: enemy-phase completion is announced when several battles run', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    var toasts = [];
    var listed = 0;
    function log() {}
    window.toast = function (msg) { toasts.push(String(msg)); };
    function renderActiveBattlesList() { listed++; }
    appData.campaign.activeBattles = [
      { id: 'a', hexKey: '1,2', pausedForOrders: false, playerSquads: [{ fighters: [{ hp: 3 }] }], enemySquads: [{ fighters: [{ hp: 3 }] }] },
      { id: 'b', hexKey: '5,6', pausedForOrders: false, playerSquads: [{ fighters: [{ hp: 3 }] }], enemySquads: [{ fighters: [{ hp: 3 }] }] }
    ];
  `);
  s.run(sliceFunction(HTML, 'tacticalBattleStillFought'));
  s.run(sliceFunction(HTML, 'notifyEnemyPhaseComplete'));
  s.run("notifyEnemyPhaseComplete(appData.campaign.activeBattles[0]);");
  equal(s.evalCtx('toasts.length'), 1, 'the notification is shown');
  equal(s.evalCtx("toasts[0].indexOf('1,2') >= 0 && toasts[0].indexOf('фаза противника завершена') >= 0"), true,
    'the toast names the battle hex and the finished enemy phase');
  equal(s.evalCtx('listed'), 1, 'the active battle list is refreshed');
  s.run('toasts.length = 0; appData.campaign.activeBattles.pop();');
  s.run("notifyEnemyPhaseComplete(appData.campaign.activeBattles[0]);");
  equal(s.evalCtx('toasts.length'), 0, 'a single running battle needs no multi-battle notice');
});

// #5: панель размещения показывает только неразмещённых; drag-обработчики есть.
test('#5: placement tray lists unplaced squads and supports drag & drop', () => {
  const s = createSandbox(freshAppData());
  ['placementBattleGrid'].forEach(name => s.run(sliceFunction(PLACEMENT, name)));
  s.run(sliceFunction(PLACEMENT, 'placementTrayUnplacedSquads'));
  s.run(`
    function getCurrentBattleRecord() { return battle; }
    var battle = { id: 'b1' };
    appData.currentBattleId = battle.id;
    appData.squads = [
      { name: 'Размещён', fighters: [{ hp: 3 }] },
      { name: 'Не размещён', fighters: [{ hp: 3 }] },
      { name: 'Скрытый', hidden: true, fighters: [{ hp: 3 }] },
      { name: 'Мёртвый', fighters: [{ hp: 0 }] }
    ];
    appData.map = { grid: { '0,0': { squadIds: [0], enemySquadIds: [] } } };
    var list = placementTrayUnplacedSquads(battle).map(x => x.s.name).join(',');
  `);
  equal(s.evalCtx('list'), 'Не размещён', 'only the unplaced alive squad appears in the tray');
  assert(PLACEMENT.includes('installBattlePlacementTray'), 'drag-and-drop installer exists');
  assert(PLACEMENT.includes('data-battle-place-unit'), 'tray chips carry the squad index');
  assert(PLACEMENT.includes('tacticalCanvasHexAt(event.clientX, event.clientY, canvas)'), 'drops resolve the target hex on the tactical map');
  assert(HTML.includes("try { if (typeof renderPlacementPanel === 'function') renderPlacementPanel(); } catch (e) {}"),
    'placing/removing a squad refreshes the tray');
});

// #8: тактическая карта двигается перетаскиванием.
test('#8: tactical map supports click-and-drag panning', () => {
  assert(HTML.includes('function setupTacticalMapPanning()'), 'the panning installer exists');
  assert(HTML.includes('try { setupTacticalMapPanning(); } catch (e) {}'), 'initMap installs the panning');
  const fn = sliceFunction(HTML, 'setupTacticalMapPanning');
  assert(fn.includes('PAN_THRESHOLD'), 'movement beyond a threshold counts as a drag');
  assert(fn.includes('pan.suppressUntil'), 'a click right after the drag is suppressed');
});

console.log(`\nИтог новых правок v13.131: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exitCode = 1;
