'use strict';
// ⚡ v13.151 — партия правок по итогам теста:
//   1. телефоны: А.И.Р.Ф. — 6, БеВе — 7;
//   2. у БеВе рация закреплена за каждым штабом роты + 1 свободная;
//   3. дальность раций: А.И.Р.Ф. — 12, БеВе — 15 гексов;
//  14. новый приказ снимает «огонь по готовности» у получателя;
//  19. телефонный пунктир — синий (оборванная линия — красная с ✂️);
//  25. подавленный отряд не ведёт огонь на подавление;
//  26. одна осветительная ракета на штаб за фазу.
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

// ───────────── 1–3. Штат связи и дальность раций ─────────────
function signalSandbox(faction, units) {
    const appData = freshAppData();
    appData.campaign.playerFaction = faction;
    appData.campaign.opUnits = units;
    const s = createSandbox(appData);
    s.run(`var hardMode = { enabled: true, hqUnitId: 0, messengers: { battalion: { total: 5, available: 5, active: [] }, companies: {} },
        signalPlatoon: { radios: { total: 3, available: 3, assigned: [] }, phones: { total: 3, available: 3, assigned: [] }, transfers: [] },
        phoneLines: [], orders: [], pendingOrders: [], orderQueue: [] };`);
    const fns = ['signalEquipmentFor', 'signalPlayerFaction', 'radioRangeForFaction', 'radioRangeForUnit',
        'signalCompanyHQIds', 'ensureSignalEquipmentProfile', 'ensureSignalPlatoonState',
        'signalAssignmentsFor', 'isInRadioRange'];
    s.run(fns.map(n => sliceFunction(HTML, n)).join('\n\n'));
    s.run(sliceConst(HTML, 'SIGNAL_EQUIPMENT_BY_FACTION'));
    s.run(`function getOpHexDistance(c1, r1, c2, r2) { return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2)); }`);
    return s;
}
const UNITS = () => [
    { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'BeVe', col: 0, row: 0 },
    { name: 'Штаб роты №1', type: 'company_hq', faction: 'BeVe', col: 8, row: 0 },
    { name: 'Штаб роты №2', type: 'company_hq', faction: 'BeVe', col: 9, row: 0 },
    { name: 'Штаб роты №3', type: 'company_hq', faction: 'BeVe', col: 10, row: 0 },
    { name: '1-й взвод', type: 'infantry_platoon', faction: 'BeVe', col: 22, row: 0 }
];

{
    const s = signalSandbox('BeVe', UNITS());
    s.run('ensureSignalPlatoonState();');
    ok(s.evalCtx('hardMode.signalPlatoon.phones.total') === 7, 'БеВе: 7 телефонов', String(s.evalCtx('hardMode.signalPlatoon.phones.total')));
    ok(s.evalCtx('hardMode.signalPlatoon.radios.total') === 4, 'БеВе: 4 рации (3 ротные + 1 свободная)', String(s.evalCtx('hardMode.signalPlatoon.radios.total')));
    ok(s.evalCtx("hardMode.signalPlatoon.radios.assigned.filter(r => r && r.isCompanyRadio).length") === 3,
        'БеВе: рация закреплена за каждым из 3 штабов рот',
        JSON.stringify(s.evalCtx('hardMode.signalPlatoon.radios.assigned')));
    ok(s.evalCtx('hardMode.signalPlatoon.radios.available') === 1,
        'БеВе: свободна ровно 1 рация для выдачи юниту', String(s.evalCtx('hardMode.signalPlatoon.radios.available')));
    ok(s.evalCtx('radioRangeForFaction("BeVe")') === 15, 'БеВе: дальность рации 15 гексов');
    ok(s.evalCtx('isInRadioRange(appData.campaign.opUnits[0], {col: 15, row: 0})') === true,
        'БеВе: связь на 15 гексах есть');
    ok(s.evalCtx('isInRadioRange(appData.campaign.opUnits[0], {col: 16, row: 0})') === false,
        'БеВе: на 16 гексах связи нет');

    // повторный вызов не дублирует закреплённые рации
    s.run('ensureSignalPlatoonState(); ensureSignalPlatoonState();');
    ok(s.evalCtx("hardMode.signalPlatoon.radios.assigned.filter(r => r && r.isCompanyRadio).length") === 3,
        'повторная инициализация не дублирует ротные рации');
}

{
    const airf = UNITS().map(u => Object.assign({}, u, { faction: 'A.I.R.F.' }));
    const s = signalSandbox('A.I.R.F.', airf);
    s.run('ensureSignalPlatoonState();');
    ok(s.evalCtx('hardMode.signalPlatoon.phones.total') === 6, 'А.И.Р.Ф.: 6 телефонов', String(s.evalCtx('hardMode.signalPlatoon.phones.total')));
    ok(s.evalCtx('hardMode.signalPlatoon.radios.total') === 1, 'А.И.Р.Ф.: 1 рация', String(s.evalCtx('hardMode.signalPlatoon.radios.total')));
    ok(s.evalCtx("hardMode.signalPlatoon.radios.assigned.filter(r => r && r.isCompanyRadio).length") === 0,
        'А.И.Р.Ф.: ротных раций нет');
    ok(s.evalCtx('radioRangeForFaction("A.I.R.F.")') === 12, 'А.И.Р.Ф.: дальность рации 12 гексов');
    ok(s.evalCtx('isInRadioRange({col: 0, row: 0, faction: "A.I.R.F."}, {col: 12, row: 0})') === true,
        'А.И.Р.Ф.: связь на 12 гексах есть');
    ok(s.evalCtx('isInRadioRange({col: 0, row: 0, faction: "A.I.R.F."}, {col: 13, row: 0})') === false,
        'А.И.Р.Ф.: на 13 гексах связи нет');
}

