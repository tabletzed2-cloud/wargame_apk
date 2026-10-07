// ⚡ v13.068 (R47): регрессии системы снабжения —
//    взвод снабжения в батальоне (обе фракции), батальонный склад с лимитами,
//    распределение средств (носильщики, вьючные, повозки, машины), шкалы боезапаса,
//    доставка груза юниту за несколько ходов, возврат средств на склад,
//    потери в засаде, рейс в тыл за пополнением и блокировка перерезанной дороги.
//    Запуск: node 'test_harness /regression_v13068.js'
'use strict';
const fs = require('fs');
const assert = require('assert/strict');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗ ' + name + ' — ' + e.message); }
}

const CONSTS = [
  'SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_DEPOT_MAX',
  'SUPPLY_AMMO_PER_MAN', 'SUPPLY_GREN_PER_MAN', 'SUPPLY_CONVOY_BUDGET',
  // ⚡ v13.069 (R48#1, #2, #7): точки тыла по фракциям, потеря склада, «Бюрократия»
  'SUPPLY_EVAC_POINTS', 'SUPPLY_CAPTURE_LOSS', 'SUPPLY_BUREAUCRACY_CARD', 'SUPPLY_BUREAUCRACY_DELAY'
];
const FNS = [
  'supplyAssetIds', 'ensureSupplyState', 'getSupplyUnit', 'supplyAssetCounts',
  'syncSupplyAssetsFromPlatoon', 'getSupplyDepotHex', 'supplyCargoOf', 'supplyAssetsMobility',
  'supplyOrdnanceFull', 'unitAmmoStatus', 'supplyAmmoPercent', 'supplyDistributeCargo',
  'supplyUnitList', 'sendSupplyDelivery', 'supplyAssetsLabel', 'supplyRearPoint',
  'supplyRearRouteBlocked', 'supplyMoveCost', 'supplyStepToward', 'supplyAmbushCheck',
  'supplyKillCarriers', 'advanceSupplyDeliveries', 'supplyBarHtml', 'supplyAmmoBarHtml',
  'dispatchSupplyFromPanel', 'renderSupplyPanel', 'showSupplyPanel',
  // ⚡ v13.069: защита склада (охрана + захват) и «Бюрократия»
  'supplyDepotCaptured', 'syncSupplyDepotStatus', 'unitHasBureaucracy',
  'isOpUnitWipedOut', 'getOperationalCombatFighters',
  'cloneTemplate', 'assignUniqueCrewKeys'
];

const BEVE_SQUADS = [
  ['Штаб взвода снабжения', 'Штаб взвода снабжения (Бельгийцы)'],
  ['Носильщики №1', 'Носильщики №1 (Бельгийцы)'],
  ['Носильщики №2', 'Носильщики №2 (Бельгийцы)'],
  ['Мул с бойцом №1', 'Мул с бойцом №1 (Бельгийцы)'],
  ['Мул с бойцом №2', 'Мул с бойцом №2 (Бельгийцы)'],
  ['Мул с бойцом №3', 'Мул с бойцом №3 (Бельгийцы)'],
  ['Конная повозка', 'Конная повозка (Бельгийцы)'],
  ['Грузовик снабжения', 'Грузовик снабжения (Бельгийцы)'],
  ['Легковой автомобиль', 'Легковой автомобиль (Бельгийцы)'],
  // ⚡ v13.069 (R48#2): охрана склада у BeVe
  ['Стрелок охранник №1', 'Стрелок охранник №1 (Бельгийцы)'],
  ['Стрелок охранник №2', 'Стрелок охранник №2 (Бельгийцы)']
];
const AIRF_SQUADS = [
  ['Штаб взвода снабжения', 'Штаб взвода снабжения (A.I.R.F.)'],
  ['Носильщики №1', 'Носильщики №1 (A.I.R.F.)'],
  ['Носильщики №2', 'Носильщики №2 (A.I.R.F.)'],
  ['Ламы с бойцами №1', 'Ламы с бойцами №1 (A.I.R.F.)'],
  ['Ламы с бойцами №2', 'Ламы с бойцами №2 (A.I.R.F.)'],
  ['Конная повозка', 'Конная повозка (A.I.R.F.)'],
  ['Лёгкий грузовик', 'Лёгкий грузовик (A.I.R.F.)'],
  ['Стрелок охранник №1', 'Стрелок охранник №1 (A.I.R.F.)'],
  ['Стрелок охранник №2', 'Стрелок охранник №2 (A.I.R.F.)']
];

