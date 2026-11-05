'use strict';
// ⚡ v13.161: лёгкий автомобиль AL-41 Hidalgo (разведка A.I.R.F.) живёт ТОЛЬКО
//   при штабе батальона A.I.R.F. — из всех взводов и прочих юнитов он убран,
//   в том числе в уже начатых походах.
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
    'isBattalionHqUnit', 'pruneOpUnitRiders', 'opHqReconSquadSpecs', 'opHqReconSquadMatches',
    'syncReconPlatoonSquads', 'syncReconPlatoonTemplates',
    'isBicyclePlatoonPreset', 'isMotorcyclePlatoonPreset', 'motorcyclePresetPlatoon',
    'generateBattalion', 'cloneTemplate', 'getPresetSignature', 'getBattalionSignature',
    'assignUniqueCrewKeys', 'buildOperationalUnits', 'createEnemyOperationalUnits',
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

const HIDALGO_RE = /Hidalgo/i;
const hidalgoIn = unit => ((unit && unit.squads) || []).filter(sq => sq && HIDALGO_RE.test(String(sq.name || '')));
const platoonHidalgo = unit => ((unit && unit.platoons) || [])
    .reduce((n, pl) => n + ((pl && pl.squads) || []).filter(sq => sq && HIDALGO_RE.test(String(sq.name || ''))).length, 0);

function makeSandbox(playerFaction, prepare) {
    const enemy = playerFaction === 'A.I.R.F.' ? 'BeVe' : 'A.I.R.F.';
    const ad = freshAppData();
    ad.campaign.playerFaction = playerFaction;
    ad.campaign.battalions.player = { faction: playerFaction, units: [] };
    ad.campaign.battalions.enemy = { faction: enemy, units: [] };
    ad.campaign.opUnitsSignature = 'old';
    const s = createSandbox(ad);
    s.run(RECON_SRC);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    if (prepare) prepare(s, ad);
    return { s, ad };
}

console.log('== v13.161: AL-41 Hidalgo только при штабе батальона A.I.R.F. ==');

// ───────────── 1. пресет A.I.R.F. ─────────────
{
    const { s } = makeSandbox('BeVe');
    const rows = JSON.parse(s.evalCtx(`JSON.stringify((BATTALION_PRESETS['A.I.R.F.'].standard || []).map(u => ({
        name: u.name, type: u.type,
        own: (u.squads || []).filter(sq => /Hidalgo/i.test(sq.name)).map(sq => sq.name),
        platoons: (u.platoons || []).filter(pl => (pl.squads || []).some(sq => /Hidalgo/i.test(sq.name))).map(pl => pl.name)
    })))`));
    const owners = rows.filter(u => u.own.length);
    ok(owners.length === 1, 'Hidalgo есть ровно у одного юнита пресета', owners.map(u => u.name).join(', '));
    ok(owners[0] && /^Штаб Батальона$/i.test(owners[0].name), 'этот юнит — штаб батальона', owners[0] && owners[0].name);
    ok(owners[0] && owners[0].own.length === 1, 'ровно один Hidalgo, без дублей', owners[0] && owners[0].own.join(', '));
    ok(rows.every(u => u.platoons.length === 0), 'ни в одном взводе пресета Hidalgo нет',
        rows.flatMap(u => u.platoons).join(', '));
    ok(JSON.parse(s.evalCtx(`JSON.stringify(BATTALION_PRESETS['BeVe'].standard.flatMap(u =>
        [...(u.squads || []), ...(u.platoons || []).flatMap(pl => pl.squads || [])]
            .filter(sq => /Hidalgo/i.test(sq.name)).map(sq => sq.name)))`)).length === 0,
        'у BeVe Hidalgo не появляется');
}

