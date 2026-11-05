'use strict';
// ⚡ v13.159: переработка самокатной роты BeVe — отдельный «Мотоциклетный взвод №4».
//
//   Требование игрока:
//     • мотоциклетные пулемётные №1–3 и мотоциклетные миномётные №1–3 вывести из
//       самокатных взводов 1–3 в отдельный Мотоциклетный взвод №4;
//     • скорость взвода: 4 гекса по дороге / 2 по траве и кустам / 1 по лесу;
//     • взвод может спешиться и ходить со скоростью пехоты;
//     • на взвод можно применять карточки;
//     • иконка взвода — images/BeVe/Мотоциклетный взвод BeVe №4.png.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction: extractFn, sliceConst: extractConst, HTML } = require('./extract');
const ROOT = path.join(__dirname, '..');

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}

// песочница с функциями сборки батальона и миграциями
const FNS = [
    'generateBattalion', 'cloneTemplate', 'getPresetSignature', 'assignUniqueCrewKeys',
    'isBicyclePlatoonPreset', 'isMotorcyclePlatoonPreset', 'motorcyclePresetPlatoon',
    'syncReconPlatoonTemplates', 'syncReconPlatoonSquads', 'isBattalionHqUnit', 'pruneOpUnitRiders', 'opHqReconSquadSpecs', 'opHqReconSquadMatches',
    'getOpMoveCost', 'getOpPlannedMoveCost', 'getOpHexTypes', 'isHexInPlayableArea',
    'isCardSelectableOpUnit', 'unitCanExecuteOrderType', 'executeDismountOrder', 'executeRemountOrder',
    'setOperationalBicyclePark', 'operationalBicycleParkCell', 'operationalBicycleUnitSide',
    'isBicycleTacticalSquad', 'isMotorcycleTacticalSquad', 'tacticalApplyOperationalMobilityToBattleSquad',
    'operationalBicycleParkBelongsTo', 'removeOperationalBicyclePark', 'operationalBicycleParkOwners',
    'tacticalIsHeadquartersSquad', 'findUnitStaffSquad'
];
const CONSTS = ['RECON_PLATOON_SQUAD_TEMPLATES', 'MOTORCYCLE_SQUAD_RE', 'MOTORCYCLE_RIDER_RE', 'OP_HQ_RECON_SQUADS', 'ORDER_TYPES'];
function loadHelpers() {
    const parts = CONSTS.map(c => { try { return extractConst(HTML, c); } catch (e) { return ''; } });
    FNS.forEach(f => { try { parts.push(extractFn(HTML, f)); } catch (e) {} });
    fs.writeFileSync('/tmp/wg_part.js', parts.join('\n\n'));
}
loadHelpers();

function makeSandbox(extra) {
    const ad = freshAppData();
    Object.assign(ad.campaign, extra || {});
    const s = createSandbox(ad);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    return s;
}

// оперативная карта с разной местностью вокруг гекса 0,1
const GRID = {
    '0,1': { types: ['grass'], markers: [] },
    '1,1': { types: ['road'], markers: [] },
    '2,1': { types: ['grass'], markers: [] },
    '3,1': { types: ['bushes'], markers: [] },
    '4,1': { types: ['forest'], markers: [] },
    '5,1': { types: ['hill'], markers: [] },
    '6,1': { types: ['trenches'], markers: [] }
};

console.log('== v13.159: мотоциклетный взвод №4 ==');

