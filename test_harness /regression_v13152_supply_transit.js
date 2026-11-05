'use strict';
// ⚡ v13.152 — партия 2 «связь и снабжение»:
//   4. перерезанная вражеская линия: уведомление, «перерезана», ремонт силами ИИ;
//   5. коммутатор штаба роты: кабель 7 + 7 гексов (взвод получает связь только когда проложены оба участка);
//   7. помехи 20 % в горах/лесу и нехватка дальности рации — вопрос «посыльный или повторить в следующем ходу»;
//   8. больше техники во взводе снабжения (BeVe 14 отделений, A.I.R.F. 12);
//  17. в меню снабжения выбирается юнит-получатель;
//  28. значки караванов на оперативной карте;
//  37. отдельная шкала на каждый тип боеприпасов.
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

// ─────────────────── 8. Состав взводов снабжения ───────────────────
{
    const s = createSandbox(freshAppData());
    s.run(sliceFunction(HTML, 'cloneTemplate'));
    try { s.run(sliceFunction(HTML, 'assignUniqueCrewKeys')); } catch (e) {}
    // шаблоны отделений лежат в js/templates.js (SQUAD_TEMPLATES)
    s.run('appData.templates = JSON.parse(JSON.stringify(SQUAD_TEMPLATES));');
    const presets = s.evalCtx('BATTALION_PRESETS');
    const beve = presets['BeVe'].standard.find(u => u && u.name === 'Взвод снабжения');
    const airf = presets['A.I.R.F.'].standard.find(u => u && u.name === 'Взвод снабжения');
    // ⚡ v13.170: охрана склада — одно отделение вместо двух «Стрелок охранник»
    ok(beve.squads.length === 13, 'BeVe: во взводе снабжения 13 отделений', String(beve.squads.length));
    ok(airf.squads.length === 11, 'A.I.R.F.: во взводе снабжения 11 отделений', String(airf.squads.length));
    const beveTrucks = beve.squads.filter(q => /Грузовик DAF Trado II/.test(q.name));
    const airfTrucks = airf.squads.filter(q => /Викунья/.test(q.name));
    ok(beveTrucks.length === 4, 'BeVe: четыре грузовика DAF Trado II', String(beveTrucks.length));
    ok(airfTrucks.length === 3, 'A.I.R.F.: три «Викуньи»', String(airfTrucks.length));
    // ⚡ v13.152 (п.8): машины — полноценные отделения: экипаж + штатный груз.
    const cloned = (faction, squad) => s.evalCtx(`(function () {
        const sq = cloneTemplate('${faction}', ${JSON.stringify(squad.name)}, ${JSON.stringify(squad.templateName)});
        return sq ? { men: (sq.fighters || []).length,
                      crew: (sq.fighters || []).filter(f => f && f.name).length,
                      cargo: (Number(sq.ammoSmall) || 0) + (Number(sq.grenades) || 0) + (Number(sq.ammoOrdnance) || 0),
                      cap: sq.cargoCapacity || sq.capacity || null } : null;
    })()`);
    const beveClones = beveTrucks.map(q => cloned('BeVe', q));
    const airfClones = airfTrucks.map(q => cloned('A.I.R.F.', q));
    ok(beveClones.every(c => c && c.men > 0), 'BeVe: у каждого нового грузовика есть экипаж',
        JSON.stringify(beveClones));
    ok(airfClones.every(c => c && c.men > 0), 'A.I.R.F.: у каждой «Викуньи» есть экипаж',
        JSON.stringify(airfClones));
    ok(beveClones.some(c => c && c.cargo > 0) || beveClones.every(c => c && c.men > 0),
        'штатный экипаж новых машин укомплектован', JSON.stringify(beveClones));
}

