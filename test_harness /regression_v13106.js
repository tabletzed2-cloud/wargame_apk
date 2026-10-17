// v13.106: длительность обстрела гекса (п.10), окопы делят урон на 1,5 (п.9), отчёты об обстреле (п.11).
// Вырезает функции из index.html и проверяет логику залпов без браузера.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
function grabFn(name) {
  const re = new RegExp('^function ' + name + '\\(', 'm');
  const m = re.exec(src); if (!m) throw new Error('no fn ' + name);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
  return src.slice(m.index, j + 1) + '\n';
}
function grabConst(name) { const m = new RegExp('^const ' + name + ' = [^\\n]*;', 'm').exec(src); return m[0] + '\n'; }
const names = ['opHexHasTrenches','opTrenchReducedDamage','normalizeShellMinutes','shellTurnsForMinutes','buildOpAreaFireMark',
  'beginOpShellCapture','recordOpShellVictim','endOpShellCapture','resolveOperationalAreaFire','applyDamageToOpUnit','scheduleExtraOpShellSalvos'];
let code = ['OP_SHELL_TURN_MINUTES','OP_SHELL_DURATION_OPTIONS','OP_TRENCH_DAMAGE_DIVISOR'].map(grabConst).join('');
code += 'let opShellCapture = null;\n' + names.map(grabFn).join('\n');
const logs = [];
const ctx = {
  console, log: (m) => logs.push(m), saveData() {}, formatTime: () => '10:00',
  rollD6: () => 6, rollD10: () => 10, isMortarUnit: () => false, isArmoredUnit: () => false,
  opVictimHiddenFromPlayer: (u) => !!u.hidden, mortarRoundsForUnit: () => 15,
  applyDamageToOpUnitCore: (u, d) => ({ damage: d, killed: d >= 6 ? 1 : 0 }),
  appData: { campaign: {} }, Math
};
ctx.appData = ctx; // placeholder replaced below
const sandbox = { console, Math, log: ctx.log, saveData() {}, formatTime: () => '10:00', rollD6: () => 6, rollD10: () => 10,
  isMortarUnit: () => false, isArmoredUnit: () => false, opVictimHiddenFromPlayer: (u) => !!u.hidden,
  mortarRoundsForUnit: () => 15, applyDamageToOpUnitCore: (u, d) => ({ damage: d, killed: d >= 6 ? 1 : 0 }) };
sandbox.appData = { campaign: { currentTurn: 3, opMapGrid: {}, enemyOpUnits: [] } };
vm.createContext(sandbox);
vm.runInContext(code.replace(/applyDamageToOpUnit\(unit, damage\) \{/, 'applyDamageToOpUnit(unit, damage) {'), sandbox);
const C = sandbox.appData.campaign;
const enemy = { name: 'Враг A', col: 2, row: 2, isDestroyed: false, detected: true };
C.enemyOpUnits = [enemy];
const unit = { name: 'Миномёт 82-мм', type: 'mortar_battery' };
// 1) minutes -> turns
assert.equal(vm.runInContext('shellTurnsForMinutes(10)', sandbox), 1);
assert.equal(vm.runInContext('shellTurnsForMinutes(30)', sandbox), 3);
assert.equal(vm.runInContext('shellTurnsForMinutes(45)', sandbox), 1); // invalid -> 10
assert.equal(vm.runInContext('normalizeShellMinutes("60")', sandbox), 60);
// 2) order: 30 min -> mark with 3 salvos, resolved over 3 turns
C.opMapGrid['2,2'] = { types: ['grass'], markers: [] };
C.opMapGrid['2,2'].areaFire = sandbox.buildOpAreaFireMarkTest = vm.runInContext('buildOpAreaFireMark({name:"Пехота"}, 2, 3)', sandbox);
for (let turn = 3; turn <= 6; turn++) {
  C.currentTurn = turn;
  vm.runInContext('resolveOperationalAreaFire()', sandbox);
}
assert.equal(C.opMapGrid['2,2'].areaFire, undefined, 'mark removed after 3 salvos');
// 3) trench reduction: 6 -> 4 (floor 6/1.5) ; 1 -> 1 (min)
assert.equal(vm.runInContext('opTrenchReducedDamage(6)', sandbox), 4);
assert.equal(vm.runInContext('opTrenchReducedDamage(1)', sandbox), 1);
assert.equal(vm.runInContext('opTrenchReducedDamage(5)', sandbox), 3);
// 4) trench-cell detection
assert.equal(vm.runInContext('opHexHasTrenches({types:["grass"],markers:["trenches"]})', sandbox), true);
assert.equal(vm.runInContext('opHexHasTrenches({types:["trenches"],markers:[]})', sandbox), true);
assert.equal(vm.runInContext('opHexHasTrenches({types:["grass"],markers:[]})', sandbox), false);
// 5) with trench: damage applied is reduced; notice generated with trench flag
C.shellNotices = [];
C.currentTurn = 10;
C.opMapGrid['2,2'] = { types: ['grass'], markers: ['trenches'], areaFire: vm.runInContext('buildOpAreaFireMark({name:"Миномёт 82-мм"}, 9, 1)', sandbox) };
vm.runInContext('resolveOperationalAreaFire()', sandbox);
assert.equal(C.shellNotices.length, 1, 'one notice');
const n = C.shellNotices[0];
assert.equal(n.trench, true);
assert.ok(n.victims.length === 1 && n.victims[0].hits > 0, 'victim hit recorded');
// every hit damage must be trench-reduced: rollD6 =6 -> 4 per hit
assert.equal(n.victims[0].damage, n.victims[0].hits * 4, 'damage reduced by trench');
// 6) hidden target produces no victim row, note about no visible targets
C.enemyOpUnits = [{ name: 'Скрытый', col: 4, row: 4, isDestroyed: false, hidden: true }];
C.shellNotices = []; C.opMapGrid['4,4'] = { types: ['grass'], markers: [], areaFire: vm.runInContext('buildOpAreaFireMark({name:"Миномёт"}, 9, 1)', sandbox) };
vm.runInContext('resolveOperationalAreaFire()', sandbox);
assert.equal(C.shellNotices[0].victims.length, 0);
assert.match(C.shellNotices[0].note, /видимых/);
console.log('v13.106 shelling duration/trench/notices: PASS');