// ───────────── 1. состав роты ─────────────
{
    const s = makeSandbox();
    const platoons = s.evalCtx(`BATTALION_PRESETS['BeVe'].standard
        .filter(u => u.type === 'infantry_company' && /самокат/i.test(u.name))
        .flatMap(u => u.platoons)`);
    ok(platoons.length === 4, 'в самокатной роте четыре взвода', platoons.length);
    ok(platoons.slice(0, 3).every(pl => pl.mobilityType === 'bicycle'),
        'первые три — по-прежнему самокатные');
    const moto = platoons[3];
    ok(moto && /Мотоциклетный взвод №4/.test(moto.name), 'четвёртый — Мотоциклетный взвод №4', moto && moto.name);
    ok(moto && moto.mobilityType === 'motorcycle', 'мобильность взвода — motorcycle', moto && moto.mobilityType);
    ok(moto && moto.icon === 'images/BeVe/Мотоциклетный взвод BeVe №4.png', 'иконка взвода из репозитория', moto && moto.icon);
    ok(fs.existsSync(path.join(ROOT, 'images/BeVe/Мотоциклетный взвод BeVe №4.png')), 'файл иконки существует');

    const names = (moto && moto.squads || []).map(sq => sq.name);
    ok(names.filter(n => /Мотоциклетный Пулеметный расчёт/.test(n)).length === 3, 'три пулемётных расчёта');
    ok(names.filter(n => /Мотоциклетный миномётный расчёт/.test(n)).length === 3, 'три миномётных расчёта');
    ok(names.some(n => /^Штаб взвода/.test(n)), 'штаб взвода в составе (карточки/связь/отход)');

    platoons.slice(0, 3).forEach(pl => {
        const n = pl.squads.map(sq => sq.name);
        ok(!n.some(x => /Мотоциклетный Пулеметный|Мотоциклетный миномётный/.test(x)),
            `${pl.name}: мотоциклетных расчётов нет`, n.join(' | '));
        ok(n.some(x => /Самокатное отделение/.test(x)), `${pl.name}: самокатные отделения на месте`);
        ok(n.some(x => /^Штаб взвода/.test(x)), `${pl.name}: свой штаб взвода остался`);
    });
    // остальные роты не тронуты
    const other = s.evalCtx(`BATTALION_PRESETS['BeVe'].standard
        .filter(u => u.type === 'infantry_company' && !/самокат/i.test(u.name))
        .flatMap(u => u.platoons).filter(pl => pl.mobilityType === 'motorcycle')`);
    ok(other.length === 0, 'в бельгийских и голландских ротах мотоциклетных взводов нет');
}

// ───────────── 2. шаблон штаба взвода ─────────────
{
    const s = makeSandbox();
    const tpl = s.evalCtx(`SQUAD_TEMPLATES.find(t => t.name === 'Штаб взвода №4 Мотоциклетный')`);
    ok(!!tpl, 'шаблон «Штаб взвода №4 Мотоциклетный» существует');
    ok(tpl && tpl.faction === 'BeVe', 'шаблон BeVe');
    ok(tpl && tpl.fighters.length === 4 && tpl.fighters.some(f => f.isCommander),
        '4 бойца, есть командир (как у штабов самокатных взводов)');
    ok(tpl && tpl.icon === 'images/BeVe/Мотоциклетный взвод BeVe №4.png', 'иконка штаба — иконка взвода');
}

// ───────────── 3. скорость: 4 / 2 / 1 гексов ─────────────
{
    const s = makeSandbox({ opMapGrid: GRID });
    const unit = { name: 'Мотоциклетный взвод №4', type: 'motorcycle_platoon', mobility: 'motorcycle', maxAp: 4 };
    const cost = (col) => s.evalCtx(`getOpMoveCost(${JSON.stringify(unit)}, 0, 1, ${col}, 1)`);
    ok(cost(1) === 1, 'дорога: 1 ОД за гекс → 4 гекса за ход', cost(1));
    ok(cost(2) === 2, 'трава: 2 ОД за гекс → 2 гекса', cost(2));
    ok(cost(3) === 2, 'кусты: 2 ОД за гекс → 2 гекса', cost(3));
    ok(cost(4) === 4, 'лес: 4 ОД за гекс → 1 гекс', cost(4));
    ok(cost(5) === Infinity, 'холм непроходим', cost(5));
    const hexes = (col) => Math.floor(4 / cost(col));
    ok(hexes(1) === 4 && hexes(2) === 2 && hexes(3) === 2 && hexes(4) === 1,
        'за 4 ОД: 4 / 2 / 2 / 1 гексов', `${hexes(1)}/${hexes(2)}/${hexes(3)}/${hexes(4)}`);

    // велосипедный взвод не изменился
    const bike = { name: '1-й самокатный взвод', type: 'bicycle_platoon', mobility: 'bicycle', maxAp: 4 };
    ok(s.evalCtx(`getOpMoveCost(${JSON.stringify(bike)}, 0, 1, 4, 1)`) === 2,
        'самокатный взвод по лесу — по-прежнему 2 ОД за гекс');
}

