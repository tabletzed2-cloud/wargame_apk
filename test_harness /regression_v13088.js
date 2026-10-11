'use strict';
// ⚡ v13.088: регрессия по десяти жалобам на интерфейс и приказы:
//   1) пустая вкладка «Батальон» (личный состав);
//   2) панель распределённой связи (дубли строк, телефонные кабели);
//   3) «Сесть в БТР» → доступна высадка на выбранный гекс, БТР доезжает туда;
//   4) «Сопровождение» для всех юнитов + дублирование приказов сопровождаемого;
//   5) зелёная зона расстановки;
//   6) «Объединить технику» среди закреплённых кнопок;
//   7) табло времени закреплено сверху;
//   8) всплывающее меню юнита не перекрывает карту;
//   9) подтверждение приказа показывает срок доставки и время начала;
//  10) соло-кампания не ждёт хода оппонента.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');
const UI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/operational_ui.css'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('✓ ' + name); }
  catch (e) { fail++; console.log('✗ ' + name + ' — ' + e.message.split('\n')[0]); }
}
function mkUnit(name, extra) {
  return Object.assign({ name, col: 3, row: 4, ap: 4, maxAp: 4, isDestroyed: false }, extra || {});
}

// ─────────────────────────── версия ───────────────────────────
test('v13.088: версия, маркеры и кэш синхронизированы', () => {
  assert.match(HTML, /var APP_VERSION = 'v13\.088'/);
  assert.match(SW, /const CACHE_NAME = 'wargame-v13\.088';/);
  assert.match(UI, /BUILD-МАРКЕР: v13\.088/);
  assert.match(fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8'), /BUILD-МАРКЕР: v13\.088/);
  assert.match(fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8'), /BUILD-МАРКЕР: v13\.088/);
  assert.match(fs.readFileSync(path.join(ROOT, 'js/templates.js'), 'utf8'), /BUILD-МАРКЕР: v13\.088/);
});

// ────────────── 1. личный состав батальона ──────────────
test('v13.088 (п.1): экран личного состава — сосед карты, а не её потомок', () => {
  const rosterAt = HTML.indexOf('<div id="battalionRosterScreen"');
  const mapAt = HTML.indexOf('<div id="campaignMapScreen"');
  const appAt = HTML.indexOf('<div id="campaignApp"');
  assert.ok(appAt > 0 && rosterAt > 0 && mapAt > 0, 'все три контейнера найдены');
  assert.ok(appAt < rosterAt && rosterAt < mapAt, 'порядок: campaignApp → roster → карта');
  // блок ростера должен быть ЗАКРЫТ до начала экрана карты (иначе список
  // личного состава остаётся внутри карты и не показывается)
  const rosterBlock = HTML.slice(rosterAt, mapAt);
  let depth = 0, closedAt = -1;
  const re = /<div\b|<\/div>/g;
  let m;
  while ((m = re.exec(rosterBlock))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) { closedAt = m.index; break; }
  }
  assert.ok(closedAt > 0, 'блок ростера закрыт до экрана карты');
  assert.ok(rosterBlock.includes('id="battalionRosterList"'), 'список личного состава внутри блока ростера');
});

test('v13.088 (п.1): showBattalionRoster показывает ростер и прячет карту', () => {
  const src = sliceFunction(HTML, 'showBattalionRoster');
  assert.match(src, /battalionRosterScreen'[\s\S]{0,200}?display\s*=\s*'block'/);
  assert.match(src, /campaignMapScreen[\s\S]{0,300}?display\s*=\s*'none'/);
});

// ────────────── 2. панель распределённой связи ──────────────
test('v13.088 (п.2): рации/телефоны без дублей, у отзыва — своя строка', () => {
  const src = sliceFunction(HTML, 'renderCommunicationPanel');
  assert.match(src, /seenRows/, 'раций: дедупликация строк');
  assert.match(src, /seenTransfers/, 'телефонов: дедупликация строк');
  assert.match(src, /status\s*===\s*'returning'/, 'отозванная рация не дублируется строкой выдачи');
  assert.match(src, /Свободно в штабе:\s*\$\{[^}]+\}\s*из/, 'подпись «Свободно в штабе: N из M»');
});

test('v13.088 (п.2): видно, как идёт прокладка кабеля', () => {
  const src = sliceFunction(HTML, 'renderCommunicationPanel');
  assert.match(src, /прокладывают кабель/, 'прогресс прокладки кабеля');
  assert.match(src, /гексов/, 'прогресс в гексах');
  assert.match(src, /связь действует/);
  assert.match(src, /phoneLinesList/, 'список телефонных линий заполняется');
});

// ────────────── 3. посадка/высадка БТР на выбранный гекс ──────────────
test('v13.088 (п.3): orderDisembarkHex читает только корректный гекс', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'orderDisembarkHex'));
  assert.equal(s.evalCtx(`orderDisembarkHex({ targetHex: '9,7' })`), '9,7');
  assert.equal(s.evalCtx(`orderDisembarkHex({ targetHex: '' })`), null);
  assert.equal(s.evalCtx(`orderDisembarkHex({})`), null);
  assert.equal(s.evalCtx(`orderDisembarkHex({ targetHex: 'там' })`), null);
});

