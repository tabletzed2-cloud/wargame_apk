// v13.108: регрессии по отчёту тестировщика (пункты 1–11).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const DATA = read('js/data.js');
const HEXMAPS = read('js/hexmaps.js');
const MAPACTIONS = read('js/map_actions.js');

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log('✓ ' + name);
}

// ─── 1. «Горная скрытность» удалена ───
test('1: бонус «Горная скрытность» убран из данных и из расчёта обнаружения', () => {
    const block = DATA.slice(DATA.indexOf('const FRACTION_GLOBAL_BONUSES'), DATA.indexOf('const SCENARIO_PLACEMENT_ZONES'));
    assert.ok(!/Горная скрытность/.test(block), 'в FRACTION_GLOBAL_BONUSES больше нет «Горной скрытности»');
    const fn = sliceFunction(HTML, 'getOpDetectionModifier');
    assert.ok(!/indexOf\('hill'\)/.test(fn), 'блок горного бонуса по холмам убран');
    assert.ok(/Горная скрытность удалена/.test(fn), 'в коде оставлена пометка об удалении бонуса');
});

// ─── 2. Артиллерия не повреждает ДОТы ───
test('2: ДОТ не получает урона от огня (applyDamageToOpUnit, залп, приказ по гексу)', () => {
    const apply = sliceFunction(HTML, 'applyDamageToOpUnit');
    assert.ok(/isStaticOpUnit\(unit\)/.test(apply), 'applyDamageToOpUnit отсекает стационарные укрепления');
    const salvo = sliceFunction(HTML, 'executeMortarSalvo');
    assert.ok(/isStaticOpUnit/.test(salvo), 'залп исключает ДОТы из целей');
    assert.ok(/ДОТы неуязвимы для артиллерии/.test(salvo), 'сообщение о неуязвимости ДОТа');
    const shoot = sliceFunction(HTML, 'executeShootOrder');
    assert.ok(/на гексе ДОТ/.test(shoot) && /неуязвимо/.test(shoot), 'приказ по гексу с ДОТом отказывает с причиной');
    const strike = HTML.slice(HTML.indexOf('const applySquadStrike'), HTML.indexOf('const applySquadStrike') + 4000);
    assert.ok(/ДОТ не получает урона от артиллерии/.test(strike), 'арт. обстрел штаба не сносит амбразуры');
});

// ─── 3. Лес глубиной 2 гекса — большее укрытие ───
test('3: лес глубиной 2+ гекса даёт +1 к укрытию цели', () => {
    const cover = sliceFunction(HEXMAPS, 'getTacticalCoverInfoForEnemy');
    assert.ok(/tacticalForestDepth/.test(cover), 'укрытие считает глубину леса');
    assert.ok(/bestDepth >= 2/.test(cover), 'порог — 2 гекса');
    assert.ok(/mod \+= 1/.test(cover), 'добавка +1 к укрытию');
});

// ─── 4. Десант БТР и дух бронетехники ───
test('4: связь «машина ↔ десант» перепривязывается по имени, дух бронетехники = 14', () => {
    const relink = sliceFunction(HTML, 'relinkBattlePassengers');
    assert.ok(/embarkedSquadName/.test(relink) && /embarkedSquadOwner/.test(relink),
        'перепривязка ищет десант по имени и владельцу');
    assert.ok(/host.embarkedSquadIndex = idx/.test(relink), 'индекс десанта пересчитывается');
    assert.ok(/relinkBattlePassengers\(existingBattle.playerSquads\)/.test(HTML),
        'перепривязка вызывается при вступлении подкрепления в идущий бой');
    assert.ok(/relinkBattlePassengers\(appData.squads\)/.test(sliceFunction(HTML, 'switchToBattle')),
        'перепривязка выполняется и при возврате в бой');
    const morale = sliceFunction(HTML, 'tacticalInitializeSquadMorale');
    assert.ok(/ARMOR_TACTICAL_MORALE/.test(morale), 'дух бронетехники берётся из ARMOR_TACTICAL_MORALE');
    assert.ok(/const ARMOR_TACTICAL_MORALE = 14;/.test(HTML), 'дух бронетехники = 14');
    assert.ok(/isArmoredTacticalSquad/.test(sliceFunction(HTML, 'startTacticalBattle')) ||
        /armoredSquad/.test(sliceFunction(HTML, 'startTacticalBattle')),
        'признак бронетехники применяется при сборке отрядов боя');
});

