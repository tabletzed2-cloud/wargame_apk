// ⚡ v13.069 (R48): регрессии доработок снабжения и боя —
//    точки тыла по фракциям, охрана и захват склада, скрытное движение,
//    штраф по движущейся бронетехнике (карта и тактический бой),
//    миномёты не бьют броню, расход боезапаса на огонь по карте, «Бюрократия» +1 ход.
//    Запуск: node 'test_harness /regression_v13069.js'
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
  // ⚡ v13.069: новые константы R48
  'SUPPLY_EVAC_POINTS', 'SUPPLY_CAPTURE_LOSS',
  'SUPPLY_BUREAUCRACY_CARD', 'SUPPLY_BUREAUCRACY_DELAY', 'SUPPLY_SHOT_SPEND'
];
const FNS = [
  // снабжение (v13.068) + надстройки v13.069
  'supplyAssetIds', 'ensureSupplyState', 'getSupplyUnit', 'supplyAssetCounts',
  'syncSupplyAssetsFromPlatoon', 'getSupplyDepotHex', 'supplyCargoOf', 'supplyAssetsMobility',
  'supplyOrdnanceFull', 'unitAmmoStatus', 'supplyAmmoPercent', 'supplyDistributeCargo',
  'supplyUnitList', 'sendSupplyDelivery', 'supplyAssetsLabel', 'supplyRearPoint',
  'supplyRearRouteBlocked', 'supplyMoveCost', 'supplyStepToward', 'supplyAmbushCheck',
  'supplyKillCarriers', 'advanceSupplyDeliveries', 'supplyBarHtml', 'supplyAmmoBarHtml',
  'dispatchSupplyFromPanel', 'renderSupplyPanel', 'showSupplyPanel',
  'supplyDepotCaptured', 'syncSupplyDepotStatus', 'unitHasBureaucracy',
  'isOpUnitWipedOut', 'getOperationalCombatFighters',
  // боезапас оперативной карты (R48#6)
  'operationalAmmoField', 'operationalAmmoSquads', 'unitOperationalAmmoTotal',
  'consumeOperationalAmmo', 'requireOperationalAmmo',
  // артиллерия и ПТО-огонь по карте (R48#4, R48#5)
  'isArmoredUnit', 'isStaticOpUnit', 'isMortarUnit', 'artilleryCaliberMm',
  'executeMortarSalvo', 'executeOpShootAt', 'tacticalAttackTargetMoved', 'getNearestOpUnit',
  'rollD6', 'rollD10',
  // панель приказов (R48#3)
  'createOrder', 'orderUnitForStealthCheck', 'isVehicleMobilityUnit', 'updateOrderFieldVisibility',
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
  ['Стрелок охранник №1', 'Стрелок охранник №1 (Бельгийцы)'],
  ['Стрелок охранник №2', 'Стрелок охранник №2 (Бельгийцы)']
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
    globalThis.alert = (m) => { (globalThis.__alerts = globalThis.__alerts || []).push(String(m)); };
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

// Логи копятся в host-массиве: чистить нужно оттуда, из VM `logs = []` подменяет ссылку.
function clearLogs(s) { s.sandbox.logs.length = 0; }
// Копия VM-значения в host-мир (для assert.deepEqual).
function plain(s, expr) { return JSON.parse(JSON.stringify(s.evalCtx(expr))); }

// Константа Math.random для детерминированных бросков ПТО-огня.
function fixedRandom(s, value) {
  s.run(`Math.random = () => ${value};`);
}

// ПТО-обстрел цели: возвращает число попаданий из итогового лога.
function atShootHits(s, target, distance, random) {
  fixedRandom(s, random);
  clearLogs(s);
  s.run(`
    opShootingState = { shooter: globalThis.shooterUnit, targets: [globalThis.targetUnit], distance: ${distance} };
    executeOpShootAt([globalThis.targetUnit], ${distance});
  `);
  const line = s.sandbox.logs.filter(l => /Попаданий:/.test(l)).pop() || '';
  const m = /Попаданий: (\d+)/.exec(line);
  return m ? parseInt(m[1], 10) : -1;
}

// ───────────────────────── 1. Версия ─────────────────────────
test('v13.069: версия одинакова в приложении, манифесте и кэше', () => {
  const app = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
  const manifest = JSON.parse(fs.readFileSync(require('path').join(ROOT, 'manifest.json'), 'utf8'));
  const sw = fs.readFileSync(require('path').join(ROOT, 'service-worker.js'), 'utf8');
  assert.equal(app, 'v13.069');
  assert.ok(JSON.stringify(manifest).includes('13.069'), 'манифест на v13.069');
  assert.ok(/wargame-v13\.069/.test(sw), 'кэш service-worker на v13.069');
});

// ───────────────────────── 2. R48#1 точки тыла по фракциям ─────────────────────────
test('R48#1: точка тыла своя у каждой фракции — A.I.R.F. (0,11), BeVe (7,0)', () => {
  const map = {
    'BeVe': { col: 7, row: 0 },
    'A.I.R.F.': { col: 0, row: 11 }
  };
  Object.keys(map).forEach(fac => {
    const s = createSandbox(freshAppData());
    s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
          FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
    s.run(`appData.campaign.playerFaction = ${JSON.stringify(fac)};`);
    const p = s.evalCtx('supplyRearPoint()');
    assert.equal(p.col, map[fac].col, `${fac}: колонка точки тыла`);
    assert.equal(p.row, map[fac].row, `${fac}: ряд точки тыла`);
  });
});

// ───────────────────────── 3. R48#2 охрана и захват склада ─────────────────────────
test('R48#2: у BeVe в взводе снабжения 11 отделений, включая 2 стрелка-охранника', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  const names = s.evalCtx('appData.campaign.opUnits[0].squads.map(sq => sq.name)');
  assert.equal(names.length, 11, 'одиннадцать отделений');
  assert.ok(names.includes('Стрелок охранник №1'), 'первый охранник');
  assert.ok(names.includes('Стрелок охранник №2'), 'второй охранник');
  const guardsOnlySupplies = plain(s, `appData.campaign.opUnits[0].squads.filter(sq => /охранник/i.test(sq.name)).map(sq => (sq.fighters||[]).length)`);
  assert.deepEqual(guardsOnlySupplies, [2, 2], 'в каждом охранении по 2 бойца');
  const armed = s.evalCtx(`appData.campaign.opUnits[0].squads.filter(sq => /охранник/i.test(sq.name)).every(sq => (sq.fighters||[]).every(f => f.hp > 0))`);
  assert.ok(armed, 'охрана в строю и прикреплена к складу');
});