test('v13.088 (п.3): ensureBtrReachesHex дописывает гекс в маршрут БТР один раз', () => {
  const s = createSandbox(freshAppData());
  s.run('function getAllOrdersList(){ return appData.campaign.__orders || []; }');
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(`
    var carrier = { name: 'БТР №1', col: 3, row: 4 };
    appData.campaign.opUnits = [{ name: 'десант' }, carrier];
    appData.campaign.__orders = [
      { toUnitId: 1, type: 'move', status: 'active', waypoints: [{ col: 4, row: 4 }] },
      { toUnitId: 0, type: 'move', status: 'active', waypoints: [] }
    ];
    var first = ensureBtrReachesHex(carrier, '9,7');
    var second = ensureBtrReachesHex(carrier, '9,7');
  `);
  assert.equal(s.evalCtx('first'), true, 'маршрут БТР дополнен');
  assert.equal(s.evalCtx('second'), true, 'повторный вызов не ломает маршрут');
  const wp = s.evalCtx('appData.campaign.__orders[0].waypoints');
  assert.equal(wp.length, 2, 'гекс добавлен один раз: ' + JSON.stringify(wp));
  // объект из vm-контекста — сравниваем поля, а не прототип
  assert.equal(wp[1].col, 9);
  assert.equal(wp[1].row, 7);
  assert.equal(s.evalCtx('appData.campaign.__orders[0].targetHex'), '9,7');
  assert.equal(s.evalCtx('appData.campaign.__orders[1].waypoints.length'), 0, 'чужой приказ не тронут');
});

test('v13.088 (п.3): гекс высадки дописывается и в серию приказов БТР', () => {
  const s = createSandbox(freshAppData());
  s.run('function getAllOrdersList(){ return appData.campaign.__orders || []; }');
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(`
    var carrier = { name: 'БТР №1', col: 3, row: 4 };
    appData.campaign.opUnits = [{ name: 'десант' }, carrier];
    appData.campaign.__orders = [{
      toUnitId: 1, type: 'series', status: 'active',
      series: [
        { type: 'move', status: 'completed', waypoints: [{ col: 4, row: 4 }] },
        { type: 'escort', status: 'active', waypoints: [{ col: 5, row: 4 }] }
      ]
    }];
    ensureBtrReachesHex(carrier, '8,6');
  `);
  const done = s.evalCtx('appData.campaign.__orders[0].series[0].waypoints.length');
  const active = s.evalCtx('appData.campaign.__orders[0].series[1].waypoints.length');
  assert.equal(done, 1, 'выполненный шаг серии не меняем');
  assert.equal(active, 2, 'активный шаг серии дополнен гексом высадки');
  assert.equal(s.evalCtx('appData.campaign.__orders[0].series[1].targetHex'), '8,6');
});

