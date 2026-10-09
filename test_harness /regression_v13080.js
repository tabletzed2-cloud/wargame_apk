// v13.080 regression
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { HTML, ROOT } = require('./extract');

let passed = 0;
const failures = [];
function test(name, fn) {
    try { fn(); passed++; console.log('✓', name); }
    catch (e) { failures.push(name + ': ' + e.message); console.log('✗', name, '—', e.message); }
}
test('v13.080: APP_VERSION', () => {
    assert.match(HTML, /var APP_VERSION = 'v13\.080'/);
});
test('v13.080: кнопка выбора отряда при размещении', () => {
    assert.match(HTML, /👆 Выбор отряда/);
    assert.match(HTML, /клик по уже стоящему своему отряду/);
});
test('v13.080: приказ escort', () => {
    assert.match(HTML, /value="escort"/);
    assert.match(HTML, /function executeEscortOrder/);
    assert.match(HTML, /function attachEscortVehiclesToBattle/);
});
test('v13.080: hardmode шаг без ручного управления', () => {
    assert.match(HTML, /Ручное перемещение и обстрел недоступны/);
    assert.match(HTML, /battle && ap > 0 && !fixed && !u\.operationalRouted && !hardOn/);
});
test('v13.080: скрытное движение для move/attack/retreat/escort', () => {
    assert.match(HTML, /orderType === 'move' \|\| orderType === 'attack' \|\| orderType === 'retreat' \|\| orderType === 'escort'/);
    assert.match(HTML, /id="orderStealthMove"/);
});
test('v13.080: undoLastAction', () => {
    assert.match(HTML, /function undoLastAction/);
    assert.match(HTML, /onclick="undoLastAction\(\)"/);
});
test('v13.080: мгновенная связь до placementLocked', () => {
    assert.match(HTML, /const instantAssign = \(typeof placementLocked === 'undefined' \|\| !placementLocked\)/);
});

console.log(passed + ' passed, ' + failures.length + ' failed');
if (failures.length) { failures.forEach(f => console.error(f)); process.exit(1); }
