'use strict';
// ⚡ v13.158: мотоциклетные миномётные расчёты BeVe в самокатных взводах.
//
//   Требование игрока:
//     • такие же, как обычные 50-мм миномётные расчёты BeVe (расчёт, оружие, боезапас);
//     • могут спешиваться и двигаются как мотоциклетные пулемётные расчёты;
//     • числятся там же — в самокатных взводах BeVe.
//
//   Найденный дефект: в v13.157 отряды добавлялись только в BATTALION_PRESETS,
//   а getPresetSignature считала отряды лишь верхнего уровня. В уже начатом
//   походе батальон лежал в сейве, сигнатура не менялась, пересборки не было —
//   и мотоциклетных расчётов игрок не находил.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction: extractFn, sliceConst: extractConst } = require('./extract');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}

function sliceFunction(name) {
    const i = HTML.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let d = 0;
    const j = HTML.indexOf('{', i);
    for (let k = j; k < HTML.length; k++) {
        if (HTML[k] === '{') d++;
        else if (HTML[k] === '}') { d--; if (!d) return HTML.slice(i, k + 1); }
    }
    return null;
}

function sliceConst(name) {
    const i = HTML.indexOf('const ' + name + ' = ');
    if (i < 0) return null;
    // до конца строки с '];' или ';'
    const end = HTML.indexOf(';', i);
    return end < 0 ? null : HTML.slice(i, end + 1);
}

// функции миграции кладём в общий /tmp/wg_part.js — песочница подхватит их сама
function writeReconHelpers() {
    const parts = [];
    try { parts.push(extractConst(HTML, 'RECON_PLATOON_SQUAD_TEMPLATES')); } catch (e) {}
    ['isBicyclePlatoonPreset', 'syncReconPlatoonTemplates', 'syncReconPlatoonSquads'].forEach(fn => {
        try { parts.push(extractFn(HTML, fn)); } catch (e) {}
    });
    fs.writeFileSync('/tmp/wg_part.js', parts.join('\n\n'));
}
writeReconHelpers();
function loadReconHelpers() { /* уже в /tmp/wg_part.js */ }

function sandboxWithTemplates() {
    const s = createSandbox(freshAppData());
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    ['generateBattalion', 'cloneTemplate', 'getPresetSignature', 'assignUniqueCrewKeys'].forEach(fn => {
        const src = sliceFunction(fn);
        if (src) s.run(src);
    });
    loadReconHelpers(s);
    return s;
}

// сигнатура пресета текущим алгоритмом (для «свежих» сейвов в тестах)
function getPresetSigFor(faction) {
    const fnSrc = sliceFunction('getPresetSignature');
    const tmp = createSandbox(freshAppData());
    tmp.run(fnSrc);
    return tmp.evalCtx(`getPresetSignature(${JSON.stringify(faction)})`);
}

console.log('== v13.158: мотоциклетные миномётные расчёты BeVe ==');

const MORTAR_TEMPLATES = [
    'Мотоциклетный миномётный расчёт 50-мм №1',
    'Мотоциклетный миномётный расчёт 50-мм №2',
    'Мотоциклетный миномётный расчёт 50-мм №3'
];

