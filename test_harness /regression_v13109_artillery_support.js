// v13.109: дымовые снаряды ампуломёта, артподдержка в тактическом бою,
//          новое правило телефонных линий (до 7 гексов кабеля).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData, setRandom } = require('./sandbox');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const MAPACTIONS = read('js/map_actions.js');

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log('✓ ' + name);
}

// ─── 1. Дымовые снаряды ампуломёта ───
test('1: дымовые снаряды ампуломёта — отдельный запас в 3 заряда', () => {
    assert.ok(/const AMPULOMET_SMOKE_CHARGES = 3;/.test(HTML), 'константа запаса = 3');
    assert.ok(/if \(s\.ampulometSmoke === undefined\) s\.ampulometSmoke = AMPULOMET_SMOKE_CHARGES;/.test(HTML),
        'миграция выдаёт запас старым сохранениям');
    assert.ok(/if \(t\.ampulometSmoke === undefined\) t\.ampulometSmoke = AMPULOMET_SMOKE_CHARGES;/.test(HTML),
        'миграция шаблонов');
    assert.ok(/'ampulometSmoke', \/\/ ⚡ v13\.109/.test(HTML), 'остаток запаса переносится в отряд кампании');
    const fire = sliceFunction(HTML, 'fireAmpulometSmokeShell');
    assert.ok(/squad\.ampulometSmoke = charges - 1;/.test(fire), 'тратится запас дымовых снарядов');
    assert.ok(!/ammoOrdnance\s*-=/.test(fire), 'основной боезапас ампуломёта не расходуется');
    assert.ok(/tacticalSmokeWindDestination/.test(fire) && /tacticalCreateSmokeCloud/.test(fire),
        'завеса ставится по тем же правилам, что и дымовые гранаты (d12 на ветер)');
    assert.ok(/dist > range/.test(fire), 'гекс вне дальности ампуломёта отклоняется');
    assert.ok(/spendAP\(idx, 1\)/.test(fire), 'стоимость — 0,5 ОД, как у дымовых гранат');
});

test('1б: кнопка дымового снаряда и выбор гекса на карте', () => {
    assert.ok(/beginAmpulometSmoke\(\)/.test(HTML), 'кнопка вызывает выбор гекса');
    assert.ok(/Дымовой снаряд ампуломёта/.test(HTML), 'подпись кнопки');
    assert.ok(/mapHexClickDuringAmpulometSmoke\(key\)/.test(sliceFunction(HTML, 'handleHexAction')),
        'клик по гексу перехватывается режимом дымового снаряда');
    assert.ok(/function mapHexClickDuringAmpulometSmoke/.test(MAPACTIONS), 'обработчик клика в панели карты');
    assert.ok(/pendingAmpulometSmoke/.test(MAPACTIONS), 'режим выбора гекса хранится в состоянии карты');
});