test('R48#2: пока взвод снабжения цел — склад наш, захвата нет', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run('syncSupplyDepotStatus();');
  assert.equal(s.evalCtx('appData.campaign.supply.status'), 'active', 'склад наш');
  assert.equal(s.evalCtx('supplyDepotCaptured()'), false);
  assert.equal(s.evalCtx('appData.campaign.supply.stock.ammoSmall'), 1200, 'склад полон');
});

test('R48#2: склад падает только когда взвод снабжения разбит, теряется ровно половина', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`
    appData.campaign.opUnits[0].squads.forEach(sq => (sq.fighters || []).forEach(f => { f.hp = 0; }));
    syncSupplyDepotStatus();
  `);
  assert.equal(s.evalCtx('appData.campaign.supply.status'), 'captured', 'склад захвачен');
  assert.equal(s.evalCtx('appData.campaign.supply.stock.ammoSmall'), 600, 'патроны: половина');
  assert.equal(s.evalCtx('appData.campaign.supply.stock.grenades'), 150, 'гранаты: половина');
  assert.equal(s.evalCtx('appData.campaign.supply.stock.ammoOrdnance'), 40, 'снаряды: половина');
  s.run('syncSupplyDepotStatus(); syncSupplyDepotStatus();');
  assert.equal(s.evalCtx('appData.campaign.supply.stock.ammoSmall'), 600, 'повторные проверки не списывают склад снова');
});

