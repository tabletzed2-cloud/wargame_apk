// ⚡ v13.061: version assertions track the current application and cache.
// ⚡ v13.061: targeted regressions for campaign cards, battle hexes, save/restore, and hex-map status.
const fs = require('fs');
const path = require('path');
const { sliceFunction, HTML } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const FNS = [
    'syncFactionCatalogs', 'getDefaultData',
    'getOpUnitByName', 'getBattleUnitNames', 'isCardSelectableOpUnit',
    'getCurrentCampaignBattle', 'ensureBattleSquadOwnership', 'ensureBattleCardSelectionQueue',
    'getCurrentBattleCardSelectionUnit', 'getLiveSquadsForOpUnit', 'getUnitCardFactionContext',
    'getTacticalActiveSide',
    'computeSubFactionFromSquads', 'getCardDefinitionByName', 'getCardTargetSpec', 'getCardTargetCandidates',
    'isCardAvailableToUnit', 'cardSelectionTargetNames', 'escapeCardHtml', 'collectCardLibraryForContext',
    'deepCloneGameData', 'createAddedCrewSquad', 'appendCardAddedSquad', 'addAppliedCardName', 'applyCardToPlatoon',
    'updateActiveCardsBattle', 'getTacticalBattleAnchor', 'battleUnitNamesForSide', 'sameBattleUnitNames',
    'findDuplicateBattleByParticipants', 'startTacticalBattle', 'saveCurrentBattleState', 'switchToBattle',
    'isTacticalHealthEditTestMode', 'adjustHP', 'updateUI'
];
fs.writeFileSync('/tmp/wg_part.js', FNS.map(name => sliceFunction(HTML, name)).join('\n\n'));

let pass = 0;
let fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

const s = createSandbox(freshAppData());
s.sandbox.appData.templates = s.evalCtx('SQUAD_TEMPLATES');
s.sandbox.getScopedActiveModifiersForSquad = () => [];
s.sandbox.getFactionWeapons = () => [];
s.sandbox.getFactionCrewWeapons = () => [];
s.sandbox.getAP = () => 4;
s.sandbox.getMaxShots = () => 0;
s.sandbox.getShotsUsed = () => 0;
s.sandbox.formatTime = () => '14:00';
s.sandbox.updateMainButtons = () => {};
s.sandbox.updateTacticalTurnUI = () => {};
s.sandbox.renderActiveCardButtons = () => {};
s.sandbox.refreshSquadToPlaceDropdown = () => {};
s.sandbox.renderSquadSelector = () => {};
s.sandbox.ensureAP = () => {};
s.sandbox.activateBattleTab = () => {};
s.sandbox.selectSquad = index => { s.sandbox.currentSquad = s.sandbox.appData.squads[index] || null; };
s.sandbox.refreshBattleCardPickUI = () => {};
s.sandbox.syncBattleLossesToCampaign = () => {};
s.sandbox.syncScopedActiveCardsForBattle = () => {};
s.sandbox.refreshAssignedCardEffectsForNewBattle = () => {};
s.sandbox.openHexMapForBattle = () => false;
s.sandbox.renderActiveBattlesList = () => {};
s.sandbox.TACTICAL_MAP_SIZE = 20;
s.run('var currentSquad = null, currentSquadIndex = 0, currentTurn = 1, morale = 5, actionPoints = [{ ap: 4, maxAp: 4 }], ' +
       'inStandaloneBattle = false, selectedFaction = "BeVe", selectedSubFaction = null, suppressed = false, routed = false;');

// 1. Старые сохранённые карточки получают канонический тип, даже если поле уже было задано неверно.
s.run('appData.factions = { BeVe: { cardLibrary: [{ name: "Скоординированный заградительный огонь", type: "negative" }], awards: [] }, ' +
      '"A.I.R.F.": { cardLibrary: [], awards: [] }, _global: { cardLibrary: [], awards: [] } }; syncFactionCatalogs();');
ok(s.evalCtx('appData.factions.BeVe.cardLibrary.find(c => c.name === "Скоординированный заградительный огонь").type') === 'bonus',
   'Старый тип «Скоординированного заградительного огня» мигрирует в bonus');

