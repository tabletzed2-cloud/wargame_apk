'use strict';
const assert = require('assert/strict');
const { HTML } = require('./extract');
let passed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗', name, e.message); }
}
test('APP_VERSION 13.081', () => assert.match(HTML, /var APP_VERSION = 'v13\.081'/));
test('placePlayer stacks on occupied hex', () => {
  assert.match(HTML, /в режиме размещения клик ВСЕГДА ставит юнит из списка/);
  assert.doesNotMatch(HTML, /клик по уже стоящему своему отряду — ВЫБОР/);
});
test('campaign resume', () => {
  assert.match(HTML, /function campaignCanResume/);
  assert.match(HTML, /function installAutosaveHooks/);
  assert.match(HTML, /if \(campaignCanResume\(\)\)/);
});
test('no difficulty profiles UI', () => {
  assert.doesNotMatch(HTML, /Сложность: 🌱 Новичок/);
  assert.match(HTML, /onclick="toggleHardMode\(\)"/);
  assert.match(HTML, /профили Новичок\/Обычный\/Ветеран сняты/);
});
console.log(passed + ' passed, ' + failures.length + ' failed');
if (failures.length) process.exit(1);