test('R48#2: разбитый взвод не даёт отправить колонну, отбитый склад снова работает', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`appData.campaign.opUnits[0].squads.forEach(sq => (sq.fighters || []).forEach(f => { f.hp = 0; }));`);
  const sent = s.evalCtx(`sendSupplyDelivery(2, [{ id: 'porter', count: 2 }], 'unit')`);
  assert.equal(sent, false, 'при захваченном складе отправка запрещена');
  assert.ok(s.sandbox.logs.concat(s.evalCtx('globalThis.__alerts || []')).some(x => /захвачен/i.test(x)), 'есть предупреждение о захвате');

  // отбиваем склад: взвод снова боеспособен
  s.run(`
    appData.campaign.opUnits[0].squads.forEach(sq => (sq.fighters || []).forEach(f => { f.hp = 5; }));
    syncSupplyDepotStatus();
  `);
  assert.equal(s.evalCtx('appData.campaign.supply.status'), 'active', 'склад отбит');
  const sent2 = s.evalCtx(`sendSupplyDelivery(2, [{ id: 'porter', count: 2 }], 'unit')`);
  assert.equal(sent2, true, 'после отбития склада колонна снова идёт');
});

test('R48#2: охрану нельзя потерять отдельно от взвода — склад держится, пока живы бойцы', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  // гибнут только охранники: взвод ещё боеспособен (несущие отделения живы)
  s.run(`
    appData.campaign.opUnits[0].squads.filter(sq => /охранник/i.test(sq.name))
      .forEach(sq => (sq.fighters || []).forEach(f => { f.hp = 0; }));
    syncSupplyDepotStatus();
  `);
  assert.equal(s.evalCtx('appData.campaign.supply.status'), 'active', 'потеря охранников не отдаёт склад');
});

// ───────────────────────── 4. R48#3 скрытное движение ─────────────────────────
test('R48#3: техника скрытно не ходит — пехота ходит', () => {
  const s = createSandbox(freshAppData());
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  assert.equal(s.evalCtx(`isVehicleMobilityUnit({ name: 'Грузовик снабжения', mobility: 'vehicle' })`), true, 'мобильность vehicle');
  assert.equal(s.evalCtx(`isVehicleMobilityUnit({ name: 'Батарея САУ', mobility: 'foot' })`), true, 'САУ в имени');
  assert.equal(s.evalCtx(`isVehicleMobilityUnit({ name: 'Рота БТР', mobility: 'foot' })`), true, 'БТР в имени');
  assert.equal(s.evalCtx(`isVehicleMobilityUnit({ name: '1-е отделение', mobility: 'foot' })`), false, 'пехота');
  assert.equal(s.evalCtx(`isVehicleMobilityUnit({ name: 'Взвод снабжения', mobility: 'foot' })`), false, 'пеший взвод');
});

test('R48#3: приказ «движение» несёт флаг stealth', () => {
  const s = createSandbox(freshAppData());
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    var currentTurn = 1;
    globalThis.checkCommunication = () => 'radio';
    appData.campaign.opUnits = [{ name: 'Взвод', col: 1, row: 1 }, { name: 'Цель', col: 2, row: 2 }];
    globalThis.oStealth = createOrder(0, 1, 'move', { stealth: true });
    globalThis.oNormal = createOrder(0, 1, 'move', {});
  `);
  assert.equal(s.evalCtx('oStealth.stealth'), true, 'скрытный приказ помечен');
  assert.equal(s.evalCtx('oNormal.stealth'), false, 'обычный приказ без флага');
});

test('R48#3: галочка скрытности видна пехоте и скрыта для техники', () => {
  const s = createSandbox(freshAppData());
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    appData.campaign.opUnits = [
      { name: '1-е отделение', type: 'infantry_platoon', mobility: 'foot' },
      { name: 'Грузовик снабжения', type: 'vehicle', mobility: 'vehicle' }
    ];
  `);
  // пехота, приказ «движение»: блок показан
  s.run(`document.getElementById('orderTargetUnit').value = '0'; updateOrderFieldVisibility('move');`);
  assert.equal(s.evalCtx(`document.getElementById('orderStealthBlock').style.display`), 'block', 'пехоте — блок виден');
  // техника: блок скрыт и галочка снята
  s.run(`document.getElementById('orderStealthMove').checked = true;
         document.getElementById('orderTargetUnit').value = '1';
         updateOrderFieldVisibility('move');`);
  assert.equal(s.evalCtx(`document.getElementById('orderStealthBlock').style.display`), 'none', 'технике — блок скрыт');
  assert.equal(s.evalCtx(`document.getElementById('orderStealthMove').checked`), false, 'галочка сброшена');
  // не «движение» — блока нет
  s.run(`document.getElementById('orderTargetUnit').value = '0'; updateOrderFieldVisibility('attack');`);
  assert.equal(s.evalCtx(`document.getElementById('orderStealthBlock').style.display`), 'none', 'для атаки блока нет');
  assert.ok(/id="orderStealthMove"/.test(HTML), 'галочка есть в разметке');
});