test('v13.088 (п.3): driveBtrToDisembarkHex — true только по прибытии', () => {
  const s = createSandbox(freshAppData());
  s.run('function getAllOrdersList(){ return []; }');
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(sliceFunction(HTML, 'driveBtrToDisembarkHex'));
  s.run(`
    var carrier = { name: 'БТР №1', col: 3, row: 4 };
    appData.campaign.opUnits = [carrier];
    var stepResult = 'partial';
    function stepUnitTowardTarget(unit, col, row) { unit.col = col - 1; return stepResult; }
    var far = driveBtrToDisembarkHex(carrier, '9,7', 'десант');
    stepResult = 'reached';
    carrier.col = 9; carrier.row = 7;
    var near = driveBtrToDisembarkHex(carrier, '9,7', 'десант');
    carrier.isInBattle = true; carrier.col = 1; carrier.row = 1;
    var busy = driveBtrToDisembarkHex(carrier, '9,7', 'десант');
  `);
  assert.equal(s.evalCtx('far'), false, 'пока БТР в пути — высадки нет');
  assert.match(s.logs.join('\n'), /везёт «десант» к гексу высадки \(9,7\)/);
  assert.equal(s.evalCtx('near'), true, 'на месте — высадка разрешена');
  assert.equal(s.evalCtx('busy'), false, 'в бою высадка откладывается');
  assert.match(s.logs.join('\n'), /в бою — высадка/);
});

test('v13.088 (п.3): приказ «Выйти из БТР» ждёт БТР у выбранного гекса', () => {
  const s = createSandbox(freshAppData());
  s.run('function getAllOrdersList(){ return []; }');
  s.run('function updateBtrPanel(){}');
  s.run('function stepUnitTowardTarget(unit, col, row) { unit.col = col - 1; return "partial"; }');
  s.run(sliceFunction(HTML, 'orderDisembarkHex'));
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(sliceFunction(HTML, 'driveBtrToDisembarkHex'));
  s.run(sliceFunction(HTML, 'executeDisembarkOrder'));
  s.run(`
    var passenger = { name: 'десант', embarkedInBtr: true, hidden: true, col: null, row: null, btrIds: [1], mobility: 'foot' };
    var carrier = { name: 'БТР №1', col: 3, row: 4, embarkedUnit: 'десант', embarkedUnitId: 0 };
    appData.campaign.opUnits = [passenger, carrier];
    var order = { type: 'disembark', status: 'active', targetHex: '9,7' };
    executeDisembarkOrder(passenger, order);
  `);
  assert.equal(s.evalCtx('passenger.embarkedInBtr'), true, 'десант остался в машине');
  assert.equal(s.evalCtx('order.status'), 'active', 'приказ не закрыт раньше времени');
  assert.match(s.logs.join('\n'), /везёт «десант» к гексу высадки/);
});

test('v13.088 (п.3): шаг «disembark» в серии не закрывается принудительно', () => {
  const src = sliceFunction(HTML, 'executeSeriesOrder');
  const block = src.slice(src.indexOf("case 'disembark'"));
  const caseBody = block.slice(0, block.indexOf('case ', 10) > 0 ? block.indexOf('case ', 10) : 400);
  assert.doesNotMatch(caseBody, /status\s*=\s*'completed';\s*\n\s*break;/, 'серия не помечает высадку выполненной до её исполнения');
  assert.match(caseBody, /executeDisembarkOrder/);
});

test('v13.088 (п.3): в приказе высадки есть выбор гекса', () => {
  assert.match(UI, /pendingEmbarkOrder/, 'посадка в БТР видна в меню приказов');
  assert.match(UI, /disembark[\s\S]{0,600}?targetHex/, 'высадка принимает целевой гекс');
  assert.match(UI, /маршрут дополняется/i, 'подсказка, что маршрут БТР будет дополнен');
});

