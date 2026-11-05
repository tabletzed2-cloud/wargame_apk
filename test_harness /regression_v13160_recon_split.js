'use strict';
// ⚡ v13.160: развед. взвод A.I.R.F. делится на отделения (и собирается обратно),
//   карточки остаются общими; мотоциклисты — только при штабе батальона;
//   лишних бронеавтомобилей нет (Landsverk — обычные отдельные юниты).
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction: extractFn, sliceConst: extractConst, HTML } = require('./extract');
const ROOT = path.join(__dirname, '..');
const RECON_SRC = fs.readFileSync(path.join(ROOT, 'js/recon.js'), 'utf8');

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}

const FNS = [
    'splitReconPlatoon', 'mergeReconPlatoonParts', 'syncSplitPlatoonCards', 'reconSplitRecords',
    'isReconPlatoonUnit', 'isReconPlatoonPart', 'reapplyReconPlatoonSplits',
    'pruneExtraArmoredCars', 'armoredCarPresetNames', 'cloneJsonSafe',
    'operationalRadioSnapshot', 'operationalRadioRestore',
    'splitReconPlatoonByIndex', 'mergeReconPlatoonByIndex', 'afterOpUnitStructureChange',
    'syncReconPlatoonSquads', 'isBattalionHqUnit', 'pruneOpUnitRiders', 'opHqReconSquadSpecs', 'opHqReconSquadMatches', 'syncReconPlatoonTemplates', 'isBicyclePlatoonPreset',
    'isMotorcyclePlatoonPreset', 'motorcyclePresetPlatoon',
    'generateBattalion', 'cloneTemplate', 'getPresetSignature', 'getBattalionSignature', 'assignUniqueCrewKeys',
    'buildOperationalUnits', 'syncSupplySquadTemplates', 'migrateSupplySquadNames',
    'supplySquadRenamed', 'isStaticOpUnit', 'createEnemyOperationalUnits'
];
const CONSTS = [
    'RECON_PLATOON_SQUAD_TEMPLATES', 'MOTORCYCLE_SQUAD_RE', 'MOTORCYCLE_RIDER_RE', 'OP_HQ_RECON_SQUADS',
    'SUPPLY_VEHICLE_ICON_RULES', 'SUPPLY_SQUAD_RENAMES'
];
function loadPart() {
    const parts = CONSTS.map(c => { try { return extractConst(HTML, c); } catch (e) { return ''; } });
    FNS.forEach(f => { try { parts.push(extractFn(HTML, f)); } catch (e) {} });
    fs.writeFileSync('/tmp/wg_part.js', parts.join('\n\n'));
}
loadPart();

function makeSandbox(prepare) {
    const ad = freshAppData();
    ad.campaign.hardMode = undefined;
    const s = createSandbox(ad);
    s.run(RECON_SRC);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    s.run('if (!hardMode.signalPlatoon) hardMode.signalPlatoon = { radios: { assigned: [] } };');
    if (prepare) prepare(s, ad);
    return { s, ad };
}

const GRID = {
    '3,5': { types: ['grass'], markers: [] },
    '4,5': { types: ['grass'], markers: [] },
    '4,6': { types: ['road'], markers: [] },
    '5,5': { types: ['grass'], markers: [] },
    '6,5': { types: ['bushes'], markers: [] },
    '5,6': { types: ['forest'], markers: [] }
};

// оперативный развед. взвод A.I.R.F. (как его создаёт buildOperationalUnits)
function reconPlatoonSandbox() {
    return makeSandbox((s, ad) => {
        ad.campaign.playerFaction = 'A.I.R.F.';
        ad.campaign.opMapGrid = JSON.parse(JSON.stringify(GRID));
        s.run(`globalThis.platoon = {
            name: 'Развед. взвод', type: 'recon_platoon', col: 4, row: 5, side: 'player',
            ap: 3, maxAp: 4, mobility: 'foot', dismounted: false, faction: 'A.I.R.F.',
            icon: 'images/развед аирф.png', detected: false, operationalMorale: 82,
            squads: [
                { name: 'Развед. отделение №1', fighters: [{ hp: 3 }, { hp: 2 }] },
                { name: 'Развед. отделение №2', fighters: [{ hp: 3 }, { hp: 3 }] },
                { name: 'Штаб развед. взвода', fighters: [{ hp: 3, isCommander: true }] }
            ],
            cardSelection: { version: 1, done: true, cards: [{ name: 'Разведка боем', type: 'bonus' }], targets: {} }
        };
        appData.campaign.opUnits = [platoon];
        appData.campaign.enemyOpUnits = [{ name: 'Враг 1', col: 6, row: 5, type: 'infantry_platoon' }];
        initReconAssets();`);
    });
}

