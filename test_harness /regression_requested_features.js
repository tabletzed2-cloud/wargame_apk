// Регрессия пользовательских исправлений тактической карты и снабжения.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData, setRandom, sliceFunction } = require('./sandbox');
const { HTML, ROOT, sliceConst } = require('./extract');

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
test('термитный заряд выдаётся всем сапёрным отделениям взвода AIRF (v13.094 п.11)', () => {
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
  equal(s.evalCtx('targetSpec'), null, 'выбор целей не нужен — заряды получают все сапёрные отделения');
  equal(s.evalCtx('sappers[0].thermiteCharges'), 3, 'первый сапёр получает три заряда');
  equal(s.evalCtx('sappers[1].thermiteCharges'), 3, 'второй сапёр получает три заряда');
  equal(s.evalCtx('sappers[2].thermiteCharges'), 3, 'третий сапёр тоже получает заряды (всем отделениям взвода)');
  equal(s.evalCtx('sappers[3].thermiteCharges'), undefined, 'карта не выдаётся другой фракции');
  includes(s.evalCtx('cardDesc'), 'Все сапёрные отделения взвода', 'описание карты соответствует эффекту');
});

// 5. Три указанных гекса входят в стартовую/расстановочную зону BeVe.
test('в уже идущем бою меню окопов скрыто, если очки расстановки израсходованы', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    appData.currentBattleId = 77;
    appData.campaign.activeBattles = [{ id: 77, hexKey: '4,4' }];
    appData.campaign.hexOverlays = { '4,4': { trenchPoints: 0, prepPoints: 0, hexEdits: { '1,1': 'trenches' } } };
    renderHexEditsPanel();
  `);
  equal(s.elements.battleHexEditsPanel.style.display, 'none', 'при уже размещённых окопах и нулевом бюджете battle-панель скрыта');
  assert(!s.elements.battleHexEditsPanel.innerHTML.includes('Расставить окопы'), 'в бою не предлагается повторная расстановка');
  s.run(`appData.campaign.hexOverlays['4,4'].prepPoints = 2; renderHexEditsPanel();`);
  equal(s.elements.battleHexEditsPanel.style.display, 'block', 'панель доступна, если осталась подготовка позиций');
  assert(s.elements.battleHexEditsPanel.innerHTML.includes('Подготовка позиций'), 'доступное действие подготовки не скрывается');
  assert(!s.elements.battleHexEditsPanel.innerHTML.includes('Текстура/поворот окопов'), 'в бою редактор окопов не показывается повторно');
  s.run(`appData.campaign.hexOverlays['4,4'].trenchPoints = 1; renderHexEditsPanel();`);
  assert(s.elements.battleHexEditsPanel.innerHTML.includes('Расставить окопы (1)'), 'новые неиспользованные очки по-прежнему дают право расставить окопы');
});

test('онлайн-работы противника по окопам и расчистке скрыты до раскрытия гекса', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['opMarkerIsFogged']);
  s.run(`
    appData.campaign.playerFaction = 'BeVe';
    appData.campaign.activeBattles = [];
    appData.campaign.hexOverlays = {};
    appData.campaign.opMapGrid = {
      '6,6': { markers: ['trenches'], markerOwners: { trenches: 'A.I.R.F.' } }
    };
    var ONLINE = { role: 'p2' };
    TACTICAL_HEX_MAPS['1,2'] = { grid: {
      '0,0': { type: 'grass' }, '1,1': { type: 'forest' }, '2,2': { type: 'bushes' }
    } };
    var enemyWorks = {
      '1,2': {
        hexEdits: { '0,0': 'trenches', '1,1': 'fallen_forest', '2,2': 'grass' },
        hexVariants: {}, hexRotations: { '0,0': 60 },
        hexEditSources: { '0,0': 'trenches', '1,1': 'prep' },
        initialFortifications: { trenchCells: ['3,3'], dotCells: [] },
        trenchPoints: 5, prepPoints: 4, shellings: 1
      }
    };
    var hiddenMergeChanged = mergeHexOverlays(enemyWorks);
    var hiddenOverlay = JSON.parse(JSON.stringify(appData.campaign.hexOverlays['1,2']));
    var hiddenOperationalMarker = opMarkerIsFogged('trenches', 6, 6);
    appData.campaign.fogRevealedHexes = ['1,2', '6,6'];
    var revealedMergeChanged = mergeHexOverlays(enemyWorks);
    var revealedOverlay = JSON.parse(JSON.stringify(appData.campaign.hexOverlays['1,2']));
    var revealedOperationalMarker = opMarkerIsFogged('trenches', 6, 6);
  `);
  equal(s.evalCtx('Object.keys(hiddenOverlay.hexEdits).length'), 0, 'до боя не приняты правки окопов и расчистки');
  equal(s.evalCtx('hiddenOverlay.initialFortifications.trenchCells.length'), 0, 'скрыты и начальные вражеские траншеи');
  equal(s.evalCtx('hiddenOverlay.trenchPoints'), 0, 'не синхронизируется бюджет вражеских работ');
  equal(s.evalCtx('hiddenOperationalMarker'), true, 'вражеская оперативная метка скрыта туманом');
  equal(s.evalCtx("revealedOverlay.hexEdits['0,0']"), 'trenches', 'после раскрытия доступны траншеи');
  equal(s.evalCtx("revealedOverlay.hexEdits['1,1']"), 'fallen_forest', 'после раскрытия доступна расчистка леса');
  equal(s.evalCtx("revealedOverlay.hexEdits['2,2']"), 'grass', 'старый cloud без источника распознаёт расчистку кустов');
  equal(s.evalCtx('revealedOverlay.initialFortifications.trenchCells[0]'), '3,3', 'после боя синхронизируется начальная траншея');
  equal(s.evalCtx('revealedOperationalMarker'), false, 'после раскрытия оперативная метка видна');
});

test('8: оперативные юниты остаются доступными для выбора после смены отряда и сброса маршрута', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['handleOpMapClick']);
  s.run(`
    var OP_HEX_SIZE = 55, pickingTargetHex = false;
    function canvasBackingScale() { return 1; }
    function tryMoveSelectedOpUnitToHex() { return false; }
    function updateDismountPanel() {} function updateBtrPanel() {} function updateVehiclePanel() {}
    function renderVehicleStatus() {} function showContactModal() {}
    var firstUnit = { name:'Первый взвод', type:'infantry_platoon', col:2, row:2, ap:4, availableHexes:[{col:12,row:12}] };
    var secondUnit = { name:'Второй взвод', type:'infantry_platoon', col:4, row:2, ap:4 };
    appData.campaign.opMapMode = 'view';
    appData.campaign.opZoomLevel = 1;
    appData.campaign.opUnits = [firstUnit, secondUnit];
    appData.campaign.enemyOpUnits = [];
    appData.campaign.opCenters = [
      {key:'2,2', x:2*Math.sqrt(3)*55 + Math.sqrt(3)*55/2, y:2*1.5*55+55},
      {key:'4,2', x:4*Math.sqrt(3)*55 + Math.sqrt(3)*55/2, y:2*1.5*55+55}
    ];
    var canvas = document.getElementById('opMapCanvas'); canvas.width=1000; canvas.height=1000;
    canvas.getBoundingClientRect = () => ({left:0,top:0,width:1000,height:1000});
    var scale = Math.sqrt(3)*55;
    handleOpMapClick({clientX: 2*scale + scale/2, clientY: 2*1.5*55+55});
    var firstSelected = appData.campaign.selectedOpUnit === firstUnit;
    handleOpMapClick({clientX: 4*scale + scale/2, clientY: 2*1.5*55+55});
    var secondSelected = appData.campaign.selectedOpUnit === secondUnit;
    var oldRouteCleared = !firstUnit.availableHexes;
  `);
  equal(s.evalCtx('firstSelected'), true, 'первый взвод можно выбрать на карте');
  equal(s.evalCtx('secondSelected'), true, 'следующий взвод выбирается обычным кликом');
  equal(s.evalCtx('oldRouteCleared'), true, 'смена выбора очищает устаревшую подсветку маршрута');
});

test('онлайн-потери от огня/рукопашной считаются один раз и отображаются в начале фазы игрока', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalRecordIncomingCasualty', 'tacticalBeginPlayerTurn']);
  loadModule(s, 'js/online_battles.js');
  s.run(`
    function getMaxAP() { return 6; }
    appData.campaign.online = true;
    appData.map = { grid: { }, enemySquads: [] };
    var localSquad = { name: 'Мой отряд', fighters: [
      { name: 'Боец 1', hp: 1, maxHp: 1 }, { name: 'Боец 2', hp: 1, maxHp: 1 }
    ], currentMorale: 5, baseMorale: 5 };
    var onlineBattle = { id: 1, hexKey: '3,3', onlineOppBattleId: 2, activeSide: 'enemy',
      phaseRevision: 0, currentTurn: 1, playerSquads: [localSquad], enemySquads: [],
      tacticalMap: { grid: {}, enemySquads: [] } };
    appData.campaign.activeBattles = [onlineBattle];
    var enemySnapshot = { id: 2, oppBattleId: 1, status: 'active', turn: 2,
      phaseRevision: 1, activeSide: 'attacker', squads: [], dmgOut: { 'Мой отряд': [1, 1] } };
    var incomingMergeChanged = onlineMergeOppBattle(onlineBattle, enemySnapshot);
    var lossesAfterFirstMerge = localSquad.lossesAtTurnStart;
    var pendingAfterStart = localSquad.pendingCombatLosses;
    var duplicateMergeChanged = onlineMergeOppBattle(onlineBattle, enemySnapshot);
    var lossesAfterDuplicate = localSquad.lossesAtTurnStart;
  `);
  equal(s.evalCtx('incomingMergeChanged'), true, 'приняты входящий урон и смена фазы');
  equal(s.evalCtx("onlineBattle.activeSide"), 'player', 'противник передал ход игроку');
  equal(s.evalCtx('lossesAfterFirstMerge'), 2, 'две гибели от входящего онлайн-урона показаны на начале фазы');
  equal(s.evalCtx('pendingAfterStart'), 0, 'учтённые потери перенесены из очереди в бейдж текущего хода');
  equal(s.evalCtx('duplicateMergeChanged'), false, 'повторный снимок не применяется второй раз');
  equal(s.evalCtx('lossesAfterDuplicate'), 2, 'дубликат не удваивает счётчик потерь');
});

test('тактическая иконка рисует число потерь и статусы «подавлен»/«бегут»', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['drawHex']);
  s.run(`
    if (typeof loadedImages === 'undefined') globalThis.loadedImages = {};
    if (typeof loadedMarkerImages === 'undefined') globalThis.loadedMarkerImages = {};
    if (typeof drawTacticalSmokeOverlay !== 'function') globalThis.drawTacticalSmokeOverlay = function() {};
    getAP = function() { return 2; };
    getMaxAP = function() { return 6; };
    appData.squads = [{ name: 'Пехота', fighters: [], detected: true, lossesAtTurnStart: 2,
      suppressed: true, isRouting: true }];
    appData.map = { mode: 'view', enemySquads: [], selectedMoveSquadIdx: -1 };
    globalThis.__r21DrawCalls = [];
    globalThis.__r21Canvas = new Proxy({}, { get: function(t, k) {
      if (k === 'fillText') return function(text) { __r21DrawCalls.push(String(text)); };
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return function() { return { addColorStop: function() {} }; };
      return function() {};
    }, set: function() { return true; } });
    drawHex(__r21Canvas, 0, 0, 50, { type: 'grass', squadIds: [0], enemySquadIds: [], markers: [] }, '0,0');
  `);
  equal(s.evalCtx("__r21DrawCalls.includes('2')"), true, 'над иконкой нарисовано число потерь');
  equal(s.evalCtx("__r21DrawCalls.includes('👁️💫🏃')"), true, 'на иконке отображаются обнаружение, подавление и бегство');
});

test('зона стартовых позиций BeVe включает 11,8, 10,7 и 9,6', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['pointInPolygon', 'zoneExtraHexes', 'isHexInPlacementZone']);
  s.run(`
    var beveZoneExtras = zoneExtraHexes('valencia', 'BeVe');
    var requestedBeveHexes = [[11, 8], [10, 7], [9, 6]];
    var requestedBeveAllowed = requestedBeveHexes.map(([col, row]) => isHexInPlacementZone('valencia', 'BeVe', col, row).ok);
  `);
  equal(s.evalCtx('JSON.stringify(beveZoneExtras)'), '[[2,7],[3,7],[4,7],[11,8],[10,7],[9,6],[10,6],[9,5]]', 'явные гексы расстановки включают 11,8/10,7/9,6 и добавленные в v13.094 10,6/9,5');
  equal(s.evalCtx('requestedBeveAllowed.every(Boolean)'), true, 'каждый указанный гекс допустим для размещения BeVe');
});

test('удалённые гексы и нижняя линия отсутствуют только на оперативной карте Валенсии', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    var removedOperationalHexes = SCENARIO_REMOVED_HEXES.valencia.slice();
    var allRemovedReject = removedOperationalHexes.every(key => {
      const [col, row] = key.split(',').map(Number);
      return isHexRemovedFromOperationalMap('valencia', col, row) && !isHexInPlayableArea('valencia', col, row);
    });
    var unaffectedOperationalHexes = !isHexRemovedFromOperationalMap('other', 12, 1) && isHexInPlayableArea('other', 12, 1);
  `);
  equal(s.evalCtx('removedOperationalHexes.length'), 20, 'список содержит семь точечных гексов и линию 0,14–12,14');
  equal(s.evalCtx('allRemovedReject'), true, 'удалённые позиции не считаются игровыми гексами операционной карты');
  equal(s.evalCtx('unaffectedOperationalHexes'), true, 'удаление ограничено сценарием Валенсии');
  const terrain = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/valencia_terrain.json'), 'utf8'));
  for (const key of ['12,1', '12,3', '12,5', '12,7', '12,9', '12,11', '12,13', ...Array.from({ length: 13 }, (_, i) => `${i},14`)]) {
    assert(!Object.prototype.hasOwnProperty.call(terrain, key), `террейн удалённого гекса ${key} убран из оперативной карты`);
  }
  assert(fs.existsSync(path.join(ROOT, 'maps/Карты Валенсия')), 'тактическая коллекция карт Валенсии не удалялась');
});

