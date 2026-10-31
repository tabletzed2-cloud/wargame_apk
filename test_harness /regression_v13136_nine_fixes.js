'use strict';
// ⚡ v13.136: девять правок после playtest'а.
//   1. Лимит карточного драфта в toggleBattleCardSelection — через cardDraftBonusLimit (2/3/4).
//   2. «Шахтерский динамит» — дебафф (type negative), без +1 к урону гранат.
//   3. Переход на этап связи автоматически раскрывает панель связи.
//   4. Отдельное меню размещения (#battlePlacementTray) с перетаскиванием отрядов.
//   5. Дух после размещения не «0/100»: null-безопасность + защита от устаревшей
//      глобали morale + шкала 0–100 не откатывается в «по числу бойцов».
//   6. ДОТ держится до конца — не отступает и не сдаётся от потери духа.
//   7. Отряд с нулевым духом отходит к своему штабу и ОСТАЁТСЯ в бою
//      (не исчезает с карты; перекрытый путь — не мгновенная сдача).
//   8. Огнемёт РОКС-3 получает заряды при выдаче (нет «Нет зарядов» на новом).
//   9. «Спешиться»/«Сесть» — только велосипедистам (не мотоциклистам и прочим).
const assert = require('assert');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML } = require('./extract');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + ': ' + e.message); process.exitCode = 1; }
}

// ---------- п.1: лимит драфта в toggleBattleCardSelection ----------
ok('п.1 toggleBattleCardSelection использует cardDraftBonusLimit (2/3/4)', () => {
  assert.ok(/const limit = cardDraftBonusLimit\(selectedNames\);/.test(HTML),
    'toggleBattleCardSelection должен считать лимит через cardDraftBonusLimit');
  assert.ok(!/willHaveTradeSpirit \|\| willHaveCommissioner\) \? 4 : 3/.test(HTML),
    'старый литерал 3/4 должен быть удалён');
});

ok('п.1 cardDraftBonusLimit: база 2, Комиссар 3, Торговый дух 4', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'hasCardNamed'));
  s.run(sliceFunction(HTML, 'cardDraftBonusLimit'));
  assert.strictEqual(s.evalCtx(`cardDraftBonusLimit(['Пехотный взвод'])`), 2);
  assert.strictEqual(s.evalCtx(`cardDraftBonusLimit(['Комиссар'])`), 3);
  assert.strictEqual(s.evalCtx(`cardDraftBonusLimit(['Торговый дух'])`), 4);
  assert.strictEqual(s.evalCtx(`cardDraftBonusLimit(['Комиссар','Торговый дух'])`), 5, 'стек: Комиссар +1 и Торговый дух +2 к базе 2');
});

// ---------- п.2: Шахтерский динамит ----------
ok('п.2 динамит — type negative, без +1 к урону', () => {
  const cards = fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8');
  const m = cards.match(/\{ "name": "Шахтерский динамит"[^}]*\}/);
  assert.ok(m, 'карта есть в библиотеке');
  assert.ok(/"type": "negative"/.test(m[0]), 'карта должна быть штрафной (negative)');
  assert.ok(!/d6\+1/.test(m[0]), 'в описании не должно быть d6+1');
  assert.ok(/damageBonus: 0/.test(HTML), 'damageBonus должен быть 0');
  assert.ok(!/dmg = rollD6\(\) \+ 1;/.test(HTML), 'бонусный +1 к урону гранат должен быть удалён');
});

// ---------- п.3: панель связи открывается автоматически ----------
ok('п.3 вход на этап связи раскрывает панель связи', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
  assert.ok(/if \(stage === 'communications'\) state\.commCollapsed = false;/.test(ui),
    'setStage должен раскрывать панель на этапе communications');
  assert.ok(/if \(c\.opSetupStage === 'communications'\) state\.commCollapsed = false;/.test(ui),
    'setInitialStage тоже раскрывает панель при восстановлении сейва');
});

// ---------- п.4: отдельное меню размещения ----------
ok('п.4 #battlePlacementTray — отдельное меню с drag&drop', () => {
  assert.ok(/id="battlePlacementTray"/.test(HTML), 'контейнер меню есть в index.html');
  const pj = fs.readFileSync(path.join(ROOT, 'js/placement.js'), 'utf8');
  assert.ok(/getElementById\('battlePlacementTray'\)/.test(pj), 'трей рендерится в отдельный контейнер');
  assert.ok(/data-battle-place-unit/.test(pj), 'фишки перетаскивания сохранены');
});