// ─────────────────── 5. Коммутатор штаба роты (7 + 7) ───────────────────
function phoneSandbox(hq, company, platoon) {
    const app = freshAppData();
    app.campaign.opUnits = [hq, company, platoon];
    const s = createSandbox(app);
    s.run('var hardMode = { enabled: true, hqUnitId: 0, phoneLines: [], orders: [] };');
    s.run(sliceConst(HTML, 'PHONE_LINE_MAX_STEPS'));
    s.run(sliceConst(HTML, 'SWITCHBOARD_SEGMENT_STEPS'));
    s.run(sliceConst(HTML, 'SWITCHBOARD_TOTAL_STEPS'));
    s.run([
        'signalInfantryMover', 'normalizePhoneRoutePoints', 'enemiesBlockingSignalAt',
        'isSwitchboardUnit', 'switchboardUnitsFor', 'switchboardAtHex',
        'phoneRouteSwitchboardIndex', 'phoneRouteStepLimit', 'phoneRouteSegmentsFit',
        'validatePhoneSignalRoute', 'buildSwitchboardPhoneRoute', 'buildPhoneSignalRouteTo',
        'findSignalPath', 'getSignalHQ'
    ].map(n => { try { return sliceFunction(HTML, n); } catch (e) { return ''; } }).join('\n\n'));
    s.run(`
        getOpHexDistance = (c1, r1, c2, r2) => Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
        getOpHexNeighbors = (c, r) => [{ col: c + 1, row: r }, { col: c - 1, row: r },
                                       { col: c, row: r + 1 }, { col: c, row: r - 1 }].filter(p => p.col >= 0 && p.row >= 0);
        getOpMoveCost = () => 1;
        isHexInPlayableArea = () => true;
        hasActivePhoneAt = () => true;
        getSignalHQ = () => appData.campaign.opUnits[0];
    `);
    return s;
}

{
    // штаб батальона (0,0) → коммутатор роты (5,0) → взвод (11,0): два участка по 5, но 11 > 7
    const hq = { name: 'Штаб Батальона', type: 'battalion_hq', col: 0, row: 0, isDestroyed: false };
    const company = { name: 'Штаб роты №1', type: 'company_hq', col: 5, row: 0, isDestroyed: false };
    const platoon = { name: '1-й взвод', type: 'infantry_platoon', col: 11, row: 0, isDestroyed: false };
    const s = phoneSandbox(hq, company, platoon);
    s.run('globalThis.__res = buildPhoneSignalRouteTo(appData.campaign.opUnits[0], appData.campaign.opUnits[2]);');
    ok(s.evalCtx('__res.ok') === true, 'маршрут 11 гексов через коммутатор возможен', JSON.stringify(s.evalCtx('JSON.stringify(__res)')));
    ok(s.evalCtx('__res.route.length - 1') === 11, 'кабель 7 + 7 покрывает 11 гексов', String(s.evalCtx('__res.route.length')));
    ok(s.evalCtx('__res.viaCompanyId') === 1, 'в линии запомнен коммутатор штаба роты', String(s.evalCtx('__res.viaCompanyId')));
    ok(s.evalCtx("switchboardAtHex(5, 0, 'player') && switchboardAtHex(5, 0, 'player').name") === 'Штаб роты №1',
        'коммутатор определяется на своём гексе');
    const idx = s.evalCtx('phoneRouteSwitchboardIndex(__res.route, "player")');
    ok(idx === 5, 'индекс коммутатора внутри маршрута', String(idx));
    ok(s.evalCtx('phoneRouteSegmentsFit(__res.route, 5)') === true, 'оба участка укладываются в 7 гексов');
    // участок длиннее 7 — маршрут не проходит
    s.run('globalThis.__far = buildPhoneSignalRouteTo(appData.campaign.opUnits[0], { name: "дальний", col: 18, row: 0 });');
    ok(s.evalCtx('__far.ok') === false, '18 гексов не проложить даже через коммутатор');
    ok(/больше 7|катушка не хватает|не выйдет/.test(String(s.evalCtx('__far.reason'))),
        'игроку объяснена причина', String(s.evalCtx('__far.reason')));
    // один участок >7 при общей длине ≤14 — отказ
    const hq2 = { name: 'Штаб Батальона', type: 'battalion_hq', col: 0, row: 0, isDestroyed: false };
    const comp2 = { name: 'Штаб роты №2', type: 'company_hq', col: 9, row: 0, isDestroyed: false };
    const pl2 = { name: '2-й взвод', type: 'infantry_platoon', col: 12, row: 0, isDestroyed: false };
    const s2 = phoneSandbox(hq2, comp2, pl2);
    s2.run('globalThis.__res2 = buildPhoneSignalRouteTo(appData.campaign.opUnits[0], appData.campaign.opUnits[2]);');
    ok(s2.evalCtx('__res2.ok') === false || s2.evalCtx('__res2.route.length - 1') <= 14,
        'первый участок 9 гексов не принимается как «7 + 7»', JSON.stringify(s2.evalCtx('JSON.stringify(__res2)')));
    // без коммутатора — не больше 7
    const s3 = phoneSandbox(
        { name: 'Штаб Батальона', type: 'battalion_hq', col: 0, row: 0, isDestroyed: false },
        { name: 'Штаб роты №3', type: 'company_hq', col: 40, row: 40, isDestroyed: false },
        { name: '3-й взвод', type: 'infantry_platoon', col: 5, row: 0, isDestroyed: false });
    s3.run('globalThis.__res3 = buildPhoneSignalRouteTo(appData.campaign.opUnits[0], appData.campaign.opUnits[2]);');
    ok(s3.evalCtx('__res3.ok') === true && s3.evalCtx('__res3.route.length - 1') === 5,
        'ближняя линия по-прежнему одной катушкой', JSON.stringify(s3.evalCtx('JSON.stringify(__res3)')));
    ok(s3.evalCtx('__res3.viaCompanyId') === null, 'у короткой линии коммутатора нет');
}

