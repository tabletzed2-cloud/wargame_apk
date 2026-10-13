// Регрессия пользовательских исправлений тактической карты и снабжения.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData, setRandom, sliceFunction } = require('./sandbox');
const { HTML, ROOT } = require('./extract');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.log(`✗ ${name} — ${e.message}`); }
}
function assert(cond, message) { if (!cond) throw new Error(message || 'утверждение не выполнено'); }
function equal(actual, expected, message) {
  assert(actual === expected, `${message || 'равенство'}: получили ${JSON.stringify(actual)}, ждали ${JSON.stringify(expected)}`);
}
function includes(actual, expected, message) {
  assert(String(actual).includes(expected), `${message || 'строка'}: не найдено ${JSON.stringify(expected)} в ${JSON.stringify(actual)}`);
}
function excludes(actual, expected, message) {
  assert(!String(actual).includes(expected), `${message || 'строка'}: неожиданно найдено ${JSON.stringify(expected)} в ${JSON.stringify(actual)}`);
}
function loadHtml(s, names) { names.forEach(name => s.run(sliceFunction(HTML, name))); }
function loadModule(s, filename) { s.run(fs.readFileSync(path.join(ROOT, filename), 'utf8')); }
function loadModuleFunctions(s, filename, names) {
  const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  names.forEach(name => s.run(sliceFunction(source, name)));
}

// 1. Третья бонусная карта добавляет один фракционный дебафф; каталог противника исключён.
test('три бонусные карты дают один авто-дебафф только из пула фракции игрока', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['collectCardLibraryForContext', 'getFactionScopedCardEntries', 'getRandomNegativeCardForUnit', 'getUnitCardFactionContext', 'activateSelectedCards']);
  s.run(`
    function computeSubFactionFromSquads() { return null; }
    function isCardAvailableToUnit() { return true; }
    function getCurrentCampaignBattle() { return null; }
    function getBattleCardContext() { return { faction: 'A.I.R.F.', subFaction: null }; }
    function renderActiveEffects() {}
    var airfCards = [
      { name: 'AIRF bonus 1', type: 'bonus' }, { name: 'AIRF bonus 2', type: 'bonus' },
      { name: 'AIRF bonus 3', type: 'bonus' },
      { name: 'AIRF penalty', type: 'negative', subfaction: 'common' }
    ];
    var beveCards = [
      { name: 'BeVe-only penalty', type: 'negative', subfaction: 'common' },
      { name: 'BeVe-only global copy', type: 'negative', subfaction: 'common' }
    ];
    appData.factions = {
      'A.I.R.F.': { cardLibrary: airfCards },
      'BeVe': { cardLibrary: beveCards },
      '_global': { cardLibrary: [
        { name: 'BeVe-only global copy', type: 'negative', subfaction: 'common' },
        { name: 'Shared common penalty', type: 'negative', subfaction: 'common' }
      ] }
    };
    var entries = collectCardLibraryForContext({ faction: 'A.I.R.F.', subFaction: null });
    var scopedEntries = getFactionScopedCardEntries({ faction: 'A.I.R.F.', subFaction: null });
    var testUnit = { name: 'AIRF platoon', squads: [{ faction: 'A.I.R.F.' }] };
    var automaticCandidates = [getRandomNegativeCardForUnit(testUnit, [], []), getRandomNegativeCardForUnit(testUnit, [], [])]
      .map(item => item && item.card.name);

    appData.squads = [];
    appData.activeCards = [];
    var selectedCardDivs = airfCards.filter(c => c.type === 'bonus').map(c => ({
      dataset: { faction: 'A.I.R.F.', name: c.name }, classList: { remove() {} }
    }));
    document.querySelectorAll = function (selector) { return selector === '.card-item.selected' ? selectedCardDivs : []; };
    activateSelectedCards();
    var automaticAssigned = appData.activeCards.filter(c => c.type === 'negative').map(c => c.name);
  `);
  const shown = s.evalCtx(`JSON.stringify(entries.map(c => [c.name, c.faction]))`);
  const scoped = JSON.parse(s.evalCtx(`JSON.stringify(scopedEntries.map(x => [x.card.name, x.faction]))`));
  const autoCandidates = JSON.parse(s.evalCtx('JSON.stringify(automaticCandidates)'));
  const autoAssigned = JSON.parse(s.evalCtx('JSON.stringify(automaticAssigned)'));
  includes(shown, 'A.I.R.F.', 'в списке есть карты выбранной фракции');
  includes(shown, 'Shared common penalty', 'доступная общая карта сохраняется');
  excludes(shown, 'BeVe-only', 'в списке нет карт фракции противника');
  assert(!scoped.some(([name]) => name.startsWith('BeVe-only')), 'фракционный пул авто-дебаффов не содержит BeVe');
  assert(autoCandidates.every(name => ['AIRF penalty', 'Shared common penalty'].includes(name)), 'случайный дебафф выбирается только из пула игрока');
  equal(autoAssigned.length, 1, 'три бонуса добавляют один автоматический дебафф');
  assert(['AIRF penalty', 'Shared common penalty'].includes(autoAssigned[0]), 'автоматический дебафф взят из библиотеки игрока или общего пула, не противника');
});

// 2. Закреплённая кнопка завершения хода находится рядом с часами кампании.
test('кнопка «Завершить ход» закреплена вместе с часами операционной карты', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css/operational_ui.css'), 'utf8');
  includes(html, 'id="opEndTurnBtn" onclick="endOperationalTurn()"', 'кнопка находится в разметке операционной карты');
  includes(html, 'id="opTimeDisplay"', 'есть контейнер часов кампании');
  includes(css, '#opTimeDisplay {\n  position: sticky;', 'табло времени закреплено при прокрутке');
  includes(css, 'top: 0;', 'табло прилипает к верхнему краю');
});

// 3. Время приказа остаётся пустым без ввода и принимается только кратным 10 минутам.
test('время приказа необязательно и ограничено шагом 10 минут', () => {
  const source = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
  const s = createSandbox(freshAppData());
  loadModuleFunctions(s, 'js/operational_ui.js', ['parseMinuteInput', 'timeField', 'operationalWeaponRange', 'parseDraftOptions']);
  loadHtml(s, ['parseOperationalOrderTime']);
  s.run(`
    function esc(value) { return String(value == null ? '' : value); }
    var defaultOptions = parseDraftOptions({ category: 'fire_at_will', time: '', behavior: 'hold' }, { col: 1, row: 2 });
    var manualOptions = parseDraftOptions({ category: 'fire_at_will', time: '08:20', behavior: 'hold' }, { col: 1, row: 2 });
    var offStepError = '';
    try { parseDraftOptions({ category: 'fire_at_will', time: '08:25' }, { col: 1, row: 2 }); }
    catch (e) { offStepError = e.message; }
    var blankField = timeField(undefined);
  `);
  equal(s.evalCtx(`parseMinuteInput('')`), null, 'пустое время не заменяется текущим');
  equal(s.evalCtx(`parseMinuteInput('08:20')`), 500, 'ручное время превращается в минуты');
  equal(s.evalCtx(`parseMinuteInput('08:25')`), null, 'неверный шаг отвергается');
  equal(s.evalCtx(`parseMinuteInput('24:00')`), null, 'время за пределами суток отвергается');
  equal(s.evalCtx('defaultOptions.options.startTimeMin'), null, 'приказ без времени не привязан к часам');
  equal(s.evalCtx('manualOptions.options.startTimeMin'), 500, 'вручную выбранное время сохраняется');
  includes(s.evalCtx('offStepError'), 'шагом 10 минут', 'ошибка объясняет допустимый шаг');
  includes(s.evalCtx('blankField'), 'value=""', 'поле времени по умолчанию пустое');
  includes(s.evalCtx('blankField'), 'step="600"', 'HTML-поле времени использует 10-минутный шаг');
  equal(s.evalCtx(`parseOperationalOrderTime('')`), null, 'старая форма приказа также поддерживает отсутствие времени');
  assert(Number.isNaN(s.evalCtx(`parseOperationalOrderTime('08:25')`)), 'старая форма отвергает время вне шага');
  includes(source, "time: '', waypoints: []", 'новый приказ создаётся с пустым временем');
});

// 4. Термитный заряд достаётся двум живым сапёрным отделениям AIRF.
test('термитный заряд выдаётся двум сапёрным отделениям AIRF', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['isAirfSapperSquad', 'applyCardToPlatoon', 'getCardTargetSpec']);
  s.run(`
    function addAppliedCardName() {}
    var sappers = [
      { name: 'Саперное отделение 1', faction: 'A.I.R.F.', fighters: [{ hp: 3 }] },
      { name: 'Сапёрное отделение 2', faction: 'A.I.R.F.', fighters: [{ hp: 3 }] },
      { name: 'Саперное отделение 3', faction: 'A.I.R.F.', fighters: [{ hp: 3 }] },
      { name: 'Саперное отделение BeVe', faction: 'BeVe', fighters: [{ hp: 3 }] }
    ];
    var unit = { name: 'Взвод AIRF', squads: sappers };
    applyCardToPlatoon({ name: 'Термитный заряд' }, 'A.I.R.F.', unit, sappers, [], {});
    var targetSpec = getCardTargetSpec('Термитный заряд');
    var cardDesc = AIRF_CARDS.find(c => c.name === 'Термитный заряд').desc;
  `);
  equal(s.evalCtx('targetSpec.count'), 2, 'карта требует две цели');
  equal(s.evalCtx('sappers[0].thermiteCharges'), 3, 'первый сапёр получает три заряда');
  equal(s.evalCtx('sappers[1].thermiteCharges'), 3, 'второй сапёр получает три заряда');
  equal(s.evalCtx('sappers[2].thermiteCharges'), undefined, 'третий сапёр не получает лишние заряды');
  equal(s.evalCtx('sappers[3].thermiteCharges'), undefined, 'карта не выдаётся другой фракции');
  includes(s.evalCtx('cardDesc'), 'Два сапёрных отделения AIRF', 'описание карты соответствует эффекту');
});

