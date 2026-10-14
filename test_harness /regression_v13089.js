'use strict';
// ⚡ v13.089: регрессия по четырём замечаниям к приказам и связи.
//   1) «Сопровождение» повторяет ВСЕ приказы отряда, которые сопровождающий
//      может выполнить; остальные — просто следует рядом.
//   2) Телефонный кабель: «гекс с противником» — только видимый и реально
//      стоящий на карте враг; сообщение называет гекс и отряд.
//   3) Высадка десанта — приказ БТР: доехать до гекса, высадить, ехать дальше;
//      десант ждёт высадки и затем продолжает свою серию приказов.
//   4) Приказы выдаются на ТЕКУЩЕЕ время: прошедшее время не переносит
//      исполнение на сутки вперёд (часы операции зациклены).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const UI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('✓ ' + name); }
  catch (e) { fail++; console.log('✗ ' + name + ' — ' + e.message.split('\n')[0]); }
}

// ─────────────────────────── версия ───────────────────────────
test('v13.089: версия, маркеры и кэш синхронизированы', () => {
  // ⚡ v13.090: сверяем с текущим APP_VERSION — тест не должен падать после
  //    каждого повышения версии, но рассинхрон маркировки обязан ловить.
  const ver = /var APP_VERSION = '(v[\d.]+)'/.exec(HTML)[1];
  const esc = ver.replace(/\./g, '\\.');
  assert.match(SW, new RegExp("const CACHE_NAME = 'wargame-" + esc + "';"), 'service-worker.js');
  assert.match(UI, new RegExp('BUILD-МАРКЕР: ' + esc), 'js/operational_ui.js');
  ['js/data.js', 'js/hexmaps.js', 'js/templates.js', 'js/cards.js'].forEach((f) => {
    assert.match(fs.readFileSync(path.join(ROOT, f), 'utf8'), new RegExp('BUILD-МАРКЕР: ' + esc), f);
  });
  assert.match(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'),
    new RegExp('"short_name": "БМ ' + esc + '"'), 'manifest.json');
});

// ────────── 4. приказы выдаются на текущее время ──────────
test('v13.089 (п.4): orderStartDelayMinutes — прошедшее время не ждёт сутки', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'orderStartDelayMinutes'));
  s.run(sliceFunction(HTML, 'orderShouldExecuteNow'));
  s.run('appData.campaign.currentTime = 10;');
  // сейчас 00:10, приказ назначен на 23:50 «вчера» → уже просрочен
  assert.equal(s.evalCtx('orderStartDelayMinutes({ startTimeMin: 1430 })'), 0);
  assert.equal(s.evalCtx('orderShouldExecuteNow({ startTimeMin: 1430 })'), true);
  // приказ на 00:30 — ждать 20 минут
  assert.equal(s.evalCtx('orderStartDelayMinutes({ startTimeMin: 30 })'), 20);
  assert.equal(s.evalCtx('orderShouldExecuteNow({ startTimeMin: 30 })'), false);
  // без назначенного времени — исполняется сразу
  assert.equal(s.evalCtx('orderStartDelayMinutes({ startTimeMin: null })'), 0);
  assert.equal(s.evalCtx('orderShouldExecuteNow({})'), true);
  // отсчёт от произвольного момента (для панели приказов)
  assert.equal(s.evalCtx('orderStartDelayMinutes({ startTimeMin: 1430 }, 1420)'), 10);
  assert.equal(s.evalCtx('orderStartDelayMinutes({ startTimeMin: 10 }, 1420)'), 30, '00:10 от 23:40 — через 30 минут');
});

test('v13.089 (п.4): срок в подтверждении и в панели приказов — без «через сутки»', () => {
  const s = createSandbox(freshAppData());
  s.run('appData.campaign.currentTime = 1420;');
  s.run(sliceFunction(HTML, 'pluralTurns'));
  s.run(sliceFunction(HTML, 'formatMinuteOfDay'));
  s.run(sliceFunction(HTML, 'orderStartDelayMinutes'));
  s.run(sliceFunction(HTML, 'describeOrderEta'));
  const overdue = s.evalCtx(`describeOrderEta({ status: 'active', startTimeMin: 1400 })`);
  assert.match(overdue, /исполняется/, overdue);
  assert.doesNotMatch(overdue, /через 1\d\d /);
  const soon = s.evalCtx(`describeOrderEta({ status: 'active', startTimeMin: 1430 })`);
  assert.match(soon, /через 1 ход/, soon);
  // панель приказов считает ETA той же функцией
  const src = HTML.slice(HTML.indexOf('сколько ещё раз нужно нажать «Завершить ход»'));
  assert.match(src.slice(0, 1200), /orderStartDelayMinutes\(order, timeAtExec\)/);
  assert.doesNotMatch(src.slice(0, 1200), /if \(diff < 0\) diff \+= 1440;/);
});

