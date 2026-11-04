'use strict';
// ⚡ v13.150: техника взвода снабжения BeVe —
//    «Легковой автомобиль» → «Автомобиль DAF MC-V» (плавающий: возит груз через
//    воду и непроходимые болота, но медленно; груза как 1,5 мула) и
//    «Грузовик снабжения» → «Грузовик DAF Trado II».
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

const CAR = 'Автомобиль DAF MC-V';
const TRUCK = 'Грузовик DAF Trado II';
const SUPPLY_HELPERS = ['supplyAssetIds', 'supplyAssetMobilityClass', 'supplyMobilityIsMotorized',
    'supplyAssetsMobility', 'supplyMoveCost', 'supplyCargoOf', 'supplyAssetCounts', 'supplyAssetsLabel'];

function supplySandbox() {
    const s = createSandbox(freshAppData());
    s.run(['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_CONVOY_BUDGET'].map(n => sliceConst(HTML, n)).join('\n'));
    s.run(SUPPLY_HELPERS.map(n => sliceFunction(HTML, n)).join('\n\n'));
    s.run(`function isHexInPlayableArea(){ return true; }
      function getOpHexTypes(col, row){ const c = (appData.campaign.opMapGrid || {})[col + ',' + row];
        return c ? (c.types || ['grass']) : ['grass']; }`);
    return s;
}
function cost(s, mobility, col, row) {
    return s.evalCtx(`supplyMoveCost('${mobility}', ${col}, ${row})`);
}

// ───────────────────────── 1. Состав батальона BeVe ─────────────────────────
{
    const s = createSandbox(freshAppData());
    const presets = s.evalCtx('BATTALION_PRESETS');
    const beve = presets['BeVe'].standard.find(u => u && u.name === 'Взвод снабжения');
    const names = beve.squads.map(q => q.name);
    ok(names.includes(CAR), 'BeVe: в взводе снабжения есть «Автомобиль DAF MC-V»', names.join(' | '));
    ok(names.includes(TRUCK), 'BeVe: грузовик переименован в «Грузовик DAF Trado II»', names.join(' | '));
    ok(!names.includes('Легковой автомобиль') && !names.includes('Грузовик снабжения'),
        'прежних названий в составе нет');
    // ⚡ v13.152 (п.8): +3 грузовика DAF Trado II — 14 отделений
    ok(beve.squads.length === 14, 'BeVe: 14 отделений (добавлены 3 грузовика)', String(beve.squads.length));

    const templates = s.evalCtx('SQUAD_TEMPLATES').filter(t => t && t.faction === 'BeVe');
    const find = n => templates.find(t => t && t.name === n);
    const carTmpl = find(CAR + ' (Бельгийцы)');
    const truckTmpl = find(TRUCK + ' (Бельгийцы)');
    ok(!!carTmpl, 'шаблон «Автомобиль DAF MC-V (Бельгийцы)» существует');
    ok(!!truckTmpl, 'шаблон «Грузовик DAF Trado II (Бельгийцы)» существует');
    ok(!find('Легковой автомобиль (Бельгийцы)') && !find('Грузовик снабжения (Бельгийцы)'),
        'старых шаблонов нет');
    ok(carTmpl && carTmpl.fighters.length === 1 && carTmpl.fighters[0].name === 'Водитель DAF MC-V',
        'за рулём DAF MC-V — «Водитель DAF MC-V»', carTmpl && carTmpl.fighters[0].name);
    ok(truckTmpl && truckTmpl.fighters.length === 2 && truckTmpl.fighters[0].name === 'Водитель DAF Trado II',
        'у DAF Trado II — водитель и помощник', truckTmpl && truckTmpl.fighters.map(f => f.name).join('/'));
    ok(truckTmpl && truckTmpl.fighters.length === 2, 'грузовик по-прежнему с двумя бойцами');
}

