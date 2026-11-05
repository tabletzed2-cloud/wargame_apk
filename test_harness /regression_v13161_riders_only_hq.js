'use strict';
// ⚡ v13.161: мотоциклист-разведчик и мотоциклист-посыльный BeVe живут ТОЛЬКО
//   при штабе батальона — в начатых походах они оставались в уже собранных
//   юнитах оперативной карты (opUnits пересобираются только при смене состава).
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
    'isBattalionHqUnit', 'pruneOpUnitRiders', 'opHqReconSquadSpecs', 'opHqReconSquadMatches', 'opReconSquadInstance', 'opRepairSquadFighters', 'syncReconPlatoonSquads', 'syncReconPlatoonTemplates',
    'isBicyclePlatoonPreset', 'isMotorcyclePlatoonPreset', 'motorcyclePresetPlatoon',
    'generateBattalion', 'cloneTemplate', 'getPresetSignature', 'getBattalionSignature',
    'assignUniqueCrewKeys', 'buildOperationalUnits', 'switchOperationalMapScreen',
    'pruneExtraArmoredCars', 'armoredCarPresetNames', 'cloneJsonSafe',
    'reapplyReconPlatoonSplits', 'reconSplitRecords', 'isReconPlatoonPart', 'isReconPlatoonUnit',
    'splitReconPlatoon', 'mergeReconPlatoonParts', 'syncSplitPlatoonCards',
    'operationalRadioSnapshot', 'operationalRadioRestore',
    'syncSupplySquadTemplates', 'migrateSupplySquadNames', 'supplySquadRenamed', 'isStaticOpUnit'
];
const CONSTS = ['RECON_PLATOON_SQUAD_TEMPLATES', 'MOTORCYCLE_SQUAD_RE', 'MOTORCYCLE_RIDER_RE', 'OP_HQ_RECON_SQUADS'];
const parts = CONSTS.map(c => { try { return extractConst(HTML, c); } catch (e) { return ''; } });
FNS.forEach(f => { try { parts.push(extractFn(HTML, f)); } catch (e) {} });
fs.writeFileSync('/tmp/wg_part.js', parts.join('\n\n'));

const RIDER_RE = /^Мотоциклист-/;
const ridersIn = unit => ((unit && unit.squads) || []).filter(sq => sq && RIDER_RE.test(String(sq.name || '')));

function beveSandbox(prepare) {
    const ad = freshAppData();
    ad.campaign.playerFaction = 'BeVe';
    ad.campaign.battalions.player = { faction: 'BeVe', units: [] };
    ad.campaign.battalions.enemy = { faction: 'A.I.R.F.', units: [] };
    ad.campaign.opUnitsSignature = 'old';
    const s = createSandbox(ad);
    s.run(RECON_SRC);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    if (prepare) prepare(s, ad);
    return { s, ad };
}

console.log('== v13.161: мотоциклист-разведчик только при штабе батальона ==');

// ───────────── 1. пресет ─────────────
{
    const { s } = beveSandbox();
    const rows = JSON.parse(s.evalCtx(`JSON.stringify((BATTALION_PRESETS['BeVe'].standard || []).map(u => ({
        name: u.name, type: u.type,
        own: (u.squads || []).filter(sq => /^Мотоциклист-/.test(sq.name)).map(sq => sq.name),
        platoons: (u.platoons || []).map(pl => ({ name: pl.name,
            riders: pl.squads.filter(sq => /^Мотоциклист-/.test(sq.name)).map(sq => sq.name) }))
    })))`));
    const owners = rows.filter(u => u.own.length);
    ok(owners.length === 1 && /^Штаб батальона$/i.test(owners[0].name),
        'в пресете мотоциклисты только у штаба батальона', owners.map(u => u.name).join(', '));
    ok(owners[0].own.length === 2 && owners[0].own.includes('Мотоциклист-разведчик') &&
       owners[0].own.includes('Мотоциклист-посыльный'),
        'у штаба батальона ровно разведчик и посыльный', owners[0].own.join(' + '));
    ok(rows.every(u => u.platoons.every(pl => pl.riders.length === 0)),
        'ни в одном взводе пресета мотоциклистов нет',
        rows.flatMap(u => u.platoons.filter(pl => pl.riders.length).map(pl => pl.name)).join(', '));
    ok(s.evalCtx(`isBattalionHqUnit({ type: 'hq', name: 'Штаб Батальона' })`) === true,
        'штаб батальона распознаётся и с заглавной «Батальона»');
    ok(s.evalCtx(`isBattalionHqUnit({ type: 'hq', name: 'Взвод снабжения' })`) === false,
        'другой штабной юнит (взвод снабжения) штабом батальона не считается');
}

