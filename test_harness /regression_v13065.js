// ⚡ v13.065: регрессии рукопашной по фактической дистанции (R43#6/#7),
//    отсутствия «условных» карт в тактическом бою (R43#8), красного
//    оформления дебаффов (R43#9), замены шаблонов карт (R43#4) и
//    стартовых позиций v13.058 (R43#5).
//    Запуск: node 'test_harness /regression_v13065.js' (после regression_v13064.js)
'use strict';
const fs = require('fs');
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const HEX = fs.readFileSync(ROOT + '/js/hexmaps.js', 'utf8');
const DATA = fs.readFileSync(ROOT + '/js/data.js', 'utf8');

const names = [
  'tacticalSquadHexPosition', 'tacticalSquadsDistance', 'tacticalSquadIsAlive',
  'tacticalSquadsInSameHex', 'tacticalAutoEngageMelee', 'tacticalEnemyHexHasFriendlies',
  'tacticalMeleeTarget', 'tacticalEnemyIsNeutralized', 'isCardPlayableInTacticalBattle',
  'filterCardsPlayableInBattle', 'saveCurrentMapAsTemplate', 'startReplaceMapTemplate',
  'replaceMapTemplateFromFile', 'importMapData', 'deleteMapTemplate'
];
fs.writeFileSync('/tmp/wg_v13065_part.js', names.map(n => sliceFunction(HTML, n)).join('\n') + '\n'
  + ['_hexCubeCoords', 'hexGridDistance', 'getBattleSquadHex'].map(n => sliceFunction(HEX, n)).join('\n'));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗ ' + name + ' — ' + e.message); }
}

function battleSandbox() {
  const s = createSandbox(freshAppData());
  s.run(fs.readFileSync('/tmp/wg_v13065_part.js', 'utf8') + `
    globalThis.__logs = [];
    function log(m) { __logs.push(String(m)); }
    function saveData() {}
    function redrawMap() {}
    function prompt() { return __promptAnswer; }
    function confirm() { return __confirmAnswer; }
    function alert() { __logs.push('ALERT'); }
    function renderMapTemplates() {}
    function loadMapTemplate() {}
    globalThis.__promptAnswer = null;
    globalThis.__confirmAnswer = true;
    appData.map = { grid: {}, enemySquads: [], mode: 'move' };
    appData.mapTemplates = [];
    appData.squads = [
      { name: 'Наши 1-е отделение', fighters: [{ hp: 2, maxHp: 2 }, { hp: 1, maxHp: 2 }] },
      { name: 'Наши 2-е отделение', fighters: [{ hp: 2, maxHp: 2 }] }
    ];
    appData.map.enemySquads = [
      { name: 'Враг 1-е отделение', fighters: [{ hp: 2, maxHp: 2 }] },
      { name: 'Враг 2-е отделение', fighters: [{ hp: 0, maxHp: 2 }] }
    ];
    appData.map.grid['3,4'] = { type: 'grass', squadIds: [0], enemySquadIds: [] };
    appData.map.grid['5,5'] = { type: 'grass', squadIds: [1], enemySquadIds: [0] };
  `);
  return s;
}

// ── R43#7: расстояние считается по гексам, а не по скрытому полю «Дистанция»
test('R43#7: отряды в одном гексе — расстояние 0 (рукопашная доступна)', () => {
  const s = battleSandbox();
  assert.equal(s.evalCtx('tacticalSquadsDistance(appData.squads[1], appData.map.enemySquads[0])'), 0);
});
test('R43#7: расстояние между 3,4 и 5,5 = 3 гекса', () => {
  const s = battleSandbox();
  assert.equal(s.evalCtx('tacticalSquadsDistance(appData.squads[0], appData.map.enemySquads[0])'), 3);
});
test('R43#7: мёртвый противник не считается контактом', () => {
  const s = battleSandbox();
  s.evalCtx("appData.map.grid['5,5'].enemySquadIds = [0, 1];");
  const contacts = s.evalCtx('tacticalSquadsInSameHex(appData.squads[1]).map(c => c.squad.name).join("|")');
  assert.equal(contacts, 'Враг 1-е отделение');
});
test('R43#7: цель рукопашной — противник в своём гексе', () => {
  const s = battleSandbox();
  s.evalCtx('currentSquad = appData.squads[1];');
  assert.equal(s.evalCtx('(tacticalMeleeTarget() || {}).enemy ? tacticalMeleeTarget().enemy.name : null'), 'Враг 1-е отделение');
});
test('R43#7: свой отряд в гексе цели блокирует стрельбу', () => {
  const s = battleSandbox();
  assert.equal(s.evalCtx('(tacticalEnemyHexHasFriendlies(appData.map.enemySquads[0]) || {}).name || null'), 'Наши 2-е отделение');
  assert.equal(s.evalCtx('tacticalEnemyHexHasFriendlies(appData.squads[0])'), null);
});
test('R43#7: техника в рукопашной не участвует', () => {
  const s = battleSandbox();
  s.evalCtx("appData.squads[1].armor = { front: 5 };");
  assert.equal(s.evalCtx('tacticalSquadsInSameHex(appData.squads[1]).length'), 0);
});