// ───────────── 2. старый сейв игрока-АИРФ ─────────────
{
    const { s, ad } = makeSandbox('A.I.R.F.');
    s.evalCtx('buildOperationalUnits()');
    const hqBefore = (ad.campaign.opUnits || []).find(u => /^Штаб Батальона$/i.test(u.name));
    ok(!!hqBefore && hidalgoIn(hqBefore).length === 1, 'в новом походе Hidalgo сразу при штабе');

    // имитируем старый сейв: Hidalgo раскидан по взводам и юнитам карты
    s.run(`appData.campaign.opUnits.forEach((u, i) => {
        if (i % 2 === 0 && !/^Штаб Батальона$/i.test(u.name)) (u.squads = u.squads || []).push({ name: 'AL-41 Hidalgo', templateName: 'AL-41 Hidalgo' });
    });
    appData.campaign.battalions.player.units.forEach(u => {
        if (u.type === 'hq' && /^Штаб Батальона$/i.test(u.name)) return;
        (u.squads = u.squads || []).push({ name: 'AL-41 Hidalgo', templateName: 'AL-41 Hidalgo' });
        (u.platoons || []).forEach(pl => pl.squads.push({ name: 'AL-41 Hidalgo', templateName: 'AL-41 Hidalgo' }));
    });
    appData.campaign.opUnitsSignature = getBattalionSignature(appData.campaign.battalions.player);`);
    const before = (ad.campaign.opUnits || []).filter(u => hidalgoIn(u).length).length;
    ok(before > 1, 'в старом сейве Hidalgo есть у многих юнитов карты', before);
    s.evalCtx('buildOperationalUnits()');
    const withHidalgo = (ad.campaign.opUnits || []).filter(u => hidalgoIn(u).length);
    ok(withHidalgo.length === 1 && /^Штаб Батальона$/i.test(withHidalgo[0].name),
        'после загрузки Hidalgo остался только у штаба батальона',
        withHidalgo.map(u => u.name).join(', '));
    ok(hidalgoIn(withHidalgo[0]).length === 1, 'и не задвоился', hidalgoIn(withHidalgo[0]).length);
    const bat = ad.campaign.battalions.player.units;
    ok(bat.every(u => platoonHidalgo(u) === 0), 'во взводах батальона Hidalgo нет',
        bat.filter(u => platoonHidalgo(u)).map(u => u.name).join(', '));
    const batOwners = bat.filter(u => hidalgoIn(u).length);
    ok(batOwners.length === 1 && /^Штаб Батальона$/i.test(batOwners[0].name),
        'в батальоне Hidalgo только у штаба', batOwners.map(u => u.name).join(', '));

    // повторный запуск — без изменений и дублей
    const snapshot = JSON.stringify((ad.campaign.opUnits || []).map(u => [u.name, hidalgoIn(u).map(sq => sq.name)]));
    s.evalCtx('pruneOpUnitRiders()');
    ok(JSON.stringify((ad.campaign.opUnits || []).map(u => [u.name, hidalgoIn(u).map(sq => sq.name)])) === snapshot,
        'повторная чистка ничего не меняет');
}

// ───────────── 3. штаб без Hidalgo и дубли у штаба ─────────────
{
    const { s, ad } = makeSandbox('A.I.R.F.');
    s.evalCtx('buildOperationalUnits()');
    s.run(`const hq = appData.campaign.opUnits.find(u => /^Штаб Батальона$/i.test(u.name));
        hq.squads = (hq.squads || []).filter(sq => !/Hidalgo/i.test(sq.name));`);
    s.evalCtx('pruneOpUnitRiders()');
    const hq = (ad.campaign.opUnits || []).find(u => /^Штаб Батальона$/i.test(u.name));
    ok(hidalgoIn(hq).length === 1, 'чистка вернула штабу Hidalgo', hidalgoIn(hq).length);
    ok(hidalgoIn(hq)[0] && hidalgoIn(hq)[0].templateName === 'AL-41 Hidalgo',
        'у восстановленного отряда есть templateName для боя', hidalgoIn(hq)[0] && hidalgoIn(hq)[0].templateName);

    s.run(`hq.squads.push({ name: 'AL-41 Hidalgo', templateName: 'AL-41 Hidalgo' });
        hq.squads.push({ name: 'AL-41 Hidalgo №2', templateName: 'AL-41 Hidalgo' });`);
    s.evalCtx('pruneOpUnitRiders()');
    ok(hidalgoIn(hq).length === 1, 'дубли Hidalgo у штаба схлопываются в один', hidalgoIn(hq).map(sq => sq.name).join(', '));
}

// ───────────── 4. разведка A.I.R.F. ─────────────
{
    const { s, ad } = makeSandbox('A.I.R.F.');
    s.evalCtx('buildOperationalUnits()');
    s.run(`appData.campaign.opUnits.forEach(u => {
        if (!/^Штаб Батальона$/i.test(u.name)) (u.squads = u.squads || []).push({ name: 'AL-41 Hidalgo', templateName: 'AL-41 Hidalgo' });
    });`);
    s.run('initReconAssets();');
    ok(s.evalCtx('appData.campaign.reconAssets.airf_hidalgo.total') > 1,
        'до чистки активов Hidalgo несколько', s.evalCtx('appData.campaign.reconAssets.airf_hidalgo.total'));
    s.evalCtx('pruneOpUnitRiders()');
    s.run('initReconAssets();');
    ok(s.evalCtx('appData.campaign.reconAssets.airf_hidalgo.total') === 1,
        'после чистки развед-актив Hidalgo ровно один', s.evalCtx('appData.campaign.reconAssets.airf_hidalgo.total'));

    const sources = JSON.parse(s.evalCtx(`JSON.stringify(reconListAssetSources()
        .filter(x => x.assetKey === 'airf_hidalgo')
        .map(x => ({ name: x.name, unit: (appData.campaign.opUnits[x.unitId] || {}).name, squadName: x.squadName })))`));
    ok(sources.length === 1, 'в источниках актива один Hidalgo', JSON.stringify(sources));
    ok(sources[0] && /^Штаб Батальона$/i.test(sources[0].unit),
        'источник актива — штаб батальона', sources[0] && sources[0].unit);
    ok(sources[0] && sources[0].squadName === 'AL-41 Hidalgo',
        'актив привязан к отряду внутри штаба', sources[0] && sources[0].squadName);
    // миссия от отряда не двигает штаб
    s.run(`globalThis.mis = createReconMission({ assetKey: 'airf_hidalgo', unitId: 0, route: [{ col: 2, row: 12 }], observeMode: 'pass', reportMethod: 'radio' });`);
    ok(s.evalCtx('!!mis && mis.status === "active"'), 'миссия Hidalgo создаётся');
    ok(s.evalCtx('mis.unitId') === 0 || /^Штаб Батальона$/i.test((ad.campaign.opUnits[s.evalCtx('mis.unitId')] || {}).name),
        'миссия привязана к штабу батальона');
}