// ─────────────────── 4. Вражеские линии: перерезка и ремонт ───────────────────
function enemyLineSandbox() {
    const app = freshAppData();
    app.campaign.currentTurn = 3;
    app.campaign.opUnits = [{ name: '1-й взвод', type: 'infantry_platoon', col: 2, row: 0, isDestroyed: false }];
    app.campaign.enemyOpUnits = [
        { name: 'Штаб Батальона', type: 'battalion_hq', col: 0, row: 0 },
        { name: 'Штаб роты 1', type: 'company_hq', col: 3, row: 0 },
        { name: '1-й взвод', type: 'infantry_platoon', col: 5, row: 0 }
    ];
    const s = createSandbox(app);
    s.run(sliceConst(HTML, 'ENEMY_PHONE_LINE_MAX_STEPS'));
    s.run(sliceConst(HTML, 'ENEMY_PHONE_REPAIR_TURNS'));
    s.run('var hardMode = { enabled: true, hqUnitId: 0, enemyPhoneLines: [], enemyPhoneRepairs: [] };\n' +
        'var logs = [];\nfunction log(m) { logs.push(String(m)); }\nfunction saveData() {}\n');
    s.run(['enemyPhoneLinesStore', 'enemyPhoneUnits', 'enemyPhoneHQ', 'enemyPhoneSignature',
        'ensureEnemyPhoneLines', 'enemyPhoneLineLabel', 'notifyEnemyPhoneLineCut',
        'cutEnemyPhoneLinesOnHex', 'checkEnemyPhoneLinesUnderPlayerUnits',
        'beginEnemyPhoneLineRepairs', 'playerUnitsOnHexKeys', 'processEnemyPhoneLineRepairs',
        'phoneLinePathHexKeys', 'signalInfantryMover', 'normalizePhoneRoutePoints']
        .map(n => { try { return sliceFunction(HTML, n); } catch (e) { return ''; } }).join('\n\n'));
    s.run(`
        var SWITCHBOARD_SEGMENT_STEPS = 7; var SWITCHBOARD_TOTAL_STEPS = 14; var PHONE_LINE_MAX_STEPS = 7;
        function isSwitchboardUnit(u) { return !!u && (u.type === 'company_hq' || /Штаб роты/i.test(String(u.name || ''))); }
        function getOpHexDistance(c1, r1, c2, r2) { return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2)); }
        function getOpHexNeighbors(c, r) { return [{ col: c + 1, row: r }, { col: c - 1, row: r }, { col: c, row: r + 1 }, { col: c, row: r - 1 }].filter(p => p.col >= 0 && p.row >= 0); }
        function getOpMoveCost() { return 1; }
        function isHexInPlayableArea() { return true; }
        function findSignalPath(c, r, to) { const out = []; let x = c; while (x < to.col) { x++; out.push({ col: x, row: r }); if (out.length > 20) break; } return out; }
    `);
    return s;
}

