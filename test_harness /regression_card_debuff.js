const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const catalog = fs.readFileSync(path.join(__dirname, '..', 'js', 'cards.js'), 'utf8');
const match = catalog.match(/\{[^\n]*"name": "Шахтерский динамит"[^\n]*\}/);
assert.ok(match, 'карточка «Шахтерский динамит» должна присутствовать в каталоге');
assert.match(match[0], /"type":\s*"negative"/, 'карточка должна классифицироваться как дебафф');
assert.doesNotMatch(match[0], /"type":\s*"bonus"/, 'карточка не должна классифицироваться как бонус');
console.log('Шахтерский динамит: PASS — тип negative (дебафф).');
