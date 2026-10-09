// v13.079 regression — 6 user issues
// 1. op-map placement panel collapses (setOpMapMode сбрасывал selectedOpUnit)
// 2. op-map unit selection doesn't stick
// 3. Hard mode hides manual move/shoot buttons
// 4. Talrep-yakor works on hill hexes with level<=2 (и не работает на level=3)
// 5. Stealth-move не может заехать на холм (3-4 ОД > 2 stealth ОД)
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { HTML, ROOT, sliceFunction } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

let passed = 0;
const failures = [];
function test(name, fn) {
    try { fn(); passed++; console.log('✓', name); }
    catch (e) { failures.push(name + ': ' + e.message); console.log('✗', name, '—', e.message); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function mkOpUnit(name, faction, mobility, type) {
    return { name, faction, mobility, type, col: 5, row: 5, ap: 4, maxAp: 4, movedThisTurn: false, firedThisTurn: false };
}

test('v13.079: скрытное движение пехоты на холм = Infinity (3 ОД > 2)', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['grass'];
    s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
    s.run('var OP_HEX_SIZE = 32;');
    s.run(sliceFunction(HTML, 'getOpMoveCost'));
    const inf = mkOpUnit('inf-1', 'A.I.R.F.', 'foot', 'infantry_platoon');
    inf.stealthMove = true;
    const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(inf) + ', 5, 5, 6, 5)');
    assert.equal(cost, Infinity, 'пехота скрытно на холм: cost=' + cost);
});

test('v13.079: скрытное движение танка с талрепом на холм = Infinity (лебёдка шумит)', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['grass'];
    s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
    s.run('TACTICAL_HEX_MAPS["6,5"] = { grid: { "0,0": { level: 1 } } };');
    s.run('var OP_HEX_SIZE = 32;');
    s.run(sliceFunction(HTML, 'getOpMoveCost'));
    const tank = mkOpUnit('tank-1', 'A.I.R.F.', 'vehicle', 'tank_platoon');
    tank.winch = true;
    tank.stealthMove = true;
    const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(tank) + ', 5, 5, 6, 5)');
    assert.equal(cost, Infinity, 'танк с талрепом скрытно на холм: cost=' + cost);
});

test('v13.079: обычная пехота на холм = 3 ОД (норма)', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['grass'];
    s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
    s.run('var OP_HEX_SIZE = 32;');
    s.run(sliceFunction(HTML, 'getOpMoveCost'));
    const inf = mkOpUnit('inf-1', 'A.I.R.F.', 'foot', 'infantry_platoon');
    const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(inf) + ', 5, 5, 6, 5)');
    assert.equal(cost, 3, 'пехота на холм: cost=' + cost);
});

test('v13.079: тактическая карта гекса 6,5 со всеми level<=2 = заезд разрешён', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['grass'];
    s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
    s.run('TACTICAL_HEX_MAPS["6,5"] = { grid: { "0,0": { level: 2 }, "1,0": { level: 2 }, "2,0": { level: 2 } } };');
    s.run('var OP_HEX_SIZE = 32;');
    s.run(sliceFunction(HTML, 'getOpMoveCost'));
    const tank = mkOpUnit('tank-1', 'A.I.R.F.', 'vehicle', 'tank_platoon');
    tank.winch = true;
    const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(tank) + ', 5, 5, 6, 5)');
    assert.equal(cost, 4, 'танк с талрепом на level<=2 холм: cost=' + cost);
});

test('v13.079: тактическая карта гекса 6,5 со всеми level=3 = заезд запрещён', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.opMapGrid['5,5'] = ['grass'];
    s.sandbox.appData.campaign.opMapGrid['6,5'] = ['hill'];
    s.run('TACTICAL_HEX_MAPS["6,5"] = { grid: { "0,0": { level: 3 }, "1,0": { level: 3 }, "2,0": { level: 3 } } };');
    s.run('var OP_HEX_SIZE = 32;');
    s.run(sliceFunction(HTML, 'getOpMoveCost'));
    const tank = mkOpUnit('tank-1', 'A.I.R.F.', 'vehicle', 'tank_platoon');
    tank.winch = true;
    const cost = s.evalCtx('getOpMoveCost(' + JSON.stringify(tank) + ', 5, 5, 6, 5)');
    assert.equal(cost, Infinity, 'танк с талрепом на level=3 холм: cost=' + cost);
});