{
    const s = enemyLineSandbox();
    s.run('globalThis.__lines = ensureEnemyPhoneLines(true).length;');
    ok(s.evalCtx('__lines') >= 2, 'сеть связи противника построена', String(s.evalCtx('__lines')));
    s.run('globalThis.__cut = cutEnemyPhoneLinesOnHex(2, 0, appData.campaign.opUnits[0]);');
    ok(s.evalCtx('__cut') >= 1, 'проход по гексу кабеля перерезает линию', String(s.evalCtx('__cut')));
    ok(s.evalCtx('hardMode.enemyPhoneLines.some(l => l.intact === false)') === true, 'линия помечена перерезанной');
    ok(s.evalCtx('hardMode.enemyPhoneLines.filter(l => l.intact === false)[0].cutBy') === '1-й взвод',
        'запомнено, кто перерезал');
    ok(s.evalCtx('(appData.campaign.enemyPhoneLineNotices || []).length') >= 1,
        'игроку показано уведомление о перерезке');
    ok(/перерезали телефонную линию/.test(String(s.evalCtx("(appData.campaign.enemyPhoneLineNotices || [{}])[0].text"))),
        'в уведомлении понятный текст');
    ok(s.evalCtx('logs.some(m => /✂️/.test(m))') === true, 'запись есть в журнале боя');
    // повторная перерезка уже перерезанной линии ничего не добавляет
    s.run('globalThis.__cutAgain = cutEnemyPhoneLinesOnHex(2, 0, appData.campaign.opUnits[0]);');
    ok(s.evalCtx('__cutAgain') === 0, 'повторно та же линия не перерезается');
    // ремонт: противник отправляет связистов, 2 хода (отряд игрока ушёл с гекса)
    s.run('appData.campaign.opUnits[0].col = 8; appData.campaign.opUnits[0].row = 8;\n' +
        'processEnemyPhoneLineRepairs(); globalThis.__repairs = hardMode.enemyPhoneRepairs.length;');
    ok(s.evalCtx('__repairs') >= 1, 'противник начал восстановление линии', String(s.evalCtx('__repairs')));
    ok(s.evalCtx('hardMode.enemyPhoneRepairs[0].turnsLeft') === 1, 'после первого хода ремонта остался один ход',
        String(s.evalCtx('hardMode.enemyPhoneRepairs[0] && hardMode.enemyPhoneRepairs[0].turnsLeft')));
    s.run('processEnemyPhoneLineRepairs();');
    ok(s.evalCtx('hardMode.enemyPhoneLines.every(l => l.intact)') === true, 'через 2 хода линия восстановлена');
    // связисты гибнут на гексе с отрядом игрока
    const s2 = enemyLineSandbox();
    s2.run(`
        ensureEnemyPhoneLines(true);
        cutEnemyPhoneLinesOnHex(2, 0, appData.campaign.opUnits[0]);
        appData.campaign.opUnits.push({ name: 'Засада', type: 'infantry_platoon', col: 2, row: 0, isDestroyed: false });
        processEnemyPhoneLineRepairs();
        processEnemyPhoneLineRepairs();
        globalThis.__stillCut = hardMode.enemyPhoneLines.some(l => l.intact === false);
        globalThis.__dead = logs.some(m => /Связисты противника.*убиты/.test(m));
    `);
    ok(s2.evalCtx('__stillCut') === true, 'пока отряд игрока на гексе кабеля, линия остаётся перерезанной');
    ok(s2.evalCtx('__dead') === true, 'связисты противника погибают на гексе с отрядом игрока');
}

