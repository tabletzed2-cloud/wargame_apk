'use strict';
// ⚡ v13.149: взвод снабжения A.I.R.F. — горный транспортёр TG-41 «Лама» и
//    «Легкий грузовик CLg-37 «Викунья»» вместо «лёгкого грузовика».
//    Проверяем состав взвода, шаблон (расчёт 2 бойца), грузоподъёмность
//    (в 1,5 раза больше ламы), проходимость (горы и холмы) и скорость,
//    а также миграцию старых сохранений (переименование + новый шаблон).
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
const DATA = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
const TMPL = fs.readFileSync(path.join(ROOT, 'js/templates.js'), 'utf8');

const TG41 = 'Горный транспортёр TG-41 «Лама»';
const VICUNA = 'Легкий грузовик CLg-37 «Викунья»';

// ───────────────────────── 1. Состав взвода снабжения ─────────────────────────
{
    const s = createSandbox(freshAppData());
    const presets = s.evalCtx('BATTALION_PRESETS');
    const airf = presets['A.I.R.F.'].standard.find(u => u && u.name === 'Взвод снабжения');
    const beve = presets['BeVe'].standard.find(u => u && u.name === 'Взвод снабжения');
    const airfNames = airf.squads.map(q => q.name);
    ok(airfNames.includes(TG41), 'A.I.R.F.: в взводе снабжения есть горный транспортёр TG-41 «Лама»', airfNames.join(' | '));
    ok(airfNames.includes(VICUNA), 'A.I.R.F.: легкий грузовик переименован в «Викунью»', airfNames.join(' | '));
    ok(!airfNames.some(n => /^Лёгкий грузовик$/.test(n) || n === 'Лёгкий грузовик'), 'прежнего «Лёгкого грузовика» в составе нет');
    ok(airf.squads.length === 10, 'A.I.R.F.: во взводе снабжения 10 отделений', String(airf.squads.length));
    ok(beve.squads.length === 11 && !beve.squads.some(q => q.name === TG41), 'BeVe: состав не тронут (11 отделений, без TG-41)');
    const tg = airf.squads.find(q => q.name === TG41);
    ok(tg && tg.templateName === TG41 + ' (A.I.R.F.)', 'у отделения TG-41 есть шаблон A.I.R.F.', tg && tg.templateName);

    // Шаблон транспортёра
    const templates = s.evalCtx('SQUAD_TEMPLATES');
    const tmpl = templates.find(t => t && t.name === TG41 + ' (A.I.R.F.)');
    ok(!!tmpl, 'шаблон TG-41 «Лама» (A.I.R.F.) существует');
    ok(tmpl && tmpl.faction === 'A.I.R.F.', 'шаблон принадлежит A.I.R.F.');
    ok(tmpl && tmpl.fighters.length === 2, 'расчёт транспортёра — 2 бойца', tmpl && String(tmpl.fighters.length));
    ok(tmpl && tmpl.fighters.every(f => /Пистолет|Винтовка/.test(f.weapon || '')), 'экипаж вооружён');
    ok(tmpl && !tmpl.fighters.some(f => f.isCommander), 'экипаж не командиры');
    ok(tmpl && tmpl.icon === 'images/AIRF/Взвод снабжения АИРФ №1.png', 'иконка отделения — иконка взвода снабжения A.I.R.F.');
    const weapons = s.evalCtx('AIRF_WEAPONS.map(w => w.name)');
    if (tmpl) ok(tmpl.fighters.every(f => weapons.includes(f.weapon)), 'оружие экипажа есть в каталоге A.I.R.F.', JSON.stringify(weapons.slice(0, 6)));

    // Переименованный грузовик
    const vicuna = templates.find(t => t && t.name === VICUNA + ' (A.I.R.F.)');
    ok(!!vicuna && vicuna.fighters.length === 2, 'шаблон «Викуньи» на месте (2 человека в кабине)');
    ok(!templates.some(t => t && t.name === 'Лёгкий грузовик (A.I.R.F.)'), 'старого имени шаблона больше нет');
}