console.log('== v13.160: развед. взвод, мотоциклисты, бронеавтомобили ==');

// ───────────── 1. деление на отделения ─────────────
{
    const { s, ad } = reconPlatoonSandbox();
    ok(s.evalCtx('isReconPlatoonUnit(platoon)') === true, 'взвод распознан как делимый');
    const parts = s.evalCtx('splitReconPlatoon(platoon)');
    ok(parts === 3, 'взвод разделён на три отделения', parts);
    const units = ad.campaign.opUnits || [];
    ok(units.length === 3, 'на карте три отдельных юнита', units.map(u => u.name).join(', '));
    ok(units.every(u => u.splitPlatoonName === 'Развед. взвод'), 'у каждого записан родительский взвод');
    ok(JSON.stringify(units.map(u => u.name)) === JSON.stringify([
        'Развед. отделение №1', 'Развед. отделение №2', 'Штаб развед. взвода'
    ]), 'названия — по отделениям', units.map(u => u.name).join(', '));
    ok(units.every(u => u.squads.length === 1), 'в каждом юните по одному отделению');
    ok(units.every(u => u.col === 4 && u.row === 5), 'все начинают на гексе взвода (4,5)');
    ok(units.every(u => u.ap === 3 && u.maxAp === 4), 'ОД перенесены');
    ok(units.every(u => u.operationalMorale === 82), 'дух перенесён');
    ok(units.every(u => u.cardSelection && u.cardSelection.cards.length === 1),
        'выбор карточек скопирован на каждое отделение');
    // отделения можно двигать по одному
    s.run('appData.campaign.opUnits[0].col = 3; appData.campaign.opUnits[0].row = 5;');
    ok(ad.campaign.opUnits[1].col === 4, 'отделения двигаются независимо');

    // разведка: два боевых отделения = два актива, штаб активом не является
    s.run('initReconAssets();');
    ok(s.evalCtx('appData.campaign.reconAssets.airf_recon_platoon.total') === 2,
        'развед-активов стало два (по числу развед. отделений)', s.evalCtx('appData.campaign.reconAssets.airf_recon_platoon.total'));
    const sources = s.evalCtx('JSON.stringify(reconListAssetSources().filter(x => x.assetKey === "airf_recon_platoon").map(x => x.name))');
    ok(!/Штаб развед/.test(sources), 'штаб развед. взвода в активы не попал', sources);
    ok(s.evalCtx('isReconPlatoonPart ? true : true') === true, 'модуль собран');

    // создание миссии на конкретное отделение
    s.run(`globalThis.mission = createReconMission({ assetKey: 'airf_recon_platoon',
        unitId: appData.campaign.opUnits.indexOf(appData.campaign.opUnits.find(u => u.name === 'Развед. отделение №2')),
        route: [{ col: 5, row: 5 }], observeMode: 'pass', reportMethod: 'radio' });`);
    ok(s.evalCtx('!!mission && mission.status === "active"'), 'миссия создана для конкретного отделения');
    // отделение — самостоятельный юнит: его миссия двигает только его
    s.run('moveReconAsset(mission, { col: 5, row: 5 });');
    ok(ad.campaign.opUnits[1].col === 5 && ad.campaign.opUnits[1].row === 5,
        'отделение-актив доехало до целевого гекса (5,5)',
        `${ad.campaign.opUnits[1].col},${ad.campaign.opUnits[1].row}`);
    ok(ad.campaign.opUnits[0].col === 3 && ad.campaign.opUnits[2].col === 4,
        'соседние отделения миссия не сдвинула');
}