// 5. 82-мм миномёт тратит боеприпасы типа ordnance.
test('стрельба 82-мм миномёта расходует снаряды, а не патроны', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['is82mmMortarSquad', 'attackOrdnance']);
  s.run(`
    function getFactionCrewWeapons() { return [{ name: 'Миномёт 82 мм', type: 'mortar', shotRule: 'fixed_per_crew', crewSize: 5, shotsFull: 3, shotsReduced2: 2, shotsReduced1: 1, splashDamageDice: 1 }]; }
    function getScopedActiveModifiersForSquad() { return []; }
    function getScopedActiveCardsForSquad() { return []; }
    function getTacticalTargetDistance() { return 3; }
    function getTacticalCrewWeaponRange() { return 5; }
    function getEffectiveMorale() { return 5; }
    function getSuppressionThreshold() { return 2; }
    function getWeaponShotCount() { return 0; }
    function getWeaponMaxShots() { return 15; }
    function incrementWeaponShotCount() {}
    function getActionCost() { return 2; }
    function spendAP() { return true; }
    function tacticalActionAllowed() { return true; }
    function rollD10() { return 8; }
    function rollD6() { return 1; }
    function reportAttackOutcome() {}
    var currentTurn = 1, currentSquadIndex = 0, actionPoints = [{ ap: 20 }];
    var currentSquad = {
      name: 'Расчёт 82-мм миномёта', faction: 'A.I.R.F.', armor: null,
      ammoSmall: 40, ammoOrdnance: 10, actionsThisTurn: {},
      fighters: [{ hp: 3 }, { hp: 3 }, { hp: 3 }],
      crewInstances: [{ weaponName: 'Миномёт 82 мм', fighterIndices: [0, 1, 2], uniqueKey: 'mortar82', deployed: true }]
    };
    attackOrdnance();
  `);
  equal(s.evalCtx('currentSquad.ammoSmall'), 40, 'запас патронов не уменьшается');
  equal(s.evalCtx('currentSquad.ammoOrdnance'), 8, 'два выстрела списаны со снарядов');
});

// 6–7. Засада срабатывает только на входе врага; случайная расстановка и зоны размещения.
test('засада срабатывает при фактическом входе врага и открывает свободную расстановку', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['findTriggeredPlayerAmbush', 'renderActiveBattlesList']);
  loadModule(s, 'js/placement.js');
  s.run(`
    var ambusher = { name: 'Штаб взвода', faction: 'BeVe', col: 3, row: 2, isAmbush: true, ambushHex: '3,2' };
    appData.campaign.playerFaction = 'BeVe';
    appData.campaign.opUnits = [ambusher];
    var entered = { name: 'Вражеский взвод', col: 3, row: 2, prevCol: 2, prevRow: 2 };
    var triggered = findTriggeredPlayerAmbush([ambusher], [entered], { col: 3, row: 2 }, '3,2');
    var stationary = findTriggeredPlayerAmbush([ambusher], [{ ...entered, prevCol: 3, prevRow: 2 }], { col: 3, row: 2 }, '3,2');
    var missingPreviousPosition = findTriggeredPlayerAmbush([ambusher], [{ name: entered.name, col: 3, row: 2 }], { col: 3, row: 2 }, '3,2');

    var enemySquads = [
      { name: 'Враг 1', fighters: [{ hp: 3 }], detected: false },
      { name: 'Враг 2', fighters: [{ hp: 3 }], detected: false },
      { name: 'Десант внутри БТР', fighters: [{ hp: 3 }], hidden: true, detected: false }
    ];
    var grid = {};
    for (var row = 0; row < 5; row++) for (var col = 0; col < 5; col++) {
      grid[col + ',' + row] = { type: 'grass', squadIds: [], enemySquadIds: [] };
    }
    var tacticalMap = { hexKey: '3,2', mapSize: 5, grid, enemySquads };
    var randomPositions = placementRandomizeAmbushEnemies(tacticalMap);
    var deployedKeys = Object.keys(randomPositions).map(i => randomPositions[i]);

    var normalFriendly = { name: 'Стрелковое отделение', fighters: [{ hp: 3 }] };
    var ambushBattle = {
      id: 700, hexKey: '3,2', playerSquads: [normalFriendly],
      tacticalMap: { enemySquads },
      placement: { attackerSide: 'enemy', entryDir: 'W', phase: 'placing', playerReady: false, enemyReady: true, ambush: true }
    };
    appData.currentBattleId = 700;
    appData.campaign.activeBattles = [ambushBattle];
    appData.squads = [normalFriendly];
    appData.map = { grid: {}, enemySquads };
    var allowedInAmbush = placementCheckPlace('player', '0,0', false, normalFriendly);

    ambushBattle.placement.ambush = false;
    var zoneDrawCalls = 0;
    var ctx = { save() { zoneDrawCalls++; }, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {} };
    drawPlacementZone(ctx, 10);
    var defenderPanel = document.getElementById('battlePlacementPanel');
    renderPlacementPanel();
    var defenderError = placementCheckPlace('player', '0,0', false, normalFriendly);
    renderActiveBattlesList();
    var defenderBattleList = document.getElementById('activeBattlesList').innerHTML;
  `);
  equal(s.evalCtx('!!triggered'), true, 'вход врага включает засаду');
  equal(s.evalCtx('stationary'), null, 'враг, который не вошёл на гекс, не запускает засаду');
  equal(s.evalCtx('missingPreviousPosition'), null, 'неподвижный контакт без шага не считается входом');
  assert(s.evalCtx('deployedKeys.length') === 2, 'два живых отряда получили случайные позиции');
  assert(s.evalCtx('deployedKeys[0] !== deployedKeys[1]'), 'отряды распределены по разным свободным гексам');
  equal(s.evalCtx('enemySquads[0].detected'), true, 'первый враг обнаружен');
  equal(s.evalCtx('enemySquads[1].detected'), true, 'второй враг обнаружен');
  equal(s.evalCtx('enemySquads[2].hidden'), true, 'пассажиры внутри БТР остаются физически скрытыми');
  equal(s.evalCtx('allowedInAmbush'), null, 'игрок может выбрать любой гекс при засаде');
  equal(s.evalCtx('zoneDrawCalls'), 0, 'обороняющемуся не рисуется зона старта противника');
  includes(s.evalCtx('defenderPanel.innerHTML'), 'Разместить', 'кнопка размещения остаётся доступной защитнику');
  excludes(s.evalCtx('defenderPanel.innerHTML'), 'сторона входа', 'защитник не видит настройки/направление вражеской зоны');
  includes(s.evalCtx('defenderBattleList'), 'стартовая зона противника скрыта', 'направление не раскрывается даже в списке активных боёв');
  excludes(s.evalCtx('defenderBattleList'), 'вход Запада', 'список боёв не выдаёт направление зоны');
  assert(String(s.evalCtx('defenderError')).startsWith('⛔ Этот гекс недоступен'), 'ограничение зоны не раскрывает её направление');
});

// Проверка постоянной позиции ДОТа: объект хранит hexKey и key.
test('закреплённый ДОТ разрешён только в своём оперативном гексе и тактической клетке', () => {
  const s = createSandbox(freshAppData());
  loadModule(s, 'js/placement.js');
  s.run(`
    var dot = { name: 'ДОТ Bosh', fighters: [{ hp: 3 }], fixedTacticalPosition: { hexKey: '3,2', key: '4,4' } };
    var battle = { id: 701, hexKey: '3,2', playerSquads: [dot], tacticalMap: { enemySquads: [] },
      placement: { attackerSide: 'player', entryDir: 'W', phase: 'placing', playerReady: false } };
    appData.currentBattleId = 701; appData.campaign.activeBattles = [battle]; appData.map = { grid: {} };
    var correctCell = placementCheckPlace('player', '4,4', false, dot);
    var wrongCell = placementCheckPlace('player', '4,3', false, dot);
    var allowedBySide = placementSideAllowed(battle, 'player', '4,4');
  `);
  equal(s.evalCtx('correctCell'), null, 'ДОТ размещается на закреплённой клетке');
  includes(s.evalCtx('wrongCell'), 'закреплён', 'ДОТ нельзя переставить на другую клетку');
  equal(s.evalCtx('allowedBySide'), true, 'fixedTacticalPosition сопоставляется по hexKey');
});

// 8. Воронка для пехоты стоит как трава.
test('пехота проходит воронку за ту же стоимость, что и траву', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['getMovementCost']);
  s.run(`
    function getScopedActiveCardsForSquad() { return []; }
    appData.map = { grid: {
      '0,0': { type: 'grass', level: 0 }, '1,0': { type: 'craters', level: 0 }, '2,0': { type: 'grass', level: 0 }
    } };
    var infantry = { name: 'Стрелковое отделение', armor: null, mobilityType: 'foot' };
    var grassCost = getMovementCost(infantry, '0,0', '2,0', false);
    var craterCost = getMovementCost(infantry, '0,0', '1,0', false);
  `);
  equal(s.evalCtx('grassCost'), 2, 'стоимость травы равна двум полу-ОД');
  equal(s.evalCtx('craterCost'), s.evalCtx('grassCost'), 'воронка стоит как трава');
  equal(s.evalCtx('TERRAIN_DATA.craters.baseCost'), s.evalCtx('TERRAIN_DATA.grass.baseCost'), 'данные местности согласованы');
});