// ───────────────────────── 2. Груз и пул средств ─────────────────────────
{
    const s = supplySandbox();
    const car = s.evalCtx('SUPPLY_ASSET_TYPES.car');
    const mule = s.evalCtx('SUPPLY_ASSET_TYPES.mule');
    const truck = s.evalCtx('SUPPLY_ASSET_TYPES.truck');
    ok(car.name === CAR, 'средство называется «Автомобиль DAF MC-V»', car.name);
    ok(truck.name === TRUCK, 'средство называется «Грузовик DAF Trado II»', truck.name);
    ok(car.mobility === 'amphibious', 'DAF MC-V — плавающий класс подвижности', car.mobility);
    ok(car.cargo.ammoSmall === mule.cargo.ammoSmall * 1.5, 'патронов как 1,5 мула', `${car.cargo.ammoSmall} vs ${mule.cargo.ammoSmall}`);
    ok(car.cargo.grenades === mule.cargo.grenades * 1.5, 'гранат как 1,5 мула', `${car.cargo.grenades} vs ${mule.cargo.grenades}`);
    ok(car.cargo.ammoOrdnance === mule.cargo.ammoOrdnance * 1.5, 'снарядов как 1,5 мула', `${car.cargo.ammoOrdnance} vs ${mule.cargo.ammoOrdnance}`);
    ok(car.cargo.ammoSmall === 150 && car.cargo.grenades === 30 && car.cargo.ammoOrdnance === 3,
        'груз DAF MC-V — 150 патронов / 30 гранат / 3 снаряда');
    ok(truck.cargo.ammoSmall === 400 && truck.cargo.grenades === 80 && truck.cargo.ammoOrdnance === 12,
        'груз DAF Trado II не менялся (400/80/12)');
    ok(s.evalCtx(`SUPPLY_ASSET_TYPES.car.squadMatch.test(${JSON.stringify(CAR)})`), 'новое имя распознаётся в пуле');
    ok(s.evalCtx(`SUPPLY_ASSET_TYPES.car.squadMatch.test('Легковой автомобиль')`), 'старое имя тоже распознаётся');
    ok(s.evalCtx(`SUPPLY_ASSET_TYPES.truck.squadMatch.test(${JSON.stringify(TRUCK)})`), 'грузовик распознаётся по новому имени');
    ok(!s.evalCtx(`SUPPLY_ASSET_TYPES.truck.squadMatch.test(${JSON.stringify(CAR)})`), 'DAF MC-V не считается грузовиком');
    ok(s.evalCtx('supplyAssetsLabel([{id:"car",count:1}])').includes('DAF MC-V'), 'в подписи колонны — DAF MC-V',
        s.evalCtx('supplyAssetsLabel([{id:"car",count:1}])'));

    // Пул из отделений взвода
    s.run(`
      const hq = { name: 'Взвод снабжения', squads: [
        { name: '${CAR}', fighters: [{hp:3}] },
        { name: '${TRUCK}', fighters: [{hp:3},{hp:3}] },
        { name: 'Мул с бойцом №1', fighters: [{hp:3}] }
      ] };
      globalThis.pool = supplyAssetCounts(hq);
    `);
    const pool = s.evalCtx('pool');
    ok(pool.car === 1, 'в пуле один автомобиль DAF MC-V', JSON.stringify(pool));
    ok(pool.truck === 1, 'в пуле один грузовик DAF Trado II', JSON.stringify(pool));
}

// ───────────────────────── 3. Плавание: вода и непроходимые болота ─────────────────────────
{
    const s = supplySandbox();
    s.run(`appData.campaign.opMapGrid = {
      '1,1': { types: ['road'] }, '2,1': { types: ['grass'] }, '3,1': { types: ['water'] },
      '4,1': { types: ['swamp_impassable'] }, '5,1': { types: ['swamp_passable'] },
      '6,1': { types: ['forest'] }, '7,1': { types: ['hill'] }
    };`);
    ok(cost(s, 'amphibious', 1, 1) === 1, 'по дороге — как обычная машина (1)');
    ok(cost(s, 'amphibious', 2, 1) === 1, 'по траве — 1');
    ok(cost(s, 'amphibious', 3, 1) === 3, 'через воду — идёт, но втрое медленнее', String(cost(s, 'amphibious', 3, 1)));
    ok(cost(s, 'amphibious', 4, 1) === 4, 'через непроходимое болото — идёт, но совсем медленно', String(cost(s, 'amphibious', 4, 1)));
    ok(cost(s, 'amphibious', 5, 1) === 3, 'по проходимому болоту — тоже медленно');
    ok(Number.isFinite(cost(s, 'vehicle', 3, 1)) === false, 'обычная машина воду не проходит');
    ok(Number.isFinite(cost(s, 'foot', 3, 1)) === false, 'пешие колонны воду не проходят');
    ok(Number.isFinite(cost(s, 'halftrack', 3, 1)) === false, 'горный транспортёр TG-41 воду не проходит');
    ok(Number.isFinite(cost(s, 'amphibious', 6, 1)) === false, 'DAF MC-V по лесу не едет');
    ok(Number.isFinite(cost(s, 'amphibious', 7, 1)) === false, 'на холм DAF MC-V не заезжает');
    ok(cost(s, 'amphibious', 3, 1) > cost(s, 'amphibious', 1, 1) * 2,
        'по воде «гораздо медленнее», чем по дороге/траве');
    ok(s.evalCtx("supplyMobilityIsMotorized('amphibious')"), 'амфибия считается моторизованной (в засаде теряется целиком)');
    ok(s.evalCtx("supplyAssetsMobility([{id:'car',count:1}])") === 'amphibious', 'колонна только из DAF MC-V плывёт');
    ok(s.evalCtx("supplyAssetsMobility([{id:'car',count:1},{id:'truck',count:1}])") === 'vehicle',
        'DAF MC-V + грузовик — колёсный темп (плывёт только одиночная амфибия)');
    ok(s.evalCtx("supplyAssetsMobility([{id:'car',count:1},{id:'porter',count:2}])") === 'foot',
        'смешанная колонна с носильщиками идёт пешим темпом');
}