// ───────────── 1. шаблоны: «такие же, как обычные миномёты» ─────────────
{
    const s = sandboxWithTemplates();
    const templates = s.evalCtx('SQUAD_TEMPLATES');
    const regular = templates.find(t => t.name === 'Минометный расчёт 50-мм №1');
    MORTAR_TEMPLATES.forEach((name, i) => {
        const t = templates.find(x => x.name === name);
        ok(!!t, `шаблон «${name}» существует`);
        if (!t) return;
        ok(t.faction === 'BeVe', `${name}: фракция BeVe`, t.faction);
        ok(t.fighters && t.fighters.length === regular.fighters.length,
            `${name}: расчёт из ${regular.fighters.length} бойцов, как у обычного`, t.fighters && t.fighters.length);
        ok(JSON.stringify(t.fighters.map(f => f.weapon)) === JSON.stringify(regular.fighters.map(f => f.weapon)),
            `${name}: те же винтовки/пистолеты, что у обычного расчёта`);
        ok(t.crewInstances && t.crewInstances[0] && t.crewInstances[0].weaponName === regular.crewInstances[0].weaponName,
            `${name}: тот же 50-мм миномёт DBT`, t.crewInstances && t.crewInstances[0] && t.crewInstances[0].weaponName);
        ok(t.ammoSmall === regular.ammoSmall && t.ammoOrdnance === regular.ammoOrdnance && t.grenades === regular.grenades,
            `${name}: боезапас как у обычного (${regular.ammoSmall}/${regular.ammoOrdnance}/${regular.grenades})`,
            `${t.ammoSmall}/${t.ammoOrdnance}/${t.grenades}`);
        const expectedIcon = `images/BeVe/мотоцикл беве ${i + 1} мин.png`;
        ok(t.icon === expectedIcon, `${name}: своя иконка ${expectedIcon}`, t.icon);
        ok(fs.existsSync(path.join(ROOT, t.icon)), `${name}: файл иконки на месте`);
        ok(/Мотоцикл/.test(t.name), `${name}: имя даёт мотоциклетную мобильность (cloneTemplate)`);
    });
}

// ───────────── 2. самокатные взводы пресета ─────────────
{
    const s = sandboxWithTemplates();
    const platoons = s.evalCtx(`BATTALION_PRESETS['BeVe'].standard
        .filter(u => Array.isArray(u.platoons))
        .flatMap(u => u.platoons)
        .filter(p => p.mobilityType === 'bicycle' || /самокат/i.test(p.name || ''))`);
    ok(platoons.length === 3, 'в пресете BeVe три самокатных взвода', platoons.length);
    const templateNames = new Set(s.evalCtx('SQUAD_TEMPLATES').map(t => t.name));
    platoons.forEach((pl, i) => {
        const names = pl.squads.map(sq => sq.name);
        ok(names.some(n => /Мотоциклетный миномётный расчёт №\d/.test(n)),
            `${pl.name}: есть мотоциклетный миномётный расчёт`, names.join(' | '));
        const mortar = pl.squads.find(sq => /Мотоциклетный миномётный расчёт/i.test(sq.name));
        ok(mortar && mortar.templateName === `Мотоциклетный миномётный расчёт 50-мм №${i + 1}`,
            `${pl.name}: ссылается на шаблон №${i + 1}`, mortar && mortar.templateName);
        ok(mortar && templateNames.has(mortar.templateName),
            `${pl.name}: шаблон расчёта существует`);
        // мотоциклетный пулемётный расчёт — «сосед» для сравнения мобильности
        ok(names.some(n => /Мотоциклетный Пулеметный расчёт/.test(n)),
            `${pl.name}: есть и мотоциклетный пулемётный расчёт (тот же взвод)`, names.join(' | '));
    });
}

// ───────────── 3. корень дефекта: сигнатура видит состав взводов ─────────────
{
    const s = sandboxWithTemplates();
    s.run('globalThis.sigBefore = getPresetSignature("BeVe");');
    s.run(`BATTALION_PRESETS['BeVe'].standard.forEach(u => (u.platoons || []).forEach(pl => {
        pl.squads = pl.squads.filter(sq => !/Мотоциклетный миномётный расчёт/i.test(sq.name));
    }));`);
    s.run('globalThis.sigAfter = getPresetSignature("BeVe");');
    ok(s.evalCtx('sigBefore !== sigAfter'),
        'п.дефекта: удаление отряда из взвода меняет сигнатуру пресета (старые сейвы пересоберутся)');
    ok(s.evalCtx('sigBefore.includes("platoons") || sigBefore.includes("1-й самокатный взвод")'),
        'в сигнатуру входит имя взвода');
}