test('сектора ДОТа разделены по орудиям и ограничивают выбор цели', () => {
  const s = createSandbox(freshAppData());
  loadModuleFunctions(s, 'js/map_actions.js', [
    'mapActionCrewWeapons', 'mapActionDotCrewIndices', 'mapActionEnemyAlive', 'mapActionEnemyIsVehicle', 'mapActionEvalTarget'
  ]);
  s.run(`
    function getFactionCrewWeapons() { return [{ name: 'Пулемёт амбразуры 1', type: 'mg' }]; }
    function getTacticalCoverInfoForEnemy() { return null; }
    function tacticalEnemyHexHasFriendlies() { return null; }
    function tacticalIsMeleeEngaged() { return false; }
    function tacticalSmokeBlocksSight() { return false; }
    function smallArmsBlockedByForest() { return false; }
    var dot = { name: 'ДОТ Bosh', faction: 'BeVe', crewInstances: [{ weaponName: 'Пулемёт амбразуры 1' }],
      fixedTacticalPosition: { hexKey: '5,5', key: '5,5', weaponSectors: { '0': 'e' } } };
    var enemy = { name: 'Вражеский взвод', fighters: [{ hp: 3 }], detected: true };
    appData.squads = [dot];
    appData.map = { grid: {
      '5,5': { squadIds: [0], enemySquadIds: [] },
      '8,5': { squadIds: [], enemySquadIds: [0] },
      '2,5': { squadIds: [], enemySquadIds: [] }
    }, enemySquads: [enemy] };
    var eastTarget = mapActionEvalTarget({ id: 'dotmg', targets: 'infantry' }, 0, 0, 0);
    appData.map.grid['8,5'].enemySquadIds = [];
    appData.map.grid['2,5'].enemySquadIds = [0];
    var westTarget = mapActionEvalTarget({ id: 'dotmg', targets: 'infantry' }, 0, 0, 0);
  `);
  equal(s.evalCtx('eastTarget.ok'), true, 'цель в восточном секторе разрешена');
  equal(s.evalCtx('westTarget.ok'), false, 'цель за спиной не разрешена');
  includes(s.evalCtx('westTarget.reason'), 'сектора', 'причина отказа указывает на сектор амбразуры');
});

test('«Скоординированный заградительный огонь» подавляет вторую цель на том же/смежном гексе без затрат', () => {
  const s = createSandbox(freshAppData());
  loadModule(s, 'js/map_actions.js');
  s.run(`
    function hexGridDistance(a,b,c,d) { return Math.abs(a-c)+Math.abs(b-d); }
    function getBattleSquadHex(grid,index,isEnemy) {
      var field=isEnemy?'enemySquadIds':'squadIds';
      var key=Object.keys(grid).find(k=>(grid[k][field]||[]).includes(index));
      if(!key)return null;var xy=key.split(',').map(Number);return {key,col:xy[0],row:xy[1]};
    }
    function getTacticalCoverInfoForEnemy() { return {mod:0}; }
    function tacticalEnemyHexHasFriendlies() { return null; }
    function tacticalIsMeleeEngaged() { return false; }
    function smallArmsBlockedByForest() { return null; }
    function renderMapActionPanel() {} function redrawMap() {} function saveData() {} function log() {}
    var support={name:'Отделение поддержки',appliedCards:['Скоординированный заградительный огонь'],ammoSmall:9,fighters:[{hp:3}]};
    var first={name:'Цель 1',detected:true,fighters:[{hp:3}]};
    var adjacent={name:'Цель 2',detected:true,fighters:[{hp:3}]};
    var distant={name:'Цель 3',detected:true,fighters:[{hp:3}]};
    appData.squads=[support]; actionPoints=[{ap:5,maxAp:5}];
    appData.map={grid:{
      '1,1':{squadIds:[0],enemySquadIds:[]},'3,1':{squadIds:[],enemySquadIds:[0]},
      '4,1':{squadIds:[],enemySquadIds:[1]},'7,1':{squadIds:[],enemySquadIds:[2]}
    },enemySquads:[first,adjacent,distant],selectedMoveSquadIdx:0,
      pendingMapAttack:{type:'coordinatedSuppressiveFollowup',extra:{firstTargetIdx:0},squadIdx:0}};
    var canUse=mapActionCanUseCoordinatedBarrage(support);
    var adjacentEval=mapActionEvalTarget(mapActionDefById('coordinatedSuppressiveFollowup'),0,1,{firstTargetIdx:0});
    var distantEval=mapActionEvalTarget(mapActionDefById('coordinatedSuppressiveFollowup'),0,2,{firstTargetIdx:0});
    mapPickTarget(1);
  `);
  equal(s.evalCtx('canUse'), true, 'поддержка с картой может сделать дополнительное подавление');
  equal(s.evalCtx('adjacentEval.ok'), true, 'смежная цель разрешена');
  equal(s.evalCtx('distantEval.ok'), false, 'цель через гекс не разрешена');
  equal(s.evalCtx('adjacent.suppressed'), true, 'вторая цель подавлена');
  equal(s.evalCtx('support.ammoSmall'), 9, 'дополнительные патроны не тратятся');
  equal(s.evalCtx('actionPoints[0].ap'), 5, 'дополнительные ОД не тратятся');
});