// 2. Снайперская карта добавляет шаблон к тому взводу, который выбрал карту;
//    карта остаётся видимой в активных картах нового расчёта.
s.run('appData.campaign.opUnits = []; appData.campaign.enemyOpUnits = []; appData.currentBattleId = 71;');
s.run('var __sniperOwner = { name: "Взвод бельгийцев", type: "infantry_platoon", faction: "BeVe", ' +
      'squads: [{ name: "Пехотное отделение №1 Бельгийцы", faction: "BeVe", subfaction: "belgian", fighters: [{ name: "Боец", hp: 3, maxHp: 3 }] }], ' +
      'cardSelection: { done: true, cards: ["Снайперский прицел OIP M.38"], targets: {} } }; ' +
      'appData.campaign.opUnits = [__sniperOwner]; var __sniperCard = getCardDefinitionByName("Снайперский прицел OIP M.38", "BeVe"); ' +
      'var __sniperBattle = { id: 71, playerUnitNames: [__sniperOwner.name], enemyUnitNames: [], playerSquads: [], enemySquads: [] }; ' +
      'appData.campaign.activeBattles = [__sniperBattle]; appData.squads = []; ' +
      'applyCardToPlatoon(__sniperCard, "BeVe", __sniperOwner, __sniperOwner.squads, [], { battle: __sniperBattle, initial: true });');
ok(s.evalCtx('__sniperCard && __sniperCard.addsUnit === "Снайперское звено OIP" && __sniperOwner.squads.some(x => x.cardAddedBy === __sniperCard.name && x.name.indexOf("Снайперское звено OIP") === 0)') === true,
   '«Снайперский прицел OIP M.38» добавляет снайперское звено выбранному взводу');
s.run('currentSquad = appData.squads.find(x => x && x.cardAddedBy === "Снайперский прицел OIP M.38"); updateActiveCardsBattle();');
ok(s.elements.activeCardsListBattle.innerHTML.includes('Снайперский прицел OIP M.38') && s.elements.activeCardsListBattle.innerHTML.includes('Снайперская винтовка.jpg'),
   'В активных картах расчёта отображаются карта, название и изображение');

// 3. ИПП из кампании ставит hasIPP у живых раненых бойцов AIRF; updateUI выводит кнопку.
s.run('var __ippUnit = { name: "Взвод AIRF", type: "infantry_platoon", squads: [] }; ' +
      'var __ippSquads = [{ name: "Стрелковое отделение №24", faction: "A.I.R.F.", fighters: [{ name: "Раненый", hp: 2, maxHp: 3 }, { name: "Целый", hp: 3, maxHp: 3 }] }, ' +
      '{ name: "Стрелковое отделение №25", faction: "A.I.R.F.", fighters: [{ name: "Раненый 2", hp: 1, maxHp: 3 }] }]; ' +
      '__ippUnit.squads = __ippSquads; appData.squads = __ippSquads; currentSquad = __ippSquads[0]; ' +
      'applyCardToPlatoon({ name: "Индивидуальный перевязочный пакет" }, "A.I.R.F.", __ippUnit, __ippSquads, ["Стрелковое отделение №24"], {});');
ok(s.evalCtx('__ippSquads[0].fighters[0].hasIPP === true && __ippSquads[0].fighters[1].hasIPP === true && !__ippSquads[1].fighters[0].hasIPP') === true,
   'ИПП применяется только к выбранному отделению и помечает его живых бойцов AIRF');
s.run('inStandaloneBattle = false; selectedFaction = "A.I.R.F."; currentSquad = __ippSquads[0]; updateUI();');
ok(s.elements.squadContainer.innerHTML.includes('onclick="useFighterIPP(0)"'),
   'UI тактического боя показывает кнопку ИПП раненому бойцу AIRF');

// 4. Ручное изменение HP закрыто вне теста и доступно только в тестовом режиме.
s.run('var __hpBefore = currentSquad.fighters[0].hp; var __realUpdateUI = updateUI; updateUI = function() {}; ' +
      'inStandaloneBattle = true; selectedFaction = "BeVe"; adjustHP(0, 1); var __hpAfterDenied = currentSquad.fighters[0].hp; ' +
      'selectedFaction = "test"; adjustHP(0, 1); var __hpAfterAllowed = currentSquad.fighters[0].hp; updateUI = __realUpdateUI;');