// ───────────── 2. карточки общие для всех отделений ─────────────
{
    const { s, ad } = reconPlatoonSandbox();
    s.run('splitReconPlatoon(platoon);');
    // выбираем карточки на первом отделении — они должны появиться у остальных
    s.run(`appData.campaign.opUnits[0].cardSelection = { version: 1, done: true,
        cards: [{ name: 'Точный огонь', type: 'bonus' }], targets: {} };
        globalThis.synced = syncSplitPlatoonCards(appData.campaign.opUnits[0], appData.campaign.opUnits[0].cardSelection);`);
    ok(s.evalCtx('synced') === 2, 'выбор разошёлся на два других отделения', s.evalCtx('synced'));
    ok(ad.campaign.opUnits.every(u => (u.cardSelection.cards || []).some(c => c.name === 'Точный огонь')),
        'карточка есть у каждого отделения');
    ok(Object.keys(ad.campaign.splitPlatoons['Развед. взвод'].cardSelection.cards[0]).length > 0,
        'выбор сохранён в записи взвода (переживёт пересборку)');
    // и обратно: выбор на штабе расходится на остальные
    s.run(`syncSplitPlatoonCards(appData.campaign.opUnits[2], { version: 1, done: true,
        cards: [{ name: 'Комиссар', type: 'bonus' }], targets: {} });`);
    ok(ad.campaign.opUnits.every(u => (u.cardSelection.cards || []).some(c => c.name === 'Комиссар')),
        'выбор на любом отделении действует на весь взвод');
    // перед боем очередь выбора карт не должна спрашивать каждое отделение
    ok(/syncSplitPlatoonCards\(unit, unit\.cardSelection\)/.test(HTML),
        'finishCurrentUnitCardSelection синхронизирует выбор с отделениями');
}

// ───────────── 3. сборка обратно ─────────────
{
    const { s, ad } = reconPlatoonSandbox();
    s.run('splitReconPlatoon(platoon);');
    s.run(`appData.campaign.opUnits[0].col = 3; appData.campaign.opUnits[0].row = 5; appData.campaign.opUnits[0].ap = 1;
        appData.campaign.opUnits[1].col = 6; appData.campaign.opUnits[1].row = 5; appData.campaign.opUnits[1].ap = 3;
        appData.campaign.opUnits[2].ap = 4;`);
    s.run('syncSplitPlatoonCards(appData.campaign.opUnits[1], { version: 1, done: true, cards: [{ name: "Точный огонь", type: "bonus" }], targets: {} });');
    const merged = s.evalCtx('!!mergeReconPlatoonParts(appData.campaign.opUnits[1])');
    ok(merged, 'отделения собраны обратно');
    const units = ad.campaign.opUnits || [];
    ok(units.length === 1, 'на карте снова один юнит', units.map(u => u.name).join(', '));
    ok(units[0].name === 'Развед. взвод' && units[0].type === 'recon_platoon', 'это снова «Развед. взвод»');
    ok(JSON.stringify(units[0].squads.map(sq => sq.name)) === JSON.stringify([
        'Развед. отделение №1', 'Развед. отделение №2', 'Штаб развед. взвода'
    ]), 'порядок отделений прежний', units[0].squads.map(sq => sq.name).join(', '));
    ok(units[0].squads[0].fighters[1].hp === 2, 'состояние бойцов сохранено');
    ok(units[0].icon === 'images/развед аирф.png', 'иконка взвода вернулась');
    ok(units[0].operationalMorale === 82, 'дух взвода сохранён');
    ok(units[0].ap === 4 && units[0].maxAp === 4,
        'ОД взяты максимальные из отделений (было 1/3/4)', units[0].ap);
    ok(units[0].cardSelection && units[0].cardSelection.cards[0].name === 'Точный огонь',
        'карточки взвода сохранены после сборки');
    ok(!ad.campaign.splitPlatoons || !ad.campaign.splitPlatoons['Развед. взвод'],
        'запись о делении удалена');
    s.run('initReconAssets();');
    ok(s.evalCtx('appData.campaign.reconAssets.airf_recon_platoon.total') === 1,
        'после сборки актив снова один', s.evalCtx('appData.campaign.reconAssets.airf_recon_platoon.total'));
}

// ───────────── 4. деление переживает пересборку юнитов ─────────────
{
    const { s, ad } = reconPlatoonSandbox();
    s.run('splitReconPlatoon(platoon);');
    s.run('appData.campaign.opUnits[0].col = 3; appData.campaign.opUnits[0].row = 5;');
    // имитируем пересборку: взвод создан заново, отделения пропали
    s.run(`globalThis.oldByName = {};
        appData.campaign.opUnits.forEach(u => { oldByName[u.name] = JSON.parse(JSON.stringify(u)); });
        appData.campaign.opUnits = [{ name: 'Развед. взвод', type: 'recon_platoon', col: 4, row: 5, side: 'player',
            ap: 4, maxAp: 4, mobility: 'foot', squads: platoon.squads.map(sq => JSON.parse(JSON.stringify(sq))) }];
        globalThis.restored = reapplyReconPlatoonSplits(oldByName);`);
    ok(s.evalCtx('restored') === 1, 'деление восстановлено после пересборки', s.evalCtx('restored'));
    const units = ad.campaign.opUnits || [];
    ok(units.length === 3, 'снова три отделения', units.map(u => u.name).join(', '));
    const first = units.find(u => u.name === 'Развед. отделение №1');
    ok(first && first.col === 3 && first.row === 5, 'позиция отделения восстановлена (3,5)',
        first && `${first.col},${first.row}`);
    ok(units.every(u => u.cardSelection && (u.cardSelection.cards || []).length === 1),
        'карточки снова на каждом отделении');
}