// ───────────── 2. старый сейв: мотоциклисты в юнитах оперативной карты ─────────────
{
    const { s, ad } = beveSandbox();
    s.evalCtx('buildOperationalUnits()');
    // имитируем сейв v13.159: мотоциклисты «размазаны» по всем юнитам, состав не менялся
    s.run(`appData.campaign.opUnits.forEach((u, i) => {
        if (i % 3 === 0) return;
        u.squads = u.squads || [];
        u.squads.push({ name: 'Мотоциклист-разведчик', templateName: 'Мотоциклист-разведчик' });
    });
    appData.campaign.battalions.player.units.forEach(u => {
        if (u.type === 'hq' && /^Штаб батальона$/i.test(u.name)) return;
        u.squads = u.squads || [];
        u.squads.push({ name: 'Мотоциклист-разведчик', templateName: 'Мотоциклист-разведчик' });
        (u.platoons || []).forEach(pl => pl.squads.push({ name: 'Мотоциклист-посыльный' }));
    });
    appData.campaign.opUnitsSignature = getBattalionSignature(appData.campaign.battalions.player);`);
    const before = (ad.campaign.opUnits || []).filter(u => ridersIn(u).length).length;
    ok(before > 1, 'в старом сейве мотоциклисты есть у многих юнитов карты', before);
    s.evalCtx('buildOperationalUnits()');
    const withRiders = (ad.campaign.opUnits || []).filter(u => ridersIn(u).length);
    ok(withRiders.length === 1, 'после загрузки мотоциклисты остались у одного юнита',
        withRiders.map(u => u.name).join(', '));
    ok(withRiders[0] && /^Штаб [Бб]атальона$/i.test(withRiders[0].name),
        'этот юнит — штаб батальона', withRiders[0] && withRiders[0].name);
    ok(ridersIn(withRiders[0]).length === 2, 'у штаба батальона ровно двое', ridersIn(withRiders[0]).map(sq => sq.name).join(' + '));
    ok(withRiders[0].squads.filter(sq => /Мотоциклист-разведчик/.test(sq.name)).length === 1,
        'разведчик не задвоился');

    // батальон тоже вычищен
    const batRiders = JSON.parse(s.evalCtx(`JSON.stringify(appData.campaign.battalions.player.units.map(u => ({
        name: u.name,
        own: (u.squads || []).filter(sq => /^Мотоциклист-/.test(sq.name)).map(sq => sq.name),
        platoons: (u.platoons || []).filter(pl => (pl.squads || []).some(sq => /^Мотоциклист-/.test(sq.name))).map(pl => pl.name)
    })))`));
    const batOwners = batRiders.filter(u => u.own.length);
    ok(batOwners.length === 1 && /^Штаб [Бб]атальона$/i.test(batOwners[0].name),
        'в батальоне мотоциклисты только у штаба', batOwners.map(u => u.name).join(', '));
    ok(batRiders.every(u => u.platoons.length === 0), 'во взводах батальона мотоциклистов нет',
        batRiders.flatMap(u => u.platoons).join(', '));

    // повторный запуск ничего не меняет
    const snapshot = JSON.stringify((ad.campaign.opUnits || []).map(u => [u.name, ridersIn(u).map(sq => sq.name)]));
    s.evalCtx('pruneOpUnitRiders()');
    ok(JSON.stringify((ad.campaign.opUnits || []).map(u => [u.name, ridersIn(u).map(sq => sq.name)])) === snapshot,
        'повторная чистка ничего не меняет (нет дублей)');

    // развед-активы: разведчик один, посыльный один
    s.run('initReconAssets();');
    ok(s.evalCtx('appData.campaign.reconAssets.beve_motorcycle_scout.total') === 1,
        'развед-актив «мотоциклист-разведчик» один', s.evalCtx('appData.campaign.reconAssets.beve_motorcycle_scout.total'));
    ok(s.evalCtx('appData.campaign.reconAssets.beve_motorcycle_messenger.total') === 1,
        'актив «мотоциклист-посыльный» один', s.evalCtx('appData.campaign.reconAssets.beve_motorcycle_messenger.total'));
}

