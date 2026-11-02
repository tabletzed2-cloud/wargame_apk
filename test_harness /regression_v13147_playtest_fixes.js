'use strict';
// ⚡ v13.147: пункты 7, 10, 12, 13 из списка плейтеста.
//   7  — клик по обнаруженному противнику показывает его название;
//   10 — гекс боя совпадает с фактической расстановкой, отряды участников
//        не «теряются» (не отображается юнит, который числится в бою);
//   12 — обороняющемуся открывается правильный гекс (запись боя не «съезжает»);
//   13 — общий запас патронов взвода + уведомление «патроны подходят к концу».
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const UI_ONLINE = fs.readFileSync(path.join(ROOT, 'js/online_battles.js'), 'utf8');

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

// ───────────────────────── п.10/12: гекс боя ─────────────────────────
const BATTLE_HELPERS = [
    'battleUnitNamesForSide', 'battleRecordParticipantUnits', 'battleRecordLivingUnitOnHex',
    'battleLivingParticipantsOnHex', 'battleMostFrequentParticipantHex',
    'battleEnsureParticipantSquads', 'repairBattleHexAnchor', 'repairAllBattleHexAnchors'
];
{
    const prologue = BATTLE_HELPERS.map(n => sliceFunction(HTML, n)).join('\n\n');
    fs.writeFileSync('/tmp/wg_part.js', prologue);
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      appData.campaign.currentTurn = 4;
      function mkUnit(name, col, row) {
        return { name: name, col: col, row: row,
          squads: [{ name: name + '-1', fighters: [{ hp: 3 }], currentMorale: 90, baseMorale: 100 }] };
      }
      appData.campaign.opUnits = [mkUnit('Наш взвод', 6, 6)];
      appData.campaign.enemyOpUnits = [mkUnit('Враг', 6, 6)];
      appData.campaign.activeBattles = [{
        id: 1, hexKey: '2,2',
        playerUnitNames: ['Наш взвод'], enemyUnitNames: ['Враг'],
        playerSquads: [], enemySquads: [],
        tacticalMap: { hexKey: '2,2' }
      }];
      var repaired = repairAllBattleHexAnchors({ silentSave: true });
      var battle = appData.campaign.activeBattles[0];
      var hexAfter = battle.hexKey;
      var mapHexAfter = battle.tacticalMap.hexKey;
      var playerSquadsAfter = battle.playerSquads.length;
    `);
    ok(s.evalCtx('repaired') === 1, 'запись боя с «чужим» гексом исправлена');
    ok(s.evalCtx('hexAfter') === '6,6', 'гекс боя переносится туда, где стоят участники',
        String(s.evalCtx('hexAfter')));
    ok(s.evalCtx('mapHexAfter') === '6,6', 'карта гекса в записи боя тоже обновлена');
    ok(s.evalCtx('playerSquadsAfter') === 1, 'отряд участника возвращён в состав боя (не отображался)');
    ok(s.evalCtx("battle.enemySquads.length") === 1, 'вражеский отряд тоже в составе боя');

    // Гекс боя, где реально стоят участники, не переносится.
    s.run(`
      appData.campaign.activeBattles = [{
        id: 2, hexKey: '6,6',
        playerUnitNames: ['Наш взвод'], enemyUnitNames: ['Враг'],
        playerSquads: [{ name: 'Наш взвод-1', opUnitName: 'Наш взвод' }], enemySquads: [],
        tacticalMap: { hexKey: '6,6' }
      }];
      var keepChanged = repairAllBattleHexAnchors({ silentSave: true });
      var keepHex = appData.campaign.activeBattles[0].hexKey;
    `);
    ok(s.evalCtx('keepChanged') === 0, 'корректный гекс боя не трогаем');
    ok(s.evalCtx('keepHex') === '6,6', 'гекс боя остался прежним');

    // Подкрепление: на «старом» гексе кто-то есть — запись не переносим.
    s.run(`
      var reinforcement = mkUnit('Подкрепление', 6, 6);
      appData.campaign.opUnits.push(reinforcement);
      appData.campaign.activeBattles = [{
        id: 3, hexKey: '6,6',
        playerUnitNames: ['Наш взвод', 'Подкрепление'], enemyUnitNames: ['Враг'],
        playerSquads: [{ name: 'Наш взвод-1', opUnitName: 'Наш взвод' }], enemySquads: [],
        tacticalMap: { hexKey: '6,6' }
      }];
      var reinforcementChanged = repairAllBattleHexAnchors({ silentSave: true });
      var reinforcementSquads = appData.campaign.activeBattles[0].playerSquads.length;
    `);
    ok(s.evalCtx('reinforcementChanged') === 0, 'бой с подкреплением на своём гексе не переносится');
    ok(s.evalCtx('reinforcementSquads') === 2, 'отряды подкрепления добавлены в бой');
}

// ───────────────────────── п.13: общий запас патронов ─────────────────────────
const AMMO_HELPERS = [
    'operationalAmmoField', 'operationalAmmoSquads', 'unitOperationalAmmoTotalSquads',
    'unitOperationalAmmoTotal', 'platoonAmmoKindField', 'platoonAmmoReserveInit',
    'platoonAmmoReserveAmount', 'platoonAmmoReserveSpend', 'platoonAmmoTopUpFromReserve',
    'platoonAmmoGrandTotal', 'platoonAmmoLowNotice', 'consumeOperationalAmmo'
];
{
    const prologue = sliceConst(HTML, 'PLATOON_AMMO_RESERVE_RATIO') + '\n' +
        sliceConst(HTML, 'PLATOON_AMMO_LOW_RATIO') + '\n' +
        AMMO_HELPERS.map(n => sliceFunction(HTML, n)).join('\n\n');
    fs.writeFileSync('/tmp/wg_part.js', prologue);
    const appData = freshAppData();
    const s = createSandbox(appData);
    s.run(`
      appData.campaign.currentTurn = 2;
      var unit = { name: 'Стрелковый взвод', squads: [
        { name: 'Отд-1', ammoSmall: 60, ammoOrdnance: 4 },
        { name: 'Отд-2', ammoSmall: 60, ammoOrdnance: 4 }
      ] };
      var reserveInit = platoonAmmoReserveInit(unit);
      var reserveSmall = platoonAmmoReserveAmount(unit, 'small');
      var grandTotal = unitOperationalAmmoTotal(unit, 'small');
      // оперативный залп на 100 выстрелов — отделения добирают из резерва
      var spent = consumeOperationalAmmo(unit, 'small', 100);
      var reserveAfter = platoonAmmoReserveAmount(unit, 'small');
      var squadTotalAfter = unitOperationalAmmoTotalSquads(unit, 'small');
      var grandAfterFirst = platoonAmmoGrandTotal(unit, 'small');
      consumeOperationalAmmo(unit, 'small', 50);   // ещё один залп: остаток 30 из 180
      // второй залп сам отправил уведомление — повторно в этом ходу молчим
      var noticeStamp = unit.ammoLowNoticeTurn;
      var noticeAgain = platoonAmmoLowNotice(unit, 'small');
      // отдельный взвод: остаток 30 из 180 (<20 %) — уведомление срабатывает
      var unitLow = { name: 'Низкий запас', squads: [{ name: 'L', ammoSmall: 20, ammoOrdnance: 0 }] };
      platoonAmmoReserveInit(unitLow);
      unitLow.squads[0].ammoSmall = 1;
      unitLow.ammoReserve.small = 0;   // 1 из 30 — почти пусто
      var notice = platoonAmmoLowNotice(unitLow, 'small');
    `);
    ok(s.evalCtx('reserveSmall') === 60, 'общий запас = половина штатной выкладки отделений',
        String(s.evalCtx('reserveSmall')));
    ok(s.evalCtx('grandTotal') === 180, 'полный запас взвода = отделения + резерв',
        String(s.evalCtx('grandTotal')));
    ok(s.evalCtx('spent') === 100, 'залп списан полностью');
    ok(s.evalCtx('squadTotalAfter') === 20 && s.evalCtx('reserveAfter') === 60,
        'израсходована выкладка отделений, общий запас ждёт следующего залпа',
        JSON.stringify([s.evalCtx('squadTotalAfter'), s.evalCtx('reserveAfter')]));
    ok(s.evalCtx('grandAfterFirst') === 80,
        'полный остаток взвода = 80 из 180 после залпа');
    ok(s.evalCtx('notice') === true, 'при остатке ниже 20 % — уведомление «патроны подходят к концу»');
    ok(s.evalCtx('noticeStamp') === 2, 'уведомление отправлено автоматически после залпа');
    ok(s.evalCtx('noticeAgain') === false, 'в том же ходу уведомление не повторяется');

    // Резерв не даёт отделению превысить штатную выкладку.
    s.run(`
      var unit2 = { name: 'Второй', squads: [
        { name: 'A', ammoSmall: 10, ammoOrdnance: 0 },
        { name: 'B', ammoSmall: 10, ammoOrdnance: 0 }
      ] };
      platoonAmmoReserveInit(unit2);
      var filled = platoonAmmoTopUpFromReserve(unit2, 'small');
      var aAmmo = unit2.squads[0].ammoSmall;
      var bAmmo = unit2.squads[1].ammoSmall;
    `);
    ok(s.evalCtx('filled') === 0, 'если отделения полны, резерв не расходуется');
    ok(s.evalCtx('aAmmo') === 10 && s.evalCtx('bAmmo') === 10, 'штатная выкладка отделений не превышена');

    // Пустой резерв и полные отделения — залп всё равно возможен.
    s.run(`
      var unit3 = { name: 'Третий', squads: [{ name: 'C', ammoSmall: 30, ammoOrdnance: 0 }] };
      platoonAmmoReserveInit(unit3);
      var okShot = consumeOperationalAmmo(unit3, 'small', 10);
      var left = unitOperationalAmmoTotal(unit3, 'small');
    `);
    ok(s.evalCtx('okShot') === 10, 'залп в пределах выкладки проходит без резерва');
    ok(s.evalCtx('left') === 35, 'остаток = отделения + общий запас', String(s.evalCtx('left')));
}

// ───────────────────────── п.7: карточка противника ─────────────────────────
{
    ok(/function showOpEnemyInfoPopup/.test(HTML), 'есть карточка обнаруженного противника');
    ok(/showOpEnemyInfoPopup\(clickedEnemyView\)/.test(HTML), 'карточка открывается кликом по врагу');
    ok(/esc\(unit\.name \|\| 'Противник'\)/.test(HTML), 'в карточке противника показывается его название');
    ok(/подробные данные \(карты, боезапас, дух\) не видны/.test(HTML),
        'внутренние данные противника не раскрываются');
    ok(/Обнаружен противник на гексе/.test(HTML), 'строка «обнаружен противник» сохранена');
}

// ───────────────────────── п.10/12: подключение к движку ─────────────────────────
{
    ok(/function repairBattleHexAnchor/.test(HTML), 'есть сверка гекса боя с расстановкой');
    ok(/repairBattleHexAnchor\(battle\)/.test(HTML), 'сверка выполняется перед открытием боя');
    ok(/repairAllBattleHexAnchors\(\{ silentSave: true \}\)/.test(HTML),
        'сверка выполняется при обновлении списка боёв');
    ok(/battleLivingParticipantsOnHex\(byParticipants, byParticipants\.hexKey\)/.test(HTML),
        'к старому бою «по участникам» присоединяемся только при живых юнитах на его гексе');
    ok(/function onlineFindLocalBattleByParticipants/.test(UI_ONLINE),
        'онлайн: бой ищется и по составу участников');
    ok(/onlineReanchorBattleToHex\(sameClash, e\.hexKey\)/.test(UI_ONLINE),
        'онлайн: гекс боя согласуется с оппонентом');
    ok(/repairAllBattleHexAnchors\(\{ silentSave: true \}\)/.test(UI_ONLINE),
        'онлайн: после приёма снимков гекс боя и состав сверяются');
}

// ───────────────────────── п.13: подключение к движку ─────────────────────────
{
    ok(/function platoonAmmoReserveInit/.test(HTML), 'есть общий запас патронов взвода');
    ok(/platoonAmmoTopUpFromReserve\(unit, kind\)/.test(HTML),
        'из общего запаса патроны распределяются по отделениям');
    ok(/platoonAmmoLowNotice\(unit, kind\)/.test(HTML), 'уведомление о низком запасе вызывается после залпа');
    ok(/const PLATOON_AMMO_LOW_RATIO = 0.2;/.test(HTML), 'порог уведомления — 20 % исходного запаса');
    ok(/в запасе\)/.test(HTML), 'в карточке взвода видно общий запас патронов');
}

try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}
console.log(`\n== итог v13.147 (пункты 7/10/12/13): ${pass} ok, ${fail} fail ==`);
process.exit(fail ? 1 : 0);