test('R48#3: скрытный юнит медленнее (2 ОД) и хуже обнаруживается', () => {
  assert.ok(/u\.stealthMove = !!stealthOrder && !isVehicleMobilityUnit\(u\)/.test(HTML), 'флаг пересчитывается из приказов');
  assert.ok(/u\.ap = isStaticOpUnit\(u\) \? 0 : \(u\.stealthMove \? Math\.min\(u\.maxAp \|\| 4, 2\) : u\.maxAp\)/.test(HTML),
            'скрытному — половина ОД');
  assert.ok(/if \(unit\.stealthMove\) mod -= 1;\s*\n\s*else if \(unit\.movedThisTurn\) mod \+= 1;/.test(HTML),
            'скрытность улучшает маскировку');
  assert.ok(/const moved = !!unit\.movedThisTurn && !unit\.stealthMove;/.test(HTML),
            'скрытное движение не выдаёт юнита');
  assert.ok(/stealth: !!\(document\.getElementById\('orderStealthMove'\)/.test(HTML), 'галочка пишется в приказ');
  assert.equal((HTML.match(/stealth: !!\(document\.getElementById\('orderStealthMove'\)/g) || []).length, 2,
               'галочка учитывается и в одиночном приказе, и при добавлении в серию');
  assert.ok(/stealth: !!order\.stealth,   \/\/ ⚡ v13\.069 \(R48#3\): скрытный марш через штаб роты/.test(HTML),
            'скрытность сохраняется при передаче через штаб роты');
  assert.ok(/Array\.isArray\(o\.series\) && o\.series\.some\(st => st && st\.type === 'move' && st\.stealth/.test(HTML),
            'скрытный шаг серии тоже снижает ОД');
});

// ───────────────────────── 5. R48#4 штраф по движущейся броне ─────────────────────────
function atShootSetup() {
  const s = createSandbox(freshAppData());
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    globalThis.shooterUnit = {
      name: 'Батарея ПТО', type: 'at_gun', col: 0, row: 0, squads: [
        { name: 'ПТО', faction: 'BeVe', ammoOrdnance: 100, crewInstances: [{ weaponName: 'ПТО 45мм', active: true }] }
      ]
    };
    globalThis.targetUnit = {
      name: 'Танк', type: 'tank_platoon', col: 5, row: 0,
      armor: { front: 40, side: 30, rear: 20, turret: 30 }, fighters: [{ hp: 3 }],
      squads: [{ name: 'Экипаж', faction: 'BeVe', ammoOrdnance: 4 }]
    };
    globalThis.opShootingState = { shooter: shooterUnit };
    globalThis.getHqSupportAccuracyMod = () => 1;
    globalThis.countAtGuns = () => 1;
    globalThis.opLineOfSightBlocked = () => false;
    globalThis.getArmorUnits = (units) => (units || []).filter(u => u && (u.armor || u.type === 'tank_platoon'));
    globalThis.isStaticOpUnit = (u) => !!(u && u.type === 'dots');
    globalThis.selectTargetVehicle = (t) => t;
    globalThis.processVehicleHit = () => ({ message: 'ok' });
    globalThis.getLocationName = () => 'корпус';
    globalThis.removeImmobilizedVehicleFromGroup = () => {};
    globalThis.closeShootChoiceModals = () => {};
    globalThis.showShootNotification = () => {};
    globalThis.getFactionCrewWeapons = () => [{ type: 'at_gun', name: 'ПТО 45мм', penetration: { '30': 30 } }];
    globalThis.isArmoredUnit = (u) => !!(u && (u.armor || u.type === 'tank_platoon'));
  `);
  return s;
}

test('R48#4: по движущейся броне днём на дистанции 5 попаданий вдвое меньше', () => {
  const s = atShootSetup();
  s.run('targetUnit.movedThisTurn = false;');
  const still = atShootHits(s, null, 5, 0.045);   // 0.08 — попадание
  s.run('targetUnit.movedThisTurn = true;');
  const moved = atShootHits(s, null, 5, 0.045);   // 0.04 — промах
  assert.equal(still, 12, 'неподвижная цель: 12 попаданий');
  assert.equal(moved, 0, 'движущаяся цель: штраф −1');
});

test('R48#4: вблизи (дистанция 3) штрафа по движущейся броне нет', () => {
  const s = atShootSetup();
  s.run('targetUnit.movedThisTurn = true;');
  assert.equal(atShootHits(s, null, 3, 0.045), 12, 'дистанция 3 — штраф не действует');
});

test('R48#4: ночью по движущейся броне штраф −2 вместо обычного половинения', () => {
  const s = atShootSetup();
  s.run('globalThis.getNightModifier = () => 0.5;');
  // неподвижная цель: работает прежнее ночное половинение (0.08 → 0.04)
  s.run('targetUnit.movedThisTurn = false;');
  const stillNight = atShootHits(s, null, 5, 0.03);
  const stillLogs = s.sandbox.logs.slice();
  assert.ok(stillNight >= 1, 'ночь, неподвижная цель: попадания остаются');
  assert.ok(stillLogs.some(l => /Ночь! Шанс попадания снижен/.test(l)), 'обычный ночной модификатор работает');
  assert.ok(!stillLogs.some(l => /Цель движется в темноте/.test(l)), 'к неподвижной цели −2 не применяется');

  // движущаяся цель: 0.08 × 0.25 = 0.02 (штраф −2); при двойном половинении было бы 0.01
  s.run('targetUnit.movedThisTurn = true;');
  const movedNight = atShootHits(s, null, 5, 0.015);
  const movedLogs = s.sandbox.logs.slice();
  assert.equal(movedNight, 12, 'ночь, движущаяся цель: ровно −2, без второго половинения');
  assert.ok(movedLogs.some(l => /Цель движется в темноте \(дистанция 5\): штраф −2/.test(l)), 'в логе — штраф −2');
  assert.ok(!movedLogs.some(l => /Ночь! Шанс попадания снижен/.test(l)), 'обычное половинение заменено, а не добавлено');
});

test('R48#4: тактический бой знает, что цель двигалась, и повышает требуемый бросок', () => {
  const s = createSandbox(freshAppData());
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    appData.map = { attackTargetEnemyIdx: 0, enemySquads: [
      { name: 'Танк', movedThisTurn: true },
      { name: 'Второй', movedThisTurn: false, vehicleList: [{ name: 'БТР', movedThisTurn: true }] }
    ] };
    globalThis.t1 = tacticalAttackTargetMoved();
    appData.map.attackTargetEnemyIdx = 1;
    globalThis.t2 = tacticalAttackTargetMoved();
    appData.map.attackTargetEnemyIdx = null;
    globalThis.t3 = tacticalAttackTargetMoved();
  `);
  assert.equal(s.evalCtx('t1'), true, 'двигавшийся отряд');
  assert.equal(s.evalCtx('t2'), true, 'двигавшаяся машина в группе');
  assert.equal(s.evalCtx('t3'), false, 'без выбранной цели — нет штрафа');
  assert.ok(/hitTarget \+= pen;/.test(HTML), 'в тактическом бою штраф увеличивает требуемый бросок');
  assert.ok(/const pen = tacNight \? 2 : 1;/.test(HTML), '−2 ночью, −1 днём');
  assert.ok(/s\.movedThisTurn = true;   \/\/ ⚡ v13\.069 \(R48#4\)/.test(HTML), 'враг помечается как двигавшийся');
  assert.ok(/enemySquads \|\| \[\]\)\.forEach\(s => \{ s\.movedThisTurn = false; \}\)/.test(HTML), 'флаг сбрасывается каждый ход');
});

// ───────────────────────── 6. R48#5 миномёты и броня ─────────────────────────
function mortarSetup() {
  const s = createSandbox(freshAppData());
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    globalThis.dmgCalls = [];
    globalThis.applyDamageToOpUnit = (t, d) => { dmgCalls.push({ name: t.name, dmg: d }); return { damage: d, killed: 0 }; };
    globalThis.dotEmbrasureHp = () => {};
    globalThis.addShellingCraters = () => {};
    globalThis.showShootNotification = () => {};
    globalThis.getOpHexDistance = () => 1;
    globalThis.canUnitShoot = () => true;
    globalThis.mortarUnit = { name: 'Батарея 82-мм миномётов', type: 'mortar_battery', col: 0, row: 0, squads: [
      { name: 'Миномёты', faction: 'BeVe', ammoOrdnance: 20, crewInstances: [{ weaponName: 'Минометный расчёт 82мм', active: true }] }
    ] };
    globalThis.sauUnit = { name: 'Батарея САУ', type: 'sau_battery', col: 0, row: 0, squads: [
      { name: 'САУ', faction: 'BeVe', ammoOrdnance: 20, crewInstances: [{ weaponName: 'Орудие САУ', active: true }] }
    ] };
    globalThis.tank = { name: 'Танк', type: 'tank_platoon', col: 1, row: 1, armor: { front: 40 }, squads: [{ name: 'Экипаж', fighters: [{ hp: 3 }] }] };
    globalThis.infantry = { name: 'Пехота', type: 'infantry_platoon', col: 1, row: 1, squads: [{ name: 'Отделение', fighters: [{ hp: 3 }, { hp: 3 }] }] };
    globalThis.getFactionCrewWeapons = () => [
      { type: 'mortar', name: 'Минометный расчёт 82мм', effectiveRange: 5, shotsFull: 3, crewSize: 3 },
      { type: 'at_gun', name: 'Орудие САУ', effectiveRange: 10, shotsFull: 3, crewSize: 3 }
    ];
  `);
  return s;
}

test('R48#5: миномётный залп по одной бронетехнике не наносит урона и не тратит снаряды', () => {
  const s = mortarSetup();
  clearLogs(s);
  s.run('executeMortarSalvo(mortarUnit, [tank], 3, 6, \'1d6\');');
  assert.equal(s.evalCtx('dmgCalls.length'), 0, 'урона по броне нет');
  assert.equal(s.evalCtx('mortarUnit.squads[0].ammoOrdnance'), 20, 'снаряды не списаны');
  assert.ok(s.sandbox.logs.some(l => /только бронетехника/.test(l)), 'в логе сказано, что миномёт броню не бьёт');
});

test('R48#5: миномёт по пехоте работает и тратит 10 % снарядов', () => {
  const s = mortarSetup();
  clearLogs(s);
  s.run('executeMortarSalvo(mortarUnit, [infantry], 3, 6, \'1d6\');');
  assert.equal(s.evalCtx('mortarUnit.squads[0].ammoOrdnance'), 18, 'снаряды: 20 → 18');
  assert.ok(s.evalCtx('dmgCalls.length') > 0, 'урон пехоте наносится');
});

test('R48#5: САУ по броне стреляет как раньше (правило только про миномёты)', () => {
  const s = mortarSetup();
  clearLogs(s);
  s.run('executeMortarSalvo(sauUnit, [tank], 3, 4, \'1d10\');');
  assert.ok(!s.sandbox.logs.some(l => /только бронетехника/.test(l)), 'для САУ запрета нет');
});

test('R48#5: автоогонь миномётной батареи не выбирает бронетехнику целью', () => {
  assert.ok(/const infOnly = enemies\.filter\(e => !isArmoredUnit\(e\)\);/.test(HTML), 'миномёты ищут только пехоту');
  assert.ok(/const alive = enemies\.filter\(e => !e\.isDestroyed && \(!mortarNoArmor \|\| !isArmoredUnit\(e\)\)\);/.test(HTML),
            'в залпе броня исключена только для миномётов');
});

// ───────────────────────── 7. R48#6 расход боезапаса ─────────────────────────
test('R48#6: каждая стрельба списывает 10 % текущего боезапаса', () => {
  const s = createSandbox(freshAppData());
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    globalThis.u = { name: 'Взвод', squads: [
      { name: 'A', ammoSmall: 100, ammoOrdnance: 40 },
      { name: 'B', ammoSmall: 50, ammoOrdnance: 10 }
    ] };
    consumeOperationalAmmo(u, 'small');
    consumeOperationalAmmo(u, 'ordnance');
    globalThis.after = JSON.parse(JSON.stringify(u.squads));
  `);
  assert.equal(s.evalCtx('after[0].ammoSmall'), 90, '100 → 90');
  assert.equal(s.evalCtx('after[1].ammoSmall'), 45, '50 → 45 (10 % от 50)');
  assert.equal(s.evalCtx('after[0].ammoOrdnance'), 36, 'снаряды 40 → 36');
  assert.equal(s.evalCtx('unitOperationalAmmoTotal(u, \'small\')'), 135, 'остаток считается по всем отделениям');
});

test('R48#6: без боезапаса стрелять нельзя, юниты без учёта боезапаса не блокируются', () => {
  const s = createSandbox(freshAppData());
  // логи этой песочницы: чистим до запуска (см. clearLogs)
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    globalThis.empty = { name: 'Пустой взвод', squads: [{ name: 'A', ammoSmall: 0, ammoOrdnance: 0 }] };
    globalThis.fresh = { name: 'Свежий взвод', squads: [{ name: 'A', ammoSmall: 5, ammoOrdnance: 5 }] };
    globalThis.noTrack = { name: 'Батарея без учёта', type: 'mortar_battery' };
    globalThis.rEmpty = requireOperationalAmmo(empty, 'small');
    globalThis.rFresh = requireOperationalAmmo(fresh, 'small');
    globalThis.rNoTrack = requireOperationalAmmo(noTrack, 'ordnance');
  `);
  // лог «нет патронов» приходит из sliced-функции — смотрим host-массив
  assert.equal(s.evalCtx('rEmpty'), false, 'пусто — огонь запрещён');
  assert.ok(s.sandbox.logs.some(l => /нет патронов/.test(l)), 'в логе сказано, что нужно снабжение');
  assert.equal(s.evalCtx('rFresh'), true, 'со запасом — можно');
  assert.equal(s.evalCtx('rNoTrack'), true, 'юнит без учёта боезапаса не блокируется');
});

test('R48#6: расход вшит в стрельбу по карте, «огонь по готовности», залп и лёгкую артиллерию', () => {
  assert.ok(/const SUPPLY_SHOT_SPEND = 0\.10;/.test(HTML), 'ставка 10 %');
  assert.ok(/consumeOperationalAmmo\(shooter, 'small'\);   \/\/ ⚡ v13\.069 \(R48#6\): 10% патронов за стрельбу/.test(HTML),
            'executeOpShoot тратит патроны');
  assert.ok(/consumeOperationalAmmo\(shooter, 'ordnance'\);   \/\/ ⚡ v13\.069 \(R48#6\): 10% снарядов за стрельбу/.test(HTML),
            'executeOpShootAt тратит снаряды');
  assert.ok(/if \(!requireOperationalAmmo\(unit, 'ordnance'\)\) return;\s*\n\s*consumeOperationalAmmo\(unit, 'ordnance'\);/.test(HTML),
            'залп артиллерии тратит снаряды');
  assert.ok(/const shootAmmoKind = \(\(typeof isMortarUnit === 'function' && isMortarUnit\(shooter\)\)/.test(HTML) &&
            /if \(!requireOperationalAmmo\(shooter, shootAmmoKind\)\) \{ cancelOpShooting\(\); return; \}/.test(HTML),
            'нет запаса — огонь по карте отменяется (у артиллерии — снаряды)');
  assert.ok(/consumeOperationalAmmo\(unit, 'ordnance'\);\n    const victim/.test(HTML), 'лёгкая артиллерия тратит снаряды');
});

// ───────────────────────── 8. R48#7 «Бюрократия» ─────────────────────────
test('R48#7: карточка «Бюрократия» распознаётся у взвода в любом виде', () => {
  const s = createSandbox(freshAppData());
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    globalThis.v1 = { name: 'Первый', cardSelection: { cards: ['Бюрократия'] } };
    globalThis.v2 = { name: 'Второй', squads: [{ appliedCards: [{ name: 'Бюрократия' }] }] };
    globalThis.v3 = { name: 'Третий' };
    globalThis.v4 = { name: 'Четвёртый', squads: [{ appliedCards: [{ name: 'Снайпер' }] }] };
    appData.activeCards = [{ name: 'Бюрократия', active: true, opUnitName: 'Третий' }];
    globalThis.b1 = unitHasBureaucracy(v1);
    globalThis.b2 = unitHasBureaucracy(v2);
    globalThis.b3 = unitHasBureaucracy(v3);
    globalThis.b4 = unitHasBureaucracy(v4);
  `);
  assert.equal(s.evalCtx('b1'), true, 'карточка в выборе взвода');
  assert.equal(s.evalCtx('b2'), true, 'карточка на отделении');
  assert.equal(s.evalCtx('b3'), true, 'карточка активна на взвод');
  assert.equal(s.evalCtx('b4'), false, 'чужая карточка не срабатывает');
});