ok('п.4 placementTrayUnplacedSquads: фоллбэк на battle.playerSquads', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/placement.js'), 'utf8');
  assert.ok(/const source = \(Array\.isArray\(appData\.squads\) && appData\.squads\.length\)/.test(src),
    'источник отрядов — с фоллбэком на battle.playerSquads');
  const s = createSandbox(freshAppData());
  s.run('function placementBattleGrid(b) { return {}; }');
  s.run(sliceFunction(src, 'placementTrayUnplacedSquads'));
  s.run(`
    appData.squads = [];
    var battle = { playerSquads: [
      { name: 'О1', fighters: [{ hp: 3 }] },
      { name: 'О2', fighters: [{ hp: 0 }] }
    ] };
  `);
  const res = s.evalCtx('placementTrayUnplacedSquads(battle).map(x => x.s.name).join(",")');
  assert.strictEqual(res, 'О1', 'в кампании без appData.squads берутся playerSquads');
});

// ---------- п.5: мораль не «0/100» ----------
ok('п.5 tacticalMoraleCurrent: null/undefined → 100, а не 0', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'tacticalNormalizeMoraleScale'));
  s.run(sliceFunction(HTML, 'tacticalMoraleScale'));
  s.run(sliceFunction(HTML, 'tacticalMoraleCurrent'));
  s.run('var currentSquad = null; var morale = 0;');
  assert.strictEqual(s.evalCtx('tacticalMoraleCurrent({ currentMorale: null, baseMorale: 10 })'), 100);
  assert.strictEqual(s.evalCtx('tacticalMoraleCurrent({ currentMorale: undefined })'), 100);
  assert.strictEqual(s.evalCtx('tacticalMoraleCurrent({ currentMorale: "", baseMorale: 5 })'), 100);
  assert.strictEqual(s.evalCtx('tacticalMoraleCurrent({ currentMorale: 47, tacticalMoraleScaleVersion: 1 })'), 47);
});

ok('п.5 tacticalNormalizeMoraleScale: null → 100 (Number(null) не даёт 0)', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'tacticalNormalizeMoraleScale'));
  s.run('var currentSquad = null; var morale = 0;');
  s.run('var sqN = { currentMorale: null, baseMorale: 12 };');
  assert.strictEqual(s.evalCtx('tacticalNormalizeMoraleScale(sqN)'), 100);
  assert.strictEqual(s.evalCtx('sqN.currentMorale'), 100, 'null не должен сворачиваться в 0');
});

ok('п.5 tacticalInitializeSquadMorale: дух взвода — число, старт не ниже 25', () => {
  const s = createSandbox(freshAppData());
  for (const fn of ['tacticalFindOperationalMoraleOwner', 'tacticalMarkStartingMoraleCasualties',
    'tacticalIsSniperOrMortarSquad', 'isArmoredTacticalSquad', 'tacticalInitializeSquadMorale']) {
    s.run(sliceFunction(HTML, fn));
  }
  s.run('var ARMOR_TACTICAL_MORALE = 14; var currentSquad = null; var morale = 0;');
  const sq = { name: 'О1', opUnitName: 'ПВ1', fighters: [{ hp: 5 }] };
  const sq2 = { name: 'О2', opUnitName: 'ПВ2', fighters: [{ hp: 5 }] };
  const sq3 = { name: 'О3', opUnitName: 'ПВ3', fighters: [{ hp: 5 }] };
  s.run(`
    appData.campaign.opUnits = [
      { name: 'ПВ1', operationalMorale: 0 },
      { name: 'ПВ2', operationalMorale: null },
      { name: 'ПВ3', operationalMorale: 80 }
    ];
    var sq1 = ${JSON.stringify(sq)};
    var sq2 = ${JSON.stringify(sq2)};
    var sq3 = ${JSON.stringify(sq3)};
    tacticalInitializeSquadMorale(sq1, 'b');
    tacticalInitializeSquadMorale(sq2, 'b');
    tacticalInitializeSquadMorale(sq3, 'b');
  `);
  assert.strictEqual(s.evalCtx('sq1.currentMorale'), 25, 'дух 0 у взвода → стартовый пол 25');
  assert.strictEqual(s.evalCtx('sq2.currentMorale'), 100, 'null у взвода → 100 (не 0)');
  assert.strictEqual(s.evalCtx('sq3.currentMorale'), 80);
});