test('дым скрывает отряд, блокирует обнаружение и стрельбу и истекает по сроку', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceConst(HTML, 'TACTICAL_SMOKE_DURATION_PHASES'));
  loadHtml(s, [
    'tacticalCubeRound', 'tacticalHexLineKeys', 'tacticalSmokeActiveClouds', 'tacticalHexIsSmoky',
    'tacticalSmokeBlocksSight', 'tacticalSquadBattlePosition', 'tacticalSmokeBlocksAttack',
    'tacticalSmokeAllEnemyObserversBlocked', 'tacticalApplySmokeConcealment', 'tacticalCreateSmokeCloud',
    'tacticalExpireSmoke', 'tacticalMergeSmokeClouds', 'tacticalSmokeWindDestination', 'deploySmokeScreen', 'autoDetectOneSquad'
  ]);
  loadModuleFunctions(s, 'js/map_actions.js', ['mapActionEnemyAlive', 'mapActionEnemyIsVehicle', 'mapActionEvalTarget']);
  s.run(`
    function getTacticalCoverInfoForEnemy() { return null; }
    function tacticalEnemyHexHasFriendlies() { return null; }
    function tacticalIsMeleeEngaged() { return false; }
    function smallArmsBlockedByForest() { return false; }
    var smokeGrid = {};
    for (var row = 0; row < 5; row++) for (var col = 0; col < 5; col++) smokeGrid[col + ',' + row] = { squadIds: [], enemySquadIds: [] };
    var observer = { name: 'Наш отряд', fighters: [{ hp: 3 }], detected: true };
    var smokedEnemy = { name: 'Враг', fighters: [{ hp: 3 }], detected: true, actionsThisTurn: { shots: 2 } };
    smokeGrid['0,2'].squadIds = [0]; smokeGrid['4,2'].enemySquadIds = [0];
    appData.squads = [observer];
    appData.map = { grid: smokeGrid, enemySquads: [smokedEnemy], smokeClouds: [] };
    var cloud = tacticalCreateSmokeCloud('2,2', 'player');
    var lineBlocked = tacticalSmokeBlocksSight('0,2', '4,2', appData.map);
    var enemyHidden = smokedEnemy.detected === false;
    autoDetectOneSquad(smokedEnemy, 'враг');
    var hiddenAfterDetection = smokedEnemy.detected === false;
    smokedEnemy.detected = true;
    var shotEval = mapActionEvalTarget({ id: 'smallArms', targets: 'any', small: true }, 0, 0);
    var cloudExpired = tacticalExpireSmoke(3);
    var smokeGone = !tacticalHexIsSmoky('2,2', appData.map, 3);
  `);
  equal(s.evalCtx('cloud.center'), '2,2', 'облако привязано к целевому гексу');
  assert(s.evalCtx('cloud.hexes.length') > 1, 'дым покрывает несколько соседних гексов');
  equal(s.evalCtx('lineBlocked'), true, 'дым на линии блокирует обзор');
  equal(s.evalCtx('enemyHidden'), true, 'отряд за дымом скрывается сразу');
  equal(s.evalCtx('hiddenAfterDetection'), true, 'автообнаружение не раскрывает отряд в дыму');
  equal(s.evalCtx('shotEval.ok'), false, 'цель за дымом нельзя обстрелять');
  includes(s.evalCtx('shotEval.reason'), 'дымом', 'отказ объясняет перекрытие дымом');
  equal(s.evalCtx('cloudExpired'), true, 'истекшее облако удалено');
  equal(s.evalCtx('smokeGone'), true, 'после срока гексы больше не считаются дымными');
  s.run(`
    var smokeThrower = { name: 'Наш пехотный отряд', fighters: [{hp:3}], smokeGrenades: 3, armor: null };
    appData.squads = [smokeThrower];
    appData.map.smokeClouds = [];
    appData.map.grid['0,2'].squadIds = [0];
    var currentSquad = smokeThrower, currentSquadIndex = 0, currentTurn = 1;
    function tacticalActionAllowed() { return true; }
    function spendAP() { return true; }
    function rollD12() { return 3; }
    deploySmokeScreen();
    var smokeActionCenter = appData.map.smokeClouds[0] && appData.map.smokeClouds[0].center;
  `);
  equal(s.evalCtx('smokeActionCenter'), '1,2', 'действие дымовых гранат создаёт облако с учётом сноса ветром на один гекс');
  equal(s.evalCtx('smokeThrower.smokeGrenades'), 0, 'за облако списываются три дымовые гранаты');
  loadHtml(s, ['throwGrenades']);
  s.run(`
    var phosphorusThrower = { name: 'Фосфорный отряд', fighters: [{hp:3},{hp:3},{hp:3},{hp:3}],
      grenades: 7, effects: { phosphorusGrenades: true }, armor: null };
    appData.squads = [phosphorusThrower];
    appData.map.smokeClouds = [];
    appData.map.grid['0,2'].squadIds = [0];
    appData.map.attackTargetEnemyIdx = null;
    currentSquad = phosphorusThrower; currentSquadIndex = 0; currentTurn = 1;
    var phosRolls = [8,8,8,1], phosRollIndex = 0;
    function rollD10() { return phosRolls[phosRollIndex++]; }
    function getTacticalTargetDistance() { return 1; }
    function getEffectiveMorale() { return 5; }
    function getSuppressionThreshold() { return 2; }
    function getScopedActiveModifiersForSquad() { return []; }
    function getActionCost() { return 1; }
    function reportAttackOutcome() {}
    throwGrenades();
    var cloudAfterThreeHits = appData.map.smokeClouds.length;
    phosRolls = [8,8,8,8]; phosRollIndex = 0; phosphorusThrower.grenades = 7;
    throwGrenades();
    var cloudAfterFourHits = appData.map.smokeClouds.length;
  `);
  equal(s.evalCtx('cloudAfterThreeHits'), 0, 'фосфорный залп менее чем с четырьмя попаданиями не создаёт облако');
  equal(s.evalCtx('cloudAfterFourHits'), 1, 'четыре попадания фосфорными гранатами создают дымовую завесу');
});

