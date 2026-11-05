'use strict';
// ⚡ v13.163:
//   п.1 — после отдачи приказа клик по ДРУГОМУ своему отряду выбирает его, а не
//         рисует жёлтый пунктир. Черновик маршрута рисуется только при открытой
//         панели приказов, у маршрутов есть подписи, набор маршрута разведки
//         прерывается кликом по своему отряду.
//   п.2 — приказы на разведку выдаются через ШТАБ батальона: у штаба отдельная
//         кнопка на каждый развед-отряд (мотоциклист-разведчик, Hidalgo),
//         развед.взвод A.I.R.F. — самостоятельный актив, бронеавтомобили —
//         только «👁️ Наблюдение».
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction: extractFn, HTML, ROOT } = require('./extract');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const RECON = read('js/recon.js');
const SW = read('service-worker.js');
const MANIFEST = read('manifest.json');

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}

// ── вытаскиваем нужные функции index.html в общий /tmp-модуль песочницы ──────
const FNS = ['opOwnUnitAtPoint', 'tryMoveSelectedOpUnitToHex', 'drawOrderRoute', 'handleOpMapClick'];
const parts = FNS.map(f => { try { return extractFn(HTML, f); } catch (e) { return ''; } });
fs.writeFileSync('/tmp/wg_part.js', parts.join('\n\n'));

const SCALE_NOTE = 'OP_HEX_SIZE = 55, шаг по X = sqrt(3)*55';

function hexPoint(col, row, size) {
    const s = size || 55;
    return {
        x: col * Math.sqrt(3) * s + (row % 2) * Math.sqrt(3) * s / 2 + Math.sqrt(3) * s / 2,
        y: row * 1.5 * s + s
    };
}

function makeCtx() {
    const calls = [];
    const push = name => (...args) => calls.push({ name, args });
    return {
        calls,
        save: push('save'), restore: push('restore'), beginPath: push('beginPath'),
        arc: push('arc'), moveTo: push('moveTo'), lineTo: push('lineTo'), closePath: push('closePath'),
        fill: push('fill'), stroke: push('stroke'), setLineDash: push('setLineDash'),
        fillText: push('fillText'), fillRect: push('fillRect'), strokeRect: push('strokeRect'),
        measureText: (t) => ({ width: String(t).length * 6 }),
        fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
        globalAlpha: 1
    };
}

console.log('== v13.163: выбор отряда после приказа и разведка от штаба ==');

// ───────────── 1. opOwnUnitAtPoint: попадание по своему отряду ─────────────
{
    const ad = freshAppData();
    ad.campaign.opUnits = [
        { name: 'Первый взвод', col: 2, row: 2 },
        { name: 'Второй взвод', col: 4, row: 2 }
    ];
    const s = createSandbox(ad);
    s.run('var OP_HEX_SIZE = 55;');
    const p1 = hexPoint(2, 2);
    const p2 = hexPoint(4, 2);
    ok(s.evalCtx(`opOwnUnitAtPoint(${p1.x}, ${p1.y}, 55)`) === s.evalCtx('appData.campaign.opUnits[0]'),
        'клик по центру гекса возвращает стоящий там отряд (' + SCALE_NOTE + ')');
    ok(s.evalCtx(`opOwnUnitAtPoint(${p2.x}, ${p2.y}, 55)`) === s.evalCtx('appData.campaign.opUnits[1]'),
        'клик по второму отряду возвращает именно его');
    ok(s.evalCtx(`opOwnUnitAtPoint(${p1.x + 500}, ${p1.y + 500}, 55)`) === null,
        'клик в пустом месте не находит отряд');
    // стопка отрядов в одном гексе — берём ближайший по смещению
    ad.campaign.opUnits = [
        { name: 'A', col: 5, row: 5 }, { name: 'B', col: 5, row: 5 }
    ];
    const stack = hexPoint(5, 5);
    ok(s.evalCtx(`opOwnUnitAtPoint(${stack.x + 25}, ${stack.y}, 55).name`) === 'A',
        'в стопке отрядов находится конкретный отряд по смещению 25*zoom');
}