// ───────────── 4. миграция уже начатого похода ─────────────
{
    const s = sandboxWithTemplates();
    // старый сейв: батальон собран, но мотоциклетных отрядов в взводах нет
    s.run(`globalThis.oldBat = generateBattalion('BeVe', []);
        oldBat.units.forEach(u => (u.platoons || []).forEach(pl => {
            pl.squads = pl.squads.filter(sq => !/Мотоцикл/i.test(sq.name));
        }));`);
    const before = s.evalCtx(`oldBat.units.flatMap(u => u.platoons || [])
        .flatMap(p => p.squads).filter(sq => /Мотоцикл/i.test(sq.name)).length`);
    ok(before === 0, 'старый сейв: мотоциклетных отрядов нет', before);
    // пресет кладёт разведчика и посыльного в КАЖДЫЙ взвод (как в v13.157),
    // миномётный расчёт — только в самокатные
    const platoonCount = s.evalCtx('oldBat.units.flatMap(u => u.platoons || []).length');
    const bicycleCount = s.evalCtx(`oldBat.units.flatMap(u => u.platoons || [])
        .filter(p => p.mobilityType === 'bicycle' || /самокат/i.test(p.name || '')).length`);

    s.run('globalThis.added1 = syncReconPlatoonSquads(oldBat);');
    const added1 = s.evalCtx('added1');
    const expectedAdded = platoonCount * 2 + bicycleCount;
    ok(added1 === expectedAdded,
        `миграция добавила ${expectedAdded} отрядов (разведчик и посыльный в ${platoonCount} взводов + миномёт в ${bicycleCount})`, added1);

    const check = (re) => s.evalCtx(`oldBat.units.flatMap(u => u.platoons || []).flatMap(p => p.squads).filter(sq => ${re}.test(sq.name)).length`);
    ok(check('/Мотоциклетный миномётный расчёт/') === bicycleCount,
        'миномётный расчёт — ровно в самокатных взводах', check('/Мотоциклетный миномётный расчёт/'));
    ok(check('/Мотоциклист-разведчик/') === platoonCount, 'мотоциклист-разведчик в каждом взводе',
        check('/Мотоциклист-разведчик/'));
    ok(check('/Мотоциклист-посыльный/') === platoonCount, 'мотоциклист-посыльный в каждом взводе',
        check('/Мотоциклист-посыльный/'));

    const names = s.evalCtx(`oldBat.units.flatMap(u => u.platoons || []).flatMap(p => p.squads)
        .filter(sq => /Мотоциклетный миномётный/.test(sq.name)).map(sq => sq.name)`);
    ok(JSON.stringify(names) === JSON.stringify([
        'Мотоциклетный миномётный расчёт №1',
        'Мотоциклетный миномётный расчёт №2',
        'Мотоциклетный миномётный расчёт №3'
    ]), 'нумерация расчётов 1–3 по порядку взводов', names.join(', '));

    s.run('globalThis.added2 = syncReconPlatoonSquads(oldBat);');
    ok(s.evalCtx('added2') === 0, 'повторный запуск ничего не дублирует (идемпотентно)', s.evalCtx('added2'));

    // шаблоны доложены в appData.templates
    s.run('globalThis.tplAdded = syncReconPlatoonTemplates();');
    ok(s.evalCtx('tplAdded') === 0, 'шаблоны уже были — повторно не добавляются');
}

// ───────────── 4б. фракции: мотоциклисты только у BeVe ─────────────
{
    const s = sandboxWithTemplates();
    s.run(`globalThis.airfBat = generateBattalion('A.I.R.F.', []);
        airfBat.units.forEach(u => (u.platoons || []).forEach(pl => {
            pl.squads = pl.squads.filter(sq => !/Мотоцикл/i.test(sq.name));
        }));`);
    ok(s.evalCtx('syncReconPlatoonSquads(airfBat)') === 0,
        'у A.I.R.F. мотоциклисты не добавляются (в пресете их нет)');
    ok(s.evalCtx(`airfBat.units.flatMap(u => u.platoons || []).flatMap(p => p.squads)
        .filter(sq => /Мотоцикл/i.test(sq.name)).length`) === 0,
        'состав вражеского батальона A.I.R.F. не раздут');
    // если игрок выбрал A.I.R.F., врагом становится BeVe — там мотоциклисты нужны
    const s2 = sandboxWithTemplates();
    s2.run(`globalThis.beveEnemy = generateBattalion('BeVe', []);
        beveEnemy.units.forEach(u => (u.platoons || []).forEach(pl => {
            pl.squads = pl.squads.filter(sq => !/Мотоцикл/i.test(sq.name));
        }));`);
    ok(s2.evalCtx('syncReconPlatoonSquads(beveEnemy)') > 0,
        'батальон BeVe доводится независимо от того, чей он (игрок или враг)');
}