test('v13.079: tacticalHexHasSublevel2 учитывает level<=2 (не level<2)', () => {
    const s = createSandbox(freshAppData());
    // hexmaps.js загружен в createSandbox автоматически — только наполняем кеш
    s.run('TACTICAL_HEX_MAPS["5,3"] = { grid: { "0,0": { level: 2 } } };');
    s.run('TACTICAL_HEX_MAPS["6,2"] = { grid: { "0,0": { level: 2 } } };');
    s.run('TACTICAL_HEX_MAPS["2,7"] = { grid: { "0,0": { level: 1 } } };');
    s.run('TACTICAL_HEX_MAPS["3,5"] = { grid: { "0,0": { level: 3 } } };');
    assert.equal(s.evalCtx('tacticalHexHasSublevel2("5,3")'), true, 'level=2 → true (раньше было false)');
    assert.equal(s.evalCtx('tacticalHexHasSublevel2("6,2")'), true, 'level=2 → true');
    assert.equal(s.evalCtx('tacticalHexHasSublevel2("2,7")'), true, 'level=1 → true');
    assert.equal(s.evalCtx('tacticalHexHasSublevel2("3,5")'), false, 'level=3 → false');
    assert.equal(s.evalCtx('tacticalHexHasSublevel2("0,0")'), 'unknown', 'нет карты → unknown');
});

test('v13.079: setOpMapMode НЕ сбрасывает selectedOpUnit при переключении между совместимыми режимами', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.opMapMode = 'placePlayer';
    s.sandbox.appData.campaign.selectedOpUnit = 2;
    s.run('var placementLocked = false;');
    s.run('var appData = { campaign: { opMapMode: "placePlayer", selectedOpUnit: 2, online: false, opUnits: [], enemyOpUnits: [] } };');
    s.run('var document = { getElementById: function(id) { return { innerHTML: "", style: { display: "" } }; } };');
    s.run(sliceFunction(HTML, 'setOpMapMode'));
    // переключаемся placePlayer → marker (другая фаза, но всё ещё своя сторона)
    s.evalCtx('setOpMapMode("marker")');
    assert.equal(s.evalCtx('appData.campaign.selectedOpUnit'), 2, 'selectedOpUnit НЕ должен сбрасываться');
    // теперь placePlayer → placeEnemy (смена стороны) — должен сброситься
    s.evalCtx('setOpMapMode("placeEnemy")');
    assert.equal(s.evalCtx('appData.campaign.selectedOpUnit'), null, 'selectedOpUnit должен сброситься при смене стороны');
});

test('v13.079: setOpMapMode(\'move\') в HardMode = запрещён', () => {
    const s = createSandbox(freshAppData());
    s.sandbox.appData.campaign.opMapMode = 'placePlayer';
    s.sandbox.appData.campaign.selectedOpUnit = 2;
    s.sandbox.appData.campaign.hardMode = true;
    s.run('var placementLocked = false;');
    s.run('var appData = { campaign: { opMapMode: "placePlayer", selectedOpUnit: 2, online: false, opUnits: [], enemyOpUnits: [], hardMode: true } };');
    s.run('var document = { getElementById: function(id) { return { innerHTML: "", style: { display: "" } }; } };');
    s.run(sliceFunction(HTML, 'setOpMapMode'));
    s.evalCtx('setOpMapMode("move")'); // должен вернуть рано
    assert.equal(s.evalCtx('appData.campaign.opMapMode'), 'placePlayer', 'mode не должен был смениться в HardMode');
});