// ───────────── 4. спешивание и пешая скорость ─────────────
{
    const s = makeSandbox({ opMapGrid: GRID });
    s.run(`globalThis.moto = { name: 'Мотоциклетный взвод №4', type: 'motorcycle_platoon',
        mobility: 'motorcycle', maxAp: 4, col: 0, row: 1, ap: 4, squads: [
            { name: 'Мотоциклетный Пулеметный расчёт №1', mobilityType: 'motorcycle' },
            { name: 'Мотоциклетный миномётный расчёт №1', mobilityType: 'motorcycle' }
        ] };`);
    ok(s.evalCtx("unitCanExecuteOrderType(moto, 'dismount')") === true,
        'взвод может получить приказ «спешиться»');
    s.run('globalThis.order = { status: "active" }; executeDismountOrder(moto, order);');
    ok(s.evalCtx('moto.dismounted') === true, 'после приказа взвод спешен');
    ok(s.evalCtx('moto.mobility') === 'foot', 'мобильность стала пешей', s.evalCtx('moto.mobility'));
    ok(s.evalCtx('moto.dismountedFromMobility') === 'motorcycle', 'запомнено, с чего спешились');
    ok(s.evalCtx('moto.squads.every(sq => sq.dismounted === true)'), 'отделения тоже спешены');
    ok(s.evalCtx("(appData.campaign.opMapGrid['0,1'].markers || []).indexOf('bicyclePark') >= 0"),
        'на гексе оставлена стоянка мотоциклов');
    // пешая скорость: 2 ОД за гекс, лес проходим, дорога 2 (пехота по дороге — 2 ОД)
    ok(s.evalCtx('getOpMoveCost(moto, 0, 1, 4, 1)') === 2, 'спешенный: лес — 2 ОД за гекс (как пехота)');
    ok(s.evalCtx('getOpMoveCost(moto, 0, 1, 5, 1)') === 3, 'спешенный: холм доступен (3 ОД)');
    ok(s.evalCtx("unitCanExecuteOrderType(moto, 'remount')") === true, 'и снова сесть на мотоциклы');
    s.run('globalThis.order2 = { status: "active" }; executeRemountOrder(moto, order2);');
    ok(s.evalCtx("moto.mobility") === 'motorcycle' && s.evalCtx('moto.dismounted') === false,
        'после посадки снова мотоциклетный');
    ok(s.evalCtx('getOpMoveCost(moto, 0, 1, 4, 1)') === 4, 'и снова лес — 4 ОД');
}

// ───────────── 5. карточки применимы ─────────────
{
    const s = makeSandbox();
    s.run(`globalThis.motoUnit = { name: 'Мотоциклетный взвод №4', type: 'motorcycle_platoon',
        mobility: 'motorcycle', squads: [
            { name: 'Мотоциклетный Пулеметный расчёт №1', fighters: [{ hp: 3 }] },
            { name: 'Штаб взвода №4 Мотоциклетный', fighters: [{ hp: 3, isCommander: true }] }
        ] };`);
    ok(s.evalCtx('isCardSelectableOpUnit(motoUnit)') === true, 'карточки на взвод применяются');
    ok(s.evalCtx('isCardSelectableOpUnit({ name: "x", type: "bicycle_platoon", squads: moteSquads })'.replace('moteSquads', 'motoUnit.squads')),
        'и на самокатный взвод — как раньше');
    // мёртвый взвод карточек не получает
    s.run('globalThis.deadUnit = JSON.parse(JSON.stringify(motoUnit)); deadUnit.squads.forEach(sq => sq.fighters.forEach(f => f.hp = 0));');
    ok(s.evalCtx('isCardSelectableOpUnit(deadUnit)') === false, 'уничтоженный взвод карточек не получает');
}

