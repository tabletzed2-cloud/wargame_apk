// ⚡ v13.078: глобальные фракционные бонусы A.I.R.F. (Талреп-якорь, Горная
//    скрытность) и BeVe (Болотоход); Талреп-якорь убран из карточек боя,
//    применяется автоматически ко всей бронетехнике A.I.R.F. на оперкарте и в
//    тактическом бою; проверка тактической карты гекса перед заездом.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { HTML, ROOT, sliceFunction, sliceConst } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

let passed = 0;
const failures = [];
function test(name, fn) {
    try { fn(); passed++; console.log('✓', name); }
    catch (e) { failures.push(name + ': ' + e.message); console.log('✗', name, '—', e.message); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tag = (re) => { const m = re.exec(HTML); return m ? m[0] : null; };

// ─── 1. Глобальные бонусы в data.js ───
test('v13.078: FRACTION_GLOBAL_BONUSES — Талреп-якорь у A.I.R.F., Горная скрытность у A.I.R.F., Болотоход у BeVe', () => {
    const data = read('js/data.js');
    const block = data.slice(data.indexOf('const FRACTION_GLOBAL_BONUSES'), data.indexOf('const SCENARIO_PLACEMENT_ZONES'));
    assert.ok(/"A\.I\.R\.F\.": \[/.test(block), 'A.I.R.F. блок');
    assert.ok(/name: "Талреп-якорь"/.test(block), 'A.I.R.F. — Талреп-якорь');
    assert.ok(/name: "Горная скрытность"/.test(block), 'A.I.R.F. — Горная скрытность');
    assert.ok(/"BeVe": \[/.test(block), 'BeVe блок');
    assert.ok(/name: "Болотоход"/.test(block), 'BeVe — Болотоход');
});

test('v13.078: иконки бонусов существуют в images/', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'images/талреп-якорь.png')), 'талреп-якорь.png');
    assert.ok(fs.existsSync(path.join(ROOT, 'images/горная скрытность.png')), 'горная скрытность.png');
    assert.ok(fs.existsSync(path.join(ROOT, 'images/болотоход.png')), 'болотоход.png');
});

// ─── 2. Карточка Талреп-якорь убрана из AIRF_CARDS ───
test('v13.078: карточка «Талреп-якорь» удалена из AIRF_CARDS (js/cards.js)', () => {
    const cards = read('js/cards.js');
    // комментарий об удалении должен быть; сама карточка не должна появляться
    // в виде JSON-объекта с name='Талреп-якорь'
    const hits = (cards.match(/"name": "Талреп-якорь"/g) || []).length;
    assert.equal(hits, 0, 'карточка удалена, найдено: ' + hits);
});

// ─── 3. tacticalHexHasSublevel2 в hexmaps.js ───
test('v13.078: tacticalHexHasSublevel2 — функция определена в js/hexmaps.js', () => {
    const hex = read('js/hexmaps.js');
    assert.ok(/function tacticalHexHasSublevel2\s*\(/.test(hex), 'объявление функции');
    assert.ok(/TACTICAL_HEX_MAPS\[hexKey\]/.test(hex), 'использует кеш');
    assert.ok(/lvl\s*<=\s*2/.test(hex), 'проверка level<=2 (не строгие пики)');
    assert.ok(/return true/.test(hex) && /return false/.test(hex), 'возвращает true/false');
});

// ─── 4. isBeveSwampTraversable в index.html ───
test('v13.078: isBeveSwampTraversable — функция определена и проверяет BeVe + край карты', () => {
    assert.ok(/function isBeveSwampTraversable/.test(HTML), 'объявление');
    assert.ok(/faction\s*!==\s*['"]BeVe['"]/.test(HTML), 'проверка фракции');
    assert.ok(/isHexInPlayableArea/.test(HTML), 'учёт края карты');
    assert.ok(/getOpHexTypes/.test(HTML), 'учёт соседей');
});

test('v13.078: getOpMoveCost — isBeveSwampTraversable применяется для бронетехники', () => {
    const fn = sliceFunction(HTML, 'getOpMoveCost');
    assert.ok(fn.includes('isBeveSwampTraversable'), 'вызов в getOpMoveCost');
    // цена 4 ОД за заезд на болото
    assert.ok(/swamp_passable[^}]*isBeveSwampTraversable[^}]*return 4/s.test(fn), 'цена 4 ОД на болоте');
});

test('v13.078: getOpMoveCost — tacticalHexHasSublevel2 запрещает заезд на «полностью горный» гекс', () => {
    const fn = sliceFunction(HTML, 'getOpMoveCost');
    // блок: terrain === 'hill' && unit.winch → проверка низин
    const block = fn.match(/terrain === 'hill' && unit\.winch\) \{[\s\S]{0,800}?\}/);
    assert.ok(block, 'блок талрепа');
    assert.ok(block[0].includes('tacticalHexHasSublevel2'), 'проверка tactical-карты');
    assert.ok(block[0].includes('Infinity'), 'возврат Infinity при запрете');
});