test('sandbox: дымовой снаряд ставит завесу, не трогая боекомплект', () => {
    const app = freshAppData();
    app.map = { grid: { '2,2': { squadIds: [0], enemySquadIds: [] } } };
    app.squads = [{
        name: 'Расчёт ампуломёта', faction: 'A.I.R.F.', ammoOrdnance: 12, ampulometSmoke: 3,
        crewInstances: [{ weaponName: 'Ампуломёт АМ-1', fighterIndices: [0], deployed: true }],
        fighters: [{ name: 'Боец', hp: 3 }]
    }];
    const s = createSandbox(app);
    s.run('var AMPULOMET_SMOKE_CHARGES = 3;');
    s.run(sliceFunction(HTML, 'ampulometActiveCrews'));
    s.run(sliceFunction(HTML, 'ampulometSmokeChargesLeft'));
    s.run(sliceFunction(HTML, 'ampulometSmokeRange'));
    s.run(sliceFunction(HTML, 'cancelAmpulometSmoke'));
    s.run(sliceFunction(HTML, 'fireAmpulometSmokeShell'));
    s.run(`
        var WEAPONS = [{ name: 'Ампуломёт АМ-1', type: 'mortar', isAmpulomet: true, effectiveRange: 8 }];
        getFactionCrewWeapons = () => WEAPONS;
        currentSquad = appData.squads[0];
        currentSquadIndex = 0;
        currentTurn = 1;
        var hexGridDistance = (c1, r1, c2, r2) => Math.abs(c1 - c2) + Math.abs(r1 - r2);
        var SMOKE_CALLS = [];
        tacticalCreateSmokeCloud = (center, side) => { SMOKE_CALLS.push(center); return { id: 'c1', center: center, hexes: [center] }; };
        tacticalSmokeWindDestination = (key) => key;
        rollD12 = () => 12;
        var AP_SPENT = 0;
        spendAP = (idx, cost) => { AP_SPENT += cost; return true; };
        var ok = fireAmpulometSmokeShell('2,2');
    `);
    assert.equal(s.evalCtx('ok'), true, 'залп дымовым снарядом выполнен');
    assert.equal(s.evalCtx('appData.squads[0].ampulometSmoke'), 2, 'израсходован 1 заряд из 3');
    assert.equal(s.evalCtx('appData.squads[0].ammoOrdnance'), 12, 'боекомплект ампуломёта не тронут');
    assert.equal(s.evalCtx('SMOKE_CALLS.join("|")'), '2,2', 'завеса поставлена в выбранном гексе');
    assert.equal(s.evalCtx('AP_SPENT'), 1, 'списано 0,5 ОД');
    // вне дальности — отказ без расхода заряда
    s.run(`var far = fireAmpulometSmokeShell('9,9');`);
    assert.equal(s.evalCtx('far'), false, 'гекс вне дальности отклонён');
    assert.equal(s.evalCtx('appData.squads[0].ampulometSmoke'), 2, 'заряд не списан за отклонённый выстрел');
    // заряды кончились — отказ
    s.run(`appData.squads[0].ampulometSmoke = 0; var empty = fireAmpulometSmokeShell('2,2');`);
    assert.equal(s.evalCtx('empty'), false, 'без зарядов дым поставить нельзя');
});

// ─── 2. Артиллерийская поддержка в тактическом бою ───
test('2: вызов артналёта требует живого радиста и рабочей рации', () => {
    const spotter = sliceFunction(HTML, 'tacticalArtillerySpotterStatus');
    assert.ok(/tacticalSquadHasAliveRadioOperator/.test(spotter), 'проверяется наличие радиста в бою');
    assert.ok(/нет живого радиста/.test(spotter), 'без радиста — понятная причина');
    assert.ok(/hasRadio\(unit\)/.test(spotter), 'нужна работающая рация у оперативного юнита');
    assert.ok(/isInRadioRange\(hq, unit\)/.test(spotter), 'нужна связь со штабом батальона');
    const operator = sliceFunction(HTML, 'tacticalSquadHasAliveRadioOperator');
    assert.ok(/радист/i.test(operator), 'радист ищется по имени бойца');
    assert.ok(/f\.hp > 0/.test(operator), 'радист должен быть жив');
});

test('2б: батареи отбираются по типу, дистанции и боеприпасам', () => {
    const batteries = sliceFunction(HTML, 'tacticalArtilleryBatteries');
    assert.ok(/isMediumArtillery/.test(batteries), 'годятся средняя артиллерия: САУ и миномёты 82-мм');
    assert.ok(/unitOperationalAmmoTotal\(unit, 'ordnance'\)/.test(batteries), 'батарея без снарядов молчит');
    assert.ok(/dist > range/.test(batteries), 'дальность берётся из operationalMediumArtilleryRange');
    assert.ok(/unit\.isInBattle/.test(batteries), 'батарея, занятая в бою, не стреляет');
    assert.ok(/TACTICAL_ARTY_SAU_SHELLS/.test(batteries) && /TACTICAL_ARTY_MORTAR_SHELLS/.test(batteries),
        'залп САУ и миномётной батареи различается');
});