// ───────────── 3. штаб без мотоциклистов (сейв v13.159 и старше) ─────────────
{
    const { s, ad } = beveSandbox();
    s.evalCtx('buildOperationalUnits()');
    s.run(`const hq = appData.campaign.opUnits.find(u => /^Штаб [Бб]атальона$/i.test(u.name));
        hq.squads = (hq.squads || []).filter(sq => !/^Мотоциклист-/.test(sq.name));`);
    ok(ridersIn((ad.campaign.opUnits || []).find(u => /^Штаб [Бб]атальона$/i.test(u.name))).length === 0,
        'у штаба батальона мотоциклистов нет до чистки');
    s.evalCtx('pruneOpUnitRiders()');
    const hq = (ad.campaign.opUnits || []).find(u => /^Штаб [Бб]атальона$/i.test(u.name));
    ok(ridersIn(hq).length === 2, 'чистка вернула штабу разведчика и посыльного', ridersIn(hq).map(sq => sq.name).join(' + '));
    ok(ridersIn(hq).every(sq => sq.templateName), 'у восстановленных отрядов есть templateName для боя');
}

// ───────────── 4. игрок за A.I.R.F., BeVe — враг ─────────────
{
    const ad = freshAppData();
    ad.campaign.playerFaction = 'A.I.R.F.';
    ad.campaign.battalions.player = { faction: 'A.I.R.F.', units: [] };
    ad.campaign.battalions.enemy = { faction: 'BeVe', units: [] };
    ad.campaign.opUnits = [{ name: '1-й стрелковый взвод', type: 'infantry_platoon', faction: 'A.I.R.F.',
        squads: [{ name: 'Мотоциклист-разведчик' }, { name: 'Пехотное отделение №1 Голландцы' }] }];
    ad.campaign.enemyOpUnits = [
        { name: '1-й взвод (бельг.)', type: 'infantry_platoon', faction: 'BeVe',
          squads: [{ name: 'Пехотное отделение №1 Бельгийцы' }, { name: 'Мотоциклист-разведчик' }, { name: 'Мотоциклист-посыльный' }] },
        { name: 'Штаб батальона', type: 'hq', faction: 'BeVe', squads: [] }
    ];
    const s = createSandbox(ad);
    s.run(RECON_SRC);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    s.evalCtx('pruneOpUnitRiders()');
    ok(ridersIn(ad.campaign.opUnits[0]).length === 0,
        'у своих юнитов A.I.R.F. мотоциклистов тоже нет (они только в штабе BeVe)',
        ridersIn(ad.campaign.opUnits[0]).map(sq => sq.name).join(' + '));
    ok(ad.campaign.opUnits[0].squads.length === 1 &&
       /Пехотное отделение/.test(ad.campaign.opUnits[0].squads[0].name),
        'остальные отделения юнита A.I.R.F. целы', ad.campaign.opUnits[0].squads.map(sq => sq.name).join(' + '));
    ok(ridersIn(ad.campaign.enemyOpUnits[0]).length === 0,
        'у вражеского взвода BeVe мотоциклистов не осталось', ridersIn(ad.campaign.enemyOpUnits[0]).map(sq => sq.name).join(' + '));
    ok(ridersIn(ad.campaign.enemyOpUnits[1]).length === 2,
        'у вражеского штаба батальона BeVe мотоциклисты появились', ridersIn(ad.campaign.enemyOpUnits[1]).map(sq => sq.name).join(' + '));
}

// ───────────── 5. юнит без поля faction в старом сейве ─────────────
{
    const { s, ad } = beveSandbox();
    ad.campaign.opUnits = [
        { name: '2-й самокатный взвод', type: 'bicycle_platoon',
          squads: [{ name: 'Самокатное отделение №4' }, { name: 'Мотоциклист-разведчик' }] },
        { name: 'Штаб батальона', type: 'hq', squads: [{ name: 'Мотоциклист-разведчик' }] }
    ];
    ad.campaign.enemyOpUnits = [];
    ad.campaign.opUnitsSignature = 'x';
    s.evalCtx('pruneOpUnitRiders()');
    ok(ridersIn(ad.campaign.opUnits[0]).length === 0, 'юнит без faction (свои) вычищен');
    ok(ridersIn(ad.campaign.opUnits[1]).length === 2, 'штаб без faction получил обоих');
}

// ───────────── 6. код и интерфейс ─────────────
{
    ok(/function pruneOpUnitRiders/.test(HTML), 'есть функция pruneOpUnitRiders');
    ok(/pruneOpUnitRiders\(\)/.test(HTML), 'чистка вызывается при сборке оперативных юнитов');
    ok(/function isBattalionHqUnit/.test(HTML), 'есть общий хелпер isBattalionHqUnit');
    ok(/const isBattalionHQ = isBattalionHqUnit\(unit\)/.test(HTML),
        'миграция взводов использует тот же хелпер');
}

// Не оставляем за собой общий /tmp/wg_part.js: его подгружает каждая следующая
// песочница (sandbox.js), и объявленные здесь const могли конфликтовать с
// переменными других тестов.
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

console.log(`\nИтог v13.161 (мотоциклист только при штабе): PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