test('v13.089 (п.4): время начала по умолчанию — текущее время операции', () => {
  // v13.095: пустое поле времени означает «сейчас», а не замороженный час открытия меню.
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(UI, 'parseDraftOptions'));
  s.run(sliceFunction(HTML, 'orderStartDelayMinutes'));
  s.run(sliceFunction(HTML, 'orderShouldExecuteNow'));
  s.run(`var draft = {category:'move',mode:'simple',time:'',waypoints:[{col:2,row:1}]};
    var parsed = parseDraftOptions(draft,{col:1,row:1});`);
  assert.equal(s.evalCtx('parsed.options.startTimeMin'), null, 'без ручного времени приказ готов сразу');
  for (const time of [1420, 5]) {
    s.run(`appData.campaign.currentTime = ${time};`);
    assert.equal(s.evalCtx('orderShouldExecuteNow(parsed.options)'), true, 'нет ожидания, в том числе после полуночи');
  }
  assert.match(UI, /time:\s*''/, 'нет устаревшего времени, зафиксированного при открытии черновика');
  assert.match(UI, /function currentTimeValue\(\)[\s\S]{0,220}campaign\(\)/);
});

// ────────── 2. телефонный кабель и «враг на гексе» ──────────
test('v13.089 (п.2): кабель блокирует только видимый враг на карте', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'enemiesBlockingSignalAt'));
  s.run(sliceFunction(HTML, 'signalBlockerLabel'));
  s.run(`appData.campaign.enemyOpUnits = [
    { name: 'видимый', col: 5, row: 5, isDestroyed: false, hidden: false, detected: true, isInBattle: false },
    { name: 'в тумане', col: 6, row: 5, isDestroyed: false, hidden: false, detected: false, isInBattle: false },
    { name: 'скрытый', col: 7, row: 5, isDestroyed: false, hidden: true, detected: true, isInBattle: false },
    { name: 'в бою', col: 8, row: 5, isDestroyed: false, hidden: false, detected: true, isInBattle: true },
    { name: 'убитый', col: 9, row: 5, isDestroyed: true, hidden: false, detected: true, isInBattle: false },
    { name: 'без координат', col: null, row: null, isDestroyed: false, hidden: false, detected: true }
  ];`);
  assert.equal(s.evalCtx('enemiesBlockingSignalAt(5,5).length'), 1, 'видимый враг блокирует');
  assert.equal(s.evalCtx('enemiesBlockingSignalAt(6,5).length'), 0, 'невидимый — нет');
  assert.equal(s.evalCtx('enemiesBlockingSignalAt(7,5).length'), 0, 'скрытый — нет');
  assert.equal(s.evalCtx('enemiesBlockingSignalAt(8,5).length'), 0, 'воюющий — нет');
  assert.equal(s.evalCtx('enemiesBlockingSignalAt(9,5).length'), 0, 'уничтоженный — нет');
  assert.equal(s.evalCtx('enemiesBlockingSignalAt(null,null).length'), 0, 'пустой гекс — нет');
  assert.match(s.evalCtx('signalBlockerLabel(5,5)'), /видимый/);
  assert.match(s.evalCtx('signalBlockerLabel(5,5)'), /5,5/);
});

test('v13.089 (п.2): проверка используется во всех трёх местах', () => {
  const draft = sliceFunction(HTML, 'handlePhoneRouteDraftHex');
  assert.match(draft, /enemiesBlockingSignalAt\(col, row\)/);
  assert.match(draft, /нельзя прокладывать через гекс \(\$\{col\},\$\{row\}\)/, 'сообщение называет гекс');
  const validate = sliceFunction(HTML, 'validatePhoneSignalRoute');
  assert.match(validate, /enemiesBlockingSignalAt\(to\.col, to\.row\)/);
  assert.doesNotMatch(validate, /!enemy\.hidden/, 'старой проверки по флагу hidden не осталось');
  const intact = sliceFunction(HTML, 'checkPhoneLinesIntact');
  assert.match(intact, /e\.detected !== false/, 'линию рвёт только обнаруженный враг');
  assert.match(intact, /!e\.isInBattle/, 'воюющий враг линию не рвёт');
});