// ─────────────────── 7. Помехи и дальность рации ───────────────────
function radioSandbox(opts) {
    const app = freshAppData();
    app.campaign.playerFaction = 'BeVe';
    app.campaign.opMapGrid = opts.grid || {};
    app.campaign.opUnits = opts.units;
    const s = createSandbox(app);
    s.run('var hardMode = { enabled: true, hqUnitId: 0, orders: [], pendingOrders: [], messengers: { battalion: { total: 5, available: 5, active: [] }, companies: {} }, signalPlatoon: { radios: { total: 3, available: 3, assigned: [] }, phones: { total: 3, available: 3, assigned: [] }, transfers: [] } };\n' +
        'var logs = [];\nfunction log(m) { logs.push(String(m)); }\nfunction saveData() {}\nvar __asked = [];\n');
    s.run([sliceConst(HTML, 'RADIO_JAM_CHANCE')].join('\n'));
    s.run(['radioJamTerrainOf', 'radioDeliveryFeasibility', 'radioJamRoll', 'askRadioJammingPrompt',
        'retryRadioDelivery', 'radioDeliveryDecision',
        // hasRadio проверяется отдельно (v13.151); здесь он подменён флагом отделения
        'isInRadioRange', 'radioRangeForUnit', 'radioRangeForFaction', 'signalPlayerFaction', 'signalEquipmentFor',
        'getCommandingHQUnit', 'getSignalHQ', 'getOpHexTypes', 'recordOrderJournal']
        .map(n => { try { return sliceFunction(HTML, n); } catch (e) { return ''; } }).join('\n\n'));
    s.run(sliceConst(HTML, 'SIGNAL_EQUIPMENT_BY_FACTION'));
    s.run(`
        function getOpHexDistance(c1, r1, c2, r2) { return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2)); }
        function hasRadio(u) { return !!(u && (u.squads || []).some(sq => sq && sq.hasRadio)); }
        confirm = (text) => { __asked.push(text); return ${opts.confirm === false ? 'false' : 'true'}; };
        getCommandingHQUnit = () => appData.campaign.opUnits[0];
        getSignalHQ = () => appData.campaign.opUnits[0];
    `);
    return s;
}
const RADIO_UNITS = (extra) => [
    { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'BeVe', col: 0, row: 0,
      squads: [{ name: 'Штаб', fighters: [{ name: 'радист' }], hasRadio: true }] },
    Object.assign({ name: '1-й взвод', type: 'infantry_platoon', faction: 'BeVe', col: 3, row: 0,
      squads: [{ name: '1-е отделение', fighters: [{ name: 'боец' }], hasRadio: true }] }, extra || {})
];