// ─── 5. Горная скрытность в getOpDetectionModifier ───
test('v13.078: getOpDetectionModifier — −1 к обнаружению для A.I.R.F. на hill', () => {
    const fn = sliceFunction(HTML, 'getOpDetectionModifier');
    assert.ok(fn.includes("A.I.R.F.'"), 'проверка фракции A.I.R.F.');
    assert.ok(/hill[\s\S]{0,200}?bestMod\s*-=\s*1/.test(fn) || /bestMod\s*-=\s*1[\s\S]{0,200}?hill/.test(fn), 'бонус −1 на hill');
});

// ─── 6. Талреп автоматически ставится на бронетехнику A.I.R.F. ───
test('v13.078: addOpUnit — winch=true для бронетехники A.I.R.F.', () => {
    const addFn = sliceFunction(HTML, 'addOpUnit');
    assert.ok(addFn.includes('winch'), 'поле winch');
    assert.ok(/A\.I\.R\.F\./.test(addFn), 'проверка фракции');
    assert.ok(/mobility === 'vehicle'/.test(addFn), 'проверка типа');
    assert.ok(/type !== 'dots'/.test(addFn), 'ДОТ — исключён');
});

test('v13.078: buildOperationalUnits — миграция старых сейвов A.I.R.F.', () => {
    // Ищем блок «else» где обновляются ОД и применяется миграция winch
    const iStart = HTML.indexOf('// Обновляем ОД у существующих юнитов');
    assert.ok(iStart > 0, 'нашли комментарий');
    const block = HTML.slice(iStart, iStart + 3000);
    assert.ok(block.includes('winch = true'), 'миграция проставляет winch');
    assert.ok(block.includes('A.I.R.F.'), 'миграция только для A.I.R.F.');
    assert.ok(block.includes('u.winch = true'), 'миграция winch на юните');
});

// ─── 7. Тактический бой: hasWinch учитывает фракцию A.I.R.F. ───
test('v13.078: getMovementCost (тактический бой) — hasWinch учитывает faction A.I.R.F.', () => {
    const fn = sliceFunction(HTML, 'getMovementCost');
    assert.ok(fn.includes('Талреп-якорь'), 'старая проверка карточки сохранена для совместимости');
    assert.ok(/squad\.faction === ['"]A\.I\.R\.F\./.test(fn), 'новая проверка по фракции');
    assert.ok(/isVehicle/.test(fn), 'только техника');
});

// ─── 8. Версия и changelog (v13.078 — это ИСТОРИЧЕСКИЙ артефакт) ───
const APP = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
test('v13.078: CHANGELOG-v13.078.md существует на диске (исторический релиз)', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'CHANGELOG-v13.078.md')));
});
test('v13.078: APP_VERSION ушёл вперёд (текущий ≥ v13.078)', () => {
    // ⚡ v13.079+: при выходе новой версии APP_VERSION поднимается. Этот тест
    //    гарантирует, что v13.078 не «откатился» обратно случайно.
    assert.ok(APP !== 'v13.077' && APP !== undefined, 'APP_VERSION = ' + APP);
});
test('v13.078: BUILD-МАРКЕР уехал вперёд в js-файлах', () => {
    ['js/data.js', 'js/hexmaps.js', 'js/cards.js', 'js/templates.js'].forEach(f => {
        const txt = read(f);
        // v13.078+ гарантирует, что маркер v13.078 уже сменился на v13.079 (или новее)
        assert.ok(!/BUILD-МАРКЕР: v13\.077/.test(txt), f + ' — нет отката на v13.077');
    });
});
test('v13.078: service-worker CACHE_NAME ушёл вперёд', () => {
    const sw = read('service-worker.js');
    assert.ok(!/const CACHE_NAME = 'wargame-v13\.077'/.test(sw), 'нет отката на wargame-v13.077');
});