// ────────── 1. сопровождение повторяет приказы ──────────
test('v13.089 (п.1): таблица «может выполнить приказ»', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'isEscortCapableInfantry'));
  s.run(sliceFunction(HTML, 'unitHasFirepower'));
  s.run(sliceFunction(HTML, 'unitCanExecuteOrderType'));
  s.run(`var inf = { name:'1-й взвод', mobility:'foot', type:'infantry_platoon', squads:[{fighters:[{hp:5}]}] };
    var truck = { name:'Тягач', mobility:'vehicle', type:'truck', squads:[{fighters:[{hp:5}]}] };
    var sau = { name:'САУ', mobility:'vehicle', type:'sau_battery', squads:[] };
    var bike = { name:'Самокаты', mobility:'bicycle', type:'bicycle_platoon', squads:[{fighters:[{hp:5}]}] };`);
  ['move', 'attack', 'defend', 'recon', 'hold', 'retreat', 'ambush'].forEach((type) => {
    assert.equal(s.evalCtx(`unitCanExecuteOrderType(inf, '${type}')`), true, 'пехота: ' + type);
    assert.equal(s.evalCtx(`unitCanExecuteOrderType(truck, '${type}')`), true, 'техника: ' + type);
  });
  assert.equal(s.evalCtx(`unitCanExecuteOrderType(truck, 'dig_in')`), false, 'техника не окапывается');
  assert.equal(s.evalCtx(`unitCanExecuteOrderType(inf, 'dig_in')`), true);
  assert.equal(s.evalCtx(`unitCanExecuteOrderType(sau, 'shoot')`), true, 'САУ стреляет');
  assert.equal(s.evalCtx(`unitCanExecuteOrderType({ squads: [] }, 'fire_at_will')`), false, 'без оружия — нет');
  assert.equal(s.evalCtx(`unitCanExecuteOrderType(inf, 'embark')`), false, 'посадка в БТР не зеркалится');
  assert.equal(s.evalCtx(`unitCanExecuteOrderType(inf, 'disembark')`), false, 'выйти может только сидящий в машине');
  assert.equal(s.evalCtx(`unitCanExecuteOrderType(bike, 'dismount')`), true);
  assert.equal(s.evalCtx(`unitCanExecuteOrderType(bike, 'remount')`), false);
  assert.equal(s.evalCtx(`unitCanExecuteOrderType(null, 'move')`), false);
});

