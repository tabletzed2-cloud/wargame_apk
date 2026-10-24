// Targeted regressions for requested items 7 and 10.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.log(`✗ ${name} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function equal(actual, expected, message) {
  assert(actual === expected, `${message || 'equality'}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function loadHtml(s, names) { names.forEach(name => s.run(sliceFunction(HTML, name))); }
function newSquad(name) {
  return { name, faction: 'BeVe', subfaction: 'belgian', fighters: [{ name: name + ' бойц.', hp: 3, maxHp: 3 }],
    ammoSmall: 12, ammoOrdnance: 2, grenades: 3, hidden: false, armor: null };
}
function installCardLibraries(s) {
  s.run('appData.factions = { _global: { cardLibrary: GLOBAL_CARDS }, BeVe: { cardLibrary: BEVE_CARDS }, "A.I.R.F.": { cardLibrary: AIRF_CARDS } };');
}

// 7. A telephone cable is rebuilt only after its recipient finishes its move order.
test('7: telephone line stays broken during movement and is rebuilt after the final waypoint', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['executeMoveOrder']);
  s.run(`
    var OP_MAP_COLS = 20, OP_MAP_ROWS = 15, currentTurn = 1;
    var hardMode = { enabled: true, hqUnitId: 0, phoneLines: [], signalPlatoon: { phones: { assigned: [] } } };
    var calls = 0;
    var unit = { id: 'u', name: 'Взвод', type: 'infantry_platoon', col: 1, row: 0, ap: 1, mobility: 'foot', squads: [] };
    var hq = { id: 'hq', name: 'Штаб батальона', type: 'battalion_hq', col: 0, row: 0, ap: 4, squads: [] };
    appData.campaign.opUnits = [hq, unit];
    appData.campaign.enemyOpUnits = [];
    function reconnectPhoneLinesAfterUnitMove() { calls++; return 1; }
    function getOpMoveCost() { return 1; }
    function isStaticOpUnit() { return false; }
    function getOpHexDistance(a,b,c,d) { return Math.abs(a-c) + Math.abs(b-d); }
    function buildOrderRoute(mover, _waypoints) { return { route: mover.col === 1 ? [{col:2,row:0},{col:3,row:0}] : [{col:3,row:0}], waypoints: [], target: {col:3,row:0} }; }
    function checkEnemyEncounter() { return false; }
    function checkMovingFire() {}
    function opRecordPrevPos() {}
    function saveData() {}
    function redrawOperationalMap() {}
    function renderActiveOrders() {}
    function isHexInPlayableArea() { return true; }
    function onlineEnemyVisible() { return true; }
    var order = { targetHex: '3,0', status: 'active', behavior: 'hold', waypoints: [] };
    executeMoveOrder(unit, order);
    var afterFirstMove = { col: unit.col, row: unit.row, calls: calls, status: order.status };
    unit.ap = 1;
    executeMoveOrder(unit, order);
    var afterArrival = { col: unit.col, row: unit.row, calls: calls, status: order.status };
  `);
  const mid = JSON.parse(s.evalCtx('JSON.stringify(afterFirstMove)'));
  const end = JSON.parse(s.evalCtx('JSON.stringify(afterArrival)'));
  equal(mid.col, 2, 'юнит выполнил только доступный шаг');
  equal(mid.calls, 0, 'до конечной точки перепрокладка не запускается');
  equal(mid.status, 'active', 'маршрут продолжится следующим ходом');
  equal(end.col, 3, 'юнит достиг цели приказа');
  equal(end.calls, 1, 'после прибытия кабель перепрокладывается ровно один раз');
  equal(end.status, 'completed', 'приказ завершён до обработки перепрокладки');
  const moveBody = sliceFunction(HTML, 'executeMoveOrder');
  const arrivalCheck = moveBody.indexOf('if (unit.col === targetCol && unit.row === targetRow)');
  const reconnectCall = moveBody.indexOf('reconnectPhoneLinesAfterUnitMove(unit)', arrivalCheck);
  assert(arrivalCheck >= 0 && reconnectCall > arrivalCheck, 'вызов должен стоять в ветке достижения конечной точки');
});

test('7: перепроложенный кабель соединяет новый гекс взвода с текущим гексом штаба', () => {
  const s = createSandbox(freshAppData());
  // ⚡ v13.109 (п.4): перекладка кабеля вынесена в buildPhoneSignalRouteTo,
  //    предел длины — константа PHONE_LINE_MAX_STEPS.
  s.run(sliceConst(HTML, 'PHONE_LINE_MAX_STEPS'));
  loadHtml(s, ['getSignalHQ', 'findSignalPath', 'signalInfantryMover', 'normalizePhoneRoutePoints',
    'enemiesBlockingSignalAt', 'validatePhoneSignalRoute', 'buildPhoneSignalRouteTo',
    'reconnectPhoneLinesAfterUnitMove']);
  s.run(`
    var hardMode = { enabled: true, hqUnitId: 0, phoneLines: [
      { id: 'phone-line-1', fromUnitId: 0, toUnitId: 1, path: [{col:0,row:0},{col:1,row:0}],
        fromHex: '0,0', toHex: '1,0', intact: false, laying: false }
    ], signalPlatoon: { phones: { assigned: [
      { unitId: 0, id: 'hq-phone', status: 'active' }, { unitId: 1, id: 'unit-phone', status: 'active' }
    ] } } };
    var hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 0, row: 0, isDestroyed: false };
    var unit = { name: 'Взвод', type: 'infantry_platoon', col: 3, row: 0, isDestroyed: false };
    appData.campaign.opUnits = [hq, unit]; appData.campaign.enemyOpUnits = [];
    function hasActivePhoneAt() { return true; }
    function getOpHexNeighbors(c,r) { return [{col:c+1,row:r},{col:c-1,row:r},{col:c,row:r+1},{col:c,row:r-1}].filter(p=>p.col>=0&&p.row>=0); }
    function getOpMoveCost() { return 1; }
    function isStaticOpUnit() { return false; }
    function getOpHexDistance(a,b,c,d) { return Math.abs(a-c) + Math.abs(b-d); }
    function saveData() {}
    var rebuiltCount = reconnectPhoneLinesAfterUnitMove(unit);
    var line = hardMode.phoneLines[0];
  `);
  equal(s.evalCtx('rebuiltCount'), 1, 'одна связанная линия восстановлена');
  equal(s.evalCtx('line.intact'), true, 'линия снова действующая');
  equal(s.evalCtx('line.fromHex'), '0,0', 'начало кабеля у штаба');
  equal(s.evalCtx('line.toHex'), '3,0', 'конец кабеля на новой позиции взвода');
  equal(s.evalCtx('JSON.stringify(line.path)'), '[{"col":0,"row":0},{"col":1,"row":0},{"col":2,"row":0},{"col":3,"row":0}]', 'маршрут проведён по соседним гексам');
  s.run(`hq.col = 1; line.intact = false; var hqRebuiltCount = reconnectPhoneLinesAfterUnitMove(hq);`);
  equal(s.evalCtx('hqRebuiltCount'), 1, 'перемещение штаба обновляет связанные линии');
  equal(s.evalCtx('line.fromHex'), '1,0', 'новая телефонная линия начинается на текущем гексе штаба');
  equal(s.evalCtx('JSON.stringify(line.path)'), '[{"col":1,"row":0},{"col":2,"row":0},{"col":3,"row":0}]', 'для штаба строится новый маршрут до прежнего получателя');
});

// 10. Campaign setup contains distinct infantry, sapper and recon card sections;
// assignments are persistent and applied to the selected platoon before deployment.
test('10: начальная кампания показывает отдельные разделы пехоты, сапёров и разведки', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceConst(HTML, 'INITIAL_CAMPAIGN_CARD_CATEGORIES'));
  loadHtml(s, ['computeSubFactionFromSquads', 'getUnitCardFactionContext', 'getCardDefinitionByName',
    'getCardTargetSpec', 'getCardTargetCandidates', 'isCardAvailableToUnit', 'isCardSelectableOpUnit', 'isBicycleTacticalSquad',
    'collectCardLibraryForContext', 'escapeCardHtml', 'initialCampaignCardUnitHtml', 'initialCardDistributionHtml', 'renderInitialCampaignCardDistribution']);
  installCardLibraries(s);
  s.run(`
    function computeSubFactionFromSquads() { return null; }
    function getCurrentCampaignBattle() { return null; }
    appData.campaign.opUnits = [
      { name:'Пехотный взвод', type:'infantry_platoon', faction:'BeVe', squads:[${JSON.stringify(newSquad('Пехотное отделение №1'))}] },
      { name:'Сапёрный взвод', type:'engineer_platoon', faction:'A.I.R.F.', squads:[{...${JSON.stringify(newSquad('Саперное отделение №1'))},faction:'A.I.R.F.'}] },
      { name:'Разведывательный взвод', type:'recon_platoon', faction:'A.I.R.F.', squads:[{...${JSON.stringify(newSquad('Развед. отделение №1'))},faction:'A.I.R.F.'}] },
      { name:'Штаб батальона', type:'battalion_hq', faction:'BeVe', squads:[${JSON.stringify(newSquad('Штаб взвода'))}] }
    ];
    renderInitialCampaignCardDistribution();
  `);
  const html = s.elements.campaignContent.innerHTML;
  assert(html.includes('Пехотные взводы') && html.includes('Сапёрные взводы') && html.includes('Разведывательные взводы'), 'показаны три отдельные категории');
  assert(html.includes('Пехотный взвод') && html.includes('Сапёрный взвод') && html.includes('Разведывательный взвод'), 'категории заполнены подходящими взводами');
  assert(!html.includes('Штаб батальона'), 'карточки не выдаются штабу батальона');
  assert(html.includes('Двойной БК'), 'общие бонусные карты доступны для выбора на старте');
  assert(html.includes('<details class="initial-card-unit') && html.includes('<summary class="initial-card-unit-summary'), 'список каждого взвода сворачивается, открывая карту');
});

test('10: снятие бонусной карты немедленно обновляет счётчик выбора', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['toggleInitialCampaignCard', 'saveInitialCampaignCardDraft']);
  s.run(`
    var countLabel = { textContent: '' };
    var fakeGroup = { querySelectorAll: () => [
      { dataset: { cardName: 'Первая карта' } }, { dataset: { cardName: 'Вторая карта' } }
    ], querySelector: () => countLabel };
    document.querySelector = () => fakeGroup;
    document.querySelectorAll = () => [];
    var uncheckedCard = { checked: false, dataset: { unitIndex: '0', cardName: 'Карта' } };
    var changed = toggleInitialCampaignCard(uncheckedCard);
  `);
  equal(s.evalCtx('changed'), false, 'снятая карточка не остаётся выбранной');
  equal(s.evalCtx('countLabel.textContent'), 'Выбрано: 2/3', 'счётчик отражает оставшиеся отмеченные карты');
});

test('10: карта, назначенная на старте, применяется ровно к выбранному взводу и закрывает повторный выбор', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['computeSubFactionFromSquads', 'getUnitCardFactionContext', 'getCardDefinitionByName',
    'getCardTargetSpec', 'getCardTargetCandidates', 'isCardAvailableToUnit', 'isCardSelectableOpUnit',
    'countBattalionBonusCardCopies', 'getRandomFourthCardForUnit', 'addAppliedCardName',
    'applyCardToPlatoon', 'commitInitialCampaignCardAssignments']);
  installCardLibraries(s);
  s.run(`
    var selectedFaction = 'BeVe';
    function computeSubFactionFromSquads() { return null; }
    var infantrySquad = ${JSON.stringify(newSquad('Отделение №1'))};
    var supportSquad = ${JSON.stringify(newSquad('Отделение №2'))};
    var infantry = { name:'Пехотный взвод', type:'infantry_platoon', faction:'BeVe', squads:[infantrySquad] };
    var support = { name:'Сапёрный взвод', type:'engineer_platoon', faction:'A.I.R.F.', squads:[supportSquad] };
    appData.campaign.opUnits = [infantry, support];
    var ok = commitInitialCampaignCardAssignments([
      { unitName:'Пехотный взвод', cards:[{name:'Двойной БК',faction:'_global'}], targets:{'Двойной БК':['Отделение №1']} }
    ]);
    var doubledAmmoCard = getCardDefinitionByName('Двойной БК', '_global');
    applyCardToPlatoon(doubledAmmoCard, '_global', infantry, infantry.squads, ['Отделение №1'], {initial:false});
  `);
  equal(s.evalCtx('ok'), true, 'раздача принята');
  equal(s.evalCtx('infantry.squads[0].ammoSmall'), 24, 'патроны выбранного взвода удвоены');
  equal(s.evalCtx('infantry.squads[0].grenades'), 6, 'гранаты выбранного взвода удвоены');
  equal(s.evalCtx('infantry.squads[0].ammoOrdnance'), 4, 'снаряды выбранного взвода удвоены');
  equal(s.evalCtx('support.squads[0].ammoSmall'), 12, 'карта не затронула соседний взвод');
  equal(s.evalCtx('infantry.cardSelection.done'), true, 'выбор отмечен завершённым и не запрашивается повторно в первом бою');
  equal(s.evalCtx('infantry.cardSelection.campaignStart'), true, 'назначение помечено как кампанийное');
  equal(s.evalCtx('infantry.cardSelection.targets["Двойной БК"]'), undefined, 'карта не требует выбора цели — действует на весь взвод');
  equal(s.evalCtx('support.cardSelection.done'), true, 'для остальных карточных взводов сохраняется явный выбор «без карт»');
  equal(s.evalCtx('appData.campaign.initialPlatoonCardsAssigned'), true, 'начальная раздача сохранена в кампании');
});

test('10: третья стартовая бонусная карта закрепляет случайную четвёртую карту за взводом', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['computeSubFactionFromSquads', 'getUnitCardFactionContext', 'getCardDefinitionByName',
    'getCardTargetSpec', 'getCardTargetCandidates', 'isCardAvailableToUnit', 'isCardSelectableOpUnit',
    'getFactionScopedCardEntries', 'countBattalionBonusCardCopies', 'getRandomFourthCardForUnit',
    'addAppliedCardName', 'applyCardToPlatoon', 'commitInitialCampaignCardAssignments']);
  s.run(`
    var selectedFaction = 'BeVe';
    function computeSubFactionFromSquads() { return null; }
    function getCurrentCampaignBattle() { return null; }
    appData.factions = { BeVe: { cardLibrary: [
      {name:'Тестовый бонус 1',type:'bonus'}, {name:'Тестовый бонус 2',type:'bonus'},
      {name:'Тестовый бонус 3',type:'bonus'}, {name:'Тестовый дебафф',type:'negative'}
    ] } };
    var unit = {name:'Пехотный взвод',type:'infantry_platoon',faction:'BeVe',squads:[${JSON.stringify(newSquad('Отделение №1'))}]};
    appData.campaign.opUnits = [unit];
    var ok = commitInitialCampaignCardAssignments([{unitName:unit.name,cards:[
      {name:'Тестовый бонус 1',faction:'BeVe'}, {name:'Тестовый бонус 2',faction:'BeVe'}, {name:'Тестовый бонус 3',faction:'BeVe'}
    ],targets:{}}]);
  `);
  equal(s.evalCtx('ok'), true, 'раздача трёх бонусов принята');
  equal(s.evalCtx('unit.cardSelection.cards.filter(card => card.type === "bonus").length'), 3, 'назначены ровно три бонуса');
  equal(s.evalCtx('unit.cardSelection.cards.filter(card => card.type === "negative").length'), 1, 'автоматически добавлен один дебафф');
  equal(s.evalCtx('unit.cardSelection.cards.find(card => card.type === "negative").automaticFourthCard'), true, 'случайная четвёртая карта помечена как автоматически добавленная');
});

test('10: раздача стартовых карт идёт отдельным этапом после связи', () => {
  const start = sliceFunction(HTML, 'confirmBattalion');
  assert(/buildOperationalUnits\(\);[\s\S]{0,260}showCampaignReadyAfterCardDistribution\(\)/.test(start),
    'после сборки батальона показывается экран готовности');
  assert(!start.includes('renderInitialCampaignCardDistribution()'), 'карточная раздача не подменяет начальную расстановку/связь');
  const ui = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
  assert(/stage === 'cards'[\s\S]{0,500}openInitialCardDistributionStage\(\)/.test(ui),
    'отдельный этап связи открывает сворачиваемое меню распределения карт');
});

console.log(`\nИтог пунктов 7 и 10: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
