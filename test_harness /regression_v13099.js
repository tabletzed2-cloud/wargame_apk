// ⚡ v13.099: регрессии по отчёту тестировщика (пункты 1–27).
// Проверяем и поведение функций, и связку интерфейса (кнопки/подписи) с логикой.
'use strict';

const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HEXMAPS = read('js/hexmaps.js');
const CARDS = read('js/cards.js');
const PLACEMENT = read('js/placement.js');
const OPUI = read('js/operational_ui.js');
const SW = read('service-worker.js');
const MANIFEST = read('manifest.json');

const CONSTS = ['RECON_RADIUS', 'RECON_RADIUS_ARMORED_CAR',
  // ⚡ v13.099 (п.30): курс/сектора бронетехники и штурм ДОТа
  'VEHICLE_TURN_AP_COST', 'DOT_SABOTAGE_GRENADES', 'DOT_SMOKE_GRENADES',
  'VEHICLE_DIRECTION_LABELS', 'VEHICLE_FAMILIES',
  // ⚡ v13.099 (п.31): термитный заряд в тактическом бою
  'THERMITE_RANGE', 'THERMITE_SUCCESS_MIN', 'THERMITE_DEATH_MIN', 'THERMITE_DEATH_SKIP_NAMES'];
const FNS = [
  'reconRadiusForUnit', 'isArmoredCarReconUnit', 'isSupplyOperationalUnit', 'supplyBattleForceSquads',
  'battleHasUnitRecord', 'tacticalTargetInCurrentBattle', 'operationalInitialCombatStrength',
  'operationalCombatAliveCount', 'operationalUnitIsShattered', 'getTacticalRoundProgress',
  'tacticalPhasesPerRound', 'tacticalRoundsPerOperationalTurn', 'RPTX_PHASES_PER_WINDOW',
  'tacticalRoundsCompletedForBattle', 'opVictimHiddenFromPlayer', 'syncTacticalCrewSuccession',
  'orderInstantDeliveryIsLegit', 'demoteOrderToMessenger',
  'opOrderMarkerEmoji', 'opOrderHexFromValue', 'opOrderExecutionHexes',
  'collectOperationalOrdersForUnit', 'drawSelectedUnitOrdersOnMap',
  'resolveOperationalAreaFire', 'opShootRefusalIsSupplyWait',
  'recordOrderJournal', 'orderJournalEntriesFor', 'orderJournalEventLabel', 'opTextLooksLikeRefusal',
  'getOrderTypeLabel', 'formatTime',
  // ⚡ v13.099 (п.30)
  'vehicleFamilyFor', 'vehicleWeaponSectorSpec', 'vehicleFacingDir', 'vehicleAspectArmorValue',
  'vehicleAspectLabel', 'tacticalVehicleWeaponSectorLabel', 'operationalVehicleMgLimit', 'tacticalOppositeDirection',
  // ⚡ v13.099 (п.31): термитный заряд
  'tacticalSquadHexPosition', 'tacticalSquadsDistance', 'tacticalIsDotSquad', 'vehicleIsArmored', 'tacticalRemoveUnitFromMap',
  'thermiteEsc', 'thermiteToast', 'thermiteTargetDistance', 'thermiteDistanceLabel', 'thermiteArmoredVehicle', 'thermiteDotParts',
  'thermiteEligibleTargets', 'ensureThermiteModal', 'thermiteModalContent', 'closeThermitePicker',
  'openThermitePicker', 'thermiteSetOutcome', 'thermiteBlowDotDoor', 'thermiteBurnDotEmbrasure',
  'thermiteDestroyVehicle', 'thermiteDeathRoll', 'thermiteCommitChoice', 'useThermiteCharge'
];
fs.writeFileSync('/tmp/wg_part.js',
  CONSTS.map(name => sliceConst(HTML, name)).join('\n') + '\n' +
  FNS.map(name => sliceFunction(HTML, name)).join('\n\n'));

let pass = 0, fail = 0;
function ok(condition, label, detail) {
  if (condition) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (detail !== undefined ? ' | ' + detail : '')); }
}
function sliceOf(name) { return sliceFunction(HTML, name); }

function fresh() {
  const s = createSandbox(freshAppData());
  // песочница без внешних модулей: минимальные заглушки, нужные извлечённым функциям
  s.run('function isOperationalMoraleUnit(u) { return !!u; }');
  s.run('function getOperationalCombatFighters(u) { return (u && u.squads || []).reduce((a, sq) => a.concat(sq.fighters || []), []); }');
  s.run('function getTacticalBattleRecord() { return null; }');
  s.run('function log(m) { __logs = (__logs || []).concat(String(m)); }');
  return s;
}

console.log('== v13.099: пункты 1–27 ==');

// ─────────────────────────── п.1: сектор ДОТа — не дальше 3 гексов ───────────────────────────
{
  const s = fresh();
  ok(/const DOT_FIRE_RANGE_HEXES = 3;/.test(HEXMAPS), 'п.1: радиус обстрела ДОТа — 3 гекса');
  const mgDot = { name: 'ДОТ «Bosh»', type: 'dot', col: 5, row: 5,
    squads: [{ name: 'ДОТ «Bosh» расчёт', crewInstances: [{ weaponName: 'Пулемёт Максим' }],
      fixedTacticalPosition: { weaponSectors: { 0: 'e' } } }] };
  const gunDot = { name: 'ДОТ «Van Hees»', type: 'dot', col: 5, row: 5,
    squads: [{ name: 'ДОТ «Van Hees» расчёт', crewInstances: [{ weaponName: 'ПТ-орудие' }],
      fixedTacticalPosition: { weaponSectors: { 0: 'e' } } }] };
  ok(s.evalCtx(`operationalDotSectorAllows(${JSON.stringify(mgDot)}, 6, 5)`) === true, 'п.1: пулемётный ДОТ бьёт в свой сектор');
  ok(s.evalCtx(`operationalDotSectorAllows(${JSON.stringify(mgDot)}, 4, 5)`) === false, 'п.1: пулемётный ДОТ не бьёт вне сектора');
  ok(s.evalCtx(`operationalDotSectorAllows(${JSON.stringify(mgDot)}, 9, 5)`) === false, 'п.1: цель дальше 3 гексов запрещена');
  ok(s.evalCtx(`operationalDotSectorAllows(${JSON.stringify(gunDot)}, 7, 3)`) === true, 'п.1: ПТ-ДОТ Van Hees стреляет по кругу в радиусе');
  ok(s.evalCtx(`operationalDotSectorAllows(${JSON.stringify(gunDot)}, 9, 5)`) === false, 'п.1: круговой сектор тоже ограничен радиусом 3');
  ok(/DOT_FIRE_RANGE_HEXES/.test(sliceOf('drawOperationalDotFireSectors')), 'п.1: отрисовка секторов тоже обрезана радиусом');
}

