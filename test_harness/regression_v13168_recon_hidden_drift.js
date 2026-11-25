'use strict';
// ⚡ v13.168 — «мотоциклист-разведчик пропадает с карты, и непонятно где он».
//
// Причина (найдена воспроизведением): `mission.unitId` — это ИНДЕКС в
// `appData.campaign.opUnits`, а индекс не стабилен. Приход подкрепления,
// слияние/разделение взводов, гибель юнита наверху списка сдвигают массив.
// После сдвига индекс указывал на ЧУЖОЙ юнит:
//   • `reconMissionSquad` не находил отделение → миссия «проваливалась»;
//   • тип актива помечался потерянным до конца операции (`reconLost`);
//   • флаг `reconHidden` оставался на отделении → разведчик исчезал с карты
//     навсегда, и найти его было нечем (иконки миссии тоже нет).
//
// Что проверяем:
//   1) носитель ищется по имени, индекс переписывается — миссия продолжается;
//   2) актив не «теряется» из-за сдвига массива;
//   3) «забытые» флаги скрытия лечатся каждый ход и при открытии панели;
//   4) по-настоящему погибший актив по-прежнему теряется (лечение не воскрешает);
//   5) на карте под иконкой актива видны координаты;
//   6) в карточке юнита-носителя видно, где разведчик, и его можно отозвать.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML } = require('./extract');
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
const J = (s, code) => s.evalCtx(`JSON.stringify(${code})`);

const STUBS = `
var currentTurn = 1;
function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }
function isHexInPlayableArea() { return true; }
function getOpHexNeighbors(col, row) {
  const parity = Math.abs(row) % 2;
  const offs = parity === 0
    ? [[1,0],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1]]
    : [[1,0],[1,1],[0,1],[-1,0],[0,-1],[1,-1]];
  return offs.map(o => ({ col: col + o[0], row: row + o[1] }))
    .filter(p => p.col >= 0 && p.col < 14 && p.row >= 0 && p.row < 14);
}
function opLineOfSightBlocked() { return false; }
function isNightTime() { return false; }
function rollD10() { return 6; }
function opDetectionIsArmored() { return true; }
function tacticalSmokeBlocksSight() { return false; }
function tacticalIlluminationActive() { return false; }
function addOperationalArtilleryNoise() {}
function operationalHexHasActiveBattle() { return false; }
`;
const HQ_WITH_SCOUT = `[
  { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'BeVe', col: 1, row: 1,
    squads: [{ name: 'Штаб', fighters: [{ hp: 3 }] },
             { name: 'Мотоциклист-разведчик', fighters: [{ hp: 1 }] }] },
  { name: 'Пехотный взвод', type: 'infantry_platoon', faction: 'BeVe', col: 6, row: 6,
    squads: [{ name: 'Отд', fighters: [{ hp: 3 }] }] }
]`;

function sandbox(unitsJs, extra) {
    const ad = freshAppData();
    ad.campaign.playerFaction = 'BeVe';
    const s = createSandbox(ad);
    s.run(RECON_SRC);
    s.run(STUBS);
    s.run(`
      const g = {};
      for (let c = 0; c < 14; c++) for (let r = 0; r < 14; r++) g[c + ',' + r] = { types: ['grass'] };
      appData.campaign.opMapGrid = g;
      appData.campaign.opUnits = ${unitsJs};
      initReconAssets();
      ${extra || ''}
    `);
    return s;
}
const scoutFlags = (s, hqIndex = 0) =>
    J(s, `(() => { const sq = appData.campaign.opUnits[${hqIndex}].squads.find(x => /Мотоциклист/.test(x.name)) || {}; return { on: sq.onReconMission || null, hidden: !!sq.reconHidden }; })()`);
const unitFlags = (s, index = 0) =>
    J(s, `({ mission: appData.campaign.opUnits[${index}].reconMissionId || null, hidden: !!appData.campaign.opUnits[${index}].reconHidden })`);