// ─── 9. Поведение в песочнице ───
function mkOpUnit(name, faction, mobility, type) {
    return {
        name, faction, mobility, type,
        col: 5, row: 5, ap: 4, maxAp: 4,
        squads: [], detected: false, noiseMarker: false
    };
}

test('v13.078 (sandbox): getOpDetectionModifier — A.I.R.F. на hill получает −1', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['hill'];
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.run('function isNightTime() { return false; }');
    s.run(sliceFunction(HTML, 'getOpDetectionModifier'));
    const airf = mkOpUnit('airf-1', 'A.I.R.F.', 'foot', 'infantry_platoon');
    const mod = s.evalCtx('getOpDetectionModifier(' + JSON.stringify(airf) + ')');
    // базовый 0 (hill) + (−1) airf = −1
    assert.equal(mod, -1, 'A.I.R.F. на hill: мод=' + mod);
});

test('v13.078 (sandbox): getOpDetectionModifier — BeVe на hill не получает горный бонус', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['hill'];
    s.sandbox.appData.campaign.playerFaction = 'BeVe';
    s.run('function isNightTime() { return false; }');
    s.run(sliceFunction(HTML, 'getOpDetectionModifier'));
    const beve = mkOpUnit('beve-1', 'BeVe', 'foot', 'infantry_platoon');
    const mod = s.evalCtx('getOpDetectionModifier(' + JSON.stringify(beve) + ')');
    assert.equal(mod, 0, 'BeVe на hill: мод=' + mod);
});

test('v13.078 (sandbox): isBeveSwampTraversable — BeVe-бронетехника на крайнем болоте = true', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'BeVe';
    // hex (5,5) = болото; сосед (4,5) = трава (крайний)
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['swamp_passable'];
    s.sandbox.appData.campaign.opMapGrid['4,5'] = ['grass'];
    s.run(sliceFunction(HTML, 'isBeveSwampTraversable'));
    const beve = mkOpUnit('btr-1', 'BeVe', 'vehicle', 'btr_platoon');
    const r = s.evalCtx('isBeveSwampTraversable(' + JSON.stringify(beve) + ', 5, 5)');
    assert.equal(r, true, 'BeVe btr на крайнем болоте: ' + r);
});

test('v13.078 (sandbox): isBeveSwampTraversable — внутреннее болото (все 6 соседей = болото) = false', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'BeVe';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['swamp_passable'];
    // все 6 соседей — болото
    [[6,5],[6,4],[5,4],[4,5],[4,6],[5,6]].forEach(([c,r]) => {
        s.sandbox.appData.campaign.opMapGrid[c+','+r] = ['swamp_passable'];
    });
    s.run(sliceFunction(HTML, 'isBeveSwampTraversable'));
    const beve = mkOpUnit('btr-1', 'BeVe', 'vehicle', 'btr_platoon');
    const r = s.evalCtx('isBeveSwampTraversable(' + JSON.stringify(beve) + ', 5, 5)');
    assert.equal(r, false, 'BeVe btr на внутреннем болоте: ' + r);
});

test('v13.078 (sandbox): isBeveSwampTraversable — A.I.R.F. = false даже на крайнем болоте', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['swamp_passable'];
    s.sandbox.appData.campaign.opMapGrid['4,5'] = ['grass'];
    s.run(sliceFunction(HTML, 'isBeveSwampTraversable'));
    const airf = mkOpUnit('tank-1', 'A.I.R.F.', 'vehicle', 'tank_platoon');
    const r = s.evalCtx('isBeveSwampTraversable(' + JSON.stringify(airf) + ', 5, 5)');
    assert.equal(r, false, 'A.I.R.F. на болоте: ' + r);
});