ok(s.evalCtx('__hpAfterDenied === __hpBefore && __hpAfterAllowed === __hpBefore + 1') === true,
   'Ручное изменение HP заблокировано вне тестового режима и разрешено в тестовом');

// 5. Новые участники боя получают очередь выбора, уже выбравшие карточки — нет.
s.run('var __queueA = { name: "Участник А", type: "infantry_platoon", squads: [{ name: "А1", fighters: [{ hp: 3 }] }], ' +
      'cardSelection: { done: true, cards: ["Карта А"], targets: {} } }; ' +
      'var __queueB = { name: "Участник Б", type: "infantry_platoon", squads: [{ name: "Б1", fighters: [{ hp: 3 }] }], cardSelection: null }; ' +
      'appData.campaign.opUnits = [__queueA, __queueB]; ' +
      'var __queueBattle = { playerUnitNames: ["Участник А", "Участник Б"], cardsChosen: true, cardSelectionQueue: [] }; ' +
      'var __pickQueue = ensureBattleCardSelectionQueue(__queueBattle, ["Участник Б"]);');
ok(s.evalCtx('JSON.stringify(__pickQueue)') === '["Участник Б"]' && s.evalCtx('__queueA.cardSelection.cards[0]') === 'Карта А',
   'Новый участник выбирает карты отдельно; участник с выбором не попадает в очередь повторно');

// 6. Якорь выбирает атакованный/запрошенный гекс, а повторный бой на старом гексе объединяется.
const anchor = s.evalCtx('getTacticalBattleAnchor([{name:"Атакующий",col:7,row:4}], [{name:"Защитник",col:8,row:4}], null)');
ok(anchor && anchor.col === 8 && anchor.row === 4, 'Якорь боя при движении — позиция защитника на атакованном гексе');
s.run('appData.campaign.opUnits = [{ name: "Атакующий", type: "infantry_platoon", col: 8, row: 4, ' +
      'squads: [{ name: "Штурмовое отделение", faction: "BeVe", fighters: [{ name: "А", hp: 3, maxHp: 3 }] }], cardSelection: { done: true, cards: [], targets: {} } }]; ' +
      'appData.campaign.enemyOpUnits = [{ name: "Защитник", type: "infantry_platoon", col: 8, row: 4, ' +
      'squads: [{ name: "Стрелковое отделение", faction: "A.I.R.F.", fighters: [{ name: "Б", hp: 3, maxHp: 3 }] }] }]; ' +
      'appData.campaign.activeBattles = [{ id: 5, hexKey: "7,4", playerUnitNames: ["Атакующий"], enemyUnitNames: ["Защитник"], ' +
      'playerSquads: [], enemySquads: [], tacticalMap: { grid: {}, mapSize: 20 }, cardsChosen: true, cardSelectionQueue: [] }]; ' +
      'startTacticalBattle(appData.campaign.opUnits[0], appData.campaign.enemyOpUnits[0], { silent: true });');
ok(s.evalCtx('appData.campaign.activeBattles.length === 1 && appData.campaign.activeBattles[0].hexKey === "8,4"') === true,
   'Повторный бой не создаётся на гексе, откуда пришёл атакующий; прежняя запись перенесена на цель');
s.run('appData.campaign.activeBattles = []; appData.campaign.opUnits[0].col = 7; appData.campaign.enemyOpUnits[0].col = 9; ' +
      'startTacticalBattle(appData.campaign.opUnits[0], appData.campaign.enemyOpUnits[0], { silent: true, mirrorOf: { hexKey: "12,8" } });');
ok(s.evalCtx('appData.campaign.activeBattles.length === 1 && appData.campaign.activeBattles[0].hexKey === "12,8"') === true,
   'Онлайн-зеркало берёт гекс из opts.mirrorOf.hexKey');