console.log('— 1. сдвиг opUnits: носитель ищется по имени, индекс переписывается —');
{
    const s = sandbox(HQ_WITH_SCOUT);
    s.run("openReconMissionModalForAsset(0, 'beve_motorcycle_scout'); reconDraft.route = [{col:5,row:5}]; reconSubmitMission();");
    ok(s.evalCtx('appData.campaign.reconMissions[0].unitName') === 'Штаб Батальона',
        'в миссии запомнено имя носителя (стабильный ключ)',
        s.evalCtx('appData.campaign.reconMissions[0].unitName'));
    // подкрепление встаёт в начало списка — все индексы съезжают на 1
    s.run(`
      appData.campaign.opUnits.unshift({ name: 'Подкрепление', type: 'infantry_platoon', faction: 'BeVe',
        col: 9, row: 9, squads: [{ name: 'Отд', fighters: [{ hp: 3 }] }] });
      appData.campaign.currentTurn = 2; advanceReconMissions();
    `);
    ok(s.evalCtx('appData.campaign.reconMissions[0].status') === 'active',
        'миссия продолжается, а не «проваливается»',
        s.evalCtx('appData.campaign.reconMissions[0].status'));
    ok(s.evalCtx('Number(appData.campaign.reconMissions[0].unitId)') === 1,
        'индекс носителя переписан на новый (1)', s.evalCtx('appData.campaign.reconMissions[0].unitId'));
    ok(s.evalCtx('reconMissionUnit(appData.campaign.reconMissions[0]).name') === 'Штаб Батальона',
        'reconMissionUnit возвращает правильный юнит, а не «Подкрепление»');
    ok(J(s, '!!(appData.campaign.reconLost || {}).beve_motorcycle_scout') === 'false',
        'актив не помечен потерянным');
    ok(JSON.parse(scoutFlags(s, 1)).hidden === true, 'разведчик по-прежнему на миссии (скрыт со штаба)');
}

console.log('— 2. после сдвига приказ и отзыв работают как обычно —');
{
    const s = sandbox(HQ_WITH_SCOUT);
    s.run("openReconMissionModalForAsset(0, 'beve_motorcycle_scout'); reconDraft.route = [{col:5,row:5}]; reconSubmitMission();");
    s.run(`
      appData.campaign.opUnits.unshift({ name: 'Подкрепление', type: 'infantry_platoon', faction: 'BeVe',
        col: 9, row: 9, squads: [{ name: 'Отд', fighters: [{ hp: 3 }] }] });
      appData.campaign.currentTurn = 2; advanceReconMissions();
    `);
    ok(J(s, "reconMissionsForUnit(appData.campaign.opUnits[1]).map(m => m.assetKey)") === '["beve_motorcycle_scout"]',
        'reconMissionsForUnit находит миссию по имени носителя');
    ok(J(s, "reconMissionsForUnit(appData.campaign.opUnits[0]).length") === '0',
        'чужому юниту («Подкрепление») эта миссия не приписывается');
    ok(J(s, "reconUnitOnMissionAssetKeys(appData.campaign.opUnits[1])") === '["beve_motorcycle_scout"]',
        'кнопка активов штаба показывает «на задании» и после сдвига');
    ok(s.run('recallReconMission(appData.campaign.reconMissions[0].id)') === true, 'отзыв срабатывает');
    for (let turn = 3; turn <= 8; turn++) s.run(`appData.campaign.currentTurn = ${turn}; advanceReconMissions();`);
    ok(s.evalCtx('appData.campaign.reconMissions[0].status') === 'completed', 'миссия завершена возвратом');
    ok(JSON.parse(scoutFlags(s, 1)).hidden === false && JSON.parse(scoutFlags(s, 1)).on === null,
        'флаги скрытия сняты — мотоциклист снова при штабе');
    ok(J(s, 'appData.campaign.reconAssets.beve_motorcycle_scout') === '{"total":1,"available":1}',
        'актив снова доступен', J(s, 'appData.campaign.reconAssets.beve_motorcycle_scout'));
}

