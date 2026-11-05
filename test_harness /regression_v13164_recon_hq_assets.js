'use strict';
// ⚡ v13.164 — замечания пользователя по разведке:
//   1) у штаба батальона A.I.R.F. не выбирался Hidalgo (и у него было 0 бойцов
//      вместо 2) — приказ на разведку отдать было нельзя;
//   2) то же у развед. взвода A.I.R.F.;
//   3) в карточке КАЖДОГО взвода показывались чужие развед-активы;
//   4) у BeVe не было приказа на разведку для бронеавтомобилей.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction: extractFn, sliceConst: extractConst, HTML } = require('./extract');
const ROOT = path.join(__dirname, '..');
const RECON_SRC = fs.readFileSync(path.join(ROOT, 'js/recon.js'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
const CURRENT_VERSION = (/var APP_VERSION = '([^']+)'/.exec(HTML) || [])[1] || '';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}

const FNS = [
    'isBattalionHqUnit', 'pruneOpUnitRiders', 'opHqReconSquadSpecs', 'opHqReconSquadMatches',
    'opReconSquadInstance', 'opRepairSquadFighters', 'isReconPlatoonUnit', 'isReconPlatoonPart',
    'splitReconPlatoon', 'reconSplitRecords', 'cloneJsonSafe', 'assignUniqueCrewKeys', 'cloneTemplate'
];
const parts = [extractConst(HTML, 'OP_HQ_RECON_SQUADS')];
FNS.forEach(f => { try { parts.push(extractFn(HTML, f)); } catch (e) { console.log('  (нет функции ' + f + ')'); } });
fs.writeFileSync('/tmp/wg_part.js', parts.join('\n\n'));

const STUBS = `
var currentTurn = 1;
function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }
function opLineOfSightBlocked() { return false; }
function isNightTime() { return false; }
function rollD10() { return 6; }
function isHexInPlayableArea() { return true; }
function getOpHexNeighbors(col, row) { return [{ col: col + 1, row: row }]; }
function opDetectionIsArmored() { return false; }
function hasRadio() { return true; }
function tacticalSmokeBlocksSight() { return false; }
function tacticalIlluminationActive() { return false; }
function onlineRevealEnemy(u, t) { u.revealedUntil = t; }
function addOperationalArtilleryNoise() { return []; }
function isArmoredUnit() { return false; }
function isStaticOpUnit(u) { return !!(u && u.type === 'dots'); }
appData.campaign.opMapGrid = {
  '5,5': ['road'], '6,5': ['road'], '7,5': ['bushes'], '8,5': ['forest'], '9,5': ['grass']
};
appData.campaign.opCenters = [
  { key: '5,5', x: 0, y: 0 }, { key: '6,5', x: 60, y: 0 }, { key: '7,5', x: 120, y: 0 },
  { key: '8,5', x: 180, y: 0 }, { key: '9,5', x: 240, y: 0 }
];
`;

function makeSandbox(faction, unitsJs) {
    const ad = freshAppData();
    ad.campaign.playerFaction = faction;
    ad.campaign.battalions.player = { faction: faction, units: [] };
    ad.campaign.battalions.enemy = { faction: faction === 'A.I.R.F.' ? 'BeVe' : 'A.I.R.F.', units: [] };
    const s = createSandbox(ad);
    s.run(RECON_SRC);
    s.run('appData.templates = SQUAD_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));');
    s.run(STUBS);
    s.run(`
appData.campaign.opUnits = ${unitsJs};
initReconAssets();
`);
    return { s, ad };
}

console.log('== v13.164: разведприказы — Hidalgo, развед. взвод, свои активы, БА ==');

// ───────────────────── 1. штаб A.I.R.F.: Hidalgo и 2 бойца ─────────────────────
{
    // отряд Hidalgo в старом сейве был добавлен «пустым» (без расчёта)
    const { s } = makeSandbox('A.I.R.F.', `[
        { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'A.I.R.F.', col: 5, row: 5,
          squads: [{ name: 'AL-41 Hidalgo' }] },
        { name: 'Развед. взвод', type: 'recon_platoon', faction: 'A.I.R.F.', col: 5, row: 5,
          squads: [{ name: 'Развед. отделение №1', fighters: [{ hp: 3 }] }] }
    ]`);
    const templateFighters = s.evalCtx("(SQUAD_TEMPLATES.find(t => t.name === 'AL-41 Hidalgo') || {}).fighters.length");
    ok(templateFighters === 2, 'в шаблоне AL-41 Hidalgo 2 бойца (водитель + наблюдатель)', templateFighters);

    ok(s.evalCtx('pruneOpUnitRiders() > 0'), 'загрузка похода замечает «пустой» отряд штаба');
    ok(s.evalCtx("(appData.campaign.opUnits[0].squads.find(sq => /Hidalgo/i.test(sq.name)).fighters || []).length") === 2,
        'у Hidalgo в расчёте 2 бойца',
        s.evalCtx("JSON.stringify((appData.campaign.opUnits[0].squads.find(sq => /Hidalgo/i.test(sq.name)).fighters || []).map(f => f.name))"));
    ok(/Hidalgo GL-41/.test(s.evalCtx("String((appData.campaign.opUnits[0].squads.find(sq => /Hidalgo/i.test(sq.name)) || {}).icon)")),
        'отряду вернулась иконка машины');

    // свои активы штаба
    const ownHq = JSON.parse(s.evalCtx('JSON.stringify(getOwnReconAssetList(0))'));
    ok(ownHq.length === 1 && ownHq[0].key === 'airf_hidalgo',
        'у штаба A.I.R.F. свой актив — AL-41 Hidalgo', JSON.stringify(ownHq.map(a => a.key)));
    ok(ownHq[0] && ownHq[0].available === 1, 'Hidalgo доступен для приказа');

    // приказ реально отправляется
    s.run('openReconMissionModalForAsset(0, "airf_hidalgo");');
    ok(s.evalCtx('reconDraft.assetKey') === 'airf_hidalgo' && s.evalCtx('reconDraft.unitId') === 0,
        'кнопка штаба открывает миссию именно на Hidalgo');
    ok(s.evalCtx('reconDraft.squadName') === 'AL-41 Hidalgo', 'источник — отряд штаба');
    s.run('handleReconRouteDraftClick(60, 0, 55);');
    const mission = JSON.parse(s.evalCtx('JSON.stringify(reconSubmitMission() || null)'));
    ok(!!mission && mission.assetKey === 'airf_hidalgo',
        'миссия на Hidalgo создаётся', JSON.stringify(mission && mission.assetKey));
    ok(mission && mission.unitId === 0 && mission.squadName === 'AL-41 Hidalgo',
        'в миссии записан штаб и его отряд');
    ok(s.evalCtx("!!(appData.campaign.opUnits[0].squads.find(sq => /Hidalgo/i.test(sq.name)) || {}).onReconMission") === true,
        'отряд штаба помечен «на задании»');
    ok(s.evalCtx('appData.campaign.reconAssets.airf_hidalgo.available') === 0, 'пул показывает занятость актива');

    // второй приказ тому же активу не пройдёт
    ok(s.evalCtx("(function(){ openReconMissionModalForAsset(0, 'airf_hidalgo'); handleReconRouteDraftClick(60, 0, 55); return reconSubmitMission(); })()") === null,
        'занятый актив второй миссии не даёт');
}

// ───────────────────── 2. развед. взвод A.I.R.F. ─────────────────────
{
    const { s } = makeSandbox('A.I.R.F.', `[
        { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'A.I.R.F.', col: 5, row: 5, squads: [] },
        { name: 'Развед. взвод', type: 'recon_platoon', faction: 'A.I.R.F.', col: 5, row: 5,
          squads: [{ name: 'Развед. отделение №1', fighters: [{ hp: 3 }] },
                   { name: 'Развед. отделение №2', fighters: [{ hp: 3 }] }] }
    ]`);
    const ownPlatoon = JSON.parse(s.evalCtx('JSON.stringify(getOwnReconAssetList(1))'));
    ok(ownPlatoon.length === 1 && ownPlatoon[0].key === 'airf_recon_platoon',
        'у развед. взвода свой актив', JSON.stringify(ownPlatoon.map(a => a.key)));
    s.run('openReconMissionModalForAsset(1, "airf_recon_platoon");');
    s.run('handleReconRouteDraftClick(60, 0, 55);');
    const mission = JSON.parse(s.evalCtx('JSON.stringify(reconSubmitMission() || null)'));
    ok(!!mission && mission.assetKey === 'airf_recon_platoon' && mission.unitId === 1,
        'миссия развед. взводу создаётся', JSON.stringify(mission && mission.assetKey));
    ok(s.evalCtx('!!appData.campaign.opUnits[1].reconMissionId') === true ||
       s.evalCtx('!!(appData.campaign.opUnits[1].squads[0] || {}).onReconMission') === true,
        'взвод (или его отделение) помечен как актив на задании');

    // после деления на отделения у каждого своя миссия
    const { s: s2 } = makeSandbox('A.I.R.F.', `[
        { name: 'Развед. взвод', type: 'recon_platoon', faction: 'A.I.R.F.', col: 5, row: 5,
          squads: [{ name: 'Развед. отделение №1', fighters: [{ hp: 3 }] },
                   { name: 'Развед. отделение №2', fighters: [{ hp: 3 }] }] }
    ]`);
    s2.run('splitReconPlatoon(appData.campaign.opUnits[0]);');
    const partsOwn = JSON.parse(s2.evalCtx("JSON.stringify((appData.campaign.opUnits || []).map((u, i) => getOwnReconAssetList(i).map(a => a.key)))"));
    ok(partsOwn.length === 2 && partsOwn.every(list => list.length === 1 && list[0] === 'airf_recon_platoon'),
        'у каждого отделения свой развед-актив', JSON.stringify(partsOwn));
    s2.run('openReconMissionModalForAsset(0, "airf_recon_platoon"); handleReconRouteDraftClick(60, 0, 55);');
    const m2 = JSON.parse(s2.evalCtx('JSON.stringify(reconSubmitMission() || null)'));
    ok(!!m2 && m2.unitId === 0, 'отделение получает собственную миссию', JSON.stringify(m2 && m2.unitId));
}

// ───────────────────── 3. в карточке — только свои разведчики ─────────────────────
{
    const { s } = makeSandbox('BeVe', `[
        { name: 'Штаб батальона', type: 'hq', faction: 'BeVe', col: 5, row: 5, squads: [
            { name: 'Мотоциклист-разведчик', fighters: [{ hp: 3 }] },
            { name: 'Мотоциклист-посыльный', fighters: [{ hp: 3 }] } ] },
        { name: '1-й взвод (бельг.)', type: 'infantry_platoon', faction: 'BeVe', col: 6, row: 5,
          squads: [{ name: 'Пехотное отделение №1 Бельгийцы', fighters: [{ hp: 3 }] }] },
        { name: 'Бронеавтомобиль Landsverk 183 №1', type: 'vehicle', faction: 'BeVe', col: 7, row: 5,
          squads: [{ name: 'Бронеавтомобиль Landsverk 183 №1', fighters: [{ hp: 3 }] }] }
    ]`);
    ok(s.evalCtx("JSON.stringify(getOwnReconAssetList(0).map(a => a.key))") === '["beve_motorcycle_scout"]',
        'у штаба BeVe — только мотоциклист-разведчик (посыльный не разведует)',
        s.evalCtx("JSON.stringify(getOwnReconAssetList(0).map(a => a.key))"));
    ok(s.evalCtx('getOwnReconAssetList(1).length') === 0,
        'у обычного пехотного взвода чужих активов НЕ показывается');
    ok(s.evalCtx("JSON.stringify(getOwnReconAssetList(2).map(a => a.key))") === '["beve_armored_car"]',
        'у бронеавтомобиля — только свой актив',
        s.evalCtx("JSON.stringify(getOwnReconAssetList(2).map(a => a.key))"));

    // карточка юнита: блок разведки строится по своим активам
    ok(/const own = getOwnReconAssetList\(unit\) \|\| \[\];/.test(HTML),
        'карточка берёт активы ТОЛЬКО выбранного юнита');
    ok(/if \(!own\.length\) return '';/.test(HTML),
        'у взвода без своих разведчиков блока «🔍 Разведка» нет');
    ok(!/const names = list\.map\(item =>/.test(HTML),
        'общий список активов батальона из карточки убран');
}

// ───────────────────── 4. бронеавтомобили BeVe ─────────────────────
{
    const { s } = makeSandbox('BeVe', `[
        { name: 'Бронеавтомобиль Landsverk 183 №1', type: 'vehicle', faction: 'BeVe', col: 5, row: 5,
          squads: [{ name: 'Бронеавтомобиль Landsverk 183 №1', fighters: [{ hp: 3 }] }] },
        { name: 'Отряд Бронеавтомобиль (2шт)', type: 'vehicle', isGroup: true, groupSize: 2, vehicleList: [{}],
          col: 5, row: 5, squads: [{ name: 'Бронеавтомобиль Landsverk 183 №2' }] },
        { name: 'Легкий танк CL/39 №1', type: 'tank_platoon', faction: 'BeVe', col: 6, row: 5,
          squads: [{ name: 'Легкий танк CL/39 №1', fighters: [{ hp: 3 }] }] }
    ]`);
    ok(s.evalCtx('RECON_ASSET_TYPES.beve_armored_car.canRecon') === true,
        'бронеавтомобиль BeVe — разведывательный актив');
    ok(s.evalCtx("getReconSpeed('armored_car', 'road')") === 4 &&
       s.evalCtx("getReconSpeed('armored_car', 'grass')") === 4 &&
       s.evalCtx("getReconSpeed('armored_car', 'bushes')") === 4,
        'подвижность БА: дорога/трава/кусты 4');
    ok(s.evalCtx("getReconSpeed('armored_car', 'forest')") === 0,
        'в лес бронеавтомобиль не разведует (лес недоступен)');
    ok(s.evalCtx('appData.campaign.reconAssets.beve_armored_car.total') === 1,
        'слитая группа машин активом не считается — только отдельная машина',
        s.evalCtx('appData.campaign.reconAssets.beve_armored_car.total'));
    ok(s.evalCtx('getOwnReconAssetList(1).length') === 0, 'у слитой группы своих активов нет');
    ok(s.evalCtx('getOwnReconAssetList(2).length') === 0, 'танк развед-активом не считается');

    s.run('openReconMissionModalForAsset(0, "beve_armored_car");');
    const draft = JSON.parse(s.evalCtx('JSON.stringify(reconDraft)'));
    ok(draft.assetKey === 'beve_armored_car' && draft.squadName === null,
        'приказ отдаётся самой машине (не отряду при штабе)', JSON.stringify({ key: draft.assetKey, squad: draft.squadName }));
    s.run('handleReconRouteDraftClick(60, 0, 55); handleReconRouteDraftClick(120, 0, 55);');
    const mission = JSON.parse(s.evalCtx('JSON.stringify(reconSubmitMission() || null)'));
    ok(!!mission && mission.assetKey === 'beve_armored_car' && mission.unitId === 0,
        'миссия бронеавтомобилю создаётся');
    ok(s.evalCtx('!!appData.campaign.opUnits[0].reconMissionId') === true, 'машина помечена как актив на задании');
    s.run('advanceReconMissions();');
    ok(s.evalCtx("appData.campaign.opUnits[0].col + ',' + appData.campaign.opUnits[0].row") === '7,5',
        'машина сама едет по маршруту разведки',
        s.evalCtx("appData.campaign.opUnits[0].col + ',' + appData.campaign.opUnits[0].row"));
}

// ───────────────────── 5. пул активов восстанавливается сам ─────────────────────
{
    const { s } = makeSandbox('A.I.R.F.', `[
        { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'A.I.R.F.', col: 5, row: 5,
          squads: [{ name: 'AL-41 Hidalgo', fighters: [{ hp: 3 }, { hp: 3 }] }] }
    ]`);
    // как в старом сейве: пул остался от прежнего состава
    s.run('appData.campaign.reconAssets = { airf_hidalgo: { total: 0, available: 0 }, airf_recon_platoon: { total: 0, available: 0 } };');
    ok(s.evalCtx('getOwnReconAssetList(0).length') === 1 && s.evalCtx('getOwnReconAssetList(0)[0].available') === 1,
        'устаревший пул пересчитывается при открытии карточки');
    s.run('appData.campaign.reconAssets.airf_hidalgo = { total: 0, available: 0 };');
    ok(s.evalCtx("getReconAssetList().map(a => a.key).indexOf('airf_hidalgo') >= 0"),
        'актив снова попадает в общий список панели разведки');
    ok(/function syncReconAssetPool\(/.test(RECON_SRC), 'в js/recon.js есть пересчёт пула');
    ok(/function initReconAssets\(\) \{\s*\n\s*return syncReconAssetPool\(\);/.test(RECON_SRC),
        'initReconAssets делeгирует в пересчёт пула');
    // штаб узнаётся и при суффиксе в имени (старые сейвы)
    ok(/\^Штаб\\s\+батальона\(\?:/.test(HTML.slice(HTML.indexOf('function isBattalionHqUnit'), HTML.indexOf('function isBattalionHqUnit') + 900)),
        'штаб батальона узнаётся и при суффиксе в имени');
    // при загрузке похода пул пересчитывается после чистки состава
    const loadBlock = HTML.slice(HTML.indexOf('pruneOpUnitRiders === \'function\''), HTML.indexOf('pruneOpUnitRiders === \'function\'') + 1200);
    ok(/initReconAssets\(\)/.test(loadBlock),
        'после чистки состава при загрузке пул активов пересчитывается');
}

// ───────────────────── 6. версия сборки (без фиксации номера) ─────────────────────
{
    ok(/^v\d+\.\d+$/.test(CURRENT_VERSION), 'APP_VERSION найден', CURRENT_VERSION);
    ok(SW.indexOf(`const CACHE_NAME = 'wargame-${CURRENT_VERSION}'`) >= 0, 'CACHE_NAME совпадает с APP_VERSION');
    ok(MANIFEST.indexOf(`"short_name": "БМ ${CURRENT_VERSION}"`) >= 0, 'manifest.short_name совпадает с APP_VERSION');
    const markers = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))
        .filter(f => new RegExp('BUILD-МАРКЕР: ' + CURRENT_VERSION.replace(/\./g, '\\.')).test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')));
    ok(markers.length >= 10, 'BUILD-маркеры js/*.js совпадают с APP_VERSION', markers.length);
}

// общий /tmp/wg_part.js — подчищаем (его подгружают следующие песочницы)
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

console.log(`\nИтог v13.164 (разведприказы: Hidalgo, развед. взвод, свои активы, БА): PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