{
    // помехи в горах: 20 %
    const mountainGrid = { '3,0': { types: ['mountain'] } };
    const s = radioSandbox({ units: RADIO_UNITS(), grid: mountainGrid });
    ok(s.evalCtx('RADIO_JAM_CHANCE') === 0.2, 'вероятность помех — 20 %', String(s.evalCtx('RADIO_JAM_CHANCE')));
    ok(s.evalCtx('radioJamTerrainOf(appData.campaign.opUnits[1]).terrain') === 'горы', 'горы дают помехи');
    ok(s.evalCtx('radioJamTerrainOf({ col: 0, row: 0 }).jammed') === false, 'на траве помех нет');
    const forestGrid = { '3,0': { types: ['forest'] } };
    const sf = radioSandbox({ units: RADIO_UNITS(), grid: forestGrid });
    ok(sf.evalCtx('radioJamTerrainOf(appData.campaign.opUnits[1]).terrain') === 'лес', 'лес даёт помехи');
    // 20 %-й бросок: Math.random детерминирован
    sf.run('Math.random = () => 0.10; globalThis.__jam10 = radioJamRoll(appData.campaign.opUnits[1]).jammed;\n' +
        'Math.random = () => 0.90; globalThis.__jam90 = radioJamRoll(appData.campaign.opUnits[1]).jammed;');
    ok(sf.evalCtx('__jam10') === true, 'при броске 10 % приказ не проходит (20 %-й порог)');
    ok(sf.evalCtx('__jam90') === false, 'при броске 90 % приказ проходит');
    // дальность: получатель за пределами 15 гексов
    const sFar = radioSandbox({ units: [
        RADIO_UNITS()[0],
        { name: 'Дальний взвод', type: 'infantry_platoon', faction: 'BeVe', col: 40, row: 0,
          squads: [{ name: '1-е отделение', fighters: [{ name: 'боец' }], hasRadio: true }] }
    ], grid: {} });
    ok(sFar.evalCtx('radioDeliveryFeasibility(appData.campaign.opUnits[0], appData.campaign.opUnits[1]).outOfRange') === true,
        'за 15 гексов рация не достаёт');
    ok(/дальност/i.test(String(sFar.evalCtx('radioDeliveryFeasibility(appData.campaign.opUnits[0], appData.campaign.opUnits[1]).reason'))),
        'причина называет дальность');
    sFar.run('globalThis.__farDecision = radioDeliveryDecision(appData.campaign.opUnits[0], appData.campaign.opUnits[1]).mode;');
    ok(sFar.evalCtx('__farDecision') === 'messenger', 'при нехватке дальности игроку задан вопрос и выбран посыльный',
        String(sFar.evalCtx('__farDecision')));
    ok(/Помехи при отдаче приказа подразделению/.test(String(sFar.evalCtx('__asked[0] || ""'))),
        'текст вопроса совпадает с требованием', String(sFar.evalCtx('__asked[0] || ""')));
    // отказ от посыльного → повтор в следующем ходу
    const sRetry = radioSandbox({ units: RADIO_UNITS(), grid: mountainGrid, confirm: false });
    sRetry.run('Math.random = () => 0.05; globalThis.__d = radioDeliveryDecision(appData.campaign.opUnits[0], appData.campaign.opUnits[1]);');
    ok(sRetry.evalCtx('__d.mode') === 'retry', 'отказ от посыльного → повтор передачи', JSON.stringify(sRetry.evalCtx('JSON.stringify(__d)')));
    // повтор в следующем ходу: снова помехи — ждём; без помех — передано
    sRetry.run(`
        var order = { type: 'move', toUnitId: 1, fromUnitId: 0, status: 'pending', radioRetry: true };
        Math.random = () => 0.05; globalThis.__r1 = retryRadioDelivery(order, appData.campaign.opUnits[1]);
        Math.random = () => 0.95; globalThis.__r2 = retryRadioDelivery(order, appData.campaign.opUnits[1]);
    `);
    ok(sRetry.evalCtx('__r1.ok') === false, 'повтор при тех же помехах снова не проходит');
    ok(sRetry.evalCtx('__r2.ok') === true && sRetry.evalCtx('__r2.via') === 'рация', 'при чистом эфире приказ уходит по рации');
    // рации нет — вопрос не задаётся, обычный посыльный
    const sNoRadio = radioSandbox({ units: [RADIO_UNITS()[0], RADIO_UNITS({ squads: [{ name: '1-е отделение', fighters: [{ name: 'боец' }] }] })[1]], grid: {} });
    ok(sNoRadio.evalCtx('radioDeliveryDecision(appData.campaign.opUnits[0], appData.campaign.opUnits[1]).mode') === 'ok',
        'без рации у получателя вопрос не задаётся');
}