// ───────────── 5. шаблоны для тактики подкладываются в сейв ─────────────
{
    const s = createSandbox(freshAppData());
    loadReconHelpers(s);
    // в старом сейве новых шаблонов нет
    s.run('appData.templates = SQUAD_TEMPLATES.filter(t => !/Мотоциклетный миномётный|Мотоциклист-/.test(t.name)).map(t => JSON.parse(JSON.stringify(t)));');
    ok(s.evalCtx('appData.templates.some(t => /Мотоциклетный миномётный/.test(t.name))') === false,
        'исходно шаблонов мотоциклетных расчётов в сейве нет');
    s.run('globalThis.addedTpl = syncReconPlatoonTemplates();');
    ok(s.evalCtx('addedTpl') === 5, 'добавлены 5 шаблонов (разведчик, посыльный, 3 миномёта)', s.evalCtx('addedTpl'));
    s.run('globalThis.addedTpl2 = syncReconPlatoonTemplates();');
    ok(s.evalCtx('addedTpl2') === 0, 'повторно шаблоны не дублируются');
}

// ───────────── 6. мобильность и спешивание ─────────────
{
    const s = sandboxWithTemplates();
    // оперативный юнит самокатного взвода
    s.run(`appData.campaign.opUnits = [{
        name: '1-й самокатный взвод', type: 'bicycle_platoon',
        mobility: 'bicycle', dismounted: false, maxAp: 4,
        squads: [
            { name: 'Мотоциклетный Пулеметный расчёт №1' },
            { name: 'Мотоциклетный миномётный расчёт №1' }
        ]
    }];`);
    const dismountFn = sliceFunction('unitCanExecuteOrderType');
    ok(!!dismountFn, 'unitCanExecuteOrderType найдена');
    if (dismountFn) {
        s.run('function unitHasFirepower() { return true; }');
        s.run('function isEscortCapableInfantry() { return true; }');
        s.run(dismountFn);
        ok(s.evalCtx("unitCanExecuteOrderType(appData.campaign.opUnits[0], 'dismount')") === true,
            'самокатный взвод с миномётным расчётом может спешиваться');
        s.run('appData.campaign.opUnits[0].dismounted = true; appData.campaign.opUnits[0].dismountedFromMobility = "bicycle";');
        ok(s.evalCtx("unitCanExecuteOrderType(appData.campaign.opUnits[0], 'remount')") === true,
            'и снова садиться на велосипеды/мотоциклы');
    }
    // тактический отряд: мотоциклетная мобильность по имени
    s.run("globalThis.tacMortar = cloneTemplate('BeVe', 'Мотоциклетный миномётный расчёт №1', 'Мотоциклетный миномётный расчёт 50-мм №1');");
    ok(s.evalCtx("tacMortar.mobilityType") === 'motorcycle',
        'в тактике расчёт считается мотоциклетным (mobilityType)', s.evalCtx('tacMortar.mobilityType'));
    s.run("globalThis.tacMg = cloneTemplate('BeVe', 'Мотоциклетный Пулеметный расчёт №1', 'Мотоциклетный Пулеметный расчёт №1');");
    ok(s.evalCtx('tacMortar.mobilityType') === s.evalCtx('tacMg.mobilityType'),
        'мобильность та же, что у мотоциклетного пулемётного расчёта');
    ok(s.evalCtx('tacMortar.crewInstances && tacMortar.crewInstances[0].weaponName === "Минометный расчёт 50мм DBT"'),
        'в бою у расчёта 50-мм миномёт DBT');
}