ok('п.5 normalizeSquadForBattle не откатывает шкалу 0–100 в «по числу бойцов»', () => {
  assert.ok(/else if \(Number\(s\.tacticalMoraleScaleVersion\) === 1\)/.test(HTML),
    'ветка сохранения шкалы 0–100 должна существовать');
});

ok('п.5 selectSquad: запись morale обратно только из источника (moraleSourceIdx)', () => {
  assert.ok(/currentSquadIndex === moraleSourceIdx/.test(HTML),
    'глобаль morale не должна затирать чужие отряды');
  assert.ok(/let moraleSourceIdx =/.test(HTML), 'moraleSourceIdx объявлен');
});

// ---------- п.6: ДОТ держится ----------
ok('п.6 ДОТ не роутится и не сдаётся от потери духа', () => {
  const s = createSandbox(freshAppData());
  for (const fn of ['tacticalIsDotSquad', 'tacticalIsHeadquartersSquad', 'tacticalStubbornAtStartingHex',
    'tacticalSquadHasStubbornCard', 'tacticalMoraleIsCritical', 'tacticalMoraleIsSuppressed',
    'tacticalNormalizeMoraleScale', 'tacticalMoraleScale', 'tacticalMoraleCurrent',
    'tacticalRecordNearbyMoraleLoss', 'tacticalMaybeAutoRetreat']) {
    try { s.run(sliceFunction(HTML, fn)); } catch (e) { /* опциональные */ }
  }
  s.run('var currentSquad = null; var morale = 0;');
  const dot = { name: 'ДОТ Van Hees', currentMorale: 0, fighters: [{ hp: 5 }], isRouting: true, retreatReason: 'morale' };
  s.run(`var dot = ${JSON.stringify(dot)};`);
  const res = s.evalCtx('tacticalMaybeAutoRetreat(dot, "player", 0)');
  assert.strictEqual(res, false);
  assert.strictEqual(s.evalCtx('dot.isRouting'), false, 'ДОТ не должен роутиться');
});

// ---------- п.7: отход к штабу, без исчезновений ----------
ok('п.7 tacticalRoutRallyAtHQ: отряд остаётся в бою и приходит в себя', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'tacticalNormalizeMoraleScale'));
  s.run(sliceFunction(HTML, 'tacticalMoraleScale'));
  s.run(sliceFunction(HTML, 'tacticalRoutRallyAtHQ'));
  s.run('var currentSquad = null; var morale = 0; function log() {}');
  s.run(`var sq = { name: 'О', currentMorale: 5, tacticalMoraleScaleVersion: 1, isRouting: true,
    retreatReason: 'morale', suppressed: true, tacticalRetreatDestination: 'headquarters' };`);
  s.run('tacticalRoutRallyAtHQ(sq, "player", 0);');
  assert.strictEqual(s.evalCtx('sq.isRouting'), false);
  assert.strictEqual(s.evalCtx('sq.retreatReason'), undefined, 'причина отхода снята');
  assert.strictEqual(s.evalCtx('sq.suppressed'), false);
  assert.ok(s.evalCtx('sq.currentMorale') >= 50, 'дух восстановлен минимум до половины');
});

ok('п.7 processTacticalRouts: отход к штабу сохранён; v13.137 (п.2) — цель и край карты', () => {
  assert.ok(/tacticalRoutRallyAtHQ/.test(HTML), 'механика ралли у штаба используется');
  assert.ok(/if \(!stubborn\) retreatEdges\.forEach/.test(HTML),
    'край карты — цель отхода и по духу (v13.137 п.2)');
  assert.ok(/Штаба своего взвода в бою нет — отходим к ближайшему живому штабу/.test(HTML),
    'фоллбэк на любой живой штаб');
  assert.ok(!/путь сейчас перекрыт — отряд остаётся на месте/.test(HTML),
    'правило «ждать при перекрытом пути» заменено сдачей с маркером (v13.137 п.2)');
  assert.ok(/if \(!destination\) \{[\s\S]{0,240}?tacticalSurrenderUnit\(s, side, idx, 'retreat_blocked'\)/.test(HTML),
    'перекрытый путь к отходу -> отряд сдаётся (v13.137 п.2)');
});

// ---------- п.8: РОКС ----------
ok('п.8 РОКС-3: заряды создаются при выдаче огнемёта', () => {
  const idx = HTML.indexOf("} else if (card.name === 'Ранцевый огнемёт РОКС-3') {");
  assert.ok(idx > 0, 'ветка карты РОКС найдена');
  const branch = HTML.slice(idx, idx + 1200);
  assert.ok(/s\.effects\.flamethrower = \{ charges: 3 \};/.test(branch),
    'в кампанийном пути заряды выдаются сразу (иначе «Нет зарядов»)');
  assert.ok(/if \(!s\.effects\.flamethrower\) \{[\s\S]*?s\.effects\.flamethrower = \{ charges: 3 \};[\s\S]*?\} else \{[\s\S]*?charges = 3;/.test(branch),
    'оба пути (новый/повторный) выдают заряды');
});

// ---------- п.9: спешивание (v13.137 (п.1): велосипед И мотоцикл; не пехота) ----------
ok('п.9 uxBikeLike: велосипед и мотоцикл (не пехота/техника)', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'uxBikeLike'));
  assert.strictEqual(s.evalCtx('uxBikeLike({ mobility: "bicycle" })'), true);
  assert.strictEqual(s.evalCtx('uxBikeLike({ mobility: "motorcycle" })'), true, 'мотоциклы спешиваются (v13.137)');
  assert.strictEqual(s.evalCtx('uxBikeLike({ mobility: "foot" })'), false);
  assert.strictEqual(s.evalCtx('uxBikeLike({ mobility: "vehicle" })'), false);
});