// 9. «За боеприпасами» выбирает бойца случайно, но исключает командира и наводчика пулемёта.
test('действие «За боеприпасами» отправляет случайного доступного бойца', () => {
  const s = createSandbox(freshAppData());
  loadModule(s, 'js/map_actions.js');
  setRandom(s, [0]);
  s.run(`
    function getFactionCrewWeapons() { return [{ name: 'Пулемёт MG', type: 'mg' }]; }
    function getBattleSquadHex(grid, index, enemy) {
      const field = enemy ? 'enemySquadIds' : 'squadIds';
      for (const key of Object.keys(grid || {})) if ((grid[key][field] || []).includes(index)) return { key };
      return null;
    }
    function getAP() { return 4; }
    function tacticalActionAllowed() { return true; }
    function tacticalIsMeleeEngaged() { return false; }
    var promptValues = ['2', '3'];
    function prompt() { return promptValues.shift(); }
    appData.squads = [{ name: 'Разведывательное отделение', faction: 'A.I.R.F.', ammoSmall: 10, ammoOrdnance: 2, grenades: 0,
      fighters: [
        { name: 'Командир отделения', hp: 3, isCommander: true },
        { name: 'Наводчик пулемёта', hp: 3 },
        { name: 'Стрелок', hp: 3 },
        { name: 'Сержант', hp: 3 }
      ], crewInstances: [{ weaponName: 'Пулемёт MG', fighterIndices: [1, 2] }] }];
    appData.map = { grid: { '0,0': { squadIds: [0], enemySquadIds: [] } }, selectedMoveSquadIdx: 0, mode: 'move' };
    var eligibleNames = mapActionEligibleAmmoRunners(appData.squads[0]).map(x => x.fighter.name);
    mapBeginAmmoRun();
  `);
  const eligible = JSON.parse(s.evalCtx('JSON.stringify(eligibleNames)'));
  assert(!eligible.includes('Командир отделения'), 'командир исключён');
  assert(!eligible.includes('Наводчик пулемёта'), 'наводчик пулемёта исключён');
  assert(eligible.includes('Сержант'), 'не-командир может быть выбран');
  equal(s.evalCtx('appData.squads[0].fighters[2].isAway'), true, 'случайный стрелок отправлен');
  equal(s.evalCtx('appData.squads[0].fighters[2].ammoType'), '2', 'сохранён выбранный тип снарядов');
  equal(s.evalCtx('appData.squads[0].fighters[2].turnsToReturn'), 3, 'сохранён срок возвращения');
  includes(s.logs.join('\n'), 'снарядами (+10)', 'отправленный боец несёт максимальную порцию выбранного типа');
});

// 10. Плавающее меню открывается двойным кликом и закрывается при выборе команды.
test('двойной щелчок открывает меню над отрядом, а выбор действия закрывает меню', () => {
  const s = createSandbox(freshAppData());
  loadModule(s, 'js/map_actions.js');
  s.run(`
    function getFactionCrewWeapons() { return []; }
    function getFactionWeapons() { return []; }
    function getBattleSquadHex(grid, index, enemy) { return enemy ? null : { key: '1,1', col: 1, row: 1 }; }
    function getAP() { return 4; }
    function getEffectiveMorale() { return 5; }
    function tacticalActionAllowed() { return true; }
    function tacticalIsMeleeEngaged() { return false; }
    function selectSquad() {}
    var currentSquadIndex = 0;
    appData.squads = [{ name: 'Пехотное отделение', faction: 'A.I.R.F.', ammoSmall: 20, grenades: 2,
      fighters: [{ name: 'Стрелок', hp: 3, weapon: 'Винтовка' }], crewInstances: [] }];
    appData.map = { mode: 'move', grid: { '1,1': { squadIds: [0], enemySquadIds: [] } }, selectedMoveSquadIdx: 0 };
    var quickMenuNode = null;
    var originalGetElementById = document.getElementById.bind(document);
    document.getElementById = function (id) { return id === 'mapQuickActionMenu' ? quickMenuNode : originalGetElementById(id); };
    document.createElement = function () {
      return { id: '', style: {}, listeners: {}, parentNode: null, innerHTML: '',
        setAttribute() {}, addEventListener(name, fn) { this.listeners[name] = fn; },
        getBoundingClientRect() { return { width: 280, height: 250 }; }, contains() { return false; } };
    };
    document.body.appendChild = function (node) { quickMenuNode = node; node.parentNode = document.body; };
    document.body.removeChild = function (node) { if (quickMenuNode === node) quickMenuNode = null; node.parentNode = null; };
    document.addEventListener = function () {};
    document.removeEventListener = function () {};
    mapShowQuickActionMenu(0, '1,1', 100, 200);
    var menuHtml = quickMenuNode.innerHTML;
    var actionButton = { disabled: false, getAttribute() { return 'attack:smallArms'; } };
    quickMenuNode.listeners.click({ target: { closest() { return actionButton; } } });
  `);
  const clickSource = sliceFunction(HTML, 'redrawMap');
  includes(s.evalCtx('menuHtml'), 'Пехотное отделение', 'меню привязано к выбранному отряду');
  includes(s.evalCtx('menuHtml'), 'data-map-quick-action="attack:smallArms"', 'меню предлагает боевое действие');
  equal(s.evalCtx('quickMenuNode'), null, 'после выбора меню удалено');
  equal(s.evalCtx('appData.map.pendingMapAttack.type'), 'smallArms', 'выбранное действие передано обработчику');
  includes(clickSource, 'tacticalCanvas.ondblclick', 'двойной клик обрабатывается отдельно');
  includes(clickSource, 'mapShowQuickActionMenu', 'двойной клик вызывает плавающее меню');
  includes(clickSource, 'handleCanvasClick(clientX, clientY, clickedCanvas)', 'одиночный клик продолжает обрабатывать перемещение');
});

// 11. Бинокль доступен штабам/разведке и обнаруживает скрытых врагов в указанном гексе.
test('бинокль штабов и разведки обнаруживает врагов в выбранном гексе', () => {
  const s = createSandbox(freshAppData());
  loadModule(s, 'js/map_actions.js');
  s.run(`
    function getBattleSquadHex(grid, index, enemy) {
      const field = enemy ? 'enemySquadIds' : 'squadIds';
      for (const key of Object.keys(grid || {})) if ((grid[key][field] || []).includes(index)) return { key };
      return null;
    }
    function getAP() { return 2; }
    function tacticalActionAllowed() { return true; }
    function tacticalIsMeleeEngaged() { return false; }
    var spentAP = 0;
    function spendAP(idx, amount) { spentAP += amount; return true; }
    appData.squads = [{ name: 'Разведывательное отделение', fighters: [{ hp: 3 }] }];
    appData.map = { selectedMoveSquadIdx: 0, grid: {
      '0,0': { squadIds: [0], enemySquadIds: [] },
      '2,2': { squadIds: [], enemySquadIds: [0] }
    }, enemySquads: [{ name: 'Скрытый враг', hidden: true, detected: false, fighters: [{ hp: 3 }] }] };
    var reconCanUse = mapActionCanUseBinoculars(appData.squads[0]);
    mapBeginBinoculars();
    var clickHandled = mapHexClickDuringBinoculars('2,2');
  `);
  equal(s.evalCtx('reconCanUse'), true, 'разведка может применить бинокль');
  equal(s.evalCtx('clickHandled'), true, 'клик по выбранному гексу обработан');
  equal(s.evalCtx('appData.map.enemySquads[0].hidden'), false, 'скрытый враг стал видимым');
  equal(s.evalCtx('appData.map.enemySquads[0].detected'), true, 'враг помечен обнаруженным');
  equal(s.evalCtx('spentAP'), 2, 'действие стоит 1 ОД');
  equal(s.evalCtx('appData.map.pendingMapBinoculars'), null, 'режим выбора гекса завершён');
});

// 12. Штаб получает осветительные ракеты, запускает их с карты и снимает ночной штраф на ход.
test('штаб всегда получает осветительные ракеты; запуск использует механику ночного модификатора', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalHQFlareOwnerKey', 'ensureBattleHQFlareSupply', 'ensureStandaloneHQFlareSupply', 'fireFlare', 'getScopedActiveCardsForSquad']);
  s.run(`
    function tacticalActionAllowed() { return true; }
    function spendAP() { return true; }
    var currentTurn = 4, currentSquadIndex = 0;
    var hq = { name: 'Штаб роты №1', opUnitName: 'Штаб роты №1', flares: 0, fighters: [{ hp: 3 }] };
    var battle = { playerSquads: [hq] };
    var issued = ensureBattleHQFlareSupply(battle);
    var standaloneHQ = { name: 'Штаб батальона', fighters: [{ hp: 3 }] };
    ensureStandaloneHQFlareSupply([standaloneHQ]);
    appData.activeCards = [{ name: 'Ночь', opUnitName: 'Штаб роты №1', active: true, accuracyMod: -2 }];
    appData.campaign.active = true;
    appData.currentBattleId = 4;
    appData.campaign.activeBattles = [{ id: 4 }];
    appData.squads = [hq];
    var currentSquad = hq;
    fireFlare();
    var nightCardAfterFlare = getScopedActiveCardsForSquad(hq).find(c => c.name === 'Ночь');
  `);
  equal(s.evalCtx('hq.flares'), 5, 'из шести ракет одна израсходована');
  equal(s.evalCtx('standaloneHQ.flares'), 6, 'в одиночном бою штаб также получает запас');
  equal(s.evalCtx('issued.length'), 1, 'выдача ракет зафиксирована для штаба');
  equal(s.evalCtx('appData.flareActive'), true, 'вспышка активна');
  equal(s.evalCtx('appData.flareTurn'), 4, 'эффект действует в текущем ходу');
  equal(s.evalCtx('nightCardAfterFlare.accuracyMod'), 0, 'штраф карты «Ночь» отменён на один ход');
});

// 13. Численное превосходство позволяет завершить бой без отступления.
test('при явном численном преимуществе бой завершается капитуляцией оставшегося врага', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['getTacticalBattleRecord', 'getTacticalActiveSide', 'tacticalEnemyIsNeutralized', 'tacticalUnresolvedEnemies', 'tacticalLivingStrength', 'tacticalNumericalSuperiority', 'tacticalCanFinishByNumericalSuperiority', 'finishBattleByNumericalSuperiority']);
  s.run(`
    function placementPendingReason() { return null; }
    function tacticalSurrenderUnit(enemy, side, index, reason) { enemy.isSurrendered = true; enemy.status = 'surrendered'; enemy.surrenderReason = reason; }
    var finishCalls = 0;
    function finishBattle() { finishCalls++; }
    appData.currentBattleId = 77;
    appData.campaign.online = false;
    appData.campaign.activeBattles = [{ id: 77, activeSide: 'player', placement: { phase: 'done' } }];
    appData.squads = Array.from({ length: 8 }, (_, i) => ({ name: 'Свой ' + i, fighters: [{ hp: 3 }] }));
    appData.map = { enemySquads: [{ name: 'Скрытый последний враг', hidden: true, detected: false, fighters: [{ hp: 3 }] }] };
    var canFinish = tacticalCanFinishByNumericalSuperiority();
    var finished = finishBattleByNumericalSuperiority();
  `);
  equal(s.evalCtx('canFinish'), true, 'восемь бойцов против одного дают явное превосходство');
  equal(s.evalCtx('finished'), true, 'команда принята');
  equal(s.evalCtx('appData.map.enemySquads[0].isSurrendered'), true, 'необнаруженный противник сдаётся');
  equal(s.evalCtx('appData.map.enemySquads[0].surrenderReason'), 'numerical_superiority', 'причина капитуляции сохранена');
  equal(s.evalCtx('finishCalls'), 1, 'бой закрывается без вынужденного отступления');
});

