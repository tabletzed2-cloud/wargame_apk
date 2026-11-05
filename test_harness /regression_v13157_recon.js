// ⚡ v13.157: регрессия новой разведки (разведывательные миссии + «Наблюдение»),
//    правки времени кампании (кратно 10 минутам) и мотоциклетных миномётных
//    расчётов в самокатных взводах.
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const RECON = read('js/recon.js');
const TEMPLATES = read('js/templates.js');
const DATA = read('js/data.js');
const SW = read('service-worker.js');

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail !== undefined ? ' | ' + detail : '')); }
}
const sliceOf = name => sliceFunction(HTML, name);

// ---------- песочница с модулем разведки ----------
function freshRecon(options) {
    const opts = options || {};
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
var currentTurn = 1;
function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }
function opLineOfSightBlocked() { return false; }
function isNightTime() { return false; }
function rollD10() { return 6; }
function isHexInPlayableArea() { return true; }
function getOpHexNeighbors(col, row) {
    return [{col: col + 1, row: row}, {col: col - 1, row: row}, {col: col, row: row + 1}, {col: col, row: row - 1}];
}
function opDetectionIsArmored(u) { return !!(u && (u.type === 'vehicle' || u.type === 'armored_vehicle_platoon')); }
function hasRadio(u) { return !!(u && u.hasRadioFlag); }
function tacticalSmokeBlocksSight() { return false; }
function tacticalIlluminationActive() { return false; }
function onlineRevealEnemy(u, t) { u.revealedUntil = t; }
function addOperationalArtilleryNoise() { return []; }
function isArmoredUnit() { return false; }
function isStaticOpUnit(u) { return !!(u && u.type === 'dots'); }
`);
    s.run(RECON);
    if (opts.grid) s.run(`appData.campaign.opMapGrid = ${JSON.stringify(opts.grid)};`);
    return s;
}

const GRID = {
    '5,5': ['road'], '6,5': ['road'], '7,5': ['grass'], '8,5': ['road'],
    '5,6': ['forest'], '6,6': ['bushes'], '7,6': ['hill'], '8,6': ['rocks'],
    '4,5': ['road'], '4,6': ['road'], '3,5': ['road']
};

function missionSandbox() {
    const s = freshRecon({ grid: GRID });
    s.run(`
