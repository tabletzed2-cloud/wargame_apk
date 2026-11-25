'use strict';
// ⚡ v13.171 — два пункта постановки:
//   1. BeVe при отправке бронеавтомобиля в разведку выбирает, КАКАЯ именно
//      машина (Landsverk 183 №1, №2 или №3) уходит на задание.
//   2. Вся бронетехника и транспорт с шансом 5 % застревает или ломается, если
//      в этом оперативном ходу ехала НЕ по дороге. Проверка — в конце хода;
//      машина, которая не двигалась, не проверяется.
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const RECON = fs.readFileSync(path.join(ROOT, 'js/recon.js'), 'utf8');

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}
const J = (s, code) => s.evalCtx(`JSON.stringify(${code})`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ───────────────────────── общая песочница ─────────────────────────
function baseSandbox(opUnits, enemyOpUnits) {
    const ad = freshAppData();
    ad.campaign.opUnits = opUnits || [];
    ad.campaign.enemyOpUnits = enemyOpUnits || [];
    ad.campaign.reconMissions = [];
    ad.campaign.opMapGrid = {};
    const s = createSandbox(ad);
    s.run(`function isHexInPlayableArea(scenario, col, row) { return col >= 0 && row >= 0 && col < 14 && row < 14; }
      function getOpHexNeighbors(col, row) { return [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]
        .map(([dc,dr]) => ({col:col+dc,row:row+dr})).filter(p=>isHexInPlayableArea(null,p.col,p.row)); }`);
    s.run('globalThis.__rng = [];\nfunction __roll() { return __rng.length ? __rng.shift() : 0.99; }');
    return s;
}
function loadVehicleCode(s) {
    ['OP_VEHICLE_STUCK_CHANCE', 'OP_VEHICLE_STUCK_TURNS', 'OP_VEHICLE_REPAIR_CHANCE',
        'OP_VEHICLE_BREAKDOWN_MOBILITIES', 'OP_VEHICLE_BREAKDOWN_NAME_RE']
        .forEach(name => s.run(sliceConst(HTML, name)));
    ['opUnitIsMotorVehicle', 'opHexIsRoad', 'opVehicleIsImmobile', 'opVehicleStatusLabel',
        'opVehicleOffroadStep', 'opVehicleSupplyRepairNearby', 'opVehicleBreakdownTurnCheck',
        'opRecordPrevPos', 'getOpMoveCost', 'getOpPlannedMoveCost', 'opVehicleStatusMarkup']
        .forEach(name => { try { s.run(sliceFunction(HTML, name)); } catch (e) { console.log('  (нет ' + name + ': ' + e.message + ')'); } });
}

// ═════════════════ 1. Выбор бронеавтомобиля для разведки ═════════════════
console.log('— 1. какую именно машину отправить (BeVe) —');
{
    const cars = [1, 2, 3].map(n => ({
        name: `Бронеавтомобиль Landsverk 183 №${n}`,
        type: 'armored_vehicle_platoon', mobility: 'vehicle',
        col: 4 + n, row: 4, squads: [{ name: `Экипаж БА №${n}`, fighters: [{ name: 'Водитель', hp: 3 }] }]
    }));
    const s = baseSandbox([{ name: 'Штаб батальона BeVe', type: 'battalion_hq', mobility: 'foot', col: 2, row: 2, squads: [] }].concat(cars));
    s.run(RECON);

    ok(s.evalCtx("reconListAssetSources().filter(x => x.assetKey === 'beve_armored_car').length") === 3,
        'все три Landsverk — отдельные развед-активы', String(s.evalCtx("reconListAssetSources().filter(x => x.assetKey === 'beve_armored_car').length")));
    const names = JSON.parse(J(s, "reconAvailableSources('beve_armored_car').map(x => reconSourceName(x))"));
    ok(eq(names, ['Бронеавтомобиль Landsverk 183 №1', 'Бронеавтомобиль Landsverk 183 №2', 'Бронеавтомобиль Landsverk 183 №3']),
        'в панели видно все три машины по именам', JSON.stringify(names));

    // выбор третьей машины в панели
    s.run(`reconDraft = { assetKey: 'beve_armored_car', unitId: null, squadName: null, sourceIndex: null,
        route: [], observeMode: 'stationary', reportMethod: 'radio', missionId: null, pickingRoute: true };`);
    ok(s.evalCtx('reconSelectSource(2)') === true, 'выбор машины №3 в списке работает');
    ok(s.evalCtx('reconDraft.unitId') === 3, 'черновик запомнил именно №3 (индекс 3)', String(s.evalCtx('reconDraft.unitId')));
    ok(s.evalCtx('appData.campaign.opUnits[3].name') === 'Бронеавтомобиль Landsverk 183 №3',
        'индекс ведёт на №3', String(s.evalCtx('appData.campaign.opUnits[3].name')));

    // отправка миссии именно выбранной машиной
    s.run('reconDraft.route = [{ col: 8, row: 8 }, { col: 9, row: 8 }];');
    const mission = JSON.parse(J(s, 'reconSubmitMission() || null'));
    ok(!!mission, 'миссия создана');
    ok(mission && mission.unitId === 3 && mission.unitName === 'Бронеавтомобиль Landsverk 183 №3',
        'в разведку ушла ИМЕННО выбранная машина №3', mission && `${mission.unitId}:${mission.unitName}`);
    ok(s.evalCtx('!!appData.campaign.opUnits[3].reconHidden') === true, '№3 скрыта с карты (ушла на задание)');
    ok(s.evalCtx('!!appData.campaign.opUnits[1].reconHidden') === false &&
       s.evalCtx('!!appData.campaign.opUnits[2].reconHidden') === false,
        '№1 и №2 остались на карте');
    const left = JSON.parse(J(s, "reconAvailableSources('beve_armored_car').map(x => reconSourceName(x))"));
    ok(eq(left, ['Бронеавтомобиль Landsverk 183 №1', 'Бронеавтомобиль Landsverk 183 №2']),
        'занятая машина выпала из списка выбора', JSON.stringify(left));

    // панель: второй список «Машина:»
    s.run(`reconDraft = { assetKey: 'beve_armored_car', unitId: null, squadName: null, sourceIndex: null,
        route: [], observeMode: 'stationary', reportMethod: 'radio', missionId: null, pickingRoute: true };
        renderReconPanel();`);
    const html = String(s.elements['reconPanel'] && s.elements['reconPanel'].innerHTML || '');
    ok(/Машина:/.test(html) && /reconSelectSource/.test(html), 'в панели разведки есть выбор машины');
    const options = (html.match(/<option value="\d+"[^>]*>[^<]*<\/option>/g) || [])
        .filter(opt => /Landsverk/.test(opt));
    ok(options.length === 2 && /№1/.test(options[0]) && /№2/.test(options[1]),
        'в списке выбора только свободные машины (№1, №2)', JSON.stringify(options));

    // выбор сохраняется, если машина занята
    s.run(`reconDraft.unitId = 3; reconDraft.squadName = null; reconDraftEnsureSource();`);
    ok(s.evalCtx('reconDraft.unitId') === 1, 'если выбранная машина ушла — подставляется свободная',
        String(s.evalCtx('reconDraft.unitId')));
    // одиночный актив (Hidalgo и т.п.) — без второго списка
    ok(s.evalCtx("reconAvailableSources('airf_hidalgo').length") === 0, 'активов другой фракции в списке нет');
}

// ═════════════════ 2. Кто считается бронетехникой и транспортом ═════════════════
console.log('— 2. бронетехника и транспорт —');
{
    const s = baseSandbox();
    loadVehicleCode(s);
    const cases = [
        ['Танк CL/39 №1', { mobility: 'vehicle' }, true],
        ['Бронеавтомобиль Landsverk 183 №2', { mobility: 'vehicle' }, true],
        ['БТР Llanero', { mobility: 'vehicle' }, true],
        ['САУ Brugge', { mobility: 'vehicle' }, true],
        ['Грузовик DAF Trado II', { mobility: 'vehicle' }, true],
        ['Легкий грузовик CLg-37 «Викунья»', { mobility: 'vehicle' }, true],
        ['Горный транспортёр TG-41', { mobility: 'halftrack' }, true],
        ['Автомобиль DAF MC-V', { mobility: 'amphibious' }, true],
        ['Мотоциклетный взвод №4', { mobility: 'motorcycle' }, true],
        ['AL-41 Hidalgo', { mobility: 'foot' }, true],
        ['1-й пехотный взвод', { mobility: 'foot' }, false],
        ['1-й самокатный взвод', { mobility: 'bicycle' }, false],
        ['ДОТ №1', { mobility: 'vehicle' }, false],
        ['Мотоциклетный взвод (спешен)', { mobility: 'foot', dismounted: true }, false],
        ['Танк CL/39 (уничтожен)', { mobility: 'vehicle', isDestroyed: true }, false]
    ];
    cases.forEach(([name, extra, expected]) => {
        s.run(`appData.campaign.opUnits = [Object.assign({ name: ${JSON.stringify(name)} }, ${JSON.stringify(extra)})];`);
        const got = s.evalCtx('opUnitIsMotorVehicle(appData.campaign.opUnits[0])');
        ok(got === expected, `${name} → ${expected ? 'проверяется' : 'не проверяется'}`, String(got));
    });
}

// ═════════════════ 3. Отметка «ехала не по дороге» ═════════════════
console.log('— 3. езда не по дороге запоминается на ход —');
{
    const s = baseSandbox([{ name: 'Танк CL/39', mobility: 'vehicle', col: 4, row: 4 }]);
    loadVehicleCode(s);
    s.run("appData.campaign.opMapGrid['4,4'] = ['grass']; appData.campaign.opMapGrid['5,5'] = ['road'];");
    ok(s.evalCtx('opHexIsRoad(5,5)') === true, 'гекс с типом road — дорога');
    ok(s.evalCtx('opHexIsRoad(4,4)') === false, 'трава — не дорога');
    ok(s.evalCtx('opVehicleOffroadStep(appData.campaign.opUnits[0])') === true, 'уход с травы — «не по дороге»');
    ok(s.evalCtx('appData.campaign.opUnits[0].offroadMovedThisTurn') === true, 'отметка поставлена');
    s.run('appData.campaign.opUnits[0].col = 5; appData.campaign.opUnits[0].row = 5; appData.campaign.opUnits[0].offroadMovedThisTurn = false;');
    ok(s.evalCtx('opVehicleOffroadStep(appData.campaign.opUnits[0])') === false, 'уход с дороги отметку не ставит');
    s.run('appData.campaign.opUnits[0].mobility = "foot"; appData.campaign.opUnits[0].name = "Пехота";');
    s.run('appData.campaign.opUnits[0].col = 4; appData.campaign.opUnits[0].row = 4;');
    ok(s.evalCtx('opVehicleOffroadStep(appData.campaign.opUnits[0])') === false, 'пехоту не проверяем');
    // opRecordPrevPos — единственная общая точка всех шагов на опкарте
    s.run('appData.campaign.opUnits[0].mobility = "vehicle"; appData.campaign.opUnits[0].name = "Танк"; appData.campaign.opUnits[0].offroadMovedThisTurn = false; opRecordPrevPos(appData.campaign.opUnits[0]);');
    ok(s.evalCtx('appData.campaign.opUnits[0].offroadMovedThisTurn') === true, 'opRecordPrevPos ставит отметку при шаге по траве');
}

// ═════════════════ 4. Проверка в конце хода: 5 % ═════════════════
console.log('— 4. конец хода: 5 % застрять или сломаться —');
{
    const s = baseSandbox([{ name: 'Танк CL/39 №1', mobility: 'vehicle', col: 4, row: 4, movedThisTurn: true, offroadMovedThisTurn: true }]);
    loadVehicleCode(s);
    ok(s.evalCtx('OP_VEHICLE_STUCK_CHANCE') === 0.05, 'шанс ровно 5 %', String(s.evalCtx('OP_VEHICLE_STUCK_CHANCE')));
    // бросок 0.01 (< 0.05), затем 0.2 (< 0.5) → застряла
    let out = JSON.parse(J(s, '(function(){ __rng = [0.01, 0.2]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.stuck.length === 1 && out.broken.length === 0, 'при броске 1 % — застряла', JSON.stringify(out));
    ok(s.evalCtx('Number(appData.campaign.opUnits[0].stuckTurns)') === 1, 'застрявшая машина стоит 1 ход',
        String(s.evalCtx('appData.campaign.opUnits[0].stuckTurns')));
    ok(s.evalCtx('opVehicleIsImmobile(appData.campaign.opUnits[0])') === true, 'машина считается неподвижной');
    ok(s.evalCtx('opVehicleStatusLabel(appData.campaign.opUnits[0])') === '🪤 застряла', 'подпись «застряла»');
    ok(s.evalCtx('appData.campaign.opUnits[0].offroadMovedThisTurn') === false, 'отметка езды сброшена после проверки');
    ok(s.evalCtx('getOpMoveCost(appData.campaign.opUnits[0], 4, 4, 5, 4)') === null ||
       s.evalCtx('String(getOpMoveCost(appData.campaign.opUnits[0], 4, 4, 5, 4))') === 'Infinity',
        'застрявшая машина не может ехать (∞)', s.evalCtx('String(getOpMoveCost(appData.campaign.opUnits[0], 4, 4, 5, 4))'));
    ok(s.evalCtx('String(getOpPlannedMoveCost(appData.campaign.opUnits[0], 4, 4, 5, 4))') === 'Infinity',
        'и «пешком» её тоже не обойти (без спешивания)');

    // повторный вызов в том же ходу ничего не делает
    ok(s.evalCtx('(function(){ __rng = [0.01, 0.2]; return opVehicleBreakdownTurnCheck(__roll).checked; })()') === 0,
        'в одном ходу проверка одна (двойного броска нет)');

    // сломалось: 0.01 → попали в 5 %, 0.8 → «сломалась»
    const s2 = baseSandbox([{ name: 'Бронеавтомобиль Landsverk 183 №1', mobility: 'vehicle', col: 4, row: 4, movedThisTurn: true, offroadMovedThisTurn: true }]);
    loadVehicleCode(s2);
    out = JSON.parse(J(s2, '(function(){ __rng = [0.01, 0.8]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.broken.length === 1 && out.stuck.length === 0, 'второй исход — сломалась (50/50)', JSON.stringify(out));
    ok(s2.evalCtx('appData.campaign.opUnits[0].brokenDown') === true, 'флаг «сломалась» стоит');
    ok(s2.evalCtx('opVehicleStatusLabel(appData.campaign.opUnits[0])') === '🔧 сломалась', 'подпись «сломалась»');

    // броском выше 5 % — машина на ходу
    const s3 = baseSandbox([{ name: 'Танк CL/39 №1', mobility: 'vehicle', col: 4, row: 4, movedThisTurn: true, offroadMovedThisTurn: true }]);
    loadVehicleCode(s3);
    out = JSON.parse(J(s3, '(function(){ __rng = [0.05, 0.9]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.checked === 1 && !out.stuck.length && !out.broken.length, 'ровно 5 % и выше — машина едет дальше', JSON.stringify(out));
    ok(s3.evalCtx('opVehicleIsImmobile(appData.campaign.opUnits[0])') === false, 'флагов поломки нет');
}

console.log('— 5. кого НЕ проверяем —');
{
    // не двигалась в этом ходу
    const s = baseSandbox([{ name: 'Танк CL/39 №1', mobility: 'vehicle', col: 4, row: 4, movedThisTurn: false, offroadMovedThisTurn: true }]);
    loadVehicleCode(s);
    let out = JSON.parse(J(s, '(function(){ __rng = [0.0, 0.0]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.checked === 0 && !out.stuck.length && !out.broken.length,
        'стоявшая машина не проверяется (даже с «плохим» броском)', JSON.stringify(out));
    ok(s.evalCtx('__rng.length') === 2, 'бросок вообще не делался', String(s.evalCtx('__rng.length')));

    // двигалась, но только по дороге
    const s2 = baseSandbox([{ name: 'Грузовик DAF Trado II', mobility: 'vehicle', col: 5, row: 5, movedThisTurn: true }]);
    loadVehicleCode(s2);
    s2.run("appData.campaign.opMapGrid['5,5'] = ['road'];");
    out = JSON.parse(J(s2, '(function(){ __rng = [0.0, 0.0]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.checked === 0 && s2.evalCtx('__rng.length') === 2, 'езда только по дороге проверку не вызывает');

    // пехота и велосипедисты
    const s3 = baseSandbox([
        { name: '1-й пехотный взвод', mobility: 'foot', col: 4, row: 4, movedThisTurn: true, offroadMovedThisTurn: true },
        { name: '2-й самокатный взвод', mobility: 'bicycle', col: 4, row: 4, movedThisTurn: true, offroadMovedThisTurn: true }
    ]);
    loadVehicleCode(s3);
    out = JSON.parse(J(s3, '(function(){ __rng = [0.0, 0.0]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.checked === 0 && !out.stuck.length && !out.broken.length, 'пехота и велосипеды не ломаются');
}

console.log('— 6. восстановление: вытащили / починили —');
{
    // застряла в прошлом ходу → в этом вытащили
    const s = baseSandbox([{ name: 'Танк CL/39 №1', mobility: 'vehicle', col: 4, row: 4, movedThisTurn: false, stuckTurns: 1 }]);
    loadVehicleCode(s);
    let out = JSON.parse(J(s, '(function(){ __rng = [0.9]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.freed.length === 1, 'через ход машину вытащили', JSON.stringify(out));
    ok(s.evalCtx('Number(appData.campaign.opUnits[0].stuckTurns)') === 0, 'счётчик застревания обнулён');
    ok(s.evalCtx('opVehicleIsImmobile(appData.campaign.opUnits[0])') === false, 'машина снова на ходу');
    ok(s.evalCtx('String(getOpMoveCost(appData.campaign.opUnits[0], 4, 4, 5, 4))') !== 'Infinity',
        'и снова может ехать');

    // сломалась: 30 % за ход
    const s2 = baseSandbox([{ name: 'Танк CL/39 №1', mobility: 'vehicle', col: 4, row: 4, movedThisTurn: false, brokenDown: true }]);
    loadVehicleCode(s2);
    out = JSON.parse(J(s2, '(function(){ __rng = [0.2]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.repaired.length === 1 && !s2.evalCtx('appData.campaign.opUnits[0].brokenDown'),
        'бросок 20 % (< 30 %) — починили', JSON.stringify(out));
    const s3 = baseSandbox([{ name: 'Танк CL/39 №1', mobility: 'vehicle', col: 4, row: 4, movedThisTurn: false, brokenDown: true }]);
    loadVehicleCode(s3);
    out = JSON.parse(J(s3, '(function(){ __rng = [0.5]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.repaired.length === 0 && s3.evalCtx('appData.campaign.opUnits[0].brokenDown') === true,
        'бросок 50 % — ещё стоит (ремонт не закончен)', JSON.stringify(out));

    // рядом взвод снабжения — ремонт гарантирован
    const s4 = baseSandbox([
        { name: 'Танк CL/39 №1', mobility: 'vehicle', col: 4, row: 4, movedThisTurn: false, brokenDown: true },
        { name: 'Взвод снабжения', mobility: 'vehicle', col: 4, row: 5, squads: [] }
    ]);
    loadVehicleCode(s4);
    out = JSON.parse(J(s4, '(function(){ __rng = [0.99]; return opVehicleBreakdownTurnCheck(__roll); })()'));
    ok(out.repaired.length === 1 && !s4.evalCtx('appData.campaign.opUnits[0].brokenDown'),
        'рядом взвод снабжения — ремонт за один ход при любом броске', JSON.stringify(out));
    ok(s4.evalCtx('opVehicleSupplyRepairNearby(appData.campaign.opUnits[0])') === true, 'соседний гекс со снабжением найден');
}

console.log('— 7. встроено в конец оперативного хода —');
{
    const endTurn = sliceFunction(HTML, 'endOperationalTurn');
    ok(/opVehicleBreakdownTurnCheck\(\)/.test(endTurn), 'проверка вызывается в endOperationalTurn');
    const idxCheck = endTurn.indexOf('opVehicleBreakdownTurnCheck()');
    const idxTurn = endTurn.indexOf('appData.campaign.currentTurn++');
    ok(idxCheck >= 0 && idxTurn > idxCheck, 'вызов стоит ДО смены номера хода (это конец хода)');
    const idxReset = endTurn.indexOf('movedThisTurn = false');
    ok(idxReset > idxCheck, 'флаги движения сбрасываются ПОСЛЕ проверки');
    ok((endTurn.match(/offroadMovedThisTurn = false/g) || []).length >= 2,
        'отметка «не по дороге» снимается и у своих, и у вражеских юнитов',
        String((endTurn.match(/offroadMovedThisTurn = false/g) || []).length));
    ok(/opVehicleBreakdownTurnCheck/.test(sliceFunction(HTML, 'onlineFinishTurn')),
        'в онлайне проверка тоже идёт перед отправкой состояния');
    const executeOrder = sliceFunction(HTML, 'executeOrder');
    ok(/opVehicleIsImmobile\(unit\)/.test(executeOrder) && /vehicleBlockedLogged/.test(executeOrder),
        'приказ на движение застрявшей машины ждёт, а не отменяется');
    ok(/opVehicleIsImmobile/.test(sliceFunction(HTML, 'stepUnitTowardTarget')), 'шаг к цели у застрявшей машины заблокирован');
    ok(/opVehicleOffroadStep/.test(sliceFunction(HTML, 'opRecordPrevPos')), 'opRecordPrevPos отмечает езду не по дороге');
    ok(/opVehicleStatusMarkup/.test(sliceFunction(HTML, 'showOpUnitInfoPopup')), 'в карточке юнита видно состояние машины');
}

console.log('— 8. версия и сборка —');
{
    const APP_VERSION = (/var APP_VERSION = '([^']+)'/.exec(HTML) || [])[1] || '';
    const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
    ok(/^v\d+\.\d+$/.test(APP_VERSION), 'APP_VERSION в формате vNN.NNN', APP_VERSION);
    ok(SW.indexOf('wargame-' + APP_VERSION) >= 0, 'CACHE_NAME совпадает с APP_VERSION');
    ok(RECON.split('\n')[0].indexOf(APP_VERSION) >= 0, 'BUILD-маркер js/recon.js = ' + APP_VERSION);
}

console.log('');
if (fails.length) {
    console.log('Итог v13.171 (выбор машины для разведки + 5 % застревания): PASS ' + pass + ' · FAIL ' + fails.length);
    fails.forEach(f => console.log('   ✗ ' + f));
    process.exit(1);
} else {
    console.log('Итог v13.171 (выбор бронеавтомобиля для разведки + 5 % застревания/поломки не по дороге): PASS ' + pass + ' · FAIL 0');
}