test('v13.089 (п.1): приказ лидера копируется сопровождающим, которые могут его выполнить', () => {
  const s = createSandbox(freshAppData());
  // log() уже есть в песочнице — пишет в s.logs
  s.run('var created = [];');
  s.run('function getOrderTypeLabel(t){ return t; }');
  s.run('function findBattalionHq(){ return 0; }');
  s.run('function createOrder(from, to, type, options){ var o = { toUnitId: to, type: type, escortMirrorInfantryId: options.escortMirrorInfantryId }; created.push(o); return o; }');
  s.run(sliceConst(HTML, 'ESCORT_MIRROR_SKIP_TYPES'));
  s.run('var escortMirrorDepth = 0;');
  s.run(sliceFunction(HTML, 'isEscortCapableInfantry'));
  s.run(sliceFunction(HTML, 'unitHasFirepower'));
  s.run(sliceFunction(HTML, 'unitCanExecuteOrderType'));
  s.run(sliceFunction(HTML, 'escortFollowersOf'));
  s.run(sliceFunction(HTML, 'mirrorOrderToEscorts'));
  s.run(`
    var hq = { name: 'Штаб', col: 1, row: 1 };
    var leader = { name: '1-й взвод', mobility: 'foot', type: 'infantry_platoon', squads: [{ fighters: [{ hp: 5 }] }], col: 4, row: 4, maxAp: 4 };
    var escortVehicle = { name: 'Тягач', mobility: 'vehicle', type: 'truck', squads: [{ fighters: [{ hp: 5 }] }], col: 3, row: 3 };
    var escortInf = { name: '2-й взвод', mobility: 'foot', type: 'infantry_platoon', squads: [{ fighters: [{ hp: 5 }] }], col: 2, row: 2 };
    appData.campaign.opUnits = [hq, leader, escortVehicle, escortInf];
    appData.campaign.__orders = [
      { type: 'escort', toUnitId: 2, escortInfantryId: 1, status: 'active' },
      { type: 'escort', toUnitId: 3, escortInfantryId: 1, status: 'active' }
    ];
    function getAllOrdersList(){ return appData.campaign.__orders; }
    hardMode.hqUnitId = 0;
    var copiedMove = mirrorOrderToEscorts({ type: 'move', toUnitId: 1, status: 'delivering', waypoints: [{ col: 6, row: 6 }] });
    var copiedDig = mirrorOrderToEscorts({ type: 'dig_in', toUnitId: 1, status: 'active' });
    var copiedEmbark = mirrorOrderToEscorts({ type: 'embark', toUnitId: 1, status: 'active' });
    var copiedMirror = mirrorOrderToEscorts({ type: 'move', toUnitId: 1, status: 'active', escortMirrorInfantryId: 1 });
    var copiedEscort = mirrorOrderToEscorts({ type: 'escort', toUnitId: 1, status: 'active' });
  `);
  assert.equal(s.evalCtx('copiedMove'), 2, 'движение повторяют оба сопровождающих');
  assert.equal(s.evalCtx('created.length'), 3, 'движение (2) + окопаться (1)');
  assert.equal(s.evalCtx('created[0].escortMirrorInfantryId'), 1, 'копия помечена как зеркало');
  assert.equal(s.evalCtx('copiedDig'), 1, '«окопаться» повторяет только пехота');
  assert.equal(s.evalCtx('created[2].toUnitId'), 3, 'копия «окопаться» ушла пехоте, не тягачу');
  assert.equal(s.evalCtx('copiedEmbark'), 0, 'посадка в БТР не зеркалится');
  assert.equal(s.evalCtx('copiedMirror'), 0, 'зеркало не зеркалится (без рекурсии)');
  assert.equal(s.evalCtx('copiedEscort'), 0, 'сопровождение не копируется');
  assert.match(s.logs.join('\n'), /повторён 2 сопровождающим/);
});

test('v13.089 (п.1): дублирование вызывается из createOrder, а не из меню', () => {
  const create = sliceFunction(HTML, 'createOrder');
  assert.equal((create.match(/mirrorOrderToEscorts\(order\)/g) || []).length, 2,
    'обе ветки createOrder (посыльный и очередь) дублируют приказ');
  const issue = UI.slice(UI.indexOf('function issueDraftOrder'));
  const body = issue.slice(0, issue.indexOf('\n  }\n'));
  assert.doesNotMatch(body, /linkedEscortIds/, 'старое копирование из меню убрано (не плодит дубли)');
  assert.match(UI, /function mirrorLeaderOrdersToEscort/, 'прежние приказы копируются при отдаче сопровождения');
  assert.match(UI, /unitCanExecuteOrderType\(escort, effectiveType\)/, 'и только исполнимые');
});

// ────────── 3. высадка десанта приказом БТР ──────────
test('v13.089 (п.3): БТР высаживает только названный отряд', () => {
  const s = createSandbox(freshAppData());
  s.run('function getAllOrdersList(){ return []; }');
  s.run('function updateBtrPanel(){}');
  s.run('function stepUnitTowardTarget(){ return "no_route"; }');
  s.run(sliceFunction(HTML, 'orderDisembarkHex'));
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(sliceFunction(HTML, 'driveBtrToDisembarkHex'));
  s.run(sliceFunction(HTML, 'markJustDisembarked'));   // ⚡ v13.090 (п.1)
  s.run(sliceFunction(HTML, 'executeDisembarkOrder'));
  s.run(`
    var first = { name: '1-й взвод', embarkedInBtr: true, hidden: true, col: null, row: null, btrIds: [3], mobility: 'foot' };
    var second = { name: '2-й взвод', embarkedInBtr: true, hidden: true, col: null, row: null, btrIds: [3], mobility: 'foot' };
    var btr = { name: 'БТР №1', type: 'btr_platoon', col: 7, row: 7, groupSize: 2, isGroup: true,
      vehicleList: [
        { name: 'БТР №1', embarkedUnit: '1-й взвод', embarkedUnitId: 0 },
        { name: 'БТР №2', embarkedUnit: '2-й взвод', embarkedUnitId: 1 }
      ] };
    appData.campaign.opUnits = [first, second, null, btr];
    var order = { type: 'disembark', status: 'active', targetHex: '7,7', disembarkUnitId: 0 };
    executeDisembarkOrder(btr, order);
  `);
  assert.equal(s.evalCtx('first.embarkedInBtr'), false, 'названный отряд вышел');
  assert.equal(s.evalCtx('first.col'), 7);
  assert.equal(s.evalCtx('second.embarkedInBtr'), true, 'второй отряд продолжает ехать');
  assert.equal(s.evalCtx('order.status'), 'completed');
  assert.match(s.logs.join('\n'), /Десант высажен на гексе \(7,7\): 1-й взвод/);
  assert.match(s.logs.join('\n'), /Машина продолжает свои приказы/);
});