appData.campaign.opMapGrid = ${JSON.stringify(GRID)};
var scoutSquad = { name: 'Мотоциклист-разведчик', canRecon: true, reconAssetKey: 'beve_motorcycle_scout', fighters: [{ hp: 3 }] };
var messengerSquad = { name: 'Мотоциклист-посыльный', isMessenger: true, reconAssetKey: 'beve_motorcycle_messenger', fighters: [{ hp: 3 }] };
var platoon = { name: '1-й взвод', type: 'infantry_platoon', col: 4, row: 5, squads: [scoutSquad, messengerSquad] };
var hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 4, row: 6, hasRadioFlag: true, squads: [] };
var car = { name: 'Бронеавтомобиль Landsverk 183 №1', type: 'vehicle', col: 3, row: 5, squads: [] };
appData.campaign.opUnits = [platoon, hq, car];
appData.campaign.enemyOpUnits = [{ name: 'Враг 1', col: 7, row: 5, type: 'infantry_platoon' }];
initReconAssets();
`);
    return s;
}

console.log('== v13.157: разведка, время кампании, миномётные расчёты ==');

// ─────────────────────── 1. старый механизм убран ───────────────────────
{
    ok(!/const RECON_RADIUS = /.test(HTML), 'п.8.1: RECON_RADIUS удалён');
    ok(!/RECON_RADIUS_ARMORED_CAR/.test(HTML), 'п.8.1: RECON_RADIUS_ARMORED_CAR удалён');
    ok(!/function isReconZoneActive/.test(HTML), 'п.8.1: isReconZoneActive удалена');
    ok(!/reconZoneHexes/.test(HTML), 'п.8.1: reconZoneHexes удалены из кода');
    ok(!/reconHighlightHexes/.test(HTML), 'п.8.1: reconHighlightHexes удалены из кода');
    ok(!/reconActiveTurn/.test(HTML), 'п.8.1: reconActiveTurn удалён');
    ok(!/function executeReconOrder/.test(HTML), 'п.8.1: executeReconOrder удалён');
    ok(!/function reconRadiusForUnit/.test(HTML), 'п.8.1: reconRadiusForUnit удалена');
    ok(!/function isArmoredCarReconUnit/.test(HTML), 'п.8.1: isArmoredCarReconUnit удалена');
    ok(!/unit\.reconPending|\.reconPending =/.test(HTML), 'п.8.1: reconPending удалён');
    ok(/drawReconMissionOverlay\(ctx, size\)/.test(HTML), 'п.8.1: карта рисует миссии вместо зоны');
    ok((HTML.match(/js\/recon\.js/g) || []).length >= 2, 'модуль js/recon.js подключён и в прекэше');
    ok(/\.\/js\/recon\.js/.test(SW), 'service worker кэширует js/recon.js');
}

// ─────────────────────── 2. активы и таблица §2 ───────────────────────
{
    const s = freshRecon({ grid: GRID });
    ok(s.evalCtx('RECON_ASSET_TYPES.beve_motorcycle_scout.canRecon') === true, 'п.2: мотоциклист-разведчик — разведчик');
    ok(s.evalCtx('RECON_ASSET_TYPES.beve_motorcycle_messenger.canRecon') === false, 'п.2: мотоциклист-посыльный не разведует');
    ok(s.evalCtx('RECON_ASSET_TYPES.airf_hidalgo.canRecon') === true, 'п.2: AL-41 Hidalgo — разведывательный актив');
    ok(s.evalCtx('RECON_ASSET_TYPES.airf_recon_platoon.canRecon') === true, 'п.2: развед.взвод A.I.R.F. — разведывательный актив');
    ok(s.evalCtx("getReconSpeed('motorcycle', 'road')") === 4 &&
       s.evalCtx("getReconSpeed('motorcycle', 'grass')") === 2 &&
       s.evalCtx("getReconSpeed('motorcycle', 'forest')") === 1,
       'п.2: мотоцикл — 4 дорога / 2 трава-кусты / 1 лес');
    // ⚡ v13.164: бронеавтомобилю BeVe снова можно отдать приказ на разведку
    ok(s.evalCtx('RECON_ASSET_TYPES.beve_armored_car.canRecon') === true,
       'п.2 (v13.164): у бронеавтомобиля BeVe снова есть разведывательная миссия');
    ok(s.evalCtx("getReconSpeed('armored_car', 'road')") === 4 &&
       s.evalCtx("getReconSpeed('armored_car', 'bushes')") === 4 &&
       s.evalCtx("getReconSpeed('armored_car', 'forest')") === 0,
       'п.2: бронеавтомобиль — 4 дорога/трава/кусты, лес недоступен');
    ok(s.evalCtx("getReconSpeed('light_car', 'grass')") === 4 &&
       s.evalCtx("getReconSpeed('light_car', 'forest')") === 0,
       'п.2: Hidalgo — 4 трава, лес недоступен');
    ok(s.evalCtx("canReconMoveTo('motorcycle', {col:4,row:5}, {col:5,row:6})") === true,
       'п.10.2: мотоцикл может заехать в лес (скорость 1)');
    ok(s.evalCtx("canReconMoveTo('motorcycle', {col:4,row:5}, {col:7,row:6})") === false,
       'п.2: мотоцикл НЕ заезжает на холм');
    ok(s.evalCtx("canReconMoveTo('light_car', {col:4,row:5}, {col:6,row:6})") === false,
       'п.10.3: Hidalgo не заезжает в кусты (только дорога/трава)');
    ok(s.evalCtx("canReconMoveTo('light_car', {col:4,row:5}, {col:5,row:6})") === false,
       'п.2: Hidalgo не заезжает в лес');
    ok(s.evalCtx("canReconMoveTo('foot', {col:4,row:5}, {col:5,row:6})") === true,
       'п.2: развед.взвод проходит лес пешком');
}

// ─────────────────────── 3. дальность наблюдения (единая) ───────────────────────
{
    const s = freshRecon({ grid: GRID });
    ok(s.evalCtx("getReconObserveRange(null, {col:5,row:5}, true)") === 3, 'п.1.1: в движении — 3 гекса');
    ok(s.evalCtx("getReconObserveRange(null, {col:5,row:5}, false)") === 5, 'п.1.1: стоя — 5 гексов');
    ok(s.evalCtx("getReconObserveRange(null, {col:7,row:6}, false)") === 8, 'п.1.1: с холма — 8 гексов');
    ok(s.evalCtx("getReconObserveRange(null, {col:5,row:6}, false)") === 3, 'п.1.1: наблюдатель в лесу — −2 (5→3)');
    ok(s.evalCtx("getReconObserveRange(null, {col:6,row:6}, false)") === 4, 'п.1.1: наблюдатель в кустах — −1 (5→4)');
    const rangeFn = sliceFunction(RECON, 'getReconObserveRange');
    ok(!/isVehicle|armored|Hidalgo|Landsverk/.test(rangeFn),
       'п.10.4: getReconObserveRange не смотрит на тип техники (бонуса оптики нет)');
}

// ─────────────────────── 4. модификаторы броска §1.2 ───────────────────────
{
    const s = freshRecon({ grid: GRID });
    const modAt = (observer, target, opts) =>
        s.evalCtx(`reconObserveModifier(${JSON.stringify(observer)}, ${JSON.stringify(target)}, ${JSON.stringify(opts || {})}).mod`);
    // GRID: 5,5 — дорога; 6,5 — дорога; 7,5 — трава; 5,6 — лес; 8,6 — камни
    // база (наблюдатель 5,5 → цель 6,5): 1 гекс +3, цель на дороге +1 = 4
    ok(modAt({ col: 5, row: 5 }, { col: 6, row: 5 }) === 4, 'п.1.2: 1 гекс +3 и дорога +1 = 4');
    ok(modAt({ col: 5, row: 5 }, { col: 7, row: 5 }) === 2, 'п.1.2: 2 гекса = +2');
    ok(modAt({ col: 5, row: 5 }, { col: 5, row: 6 }) === 1, 'п.1.2: цель в лесу −2 (1 гекс: +3 −2)');
    ok(modAt({ col: 5, row: 5 }, { col: 8, row: 6 }) === 0, 'п.1.2: цель в камнях −1 (3 гекса: +1 −1)');
    ok(modAt({ col: 5, row: 5 }, { col: 14, row: 5 }) === -2, 'п.1.2: 6+ гексов = −2');
    ok(modAt({ col: 5, row: 5 }, { col: 6, row: 5, movedThisTurn: true }) === 6, 'п.1.2: цель двигалась +2');
    ok(modAt({ col: 5, row: 5 }, { col: 6, row: 5, firedThisTurn: true }) === 7, 'п.1.2: цель стреляла +3');
    ok(modAt({ col: 5, row: 5 }, { col: 6, row: 5, type: 'vehicle' }) === 6, 'п.1.2: бронетехника +2');
    ok(modAt({ col: 5, row: 5 }, { col: 6, row: 5 }, { isScout: true }) === 5, 'п.1.2: наблюдатель-разведчик +1');
    ok(modAt({ col: 5, row: 5 }, { col: 6, row: 5 }, { penalty: -1 }) === 3, 'п.1.2: обычный взвод −1');
    ok(modAt({ col: 5, row: 5 }, { col: 6, row: 5 }, { pauseBonus: 2 }) === 6, 'п.4.1: пауза на точке +2');
    s.run('isNightTime = function () { return true; };');
    ok(modAt({ col: 5, row: 5 }, { col: 7, row: 5 }) === 0, 'п.1.2: ночь −2 (2 гекса: +2 −2)');
    ok(modAt({ col: 5, row: 5 }, { col: 6, row: 5 }) === 3, 'п.1.2: ночь в упор −1 (вместо −2)');
    s.run('tacticalIlluminationActive = function () { return true; };');
    ok(modAt({ col: 5, row: 5 }, { col: 6, row: 5 }) === 4, 'п.1.2: осветительная ракета отменяет ночной штраф');
    s.run('tacticalIlluminationActive = function () { return false; }; isNightTime = function () { return false; };');
    // дым между наблюдателем и целью — автоматический провал
    s.run(`appData.campaign.opSmokeClouds = [{ hexKey: '6,5' }];`);
    ok(s.evalCtx("reconSmokeBlocks({col:5,row:5},{col:7,row:5})") === true,
       'п.1.1: дым между наблюдателем и целью — автопровал');
    s.run('appData.campaign.opSmokeClouds = [];');
    ok(s.evalCtx("reconSmokeBlocks({col:5,row:5},{col:7,row:5})") === false, 'п.1.1: без дыма проверка проходит');
}

// ─────────────────────── 5. миссии: жизненный цикл ───────────────────────
{
    const s = missionSandbox();
    const assets = s.evalCtx('JSON.stringify(appData.campaign.reconAssets)');
    ok(/beve_motorcycle_scout":\{"total":1,"available":1/.test(assets), 'п.7.1: пул активов посчитан из войск', assets);
    ok(s.evalCtx("getReconAssetList().map(a => a.key)").join(',') === 'beve_motorcycle_scout,beve_armored_car',
       'п.9.1: в списке только активы с canRecon и available > 0 (v13.164: мотоциклист и бронеавтомобиль)');
    const mission = s.evalCtx(`createReconMission({ assetKey: 'beve_motorcycle_scout', route: [{col:6,row:5},{col:7,row:5}], observeMode: 'stationary', reportMethod: 'radio' })`);
    ok(!!mission && mission.status === 'active', 'п.4.1: миссия создана со статусом active');
    ok(s.evalCtx('appData.campaign.reconAssets.beve_motorcycle_scout.available') === 0, 'п.4.1: available-- при отправке');
    ok(s.evalCtx("JSON.stringify(appData.campaign.reconMissions[0].route)") === '[{"col":6,"row":5},{"col":7,"row":5}]',
       'п.4.1: маршрут сохранён в миссии');
    s.run('advanceReconMissions();');
    ok(s.evalCtx('appData.campaign.reconMissions[0].status') === 'observing', 'п.4.2: режим «занять в конце» → observing');
    ok(s.evalCtx('JSON.stringify(appData.campaign.reconMissions[0].currentHex)') === '{"col":7,"row":5}',
       'п.4.2: актив дошёл до точки наблюдения');
    // отзыв
    s.run('recallReconMission(appData.campaign.reconMissions[0].id);');
    ok(s.evalCtx('appData.campaign.reconMissions[0].status') === 'returning', 'п.4.3: отзыв — статус returning');
    let guard = 0;
    while (guard++ < 10 && s.evalCtx('appData.campaign.reconMissions[0].status') === 'returning') {
        s.run('advanceReconMissions();');
    }
    ok(s.evalCtx('appData.campaign.reconMissions[0].status') === 'completed', 'п.4.3: возврат в штаб → completed');
    ok(s.evalCtx('appData.campaign.reconAssets.beve_motorcycle_scout.available') === 1,
       'п.4.3: по возвращении актив снова доступен');
}

// ─────────────────────── 6. доклады и раскрытие ───────────────────────
{
    const s = missionSandbox();
    // без рации у актива/штаба — доклад посыльным = 1 ход
    s.run(`