// ─── 9. Версия и changelog ───
const APP = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
test('v13.079: APP_VERSION = v13.079 и CHANGELOG на месте', () => {
    assert.equal(APP, 'v13.079');
    assert.ok(fs.existsSync(path.join(ROOT, 'CHANGELOG-v13.079.md')));
});
test('v13.079: BUILD-МАРКЕР поднят в js/data.js, js/hexmaps.js, js/cards.js, js/templates.js', () => {
    ['js/data.js', 'js/hexmaps.js', 'js/cards.js', 'js/templates.js'].forEach(f => {
        const txt = read(f);
        assert.ok(/BUILD-МАРКЕР: v13\.079/.test(txt), f + ' — маркер v13.079');
    });
});
test('v13.079: service-worker CACHE_NAME обновлён', () => {
    const sw = read('service-worker.js');
    assert.ok(/const CACHE_NAME = 'wargame-v13\.079'/.test(sw), 'CACHE_NAME = wargame-v13.079');
});
test('v13.079: manifest short_name = БМ v13.079', () => {
    const m = JSON.parse(read('manifest.json'));
    assert.equal(m.short_name, 'БМ v13.079');
});

test('v13.079: «Аварийный тормоз» удалён из cards.js', () => {
    const cards = read('js/cards.js');
    // Noodrem Аварийный тормоз больше не должен присутствовать как объект карты
    const asCard = /\{[^{}]*"name":\s*"Noodrem Аварийный тормоз"/.test(cards);
    assert.ok(!asCard, 'карты Noodrem Аварийный тормоз в cards.js быть не должно');
});

test('v13.079: useEmergencyBrake объявлена в index.html', () => {
    assert.ok(/function useEmergencyBrake\s*\(\s*\)/.test(HTML), 'useEmergencyBrake должна быть объявлена');
});

test('v13.079: useEmergencyBrake использует prevCol/prevRow', () => {
    const i = HTML.indexOf('function useEmergencyBrake');
    const chunk = HTML.slice(i, i + 2000);
    assert.ok(/prevCol/.test(chunk), 'useEmergencyBrake читает prevCol');
    assert.ok(/prevRow/.test(chunk), 'useEmergencyBrake читает prevRow');
    assert.ok(/emergencyBrakeUsed/.test(chunk), 'useEmergencyBrake ставит emergencyBrakeUsed');
    assert.ok(/cantMoveThisTurn/.test(chunk), 'useEmergencyBrake ставит cantMoveThisTurn');
});

test('v13.079: moveSquad блокирует движение при cantMoveThisTurn', () => {
    const i = HTML.indexOf('function moveSquad');
    const chunk = HTML.slice(i, i + 1500);
    assert.ok(/cantMoveThisTurn/.test(chunk), 'moveSquad проверяет cantMoveThisTurn');
});

test('v13.079: кнопка «🛑 Аварийный тормоз» появляется только для BeVe-бронетехники', () => {
  // ⚡ v13.079: ищем кнопку в окрестности 12000 символов вокруг moveSquad
  //    (кнопка находится ДО объявления функции, т.к. генерируется в HTML-строке)
  const i = HTML.indexOf('function moveSquad');
  const chunk = HTML.slice(Math.max(0, i - 12000), i + 2000);
  assert.ok(/useEmergencyBrake\(\)/.test(chunk), 'onclick=useEmergencyBrake()');
  assert.ok(/🛑 Аварийный тормоз/.test(chunk), 'иконка и текст в кнопке');
  assert.ok(/currentSquad\.faction === 'BeVe'/.test(chunk), 'проверка фракции BeVe');
  assert.ok(/currentSquad\.armor/.test(chunk), 'проверка что это бронетехника');
  assert.ok(/!currentSquad\.emergencyBrakeUsed/.test(chunk), 'кнопка скрывается после использования');
});

console.log('\nИтог v13.079: PASS ' + passed + ' · FAIL ' + failures.length);
if (failures.length) {
    failures.forEach(f => console.log('  ' + f));
    process.exit(1);
}