// ───────────── 2. клик по другому отряду не превращается в движение ────────
{
    const ad = freshAppData();
    const target = { name: 'Сосед', col: 3, row: 2, ap: 4 };
    ad.campaign.opUnits = [
        { name: 'Выбранный', col: 2, row: 2, ap: 4, availableHexes: [{ col: 3, row: 2, cost: 1 }] },
        target
    ];
    ad.campaign.selectedOpUnit = ad.campaign.opUnits[0];
    const s = createSandbox(ad);
    s.run(`
        var OP_HEX_SIZE = 55;
        function isStaticOpUnit(u) { return !!(u && u.type === 'dots'); }
        function canUnitShoot() { return false; }
        function getOpMoveCost() { return 1; }
        function spendOpAP(u, c) { u.ap -= c; return true; }
        function opRecordPrevPos() {}
        function showContactModal() {}
        function getOpReachableHexesForUnit() { return []; }
        function isMediumArtillery() { return false; }
        function operationalMediumArtilleryRange() { return 3; }
        function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }
    `);
    const pt = hexPoint(3, 2);
    const moved = s.evalCtx(`tryMoveSelectedOpUnitToHex(${pt.x}, ${pt.y})`);
    ok(moved === false, 'клик по другому отряду не поглощается как «движение»', moved);
    ok(s.evalCtx('appData.campaign.opUnits[0].col') === 2 && s.evalCtx('appData.campaign.opUnits[0].row') === 2,
        'выбранный отряд остался на своём гексе');
    // клик по пустому соседнему гексу по-прежнему двигает отряд
    ad.campaign.opUnits[0].availableHexes = [{ col: 2, row: 3, cost: 1 }];
    const empty = hexPoint(2, 3);
    const moved2 = s.evalCtx(`tryMoveSelectedOpUnitToHex(${empty.x}, ${empty.y})`);
    ok(moved2 === true && s.evalCtx('appData.campaign.opUnits[0].row') === 3,
        'клик по пустому гексу из подсветки двигает отряд как раньше');
}

// ───────────── 3. клик по другому отряду при открытой панели приказов ──────
{
    const ad = freshAppData();
    ad.campaign.opUnits = [
        { name: 'Первый взвод', type: 'infantry_platoon', col: 2, row: 2, ap: 4, availableHexes: [{ col: 12, row: 12 }] },
        { name: 'Второй взвод', type: 'infantry_platoon', col: 4, row: 2, ap: 4 }
    ];
    ad.campaign.enemyOpUnits = [];
    const s = createSandbox(ad);
    s.run(`
        var OP_HEX_SIZE = 55, pickingTargetHex = false;
        var orderWaypoints = [];
        var isPlanningRoute = true;
        var hardMode = { enabled: true, hqUnitId: 0 };
        function canvasBackingScale() { return 1; }
        function tryMoveSelectedOpUnitToHex() { return false; }
        function updateDismountPanel() {} function updateBtrPanel() {} function updateVehiclePanel() {}
        function renderVehicleStatus() {} function showContactModal() {}
        function addOrderWaypoint() { orderWaypoints.push({ col: 4, row: 2 }); return true; }
        function handlePhoneRouteDraftClick() { return false; }
        function handleReconRouteDraftClick() { return false; }
        function collectOperationalOrdersForUnit() { return []; }
        function opOwnUnitAtPointGuard() {}
    `);
    const canvas = s.elements && s.elements.opMapCanvas;
    s.run(`
        var canvas = document.getElementById('opMapCanvas');
        canvas.width = 1000; canvas.height = 1000;
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
        appData.campaign.opMapMode = 'view';
        appData.campaign.opCenters = [
            { key: '2,2', x: 2*Math.sqrt(3)*55 + Math.sqrt(3)*55/2, y: 2*1.5*55 + 55 },
            { key: '4,2', x: 4*Math.sqrt(3)*55 + Math.sqrt(3)*55/2, y: 2*1.5*55 + 55 }
        ];
        document.getElementById('hardModePanel').style.display = 'block';
    `);
    const pt = hexPoint(4, 2);
    s.run(`handleOpMapClick({ clientX: ${pt.x}, clientY: ${pt.y} });`);
    ok(s.evalCtx('appData.campaign.selectedOpUnit === appData.campaign.opUnits[1]'),
        'при включённом режиме маршрута клик по другому отряду ВЫБИРАЕТ его');
    ok(s.evalCtx('orderWaypoints.length') === 0, 'и НЕ добавляет точку в маршрут приказа');
    ok(!/if \(orderPanel && orderPanel\.style\.display === 'block' && isPlanningRoute\)/.test(HTML),
        'ветка набора маршрута больше не срабатывает по клику на свой отряд');
    ok(/isPlanningRoute && !ownUnitHit/.test(HTML), 'в условии набора маршрута есть проверка попадания по своему отряду');
}

