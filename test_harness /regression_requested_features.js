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

// 1. Карты и автоматический дебафф не протекают из каталога противника.
test('карты тактического боя и авто-дебаффы ограничены фракцией игрока', () => {
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
      { name: 'AIRF bonus 3', type: 'bonus' }, { name: 'AIRF bonus 4', type: 'bonus' },
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
  equal(autoAssigned.length, 1, 'четыре бонуса добавляют один автоматический дебафф');
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
  loadModuleFunctions(s, 'js/operational_ui.js', ['parseMinuteInput', 'timeField', 'parseDraftOptions']);
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

console.log(`\nИтог пользовательских исправлений: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exitCode = 1;