// ───────────── 5. мотоциклисты — только при штабе батальона (пресет) ─────────────
{
    const { s } = makeSandbox();
    const riders = s.evalCtx(`JSON.stringify((BATTALION_PRESETS['BeVe'].standard || []).map(u => ({
        name: u.name, type: u.type,
        own: (u.squads || []).filter(sq => /^Мотоциклист-/.test(sq.name)).length,
        platoons: (u.platoons || []).map(pl => ({ name: pl.name,
            riders: pl.squads.filter(sq => /^Мотоциклист-/.test(sq.name)).length }))
    })))`);
    const data = JSON.parse(riders);
    const withOwn = data.filter(u => u.own > 0);
    ok(withOwn.length === 1 && /^Штаб батальона$/i.test(withOwn[0].name),
        'мотоциклисты есть только у штаба батальона', withOwn.map(u => u.name).join(', '));
    ok(withOwn[0].own === 2, 'у штаба батальона разведчик и посыльный', withOwn[0].own);
    ok(data.every(u => u.platoons.every(pl => pl.riders === 0)),
        'ни в одном взводе мотоциклистов нет',
        data.flatMap(u => u.platoons.filter(pl => pl.riders).map(pl => pl.name)).join(', '));
}

// ───────────── 6. миграция начатого похода: мотоциклисты ─────────────
{
    const { s, ad } = makeSandbox((sb, app) => {
        app.campaign.playerFaction = 'BeVe';
        // старый сейв: мотоциклисты лежат в каждом взводе
        sb.run(`globalThis.oldBat = generateBattalion('BeVe', []);
            oldBat.units.forEach(u => {
                if (Array.isArray(u.platoons)) u.platoons.forEach(pl => {
                    if (!pl.squads.some(sq => /Мотоциклист-разведчик/.test(sq.name))) {
                        pl.squads.push({ name: 'Мотоциклист-разведчик', templateName: 'Мотоциклист-разведчик' });
                        pl.squads.push({ name: 'Мотоциклист-посыльный', templateName: 'Мотоциклист-посыльный' });
                    }
                });
                if (u.type === 'hq' && /^Штаб батальона$/i.test(u.name)) u.squads = [];
            });`);
    });
    const beforeCount = s.evalCtx(`oldBat.units.flatMap(u => u.platoons || [])
        .reduce((n, pl) => n + pl.squads.filter(sq => /^Мотоциклист-/.test(sq.name)).length, 0)`);
    ok(beforeCount > 0, 'в старом сейве мотоциклисты есть во взводах', beforeCount);
    s.run('globalThis.changed = syncReconPlatoonSquads(oldBat);');
    ok(s.evalCtx('changed') > 0, 'миграция сработала');
    ok(s.evalCtx(`oldBat.units.flatMap(u => u.platoons || [])
        .reduce((n, pl) => n + pl.squads.filter(sq => /^Мотоциклист-/.test(sq.name)).length, 0)`) === 0,
        'из всех взводов мотоциклисты убраны');
    const hq = s.evalCtx(`(oldBat.units.find(u => u.type === 'hq' && /^Штаб батальона$/i.test(u.name)) || { squads: [] }).squads.map(sq => sq.name)`);
    ok(hq.includes('Мотоциклист-разведчик') && hq.includes('Мотоциклист-посыльный'),
        'у штаба батальона мотоциклисты появились', hq.join(' | '));
    ok(hq.filter(name => /^Мотоциклист-/.test(name)).length === 2, 'ровно двое, без дублей');
    s.run('globalThis.changed2 = syncReconPlatoonSquads(oldBat);');
    ok(s.evalCtx('changed2') === 0, 'повторная миграция ничего не меняет', s.evalCtx('changed2'));
}

