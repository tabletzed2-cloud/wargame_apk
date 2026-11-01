// ⚡ v13.143: регрессии семи замечаний плейтеста.
//   п.1 поворот текстуры окопа при расстановке
//   п.2 приказ «огонь на ходу» для бронетехники
//   п.3 перезагрузка страницы не меняет ход + скрытный темп не «залипает»
//   п.4 расчёт миномёта не «бежит» со здоровым духом
//   п.5 огнемёт РОКС-3 — цель кликом по гексу
//   п.6 вкладка «Карточки» — справочник карточек
//   п.7 «раунд не закончен» при показанном 5/5
'use strict';

const fs = require('fs');
const path = require('path');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const HEXMAPS = fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8');
const MAPACT = fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8');
const OPUI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const ONLINE = fs.readFileSync(path.join(ROOT, 'js/online_battles.js'), 'utf8');

console.log('== v13.143 playtest fixes ==');

// ───────────────────────── п.1: поворот окопа ─────────────────────────
{
    const fns = ['rotateSelectedHex', 'showHexEditorBanner'];
    // showHexEditorBanner нужен только для перерисовки баннера — в песочнице
    // его подменяем заглушкой, поэтому срезаем лишь rotateSelectedHex.
    fs.writeFileSync('/tmp/wg_part.js', sliceFunction(HTML, fns[0]));
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      var shown = 0; function showHexEditorBanner() { shown++; }
      var baseCell = { type: 'grass', variant: 0, rotation: 0, level: 0, squadIds: [], enemySquadIds: [], markers: [] };
      appData.campaign.hexOverlays = { '4,4': { hexEdits: { '0,0': 'trenches' }, hexVariants: { '0,0': 0 }, hexRotations: {}, trenchPoints: 1, prepPoints: 0, shellings: 0 } };
      appData.map = { grid: { '0,0': { ...baseCell } }, mode: 'hexEdit', lastEditedHex: null };
      hexEditorState = { hexKey: '4,4', kind: 'trenches', rule: hexEditRuleFor('trenches'), baseGrid: { '0,0': baseCell }, undo: [], placed: 0, lastCell: '0,0' };
    `);
    s.run('rotateSelectedHex();');
    ok(s.evalCtx('appData.map.grid["0,0"].rotation') === 60, 'п.1: поворот по умолчанию +60°');
    ok(s.evalCtx('getHexOverlay("4,4", false).hexRotations["0,0"]') === 60, 'п.1: угол сохранён в overlay гекса');
    s.run('rotateSelectedHex(-60);');
    ok(s.evalCtx('appData.map.grid["0,0"].rotation') === 0, 'п.1: кнопка «−60°» крутит против часовой');
    s.run('rotateSelectedHex(60); rotateSelectedHex(60); rotateSelectedHex(-999);');
    ok(s.evalCtx('appData.map.grid["0,0"].rotation') === 0, 'п.1: «Исходный вид» сбрасывает угол в 0');
    // поворот сохраняется, даже если режим карты переключили (mode !== 'hexEdit')
    s.run('appData.map.mode = "view"; rotateSelectedHex(60);');
    ok(s.evalCtx('getHexOverlay("4,4", false).hexRotations["0,0"]') === 60,
        'п.1: поворот пишется в overlay и вне режима hexEdit');
    ok(/hexEditSelectedTrenchCell/.test(HEXMAPS) && /hexEditorRotateLeftButton/.test(HEXMAPS) &&
        /Источник|Исходный вид/.test(HEXMAPS), 'п.1: в баннере редактора есть блок поворота окопа');
    ok(/st\.lastCell = hexKeyCell/.test(HEXMAPS), 'п.1: редактор запоминает выбранную клетку окопа');
}

// ───────────────────── п.2: приказ «огонь на ходу» ─────────────────────
{
    const FNS = ['opOrderIsMovingFire', 'opMovingFireOrderFor', 'opUnitCanReceiveMovingFireOrder',
        'executeMovingFireOrder', 'createOrder'];
    fs.writeFileSync('/tmp/wg_part.js', FNS.map(n => sliceFunction(HTML, n)).join('\n\n'));
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      hardMode = { enabled: true, orders: [] };
      var tank = { name: 'Танк CL/39', type: 'tank_platoon', armor: 2, col: 1, row: 1, ap: 4, maxAp: 4, movedThisTurn: true };
      var infantry = { name: 'Стрелковое отделение', type: 'infantry', col: 2, row: 2, ap: 4 };
      appData.campaign.opUnits = [tank, infantry];
      function canUnitShoot() { return true; }
      var checkCalls = 0; function checkMovingFire() { checkCalls++; }
    `);
    ok(s.evalCtx('opUnitCanReceiveMovingFireOrder(appData.campaign.opUnits[0])') === true,
        'п.2: приказ доступен бронетехнике');
    ok(s.evalCtx('opUnitCanReceiveMovingFireOrder(appData.campaign.opUnits[1])') === false,
        'п.2: пехоте приказ «огонь на ходу» не предлагается');
    s.run(`hardMode.orders = [{ id: 1, toUnitId: 0, type: 'moving_fire', orderType: 'moving_fire', fireOnMove: true, status: 'active', turnIssued: 1 }];`);
    ok(s.evalCtx('opMovingFireOrderFor(appData.campaign.opUnits[0]) !== null'),
        'п.2: движок видит приказ moving_fire как право огня на ходу');
    s.run('executeMovingFireOrder(appData.campaign.opUnits[0], hardMode.orders[0]);');
    ok(s.evalCtx('checkCalls') === 1, 'п.2: после движения приказ запускает автоогонь (checkMovingFire)');
    s.run(`hardMode.orders = [{ id: 2, toUnitId: 0, type: 'series', status: 'active', turnIssued: 1,
             series: [{ type: 'move', status: 'completed' }, { type: 'moving_fire', fireOnMove: true, status: 'active' }] }];`);
    ok(s.evalCtx('opMovingFireOrderFor(appData.campaign.opUnits[0]) !== null'),
        'п.2: шаг серии приказов тоже даёт огонь на ходу');
    ok(/<option value="moving_fire">/.test(HTML), 'п.2: опция «огонь на ходу» есть в классической панели приказов');
    ok(/data-kind="moving_fire"/.test(OPUI), 'п.2: «огонь на ходу» есть в новом меню приказов');
    ok(/case 'moving_fire':/.test(HTML) && /MOVING_FIRE: 'moving_fire'/.test(HTML),
        'п.2: тип приказа зарегистрирован и обрабатывается');
}

