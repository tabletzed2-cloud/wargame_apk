'use strict';
// ⚡ v13.133: регрессии правок 1–4:
//   1 — карточные отряды (ампуломёты, бутылкомёты, снайперы и т.п.) — дух на
//       общей шкале 0–100 (миграция больше не откатывает шкалу к 5/5);
//   2 — наследование командования: штаб батальона → штаб роты №1 → №2 → №3;
//       телефоны мертвы после гибели штаба батальона; рация — только при рациях
//       у командующего штаба И у получателя; иначе посыльные командующего штаба;
//   3 — тактический бой не начинается «дистанционно» (отряды с других гексов
//       не попадают в состав боя; пустая сторона после фильтров = отказ);
//   4 — журнал событий КОНКРЕТНОГО тактического боя (battle.eventLog).
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (e) { failures.push(name + ': ' + e.message); console.error(`✗ ${name} — ${e.message}`); }
}

// ───────────────────────── П.1: мораль карточных отрядов ─────────────────────────
test('п.1: карточный отряд (5/5) приводится к шкале духа 0–100', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'tacticalNormalizeMoraleScale'));
  s.run(sliceFunction(HTML, 'tacticalNormalizeNewSquadMorale'));
  s.run(`
    var squad = { name: 'Расчёт ампуломёта АМ-1', baseMorale: 5, currentMorale: 5 };
  `);
  s.run('tacticalNormalizeNewSquadMorale(squad);');
  assert.equal(s.evalCtx('squad.tacticalMoraleScaleVersion'), 1);
  assert.equal(s.evalCtx('squad.baseMorale'), 100);
  assert.equal(s.evalCtx('squad.tacticalMoraleMax'), 100);
  assert.equal(s.evalCtx('squad.currentMorale'), 100);
});

test('п.1: повторная нормализация не трогает отряд на шкале 0–100', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'tacticalNormalizeMoraleScale'));
  s.run(sliceFunction(HTML, 'tacticalNormalizeNewSquadMorale'));
  s.run(`
    var squad = { name: 'Снайперское звено OIP №1', baseMorale: 100, currentMorale: 47, tacticalMoraleScaleVersion: 1 };
  `);
  s.run('tacticalNormalizeNewSquadMorale(squad);');
  assert.equal(s.evalCtx('squad.currentMorale'), 47);
});

test('п.1: миграция снайперов/расчётов больше не откатывает шкалу к 5/5', () => {
  const start = HTML.indexOf('(function migrateSniperAndMortarMorale()');
  assert.ok(start > 0, 'миграция есть');
  const end = HTML.indexOf('})();', start);
  const block = HTML.slice(start, end);
  assert.ok(block.includes('s.tacticalMoraleLegacyScale = 5;'), 'legacyScale=5 фиксируется для старых модификаторов');
  assert.ok(block.includes('if (Number(s.tacticalMoraleScaleVersion) !== 1)'), 'конверсия только для неконвертированных');
  assert.ok(!block.includes('s.tacticalMoraleMax = 5;'), 'принудительное tacticalMoraleMax=5 удалено');
  assert.ok(!block.includes('s.baseMorale = 5;'), 'принудительное baseMorale=5 удалено');
  assert.ok(HTML.includes('(function normalizeAllLegacyMoraleScales()'), 'универсальная миграция шкалы 0–100 есть');
});

test('п.1: миграция переводит 5/5 в 100/100 и не трогает уже нормализованные', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'tacticalNormalizeMoraleScale'));
  const start = HTML.indexOf('(function migrateSniperAndMortarMorale()');
  const end = HTML.indexOf('})();', start) + '})();'.length;
  s.run(`
    appData.squads = [
      { name: 'Расчёт бутылкомёта Цукермана', baseMorale: 5, currentMorale: 5, crewInstances: [{ weaponName: 'Бутылкомёт Цукермана', fighterIndices: [0] }], fighters: [{ hp: 3 }, { hp: 3 }] },
      { name: 'Пехотное отделение', baseMorale: 100, currentMorale: 61, tacticalMoraleScaleVersion: 1, fighters: [{ hp: 3 }] }
    ];
  `);
  s.run(HTML.slice(start, end));
  assert.equal(s.evalCtx('appData.squads[0].tacticalMoraleScaleVersion'), 1);
  assert.equal(s.evalCtx('appData.squads[0].currentMorale'), 100);
  assert.equal(s.evalCtx('appData.squads[0].tacticalMoraleLegacyScale'), 5);
  assert.equal(s.evalCtx('appData.squads[1].currentMorale'), 61);
});