function supplySandbox(faction, squadDefs) {
  const s = createSandbox(freshAppData());
  s.sandbox.appData.templates = s.evalCtx('SQUAD_TEMPLATES');
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    globalThis.__noop = () => {};
    globalThis.redrawOperationalMap = __noop;
    globalThis.saveData = __noop;
    function mkSquad(nm, tn) { const sq = cloneTemplate('${faction}', nm, tn); if (sq) { sq.fighters.forEach((f, i) => { f.crewKey = 'k' + i; }); } return sq; }
    appData.campaign.active = true;
    appData.campaign.currentTurn = 1;
    appData.campaign.scenario = 'valencia';
    appData.campaign.playerFaction = '${faction}';
    appData.campaign.enemyOpUnits = [];
    const supp = { name: 'Взвод снабжения', type: 'hq', squads: [], col: 5, row: 5, side: 'player', ap: 4, maxAp: 4, mobility: 'foot' };
    ${JSON.stringify(squadDefs)}.forEach(([nm, tn]) => { const sq = mkSquad(nm, tn); if (sq) supp.squads.push(sq); });
    const rifle = mkSquad('1-е отделение', 'Пехотное отделение №1 Бельгийцы') ||
                  mkSquad('1-е отделение', 'Стрелковое отделение №1');
    const target = { name: '1-е отделение', type: 'infantry_platoon', squads: rifle ? [rifle] : [], col: 6, row: 5, side: 'player', ap: 4, maxAp: 4, mobility: 'foot' };
    const hq = mkSquad('Штаб батальона', 'Штаб Батальона');
    const bat = { name: 'Штаб батальона', type: 'battalion_hq', squads: hq ? [hq] : [], col: 10, row: 10, side: 'player', ap: 4, maxAp: 4, mobility: 'foot' };
    appData.campaign.opUnits = [supp, bat, target];
    globalThis.st = ensureSupplyState();
    syncSupplyAssetsFromPlatoon();
  `);
  return s;
}

function json(s, expr) { return JSON.parse(JSON.stringify(s.evalCtx(expr))); }

// ───────────────────────── 1. Состав взвода снабжения ─────────────────────────
test('R47: взвод снабжения есть в батальоне обеих фракций', () => {
  const s = createSandbox(freshAppData());
  const presets = s.evalCtx('BATTALION_PRESETS');
  ['BeVe', 'A.I.R.F.'].forEach(fac => {
    const u = (presets[fac].standard || []).find(x => x && x.name === 'Взвод снабжения');
    assert.ok(u, `${fac}: взвод снабжения в стандартном составе`);
    // ⚡ v13.069: у BeVe добавлены 2 стрелка-охранника склада (9 → 11)
    assert.equal(u.squads.length, fac === 'BeVe' ? 11 : 9, `${fac}: состав взвода снабжения`);
  });
  const beve = presets['BeVe'].standard.find(x => x.name === 'Взвод снабжения').squads.map(q => q.name);
  ['Носильщики №1', 'Носильщики №2', 'Мул с бойцом №1', 'Мул с бойцом №2', 'Мул с бойцом №3',
   'Конная повозка', 'Грузовик снабжения', 'Легковой автомобиль'].forEach(n =>
    assert.ok(beve.includes(n), `BeVe: нет отделения «${n}»`));
  const airf = presets['A.I.R.F.'].standard.find(x => x.name === 'Взвод снабжения').squads.map(q => q.name);
  ['Носильщики №1', 'Носильщики №2', 'Ламы с бойцами №1', 'Ламы с бойцами №2', 'Конная повозка',
   'Лёгкий грузовик', 'Стрелок охранник №1', 'Стрелок охранник №2'].forEach(n =>
    assert.ok(airf.includes(n), `A.I.R.F.: нет отделения «${n}»`));
});

test('R47: шаблоны взвода снабжения — люди, животные, машины, охрана', () => {
  const s = createSandbox(freshAppData());
  const t = s.evalCtx('SQUAD_TEMPLATES');
  const find = n => t.find(x => x && x.name === n);
  assert.ok(find('Штаб взвода снабжения (Бельгийцы)'), 'нет штаба взвода снабжения (BeVe)');
  assert.equal(find('Штаб взвода снабжения (Бельгийцы)').fighters.filter(f => f.isCommander).length, 1, 'один командир взвода');
  assert.equal(find('Носильщики №1 (A.I.R.F.)').fighters.length, 4, 'носильщики A.I.R.F. — 4 человека в отделении');
  assert.equal(find('Ламы с бойцами №2 (A.I.R.F.)').fighters.length, 4, 'ламы A.I.R.F. — 4 погонщика в отделении');
  assert.equal(find('Мул с бойцом №1 (Бельгийцы)').fighters.length, 1, 'мул — один погонщик');
  assert.equal(find('Грузовик снабжения (Бельгийцы)').fighters.length, 2, 'грузовик — водитель и помощник');
  assert.match(find('Мул с бойцом №1 (Бельгийцы)').fighters[0].weapon, /Винтовка/, 'погонщик вооружён винтовкой');
});

// ───────────────────────── 2. Склад и пул средств ─────────────────────────
test('R47: батальонный склад — лимиты и средняя ёмкость', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  const max = json(s, 'appData.campaign.supply.max');
  assert.equal(max.ammoSmall, 1200, 'лимит патронов 1200');
  assert.equal(max.grenades, 300, 'лимит гранат 300');
  assert.equal(max.ammoOrdnance, 80, 'лимит снарядов 80');
  const stock = json(s, 'appData.campaign.supply.stock');
  assert.deepEqual(stock, { ammoSmall: 1200, grenades: 300, ammoOrdnance: 80 }, 'новый склад полный');
  assert.deepEqual(json(s, 'getSupplyDepotHex()'), { col: 5, row: 5 }, 'склад стоит там, где взвод снабжения');
});

test('R47: пул средств — носильщики, мулы, повозка, машины считаются верно', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  const pool = json(s, 'appData.campaign.supply.assets');
  assert.equal(pool.porter.total, 8, 'восемь носильщиков');
  assert.equal(pool.mule.total, 3, 'три мула');
  assert.equal(pool.cart.total, 1, 'одна конная повозка');
  assert.equal(pool.car.total, 1, 'один легковой автомобиль');
  assert.equal(pool.truck.total, 1, 'один грузовик');
});

test('R47: пул A.I.R.F. — ламы и лёгкий грузовик', () => {
  const s = supplySandbox('A.I.R.F.', AIRF_SQUADS);
  const pool = json(s, 'appData.campaign.supply.assets');
  assert.equal(pool.porter.total, 8, 'восемь носильщиков');
  assert.equal(pool.llama.total, 8, 'восемь лам');
  assert.equal(pool.mule.total, 0, 'мулов нет');
  assert.equal(pool.cart.total, 1, 'конная повозка');
  assert.equal(pool.truck.total, 1, 'лёгкий грузовик считается грузовиком');
});

test('R47: грузоподъёмность — носильщик < лама < мул < повозка < машины', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  const cap = id => s.evalCtx(`SUPPLY_ASSET_TYPES.${id}.cargo.ammoSmall`);
  assert.ok(cap('porter') < cap('llama'), 'носильщик меньше ламы');
  assert.ok(cap('llama') < cap('mule'), 'лама меньше мула');
  assert.ok(cap('mule') < cap('cart'), 'мул меньше повозки');
  assert.ok(cap('car') < cap('truck'), 'легковой меньше грузовика');
  assert.ok(cap('car') > cap('mule'), 'легковой больше мула');
});

test('R47: смешанная колонна идёт пешим темпом, только машины — колёсным', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  assert.equal(s.evalCtx("supplyAssetsMobility([{id:'porter',count:2},{id:'truck',count:1}])"), 'foot', 'пешие + грузовик = пеший темп');
  assert.equal(s.evalCtx("supplyAssetsMobility([{id:'truck',count:1},{id:'car',count:1}])"), 'vehicle', 'только машины — колёсный');
});

// ───────────────────────── 3. Шкала боезапаса ─────────────────────────
test('R47: шкала боезапаса — «полный комплект» 8 патронов и 2 гранаты на человека', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  const st = json(s, 'unitAmmoStatus(appData.campaign.opUnits[2])');
  assert.equal(st.ammoSmall.max, 8 * 9, '9 человек × 8 патронов = 72');
  assert.equal(st.grenades.max, 2 * 9, '9 человек × 2 гранаты = 18');
  assert.equal(st.ammoSmall.cur, 72, 'отделение начинает с полным комплектом');
  assert.equal(s.evalCtx('supplyAmmoPercent(appData.campaign.opUnits[2])'), 1, 'полный боезапас = 100%');
  s.run('appData.campaign.opUnits[2].squads[0].ammoSmall = 0; appData.campaign.opUnits[2].squads[0].grenades = 0;');
  assert.equal(s.evalCtx('supplyAmmoPercent(appData.campaign.opUnits[2])'), 0, 'пустой боезапас = 0%');
  const bar = String(s.evalCtx('supplyAmmoBarHtml(appData.campaign.opUnits[2])'));
  assert.match(bar, /Боезапас/, 'шкала подписана');
  assert.match(bar, /0\/72/, 'на шкале видно 0/72');
});

test('R47: у миномётных расчётов считается и снарядный запас', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`
    const mortar = cloneTemplate('BeVe', 'Миномет 82-мм №1', 'Минометный расчёт 82-мм №1');
    appData.campaign.opUnits[2].squads.push(mortar);
  `);
  const st = json(s, 'unitAmmoStatus(appData.campaign.opUnits[2])');
  assert.ok(st.ammoOrdnance.max > 0, 'у миномёта есть снарядный «полный» запас');
  assert.equal(st.ammoOrdnance.cur, st.ammoOrdnance.max, 'миномёт начинает с полным комплектом снарядов');
});

// ───────────────────────── 4. Доставка груза ─────────────────────────
test('R47: доставка — чужие средства не отдаём, своих больше пула не берём', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`
    alerts.length = 0;
    globalThis.__over = sendSupplyDelivery(2, [{ id: 'truck', count: 5 }], 'unit');
    globalThis.__alert = alerts[alerts.length - 1] || '';
    globalThis.__none = sendSupplyDelivery(2, [], 'unit');
  `);
  assert.equal(s.evalCtx('__over'), false, 'больше пула не отправить');
  assert.match(String(s.evalCtx('__alert')), /только 1/, 'в подсказке — сколько свободно');
  assert.equal(s.evalCtx('__none'), false, 'без транспорта колонна не уходит');
});

test('R47: груз списывается со склада, средства уходят из пула', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`globalThis.ok = sendSupplyDelivery(2, [{ id: 'porter', count: 2 }, { id: 'cart', count: 1 }], 'unit');`);
  assert.equal(s.evalCtx('ok'), true, 'колонна отправлена');
  const stock = json(s, 'appData.campaign.supply.stock');
  assert.equal(stock.ammoSmall, 1200 - (2 * 40 + 200), 'патроны списаны по грузоподъёмности');
  assert.equal(stock.grenades, 300 - (2 * 8 + 40), 'гранаты списаны');
  assert.equal(stock.ammoOrdnance, 80 - 6, 'снаряды списаны');
  const pool = json(s, 'appData.campaign.supply.assets');
  assert.equal(pool.porter.available, 6, 'двое носильщиков в пути');
  assert.equal(pool.cart.available, 0, 'повозка в пути');
  const d = json(s, 'appData.campaign.supply.deliveries[0]');
  assert.equal(d.status, 'outbound', 'колонна в пути');
  assert.deepEqual({ col: d.col, row: d.row }, { col: 5, row: 5 }, 'колонна вышла со склада');
});

test('R47: колонна идёт ходами, выгружает груз и возвращает остаток на склад', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`
    appData.campaign.opUnits[2].squads[0].ammoSmall = 10;
    appData.campaign.opUnits[2].squads[0].grenades = 1;
    sendSupplyDelivery(2, [{ id: 'porter', count: 2 }, { id: 'cart', count: 1 }], 'unit');
    let turns = 0;
    while (appData.campaign.supply.deliveries.length && turns < 20) { advanceSupplyDeliveries(); turns++; }
    globalThis.__turns = turns;
    globalThis.__ammo = appData.campaign.opUnits[2].squads[0].ammoSmall;
    globalThis.__gren = appData.campaign.opUnits[2].squads[0].grenades;
    globalThis.__pool = JSON.parse(JSON.stringify(appData.campaign.supply.assets));
    globalThis.__stock = JSON.parse(JSON.stringify(appData.campaign.supply.stock));
  `);
  const turns = s.evalCtx('__turns');
  assert.ok(turns >= 2, 'дорога занимает больше одного хода (туда и обратно)');
  assert.equal(s.evalCtx('__ammo'), 72, 'отделение получило полный комплект патронов');
  assert.equal(s.evalCtx('__gren'), 18, 'отделение получило гранаты');
  const pool = json(s, '__pool');
  assert.equal(pool.porter.available, 8, 'носильщики вернулись в пул');
  assert.equal(pool.cart.available, 1, 'повозка вернулась в пул');
  const stock = json(s, '__stock');
  assert.ok(stock.ammoSmall > 1200 - 280, 'неизрасходованный груз вернулся на склад');
  assert.equal(stock.ammoSmall, 1200 - (72 - 10), 'на склад вернулось всё, кроме реально выданного');
});

test('R47: машины едут только по дорогам и траве', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`
    // все гексы — лес: пешая колонна пройдёт, колёсная нет
    appData.campaign.opMapGrid = {};
    for (let c = 0; c < 20; c++) for (let r = 0; r < 15; r++) appData.campaign.opMapGrid[c + ',' + r] = { types: ['forest'], markers: [] };
    globalThis.__foot = supplyMoveCost('foot', 6, 5);
    globalThis.__veh = supplyMoveCost('vehicle', 6, 5);
    appData.campaign.opMapGrid['6,5'] = { types: ['road'], markers: [] };
    globalThis.__vehRoad = supplyMoveCost('vehicle', 6, 5);
    appData.campaign.opMapGrid['6,5'] = { types: ['grass'], markers: [] };
    globalThis.__vehGrass = supplyMoveCost('vehicle', 6, 5);
    appData.campaign.opMapGrid['6,5'] = { types: ['rocks'], markers: [] };
    globalThis.__vehRocks = supplyMoveCost('vehicle', 6, 5);
  `);
  assert.ok(Number.isFinite(s.evalCtx('__foot')), 'пешая колонна идёт лесом');
  assert.ok(!Number.isFinite(s.evalCtx('__veh')), 'по лесу машина не проедет');
  assert.equal(s.evalCtx('__vehRoad'), 1, 'по дороге — 1');
  assert.equal(s.evalCtx('__vehGrass'), 1, 'по траве — 1');
  assert.ok(!Number.isFinite(s.evalCtx('__vehRocks')), 'по камням машина не проедет');
});

// ───────────────────────── 5. Засада и потери ─────────────────────────
test('R47: засада убивает носильщиков, теряет груз и уменьшает пул', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  const { setRandom } = require('./sandbox');
  setRandom(s, new Array(400).fill(0));   // ⚡ броски d6 = 1 — засада срабатывает
  s.run(`
    sendSupplyDelivery(2, [{ id: 'porter', count: 4 }], 'unit');
    const d = appData.campaign.supply.deliveries[0];
    appData.campaign.enemyOpUnits = [{ name: 'враг', isDestroyed: false, hidden: false, col: d.col, row: d.row, squads: [] }];
    const before = appData.campaign.opUnits[0].squads.reduce((a, sq) => a + sq.fighters.filter(f => f.hp > 0).length, 0);
    globalThis.__amb = supplyAmbushCheck(d) || null;
    const after = appData.campaign.opUnits[0].squads.reduce((a, sq) => a + sq.fighters.filter(f => f.hp > 0).length, 0);
    globalThis.__killed = before - after;
    globalThis.__left = JSON.parse(JSON.stringify(d.assets));
    syncSupplyAssetsFromPlatoon();
    globalThis.__pool = appData.campaign.supply.assets.porter.total;
    const clean = { assets: [{ id: 'porter', count: 2 }], cargo: { ammoSmall: 80, grenades: 16, ammoOrdnance: 0 }, col: 5, row: 5 };
    let rolls = 0;
    for (let i = 0; i < 20; i++) { if (supplyAmbushCheck({ ...clean, assets: [{ id: 'porter', count: 2 }] })) rolls++; }
    globalThis.__rolls = rolls;
  `);
  const amb = json(s, '__amb');
  assert.equal(amb.hit, true, 'засада срабатывает при низком броске');
  assert.equal(amb.lost[0].count, 2, 'при потере гибнет половина носильщиков');
  assert.equal(s.evalCtx('__killed'), 2, 'двое носильщиков погибли в бою');
  assert.equal(json(s, '__left')[0].count, 2, 'в колонне осталось двое');
  assert.equal(s.evalCtx('__pool'), 6, 'пул носильщиков уменьшился после потерь');
  assert.ok(s.evalCtx('__rolls') >= 1, 'засада срабатывает на части бросков');
});

test('R47: без врага рядом засады нет', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`
    const d = { assets: [{ id: 'porter', count: 2 }], cargo: { ammoSmall: 80, grenades: 16, ammoOrdnance: 0 }, col: 5, row: 5 };
    globalThis.__amb = supplyAmbushCheck(d);
  `);
  assert.equal(s.evalCtx('__amb'), null, 'врага рядом нет — колонна едет спокойно');
});

// ───────────────────────── 6. Рейс в тыл ─────────────────────────
test('R47: точка тыла — край карты в стороне от противника', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  const rear = json(s, 'supplyRearPoint()');
  assert.ok(Number.isFinite(rear.col) && Number.isFinite(rear.row), 'точка определена');
  const zone = s.evalCtx("SCENARIO_PLACEMENT_ZONES.valencia.BeVe");
  assert.ok(zone.some(h => h[0] === rear.col && h[1] === rear.row), 'точка лежит в своей зоне расстановки (дорога в тыл)');
});

test('R47: рейс в тыл пополняет склад до максимума', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`
    appData.campaign.supply.stock = { ammoSmall: 100, grenades: 20, ammoOrdnance: 0 };
    globalThis.ok = sendSupplyDelivery(-1, [{ id: 'truck', count: 1 }], 'rear');
    globalThis.__cargo = JSON.parse(JSON.stringify(appData.campaign.supply.deliveries[0].cargo));
    let turns = 0;
    while (appData.campaign.supply.deliveries.length && turns < 40) { advanceSupplyDeliveries(); turns++; }
    globalThis.__turns = turns;
    globalThis.__stock = JSON.parse(JSON.stringify(appData.campaign.supply.stock));
    globalThis.__trips = appData.campaign.supply.rearTrips;
  `);
  assert.equal(s.evalCtx('ok'), true, 'рейс в тыл отправлен');
  assert.deepEqual(json(s, '__cargo'), { ammoSmall: 0, grenades: 0, ammoOrdnance: 0 }, 'в тыл идут порожняком');
  assert.deepEqual(json(s, '__stock'), { ammoSmall: 1200, grenades: 300, ammoOrdnance: 80 }, 'склад пополнен полностью');
  assert.equal(s.evalCtx('__trips'), 1, 'рейс засчитан');
});

test('R47: перерезанная дорога в тыл — подвоза нет', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`
    const r = supplyRearPoint();
    appData.campaign.enemyOpUnits = [{ name: 'враг', isDestroyed: false, hidden: false, col: r.col, row: r.row, squads: [] }];
    appData.campaign.supply.stock = { ammoSmall: 100, grenades: 20, ammoOrdnance: 0 };
    globalThis.__blocked = supplyRearRouteBlocked();
    alerts.length = 0;
    globalThis.__send = sendSupplyDelivery(-1, [{ id: 'truck', count: 1 }], 'rear');
    globalThis.__alert = alerts[alerts.length - 1] || '';
    globalThis.__truck = appData.campaign.supply.assets.truck.available;
  `);
  assert.equal(s.evalCtx('__blocked'), true, 'дорога перерезана');
  assert.equal(s.evalCtx('__send'), false, 'рейс не отправлен');
  assert.match(String(s.evalCtx('__alert')), /перерезана/, 'игроку объяснили причину');
  assert.equal(s.evalCtx('__truck'), 1, 'грузовик остался на складе');
});

test('R47: перерезанная дорога не даёт пополнить склад и в пути', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`
    appData.campaign.supply.stock = { ammoSmall: 100, grenades: 20, ammoOrdnance: 0 };
    sendSupplyDelivery(-1, [{ id: 'porter', count: 2 }], 'rear');
    const r = supplyRearPoint();
    appData.campaign.enemyOpUnits = [{ name: 'враг', isDestroyed: false, hidden: false, col: r.col, row: r.row, squads: [] }];
    let turns = 0;
    while (appData.campaign.supply.deliveries.length && turns < 40) { advanceSupplyDeliveries(); turns++; }
    globalThis.__turns = turns;
    globalThis.__stock = JSON.parse(JSON.stringify(appData.campaign.supply.stock));
    globalThis.__porter = appData.campaign.supply.assets.porter.available;
  `);
  assert.equal(json(s, '__stock').ammoSmall, 100, 'склад не пополнен');
  assert.equal(s.evalCtx('__porter'), 8, 'носильщики вернулись на склад');
});

// ───────────────────────── 7. Панель и оформление ─────────────────────────
test('R47: панель снабжения — кнопка, склад, транспорт и получатели', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run('renderSupplyPanel(); globalThis.__html = document.getElementById("supplyPanel").innerHTML;');
  const html = String(s.evalCtx('__html'));
  ['Батальонный склад боеприпасов', '🔫 Патроны', '💣 Гранаты', '🚀 Снаряды',
   'Транспорт и носильщики', 'Носильщик', 'Грузовик', 'Рейс в тыл', '1-е отделение',
   'Отправить снабжение'].forEach(txt => assert.ok(html.includes(txt), `в панели нет «${txt}»`));
  assert.ok(html.includes('supply_asset_porter'), 'есть поле ввода носильщиков');
  assert.ok(html.includes('name="supplyTarget"'), 'есть выбор получателя');
});

test('R47: снабжение — часть Hard Mode (кнопка и панель), связь не сломана', () => {
  assert.match(HTML, /onclick="showSupplyPanel\(\)" id="showSupplyPanelBtn"/);
  assert.match(HTML, /const supplyPanelBtn = document\.getElementById\('showSupplyPanelBtn'\);/);
  assert.match(HTML, /advanceSupplyDeliveries\(\)/);
  assert.match(HTML, /try \{ advanceSupplyDeliveries\(\); \} catch \(e\) \{ console\.warn\('supply deliveries:'/, 'колонны двигаются в конце оперативного хода');
});

test('R47: шкала боезапаса есть и в списке батальона, и в деталях юнита', () => {
  assert.match(HTML, /supplyAmmoBarHtml\(unit\)/, 'шкала в списке батальона');
  assert.match(HTML, /html \+= supplyAmmoBarHtml\(unit\)/, 'шкала в деталях юнита');
});

test('v13.068: версия одинакова в приложении, манифесте и кэше', () => {
  const m = /var APP_VERSION = 'v(\d+\.\d+)'/.exec(HTML);
  assert.ok(m, 'APP_VERSION найден');
  const v = m[1].replace('.', '\\.');
  assert.match(HTML, new RegExp('<title>Боевой модуль v' + v));
  assert.match(fs.readFileSync(ROOT + '/manifest.json', 'utf8'), new RegExp('БМ v' + v));
  assert.match(fs.readFileSync(ROOT + '/service-worker.js', 'utf8'), new RegExp("const CACHE_NAME = 'wargame-v" + v + "'"));
});

console.log(`\nИтог v13.068: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) {
  failures.forEach(f => console.log('  · ' + f));
  process.exitCode = 1;
}