// 14. Отступление не использует занятый активным боем гекс; пустой по боеприпасам отряд идёт к штабу/тылу.
test('тактическое отступление избегает активного боя, а пустой по боеприпасам отряд идёт к штабу', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['findRetreatHex', 'operationalHexHasActiveBattle', 'operationalEnemyOccupiesHex', 'findOperationalRetreatPath', 'operationalUnitHasNoTrackedAmmo', 'triggerOperationalAmmoRetreat', 'operationalRouteCost', 'findOperationalAmmoRetreatDestination', 'processOperationalAmmoRetreats']);
  s.run(`
    function getOpHexNeighbors(col, row) {
      if (col === 0 && row === 0) return [{ col: 1, row: 0 }, { col: 0, row: 1 }];
      if (col === 1 && row === 0) return [{ col: 0, row: 0 }, { col: 2, row: 0 }];
      if (col === 2 && row === 0) return [{ col: 1, row: 0 }];
      if (col === 0 && row === 1) return [{ col: 0, row: 0 }];
      return [];
    }
    function getOpMoveCost() { return 1; }
    function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }
    function operationalAmmoSquads(unit) { return unit.squads || []; }
    function cancelOrdersForMoraleRetreat() {}
    function isStaticOpUnit() { return false; }
    function opRecordPrevPos(unit) { unit.prevCol = unit.col; unit.prevRow = unit.row; }
    function supplyDepotCaptured() { return true; }
    function getSupplyDepotHex() { return null; }
    function supplyRearPoint() { return null; }
    function markOpUnitSurrendered(unit) { unit.isSurrendered = true; }

    appData.campaign.activeBattles = [{ hexKey: '1,0', status: 'active' }];
    appData.campaign.enemyOpUnits = [];
    var retreatChoice = findRetreatHex({ col: 0, row: 0 }, 0, 0);

    appData.campaign.activeBattles = [];
    var outOfAmmo = { name: 'Стрелковый взвод', col: 0, row: 0, ap: 2, squads: [{ ammoSmall: 0, ammoOrdnance: 0, fighters: [{ hp: 3 }] }] };
    var hq = { name: 'Штаб роты №1', type: 'company_hq', col: 2, row: 0 };
    appData.campaign.opUnits = [outOfAmmo, hq];
    appData.campaign.supply = { deliveries: [] };
    var moved = processOperationalAmmoRetreats();
  `);
  equal(s.evalCtx('retreatChoice.col'), 0, 'отход выбрал соседний гекс, не занятый активным боем');
  equal(s.evalCtx('moved'), true, 'отряд начал движение за боеприпасами');
  equal(s.evalCtx('outOfAmmo.col'), 2, 'отряд дошёл до штаба');
  equal(s.evalCtx('outOfAmmo.operationalAmmoRouted'), true, 'отряд остаётся в состоянии пополнения');
  equal(s.evalCtx('outOfAmmo.operationalAmmoAtTarget'), true, 'отряд отмечен у точки снабжения');
});

test('если точка эвакуации захвачена, отряд без боеприпасов сдаётся', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['operationalHexHasActiveBattle', 'operationalEnemyOccupiesHex', 'findOperationalRetreatPath', 'operationalUnitHasNoTrackedAmmo', 'triggerOperationalAmmoRetreat', 'operationalRouteCost', 'findOperationalAmmoRetreatDestination', 'processOperationalAmmoRetreats']);
  s.run(`
    function operationalAmmoSquads(unit) { return unit.squads || []; }
    function cancelOrdersForMoraleRetreat() {}
    function isStaticOpUnit() { return false; }
    function getOpHexNeighbors() { return []; }
    function getOpMoveCost() { return 1; }
    function supplyDepotCaptured() { return true; }
    function getSupplyDepotHex() { return null; }
    function supplyRearPoint() { return { col: 2, row: 0 }; }
    function markOpUnitSurrendered(unit) { unit.isSurrendered = true; unit.isDestroyed = true; }
    var outOfAmmo = { name: 'Отрезанный взвод', col: 0, row: 0, ap: 2, squads: [{ ammoSmall: 0, ammoOrdnance: 0, fighters: [{ hp: 3 }] }] };
    appData.campaign.opUnits = [outOfAmmo];
    appData.campaign.enemyOpUnits = [{ name: 'Враг', col: 2, row: 0 }];
    appData.campaign.activeBattles = [];
    appData.campaign.supply = { deliveries: [] };
    processOperationalAmmoRetreats();
  `);
  equal(s.evalCtx('outOfAmmo.isSurrendered'), true, 'захваченный тыл приводит к капитуляции');
});

// 15. Конвой снабжения рисуется на своём текущем гексе.
test('на карте кампании рисуется текущий гекс каждой колонны снабжения', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['drawSupplyDeliveriesOnMap']);
  s.run(`
    var drawnText = [], drawnArcs = [];
    var ctx = {
      save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {},
      arc(x, y) { drawnArcs.push([x, y]); },
      fillText(text, x, y) { drawnText.push([text, x, y]); }
    };
    drawSupplyDeliveriesOnMap(ctx, [
      { col: 3, row: 4, mobility: 'vehicle', status: 'outbound' },
      { col: 1, row: 2, mobility: 'foot', status: 'returning' },
      { col: null, row: 2, mobility: 'foot', status: 'outbound' }
    ], 40);
  `);
  equal(s.evalCtx('drawnArcs.length'), 2, 'позиции двух конвоев нарисованы; некорректный гекс пропущен');
  const labels = JSON.parse(s.evalCtx('JSON.stringify(drawnText.map(x => x[0]))'));
  assert(labels.includes('🚚') && labels.includes('🎒'), 'на карте различимы машины и пешие колонны');
  assert(labels.includes('➡ 3,4') && labels.includes('↩ 1,2'), 'под маркером подписаны координаты текущего гекса');
  includes(sliceFunction(HTML, 'redrawOperationalMapNow'), 'drawSupplyDeliveriesOnMap(ctx', 'маркер подключён к отрисовке кампании');
});

// 16. ETA и сообщения об ошибках доставки.
test('ETA показывает ход прибытия, а недоступный получатель получает уведомление', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['supplyDeliveryDestination', 'supplyDeliveryEta', 'supplyEtaLabel', 'notifySupplyDelivery', 'advanceSupplyDeliveries']);
  s.run(`
    var SUPPLY_CONVOY_BUDGET = 5;
    var routeAvailable = true, supplyStepMode = 'blocked';
    function findSupplyRoute() { return routeAvailable ? [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }] : null; }
    function supplyRouteCost() { return 10; }
    function operationalHexHasActiveBattle() { return false; }
    function getSupplyDepotHex() { return { col: 0, row: 0 }; }
    function supplyRearPoint() { return { col: 0, row: 0 }; }
    function ensureSupplyState() { return appData.campaign.supply; }
    function supplyRearConnectionIsLost() { return false; }
    function syncSupplyDepotStatus() {}
    function syncSupplyAssetsFromPlatoon() {}
    function redrawOperationalMap() {}
    function renderSupplyPanel() {}
    function supplyAmbushCheck() { return null; }
    function supplyStepToward(delivery, col, row) {
      if (supplyStepMode === 'blocked') { delivery.routeBlocked = true; return false; }
      delivery.col = col; delivery.row = row; delivery.routeBlocked = false; return true;
    }
    var cargoMode = 'full';
    function supplyDistributeCargo(target, requested) {
      return cargoMode === 'partial' ? { ammoSmall: 4, grenades: 2, ammoOrdnance: 1 } : { ...requested };
    }
    var recipient = { name: 'Пехотный взвод', col: 3, row: 0 };
    appData.campaign.currentTurn = 4;
    appData.campaign.opUnits = [recipient];
    var delivery = { kind: 'unit', targetUnitId: 0, col: 0, row: 0, status: 'outbound', delayTurns: 1 };
    var etaText = supplyEtaLabel(delivery);
    recipient.isInBattle = true;
    var waitingText = supplyEtaLabel(delivery);
    var lostDelivery = { kind: 'unit', targetUnitId: 0, col: 0, row: 0, status: 'outbound', delayTurns: 0 };
    recipient.isDestroyed = true;
    appData.campaign.supply = { deliveries: [lostDelivery] };
    advanceSupplyDeliveries();

    recipient.isDestroyed = false;
    recipient.isInBattle = true;
    var battleDelivery = { kind: 'unit', targetUnitId: 0, col: 0, row: 0, status: 'outbound', delayTurns: 0, cargo: { ammoSmall: 2, grenades: 1, ammoOrdnance: 1 }, assets: [] };
    appData.campaign.supply = { deliveries: [battleDelivery] };
    advanceSupplyDeliveries();

    recipient.isInBattle = false;
    var blockedDelivery = { kind: 'unit', targetUnitId: 0, col: 0, row: 0, status: 'outbound', delayTurns: 0, cargo: { ammoSmall: 2, grenades: 1, ammoOrdnance: 1 }, assets: [] };
    appData.campaign.supply = { deliveries: [blockedDelivery] };
    advanceSupplyDeliveries();

    supplyStepMode = 'arrive';
    var fullDelivery = { kind: 'unit', targetUnitId: 0, col: 0, row: 0, status: 'outbound', delayTurns: 0, cargo: { ammoSmall: 5, grenades: 1, ammoOrdnance: 2 }, assets: [] };
    appData.campaign.supply = { deliveries: [fullDelivery] };
    advanceSupplyDeliveries();

    var partialDelivery = { kind: 'unit', targetUnitId: 0, col: 0, row: 0, status: 'outbound', delayTurns: 0, cargo: { ammoSmall: 10, grenades: 5, ammoOrdnance: 4 }, assets: [] };
    cargoMode = 'partial';
    appData.campaign.supply = { deliveries: [partialDelivery] };
    advanceSupplyDeliveries();
  `);
  includes(s.evalCtx('etaText'), 'через 3', 'ETA учитывает маршрут и задержку');
  includes(s.evalCtx('etaText'), 'ход 7', 'ETA содержит ожидаемый номер хода прибытия');
  includes(s.evalCtx('waitingText'), 'после завершения боя', 'для боя отображается условный ETA');
  equal(s.evalCtx('lostDelivery.status'), 'returning', 'невозможная доставка переводится на возврат');
  includes(s.evalCtx('lostDelivery.notice'), 'не может доставить груз', 'игроку сообщена причина недоставки');
  includes(s.evalCtx('battleDelivery.notice'), 'активном бою', 'о задержке получателя в бою сообщается');
  includes(s.evalCtx('blockedDelivery.notice'), 'маршрут колонны', 'о перекрытом маршруте сообщается');
  includes(s.evalCtx('fullDelivery.notice'), 'не смог принять груз', 'о полном складе получателя сообщается');
  includes(s.evalCtx('partialDelivery.notice'), 'не полностью', 'о частичном приёме сообщается');
  includes(s.logs.join('\n'), 'Снабжение:', 'уведомление попадает в оперативный лог');
});