// ───────────────────────── 2. Грузоподъёмность и проходимость ─────────────────────────
{
    const s = createSandbox(freshAppData());
    for (const n of ['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_CONVOY_BUDGET', 'SUPPLY_AMMO_PER_MAN', 'SUPPLY_GREN_PER_MAN'])
        s.run(sliceConst(HTML, n));
    for (const fn of ['supplyAssetIds', 'supplyAssetMobilityClass', 'supplyMobilityIsMotorized',
                      'supplyAssetsMobility', 'supplyMoveCost', 'supplyCargoOf', 'supplyAssetCounts'])
        s.run(sliceFunction(HTML, fn));
    s.run(`function isHexInPlayableArea(){ return true; }
      function getOpHexTypes(col, row){ const c = (appData.campaign.opMapGrid || {})[col + ',' + row]; return c ? (c.types || ['grass']) : ['grass']; }
      appData.campaign.opMapGrid = {};`);

    ok(s.evalCtx('SUPPLY_ORDER.includes("tg41")'), 'средство tg41 есть в порядке отображения');
    ok(s.evalCtx(`SUPPLY_ASSET_TYPES.tg41.name`) === TG41, 'название средства — «Горный транспортёр TG-41 «Лама»»');
    ok(s.evalCtx(`SUPPLY_ASSET_TYPES.tg41.mobility`) === 'halftrack', 'класс подвижности — полугусеничный вездеход');
    ok(s.evalCtx(`SUPPLY_ASSET_TYPES.tg41.mode`) === 'squads', 'в пуле считается целым отделением');
    ok(s.evalCtx(`SUPPLY_ASSET_TYPES.tg41.squadMatch.test(${JSON.stringify(TG41)})`), 'отделение TG-41 распознаётся как транспортёр');
    ok(s.evalCtx(`SUPPLY_ASSET_TYPES.truck.squadMatch.test(${JSON.stringify(VICUNA)})`), '«Викунья» по-прежнему считается грузовиком');
    ok(s.evalCtx(`SUPPLY_ASSET_TYPES.llama.squadMatch.test(${JSON.stringify(TG41)})`) === false, 'транспортёр не путается с ламами');

    const llama = s.evalCtx('SUPPLY_ASSET_TYPES.llama.cargo');
    const tg = s.evalCtx('SUPPLY_ASSET_TYPES.tg41.cargo');
    ok(tg.ammoSmall === llama.ammoSmall * 1.5, 'патронов в 1,5 раза больше ламы', `${tg.ammoSmall} vs ${llama.ammoSmall}`);
    ok(tg.grenades === llama.grenades * 1.5, 'гранат в 1,5 раза больше ламы', `${tg.grenades} vs ${llama.grenades}`);
    ok(s.evalCtx("supplyCargoOf([{id:'tg41',count:1}]).ammoSmall") === 90, 'один рейс транспортёра — 90 патронов');

    // Проходимость: горы и холмы, но вода и непроходимое болото закрыты.
    s.run(`appData.campaign.opMapGrid = {
      '1,1': { types: ['road'] }, '2,1': { types: ['grass'] }, '3,1': { types: ['hill'] },
      '4,1': { types: ['rocks'] }, '5,1': { types: ['forest'] }, '6,1': { types: ['water'] },
      '7,1': { types: ['swamp_impassable'] }, '8,1': { types: ['bushes'] } };`);
    const cost = (mob, key) => s.evalCtx(`supplyMoveCost('${mob}', ...'${key}'.split(',').map(Number))`);
    ok(cost('halftrack', '3,1') === 1, 'вездеход заезжает на холм', String(cost('halftrack', '3,1')));
    ok(cost('halftrack', '4,1') === 1, 'вездеход заезжает на камни (горы)', String(cost('halftrack', '4,1')));
    ok(cost('foot', '3,1') === 1, 'пешие тоже проходят холм');
    ok(Number.isFinite(cost('vehicle', '3,1')) === false, 'машина на холм не заезжает');
    ok(cost('halftrack', '1,1') === 0.5 && cost('foot', '1,1') === 1,
        'по дороге вездеход идёт вдвое быстрее пеших', `${cost('halftrack', '1,1')} / ${cost('foot', '1,1')}`);
    ok(cost('halftrack', '2,1') === 0.5, 'по траве — тоже вдвое быстрее');
    ok(Number.isFinite(cost('halftrack', '5,1')), 'лес проходим (в отличие от машины)', String(cost('halftrack', '5,1')));
    ok(cost('halftrack', '6,1') === Infinity, 'вода непроходима');
    ok(cost('halftrack', '7,1') === Infinity, 'непроходимое болото закрыто');

    // Класс подвижности колонны
    ok(s.evalCtx("supplyAssetsMobility([{id:'tg41',count:1}])") === 'halftrack', 'колонна только из TG-41 идёт вездеходом');
    ok(s.evalCtx("supplyAssetsMobility([{id:'tg41',count:1},{id:'porter',count:2}])") === 'foot', 'смешанная колонна — пеший темп');
    ok(s.evalCtx("supplyAssetsMobility([{id:'truck',count:1}])") === 'vehicle', 'грузовик остался колёсным');
    ok(s.evalCtx("supplyMobilityIsMotorized('halftrack')") && s.evalCtx("supplyMobilityIsMotorized('vehicle')") &&
       !s.evalCtx("supplyMobilityIsMotorized('foot')"), 'вездеход считается моторизованным средством');
}