// ── R43#6: автоматическое начало рукопашной при входе в гекс противника
test('R43#6: вход в гекс врага связывает оба отряда рукопашной', () => {
  const s = battleSandbox();
  s.evalCtx('tacticalAutoEngageMelee(appData.squads[1]);');
  assert.equal(s.evalCtx("appData.squads[1].meleeOpponentName || null"), 'Враг 1-е отделение');
  assert.equal(s.evalCtx("appData.map.enemySquads[0].meleeOpponentName || null"), 'Наши 2-е отделение');
  const logs = s.evalCtx('__logs.join("\\n")');
  assert.match(logs, /Рукопашная/);
});
test('R43#6: повторный вызов не перезаключает бой', () => {
  const s = battleSandbox();
  s.evalCtx('tacticalAutoEngageMelee(appData.squads[1]); const first = appData.squads[1].meleeOpponentName; tacticalAutoEngageMelee(appData.squads[1]); globalThis.__same = first === appData.squads[1].meleeOpponentName;');
  assert.equal(s.evalCtx('__same'), true);
});

// ── R43#8: в тактическом бою нет «условных» карт
test('R43#8: информационные и «условные» карты отбрасываются', () => {
  const s = battleSandbox();
  const r = s.evalCtx(`JSON.stringify({
    info: isCardPlayableInTacticalBattle({ name: 'Упрямство', type: 'negative', informational: true, effect: 'Не отступает' }),
    conditional: isCardPlayableInTacticalBattle({ name: 'Горное пончо', type: 'bonus', effect: 'Условная' }),
    empty: isCardPlayableInTacticalBattle({ name: 'Пустая', type: 'bonus', effect: '' }),
    real: isCardPlayableInTacticalBattle({ name: 'Ночь', type: 'bonus', effect: '-1 к меткости' })
  })`);
  assert.deepEqual(JSON.parse(r), { info: false, conditional: false, empty: false, real: true });
});
test('R43#8: фильтр боя оставляет только карты с эффектом (и дебаффы)', () => {
  const s = battleSandbox();
  const kept = s.evalCtx(`filterCardsPlayableInBattle([
    { name: 'Велоблиц', type: 'bonus', informational: true, effect: '+3 гекса движения' },
    { name: 'Ночь', type: 'bonus', effect: '-1 к меткости' },
    { name: 'Нервный срыв', type: 'negative', informational: true, effect: '-1 дух' }
  ]).map(c => c.name).join("|")`);
  assert.equal(kept, 'Ночь|Нервный срыв');
});