test('засада каравана сообщает потери и не списывает больше груза, чем было загружено', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['supplyAmbushCheck']);
  s.run(`
    var SUPPLY_ASSET_TYPES = { porters: { mobility: 'foot', cargo: { ammoSmall: 20, grenades: 4, ammoOrdnance: 10 } } };
    function rollD6() { return 1; }
    function supplyKillCarriers() {}
    appData.campaign.enemyOpUnits = [{ name: 'Засадный отряд', col: 1, row: 0 }];
    var delivery = { col: 0, row: 0, assets: [{ id: 'porters', count: 2 }],
      cargo: { ammoSmall: 2, grenades: 1, ammoOrdnance: 10 } };
    var result = supplyAmbushCheck(delivery);
  `);
  equal(s.evalCtx('result.hit'), true, 'плохой бросок приводит к засаде');
  equal(s.evalCtx('result.cargoLoss.ammoSmall'), 2, 'потеря патронов ограничена реальным грузом');
  equal(s.evalCtx('result.cargoLoss.grenades'), 1, 'потеря гранат учитывается');
  equal(s.evalCtx('result.cargoLoss.ammoOrdnance'), 3, 'потеря снарядов учитывается');
  equal(s.evalCtx('delivery.cargo.ammoSmall'), 0, 'патроны не уходят в отрицательное значение');
  equal(s.evalCtx('delivery.cargo.ammoOrdnance'), 7, 'остаток снарядов корректен');
});

// 19. Общая карточка, удалённая «Велостоянка» и новый значок штаба BeVe.
test('каталог добавляет общий «Двойной БК», удаляет дебафф «Велостоянка» и использует новый значок штаба', () => {
  const s = createSandbox(freshAppData());
  const globalCard = s.evalCtx(`GLOBAL_CARDS.find(c => c.name === 'Двойной БК')`);
  equal(globalCard && globalCard.type, 'bonus', '«Двойной БК» — бонусная карта');
  equal(globalCard && globalCard.subfaction, 'common', 'карта общая для фракций');
  equal(s.evalCtx(`GLOBAL_CARDS.some(c => c.name === 'Велостоянка') || BEVE_CARDS.some(c => c.name === 'Велостоянка') || AIRF_CARDS.some(c => c.name === 'Велостоянка')`), false, 'карта «Велостоянка» удалена из исходных каталогов');
  equal(s.evalCtx(`SQUAD_TEMPLATES.find(t => t.name === 'Штаб роты №1 Бельгийцы').icon`), 'images/BeVe/штаб роты BeVe бел.jpg', 'штаб бельгийской роты использует заданный файл');

  loadHtml(s, ['getDefaultData', 'syncFactionCatalogs']);
  s.run(`
    appData.factions = {
      _global: { cardLibrary: [{ name: 'Велостоянка', type: 'negative' }, { name: 'Пользовательская карта', type: 'bonus' }] },
      BeVe: { cardLibrary: [{ name: 'Велостоянка', type: 'negative' }] },
      'A.I.R.F.': { cardLibrary: [] }
    };
    appData.activeCards = [{ name: 'Велостоянка' }];
    appData.campaign.opUnits = [{ name: 'Самокатный взвод', cardSelection: { cards: [{ name: 'Велостоянка', type: 'negative' }] } }];
    syncFactionCatalogs();
  `);
  equal(s.evalCtx(`appData.factions._global.cardLibrary.some(c => c.name === 'Велостоянка')`), false, 'устаревшая карта удаляется из старого сейва');
  equal(s.evalCtx(`appData.factions.BeVe.cardLibrary.some(c => c.name === 'Велостоянка')`), false, 'устаревшая карта удаляется из каталога BeVe');
  equal(s.evalCtx(`appData.factions._global.cardLibrary.some(c => c.name === 'Двойной БК')`), true, 'общая карта добавляется в заполненный старый сейв');
  equal(s.evalCtx(`appData.factions._global.cardLibrary.some(c => c.name === 'Пользовательская карта')`), true, 'пользовательские карты сохраняются');
  equal(s.evalCtx(`appData.activeCards.some(c => c.name === 'Велостоянка')`), false, 'устаревшая карта снимается из активных');
  equal(s.evalCtx(`appData.campaign.opUnits[0].cardSelection.cards.length`), 0, 'устаревшая карта снимается из назначений');
});

// 20. Только нужные типы взводов могут выбирать карты; бонус ограничен тремя экземплярами на батальон.
test('выбор карт разрешён пехоте, разведке и сапёрам; лимит бонуса — 3 на батальон', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['isCardSelectableOpUnit', 'countBattalionBonusCardCopies', 'campaignBonusCardLimitReached']);
  s.run(`
    function getCurrentCampaignBattle() { return { id: 1 }; }
    function getCardDefinitionByName() { return null; }
    const live = [{ name: 'Стрелковое отделение', fighters: [{ hp: 3 }] }];
    var allowedTypes = ['infantry_platoon', 'bicycle_platoon', 'motorcycle_platoon', 'recon_platoon', 'engineer_platoon'];
    var allowed = allowedTypes.map(type => isCardSelectableOpUnit({ type, squads: live }));
    var deniedTypes = ['mortar_battery', 'company_hq', 'at_battery', 'sau_battery', 'other_platoon'];
    var denied = deniedTypes.map(type => isCardSelectableOpUnit({ type, squads: live }));
    appData.campaign.opUnits = [
      { name: 'Взвод 1', cardSelection: { cards: [{ name: 'Обычная карта', type: 'bonus' }] } },
      { name: 'Взвод 2', cardSelection: { cards: [{ name: 'Обычная карта', type: 'bonus' }] } },
      { name: 'Взвод 3', cardSelection: { cards: [{ name: 'Обычная карта', type: 'bonus' }] } }
    ];
    var copies = countBattalionBonusCardCopies('Обычная карта');
    var exhausted = campaignBonusCardLimitReached({ name: 'Обычная карта', type: 'bonus' }, { name: 'Взвод 4' });
    var differentCardAvailable = campaignBonusCardLimitReached({ name: 'Другая карта', type: 'bonus' }, { name: 'Взвод 4' });
  `);
  assert(JSON.parse(s.evalCtx('JSON.stringify(allowed)')).every(Boolean), 'пехота, велосипедисты, мотоциклисты, разведка и сапёры имеют право на карты');
  assert(JSON.parse(s.evalCtx('JSON.stringify(denied)')).every(value => !value), 'штабы, батареи и неизвестные типы карт не выбирают');
  equal(s.evalCtx('copies'), 3, 'считаются экземпляры по всему батальону');
  equal(s.evalCtx('exhausted'), true, 'четвёртый экземпляр запрещён');
  equal(s.evalCtx('differentCardAvailable'), false, 'лимит одной карты не блокирует другие');
});

// 21. «Двойной БК» удваивает боеприпасы конкретного выбранного отряда ровно один раз.
test('«Двойной БК» удваивает патроны, гранаты и снаряды выбранного отряда', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['addAppliedCardName', 'applyCardToPlatoon']);
  s.run(`
    var unit = { name: 'Стрелковый взвод', squads: [] };
    var selected = { name: 'Отделение 1', fighters: [{ hp: 3 }], ammoSmall: 10, grenades: 2, ammoOrdnance: 4 };
    var untouched = { name: 'Отделение 2', fighters: [{ hp: 3 }], ammoSmall: 7, grenades: 1, ammoOrdnance: 3 };
    var squads = [selected, untouched];
    var card = { name: 'Двойной БК', type: 'bonus' };
    applyCardToPlatoon(card, '_global', unit, squads, ['Отделение 1'], { initial: true });
    var afterInitial = [selected.ammoSmall, selected.grenades, selected.ammoOrdnance];
    var unchangedOther = [untouched.ammoSmall, untouched.grenades, untouched.ammoOrdnance];
    applyCardToPlatoon(card, '_global', unit, squads, ['Отделение 1'], { initial: false });
    var afterRefresh = [selected.ammoSmall, selected.grenades, selected.ammoOrdnance];
  `);
  equal(s.evalCtx('JSON.stringify(afterInitial)'), '[20,4,8]', 'все три вида боезапаса выбранного подразделения умножены на два');
  equal(s.evalCtx('JSON.stringify(unchangedOther)'), '[7,1,3]', 'невыбранный отряд не меняется');
  equal(s.evalCtx('JSON.stringify(afterRefresh)'), '[20,4,8]', 'повторная загрузка боя не удваивает боезапас повторно');
});