test('4б: подкрепление открывает размещение и не выкидывает на карту кампании', () => {
    const next = sliceFunction(HTML, 'nextTurn');
    assert.ok(/tacticalUnplacedPlayerSquads\(\).length > 0/.test(next),
        'пока есть неразмещённые отряды, игрока не выбрасывает в кампанию');
    assert.ok(/Разместите отряды/.test(HTML), 'подкрепление получает подсказку о размещении');
});

// ─── 5. Лишние кнопки в панели боя ───
test('5: ручное обнаружение убрано, дубли наведения и местности отфильтрованы', () => {
    assert.ok(!/onclick="manualDetect\(\)"/.test(HTML), 'кнопка «Обнаружить вручную» убрана');
    assert.ok(!/showDetectionDialog\('check'\)/.test(HTML), 'кнопка «Проверить обнаружение» убрана');
    assert.ok(/mapExtraButtonBlocked/.test(MAPACTIONS), 'клонированные кнопки под картой фильтруются');
    const blocked = MAPACTIONS.slice(MAPACTIONS.indexOf('const MAP_EXTRA_BLOCKED_LABELS'));
    assert.ok(/навестись/.test(blocked), 'дубль «Навестись» отфильтрован');
    assert.ok(/обнаружить вручную/.test(blocked), 'ручное обнаружение отфильтровано');
    assert.ok(/открытая/.test(blocked), 'кнопки местности отфильтрованы');
    assert.ok(/снайперский выстрел/.test(blocked), 'пехотные действия скрыты для бронетехники');
    assert.ok(/const MAP_EXTRA_DIRECTION_LABELS/.test(blocked), 'дубли кнопок разворота отфильтрованы');
});

// ─── 6. Взвод не уходит из боя из-за потерь одного отделения ───
test('6: отход взвода — только когда выбыли все его отделения', () => {
    const retreat = sliceFunction(HTML, 'tacticalRetreatUnit');
    assert.ok(/tacticalOpUnitAllSquadsOut/.test(retreat), 'проверка «все отделения выбыли»');
    const allOut = sliceFunction(HTML, 'tacticalOpUnitAllSquadsOut');
    assert.ok(/mates.every\(isOut\)/.test(allOut), 'нужны ВСЕ отделения взвода');
    const trigger = sliceFunction(HTML, 'triggerOperationalRetreat');
    assert.ok(/unit.isInBattle/.test(trigger), 'взвод в бою не уходит в отход');
});

// ─── 7. Результат залпа виден ───
test('7: результат залпа сохраняется в уведомления об обстрелах и тост', () => {
    const salvo = sliceFunction(HTML, 'executeMortarSalvo');
    assert.ok(/beginOpShellCapture/.test(salvo) && /endOpShellCapture/.test(salvo),
        'залп пишется в постоянные уведомления об обстрелах');
    assert.ok(/renderShellNotices\(\)/.test(salvo), 'панель уведомлений перерисовывается');
    assert.ok(/toast\(/.test(salvo), 'итог залпа дублируется всплывающим сообщением');
    const light = sliceFunction(HTML, 'executeLightArtilleryBarrage');
    assert.ok(/recordOpShellVictim/.test(light), 'лёгкая артиллерия тоже пишет результат');
});

// ─── 8. Контакт в одном гексе ───
test('8: отряды в одном гексе обнаруживают друг друга', () => {
    const detect = sliceFunction(HTML, 'autoDetectOneSquad');
    assert.ok(/tacticalSameHexContactDetect/.test(detect), 'до броска проверяется контакт в упор');
    const same = sliceFunction(HTML, 'tacticalSameHexContactDetect');
    assert.ok(/other.detected = true/.test(same), 'противник в том же гексе тоже становится обнаруженным');
});

// ─── 9. Обнаружение на дистанции ───
test('9: дистанция до наблюдателя даёт плюс к обнаружению (2 гекса — +2)', () => {
    const mod = sliceFunction(HTML, 'autoTacticalDetectionMod');
    assert.ok(/tacticalNearestObserverDistance/.test(mod), 'учёт дистанции до наблюдателя');
    assert.ok(/dist === 2\) mod \+= 2/.test(mod), 'на дистанции 2 гекса — +2 к обнаружению');
});