// ─────────────────────────── п.2: сворачиваемая раздача карт ───────────────────────────
{
  ok(/function minimizeInitialCardDistributionStage/.test(HTML), 'п.2: есть сворачивание меню раздачи');
  const min = sliceOf('minimizeInitialCardDistributionStage');
  ok(!/confirm\(/.test(min), 'п.2: сворачивание не спрашивает «продолжить без карточек»');
  ok(/initialCardStageMinimized = true/.test(min), 'п.2: меню запоминает, что оно свёрнуто');
  ok(/function restoreInitialCardDistributionStage/.test(HTML), 'п.2: меню возвращается с сохранённым выбором');
  ok(/initialCardStageRestoreBar/.test(HTML) && /initialCardStageMinimized/.test(OPUI),
     'п.2: плавающая кнопка возврата учитывает свёрнутое меню');
}

// ─────────────────────────── п.3: дымовые гранаты ───────────────────────────
{
  ok(/Дымовые гранаты/.test(CARDS), 'п.3: «Дымовые гранаты» есть в каталоге карт');
  const sync = sliceOf('syncFactionCatalogs');
  ok(/df\.cardLibrary\.forEach[\s\S]{0,300}sf\.cardLibrary\.push/.test(sync),
     'п.3: отсутствующие общие карты переносятся и в старые сохранения');
  ok(/Дымовые гранаты/.test(HTML), 'п.3: карта доступна и во встроенном каталоге index.html');
}

// ─────────────────────────── п.4: невидимые цели артобстрела ───────────────────────────
{
  const s = fresh();
  s.run('enemyVisibleToPlayer = function () { return false; };');
  ok(s.evalCtx("opVictimHiddenFromPlayer({ name: 'X', detected: true })") === true,
     'п.4: цель без наблюдения считается скрытой');
  s.run('enemyVisibleToPlayer = function () { return true; };');
  ok(s.evalCtx("opVictimHiddenFromPlayer({ name: 'X', detected: true })") === false,
     'п.4: обнаруженная цель раскрывается');
  ok(/hiddenVictimsHit/.test(HTML) && /hiddenDamage/.test(HTML), 'п.4: урон по скрытым целям считается отдельно');
  ok(/opMaskedTargetLabel/.test(HTML), 'п.4: скрытая цель подписывается «данные скрыты»');
}

// ─────────────────────────── п.5: разведка бронеавтомобиля ───────────────────────────
{
  const s = fresh();
  ok(s.evalCtx('RECON_RADIUS_ARMORED_CAR') === 2, 'п.5: радиус бронеавтомобиля — 2 гекса');
  ok(s.evalCtx('RECON_RADIUS') === 3, 'п.5: обычная разведка осталась 3 гекса');
  ok(s.evalCtx("reconRadiusForUnit({ type: 'armored_vehicle_platoon', name: 'Бронеавтомобили' })") === 2,
     'п.5: у бронеавтомобильного взвода радиус 2');
  ok(s.evalCtx("reconRadiusForUnit({ type: 'recon_platoon', name: 'Разведвзвод' })") === 3,
     'п.5: у разведвзвода радиус 3');
  const recon = sliceOf('executeReconOrder');
  ok(/opLineOfSightBlocked/.test(recon), 'п.5: разведка бронеавтомобиля учитывает линию видимости');
  ok(/armoredCarRecon/.test(recon) && /reconRadiusForUnit/.test(recon), 'п.5: радиус берётся из reconRadiusForUnit');
}

// ─────────────────────────── п.6: черновик окопов/расчистки ───────────────────────────
{
  ok(/function beginPendingHexEditDraft/.test(HEXMAPS), 'п.6: черновик правок создаётся');
  ok(/function applyPendingHexEdits/.test(HEXMAPS), 'п.6: черновик переносится на карту при выполнении приказа');
  ok(/pendingHexEditDraftActive|draftMode/.test(HEXMAPS), 'п.6: редактор работает в режиме черновика');
  ok(/beginPendingHexEditDraft/.test(OPUI) || /beginPendingHexEditDraft/.test(HTML),
     'п.6: редактор открывается при выдаче приказа «окопаться»/«расчистить»');
  ok(/function grantTrenchPoints[\s\S]{0,900}applyPendingHexEdits/.test(HEXMAPS) &&
     /function grantPrepPoints[\s\S]{0,900}applyPendingHexEdits/.test(HEXMAPS),
     'п.6: правки применяются только после выполнения приказа');
}

// ─────────────────────────── п.7: преемственность расчёта ───────────────────────────
{
  const s = fresh();
  s.run(`
    getFactionCrewWeapons = function () { return [{ name: 'Пулемёт Максим', type: 'mg' }]; };
    var crewSquad = { faction: 'BeVe', name: 'пулемётный расчёт',
      crewInstances: [{ weaponName: 'Пулемёт Максим', fighterIndices: [0, 1], gunnerIndex: 0, status: 'active' }],
      fighters: [{ name: 'Наводчик', hp: 0 }, { name: 'Второй номер', hp: 10, weapon: 'винтовка' }] };
    var promotedCrew = syncTacticalCrewSuccession(crewSquad);
  `);
  ok(s.evalCtx('promotedCrew') === 1, 'п.7: погибший наводчик заменяется вторым номером');
  ok(s.evalCtx("crewSquad.fighters[1].weapon") === 'Пулемёт Максим', 'п.7: оружие погибшего переходит заместителю');
  ok(s.evalCtx('crewSquad.crewInstances[0].gunnerIndex') === 1, 'п.7: расчёт продолжает вести огонь новым наводчиком');
  const calls = (HTML.match(/syncTacticalCrewSuccession\(/g) || []).length;
  ok(calls >= 3, 'п.7: наследование вызывается при гибели бойца (вызовов: ' + calls + ')');
}

// ─────────────────────────── п.8: обнаружение ───────────────────────────
{
  const hits = (HTML.match(/result >= 9/g) || []).length;
  ok(hits >= 2, 'п.8: обнаружение — только на 9+ (найдено мест: ' + hits + ')');
  ok(/if \(isNightTime\(\)\) bestMod -= 2;/.test(HTML), 'п.8: ночью скрытность выше (модификатор −2)');
  ok((HTML.match(/не двигался и не стрелял — скрыт/g) || []).length >= 2, 'п.8: неподвижный и не стрелявший скрыт');
  ok(/ambushStealthBonus/.test(HTML) && /isDefending/.test(HTML), 'п.8: засада и оборона улучшают скрытность');
}

// ─────────────────────────── п.9: раунды 1/5 и оперативный ход ───────────────────────────
{
  const s = fresh();
  ok(s.evalCtx('tacticalPhasesPerRound()') === 2, 'п.9: раунд = фаза атакующего + фаза обороняющегося');
  ok(s.evalCtx('tacticalRoundsPerOperationalTurn()') === 5, 'п.9: в оперативном ходу 5 раундов');
  ok(s.evalCtx('RPTX_PHASES_PER_WINDOW()') === 10, 'п.9: окно = 10 фаз');
  s.run('var roundsA = getTacticalRoundProgress({ tacticalPhasesCompleted: 0 }); var roundsB = getTacticalRoundProgress({ tacticalPhasesCompleted: 9 });');
  ok(s.evalCtx('roundsA.round') === 1 && s.evalCtx('roundsA.completed') === 0, 'п.9: в начале боя счётчик 1/5');
  ok(s.evalCtx('roundsB.round') === 5 && s.evalCtx('roundsB.roundsDone') === 4, 'п.9: после девяти фаз идёт пятый раунд');
  const nextTurn = sliceOf('nextTurn');
  ok(/RPTX_PHASES_PER_WINDOW\(\)/.test(nextTurn), 'п.9: пауза срабатывает по окну 5 раундов');
  ok(!/endOperationalTurn\s*\(/.test(nextTurn), 'п.9: тактический бой не завершает оперативный ход сам');
  const endTurn = sliceOf('endOperationalTurn');
  ok(/tacticalBattleBlockingOperationalTurn/.test(endTurn), 'п.9: оперативный ход нельзя пропустить до 5/5');
  const clock = sliceOf('nextTurn');
  ok(/tacticalPhasesPerRound\(\)/.test(clock), 'п.9: кампанейское время идёт по раундам (2 минуты за раунд)');
}

// ─────────────────────────── п.10/п.11: изоляция боёв ───────────────────────────
{
  const s = fresh();
  s.run(`
    appData.map = { enemySquads: [], grid: {} };
    var battleEnemy = { name: '1-е отделение', opUnitName: 'Взвод №1' };
    appData.map.enemySquads.push(battleEnemy);
    getTacticalBattleRecord = function () { return { enemySquads: [battleEnemy] }; };
    var targetInside = tacticalTargetInCurrentBattle(battleEnemy);
    var targetOutside = tacticalTargetInCurrentBattle({ name: 'Чужой взвод', opUnitName: 'Взвод №9' });
    var battleRecord = { enemyUnitNames: ['1-я рота', 'штаб батальона'] };
    var unitInside = battleHasUnitRecord(battleRecord, { name: '1-я рота' });
    var unitOutside = battleHasUnitRecord(battleRecord, { name: '3-й взвод' });
  `);
  ok(s.evalCtx('targetInside') === true, 'п.10: цель этого боя доступна для стрельбы');
  ok(s.evalCtx('targetOutside') === false, 'п.10: чужой отряд стрелять по себе не даёт');
  ok(s.evalCtx('unitInside') === true, 'п.11: взвод, уже воюющий здесь, узнаётся');
  ok(s.evalCtx('unitOutside') === false, 'п.11: посторонний взвод не считается участником боя');
  ok(/battleHasUnitRecord/.test(sliceOf('startTacticalBattle')), 'п.11: бой переиспользуется для участников');
}

// ─────────────────────────── п.12: взвод снабжения в бою ───────────────────────────
{
  const s = fresh();
  s.run(`
    var supplyUnit = { name: 'Взвод снабжения', type: 'supply_platoon', squads: [
      { name: 'Штаб взвода снабжения', fighters: [
        { name: 'Охранник №1', hp: 10 }, { name: 'Охранник №2', hp: 10 },
        { name: 'Носильщик №1', hp: 10 }, { name: 'Погонщик мула №1', hp: 10 },
        { name: 'Носильщик в пути', hp: 10, isAway: true }] }] };
    var supplyForce = supplyBattleForceSquads(supplyUnit);
    var supplyNames = supplyForce.map(sq => sq.name);
    var supplyFighters = supplyForce.map(sq => sq.fighters.map(f => f.name));
  `);
  ok(s.evalCtx('supplyForce.length') === 2, 'п.12: в бою получаются два отряда');
  ok(/охрана/i.test(String(s.evalCtx('supplyNames[0]'))), 'п.12: охранники сводятся в один отряд');
  ok(s.evalCtx('supplyFighters[0].length') === 2, 'п.12: в отряде охраны оба охранника');
  ok(/обоз/i.test(String(s.evalCtx('supplyNames[1]'))), 'п.12: обоз и носильщики — отдельный отряд');
  ok(s.evalCtx('supplyFighters[1].length') === 2, 'п.12: ушедший за боеприпасами в бой не попадает');
  ok(/supplyBattleForceSquads/.test(sliceOf('startTacticalBattle')), 'п.12: сбор боевого состава использует правило снабжения');
}

// ─────────────────────────── п.13: разбитый взвод отходит ───────────────────────────
{
  const s = fresh();
  s.run(`
    // исходная численность фиксируется в начале боя (syncBattleLossesToCampaign)
    var shatteredUnit = { name: 'Разведвзвод', operationalInitialStrength: 18,
      squads: [{ fighters: Array.from({ length: 18 }, (_, i) => ({ name: 'б' + i, hp: i === 0 ? 10 : 0 })) }] };
    var healthyUnit = { name: 'Пехотный взвод', operationalInitialStrength: 4,
      squads: [{ fighters: [{ hp: 10 }, { hp: 10 }, { hp: 10 }, { hp: 10 }] }] };
    var woundedUnit = { name: 'Разведвзвод', operationalInitialStrength: 18,
      squads: [{ fighters: Array.from({ length: 18 }, (_, i) => ({ name: 'б' + i, hp: i < 6 ? 10 : 0 })) }] };
    var shattered = operationalUnitIsShattered(shatteredUnit);
    var healthy = operationalUnitIsShattered(healthyUnit);
    var wounded = operationalUnitIsShattered(woundedUnit);
    var initialStrength = operationalInitialCombatStrength(shatteredUnit);
  `);
  ok(s.evalCtx('shattered') === true, 'п.13: 1 живой боец из 18 — взвод разбит');
  ok(s.evalCtx('healthy') === false, 'п.13: целый взвод не отходит');
  ok(s.evalCtx('initialStrength') === 18, 'п.13: исходная численность берётся из начала боя');
  ok(s.evalCtx('wounded') === false, 'п.13: взвод с третью живых в строю не отходит');
  ok(/operationalInitialStrength/.test(sliceOf('syncBattleLossesToCampaign')),
     'п.13: исходная численность фиксируется синхронизацией потерь в начале боя');
  ok(/maybeRetreatShatteredOperationalUnit/.test(HTML) && /triggerOperationalRetreat/.test(sliceOf('maybeRetreatShatteredOperationalUnit')),
     'п.13: разбитый взвод принудительно отходит к штабу');
}

// ─────────────────────────── п.14/п.15/п.26: отход, мораль, стрельба ───────────────────────────
{
  ok(/🏳️ К штабу: передохнуть/.test(HTML), 'п.14: кнопка «К штабу: передохнуть» есть в панели отряда');
  const regroup = sliceOf('tacticalRegroupSquadAtHQ');
  ok(/restTarget/.test(regroup) && /\/ 2/.test(regroup),
     'п.14: отдых у штаба поднимает дух примерно до половины');
  ok(/currentMorale = Math\.max/.test(regroup) && /suppressed = false/.test(regroup),
     'п.14: дух восстанавливается, подавление снимается');
  ok(!/tacticalRetreatUnit\(/.test(regroup), 'п.14: после отдыха отряд остаётся в бою и снова может воевать');
  ok(/regroupedTurn/.test(regroup) && /hqKey/.test(regroup),
     'п.14: отряд идёт именно в гекс штаба, отдых — раз за ход');
  ok(/retreatToHQ/.test(sliceOf('retreatFromMelee')), 'п.15: отход из рукопашной помечает отряд идущим к штабу');
  ok(/tacticalClearMeleeEngagement/.test(sliceOf('retreatFromMelee')), 'п.15: отход выводит отряд из рукопашной');
  ok(/retreatToHQ && \['shoot', 'attack', 'melee', 'special', 'suppress', 'sector'\]/.test(sliceOf('tacticalActionAllowed')),
     'п.15: отступающий не стреляет и не бросает гранаты');
  const leave = sliceOf('tacticalSquadLeaveBattle');
  ok(/tacticalRetreatUnit\(/.test(leave) && !/retreatFromBattle\(true\)/.test(leave),
     'п.26: кнопка «Выйти из боя» выводит только этот отряд, а не весь бой');
  ok(/🚪 Выйти из боя/.test(HTML) && /tacticalSquadLeaveBattle/.test(HTML),
     'п.26: кнопка выхода из боя доступна для отдельного отряда');
}

// ─────────────────────────── п.16: причина недоступности винтовок ───────────────────────────
{
  ok(/smallArmsBlockReason/.test(HTML), 'п.16: у кнопки стрелкового оружия есть причина блокировки');
  ok(/Кончились патроны — нужен подвоз боеприпасов/.test(HTML), 'п.16: причина «нет патронов» объясняется игроку');
  ok(/при расчётах: стрелковым оружием вести огонь некому/.test(HTML), 'п.16: причина «все при расчётах» объясняется игроку');
  ok(/disabled title="\$\{smallArmsBlockReason\}/.test(sliceOf('renderActiveCardButtons')),
     'п.16: причина есть и в подсказке кнопки');
  ok(/Стрелковое оружие недоступно: \$\{smallArmsBlockReason\}/.test(sliceOf('renderActiveCardButtons')),
     'п.16: причина видна строкой рядом с кнопкой (не только в подсказке)');
}

// ─────────────────────────── п.17: дух за победы ───────────────────────────
{
  const award = sliceOf('recordTacticalAwardEnemyDefeat');
  ok(/\+1|changeTacticalMorale/.test(award), 'п.17: уничтожение/бегство врага повышает дух отряда');
  ok(/\+3/.test(HTML) && /победа в рукопашной/i.test(HTML), 'п.17: победа в рукопашной даёт +3 духа');
  ok(/\+3/.test(sliceOf('meleeAttack')), 'п.17: начисление привязано к рукопашной');
}

// ─────────────────────────── п.18/п.19: развёртывание ───────────────────────────
{
  ok(/const PLACEMENT_STRIP_DEPTH = 2;/.test(PLACEMENT), 'п.19: полоса выставления — 2 гекса');
  ok(/PLACEMENT_STRIP_DEPTH/.test(PLACEMENT), 'п.19: ширина применяется в js/placement.js');
  ok(/placementArrivalDir/.test(PLACEMENT), 'п.18: направление прихода подкрепления учитывается');
  ok(/placementArrivalDir/.test(sliceOf('startTacticalBattle')), 'п.18: бой передаёт направление прихода защитнику');
  ok(/function placementSideAllowed\(battle, side, key, squad\)/.test(PLACEMENT) ||
     /placementSideAllowed\(battle, side, key, squad\)/.test(PLACEMENT),
     'п.18: зона защитника считается по отряду (направление входа)');
}

// ─────────────────────────── п.20: ДОТ и ближний бой ───────────────────────────
{
  ok(/function tacticalIsDotSquad/.test(HTML), 'п.20: есть распознавание расчёта ДОТа');
  ok(/dotDoorDestroyed/.test(HTML), 'п.20: дверь ДОТа можно подорвать');
  ok(/embrasuresDisabled/.test(HTML), 'п.20: амбразуры выводятся из строя по отдельности');
  ok(/tacticalDisableDotEmbrasure/.test(HTML), 'п.20: связка гранат выводит амбразуру, а не уничтожает ДОТ');
  const allowed = sliceOf('tacticalActionAllowed');
  ok(/isDot\(squad\.name\) && !squad\.dotDoorDestroyed/.test(allowed) &&
     /isDot\(tgt\.enemy\.name\) && !tgt\.enemy\.dotDoorDestroyed/.test(allowed),
     'п.20: рукопашная для ДОТа запрещена, пока дверь цела');
  const melee = sliceOf('meleeAttack');
  ok(/dotDoorDestroyed/.test(melee) && /isDotName/.test(melee),
     'п.20: и сам удар в рукопашной проверяет подорванную дверь');
  ok(/третий вариант|подрыв двери/i.test(HTML), 'п.20: в меню заряда есть подрыв двери ДОТа');
}

// ─────────────────────────── п.21: огонь по гексу и цели ───────────────────────────
{
  const shoot = sliceOf('executeShootOrder');
  ok(/areaFire/.test(shoot), 'п.21: огонь по пустому гексу — обстрел площади');
  ok(/consumeOperationalAmmo/.test(shoot), 'п.21: обстрел площади тратит боезапас');
  ok(/обстрел площади выполнен/.test(shoot), 'п.21: игрок видит запись о выстреле и уведомление');
  ok(/order.status = 'completed'/.test(shoot), 'п.21: приказ закрывается, а не «висит» молча');
  ok(/не может стрелять: нет ОД/.test(shoot), 'п.21: отказ объясняется причиной');
  ok(/log\(/.test(OPUI) && /executeOperationalSectorFireOrder/.test(OPUI),
     'п.21: контроль гексов вынесен в модуль и пишет причину ожидания');
}

// ─────────────────────────── п.22: знаки меток вместо жёлтого ромба ───────────────────────────
{
  ok(/case 'ammoPoint'/.test(HTML), 'п.22: у пункта боепитания свой знак');
  ok(/case 'fireField'/.test(HTML), 'п.22: у огненного поля свой знак');
  ok(/неизвестная метка — нейтральный знак «\?»/.test(HTML), 'п.22: неизвестная метка — серый «?», а не жёлтый ромб');
  ok(/:v13099/.test(HTML), 'п.22: легенда обновилась после смены знаков');
}

// ─────────────────────────── п.23: подсветка текущего гекса на миникарте ───────────────────────────
{
  ok(/function campaignMiniMapCurrentHex/.test(HTML), 'п.23: миникарта знает текущий гекс');
  ok(/lastOpenedHexKey/.test(HEXMAPS) && /lastOpenedHexKey/.test(HTML),
     'п.23: гекс запоминается при открытии боя (запасной источник подсветки)');
}

// ─────────────────────────── п.24: доставка снабжения ───────────────────────────
{
  const panel = sliceOf('renderSupplyPanel');
  ok(/transportReach/.test(panel) && /findSupplyRoute/.test(panel),
     'п.24: панель проверяет, доберётся ли выбранный транспорт');
  ok(/⛔|красн/i.test(panel), 'п.24: недоступный получатель выделяется');
}

// ─────────────────────────── п.25: радиоперехват приказа ───────────────────────────
{
  const s = fresh();
  s.run(`
    appData.campaign.opUnits = [{ name: 'Получатель без связи', col: 1, row: 1 }, { name: 'Сосед с рацией', col: 1, row: 1 }];
    hasRadio = function (u) { return u && u.name === 'Сосед с рацией'; };
    var radioForeign = orderInstantDeliveryIsLegit({ deliveryMethod: 'radio', toUnitId: 0, fromUnitId: 1 });
    var radioOwn = orderInstantDeliveryIsLegit({ deliveryMethod: 'radio', toUnitId: 1, fromUnitId: 0 });
    var byMessenger = orderInstantDeliveryIsLegit({ deliveryMethod: 'messenger', toUnitId: 0, fromUnitId: 1 });
  `);
  ok(s.evalCtx('radioForeign.ok') === false, 'п.25: рация соседа по гексу приказ не передаёт');
  ok(s.evalCtx('radioOwn.ok') === true, 'п.25: своя рация у получателя — приказ мгновенный');
  ok(s.evalCtx('byMessenger.ok') === true, 'п.25: посыльного проверка не касается');
  ok(/demoteOrderToMessenger/.test(sliceOf('executeOrder')), 'п.25: незаконная мгновенная доставка становится посыльным');
}

// ─────────────────────────── п.27: отмена только текущей фазы ───────────────────────────
{
  const undo = sliceOf('undoLastTacticalAction');
  ok(/snap\.phase !== currentPhase/.test(undo), 'п.27: отмена сверяет фазу');
  ok(/snap\.battleId !== currentBattle/.test(undo), 'п.27: отмена сверяет бой');
  ok(/Отмена доступна только для действий текущей фазы/.test(undo), 'п.27: игрок видит причину отказа');
}

// ─────────── п.28: приказы выбранного отряда на оперативной карте ───────────
{
  const s = fresh();
  s.run(`
    appData.campaign.opUnits = [
      { name: 'Отряд A', col: 1, row: 1, type: 'infantry_platoon', squads: [] },
      { name: 'Отряд B', col: 5, row: 5, type: 'infantry_platoon', squads: [] }
    ];
    hardMode.orders = [
      { id: 1, toUnitId: 0, type: 'attack', orderType: 'attack', status: 'active', waypoints: [{ col: 2, row: 1 }, { col: 3, row: 1 }] },
      { id: 2, toUnitId: 0, type: 'dig_in', orderType: 'dig_in', status: 'active', startHex: '2,2' },
      { id: 3, toUnitId: 1, type: 'ambush', orderType: 'ambush', status: 'active', targetHex: '6,5' },
      { id: 4, toUnitId: 0, type: 'move', orderType: 'move', status: 'completed', waypoints: [{ col: 0, row: 0 }] }
    ];
    hardMode.pendingOrders = [
      { id: 5, toUnitId: 0, type: 'shoot', orderType: 'shoot', status: 'delivering', targetHex: '4,2' }
    ];
  `);
  ok(s.evalCtx('collectOperationalOrdersForUnit(0).length') === 3,
     'п.28: у выбранного отряда — только его приказы (2 активных + 1 в пути)',
     s.evalCtx('collectOperationalOrdersForUnit(0).length'));
  ok(s.evalCtx('collectOperationalOrdersForUnit(1).length') === 1,
     'п.28: у другого отряда — свои приказы', s.evalCtx('collectOperationalOrdersForUnit(1).length'));
  ok(s.evalCtx(`collectOperationalOrdersForUnit(0).every(e => e.order.status !== 'completed')`),
     'п.28: выполненные приказы на карте не висят');
  ok(s.evalCtx(`collectOperationalOrdersForUnit(0).some(e => e.pending === true)`) === true,
     'п.28: приказ, ещё не доставленный посыльным, помечен как ожидающий');
  ok(s.evalCtx(`JSON.stringify(opOrderExecutionHexes({ waypoints: [{ col: 1, row: 1 }, { col: 7, row: 3 }] }, 'move'))`) ===
     JSON.stringify([{ col: 7, row: 3 }]),
     'п.28: знак маршрутного приказа — на конечном гексе маршрута');
  ok(s.evalCtx(`JSON.stringify(opOrderExecutionHexes({ startHex: '4,6' }, 'dig_in'))`) === JSON.stringify([{ col: 4, row: 6 }]),
     'п.28: «окопаться» на месте — знак в гексе выполнения');
  ok(s.evalCtx(`opOrderExecutionHexes({ targetHexes: ['1,1', '2,3'] }, 'sector_fire').length`) === 2,
     'п.28: контроль гексов — знак на каждом выбранном гексе');
  const types = ['move', 'attack', 'defend', 'recon', 'hold', 'retreat', 'fire_at_will', 'ambush', 'shoot',
                 'shoot_at', 'shoot_enemy', 'sector_fire', 'embark', 'dig_in', 'prep_positions', 'series',
                 'company_order', 'artillery_strike', 'disembark', 'pour_oil', 'dismount', 'remount', 'escort'];
  const withoutMarker = types.filter(t => s.evalCtx(`opOrderMarkerEmoji(${JSON.stringify(t)})`) === '📌');
  ok(withoutMarker.length === 0, 'п.28: у каждого типа приказа свой знак', withoutMarker.join(', '));
  ok(/selectedOpUnit/.test(sliceOf('drawSelectedUnitOrdersOnMap')) &&
     /collectOperationalOrdersForUnit\(unitId\)/.test(sliceOf('drawSelectedUnitOrdersOnMap')),
     'п.28: карта берёт приказы именно выбранного отряда');
  ok(/drawSelectedUnitOrdersOnMap\(ctx, size\)/.test(HTML),
     'п.28: знаки приказов рисуются на оперативной карте');
}

// ─────────── п.21: обстрел гекса и конкретной цели — честные отказы ───────────
{
  const s = fresh();
  const cancel = sliceOf('cancelOpShooting');
  ok(/refusalReason/.test(cancel), 'п.21: отказ обстрела запоминает причину');
  const shoot = sliceOf('executeShootOrder');
  ok(/противотанковых средств у отряда нет/.test(shoot),
     'п.21: пехоте без ПТО не дают «выполнить» обстрел брони');
  ok(/артиллерия калибром более 70мм/.test(shoot), 'п.21: пехоте не дают «выполнить» обстрел ДОТа');
  ok(/opShootRefusalIsSupplyWait/.test(shoot) && /supplyWaitLogged/.test(shoot),
     'п.21: приказ, ждущий снабжения, не отменяется и не «выполняется»');
  ok(s.evalCtx(`opShootRefusalIsSupplyWait('🚫 X: нет снарядов — стрельба невозможна')`) === true,
     'п.21: нет снарядов — приказ ждёт снабжения');
  ok(s.evalCtx(`opShootRefusalIsSupplyWait('❌ X: цель вне секторов обстрела амбразур ДОТа')`) === false,
     'п.21: цель поразить нельзя — приказ отменяется с причиной');
  const area = sliceOf('resolveOperationalAreaFire');
  ok(/areaFire/.test(area) && /delete cell\.areaFire/.test(area), 'п.21: обстрел площади расходуется на следующий ход');
  ok(/opVictimHiddenFromPlayer/.test(area), 'п.21: обстрел площади не раскрывает необнаруженные цели');
  ok(/resolveOperationalAreaFire\(\)/.test(sliceOf('processOrders')) && /processOrders\(\)/.test(sliceOf('endOperationalTurn')),
     'п.21: обстрел площади разрешается в конце оперативного хода');
  const hexFireRange = sliceOf('submitOrder');
  ok(/operationalHexFireRange\(unit\)/.test(hexFireRange),
     'п.21: при отдаче приказа дальность берётся из общей таблицы (82-мм миномёт — 4)');
  ok(/Выберите гекс для обстрела/.test(OPUI) && /hex_fire/.test(OPUI),
     'п.21: меню приказов требует выбранный гекс (дальность проверяется при исполнении)');
}

// ─────────── п.29: журнал приказов (история по ходам) ───────────
{
  const s = fresh();
  s.run(`
    appData.campaign.currentTurn = 5;
    appData.campaign.currentTime = 870;
    appData.campaign.opUnits = [{ name: 'Отряд A' }, { name: 'Отряд B' }];
    appData.campaign.orderJournal = [];
    recordOrderJournal({ id: 1, toUnitId: 0, type: 'attack', orderType: 'attack' }, 'issued', 'приказ у получателя');
    recordOrderJournal({ id: 2, toUnitId: 1, type: 'ambush', orderType: 'ambush' }, 'executed', 'приказ выполнен');
    recordOrderJournal({ id: 3, toUnitId: 0, type: 'shoot', orderType: 'shoot' }, 'refused', 'нет снарядов');
  `);
  const entry = JSON.parse(s.evalCtx(`JSON.stringify(appData.campaign.orderJournal.find(e => e.orderId === 1))`));
  ok(entry && entry.turn === 5 && entry.unitName === 'Отряд A' && String(entry.label).includes('Атака') && entry.time === '14:30',
     'п.29: запись содержит ход, время, отряд и тип приказа', JSON.stringify(entry));
  ok(s.evalCtx(`orderJournalEntriesFor(1).length`) === 1 && s.evalCtx(`orderJournalEntriesFor(0).length`) === 2,
     'п.29: журнал фильтруется по отряду',
     s.evalCtx('orderJournalEntriesFor(0).length') + '/' + s.evalCtx('orderJournalEntriesFor(1).length'));
  ok(s.evalCtx(`orderJournalEntriesFor(null)[0].orderId`) === 3,
     'п.29: свежие записи идут первыми');
  s.run(`for (let i = 0; i < 400; i++) recordOrderJournal({ id: 100 + i, toUnitId: 0, type: 'move', orderType: 'move' }, 'issued', null);`);
  ok(s.evalCtx('appData.campaign.orderJournal.length') === 300,
     'п.29: журнал хранит последние 300 записей', s.evalCtx('appData.campaign.orderJournal.length'));
  ok(s.evalCtx(`orderJournalEntriesFor(null)[0].orderId`) === 499,
     'п.29: после переполнения остаются самые свежие записи');
  ok(/отдан/.test(s.evalCtx(`orderJournalEventLabel('issued')`)) &&
     /доставлен/.test(s.evalCtx(`orderJournalEventLabel('delivered')`)) &&
     /выполнен/.test(s.evalCtx(`orderJournalEventLabel('executed')`)) &&
     /отклонён/.test(s.evalCtx(`orderJournalEventLabel('refused')`)),
     'п.29: у каждого события есть понятная подпись');
  ok(s.evalCtx(`opTextLooksLikeRefusal('❌ Цель слишком далеко')`) === true &&
     s.evalCtx(`opTextLooksLikeRefusal('🔫 [X] Обстрелял: враг | Урон: 3')`) === false,
     'п.29: текст успешного обстрела не принимается за отказ (эмодзи-суррогаты)');
  ok(/orderJournalBtn/.test(HTML) && /openOrderJournal\(\)/.test(HTML),
     'п.29: на карте есть кнопка «📜 Журнал приказов»');
  ok(/orderJournalOnlySelected/.test(HTML) && /orderJournalEntriesFor\(unitId\)/.test(sliceOf('renderOrderJournalRows')),
     'п.29: в журнале есть фильтр «только выбранный отряд»');
  const createOrderSlice = sliceOf('createOrder');
  ok(/recordOrderJournal\(order, 'queued'/.test(createOrderSlice) && /recordOrderJournal\(order, 'issued'/.test(createOrderSlice),
     'п.29: отдача приказа и отправка его посыльным пишутся в журнал');
  ok(/recordOrderJournal\(order, 'delivered'/.test(sliceOf('processOrders')),
     'п.29: доставка приказа отмечается в журнале');
  ok(/recordOrderJournal\(order, 'cancelled', 'отменён игроком'\)/.test(sliceOf('cancelOrder')),
     'п.29: отмена игроком видна в журнале');
  ok(/recordOrderJournal\(order, 'refused'/.test(sliceOf('executeShootOrder')),
     'п.29: отклонённый обстрел попадает в журнал с причиной');
}

// ─────────── решения игрока от 2026-10-16 (дальность, смешанный гекс) ───────────
{
  const uiRange = /operationalHexFireRange/.test(OPUI) && /Цель слишком далеко/.test(OPUI);
  ok(uiRange, 'решение: меню не даёт отдать приказ по гексу вне дальности отряда');
  const rangeSlice = sliceOf('operationalHexFireRange');
  ok(/operationalMediumArtilleryRange/.test(rangeSlice) && /return 10;/.test(rangeSlice) && /return 3;/.test(rangeSlice),
     'решение: дальность приказа считается по отряду (миномёт 4, САУ/артиллерия 10, остальные 3)');
  const opShoot = sliceOf('executeOpShoot');
  ok(/ДОТ на гексе пропущен/.test(opShoot) && /softTargetsOnHex/.test(opShoot),
     'решение: на смешанном гексе пехота бьёт по живой силе, ДОТ пропускает');
  const opShootAt = sliceOf('executeOpShootAt');
  ok(/ДОТ на гексе пропущен/.test(opShootAt) && /nonStaticTargets/.test(opShootAt),
     'решение: на смешанном гексе ПТО бьёт бронетехнику, ДОТ пропускает');
}

// ─────────────────────────── п.30: курс, сектора и штурм ДОТа ───────────────────────────
{
  const TEMPLATES = read('js/templates.js');
  const WEAPONS = read('js/weapons.js');
  const MAPACTIONS = read('js/map_actions.js');
  const landsverk = /"crewInstances":\[([\s\S]*?)\],\s*"armor": \{ "front": 20, "side": 16/.exec(TEMPLATES);
  const landsBlock = landsverk ? landsverk[1] : '';
  ok(/Курсовой пулемёт SAU Brugge/.test(landsBlock) && /Спаренный пулемёт SAU Brugge/.test(landsBlock) &&
     /Кормовой пулемёт SAU Brugge/.test(landsBlock) && /37-мм Bofors/.test(landsBlock),
     'п.30: у Landsverk орудие + курсовой/спаренный/кормовой пулемёты');
  const sav = /"crewInstances":\[([\s\S]*?)\],\s*"armor": \{ "front": 20, "side": 20/.exec(TEMPLATES);
  const savBlock = sav ? sav[1] : '';
  ok(/75-мм орудие SAU Brugge/.test(savBlock) && /Курсовой пулемёт SAU Brugge/.test(savBlock) &&
     /Спаренный пулемёт SAU Brugge/.test(savBlock) && !/Кормовой/.test(savBlock),
     'п.30: у САУ Brugge орудие + курсовой и спаренный пулемёты');
  const llanero = (TEMPLATES.match(/"weaponName":"[^"]*Hotchkiss Mle 1914"/g) || []);
  ok(llanero.length >= 5 && /"weaponName":"Курсовой пулемет Hotchkiss Mle 1914"/.test(TEMPLATES),
     'п.30: у БТР Llanero курсовой пулемёт (сектор 120°)');
  ok(!/"weaponName": ?"Танковый пулемет Hotchkiss Mle 1914"/.test(TEMPLATES) &&
     /"weaponName": "Спаренный пулемет Hotchkiss Mle 1914"/.test(TEMPLATES),
     'п.30: у CL/39 пулемёт переименован в спаренный');
  ok(/Курсовой пулемёт SAU Brugge/.test(WEAPONS) && /Спаренный пулемёт SAU Brugge/.test(WEAPONS) &&
     /Кормовой пулемёт SAU Brugge/.test(WEAPONS) && /Курсовой пулемет Hotchkiss Mle 1914/.test(WEAPONS) &&
     /Спаренный пулемет Hotchkiss Mle 1914/.test(WEAPONS),
     'п.30: новые профили пулемётов есть в каталоге вооружения');
  ok(/"legacy": true/.test(WEAPONS), 'п.30: старые имена пулемётов оставлены для сохранений');

  const s = fresh();
  const SECTOR_IDS = (HEXMAPS.match(/id: '(\w+)', label/g) || []).map(m => m.replace(/id: '(\w+)'.*/, '$1'));
  ok(SECTOR_IDS.length === 6, 'п.30: направлений шесть (как у ДОТов)');
  ok(s.evalCtx('VEHICLE_TURN_AP_COST') === 2, 'п.30: разворот стоит 1 ОД (2 полу-ОД)');
  ok(s.evalCtx('DOT_SABOTAGE_GRENADES') === 8, 'п.30: связка на амбразуру/дверь ДОТа — 8 гранат');
  ok(s.evalCtx("vehicleFacingDir({ name: 'X', facing: 'nw' })") === 'nw', 'п.30: курс машины хранится на отряде');
  ok(s.evalCtx("vehicleFamilyFor({ name: 'Бронеавтомобиль Landsverk 183 №1' }) !== null") === true &&
     s.evalCtx("vehicleFamilyFor({ name: 'БТР Llanero №1' }).bowDeg") === 120 &&
     s.evalCtx("vehicleFamilyFor({ name: 'САУ Brugge №1' }).mgLimit") === 1,
     'п.30: семейства машин различаются (Llanero 120°, САУ — лимит 1 пулемёт)');
  const spec = (name, weapon, type) => `JSON.stringify(vehicleWeaponSectorSpec({ name: '${name}' }, '${weapon}', '${type}'))`;
  ok(s.evalCtx(spec('Бронеавтомобиль Landsverk 183 №1', 'Курсовой пулемёт SAU Brugge', 'mg')).indexOf('"role":"bow"') >= 0 &&
     s.evalCtx(spec('Бронеавтомобиль Landsverk 183 №1', 'Курсовой пулемёт SAU Brugge', 'mg')).indexOf('"deg":90') >= 0,
     'п.30: курсовой пулемёт Landsverk — сектор 90° вперёд');
  ok(s.evalCtx(spec('Бронеавтомобиль Landsverk 183 №1', 'Кормовой пулемёт SAU Brugge', 'mg')).indexOf('"role":"rear"') >= 0,
     'п.30: кормовой пулемёт — сектор назад');
  ok(s.evalCtx(spec('Бронеавтомобиль Landsverk 183 №1', '37-мм Bofors', 'at_gun')).indexOf('"deg":360') >= 0 &&
     s.evalCtx(spec('САУ Brugge №1', 'Спаренный пулемёт SAU Brugge', 'mg')).indexOf('"deg":360') >= 0 &&
     s.evalCtx(spec('Легкий танк CL/39 №1', '45-мм 53К танковая', 'at_gun')).indexOf('"deg":360') >= 0,
     'п.30: орудие и спаренный пулемёт — круговые (360°)');
  ok(s.evalCtx(spec('БТР Llanero №1', 'Курсовой пулемет Hotchkiss Mle 1914', 'mg')).indexOf('"deg":120') >= 0,
     'п.30: курсовой пулемёт Llanero — 120° по курсу');
  ok(s.evalCtx("vehicleWeaponSectorSpec({ name: 'Пулеметный расчёт №1' }, 'Станковый пулемет Hotchkiss Mle 1914', 'mg')") === null,
     'п.30: пехотные пулемёты секторами не ограничены');
  ok(s.evalCtx("vehicleAspectArmorValue({ armor: { front: 20, side: 16, rear: 16, turret: 20 } }, 'front')") === 20 &&
     s.evalCtx("vehicleAspectArmorValue({ armor: { front: 20, side: 16, rear: 16, turret: 20 } }, 'side')") === 16 &&
     s.evalCtx("vehicleAspectArmorValue({ armor: { front: 20, side: 16, rear: 16, turret: 20 } }, 'rear')") === 16,
     'п.30: броня берётся по борту (лоб/борт/корма)');
  ok(s.evalCtx("operationalVehicleMgLimit({ name: 'Бронеавтомобиль Landsverk 183 №1' })") === 2 &&
     s.evalCtx("operationalVehicleMgLimit({ name: 'САУ Brugge №1' })") === 1 &&
     s.evalCtx("operationalVehicleMgLimit({ name: 'Пехотное отделение' })") === null,
     'п.30: лимит пулемётов — 2 из 3 (Landsverk) и 1 из 2 (САУ), у пехоты лимита нет');

  const turn = sliceOf('vehicleTurn');
  ok(/function vehicleTurn\(directionId\)/.test(HTML) && (HTML.match(/function vehicleTurn\(/g) || []).length === 1,
     'п.30: разворот принимает направление (старая заглушка без направления убрана)');
  ok(/vehicleSetFacing\(currentSquad, next\)/.test(turn) && /VEHICLE_TURN_AP_COST/.test(turn),
     'п.30: разворот выставляет курс и списывает 1 ОД');
  ok(/action === 'turn'\)[\s\S]{0,160}return 2;/.test(sliceOf('getActionCost')),
     'п.30: getActionCost для разворота — 2 полу-ОД');
  ok(/vehicleIsArmored\(squad\)[\s\S]{0,200}vehicleSetFacing\(squad, moveDir\)/.test(sliceOf('tacticalMoveAlongPath')),
     'п.30: движение задаёт курс бесплатно');
  ok(/drawTacticalVehicleSectorLines/.test(HTML) && /selectedMoveSquadIdx === squadId/.test(HTML),
     'п.30: сектора рисуются только у выбранной машины');
  ok(/tacticalVehicleWeaponCanTarget\(currentSquad, cw\.name, cw\.type, sectorTargetKey\)/.test(sliceOf('attackSmallArms')),
     'п.30: курсовой/кормовой пулемёт не стреляет вне сектора');

  const sabotageEmbrasure = sliceOf('sabotageDotEmbrasure');
  ok(/tacticalDotInSameHexWithSquad\(currentSquad\)/.test(sabotageEmbrasure) &&
     /grenades < DOT_SABOTAGE_GRENADES/.test(sabotageEmbrasure) &&
     /tacticalDisableDotEmbrasure\(target\.enemy/.test(sabotageEmbrasure),
     'п.30: подрыв амбразуры — только в гексе ДОТа, за 8 гранат, выводит амбразуру');
  const sabotageDoor = sliceOf('sabotageDotDoor');
  ok(/dotDoorDestroyed = true/.test(sabotageDoor) && /dotDoorBlownTurn/.test(sabotageDoor),
     'п.30: подрыв двери открывает рукопашную с расчётом ДОТа');
  const sabotageSmoke = sliceOf('sabotageDotSmoke');
  ok(/DOT_SMOKE_GRENADES/.test(sabotageSmoke) && /tacticalCreateSmokeCloud\(target\.key/.test(sabotageSmoke),
     'п.30: дым в амбразуры ставит завесу в гексе ДОТа');
  ok(/tacticalDotBlindedBySmoke/.test(HTML) && /tacticalDotFireRefusal/.test(HTML),
     'п.30: ДОТ ослеплён дымом, пока стоит завеса');
  ok(/tacticalDotFireRefusal\(currentSquad/.test(sliceOf('fireDOTMG')) &&
     /tacticalDotFireRefusal\(currentSquad/.test(sliceOf('attackSmallArms')) &&
     /tacticalDotFireRefusal\(currentSquad/.test(sliceOf('attackOrdnance')),
     'п.30: ДОТ не стреляет по отряду в своём гексе (пулемёт, стрелковое, орудия)');
  ok(/ворвался в гекс ДОТа/.test(HTML), 'п.30: игрок видит причину запрета огня ДОТа');
  ok(/const sabotageCost = \(typeof DOT_SABOTAGE_GRENADES !== 'undefined'\) \? DOT_SABOTAGE_GRENADES : 8;/.test(HTML) &&
     /grenadeCount >= sabotageCost/.test(HTML) && /sabotageDotEmbrasure\(\)/.test(HTML) &&
     /sabotageDotDoor\(\)/.test(HTML) && /нужна связка из \$\{sabotageCost\} гранат/.test(HTML),
     'п.30: кнопки подрыва появляются при 8 гранатах, иначе — подсказка');
  ok(/aspectInfo && \(key === 'hull' \|\| key === 'engine' \|\| key === 'ammo'\)/.test(MAPACTIONS) &&
     /case 'turret': armorValue = \(a\.turret !== null && a\.turret !== undefined\) \? a\.turret/.test(MAPACTIONS),
     'п.30: броня по борту в попаданиях, башня — всегда «Башня»');
  ok(/opMgLimit/.test(sliceOf('executeOpShoot')) && /opMgLimit2/.test(sliceOf('calculateOpShootDamage')),
     'п.30: оперативный лимит пулемётов применяется на карте кампании');
  const locals = (HTML.match(/opMgLimit\d?/g) || []).length;
  ok(locals >= 6 && !/opMgLimit/.test(sliceOf('attackSmallArms')),
     'п.30: в тактическом бою лимита пулемётов нет');
}

// ─────────── решение игрока: пехоте без ПТО «обстрел гекса» не предлагается ───────────
{
  const fireChoices = OPUI.slice(OPUI.indexOf('function renderFireChoices'), OPUI.indexOf('function startFireKind'));
  ok(fireChoices.length > 200 && /canFireAtHex \?/.test(fireChoices) && /data-kind="hex_fire"/.test(fireChoices) &&
     /hasAtGunWeapons\(unit\)/.test(fireChoices) && /isMediumArtillery/.test(fireChoices) &&
     !/data-kind="hex_fire"/.test(OPUI.replace(fireChoices, '')),
     'п.31: «🎯 Обстрелять гекс» предлагается только артиллерии/САУ/танкам и отрядам с ПТО — пехоте без ПТО кнопки нет');
  const parseFrom = OPUI.indexOf("draft.category === 'hex_fire'", OPUI.indexOf('function parseDraftOptions'));
  const parseDraft = OPUI.slice(parseFrom, parseFrom + 900);
  ok(/Обстрелять гекс» доступен только артиллерии/.test(parseDraft) && /isMediumArtillery/.test(parseDraft) &&
     /hasAtGunWeapons/.test(parseDraft),
     'п.31: приказ «Обстрелять гекс» отклоняется, если отряд потерял право на обстрел гекса');
}

// ─────────────────────────── п.31: термитный заряд (тактический бой) ───────────────────────────
{
  const MAPACTIONS = read('js/map_actions.js');
  const blockStart = HTML.indexOf('// ===================== ТЕРМИТНЫЙ ЗАРЯД (тактический бой)');
  const blockEnd = HTML.indexOf('// ===================== ФОСФОРНЫЕ ГРАНАТЫ');
  const block = HTML.slice(blockStart, blockEnd);

  ok(sliceConst(HTML, 'THERMITE_RANGE') === 'const THERMITE_RANGE = 1;' &&
     sliceConst(HTML, 'THERMITE_SUCCESS_MIN') === 'const THERMITE_SUCCESS_MIN = 2;' &&
     sliceConst(HTML, 'THERMITE_DEATH_MIN') === 'const THERMITE_DEATH_MIN = 4;',
     'п.31: термит — 1 гекс, успех d6 2–6, гибель бойца d6 4–6 (константы)');
  ok(blockStart > 0 && block.length > 1500 && !/prompt\(/.test(block) && /id="thermiteModal"/.test(HTML) &&
     /id="thermiteModalContent"/.test(HTML),
     'п.31: цель и часть выбираются в окне (#thermiteModal), prompt() из термита убран');
  ok(!/penetration|armorValue/.test(block) && /броня любой толщины/.test(block),
     'п.31: броня не сравнивается — заряд прожигает броню любой толщины');
  ok(/kind: 'embrasure'/.test(block) && /embrasureIndex: ciIdx/.test(block) &&
     /thermiteBurnDotEmbrasure\(target\.enemy, embrasureIndex\)/.test(block) && /kind: 'door'/.test(block),
     'п.31: по ДОТу — выбор двери или конкретной амбразуры (индекс расчёта)');
  ok(/useThermiteCharge\(\)/.test(MAPACTIONS) && /Термитный заряд/.test(MAPACTIONS) &&
     /Броня любой толщины не спасает/.test(MAPACTIONS) && /конкретной амбразуры/.test(MAPACTIONS),
     'п.31: кнопка «🧨 Термитный заряд» в панели действий описывает правила заряда');
  ok(/function tacticalDisableDotEmbrasure\(/.test(HTML) && /tacticalDisableDotEmbrasure\(dotTarget/.test(HTML) &&
     /tacticalDisableDotEmbrasure\(target\.enemy/.test(HTML),
     'п.31: старая связка гранат по ДОТу (случайная амбразура) не потеряна');

  // ── песочница: сцена «сапёр + цели в гексах» ──
  const mkDot = over => Object.assign({
    name: 'ДОТ Bosh', faction: 'BeVe', currentMorale: 10, baseMorale: 10,
    fighters: ['Лейтенант', 'Адьютант', 'Подносчик', 'Сержант', 'Наводчик', 'Заряжающий',
      'Пулеметчик 1', 'Второй номер 1', 'Пулеметчик 2', 'Второй номер 2']
      .map(n => ({ name: n, weapon: 'Винтовка FN model 24/30', hp: 3, maxHp: 3 })),
    crewInstances: [
      { weaponName: 'Расчёт ПТО Bohler M37', fighterIndices: [3, 4, 5], active: true },
      { weaponName: 'Станковый пулемет Schwarzlose M.08/15', fighterIndices: [6, 7, 8], active: true },
      { weaponName: 'Станковый пулемет Schwarzlose M.08/15', fighterIndices: [9], active: true }
    ]
  }, over || {});
  const mkVehicle = over => Object.assign({
    name: 'Тяжёлый танк «Прорыв»', faction: 'BeVe', isVehicle: true,
    armor: { front: 999, side: 999, rear: 999, turret: 999 },
    fighters: [{ name: 'Мехвод', weapon: 'Пистолет Browning Hi-Power', hp: 3, maxHp: 3 },
      { name: 'Командир', weapon: 'Пистолет Browning Hi-Power', hp: 3, maxHp: 3 }]
  }, over || {});
  const mkInfantry = () => ({
    name: 'Пехотное отделение №1 Бельгийцы', faction: 'BeVe',
    fighters: [{ name: 'Сержант', weapon: 'Винтовка FN model 24/30', hp: 3, maxHp: 3 }]
  });
  function thermiteScene(enemies, ownHex) {
    const s = fresh();
    const ad = s.sandbox.appData;
    const grid = {};
    for (let c = -4; c <= 4; c++) for (let r = -3; r <= 3; r++) grid[c + ',' + r] = { squadIds: [], enemySquadIds: [] };
    ad.map = { grid: grid, enemySquads: [], attackTargetEnemyIdx: null, activeSide: 'player' };
    ad.squads = [{
      name: 'Саперное отделение №1', faction: 'A.I.R.F.', thermiteCharges: 3,
      fighters: [{ name: 'Сапер 1', weapon: 'Винтовка Vz.24', hp: 3, maxHp: 3 },
        { name: 'Сапер 2', weapon: 'Винтовка Vz.24', hp: 3, maxHp: 3 },
        { name: 'Сержант', weapon: 'ПП Star Si-35', hp: 3, maxHp: 3, isCommander: true },
        { name: 'Пулеметчик ', weapon: 'Ручной пулемет Zb.26', hp: 3, maxHp: 3 },
        { name: 'Второй номер', weapon: 'Винтовка Vz.24', hp: 3, maxHp: 3 }]
    }];
    grid[ownHex || '0,0'].squadIds = [0];
    (enemies || []).forEach((e, i) => { ad.map.enemySquads.push(e.squad); if (grid[e.key]) grid[e.key].enemySquadIds.push(i); });
    s.run('currentTurn = 3; currentSquadIndex = 0; currentSquad = appData.squads[0]; actionPoints = { 0: { ap: 8, maxAp: 8 } };');
    s.run('getActionCost = function () { return 1; }; spendAP = function () { return true; };');
    s.run('var __logs = []; function log(m) { __logs = __logs.concat(String(m)); }');
    return s;
  }
  const logsOf = s => JSON.parse(s.evalCtx('JSON.stringify(__logs)'));
  const rolls = (s, list) => s.run('rollD6 = (function () { var q = ' + JSON.stringify(list) +
    '; return function () { return q.length ? q.shift() : 3; }; })();');
  const outcomeOf = s => { const o = s.sandbox.appData.map && s.sandbox.appData.map.lastAttackOutcome; return o && o.text ? String(o.text) : ''; };
  const hexProbe = thermiteScene([]);
  const hexAt = dist => JSON.parse(hexProbe.evalCtx(
    '(function () { for (let c = -4; c <= 4; c++) for (let r = -3; r <= 3; r++) ' +
    'if (hexGridDistance(0, 0, c, r) === ' + dist + ' && !(c === 0 && r === 0)) return JSON.stringify(c + \',\' + r); return null; })()'));
  const NEAR = hexAt(1), FAR = hexAt(2);

  // 1) части ДОТа
  {
    const s = thermiteScene([]);
    const parts = s.evalCtx('JSON.stringify(thermiteDotParts(' + JSON.stringify(mkDot()) + '))');
    const parsed = JSON.parse(parts);
    ok(parsed.length === 4 && parsed[0].kind === 'door' && !parsed[0].disabled &&
       parsed[1].label.indexOf('Амбразура 1 — Расчёт ПТО Bohler M37') >= 0 &&
       parsed[2].label.indexOf('Амбразура 2 — Станковый пулемет Schwarzlose') >= 0,
       'п.31: части ДОТа — дверь + каждая амбразура поимённо', parsed.map(p => p.label));
    const after = JSON.parse(s.evalCtx('JSON.stringify(thermiteDotParts(' + JSON.stringify(mkDot({ dotDoorDestroyed: true })) + '))'));
    ok(after[0].disabled === true && /уже подорвана/.test(after[0].label),
       'п.31: подорванная дверь помечена как недоступная');
  }

  // 2) дистанция 1 гекс и отбор целей
  {
    const s = thermiteScene([
      { key: '0,0', squad: mkVehicle({ name: 'Танк в своём гексе' }) },
      { key: NEAR, squad: mkVehicle({ name: 'Танк рядом' }) },
      { key: FAR, squad: mkDot({}) },
      { key: NEAR, squad: mkInfantry() }
    ]);
    const got = JSON.parse(s.evalCtx(`JSON.stringify(thermiteEligibleTargets(currentSquad).map(t => ({ i: t.index, kind: t.kind, d: t.distance })))`));
    ok(got.length === 2 && got[0].i === 0 && got[1].i === 1 && got.every(t => t.kind === 'vehicle'),
       'п.31: предлагается только техника/ДОТ в своём или соседнем гексе (пехота и 2 гекса — нет)', JSON.stringify(got));
    const hidden = thermiteScene([{ key: '0,0', squad: mkVehicle({ hidden: true }) }]);
    ok(JSON.parse(hidden.evalCtx('JSON.stringify(thermiteEligibleTargets(currentSquad))')).length === 0,
       'п.31: скрытая цель термиту не предлагается');
    const dotFar = thermiteScene([{ key: FAR, squad: mkDot({}) }]);
    ok(JSON.parse(dotFar.evalCtx('JSON.stringify(thermiteEligibleTargets(currentSquad))')).length === 0,
       'п.31: ДОТ в 2 гексах вне радиуса заряда');
  }

  // 3) ДОТ: выжигается выбранная амбразура, дверь — подрыв
  {
    const s = thermiteScene([{ key: '0,0', squad: mkDot({}) }]);
    rolls(s, [4, 1]);
    s.run('thermiteCommitChoice(0, "embrasure", 1);');
    const st = JSON.parse(s.evalCtx(`JSON.stringify({
      ci0: appData.map.enemySquads[0].crewInstances[0].status || 'ok',
      ci1: appData.map.enemySquads[0].crewInstances[1].status || 'ok',
      ci2: appData.map.enemySquads[0].crewInstances[2].status || 'ok',
      off: appData.map.enemySquads[0].crewInstances[1].active,
      disabled: appData.map.enemySquads[0].embrasuresDisabled || 0,
      destroyed: appData.map.enemySquads[0].isDestroyed || false,
      charges: currentSquad.thermiteCharges })`));
    ok(st.ci1 === 'destroyed' && st.ci0 === 'ok' && st.ci2 === 'ok' && st.off === false && st.disabled === 1 &&
       st.destroyed === false && st.charges === 2,
       'п.31: термит выжигает именно выбранную амбразуру, ДОТ и другие амбразуры целы', JSON.stringify(st));
    ok(/амбразура 2/i.test(outcomeOf(s)) && /выжжена/.test(outcomeOf(s)) && logsOf(s).some(m => /ПРИМЕНЕНИЕ ТЕРМИТНОГО ЗАРЯДА/.test(m)),
       'п.31: результат действия виден игроку (карточка панели + лог)');
    const door = thermiteScene([{ key: '0,0', squad: mkDot({}) }]);
    rolls(door, [6, 2]);
    door.run('thermiteCommitChoice(0, "door", null);');
    const dstate = JSON.parse(door.evalCtx('JSON.stringify({ door: !!appData.map.enemySquads[0].dotDoorDestroyed, turn: appData.map.enemySquads[0].dotDoorBlownTurn, disabled: appData.map.enemySquads[0].embrasuresDisabled || 0 })'));
    ok(dstate.door === true && dstate.turn === 3 && dstate.disabled === 0,
       'п.31: удар по двери ДОТа подрывает дверь (амбразуры не тронуты)', JSON.stringify(dstate));
    // повторный выбор подорванной двери — окно перерисовывается, заряд не тратится
    rolls(door, [6, 2]);
    door.run('thermiteCommitChoice(0, "door", null);');
    ok(door.evalCtx('currentSquad.thermiteCharges') === 2, 'п.31: повторный подрыв уже подорванной двери заряд не тратит');
  }

  // 4) техника: броня любой толщины, бросок на успех, отказ заряда
  {
    const s = thermiteScene([{ key: '0,0', squad: mkVehicle() }]);
    rolls(s, [6, 2]);
    s.run('thermiteCommitChoice(0, "vehicle", null);');
    const st = JSON.parse(s.evalCtx(`JSON.stringify({
      destroyed: appData.map.enemySquads[0].isDestroyed, alive: (appData.map.enemySquads[0].fighters || []).filter(f => f.hp > 0).length,
      onGrid: (appData.map.grid['0,0'].enemySquadIds || []).indexOf(0) >= 0, charges: currentSquad.thermiteCharges })`));
    ok(st.destroyed === true && st.alive === 0 && st.onGrid === false && st.charges === 2,
       'п.31: броня 999 мм не спасает — машина уничтожена и снята с карты', JSON.stringify(st));
    ok(/броня любой толщины прожжена/.test(outcomeOf(s)), 'п.31: итог прямо говорит о прожжённой броне любой толщины');
    const fail = thermiteScene([{ key: '0,0', squad: mkVehicle() }]);
    rolls(fail, [1, 1]);
    fail.run('thermiteCommitChoice(0, "vehicle", null);');
    const fst = JSON.parse(fail.evalCtx('JSON.stringify({ destroyed: appData.map.enemySquads[0].isDestroyed || false, charges: currentSquad.thermiteCharges, alive: currentSquad.fighters.filter(f => f.hp > 0).length })'));
    ok(fst.destroyed === false && fst.charges === 2 && fst.alive === 5 && /не сработал \(d6=1\)/.test(outcomeOf(fail)),
       'п.31: при d6=1 заряд не срабатывает (расходуется, цель цела, бойцы живы)', JSON.stringify(fst));
  }

  // 5) гибель бойца при постановке (d6 4–6), командир/пулемётчик/второй номер не выбираются
  {
    const s = thermiteScene([{ key: '0,0', squad: mkVehicle({ name: 'САУ Brugge №3' }) }]);
    rolls(s, [6, 5]);
    s.run('Math.random = function () { return 0; }; thermiteCommitChoice(0, "vehicle", null);');
    const st = JSON.parse(s.evalCtx('JSON.stringify(currentSquad.fighters.map(f => f.name + ":" + f.hp))'));
    ok(st[0] === 'Сапер 1:0' && st[1] === 'Сапер 2:3' && st[2] === 'Сержант:3' &&
       st[3] === 'Пулеметчик :3' && st[4] === 'Второй номер:3' &&
       /погиб при постановке заряда \(d6=5\)/.test(outcomeOf(s)),
       'п.31: при d6=5 гибнет боец, но не командир/пулемётчик/второй номер', JSON.stringify(st));
  }

  // 6) вход в действие: отказы и отмена
  {
    const none = thermiteScene([{ key: FAR, squad: mkVehicle() }, { key: '0,0', squad: mkInfantry() }]);
    none.run('useThermiteCharge();');
    ok(none.evalCtx('currentSquad.thermiteCharges') === 3 && logsOf(none).some(m => /рядом нет бронетехники или ДОТа/.test(m)),
       'п.31: без цели в 1 гексе заряд и ОД не тратятся (пехота — не цель)');
    const okScene = thermiteScene([{ key: '0,0', squad: mkVehicle() }]);
    okScene.run('useThermiteCharge();');
    ok(okScene.evalCtx('appData.map.lastAttackOutcome') === null || okScene.evalCtx('appData.map.lastAttackOutcome') === undefined,
       'п.31: открытие окна выбора само по себе ничего не тратит и не применяет');
    okScene.run('closeThermitePicker();');
    ok(okScene.evalCtx('currentSquad.thermiteCharges') === 3,
       'п.31: отмена выбора (закрытие окна) не тратит заряд и ОД');
    const noCharge = thermiteScene([{ key: '0,0', squad: mkVehicle() }]);
    noCharge.run('currentSquad.thermiteCharges = 0; useThermiteCharge();');
    ok(logsOf(noCharge).some(m => /Нет термитных зарядов/.test(m)), 'п.31: без зарядов действие отказывает');
  }
}

// ─────────────────────────── служебное: версия и сборка ───────────────────────────
{
  const app = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
  ok(app === 'v13.099', 'версия приложения обновлена (' + app + ')');
  ok(new RegExp("CACHE_NAME = 'wargame-" + app + "'").test(SW), 'service-worker: кэш совпадает с версией');
  ok(MANIFEST.includes('БМ ' + app), 'manifest: short_name совпадает с версией');
  const marked = ['js/cards.js', 'js/data.js', 'js/hexmaps.js', 'js/operational_ui.js', 'js/templates.js'];
  const stale = marked.filter(rel => !read(rel).split('\n')[0].includes('⚡ BUILD-МАРКЕР: ' + app));
  ok(stale.length === 0, 'build-маркеры модулей синхронизированы', stale.join(', '));
  ok(/function isMortarUnit\(unit\)/.test(HTML) && /function operationalDotSectorAllows/.test(HEXMAPS) &&
     !/function operationalDotSectorAllows/.test(HTML),
     'isMortarUnit не подменён дублем operationalDotSectorAllows');
}

console.log(`\nИтог v13.099: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