// ───────────────────────── П.2: наследование командования ─────────────────────────
test('п.2: командование — штаб батальона, затем штаб роты №1 → №2 → №3', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'isHQUnitDown'));
  s.run(sliceFunction(HTML, 'getCommandingHQUnit'));
  s.run(`
    appData.campaign.opUnits = [
      { name: 'Штаб Батальона', type: 'battalion_hq', squads: [{ fighters: [{ hp: 3 }] }] },
      { name: 'Штаб роты №2', type: 'company_hq', squads: [{ fighters: [{ hp: 3 }] }] },
      { name: 'Штаб роты №1', type: 'company_hq', squads: [{ fighters: [{ hp: 3 }] }] },
      { name: 'Штаб роты №3', type: 'company_hq', squads: [{ fighters: [{ hp: 3 }] }] }
    ];
  `);
  assert.equal(s.evalCtx('getCommandingHQUnit().name'), 'Штаб Батальона');
  s.run('appData.campaign.opUnits[0].isDestroyed = true;');
  assert.equal(s.evalCtx('getCommandingHQUnit().name'), 'Штаб роты №1', 'первыми командует штаб роты №1');
  s.run('appData.campaign.opUnits[2].isDestroyed = true;');
  assert.equal(s.evalCtx('getCommandingHQUnit().name'), 'Штаб роты №2', 'затем №2 (не по порядку массива, а по номеру)');
  s.run('appData.campaign.opUnits[1].isDestroyed = true;');
  assert.equal(s.evalCtx('getCommandingHQUnit().name'), 'Штаб роты №3');
  s.run('appData.campaign.opUnits[3].isSurrendered = true;');
  assert.equal(s.evalCtx('getCommandingHQUnit()'), null, 'некому командовать');
});

test('п.2: при передаче командования рация — только при рациях у обоих; телефоны мертвы', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'isHQUnitDown'));
  s.run(sliceFunction(HTML, 'getCommandingHQUnit'));
  s.run(sliceFunction(HTML, 'checkCommunication'));
  s.run(`
    var radioHas = { 'Штаб роты №1': true, 'Взвод А': true, 'Взвод Б': false, 'Штаб Батальона': true };
    function hasRadio(u) { return !!radioHas[u.name]; }
    function isInRadioRange() { return true; }
    function hasPhoneLine() { return true; } // линия физически цела — но штаба батальона нет
    appData.campaign.opUnits = [
      { name: 'Штаб Батальона', type: 'battalion_hq', isDestroyed: true },
      { name: 'Штаб роты №1', type: 'company_hq' },
      { name: 'Взвод А', type: 'infantry_platoon' },
      { name: 'Взвод Б', type: 'infantry_platoon' }
    ];
    var cmd = appData.campaign.opUnits[1], a = appData.campaign.opUnits[2], b = appData.campaign.opUnits[3];
    var hq = appData.campaign.opUnits[0];
  `);
  assert.equal(s.evalCtx('checkCommunication(cmd, a)'), 'radio', 'рации у обоих — по радио');
  assert.equal(s.evalCtx('checkCommunication(cmd, b)'), 'messenger', 'у получателя нет рации — посыльный');
  assert.equal(s.evalCtx('checkCommunication(a, b)'), 'messenger', 'телефон между юнитами при передаче командования мёртв');
  s.run('appData.campaign.opUnits[0].isDestroyed = false;');
  assert.equal(s.evalCtx('checkCommunication(hq, b)'), 'phone', 'пока штаб батальона цел — телефоны работают как раньше');
});

test('п.2: реле через штаб роты и приказы переведены на командующий штаб', () => {
  const relayStart = HTML.indexOf('function getRelayCompanyForOrder');
  const relayEnd = HTML.indexOf('\nfunction rememberUiScreen', relayStart);
  const relay = HTML.slice(relayStart, relayEnd);
  assert.ok(relay.includes('commandSuccessionActive()'), 'getRelayCompanyForOrder отключается при наследовании');
  assert.ok(HTML.includes("let hqUnit = (typeof getCommandingHQUnit === 'function') ? getCommandingHQUnit() : null;"),
    'submitOrder берёт командующий штаб');
  assert.ok(HTML.includes("const senderIdx = (typeof commandSuccessionActive === 'function' && commandSuccessionActive() &&"),
    'executeCompanyOrder: посыльные из пула командующего штаба');
  assert.ok(HTML.includes('if (cmd) { sender = cmd; order.fromUnitId = appData.campaign.opUnits.indexOf(cmd); }'),
    'dispatchQueuedOrders: очередь несёт командующий штаб');
  assert.ok(HTML.includes("📻 Командует:"), 'панель приказов показывает, кто командует');
  assert.ok(HTML.includes("Командование перешло"), 'смена командования объявляется в логе');
});