// 7. Save → clear live state → switchToBattle restores placement, cards, map and turn.
s.run('var __savedSquad = { name: "Отделение А", opUnitName: "Взвод А", fighters: [{ name: "Боец", hp: 1, maxHp: 3, hasIPP: true }] }; ' +
      'var __savedBattle = { id: 92, hexKey: "3,3", playerUnitNames: ["Взвод А"], enemyUnitNames: ["Враг"], playerSquads: [__savedSquad], enemySquads: [], ' +
      'tacticalMap: { grid: { "5,5": { squadIds: [0], enemySquadIds: [] } }, enemySquads: [], mapSize: 20 }, currentTurn: 2, cardsChosen: true, cardSelectionQueue: [], ' +
      'placement: { phase: "placing", playerReady: false, enemyReady: true } }; ' +
      'appData.campaign.opUnits = [{ name: "Взвод А", type: "infantry_platoon", isInBattle: true, squads: [], ' +
      'cardSelection: { done: true, cards: ["Дополнительный паек"], targets: {} } }]; ' +
      'appData.campaign.activeBattles = [__savedBattle]; appData.currentBattleId = 92; appData.squads = [__savedSquad]; ' +
      'appData.map = JSON.parse(JSON.stringify(__savedBattle.tacticalMap)); currentTurn = 3; ' +
      'saveCurrentBattleState(); appData.squads = []; appData.map = null; appData.currentBattleId = null; ' +
      'var __restoredPlacement = null; battleStartUI = function(b) { __restoredPlacement = b.placement; }; ' +
      'switchToBattle(92);');
ok(s.evalCtx('__savedBattle.playerSquads[0].fighters[0].hp === 1 && __savedBattle.playerSquads[0].fighters[0].hasIPP === true && ' +
             '__savedBattle.tacticalMap.grid["5,5"].squadIds[0] === 0 && __savedBattle.currentTurn === 3 && ' +
             '__restoredPlacement.phase === "placing" && appData.campaign.opUnits[0].cardSelection.cards[0] === "Дополнительный паек"') === true,
   'Возврат в незавершённый бой восстанавливает расстановку, HP, ход и выбор карточек');

// 8. Invoke the exact onclick expression from the real button markup and check both states.
const hexButtonHandler = (HTML.match(/id="opHexMapsBtn" onclick="([^"]+)"/) || [])[1];
ok(hexButtonHandler === 'showHexEditorsMenu()', 'Кнопка карты гексов подключена к реальному обработчику');
s.run('appData.campaign.hexOverlays = {}; appData.campaign.selectedOpUnit = null; var __emptyHexResult = ' + hexButtonHandler + ';');
ok(s.evalCtx('__emptyHexResult === false') && s.elements.opHexMenuStatus.style.display === 'block' && s.elements.opHexMenuStatus.innerHTML.includes('Нет доступных правок'),
   'При клике без правок статус видим и сообщает, что изменений пока нет');
s.run('appData.campaign.hexOverlays = { "4,5": { trenchPoints: 2, prepPoints: 1 } }; var __availableHexResult = ' + hexButtonHandler + ';');
ok(s.evalCtx('__availableHexResult === true') && s.elements.opHexMenuStatus.style.display === 'block' &&
   s.elements.opHexMenuStatus.innerHTML.includes('(4,5)') && s.elements.opHexEditsPanel.style.display === 'block',
   'При доступных правках статус и панель показывают гекс и виды работ');

// 9. Destroyed operational units remain omitted; version and SW cache are aligned.
ok(/if\s*\(!unit\s*\|\|\s*unit\.isDestroyed\)\s*return/.test(HTML),
   'Отрисовка карты кампании пропускает уничтоженные юниты');
ok(HTML.includes("var APP_VERSION = 'v13.061'") && HTML.includes('>v13.061</p>') &&
   fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8').includes("const CACHE_NAME = 'wargame-v13.061'"),
   'Отображаемая версия, APP_VERSION и кэш service worker согласованы на v13.061');
ok(HTML.includes('function forceAppUpdate()') && HTML.includes("sw.getRegistration()") && HTML.includes("sw.register('./service-worker.js', { updateViaCache: 'none' })"),
   'Кнопка обновления проверяет/обновляет service worker, а не только меняет надпись');

console.log(`\nИтог v13.061: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exitCode = 1;