// 22. Велосипедная стоянка хранит владельца и теряется при входе противника на гекс.
test('захват велостоянки лишает велосипедный взвод транспорта и снижает дух на 1', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['operationalBicycleUnitSide', 'operationalBicycleParkCell', 'setOperationalBicyclePark', 'operationalBicycleParkOwners', 'operationalBicycleParkBelongsTo', 'removeOperationalBicyclePark', 'resolveBicycleParkCaptures']);
  s.run(`
    function isBicycleTacticalSquad() { return true; }
    function changeOperationalMorale(unit, delta) { unit.operationalMorale = (unit.operationalMorale || 0) + delta; }
    var biker = { name: 'Самокатный взвод', faction: 'BeVe', type: 'bicycle_platoon', mobility: 'bicycle', col: 2, row: 3, operationalMorale: 80, squads: [{ name: 'Самокатное отделение', fighters: [{ hp: 3 }] }] };
    appData.campaign.opUnits = [biker];
    appData.campaign.enemyOpUnits = [];
    appData.campaign.opMapGrid = { '2,3': { types: ['grass'], markers: [] } };
    biker.dismountedFromMobility = 'bicycle'; biker.dismounted = true; biker.mobility = 'foot';
    var park = setOperationalBicyclePark(biker);
    var ownerCanRemount = operationalBicycleParkBelongsTo(biker, '2,3');
    var noCapture = resolveBicycleParkCaptures('2,3');
    appData.campaign.enemyOpUnits.push({ name: 'Вражеский взвод', faction: 'A.I.R.F.', col: 2, row: 3 });
    var didCapture = resolveBicycleParkCaptures('2,3');
    var markerAfterCapture = appData.campaign.opMapGrid['2,3'].markers.includes('bicyclePark');
    var secondCapture = resolveBicycleParkCaptures('2,3');
  `);
  equal(s.evalCtx('ownerCanRemount'), true, 'до захвата велосипеды принадлежат самокатному взводу');
  equal(s.evalCtx('noCapture'), false, 'союзное присутствие не считается захватом');
  equal(s.evalCtx('didCapture'), true, 'вход вражеского подразделения фиксирует захват');
  equal(s.evalCtx('biker.bicycleLost'), true, 'взвод теряет велосипеды');
  equal(s.evalCtx('biker.operationalMorale'), 79, 'оперативный дух уменьшается ровно на 1');
  equal(s.evalCtx('biker.squads[0].bicycleLost'), true, 'потеря транспорта сохраняется на тактическом отряде');
  equal(s.evalCtx('markerAfterCapture'), false, 'захваченная стоянка удалена и на ней нельзя снова сесть');
  equal(s.evalCtx('secondCapture'), false, 'повторная отрисовка не накладывает штраф повторно');
});

// 23. Drop-событие не блокируется антидублем; в кампанийном бою скрыты редакторские вкладки.
test('перетаскивание размещает юнит, а запрещённые вкладки скрываются только в кампанийном бою', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
  const dragCallCount = (ui.match(/__opPlacementDrop:\s*true/g) || []).length;
  equal(dragCallCount, 2, 'оба способа перетаскивания передают явное drop-событие');
  includes(sliceFunction(ui, 'patchMapClick'), 'event.__opPlacementDrop', 'антидубль пропускает именно drop, но блокирует лишний click');

  const s = createSandbox(freshAppData());
  const tabTargets = ['rosterTab', 'weaponTab', 'crewTab', 'activeEffectsTab', 'cardsEditorTab', 'saveTab', 'mapTemplatesTab', 'cardsTab'];
  s.run(`
    var inStandaloneBattle = false;
    const CAMPAIGN_HIDDEN_BATTLE_TABS = new Set(['mapTemplatesTab', 'saveTab', 'cardsEditorTab', 'activeEffectsTab', 'crewTab', 'weaponTab', 'rosterTab']);
    var testTabs = ${JSON.stringify(tabTargets)}.map(target => ({
      getAttribute(name) { return name === 'onclick' ? "openTab(event,'" + target + "')" : null; },
      style: { display: 'inline-block' }, dataset: {}
    }));
    document.querySelectorAll = selector => selector === '#battleApp .tablinks' ? testTabs : [];
    appData.currentBattleId = 99;
    appData.campaign.active = true;
  `);
  loadHtml(s, ['syncCampaignBattleTabVisibility']);
  s.run('syncCampaignBattleTabVisibility()');
  const hiddenDisplays = JSON.parse(s.evalCtx('JSON.stringify(testTabs.slice(0,7).map(t => t.style.display))'));
  assert(hiddenDisplays.every(display => display === 'none'), 'в кампанийном бою скрыты все семь заданных вкладок');
  equal(s.evalCtx('testTabs[7].style.display'), 'inline-block', 'вкладка карточек остаётся доступна');
  s.run('inStandaloneBattle = true; syncCampaignBattleTabVisibility()');
  const restoredDisplays = JSON.parse(s.evalCtx('JSON.stringify(testTabs.slice(0,7).map(t => t.style.display))'));
  assert(restoredDisplays.every(display => display === 'inline-block'), 'в одиночном бою вкладки восстановлены');
});


// 24. Черновые гексы сектора подсвечиваются, а разрешённый прямой огонь выбирает все цели гекса.
test('подсветка сектора и приказ «Обстрелять гекс» работают по выбранной клетке', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['drawOperationalSectorDraftHighlights']);
  s.run(`
    window.uxGetSectorDraftHexes = () => [{ col: 2, row: 3 }];
    var drawCalls = { fill: 0, stroke: 0, labels: [] };
    var ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
      fill() { drawCalls.fill++; }, stroke() { drawCalls.stroke++; }, fillText(text) { drawCalls.labels.push(text); }
    };
    drawOperationalSectorDraftHighlights(ctx, 20);
  `);
  equal(s.evalCtx('drawCalls.fill'), 1, 'выбранный гекс залит подсветкой');
  equal(s.evalCtx('drawCalls.stroke'), 1, 'выбранный гекс обведён');
  includes(s.evalCtx('JSON.stringify(drawCalls.labels)'), '✓', 'в гексе отображается отметка выбора');

  const ui = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
  includes(ui, 'data-kind="hex_fire"', 'меню огня содержит прямой приказ по гексу');
  includes(ui, "pointPicker('Выбрать гекс обстрела', 'target')", 'гекс выбирается прямо на оперативной карте');
  loadModuleFunctions(s, 'js/operational_ui.js', ['parseDraftOptions']);
  s.run(`
    function hasAtGunWeapons() { return false; }
    function isMediumArtillery() { return false; }
    var parsedHexFire = parseDraftOptions({ category: 'hex_fire', targetHex: '4,5' },
      { name: 'Лёгкий танк CL/39', type: 'tank_platoon', col: 1, row: 1 });
    var ineligibleFireError = '';
    try { parseDraftOptions({ category: 'hex_fire', targetHex: '4,5' },
      { name: 'Стрелковый взвод', type: 'infantry_platoon', col: 1, row: 1 }); }
    catch (e) { ineligibleFireError = e.message; }
  `);
  equal(s.evalCtx('parsedHexFire.type'), 'shoot', 'прямой обстрел сериализуется как приказ по гексу');
  equal(s.evalCtx('parsedHexFire.options.targetHex'), '4,5', 'координаты цели сохраняются');
  includes(s.evalCtx('ineligibleFireError'), 'доступен только артиллерии', 'обычная пехота не получает этот приказ');

  loadHtml(s, ['operationalHexFireRange', 'executeShootOrder']);
  s.run(`
    function isMediumArtillery() { return false; }
    function getFactionCrewWeapons() { return []; }
    function hasAtGunWeapons() { return false; }
    function hasMgWeapons() { return false; }
    function canUnitShoot() { return true; }
    function isArmoredUnit() { return false; }
    function getOpHexDistance(a, b, c, d) { return Math.abs(a-c) + Math.abs(b-d); }
    var shotTargets = [];
    function executeOpShoot(targets) { shotTargets = targets.map(target => target.name); }
    function executeOpShootAt(targets) { shotTargets = targets.map(target => target.name); }
    var tank = { name: 'Танк CL/39', type: 'tank_platoon', col: 0, row: 0, ap: 4 };
    appData.campaign.enemyOpUnits = [
      { name: 'Пехота А', col: 5, row: 0, fighters: [{ hp: 3 }] },
      { name: 'Пехота Б', col: 5, row: 0, fighters: [{ hp: 3 }] },
      { name: 'Пехота В', col: 6, row: 0, fighters: [{ hp: 3 }] }
    ];
    var order = { type: 'shoot', targetHex: '5,0', status: 'active' };
    executeShootOrder(tank, order);
  `);
  equal(s.evalCtx('JSON.stringify(shotTargets)'), '["Пехота А","Пехота Б"]', 'под обстрел попали все, и только юниты целевого гекса');
  equal(s.evalCtx('order.status'), 'completed', 'приказ завершён после залпа');
});