appData.campaign.opUnits[0].hasRadioFlag = false;
var m1 = createReconMission({ assetKey: 'beve_motorcycle_scout', route: [{col:6,row:5}], observeMode: 'stationary', reportMethod: 'radio' });
`);
    ok(s.evalCtx('getReconReportDelay(appData.campaign.reconMissions[0], 3)') === 1,
       'п.5.1: «рация» без рации у штаба — 1 ход');
    ok(s.evalCtx('getReconReportDelay({ reportMethod: "messenger" }, 7)') === 3,
       'п.5.1: посыльный — ceil(7/3) = 3');
    ok(s.evalCtx('getReconReportDelay({ reportMethod: "return" }, 9)') === 3,
       'п.5.1: возврат — ceil(9/4) = 3');
    // с рациями у обеих сторон — мгновенно
    s.run(`
appData.campaign.opUnits[0].hasRadioFlag = true;
appData.campaign.opUnits[1].hasRadioFlag = true;
`);
    ok(s.evalCtx('getReconReportDelay(appData.campaign.reconMissions[0], 4)') === 0,
       'п.5.1: рация у актива и штаба — 0 ходов');
    // отложенный доклад раскрывается на нужном ходу
    s.run(`
appData.campaign.reconMissions = [];
appData.campaign.enemyOpUnits[0].detected = false;
scheduleReveal(appData.campaign.enemyOpUnits[0], Number(appData.campaign.currentTurn) + 2);
advanceReconMissions();
`);
    ok(s.evalCtx('!!appData.campaign.enemyOpUnits[0].detected') === false, 'п.5.2: доклад не пришёл раньше времени');
    s.run('appData.campaign.currentTurn = Number(appData.campaign.currentTurn) + 2; advanceReconMissions();');
    ok(s.evalCtx('appData.campaign.enemyOpUnits[0].detected') === true, 'п.5.2: доклад пришёл — враг раскрыт');
    ok(s.evalCtx('appData.campaign.enemyOpUnits[0].revealedUntil') >= s.evalCtx('appData.campaign.currentTurn') + 1,
       'п.5.2: onlineRevealEnemy получил ход «до конца следующего»');
}

// ─────────────────────── 7. потеря актива ───────────────────────
{
    const s = missionSandbox();
    // ⚡ v13.160: актив-юнит для проверки потери — развед. взвод A.I.R.F.
    s.run(`appData.campaign.opUnits.push({ name: 'Развед. взвод', type: 'recon_platoon', col: 3, row: 6,
        squads: [{ name: 'Развед. отделение №1', fighters: [{ hp: 3 }] }] });
        initReconAssets();
        createReconMission({ assetKey: 'airf_recon_platoon', route: [{col:4,row:5}], observeMode: 'pass', reportMethod: 'radio' });`);
    s.run('reconOnUnitDestroyed(appData.campaign.opUnits[3]);');
    ok(s.evalCtx('appData.campaign.reconMissions.filter(m => m.status === "failed").length') === 1,
       'п.4.4: гибель актива → миссия failed');
    ok(s.evalCtx('appData.campaign.reconAssets.airf_recon_platoon.total') === 0, 'п.4.4: тип разведки закрыт до конца операции');
    ok(s.logs.some(line => /потерян\. Разведка этого типа недоступна/.test(line)),
       'п.4.4: в лог записано «потерян. Разведка этого типа недоступна»');
}

// ─────────────────────── 8. приказ «Наблюдение» ───────────────────────
{
    ok(/<option value="observe">/.test(HTML), 'п.6.1: приказ «👁️ Наблюдение» есть в панели приказов');
    ok(/'observe': '👁️ Наблюдение'/.test(HTML), 'п.8.3: getOrderTypeLabel знает observe');
    const s = missionSandbox();
    const order = { id: 77, type: 'observe', status: 'active' };
    s.run(`appData.campaign.opUnits[0].col = 4; appData.campaign.opUnits[0].row = 5;`);
    s.run(`executeObserveOrder(appData.campaign.opUnits[0], ${JSON.stringify(order)});`);
    ok(s.evalCtx('getReconAssetList().length') === 2,
       'п.6.3: наблюдение не тратит пул активов (мотоциклист и бронеавтомобиль, v13.164)');
    {
        const s3 = missionSandbox();
        s3.run('function unitHasFirepower() { return false; } function isEscortCapableInfantry() { return true; }');
        s3.run(sliceOf('unitCanExecuteOrderType'));
        ok(s3.evalCtx("unitCanExecuteOrderType({ name: 'Пехота', type: 'infantry_platoon' }, 'observe')") === true,
           'п.8.3: observe доступен обычной пехоте');
        s3.run('appData.campaign.opUnits[0].reconMissionId = "recon-x";');
        ok(s3.evalCtx("unitCanExecuteOrderType(appData.campaign.opUnits[0], 'observe')") === false,
           'п.10.5: актив на миссии приказов не принимает');
        s3.run('delete appData.campaign.opUnits[0].reconMissionId;');
    }
    // −1 к броску у обычного взвода против +1 у разведчика
    const s2 = missionSandbox();
    const plain = s2.evalCtx("reconObserveModifier({col:4,row:5}, {col:5,row:5}, {penalty:-1}).mod");
    const scout = s2.evalCtx("reconObserveModifier({col:4,row:5}, {col:5,row:5}, {isScout:true}).mod");
    ok(scout - plain === 2, 'п.6.2: разведчик +1 против обычного взвода −1 (разница 2)', `plain=${plain} scout=${scout}`);
}

// ─────────────────────── 9. время кампании кратно 10 ───────────────────────
{
    const s = createSandbox(freshAppData());
    s.run(`