console.log('— 3. самовосстановление «забытых» флагов (в т. ч. в старых сейвах) —');
{
    const s = sandbox(HQ_WITH_SCOUT, `
      appData.campaign.opUnits[0].squads[1].onReconMission = 'gone';
      appData.campaign.opUnits[0].squads[1].reconHidden = true;
      appData.campaign.reconLost = { beve_motorcycle_scout: true };
      appData.campaign.reconMissions = [{ id: 'gone', assetKey: 'beve_motorcycle_scout',
        assetName: 'Мотоциклист-разведчик', unitId: 5, unitName: 'Штаб Батальона',
        squadName: 'Мотоциклист-разведчик', status: 'failed',
        currentHex: { col: 5, row: 5 }, route: [], currentIndex: 0 }];
      initReconAssets();
    `);
    ok(J(s, 'appData.campaign.reconAssets.beve_motorcycle_scout') === '{"total":0,"available":0}',
        'исходное состояние «сломано»: актив считается потерянным');
    ok(JSON.parse(scoutFlags(s)).hidden === true, 'и разведчик висит скрытым');
    s.run('appData.campaign.currentTurn = 2; advanceReconMissions();');
    ok(JSON.parse(scoutFlags(s)).hidden === false, 'флаг скрытия снят — разведчик снова на карте');
    ok(J(s, '!!(appData.campaign.reconLost || {}).beve_motorcycle_scout') === 'false',
        'пометка «актив потерян» снята');
    ok(J(s, 'appData.campaign.reconAssets.beve_motorcycle_scout') === '{"total":1,"available":1}',
        'пул активов сразу пересчитан: 1/1', J(s, 'appData.campaign.reconAssets.beve_motorcycle_scout'));
    const logs = s.logs.join('\n');
    ok(/вернулся в Штаб Батальона — снова на карте/.test(logs), 'в журнале сказано, куда вернулся разведчик');
    ok(/снова доступна: актив на месте/.test(logs), 'в журнале сказано, что разведка снова доступна');

    // флаги на самом юните (бронеавтомобиль на миссии)
    const s2 = sandbox(`[
      { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'BeVe', col: 1, row: 1, squads: [] },
      { name: 'Бронеавтомобиль Landsverk 183 №1', type: 'armored_vehicle_platoon', faction: 'BeVe', col: 3, row: 3,
        squads: [{ name: 'Экипаж', fighters: [{ hp: 3 }] }] }
    ]`, `
      appData.campaign.opUnits[1].reconMissionId = 'gone-car';
      appData.campaign.opUnits[1].reconHidden = true;
      appData.campaign.reconMissions = [{ id: 'gone-car', assetKey: 'beve_armored_car',
        assetName: 'БА Landsverk', unitId: 0, unitName: 'Бронеавтомобиль Landsverk 183 №1',
        squadName: null, status: 'completed', currentHex: { col: 3, row: 3 }, route: [], currentIndex: 0 }];
      initReconAssets();
    `);
    s2.run('appData.campaign.currentTurn = 2; advanceReconMissions();');
    ok(JSON.parse(unitFlags(s2, 1)).hidden === false && JSON.parse(unitFlags(s2, 1)).mission === null,
        'бронеавтомобиль с «забытым» флагом возвращается на карту');
    ok(/Бронеавтомобиль Landsverk 183 №1 снова на карте/.test(s2.logs.join('\n')),
        'в журнале отмечено возвращение машины');
}

console.log('— 4. настоящая гибель по-прежнему закрывает актив (лечение не воскрешает) —');
{
    const s = sandbox(HQ_WITH_SCOUT);
    s.run("openReconMissionModalForAsset(0, 'beve_motorcycle_scout'); reconDraft.route = [{col:5,row:5}]; reconSubmitMission();");
    s.run(`
      appData.campaign.currentTurn = 2; advanceReconMissions();
      // отделение погибло в поле
      appData.campaign.opUnits[0].squads[1].fighters[0].hp = 0;
      appData.campaign.currentTurn = 3; advanceReconMissions();
    `);
    ok(s.evalCtx('appData.campaign.reconMissions[0].status') === 'failed', 'миссия провалена (актив погиб)');
    ok(J(s, '!!(appData.campaign.reconLost || {}).beve_motorcycle_scout') === 'true', 'тип актива потерян до конца операции');
    s.run('appData.campaign.currentTurn = 4; advanceReconMissions();');
    ok(J(s, '!!(appData.campaign.reconLost || {}).beve_motorcycle_scout') === 'true',
        'лечение на следующем ходу не «воскрешает» погибший актив');
    ok(J(s, 'appData.campaign.reconAssets.beve_motorcycle_scout') === '{"total":0,"available":0}',
        'в пуле активов по-прежнему 0');
}

console.log('— 5. носитель не найден — миссия закрывается БЕЗ потери актива —');
{
    const s = sandbox(HQ_WITH_SCOUT);
    s.run(`
      appData.campaign.reconMissions = [{ id: 'orphan', assetKey: 'beve_motorcycle_scout',
        assetName: 'Мотоциклист-разведчик', unitId: 7, unitName: 'Несуществующий штаб',
        squadName: 'Мотоциклист-разведчик', status: 'active',
        currentHex: { col: 5, row: 5 }, route: [{ col: 5, row: 5 }], currentIndex: 0, ap: 4,
        originHex: { col: 1, row: 1 }, recallHex: null, returnStuck: 0 }];
      appData.campaign.currentTurn = 2; advanceReconMissions();
      appData.campaign.currentTurn = 3; advanceReconMissions();
    `);
    ok(s.evalCtx("(appData.campaign.reconMissions.find(m => m.id === 'orphan') || {}).status") === 'completed',
        'миссия закрыта как completed, а не failed');
    ok(J(s, '!!(appData.campaign.reconLost || {}).beve_motorcycle_scout') === 'false',
        'актив не помечен потерянным');
    ok(/носитель не найден — миссия закрыта без потери актива/.test(s.logs.join('\n')),
        'в журнале объяснено, почему миссия закрыта');
}