// ───────────── 6. в тактическом бою ─────────────
{
    const s = makeSandbox();
    s.run(`globalThis.opUnit = { name: 'Мотоциклетный взвод №4', type: 'motorcycle_platoon', mobility: 'motorcycle', dismounted: false };
        globalThis.battleSquad = { name: 'Мотоциклетный миномётный расчёт №1', mobilityType: 'motorcycle' };
        globalThis.mgSquad = { name: 'Мотоциклетный Пулеметный расчёт №1', mobilityType: 'motorcycle' };
        globalThis.hqSquad = { name: 'Штаб взвода №4 Мотоциклетный' };`);
    s.run('tacticalApplyOperationalMobilityToBattleSquad(battleSquad, opUnit); tacticalApplyOperationalMobilityToBattleSquad(mgSquad, opUnit);');
    ok(s.evalCtx('battleSquad.mobilityType') === 'motorcycle', 'в бою расчёт считается мотоциклетным');
    // (sandbox подменяет tacticalActionAllowed заглушкой, поэтому проверяем правило в коде)
    const allowed = extractFn(HTML, 'tacticalActionAllowed');
    ok(/isMotorcycleTacticalSquad\(squad\)/.test(allowed) &&
        /attack', 'shoot', 'melee/.test(allowed),
        'верхом стрелять нельзя — правило спешивания действует и на мотоциклы');
    ok(/"Мотоциклетный/.test(allowed) || /Мотоциклетный \(самокатный\)/.test(allowed),
        'сообщение об ошибке говорит про мотоциклетный отряд');
    ok(s.evalCtx('tacticalIsHeadquartersSquad(hqSquad)') === true, 'штаб взвода распознан (карточки/отход)');
    ok(s.evalCtx("findUnitStaffSquad({ type: 'motorcycle_platoon', squads: [ { name: 'Мотоциклетный Пулеметный расчёт №1' }, hqSquad ] }).name") === 'Штаб взвода №4 Мотоциклетный',
        'штабное отделение находится и для связистов');
    s.run('opUnit.dismounted = true; tacticalApplyOperationalMobilityToBattleSquad(battleSquad, opUnit);');
    ok(s.evalCtx('battleSquad.dismounted') === true, 'спешивание в оперативке переходит в бой');
}

// ───────────── 7. миграция старого похода ─────────────
{
    const s = makeSandbox();
    // сейв v13.158: расчёты в самокатных взводах, мотоциклетного взвода нет
    s.run(`globalThis.oldBat = generateBattalion('BeVe', []);
        oldBat.units.forEach(u => {
            if (!Array.isArray(u.platoons)) return;
            u.platoons = u.platoons.filter(pl => pl.mobilityType !== 'motorcycle' && !/мотоцикл/i.test(pl.name || ''));
            u.platoons.forEach(pl => {
                if (pl.mobilityType !== 'bicycle') return;
                const n = (pl.name.match(/№\\s*(\\d+)/) || [])[1] || '1';
                pl.squads = pl.squads.filter(sq => !/Мотоцикл/.test(sq.name));
                pl.squads.push({ name: 'Мотоциклетный Пулеметный расчёт №' + n, templateName: 'Мотоциклетный Пулеметный расчёт №' + n, fighters: [{ hp: 2 }] });
                pl.squads.push({ name: 'Мотоциклетный миномётный расчёт №' + n, templateName: 'Мотоциклетный миномётный расчёт 50-мм №' + n });
                pl.squads.push({ name: 'Мотоциклист-разведчик', templateName: 'Мотоциклист-разведчик' });
                pl.squads.push({ name: 'Мотоциклист-посыльный', templateName: 'Мотоциклист-посыльный' });
            });
        });`);
    const motoPlatoons = `oldBat.units.flatMap(u => u.platoons || []).filter(pl => pl.mobilityType === 'motorcycle')`;
    ok(s.evalCtx(`${motoPlatoons}.length`) === 0, 'в старом сейве мотоциклетного взвода нет');
    s.run('globalThis.changed = syncReconPlatoonSquads(oldBat);');
    ok(s.evalCtx('changed') > 0, 'миграция сработала', s.evalCtx('changed'));
    ok(s.evalCtx(`${motoPlatoons}.length`) === 1, 'создан ровно один мотоциклетный взвод (в самокатной роте)');
    ok(s.evalCtx(`${motoPlatoons}[0].squads.length`) === 7,
        'в нём 7 отделений (штаб + 3 пулемётных + 3 миномётных)',
        s.evalCtx(`${motoPlatoons}[0].squads.map(sq => sq.name).join(' | ')`));
    ok(s.evalCtx(`oldBat.units.flatMap(u => u.platoons || []).filter(pl => pl.mobilityType === 'bicycle')
        .every(pl => !pl.squads.some(sq => /Мотоцикл/.test(sq.name)))`),
        'из самокатных взводов мотоциклетные отряды убраны');
    ok(s.evalCtx(`oldBat.units.flatMap(u => u.platoons || []).filter(pl => pl.mobilityType === 'bicycle')
        .reduce((n, pl) => n + pl.squads.length, 0)`) === 15,
        'у самокатных взводов осталось по 5 отделений (было 9)');
    ok(s.evalCtx(`${motoPlatoons}[0].squads.find(sq => /Мотоциклетный Пулеметный/.test(sq.name)).fighters[0].hp`) === 2,
        'состояние перенесённого расчёта сохранено');
    s.run('globalThis.changed2 = syncReconPlatoonSquads(oldBat);');
    ok(s.evalCtx('changed2') === 0, 'повторная миграция ничего не делает', s.evalCtx('changed2'));
    ok(s.evalCtx(`oldBat.units.flatMap(u => u.platoons || []).filter(pl => pl.mobilityType === 'motorcycle').length`) === 1,
        'дубликатов взвода не появилось');
}