test('R48#7: колонна к взводу под «Бюрократией» идёт на 1 ход дольше', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`appData.campaign.opUnits[2].cardSelection = { cards: ['Бюрократия'] };
         appData.campaign.opUnits[0].cardSelection = { cards: [] };`);
  const slowOk = s.evalCtx(`sendSupplyDelivery(2, [{ id: 'porter', count: 2 }], 'unit')`);
  assert.equal(slowOk, true, 'колонна к «бюрократическому» взводу отправлена');
  assert.equal(s.evalCtx('appData.campaign.supply.deliveries[0].delayTurns'), 1, 'задержка 1 ход');
  const fastOk = s.evalCtx(`sendSupplyDelivery(0, [{ id: 'porter', count: 2 }], 'unit')`);
  assert.equal(fastOk, true, 'колонна к обычному взводу отправлена');
  assert.equal(s.evalCtx('appData.campaign.supply.deliveries[1].delayTurns'), 0, 'без карточки задержки нет');
});

test('R48#7: задержанная колонна стоит ход на месте, потом продолжает путь', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`appData.campaign.opUnits[2].cardSelection = { cards: ['Бюрократия'] };
         sendSupplyDelivery(2, [{ id: 'porter', count: 2 }], 'unit');
         globalThis.before = { col: appData.campaign.supply.deliveries[0].col, row: appData.campaign.supply.deliveries[0].row };
         advanceSupplyDeliveries();
         globalThis.afterHold = { col: appData.campaign.supply.deliveries[0].col, row: appData.campaign.supply.deliveries[0].row, delay: appData.campaign.supply.deliveries[0].delayTurns };
         advanceSupplyDeliveries();
         globalThis.afterMove = { col: appData.campaign.supply.deliveries[0].col, row: appData.campaign.supply.deliveries[0].row };`);
  assert.ok(s.sandbox.logs.some(l => /Бюрократия: колонна снабжения .* задержана на ход/.test(l)), 'в логе — бумажная задержка');
  assert.deepEqual(plain(s, 'afterHold'), { col: s.evalCtx('before.col'), row: s.evalCtx('before.row'), delay: 0 }, 'первый ход колонна стоит');
  assert.ok(s.evalCtx('afterMove.col') !== s.evalCtx('afterHold.col') || s.evalCtx('afterMove.row') !== s.evalCtx('afterHold.row'),
            'со следующего хода колонна снова идёт');
});