console.log('— 6. на карте под иконкой актива видны координаты —');
{
    ok(/⚡ v13\.168: под иконкой актива всегда видно, ГДЕ он находится/.test(RECON_SRC),
        'в отрисовке есть подпись «где актив»');
    ok(/const label = `\$\{arrow\}\(\$\{mission\.currentHex\.col\}/.test(RECON_SRC),
        'подпись содержит гекс актива');
    ok(/mission\.status === 'returning' \? '↩'/.test(RECON_SRC), 'на возврате подпись со стрелкой ↩');
    const calls = [];
    const ctx = new Proxy({}, {
        get(t, k) {
            if (k === 'fillText') return (text) => calls.push(String(text));
            if (k === 'measureText') return () => ({ width: 42 });
            return () => {};
        },
        set() { return true; }
    });
    const ad = freshAppData();
    ad.campaign.reconMissions = [
        { id: 'm-obs', assetKey: 'beve_motorcycle_scout', assetName: 'Мотоциклист-разведчик',
          status: 'observing', currentHex: { col: 5, row: 5 }, route: [{ col: 5, row: 5 }], currentIndex: 0 },
        { id: 'm-ret', assetKey: 'beve_motorcycle_scout', assetName: 'Hidalgo',
          status: 'returning', currentHex: { col: 2, row: 7 }, route: [{ col: 2, row: 7 }], currentIndex: 0 }
    ];
    const box = {
        console, Math, JSON, Number, String, Array, Object, Set, Map, Date, isFinite, parseInt, parseFloat,
        appData: ad,
        document: { getElementById() { return null; }, createElement() { return {}; }, body: { appendChild() {} } },
        window: {},
        log: () => {},
        Image: function () { this.src = ''; this.complete = false; this.naturalWidth = 0; }
    };
    box.window.appData = ad;
    vm.runInNewContext(RECON_SRC + '\ndrawReconMissionOverlay(__ctx, 55);', Object.assign(box, { __ctx: ctx }));
    ok(calls.includes('👁(5,5)'), 'наблюдающий актив подписан «👁(5,5)»', calls.join(','));
    ok(calls.includes('↩(2,7)'), 'возвращающийся актив подписан «↩(2,7)»', calls.join(','));
}

console.log('— 7. в карточке юнита-носителя видно, где разведчик —');
{
    const card = sliceFunction(HTML, 'showOpUnitInfoPopup');
    ok(/reconOnMissionMarkup/.test(card), 'в карточке есть блок «разведка — актив в поле»');
    ok(/reconMissionsForUnit\(unit\)/.test(card), 'блок строится по миссиям именно этого юнита');
    ok(/Показать на карте/.test(card), 'в блоке есть кнопка «👆 Показать на карте»');
    ok(/recallReconMission\('\$\{mission\.id\}'\)/.test(card), 'в блоке есть кнопка «↩️ Отозвать»');
    ok(/reconStartRecallPointPick\('\$\{mission\.id\}'\)/.test(card), 'в блоке есть кнопка «📍 Точка отзыва»');
    ok(/ищите его по иконке с координатами на карте/.test(card), 'в карточке объяснено, как найти актив');
    ok(/const hex = mission\.currentHex \? `\(\$\{mission\.currentHex\.col\}/.test(card), 'в строке миссии выводится гекс');
    ok(/return '';\s*\n\s*if \(typeof getOwnReconAssetList/.test(card),
        'старая заглушка «актив выполняет миссию» больше не подменяет блок');
}

console.log('— 8. версия и сборка —');
{
    ok(/^v\d+\.\d+$/.test(CURRENT_VERSION), 'APP_VERSION в формате vNN.NNN', CURRENT_VERSION);
    ok(SW.indexOf('wargame-' + CURRENT_VERSION) >= 0, 'CACHE_NAME совпадает с APP_VERSION');
    ok(MANIFEST.indexOf(CURRENT_VERSION) >= 0, 'manifest.short_name совпадает с APP_VERSION');
    ok(RECON_SRC.split('\n')[0].indexOf(CURRENT_VERSION) >= 0, 'BUILD-маркер js/recon.js = ' + CURRENT_VERSION);
}

console.log('');
if (fails.length) {
    console.log('Итог v13.168 (разведчик не пропадает с карты): PASS ' + pass + ' · FAIL ' + fails.length);
    fails.forEach(f => console.log('   ✗ ' + f));
    process.exit(1);
} else {
    console.log('Итог v13.168 (разведчик не пропадает с карты: стабильный носитель, самолечение флагов, координаты на карте и в карточке): PASS ' + pass + ' · FAIL 0');
}