// ───────────── 4. подчистка «залипшего» режима маршрута ─────────────────────
{
    ok(/isPlanningRoute\s*=\s*false;\s*\n\s*\}\s*\n\s*\/\/ ⚡ v13\.058/.test(HTML.replace(/\r/g, '')) ||
       /залипший/.test(HTML),
        'в начале клика по карте сбрасывается устаревший isPlanningRoute');
    ok(/if \(typeof isPlanningRoute !== 'undefined' && !isPlanningRoute\) return;/.test(HTML),
        'черновик маршрута не рисуется, когда режим планирования выключен');
    ok(/const draftPanel = document\.getElementById\('hardModePanel'\);\s*\n\s*if \(!draftPanel \|\| draftPanel\.style\.display !== 'block'\) return;/.test(HTML),
        'черновик маршрута не рисуется при закрытой панели приказов');
    // hideOrderPanel чистит черновик полностью
    const hide = extractFn(HTML, 'hideOrderPanel');
    ok(/orderWaypoints = \[\]/.test(hide) && /isPlanningRoute = false/.test(hide) && /orderPanelMinimized = false/.test(hide),
        'hideOrderPanel очищает маршрут, режим планирования и флаг свёрнутости');
    // submitOrder при любом пути отправки гасит черновик
    const submit = extractFn(HTML, 'submitOrder');
    ok((submit.match(/isPlanningRoute = false/g) || []).length >= 3,
        'все ветки отправки одиночного приказа выключают режим маршрута',
        (submit.match(/isPlanningRoute = false/g) || []).length);
    const queue = extractFn(HTML, 'submitOrderQueue');
    ok(/isPlanningRoute = false/.test(queue) && /orderWaypoints = \[\]/.test(queue),
        'отправка серии приказов тоже очищает черновик');
}

// ───────────── 5. подписи жёлтой графики ──────────────────────────────────
{
    const ad = freshAppData();
    ad.campaign.opUnits = [{ name: 'Взвод', col: 2, row: 2 }];
    const s = createSandbox(ad);
    s.run(`
        var OP_HEX_SIZE = 55;
        var orderWaypoints = [{ col: 3, row: 2 }, { col: 4, row: 2 }];
        var isPlanningRoute = true;
        var window = globalThis;
        function getRouteToTarget(c1, r1, c2, r2) { return [{ col: c2, row: r2 }]; }
        function operationalMoveChainStart() { return null; }
        function getOrderTypeLabel(t) { return t; }
        function opHexCenter(col, row, size) {
            return { x: col * Math.sqrt(3) * size + (row % 2) * Math.sqrt(3) * size / 2 + Math.sqrt(3) * size / 2,
                     y: row * 1.5 * size + size };
        }
        document.getElementById('orderTargetUnit').value = '0';
        document.getElementById('hardModePanel').style.display = 'block';
    `);
    const ctx1 = makeCtx();
    s.sandbox.__drawCtx = ctx1;
    s.run('drawOrderRoute(globalThis.__drawCtx, 55);');
    const texts1 = ctx1.calls.filter(c => c.name === 'fillText').map(c => String(c.args[0]));
    ok(texts1.some(t => /маршрут приказа/.test(t)),
        'у черновика маршрута есть подпись «маршрут приказа»', texts1.join(' | '));
    ok(ctx1.calls.some(c => c.name === 'setLineDash' && JSON.stringify(c.args[0]) === '[6,4]'),
        'жёлтый пунктир черновика рисуется как раньше');
    // панель закрыли без сброса данных — графики нет
    s.run(`document.getElementById('hardModePanel').style.display = 'none';`);
    const ctx2 = makeCtx();
    s.sandbox.__drawCtx = ctx2;
    s.run('drawOrderRoute(globalThis.__drawCtx, 55);');
    ok(ctx2.calls.length === 0, 'при свёрнутой панели жёлтый пунктир не рисуется', ctx2.calls.length);
    s.run(`document.getElementById('hardModePanel').style.display = 'block'; isPlanningRoute = false;`);
    const ctx3 = makeCtx();
    s.sandbox.__drawCtx = ctx3;
    s.run('drawOrderRoute(globalThis.__drawCtx, 55);');
    ok(ctx3.calls.length === 0, 'без режима планирования жёлтый пунктир не рисуется');
    // подпись у ОТДАННОГО приказа
    ok(/маршрут\$\{route\.pending \? ' \(ждёт доставки\)' : ''\}/.test(HTML),
        'у отданного приказа на карте подпись «№N тип маршрут»');
    ok(/приказов: \$\{count\} — их маршруты отмечены жёлтым пунктиром/.test(HTML),
        'при выборе отряда с приказами в подсказке объясняется жёлтый пунктир');
}