// ────────────── 4. «Сопровождение» для всех юнитов ──────────────
test('v13.088 (п.4): пункт называется «Сопровождение» (без слова «пехоты»)', () => {
  assert.doesNotMatch(HTML, /Сопровождение пехоты/i);
  assert.doesNotMatch(UI, /Сопровождение пехоты/i);
  assert.ok((HTML.match(/🛡️ Сопровождение/g) || []).length >= 2, 'название в обеих таблицах подписей');
  assert.match(HTML, /<option value="escort">[^<]*Сопровождение/);
});

test('v13.088 (п.4): сопровождение доступно любому юниту, маршрут не требуется', () => {
  const src = sliceFunction(HTML, 'executeEscortOrder');
  assert.doesNotMatch(src, /btr_platoon/, 'нет привязки к БТР');
  assert.match(src, /сопровождаемый отряд не найден/);
  assert.match(UI, /escortInfantryId/, 'выбор сопровождаемого отряда');
  const escortBranch = UI.slice(UI.indexOf("draft.mode === 'escort'"));
  const branch = escortBranch.slice(0, escortBranch.indexOf('} else {'));
  assert.doesNotMatch(branch, /Сначала выберите маршрут/, 'маршрут для сопровождения не обязателен');
});

test('v13.088 (п.4): executeEscortOrder работает для техники и пехоты', () => {
  const s = createSandbox(freshAppData());
  s.run('var moved = null; function executeMoveOrder(u, o){ moved = { unit: u.name, hex: o.targetHex }; }');
  s.run(sliceFunction(HTML, 'executeEscortOrder'));
  s.run(`
    var tank = { name: 'Танк №1', col: 3, row: 4, ap: 6, maxAp: 6 };
    var inf = { name: '1-й взвод', col: 7, row: 9, ap: 4, maxAp: 4 };
    appData.campaign.opUnits = [tank, inf];
    executeEscortOrder(tank, { type: 'escort', escortInfantryId: 1, status: 'active', behavior: 'hold' });
    var followHex = moved && moved.hex;
    var apCap = tank.ap;
    var escortId = inf.escortedByUnitId;
    tank.col = 7; tank.row = 9;
    var order3 = { type: 'escort', escortInfantryId: 1, status: 'active' };
    executeEscortOrder(tank, order3);
  `);
  assert.equal(s.evalCtx('followHex'), '7,9', 'техника идёт к сопровождаемому отряду');
  assert.equal(s.evalCtx('apCap'), 4, 'ОД сопровождающего ограничены ОД отряда');
  assert.equal(s.evalCtx('escortId'), 0, 'отряд знает, кто его сопровождает');
  assert.match(s.logs.join('\n'), /держится с «1-й взвод»/, 'на одном гексе — просто следует рядом');
});