// ───────────── 8. сборка оперативных юнитов ─────────────
{
    const FNS2 = [
        'buildOperationalUnits', 'getPresetSignature', 'getBattalionSignature',
        'generateBattalion', 'cloneTemplate', 'assignUniqueCrewKeys',
        'isBicyclePlatoonPreset', 'isMotorcyclePlatoonPreset', 'motorcyclePresetPlatoon',
        'syncReconPlatoonTemplates', 'syncReconPlatoonSquads', 'isBattalionHqUnit', 'pruneOpUnitRiders', 'opHqReconSquadSpecs', 'opHqReconSquadMatches',
        'syncSupplySquadTemplates', 'migrateSupplySquadNames', 'supplySquadRenamed', 'isStaticOpUnit',
        'createEnemyOperationalUnits'
    ];
    const consts = ['RECON_PLATOON_SQUAD_TEMPLATES', 'MOTORCYCLE_SQUAD_RE', 'MOTORCYCLE_RIDER_RE', 'OP_HQ_RECON_SQUADS', 'SUPPLY_VEHICLE_ICON_RULES', 'SUPPLY_SQUAD_RENAMES'];
    const src = consts.map(c => { try { return extractConst(HTML, c); } catch (e) { return ''; } })
        .concat(FNS2.map(f => extractFn(HTML, f))).join('\n\n');
    fs.writeFileSync('/tmp/wg_part.js', src);

    const ad = freshAppData();
    ad.campaign.playerFaction = 'BeVe';
    ad.campaign.battalions.player = { faction: 'BeVe', presetSig: 'v13.158', units: [] };
    ad.campaign.battalions.enemy = { faction: 'A.I.R.F.', presetSig: 'v13.158', units: [] };
    ad.campaign.opUnitsSignature = 'old';
    const s = createSandbox(ad);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    s.evalCtx('buildOperationalUnits()');
    const units = ad.campaign.opUnits || [];
    const moto = units.find(u => /Мотоциклетный взвод №4/.test(u.name || ''));
    ok(!!moto, 'в походе появился юнит «Мотоциклетный взвод №4»', units.map(u => u.name).join(', '));
    ok(moto && moto.type === 'motorcycle_platoon' && moto.mobility === 'motorcycle',
        'тип/мобильность юнита — мотоциклетные', moto && `${moto.type}/${moto.mobility}`);
    ok(moto && moto.icon === 'images/BeVe/Мотоциклетный взвод BeVe №4.png', 'иконка юнита — загруженный файл');
    const samokat = units.filter(u => /самокатный взвод/.test(u.name || ''));
    ok(samokat.length === 3, 'три самокатных взвода на месте', samokat.length);
    samokat.forEach(u => ok(!(u.squads || []).some(sq => /Мотоциклетный/.test(sq.name || '')),
        `${u.name}: мотоциклетных расчётов нет`, (u.squads || []).map(sq => sq.name).join(' | ')));
    // стартовый гекс задан в js/data.js → SCENARIO_START_POSITIONS (расстановка
    // выполняется отдельным шагом, здесь проверяем саму таблицу)
    const startHex = s.evalCtx("(SCENARIO_START_POSITIONS.valencia || {})['BeVe']?.['Мотоциклетный взвод №4'] || null");
    ok(startHex === '9,8', 'в стартовых позициях сценария задан гекс мотоциклетного взвода', startHex);
}

// ───────────── 9. схема оперативных юнитов ─────────────
{
    const src = extractFn(HTML, 'getBattalionSignature');
    ok(/OP_LAYOUT_VERSION = 6/.test(src), 'версия схемы поднята до 6 (старые сейвы пересоберутся)');
    ok(/presetSig|OP_LAYOUT_VERSION/.test(extractFn(HTML, 'buildOperationalUnits')),
        'сборка учитывает версию схемы');
}

console.log(`\nИтог v13.159 (мотоциклетный взвод №4): PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