// ───────────── 5. игрок за BeVe: у врага-АИРФ тоже порядок ─────────────
{
    const { s, ad } = makeSandbox('BeVe');
    s.evalCtx('buildOperationalUnits()');
    s.evalCtx('createEnemyOperationalUnits()');
    ok((ad.campaign.enemyOpUnits || []).length > 0, 'вражеские юниты созданы', (ad.campaign.enemyOpUnits || []).length);
    s.run(`appData.campaign.enemyOpUnits.forEach((u, i) => {
        if (i % 3 !== 0) (u.squads = u.squads || []).push({ name: 'AL-41 Hidalgo', templateName: 'AL-41 Hidalgo' });
    });`);
    const before = (ad.campaign.enemyOpUnits || []).filter(u => hidalgoIn(u).length).length;
    ok(before > 1, 'у врага Hidalgo «размазан» по юнитам', before);
    s.evalCtx('pruneOpUnitRiders()');
    const withHidalgo = (ad.campaign.enemyOpUnits || []).filter(u => hidalgoIn(u).length);
    ok(withHidalgo.length === 1, 'у врага Hidalgo остался у одного юнита', withHidalgo.map(u => u.name).join(', '));
    ok(withHidalgo[0] && /^Штаб Батальона$/i.test(withHidalgo[0].name),
        'и это штаб батальона A.I.R.F.', withHidalgo[0] && withHidalgo[0].name);
    ok((ad.campaign.enemyOpUnits || []).every(u => platoonHidalgo(u) === 0), 'во взводах врага Hidalgo нет');
}

// ───────────── 6. Hidalgo не попадает к BeVe, мотоциклисты — не к АИРФ ─────────────
{
    const { s, ad } = makeSandbox('BeVe');
    ad.campaign.opUnits = [
        { name: '1-й взвод (бельг.)', type: 'infantry_platoon', faction: 'BeVe',
          squads: [{ name: 'Пехотное отделение №1 Бельгийцы' }, { name: 'AL-41 Hidalgo' }] },
        { name: 'Штаб батальона', type: 'hq', faction: 'BeVe', squads: [{ name: 'AL-41 Hidalgo' }, { name: 'Мотоциклист-разведчик' }] }
    ];
    ad.campaign.enemyOpUnits = [
        { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'A.I.R.F.', squads: [{ name: 'Мотоциклист-разведчик' }] }
    ];
    ad.campaign.opUnitsSignature = 'x';
    s.evalCtx('pruneOpUnitRiders()');
    ok(hidalgoIn(ad.campaign.opUnits[0]).length === 0, 'у бельгийского взвода Hidalgo убран');
    ok(hidalgoIn(ad.campaign.opUnits[1]).length === 0, 'у штаба BeVe Hidalgo тоже убран');
    ok(((ad.campaign.opUnits[1].squads || []).filter(sq => /^Мотоциклист-/.test(sq.name))).length === 2,
        'у штаба BeVe мотоциклисты на месте');
    ok(hidalgoIn(ad.campaign.enemyOpUnits[0]).length === 1, 'штабу A.I.R.F. Hidalgo выдан');
    ok(((ad.campaign.enemyOpUnits[0].squads || []).filter(sq => /^Мотоциклист-/.test(sq.name))).length === 0,
        'мотоциклистов у штаба A.I.R.F. нет');
}

// ───────────── 7. код и документация ─────────────
{
    ok(/function opHqReconSquadSpecs/.test(HTML) && /OP_HQ_RECON_SQUADS/.test(HTML),
        'есть таблица «отряды только при штабе батальона»');
    ok(/'A\.I\.R\.F\.': \[\s*\{ re: \/Hidalgo\/i, name: 'AL-41 Hidalgo' \}/.test(HTML),
        'в таблице прописан AL-41 Hidalgo для A.I.R.F.');
    ok(/pruneOpUnitRiders\(\)/.test(HTML), 'чистка вызывается при загрузке и сборке юнитов');
    const dataSrc = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
    ok(/HIDALGO_RE/.test(dataSrc), 'в data.js есть чистка пресета A.I.R.F.');
    ok(/const isAirfHq = unit\.type === 'hq'/.test(dataSrc), 'в data.js штаб A.I.R.F. распознан отдельно');
}

// Не оставляем за собой общий /tmp/wg_part.js: его подгружает каждая следующая
// песочница (sandbox.js), и объявленные здесь const могли конфликтовать с
// переменными других тестов.
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

console.log(`\nИтог v13.161 (Hidalgo только при штабе): PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
