// Регрессия v13.090 — три уточнения пользователя к сопровождению и высадке:
//   п.1) высаженный отряд продолжает движение только со следующего хода;
//   п.2) сопровождающий перестаёт повторять приказы, как только получит
//        свой новый приказ (или если приказ сопровождения отменён);
//   п.3) если БТР не может доехать до гекса высадки — высаживает десант
//        раньше, максимально приблизившись к точке.
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML } = require('./extract');
const VERSION = /var APP_VERSION = '(v[\d.]+)'/.exec(HTML)[1];

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.log(`✗ ${name} — ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'утверждение не выполнено'); }
assert.equal = (a, b, m) => assert(a === b, (m || 'равенство') + `: получили ${JSON.stringify(a)}, ждали ${JSON.stringify(b)}`);
assert.match = (s, re, m) => assert(re.test(s), (m || 'лог') + `: в тексте не найдено ${re}`);
assert.deepEqual = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), (m || 'список') + `: получили ${JSON.stringify(a)}, ждали ${JSON.stringify(b)}`);

// песочница даёт голый appData — доводим его до боевой кампании
function campaignData(turn) {
  const data = freshAppData();
  data.campaign.currentTurn = turn === undefined ? 5 : turn;
  data.campaign.orders = [];
  data.campaign.enemySpotted = [];
  data.campaign.pendingEnemyOrders = [];
  data.campaign.fogOfWar = true;
  data.campaign.scenario = 'default';
  data.campaign.hardMode = { enabled: false, playerSide: 'A', orders: [], timeMinutes: 12 * 60, aiTurnProcessed: false };
  return data;
}

// ── п.1: ход высадки отряд не действует ────────────────────────────────
test('v13.090 (п.1): высадка снимает ОД и помечает текущий ход', () => {
  const s = createSandbox(campaignData());
  s.run(sliceFunction(HTML, 'markJustDisembarked'));
  s.run(sliceFunction(HTML, 'justDisembarkedThisTurn'));
  s.run(`
    var squad = { name: 'Мотострелки', ap: 8 };
    markJustDisembarked(squad);
    var apAfter = squad.ap, markedNow = justDisembarkedThisTurn(squad);
    appData.campaign.currentTurn = 6;
    var markedNext = justDisembarkedThisTurn(squad);
  `);
  assert.equal(s.evalCtx('apAfter'), 0, 'ОД высаженного отряда обнулены');
  assert.equal(s.evalCtx('markedNow'), true, 'в ход высадки отряд помечен');
  assert.equal(s.evalCtx('markedNext'), false, 'со следующего хода метка снята');
});

test('v13.090 (п.1): в ход высадки приказ не исполняется и не отменяется', () => {
  const s = createSandbox(campaignData());
  s.run('var logs = [];');
  s.run('function getOrderTypeLabel(){ return "Передвижение"; }');
  s.run('function isOrderTime(){ return true; }');
  s.run('function justDisembarkedThisTurn(u){ return !!u.justDisembarked; }');
  s.run('function getUnitById(id){ return appData.campaign.opUnits[id]; }');
  s.run('var executed = [];');
  ['executeMoveOrder','executeAmbushOrder','executeArtilleryOrder','executeAirStrike',
   'executeAirRecon','executeSignalLay','executeSignalIssue','executeReinforcement',
   'executeRegroupOrder','executeSeriesOrder','executeDisembarkOrder','executeAttackOrder']
    .forEach(fn => s.run(`function ${fn}(){ executed.push("${fn}"); }`));
  s.run(sliceFunction(HTML, 'executeOrder'));
  s.run(`
    var squad = { id: 3, name: 'Мотострелки', ap: 8, justDisembarked: true };
    appData.campaign.opUnits = [null, null, null, squad];
    var order = { fromUnitId: 0, toUnitId: 3, type: 'move', col: 9, row: 7, status: 'active', time: '12:00' };
    executeOrder(order);
    var inDismountTurn = executed.slice();
    order.status = 'active'; squad.justDisembarked = false;
    executeOrder(order);
    var nextTurn = executed.slice();
  `);
  assert.equal(s.evalCtx('order.status'), 'active', 'приказ высаженного отряда остался активным');
  assert.deepEqual(s.evalCtx('inDismountTurn'), [], 'в ход высадки приказ не исполнялся');
  assert.deepEqual(s.evalCtx('nextTurn'), ['executeMoveOrder'], 'со следующего хода приказ отработал');
  assert.match(s.logs.join('\n'), /только что высадился/, 'в логе сказано, что приказ начнётся со следующего хода');
});

test('v13.090 (п.1): высадка помечает отряд в обеих ветках', () => {
  const s = createSandbox(campaignData());
  s.run('function getAllOrdersList(){ return []; }');
  s.run('function updateBtrPanel(){}');
  s.run('function stepUnitTowardTarget(){ return "no_route"; }');
  s.run(sliceFunction(HTML, 'orderDisembarkHex'));
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(sliceFunction(HTML, 'driveBtrToDisembarkHex'));
  s.run(sliceFunction(HTML, 'markJustDisembarked'));
  s.run(sliceFunction(HTML, 'executeDisembarkOrder'));
  s.run(`
    var squad = { name: '1-й взвод', embarkedInBtr: true, hidden: true, col: null, row: null, btrIds: [3], mobility: 'foot', ap: 8 };
    var btr = { name: 'БТР №1', type: 'btr_platoon', col: 7, row: 7, groupSize: 2, isGroup: true,
                memberIds: [squad], embarkedUnit: squad.name, embarkedUnitId: 3, ap: 8 };
    appData.campaign.opUnits = [null, null, null, squad, null, null, null, btr];
    appData.campaign.enemyOpUnits = [];
    appData.campaign.opMapGrid = { '7,7': ['road'] };
    executeDisembarkOrder(btr, { type: 'disembark', status: 'active', disembarkUnitId: 3, disembarkHex: null, waypoints: [] });
    var viaBtr = { marked: squad.justDisembarkedTurn, ap: squad.ap };

    var second = { name: '2-й взвод', embarkedInBtr: true, hidden: true, col: null, row: null, btrIds: [3], mobility: 'foot', ap: 8 };
    appData.campaign.opUnits = [null, null, null, second, null, null, null, btr];
    btr.embarkedUnit = second.name;
    btr.embarkedUnitId = 3;
    executeDisembarkOrder(second, { type: 'disembark', status: 'active', disembarkUnitId: 3, disembarkHex: null, waypoints: [] });
    var viaSquad = { marked: second.justDisembarkedTurn, ap: second.ap };
  `);
  assert.deepEqual(s.evalCtx('viaBtr'), { marked: 5, ap: 0 }, 'высадка приказом БТР помечает отряд');
  assert.deepEqual(s.evalCtx('viaSquad'), { marked: 5, ap: 0 }, 'высадка приказом отряда помечает отряд');
  assert.match(s.logs.join('\n'), /со следующего хода/, 'в логе сказано, когда отряд продолжит');
});

// ── п.2: новый приказ сопровождающему прекращает сопровождение ─────────
function escortSandbox() {
  const s = createSandbox(campaignData());
  s.run('var logs = [];');
  s.run('function getAllOrdersList(){ return appData.campaign.hardMode.orders; }');
  s.run(sliceConst(HTML, 'ESCORT_MIRROR_SKIP_TYPES'));
  s.run('let escortMirrorDepth = 0;');
  s.run(sliceFunction(HTML, 'unitCanExecuteOrderType'));
  s.run(sliceFunction(HTML, 'escortFollowersOf'));
  s.run(sliceFunction(HTML, 'stopEscortMirroringFor'));
  s.run(sliceFunction(HTML, 'mirrorOrderToEscorts'));
  return s;
}

test('v13.090 (п.2): новый приказ сопровождающему снимает сопровождение', () => {
  const s = escortSandbox();
  s.run(`
    var leader = { id: 8, name: 'Штаб роты №1', type: 'infantry_squad', col: 3, row: 4, isGroup: true };
    var escort = { id: 17, name: 'БТР Llanero №1', type: 'btr_platoon', col: 3, row: 5, isGroup: true };
    appData.campaign.opUnits = []; appData.campaign.opUnits[8] = leader; appData.campaign.opUnits[17] = escort;
    appData.campaign.hardMode.orders = [
      { type: 'escort', toUnitId: 17, escortInfantryId: 8, status: 'active', col: 3, row: 4, time: '12:00' }
    ];
    var stopped = stopEscortMirroringFor({ type: 'move', toUnitId: 17, col: 12, row: 3, status: 'active', time: '12:00' });
    var escortStatus = appData.campaign.hardMode.orders[0].status;
    var duplicated = mirrorOrderToEscorts({ type: 'move', toUnitId: 8, col: 10, row: 2, status: 'active', time: '12:00' });
  `);
  assert.equal(s.evalCtx('stopped'), 1, 'приказ сопровождения отменён');
  assert.equal(s.evalCtx('escortStatus'), 'cancelled', 'статус — отменён');
  assert.equal(s.evalCtx('duplicated'), 0, 'приказы лидера больше не дублируются');
  assert.match(s.logs.join('\n'), /сопровождение «Штаб роты №1» прекращено/);
});

test('v13.090 (п.2): копии приказов сопровождение не снимают', () => {
  const s = escortSandbox();
  s.run(`
    appData.campaign.opUnits = [];
    appData.campaign.opUnits[8] = { id: 8, name: 'Штаб роты №1', type: 'infantry_squad', isGroup: true };
    appData.campaign.opUnits[17] = { id: 17, name: 'БТР Llanero №1', type: 'btr_platoon', isGroup: true };
    appData.campaign.hardMode.orders = [
      { type: 'escort', toUnitId: 17, escortInfantryId: 8, status: 'active', col: 3, row: 4, time: '12:00' }
    ];
    var byCopy = stopEscortMirroringFor({ type: 'move', toUnitId: 17, escortMirrorInfantryId: 8, status: 'active', time: '12:00' });
    var byEscort = stopEscortMirroringFor({ type: 'escort', toUnitId: 17, escortInfantryId: 8, status: 'active', time: '12:00' });
    var byCompany = stopEscortMirroringFor({ type: 'company_order', orderType: 'move', toUnitId: -1, targetUnitIds: [17], status: 'active', time: '12:00' });
    var status = appData.campaign.hardMode.orders[0].status;
  `);
  assert.equal(s.evalCtx('byCopy'), 0, 'копия приказа сопровождение не снимает');
  assert.equal(s.evalCtx('byEscort'), 0, 'новое «Сопровождение» старое не ломает');
  assert.equal(s.evalCtx('byCompany'), 0, 'общий приказ роты не трогает сопровождение');
  assert.equal(s.evalCtx('status'), 'active', 'сопровождение осталось активным');
});

test('v13.090 (п.2): отмена сопровождения тоже останавливает дублирование', () => {
  const s = escortSandbox();
  s.run(`
    appData.campaign.opUnits = [];
    appData.campaign.opUnits[8] = { id: 8, name: 'Штаб роты №1', type: 'infantry_squad', isGroup: true };
    appData.campaign.opUnits[17] = { id: 17, name: 'БТР Llanero №1', type: 'btr_platoon', isGroup: true };
    appData.campaign.hardMode.orders = [
      { type: 'escort', toUnitId: 17, escortInfantryId: 8, status: 'cancelled', col: 3, row: 4, time: '12:00' }
    ];
    var duplicated = mirrorOrderToEscorts({ type: 'move', toUnitId: 8, col: 10, row: 2, status: 'active', time: '12:00' });
  `);
  assert.equal(s.evalCtx('duplicated'), 0, 'у отменённого сопровождения копий нет');
});

test('v13.090 (п.2): снятие сопровождения вызывается из createOrder', () => {
  const hook = HTML.slice(HTML.indexOf('function createOrder('));
  const body = hook.slice(0, hook.indexOf('\n  return order;\n}'));
  assert.match(body, /stopEscortMirroringFor\(order\)/, 'createOrder снимает сопровождение при новом приказе');
  assert(body.indexOf('stopEscortMirroringFor(order)') < body.indexOf('mirrorOrderToEscorts(order)'),
    'сначала снимается сопровождение, потом дублируется приказ');
});

// ── п.3: БТР высаживает десант максимально близко ──────────────────────
test('v13.090 (п.3): нет маршрута — БТР приближается к ближайшей доступной точке', () => {
  const s = createSandbox(campaignData());
  s.run('function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }');
  s.run('function getRouteToTarget(fc, fr, tc, tr) { return (tc === 8 && tr === 7) ? [{ col: tc, row: tr }] : []; }');
  s.run(sliceFunction(HTML, 'nearestReachableHexTo'));
  s.run(`
    var carrier = { name: 'БТР №1', col: 3, row: 4, ap: 8, mobility: 'wheels', type: 'btr_platoon' };
    var near = nearestReachableHexTo(carrier, 9, 7);
  `);
  assert.deepEqual(s.evalCtx('near'), { col: 8, row: 7, d: 1 }, 'выбрана ближайшая доступная точка');
});

test('v13.090 (п.3): БТР едет к ближайшей точке и высаживает там десант', () => {
  const s = createSandbox(campaignData());
  s.run('function getAllOrdersList(){ return []; }');
  s.run('function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }');
  s.run('function getRouteToTarget(fc, fr, tc, tr) { return (tc === 8 && tr === 7) ? [{ col: tc, row: tr }] : []; }');
  s.run(sliceFunction(HTML, 'nearestReachableHexTo'));
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(`
    function stepUnitTowardTarget(unit, col, row) {
      if (col === 9 && row === 7) return 'no_route';
      unit.col = 8; unit.row = 7; return 'reached';
    }
  `);
  s.run(sliceFunction(HTML, 'driveBtrToDisembarkHex'));
  s.run(`
    var carrier = { name: 'БТР №1', col: 3, row: 4, ap: 8 };
    var first = driveBtrToDisembarkHex(carrier, '9,7', 'Мотострелки');
    var second = driveBtrToDisembarkHex(carrier, '9,7', 'Мотострелки');
  `);
  assert.equal(s.evalCtx('first'), 'driving', 'сначала БТР подъезжает ближе');
  assert.equal(s.evalCtx('second'), 'stuck', 'у самой точки он высаживает десант');
  assert.match(s.logs.join('\n'), /не пройти — приближается к ближайшей доступной точке \(8,7\)/);
  assert.match(s.logs.join('\n'), /десант высаживается максимально близко: \(8,7\)/);
});

test('v13.090 (п.3): кончились ОД — высадка ждёт следующего хода, а не раньше', () => {
  const s = createSandbox(campaignData());
  s.run('function getAllOrdersList(){ return []; }');
  s.run('function stepUnitTowardTarget(){ return "partial"; }');
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(sliceFunction(HTML, 'driveBtrToDisembarkHex'));
  s.run(`
    var carrier = { name: 'БТР №1', col: 3, row: 4, ap: 0 };
    var result = driveBtrToDisembarkHex(carrier, '9,7', 'Мотострелки');
  `);
  assert.equal(s.evalCtx('result'), 'driving', 'без ОД БТР просто ждёт следующего хода');
  assert.match(s.logs.join('\n'), /ОД кончились, продолжит в следующем ходу/);
});

test('v13.090 (п.3): недостижимый гекс высадки не попадает в маршрут БТР', () => {
  const s = createSandbox(campaignData());
  s.run('function getAllOrdersList(){ return []; }');
  s.run('function getRouteToTarget(){ return []; }');
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(`
    var btr = { name: 'БТР №1', col: 2, row: 2, type: 'btr_platoon', groupSize: 2, isGroup: true };
    appData.campaign.opUnits = [null, null, null, null, null, null, null, btr];
    appData.campaign.hardMode.orders = [
      { type: 'move', toUnitId: 7, waypoints: [{ col: 5, row: 5 }], status: 'active', time: '12:00' }
    ];
    ensureBtrReachesHex(9, 7);
    var points = appData.campaign.hardMode.orders[0].waypoints.map(p => p.col + ',' + p.row).join(' ');
  `);
  assert.equal(s.evalCtx('points'), '5,5', 'недостижимый гекс в маршрут не добавлен');
});

test('v13.090 (п.3): БТР ждёт посадки, а не отменяет приказ высадки', () => {
  const s = createSandbox(campaignData());
  s.run('function getAllOrdersList(){ return appData.campaign.hardMode.orders; }');
  s.run('function updateBtrPanel(){}');
  s.run('function stepUnitTowardTarget(){ return "reached"; }');
  s.run(sliceFunction(HTML, 'incomingEmbarkingIdsFor'));
  s.run(sliceFunction(HTML, 'orderDisembarkHex'));
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(sliceFunction(HTML, 'driveBtrToDisembarkHex'));
  s.run(sliceFunction(HTML, 'markJustDisembarked'));
  s.run(sliceFunction(HTML, 'executeDisembarkOrder'));
  s.run(`
    var squad = { id: 3, name: '1-й взвод', embarkedInBtr: false, btrIds: [], ap: 8 };
    var btr = { name: 'БТР №1', type: 'btr_platoon', col: 5, row: 5, ap: 4 };
    appData.campaign.opUnits = [null, null, null, squad, null, btr];
    appData.campaign.enemyOpUnits = [];
    appData.campaign.hardMode.orders = [
      { type: 'embark', toUnitId: 3, btrUnitId: 5, status: 'active' },
      { type: 'disembark', toUnitId: 5, disembarkUnitId: null, disembarkHex: '5,5', status: 'active' }
    ];
    executeDisembarkOrder(btr, appData.campaign.hardMode.orders[1]);
    var waited = appData.campaign.hardMode.orders[1].status;

    squad.embarkedInBtr = true; squad.btrIds = [5];
    btr.embarkedUnit = squad.name; btr.embarkedUnitId = 3;
    appData.campaign.hardMode.orders[0].status = 'completed';
    executeDisembarkOrder(btr, appData.campaign.hardMode.orders[1]);
    var after = { st: appData.campaign.hardMode.orders[1].status,
                  hex: squad.col + ',' + squad.row, marked: squad.justDisembarkedTurn, ap: squad.ap };
  `);
  assert.equal(s.evalCtx('waited'), 'active', 'пока отряд садится, приказ высадки ждёт');
  assert.match(s.logs.join('\n'), /ждёт посадки «1-й взвод»/);
  assert.deepEqual(s.evalCtx('after'), { st: 'completed', hex: '5,5', marked: 5, ap: 0 },
    'после посадки десант высажен и помечен');
});

test('v13.090 (п.3): без десанта и без посадки приказ высадки отменяется', () => {
  const s = createSandbox(campaignData());
  s.run('function getAllOrdersList(){ return appData.campaign.hardMode.orders; }');
  s.run('function updateBtrPanel(){}');
  s.run(sliceFunction(HTML, 'incomingEmbarkingIdsFor'));
  s.run(sliceFunction(HTML, 'orderDisembarkHex'));
  s.run(sliceFunction(HTML, 'markJustDisembarked'));
  s.run(sliceFunction(HTML, 'executeDisembarkOrder'));
  s.run(`
    var btr = { name: 'БТР №1', type: 'btr_platoon', col: 5, row: 5, ap: 4 };
    appData.campaign.opUnits = [null, btr];
    appData.campaign.enemyOpUnits = [];
    appData.campaign.hardMode.orders = [
      { type: 'disembark', toUnitId: 1, disembarkUnitId: null, disembarkHex: null, status: 'active' }
    ];
    executeDisembarkOrder(btr, appData.campaign.hardMode.orders[0]);
    var status = appData.campaign.hardMode.orders[0].status;
  `);
  assert.equal(s.evalCtx('status'), 'cancelled', 'пустой БТР приказ не держит');
  assert.match(s.logs.join('\n'), /в БТР не везётся десант/);
});

// Сверяем формат актуальной версии; конкретный номер обновляется вместе с релизом.
test('текущая версия приложения указана в корректном формате', () => {
  assert.match(VERSION, /^v\d+\.\d+$/, `APP_VERSION = ${VERSION}`);
});

console.log(`\nИтог v13.090: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