// ───────────────────────── 3. Маршрут и пул взвода ─────────────────────────
{
    const s = createSandbox(freshAppData());
    for (const n of ['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_CONVOY_BUDGET'])
        s.run(sliceConst(HTML, n));
    for (const fn of ['supplyAssetIds', 'supplyAssetCounts', 'supplyAssetMobilityClass', 'supplyMobilityIsMotorized',
                      'supplyAssetsMobility', 'supplyMoveCost', 'findSupplyRoute', 'supplyRouteCost',
                      'supplyStepToward', 'getOpHexNeighbors', 'operationalHexHasActiveBattle'])
        s.run(sliceFunction(HTML, fn));
    s.run(`
      function isHexInPlayableArea(){ return true; }
      function getOpHexTypes(col, row){ const c = (appData.campaign.opMapGrid || {})[col + ',' + row]; return c ? (c.types || ['grass']) : ['grass']; }
      // узкий коридор: единственный проход — через холм (2,2) и камни (2,3)
      const grid = {};
      for (let c = 0; c < 6; c++) for (let r = 0; r < 6; r++) grid[c + ',' + r] = { types: ['forest'] };
      ['0,1','1,1','2,1','2,2','2,3','2,4','3,4','4,4','5,4'].forEach(k => { grid[k] = { types: ['grass'] }; });
      grid['2,2'] = { types: ['hill'] };
      grid['2,3'] = { types: ['rocks'] };
      appData.campaign.opMapGrid = grid;
      appData.campaign.enemyOpUnits = [];
      const delivery = (mobility) => ({ col: 0, row: 1, mobility });
      globalThis.vehRoute = findSupplyRoute(delivery('vehicle'), 5, 4);
      globalThis.tgRoute = findSupplyRoute(delivery('halftrack'), 5, 4);
      globalThis.footRoute = findSupplyRoute(delivery('foot'), 5, 4);
      globalThis.tgCost = tgRoute ? supplyRouteCost(delivery('halftrack'), tgRoute) : null;
      // за ход вездеход проходит больше гексов, чем пешие
      const walk = delivery('halftrack'); supplyStepToward(walk, 5, 4);
      globalThis.tgSteps = { col: walk.col, row: walk.row };
      const walkFoot = delivery('foot'); supplyStepToward(walkFoot, 5, 4);
      globalThis.footSteps = { col: walkFoot.col, row: walkFoot.row };
    `);
    ok(s.evalCtx('vehRoute') === null, 'машина не проходит через горы');
    ok(s.evalCtx('footRoute') !== null, 'пешие проходят');
    ok(s.evalCtx('tgRoute') !== null, 'вездеход TG-41 проходит горным коридором');
    ok(s.evalCtx('tgCost') !== null && Number.isFinite(s.evalCtx('tgCost')), 'стоимость маршрута вездехода конечна', String(s.evalCtx('tgCost')));
    const tgSteps = s.evalCtx('tgSteps'), footSteps = s.evalCtx('footSteps');
    const steps = p => Math.max(Math.abs(p.col - 0), Math.abs(p.row - 1));
    ok(steps(tgSteps) > steps(footSteps), 'за ход вездеход проходит больше гексов, чем пешая колонна', `${JSON.stringify(tgSteps)} vs ${JSON.stringify(footSteps)}`);

    // Пул: TG-41 из отделения, «Викунья» — по-прежнему грузовик
    s.run(`
      function mk(name, fighters){ return { name: name, fighters: fighters }; }
      const hq = { name: 'Взвод снабжения', squads: [
        mk('Ламы с бойцами №1', [{hp:3},{hp:3},{hp:3},{hp:3}]),
        mk('${TG41}', [{hp:3},{hp:3}]),
        mk('${VICUNA}', [{hp:3},{hp:3}]),
        mk('Носильщики №1', [{hp:3},{hp:3}])
      ] };
      globalThis.pool = supplyAssetCounts(hq);
      const dead = { name: 'Взвод снабжения', squads: [ mk('${TG41}', [{hp:0},{hp:0}]) ] };
      globalThis.deadPool = supplyAssetCounts(dead);
    `);
    const pool = s.evalCtx('pool');
    ok(pool.tg41 === 1, 'в пуле один транспортёр TG-41', JSON.stringify(pool));
    ok(pool.truck === 1, '«Викунья» считается грузовиком', JSON.stringify(pool));
    ok(pool.llama === 4, 'ламы считаются по погонщикам', JSON.stringify(pool));
    ok(s.evalCtx('deadPool.tg41') === 0, 'погибший экипаж убирает транспортёр из пула');
}