// ───────────────────────── П.3: нет «дистанционных» боёв ─────────────────────────
test('п.3: тактический бой не начинается «дистанционно»', () => {
  const battleStart = HTML.indexOf('function startTacticalBattle(playerUnits, enemyUnits, opts)');
  const battleEnd = HTML.indexOf('\nfunction ', battleStart + 10);
  const battleFn = HTML.slice(battleStart, battleEnd);
  // якорь боя и фильтр юнитов по гексу (v13.057/v13.120 — не откатывать)
  assert.ok(battleFn.includes('const battleAnchor = getTacticalBattleAnchor(playerUnits, enemyUnits, requestedBattleHex);'),
    'бой требует общий оперативный гекс');
  assert.ok(battleFn.includes('playerUnits = playerUnits.filter(u => unitBelongsToHex(u, battleAnchor.col, battleAnchor.row));'),
    'юниты фильтруются по гексу боя');
  // v13.133: юнит, вошедший через закреплённый ДОТ с другого гекса, не тащит
  // за собой «дистанционные» отряды — в бою остаётся только закреплённый расчёт
  assert.ok(battleFn.includes('const squadOnAnchorSquad = (s) => {'), 'фильтр отрядов по гексу при сборе');
  assert.ok(battleFn.includes('if (!squadOnAnchorSquad(s)) return;'), 'дистанционные отряды не попадают в состав боя');
  assert.ok(battleFn.includes('if (!unitOnAnchorHex) return;'), 'группа техники с другого гекса не участвует');
  // после всех фильтров пустая сторона = отказ (вместо фиктивных «минимальных» отрядов)
  assert.ok(battleFn.includes('бой не может начаться «дистанционно»'), 'отказ при пустой стороне');
  assert.ok(battleFn.includes('if (playerSquads.length === 0 || enemySquads.length === 0) {'), 'сторона без отрядов проверяется');
  // десант в БТР считается находящимся вместе со своей машиной
  assert.ok(battleFn.includes('u.embarkedInBtr ||'), 'десант в БТР не отсекается фильтром гекса');
});

// ───────────────────────── П.4: журнал событий боя ─────────────────────────
test('п.4: события пишутся в журнал КОНКРЕТНОГО тактического боя', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'appendBattleEventLog'));
  s.run(`
    appData.currentBattleId = 5;
    appData.campaign.activeBattles = [{ id: 5, currentTurn: 3, eventLog: [] }, { id: 7, currentTurn: 9, eventLog: [] }];
  `);
  s.run('appendBattleEventLog("💥 Огонь по цели");');
  assert.equal(s.evalCtx('appData.campaign.activeBattles[0].eventLog.length'), 1);
  assert.equal(s.evalCtx('appData.campaign.activeBattles[0].eventLog[0].turn'), 3);
  assert.equal(s.evalCtx('appData.campaign.activeBattles[0].eventLog[0].text'), '💥 Огонь по цели');
  assert.equal(s.evalCtx('appData.campaign.activeBattles[1].eventLog.length'), 0, 'чужой бой не пишется');
  s.run('appData.currentBattleId = 404;');
  s.run('appendBattleEventLog("шум");');
  assert.equal(s.evalCtx('appData.campaign.activeBattles[0].eventLog.length'), 1, 'без активного боя — тишина');
});

test('п.4: журнал ограничен 600 записями', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'appendBattleEventLog'));
  s.run(`
    appData.currentBattleId = 1;
    appData.campaign.activeBattles = [{ id: 1, currentTurn: 2, eventLog: [] }];
    for (var i = 0; i < 610; i++) appendBattleEventLog('событие ' + i);
  `);
  assert.equal(s.evalCtx('appData.campaign.activeBattles[0].eventLog.length'), 600);
  assert.equal(s.evalCtx("appData.campaign.activeBattles[0].eventLog[599].text"), 'событие 609');
});

test('п.4: панель журнала открывается и показывает события боя', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'appendBattleEventLog'));
  s.run(sliceFunction(HTML, 'renderBattleEventLog'));
  s.run(sliceFunction(HTML, 'toggleBattleEventLog'));
  s.run(`
    var __panels = {};
    document.getElementById = function (id) {
      if (!__panels[id]) __panels[id] = {
        id: id, innerHTML: '', textContent: '', style: {}, scrollTop: 0, scrollHeight: 0,
        attrs: {}, children: [],
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return this.attrs[k]; },
        appendChild(c) { this.children.push(c); },
        classList: { add() {}, remove() {}, contains() { return false; } }
      };
      return __panels[id];
    };
    appData.currentBattleId = 2;
    appData.campaign.activeBattles = [{ id: 2, currentTurn: 4, eventLog: [
      { turn: 4, text: '⚔️ Тактический бой начат' }, { turn: 4, text: '💥 Ответный огонь' }
    ] }];
  `);
  s.run('toggleBattleEventLog(true);');
  assert.equal(s.evalCtx("document.getElementById('battleEventLogPanel').style.display"), 'block');
  assert.equal(s.evalCtx("document.getElementById('battleEventLogList').getAttribute('data-battle-id')"), '2');
  assert.ok(s.evalCtx("document.getElementById('battleEventLogList').innerHTML").includes('Ответный огонь'),
    'события видны в панели');
  s.run('toggleBattleEventLog();');
  assert.equal(s.evalCtx("document.getElementById('battleEventLogPanel').style.display"), 'none');
});

console.log(`\nv13.133 command succession / card morale / battle log: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.error('FAILURES:\n' + failures.join('\n')); process.exit(1); }