// ───────────── 7. проводка в buildOperationalUnits() ─────────────
{
    const body = sliceFunction('buildOperationalUnits');
    ok(!!body, 'buildOperationalUnits найдена');
    const idx = (frag) => body.indexOf(frag);
    ok(idx('syncReconPlatoonTemplates()') > 0, 'шаблоны мотоциклетных отрядов добираются при сборке');
    ok(idx('syncReconPlatoonSquads(appData.campaign.battalions.player)') > 0, 'состав взводов игрока доводится');
    ok(idx('migrateSupplySquadNames()') < idx('syncReconPlatoonSquads(appData.campaign.battalions.player)'),
        'порядок: миграция снабжения → затем мотоциклетные отряды');
    ok(idx('syncReconPlatoonSquads(appData.campaign.battalions.player)') < idx('getPresetSignature(battalion.faction)'),
        'доводим состав ДО пересборки по сигнатуре пресета');
    ok(idx('syncReconPlatoonSquads(enemyBattalionRef)') > 0, 'вражеский батальон доводится тоже');
    const enemyAt = idx('syncReconPlatoonSquads(enemyBattalionRef)');
    ok(body.slice(enemyAt, enemyAt + 300).includes('enemyOpUnitsSignature = null'),
        'после добавления врагу ставится сброс сигнатуры → пересборка');
    // оба вызова защищены try/catch — сборка не падает на старом сейве
    const around = body.slice(0, body.indexOf('getPresetSignature(battalion.faction)'));
    ok(/try \{ syncReconPlatoonTemplates\(\); \} catch/.test(around), 'шаблоны: try/catch');
    ok(/try \{\s*const reconAdded = syncReconPlatoonSquads/.test(around), 'состав игрока: try/catch');
    // getPresetSignature действительно включает взводы
    const sig = sliceFunction('getPresetSignature');
    ok(/platoons/.test(sig), 'getPresetSignature читает platoons');
}

// ───────────── 7б. в бою расчёт ведёт себя как мотоциклетный пулемётный ─────────────
{
    const s = createSandbox(freshAppData());
    ['isBicycleTacticalSquad', 'isMotorcycleTacticalSquad', 'tacticalApplyOperationalMobilityToBattleSquad']
        .forEach(fn => s.run(sliceFunction(fn)));
    // взвод самокатный, ещё верхом
    s.run(`globalThis.opUnit = { name: '1-й самокатный взвод', type: 'bicycle_platoon', mobility: 'bicycle', dismounted: false };
        globalThis.mortarB = { name: 'Мотоциклетный миномётный расчёт №1', mobilityType: 'motorcycle' };
        globalThis.mgB = { name: 'Мотоциклетный Пулеметный расчёт №1', mobilityType: 'motorcycle' };`);
    s.run('tacticalApplyOperationalMobilityToBattleSquad(mortarB, opUnit); tacticalApplyOperationalMobilityToBattleSquad(mgB, opUnit);');
    ok(s.evalCtx('mortarB.mobilityType') === s.evalCtx('mgB.mobilityType'),
        'в бою у миномётного расчёта та же мобильность, что у пулемётного',
        s.evalCtx('mortarB.mobilityType') + ' vs ' + s.evalCtx('mgB.mobilityType'));
    ok(s.evalCtx('!!mortarB.dismounted') === s.evalCtx('!!mgB.dismounted'),
        'признак «спешен» совпадает с пулемётным расчётом');
    ok(s.evalCtx('isBicycleTacticalSquad(mortarB)') === true,
        'пока верхом — обязан спешиться перед стрельбой/рукопашной');
    // взвод спешился в оперативке — состояние переходит в бой
    s.run('opUnit.dismounted = true; tacticalApplyOperationalMobilityToBattleSquad(mortarB, opUnit); tacticalApplyOperationalMobilityToBattleSquad(mgB, opUnit);');
    ok(s.evalCtx('mortarB.dismounted') === true && s.evalCtx('mgB.dismounted') === true,
        'спешивание взвода в оперативке переносится в бой для обоих расчётов');
}

// ───────────── 8. сквозная проверка: старый сейв → buildOperationalUnits() ─────────────
{
    const FNS = [
        'buildOperationalUnits', 'getPresetSignature', 'getBattalionSignature',
        'generateBattalion', 'cloneTemplate', 'assignUniqueCrewKeys',
        'isBicyclePlatoonPreset', 'syncReconPlatoonTemplates', 'syncReconPlatoonSquads',
        'syncSupplySquadTemplates', 'migrateSupplySquadNames', 'supplySquadRenamed', 'isStaticOpUnit',
        'createEnemyOperationalUnits'
    ];
    const consts = ['RECON_PLATOON_SQUAD_TEMPLATES', 'SUPPLY_VEHICLE_ICON_RULES', 'SUPPLY_SQUAD_RENAMES'];
    const src = consts.map(c => { try { return extractConst(HTML, c); } catch (e) { return ''; } })
        .concat(FNS.map(f => extractFn(HTML, f))).join('\n\n');
    fs.writeFileSync('/tmp/wg_part.js', src);

    const makeSave = () => {
        const ad = freshAppData();
        ad.campaign.playerFaction = 'BeVe';
        // сейв эпохи v13.157: сигнатура посчитана старым способом, в взводах нет
        // мотоциклетных расчётов, у отряда потерян боец
        ad.campaign.battalions.player = {
            faction: 'BeVe', presetSig: 'old-v13157-signature',
            units: [{
                name: '3-я самокатная рота', type: 'infantry_company',
                platoons: [{
                    name: '1-й самокатный взвод', mobilityType: 'bicycle',
                    squads: [{ name: 'Самокатное отделение №1', templateName: 'Самокатное отделение №1' }]
                }]
            }]
        };
        ad.campaign.battalions.enemy = { faction: 'A.I.R.F.', presetSig: 'old-v13157-signature', units: [] };
        ad.campaign.opUnits = [{
            name: '1-й самокатный взвод', type: 'bicycle_platoon', mobility: 'bicycle',
            col: 5, row: 6, side: 'player', ap: 2, maxAp: 4, operationalMorale: 71,
            squads: [{
                name: 'Самокатное отделение №1', fighters: [{ name: 'А', hp: 1, maxHp: 3 }]
            }]
        }];
        ad.campaign.opUnitsSignature = 'old';
        return ad;
    };

    const ad = makeSave();
    const s = createSandbox(ad);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    s.evalCtx('buildOperationalUnits()');

    const units = ad.campaign.opUnits || [];
    const platoon = units.find(u => /1-й самокатный взвод/.test(u.name || ''));
    ok(!!platoon, 'после сборки самокатный взвод на месте');
    const names = (platoon && platoon.squads || []).map(sq => sq.name);
    ok(names.some(n => /Мотоциклетный миномётный расчёт №1/.test(n)),
        'старый сейв: в взводе появился мотоциклетный миномётный расчёт', names.join(' | '));
    ok(names.filter(n => /Мотоциклетный миномётный/.test(n)).length === 1,
        'ровно один миномётный расчёт — без дублей', names.join(' | '));
    ok(names.some(n => /Мотоциклетный Пулеметный расчёт/.test(n)),
        'мотоциклетный пулемётный расчёт остался рядом (как в v13.157)');
    ok(platoon && platoon.col === 5 && platoon.row === 6, 'позиция взвода сохранена (5,6)',
        platoon && `${platoon.col},${platoon.row}`);
    ok(platoon && platoon.ap === 2 && platoon.operationalMorale === 71,
        'состояние взвода (ОД, дух) перенесено', platoon && `${platoon.ap}/${platoon.operationalMorale}`);
    const firstSquad = (platoon && platoon.squads || []).find(sq => /Самокатное отделение №1/.test(sq.name || ''));
    ok(firstSquad && firstSquad.fighters && firstSquad.fighters[0].hp === 1,
        'потерянный боец не «ожил» — состояние отделения сохранено',
        firstSquad && JSON.stringify(firstSquad.fighters));
    const mortar = (platoon && platoon.squads || []).find(sq => /Мотоциклетный миномётный/.test(sq.name || ''));
    ok(mortar && Array.isArray(mortar.fighters) && mortar.fighters.length === 3,
        'у нового расчёта полный состав — 3 бойца', mortar && (mortar.fighters || []).length);
    ok(mortar && mortar.crewInstances && mortar.crewInstances[0] &&
        mortar.crewInstances[0].weaponName === 'Минометный расчёт 50мм DBT',
        'новый расчёт вооружён 50-мм миномётом DBT');
    ok(mortar && mortar.icon === 'images/BeVe/мотоцикл беве 1 мин.png',
        'в карточке взвода у расчёта его иконка', mortar && mortar.icon);
    ok(!s.logs.some(l => /syncReconPlatoonSquads is not defined|syncReconPlatoonTemplates is not defined/.test(l)),
        'в сборке нет ошибок миграции', s.logs.filter(l => /is not defined/.test(l)).join(' | '));

    // повторная сборка в той же сессии не должна дублировать расчёт
    const before = (platoon.squads || []).length;
    s.evalCtx('buildOperationalUnits()');
    const platoon2 = (ad.campaign.opUnits || []).find(u => /1-й самокатный взвод/.test(u.name || ''));
    ok(((platoon2 && platoon2.squads) || []).length === before,
        'повторная сборка не дублирует отряды', `${before} → ${((platoon2 && platoon2.squads) || []).length}`);
    ok(((platoon2 && platoon2.squads) || []).filter(sq => /Мотоциклетный миномётный/.test(sq.name || '')).length === 1,
        'миномётный расчёт по-прежнему один');
}

// ───────────── 9. враг: пересборка не теряет позиции ─────────────
{
    // шаг 1: обычная сборка — получаем реальные имена вражеских юнитов
    const ad = freshAppData();
    ad.campaign.playerFaction = 'BeVe';
    ad.campaign.battalions.player = { faction: 'BeVe', presetSig: getPresetSigFor('BeVe'), units: [] };
    ad.campaign.battalions.enemy = { faction: 'A.I.R.F.', presetSig: 'old-v13157-signature', units: [] };
    const s = createSandbox(ad);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    s.evalCtx('buildOperationalUnits()');
    const enemy1 = ad.campaign.enemyOpUnits || [];
    ok(enemy1.length > 0, 'враг создан', enemy1.length);

    // шаг 2: игрок расставил врага; теперь «обновление версии» меняет сигнатуру пресета
    enemy1[0].col = 12; enemy1[0].row = 4; enemy1[0].isDefending = true; enemy1[0].ap = 3;
    enemy1[1].col = 13; enemy1[1].row = 7; enemy1[1].ap = 1;
    const firstName = enemy1[0].name, secondName = enemy1[1].name;
    ad.campaign.battalions.enemy.presetSig = 'old-v13157-signature';
    ad.campaign.enemyOpUnitsSignature = 'old';

    s.evalCtx('buildOperationalUnits()');
    const enemy2 = ad.campaign.enemyOpUnits || [];
    const a = enemy2.find(u => u.name === firstName);
    const b = enemy2.find(u => u.name === secondName);
    ok(enemy2.length > 0, 'враг пересобран после смены пресета', enemy2.length);
    ok(!!a && a.col === 12 && a.row === 4,
        `позиция «${firstName}» сохранена (12,4)`, a && `${a.col},${a.row}`);
    ok(!!a && a.isDefending === true, 'состояние «в обороне» сохранено');
    ok(!!a && a.ap === 3, 'ОД юнита сохранены', a && a.ap);
    ok(!!b && b.col === 13 && b.row === 7, `позиция «${secondName}» сохранена (13,7)`, b && `${b.col},${b.row}`);
    ok(!s.logs.some(l => /is not defined/.test(l)), 'ошибок миграции у врага нет',
        s.logs.filter(l => /is not defined/.test(l)).join(' | '));
}

console.log(`\nИтог v13.158 (мото-миномёты): PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