// ───────────── 7. штаб батальона с мотоциклистами в оперативке ─────────────
{
    const ad = freshAppData();
    ad.campaign.playerFaction = 'BeVe';
    ad.campaign.battalions.player = { faction: 'BeVe', presetSig: 'old', units: [] };
    ad.campaign.battalions.enemy = { faction: 'A.I.R.F.', presetSig: 'old', units: [] };
    ad.campaign.opUnitsSignature = 'old';
    const s = createSandbox(ad);
    s.run(RECON_SRC);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    s.evalCtx('buildOperationalUnits()');
    const units = ad.campaign.opUnits || [];
    const hqUnit = units.find(u => /^Штаб батальона$/i.test(u.name));
    ok(!!hqUnit, 'штаб батальона создан');
    ok(hqUnit && (hqUnit.squads || []).some(sq => /Мотоциклист-разведчик/.test(sq.name)),
        'у штаба батальона в оперативке есть мотоциклист-разведчик');
    ok(units.filter(u => (u.squads || []).some(sq => /^Мотоциклист-/.test(sq.name))).length === 1,
        'мотоциклисты только в одном юните',
        units.filter(u => (u.squads || []).some(sq => /^Мотоциклист-/.test(sq.name))).map(u => u.name).join(', '));
    s.run('initReconAssets();');
    ok(s.evalCtx('appData.campaign.reconAssets.beve_motorcycle_scout.total') === 1,
        'разведчик-актив один (а не по одному на взвод)', s.evalCtx('appData.campaign.reconAssets.beve_motorcycle_scout.total'));
    ok(s.evalCtx('appData.campaign.reconAssets.beve_motorcycle_messenger.total') === 1, 'посыльный-актив один');
    ok(s.evalCtx('typeof appData.campaign.reconAssets.beve_armored_car === "undefined"'),
        'актива «Бронеавтомобиль» больше нет');
}

// ───────────── 8. бронеавтомобили: только Landsverk №1–3 как юниты ─────────────
{
    const { s, ad } = makeSandbox((sb, app) => {
        app.campaign.playerFaction = 'BeVe';
        app.campaign.battalions.player = {
            faction: 'BeVe',
            units: [{
                name: 'Взвод бронеавтомобилей', type: 'armored_vehicle_platoon',
                squads: [
                    { name: 'Бронеавтомобиль Landsverk 183 №1' },
                    { name: 'Бронеавтомобиль Landsverk 183 №1' },
                    { name: 'Бронеавтомобиль Landsverk 183 №4' },
                    { name: 'Бронеавтомобиль Landsverk 183 №3' }
                ]
            }]
        };
        app.campaign.opUnits = [
            { name: 'Бронеавтомобиль Landsverk 183 №1', type: 'vehicle', col: 1, row: 1 },
            { name: 'Бронеавтомобиль Landsverk 183 №4', type: 'vehicle', col: 1, row: 2 },
            { name: 'Отряд Бронеавтомобиль (2шт)', type: 'vehicle', isGroup: true, groupSize: 2, vehicleList: [{}], col: 2, row: 2 }
        ];
    });
    const removed = s.evalCtx('pruneExtraArmoredCars()');
    ok(removed > 0, 'лишние бронеавтомобили удалены', removed);
    const bat = ad.campaign.battalions.player.units[0].squads.map(sq => sq.name);
    ok(JSON.stringify(bat) === JSON.stringify(['Бронеавтомобиль Landsverk 183 №1', 'Бронеавтомобиль Landsverk 183 №3']),
        'в батальоне остались только машины из пресета (№1 и №3, без дублей)', bat.join(', '));
    const onMap = (ad.campaign.opUnits || []).map(u => u.name);
    ok(!onMap.includes('Бронеавтомобиль Landsverk 183 №4'), 'машина №4 убрана с карты', onMap.join(', '));
    ok(onMap.includes('Бронеавтомобиль Landsverk 183 №1'), 'машина из пресета осталась');
    ok(onMap.some(n => /Отряд/.test(n)), 'слитая группа машин не тронута', onMap.join(', '));
    s.run('initReconAssets();');
    ok(s.evalCtx('typeof appData.campaign.reconAssets.beve_armored_car === "undefined"'),
        'бронеавтомобили не считаются развед-активами');
    ok(!/beve_armored_car/.test(RECON_SRC), 'в js/recon.js нет актива бронеавтомобиля');
}