// ───────────── 14. Новый приказ снимает «огонь по готовности» ─────────────
{
    const s = createSandbox(freshAppData());
    s.run(`var hardMode = { orders: [], pendingOrders: [], orderQueue: [],
        messengers: { battalion: { total: 5, available: 5, active: [] }, companies: {} } };`);
    s.run(sliceConst(HTML, 'ORDER_ALIVE_STATUSES'));
    s.run(sliceFunction(HTML, 'cancelFireAtWillForUnit'));
    s.run(`hardMode.orders = [
        { id: 1, toUnitId: 4, type: 'fire_at_will', status: 'active' },
        { id: 2, toUnitId: 5, type: 'fire_at_will', status: 'active' },
        { id: 3, toUnitId: 4, type: 'fire_at_will', status: 'cancelled' }
    ];`);
    ok(s.evalCtx('cancelFireAtWillForUnit(4, "move")') === 1, 'новый приказ отменяет активный «огонь по готовности» (1 заказ)');
    ok(s.evalCtx('hardMode.orders[0].status') === 'cancelled', 'статус приказа — cancelled');
    ok(s.evalCtx('hardMode.orders[0].cancelledReason') === 'new_order', 'причина отмены сохранена');
    ok(s.evalCtx('hardMode.orders[1].status') === 'active', 'чужой приказ не тронут');
    ok(s.evalCtx('cancelFireAtWillForUnit(5, "fire_at_will")') === 0, 'новый «огонь по готовности» старый не отменяет');
    ok(s.evalCtx('hardMode.orders[1].status') === 'active', 'второй приказ остался активным');
    // вызов из createOrder
    ok(/cancelFireAtWillForUnit\(toUnitId, orderType\)/.test(HTML), 'createOrder снимает «огонь по готовности» при любом новом приказе');
}

// ───────────── 19. Синий телефонный пунктир ─────────────
{
    ok(HTML.includes("ctx.strokeStyle = line.laying ? '#ffb300' : (lineCut ? '#ff5a5a' : '#2f8fff');"),
        'телефонный пунктир рисуется синим (#2f8fff)');
    ok(HTML.includes("ctx.fillText(lineCut ? '✂️' : '📞'"), 'оборванная линия помечается ✂️ и остаётся на карте');
    ok(!HTML.includes("ctx.strokeStyle = line.laying ? '#ffb300' : '#ff3333';"), 'красного цвета рабочей линии больше нет');
}

// ───────────── 25. Подавленный отряд не подавляет ─────────────
{
    ok(/suppressed \|\| \(\(typeof tacticalMoraleIsSuppressed === 'function'\) && tacticalMoraleIsSuppressed\(currentSquad\)\)\) \{\s*\n\s*log\('⛔ Отряд подавлен и не может вести огонь на подавление\.'\)/.test(HTML),
        'в suppressiveFire() есть запрет для подавленных');
    ok(HTML.includes('const moraleSuppressedNow = (typeof tacticalMoraleIsSuppressed === \'function\') && tacticalMoraleIsSuppressed(currentSquad);'),
        'кнопка «Подавить» учитывает подавление низким духом');
    ok(HTML.includes('!currentSquad.suppressed && !moraleSuppressedNow'), 'кнопка «Подавить» блокируется для подавленных');
}

// ───────────── 26. Одна ракета на штаб за фазу ─────────────
{
    const s = createSandbox(freshAppData());
    s.run(`var currentTurn = 3;
        function tacticalHQFlareOwnerKey(squad) { return String((squad && squad.opUnitName) || (squad && squad.name) || ''); }
        function tacticalArtilleryRecord() { return globalThis.__battle; }
        globalThis.__battle = { flareUsedPhaseByOwner: {} };`);
    s.run(sliceFunction(HTML, 'tacticalFlarePhaseGuard'));
    ok(s.evalCtx('tacticalFlarePhaseGuard({name: "Штаб батальона"}).ok') === true, 'первая ракета в фазе разрешена');
    s.run('globalThis.__battle.flareUsedPhaseByOwner["Штаб батальона"] = { turn: 3 };');
    ok(s.evalCtx('tacticalFlarePhaseGuard({name: "Штаб батальона"}).ok') === false, 'вторая ракета в той же фазе запрещена');
    ok(s.evalCtx('tacticalFlarePhaseGuard({name: "Штаб роты №1"}).ok') === true, 'другой штаб в этой фазе может пустить свою ракету');
    s.run('currentTurn = 4;');
    ok(s.evalCtx('tacticalFlarePhaseGuard({name: "Штаб батальона"}).ok') === true, 'в новой фазе лимит сброшен');
    ok(/если модуль боя загружен/.test(HTML) && /tacticalFlarePhaseGuard/.test(HTML),
        'fireFlare() проверяет лимит ракет за фазу');
}