test('2в: заявка уходит на следующий ход и разбирается в начале своего хода', () => {
    const request = sliceFunction(HTML, 'requestTacticalArtilleryStrike');
    assert.ok(/pendingArtillery\.push\(call\)/.test(request), 'заявка сохраняется в бою');
    assert.ok(/TACTICAL_ARTY_ARRIVE_DELAY/.test(request), 'залп приходит не мгновенно');
    assert.ok(/spendAP\(idx, TACTICAL_ARTY_AP_COST\)/.test(request), 'вызов стоит 1 ОД');
    assert.ok(/consumeOperationalAmmo/.test(request), 'батарея тратит снаряды');
    assert.ok(/const TACTICAL_ARTY_HIT_THRESHOLD = 7;/.test(HTML), 'd10 ≥ 7 бьёт в заданный гекс, 1–6 сносит в соседа');
    const resolve = sliceFunction(HTML, 'resolveTacticalArtilleryCalls');
    assert.ok(/arriveTurn\) <= turn/.test(resolve), 'налёт приходит в свой ход');
    assert.ok(/радист убит — связь прекращена/.test(resolve), 'без радиста налёт отменяется');
    assert.ok(/tacticalArtilleryResolveCall\(call, battle\)/.test(resolve), 'налёт разбирается');
    assert.ok(/resolveTacticalArtilleryCalls\(\)/.test(sliceFunction(HTML, 'nextTurn')),
        'разбор вызывается при смене хода');
    const shell = sliceFunction(HTML, 'tacticalArtilleryResolveCall');
    assert.ok(/tacticalArtilleryScatterHex\(call\.targetHex, roll, map\)/.test(shell), 'каждый снаряд отдельно попадает/сносится');
    assert.ok(/tacticalArtilleryScatterHex/.test(HTML) && /oddRow/.test(sliceFunction(HTML, 'tacticalArtilleryScatterHex')), 'снос использует шесть соседей с учётом чётности строки');
    assert.ok(/Math\.floor\(rawDamage \* 0\.6\)/.test(shell) && /afterTerrain \* damageable\.length/.test(shell), 'окоп снижает урон на 40%, затем он умножается на число отрядов');
    assert.ok(/Итог налёта/.test(shell), 'результат залпа виден в журнале');
    assert.ok(/tacticalIsDotSquad\(squad\)/.test(sliceFunction(HTML, 'tacticalArtilleryApplyDamage')),
        'ДОТ не получает урона от артиллерии');
    const occupants = sliceFunction(HTML, 'tacticalArtilleryHexOccupants');
    assert.ok(/cell\.squadIds/.test(occupants) && /cell\.enemySquadIds/.test(occupants),
        'налёт бьёт по всем в гексе, включая своих');
});