// ───────────── 9. интерфейс ─────────────
{
    ok(/Разделить на отделения/.test(HTML), 'в карточке юнита есть кнопка «Разделить на отделения»');
    ok(/Собрать взвод обратно/.test(HTML), 'в карточке отделения есть кнопка «Собрать взвод обратно»');
    ok(/function splitReconPlatoonByIndex/.test(HTML) && /function mergeReconPlatoonByIndex/.test(HTML),
        'есть обработчики кнопок');
    ok(/reapplyReconPlatoonSplits\(preserveByName\)/.test(HTML),
        'пересборка юнитов возвращает деление взвода');
    ok(/pruneExtraArmoredCars\(\)/.test(HTML), 'пересборка чистит лишние бронеавтомобили');
    // кнопки деления не показываются не-развед-юнитам
    const { s } = makeSandbox();
    ok(s.evalCtx(`isReconPlatoonUnit({ name: '1-й взвод', type: 'infantry_platoon', squads: [{name:'a'},{name:'b'}] })`) === false,
        'обычный взвод не делится этой кнопкой');
    ok(s.evalCtx(`isReconPlatoonUnit({ name: 'Развед. взвод', type: 'recon_platoon', squads: [{name:'a'}] })`) === false,
        'уже разделённый/одиночный юнит не делится повторно');
}

// ───────────── 10. реальный пресет A.I.R.F.: деление и сборка ─────────────
{
    const ad = freshAppData();
    ad.campaign.playerFaction = 'A.I.R.F.';
    ad.campaign.battalions.player = { faction: 'A.I.R.F.', units: [] };
    ad.campaign.battalions.enemy = { faction: 'BeVe', units: [] };
    ad.campaign.opUnitsSignature = 'old';
    const s = createSandbox(ad);
    s.run(RECON_SRC);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    s.evalCtx('buildOperationalUnits()');
    const units = ad.campaign.opUnits || [];
    const recon = units.find(u => /^Развед\. взвод$/.test(u.name));
    ok(!!recon, 'в оперативке A.I.R.F. есть «Развед. взвод»');
    ok(!!recon && recon.squads.length === 3, 'в нём три отделения', recon && recon.squads.map(sq => sq.name).join(', '));
    ok(s.evalCtx('isReconPlatoonUnit(appData.campaign.opUnits.find(u => u.name === "Развед. взвод"))') === true,
        'кнопка деления доступна настоящему взводу A.I.R.F.');
    s.run('initReconAssets();');
    const oneAsset = s.evalCtx('appData.campaign.reconAssets.airf_recon_platoon.total');
    s.run('splitReconPlatoon(appData.campaign.opUnits.find(u => u.name === "Развед. взвод"))');
    const parts = (ad.campaign.opUnits || []).filter(u => u.splitPlatoonName === 'Развед. взвод');
    ok(parts.length === 3, 'взвод разделён на три отдельных юнита', parts.map(u => u.name).join(', '));
    s.run('initReconAssets();');
    const assets = s.evalCtx('appData.campaign.reconAssets.airf_recon_platoon.total');
    ok(assets === 2, 'после деления развед-активов два (штаб не актив)', assets + ' / было ' + oneAsset);
    // у каждого отделения своя миссия, взводы между собой независимы
    s.run(`globalThis.m1 = createReconMission({ assetKey: 'airf_recon_platoon', unitId: appData.campaign.opUnits.findIndex(u => u.name === 'Развед. отделение №1'), route: [{col:5,row:5}], observeMode: 'pass', reportMethod: 'radio' });
        globalThis.m2 = createReconMission({ assetKey: 'airf_recon_platoon', unitId: appData.campaign.opUnits.findIndex(u => u.name === 'Развед. отделение №2'), route: [{col:6,row:5}], observeMode: 'pass', reportMethod: 'radio' });`);
    ok(s.evalCtx('!!m1 && !!m2'), 'два отделения получили две разные миссии');
    s.run('mergeReconPlatoonParts(appData.campaign.opUnits.find(u => u.name === "Развед. отделение №2"))');
    const back = (ad.campaign.opUnits || []).find(u => u.name === 'Развед. взвод');
    ok(!!back, 'взвод собран обратно');
    ok(!!back && back.type === 'recon_platoon', 'тип взвода восстановлен', back && back.type);
    ok(!!back && back.squads.length === 3, 'три отделения на месте');
}

// Не оставляем за собой общий /tmp/wg_part.js: его подгружает каждая следующая
// песочница (sandbox.js), и объявленные здесь const могли конфликтовать с
// переменными других тестов.
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

console.log(`\nИтог v13.160 (развед. взвод / мотоциклисты / БА): PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