// 25. Дальность огня по готовности динамическая, а 82-мм миномёт имеет дальность 4.
test('огонь по готовности ограничен 3 гексами, артиллерия — максимальной дальностью, миномёт 82 мм — четырьмя', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['operationalFireAtWillRange', 'operationalMediumArtilleryRange', 'getTacticalCrewWeaponRange', 'unitAutoFire']);
  loadModuleFunctions(s, 'js/operational_ui.js', ['operationalWeaponRange', 'parseDraftOptions']);
  s.run(`
    function isMediumArtillery(unit) { return !!unit.medium; }
    function isMortarUnit(unit) { return !!unit.mortar; }
    function artilleryCaliberMm(unit) { return Number(unit.caliber) || 0; }
    function hasAtGunWeapons() { return false; }
    var rifle = { name: 'Взвод пехоты', medium: false };
    var sau = { name: 'САУ', medium: true, mortar: false };
    var mortar82 = { name: 'Батарея миномётов', medium: true, mortar: true, caliber: 82 };
    var rangeValues = [operationalWeaponRange(rifle), operationalWeaponRange(sau), operationalWeaponRange(mortar82)];
    var tacticalRangeValues = [
      getTacticalCrewWeaponRange({ type: 'mortar', name: 'Минометный расчёт 82мм', effectiveRange: 10 }),
      getTacticalCrewWeaponRange({ type: 'mortar', name: 'Минометный расчёт 50мм', effectiveRange: 10 })
    ];
    function canUnitShoot() { return true; }
    function isMortarUnit(unit) { return !!unit.mortar; }
    function artilleryCaliberMm(unit) { return Number(unit.caliber) || 0; }
    function isStaticOpUnit() { return false; }
    function isArmoredUnit() { return false; }
    function getOpHexDistance(a, b, c, d) { return Math.abs(a-c) + Math.abs(b-d); }
    function getNearestOpUnit(list, col, row) { return list.length ? { unit: list[0], dist: getOpHexDistance(col, row, list[0].col, list[0].row) } : null; }
    function mortarRoundsForUnit(_unit, rounds) { return rounds; }
    var mortarShots = [];
    function executeMortarSalvo(unit, targets, distance, rounds) { mortarShots.push({ unit: unit.name, target: targets[0].name, distance, rounds }); }
    var autoMortar = { name: '82-мм батарея', type: 'mortar_battery', medium: true, mortar: true, caliber: 82, col: 0, row: 0, ap: 3 };
    appData.campaign.enemyOpUnits = [{ name: 'Цель на пятом гексе', col: 5, row: 0, detected: true }];
    var autoFireAtFive = unitAutoFire(autoMortar, 10);
    appData.campaign.enemyOpUnits = [{ name: 'Цель на четвёртом гексе', col: 4, row: 0, detected: true }];
    var autoFireAtFour = unitAutoFire(autoMortar, 10);
    var rejectedRange = '';
    try { parseDraftOptions({ category: 'fire_at_will', targetDistance: 4 }, { name: 'Взвод', col: 0, row: 0 }); }
    catch (e) { rejectedRange = e.message; }
  `);
  equal(s.evalCtx('JSON.stringify(rangeValues)'), '[3,10,4]', 'пределы обычного огня, САУ и миномёта верны');
  equal(s.evalCtx('JSON.stringify(tacticalRangeValues)'), '[4,10]', 'тактические 82-мм миномёты тоже ограничены четырьмя гексами');
  equal(s.evalCtx('autoFireAtFive'), false, '82-мм батарея не ведёт огонь за пределами четырёх гексов');
  equal(s.evalCtx('autoFireAtFour'), true, '82-мм батарея успешно открывает огонь в пределах четырёх гексов');
  equal(s.evalCtx('mortarShots.length'), 1, 'операционный огонь по готовности дошёл до залпа');
  includes(s.evalCtx('rejectedRange'), 'не более 3 гексов', 'обычный взвод не может запросить четыре гекса');
  const weapons = fs.readFileSync(path.join(ROOT, 'js/weapons.js'), 'utf8');
  assert(!/effectiveRange\s*:\s*5[^\n]*82/i.test(weapons), 'записи 82-мм миномётов не сохраняют дальность 5');
});

// 26. Завершённые шаги скрывают и чек-лист, и панель следующего шага.
test('после выполнения всех шагов чек-лист и панель следующего шага скрыты', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css/operational_ui.css'), 'utf8');
  includes(html, "panel.style.display = doneCount === CHECKLIST.length ? 'none' : 'flex'", 'чек-лист скрывается при полном выполнении');
  includes(html, "stepBar.style.display = next && !allStepsComplete ? 'flex' : 'none'", 'панель следующего шага скрывается после выполнения всех пунктов');
  includes(css, 'body.op-placement-stage #opMapCanvas', 'стадия развёртывания оформляет карту размещения');
  includes(css, 'touch-action: none', 'сенсорный drag не перехватывается браузерной прокруткой');
});

// 27. Снабжение ограничено дефицитом каждого типа; полные юниты не попадают в список.
test('список получателей снабжения содержит только дефицитные юниты и учитывает уже идущие грузы', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['supplyOrdnanceFull', 'unitAmmoStatus', 'supplyPendingCargoForUnit', 'supplyUnitAmmoDeficits', 'supplyUnitHasIncompleteAmmo', 'supplyUnitList']);
  s.run(`
    const SUPPLY_AMMO_PER_MAN = 8, SUPPLY_GREN_PER_MAN = 2;
    appData.templates = [{ name: 'Пехотный взвод', ammoOrdnance: 5 }];
    var partial = { name: 'Пехотный взвод', squads: [{ name: 'Пехотный взвод', fighters: [{ hp: 3 }, { hp: 3 }], ammoSmall: 10, grenades: 2, ammoOrdnance: 0 }] };
    var full = { name: 'Полный взвод', squads: [{ name: 'Полный взвод', fighters: [{ hp: 3 }], ammoSmall: 8, grenades: 2, ammoOrdnance: 0 }] };
    var supplyPlatoon = { name: 'Взвод снабжения', squads: [] };
    appData.templates.push({ name: 'Полный взвод', ammoOrdnance: 0 });
    appData.campaign.opUnits = [partial, full, supplyPlatoon];
    appData.campaign.supply = { deliveries: [{ kind: 'unit', targetUnitId: 0, cargo: { ammoSmall: 3, grenades: 2, ammoOrdnance: 1 }, status: 'outbound' }] };
    var deficitsAfterPending = supplyUnitAmmoDeficits(partial, 0);
    var recipients = supplyUnitList().map(item => item.idx);
  `);
  equal(s.evalCtx('deficitsAfterPending.ammoSmall'), 3, 'патроны уменьшаются на уже отправленные');
  equal(s.evalCtx('deficitsAfterPending.grenades'), 0, 'гранаты с ожидающей доставкой не запрашиваются повторно');
  equal(s.evalCtx('deficitsAfterPending.ammoOrdnance'), 4, 'снаряды доставляются только в пределах дефицита');
  equal(s.evalCtx('JSON.stringify(recipients)'), '[0]', 'полный юнит и сам взвод снабжения скрыты');
});

// 28. Потеря точки связи останавливает доставку и блокирует маршрут снабжения.
test('захват точки эвакуации прекращает снабжение и создаёт угрозу окружения', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['supplyRearConnectionStatus', 'syncSupplyRearConnection', 'supplyRearConnectionIsLost', 'supplyRearRouteBlocked']);
  s.run(`
    const SUPPLY_EVAC_POINTS = { BeVe: { col: 7, row: 0 }, 'A.I.R.F.': { col: 0, row: 11 } };
    function supplyRearPoint() { return { col: 7, row: 0 }; }
    function getOpHexDistance(a,b,c,d) { return Math.max(Math.abs(a-c), Math.abs(b-d)); }
    function ensureSupplyState() { return appData.campaign.supply; }
    function getSupplyDepotHex() { return { col: 2, row: 2 }; }
    var unitDelivery = { kind: 'unit', status: 'outbound', targetUnitId: 0 };
    appData.campaign.playerFaction = 'BeVe';
    appData.campaign.opUnits = [];
    appData.campaign.enemyOpUnits = [{ name: 'Враг', col: 7, row: 0 }];
    appData.campaign.supply = { rearPointCaptured: false, encirclementThreat: false, deliveries: [unitDelivery] };
    var lostStatus = syncSupplyRearConnection();
    var blocked = supplyRearRouteBlocked();
    appData.campaign.enemyOpUnits = [{ name: 'Враг рядом', col: 6, row: 0 }];
    appData.campaign.opUnits = [{ name: 'Свои', col: 7, row: 0 }];
    var recoveredStatus = syncSupplyRearConnection();
  `);
  equal(s.evalCtx('lostStatus.lost'), true, 'враг на точке фиксирует её потерю');
  equal(s.evalCtx('lostStatus.threatened'), true, 'потерянная точка отмечена как угроза окружения');
  equal(s.evalCtx('unitDelivery.status'), 'returning', 'уже идущая доставка отзывается');
  equal(s.evalCtx('unitDelivery.returnReason'), 'rear_connection_lost', 'возврат связан с потерей тыла');
  equal(s.evalCtx('blocked'), true, 'маршрут к тылу блокируется');
  equal(s.evalCtx('recoveredStatus.lost'), false, 'занятие точки своим подразделением восстанавливает связь');
  equal(s.evalCtx('recoveredStatus.threatened'), true, 'соседняя вражеская угроза отдельно отображается');
});

