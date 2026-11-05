'use strict';
// ⚡ v13.165 — шесть замечаний по операционной карте:
//   1) перестал отображаться маршрут движения при отдаче приказа;
//   2) иконки техники снабжения мелкие — увеличить;
//   3) меню разведки — открывающееся меню по кнопке слева (как «Связь»/«Снабжение»);
//   4) вместо лупы при выполнении разведприказа — иконка самого отряда;
//   5) отряды не выполняют приказ движения до конца;
//   6) возможность выдать рацию конкретному разведоргану при штабе.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction: extractFn, HTML } = require('./extract');
const ROOT = path.join(__dirname, '..');
const RECON_SRC = fs.readFileSync(path.join(ROOT, 'js/recon.js'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
const OPSUI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/operational_ui.css'), 'utf8');
const CURRENT_VERSION = (/var APP_VERSION = '([^']+)'/.exec(HTML) || [])[1] || '';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}
function fn(name) {
    try { return extractFn(HTML, name); } catch (e) { return ''; }
}

console.log('— п.1: маршрут движения при отдаче приказа —');
{
    const sandbox = createSandbox(freshAppData());
    sandbox.run(`
var isPlanningRoute = true;
var orderWaypoints = [{ col: 3, row: 2 }, { col: 5, row: 2 }];
var appData = globalThis.appData;
var OP_MAP_COLS = 20, OP_MAP_ROWS = 15;
appData.campaign.opUnits = [{ name: 'Взвод', col: 1, row: 2 }];
window = globalThis;
window.opOperationalUiState = { menuOpen: true, mapPick: 'route' };
window.uxOrderRouteUnitId = 0;
var routeAsked = 0;
function getRouteToTarget(c1, r1, c2, r2) { routeAsked++; return [{ col: c2, row: r2 }]; }
function operationalMoveChainStart() { return null; }
`);
    sandbox.run(extractFn(HTML, 'drawOrderRoute'));
    // классическая панель закрыта, открыто компактное меню приказов
    sandbox.run("drawOrderRoute(document.getElementById('opMapCanvas').getContext('2d'), 40);");
    ok(sandbox.evalCtx('routeAsked') > 0, 'в компактном меню приказов маршрут черновика рисуется');
    // закрыто всё — не рисуем (гарантия v13.163 сохраняется)
    sandbox.run("window.opOperationalUiState = { menuOpen: false, mapPick: null }; isPlanningRoute = false; routeAsked = 0;");
    sandbox.run("drawOrderRoute(document.getElementById('opMapCanvas').getContext('2d'), 40);");
    ok(sandbox.evalCtx('routeAsked') === 0, 'при закрытом меню и выключенном режиме маршрута не рисуется');
    const draw = fn('drawOrderRoute');
    ok(/compactOpen/.test(draw) && /classicOpen/.test(draw), 'renderer учитывает оба вида панели приказов');
    ok(/if \(!classicOpen && !compactOpen\) return;/.test(draw), 'выход только когда закрыты обе панели');
    ok(/compactMenuOpen/.test(HTML), 'сброс isPlanningRoute не срабатывает при открытом компактном меню');
    ok(/mapPick === 'route'/.test(OPSUI), 'компактное меню само переводит карту в режим набора маршрута');
}

console.log('— п.2: крупные иконки техники снабжения —');
{
    const draw = fn('drawSupplyDeliveriesOnMap');
    ok(/const radius = size \* \(vehicleImg \? 0\.70 : 0\.52\)/.test(draw), 'плашка колонны на карте увеличена');
    ok(/const badgeY = pointY - size \* \(vehicleImg \? 0\.72 : 0\.56\)/.test(draw), 'плашка поднята над гексом');
    ok(/width:42px;height:42px/.test(HTML), 'иконка техники в панели снабжения крупнее (42px)');
    ok(/width:38px;height:38px/.test(HTML), 'иконка колонны в списке «Колонны в пути» крупнее (38px)');
}

console.log('— п.3: меню разведки в левом доке —');
{
    ok(/data-op-side-tab="recon" onclick="showReconPanel\(\)"/.test(HTML), 'в доке есть вкладка «🔍 Разведка»');
    ok(/\['communicationPanel', 'supplyPanel', 'reconPanel'\]/.test(HTML), 'панель разведки переносится в левую колонку дока');
    ok(/kind === 'recon' \? 'block'/.test(HTML), 'openOperationalSidePanel знает вид «recon»');
    ok(/kind === 'recon' \? '🔍 Разведка'/.test(HTML), 'заголовок дока для разведки');
    ok(/window\.isOperationalSidePanelOpen/.test(HTML), 'наружу отдаётся «какая вкладка открыта»');
    ok(/operationalReconTabVisible/.test(HTML), 'вкладка видна только при наличиях развед-активов');
    ok(/function showReconPanel\(force\)/.test(RECON_SRC), 'showReconPanel открывает док');
    ok(/window\.openOperationalSidePanel\('recon', true\)/.test(RECON_SRC), 'панель разведки открывается в доке');
    ok(/window\.closeOperationalSidePanels\(\)/.test(RECON_SRC), 'закрытие панели закрывает и док');
    ok(/\.op-panel-tabs > div \{[\s\S]{0,200}max-height: 92vh/.test(CSS), 'колонка вкладок не вылезает за экран');
}

console.log('— п.4: иконка отряда вместо лупы —');
{
    const overlay = extractFn(RECON_SRC, 'drawReconMissionOverlay');
    ok(/reconMissionIcon\(mission\)/.test(overlay), 'оверлей берёт иконку актива');
    ok(/reconAssetImage\(/.test(overlay), 'картинка актива подгружается и рисуется');
    ok(/drawImage\(iconImg/.test(overlay), 'иконка вписана в плашку на гексе');
    ok(/fillText\('🔍'/.test(overlay), 'лупа осталась только запасным вариантом, пока файл не загружен');
    ok(/function reconAssetImage\(src\)/.test(RECON_SRC) && /loadedSupplyConvoyIcons|reconAssetIconImages/.test(RECON_SRC),
        'картинки кэшируются');
    ok(/icon: 'images\/AIRF\/Hidalgo GL-41\.png'/.test(RECON_SRC), 'у Hidalgo есть файл иконки');
    ok(/icon: 'images\/BeVe\/разведчик бенилюкс мото1\.png'/.test(RECON_SRC), 'у мотоциклиста-разведчика есть файл иконки');
}

console.log('— п.5: приказ движения доводится до конца —');
{
    const sandbox = createSandbox(freshAppData());
    sandbox.run(`
var OP_MAP_COLS = 20, OP_MAP_ROWS = 15;
var hardMode = { orders: [], phoneLines: [] };
var appData = globalThis.appData;
function log() {}
function saveData() {}
function redrawOperationalMap() {}
function renderActiveOrders() {}
function isStaticOpUnit() { return false; }
function isVehicleMobilityUnit() { return false; }
function checkEnemyEncounter() { return false; }
function startTacticalBattle() {}
function reconnectPhoneLinesAfterUnitMove() {}
function checkMovingFire() {}
function opRecordPrevPos() {}
function autoDismountOperational() {}
function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }
function getOpHexNeighbors(c, r) { return [{ col: c + 1, row: r }, { col: c - 1, row: r }, { col: c, row: r + 1 }, { col: c, row: r - 1 }]; }
function getOpPlannedMoveCost() { return 1; }
function getOpMoveCost() { return 1; }
function getRouteToTarget(c1, r1, c2, r2) {
  const out = []; let c = c1, r = r1, guard = 0;
  while ((c !== c2 || r !== r2) && guard++ < 40) {
    if (c !== c2) c += (c2 > c ? 1 : -1); else r += (r2 > r ? 1 : -1);
    out.push({ col: c, row: r });
  }
  return out;
}
var unit = { name: 'Взвод', type: 'infantry_platoon', col: 2, row: 2, ap: 4, maxAp: 4 };
appData.campaign.opUnits = [unit];
appData.campaign.enemyOpUnits = [];
var order = { toUnitId: 0, type: 'move', behavior: 'ignore', status: 'active',
  waypoints: [{ col: 6, row: 2 }, { col: 10, row: 2 }], startHex: '2,2', contactRadius: 2 };
`);
    sandbox.run(extractFn(HTML, 'buildOrderRoute'));
    sandbox.run(extractFn(HTML, 'executeMoveOrder'));
    for (let turn = 1; turn <= 3; turn++) {
        sandbox.run('unit.ap = unit.maxAp;');
        sandbox.run('executeMoveOrder(unit, order);');
    }
    ok(sandbox.evalCtx('order.status') === 'completed', 'дальний маршрут доведён до цели за несколько ходов',
        sandbox.evalCtx('unit.col + "," + unit.row + " / " + order.status'));
    ok(sandbox.evalCtx("unit.col + ',' + unit.row") === '10,2', 'отряд стоит на конечной точке приказа');

    // застрявший приказ больше не висит «активным» вечно
    const stuck = createSandbox(freshAppData());
    stuck.run(`
var OP_MAP_COLS = 20, OP_MAP_ROWS = 15;
var hardMode = { orders: [], phoneLines: [] };
var appData = globalThis.appData;
function log() {}
function saveData() {}
function redrawOperationalMap() {}
function renderActiveOrders() {}
function isStaticOpUnit() { return false; }
function isVehicleMobilityUnit() { return false; }
function checkEnemyEncounter() { return false; }
function startTacticalBattle() {}
function reconnectPhoneLinesAfterUnitMove() {}
function checkMovingFire() {}
function opRecordPrevPos() {}
function autoDismountOperational() {}
function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }
function getOpHexNeighbors(c, r) { return [{ col: c + 1, row: r }, { col: c - 1, row: r }, { col: c, row: r + 1 }, { col: c, row: r - 1 }]; }
function getOpPlannedMoveCost() { return 1; }
function getOpMoveCost() { return 1; }
function getRouteToTarget(c1, r1, c2, r2) {
  const out = []; let c = c1, r = r1, guard = 0;
  while ((c !== c2 || r !== r2) && guard++ < 40) {
    if (c !== c2) c += (c2 > c ? 1 : -1); else r += (r2 > r ? 1 : -1);
    out.push({ col: c, row: r });
  }
  return out;
}
var unit = { name: 'Взвод', type: 'infantry_platoon', col: 2, row: 2, ap: 4, maxAp: 4 };
appData.campaign.opUnits = [unit];
var enemy = { name: 'Враг', col: 3, row: 2, isDestroyed: false };
appData.campaign.enemyOpUnits = [enemy];
var order = { toUnitId: 0, type: 'move', behavior: 'engage', status: 'active',
  waypoints: [{ col: 8, row: 2 }], startHex: '2,2', contactRadius: 2 };
`);
    stuck.run(extractFn(HTML, 'buildOrderRoute'));
    stuck.run(extractFn(HTML, 'executeMoveOrder'));
    stuck.run('unit.ap = unit.maxAp;');
    stuck.run('executeMoveOrder(unit, order);');
    ok(stuck.evalCtx('order.status') === 'active' && stuck.evalCtx('order.stallTurns') === 1,
        'первый «стоячий» ход приказ ещё жив и ждёт');
    stuck.run('unit.ap = unit.maxAp;');
    stuck.run('executeMoveOrder(unit, order);');
    ok(stuck.evalCtx('order.status') === 'completed', 'второй «стоячий» ход завершает приказ на рубеже');
    ok(/не может продвинуться/.test(fn('executeMoveOrder')), 'в журнал пишется понятная причина');
    ok(/недостижима — идём к ближайшему подходу/.test(fn('executeMoveOrder')),
        'недостижимая конечная точка объясняется словами');
}

console.log('— п.6: рация конкретному разведоргану при штабе —');
{
    const sandbox = createSandbox(freshAppData());
    sandbox.run(`
var hardMode = { enabled: true, signalPlatoon: null, phoneLines: [], orders: [] };
var SIGNAL_EQUIPMENT_BY_FACTION = { 'BeVe': { radios: 4, phones: 7, companyRadios: 3, radioRange: 15 },
  'A.I.R.F.': { radios: 1, phones: 6, companyRadios: 0, radioRange: 12 } };
var appData = globalThis.appData;
appData.campaign.playerFaction = 'A.I.R.F.';
appData.campaign.currentTurn = 3;
var hq = { name: 'Штаб батальона A.I.R.F.', type: 'battalion_hq', col: 2, row: 2, squads: [
  { name: 'AL-41 Hidalgo', templateName: 'AL-41 Hidalgo', fighters: [{ name: 'Водитель', hp: 3 }, { name: 'Разведчик', hp: 3 }] },
  { name: 'Штабное отделение', fighters: [{ name: 'Командир', hp: 3 }] }
] };
appData.campaign.opUnits = [hq];
function log() {}
function alert(m) { globalThis.lastAlert = String(m); }
function saveData() {}
function redrawOperationalMap() {}
function renderCommunicationPanel() {}
function getFactionWeapons() { return [{ name: 'Винтовка' }]; }
`);
    ['ensureSignalPlatoonState', 'ensureSignalEquipmentProfile', 'signalEquipmentFor', 'signalCompanyHQIds',
     'signalAssignmentId', 'signalReconOrganSquad', 'ensureReconOrganRadios', 'signalSquadRadioEntry',
     'hasSquadRadio', 'requestSignalIssueToReconOrgan', 'returnReconOrganRadio'].forEach(name => {
        const code = fn(name);
        if (code) sandbox.run(code);
    });
    sandbox.run('ensureSignalPlatoonState(); ensureSignalEquipmentProfile();');
    ok(sandbox.evalCtx('hardMode.signalPlatoon.radios.available') === 1, 'у A.I.R.F. одна свободная рация');
    sandbox.run('requestSignalIssueToReconOrgan(0, 0);');
    ok(sandbox.evalCtx('hasSquadRadio(hq, "AL-41 Hidalgo")') === true, 'рация выдана именно Hidalgo при штабе');
    ok(sandbox.evalCtx('hasSquadRadio(hq, "Штабное отделение")') === false, 'другим отделениям штаба рация не досталась');
    ok(sandbox.evalCtx('hardMode.signalPlatoon.radios.available') === 0, 'рация списана из полевого запаса');
    sandbox.run('returnReconOrganRadio(0, 0);');
    ok(sandbox.evalCtx('hardMode.signalPlatoon.radios.available') === 1, 'отзыв рации возвращает её в запас');
    ok(sandbox.evalCtx('hasSquadRadio(hq, "AL-41 Hidalgo")') === false, 'после отзыва рации у разведоргана нет');

    ok(/id="reconRadiosList"/.test(HTML), 'в панели связи есть блок «Рации разведорганам при штабе»');
    ok(/requestSignalIssueToReconOrgan\(\$\{holderIdx\}, \$\{squadIdx\}\)/.test(HTML),
        'кнопка выдачи передаёт индексы (без кавычек из названий)');
    ok(/function hasSquadRadio/.test(HTML) && /function signalSquadRadioEntry/.test(HTML), 'проверка рации отделения');
    ok(/reconOrgans/.test(HTML) && /const reconOrganRadios/.test(HTML), 'рации разведорганов учитываются в запасе');
    ok(/function reconOrganHasRadio/.test(RECON_SRC), 'разведка знает про рацию разведоргана');
    ok(/const assetRadio = reconUnitHasRadio\(assetUnit\) \|\| reconOrganHasRadio\(mission\)/.test(RECON_SRC),
        'задержка доклада учитывает рацию самого разведоргана');
}

console.log('— версия и сборка —');
{
    // номер релиза в тесте не фиксируем — проверяем формат и синхронизацию файлов
    ok(/^v\d+\.\d+$/.test(CURRENT_VERSION), 'APP_VERSION в формате vNN.NNN', CURRENT_VERSION);
    ok(SW.indexOf('wargame-' + CURRENT_VERSION) >= 0, 'CACHE_NAME совпадает с APP_VERSION');
    ok(MANIFEST.indexOf(CURRENT_VERSION) >= 0, 'manifest.short_name совпадает с APP_VERSION');
    const jsFiles = ['cards', 'data', 'hexmaps', 'map_actions', 'online_battles', 'operational_ui', 'placement', 'recon', 'templates', 'weapons'];
    jsFiles.forEach(name => {
        const head = fs.readFileSync(path.join(ROOT, 'js', name + '.js'), 'utf8').split('\n')[0];
        ok(head.indexOf(CURRENT_VERSION) >= 0, `BUILD-маркер js/${name}.js = ${CURRENT_VERSION}`);
    });
}

console.log('');
if (fails.length) {
    console.log('Итог v13.165: PASS ' + pass + ' · FAIL ' + fails.length);
    fails.forEach(f => console.log('   ✗ ' + f));
    process.exit(1);
} else {
    console.log('Итог v13.165 (маршрут приказа, иконки снабжения, док разведки, иконка актива, движение до конца, рация разведоргану): PASS ' + pass + ' · FAIL 0');
}