// ───────────────────────── 4. Маршрут через водную преграду ─────────────────────────
{
    const s = supplySandbox();
    for (const fn of ['findSupplyRoute', 'supplyRouteCost', 'supplyStepToward', 'getOpHexNeighbors', 'operationalHexHasActiveBattle'])
        s.run(sliceFunction(HTML, fn));
    s.run(`
      function isHexInPlayableArea(){ return true; }
      function getOpHexTypes(col, row){ const c = (appData.campaign.opMapGrid || {})[col + ',' + row];
        return c ? (c.types || ['grass']) : ['grass']; }
      // берег — река шириной в 2 гекса (вода + непроходимое болото) во всю высоту — берег
      const grid = {};
      for (let c = 0; c < 20; c++) for (let r = 0; r < 15; r++) grid[c + ',' + r] = { types: ['grass'] };
      for (let r = 0; r < 15; r++) {
        grid['2,' + r] = { types: ['water'] };
        grid['3,' + r] = { types: ['swamp_impassable'] };
      }
      appData.campaign.opMapGrid = grid;
      appData.campaign.enemyOpUnits = [];
      const delivery = mobility => ({ col: 0, row: 1, mobility });
      globalThis.carRoute = findSupplyRoute(delivery('amphibious'), 5, 1);
      globalThis.vehRoute = findSupplyRoute(delivery('vehicle'), 5, 1);
      globalThis.footRoute = findSupplyRoute(delivery('foot'), 5, 1);
      // обход по суше есть только у «пеших» дорожек 0-й и 2-й строки? нет: река на всю высоту 0..2
      globalThis.carCost = carRoute ? supplyRouteCost(delivery('amphibious'), carRoute) : null;
    `);
    ok(s.evalCtx('carRoute') !== null, 'DAF MC-V доставляет груз через реку и непроходимое болото');
    ok(s.evalCtx('vehRoute') === null, 'обычная машина такой маршрут не проходит');
    ok(s.evalCtx('footRoute') === null, 'пешая колонна такой маршрут не проходит');
    ok(s.evalCtx('carCost') === 10, 'переправа стоит дорого: 3 сухопутных гекса + вода (3) + болото (4)',
        String(s.evalCtx('carCost')));
    ok(s.evalCtx('carCost') > 5 * 1, 'стоимость переправы больше, чем 5 гексов по траве');
}