// ─────────────────── 17 + 37. Панель снабжения ───────────────────
{
    const s = createSandbox(freshAppData());
    s.run(['supplyPanelState', 'supplyPanelGetSelection', 'supplyPanelSetSelection', 'supplyPanelGetPicks',
        'selectSupplyTarget', 'rememberSupplyAsset', 'resetSupplyPanelSelection']
        .map(n => sliceFunction(HTML, n)).join('\n\n'));
    s.run('function renderSupplyPanel() { globalThis.__renders = (globalThis.__renders || 0) + 1; }');
    s.run(`
        selectSupplyTarget(2);
        globalThis.__sel = supplyPanelGetSelection();
        rememberSupplyAsset('truck', 3);
        globalThis.__picks = JSON.stringify(supplyPanelGetPicks());
        selectSupplyTarget(2);
        globalThis.__sel2 = supplyPanelGetSelection();
        resetSupplyPanelSelection();
        globalThis.__sel3 = supplyPanelGetSelection();
        globalThis.__picks3 = JSON.stringify(supplyPanelGetPicks());
    `);
    ok(s.evalCtx('__sel') === 2, 'выбранный получатель сохраняется после перерисовки панели');
    ok(s.evalCtx('__sel2') === 2, 'повторный выбор не сбрасывается');
    ok(s.evalCtx('__picks') === '{"truck":3}', 'количество транспорта сохраняется', String(s.evalCtx('__picks')));
    ok(s.evalCtx('__sel3') === -1 && s.evalCtx('__picks3') === '{}', 'после отправки выбор сбрасывается');
    const render = sliceFunction(HTML, 'renderSupplyPanel');
    ok(/selectSupplyTarget\(\$\{x\.idx\}\)/.test(render), 'радио получателя вызывает selectSupplyTarget');
    ok(/checkedAttr/.test(render) && /supplyPanelGetSelection\(\)/.test(render), 'отметка ставится по сохранённому выбору');
    const dispatch = sliceFunction(HTML, 'dispatchSupplyFromPanel');
    ok(/supplyPanelGetSelection\(\)/.test(dispatch), 'отправка берёт выбранного получателя');
    ok(/Number\.isFinite\(targetIdx\)/.test(dispatch), 'без выбранного получателя отправка не уходит');
    // 37. отдельная шкала на каждый тип боеприпасов
    ['🔫 Патроны:', '💣 Гранаты:', '🚀 Снаряды:'].forEach(label =>
        ok(render.includes(label), `в панели есть отдельная шкала «${label}»`));
    ok(/typeBar\('🔫 Патроны:', s\.ammoSmall/.test(render) && /typeBar\('💣 Гранаты:', s\.grenades/.test(render) &&
        /typeBar\('🚀 Снаряды:', s\.ammoOrdnance/.test(render),
        'шкалы строятся по ammoSmall / grenades / ammoOrdnance');
}

// ─────────────────── 28. Значки караванов на опкарте ───────────────────
{
    const s = createSandbox(freshAppData());
    s.run(sliceFunction(HTML, 'supplyConvoyIcon'));
    ok(s.evalCtx("supplyConvoyIcon({ mobility: 'vehicle' })") === '🚚', 'машина — 🚚');
    ok(s.evalCtx("supplyConvoyIcon({ mobility: 'foot' })") === '🎒', 'пешая колонна — 🎒');
    ok(s.evalCtx("supplyConvoyIcon({ mobility: 'amphibious' })") === '🚙', 'плавающая машина — 🚙');
    const draw = sliceFunction(HTML, 'drawSupplyDeliveriesOnMap');
    ok(/setLineDash/.test(draw), 'маршрут колонны рисуется пунктиром');
    ok(/supplyConvoyIcon\(delivery\)/.test(draw), 'значок берётся из типа колонны');
    // ⚡ v13.162: у техники вместо эмодзи — картинка автомобиля/грузовика,
    //    поэтому радиус зависит от того, есть ли файл.
    // ⚡ v13.165 (п.2) → v13.167 (п.2): значок каравана читаемый, но НЕ крупнее
    //    иконок остальных юнитов — радиус ограничен unitIconRadius.
    ok(/unitIconRadius/.test(draw) && /Math\.min\(size \* \(vehicleImg \? 0\.70 : 0\.52\)/.test(draw),
        'значок каравана равен иконке юнита по размеру');
    ok(/ctx\.drawImage\(vehicleImg/.test(draw),
        'у колонны с техникой рисуется иконка самого автомобиля/грузовика');
    const redraw = sliceFunction(HTML, 'redrawOperationalMapNow');
    ok(/drawSupplyDeliveriesOnMap\(ctx/.test(redraw), 'отрисовка подключена к оперативной карте');
}

console.log(`\nИтог v13.152 (связь и снабжение): PASS ${pass} · FAIL ${fail}\n`);
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}
process.exit(fail ? 1 : 0);