test('sandbox: полный цикл — вызов, очередь, залп в следующем ходу, урон по гексу', () => {
    const app = freshAppData();
    app.currentBattleId = 'battle-1';
    app.campaign.activeBattles = [{ id: 'battle-1', hexKey: '5,5' }];
    app.campaign.opUnits = [
        { name: 'Штаб батальона', type: 'battalion_hq', col: 5, row: 4, squads: [] },
        { name: '1-й стрелковый взвод', type: 'infantry', col: 5, row: 5, squads: [] },
        { name: 'Батарея 82-мм миномётов', type: 'mortar_battery', col: 7, row: 6,
          squads: [{ name: 'Миномётный расчёт', fighters: [{ hp: 3 }], ammoOrdnance: 40 }] }
    ];
    app.map = {
        grid: { '3,4': { squadIds: [], enemySquadIds: [0] } },
        enemySquads: [{ name: 'Вражеское отделение', fighters: [{ hp: 3 }, { hp: 3 }] }]
    };
    app.squads = [{
        name: 'Штаб взвода', opUnitName: '1-й стрелковый взвод',
        fighters: [{ name: 'Командир', hp: 3 }, { name: 'Радист 1', hp: 3 }]
    }];
    const s = createSandbox(app);
    s.run(`
        var TACTICAL_ARTY_AP_COST = 2, TACTICAL_ARTY_ARRIVE_DELAY = 1, TACTICAL_ARTY_HIT_THRESHOLD = 7;
        var TACTICAL_ARTY_MORTAR_SHELLS = 6, TACTICAL_ARTY_SAU_SHELLS = 4;
        currentTurn = 1; currentSquadIndex = 0; currentSquad = appData.squads[0];
        hardMode.enabled = true; hardMode.hqUnitId = 0;
        hardMode.signalPlatoon = { radios: { total: 3, available: 2, assigned: [{ unitId: 1 }] },
                                   phones: { total: 3, available: 3, assigned: [] } };
        ensureSignalPlatoonState = () => {};
        hasRadio = () => true;
        isInRadioRange = () => true;
        getSignalHQ = () => appData.campaign.opUnits[0];
        isMediumArtillery = (u) => u.type === 'mortar_battery' || u.type === 'sau_battery';
        operationalMediumArtilleryRange = () => 4;
        getOpHexDistance = (c1, r1, c2, r2) => Math.abs(c1 - c2) + Math.abs(r1 - r2);
        operationalAmmoSquads = (u) => (u.squads || []);
        unitOperationalAmmoTotal = () => 40;
        consumeOperationalAmmo = () => true;
        var AP_SPENT = 0;
        spendAP = (idx, cost) => { AP_SPENT += cost; return true; };
        getAP = () => 10;
        rollD10 = () => 8; // прямое попадание в заданный гекс
        rollD6 = () => 6;
        tacticalIsDotSquad = (sq) => /ДОТ|дзот/i.test(String((sq && sq.name) || ''));
    `);
    s.run(sliceFunction(HTML, 'tacticalArtilleryRecord'));
    s.run(sliceFunction(HTML, 'tacticalArtilleryBattleHex'));
    s.run(sliceFunction(HTML, 'tacticalSquadOpUnit'));
    s.run(sliceFunction(HTML, 'tacticalSquadHasAliveRadioOperator'));
    s.run(sliceFunction(HTML, 'tacticalArtillerySpotterStatus'));
    s.run(sliceFunction(HTML, 'tacticalArtilleryBatteries'));
    s.run(sliceFunction(HTML, 'tacticalArtilleryStatus'));
    s.run(sliceFunction(HTML, 'tacticalArtilleryPendingCalls'));
    s.run(sliceFunction(HTML, 'cancelTacticalArtilleryCall'));
    s.run(sliceFunction(HTML, 'requestTacticalArtilleryStrike'));
    s.run(sliceFunction(HTML, 'tacticalArtilleryHexOccupants'));
    s.run(sliceFunction(HTML, 'tacticalArtilleryApplyDamage'));
    s.run(sliceFunction(HTML, 'tacticalArtilleryScatterHex'));
    s.run(sliceFunction(HTML, 'tacticalArtilleryHexHasTrenches'));
    s.run(sliceFunction(HTML, 'tacticalArtilleryResolveCall'));
    s.run(sliceFunction(HTML, 'resolveTacticalArtilleryCalls'));
    s.run(`
        var status = tacticalArtilleryStatus(currentSquad);
        var requested = requestTacticalArtilleryStrike('3,4');
        var queued = tacticalArtilleryPendingCalls().length;
    `);
    assert.equal(s.evalCtx('status.ok'), true, 'вызов доступен: радист жив, рация работает, батарея в радиусе');
    assert.equal(s.evalCtx('status.battery.unit.name'), 'Батарея 82-мм миномётов', 'выбрана ближайшая батарея');
    assert.equal(s.evalCtx('requested'), true, 'заявка принята');
    assert.equal(s.evalCtx('AP_SPENT'), 2, 'списано 1 ОД');
    assert.equal(s.evalCtx('queued'), 1, 'заявка стоит в очереди боя');
    // в этом же ходу залп не приходит
    s.run(`var tooEarly = resolveTacticalArtilleryCalls();`);
    assert.equal(s.evalCtx('tooEarly'), 0, 'в ход вызова залп не приходит');
    // следующий ход — залп (детерминированная случайность по кругу)
    s.run(`Math.random = (function () { var i = 0; var seq = [0.05, 0.95, 0.35, 0.75, 0.15, 0.85, 0.45, 0.65, 0.25, 0.55];
        return function () { var v = seq[i % seq.length]; i++; return v; }; })();`);
    s.run(`currentTurn = 2; var resolved = resolveTacticalArtilleryCalls();`);
    assert.equal(s.evalCtx('resolved'), 1, 'в начале следующего хода залп разобран');
    assert.ok(s.evalCtx('appData.map.enemySquads[0].fighters.reduce((a, f) => a + f.hp, 0)') < 6,
        'враг в гексе получил урон');
    assert.equal(s.evalCtx('appData.campaign.activeBattles[0].pendingArtillery.length'), 0,
        'очередь заявок очищена');
    // без радиста вызов недоступен
    s.run(`
        appData.squads[0].fighters[1].hp = 0;
        var noRadio = tacticalArtilleryStatus(currentSquad);
    `);
    assert.equal(s.evalCtx('noRadio.ok'), false, 'после гибели радиста вызов недоступен');
    assert.ok(/радист/i.test(s.evalCtx('noRadio.reason')), 'причина называет радиста');
});