test('v13.089 (п.3): БТР ждёт посадки, если отряд ещё не сел', () => {
  const s = createSandbox(freshAppData());
  s.run('function getAllOrdersList(){ return []; }');
  s.run('function updateBtrPanel(){}');
  s.run('function stepUnitTowardTarget(){ return "no_route"; }');
  s.run(sliceFunction(HTML, 'orderDisembarkHex'));
  s.run(sliceFunction(HTML, 'ensureBtrReachesHex'));
  s.run(sliceFunction(HTML, 'driveBtrToDisembarkHex'));
  s.run(sliceFunction(HTML, 'markJustDisembarked'));   // ⚡ v13.090 (п.1)
  s.run(sliceFunction(HTML, 'executeDisembarkOrder'));
  s.run(`
    var squad = { name: '1-й взвод', embarkedInBtr: false, col: 2, row: 2, mobility: 'foot' };
    var btr = { name: 'БТР №1', type: 'btr_platoon', col: 7, row: 7 };
    appData.campaign.opUnits = [squad, btr];
    var order = { type: 'disembark', status: 'active', targetHex: '7,7', disembarkUnitId: 0 };
    executeDisembarkOrder(btr, order);
  `);
  assert.equal(s.evalCtx('order.status'), 'active', 'приказ не отменён — ждём посадку');
  assert.match(s.logs.join('\n'), /ждёт посадки «1-й взвод»/);
});

test('v13.089 (п.3): пока отряд в БТР, его серия ждёт высадки', () => {
  const src = sliceFunction(HTML, 'executeSeriesOrder');
  const atGuard = src.indexOf('unit.embarkedInBtr');
  const atDispatch = src.indexOf("case 'move':");
  assert.ok(atGuard > 0, 'проверка «в БТР» есть');
  assert.ok(atGuard < atDispatch, 'проверка стоит до разбора шагов серии');
  assert.match(src, /ждёт высадки/);
  const step = src.slice(src.indexOf("case 'disembark'"));
  assert.match(step.slice(0, 400), /executeDisembarkOrder\(unit, currentAction\)/);
});

test('v13.089 (п.3): приказ высадки уходит машине, а не десанту', () => {
  assert.match(UI, /function carrierIdForPassenger/, 'машина находится по приказу посадки');
  const issue = UI.slice(UI.indexOf('function issueDraftOrder'));
  const body = issue.slice(0, issue.indexOf('\n  }\n'));
  assert.match(body, /result\.options\.disembarkUnitId = picked\.id/, 'в приказе указывается отряд');
  assert.match(body, /issueTargetId = carrierId/, 'получатель приказа — БТР');
  assert.match(body, /result\.type !== 'disembark'/, 'высадка не дописывается в серию десанта');
  assert.match(UI, /Высадить десант/, 'у машины свой пункт меню');
  assert.match(UI, /function incomingPassengersOf/, 'высадка доступна и до посадки десанта');
  const can = UI.slice(UI.indexOf('function canIssueSpecial'));
  assert.match(can.slice(0, can.indexOf('\n  }\n')), /incomingPassengersOf\(unit\)\.length > 0/);
});

test('v13.089 (п.3): createOrder хранит, кого высаживать', () => {
  const create = sliceFunction(HTML, 'createOrder');
  assert.match(create, /disembarkUnitId: \(options\.disembarkUnitId !== undefined && options\.disembarkUnitId !== null\) \? Number\(options\.disembarkUnitId\) : null/);
});

console.log('\nИтог v13.089: PASS ' + pass + ' · FAIL ' + fail);
if (fail) process.exit(1);