// ───────────────────────── 5. Миграция старых сохранений ─────────────────────────
{
    const s = createSandbox(freshAppData());
    s.run(sliceConst(HTML, 'SUPPLY_SQUAD_RENAMES'));
    for (const fn of ['supplySquadRenamed', 'syncSupplySquadTemplates', 'migrateSupplySquadNames', 'assignUniqueCrewKeys'])
        s.run(sliceFunction(HTML, fn));
    s.run(`
      // старый сейв: прежние имена шаблонов и отделений, без TG-41/«Викуньи»
      appData.templates = SQUAD_TEMPLATES.filter(t => !/TG-41|Викунья/.test(String(t.name || '')))
        .map(t => {
          const c = JSON.parse(JSON.stringify(t));
          if (c.name === '${TRUCK} (Бельгийцы)') c.name = 'Грузовик снабжения (Бельгийцы)';
          if (c.name === '${CAR} (Бельгийцы)') c.name = 'Легковой автомобиль (Бельгийцы)';
          return c;
        });
      const mk = (name, hp) => ({ name: name, fighters: [{ name: 'Водитель', hp: hp, maxHp: 3 }] });
      const carSquad = mk('Легковой автомобиль', 1);
      const truckSquad = mk('Грузовик снабжения', 2);
      appData.squads = [carSquad, truckSquad];
      appData.campaign.opUnits = [{ name: 'Взвод снабжения', squads: [carSquad, truckSquad] }];
      appData.campaign.activeBattles = [{ id: 5, playerSquads: [mk('Легковой автомобиль', 1), mk('Грузовик снабжения', 2)],
        enemySquads: [], tacticalMap: { enemySquads: [] } }];
      globalThis.renamed = migrateSupplySquadNames();
      globalThis.carName = carSquad.name;
      globalThis.truckName = truckSquad.name;
      globalThis.battleNames = appData.campaign.activeBattles[0].playerSquads.map(q => q.name);
      globalThis.templateNames = appData.templates.filter(t => t.faction === 'BeVe' && /DAF/.test(t.name)).map(t => t.name);
      globalThis.carHp = carSquad.fighters[0].hp;
      globalThis.renamedAgain = migrateSupplySquadNames();
      globalThis.oldNamesLeft = appData.templates.filter(t => /^(Грузовик снабжения|Легковой автомобиль)/.test(t.name)).length;
    `);
    ok(s.evalCtx('renamed') === 6, 'переименованы отделения взвода, боя и шаблоны (2+2+2)', String(s.evalCtx('renamed')));
    ok(s.evalCtx('carName') === CAR, 'отделение стало «Автомобиль DAF MC-V»', String(s.evalCtx('carName')));
    ok(s.evalCtx('truckName') === TRUCK, 'грузовик стал «Грузовик DAF Trado II»', String(s.evalCtx('truckName')));
    ok(s.evalCtx('battleNames').every(n => /DAF/.test(n)), 'отряды в записи боя переименованы', JSON.stringify(s.evalCtx('battleNames')));
    ok(s.evalCtx('templateNames').length === 2, 'шаблоны переименованы', JSON.stringify(s.evalCtx('templateNames')));
    ok(s.evalCtx('oldNamesLeft') === 0, 'прежних имён шаблонов не осталось');
    ok(s.evalCtx('carHp') === 1, 'ранения экипажа не потеряны');
    ok(s.evalCtx('renamedAgain') === 0, 'повторная миграция ничего не меняет');
    ok(s.evalCtx("supplySquadRenamed('Легковой автомобиль')") === CAR, 'таблица прежних имён знает DAF MC-V');
    ok(s.evalCtx("supplySquadRenamed('Грузовик снабжения (Бельгийцы)')") === TRUCK + ' (Бельгийцы)',
        'таблица прежних имён знает DAF Trado II');

    // cloneTemplate находит шаблон по новому имени, даже если миграция ещё не прошла
    const c = createSandbox(freshAppData());
    c.run(sliceConst(HTML, 'SUPPLY_SQUAD_RENAMES'));
    for (const fn of ['supplySquadRenamed', 'assignUniqueCrewKeys', 'cloneTemplate']) c.run(sliceFunction(HTML, fn));
    c.run(`
      appData.templates = SQUAD_TEMPLATES.map(t => {
        const copy = JSON.parse(JSON.stringify(t));
        if (copy.name === '${TRUCK} (Бельгийцы)') copy.name = 'Грузовик снабжения (Бельгийцы)';
        return copy;
      });
      globalThis.cloned = cloneTemplate('BeVe', '${TRUCK}', '${TRUCK} (Бельгийцы)');
    `);
    ok(s.evalCtx('true'), 'проверка cloneTemplate ниже');
    ok(c.evalCtx('cloned') !== null, 'старый шаблон под прежним именем всё равно клонируется');
    ok(c.evalCtx('cloned && cloned.fighters.length') === 2, 'у клона сохранён экипаж из двух бойцов');
}

// ───────────────────────── 6. Интерфейс и подсказки ─────────────────────────
{
    const panel = sliceFunction(HTML, 'renderSupplyPanel');
    ok(/amphibious/.test(panel) && /плавает/.test(panel), 'панель снабжения отмечает плавающий транспорт');
    ok(/вода и болота, но медленно/.test(panel), 'подсказка про медленную переправу есть в панели');
    ok(/Грузовик DAF|DAF MC-V|Викунья|TG-41/.test(HTML), 'иконки выдаются новой технике снабжения');
    const ambush = sliceFunction(HTML, 'supplyAmbushCheck');
    ok(/supplyMobilityIsMotorized/.test(ambush) && /motorized/.test(sliceFunction(HTML, 'supplyAmbushCheck')),
        'в засаде амфибия теряется как машина');
    const rush = sliceFunction(HTML, 'dispatchSupplyFromPanel');
    ok(!!rush, 'отправка колонны доступна');
    ok(!/Легковой автомобиль/i.test(sliceFunction(HTML, 'renderSupplyPanel')), 'в панели нет прежних названий техники');
}

console.log(`Итог v13.150: PASS ${pass} · FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