// ─── 10. Осветительная ракета ───
test('10: ракета снимает ночной штраф ровно на один ход', () => {
    const mod = sliceFunction(HTML, 'autoTacticalDetectionMod');
    assert.ok(/flareTurn ===/.test(mod), 'проверяется номер хода запуска ракеты');
    assert.ok(/flareUp/.test(mod) && /!flareUp/.test(mod), 'ночной штраф отключается, пока ракета горит');
});

// ─── 11. Раскладка отрядов в гексе ───
test('11: отряды в одном гексе раскладываются по кругу и выбираются кликом по иконке', () => {
    assert.ok(/function tacticalHexIconLayout/.test(HTML), 'раскладка иконок по кругу');
    assert.ok(/iconSize \* 1.15/.test(sliceFunction(HTML, 'tacticalHexIconLayout')), 'круговая раскладка');
    assert.ok(/tacticalRememberIconCenter/.test(HTML), 'центры иконок запоминаются');
    assert.ok(/tacticalPickSquadIdAt/.test(sliceFunction(HTML, 'handleHexAction')),
        'клик выбирает конкретный отряд, а не первый в гексе');
});

// ─── песочница: мораль бронетехники и перепривязка десанта ───
test('sandbox: бронетехника получает дух 14, десант перепривязывается по имени', () => {
    const s = createSandbox(freshAppData());
    s.run(sliceFunction(HTML, 'relinkBattlePassengers'));
    s.run(`
        var btr = { name: 'БТР Llanero №1', armor: { front: 25 }, isVehicle: true, embarkedSquadIndex: 0 };
        var pax = { name: 'Стрелковое отделение №1', opUnitName: '1-й стрелковый взвод', fighters: [{ hp: 3 }] };
        var other = { name: 'Пулемётный расчёт №1', opUnitName: '1-й стрелковый взвод', fighters: [{ hp: 3 }] };
        var squads = [other, pax, btr];
        btr.embarkedSquadName = 'Стрелковое отделение №1';
        btr.embarkedSquadOwner = '1-й стрелковый взвод';
        relinkBattlePassengers(squads);
    `);
    assert.equal(s.evalCtx('btr.embarkedSquadIndex'), 1, 'индекс десанта пересчитан на реальный отряд');
    assert.equal(s.evalCtx('pax.hidden'), true, 'десант остаётся скрытым внутри машины');
    assert.equal(s.evalCtx('other.hidden'), undefined, 'чужой отряд не помечен десантом');
});

test('sandbox: боевой дух бронетехники = 14, пехоты — по числу бойцов', () => {
    const s = createSandbox(freshAppData());
    s.run('var ARMOR_TACTICAL_MORALE = 14;');
    s.run(sliceFunction(HTML, 'isArmoredTacticalSquad'));
    s.run(sliceFunction(HTML, 'tacticalInitializeSquadMorale'));
    s.run(sliceFunction(HTML, 'tacticalMarkStartingMoraleCasualties'));
    s.run(`
        var btr = { name: 'БТР Llanero №1', faction: 'A.I.R.F.', armor: { front: 25 },
            fighters: [{ name: 'Механик-водитель', hp: 3 }] };
        var dot = { name: 'ДОТ Bosh', faction: 'BeVe', armor: { front: 200 },
            fighters: [{ hp: 3 }, { hp: 3 }] };
        var inf = { name: 'Стрелковое отделение №1', faction: 'A.I.R.F.',
            fighters: [{ hp: 3 }, { hp: 3 }, { hp: 3 }] };
        tacticalInitializeSquadMorale(btr, 'b-1');
        tacticalInitializeSquadMorale(dot, 'b-1');
        tacticalInitializeSquadMorale(inf, 'b-1');
    `);
    assert.equal(s.evalCtx('btr.baseMorale'), 14, 'дух БТР = 14');
    assert.equal(s.evalCtx('btr.currentMorale'), 14, 'текущий дух БТР = 14');
    assert.equal(s.evalCtx('isArmoredTacticalSquad(dot)'), false, 'ДОТ не считается бронетехникой');
    assert.equal(s.evalCtx('dot.baseMorale'), 2, 'ДОТ сохраняет дух по числу бойцов');
    assert.equal(s.evalCtx('inf.baseMorale'), 3, 'пехота — дух по числу бойцов');
});

console.log(`\nИтог v13.108: PASS ${passed} · FAIL 0`);
