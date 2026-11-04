'use strict';
// ⚡ v13.155 — партия 5 (начало):
//  20. игроку, который сам создаёт шум, маркеры шума не показываются — их
//      видит только противоположная сторона;
//  27. у отрядов без орудий/миномётов и без ПТО-средств нет кнопок
//      «Орудия / Миномёты» и «Атака ПТО»;
//  31. у бронеавтомобилей BeVe нет кнопки «Орудия / Миномёты» (их орудие
//      стреляет через «Атака ПТО»).
const fs = require('fs');
const { sliceFunction, HTML } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

// ─────────────── 20. Свой шум не виден ───────────────
{
    const add = sliceFunction(HTML, 'addOperationalArtilleryNoise');
    ok(/viewerSide/.test(add), 'маркер шума хранит сторону-адресата (viewerSide)');

    const draw = sliceFunction(HTML, 'drawOperationalNoiseMarkers');
    ok(/viewerSide !== 'enemy'/.test(draw), 'маркеры своего шума не рисуются');
    ok(!/campaign\.opNoiseMarkers = \(campaign\.opNoiseMarkers \|\| \[\]\)\.filter\(m => m && Number\(m\.expiresTurn\) >= turn && m\.viewerSide !== 'enemy'\)/.test(draw),
        'маркеры своего шума не выбрасываются из массива (иначе пропадут из синхронизации)');
    ok(/visibleNoise/.test(draw), 'фильтр для отрисовки отделён от массива');

    const art = sliceFunction(HTML, 'opCheckUnitDetection');
    ok(/noiseIsOwn/.test(art), 'навесной огонь определяет, чей это шум');
    ok(/addOperationalArtilleryNoise\(unit, undefined, noiseIsOwn \? 'enemy' : 'player'\)/.test(art),
        'свой залп адресуется противнику, вражеский — игроку');
    ok(/addOperationalArtilleryNoise\(art, undefined, 'player'\)/.test(HTML),
        'шум вражеской артиллерии видит игрок');

    const panelStatus = /currentSquad\.noiseMarker \? '<span style="color:#f39c12;">❗ Шум<\/span>'/.test(HTML);
    ok(!panelStatus, 'панель своего отряда не показывает «❗ Шум»');
    ok(!/unit\.noiseMarker \? 'Шумовая отметка'/.test(HTML), 'карточка своего взвода не показывает шумовую отметку');

    const s = createSandbox(freshAppData());
    s.run(sliceFunction(HTML, 'addOperationalArtilleryNoise'));
    s.run(`
        function redrawOperationalMap() {}
        function onlinePushOperationalNoiseMarkers() {}
        var OP_MAP_COLS = 20, OP_MAP_ROWS = 20;
        appData.campaign.opMapGrid = {};
        appData.campaign.currentTurn = 3;
        appData.campaign.opNoiseMarkers = [];
        appData.campaign.online = false;
        var ownUnit = { name: 'Свой', col: 5, row: 5 };
        addOperationalArtilleryNoise(ownUnit, 'own:1', 'enemy');
        var ownMarkers = (appData.campaign.opNoiseMarkers || []).length;
        var ownSide = (appData.campaign.opNoiseMarkers || []).every(m => m.viewerSide === 'enemy');
        addOperationalArtilleryNoise({ name: 'Враг', col: 9, row: 9 }, 'enemy:1', 'player');
    `);
    ok(s.evalCtx('ownMarkers') === 3, 'шум отмечается в гексе источника и двух соседних', String(s.evalCtx('ownMarkers')));
    ok(s.evalCtx('ownSide') === true, 'маркеры своего шума адресованы противнику');
    ok((s.evalCtx('appData.campaign.opNoiseMarkers.filter(m => m.viewerSide === "player").length')) === 3,
        'маркеры вражеского шума адресованы игроку');

    // отрисовка не удаляет «чужие» маркеры из массива
    const d = createSandbox(freshAppData());
    d.run(sliceFunction(HTML, 'drawOperationalNoiseMarkers'));
    d.run(`
        var OP_HEX_SIZE = 30;
        var drawn = 0;
        var ctx = { save(){}, restore(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, fillText(){drawn++;}, set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){}, set font(v){}, set textAlign(v){}, set textBaseline(v){} };
        appData.campaign.currentTurn = 2;
        appData.campaign.opZoomLevel = 1;
        appData.campaign.opNoiseMarkers = [
            { col: 1, row: 1, expiresTurn: 5, viewerSide: 'enemy' },
            { col: 2, row: 2, expiresTurn: 5, viewerSide: 'player' }
        ];
        drawOperationalNoiseMarkers(ctx);
        var keptEnemy = appData.campaign.opNoiseMarkers.some(m => m.viewerSide === 'enemy');
    `);
    ok(d.evalCtx('drawn') === 1, 'рисуется только маркер, адресованный игроку', String(d.evalCtx('drawn')));
    ok(d.evalCtx('keptEnemy') === true, 'свой шум остаётся в массиве для синхронизации');
}

// ─────────────── 27/31. Кнопки орудий и ПТО ───────────────
{
    const panel = sliceFunction(HTML, 'renderActiveCardButtons');
    ok(/squadHasOrdnanceCrew/.test(panel), 'панель считает наличие орудий/миномётов в расчётах');
    ok(/squadHasAntiTankCrew/.test(panel), 'панель считает наличие ПТО/танкового орудия');
    ok(/isBeveArmoredCar/.test(panel), 'бронеавтомобили BeVe распознаются отдельно');
    ok(/const showOrdnanceButton = currentSquad\.armor\s*\n?\s*\? \(hasVehicleOrdnance && !isBeveArmoredCar\)\s*\n?\s*: squadHasOrdnanceCrew;/.test(panel),
        'кнопка «Орудия / Миномёты» — только при наличии оружия и не у БА BeVe');
    ok(/const showAntiTankButton = currentSquad\.armor \? !!vehicleArtillery : squadHasAntiTankCrew;/.test(panel),
        'кнопка «Атака ПТО» — только при наличии ПТО-средств');
    ok(!/if \(!\(currentSquad\.armor && !hasVehicleOrdnance\)\) \{/.test(panel),
        'прежняя безусловная кнопка «Орудия / Миномёты» убрана');
    ok(!/if \(!currentSquad\.armor \|\| vehicleArtillery\) \{/.test(panel),
        'прежняя безусловная кнопка «Атака ПТО» убрана');
    ok(/vehicleFamilyFor\(currentSquad\) \|\| \{\}\)\.id === 'landsverk'/.test(panel),
        'у БА BeVe (Landsverk) кнопка орудий скрыта');
}

console.log(`\nитог: passed ${pass}, failed ${fail}`);
if (fail) process.exit(1);