// 5. 82-мм миномёт тратит боеприпасы типа ordnance.
test('стрельба 82-мм миномёта расходует снаряды, а не патроны', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['is82mmMortarSquad', 'tacticalVehicleAimBonus', 'tacticalVehicleMovementAccuracyPenalty', 'attackOrdnance']);
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
test('действие «За боеприпасами» отправляет бойца к действующему пункту с автоматической ETA', () => {
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
    function syncLiveMapSupplyPoints() {}
    var promptValues = ['2'];
    function prompt() { return promptValues.shift(); }
    appData.squads = [{ name: 'Разведывательное отделение', faction: 'A.I.R.F.', ammoSmall: 10, ammoOrdnance: 2, grenades: 0,
      fighters: [
        { name: 'Командир отделения', hp: 3, isCommander: true },
        { name: 'Наводчик пулемёта', hp: 3 },
        { name: 'Стрелок', hp: 3 },
        { name: 'Сержант', hp: 3 }
      ], crewInstances: [{ weaponName: 'Пулемёт MG', fighterIndices: [1, 2] }] }];
    appData.map = { autoSupplyKeysPlayer: ['1,0'], grid: {
      '0,0': { squadIds: [0], enemySquadIds: [] }, '1,0': { squadIds: [], enemySquadIds: [], markers: ['ammoPoint'] }
    }, selectedMoveSquadIdx: 0, mode: 'move' };
    var eligibleNames = mapActionEligibleAmmoRunners(appData.squads[0]).map(x => x.fighter.name);
    mapBeginAmmoRun();
  `);
  const eligible = JSON.parse(s.evalCtx('JSON.stringify(eligibleNames)'));
  assert(!eligible.includes('Командир отделения'), 'командир исключён');
  assert(!eligible.includes('Наводчик пулемёта'), 'наводчик пулемёта исключён');
  assert(eligible.includes('Сержант'), 'не-командир может быть выбран');
  equal(s.evalCtx('appData.squads[0].fighters[2].isAway'), true, 'случайный стрелок отправлен');
  equal(s.evalCtx('appData.squads[0].fighters[2].ammoType'), '2', 'сохранён выбранный тип снарядов');
  equal(s.evalCtx('appData.squads[0].fighters[2].turnsToReturn'), 1, 'ETA автоматически рассчитана до ближайшего пункта (1 тактическая фаза)');
  equal(s.evalCtx('appData.squads[0].fighters[2].ammoSupplyHex'), '1,0', 'сохранён выбранный действующий пункт боепитания');
  includes(s.logs.join('\n'), 'снарядами (+10)', 'отправленный боец несёт максимальную порцию выбранного типа');
});

test('без действующего пункта боепитания отправка за БК запрещена', () => {
  const s = createSandbox(freshAppData());
  loadModule(s, 'js/map_actions.js');
  s.run(`
    function getBattleSquadHex() { return { key: '0,0' }; }
    function getAP() { return 4; }
    function tacticalActionAllowed() { return true; }
    function tacticalIsMeleeEngaged() { return false; }
    function syncLiveMapSupplyPoints() {}
    var promptCalls = 0;
    function prompt() { promptCalls++; return '1'; }
    appData.squads = [{ name: 'Отделение', fighters: [{ name: 'Стрелок', hp: 3 }] }];
    appData.map = { grid: { '0,0': { squadIds: [0], enemySquadIds: [] } }, selectedMoveSquadIdx: 0 };
    mapBeginAmmoRun();
  `);
  equal(s.evalCtx('promptCalls'), 0, 'игроку не предлагают выбирать груз без пункта снабжения');
  equal(s.evalCtx('appData.squads[0].fighters[0].isAway'), undefined, 'боец не отправлен');
  includes(s.elements.mapInfo.innerHTML.toLowerCase(), 'нет действующего пункта боепитания', 'на карте показана причина запрета');
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
  equal(globalCard && globalCard.icon, 'images/Двойной БК.png', 'карте назначена иконка');
  assert(fs.existsSync(path.join(ROOT, globalCard.icon)), 'файл иконки «Двойной БК» существует');
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

// 21. «Двойной БК» удваивает боеприпасы всего выбранного взвода ровно один раз.
test('«Двойной БК» удваивает патроны, гранаты и снаряды всех отделений взвода', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['addAppliedCardName', 'applyCardToPlatoon']);
  s.run(`
    var unit = { name: 'Стрелковый взвод', squads: [] };
    var selected = { name: 'Отделение 1', fighters: [{ hp: 3 }], ammoSmall: 10, grenades: 2, ammoOrdnance: 4 };
    var untouched = { name: 'Отделение 2', fighters: [{ hp: 3 }], ammoSmall: 7, grenades: 1, ammoOrdnance: 3 };
    var squads = [selected, untouched];
    var card = { name: 'Двойной БК', type: 'bonus' };
    applyCardToPlatoon(card, '_global', unit, squads, ['Отделение 1'], { initial: true, battleId:'battle-1' });
    var afterInitial = [selected.ammoSmall, selected.grenades, selected.ammoOrdnance];
    var unchangedOther = [untouched.ammoSmall, untouched.grenades, untouched.ammoOrdnance];
    applyCardToPlatoon(card, '_global', unit, squads, ['Отделение 1'], { initial: false, battleId:'battle-1' });
    applyCardToPlatoon(card, '_global', unit, squads, ['Отделение 1'], { initial: false, battleId:'battle-2' });
    var afterRefresh = [selected.ammoSmall, selected.grenades, selected.ammoOrdnance];
  `);
  equal(s.evalCtx('JSON.stringify(afterInitial)'), '[20,4,8]', 'все три вида боезапаса выбранного подразделения умножены на два');
  equal(s.evalCtx('JSON.stringify(unchangedOther)'), '[14,2,6]', 'боезапас второго отделения тоже удвоен');
  equal(s.evalCtx('JSON.stringify(afterRefresh)'), '[20,4,8]', 'повторная загрузка боя не удваивает боезапас первого отделения повторно');
  equal(s.evalCtx('JSON.stringify([untouched.ammoSmall, untouched.grenades, untouched.ammoOrdnance])'), '[14,2,6]', 'повторное применение не удваивает второе отделение снова');
});

test('«Горные охотники» исключают ПП/пулемёты, а пончо и скрытность проверяют высоту отдельно', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['mountainHuntersRifleWeapon', 'mountainHuntersAccuracyBonus', 'tacticalSquadHasCard',
    'tacticalCurrentCellForSquad', 'tacticalCardDetectionModifier', 'tacticalHasMountainPonchoAtHeight']);
  s.run(`
    function getScopedActiveCardsForSquad() { return []; }
    function tacticalCurrentCellForSquad(squad) { return { cell: squad.testCell || null }; }
    var rifle = { name:'Винтовка Vz.24' }, automatic = { name:'Автоматическая винтовка', isAutomatic:true },
        sniper = { name:'Geweer OIP M.38', sniper:true }, pp = { name:'ПП Star Si-35' },
        machineGun = { name:'Пулемёт FN', isAutomatic:true };
    var hunter = { faction:'A.I.R.F.', appliedCards:['Горные охотники'], testCell:{type:'hill',level:1} };
    var passive = { faction:'A.I.R.F.', appliedCards:[], testCell:{type:'hill',level:1} };
    var passiveLow = { faction:'A.I.R.F.', appliedCards:[], testCell:{type:'hill',level:0} };
    var ponchoLow = { faction:'BeVe', appliedCards:['Горное пончо'], testCell:{type:'hill',level:0} };
    var ponchoHigh = { faction:'BeVe', appliedCards:['Горное пончо'], testCell:{type:'hill',level:1} };
    var combined = { faction:'A.I.R.F.', appliedCards:['Горные охотники','Горное пончо'], testCell:{type:'hill',level:1} };
    var accuracy = [rifle,automatic,sniper,pp,machineGun].map(w=>mountainHuntersAccuracyBonus(hunter,w));
    var hunterDetection = tacticalCardDetectionModifier(hunter);
    var passiveDetection = tacticalCardDetectionModifier(passive);
    var passiveLowDetection = tacticalCardDetectionModifier(passiveLow);
    var combinedDetection = tacticalCardDetectionModifier(combined);
  `);
  equal(s.evalCtx('JSON.stringify(accuracy)'), '[1,1,1,0,0]', 'меткость +1 только для обычной/автоматической/снайперской винтовки');
  equal(s.evalCtx('hunterDetection'), -1, 'охотники заменяют, а не складывают пассивную скрытность');
  equal(s.evalCtx('passiveDetection'), -1, 'пассивная скрытность сама по себе сохраняется на высоте 1+');
  equal(s.evalCtx('passiveLowDetection'), 0, 'на нулевой высоте нет горного бонуса обнаружения');
  equal(s.evalCtx('combinedDetection'), -2, 'пончо отдельно добавляет бонус на высоте 1+');
  equal(s.evalCtx('tacticalHasMountainPonchoAtHeight(ponchoLow)'), false, 'пончо не действует на нулевой высоте');
  equal(s.evalCtx('tacticalHasMountainPonchoAtHeight(ponchoHigh)'), true, 'пончо действует на высоте 1+');
});

test('спешивание велосипеда оперативного взвода переносится на каждое отделение в тактическом бою', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['isBicycleTacticalSquad', 'tacticalApplyOperationalMobilityToBattleSquad']);
  s.run(`
    var opBike = {type:'bicycle_platoon', mobility:'foot', dismounted:true};
    var sectionA = tacticalApplyOperationalMobilityToBattleSquad({name:'Отделение №1'}, opBike);
    var sectionB = tacticalApplyOperationalMobilityToBattleSquad({name:'Отделение №2'}, opBike);
    var mounted = tacticalApplyOperationalMobilityToBattleSquad({name:'Отделение №3'}, {...opBike,dismounted:false});
  `);
  equal(s.evalCtx('sectionA.dismounted'), true, 'первое отделение входит спешенным');
  equal(s.evalCtx('sectionB.dismounted'), true, 'второе отделение тоже входит спешенным');
  equal(s.evalCtx('mounted.dismounted'), false, 'не спешившийся оперативно взвод входит на велосипедах');
  assert(s.evalCtx("sectionA.mobilityType === 'bicycle' && sectionB.mobilityType === 'bicycle'"), 'всем секциям переносится велосипедная мобильность');
});

test('тактическое перемещение проходит по каждому гексу маршрута, не телепортируя отряд', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalMoveAlongPath']);
  s.run(`
    var __tacticalMovementToken=0,__tacticalMovement=null,pendingSteps=[];
    function setTimeout(fn) { pendingSteps.push(fn); return pendingSteps.length; }
    function getHexNeighbors(key) { return key==='0,0'?['1,0']:key==='1,0'?['0,0','2,0']:key==='2,0'?['1,0','3,0']:['2,0']; }
    function getMovementCost() { return 1; }
    function getAP(index) { return actionPoints[index].ap; }
    function spendAP(index,cost) { if(actionPoints[index].ap<cost)return false;actionPoints[index].ap-=cost;return true; }
    function tacticalDogSledEligible() { return false; }
    function tacticalMaybeTriggerFireField() {} function tacticalCheckMaraudingOnEntry() { return false; }
    function tacticalAutoEngageMelee() { return null; } function recalcReachable() {}
    function recordDaggerApproachIfEligible() {} function saveData() {} function updateUI() {} function redrawMap() {}
    currentTurn=1;actionPoints=[{ap:3,maxAp:3}];
    var mover={name:'Стрелковое отделение',hexPos:[0,0],fighters:[{hp:3}]};appData.squads=[mover];
    appData.map={grid:{'0,0':{squadIds:[0]},'1,0':{squadIds:[]},'2,0':{squadIds:[]},'3,0':{squadIds:[]}},
      selectedMoveSquadIdx:0,reachableHexes:[],isCrouchMode:false};
    var started=tacticalMoveAlongPath(0,['1,0','2,0','3,0'],'3,0');
    var firstHex=mover.hexPos.join(',');var firstStepQueued=pendingSteps.length;
    pendingSteps.shift()();var secondHex=mover.hexPos.join(',');
    pendingSteps.shift()();var finalHex=mover.hexPos.join(',');
  `);
  equal(s.evalCtx('started'), true, 'движение запущено');
  equal(s.evalCtx('firstHex'), '1,0', 'синхронный первый шаг занимает только соседний гекс');
  equal(s.evalCtx('firstStepQueued'), 1, 'следующий шаг ожидает анимационный интервал');
  equal(s.evalCtx('secondHex'), '2,0', 'второй шаг тоже обновляет позицию отдельно');
  equal(s.evalCtx('finalHex'), '3,0', 'после третьего шага достигнута цель');
  equal(s.evalCtx('actionPoints[0].ap'), 0, 'ОД потрачены за фактически пройденные три гекса');
  equal(s.evalCtx('mover.movedThisTurn'), true, 'перемещение отмечено по завершении маршрута');
});

test('«Упрямство» персонально для выбранного отделения и блокирует сдачу при закрытом отходе', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalSquadHasStubbornCard', 'tacticalStubbornAtStartingHex', 'tacticalSurrenderUnit']);
  s.run(`
    function tacticalSquadHexPosition(squad) { return squad.hexPos ? {key:squad.hexPos.join(',')} : null; }
    var stubborn = {name:'Отделение 1',effects:{stubborn:true},appliedCards:['Упрямство'],tacticalStartHexKey:'2,2',hexPos:[2,2]};
    var uiOnly = {name:'Отделение 2',appliedCards:['Упрямство'],hexPos:[2,3]};
    var holdsStart = tacticalStubbornAtStartingHex(stubborn);
    var otherIsNotStubborn = tacticalSquadHasStubbornCard(uiOnly);
    stubborn.hexPos=[3,2]; var leftStart = tacticalStubbornAtStartingHex(stubborn);
    var surrendered = tacticalSurrenderUnit(stubborn,'player',0,'retreat_blocked');
  `);
  equal(s.evalCtx('holdsStart'), true, 'подразделение распознано на стартовом гексе');
  equal(s.evalCtx('otherIsNotStubborn'), false, 'общая подпись карты не делает все отделения упрямыми');
  equal(s.evalCtx('leftStart'), false, 'после ухода со стартового гекса блокировка морали снимается');
  equal(s.evalCtx('surrendered'), false, 'заблокированный отход не приводит к сдаче');
  equal(s.evalCtx('stubborn.isSurrendered'), undefined, 'отделение остаётся в бою');
});

test('«Собачья упряжка» даёт пулемётному расчёту один бесплатный тактический гекс за ход', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalSquadHasCard', 'tacticalDogSledEligible', 'getHexNeighbors', 'calculateReachableHexes', 'tacticalBuildMovePath']);
  s.run(`
    var TACTICAL_MAP_SIZE=4,currentTurn=1;
    function getMovementCost() { return 1; }
    function getScopedActiveCardsForSquad() { return []; }
    var withSled={name:'Пулемётный расчёт',appliedCards:['Собачья упряжка'],effects:{dogSled:true}};
    var withoutSled={name:'Пулемётный расчёт',appliedCards:[],effects:{}};
    var route={};
    var sledCosts=calculateReachableHexes(withSled,'0,0',2,false,route);
    var sledPath=tacticalBuildMovePath('0,0','3,0',route.previous,route.routeStatesByHex['3,0']);
    var normalCosts=calculateReachableHexes(withoutSled,'0,0',2,false,{});
  `);
  assert(s.evalCtx("tacticalDogSledEligible(withSled)"), 'карта применена к расчёту пулемёта');
  equal(s.evalCtx("Object.prototype.hasOwnProperty.call(sledCosts,'3,0')"), true, 'при 2 ОД пройдено 3 тактических гекса');
  equal(s.evalCtx("Object.prototype.hasOwnProperty.call(normalCosts,'3,0')"), false, 'без карты третий гекс недоступен');
  equal(s.evalCtx('sledPath.length'), 3, 'путь содержит каждый из трёх гексов');
  assert(s.evalCtx('!!sledPath.freeStepKey'), 'бесплатный шаг точно отмечен в маршруте');
});

test('оперативный маркер «?» виден без приказа и скрывается при черновике/исполнении', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['operationalUnitHasOutstandingOrder', 'operationalUnitHasOrderDraft', 'operationalUnitNeedsOrderMarker']);
  s.run(`
    var unit={name:'Стрелковый взвод',col:1,row:1};
    appData.campaign.opUnits=[unit];appData.campaign.selectedOpUnit=null;
    hardMode={orders:[],pendingOrders:[],messengerQueue:[],orderQueue:[]};
    var orderWaypoints=[];var pickingTargetHex=null;
    window.opOperationalUiState={menuOpen:false};
    var noOrder=operationalUnitNeedsOrderMarker(unit);
    hardMode.orders=[{toUnitId:0,status:'active'}];var executing=operationalUnitNeedsOrderMarker(unit);
    hardMode.orders=[];appData.campaign.selectedOpUnit=unit;orderWaypoints=[{col:2,row:1}];
    var drafting=operationalUnitNeedsOrderMarker(unit);
    orderWaypoints=[];var draftCleared=operationalUnitNeedsOrderMarker(unit);
  `);
  equal(s.evalCtx('noOrder'), true, 'отряд без приказа нуждается в маркере');
  equal(s.evalCtx('executing'), false, 'активный приказ скрывает маркер');
  equal(s.evalCtx('drafting'), false, 'выбор цели/маршрута скрывает маркер во время подготовки');
  equal(s.evalCtx('draftCleared'), true, 'после отмены черновика маркер возвращается');
  assert(HTML.includes("ctx.fillText('?', bx, by + 0.5)"), 'drawOperationalUnits рисует вопросительный знак над иконкой');
});

test('«Мародёрство» требует A.I.R.F.-атакующего с картой и фактического присутствия противника', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalSquadHasCard', 'tacticalPlatoonHasCommissar', 'tacticalBattleAttackerSide',
    'tacticalMarkTacticalHexOccupied', 'tacticalOccupancyHistoryBattleKey', 'tacticalMarkTacticalSquadDestroyedHex', 'tacticalInitializeBattleOccupancyHistory',
    'tacticalCheckMaraudingOnEntry', 'tacticalMaraudingBlocksAction']);
  s.run(`
    var marauder={name:'Отделение',faction:'A.I.R.F.',opUnitName:'Взвод',appliedCards:['Мародёрство'],fighters:[{hp:3}]};
    var defender={name:'Защитник',faction:'BeVe',opUnitName:'Защита',fighters:[{hp:3}]};
    var defender2={name:'Другой защитник',faction:'BeVe',opUnitName:'Защита',fighters:[{hp:3}]};
    var deadBeforeBattle={name:'Погибший до боя',faction:'BeVe',fighters:[{hp:0}],isDestroyed:true};
    appData.squads=[marauder];
    appData.map={attackerSide:'player',grid:{
      '1,1':{type:'building',squadIds:[],enemySquadIds:[0],markers:[]},
      '2,2':{type:'trenches',fortificationOwner:'BeVe',squadIds:[],enemySquadIds:[1],markers:[]},
      '3,3':{type:'building',fortificationOwner:null,squadIds:[],enemySquadIds:[],markers:[]},
      '4,4':{type:'trenches',fortificationOwner:'A.I.R.F.',squadIds:[],enemySquadIds:[],markers:[]},
      '7,7':{type:'grass',squadIds:[],enemySquadIds:[2],markers:[]}
    },enemySquads:[defender,defender2,deadBeforeBattle]};
    var inStandaloneBattle=false;
    currentTurn=1;
    tacticalInitializeBattleOccupancyHistory(appData.map,appData.squads,appData.map.enemySquads);
    var preBattleDeadHistory=!!(appData.map.grid['7,7'].tacticalOccupantsSeen && appData.map.grid['7,7'].tacticalOccupantsSeen.enemy);
    var actualEnemyOccupant=tacticalCheckMaraudingOnEntry(marauder,'1,1','player');
    var through=marauder.maraudingInactivityThroughTurn;
    currentTurn=3; var skippedNextOwnPhase=tacticalMaraudingBlocksAction(marauder);
    currentTurn=4; var activeAgain=tacticalMaraudingBlocksAction(marauder);
    appData.currentBattleId='maraud-new-battle';
    appData.map.tacticalOccupancyBattleId='maraud-old-battle';
    appData.map.grid['3,3'].tacticalOccupantsSeen={enemy:true};
    tacticalInitializeBattleOccupancyHistory(appData.map,appData.squads,appData.map.enemySquads);
    var staleBattleHistory=!!(appData.map.grid['3,3'].tacticalOccupantsSeen && appData.map.grid['3,3'].tacticalOccupantsSeen.enemy);
    inStandaloneBattle=true;appData._tacticalMoraleStandaloneBattleId='standalone-current';
    var standaloneOccupancyKey=tacticalOccupancyHistoryBattleKey(appData.map);
    inStandaloneBattle=false;
    var ownOccupiedTrench=tacticalCheckMaraudingOnEntry(marauder,'4,4','player');
    var ownerlessBuilding=tacticalCheckMaraudingOnEntry(marauder,'3,3','player');
    var ownFortification=tacticalCheckMaraudingOnEntry(marauder,'2,2','player');
    currentTurn=7;
    tacticalMaraudingBlocksAction(marauder);
    var beveMarauder={name:'BeVe',faction:'BeVe',opUnitName:'Взвод BeVe',appliedCards:['Мародёрство'],fighters:[{hp:3}]};
    var wrongFaction=tacticalCheckMaraudingOnEntry(beveMarauder,'1,1','player');
    var commissioner={name:'Комиссар',opUnitName:'Взвод',fighters:[{name:'Комиссар',hp:3,isPolitruk:true}]};
    appData.squads.push(commissioner);
    var canceledByCommissioner=tacticalCheckMaraudingOnEntry(marauder,'1,1','player');
    appData.squads=[marauder];
    currentTurn=9;
    tacticalMaraudingBlocksAction(marauder);
    var wreck={name:'Уничтоженный защитник',faction:'BeVe',fighters:[{hp:0}],isDestroyed:true,hexPos:[2,2]};
    appData.map.enemySquads=[wreck];
    appData.map.grid['1,1'].enemySquadIds=[];appData.map.grid['2,2'].enemySquadIds=[0];
    tacticalMarkTacticalSquadDestroyedHex(wreck,'enemy');
    var destroyedHere=tacticalCheckMaraudingOnEntry(marauder,'2,2','player');
    var enemyMarauder={name:'Противник',faction:'A.I.R.F.',opUnitName:'Вражеский взвод',appliedCards:['Мародёрство'],fighters:[{hp:3}]};
    appData.map.enemySquads=[enemyMarauder];
    appData.map.attackerSide='player';
    var defenderCannotMaraud=tacticalCheckMaraudingOnEntry(enemyMarauder,'1,1','enemy');
    appData.map.attackerSide='enemy';
    appData.map.grid['5,5']={type:'building',fortificationOwner:'BeVe',squadIds:[],enemySquadIds:[],tacticalOccupantsSeen:{enemy:true},markers:[]};
    var noPresenceOnEnemyFort=tacticalCheckMaraudingOnEntry(enemyMarauder,'5,5','enemy');
    appData.map.grid['6,6']={type:'building',squadIds:[],enemySquadIds:[],tacticalOccupantsSeen:{player:true},markers:[]};
    var enemyAttackerTriggers=tacticalCheckMaraudingOnEntry(enemyMarauder,'6,6','enemy');
  `);
  equal(s.evalCtx('actualEnemyOccupant'), true, 'вход на гекс, где защитник реально находился в этом бою, запускает эффект');
  equal(s.evalCtx('preBattleDeadHistory'), false, 'подразделение, погибшее до старта, не создаёт факта присутствия в бою');
  equal(s.evalCtx('through'), 3, 'теряется ровно следующая фаза своего хода');
  equal(s.evalCtx('skippedNextOwnPhase'), true, 'в следующую фазу своего хода действия блокируются');
  equal(s.evalCtx('activeAgain'), false, 'после одного пропущенного хода действия возвращаются');
  equal(s.evalCtx('staleBattleHistory'), false, 'история присутствия предыдущего боя не подходит для «Мародёрства»');
  equal(s.evalCtx('standaloneOccupancyKey'), 'standalone-current', 'самостоятельный бой использует отдельный ключ истории занятых гексов');
  equal(s.evalCtx('ownOccupiedTrench'), false, 'переход между своими укреплениями не запускает эффект');
  equal(s.evalCtx('ownFortification'), true, 'укрепление, где фактически был враг, подходит независимо от владельца');
  equal(s.evalCtx('ownerlessBuilding'), false, 'отсутствие владельца здания не делает гекс вражеским');
  equal(s.evalCtx('wrongFaction'), false, 'карта не даёт эффект отряду не A.I.R.F.');
  equal(s.evalCtx('canceledByCommissioner'), false, 'живой комиссар в том же взводе отменяет эффект');
  equal(s.evalCtx('destroyedHere'), true, 'уничтоженный вражеский отряд сохраняет факт присутствия в гексе');
  equal(s.evalCtx('defenderCannotMaraud'), false, 'A.I.R.F. не запускает эффект в роли обороняющейся стороны');
  equal(s.evalCtx('noPresenceOnEnemyFort'), false, 'само по себе чужое укрепление без фактического присутствия не подходит');
  equal(s.evalCtx('enemyAttackerTriggers'), true, 'A.I.R.F. атакующего врага тоже срабатывает по следу защитника');
});

test('тактическое подавление от духа действует строго ниже 30%, а ручное подавление независимо', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, [
    'tacticalMoraleScale', 'tacticalMoraleCurrent', 'tacticalEffectiveMoraleForSquad',
    'tacticalMoraleIsSuppressed', 'tacticalMoraleIsCritical', 'tacticalSquadIsSuppressed',
    'tacticalChangeMorale', 'tacticalMoraleBattleKey', 'tacticalRecordNearbyMoraleLoss',
    'tacticalApplyFighterMoraleLoss', 'tacticalMarkTacticalHexOccupied', 'tacticalMarkTacticalSquadDestroyedHex',
    'tacticalSquadHexPosition', 'tacticalSquadsDistance', 'tacticalSquadHasStubbornCard',
    'tacticalStubbornAtStartingHex', 'tacticalIsHeadquartersSquad', 'tacticalHasLiveHeadquartersFor',
    'tacticalPlatoonSquadsFor', 'tacticalHeadquartersIsLost', 'tacticalApplyHeadquartersLossMoralePenalty',
    'tacticalMaybeAutoRetreat', 'tacticalMaraudingBlocksAction', 'tacticalActionAllowed',
    'getTacticalMoraleSuppressionAccuracyPenalty', 'getTacticalSuppressionAccuracyPenalty'
  ]);
  s.run(`
    var morale=5, currentSquad=null, currentSquadIndex=0, currentTurn=1, actionPoints=[];
    function getEffectiveMorale() { return morale; }
    function getScopedActiveModifiersForSquad() { return []; }
    function getScopedActiveCardsForSquad() { return []; }
    function placementPendingReason() { return null; }
    function getTacticalActiveSide() { return 'player'; }
    function tacticalIsMeleeEngaged() { return false; }
    function isBicycleTacticalSquad() { return false; }
    function hexGridDistance(c1,r1,c2,r2) {
      const q1=c1-Math.floor((r1-(r1&1))/2), q2=c2-Math.floor((r2-(r2&1))/2);
      return Math.max(Math.abs(q1-q2),Math.abs(r1-r2),Math.abs((q1+r1)-(q2+r2)));
    }
    appData.map={grid:{},enemySquads:[],activeSide:'player'};
    var unit={name:'Пехота',faction:'BeVe',fighters:[{name:'Боец',hp:3}],baseMorale:10,tacticalMoraleMax:10,currentMorale:3};
    appData.squads=[unit];
    var at30=tacticalMoraleIsSuppressed(unit), moveAt30=tacticalActionAllowed(unit,'move',true);
    unit.currentMorale=2;
    var at20=tacticalMoraleIsSuppressed(unit), moveAt20=tacticalActionAllowed(unit,'move',true);
    var shootAt20=tacticalActionAllowed(unit,'shoot',true), lowMoralePenalty=getTacticalSuppressionAccuracyPenalty(unit);
    var routAt20=tacticalMaybeAutoRetreat(unit,'player',0);
    unit.suppressed=true;
    var combinedPenalty=getTacticalSuppressionAccuracyPenalty(unit), manualBlocksMovement=tacticalActionAllowed(unit,'move',true);
    unit.currentMorale=3;
    var moraleRecovered=tacticalMoraleIsSuppressed(unit), manualStillBlocks=tacticalSquadIsSuppressed(unit);
    var manualOnlyPenalty=getTacticalSuppressionAccuracyPenalty(unit);
    unit.suppressed=false;
    var movementAfterManualClear=tacticalActionAllowed(unit,'move',true);
    unit.currentMorale=1;
    var routAt10=tacticalMaybeAutoRetreat(unit,'player',0), routingAt10=unit.isRouting;
  `);
  equal(s.evalCtx('at30'), false, 'ровно 30% не считается подавлением');
  equal(s.evalCtx('moveAt30'), true, 'при 30% движение разрешено');
  equal(s.evalCtx('at20'), true, 'ниже 30% включается подавление духом');
  equal(s.evalCtx('moveAt20'), false, 'при подавлении духом движение запрещено');
  equal(s.evalCtx('shootAt20'), true, 'стрельба остаётся доступной');
  equal(s.evalCtx('lowMoralePenalty'), -1, 'подавление духом даёт ровно −1 к меткости');
  equal(s.evalCtx('routAt20'), false, '20% не запускает моральный отход');
  equal(s.evalCtx('combinedPenalty'), -3, 'огневое подавление и низкий дух складываются раздельно');
  equal(s.evalCtx('manualBlocksMovement'), false, 'ручное подавление отдельно блокирует движение');
  equal(s.evalCtx('moraleRecovered'), false, 'восстановление до 30% снимает только подавление духом');
  equal(s.evalCtx('manualStillBlocks'), true, 'подавление огнём остаётся независимо от морали');
  equal(s.evalCtx('manualOnlyPenalty'), -2, 'после восстановления остаётся только огневой штраф −2');
  equal(s.evalCtx('movementAfterManualClear'), true, 'снятие ручного подавления разрешает движение');
  equal(s.evalCtx('routAt10'), true, 'ровно 10% запускает моральный отход');
  equal(s.evalCtx('routingAt10'), true, 'обычный отряд помечен для маршрута при критически низком духе');
});

test('потеря бойца снижает дух на 1, командира на 2, а гибель/моральный отход дают союзникам один −1 в радиусе 2', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, [
    'tacticalMoraleScale', 'tacticalMoraleCurrent', 'tacticalEffectiveMoraleForSquad', 'tacticalMoraleIsSuppressed',
    'tacticalMoraleIsCritical', 'tacticalChangeMorale', 'tacticalMoraleBattleKey', 'tacticalMarkTacticalHexOccupied',
    'tacticalMarkTacticalSquadDestroyedHex', 'tacticalRecordNearbyMoraleLoss', 'tacticalApplyFighterMoraleLoss',
    'tacticalMarkStartingMoraleCasualties', 'tacticalInitializeSquadMorale',
    'tacticalSquadHexPosition', 'tacticalSquadsDistance', 'tacticalSquadHasStubbornCard', 'tacticalStubbornAtStartingHex',
    'tacticalIsHeadquartersSquad', 'tacticalHasLiveHeadquartersFor', 'tacticalPlatoonSquadsFor',
    'tacticalHeadquartersIsLost', 'tacticalApplyHeadquartersLossMoralePenalty', 'tacticalMaybeAutoRetreat',
    'tacticalRemoveUnitFromMap', 'tacticalClearMeleeEngagement', 'tacticalRetreatUnit'
  ]);
  s.run(`
    var currentSquad=null, currentSquadIndex=0, currentTurn=1, morale=5;
    function getScopedActiveModifiersForSquad() { return []; }
    function hexGridDistance(c1,r1,c2,r2) {
      const q1=c1-Math.floor((r1-(r1&1))/2), q2=c2-Math.floor((r2-(r2&1))/2);
      return Math.max(Math.abs(q1-q2),Math.abs(r1-r2),Math.abs((q1+r1)-(q2+r2)));
    }
    function cell() { return {squadIds:[],enemySquadIds:[],markers:[]}; }
    function soldier(name, commander) { return {name,weapon:'Винтовка',hp:3,maxHp:3,isCommander:!!commander}; }
    function squad(name, col, row, fighters, capacity) {
      return {name,faction:'BeVe',fighters,hexPos:[col,row],baseMorale:capacity,tacticalMoraleMax:capacity,
        tacticalOriginalRosterSize:capacity,currentMorale:capacity,crewInstances:[]};
    }
    appData.map={grid:{},enemySquads:[],activeSide:'player',mapSize:8};
    var ordinary=squad('Обычные',0,0,Array.from({length:5},(_,i)=>soldier('Стрелок '+i,false)),5);
    var commanderUnit=squad('Командир',1,0,[soldier('Командир',true),...Array.from({length:4},(_,i)=>soldier('Стрелок '+i,false))],5);
    tacticalInitializeSquadMorale(ordinary,'battle-morale');
    tacticalInitializeSquadMorale(commanderUnit,'battle-morale');
    ordinary.fighters[0].hp=0;
    commanderUnit.fighters[0].hp=0;
    appData.squads=[ordinary,commanderUnit];
    var oneLoss=tacticalApplyFighterMoraleLoss(ordinary,ordinary.fighters[0],'player');
    var twoLoss=tacticalApplyFighterMoraleLoss(commanderUnit,commanderUnit.fighters[0],'player');
    var fixedScale=ordinary.tacticalMoraleMax;
    var commanderMorale=commanderUnit.currentMorale;
    var lateSquad=squad('Поздний отряд',6,6,[soldier('Старый погибший',false),soldier('Боец 2',false),soldier('Боец 3',false)],3);
    lateSquad.fighters[0].hp=0;
    lateSquad.fighters[1].hp=undefined;
    appData.currentBattleId='late-battle';
    tacticalInitializeSquadMorale(lateSquad,'late-battle');
    var lateStartingMorale=lateSquad.currentMorale;
    var preBattleDeathIgnored=tacticalApplyFighterMoraleLoss(lateSquad,lateSquad.fighters[0],'player');
    lateSquad.fighters[2].hp=0;
    var lateBattleLoss=tacticalApplyFighterMoraleLoss(lateSquad,lateSquad.fighters[2],'player');
    var lateScale=lateSquad.tacticalMoraleMax;
    var source=squad('Погибший',2,2,[soldier('Последний',false)],1);
    var near1=squad('Рядом 1',3,2,[soldier('Боец',false)],5);
    var near2=squad('Рядом 2',4,2,[soldier('Боец',false)],5);
    var far=squad('Далеко',5,2,[soldier('Боец',false)],5);
    var deadNear=squad('Погибший сосед',2,3,[soldier('Мёртвый',false)],5); deadNear.fighters[0].hp=0;
    appData.squads=[source,near1,near2,far,deadNear];
    ['2,2','3,2','4,2','5,2','2,3'].forEach(key=>appData.map.grid[key]=cell());
    appData.map.grid['2,2'].squadIds=[0];appData.map.grid['3,2'].squadIds=[1];appData.map.grid['4,2'].squadIds=[2];
    appData.map.grid['5,2'].squadIds=[3];appData.map.grid['2,3'].squadIds=[4];
    source.fighters[0].hp=0;
    var deathEvent=tacticalApplyFighterMoraleLoss(source,source.fighters[0],'player');
    var duplicateDeath=tacticalApplyFighterMoraleLoss(source,source.fighters[0],'player');
    var afterDeath=[near1.currentMorale,near2.currentMorale,far.currentMorale,deadNear.currentMorale];
    var destroyedHex=appData.map.grid['2,2'].tacticalDestroyedUnitSides.player;
  `);
  equal(s.evalCtx('ordinary.currentMorale'), 4, 'потеря обычного бойца снимает 1 дух');
  equal(s.evalCtx('commanderMorale'), 3, 'гибель командира снижает дух ровно на 2, не на 3');
  equal(s.evalCtx('fixedScale'), 5, 'знаменатель остаётся равным исходному составу после потери');
  equal(s.evalCtx('lateStartingMorale'), 2, 'поздно добавленный отряд получает стартовый дух по числу живых бойцов');
  equal(s.evalCtx('preBattleDeathIgnored'), false, 'уже погибший до начала боя боец не списывается повторно');
  equal(s.evalCtx('lateBattleLoss'), true, 'поздно добавленная группа учитывает потери после инициализации');
  equal(s.evalCtx('lateScale'), 2, 'фиксированный знаменатель поздней группы сохраняется до конца боя');
  equal(s.evalCtx('lateSquad.currentMorale'), 1, 'мораль поздней группы уменьшается только за нового погибшего');
  equal(s.evalCtx('deathEvent'), true, 'гибель последнего бойца фиксирует событие');
  equal(s.evalCtx('duplicateDeath'), false, 'повторная обработка смерти не создаёт второе событие');
  equal(s.evalCtx('JSON.stringify(afterDeath)'), '[4,4,5,5]', 'только живые союзники в радиусе 2 теряют по одному духу');
  equal(s.evalCtx('destroyedHex'), true, 'гекс последнего уничтоженного противника отмечен в истории');

  const route = createSandbox(freshAppData());
  loadHtml(route, [
    'tacticalMoraleScale','tacticalMoraleCurrent','tacticalEffectiveMoraleForSquad','tacticalMoraleIsCritical','tacticalChangeMorale',
    'tacticalMoraleBattleKey','tacticalRecordNearbyMoraleLoss','tacticalSquadHexPosition','tacticalSquadsDistance',
    'tacticalSquadHasStubbornCard','tacticalStubbornAtStartingHex','tacticalIsHeadquartersSquad','tacticalHasLiveHeadquartersFor',
    'tacticalPlatoonSquadsFor','tacticalHeadquartersIsLost','tacticalApplyHeadquartersLossMoralePenalty','tacticalMaybeAutoRetreat',
    'tacticalRemoveUnitFromMap','tacticalClearMeleeEngagement','tacticalRetreatUnit'
  ]);
  route.run(`
    var currentSquad=null,currentTurn=1,morale=5;
    function getScopedActiveModifiersForSquad(){return[];}
    function hexGridDistance(c1,r1,c2,r2){const q1=c1-Math.floor((r1-(r1&1))/2),q2=c2-Math.floor((r2-(r2&1))/2);return Math.max(Math.abs(q1-q2),Math.abs(r1-r2),Math.abs((q1+r1)-(q2+r2)));}
    appData.map={grid:{'2,2':{squadIds:[0],enemySquadIds:[]},'3,2':{squadIds:[1],enemySquadIds:[]}},enemySquads:[]};
    var routed={name:'Маршрут',faction:'BeVe',hexPos:[2,2],fighters:[{hp:1}],baseMorale:10,tacticalMoraleMax:10,currentMorale:1};
    var ally={name:'Союзник',faction:'BeVe',hexPos:[3,2],fighters:[{hp:3}],baseMorale:5,tacticalMoraleMax:5,currentMorale:5};
    appData.squads=[routed,ally];
    var moraleRoute=tacticalMaybeAutoRetreat(routed,'player',0);var afterFirst=ally.currentMorale;
    var duplicateRoute=tacticalMaybeAutoRetreat(routed,'player',0);var afterSecond=ally.currentMorale;
  `);
  equal(route.evalCtx('moraleRoute'), true, 'критически низкий дух начинает автоматический отход');
  equal(route.evalCtx('duplicateRoute'), false, 'один отход регистрируется один раз');
  equal(route.evalCtx('afterFirst'), 4, 'моральный отход снижает дух союзника в радиусе 2 на 1');
  equal(route.evalCtx('afterSecond'), 4, 'повторный вызов не дублирует потерю');
  route.run(`
    var stubbornStart={name:'Упрямые на старте',faction:'BeVe',fighters:[{hp:3}],hexPos:[2,2],tacticalStartHexKey:'2,2',
      effects:{stubborn:true},baseMorale:10,tacticalMoraleMax:10,currentMorale:0,isRouting:true,retreatReason:'morale'};
    appData.squads=[stubbornStart];
    appData.map.grid['2,2'].squadIds=[0];
    var startRetreat=tacticalMaybeAutoRetreat(stubbornStart,'player',0);
    var retainedAtStart=JSON.stringify(stubbornStart.hexPos);
    var routingCleared=!stubbornStart.isRouting;
    var stubbornNoHQ={name:'Упрямые без штаба',faction:'BeVe',fighters:[{hp:3}],hexPos:[3,2],tacticalStartHexKey:'2,2',
      effects:{stubborn:true},baseMorale:10,tacticalMoraleMax:10,currentMorale:0};
    appData.squads=[stubbornNoHQ];
    appData.map.grid['2,2'].squadIds=[];appData.map.grid['3,2'].squadIds=[0];
    var noHqRetreat=tacticalMaybeAutoRetreat(stubbornNoHQ,'player',0);
    var retainedWithoutHq=JSON.stringify(stubbornNoHQ.hexPos);
  `);
  equal(route.evalCtx('startRetreat'), false, '«Упрямство» запрещает моральный отход со стартового гекса');
  equal(route.evalCtx('retainedAtStart'), '[2,2]', 'упрямый отряд остаётся на исходной позиции');
  equal(route.evalCtx('routingCleared'), true, 'устаревший флаг маршрута на стартовом гексе снимается');
  equal(route.evalCtx('noHqRetreat'), false, 'без живого штаба упрямый отряд не начинает отход');
  equal(route.evalCtx('retainedWithoutHq'), '[3,2]', 'без штаба подразделение удерживает текущий гекс');
});

test('поздно добавленный отряд получает собственный фиксированный знаменатель морали', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalMarkStartingMoraleCasualties', 'tacticalInitializeSquadMorale', 'tacticalEnsureSquadMoraleInitialized']);
  s.run(`
    var battle={id:'battle-late',cardsChosen:true,placement:{phase:'done'},tacticalMoraleInitialized:true};
    var campaignLate={name:'Добавлен поздно',baseMorale:5,currentMorale:2,fighters:[{hp:3},{hp:3},{hp:3},{hp:3}]};
    var campaignInit=tacticalEnsureSquadMoraleInitialized(campaignLate,battle);
    var campaignScale=campaignLate.tacticalMoraleMax;
    var campaignMorale=campaignLate.currentMorale;
    var campaignId=campaignLate.tacticalMoraleInitializedBattleId;
    var inStandaloneBattle=true;
    appData._tacticalMoraleStandaloneBattleId='standalone-late';
    var standaloneLate={name:'Поздний соло-отряд',baseMorale:5,currentMorale:1,fighters:[{hp:3},{hp:3},{hp:3}]};
    var standaloneInit=tacticalEnsureSquadMoraleInitialized(standaloneLate);
  `);
  equal(s.evalCtx('campaignInit'), true, 'новый участник кампанийного боя инициализируется сразу');
  equal(s.evalCtx('campaignScale'), 4, 'знаменатель нового отряда равен исходному числу бойцов');
  equal(s.evalCtx('campaignMorale'), 4, 'начальный дух поздней группы равен её живому составу');
  equal(s.evalCtx('campaignId'), 'battle-late', 'инициализация привязана к конкретному бою');
  equal(s.evalCtx('standaloneInit'), true, 'поздно добавленный соло-отряд тоже инициализируется');
  equal(s.evalCtx('standaloneLate.tacticalMoraleMax'), 3, 'соло-знаменатель фиксирован по составу на момент добавления');
  equal(s.evalCtx('standaloneLate.currentMorale'), 3, 'соло-отряд получает стартовый дух по числу бойцов');
});

test('только три тактических fallback-отряда используют исходный дух 1', () => {
  const count = (HTML.match(/currentMorale:\s*1,\s*baseMorale:\s*1/g) || []).length;
  equal(count, 3, 'fallback collectBattleSquads и минимальные отряды игрока/врага инициализируют дух единицей');
});

test('после боя совместимые отделения одного взвода автоматически объединяются без потери выживших', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalMergeSquadTypeKey','tacticalMergeOperationalUnitSquads','mergeTacticalCasualtySquadsAfterBattle']);
  s.run(`
    function makeFighters(prefix, living) {
      return Array.from({length:10},(_,i)=>({id:prefix+'-'+i,name:'Стрелок '+(i+1),weapon:'Винтовка',maxHp:3,hp:i<living?3:0}));
    }
    function squad(name,owner,type,living) {
      return {name,opUnitName:owner,type,faction:'BeVe',fighters:makeFighters(name,living),tacticalOriginalRosterSize:10,
        tacticalMoraleMax:10,baseMorale:10,currentMorale:living,appliedCards:[],effects:{}};
    }
    var a1=squad('Стрелковое отделение №1','Взвод A','infantry',4);
    var a2=squad('Стрелковое отделение №2','Взвод A','infantry',4);
    var support=squad('Отделение поддержки','Взвод A','support',4);
    var b1=squad('Стрелковое отделение №1','Взвод B','infantry',4);
    var b2=squad('Стрелковое отделение №2','Взвод B','infantry',4);
    var unitA={name:'Взвод A',squads:[a1,a2,support]};
    var unitB={name:'Взвод B',squads:[b1,b2]};
    appData.campaign.opUnits=[unitA,unitB];appData.campaign.enemyOpUnits=[];
    var aliveIdsExpected=[...a1.fighters,...a2.fighters].filter(f=>f.hp>0).map(f=>f.id).sort();
    var merged=mergeTacticalCasualtySquadsAfterBattle({playerUnitNames:['Взвод A'],enemyUnitNames:[],
      playerSquads:[a1,a2,support],enemySquads:[]});
    var aliveIdsAfter=unitA.squads.flatMap(s=>s.fighters.filter(f=>f.hp>0).map(f=>f.id)).filter(id=>!id.startsWith('Отделение поддержки')).sort();
    var liveCounts=unitA.squads.map(s=>s.fighters.filter(f=>f.hp>0).length);
    var allSlotsWithinCapacity=unitA.squads.every(s=>s.fighters.length<=s.tacticalOriginalRosterSize);
    var unitBStillSeparate=unitB.squads.every(s=>s.fighters.filter(f=>f.hp>0).length===4);
  `);
  equal(s.evalCtx('merged'), 1, 'две ослабленные совместимые группы освобождают одно отделение');
  equal(s.evalCtx('JSON.stringify(aliveIdsAfter)'), s.evalCtx('JSON.stringify(aliveIdsExpected)'), 'все восемь живых бойцов сохранены');
  equal(s.evalCtx('JSON.stringify(liveCounts)'), '[8,0,4]', 'выжившие объединены в один отряд и поддержка не затронута');
  equal(s.evalCtx('allSlotsWithinCapacity'), true, 'вместимость исходного отряда не превышена');
  equal(s.evalCtx('unitBStillSeparate'), true, 'отряды другого оперативного взвода не объединяются');
  s.run(`
    var retreatA=squad('Стрелковое отделение №1','Взвод R','infantry',4);
    var retreatB=squad('Стрелковое отделение №2','Взвод R','infantry',4);
    retreatA.isRetreated=true;retreatA.status='retreated';
    var retreatUnit={name:'Взвод R',squads:[retreatA,retreatB]};
    appData.campaign.opUnits=[retreatUnit];appData.campaign.enemyOpUnits=[];
    var retreatMergeCount=mergeTacticalCasualtySquadsAfterBattle({playerUnitNames:['Взвод R'],enemyUnitNames:[],
      playerSquads:[retreatA,retreatB],enemySquads:[]});
    var retreatLive=retreatUnit.squads.flatMap(s=>s.fighters.filter(f=>f.hp>0));
    var retreatSlotSizes=retreatUnit.squads.map(s=>s.fighters.length);
    var activeRecipient=retreatUnit.squads.find(s=>s.fighters.some(f=>f.hp>0));
  `);
  equal(s.evalCtx('retreatMergeCount'), 1, 'морально отступившие, но выжившие бойцы участвуют в объединении');
  equal(s.evalCtx('retreatLive.length'), 8, 'все выжившие после отступления сохранены');
  equal(s.evalCtx('activeRecipient.isRetreated'), undefined, 'объединённый боеспособный отряд больше не помечен отступившим');
  equal(s.evalCtx('Math.max(...retreatSlotSizes)'), 10, 'после объединения не превышена исходная вместимость');
});

test('самостоятельное огненное поле даёт выбрать любые три клетки и не раскрывает разметку', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalBeginStandaloneFireFieldSelection', 'tacticalStandaloneFireFieldEditClick']);
  s.run(`
    appData.map={mode:'view',grid:{'0,0':{markers:[]},'4,0':{markers:[]},'1,4':{markers:[]}},fireFields:[]};
    var began=tacticalBeginStandaloneFireFieldSelection({name:'Отдельный взвод'});
    tacticalStandaloneFireFieldEditClick('0,0');
    tacticalStandaloneFireFieldEditClick('4,0');
    tacticalStandaloneFireFieldEditClick('1,4');
    var standaloneField=appData.map.fireFields[0];
  `);
  equal(s.evalCtx('began'), true, 'режим выбора поля включён');
  equal(s.evalCtx('appData.map.mode'), 'view', 'после выбора трёх клеток режим возвращается в бой');
  equal(s.evalCtx('standaloneField.state'), 'armed', 'поле вооружено после третьего выбора');
  equal(s.evalCtx('standaloneField.hexes.length'), 3, 'можно выбрать любые три клетки');
  assert(s.evalCtx("appData.map.grid['0,0'].markers.includes('fireField') && appData.map.grid['4,0'].markers.includes('fireField') && appData.map.grid['1,4'].markers.includes('fireField')"), 'владелец видит все три отметки');
});

// 22. Велосипедная стоянка хранит владельца и теряется при входе противника на гекс.
test('13: тактический БТР высаживает пассажира в собственный текущий гекс', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['disembarkSquad']);
  s.run(`
    var currentSquadIndex = 0, currentSquad = null;
    var actionPoints = {0:{ap:3}};
    function spendAP(index, cost) { if (actionPoints[index].ap < cost) return false; actionPoints[index].ap -= cost; return true; }
    function getActionCost() { return 1; }
    function renderSquadSelector() {} function renderEmbarkPanel() {} function updateUI() {}
    var carrier = {name:'БТР №1', armor:{front:4}, embarkedSquadIndex:1};
    var passenger = {name:'Пехотный взвод', hidden:true, fighters:[{hp:3}]};
    appData.squads = [carrier, passenger]; currentSquad = carrier;
    appData.map = {grid:{'2,3':{squadIds:[0],enemySquadIds:[]},'1,1':{squadIds:[1],enemySquadIds:[]}}};
    disembarkSquad();
    var destination = getBattleSquadHex(appData.map.grid, 1, false);
    var passengerLocations = Object.keys(appData.map.grid).filter(key => appData.map.grid[key].squadIds.includes(1));
  `);
  equal(s.evalCtx('destination.key'), '2,3', 'пассажир появляется на гексе БТР');
  equal(s.evalCtx('passenger.hidden'), false, 'пассажир снова видим и активен');
  equal(s.evalCtx('passengerLocations.length'), 1, 'старая позиция пассажира удалена');
  equal(s.evalCtx('carrier.embarkedSquadIndex'), null, 'связь с десантом очищена');
  equal(s.evalCtx('actionPoints[0].ap'), 2, 'высадка тратит ОД БТР');
});

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