// ───────────── 22. Начальный дух — 100/100 ─────────────
{
    const s = createSandbox(freshAppData());
    s.run(`var currentSquad = null;`);
    for (const fn of ['tacticalStartingMoraleIsFull', 'tacticalNormalizeMoraleScale', 'tacticalMoraleCurrent', 'tacticalMoraleScale']) {
        s.run(sliceFunction(HTML, fn));
    }
    // старое значение «5/100» у свежего снайперского звена
    s.run(`globalThis.sniper = { name: 'Снайперское звено OIP', baseMorale: 100, tacticalMoraleMax: 100,
        currentMorale: 5, tacticalMoraleScaleVersion: 1,
        fighters: [{ name: 'Снайпер 1', hp: 3 }, { name: 'Снайпер 2', hp: 3 }] };`);
    ok(s.evalCtx('tacticalMoraleCurrent(sniper)') === 100, 'свежий отряд без потерь стартует со 100/100',
        String(s.evalCtx('tacticalMoraleCurrent(sniper)')));
    // отряд, который уже провёл инициализацию боя, сохраняет свой дух
    s.run(`globalThis.veteran = { name: 'Пехотное отделение', baseMorale: 100, tacticalMoraleMax: 100,
        currentMorale: 40, tacticalMoraleScaleVersion: 1, tacticalMoraleInitializedBattleId: 'b1',
        fighters: [{ hp: 3 }, { hp: 3 }] };`);
    ok(s.evalCtx('tacticalMoraleCurrent(veteran)') === 40, 'дух отряда в бою не сбрасывается к 100',
        String(s.evalCtx('tacticalMoraleCurrent(veteran)')));
    // отряд с потерями не «лечится» до 100
    s.run(`globalThis.wounded = { name: 'Пехотное отделение', baseMorale: 100, tacticalMoraleMax: 100,
        currentMorale: 20, tacticalMoraleScaleVersion: 1,
        fighters: [{ hp: 3 }, { hp: 0 }] };`);
    ok(s.evalCtx('tacticalMoraleCurrent(wounded)') === 20, 'у отряда с потерями дух остаётся прежним',
        String(s.evalCtx('tacticalMoraleCurrent(wounded)')));
    ok(HTML.includes('function tacticalStartingMoraleIsFull'), 'есть проверка «свежий отряд без потерь»');
}

// ───────────── 10. Карточки: +1 духа → +10 (старые сохранения) ─────────────
{
    const s = createSandbox(freshAppData());
    for (const fn of ['legacyCardMoraleText', 'migrateCardMoraleScaleForLibrary']) {
        s.run(sliceFunction(HTML, fn));
    }
    s.run(`globalThis.lib = [
        { name: 'Дополнительный паек', moraleMod: 1, desc: 'Боевой дух всех отрядов +1.', effect: '+1 к боевому духу' },
        { name: 'Анархисты', moraleMod: 2, desc: 'дух +2', effect: 'Боевой дух +2.' },
        { name: 'Дополнительный паек', moraleMod: 10, desc: 'Боевой дух всех отрядов +10.', effect: '+10 к боевому духу' },
        { name: 'Ветераны', moraleMod: 0, desc: 'сторона: +1 к обнаружению противника', effect: '' }
    ];`);
    s.run('globalThis.fixed = migrateCardMoraleScaleForLibrary(lib);');
    ok(s.evalCtx('lib[0].moraleMod') === 10, 'moraleMod 1 → 10 (+10 духа)', String(s.evalCtx('lib[0].moraleMod')));
    ok(s.evalCtx('lib[0].desc') === 'Боевой дух всех отрядов +10.', 'текст «+1» → «+10»', s.evalCtx('lib[0].desc'));
    ok(s.evalCtx('lib[0].effect') === '+10 к боевому духу', 'эффект «+1 к боевому духу» → «+10»', s.evalCtx('lib[0].effect'));
    ok(s.evalCtx('lib[1].moraleMod') === 20, 'moraleMod 2 → 20');
    ok(s.evalCtx('lib[2].moraleMod') === 10 && s.evalCtx('lib[2].desc') === 'Боевой дух всех отрядов +10.',
        'уже исправленная карта не меняется повторно');
    ok(s.evalCtx("lib[3].desc") === 'сторона: +1 к обнаружению противника', 'бонус к обнаружению не затронут');
    ok(s.evalCtx('fixed') >= 5, 'счётчик исправлений ведётся', String(s.evalCtx('fixed')));
    ok(/migrateCardMoraleScaleForLibrary\(faction && faction\.cardLibrary\)/.test(HTML),
        'миграция карточек вызывается при загрузке каталогов');
}

console.log(`\nИтог v13.151 (связь и приказы): PASS ${pass} · FAIL ${fail}`);
if (fail) process.exitCode = 1;