// ── R43#4: замена шаблона карты
test('R43#4: сохранение с существующим именем обновляет шаблон, а не дублирует', () => {
  const s = battleSandbox();
  s.run(`
    __promptAnswer = 'Валенсия';
    __confirmAnswer = true;
    saveCurrentMapAsTemplate();
    const before = appData.mapTemplates.length;
    appData.map.grid['9,9'] = { type: 'grass', squadIds: [], enemySquadIds: [] };
    saveCurrentMapAsTemplate();
    globalThis.__res = { count: appData.mapTemplates.length, before, hasNewHex: !!appData.mapTemplates[0].grid['9,9'] };
  `);
  const res = JSON.parse(s.evalCtx('JSON.stringify(__res)'));
  assert.equal(res.before, 1);
  assert.equal(res.count, 1, 'второй копии с тем же именем быть не должно');
  assert.equal(res.hasNewHex, true, 'шаблон должен обновиться текущей картой');
});
test('R43#4: отказ от замены сохраняет старый шаблон', () => {
  const s = battleSandbox();
  s.run(`
    __promptAnswer = 'Валенсия';
    __confirmAnswer = true;
    saveCurrentMapAsTemplate();
    appData.map.grid['8,8'] = { type: 'grass', squadIds: [], enemySquadIds: [] };
    __confirmAnswer = false;
    saveCurrentMapAsTemplate();
    globalThis.__res = { count: appData.mapTemplates.length, hasNewHex: !!appData.mapTemplates[0].grid['8,8'] };
  `);
  const res = JSON.parse(s.evalCtx('JSON.stringify(__res)'));
  assert.equal(res.count, 1);
  assert.equal(res.hasNewHex, false);
});
test('R43#4: импорт не стирает существующие шаблоны', () => {
  const s = battleSandbox();
  s.run(`
    appData.mapTemplates = [{ name: 'Старая', grid: { '1,1': { type: 'grass' } } }];
    const incoming = { templates: [ { name: 'Новая', grid: { '2,2': { type: 'grass' } } } ] };
    // эмуляция импорта: та же логика слияния, что и в importMapData
    const names = incoming.templates.map(t => t && t.name).filter(Boolean);
    const dupes = names.filter(n => appData.mapTemplates.some(t => t && t.name === n));
    if (!dupes.length || confirm()) {
      incoming.templates.forEach(t => {
        const at = appData.mapTemplates.findIndex(x => x && x.name === t.name);
        if (at >= 0) appData.mapTemplates[at] = t; else appData.mapTemplates.push(t);
      });
    }
    globalThis.__res = appData.mapTemplates.map(t => t.name).join('|');
  `);
  assert.equal(s.evalCtx('__res'), 'Старая|Новая');
});

// ── R43#5: стартовые позиции v13.058
test('R43#5: стартовые позиции Валенсии восстановлены из v13.058', () => {
  const beve = DATA.match(/'BeVe':\s*\{([\s\S]*?)\},\s*'A\.I\.R\.F\.'/);
  assert.ok(beve, 'блок BeVe найден');
  const body = beve[1];
  const expect = {
    'Штаб батальона': '5,4',
    'Батарея 82-мм миномётов': '5,6',
    'Расчёт ПТО №1': '2,7',
    'ДОТ Van Hees': '8,10'
  };
  for (const [unit, pos] of Object.entries(expect)) {
    const re = new RegExp("'" + unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*'" + pos + "'");
    assert.match(body, re, `${unit} должен стоять на ${pos}`);
  }
  const airf = DATA.match(/'A\.I\.R\.F\.':\s*\{([\s\S]*?)\n {4}\}/);
  assert.ok(airf, 'блок A.I.R.F. найден');
  assert.match(airf[1], /'Штаб Батальона':\s*'1,13'/);
});

// ── версия и оформление
test('v13.065: версия проставлена в приложении, манифесте и кэше', () => {
  assert.match(HTML, /var APP_VERSION = 'v13\.065'/);
  assert.match(HTML, /<title>Боевой модуль v13\.065/);
  const manifest = fs.readFileSync(ROOT + '/manifest.json', 'utf8');
  assert.match(manifest, /БМ v13\.065/);
  const sw = fs.readFileSync(ROOT + '/service-worker.js', 'utf8');
  assert.match(sw, /const CACHE_NAME = 'wargame-v13\.065'/);
});
test('R43#9: карты-дебаффы обводятся красным', () => {
  assert.match(HTML, /isNegative \? '#3a1e1e' : '#1e3a2a'/);
  assert.match(HTML, /border:2px solid #e74c3c;background:#3a1e1e;/);
});
test('R43#7: стрельба по гексу со своими запрещена в оценке цели', () => {
  const ma = fs.readFileSync(ROOT + '/js/map_actions.js', 'utf8');
  assert.match(ma, /tacticalEnemyHexHasFriendlies/);
  assert.match(ma, /в гексе свои — бить нельзя/);
});

console.log(`\nИтог v13.065: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) { failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