appData.campaign.currentTime = 80;
appData.campaign.opTurnStartTime = 80;
appData.currentTime = 80;
`);
    s.run(sliceFunction(HTML, 'snapCampaignTimeToGrid'));
    s.run(sliceFunction(HTML, 'advanceTacticalClock'));
    s.run('advanceTacticalClock(2, true); advanceTacticalClock(2, true); advanceTacticalClock(2, true);');
    ok(s.evalCtx('appData.campaign.currentTime') === 80,
       'доп.1: тактический бой НЕ меняет общее время кампании');
    ok(s.evalCtx('appData.currentTime') === 80, 'доп.1: appData.currentTime остаётся на сетке');
    ok(s.evalCtx('appData.campaign.tacticalClockMin') === 6, 'доп.1: тактические минуты копятся отдельно');
    ok(s.evalCtx('appData.campaign.currentTime % 10') === 0, 'доп.1: время кратно 10 минутам');
    // старый сейв с «01:26» выравнивается
    s.run('appData.campaign.currentTime = 86; appData.currentTime = 86; snapCampaignTimeToGrid();');
    ok(s.evalCtx('appData.campaign.currentTime') === 80, 'доп.1: старый сейв 01:26 → 01:20 (кратно 10)');
    ok(/snapCampaignTimeToGrid/.test(sliceOf('updateOperationalTimeDisplay')), 'доп.1: дисплей времени выравнивает сетку');
}

// ─────────────────────── 10. новые отряды и миномётные расчёты ───────────────────────
{
    ok(/"name": "Мотоциклист-разведчик"/.test(TEMPLATES), 'п.2.3: шаблон «Мотоциклист-разведчик» есть');
    ok(/"name": "Мотоциклист-посыльный"/.test(TEMPLATES), 'п.2.3: шаблон «Мотоциклист-посыльный» есть');
    ok(/"name": "AL-41 Hidalgo"/.test(TEMPLATES), 'п.2.3: шаблон «AL-41 Hidalgo» есть');
    ok(/images\/BeVe\/разведчик бенилюкс мото1\.png/.test(TEMPLATES), 'п.2.3: иконка мотоциклиста-разведчика');
    ok(/images\/BeVe\/разведчик бенилюкс мото\.png/.test(TEMPLATES), 'п.2.3: иконка мотоциклиста-посыльного');
    ok(/images\/AIRF\/Hidalgo GL-41\.png/.test(TEMPLATES), 'п.2.3: иконка Hidalgo из images/AIRF');
    ok(/images\/BeVe\/DAF Trado\.png/.test(TEMPLATES), 'иконка грузовика DAF Trado обновлена');
    ok((TEMPLATES.match(/"canRecon":\s*true/g) || []).length >= 5,
       'п.2.3: бронеавтомобили и разведчики помечены canRecon/isScout',
       String((TEMPLATES.match(/"canRecon":\s*true/g) || []).length));
    ok(/"name":"Штаб развед\. взвода","canRecon":true/.test(TEMPLATES), 'п.2.3: развед.взвод A.I.R.F. помечен canRecon');
    ok(/"name": "Мотоциклетный миномётный расчёт 50-мм №1"/.test(TEMPLATES) &&
       /"name": "Мотоциклетный миномётный расчёт 50-мм №2"/.test(TEMPLATES) &&
       /"name": "Мотоциклетный миномётный расчёт 50-мм №3"/.test(TEMPLATES),
       'доп.2: три шаблона мотоциклетных миномётных расчётов');
    ok(/мотоцикл беве 1 мин\.png/.test(TEMPLATES) && /мотоцикл беве 3 мин\.png/.test(TEMPLATES),
       'доп.2: иконки миномётных расчётов');
    ok(/applyReconPresetUpdates/.test(DATA), 'п.2.3: состав штабов правится в data.js');
    ok(/Мотоциклист-разведчик/.test(DATA) && /Мотоциклист-посыльный/.test(DATA),
       'п.2.1: мотоциклисты добавлены в штабы взводов BeVe');
    ok(/AL-41 Hidalgo/.test(DATA), 'п.2.2: Hidalgo добавлен в штаб батальона A.I.R.F.');
    ok(/мотоциклетный миномётный расчёт|Мотоциклетный миномётный расчёт/i.test(DATA),
       'доп.2: миномётный расчёт добавляется самокатным взводам');
}

// ─────────────────────── 11. запрет ручного управления активом ───────────────────────
{
    ok(/Актив выполняет разведывательную миссию, движение недоступно/.test(HTML),
       'п.10.1: ручное движение актива запрещено с сообщением');
    ok(/if \(unit\.reconMissionId\) return false;/.test(sliceOf('unitCanExecuteOrderType')),
       'п.10.5: актив на миссии приказов не принимает');
    ok(/if \(!isEnemy && unit\.reconMissionId\) return;/.test(sliceOf('drawOperationalUnits')),
       'п.9.4: иконка актива не рисуется как боевой юнит');
    ok(/reconMissionsPanelHtml/.test(sliceOf('renderActiveOrders')), 'п.9.3: список активных миссий в панели приказов');
    ok(/handleReconRouteDraftClick\(clickX, clickY, size\)/.test(HTML), 'п.4.1: клики по карте собирают маршрут');
    ok(/state\.' \+ ONLINE\.role \+ '\.reconMissions'/.test(HTML), 'п.10.9: миссии пушатся в облако');
}

console.log(`\nИтог v13.157: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