// ─── 4. Телефон: кабель до 7 гексов ───
test('4: телефонный кабель — максимум 7 гексов пути от штаба', () => {
    assert.ok(/const PHONE_LINE_MAX_STEPS = 7;/.test(HTML), 'предел кабеля — 7 гексов');
    const validate = sliceFunction(HTML, 'validatePhoneSignalRoute');
    assert.ok(/points\.length > PHONE_LINE_MAX_STEPS \+ 1/.test(validate), 'ручная прокладка проверяет предел');
    const build = sliceFunction(HTML, 'buildPhoneSignalRouteTo');
    assert.ok(/route\.length > PHONE_LINE_MAX_STEPS \+ 1/.test(build), 'автопрокладка проверяет предел');
    assert.ok(/катушка не хватает/.test(build), 'понятная причина отказа');
    const check = sliceFunction(HTML, 'phoneCableCheckForDestination');
    assert.ok(/buildPhoneSignalRouteTo\(hq, \{ name: unit\.name/.test(check),
        'приказ проверяется по маршруту до новой точки');
    const submit = sliceFunction(HTML, 'submitOrder');
    assert.ok(/phoneCableCheckForDestination\(unit, Number\(dest\.col\), Number\(dest\.row\)\)/.test(submit),
        'приказ на движение дальше 7 гексов кабеля не выдаётся');
    assert.ok(/телефонный кабель не дотягивается/.test(submit), 'причина показана игроку');
});

test('4б: смещение юнита с телефоном продлевает линию, штаб перекладывает линии заново', () => {
    const intact = sliceFunction(HTML, 'checkPhoneLinesIntact');
    assert.ok(/buildPhoneSignalRouteTo\(hq, recipient\)/.test(intact),
        'при смещении конца линии кабель перекладывается');
    assert.ok(/связисты продлили кабель/.test(intact), 'в журнал пишется перекладка');
    assert.ok(/отошёл дальше \$\{PHONE_LINE_MAX_STEPS\} гексов кабеля/.test(intact),
        'линия рвётся только за пределами 7 гексов');
    assert.ok(/relayPending/.test(intact), 'оборванная линия дождётся перекладки по прибытии');
    const move = sliceFunction(HTML, 'executeMoveOrder');
    assert.ok(/Связисты перекладывают/.test(move), 'штаб в движении — связисты перекладывают линии');
    assert.ok(/line\.laying = true;/.test(move), 'линии штаба помечаются перекладываемыми, а не «умершими»');
    const reconnect = sliceFunction(HTML, 'reconnectPhoneLinesAfterUnitMove');
    assert.ok(/movedId === hqId\) return true;/.test(reconnect), 'после смещения штаба перекладываются все линии');
    assert.ok(/штаб сместился — связисты проложили линию поновой/.test(reconnect), 'в журнале — причина перекладки');
});

test('sandbox: кабель тянется до 7 гексов, дальше — приказ не выдают', () => {
    const app = freshAppData();
    app.campaign.opUnits = [
        { name: 'Штаб батальона', type: 'battalion_hq', col: 0, row: 0 },
        { name: '1-й стрелковый взвод', type: 'infantry', col: 3, row: 0 }
    ];
    const s = createSandbox(app);
    s.run('var PHONE_LINE_MAX_STEPS = 7; hardMode.enabled = true;');
    s.run(sliceFunction(HTML, 'signalInfantryMover'));
    s.run(sliceFunction(HTML, 'normalizePhoneRoutePoints'));
    s.run(sliceFunction(HTML, 'enemiesBlockingSignalAt'));
    s.run(sliceFunction(HTML, 'validatePhoneSignalRoute'));
    s.run(sliceFunction(HTML, 'buildPhoneSignalRouteTo'));
    s.run(sliceFunction(HTML, 'phoneCableCheckForDestination'));
    s.run(`
        getOpHexDistance = (c1, r1, c2, r2) => (Math.abs(c1 - c2) + Math.abs(r1 - r2) + Math.abs((c1 + r1) - (c2 + r2))) / 2;
        getOpHexNeighbors = (c, r) => ([{ col: c + 1, row: r }, { col: c - 1, row: r },
                                        { col: c, row: r + 1 }, { col: c, row: r - 1 }]);
        getOpMoveCost = () => 1;
        isHexInPlayableArea = () => true;
        hasActivePhoneAt = () => true;
        getSignalHQ = () => appData.campaign.opUnits[0];
        hardMode.phoneLines = [{ id: 'l1', fromUnitId: 0, toUnitId: 1, intact: true, laying: false,
            fromHex: '0,0', toHex: '3,0', path: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }] }];
        // связисты прокладывают кабель прямо по столбцам
        function mkSteps(n) { const out = []; for (let i = 1; i <= n; i++) out.push({ col: i, row: 0 }); return out; }
        var STEPS = 6;
        findSignalPath = () => mkSteps(STEPS);
        var near = phoneCableCheckForDestination(appData.campaign.opUnits[1], 6, 0);
        STEPS = 9;
        var far = phoneCableCheckForDestination(appData.campaign.opUnits[1], 9, 0);
    `);
    assert.equal(s.evalCtx('near.ok'), true, 'смещение на 6 гексов кабеля разрешено');
    assert.equal(s.evalCtx('far.ok'), false, 'смещение на 9 гексов кабеля запрещено');
    assert.ok(/катушка не хватает|не более 7/.test(s.evalCtx('far.reason')), 'причина — длина кабеля');
    // у юнита без телефонной линии правило не мешает
    s.run(`hardMode.phoneLines = []; var noPhone = phoneCableCheckForDestination(appData.campaign.opUnits[1], 9, 0);`);
    assert.equal(s.evalCtx('noPhone.ok'), true, 'юнит без телефона ходит без ограничения кабеля');
});

console.log(`\nИтог v13.109 (ампуломёт, артподдержка, телефон): PASS ${passed} · FAIL 0`);