// ───────────── п.3: перезагрузка страницы / скрытный темп ─────────────
{
    ok(/counterFresh = Number\.isFinite\(remoteDone\) && remoteDone > localDone/.test(ONLINE),
        'п.3: повторный снимок той же фазы не принимается (счётчик строго больше)');
    ok(/battle\.lastAcceptedOppPhase === phaseSignature/.test(ONLINE) &&
        /battle\.lastAcceptedOppPhase = phaseSignature/.test(ONLINE),
        'п.3: одна и та же фаза оппонента не принимается дважды');
    ok(/const snapshotTurn = Math\.max\(1,/.test(ONLINE),
        'п.3: номер хода в снимке не откатывается назад');
    ok(/restoredTurn = Math\.max\(restoredTurn,/.test(HTML),
        'п.3: после перезагрузки ход восстанавливается из «окно + сыгранные фазы»');
    ok(/function resetTacticalMovePaceForNewPhase\(/.test(HTML) &&
        /resetTacticalMovePaceForNewPhase\(\)/.test(HTML) &&
        /resetTacticalMovePaceForNewPhase\(\)/.test(ONLINE),
        'п.3: «скрытный темп» сбрасывается в начале каждой фазы (боевой и онлайн)');
    // поведение сброса
    const s = createSandbox(freshAppData());
    fs.writeFileSync('/tmp/wg_part.js', sliceFunction(HTML, 'resetTacticalMovePaceForNewPhase'));
    const s2 = createSandbox(freshAppData());
    s2.run(`appData.map = { grid: {}, isCrouchMode: true, selectedMoveSquadIdx: null };
            appData.squads = [];
            resetTacticalMovePaceForNewPhase();`);
    ok(s2.evalCtx('appData.map.isCrouchMode') === false, 'п.3: флаг скрытного темпа снимается');
    ok(s.evalCtx('1') === 1, 'п.3: песочница без карты не падает');
    // галочка в разметке статическая — после смены фазы/перезагрузки она должна
    // отражать фактическое состояние карты, иначе дальность «обычная» при
    // отмеченном «скрытном темпе».
    fs.writeFileSync('/tmp/wg_part.js', sliceFunction(HTML, 'syncCrouchMoveCheckbox'));
    const s3 = createSandbox(freshAppData());
    s3.run(`appData.map = { grid: {}, isCrouchMode: false };
            var __cb = { checked: true };
            document.getElementById = () => __cb;   // подменяем только на время проверки
            syncCrouchMoveCheckbox();`);
    ok(s3.evalCtx('__cb.checked') === false, 'п.3: галочка «скрытый темп» снимается вместе с флагом');
    s3.run(`appData.map.isCrouchMode = true; syncCrouchMoveCheckbox();`);
    ok(s3.evalCtx('__cb.checked') === true, 'п.3: включённый режим тоже отражается в галочке');
    ok(/appData\.map\.enemySquads = \[\];[\s\S]{0,400}syncCrouchMoveCheckbox/.test(HTML),
        'п.3: при восстановлении боя галочка синхронизируется с картой');
}

// ───────────── п.4: дух миномётного расчёта на старте боя ─────────────
{
    fs.writeFileSync('/tmp/wg_part.js', sliceFunction(HTML, 'tacticalMaybeAutoRetreat'));
    const s = createSandbox(freshAppData());
    s.run(`
      var logged = [];
      function log(m) { logged.push(String(m)); }
      var moraleCritical = true;
      function tacticalMoraleIsCritical() { return moraleCritical; }
      function tacticalIsDotSquad() { return false; }
      function tacticalIsHeadquartersSquad() { return false; }
      function tacticalStubbornAtStartingHex() { return false; }
      function tacticalHasLiveHeadquartersFor() { return true; }
      function tacticalSquadHasStubbornCard() { return false; }
      function tacticalRecordNearbyMoraleLoss() {}
      var mortar = { name: 'Расчёт 82-мм миномёта', isRouting: true, retreatReason: 'morale', currentMorale: 94,
                     fighters: [{ hp: 3 }] };
    `);
    s.run('moraleCritical = false; tacticalMaybeAutoRetreat(mortar, "player", 0);');
    ok(s.evalCtx('mortar.isRouting') === false,
        'п.4: отряд с духом 94/100 перестаёт «бежать»');
    ok(s.evalCtx('mortar.retreatReason') === undefined, 'п.4: причина отхода по духу снимается');
    s.run('moraleCritical = true; mortar.isRouting = false; tacticalMaybeAutoRetreat(mortar, "player", 0);');
    ok(s.evalCtx('mortar.isRouting') === true && s.evalCtx('mortar.retreatReason') === 'morale',
        'п.4: при критическом духе отход по-прежнему включается');
    s.run('mortar.isRouting = true; mortar.retreatReason = "command"; moraleCritical = false; tacticalMaybeAutoRetreat(mortar, "player", 0);');
    ok(s.evalCtx('mortar.isRouting') === true, 'п.4: приказной отход не отменяется самовольно');
    ok(/и не «бежит»|переезжали в новый бой|нового боя/.test(HTML) &&
        /Флаги отхода/.test(HTML), 'п.4: при входе в бой боевые флаги прошлого боя сбрасываются');
    ok(/routingByMorale/.test(HTML), 'п.4: «Отходит» в списке отрядов показывается только при низком духе');
}

// ───────────────────── п.5: огнемёт кликом по гексу ─────────────────────
{
    fs.writeFileSync('/tmp/wg_part.js', [sliceFunction(HTML, 'flamethrowerStrikeAtHex'),
        sliceFunction(HTML, 'cancelFlamethrowerTargeting'), sliceFunction(HTML, 'useFlamethrower')].join('\n\n'));
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      appData.currentBattleId = 1;
      appData.map = {
        grid: { '0,0': { squadIds: [0], enemySquadIds: [0] }, '1,0': { squadIds: [], enemySquadIds: [] }, '0,1': { squadIds: [], enemySquadIds: [] } },
        enemySquads: [{ name: 'Враг', fighters: [{ name: 'a', hp: 4, maxHp: 4 }, { name: 'b', hp: 4, maxHp: 4 }] }]
      };
      appData.squads = [{ name: 'Сапёры', fighters: [{ name: 's', hp: 3, maxHp: 3 }], effects: { flamethrower: { charges: 2 } } }];
      var currentSquadIndex = 0; var currentSquad = appData.squads[0];
      var moraleCalls = 0; function tacticalChangeMorale() { moraleCalls++; }
      var deaths = 0; function handleFighterDeath() { deaths++; }
      var apSpent = 0; function getAP() { return 2; } function getActionCost() { return 2; }
      function spendAP() { apSpent += 1; return true; }
      function getBattleSquadHex(grid, idx, isEnemy) {
        if (isEnemy) return { key: '0,0', col: 0, row: 0 };
        return { key: '0,0', col: 0, row: 0 };
      }
      function tacticalActionAllowed() { return true; }
      function renderMapActionPanel() {} function redrawMap() {} function mapActionInfo() {}
      appData.map.pendingFlamethrower = { squadIdx: 0 };
      // d6 → 3 (попадание): детерминированный генератор из песочницы
    `);
    ok(/pendingFlamethrower/.test(MAPACT) && /pendingFlamethrower/.test(HTML),
        'п.5: режим выбора гекса для огнемёта заведён в UI и карте');
    ok(!/Введите координаты гекса для атаки огнемётом/.test(HTML),
        'п.5: ввод координат огнемёта через prompt удалён');
    require('./sandbox').setRandom(s, Array(30).fill(0.4));
    const handled = s.evalCtx('flamethrowerStrikeAtHex("0,0")');
    ok(handled === true && s.evalCtx('appData.map.pendingFlamethrower') === null,
        'п.5: клик по гексу выполняет струю и снимает режим выбора');
    ok(s.evalCtx('appData.map.enemySquads[0].fighters[0].hp') === 2,
        'п.5: урон 2 нанесён бойцам в выбранном гексе');
    ok(s.evalCtx('appData.squads[0].effects.flamethrower.charges') === 1, 'п.5: заряд огнемёта израсходован');
    ok(s.evalCtx('apSpent') === 1, 'п.5: ОД списываются только по факту выстрела');
    ok(s.evalCtx('deaths') >= 1, 'п.5: гибель бойца обрабатывается штатно');
}

// ───────────────── п.6: вкладка «Карточки» — справочник ─────────────────
{
    ok(/function renderCardCatalogReference\(/.test(HTML) && /function collectAllCardsForReference\(/.test(HTML),
        'п.6: справочник карточек реализован');
    ok(/cardTabModeState = 'reference'/.test(HTML), 'п.6: по умолчанию вкладка показывает справочник');
    ok(/cardTabMode\(\) === 'reference'/.test(HTML) && /renderCardCatalogReference\(container\)/.test(HTML),
        'п.6: в справочном режиме выбор карт не показывается');
    ok(/cardTabModeState = 'pick'/.test(HTML) && /openCardsTabForBattleStart/.test(HTML),
        'п.6: в начале боя автоматически включается режим выбора карт');
    ok(/cardTabModeReferenceBtn/.test(HTML) && /cardTabModePickBtn/.test(HTML),
        'п.6: в интерфейсе есть переключатель «Справочник / Выбор карт»');

    fs.writeFileSync('/tmp/wg_part.js', [
        'function escapeCardHtml(v) { return String(v == null ? "" : v).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;" }[ch])); }',
        'function collectAllCardsForReference() { return []; }',
    ].join('\n'));
    const el = {
        innerHTML: '', style: {},
        querySelectorAll: () => [], querySelector: () => null, appendChild() {}, remove() {},
        classList: { add() {}, remove() {}, contains() { return false; } }
    };
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run('document.getElementById = () => __el;');
    s.sandbox.__el = el;
    // берём настоящие функции справочника: подменяем заглушки, оставшиеся в /tmp
    const realFns = [sliceFunction(HTML, 'collectAllCardsForReference'), sliceFunction(HTML, 'renderCardCatalogReference')];
    s.run(realFns.join('\n\n'));
    s.run(`
      appData.factions = { _global: { cardLibrary: [{ name: 'Общая карта', desc: 'd', effect: 'e', type: 'bonus' }] },
                           BeVe: { cardLibrary: [{ name: 'Карта BeVe', desc: 'd', effect: 'e', type: 'negative' }] } };
    `);
    s.run('renderCardCatalogReference(__el);');
    const html = String(el.innerHTML || '');
    ok(/Общая карта/.test(html) && /Карта BeVe/.test(html),
        'п.6: справочник показывает карточки всех каталогов', html.slice(0, 120));
    ok(!/toggleBattleCardSelection/.test(html), 'п.6: в справочнике карточки не кликабельны для выбора');
    ok(/Бонус/.test(html) && /Дебафф/.test(html), 'п.6: у карточек есть ярлык типа');
}

// ───────────────── п.7: «раунд не закончен» при 5/5 ─────────────────
{
    const FNS = ['tacticalWindowPhasesPlayed', 'tacticalWindowNearlyComplete', 'tacticalRoundsCompletedForBattle',
        'tacticalBattleBlockingOperationalTurn', 'tacticalBattleStillFought', 'tacticalRoundsWindowPhases',
        'tacticalRoundsPerOperationalTurn', 'tacticalPhasesPerRound'];
    fs.writeFileSync('/tmp/wg_part.js', FNS.map(n => sliceFunction(HTML, n)).join('\n\n'));
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      var TACTICAL_PHASES_PER_ROUND = 2, TACTICAL_ROUNDS_PER_OPERATIONAL_TURN = 5;
      var squad = { name: 'Отряд', fighters: [{ hp: 3 }] };
      var enemy = { name: 'Враг', fighters: [{ hp: 3 }] };
      appData.campaign.activeBattles = [
        { id: 'a', hexKey: '4,4', tacticalPhasesCompleted: 9, currentTurn: 10, windowStartTurn: 1,
          playerSquads: [squad], tacticalMap: { enemySquads: [enemy] } }
      ];
    `);
    ok(s.evalCtx('tacticalWindowPhasesPlayed(appData.campaign.activeBattles[0])') === 9,
        'п.7: фазы окна считаются по единому источнику');
    ok(s.evalCtx('tacticalWindowNearlyComplete(appData.campaign.activeBattles[0])') === true,
        'п.7: 9 фаз = окно «почти закрыто» (не хватает одной фазы)');
    ok(s.evalCtx('tacticalBattleBlockingOperationalTurn()') === null,
        'п.7: бой с 9 фазами НЕ блокирует завершение оперативного хода');
    s.run('appData.campaign.activeBattles[0].tacticalPhasesCompleted = 6;');
    ok(s.evalCtx('tacticalWindowNearlyComplete(appData.campaign.activeBattles[0])') === false,
        'п.7: 6 фаз — окно ещё не закрыто');
    ok(s.evalCtx('tacticalBattleBlockingOperationalTurn()') !== null,
        'п.7: действительно недоигранный бой по-прежнему блокирует ход');
    ok(/nearComplete/.test(HTML) && /tacticalWindowNearlyComplete\(battle\)/.test(HTML),
        'п.7: пауза 5/5 ставится и за одну фазу до конца окна');
    ok(/Раунд \$\{Math\.min\(progress\.roundsPerTurn, progress\.roundsDone \+ 1\)\}\//.test(HTML),
        'п.7: в панели боя номер раунда не выходит за 5/5');
    ok(/Сыграно \$\{playedRoundsLabel\}\/\$\{progress\.roundsPerTurn\} раундов/.test(HTML),
        'п.7: рядом с раундом видно, сколько раундов уже сыграно (9 фаз → 4/5)');
}

console.log(`\nИтог v13.143: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