// ───────────────────── 3b. Склад видит транспортёр в пуле средств ─────────────────────
{
    const s = createSandbox(freshAppData());
    for (const n of ['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_DEPOT_MAX'])
        s.run(sliceConst(HTML, n));
    for (const fn of ['supplyAssetIds', 'supplyAssetCounts', 'ensureSupplyState', 'getSupplyUnit',
                      'syncSupplyAssetsFromPlatoon', 'getSupplyDepotHex'])
        s.run(sliceFunction(HTML, fn));
    s.run(`
      appData.campaign.scenario = 'valencia';
      appData.campaign.opUnits = [{ name: 'Взвод снабжения', col: 3, row: 4, squads: [
        { name: 'Ламы с бойцами №1', fighters: [{hp:3},{hp:3}] },
        { name: '${TG41}', fighters: [{hp:3},{hp:3}] },
        { name: '${VICUNA}', fighters: [{hp:3},{hp:3}] }
      ] }];
      globalThis.st = ensureSupplyState();
      syncSupplyAssetsFromPlatoon();
      globalThis.pools = JSON.parse(JSON.stringify(appData.campaign.supply.assets));
      globalThis.depot = getSupplyDepotHex();
    `);
    const pools = s.evalCtx('pools');
    ok(pools.tg41 && pools.tg41.total === 1 && pools.tg41.available === 1,
        'склад видит один свободный TG-41', JSON.stringify(pools.tg41));
    ok(pools.truck && pools.truck.total === 1, '«Викунья» числится в пуле как грузовик', JSON.stringify(pools.truck));
    ok(s.evalCtx('depot').col === 3 && s.evalCtx('depot').row === 4, 'склад стоит на гексе взвода снабжения');
}