// 29. Цели Валенсии учитывают срок 05:00, удержание, уничтожение DOTs и бонусы.
test('основные и дополнительные задачи сценария оцениваются по времени и сохраняют бонусы', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['campaignObjectiveDefinitions', 'ensureCampaignObjectiveState', 'campaignObjectiveHexControl', 'campaignObjectiveUnitIsNeutralized', 'campaignObjectiveRoadDotsDestroyed', 'campaignObjectiveSetStatus', 'updateCampaignObjectives']);
  const objectiveDefs = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/const CAMPAIGN_OBJECTIVE_DEFINITIONS = \{[\s\S]*?\n\};/);
  assert(objectiveDefs, 'scenario objective definition exists');
  s.run(objectiveDefs[0]);
  s.run(`
    appData.campaign.scenario = 'valencia';
    appData.campaign.playerFaction = 'A.I.R.F.';
    appData.campaign.currentTime = 0;
    appData.campaign.opUnits = [
      { name: 'Взвод на цели', col: 11, row: 8 },
      { name: 'Взвод удержания', col: 7, row: 0 }
    ];
    appData.campaign.enemyOpUnits = [
      { name: 'ДОТ Bosh', col: 4, row: 7, isDestroyed: false },
      { name: 'ДОТ Van Hees', col: 8, row: 10, isDestroyed: false }
    ];
    var state = updateCampaignObjectives(false);
    for (var i = 0; i < 6; i++) { appData.campaign.currentTime += 10; state = updateCampaignObjectives(true); }
    var heldAfterHour = state.status.airf_hold_7_0;
    appData.campaign.enemyOpUnits = [];
    updateCampaignObjectives(false);
    var dotsDoneAfterRemoval = state.status.airf_destroy_dots;
    for (var j = 6; j < 30; j++) { appData.campaign.currentTime += 10; state = updateCampaignObjectives(true); }
    var scenarioResult = appData.campaign.scenarioOutcome;
    var unlockedIds = (appData.campaign.scenarioBonusUnlocks || []).map(item => item.id);
  `);
  equal(s.evalCtx('heldAfterHour'), 'completed', 'дополнительное удержание завершается после 60 минут');
  equal(s.evalCtx('dotsDoneAfterRemoval'), 'completed', 'уничтоженные и удалённые DOTs распознаются по сохранённому списку');
  equal(s.evalCtx('state.status.airf_capture_11_8'), 'completed', 'основная цель A.I.R.F. удержана к 05:00');
  equal(s.evalCtx('scenarioResult'), 'victory', 'основные задачи определяют победу');
  assert(JSON.parse(s.evalCtx('JSON.stringify(unlockedIds)')).includes('airf_destroy_dots'), 'выполненная дополнительная задача сохранена как бонус');

  const b = createSandbox(freshAppData());
  loadHtml(b, ['campaignObjectiveDefinitions', 'ensureCampaignObjectiveState', 'campaignObjectiveHexControl', 'campaignObjectiveUnitIsNeutralized', 'campaignObjectiveRoadDotsDestroyed', 'campaignObjectiveSetStatus', 'updateCampaignObjectives']);
  b.run(objectiveDefs[0]);
  b.run(`
    appData.campaign.scenario = 'valencia'; appData.campaign.playerFaction = 'BeVe'; appData.campaign.currentTime = 0;
    appData.campaign.opUnits = [{ name: 'Свои 11,8', col: 11, row: 8 }, { name: 'Свои DOT 1', col: 4, row: 7 }, { name: 'Свои DOT 2', col: 8, row: 10 }];
    appData.campaign.enemyOpUnits = [{ name: 'Противник', col: 7, row: 0 }];
    var beveState = updateCampaignObjectives(false);
    for (var k = 0; k < 7; k++) { appData.campaign.currentTime += 10; beveState = updateCampaignObjectives(true); }
    var enemyHoldFailed = beveState.status.beve_enemy_hold_7_0;
    for (var m = 7; m < 30; m++) { appData.campaign.currentTime += 10; beveState = updateCampaignObjectives(true); }
  `);
  equal(b.evalCtx('enemyHoldFailed'), 'failed', 'удержание врагом больше часа проваливает главную задачу BeVe');
  equal(b.evalCtx('beveState.status.beve_hold_11_8'), 'completed', 'BeVe контролирует основной гекс к 05:00');
  equal(b.evalCtx('appData.campaign.scenarioOutcome'), 'defeat', 'провал основной цели отменяет победу сценария');
  equal(b.evalCtx('beveState.status.beve_hold_dot_hexes'), 'completed', 'удержание обоих гексов DOT засчитывается отдельно');
});

// 30. Первая танковая атака BeVe фиксируется один раз и провал не сбрасывается позже.
test('первая танковая атака BeVe фиксирует победу или окончательный провал', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['campaignObjectiveDefinitions', 'ensureCampaignObjectiveState', 'campaignObjectiveSetStatus', 'registerFirstBeVeTankBattle', 'resolveFirstBeVeTankBattle']);
  const objectiveDefs = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/const CAMPAIGN_OBJECTIVE_DEFINITIONS = \{[\s\S]*?\n\};/);
  assert(objectiveDefs, 'scenario objective definition exists');
  s.run(objectiveDefs[0]);
  s.run(`
    appData.campaign.scenario = 'valencia'; appData.campaign.playerFaction = 'BeVe'; appData.campaign.currentTime = 0;
    var firstTank = { name: 'Лёгкий танк CL/39', faction: 'A.I.R.F.', fighters: [{ hp: 3 }] };
    var battle = { id: 10, enemySquads: [firstTank] };
    var registered = registerFirstBeVeTankBattle(battle, [{ name: 'Танковый взвод', faction: 'A.I.R.F.', type: 'tank_platoon' }]);
    appData.map = { enemySquads: [{ name: 'Лёгкий танк CL/39', isDestroyed: true, fighters: [{ hp: 0 }] }] };
    var won = resolveFirstBeVeTankBattle(battle, true, false);
    var statusAfterWin = appData.campaign.objectiveProgress.status.beve_first_tank_battle;
    appData.campaign.objectiveProgress = null;
    var otherState = ensureCampaignObjectiveState();
    var failedBattle = { id: 11, enemySquads: [{ name: 'Танк Т-26', fighters: [{ hp: 3 }] }] };
    registerFirstBeVeTankBattle(failedBattle, [{ name: 'Танк Т-26', faction: 'A.I.R.F.', type: 'tank_platoon' }]);
    var lost = resolveFirstBeVeTankBattle(failedBattle, false, true);
    var cannotReplaceFirst = registerFirstBeVeTankBattle({ id: 12 }, [{ name: 'Танк №2', faction: 'A.I.R.F.', type: 'tank_platoon' }]);
  `);
  equal(s.evalCtx('registered'), true, 'танковый бой распознан как первая атака');
  equal(s.evalCtx('won'), true, 'победа с уничтожением всех танков завершает задачу');
  equal(s.evalCtx('statusAfterWin'), 'completed', 'задача получила статус выполненной');
  equal(s.evalCtx('lost'), false, 'поражение/отступление не засчитывается победой');
  equal(s.evalCtx('otherState.firstTankBattle.status'), 'failed', 'провал первой атаки сохранён');
  equal(s.evalCtx('cannotReplaceFirst'), false, 'последующий бой не заменяет первый');
});

// 31. Награды автоматически выдаются по критериям, дубли не добавляются.
test('автоматические критерии выдают фракционные награды, а Интербригада — двум выбранным отделениям', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalAwardDefinitions', 'resolveTacticalAward', 'grantTacticalAwardToFighter', 'grantTacticalAwardToLivingSquad', 'applyInterbrigadeAwards', 'ensureTacticalAwardProgress', 'recordTacticalAwardEnemyDefeat', 'recordTacticalAwardCombatEvent', 'recordDaggerApproachIfEligible', 'tacticalAwardSquadFled', 'tacticalAwardGroupKey', 'checkAndGrantTacticalAwards', 'assignAwardToFighter']);
  s.run(`
    appData.factions = { BeVe: { awards: BEVE_AWARDS }, 'A.I.R.F.': { awards: AIRF_AWARDS } };
    var beve = { name: 'Пехотное отделение', opUnitName: 'BeVe взвод', faction: 'BeVe', fighters: [{ name: 'Боец 1', hp: 1 }, { name: 'Боец 2', hp: 1 }],
      awardProgress: { defeatedEnemies: { a: 1, b: 1, c: 1, d: 1, e: 1 }, combatEvents: { m1: 1, m2: 1, g1: 1 }, daggerApproachEligible: false } };
    var initialAirf = { name: 'Саперное отделение №1', opUnitName: 'AIRF взвод', faction: 'A.I.R.F.', fighters: Array.from({ length: 10 }, (_, i) => ({ name: 'initial ' + i, hp: 3 })) };
    var airf = { name: 'Саперное отделение №1', opUnitName: 'AIRF взвод', faction: 'A.I.R.F.', fighters: [
      { name: 'Командир', hp: 1, isCommander: true }, { name: 'Сапер 1', hp: 2, sapperChargeSuccess: true },
      { name: 'Сапер 2', hp: 3 }, { name: 'Сапер 3', hp: 3 }, { name: 'Сапер 4', hp: 3 }, { name: 'Пулеметчик', hp: 3 }, { name: 'Погибший', hp: 0 }
    ], awardProgress: { defeatedEnemies: {}, combatEvents: {}, daggerApproachEligible: true } };
    var battle = { awardInitialPlayerSquads: [initialAirf] };
    var beveAwardsGranted = checkAndGrantTacticalAwards({ awardInitialPlayerSquads: [] }, [beve], true);
    var airfAwardsGranted = checkAndGrantTacticalAwards(battle, [airf], false);
    checkAndGrantTacticalAwards({ awardInitialPlayerSquads: [] }, [beve], true);
    var currentSquad = beve;
    var manualAward = assignAwardToFighter(0, 'colonial');
    var deniedManualAward = assignAwardToFighter(0, 'valor');
    var interUnit = { name: 'AIRF volunteers', interbrigadeSquadNames: ['Добровольцы №1', 'Добровольцы №2'] };
    var volunteers = ['Добровольцы №1', 'Добровольцы №2', 'Добровольцы №3'].map(name => ({ name, faction: 'A.I.R.F.', fighters: [{ name: name + ' боец', hp: 3 }] }));
    applyInterbrigadeAwards(volunteers, interUnit);
  `);
  const beveAwards = JSON.parse(s.evalCtx('JSON.stringify(beve.fighters.map(f => f.awards || []))'));
  for (const award of ['wound', 'valor', 'melee', 'leopold']) assert(beveAwards.flat().includes(award), `BeVe получает награду ${award}`);
  equal(beveAwards[0].filter(id => id === 'valor').length, 1, 'повторная проверка не выдаёт дубликат');
  const airfAwards = JSON.parse(s.evalCtx('JSON.stringify(airf.fighters.map(f => f.awards || []))'));
  assert(airfAwards[0].includes('wound_airf') && airfAwards[0].includes('red_sun') && airfAwards[0].includes('loyalty') && airfAwards[0].includes('dagger'), 'командир AIRF получает положенные командирские и боевые награды');
  assert(airfAwards[1].includes('sapper') && airfAwards[1].includes('dagger'), 'выживший сапёр получает медаль и знак за скрытное сближение');
  equal(s.evalCtx('manualAward'), true, 'ручная награда с ручным критерием разрешена');
  equal(s.evalCtx('deniedManualAward'), false, 'награду с боевым критерием нельзя назначить вручную');
  assert(JSON.parse(s.evalCtx('JSON.stringify(volunteers.map(s => s.fighters[0].awards || []))')).slice(0,2).every(a => a.includes('interbrigade')), 'обе выбранные группы Интербригады получили награду');
  equal(s.evalCtx('volunteers[2].fighters[0].awards'), undefined, 'третья группа Интербригады не награждена');
});

console.log(`\nИтог пользовательских исправлений: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exitCode = 1;