test('v13.088 (п.4): приказы сопровождаемого копируются сопровождающему', () => {
  assert.match(UI, /function mirrorLeaderOrdersToEscort/, 'функция дублирования приказов');
  assert.match(UI, /mirrorLeaderOrdersToEscort\(/, 'вызывается при отдаче приказа');
  assert.match(UI, /escortMirrorInfantryId/, 'копия помечена как зеркало');
  assert.match(UI, /скопировано приказов сопровождаемого/, 'в подтверждении видно число копий');
  const src = UI.slice(UI.indexOf('function mirrorLeaderOrdersToEscort'));
  const body = src.slice(0, src.indexOf('\n  }\n'));
  assert.match(body, /'escort', 'series', 'artillery_strike', 'company_order'/, 'рекурсия и неподходящие типы отсекаются');
  assert.match(body, /\['cancelled', 'completed'\]/, 'закрытые приказы не копируются');
});

test('v13.088 (п.4): новый приказ лидеру тоже уходит сопровождающему', () => {
  // issueDraftOrder обязан звать дублирование ПОСЛЕ создания приказа лидера
  const src = UI.slice(UI.indexOf('function issueDraftOrder'));
  const body = src.slice(0, src.indexOf('\n  }\n'));
  const atIssue = body.indexOf('issueOneOrder');
  const atMirror = body.indexOf('mirrorLeaderOrdersToEscort');
  assert.ok(atIssue > 0, 'приказ лидера создаётся');
  assert.ok(atMirror > atIssue, 'дублирование — после создания приказа лидера');
  assert.match(body, /type === 'escort'/, 'дублирование только для сопровождения');
});

// ────────────── 5. зона расстановки ──────────────
test('v13.088 (п.5): зона расстановки подсвечена поверх нейтральной подложки', () => {
  assert.match(HTML, /rgba\(28, 40, 48, 0\.38\)/, 'нейтральная подложка гекса');
  assert.match(HTML, /rgba\(46, 204, 113, 0\.45\)/, 'зелёная заливка зоны');
  assert.match(HTML, /rgba\(150, 255, 190, 1\)/, 'яркая обводка зоны');
  assert.match(HTML, /localSetupZone/, 'зона рисуется только у игрока на этапе размещения');
});

// ────────────── 6. «Объединить технику» в доке ──────────────
test('v13.088 (п.6): кнопка объединения техники — среди закреплённых', () => {
  const at = HTML.indexOf('<div id="opQuickActions"');
  assert.ok(at > 0, 'док быстрых кнопок найден');
  const close = HTML.indexOf('</div>', at);
  const dock = HTML.slice(at, close);
  assert.match(dock, /id="opMergeBtn"/, 'кнопка внутри дока');
  assert.match(dock, /data-quick-action="merge"/);
  assert.match(UI, /case 'merge'|action === 'merge'|'merge':/, 'клик обрабатывается в доке');
});

// ────────────── 7. табло времени ──────────────
test('v13.088 (п.7): табло времени закреплено сверху', () => {
  const at = CSS.indexOf('#opTimeDisplay');
  assert.ok(at > 0, 'правило #opTimeDisplay есть в operational_ui.css');
  const rule = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(rule, /position:\s*sticky/);
  assert.match(rule, /top:\s*0/);
  assert.match(rule, /z-index:\s*9\d\d/);
});

// ────────────── 8. меню юнита не перекрывает карту ──────────────
test('v13.088 (п.8): пока открыто меню приказов, всплывающие кнопки скрыты', () => {
  const pinned = UI.slice(UI.indexOf('function renderPinnedActions'));
  assert.match(pinned.slice(0, pinned.indexOf('\n  }\n')), /!state\.menuOpen/, 'закреплённые кнопки зависят от состояния меню');
  const menu = UI.slice(UI.indexOf('function renderCommandMenu'));
  assert.match(menu.slice(0, menu.indexOf('\n  }\n')), /opQuickActions[\s\S]{0,200}?display\s*=\s*'none'/, 'меню прячет быстрые кнопки');
  const closeMenu = UI.slice(UI.indexOf('function closeCommandMenu'));
  assert.match(closeMenu.slice(0, closeMenu.indexOf('\n  }\n')), /renderPinnedActions\(\)/, 'при закрытии меню кнопки возвращаются');
});

// ────────────── 9. подтверждение приказа ──────────────
test('v13.088 (п.9): describeOrderEta называет срок доставки и время начала', () => {
  const s = createSandbox(freshAppData());
  s.run('appData.campaign.currentTime = 0;');
  s.run(sliceFunction(HTML, 'pluralTurns'));
  s.run(sliceFunction(HTML, 'formatMinuteOfDay'));
  s.run(sliceFunction(HTML, 'describeOrderEta'));
  const delivering = s.evalCtx(`describeOrderEta({ status: 'delivering', deliveryTurnsNeeded: 3, deliveryTurnsPassed: 1, startTimeMin: 145 })`);
  assert.match(delivering, /посыльный доставит через 2 хода/, delivering);
  assert.match(delivering, /прошёл 1 из 3/);
  assert.match(delivering, /начало в 02:25/);
  const queued = s.evalCtx(`describeOrderEta({ status: 'queued', startTimeMin: 10 })`);
  assert.match(queued, /ждёт свободного посыльного штаба/, queued);
  const activeLater = s.evalCtx(`describeOrderEta({ status: 'active', startTimeMin: 30 })`);
  assert.match(activeLater, /начнёт исполняться через 3 хода/, activeLater);
  const activeNow = s.evalCtx(`describeOrderEta({ status: 'active', startTimeMin: 0 })`);
  assert.match(activeNow, /доставлен — исполняется/, activeNow);
  assert.equal(s.evalCtx(`pluralTurns(1)`), 'ход');
  assert.equal(s.evalCtx(`pluralTurns(2)`), 'хода');
  assert.equal(s.evalCtx(`pluralTurns(5)`), 'ходов');
  assert.equal(s.evalCtx(`pluralTurns(11)`), 'ходов');
  assert.equal(s.evalCtx(`pluralTurns(21)`), 'ход');
});

test('v13.088 (п.9): подтверждение приказа использует срок, а не «просто исполнится»', () => {
  const src = UI.slice(UI.indexOf('function issueDraftOrder'));
  const body = src.slice(0, src.indexOf('\n  }\n'));
  assert.match(body, /describeOrderEta/, 'в подтверждении считается ETA');
  assert.match(body, /getOrderTypeLabel/, 'название приказа по-русски');
  assert.match(body, /\blog\(/, 'тот же текст уходит в журнал');
});

// ────────────── 10. соло-кампания ──────────────
test('v13.088 (п.10): «Компания» — одиночная игра, хода оппонента не ждём', () => {
  const s = createSandbox(freshAppData());
  s.run('var ONLINE = { started: true, match: { status: "playing" }, listener: null }; var uiLock = null;');
  s.run('function onlineSetTurnLockUI(v){ uiLock = v; }');
  s.run(sliceFunction(HTML, 'isSoloCampaign'));
  s.run(sliceFunction(HTML, 'detachOnlineMatchFromCampaign'));
  s.run(`
    appData.campaign.online = { roomId: 'R1', status: 'playing' };
    appData.campaign.onlineOpponent = { uid: 'u2', faction: 'A.I.R.F.' };
    var withMatch = isSoloCampaign();
    var detached = detachOnlineMatchFromCampaign();
    var afterDetach = isSoloCampaign();
  `);
  assert.equal(s.evalCtx('withMatch'), false, 'пока комната живая — кампания не соло');
  assert.equal(s.evalCtx('detached'), true, 'матч отсоединён');
  assert.equal(s.evalCtx('afterDetach'), true, 'после отсоединения — соло');
  assert.equal(s.evalCtx('appData.onlineRoom.roomId'), 'R1', 'комната сохранена для онлайн-меню');
  assert.equal(s.evalCtx('uiLock'), false, 'блокировка чужого хода снята');
  assert.equal(s.evalCtx('ONLINE.started'), false);
});

test('v13.088 (п.10): endOperationalTurn блокирует ход только в живой онлайн-комнате', () => {
  const src = sliceFunction(HTML, 'endOperationalTurn');
  const head = src.slice(0, src.indexOf('opTurnStartTime += 10'));
  const onlineGuards = (head.match(/appData\.campaign\.online/g) || []).length;
  assert.ok(onlineGuards >= 3, 'все онлайн-ветки проверяют appData.campaign.online: ' + onlineGuards);
  assert.match(head, /onlineMyTurnActive/, 'ожидание хода оппонента — только в онлайне');
  assert.doesNotMatch(head, /isSoloCampaign\(\)[\s\S]{0,200}?return;/, 'соло-кампания не возвращается раньше времени');
  // в соло ход сдвигается сразу
  const solo = sliceFunction(HTML, 'endOperationalTurn');
  assert.match(solo, /opTurnStartTime \+= 10/);
  assert.match(src, /processOrders\(/);
});

test('v13.088 (п.10): новая кампания отсоединяет прежний онлайн-матч', () => {
  const src = sliceFunction(HTML, 'startFreshCampaignProgress');
  assert.match(src, /detachOnlineMatchFromCampaign\(\)/);
  assert.match(src, /ONLINE\.pendingStart/, 'старт из лобби остаётся онлайн-матчем');
});

console.log('\nИтог v13.088: PASS ' + pass + ' · FAIL ' + fail);
if (fail) process.exit(1);