// ───────────── 6. разведка: пауза набора маршрута ──────────────────────────
function reconSandbox() {
    const ad = freshAppData();
    const s = createSandbox(ad);
    s.run(`
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
`);
    s.run(RECON);
    s.run(`
appData.campaign.opMapGrid = { '5,5': ['road'], '6,5': ['road'], '7,5': ['grass'] };
appData.campaign.opCenters = [
  { key: '5,5', x: 0, y: 0 }, { key: '6,5', x: 60, y: 0 }, { key: '7,5', x: 120, y: 0 }
];
var scoutSquad = { name: 'Мотоциклист-разведчик', reconAssetKey: 'beve_motorcycle_scout', fighters: [{ hp: 3 }] };
var hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 5, row: 5, hasRadioFlag: true, squads: [scoutSquad] };
appData.campaign.opUnits = [hq];
initReconAssets();
`);
    return s;
}

{
    const s = reconSandbox();
    ok(s.evalCtx("typeof reconPauseRoutePicking === 'function'") === true, 'есть reconPauseRoutePicking');
    ok(s.evalCtx("typeof reconResumeRoutePicking === 'function'") === true, 'есть reconResumeRoutePicking');
    ok(s.evalCtx("typeof reconIsPickingRoute === 'function'") === true, 'есть reconIsPickingRoute');
    s.run('openReconMissionModalForAsset(0, "beve_motorcycle_scout");');
    ok(s.evalCtx('reconIsPickingRoute()') === true, 'после «отправить с разведкой» набор маршрута включён');
    ok(s.evalCtx('reconDraft.assetKey') === 'beve_motorcycle_scout', 'актив выбран из штаба');
    ok(s.evalCtx('reconDraft.squadName') === 'Мотоциклист-разведчик', 'источник — отряд штаба');
    // набор маршрута работает
    ok(s.evalCtx('handleReconRouteDraftClick(60, 0, 55)') === true, 'клик по гексу добавляет точку маршрута');
    ok(s.evalCtx('reconDraft.route.length') === 1, 'точка действительно добавлена');
    // пауза: клики по карте больше не уходят в маршрут
    s.run('reconPauseRoutePicking();');
    ok(s.evalCtx('reconIsPickingRoute()') === false, 'пауза выключает перехват кликов');
    ok(s.evalCtx('handleReconRouteDraftClick(120, 0, 55)') === false, 'во время паузы клик по карте не добавляет точку');
    ok(s.evalCtx('reconDraft.route.length') === 1, 'маршрут при паузе сохраняется');
    s.run('reconResumeRoutePicking();');
    ok(s.evalCtx('reconIsPickingRoute()') === true, '«Добавить точки» возвращает набор');
    ok(s.evalCtx('handleReconRouteDraftClick(120, 0, 55)') === true, 'и точки снова добавляются');
    const panel = s.elements.reconPanel ? s.elements.reconPanel.innerHTML : '';
    ok(/✋ Закончить набор/.test(panel), 'в панели есть кнопка «Закончить набор»', panel.slice(0, 120));
    s.run('reconPauseRoutePicking();');
    const panel2 = s.elements.reconPanel ? s.elements.reconPanel.innerHTML : '';
    ok(/➕ Добавить точки/.test(panel2), 'после паузы в панели кнопка «Добавить точки»');
    ok(/Набор точек приостановлен/.test(panel2), 'и подсказка, что клики теперь выбирают отряды');
}