test('v13.078 (sandbox): isBeveSwampTraversable — край карты = крайнее болото', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.scenario = 'valencia';
    s.sandbox.appData.campaign.playerFaction = 'BeVe';
    // ставим playable area 0..12 / 0..14 (SCENARIO_PLAYABLE_AREA уже из data.js,
    //    но в нём другая конфигурация — задаём минимально нужную через гекс (0,0))
    s.sandbox.appData.campaign.opMapGrid['0,0'] = ['swamp_passable'];
    // (0,0) — угол карты, у него 2 соседа, остальные вне карты
    s.run(sliceFunction(HTML, 'isBeveSwampTraversable'));
    const beve = mkOpUnit('btr-1', 'BeVe', 'vehicle', 'btr_platoon');
    const r = s.evalCtx('isBeveSwampTraversable(' + JSON.stringify(beve) + ', 0, 0)');
    // SCENARIO_PLAYABLE_AREA.valencia = {minCol:0, maxCol:12, minRow:0, maxRow:14}
    //    — гекс (0,0) внутри; проверим, что (0,0) — угол, и хотя бы один сосед вне
    assert.equal(r, true, 'край карты — крайнее болото: ' + r);
});

test('v13.078 (sandbox): A.I.R.F. танк с winch=true заезжает на hill гекс (есть низины)', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    // целевой гекс 6,5 = холм, исходный 5,5 = трава
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['grass'];
    s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
    s.run('var OP_HEX_SIZE = 32;');
    s.run(sliceFunction(HTML, 'getOpMoveCost'));
    const tank = mkOpUnit('tank-1', 'A.I.R.F.', 'vehicle', 'tank_platoon');
    tank.winch = true;
    const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(tank) + ', 5, 5, 6, 5)');
    // 'unknown' (карта не загружена в песочнице) → разрешаем заезд → цена 4 ОД
    assert.equal(cost, 4, 'A.I.R.F. танк с winch на hill (карта не загружена): cost=' + cost);
});

test('v13.078 (sandbox): танк БЕЗ winch на hill = Infinity', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['grass'];
    s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
    s.run('var OP_HEX_SIZE = 32;');
    s.run(sliceFunction(HTML, 'getOpMoveCost'));
    const tank = mkOpUnit('tank-1', 'A.I.R.F.', 'vehicle', 'tank_platoon');
    // без winch
    const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(tank) + ', 5, 5, 6, 5)');
    assert.equal(cost, Infinity, 'танк без winch на hill: cost=' + cost);
});

test('v13.078 (sandbox): A.I.R.F. танк с winch на hill без низин = Infinity', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['grass'];
    s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
    // имитируем загруженную карту гекса 6,5 — все гексы level=3 (самые высокие пики)
    s.run('TACTICAL_HEX_MAPS["6,5"] = { grid: { "0,0": { level: 3 }, "1,0": { level: 3 }, "2,0": { level: 3 } } };');
    s.run('var OP_HEX_SIZE = 32;');
    s.run(sliceFunction(HTML, 'getOpMoveCost'));
    const tank = mkOpUnit('tank-1', 'A.I.R.F.', 'vehicle', 'tank_platoon');
    tank.winch = true;
    const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(tank) + ', 5, 5, 6, 5)');
    assert.equal(cost, Infinity, 'танк с winch на hill с одними пиками: cost=' + cost);
});

test('v13.078 (sandbox): A.I.R.F. танк с winch на hill с level<=2 = разрешён (4 ОД)', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['grass'];
    s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
    // имитируем загруженную карту гекса 6,5 — все гексы level=2 (среднегорье)
    s.run('TACTICAL_HEX_MAPS["6,5"] = { grid: { "0,0": { level: 2 }, "1,0": { level: 2 } } };');
    s.run('var OP_HEX_SIZE = 32;');
    s.run(sliceFunction(HTML, 'getOpMoveCost'));
    const tank = mkOpUnit('tank-1', 'A.I.R.F.', 'vehicle', 'tank_platoon');
    tank.winch = true;
    const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(tank) + ', 5, 5, 6, 5)');
    assert.equal(cost, 4, 'танк с winch на hill с level<=2: cost=' + cost);
});

console.log(`\nИтог v13.078: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) process.exitCode = 1;