// ───────────────────────── 4. Миграция старых сохранений ─────────────────────────
{
    const s = createSandbox(freshAppData());
    s.run(sliceConst(HTML, 'SUPPLY_SQUAD_RENAMES'));
    for (const fn of ['supplySquadRenamed', 'syncSupplySquadTemplates', 'migrateSupplySquadNames', 'assignUniqueCrewKeys'])
        s.run(sliceFunction(HTML, fn));
    s.run(`
      // старый сейв: шаблонов TG-41/«Викуньи» ещё нет, отделение называется «Лёгкий грузовик»
      appData.templates = SQUAD_TEMPLATES.filter(t => !/TG-41|Викунья/.test(String(t.name || '')));
      globalThis.templatesBefore = appData.templates.filter(t => /TG-41|Викунья/.test(String(t.name || ''))).length;
      const oldTruck = JSON.parse(JSON.stringify(SQUAD_TEMPLATES.find(t => t.name === 'Конная повозка (A.I.R.F.)')));
      oldTruck.name = 'Лёгкий грузовик (A.I.R.F.)';
      appData.templates.push(oldTruck);
      const squad = { name: 'Лёгкий грузовик', fighters: [{ name: 'Водитель лёгкого грузовика', hp: 1, maxHp: 3 }], ammoSmall: 4 };
      appData.squads = [squad];
      appData.campaign.opUnits = [{ name: 'Взвод снабжения', squads: [squad] }];
      appData.campaign.activeBattles = [{ id: 9, playerSquads: [JSON.parse(JSON.stringify(squad))], enemySquads: [], tacticalMap: { enemySquads: [] } }];
      globalThis.addedTemplates = syncSupplySquadTemplates();
      globalThis.renamed = migrateSupplySquadNames();
      globalThis.squadNameAfter = squad.name;
      globalThis.templateNamesAfter = appData.templates.filter(t => /TG-41|Викунья/.test(String(t.name || ''))).map(t => t.name);
      globalThis.battleSquadName = appData.campaign.activeBattles[0].playerSquads[0].name;
      globalThis.oldKept = squad.fighters[0].hp;
      globalThis.aliasMain = supplySquadRenamed('Лёгкий грузовик');
      globalThis.aliasTemplate = supplySquadRenamed('Лёгкий грузовик (A.I.R.F.)');
      globalThis.newNameStable = supplySquadRenamed('${VICUNA}');
      // повторная миграция ничего не меняет
      globalThis.renamedTwice = migrateSupplySquadNames();
      globalThis.addedTwice = syncSupplySquadTemplates();
    `);
    ok(s.evalCtx('templatesBefore') === 0, 'в старом сейве новых шаблонов не было');
    ok(s.evalCtx('addedTemplates') === 2, 'добавлены оба шаблона (TG-41 и «Викунья»)', String(s.evalCtx('addedTemplates')));
    ok(s.evalCtx('renamed') === 3, 'переименованы отделения: взвод, бой и шаблон', String(s.evalCtx('renamed')));
    ok(s.evalCtx('squadNameAfter') === VICUNA, 'отделение взвода получило новое имя', String(s.evalCtx('squadNameAfter')));
    ok(s.evalCtx('battleSquadName') === VICUNA, 'отряд в записи боя тоже переименован', String(s.evalCtx('battleSquadName')));
    ok(s.evalCtx('templateNamesAfter').includes(TG41 + ' (A.I.R.F.)'), 'шаблон TG-41 доступен в старом сейве');
    ok(s.evalCtx('oldKept') === 1, 'состояние отделения (ранения) не потеряно');
    ok(s.evalCtx('aliasMain') === VICUNA && s.evalCtx('aliasTemplate') === VICUNA + ' (A.I.R.F.)',
        'прежние имена ведут к «Викунье»');
    ok(s.evalCtx('newNameStable') === VICUNA, 'новое имя повторно не переименовывается');
    ok(s.evalCtx('renamedTwice') === 0 && s.evalCtx('addedTwice') === 0, 'повторная миграция ничего не делает');
    ok(sliceFunction(HTML, 'buildOperationalUnits').includes('syncSupplySquadTemplates'),
        'пересборка батальона подтягивает шаблоны новых отделений');
    ok(HTML.includes('oldByName.set(alias, s)'), 'состояние отделения переносится по прежнему имени');
    ok(sliceFunction(HTML, 'migrateHQPersonnelOnLoad').includes('migrateSupplySquadNames'),
        'миграция запускается при загрузке кампании');
}

// ───────────────────────── 5. Подписи интерфейса ─────────────────────────
{
    const panel = sliceFunction(HTML, 'renderSupplyPanel');
    ok(/halftrack/.test(panel) && /горы и холмы/.test(panel), 'панель снабжения показывает проходимость вездехода');
    ok(/горный вездеход/.test(panel), 'колонна в пути подписана как горный вездеход');
    ok(/Л\[её\]гкий грузовик|Викунья/.test(HTML), 'иконка выдаётся и переименованному грузовику');
    ok(/TG-41/.test(HTML), 'иконка выдаётся транспортёру TG-41');
    const ambush = sliceFunction(HTML, 'supplyAmbushCheck');
    ok(ambush.includes('supplyMobilityIsMotorized'), 'в засаде вездеход теряется как машина (целиком)');
}

console.log(`Итог v13.149: PASS ${pass} · FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