ok('п.9 canIssueSpecial: dismount/remount велосипедистам и мотоциклам', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
  assert.ok(/if \(action === 'dismount'\) return \(unit\.mobility === 'bicycle' \|\| unit\.mobility === 'motorcycle'\) && !unit\.dismounted;/.test(ui),
    'dismount — велосипедист/мотоциклист верхом');
  assert.ok(/if \(action === 'remount'\) return !!unit\.dismounted && \(unit\.dismountedFromMobility === 'bicycle' \|\| unit\.dismountedFromMobility === 'motorcycle' \|\| unit\.mobility === 'bicycle' \|\| unit\.mobility === 'motorcycle'\);/.test(ui),
    'remount — спешенный велосипедист/мотоциклист');
});

ok('п.9 unitCanExecuteOrderType: dismount/remount для велосипеда и мотоцикла', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'unitCanExecuteOrderType'));
  s.run(`var uBike = { mobility: 'bicycle', dismounted: false };
         var uDism = { mobility: 'foot', dismounted: true, dismountedFromMobility: 'bicycle' };
         var uMoto = { mobility: 'motorcycle', dismounted: false };
         var uMotoDism = { mobility: 'foot', dismounted: true, dismountedFromMobility: 'motorcycle' };
         var uFoot = { mobility: 'foot', dismounted: false };`);
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uBike, 'dismount')"), true);
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uMoto, 'dismount')"), true, 'мотоцикл спешивается (v13.137)');
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uDism, 'remount')"), true, 'спешенный велосипедист может сесть');
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uMotoDism, 'remount')"), true, 'спешенный мотоциклист может сесть');
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uFoot, 'dismount')"), false, 'пехота не спешивается');
  assert.strictEqual(s.evalCtx("unitCanExecuteOrderType(uFoot, 'remount')"), false);
});

ok('п.9 toggleDismount: отказ только не-спешиваемым (пехота)', () => {
  assert.ok(/Спешивание доступно только велосипедистам и мотоциклистам/.test(HTML), 'сообщение об отказе есть');
});

// ---------- маркеры версии ----------
ok('маркеры версии синхронизированы на v13.137', () => {
  const files = [ROOT + '/index.html', ROOT + '/js/cards.js', ROOT + '/js/data.js', ROOT + '/js/hexmaps.js',
    ROOT + '/js/map_actions.js', ROOT + '/js/online_battles.js', ROOT + '/js/operational_ui.js',
    ROOT + '/js/placement.js', ROOT + '/js/templates.js', ROOT + '/js/weapons.js',
    ROOT + '/service-worker.js', ROOT + '/manifest.json'];
  files.forEach(f => {
    const txt = fs.readFileSync(f, 'utf8');
    assert.ok(!/v13\.135/.test(txt), path.basename(f) + ' не должен содержать v13.135');
    assert.ok(/v13\.137/.test(txt), path.basename(f) + ' должен содержать v13.137');
  });
});

console.log(`\n${passed} проверок пройдено${process.exitCode ? ' (ЕСТЬ ПАДЕНИЯ)' : ''}`);
if (!process.exitCode) console.log('v13.136 (девять правок playtest) regression: PASS');
else console.log('v13.136 (девять правок playtest) regression: FAIL');