// ───────────── 7. клик по своему отряду прерывает набор маршрута ───────────
{
    ok(/if \(ownUnitHit\) \{\s*\n\s*if \(typeof reconPauseRoutePicking === 'function'\)/.test(HTML.replace(/\r/g, '')),
        'клик по своему отряду ставит набор маршрута разведки на паузу');
    ok(/const ownUnitHit = \(typeof opOwnUnitAtPoint === 'function'\)/.test(HTML),
        'попадание по своему отряду вычисляется один раз до всех перехватов');
}

// ───────────── 8. штаб — узел выдачи разведприказов ────────────────────────
{
    ok(/openReconMissionModalForAsset\(\$\{unitIndex\}, '\$\{src\.assetKey\}'\)/.test(HTML),
        'в карточке штаба — отдельная кнопка на каждый развед-отряд');
    ok(/isBattalionHqUnit\(unit\)/.test(HTML) && /reconListAssetSources\(\)\.filter\(src => Number\(src\.unitId\) === unitIndex\)/.test(HTML),
        'кнопки строятся только для отрядов ЭТОГО штаба');
    ok(/Приказ от штаба: выберите развед-отряд/.test(HTML), 'подпись «Приказ от штаба»');

    const s = reconSandbox();
    s.run(`
var hqUnit = appData.campaign.opUnits[0];
hqUnit.squads.push({ name: 'AL-41 Hidalgo', reconAssetKey: 'airf_hidalgo', fighters: [{ hp: 3 }] });
initReconAssets();
`);
    const sources = JSON.parse(s.evalCtx('JSON.stringify(reconListAssetSources())'));
    ok(sources.length === 2 && sources.every(src => src.unitId === 0),
        'у штаба числятся два развед-отряда (мотоциклист и Hidalgo)', JSON.stringify(sources));
    s.run('openReconMissionModalForAsset(0, "airf_hidalgo");');
    ok(s.evalCtx('reconDraft.assetKey') === 'airf_hidalgo', 'из штаба можно отправить именно Hidalgo');
    ok(s.evalCtx('typeof openReconMissionModalForAsset === "function"') === true,
        'функция выдачи приказа от штаба загружена');
    // бронеавтомобиль не является развед-активом (v13.160 + v13.163)
    ok(s.evalCtx("typeof RECON_ASSET_TYPES.beve_armored_car === 'undefined'"),
        'бронеавтомобили не входят в пул развед-активов');
    ok(/armored_vehicle_platoon[\s\S]{0,400}observe/.test(HTML) || /'observe'/.test(HTML),
        'для обычных взводов (и БА) остаётся приказ «👁️ Наблюдение»');
}

// ───────────── 9. версия сборки ───────────────────────────────────────────
{
    ok(/var APP_VERSION = 'v13\.163';/.test(HTML), 'APP_VERSION = v13.163');
    ok(/CACHE_NAME = 'wargame-v13\.163'/.test(SW), 'CACHE_NAME синхронизирован');
    ok(/"short_name": "БМ v13\.163"/.test(MANIFEST), 'manifest.short_name синхронизирован');
    const markers = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))
        .filter(f => /BUILD-МАРКЕР: v13\.163/.test(read('js/' + f)));
    ok(markers.length >= 10, 'BUILD-маркеры js/*.js обновлены', markers.length);
}

// общий /tmp/wg_part.js — подчищаем (его подгружают следующие песочницы)
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

console.log(`\nИтог v13.163 (выбор отряда после приказа и разведка от штаба): PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