test('R48#7: карточка в cards.js больше не «информационная» и обещает +1 ход', () => {
  const cards = fs.readFileSync(require('path').join(ROOT, 'js/cards.js'), 'utf8');
  const entries = cards.split('"name": "Бюрократия"').length - 1;
  assert.ok(entries >= 1, 'карточка есть в списке');
  assert.equal((cards.match(/supplyDelay": 1/g) || []).length, entries, 'у каждой записи есть supplyDelay');
  assert.ok(!/"Бюрократия"[^}]*informational": true/.test(cards), 'карточка стала рабочей');
  assert.ok(/идят на 1 ход дольше|идут на 1 ход дольше/.test(cards) || /на 1 ход дольше/.test(cards), 'описание про +1 ход');
});

test('R48#7: панель снабжения помечает взводы под «Бюрократией»', () => {
  const s = supplySandbox('BeVe', BEVE_SQUADS);
  s.run(`appData.campaign.opUnits[2].cardSelection = { cards: ['Бюрократия'] };
         renderSupplyPanel();
         globalThis.html = document.getElementById('supplyPanel').innerHTML;`);
  const html = s.evalCtx('html');
  assert.ok(/📄 \+1 ход/.test(html), 'в панели есть пометка +1 ход');
  assert.ok(/бюрократия: ещё/.test(HTML), 'в списке колонн видно остаток задержки');
});

console.log(`\nИтог v13.069: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) {
  failures.forEach(f => console.log('  · ' + f));
  process.exitCode = 1;
}
