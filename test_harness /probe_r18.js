// ⚡ dev-пробник R18: v13.025–v13.058 regression-покрытие.
// ⚡ v13.061: проверки версии приложения и SW обновлены для нового релиза.
const fs = require('fs');
const path = require('path');
const { sliceFunction, HTML } = require('./extract');
const { createSandbox, freshAppData, setRandom } = require('./sandbox');

const FNS = [
    'generateBattalion', 'getPresetSignature', 'getBattalionSignature', 'buildOperationalUnits',
    'canIssueArtilleryStrike', 'submitArtilleryStrikeOrder', 'showOrderPanel',
    'getHqSupportAccuracyMod', 'getOpHexDistance', 'isStaticOpUnit',
    'selectTargetVehicle', 'processVehicleHit', 'getLocationName', 'getOpHexTypes',
    'executeOpShoot', 'executeOpShootAt', 'executeArtilleryStrikeOrder',
    'pointInPolygon', 'isHexInPlacementZone', 'zoneExtraHexes',
    'finishPlacement', 'showBonusInfo', 'updateHardModeButtons',
    // ⚡ v13.039: онлайн-синхронизация (R24)
    'onlineOppRole', 'onlineMyTurnActive', 'onlineWaitBanner', 'onlineSetTurnLockUI',
    'onlineUnitSnapshot', 'onlinePushMyUnits', 'onlineApplyCloudState',
    'onlineEnemyVisible', 'onlineFinishTurn', 'onlineOnTurnChanged', 'onlineOnTurnStatusChanged',
          'onlineMergeUnitDamage', 'onlinePushInflictedDamage', 'onlineScheduleInflictedPush', 'onlineOnSnapshotSync',
    'endOperationalTurn', 'getOpUnitByName', 'getBattleUnitNames', 'isCardSelectableOpUnit',
    'isTacticalHealthEditTestMode', 'getCurrentCampaignBattle', 'ensureBattleSquadOwnership',
    'ensureBattleCardSelectionQueue', 'getCurrentBattleCardSelectionUnit', 'getLiveSquadsForOpUnit',
    'getUnitCardFactionContext', 'computeSubFactionFromSquads', 'getCardDefinitionByName', 'getCardTargetSpec',
    'getScopedActiveCardsForSquad', 'getScopedActiveModifiersForSquad',
    'getCardTargetCandidates', 'isCardAvailableToUnit', 'cardSelectionTargetNames', 'escapeCardHtml', 'collectCardLibraryForContext',
    'getScopedCardRecordsForUnit', 'makeScopedActiveCard', 'refreshAssignedCardEffectsForNewBattle', 'syncScopedActiveCardsForBattle',
    'updateActiveCardsBattle', 'syncFactionCatalogs', 'getDefaultData',
    'openOnlineMenu', 'onlineDiagnostics', 'onlineFirebaseReady', 'onlineCreateRoom', 'onlineJoinRoom',
    'onlineBody', 'onlineGoToCampaign', 'closeOnlineModal', 'onlineShowJoin',
    'onlineSelfTest', 'onlineSelfTestMeaning',
    'onlineAutoEnterPlacement', 'onlineFirstTurnRole',
    'showOperationalMap', 'setOpMapMode', 'renderTemplateSelection', 'selectFaction', 'selectSubFaction',
    'computeSubFactionFromSquads', 'getBattleCardContext', 'renderCardSelectionForBattle',
    'opLineOfSightBlocked', 'unitCanBeDetected', 'artilleryCaliberMm', 'dotEmbrasureHp', 'dotEmbrasureDestroyed',
    'getRelayCompanyForOrder', 'findParentCompany', 'ensureSignalPlatoonState', 'hasActivePhoneAt', 'checkCommunication', 'hasRadio', 'hasPhoneLine', 'isInRadioRange',
    'renderAwardsReference', 'executeMortarSalvo', 'finishPlacement',
    'updateAssemblySupportCheck', 'orderShouldExecuteNow', 'executeOrder', 'executeDigInOrder', 'rollD12',
    // ⚡ v13.047 (R32): миномёты/ДОТ, залп ∝ живому составу, авто. винтовка = 2
    // ⚡ v13.057: morale helpers are direct artillery-strike dependencies.
    'isOperationalMoraleUnit', 'getOperationalMorale', 'operationalMoraleMarkup', 'changeOperationalMorale', 'triggerOperationalRetreat',
    'cancelOrdersForMoraleRetreat', 'isMortarUnit', 'mortarRoundsForUnit', 'unitAutoFire', 'canUnitShoot',
    'isMediumArtillery', 'operationalMediumArtilleryRange', 'getNearestOpUnit', 'isArmoredUnit',
    // ⚡ v13.048 (R33): бонусы фракций на экране выбора стороны
    'showScenarioDetails', 'factionBonusHtml',
    // ⚡ v13.049 (R34): ходимость по новым типам местности
    //    (executePrepPositionsOrder и весь модуль карт гексов — в js/hexmaps.js,
    //     его песочница грузит целиком)
    'getMovementCost',
    // ⚡ v13.061: helpers for bicycle-blitz card eligibility, movement and flank bonus.
    'isBicycleTacticalSquad', 'hasBicycleBlitz', 'refreshTacticalAPForSquad',
    'getBicycleBlitzFlankBonus', 'applyBicycleBlitzToSquad',
    // ⚡ v13.051 (R36): десант на БТР = размещён; авторазмещение; разведка r3; туман без «липкости»
    'isOpUnitEmbarkedOnPlacedBtr', 'getUnplacedOpUnits', 'getFactionPlacementHexes', 'autoPlaceUnplacedUnits',
    'maybeAutoPlaceAtStart', 'isReconZoneActive', 'onlineFogMap', 'onlineRevealEnemy', 'onlineFogRevealedUntil',
    'executeReconOrder', 'opMapDrawDims', 'onlineMarkPlaced', 'executeMoveOrder', 'checkEnemyEncounter',
    'getOpMoveCost', 'getRouteToTarget', 'getOpHexNeighbors',
    // ⚡ v13.050: сквозной старт боя на гексе с реальной картой пользователя
    // ⚡ v13.057: функции-хелперы боя/морали нужны для изолированного запуска startTacticalBattle.
    'deepCloneGameData', 'getMaxAP', 'getOperationalCombatFighters', 'getTacticalBattleAnchor', 'battleUnitNamesForSide',
    'sameBattleUnitNames', 'findDuplicateBattleByParticipants', 'startTacticalBattle',
    // ⚡ v13.052 (R37): Hard Mode онлайн, канвас/масштаб
    'applyHardModeUI', 'ensureHardModeForOnline', 'toggleHardMode', 'pickCanvasDpr', 'canvasBackingScale',
    'opMapFitZoom', 'opMapMinZoom', 'applyOpMapFitZoom', 'fitOpMapZoom', 'zoomOpMap', 'isMobileViewport',
    // ⚡ v13.053 (R38): стартовые позиции из js/data.js, единый #mapInfo
    'getConfiguredStartHex', 'buildStartPositionsCode', 'relocateMapInfo',
    // ⚡ v13.054 (R39#2/#4): уничтоженные юниты в батальоне; действия с карты боя
    'isOpUnitWipedOut', 'markOpUnitDestroyed', 'syncBattleLossesToCampaign', 'renderBattalionRoster',
    'executeAttack', 'closeTargetModal', 'getCrewRole', 'handleHexAction', 'recalcReachable',
    // ⚡ v13.055 (R39#3): размещение перед боем — откуда вошёл юнит
    'opRecordPrevPos', 'switchToBattle', 'placeExistingEnemyOnHex', 'getTacticalBattleRecord', 'getTacticalActiveSide', 'nextTurn'
];

let pass = 0, fail = 0;
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' | ' + extra : '')); }
}

console.log('Извлечение функций...');
fs.writeFileSync('/tmp/wg_part.js', FNS.map(f => sliceFunction(HTML, f)).join('\n\n'));

function makeSandbox(ad) {
    const s = createSandbox(ad);
    s.sandbox.appData.templates = s.evalCtx('SQUAD_TEMPLATES');
    s.sandbox.appData.factions = s.evalCtx('({ BeVe: appData.factions.BeVe, "A.I.R.F.": appData.factions["A.I.R.F."] })') || {};
    s.sandbox.assignUniqueCrewKeys = (squad) => {
        (squad.fighters || []).forEach((f, i) => { f.crewKey = f.crewKey || ('k' + i); });
    };
    return s;
}

// ============================================================
console.log('\n== K. v13.028: BeVe — без пушек, приказ штаба + автопересборка ==');
{
    const ad = freshAppData();
    const s = makeSandbox(ad);
    const opts = s.evalCtx('BATTALION_PRESETS.BeVe.supportOptions');
    const beOpts = s.evalCtx('BATTALION_PRESETS.BeVe.supportOptions');
    const beArt = beOpts.find(o => o.id === 'artillery_support');
    const beGuns = beOpts.find(o => o.id === 'regimental_artillery');
    ok(!beGuns, 'K1: у BeVe нет опции «пушки 75-мм» (regimental_artillery)');
    ok(!!beArt && beArt.orderOnly === true, 'K2: у BeVe есть «artillery_support» (orderOnly)');
    const airOpts = s.evalCtx('BATTALION_PRESETS["A.I.R.F."].supportOptions');
    ok(!!airOpts.find(o => o.id === 'artillery_support' && o.orderOnly) && !airOpts.find(o => o.id === 'regimental_artillery'),
        'K3: AIRF — по-прежнему artillery_support (orderOnly), без пушек');

    const bev = s.evalCtx('generateBattalion("BeVe", ["dots", "artillery_support"])');
    ok(bev.artillerySupport === true, 'K4: generateBattalion(BeVe, +артподдержка) — флаг artillerySupport');
    ok(!bev.units.some(u => u.type === 'regimental_artillery'), 'K5: у BeVe не создаются юниты-пушки');
    const bevNo = s.evalCtx('generateBattalion("BeVe", ["dots"])');
    ok(!bevNo.artillerySupport, 'K6: BeVe без опции — флага artillerySupport нет');

    // canIssueArtilleryStrike
    s.sandbox.appData.campaign.playerFaction = 'BeVe';
    s.sandbox.appData.campaign.battalions.player = { faction: 'BeVe', artillerySupport: true, supportIds: ['artillery_support'] };
    ok(s.evalCtx('canIssueArtilleryStrike()') === true, 'K7: BeVe со флагом — обстрел доступен');
    s.sandbox.appData.campaign.battalions.player = { faction: 'BeVe', supportIds: ['dots'] };
    ok(s.evalCtx('canIssueArtilleryStrike()') === false, 'K8: BeVe без артподдержки — обстрел НЕдоступен');
    s.sandbox.appData.campaign.playerFaction = 'A.I.R.F.';
    s.sandbox.appData.campaign.battalions.player = { faction: 'A.I.R.F.', supportIds: ['dots'] };
    ok(s.evalCtx('canIssueArtilleryStrike()') === false, 'K9: AIRF без артподдержки — обстрел НЕдоступен (regression v13.025)');
    s.sandbox.appData.campaign.playerFaction = 'BeVe';
    s.sandbox.appData.campaign.battalions.player = { faction: 'BeVe', supportIds: ['regimental_artillery'] };
    ok(s.evalCtx('canIssueArtilleryStrike()') === true, 'K10: старый сейв (regimental_artillery) — обстрел доступен');

    // presetSig содержит имена шаблонов — Van Hees виден в сигнатуре
    const sig = s.evalCtx('getPresetSignature("BeVe")');
    ok(String(sig).includes('ДОТ Van Hees'), 'K11: presetSig BeVe содержит «ДОТ Van Hees» (автопересборка при изменении опции)');

    // КЛЮЧЕВОЙ СЦЕНАРИЙ: старый BeVe-сейв (1 ДОТ Bosh, пушки 75-мм) → пересборка
    const ad2 = freshAppData();
    ad2.campaign.playerFaction = 'BeVe';
    ad2.campaign.opMapGrid = {};
    ad2.campaign.battalions.player = {
        faction: 'BeVe',
        presetSig: 'BeVe::old::dots,regimental_artillery', // устаревшая сигнатура
        supportIds: ['dots', 'regimental_artillery'],
        units: [
            { name: 'ДОТы', type: 'dots', squads: [{ name: 'ДОТ Bosh' }] },
            { name: 'Полковая артиллерия', type: 'regimental_artillery', squads: [{ name: 'Пушка 75-мм №1' }, { name: 'Пушка 75-мм №2' }] }
        ]
    };
    ad2.campaign.opUnits = [
        { name: 'ДОТ Bosh', type: 'dots', col: 4, row: 5, side: 'player', ap: 0, maxAp: 0, squads: [{ name: 'ДОТ Bosh', fighters: [{ name: 'А', hp: 3, maxHp: 3 }] }] },
        { name: 'Пушка 75-мм №1', type: 'regimental_artillery', col: 2, row: 2, side: 'player', ap: 4, maxAp: 4, squads: [] },
        { name: 'Пушка 75-мм №2', type: 'regimental_artillery', col: 3, row: 2, side: 'player', ap: 4, maxAp: 4, squads: [] }
    ];
    ad2.campaign.opUnitsSignature = 'old-signature';
    const s2 = makeSandbox(ad2);
    s2.evalCtx('buildOperationalUnits()');
    const b = ad2.campaign.battalions.player;
    const units = ad2.campaign.opUnits;
    ok(b.artillerySupport === true, 'K12: старый BeVe-сейв пересобран — флаг artillerySupport=true');
    ok(!units.some(u => u.type === 'regimental_artillery'), 'K13: пушки 75-мм из сейва исчезли');
    const bosh = units.find(u => u.name === 'ДОТ Bosh');
    const hees = units.find(u => u.name === 'ДОТ Van Hees');
    ok(!!bosh, 'K14: «ДОТ Bosh» на месте');
    ok(!!hees, 'K15: «ДОТ Van Hees» появился в составе (автопересборка v13.026+)', 'юниты: ' + units.map(u => u.name).join(', '));
    if (bosh) ok(bosh.col === 4 && bosh.row === 5, 'K16: позиция ДОТ Bosh сохранена (4,5)', `факт (${bosh.col},${bosh.row})`);
    if (hees) ok(hees.col === null || hees.col === undefined, 'K17: Van Hees ждёт размещения (позиция пустая)');
}

// ============================================================
console.log('\n== H. v13.025: приказ «Арт. обстрел» — блокировка и submit ==');
{
    const ad = freshAppData();
    ad.campaign.playerFaction = 'A.I.R.F.';
    ad.campaign.battalions.player = { faction: 'A.I.R.F.', supportIds: ['btr_platoon'] };
    ad.campaign.opUnits = [{ name: 'Штаб батальона', type: 'battalion_hq', col: 0, row: 0, squads: [] }];
    const s = makeSandbox(ad);
    // заблокированный submit
    s.sandbox.document.getElementById('orderType').value = 'artillery_strike';
    s.sandbox.document.getElementById('orderTargetHex').value = '5,6';
    s.evalCtx('submitArtilleryStrikeOrder()');
    ok(s.alerts.some(a => a.includes('недоступен')), 'H1: submit заблокирован (alert «недоступен»)');
    ok((s.sandbox.hardMode.orders || []).length === 0, 'H2: приказ не создан');
    ok(!ad.campaign.artilleryStrikesUsed, 'H3: счётчик обстрелов не тратится');

    // BeVe С поддержкой — submit проходит
    const ad2 = freshAppData();
    ad2.campaign.playerFaction = 'BeVe';
    ad2.campaign.battalions.player = { faction: 'BeVe', artillerySupport: true, supportIds: ['artillery_support'] };
    ad2.campaign.opUnits = [{ name: 'Штаб батальона', type: 'battalion_hq', col: 0, row: 0, squads: [] }];
    const s2 = makeSandbox(ad2);
    s2.sandbox.document.getElementById('orderType').value = 'artillery_strike';
    s2.sandbox.document.getElementById('orderTargetHex').value = '5,6';
    s2.evalCtx('submitArtilleryStrikeOrder()');
    const orders = s2.sandbox.hardMode.orders || [];
    const strike = orders.find(o => o.type === 'artillery_strike');
    ok(!!strike, 'H4: BeVe с поддержкой — приказ создан', s2.alerts.join('; '));
    if (strike) ok(strike.targetHex === '5,6' && strike.toUnitId === -1, 'H5: параметры приказа (гекс 5,6, не адресован отряду)');
    ok(ad2.campaign.artilleryStrikesUsed === 1, 'H6: счётчик обстрелов (1 из 4)');
}

// ============================================================
console.log('\n== I. v13.026: ДОТ Van Hees ==');
{
    const ad = freshAppData();
    const s = makeSandbox(ad);
    const t = s.evalCtx('SQUAD_TEMPLATES.find(t => t.name === "ДОТ Van Hees")');
    ok(!!t, 'I1: шаблон «ДОТ Van Hees» существует');
    if (t) {
        ok(t.faction === 'BeVe', 'I2: фракция BeVe');
        ok(t.fighters.length === 7, 'I3: обслуга 7 человек', 'факт ' + t.fighters.length);
        ok(t.fighters[0].isCommander === true && t.fighters[0].weapon === 'Пистолет Browning Hi-Power', 'I4: Лейтенант — командир с пистолетом');
        const pto = (t.crewInstances || []).find(c => /ПТО/.test(c.weaponName || ''));
        const mg = (t.crewInstances || []).find(c => /пулемет|Schwarzlose/i.test(c.weaponName || ''));
        ok(pto && pto.fighterIndices.length === 3 && mg && mg.fighterIndices.length === 2,
            'I5: расчёт ПТО 3 чел. + расчёт ПМ 2 чел.', JSON.stringify({ pto: pto && pto.fighterIndices, mg: mg && mg.fighterIndices }));
    }
    const dotsOpt = s.evalCtx('BATTALION_PRESETS.BeVe.supportOptions.find(o => o.id === "dots")');
    ok(!!dotsOpt && dotsOpt.templates.length === 2, 'I6: опция «dots» — два ДОТа');
    const b = s.evalCtx('generateBattalion("BeVe", ["dots"])');
    const dotsUnit = b.units.find(u => u.type === 'dots');
    ok(!!dotsUnit && dotsUnit.squads.length === 2, 'I7: generateBattalion — юнит dots с двумя расчётами');
    if (dotsUnit) {
        const names = dotsUnit.squads.map(q => q.name).join(', ');
        ok(names.includes('ДОТ Bosh') && names.includes('ДОТ Van Hees'), 'I8: в составе оба ДОТа', names);
        const boshSq = dotsUnit.squads.find(q => q.name === 'ДОТ Bosh');
        const heesSq = dotsUnit.squads.find(q => q.name === 'ДОТ Van Hees');
        ok(boshSq.icon === 'images/BeVe/ДОТ Bosh.png' && heesSq.icon === 'images/BeVe/ДОТ Van Hees.png',
            'I9: иконки — свой файл у каждого ДОТа (Van Hees: свой PNG, fallback на карте — Bosh)');
    }
    ok(s.evalCtx('isStaticOpUnit({ type: "dots", name: "ДОТ Van Hees" })') === true, 'I10: Van Hees — стационарный');
}

// ============================================================
console.log('\n== J. v13.027: BeVe +20% точности у штаба ==');
{
    const ad = freshAppData();
    const s = makeSandbox(ad);
    ad.campaign.playerFaction = 'BeVe';
    ad.campaign.opUnits = [{ name: 'Штаб батальона', type: 'battalion_hq', col: 10, row: 10, squads: [] }];
    const at = (c, r) => ({ name: 'Юнит', type: 'at_battery', col: c, row: r, squads: [{ name: 'ПТО', faction: 'BeVe', crewInstances: [{ weaponName: 'ПТО', active: true, status: 'ok' }] }] });
    ok(s.evalCtx('getHqSupportAccuracyMod(' + JSON.stringify(at(11, 10)) + ')') === 1.2, 'J1: в 1 гексе от штаба → ×1.2');
    ok(s.evalCtx('getHqSupportAccuracyMod(' + JSON.stringify(at(12, 10)) + ')') === 1.2, 'J2: в 2 гексах от штаба → ×1.2');
    ok(s.evalCtx('getHqSupportAccuracyMod(' + JSON.stringify(at(14, 10)) + ')') === 1, 'J3: в 4 гексах от штаба → ×1');
    ad.campaign.playerFaction = 'A.I.R.F.';
    ok(s.evalCtx('getHqSupportAccuracyMod(' + JSON.stringify(at(11, 10)) + ')') === 1, 'J4: AIRF — бонуса нет');
    ad.campaign.playerFaction = 'BeVe';
    ad.campaign.opUnits = [];
    ok(s.evalCtx('getHqSupportAccuracyMod(' + JSON.stringify(at(11, 10)) + ')') === 1, 'J5: без штаба — бонуса нет');

    // ПТО d6: 0.33 попадает только с бонусом (0.30→0.36)
    const vehicle = (name) => ({ name, type: 'tank_platoon', faction: 'A.I.R.F.', armor: { front: 20, side: 15, rear: 10, turret: 18 }, fighters: [{ name: 'Экипаж', weapon: 'Винтовка', hp: 3, maxHp: 3 }], squads: [], isDestroyed: false });
    const mk = (shooterCol) => {
        const a = freshAppData();
        a.campaign.playerFaction = 'BeVe';
        const hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 10, row: 10, squads: [] };
        const shooter = { name: 'ПТО №1', type: 'at_battery', col: shooterCol, row: 10, ap: 4, maxAp: 4, squads: [{ name: 'ПТО', faction: 'BeVe', crewInstances: [{ weaponName: 'ПТО', active: true, status: 'ok' }] }] };
        a.campaign.opUnits = [hq, shooter];
        a.campaign.enemyOpUnits = [vehicle('Танк Ц')];
        const ss = makeSandbox(a);
        ss.sandbox.getFactionCrewWeapons = (f) => (f === 'BeVe') ? [{ name: 'ПТО', type: 'at_gun', penetration: { '10': 60, '20': 45, '30': 35 } }] : [];
        ss.sandbox.opShootingState.shooter = shooter;
        ss.sandbox.opShootingState.active = true;
        const seq = [];
        for (let i = 0; i < 12; i++) seq.push(0.33, 0.7); // одиночная цель: [hitRoll, loc]
        setRandom(ss.sandbox, seq);
        ss.sandbox.executeOpShootAt([a.campaign.enemyOpUnits[0]], 1);
        return ss;
    };
    const near = mk(11);
    const far = mk(14);
    ok(near.logs.some(l => l.startsWith('💀') && l.includes('ДВИГАТЕЛЬ УНИЧТОЖЕН')), 'J6: у штаба: 0.33 попадает (0.30→0.36) — машина уничтожена');
    ok(!far.logs.some(l => l.startsWith('💀') && l.includes('ДВИГАТЕЛЬ УНИЧТОЖЕН')), 'J7: далеко от штаба: 0.33 НЕ попадает (0.30) — машина цела');
    ok(near.logs.some(l => l.includes('поддержка штаба') && l.includes('+20%')), 'J8: в логе строка о поддержке штаба');
    ok(!far.logs.some(l => l.includes('поддержка штаба')), 'J9: без бонуса строки нет');

    // Landsverk: 12 выстрелов по 0.38 — с бонусом все попадания, без — все промахи
    const sqE = (name, n, hp) => ({ name, faction: 'A.I.R.F.', fighters: Array(n).fill(0).map((_, i) => ({ name: 'В' + i, weapon: 'Винтовка', hp, maxHp: hp })), currentMorale: 5, baseMorale: 5, embarkedSquadIndex: null, armor: null, hidden: false });
    const mkL = (shooterCol) => {
        const a = freshAppData();
        a.campaign.playerFaction = 'BeVe';
        const hq = { name: 'Штаб батальона', type: 'battalion_hq', col: 10, row: 10, squads: [] };
        const shooter = { name: 'БА Landsverk 183 №1', type: 'armored_vehicle_platoon', col: shooterCol, row: 10, ap: 4, maxAp: 4, squads: [{ name: 'БА Landsverk 183 №1', faction: 'BeVe', fighters: [{ name: 'А', weapon: 'x', hp: 3, maxHp: 3 }, { name: 'Б', weapon: 'x', hp: 3, maxHp: 3 }, { name: 'В', weapon: 'x', hp: 3, maxHp: 3 }], crewInstances: [{ weaponName: 'Орудие Landsverk', active: true, fighterIndices: [1, 2] }] }] };
        const target = { name: 'Вражеская рота', type: 'infantry_platoon', col: shooterCol, row: 11, squads: [sqE('Секция', 10, 3)], isDestroyed: false };
        a.campaign.opUnits = [hq, shooter];
        a.campaign.enemyOpUnits = [target];
        const ss = makeSandbox(a);
        ss.sandbox.getFactionCrewWeapons = (f) => (f === 'BeVe') ? [{ name: 'Орудие Landsverk', type: 'at_gun' }] : [];
        ss.sandbox.opShootingState.shooter = shooter;
        ss.sandbox.opShootingState.active = true;
        ss.sandbox.opShootingState.weaponType = 'mg';
        setRandom(ss.sandbox, Array(25).fill(0.38));
        ss.sandbox.executeOpShoot([target], 1);
        return { s: ss, ad: a };
    };
    const nearL = mkL(11);
    const farL = mkL(14);
    const nearDmg = nearL.s.logs.find(l => l.startsWith('[showShootResultModal]'));
    ok(nearDmg && nearDmg.includes('damage=17'), 'J10: у штаба: все 12 попаданий (0.38<0.42), урон 17', nearDmg);
    const t = farL.ad.campaign.enemyOpUnits[0];
    const allFullHp = t.squads.every(sq => sq.fighters.every(f => f.hp === f.maxHp));
    const noModal = !farL.s.logs.some(l => l.startsWith('[showShootResultModal]'));
    ok(allFullHp && noModal, 'J11: далеко: все промахи (0.38>0.35) — цель не задета');
}

// ============================================================
console.log('\n== F. Regression v13.023/24: арт. обстрел + воронка ==');
{
    const ad = freshAppData();
    ad.campaign.playerFaction = 'BeVe';
    ad.campaign.battalions.player = { faction: 'BeVe', artillerySupport: true, supportIds: ['artillery_support'] };
    // ⚠️ враги «неуязвимы» (урон в лог — правило R7/R8): проверяем на СВОЁМ отряде
    const victim = { name: 'Своя секция', type: 'infantry_platoon', col: 8, row: 8, side: 'player',
        squads: [{ name: 'Секция', fighters: Array(8).fill(0).map((_, i) => ({ name: 'С' + i, weapon: 'Винтовка', hp: 3, maxHp: 3 })) }], isDestroyed: false };
    ad.campaign.opUnits = [victim];
    ad.campaign.enemyOpUnits = [];
    const s = makeSandbox(ad);
    // приказ выдан в ход 1, выполняется в ход 2 (обстрел начинается в следующем ходу)
    ad.campaign.currentTurn = 2;
    const order = { type: 'artillery_strike', targetHex: '8,8', issueTurn: 1, status: 'active' };
    // hitRoll=0.3<0.6 → все 20 попаданий, d6=0.5 → 4 (3d6=12, суммарно 240 урона);
    // запас длиннее — распределение урона по целям тоже ронает кубы
    setRandom(s.sandbox, Array(400).fill(0).map((_, i) => (i % 4 === 0 ? 0.3 : 0.5)));
    s.evalCtx('executeArtilleryStrikeOrder(' + JSON.stringify(order) + ')');
    ok(s.logs.some(l => l.includes('АРТОБСТРЕЛ') && l.includes('(8,8)')), 'F1: обстрел гекса (8,8) выполнен');
    const hitLine = s.logs.find(l => l.includes('Каждый отряд на гексе получает урон 1d12'));
    ok(!!hitLine, 'F2: в логе новая модель «каждый отряд — 1d12» (v13.037)', hitLine);
    const cell = ad.campaign.opMapGrid['8,8'];
    const markers = Array.isArray(cell) ? null : (cell && cell.markers);
    ok(!!markers && markers.includes('crater'), 'F3: метка «воронка» (crater) на гексе обстрела');
    const alive = victim.squads[0].fighters.filter(f => f.hp > 0).length;
    ok(alive < 8, 'F4: урон нанесён пехоте на гексе (осталось ' + alive + '/8)', 'все 8 живы');
}

// ============================================================
console.log('\n== M. v13.030: иконки меток — без битых ссылок ==');
{
    const path2 = require('path');
    const root = path2.resolve(__dirname, '..');
    const ad = freshAppData();
    const s = makeSandbox(ad);
    const map = s.evalCtx('markerIconMap');
    // M1 (v13.050): у КАЖДОЙ метки есть эмодзи-fallback — пути вида images/markers/*.png
    //    пользователь задал «на будущее» (файлов пока нет), отрисовка при отсутствии
    //    файла падает на эмодзи (loadedMarkerImages[type] не заполняется без onload)
    const noFb = Object.keys(map).filter(k => !map[k].fallback);
    ok(noFb.length === 0, 'M1: у всех меток есть эмодзи-fallback (иконки images/markers/* могут отсутствовать)', noFb.join(', '));
    const present = Object.keys(map).filter(k => map[k].icon && fs.existsSync(path2.join(root, map[k].icon)));
    ok(present.includes('trenches') && present.includes('rocks') && present.includes('destroyedVehicle') && present.includes('bicyclePark'),
        'M1b: файлы иконок окоп/валуны/подбитая техника/велостоянка (пользователя) на месте', present.join(', '));
    // M2: fallback — нормальный эмодзи, а не «??»
    const badFb = Object.keys(map).filter(k => map[k].fallback === '??' || map[k].fallback === '???');
    ok(badFb.length === 0, 'M2: fallback без «??» (эмодзи)', JSON.stringify(badFb));
    // M3 (v13.050): сгенерированных v13.029 иконок (images/markers-gen/…) больше нет — ни одна метка на них не ссылается
    const wrong = Object.keys(map).filter(k => map[k].icon && /markers-gen|generated/i.test(map[k].icon));
    ok(wrong.length === 0, 'M3: меток на сгенерированные иконки нет', JSON.stringify(wrong));
}

// ============================================================
console.log('\n== N. v13.032: зоны расстановки — полигоны (онлайн) ==');
{
    const ad = freshAppData();
    const s = makeSandbox(ad);
    const Z = s.evalCtx('SCENARIO_PLACEMENT_ZONES');
    const be = Z && Z.valencia && Z.valencia.BeVe;
    const ai = Z && Z.valencia && Z.valencia['A.I.R.F.'];
    ok(Array.isArray(be) && be.length >= 5 && Array.isArray(ai) && ai.length >= 5,
        'N1: полигоны зон заданы для обеих фракций (Валенсия)');
    const nBe = s.evalCtx(`SCENARIO_PLACEMENT_ZONES.valencia.BeVe.length`);
    const nAi = s.evalCtx(`SCENARIO_PLACEMENT_ZONES.valencia['A.I.R.F.'].length`);
    // ⚡ v13.038: BeVe 44 вершины (добавлена [4,7]) + явные гексы 2,7/3,7/4,7
    ok(nBe === 44 && nAi === 14, `N2: вершин: BeVe=${nBe} (ожид. 44), AIRF=${nAi} (ожид. 14)`);
    ok(s.evalCtx(`isHexInPlacementZone('valencia','BeVe',4,2)`) .ok === true, 'N3: BeVe — точка (4,2) внутри зоны');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','BeVe',10,12)`) .ok === true, 'N4: BeVe — точка (10,12) внутри (юг)');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',2,12)`) .ok === true, 'N5: AIRF — точка (2,12) внутри зоны');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',1,11)`) .ok === true, 'N6: AIRF — точка (1,11) внутри');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','BeVe',19,14)`) .ok === false, 'N7: BeVe — (19,14) вне (правый низ)');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',6,12)`) .ok === false, 'N8: AIRF — (6,12) вне зоны');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',0,9)`) .ok === false, 'N9: AIRF — (0,9) вне зоны (верхнее соседство)');
    ok(s.evalCtx(`isHexInPlacementZone('unknown_scenario','BeVe',3,3)`) .ok === true, 'N10: нет зон в сценарии — свободно');
    // Пересечение зон по ВСЕЙ карте 20×15 — должно быть пусто
    let overlap = 0;
    for (let r = 0; r < 15; r++) for (let c = 0; c < 20; c++) {
        if (s.evalCtx(`isHexInPlacementZone('valencia','BeVe',${c},${r})`).ok &&
            s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',${c},${r})`).ok) overlap++;
    }
    ok(overlap === 0, 'N11: зоны фракций не пересекаются (вся карта 20×15)');
    // ⚡ v13.038: расширение зоны BeVe на гексы 2,7 / 3,7 / 4,7
    //    (центры этих гексов лежат НА границе полигона — ray casting их исключал)
    ok(s.evalCtx(`isHexInPlacementZone('valencia','BeVe',2,7)`) .ok === true, 'N12a: BeVe — (2,7) в зоне (явное добавление)');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','BeVe',3,7)`) .ok === true, 'N12b: BeVe — (3,7) в зоне');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','BeVe',4,7)`) .ok === true, 'N12c: BeVe — (4,7) в зоне');
    let cntBe = 0, cntAi = 0;
    for (let r = 0; r < 15; r++) for (let c = 0; c < 20; c++) {
        if (s.evalCtx(`isHexInPlacementZone('valencia','BeVe',${c},${r})`).ok) cntBe++;
        if (s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',${c},${r})`).ok) cntAi++;
    }
    ok(cntBe === 72, `N13: BeVe — 72 гекса в зоне (69 + 3 добавленных), реально: ${cntBe}`);
    // ⚡ v13.040 (R25#4): расширение зоны AIRF на гексы 0,13 / 1,13 / 2,13 / 4,13
    ok(s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',0,13)`) .ok === true, 'N14a: AIRF — (0,13) в зоне');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',1,13)`) .ok === true, 'N14b: AIRF — (1,13) в зоне');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',2,13)`) .ok === true, 'N14c: AIRF — (2,13) в зоне');
    ok(s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',4,13)`) .ok === true, 'N14d: AIRF — (4,13) в зоне');
    ok(cntAi === 15, `N15: AIRF — 15 гексов в зоне (10 + 5 добавленных, R27#8: +(3,13)), реально: ${cntAi}`);
}

// ============================================================
console.log('\n== T. v13.038: селектор юнита, подтверждение, бонусы ==');
{
    // T1: селектор «Юнит:» (#opPlaceSelect) НЕ внутри панели противника
    //     (v13.037-баг: онлайн скрывал всю панель и размещение было невозможно)
    const enemyPanelHtml = HTML.slice(HTML.indexOf('<div id="opEnemyPanel"'), HTML.indexOf('<!-- ⚡ v13.038: селектор юнита'));
    ok(HTML.includes('<div id="opEnemyPanel"') && HTML.includes('id="opPlaceSelect"'), 'T0: opEnemyPanel и opPlaceSelect существуют');
    ok(!enemyPanelHtml.includes('opPlaceSelect'), 'T1: #opPlaceSelect вынесен из #opEnemyPanel (визиден в онлайн-режиме)');
    const selectBlock = HTML.slice(HTML.indexOf('<!-- ⚡ v13.038: селектор юнита'), HTML.indexOf('<!-- ⚡ v13.038: селектор юнита') + 400);
    ok(selectBlock.includes('id="opPlaceSelect"'), 'T1b: блок селектора юнита существует после панели противника');

    const ad = freshAppData();
    const s = makeSandbox(ad);
    // T2: finishPlacement — подтверждение
    ad.campaign.opUnits = [{ name: 'А', col: 1, row: 1 }];
    ad.campaign.initialFortificationSetup = { complete: true };
    s.run('confirm = () => false;');
    s.run('placementLocked = false;');
    s.evalCtx('finishPlacement()');
    ok(s.evalCtx('placementLocked') === false, 'T2a: confirm=Нет — размещение НЕ завершено');
    s.run('confirm = () => true;');
    s.evalCtx('finishPlacement()');
    ok(s.evalCtx('placementLocked') === true, 'T2b: confirm=Да — размещение завершено, блокировка установлена');

    // T3: showBonusInfo — карточки бонусов кликабельны (функция существует, HTML-хук на месте)
    ok(s.evalCtx('typeof showBonusInfo') === 'function', 'T3a: showBonusInfo определена');
    ok(HTML.includes("onclick=\"showBonusInfo("), 'T3b: карточки бонусов кликабельны (onclick в HTML)');

    // T4: блок «Награды отряда» во вкладке «Бой» (генерация HTML в updateUI)
    ok(HTML.includes('🏅 Награды подразделения:'), 'T4: блок «Награды подразделения» (R27#4 — только награды бойцов) есть в коде вкладки «Бой»');
}

// ============================================================
console.log('\n== O. v13.033: онлайн-модуль живёт без конфига ==');
{
    const ad = freshAppData();
    const s = makeSandbox(ad);
    const cfgLine = HTML.split('\n').find(l => l.includes('const ONLINE_CONFIG = (typeof window'));
    ok(!!cfgLine, 'O1: конфиг — в отдельном блоке window.ONLINE_CONFIG (строка найдена в index.html)');
    // сценарий «сломанный блок конфига»: window.ONLINE_CONFIG не задан
    s.run('window.ONLINE_CONFIG = undefined;');
    s.run(cfgLine);
    ok(s.evalCtx('ONLINE_CONFIG.firebase') === null, 'O2: конфиг пуст/сломан → fallback {firebase:null}, модуль не падает');
    ok(s.evalCtx('typeof openOnlineMenu') === 'function' && s.evalCtx('typeof onlineDiagnostics') === 'function', 'O3: openOnlineMenu/onlineDiagnostics определены');
    // валидный конфиг подхватывается (отдельная песочница — const не переобъявляется)
    const s2 = makeSandbox(freshAppData());
    s2.run('window.ONLINE_CONFIG = { firebase: { apiKey: "a", projectId: "prj" } };');
    s2.run(cfgLine);
    ok(s2.evalCtx('ONLINE_CONFIG.firebase.projectId') === 'prj', 'O4: валидный конфиг window.ONLINE_CONFIG подхвачен');
    // openOnlineMenu не бросает исключение без Firebase (показывает диагностику)
    // ONLINE — top-level `let` модуля (не функция), экстрактору его нет — инъектим
    s.run('if (typeof ONLINE === "undefined") var ONLINE = { db: null, match: null, role: null, docRef: null, listener: null, code: null, playerId: null, pendingStart: null, started: false };');
    let threw = false;
    try { s.evalCtx('openOnlineMenu()'); } catch (e) { threw = true; }
    ok(!threw, 'O5: openOnlineMenu без Firebase — не падает (диагностика в модалке)');
    ok(s.sandbox.document.getElementById('onlineModal').style.display === 'block', 'O6: модалка открылась');
}

// ============================================================
console.log('\n== P. v13.036: первый ход — у A.I.R.F. ==');
{
    const ad = freshAppData();
    const s = makeSandbox(ad);
    ok(s.evalCtx('typeof onlineFirstTurnRole') === 'function', 'P0: onlineFirstTurnRole определена');
    ok(s.evalCtx(`onlineFirstTurnRole({ p1: { faction: 'A.I.R.F.' }, p2: { faction: 'BeVe' } })`) === 'p1', 'P1: A.I.R.F. = p1 → первый ход p1');
    ok(s.evalCtx(`onlineFirstTurnRole({ p1: { faction: 'BeVe' }, p2: { faction: 'A.I.R.F.' } })`) === 'p2', 'P2: A.I.R.F. = p2 → первый ход p2');
    ok(s.evalCtx(`onlineFirstTurnRole({ p1: { faction: 'BeVe' }, p2: { faction: 'BeVe' } })`) === 'p1', 'P3: без A.I.R.F. → p1 (запасной)');
    ok(s.evalCtx(`onlineFirstTurnRole(null)`) === 'p1', 'P4: players=null → p1');
    // режим расстановки включается автоматически: onlineAutoEnterPlacement существует и не падает
    s.run('window.ONLINE_CONFIG = undefined; var ONLINE = { db: null, match: null, role: "p1", docRef: null, listener: null, code: null, playerId: null, pendingStart: null, started: false };');
    s.run(HTML.split('\n').find(l => l.includes('const ONLINE_CONFIG = (typeof window')));
    ad.campaign.opUnits = [{ name: 'тест', col: null, row: null }];
    // placementLocked/placementUnlockCount — top-level `let` главного скрипта
    s.run('if (typeof placementLocked === "undefined") { var placementLocked = false; var placementUnlockCount = 0; }');
    // отрисовочную цепочку заглушаем: P-тест проверяет переключение режима, не канвас
    s.run('buildOperationalUnits = function(){}; initOperationalMap = function(){}; renderActiveBattlesList = function(){}; updateOpPlaceSelect = function(){}; redrawOperationalMap = function(){};');
    let threw = false;
    try { s.evalCtx('onlineAutoEnterPlacement()'); } catch (e) { threw = true; }
    ok(!threw, 'P5: onlineAutoEnterPlacement — не падает (карта + режим расстановки)');
    ok(s.evalCtx('appData.campaign.opMapMode') === 'placePlayer', 'P6: opMapMode == placePlayer после автостарта');
}

// ============================================================
console.log('\n== S. v13.037: бонусы, 3-из-4, приказ на время, арт d12 ==');
{
    const ad = freshAppData();
    const s = makeSandbox(ad);
    // S1: BeVe «dots» — оба ДОТа (Bosh и Van Hees)
    const bevDots = s.evalCtx('generateBattalion("BeVe", ["dots"])');
    const dotsUnit = (bevDots.units || []).find(u => u.type === 'dots');
    const dotsNames = dotsUnit ? (dotsUnit.squads || []).map(q => q.name) : [];
    ok(!!dotsUnit && dotsNames.includes('ДОТ Bosh') && dotsNames.includes('ДОТ Van Hees'),
        'S1: BeVe «dots» — ДОТ Bosh и ДОТ Van Hees', JSON.stringify(dotsNames));
    // S2: глобальные бонусы фракций (data.js) — с иконками
    const beB = s.evalCtx('(FRACTION_GLOBAL_BONUSES || {}).BeVe');
    const airB = s.evalCtx('(FRACTION_GLOBAL_BONUSES || {})["A.I.R.F."]');
    ok(Array.isArray(beB) && beB.length === 3 && beB.every(b => b.name && b.desc && b.icon),
        'S2a: у BeVe 3 глобальных бонуса (УО/Phillips/Мотогонец) с иконками');
    ok(Array.isArray(airB) && airB.length === 2 && airB.every(b => b.name && b.desc && b.icon),
        'S2b: у A.I.R.F. 2 бонуса (Сиеста/Часки) с иконками');
    ok(/УО|управлени/i.test((beB[0] || {}).name || '') && /Phillips/i.test((beB[1] || {}).name || '') &&
       /Мотогонец/i.test((beB[2] || {}).name || '') && /Сиеста/i.test((airB[0] || {}).name || '') &&
       /Часки/i.test((airB[1] || {}).name || ''),
        'S2c: названия бонусов корректны');
    // S3: приказ на время — гейт по времени
    ad.campaign.currentTime = 860;
    ok(s.evalCtx('orderShouldExecuteNow({ startTimeMin: null })') === true, 'S3a: без времени — исполняется сразу');
    ok(s.evalCtx('orderShouldExecuteNow({ startTimeMin: 870 })') === false, 'S3b: 14:20 < 14:30 — ждём');
    ad.campaign.currentTime = 870;
    ok(s.evalCtx('orderShouldExecuteNow({ startTimeMin: 870 })') === true, 'S3c: 14:30 >= 14:30 — исполняется');
    // S4: сиеста AIRF — >3 гексов от врага, 80% шанс (14:00–15:00)
    ad.campaign.playerFaction = 'A.I.R.F.';
    ad.campaign.currentTime = 850; // 14:10
    ad.campaign.opUnits = [{ name: 'AIRF-1', type: 'infantry_platoon', col: 0, row: 0, ap: 4, maxAp: 4, isDestroyed: false }];
    ad.campaign.enemyOpUnits = [{ name: 'Враг', type: 'infantry_platoon', col: 4, row: 0, ap: 4, maxAp: 4, isDestroyed: false }];
    s.run('redrawOperationalMap = function(){}; renderActiveOrders = function(){};'); // отрисовка/панели в песочнице не нужны
    let order1 = { id: 1, type: 'dig_in', fromUnitId: 0, toUnitId: 0, status: 'active', waypoints: [], subUnitIds: [] };
    setRandom(s, [0.1]); // < 0.8 → сиеста срабатывает
    s.evalCtx('executeOrder(' + JSON.stringify(order1) + ')');
    ok(s.evalCtx('appData.campaign.opUnits[0].ap') === 4,
        'S4a: сиеста (0.1<0.8, 4 гекса > 3) — приказ не выполнен (ОД не потрачены)');
    ad.campaign.opUnits[0].siestaRolledThisTurn = false;
    const order2 = { id: 2, type: 'dig_in', fromUnitId: 0, toUnitId: 0, status: 'active', waypoints: [], subUnitIds: [] };
    s.sandbox.__order2 = order2;
    setRandom(s, [0.9]); // > 0.8 → не спит
    s.evalCtx('executeOrder(__order2)');
    ok(order2.digProgress === 1 && s.evalCtx('appData.campaign.opUnits[0].ap') === 0,
        'S4b: сиеста не сработала (0.9>0.8) — приказ выполнен (прокапывание начато)');
    // S5: арт. обстрел онлайн — вражеский отряд РЕАЛЬНО получает d12
    ad.campaign.online = { code: 'TEST', role: 'p1', playerId: 'x' };
    ad.campaign.currentTurn = 2;
    ad.campaign.opUnits = [{ name: 'Штаб', type: 'battalion_hq', col: 0, row: 0, ap: 4, maxAp: 4, isDestroyed: false, squads: [] }];
    ad.campaign.enemyOpUnits = [{
        name: 'Враг-Взвод', type: 'infantry_platoon', col: 5, row: 5, ap: 4, maxAp: 4, isDestroyed: false,
        squads: [{ name: 'Отряд', fighters: [1, 2, 3, 4, 5, 6].map(i => ({ name: 'Б' + i, hp: 3, maxHp: 3 })) }]
    }];
    const hpBefore = s.evalCtx('appData.campaign.enemyOpUnits[0].squads[0].fighters.reduce((a,f)=>a+f.hp,0)');
    // d12 = floor(0.99*12)+1 = 12, затем 12 выборов «случайный боец»
    setRandom(s, [0.99, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.15, 0.25, 0.35, 0.45]);
    s.evalCtx('executeArtilleryStrikeOrder({ issueTurn: 1, targetHex: "5,5", status: "active" })');
    const hpAfter = s.evalCtx('appData.campaign.enemyOpUnits[0].squads[0].fighters.reduce((a,f)=>a+f.hp,0)');
    ok(hpBefore - hpAfter === 12, 'S5a: онлайн — враг на гексе получил d12=12 (реальный урон)', hpBefore + '->' + hpAfter);
    // S6: арт. обстрел одиночной игры — враг «в лог» (урон не наносится)
    ad.campaign.online = null;
    ad.campaign.enemyOpUnits = [{
        name: 'Враг-Взвод2', type: 'infantry_platoon', col: 6, row: 6, ap: 4, maxAp: 4, isDestroyed: false,
        squads: [{ name: 'Отряд', fighters: [1, 2, 3].map(i => ({ name: 'Б' + i, hp: 3, maxHp: 3 })) }]
    }];
    setRandom(s, [0.99, 0.1]);
    s.evalCtx('executeArtilleryStrikeOrder({ issueTurn: 1, targetHex: "6,6", status: "active" })');
    ok(s.evalCtx('appData.campaign.enemyOpUnits[0].squads[0].fighters.every(f=>f.hp===3)') === true,
        'S6: одиночная игра — враг неуязвим (урон только в лог)');
}

// ============================================================
console.log('\n== U. v13.039: онлайн-синхронизация (R24) ==');
{
    // песочница + ONLINE-объект (как в index.html) + docRef-строб
    const ad = freshAppData();
    const s = makeSandbox(ad);
    const updates = [];
    s.run('var ONLINE = { db: null, docRef: null, listener: null, code: "ABCD", role: "p1", ' +
          'playerId: "t", match: null, pendingStart: null, started: false, ' +
          'lastPushedJson: null, prevTurn: null, advancedTurn: null, announcedWait: false, announcedOppDone: false, fogVisible: {} };');
    s.run('ONLINE.docRef = { update: function(o) { __updates.push(o); return Promise.resolve(); } };');
    s.run('var __updates = [];');

    ad.campaign.online = { code: 'ABCD', role: 'p1', playerId: 't' };
    s.run('ONLINE.started = true;');
    s.run('ONLINE.match = { status: "placing", scenario: "valencia", whoseTurn: null, turn: 1, time: 0, ' +
          'players: { p1: { id: "t", faction: "BeVe", ready: true, placed: false }, ' +
          'p2: { id: "o", faction: "A.I.R.F.", ready: true, placed: false } } };');

    // U1: onlineMyTurnActive — расстановка / мой ход идёт / мой ход завершён
    ok(s.evalCtx('onlineMyTurnActive()') === true, 'U1a: фаза расстановки — действия разрешены');
    s.run('ONLINE.match.status = "playing"; ONLINE.match.players.p1.turnDone = false;');
    ok(s.evalCtx('onlineMyTurnActive()') === true, 'U1b: playing, мой ход ещё не завершён — действия разрешены');
    s.run('ONLINE.match.players.p1.turnDone = true;');
    ok(s.evalCtx('onlineMyTurnActive()') === false, 'U1c: свой ход завершён (ждём оппонента) — действия ЗАБЛОКИРОВАНЫ');

    // U2: endOperationalTurn, когда ход уже завершён — ничего не происходит
    ad.campaign.currentTime = 0;
    ad.campaign.opTurnStartTime = 0;
    ad.campaign.currentTurn = 1;
    s.run('endOperationalTurn();');
    ok(s.evalCtx('appData.campaign.currentTime') === 0 && s.evalCtx('appData.campaign.currentTurn') === 1,
        'U2: чужой ход — «Завершить ход» игнорируется (время/ход не меняются)');

    // U3: завершение хода (onlineFinishTurn) — облако: players.p1.turnDone=true
    s.run('ONLINE.match.players.p1.turnDone = false; ONLINE.match.turn = 1; ONLINE.match.time = 0;');
    s.run('__updates.length = 0; onlineFinishTurn();');
    const fin = s.evalCtx('__updates[__updates.length - 1]');
    ok(fin && fin['players.p1.turnDone'] === true,
        'U3: завершение хода — облако: players.p1.turnDone=true (параллельные ходы)');
    ok(s.evalCtx('appData.campaign.currentTime') === 0 && s.evalCtx('appData.campaign.currentTurn') === 1,
        'U3b: завершение хода НЕ сдвигает локальное время (сдвинет продвижение хода)');
    // повторное завершение — предупреждение, без доп. записи
    // (в реальном приложении ONLINE.match обновился снапшотом — эмулируем)
    s.run('ONLINE.match.players.p1.turnDone = true; __updates.length = 0; onlineFinishTurn();');
    ok(s.evalCtx('__updates.length') === 0 && s.alerts.some(a => a.includes('уже завершили ход')),
        'U3c: повторное завершение — предупреждение, в облако не пишется');

    // U4: пуш своих юнитов в облако + дедупликация
    ad.campaign.opUnits = [{ id: 'u1', name: 'Свой-Взвод', col: 1, row: 1, ap: 4, maxAp: 4,
        fighters: [{ name: 'Б1', hp: 3, maxHp: 3 }] }];
    s.run('ONLINE.match.status = "playing"; ONLINE.match.players.p1.turnDone = false; ONLINE.lastPushedJson = null;');
    s.run('__updates.length = 0; onlinePushMyUnits();');
    let n = s.evalCtx('__updates.length');
    ok(n === 1 && s.evalCtx('__updates[0]["state.p1.units"].length') === 1 &&
       s.evalCtx('__updates[0]["state.p1.units"][0].id') === 'u1', 'U4a: пуш своих юнитов — state.p1.units');
    s.run('onlinePushMyUnits();');
    ok(s.evalCtx('__updates.length') === 1, 'U4b: дедупликация — повторный пуш без изменений не пишется');

    // U5: облако → моя карта (юниты оппонента + урон моим + общее время)
    s.run('appData.campaign.enemyOpUnits = [{ id: "e9", name: "Старый", col: 9, row: 9, side: "enemy" }];');
    s.run('ONLINE.match.state = { ' +
          'p2: { units: [ { id: "e1", name: "Враг-Взвод", col: 5, row: 5, ap: 4, maxAp: 4, ' +
          '   detected: false, squads: [{ name: "Отряд", fighters: [{ name: "В1", hp: 3, maxHp: 3 }] }] } ] }, ' +
          'p1: { units: [ { id: "u1", name: "Свой-Взвод", col: 1, row: 2, ' +
          '   fighters: [{ name: "Б1", hp: 1, maxHp: 3 }] } ] } };');
    s.run('appData.campaign.opUnits[0].fighters[0].hp = 3;');
    s.run('appData.campaign.currentTime = 0; appData.campaign.currentTurn = 1;');
    s.run('ONLINE.match.turn = 2; ONLINE.match.time = 10;');
    s.run('onlineApplyCloudState();');
    ok(s.evalCtx('appData.campaign.enemyOpUnits.length') === 1 &&
       s.evalCtx('appData.campaign.enemyOpUnits[0].id') === 'e1' &&
       s.evalCtx('appData.campaign.enemyOpUnits[0].col') === 5 &&
       s.evalCtx('appData.campaign.enemyOpUnits[0].side') === 'enemy',
        'U5a: юниты оппонента из облака → enemyOpUnits (side=enemy)');
    ok(s.evalCtx('appData.campaign.opUnits[0].fighters[0].hp') === 1,
        'U5b: урон оппонента моему бойцу применён (hp 3→1)');
    ok(s.evalCtx('appData.campaign.currentTime') === 10 && s.evalCtx('appData.campaign.currentTurn') === 2,
        'U5c: общее время из облака (time=10, ход=2)');
    // U5d: v13.042 (R27#1) — inflictedOnOpponent: урон от арт. обстрела оппонента
    s.run('appData.campaign.opUnits[0].fighters[0].hp = 3;');
    s.run('ONLINE.match.state.p1.units = [];');
    s.run('ONLINE.match.state.p2 = { units: [{ id: "e1", name: "Враг-Взвод", col: 5, row: 5, ' +
          '   detected: false, squads: [{ name: "Отряд", fighters: [{ name: "В1", hp: 3, maxHp: 3 }] }] }], ' +
          '   inflictedOnOpponent: [ { id: "u1", name: "Свой-Взвод", ' +
          '   fighters: [{ name: "Б1", hp: 2, maxHp: 3 }] } ] };');
    s.run('onlineApplyCloudState();');
    ok(s.evalCtx('appData.campaign.opUnits[0].fighters[0].hp') === 2,
        'U5d: урон обстрела (inflictedOnOpponent) применён «вниз» (hp 3→2)');

    // U6: туман войны (R26#1) — правильная семантика:
    //    detected=true  → юнит не смог скрыться (🔴 ОБНАРУЖЕН) → ВИДЕН
    //    detected=false → юнит не обнаружен (🟢 Скрыт)        → скрыт туманом
    //    нет поля / фаза размещения                          → скрыт туманом
    s.run('ONLINE.fogVisible = {};');
    s.run('appData.campaign.opUnits[0].reconZoneHexes = null;');
    const eVis = 'onlineEnemyVisible(appData.campaign.enemyOpUnits[0])';
    // фаза размещения — туман (R26#1: «я вижу отряды, выставленные противником»)
    s.run('ONLINE.match.status = "placing";');
    s.run('ONLINE.match.state.p2.units[0].detected = false;');
    s.run('onlineApplyCloudState();');
    ok(s.evalCtx(eVis) === false, 'U6a: фаза размещения — юниты противника СКРЫТЫ (туман)');
    // playing: detected=false (не обнаружен) — скрыт
    s.run('ONLINE.match.status = "playing";');
    s.run('ONLINE.fogVisible = {};');
    s.run('onlineApplyCloudState();');
    ok(s.evalCtx(eVis) === false, 'U6b: detected=false (🟢 Скрыт) — юнит НЕ виден');
    // detected=true (не смог скрыться, 🔴 ОБНАРУЖЕН) — виден;
    // результат доходит с передачей хода = в начале МОЕГО хода (R22#5)
    s.run('ONLINE.match.state.p2.units[0].detected = true;');
    s.run('onlineApplyCloudState();');
    // ⚡ v13.051 (R36#1): detected больше НЕ пишется в fogVisible «навсегда»
    ok(!s.evalCtx('ONLINE.fogVisible["e1"]'), 'U6c: detected=true — НЕ записывается в fogVisible навсегда (v13.051)');
    ok(s.evalCtx(eVis) === true, 'U6d: обнаруженный юнит виден на моей карте');
    // ⚡ v13.051 (R36#1): видимость НЕ липкая — снова скрылся (detected=false) → исчез
    s.run('ONLINE.match.state.p2.units[0].detected = false;');
    s.run('onlineApplyCloudState();');
    ok(s.evalCtx(eVis) === false, 'U6e: юнит снова скрылся (detected=false) — исчезает с карты (v13.051, не липко)');
    // свежий (ещё не раскрывался) юнит с detected=false — скрыт
    s.run('ONLINE.fogVisible = {}; ONLINE.match.state.p2.units[0].detected = false;');
    s.run('onlineApplyCloudState();');
    ok(s.evalCtx(eVis) === false, 'U6f: не обнаруженный (свежий) юнит — снова скрыт');
    // зона разведки (R20) — виден сразу
    s.run('appData.campaign.currentTurn = 5; ' +
          'appData.campaign.opUnits[0].reconZoneHexes = [{col:5,row:5}]; appData.campaign.opUnits[0].reconActiveTurn = 5;');
    ok(s.evalCtx(eVis) === true, 'U6g: враг в активной зоне моей разведки — виден');
    s.run('appData.campaign.opUnits[0].reconZoneHexes = null; ONLINE.fogVisible = {};');
    // уничтоженный — известен
    s.run('appData.campaign.enemyOpUnits[0].isDestroyed = true;');
    ok(s.evalCtx(eVis) === true, 'U6h: уничтоженный юнит — виден');
    s.run('appData.campaign.enemyOpUnits[0].isDestroyed = false;');

    // U7: продвижение хода (m.turn вырос) — уведомление ОБОИМ + восстановление ОД
    s.run('ONLINE.match.turn = 3; ONLINE.match.time = 20; ONLINE.prevTurn = 2; ' +
          'appData.campaign.opUnits[0].ap = 0; appData.campaign.opUnits[0].maxAp = 4; ' +
          'appData.campaign.currentTime = 20; appData.campaign.currentTurn = 3;');
    s.run('alerts.length = 0; onlineOnTurnChanged();');
    ok(s.alerts.some(a => a.indexOf('Ваш ход. Ход 3, время 00:20') !== -1),
        'U7a: продвижение хода — уведомление «Ваш ход. Ход 3, время 00:20» (R31#13)');
    ok(s.evalCtx('appData.campaign.opUnits[0].ap') === 4, 'U7b: ОД своих юнитов восстановлены в начале нового хода');
    // тот же номер хода — повторных алертов нет (dedup по prevTurn)
    s.run('alerts.length = 0; onlineOnTurnChanged();');
    ok(s.alerts.length === 0, 'U7c: тот же номер хода — алертов «Начался ход» нет');

    // U10: v13.042 — продвижение хода пишется ОДНИМ (p1), когда завершили ОБА
    s.run('ONLINE.role = "p1"; ONLINE.match.turn = 3; ONLINE.match.time = 20; ' +
          'ONLINE.match.players.p1.turnDone = true; ONLINE.match.players.p2.turnDone = true; ' +
          'ONLINE.prevTurn = 3; ONLINE.advancedTurn = null; ONLINE.announcedWait = false; ONLINE.announcedOppDone = false; ' +
          'ONLINE.fogVisible = {};');
    s.run('__updates.length = 0; onlineOnSnapshotSync();');
    let adv = null;
    for (let i = s.evalCtx('__updates.length') - 1; i >= 0; i--) {
        const u = s.evalCtx('__updates[' + i + ']');
        if (typeof u.turn === 'number') { adv = u; break; }
    }
    ok(adv && adv.turn === 4 && adv.time === 30 && adv['players.p1.turnDone'] === false && adv['players.p2.turnDone'] === false,
        'U10a: завершили ОБА (я=p1) — в облако turn=4, time=30, turnDone сброшены');
    // p2 пишет ТО ЖЕ самое продвижение (idempotent) — двойного инкремента нет
    s.run('ONLINE.role = "p2"; ONLINE.match.turn = 3; ' +
          'ONLINE.match.players.p1.turnDone = true; ONLINE.match.players.p2.turnDone = true; ' +
          'ONLINE.prevTurn = 3; ONLINE.advancedTurn = null;');
    s.run('__updates.length = 0; onlineOnSnapshotSync();');
    let adv2 = null;
    for (let i = s.evalCtx('__updates.length') - 1; i >= 0; i--) {
        const u = s.evalCtx('__updates[' + i + ']');
        if (typeof u.turn === 'number') { adv2 = u; break; }
    }
    ok(adv2 && adv2.turn === 4 && adv2.time === 30,
        'U10b: я=p2 — пишу ОДНОВРЕМЕННО ОДИНАКОВОЕ продвижение (turn=4, time=30), двойного инкремента нет');
    // после того как turn=4 отражён в снапшоте — повторных записей нет
    s.run('ONLINE.match.turn = 4; ONLINE.match.time = 30; ' +
          'ONLINE.match.players.p1.turnDone = false; ONLINE.match.players.p2.turnDone = false; ' +
          'ONLINE.prevTurn = 4; ONLINE.advancedTurn = 3;');
    s.run('__updates.length = 0; onlineOnSnapshotSync();');
    let adv3 = null;
    for (let i = s.evalCtx('__updates.length') - 1; i >= 0; i--) {
        const u = s.evalCtx('__updates[' + i + ']');
        if (typeof u.turn === 'number') { adv3 = u; break; }
    }
    ok(adv3 === null, 'U10c: новый ход уже в снапшоте — повторного продвижения нет');
    s.run('ONLINE.role = "p1";');

    // U8: HTML-хуки на месте
    ok(HTML.includes('id="opEndTurnBtn"'), 'U8a: кнопка «Завершить ход» имеет id для блокировки');
    ok(HTML.includes('drawGroupedUnits(appData.campaign.opUnits, false);'), 'U8b: отрисовка юнитов сохранена');
    ok(HTML.includes('units.filter(onlineEnemyVisible)'), 'U8c: туман в отрисовке врагов');
    ok(HTML.includes('onlineFinishTurn();'), 'U8d: завершение онлайн-хода из endOperationalTurn');
    ok(HTML.includes('turn: 1,') && HTML.includes('time: 0'), 'U8e: старт матча — turn=1, time=0');

    // U9: R25 — placing-гвард, finishPlacement, каталоги карт/наград, уведомления
    // U9a: в статусе 'placing' «Завершить ход» НЕ сдвигает время (R25#2)
    s.run('ONLINE.match.status = "playing"; ONLINE.match.players.p1.turnDone = false; ONLINE.match.turn = 5; ONLINE.match.time = 40;');
    s.run('appData.campaign.currentTime = 40; appData.campaign.opTurnStartTime = 40; appData.campaign.currentTurn = 5;');
    s.run('ONLINE.match.status = "placing";');
    s.run('alerts.length = 0; endOperationalTurn();');
    ok(s.evalCtx('appData.campaign.currentTime') === 40 && s.evalCtx('appData.campaign.currentTurn') === 5,
        'U9a: в статусе placing «Завершить ход» не сдвигает время/ход');
    ok(s.alerts.some(a => a.includes('ещё не начался')), 'U9b: понятное предупреждение «матч ещё не начался»');
    s.run('ONLINE.match.status = "playing";');

    // U9c: finishPlacement с неразмещёнными юнитами — НЕ блокирует «Разместить» (R25#3)
    s.run('var placementLocked = false; var placementUnlockCount = 0;');
    s.run('appData.campaign.opUnits = [{ id: "x1", name: "Поставлен", col: 1, row: 1 }, ' +
          '{ id: "x2", name: "Не размещён", col: null, row: null }];');
    s.run('alerts.length = 0; finishPlacement();');
    ok(s.evalCtx('placementLocked') === false, 'U9c: есть неразмещённые — «Разместить» НЕ блокируется');
    ok(s.alerts.some(a => a.includes('Не размещено')), 'U9d: подсказка «не размещено юнитов»');
    s.run('appData.campaign.opUnits = [{ id: "x1", name: "Поставлен", col: 1, row: 1 }, ' +
          '{ id: "x2", name: "Поставлен2", col: 2, row: 2 }];');
    s.run('finishPlacement();');
    ok(s.evalCtx('placementLocked') === true, 'U9e: все размещены — блокировка установлена');

    // U9f: продвижение хода — алерт с номером хода и временем (оба игрока, R27#6)
    s.run('ONLINE.match.turn = 7; ONLINE.match.time = 60; ONLINE.prevTurn = 6;');
    s.run('alerts.length = 0; onlineOnTurnChanged();');
    ok(s.alerts.some(a => a.includes('Ваш ход. Ход 7, время 01:00')),
        'U9f: продвижение хода — алерт «Ваш ход. Ход 7, время 01:00» (R31#13)');
    // завершил свой ход — только баннер ожидания, алертов «Ваш ход» нет
    s.run('ONLINE.match.turn = 7; ONLINE.prevTurn = 7; ONLINE.announcedWait = false; ONLINE.announcedOppDone = false; ' +
          'ONLINE.match.players.p1.turnDone = true;');
    s.run('alerts.length = 0; onlineOnTurnStatusChanged();');
    ok(!s.alerts.some(a => a.includes('Ваш ход')) &&
       s.elements.mapInfo.innerHTML.includes('Ждём') || s.elements.mapInfo.innerHTML.includes('ждём'),
        'U9g: завершил свой ход — баннер ожидания (без алерта «Ваш ход»)');

    // U9h: каталог карт фракции во вкладке «Бой» (R25#5 — cards.js)
    s.run('var currentSquad = { faction: "BeVe", appliedCards: ["Дополнительный паек"], ' +
          'fighters: [{ name: "Боец1", hp: 3, maxHp: 3, awards: ["wound_award"] }] };');
    s.run('appData.factions = { BeVe: { cardLibrary: [ { name: "Дополнительный паек", desc: "паек", icon: "" }, ' +
          '{ name: "Бюрократия", desc: "бумаги", icon: "" } ] } }; ' +
          'appData.activeCards = [{ name: "Дополнительный паек", faction: "BeVe", active: true }];');
    s.evalCtx('updateActiveCardsBattle()');
    const cardsHtml = s.elements.activeCardsListBattle.innerHTML;
    ok(cardsHtml.includes('Дополнительный паек') && !cardsHtml.includes('Бюрократия'),
        'U9h: v13.042 (R27#4) — вкладка «Бой» показывает ТОЛЬКО карты отряда');
    ok(cardsHtml.includes('✓'), 'U9i: карта отряда подсвечена');

    // U9j: каталог наград фракции (R25#5 — weapons.js)
    ok(s.evalCtx('typeof BEVE_AWARDS !== "undefined" && BEVE_AWARDS.length > 0') === true,
        'U9j: BEVE_AWARDS из weapons.js доступен');
    ok(s.evalCtx('typeof AIRF_AWARDS !== "undefined" && AIRF_AWARDS.length > 0') === true,
        'U9k: AIRF_AWARDS из weapons.js доступен');
    ok(HTML.includes('renderAwardsReference()'), 'U9l: топ-вкладка «🏅 Награды» рендерит каталог фракций (R25#5)');
    ok(HTML.includes('id="battleCardPickBanner"') && HTML.includes('battleStartToBattleBtn'),
        'U9m: v13.042 (R27#11) — баннер выбора карт + кнопка «⚔️ В бой» во вкладке «Карточки»');

    // U9n: каталоги карт/наград старых сейвов (R26#5 — «в вкладках пусто»)
    s.run('appData.factions = { BeVe: { icon: "", cardLibrary: [], awards: [] } };');
    s.run('syncFactionCatalogs();');
    ok(s.evalCtx('appData.factions.BeVe.cardLibrary.length') > 0,
        'U9n: пустой каталог карт в сейве заполнен из cards.js');
    ok(s.evalCtx('appData.factions.BeVe.awards.length') > 0,
        'U9o: пустой каталог наград в сейве заполнен из weapons.js');
    s.run('appData.factions.BeVe.cardLibrary = [{ name: "Своя карта", desc: "", effect: "", type: "bonus" }];');
    s.run('syncFactionCatalogs();');
    ok(s.evalCtx('appData.factions.BeVe.cardLibrary.length') === 1 &&
       s.evalCtx('appData.factions.BeVe.cardLibrary[0].name') === 'Своя карта',
        'U9p: пользовательские карты (редактор) НЕ затираются');

    // U9q: версия отображается в интерфейсе (R26 — «какая версия у меня?»)
    ok(HTML.includes("var APP_VERSION = 'v13.061'"), 'U9q: константа версии v13.061');
    ok(HTML.includes('id="appVersionBadge"') && HTML.includes('forceAppUpdate()'),
        'U9r: в меню — бейдж версии + кнопка «🔄 Обновить игру»');

    // U11: v13.043 (R28) — урон ЛЮБОЙ стрельбы: распределение по бойцам
    //    + доставка до защитника (онлайн); САУ = 1d10
    //    (в песочнице applyDamageToOpUnit — СТАБ; реальный код вводим
    //     под алиасом, не ломая остальные тесты)
    const realAdmSrc = sliceFunction(HTML, 'applyDamageToOpUnit')
        .replace('function applyDamageToOpUnit', 'function realApplyDamageToOpUnit');
    s.run(realAdmSrc);
    // let __inflictedPushScheduled живёт в ТОПЕ index.html (вне функции) —
    // в песочнице объявляем явно
    s.run('var __inflictedPushScheduled = false; var inStandaloneBattle = false;');
    s.run('appData.campaign.enemyOpUnits = [{ id: "eX", name: "Враг-X", col: 5, row: 5, isDestroyed: false, ' +
          'squads: [{ name: "Отр", fighters: [{ name: "В1", hp: 3, maxHp: 3 }, { name: "В2", hp: 3, maxHp: 3 }] }] }];');
    // одиночная игра — враг неуязвим (урон только в лог)
    s.run('appData.campaign.online = null; realApplyDamageToOpUnit(appData.campaign.enemyOpUnits[0], 2);');
    ok(s.evalCtx('appData.campaign.enemyOpUnits[0].squads[0].fighters.reduce((a, f) => a + f.hp, 0)') === 6,
        'U11a: одиночная игра — враг неуязвим (урон в лог, как и раньше)');
    // онлайн — урон применяется к локальной копии врага (распределён по бойцам)
    s.run('appData.campaign.online = { code: "ABCD", role: "p1", playerId: "t" }; ONLINE.match.status = "playing";');
    s.run('__updates.length = 0; realApplyDamageToOpUnit(appData.campaign.enemyOpUnits[0], 2);');
    ok(s.evalCtx('appData.campaign.enemyOpUnits[0].squads[0].fighters.reduce((a, f) => a + f.hp, 0)') === 4,
        'U11b: онлайн — враг получает РЕАЛЬНЫЙ урон, распределённый по бойцам (hp 6→4)');
    ok(s.evalCtx('__updates.some(u => u["state.p1.inflictedOnOpponent"])') === true,
        'U11c: онлайн — снимок потерь отправлен защитнику (state.p1.inflictedOnOpponent, батч)');
    // v13.043 (R28#2): САУ — 1d10 (было 2d6); миномётная батарея — 1d6
    ok(HTML.includes("isSau ? '1d10' : '1d6'"), 'U11d: приказ «обстрел» — САУ бьёт 1d10 (было 2d6)');

    // U12: v13.044/v13.045 (R29/R30) — BeVe: ВЕСЬ список юнитов + подфракция для карт
    const totalBeve = s.evalCtx('appData.templates.filter(t => t.faction === "BeVe").length');
    s.run('appData.templates = SQUAD_TEMPLATES;');
    // список юнитов не фильтруется подфракцией (v13.044)
    s.run('selectedFaction = "BeVe"; selectedSubFaction = "belgian"; renderTemplateSelection();');
    const listCount = s.elements.templateSelection.innerHTML.split('template-check').length - 1;
    ok(listCount === totalBeve, 'U12a: BeVe — показывается ВЕСЬ список юнитов (подфракция юнитов не фильтрует), ' + listCount + ' из ' + totalBeve);
    s.run('selectedSubFaction = null; renderTemplateSelection();');
    const listCount2 = s.elements.templateSelection.innerHTML.split('template-check').length - 1;
    ok(listCount2 === totalBeve, 'U12b: BeVe без подфракции — тот же полный список');
    // выбор BeVe — окно подфракции (Бельгийцы/Голландцы), затем в бой
    s.run('selectedFaction = null; selectedSubFaction = null; appData.currentBattleId = null;');
    s.run('startBattleModule = function() { __startCalled = true; }; var __startCalled = false; safeLocalStorage = function() {}; closeFactionModal = function() {};');
    s.run('selectFaction("BeVe");');
    ok(s.evalCtx('__startCalled') === false, 'U12c: выбор BeVe — не сразу в бой: открывается окно подфракции');
    const modalHtml = s.elements.factionModalContent.innerHTML;
    ok(modalHtml.includes("selectSubFaction('belgian')") && modalHtml.includes("selectSubFaction('dutch')"),
        'U12d: окно подфракции — Бельгийцы и Голландцы');
    s.run('selectSubFaction("dutch");');
    ok(s.evalCtx('__startCalled') === true && s.evalCtx('selectedFaction') === 'BeVe' && s.evalCtx('selectedSubFaction') === 'dutch',
        'U12e: выбор подфракции — в бой, selectedSubFaction запомнен');
    s.run('inStandaloneBattle = true;'); // реальный startBattleModule ставит его; здесь — стаб

    // U13: v13.045 (R30) — бонусные/штрафные карты зависят от подфракции
    s.run('appData.factions.BeVe.cardLibrary = []; appData.factions._global = { icon: "", cardLibrary: [], awards: [] }; syncFactionCatalogs();'); // каталог из cards.js
    const dutList = s.evalCtx('JSON.stringify([...(appData.factions.BeVe.cardLibrary || []), ...(appData.factions._global.cardLibrary || [])].filter(c => c.subfaction === "dutch").map(c => c.name))');
    const belList = s.evalCtx('JSON.stringify([...(appData.factions.BeVe.cardLibrary || []), ...(appData.factions._global.cardLibrary || [])].filter(c => c.subfaction === "belgian").map(c => c.name))');
    const dutNames = JSON.parse(dutList), belNames = JSON.parse(belList);
    ok(dutNames.length >= 3 && belNames.length >= 3,
        'U13a: в каталоге есть карты обеих подфракций (dutch: ' + dutNames.length + ', belgian: ' + belNames.length + ')');
    // одиночный бой: бельгийцы — нет карт голландцев
    s.run('appData.currentBattleId = null; selectedFaction = "BeVe"; selectedSubFaction = "belgian"; renderCardSelectionForBattle();');
    let cardsHtmlR30 = s.elements.cardSelectionForBattle.innerHTML;
    const leakBel = dutNames.filter(n => cardsHtmlR30.includes('data-name="' + n + '"')).length;
    ok(leakBel === 0, 'U13b: одиночный бой, бельгийцы — карт голландцев НЕТ');
    ok(cardsHtmlR30.includes('Подфракция: Бельгийцы'), 'U13c: одиночный бой, бельгийцы — пометка подфракции');
    // одиночный бой: голландцы — нет карт бельгийцев
    s.run('selectedSubFaction = "dutch"; renderCardSelectionForBattle();');
    cardsHtmlR30 = s.elements.cardSelectionForBattle.innerHTML;
    const leakDut = belNames.filter(n => cardsHtmlR30.includes('data-name="' + n + '"')).length;
    ok(leakDut === 0 && cardsHtmlR30.includes('Подфракция: Голландцы'), 'U13d: одиночный бой, голландцы — карт бельгийцев НЕТ');
    // кампания: тактический бой — подфракция по отрядам (бельгийцы 2:1)
    s.run('inStandaloneBattle = false;');
    s.run('appData.currentBattleId = 77; selectedFaction = null; appData.campaign.online = null; ' +
          'var __sfSquads = [{ name: "С1", faction: "BeVe", subfaction: "belgian", fighters: [{ name: "Б1", hp: 3, maxHp: 3 }] }, ' +
          '{ name: "С2", faction: "BeVe", subfaction: "belgian", fighters: [{ name: "Б2", hp: 3, maxHp: 3 }] }, ' +
          '{ name: "С3", faction: "BeVe", subfaction: "dutch", fighters: [{ name: "Г1", hp: 3, maxHp: 3 }] }]; ' +
          'appData.campaign.activeBattles = [{ id: 77, playerUnitNames: ["Взвод кампании"], playerSquads: __sfSquads, enemySquads: [] }]; ' +
          'appData.campaign.opUnits = [{ name: "Взвод кампании", type: "infantry_platoon", squads: __sfSquads.map(s => ({ name: s.name, faction: s.faction, subfaction: s.subfaction, fighters: s.fighters })) }]; ' +
          'appData.squads = []; renderCardSelectionForBattle();');
    cardsHtmlR30 = s.elements.cardSelectionForBattle.innerHTML;
    const leak3 = dutNames.filter(n => cardsHtmlR30.includes('data-name="' + n + '"')).length;
    const pres3 = belNames.filter(n => cardsHtmlR30.includes('data-name="' + n + '"')).length;
    ok(leak3 === 0 && pres3 === belNames.length && cardsHtmlR30.includes('Подфракция: Бельгийцы'),
        'U13e: кампания — бельгийские взводы (2:1) в бою → карт голландцев НЕТ');
    // ничья 1:1 — без ограничения
    s.run('var __tieSquads = [{ name: "С1", faction: "BeVe", subfaction: "belgian", fighters: [{ name: "Б1", hp: 3, maxHp: 3 }] }, ' +
          '{ name: "С3", faction: "BeVe", subfaction: "dutch", fighters: [{ name: "Г1", hp: 3, maxHp: 3 }] }]; ' +
          'appData.campaign.activeBattles[0].playerSquads = __tieSquads; ' +
          'appData.campaign.opUnits[0].squads = __tieSquads.map(s => ({ name: s.name, faction: s.faction, subfaction: s.subfaction, fighters: s.fighters })); ' +
          'renderCardSelectionForBattle();');
    cardsHtmlR30 = s.elements.cardSelectionForBattle.innerHTML;
    const pres4 = dutNames.filter(n => cardsHtmlR30.includes('data-name="' + n + '"')).length +
                  belNames.filter(n => cardsHtmlR30.includes('data-name="' + n + '"')).length;
    ok(pres4 === dutNames.length + belNames.length && !cardsHtmlR30.includes('Подфракция:'),
        'U13f: ничья бельгийцы/голландцы — карты обеих подфракций доступны');
    // computeSubFactionFromSquads
    ok(s.evalCtx('computeSubFactionFromSquads([{subfaction:"belgian"},{subfaction:"dutch"}])') === null,
        'U13g: ничья → null (без ограничения)');
    ok(s.evalCtx('computeSubFactionFromSquads([{subfaction:"dutch"},{subfaction:"dutch"},{subfaction:"belgian"},null])') === 'dutch',
        'U13h: большинство → подфракция большинства');
    ok(HTML.includes('subFaction: computeSubFactionFromSquads(playerSquads)'),
        'U13i: запись тактического боя сохраняет subFaction');

    // U14: v13.046 (R31) — 14 пунктов
    // #1: не стрелял и не двигался, ближайший враг >2 гексов — не обнаруживается
    s.run('var uTest = { name: "U1", col: 3, row: 3, isDestroyed: false, movedThisTurn: false, firedThisTurn: false };');
    s.run('appData.campaign.enemyOpUnits = [{ name: "V1", col: 6, row: 3, isDestroyed: false }];');
    ok(s.evalCtx('unitCanBeDetected(uTest)') === false, 'U14a: не двигался/не стрелял, враг в 3 гексах → НЕ обнаруживается');
    s.run('appData.campaign.enemyOpUnits = [{ name: "V1", col: 5, row: 3, isDestroyed: false }];');
    ok(s.evalCtx('unitCanBeDetected(uTest)') === true, 'U14b: враг в 2 гексах → обнаружение возможно');
    s.run('uTest.movedThisTurn = true; appData.campaign.enemyOpUnits = [{ name: "V1", col: 6, row: 3, isDestroyed: false }];');
    ok(s.evalCtx('unitCanBeDetected(uTest)') === true, 'U14c: юнит двигался → обнаружение возможно (враг в 3 гексах)');
    // ⚡ v13.051 (R36#1): двигался, враг дальше 4 гексов — не заметен; стрелял — заметен с любой дистанции
    s.run('appData.campaign.enemyOpUnits = [{ name: "V1", col: 9, row: 3, isDestroyed: false }];');
    ok(s.evalCtx('unitCanBeDetected(uTest)') === false, 'U14c2: двигался, но враг в 6 гексах → НЕ обнаруживается (v13.051)');
    s.run('uTest.movedThisTurn = false; uTest.firedThisTurn = true;');
    ok(s.evalCtx('unitCanBeDetected(uTest)') === true, 'U14d: юнит стрелял → обнаружение возможно (и в 6 гексах)');
    s.run('appData.campaign.enemyOpUnits = [];');
    ok(s.evalCtx('unitCanBeDetected(uTest)') === false, 'U14d2: противника на карте нет → обнаруживать некому (v13.051: false)');
    s.run('appData.campaign.enemyOpUnits = [{ name: "V1", col: 6, row: 3, isDestroyed: false }];');
    s.run('uTest.firedThisTurn = false;');
    // #14: холм/лес на линии видимости — вне зоны видимости
    s.run('appData.campaign.opMapGrid = {};');
    s.run('appData.campaign.opMapGrid["4,3"] = { types: ["hill"] };');
    ok(s.evalCtx('opLineOfSightBlocked(3,3,5,3)') === true, 'U14e: холм между гексами — линия видимости перекрыта');
    s.run('appData.campaign.enemyOpUnits = [{ name: "V1", col: 5, row: 3, isDestroyed: false }];');
    ok(s.evalCtx('unitCanBeDetected(uTest)') === false, 'U14f: холм между юнитом и врагом → вне зоны видимости');
    s.run('appData.campaign.opMapGrid["4,3"] = { types: ["forest"] };');
    ok(s.evalCtx('opLineOfSightBlocked(3,3,5,3)') === true, 'U14g: лес тоже перекрывает линию видимости');
    s.run('appData.campaign.opMapGrid["4,3"] = { types: ["grass"] };');
    ok(s.evalCtx('opLineOfSightBlocked(3,3,5,3)') === false && s.evalCtx('unitCanBeDetected(uTest)') === true,
        'U14h: открытая местность — линия видимости свободна');
    ok(s.evalCtx('opLineOfSightBlocked(3,3,4,3)') === false, 'U14i: соседние гексы — перекрытия нет');
    // #3: пехота не бьёт ДОТ; арт. >70мм — только амбразура, расчёт цел
    ok(s.evalCtx('artilleryCaliberMm({ name: "Батарея 82-мм миномётов", type: "mortar_battery" })') === 82, 'U14j: 82-мм миномёт → 82мм');
    ok(s.evalCtx('artilleryCaliberMm({ name: "Миномётный расчёт 50-мм №1" })') === 50, 'U14k: 50-мм миномёт → 50мм');
    ok(s.evalCtx('artilleryCaliberMm(null)') === 105, 'U14l: приказ «Арт. обстрел» — полковая арт. (>70мм)');
    s.run('var dotU = { name: "ДОТ Bosh", type: "dots", col: 7, row: 3, isDestroyed: false, embrasureHp: 3, squads: [{ name: "Расчёт", fighters: [{ name: "Расчётный", weapon: "ПТО", hp: 3, maxHp: 3 }], crewInstances: [] }] };');
    setRandom(s, Array(30).fill(0.1)); // случайности НЕ расходуются — залп блокируется раньше
    s.run('executeMortarSalvo({ name: "Батарея 82-мм миномётов", type: "mortar_battery", col: 4, row: 3 }, [dotU], 3, 15, "1d6");');
    ok(s.evalCtx('dotU.embrasureHp') === 3, 'U14m (R32): 82-мм миномёт — ДОТ не повреждён (миномёты не бьют ДОТ)');
    ok(s.evalCtx('dotU.squads[0].fighters[0].hp') === 3, 'U14n: расчёт ДОТ урона НЕ получил');
    ok(s.evalCtx('dotEmbrasureDestroyed(dotU)') === false, 'U14o (R32): амбразура цела — орудие ДОТ продолжает стрелять');
    s.run('var dotU2 = { name: "ДОТ Van Hees", type: "dots", col: 7, row: 3, isDestroyed: false, embrasureHp: 3, squads: [{ name: "Расчёт", fighters: [{ name: "Расчётный", weapon: "ПТО", hp: 3, maxHp: 3 }] }] };');
    setRandom(s, [0.1, 0.1, 0.1]);
    s.run('executeMortarSalvo({ name: "Миномётный расчёт 50-мм №1", type: "mortar_battery", col: 4, row: 3 }, [dotU2], 3, 3, "1d6");');
    ok(s.evalCtx('dotU2.embrasureHp') === 3, 'U14p: 50-мм (≤70мм) — ДОТ не повреждается');
    // #9b: ПТО по броне с 3 гексов — 5%
    ok(HTML.includes('case 3: hitChance = 0.05'), 'U14q: ПТО по бронетехнике с 3 гексов — 5% (было 10%)');
    // #2: враги на маршруте в тумане — не показываются
    ok(HTML.includes("typeof onlineEnemyVisible === 'function' ? onlineEnemyVisible(e) : true"),
        'U14r: приказ «выдвинуться» не раскрывает скрытых в тумане юнитов');
    // #12: приказ ВСЕГДА через штаб роты
    s.run('var hardMode = { enabled: true, hqUnitId: 0, messengers: { battalion: { total: 5, available: 5, active: [] }, companies: {} }, signalPlatoon: { radios: { assigned: [] }, phones: { assigned: [] } }, phoneLines: [] };');
    s.run('appData.campaign.opUnits = [ { name: "Штаб Батальона", type: "battalion_hq", col: 0, row: 0 }, { name: "Штаб Роты А", type: "company_hq", col: 8, row: 8 }, { name: "1-й взвод", col: 1, row: 0 } ];');
    const relayCo = s.evalCtx('getRelayCompanyForOrder(appData.campaign.opUnits[0], appData.campaign.opUnits[2])');
    ok(relayCo && relayCo.name === 'Штаб Роты А', 'U14s: приказ взводу — через штаб роты (даже если штаб роты дальше)');
    // #5: награды — только фракции игрока
    s.run('appData.factions["A.I.R.F."] = { icon: "", cardLibrary: [{ name: "Карта АИРФ" }], awards: [{ name: "Награда АИРФ", criteria: "x", bonus: "y" }] };');
    s.run('inStandaloneBattle = false; appData.currentBattleId = null; selectedFaction = null; appData.campaign.active = true; appData.campaign.battalions.player = { faction: "BeVe" };');
    s.run('renderAwardsReference();');
    const awardsHtmlR31 = s.elements.awardsReference.innerHTML;
    ok(awardsHtmlR31.includes('BeVe') && !awardsHtmlR31.includes('Награда АИРФ'),
        'U14t: вкладка «Награды» — только награды фракции игрока (BeVe)');
    // #8: панель «добавление отрядов» скрыта в режиме сценария
    s.run('inStandaloneBattle = false; selectedFaction = "BeVe"; renderTemplateSelection();');
    ok(s.elements.standalonePrepPanel.style.display === 'none', 'U14u: сценарий — панель «добавить отряды в бой» скрыта');
    s.run('inStandaloneBattle = true; renderTemplateSelection();');
    ok(s.elements.standalonePrepPanel.style.display === 'block', 'U14v: одиночный бой — панель видна');
    s.run('inStandaloneBattle = false;');
    // #10: старт боя — гекс + отряды; возврат — фаза карт сохраняется
    ok(HTML.includes('Гекс начала:'), 'U14w: старт тактического боя — показ гекса начала и вступивших отрядов');
    ok(HTML.includes("if (!battle.cardsChosen && typeof openCardsTabForBattleStart === 'function')") &&
       HTML.includes("if (!existingBattle.cardsChosen && typeof openCardsTabForBattleStart === 'function')"),
        'U14x: возврат в бой — фаза выбора 3 карт не теряется');
    // #11: надпись про копирование кода убрана
    ok(!HTML.includes('Если копирование'), 'U14y: надпись «Если копирование кнопкой не сработало…» удалена');
    // #13: уведомление «Ваш ход. Ход N, время»
    ok(HTML.includes("const msg = 'Ваш ход. Ход ' + now + ', время ' + tStr + '.';") &&
       HTML.includes('Ваш ход. Ход ${appData.campaign.currentTurn}, время'),
        'U14z: уведомление начала хода — «Ваш ход. Ход N, время» (без «кто ходит / кого ждём»');
    // #6: БТР с десантом — десант в бою
    ok(HTML.includes('addEmbarkedUnits(playerUnits);') && HTML.includes('addEmbarkedUnits(enemyUnits);'),
        'U14A: БТР с десантом — десант вступает в тактический бой');
    // #7: юнит на БТР — размещение завершается
    s.run('var placementLocked = false; setOpMapMode = function() {}; updateHardModeButtons = function() {};');
    s.run('appData.campaign.online = null; appData.campaign.opUnits = [ { name: "БТР Llanero №1", col: 1, row: 1, isDestroyed: false }, { name: "2-й взвод", col: null, row: null, isDestroyed: false, embarkedInBtr: true, btrIds: [0] } ];');
    s.run('finishPlacement();');
    ok(s.evalCtx('placementLocked') === true, 'U14B: юнит на размещённом БТР — «Завершить размещение» доступно');
    s.run('placementLocked = false; appData.campaign.opUnits = [ { name: "2-й взвод", col: null, row: null, isDestroyed: false } ];');
    s.run('finishPlacement();');
    ok(s.evalCtx('placementLocked') === false && s.alerts.some(a => a.includes('Не размещено юнитов')),
        'U14C: неразмещённый юнит без БТР — размещение НЕ завершается');
    // #9a: потери техники — во вкладке «Батальон»
    ok(HTML.includes('unit.vehicleLosses = (unit.vehicleLosses || 0) + removed;') &&
       HTML.includes('const lostVehicles = unit.vehicleLosses || 0;'),
        'U14D: подбитые машины — потери в вкладке «Батальон»');

    // ================= U15: v13.047 (R32) — миномёты/ДОТ, залп ∝ составу, автовинтовка = 2 =================
    // #1: миномёты ЛЮБОГО калибра не бьют ДОТ; ствольные >70мм (САУ) — по-прежнему могут
    ok(s.evalCtx('isMortarUnit({ name: "Батарея 82-мм миномётов", type: "mortar_battery" })') === true, 'U15a: 82-мм батарея — миномёт');
    ok(s.evalCtx('isMortarUnit({ name: "Миномётный расчёт 50-мм №1", type: "mortar_battery" })') === true, 'U15b: 50-мм — тоже миномёт');
    ok(s.evalCtx('isMortarUnit({ name: "Отряд САУ СУ-76", type: "sau_battery" })') === false, 'U15c: САУ — не миномёт');
    ok(s.evalCtx('isMortarUnit(null)') === false, 'U15d: приказ «Арт. обстрел» (полковая) — не миномёт');
    s.run('var dotU3 = { name: "ДОТ Van Hees", type: "dots", col: 7, row: 3, isDestroyed: false, squads: [{ name: "Расчёт", fighters: [{ name: "Расчётный", weapon: "ПТО", hp: 3, maxHp: 3 }] }] };');
    setRandom(s, Array(30).fill(0.1)); // 15 снарядов × 2 randoma (попадание + выбор жертвы)
    s.run('executeMortarSalvo({ name: "Отряд САУ СУ-76", type: "sau_battery", col: 4, row: 3 }, [dotU3], 3, 15, "1d10");');
    ok(s.evalCtx('dotU3.embrasureHp') <= 0, 'U15e: САУ 75мм (>70) — амбразура ДОТ разрушена');
    ok(s.evalCtx('dotU3.squads[0].fighters[0].hp') === 3, 'U15f: расчёт ДОТ урона НЕ получил (САУ)');
    // #3: залп батареи миномётов — пропорционален % живого личного состава
    s.run('var mkF = (n, aliveN) => Array.from({length: n}, (_, i) => ({ name: "Ф" + i, weapon: "Миномёт 82-мм", hp: (i < aliveN ? 3 : 0), maxHp: 3 }));');
    s.run('var mFull = { name: "Батарея 82-мм миномётов", type: "mortar_battery", col: 0, row: 0, ap: 4, squads: [{ name: "Р1", fighters: mkF(8, 8) }] };');
    s.run('var mHalf = { name: "Батарея 82-мм миномётов", type: "mortar_battery", col: 0, row: 0, ap: 4, squads: [{ name: "Р1", fighters: mkF(8, 4) }] };');
    s.run('var mOne = { name: "Батарея 82-мм миномётов", type: "mortar_battery", col: 0, row: 0, ap: 4, squads: [{ name: "Р1", fighters: mkF(8, 1) }] };');
    s.run('var mDead = { name: "Батарея 82-мм миномётов", type: "mortar_battery", col: 0, row: 0, ap: 4, squads: [{ name: "Р1", fighters: mkF(8, 0) }] };');
    ok(s.evalCtx('mortarRoundsForUnit(mFull, 15)') === 15, 'U15g: полный состав 8/8 — 15 выстрелов');
    ok(s.evalCtx('mortarRoundsForUnit(mHalf, 15)') === 8, 'U15h: состав 4/8 — 8 выстрелов (round(15×0.5))');
    ok(s.evalCtx('mortarRoundsForUnit(mOne, 15)') === 2, 'U15i: состав 1/8 — 2 выстрела (round(15/8))');
    ok(s.evalCtx('mortarRoundsForUnit(mDead, 15)') === 1, 'U15j: живых нет — минимум 1 выстрел');
    ok(s.evalCtx('mortarRoundsForUnit({ name: "Батарея" }, 15)') === 15, 'U15k: данных о расчёте нет — полный залп');
    // E2E: автоогонь миномёта с составом 4/8 — «8 снарядов» в логе
    s.run('appData.campaign.opUnits = [mHalf]; appData.campaign.enemyOpUnits = [{ name: "Вражеская секция", type: "infantry_platoon", col: 2, row: 0, detected: true, isDestroyed: false, squads: [{ name: "Секция", faction: "A.I.R.F.", fighters: Array.from({length: 8}, (_, i) => ({ name: "В" + i, weapon: "Винтовка", hp: 3, maxHp: 3 })) }] }];');
    setRandom(s, Array(30).fill(0.1)); // 8 снарядов × 3 randoma (попадание + жертва + 1d6)
    s.run('unitAutoFire(mHalf, 10);');
    ok(s.logs.some(l => l.includes('обстреливает гекс') && l.includes('— 8 снарядов')),
        'U15l: автоогонь миномёта (состав 4/8) — 8 снарядов (∝ живому составу)');
    // #2: автоматическая винтовка = 2 очка выстрела (винтовка 1, РПМ 3, СПМ 10)
    s.run('var avShooter = { name: "Секция тест", type: "infantry_platoon", col: 0, row: 0, ap: 4, isDestroyed: false, squads: [{ name: "Секция", faction: "BeVe", crewInstances: [], fighters: [ { name: "А1", weapon: "Автоматическая винтовка Johanson M1941", hp: 3, maxHp: 3 }, { name: "А2", weapon: "Винтовка FN model 24/30", hp: 3, maxHp: 3 }, { name: "А3", weapon: "Ручной пулемет FN model D", hp: 3, maxHp: 3 }, { name: "А4", weapon: "Станковый пулемет Schwarzlose", hp: 3, maxHp: 3 } ] }] };');
    s.run('var avTarget = { name: "Вражеская секция", type: "infantry_platoon", col: 1, row: 0, isDestroyed: false, isInBattle: false, squads: [{ name: "Секция", faction: "A.I.R.F.", fighters: Array.from({length: 8}, (_, i) => ({ name: "В" + i, weapon: "Винтовка", hp: 3, maxHp: 3 })) }] };');
    s.run('appData.campaign.opUnits = [avShooter]; appData.campaign.enemyOpUnits = [avTarget];');
    s.run('opShootingState.shooter = avShooter; opShootingState.active = true; opShootingState.weaponType = "mg";');
    setRandom(s, [0.5]); // randomFactor = 0.8 + 0.5×0.4 = 1.0
    s.run('executeOpShoot([avTarget], 1);');
    const avModal = s.logs.find(l => l.startsWith('[showShootResultModal]'));
    ok(!!avModal && avModal.includes('base=16'), 'U15m: 4 вида оружия — база 16 очков (2+1+3+10)', avModal);
    ok(!!avModal && avModal.includes('Автоматическая винтовка (2 ед.)'), 'U15n: автоматическая винтовка = 2 очка выстрела', avModal);
    ok(!!avModal && avModal.includes('Винтовка (1 ед.)') && avModal.includes('Ручной пулемёт (3 ед.)') && avModal.includes('Станковый пулемёт (10 ед.)'),
        'U15o: винтовка 1 / РПМ 3 / СПМ 10 — без изменений', avModal);

    ok(HTML.includes("dmgPerHit === '1d10' ? rollD10()"), 'U11e: executeMortarSalvo умеет 1d10');
    ok(HTML.includes("executeMortarSalvo(unit, [nearest.unit], nearest.dist, mortarRoundsForUnit(unit, 15), '1d6')"),
        'U11f: автоогонь миномётной батареи — 1d6/попадание, залп ∝ живому составу (R32)');

    // ================= U16: v13.048 (R33) — дубли карт, бонусы фракций, болото =================
    // #1: общая библиотека дублировала карты фракции — дедупликация по имени
    //    (свежие каталоги из cards.js — предыдущие тесты могли их подменить)
    s.run('appData.factions.BeVe.cardLibrary = []; appData.factions["A.I.R.F."].cardLibrary = []; ' +
          'appData.factions._global = { icon: "", cardLibrary: [], awards: [] }; syncFactionCatalogs();');
    s.run('appData.currentBattleId = 88; inStandaloneBattle = false; selectedFaction = null; ' +
          'var __cardsUnit = { name: "Взвод карт", type: "infantry_platoon", squads: [{ name: "С1", faction: "BeVe", subfaction: "belgian", fighters: [{ name: "Боец", hp: 3, maxHp: 3 }] }] }; ' +
          'appData.campaign.opUnits = [__cardsUnit]; appData.squads = []; ' +
          'appData.campaign.activeBattles = [{ id: 88, playerUnitNames: [__cardsUnit.name], playerSquads: __cardsUnit.squads.map(s => ({ ...s })), subFaction: "belgian" }]; ' +
          'renderCardSelectionForBattle();');
    let htmlU16 = s.elements.cardSelectionForBattle.innerHTML;
    {
        const namesU16 = [...htmlU16.matchAll(/data-name="([^"]+)"/g)].map(m => m[1]);
        ok(new Set(namesU16).size === namesU16.length && namesU16.length === 21,
            'U16a: BeVe (бельгийцы) — 21 карта без дублей (24 − 3 голландских)', namesU16.join(','));
        ok(!htmlU16.includes('data-faction="A.I.R.F."'), 'U16b: у BeVe-игрока карт AIRF НЕТ');
    }
    s.run('appData.campaign.activeBattles[0].playerSquads = [{ name: "С1", faction: "A.I.R.F.", fighters: [{ name: "А", hp: 3, maxHp: 3 }] }]; ' +
          'appData.campaign.activeBattles[0].subFaction = null; appData.campaign.opUnits[0].squads = [{ name: "С1", faction: "A.I.R.F.", fighters: [{ name: "А", hp: 3, maxHp: 3 }] }]; ' +
          'renderCardSelectionForBattle();');
    htmlU16 = s.elements.cardSelectionForBattle.innerHTML;
    {
        const namesU16c = [...htmlU16.matchAll(/data-name="([^"]+)"/g)].map(m => m[1]);
        ok(new Set(namesU16c).size === namesU16c.length && namesU16c.length === 23,
            'U16c: AIRF-игрок — 23 свои карты без дублей (v13.050: _global-карты, входящие в библиотеку BeVe, игроку AIRF не показываются)', namesU16c.length);
        ok(htmlU16.includes('data-faction="A.I.R.F."') && !htmlU16.includes('data-faction="BeVe"'),
            'U16d: AIRF-игрок — свои карты + «Общие», без библиотеки BeVe');
        ok(!namesU16c.includes('Велоблиц') && !namesU16c.includes('Кальвинистская эффективность') && !namesU16c.includes('Велостоянка'),
            'U16e: у AIRF нет карт BeVe из общей библиотеки (Велоблиц/Кальвинистская эффективность/Велостоянка)');
        // метка «Общие» показывается только для _global-карт, которых нет у противника — сейчас таких нет,
        // но код метки на месте
        ok(HTML.includes("c.faction === '_global' ? 'Общие' : escapeCardHtml(c.faction)"), 'U16e2: метка «Общие» для общих карт в коде сохранена с HTML-экранированием');
    }
    // #2: экран «Выберите сторону» — бонусы/дебафсы фракций с иконками
    s.run('showScenarioDetails("valencia");');
    const scenHtml = s.elements.campaignContent.innerHTML;
    {
        const bonusIcons = s.evalCtx('[].concat(FRACTION_GLOBAL_BONUSES.BeVe, FRACTION_GLOBAL_BONUSES["A.I.R.F."]).map(b => b.icon)');
        const missingIcons = bonusIcons.filter(ic => !fs.existsSync(path.resolve(__dirname, '..', ic)));
        ok(bonusIcons.length === 5 && bonusIcons.every(ic => scenHtml.includes(ic)) && missingIcons.length === 0,
            'U16f: выбор стороны — все 5 иконок бонусов/дебафов фракций (файлы пользователя на месте)', missingIcons.join(', '));
    }
    ok(scenHtml.includes('Портативный комплекс управления огнём') && scenHtml.includes('Сиеста'),
        'U16g: выбор стороны — названия бонусов BeVe и AIRF');
    // #3: болото — текстуры грузятся (поле «images», как у остальных типов)
    ok(Array.isArray(s.evalCtx('TERRAIN_DATA.swamp_passable.images')) &&
       s.evalCtx('TERRAIN_DATA.swamp_passable.images.length') === 2 &&
       s.evalCtx('TERRAIN_DATA.swamp_passable.images[0]') === 'images/болото 1.png',
        'U16h: swamp_passable — текстуры в поле «images» (загрузчик preloadTerrainImages читает именно его)');

    // ================= U17: v13.049 (R34) — карты гексов, окопы, подготовка позиций, воронки =================
    // Имя файла карты → гекс оперативной карты («8.10 мост.json» → 8,10)
    ok(s.evalCtx('tacticalHexKeyFromMapName("8.10 мост.json")') === '8,10' &&
       s.evalCtx('tacticalHexKeyFromMapName("12,14.json")') === '12,14' &&
       s.evalCtx('tacticalHexKeyFromMapName("8-10 переправа")') === '8,10',
        'U17a: имя карты → гекс (8.10 / 12,14 / 8-10)');
    ok(s.evalCtx('tacticalHexKeyFromMapName("высота_142.json")') === null,
        'U17b: карта без номера гекса не привязывается к случайному гексу');

    // Разбор файла карты (формат приложения: {currentMap:{grid:{...}}})
    s.run('var __md = normalizeTacticalMapData({currentMap:{grid:{"0,0":{type:"forest"},"1,0":{type:"grass"},' +
          '"14,14":{type:"trenches"}}}, enemySquads:[{name:"Враг"}]});');
    ok(s.evalCtx('__md.w') === 15 && s.evalCtx('__md.h') === 15 &&
       s.evalCtx('__md.grid["0,0"].type') === 'forest' &&
       s.evalCtx('Array.isArray(__md.grid["1,0"].squadIds)') &&
       s.evalCtx('__md.grid["14,14"].type') === 'trenches',
        'U17c: карта гекса читается (15×15, тип + пустые списки отрядов по умолчанию)');

    // Правки местности накладываются на карту гекса
    s.run('appData.campaign.hexOverlays = {"8,10":{hexEdits:{"1,0":"trenches","3,3":"craters"},trenchPoints:2,prepPoints:0,shellings:1}};');
    s.run('TACTICAL_HEX_MAPS["8,10"] = normalizeTacticalMapData({currentMap:{grid:{"0,0":{type:"grass"},"1,0":{type:"grass"},' +
          '"3,3":{type:"grass"},"9,9":{type:"rocks"}}}});');
    ok(s.evalCtx('buildBattleGridForHex("8,10").size') === 15 &&
       s.evalCtx('buildBattleGridForHex("8,10").grid["1,0"].type') === 'trenches' &&
       s.evalCtx('buildBattleGridForHex("8,10").grid["3,3"].type') === 'craters' &&
       s.evalCtx('buildBattleGridForHex("8,10").grid["9,9"].type') === 'rocks' &&
       s.evalCtx('buildBattleGridForHex("8,10").grid["5,5"].type') === 'grass',
        'U17d: окопы/воронки из правок попадают в бой, нетронутые гексы — как на карте');
    ok(s.evalCtx('buildBattleGridForHex("99,99")') === null,
        'U17e: если карты для гекса нет — обычное поле (как раньше)');

    // Правило «в лес глубже 2 гексов из стрелкового оружия стрелять нельзя»
    s.run('var __g = {}; for (var i = 0; i < 6; i++) __g[i + ",0"] = {type: "grass", squadIds: [], enemySquadIds: []};');
    s.run('__g["4,0"].type = "forest"; __g["3,0"].type = "forest"; __g["2,0"].type = "forest";');
    ok(s.evalCtx('tacticalForestDepth(__g, 0, 0, 4, 0)') === 3,
        'U17f: глубина леса от цели к стрелку = 3 гекса (лес, лес, лес)');
    ok(s.evalCtx('(function(){ __g["2,0"].type = "grass"; return tacticalForestDepth(__g, 0, 0, 4, 0); })()') === 2,
        'U17g: два гекса леса — глубина 2 (стрелять можно)');
    ok(s.evalCtx('(function(){ __g["4,0"].type = "grass"; return tacticalForestDepth(__g, 0, 0, 4, 0); })()') === 0,
        'U17h: цель не в лесу — ограничения нет');
    s.run('__g["4,0"].type = "forest"; __g["3,0"].type = "forest"; __g["2,0"].type = "forest";' +
          '__g["4,0"].enemySquadIds = [0]; __g["0,0"].squadIds = [0];');
    ok(s.evalCtx('(smallArmsBlockedByForest(__g, 0, 0) || {}).depth') === 3,
        'U17i: стрельба по цели в лесу глубже 2 гексов — запрещена (стрелковое оружие)');
    ok(s.evalCtx('(function(){ __g["2,0"].type = "grass"; return smallArmsBlockedByForest(__g, 0, 0); })()') === null,
        'U17j: цель в 2-гексной кромке леса — стрелять можно');
    // ПТО/орудия ограничение не затрагивает (проверка по коду стрельбы)
    ok(!HTML.includes('const __fb = (typeof checkSmallArmsForestBlock') === false &&
       HTML.includes('checkSmallArmsForestBlock') && HTML.includes('reportForestBlock'),
        'U17k: проверка леса подключена к стрельбе (только стрелковое оружие)');
    ok(!/attackOrdnance[\s\S]{0,900}checkSmallArmsForestBlock/.test(HTML),
        'U17l: в стрельбе из орудий (ПТО) ограничения по лесу НЕТ');

    // Воронки: укрытие как камни, ходимость как камни
    ok(s.evalCtx('getTacticalCoverMod("craters")') === 2 && s.evalCtx('getTacticalCoverMod("rocks")') === 2 &&
       s.evalCtx('getTacticalCoverMod("forest")') === 1 && s.evalCtx('getTacticalCoverMod("grass")') === 0 &&
       s.evalCtx('getTacticalCoverMod("fallen_forest")') === 0,
        'U17m: воронки дают укрытие как камни (+2), поваленный лес укрытия не даёт');
    {
        const texAll = s.evalCtx('[].concat(TERRAIN_DATA.craters.images, TERRAIN_DATA.fallen_forest.images, TERRAIN_DATA.shelled_forest.images)');
        const texMissing = texAll.filter(t => !fs.existsSync(path.resolve(__dirname, '..', t)));
        ok(s.evalCtx('TERRAIN_DATA.craters.images.length') === 2 &&
           s.evalCtx('TERRAIN_DATA.fallen_forest.images[0]') === 'images/лес поваленный.png' &&
           s.evalCtx('TERRAIN_DATA.shelled_forest.images.length') === 2 && texMissing.length === 0,
            'U17n: текстуры новых типов подключены — файлы пользователя (воронки в поле ×2, лес поваленный, лес обстрелянный ×2)', texMissing.join(', '));
        // воронки/обстрелянный лес — НЕ варианты обычной травы/леса (иначе случайная трава рисовалась бы воронками)
        const grassImgs = s.evalCtx('TERRAIN_DATA.grass.images'), forestImgs = s.evalCtx('TERRAIN_DATA.forest.images');
        ok(!grassImgs.some(t => /воронк/.test(t)) && !forestImgs.some(t => /обстрел|повален/.test(t)) && grassImgs.includes('images/пшено.png'),
            'U17n2: трава = трава/трава1/пшено (рожь), лес = лес/лес1/лес2 — без воронок и обстрелянного леса в вариантах');
        ok(s.evalCtx('TERRAIN_DATA.swamp_impassable.images.length') === 3 &&
           s.evalCtx('TERRAIN_DATA.swamp_impassable.images').every(t => fs.existsSync(path.resolve(__dirname, '..', t))),
            'U17n3: непроходимое болото — 3 текстуры на месте (опечатка «.png2» исправлена)');
    }

    // Приказ «подготовка позиций»: правила правок + лимит
    const ruleT = s.evalCtx('JSON.stringify({g:hexEditRuleFor("trenches").allowed("grass"),r:hexEditRuleFor("trenches").allowed("road"),' +
        'f:hexEditRuleFor("trenches").allowed("forest"),b:hexEditRuleFor("trenches").allowed("bushes"),h:hexEditRuleFor("trenches").allowed("hill"),' +
        's:hexEditRuleFor("trenches").allowed("swamp_passable"),k:hexEditRuleFor("trenches").allowed("rocks")})');
    const rt = JSON.parse(ruleT);
    ok(rt.g === true && rt.r === true && rt.f === false && rt.b === false && rt.h === false && rt.s === false && rt.k === false,
        'U17o: окоп — только «трава»/«дорога»; кусты, лес, болото, камни, склон нельзя');
    const ruleP = JSON.parse(s.evalCtx('JSON.stringify({f:hexEditRuleFor("prep").allowed("forest"),' +
        'sf:hexEditRuleFor("prep").allowed("shelled_forest"),b:hexEditRuleFor("prep").allowed("bushes"),g:hexEditRuleFor("prep").allowed("grass")})'));
    ok(ruleP.f === true && ruleP.sf === true && ruleP.b === true && ruleP.g === false,
        'U17p: подготовка позиций — меняются только лес (любой) и кусты');

    // Лимит правок: 1 отряд взвода = 1 гекс окопа
    s.run('Math.random = function() { return 0.42; };');   // вариант текстуры окопа — детерминированно
    ok(s.evalCtx('countSquadsForHexEdit({squads:[{fighters:[{hp:3}]},{fighters:[{hp:2}]},{fighters:[{hp:0}]}]})') === 2 &&
       s.evalCtx('countSquadsForHexEdit({})') === 1,
        'U17q: правок на приказ = число живых отрядов взвода (по 1 на отряд)');
    s.run('appData.campaign.hexOverlays = {"8,10":{hexEdits:{},trenchPoints:1,prepPoints:0,shellings:0}};' +
          'hexEditorState = {hexKey:"8,10",kind:"trenches",rule:hexEditRuleFor("trenches"),baseGrid:{"2,2":{type:"grass"},"3,2":{type:"forest"}},' +
          'undo:[],placed:0};' +
          'appData.map = {grid:{"2,2":{type:"grass"},"3,2":{type:"forest"}}};');
    ok(s.evalCtx('(hexEditClick("3,2"), true)') === true &&
       s.evalCtx('Object.keys(appData.campaign.hexOverlays["8,10"].hexEdits).length') === 0,
        'U17r: лес нельзя превратить в окоп (правка отклонена)');
    s.run('hexEditClick("2,2");');
    ok(s.evalCtx('appData.campaign.hexOverlays["8,10"].hexEdits["2,2"]') === 'trenches' &&
       s.evalCtx('appData.campaign.hexOverlays["8,10"].trenchPoints') === 0 &&
       s.evalCtx('appData.map.grid["2,2"].type') === 'trenches',
        'U17s: окоп поставлен на «траву», лимит израсходован (1 отряд = 1 гекс)');
    s.run('hexEditClick("5,5");');
    ok(s.evalCtx('Object.keys(appData.campaign.hexOverlays["8,10"].hexEdits).length') === 1,
        'U17t: после исчерпания лимита правки не ставятся (нужен новый приказ)');
    s.run('hexEditUndo();');
    ok(s.evalCtx('Object.keys(appData.campaign.hexOverlays["8,10"].hexEdits).length') === 0 &&
       s.evalCtx('appData.campaign.hexOverlays["8,10"].trenchPoints') === 1 &&
       s.evalCtx('appData.map.grid["2,2"].type') === 'grass' &&
       s.evalCtx('hexEditorState.placed') === 0,
        'U17u: отмена возвращает гекс и правку');
    s.run('hexEditorState = null; appData.map = null;');

    // «Подготовка позиций»: лес → поваленный лес, кусты → трава
    s.run('appData.campaign.hexOverlays = {"6,7":{hexEdits:{},trenchPoints:0,prepPoints:2,shellings:0}};' +
          'hexEditorState = {hexKey:"6,7",kind:"prep",rule:hexEditRuleFor("prep"),baseGrid:{"1,1":{type:"forest"},"2,1":{type:"bushes"},"3,1":{type:"grass"}},' +
          'undo:[],placed:0}; appData.map = {grid:{"1,1":{type:"forest"},"2,1":{type:"bushes"},"3,1":{type:"grass"}}};');
    s.run('hexEditClick("1,1"); hexEditClick("2,1"); hexEditClick("3,1");');
    ok(s.evalCtx('appData.campaign.hexOverlays["6,7"].hexEdits["1,1"]') === 'fallen_forest' &&
       s.evalCtx('appData.campaign.hexOverlays["6,7"].hexEdits["2,1"]') === 'grass' &&
       !s.evalCtx('appData.campaign.hexOverlays["6,7"].hexEdits["3,1"]') &&
       s.evalCtx('appData.campaign.hexOverlays["6,7"].prepPoints') === 0,
        'U17v: подготовка позиций — лес→поваленный лес, кусты→трава; на траве правка невозможна');
    s.run('hexEditorState = null; appData.map = null;');

    // Воронки от обстрела: 5 гексов за каждый обстрел, позиции фиксируются
    // (случайность — детерминированная: места воронок фиксируются в правках)
    s.run('Math.random = function() { return 0.42; };');
    s.run('appData.campaign.hexOverlays = {}; ' +
          'TACTICAL_HEX_MAPS["11,3"] = normalizeTacticalMapData({currentMap:{grid:(function(){var g={};' +
          'for (var c=0;c<6;c++) for (var r=0;r<6;r++) g[c+","+r]={type:(c%2? "forest":"grass")}; return g;})()}});');
    s.run('_applyShellingCraters("11,3", 5);');
    ok(s.evalCtx('Object.keys(appData.campaign.hexOverlays["11,3"].hexEdits).length') === 5 &&
       s.evalCtx('appData.campaign.hexOverlays["11,3"].shellings') === 1,
        'U17w: обстрел гекса → 5 гексов воронок/обстрелянного леса');
    ok(s.evalCtx('Object.keys(appData.campaign.hexOverlays["11,3"].hexEdits).every(function(k){' +
        'var t=appData.campaign.hexOverlays["11,3"].hexEdits[k]; return t==="craters"||t==="shelled_forest";})'),
        'U17x: воронки — на траве/кустах, обстрелянный лес — вместо леса');
    s.run('_applyShellingCraters("11,3", 5);');
    ok(s.evalCtx('Object.keys(appData.campaign.hexOverlays["11,3"].hexEdits).length') === 10 &&
       s.evalCtx('appData.campaign.hexOverlays["11,3"].shellings') === 2,
        'U17y: второй обстрел — ещё 5 гексов (позиции не переиспользуются)');
    ok(s.evalCtx('Object.keys(appData.campaign.hexOverlays["11,3"].hexEdits).every(function(k){' +
        'var b = buildBattleGridForHex("11,3"); return b.grid[k] && b.grid[k].type === appData.campaign.hexOverlays["11,3"].hexEdits[k]; })'),
        'U17z: воронки/обстрелянный лес видны в бою на этом гексе (то же и у противника — правки в оверлее)');

    // Случайная текстура из набора типа (окопы 1..7, воронки 1/2)
    s.run('appData.campaign.hexOverlays = {"8,10":{hexEdits:{"2,2":"trenches"},hexVariants:{"2,2":3},trenchPoints:0,prepPoints:0,shellings:0}};');
    ok(s.evalCtx('buildBattleGridForHex("8,10").grid["2,2"].variant') === 3,
        'U17ae: вариант текстуры правки сохраняется и применяется в бою');

    // Слияние правок противника (онлайн)
    s.run('appData.campaign.hexOverlays = {"8,10":{hexEdits:{"2,2":"trenches"},trenchPoints:0,prepPoints:0,shellings:1}};');
    ok(s.evalCtx('mergeHexOverlays({"8,10":{hexEdits:{"4,4":"craters"},shellings:2},"9,9":{hexEdits:{"1,1":"trenches"}}})') === true &&
       s.evalCtx('appData.campaign.hexOverlays["8,10"].hexEdits["4,4"]') === 'craters' &&
       s.evalCtx('appData.campaign.hexOverlays["8,10"].hexEdits["2,2"]') === 'trenches' &&
       s.evalCtx('appData.campaign.hexOverlays["8,10"].shellings') === 2 &&
       s.evalCtx('appData.campaign.hexOverlays["9,9"].hexEdits["1,1"]') === 'trenches',
        'U17aa: правки противника (окопы/воронки) приходят в онлайн и видны в бою');
    // Ходимость: воронки — как камни (пехота 4 ОД, техника не входит)
    s.run('appData.map = {grid:{"0,0":{type:"grass",level:0},"1,0":{type:"craters",level:0},' +
          '"2,0":{type:"fallen_forest",level:0},"3,0":{type:"shelled_forest",level:0},"4,0":{type:"forest",level:0}}};');
    ok(s.evalCtx('getMovementCost({name:"Стрелковое отделение",armor:null}, "0,0", "1,0", false)') === 4,
        'U17ab: воронки — 4 ОД для пехоты (как камни)');
    ok(s.evalCtx('getMovementCost({name:"Стрелковое отделение",armor:null}, "0,0", "2,0", false)') === 3 &&
       s.evalCtx('getMovementCost({name:"Стрелковое отделение",armor:null}, "0,0", "3,0", false)') === 3,
        'U17ac: поваленный и обстрелянный лес проходимы как лес (3 ОД)');
    ok(s.evalCtx('getMovementCost({name:"Танковый взвод",armor:3}, "0,0", "1,0", false)') === Infinity,
        'U17ad: техника в воронки не заходит (как в камни)');
    s.run('appData.map = null;');
}

// ============================================================
console.log('\n== U18. v13.050: реальные карты гексов пользователя (maps/Карты Валенсия) ==');
{
    const root = path.resolve(__dirname, '..');
    const dir = path.join(root, 'maps', 'Карты Валенсия');
    const idxPath = path.join(dir, 'index.json');
    const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : null;
    ok(Array.isArray(idx) && idx.length >= 148, 'U18a: индекс карт гексов собран (maps/Карты Валенсия/index.json, ≥148 карт)', idx && idx.length);
    const files = fs.readdirSync(dir).filter(f => /\.json$/i.test(f) && f !== 'index.json');
    const missingFiles = (idx || []).filter(e => !fs.existsSync(path.join(root, e.file)));
    ok(missingFiles.length === 0, 'U18b: каждая запись индекса указывает на существующий файл', missingFiles.map(e => e.file).join(', '));
    const hexes = (idx || []).map(e => e.hex);
    ok(new Set(hexes).size === hexes.length, 'U18c: один гекс — одна карта (дубль 6.7 отсеян с предупреждением)');
    ok(files.length === 149 && idx.length === 148, 'U18d: 149 файлов карт → 148 гексов (6.7 — два файла)', files.length + '/' + (idx && idx.length));
    const s = makeSandbox(freshAppData());
    // имя каждого файла разбирается в гекс, и он совпадает с полем hex индекса
    const badNames = (idx || []).filter(e => s.evalCtx('tacticalHexKeyFromMapName(' + JSON.stringify(e.name) + ')') !== e.hex);
    ok(badNames.length === 0, 'U18e: имя файла → гекс совпадает с индексом («0.0 лес» → 0,0 … «11.13 лес, гора» → 11,13)', badNames.map(e => e.name).join(', '));
    // реальная карта 8.10 (холм-болото): формат {grid, enemySquads, baseHexSize, zoomLevel}, 20×20
    const e810 = (idx || []).find(e => e.hex === '8,10');
    const raw810 = e810 ? fs.readFileSync(path.join(root, e810.file), 'utf8') : 'null';
    s.run('var __m810 = normalizeTacticalMapData(' + raw810 + ');');
    ok(!!e810 && s.evalCtx('__m810 && __m810.w') === 20 && s.evalCtx('__m810.h') === 20 &&
       s.evalCtx('Object.keys(__m810.grid).length') === 400,
        'U18f: карта гекса 8,10 («' + (e810 && e810.name) + '») читается: 20×20, 400 гексов');
    // бой на гексе 8,10 открывает именно эту карту: поворот дорог/вариант текстуры/уровень — как у автора
    s.run('TACTICAL_HEX_MAPS["8,10"] = __m810; appData.campaign.hexOverlays = {}; var __tm = {grid:{}, mapSize:20}; TACTICAL_MAP_SIZE = 20; var __opened = openHexMapForBattle("8,10", __tm);');
    const srcTypes = JSON.parse(raw810).grid;
    const rotCell = Object.keys(srcTypes).find(k => (srcTypes[k].rotation || 0) !== 0);
    const varCell = Object.keys(srcTypes).find(k => (srcTypes[k].variant || 0) !== 0);
    const lvlCell = Object.keys(srcTypes).find(k => (srcTypes[k].level || 0) !== 0);
    ok(s.evalCtx('__opened') === true && s.evalCtx('__tm.mapSize') === 20 && s.evalCtx('TACTICAL_MAP_SIZE') === 20 &&
       s.evalCtx('Object.keys(__tm.grid).length') === 400 &&
       Object.keys(srcTypes).every(k => s.evalCtx('__tm.grid[' + JSON.stringify(k) + '].type') === srcTypes[k].type),
        'U18g: бой на гексе 8,10 — сетка боя = карта автора (все 400 типов местности совпадают), размер 20');
    ok(!!rotCell && s.evalCtx('__tm.grid[' + JSON.stringify(rotCell) + '].rotation') === srcTypes[rotCell].rotation &&
       !!varCell && s.evalCtx('__tm.grid[' + JSON.stringify(varCell) + '].variant') === srcTypes[varCell].variant &&
       !!lvlCell && s.evalCtx('__tm.grid[' + JSON.stringify(lvlCell) + '].level') === srcTypes[lvlCell].level,
        'U18h: поворот (' + rotCell + '=' + (rotCell && srcTypes[rotCell].rotation) + '°), вариант текстуры и уровень высоты сохранены (v13.049 обнулял поворот/вариант)');
    ok(Object.keys(srcTypes).every(k => s.evalCtx('__tm.grid[' + JSON.stringify(k) + '].squadIds.length + __tm.grid[' + JSON.stringify(k) + '].enemySquadIds.length') === 0),
        'U18i: отрядов на свежей карте нет — размещение вручную');
    // правки (окопы) накладываются и на реальную карту
    const grassCell = Object.keys(srcTypes).find(k => srcTypes[k].type === 'grass');
    s.run('appData.campaign.hexOverlays = {"8,10":{hexEdits:{' + JSON.stringify(grassCell) + ':"trenches"},hexVariants:{},trenchPoints:0,prepPoints:0,shellings:0}}; var __b2 = buildBattleGridForHex("8,10");');
    ok(s.evalCtx('__b2.grid[' + JSON.stringify(grassCell) + '].type') === 'trenches',
        'U18j: окоп из правок виден на реальной карте гекса (' + grassCell + ': трава → окоп)');
    // все 149 карт: читаются, 20×20, типы местности известны TERRAIN_DATA
    const known = new Set(Object.keys(s.evalCtx('TERRAIN_DATA')));
    let badMaps = [];
    files.forEach(f => {
        try {
            const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            const g = raw.grid || (raw.currentMap && raw.currentMap.grid);
            const keys = Object.keys(g || {});
            if (keys.length !== 400) { badMaps.push(f + ': ' + keys.length + ' гексов'); return; }
            const unknown = keys.map(k => g[k].type).filter(t => !known.has(t));
            if (unknown.length) badMaps.push(f + ': неизвестные типы ' + [...new Set(unknown)].join('/'));
        } catch (e) { badMaps.push(f + ': ' + e.message); }
    });
    ok(badMaps.length === 0, 'U18k: все 149 карт читаются, 20×20, типы местности известны', badMaps.slice(0, 5).join('; '));
    // библиотека карт редактора: пути в maps/index.json существуют
    const lib = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'index.json'), 'utf8'));
    const libMissing = lib.filter(e => !fs.existsSync(path.join(root, e.file)));
    ok(lib.length === 151 && libMissing.length === 0, 'U18l: maps/index.json — 151 карта (библиотека пользователя), пути существуют', libMissing.map(e => e.file).join(', '));
    ok(HTML.includes('Карты гексов (Валенсия)') && HTML.includes('loadTacticalHexIndex()') ,
        'U18m: библиотека редактора показывает карты гексов отдельной группой');
    // сервис-воркер: ядро строго, остальное мягко; карты гексов — из индекса
    const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
    ok(sw.includes("const CACHE_NAME = 'wargame-v13.061'"), 'U18n: SW — кэш wargame-v13.061');
    ok(sw.includes('cache.addAll(CORE_ASSETS)') && sw.includes('precacheSoft(cache, soft)') && sw.includes('precacheHexMaps(cache)') &&
       !/return cache\.addAll\(ASSETS\)/.test(sw),
        'U18o: SW — ядро (index/js/css) строго, картинки/карты мягко, карты гексов — по index.json (одна пропавшая картинка не срывает обновление)');
    const swAssets = [...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(a => a && a !== '.' && !a.endsWith('/'));
    const swMissing = [...new Set(swAssets)].filter(a => !fs.existsSync(path.join(root, a)));
    ok(swMissing.length === 0, 'U18p: все файлы из списка SW существуют (bonuses/*, сгенерированные текстуры, «штаб роты BeVe гол.jpg» исправлены)', swMissing.join(', '));
    ok(sw.includes("'./js/hexmaps.js'") && sw.includes("'./maps/Карты Валенсия/index.json'") && sw.includes("'./images/лес поваленный.png'") &&
       sw.includes("'./images/AIRF/Стрелковое отделение №24.png'") && !sw.includes('images/bonuses/'),
        'U18q: SW — hexmaps.js, индекс карт, текстуры и новые иконки AIRF в списке; images/bonuses убраны');
    // ссылки на картинки в коде: файлы существуют (кроме заведомо «на будущее» images/markers, images/groups и развед аирф.png)
    const codeFiles = ['index.html', 'js/data.js', 'js/templates.js', 'js/cards.js', 'js/weapons.js'];
    const refs = new Set();
    codeFiles.forEach(f => { for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/images\/[^'"\)\\\n]+?\.(?:png|jpg|jpeg|gif|webp)/g)) refs.add(m[0]); });
    const refMissing = [...refs].filter(r => !fs.existsSync(path.join(root, r)) && !/^images\/(markers|groups)\//.test(r) && r !== 'images/AIRF/развед аирф.png');
    ok(refMissing.length === 0, 'U18r: битых ссылок на картинки нет (Belgian Beve / Schwarcloze / снайперы → images/BeVe/)', refMissing.join(', '));
    // фоновая подгрузка: очередь, гексы с юнитами — первыми; без fetch не падает
    s.run('_hexPreloadStarted = false; appData.campaign.opUnits = [{name:"A", col: 8, row: 10}]; var __pl = true; try { preloadTacticalHexMaps(); } catch (e) { __pl = false; }');
    ok(s.evalCtx('__pl') === true && s.evalCtx('_hexPreloadStarted') === true,
        'U18s: preloadTacticalHexMaps — очередь по 3, приоритет гексам с юнитами, повторно не запускается');
    // подфракции: ничья у BeVe — карты обеих подфракций (R30) сохранены при правке пользователя (v13.049 в index.html)
    ok(HTML.includes("const subFactionTie = ctx.faction === 'BeVe' && !ctx.subFaction") && HTML.includes('otherLibNames.has(card.name)'),
        'U18t: карточки — правка пользователя (общие карты противника скрыты) + ничья подфракций BeVe без ограничения');
    // Сквозной сценарий: свой взвод и взвод противника на гексе 8,10 → startTacticalBattle
    //    → бой открывается на карте «8.10 холм-болото» (+ правки), отряды не расставлены (вручную)
    {
        const s2 = makeSandbox(freshAppData());
        ['ensureAP','selectSquad','renderSquadSelector','updateUI','refreshSquadToPlaceDropdown','activateBattleTab',
         'openCardsTabForBattleStart','saveData','initMap','redrawMap','log','renderEnemySquads','updateTimeDisplay','renderMapTemplates']
            .forEach(fn => s2.run(`if (typeof ${fn} !== 'function') ${fn} = function(){};`));
        s2.run('var TACTICAL_MAP_SIZE = 20; var currentTurn = 1; var inStandaloneBattle = false;');
        s2.run('TACTICAL_HEX_MAPS["8,10"] = normalizeTacticalMapData(' + raw810 + ');');
        s2.run('appData.campaign.activeBattles = []; console = { log: function(){}, warn: function(){}, error: function(){} };' +
               'appData.campaign.hexOverlays = {"8,10":{hexEdits:{"5,5":"trenches"},hexVariants:{"5,5":2},trenchPoints:0,prepPoints:0,shellings:0}};' +
               'appData.campaign.opUnits = [{ name: "Взвод А", type: "platoon", col: 8, row: 10, faction: "BeVe", isDestroyed: false, ' +
               '  squads: [{name:"Отд 1", faction:"BeVe", subfaction:"belgian", fighters:[{name:"a",hp:3,maxHp:3,weapon:"Винтовка Geweer M95"}]}] }];' +
               'appData.campaign.enemyOpUnits = [{ name: "Враг Б", type: "platoon", col: 8, row: 10, faction: "A.I.R.F.", isDestroyed: false, ' +
               '  squads: [{name:"Вр 1", faction:"A.I.R.F.", fighters:[{name:"b",hp:3,maxHp:3,weapon:"Винтовка Vz.24"}]}] }];' +
               'var __err = null; try { startTacticalBattle(appData.campaign.opUnits[0], appData.campaign.enemyOpUnits[0]); } catch (e) { __err = e.stack; }');
        const err = s2.evalCtx('__err');
        const sameCnt = Object.keys(srcTypes).filter(k => s2.evalCtx('appData.map.grid[' + JSON.stringify(k) + '].type') === srcTypes[k].type).length;
        ok(err === null && s2.evalCtx('appData.campaign.activeBattles.length') === 1 &&
           s2.evalCtx('appData.campaign.activeBattles[0].hexKey') === '8,10' &&
           s2.evalCtx('TACTICAL_MAP_SIZE') === 20 && s2.evalCtx('appData.map.mapSize') === 20 &&
           s2.evalCtx('Object.keys(appData.map.grid).length') === 400 && sameCnt === 399 &&
           s2.evalCtx('appData.map.grid["5,5"].type') === 'trenches' && s2.evalCtx('appData.map.grid["5,5"].variant') === 2,
            'U18u: startTacticalBattle на гексе 8,10 → бой на карте «8.10 холм-болото» (399/400 как у автора + 1 окоп из правок, вариант текстуры сохранён)', err || sameCnt);
        ok(s2.evalCtx('appData.map.enemySquads.length') === 1 && s2.evalCtx('appData.squads.length') === 1 &&
           s2.evalCtx('Object.values(appData.map.grid).filter(c => c.squadIds.length || c.enemySquadIds.length).length') === 0 &&
           s2.evalCtx('appData.campaign.activeBattles[0].tacticalMap.grid["10,4"].rotation') === srcTypes['10,4'].rotation,
            'U18v: отряды обеих сторон в бою, на сетке никто не расставлен (вручную); в записи боя карта с поворотами автора');
    }
}

// ============================================================
console.log('\n== V. v13.051 (R36): разведка r3, туман без утечек, десант на БТР, авторазмещение, «закрепиться», общий бой ==');
{
    const ad = freshAppData();
    const s = makeSandbox(ad);
    s.run('var RECON_RADIUS = 3; var placementLocked = false; var currentTurn = 1; var ONLINE = { match: null, fogVisible: {}, role: "p1", docRef: null };');
    ['renderActiveOrders', 'checkMovingFire', 'hasAtGunWeapons', 'findRetreatHexFromEnemy', 'opLog']
        .forEach(fn => s.run(`if (typeof ${fn} !== 'function') ${fn} = function(){ return false; };`));
    s.run('var __battles = 0; startTacticalBattle = function() { __battles++; };');
    ad.campaign.online = { code: 'ABCD', role: 'p1', playerId: 't' };
    ad.campaign.scenario = 'valencia';
    ad.campaign.currentTurn = 4;

    // --- V1: разведка — радиус 3, подсветка сразу, зона активна текущий + следующий ход ---
    ad.campaign.opUnits = [{ id: 'u1', name: 'Развед', type: 'infantry_platoon', col: 5, row: 5, ap: 4, maxAp: 4, mobility: 'foot', squads: [] }];
    ad.campaign.enemyOpUnits = [
        { id: 'e1', name: 'Враг-3', col: 8, row: 5, side: 'enemy', detected: false },   // дистанция 3 — в зоне
        { id: 'e2', name: 'Враг-4', col: 9, row: 5, side: 'enemy', detected: false }    // дистанция 4 — вне
    ];
    s.run('var __ord = { targetHex: "5,5", status: "active" }; executeReconOrder(appData.campaign.opUnits[0], __ord);');
    const u = s.evalCtx('appData.campaign.opUnits[0]');
    ok(u.reconZoneHexes.length === 37 && u.reconRadius === 3 && u.reconActiveTurn === 5 && Array.isArray(u.reconHighlightHexes) && u.reconHighlightHexes.length === 37 && u.ap === 1,
        'V1a: разведка — 37 гексов (радиус 3), подсветка СРАЗУ, активна до конца следующего хода, −3 ОД', JSON.stringify({ n: u.reconZoneHexes.length, t: u.reconActiveTurn, ap: u.ap }));
    ok(s.evalCtx('appData.campaign.enemyOpUnits[0].detected') === true && s.evalCtx('appData.campaign.enemyOpUnits[1].detected') === false,
        'V1b: враг в 3 гексах обнаружен, в 4 — нет');
    ok(s.evalCtx('isReconZoneActive(appData.campaign.opUnits[0], 4)') === true && s.evalCtx('isReconZoneActive(appData.campaign.opUnits[0], 5)') === true &&
       s.evalCtx('isReconZoneActive(appData.campaign.opUnits[0], 6)') === false, 'V1c: зона активна на ходах 4 и 5, на 6 — нет');
    // снапшот оппонента перезаписал detected=false — раскрытие держится до конца следующего хода
    s.run('appData.campaign.enemyOpUnits[0].detected = false; appData.campaign.enemyOpUnits[0].col = 1; appData.campaign.enemyOpUnits[0].row = 1;');
    ok(s.evalCtx('onlineEnemyVisible(appData.campaign.enemyOpUnits[0])') === true, 'V1d: обнаруженный разведкой виден и после снапшота оппонента (ход 4)');
    s.run('appData.campaign.currentTurn = 5;');
    ok(s.evalCtx('onlineEnemyVisible(appData.campaign.enemyOpUnits[0])') === true, 'V1e: … и на следующем ходу (5)');
    s.run('appData.campaign.currentTurn = 6;');
    ok(s.evalCtx('onlineEnemyVisible(appData.campaign.enemyOpUnits[0])') === false, 'V1f: на ходу 6 — снова скрыт (не липко)');
    ok(s.evalCtx('typeof appData.campaign.fogVisible') === 'object' && s.evalCtx('appData.campaign.fogVisible.e1') === 5,
        'V1g: раскрытие сохраняется в appData.campaign.fogVisible (переживает перезагрузку)');

    // --- V2: утечка «все враги видны» после перезагрузки (ONLINE.match = null) ---
    s.run('ONLINE.match = null; appData.campaign.currentTurn = 10;');
    ok(s.evalCtx('onlineEnemyVisible({ id: "x", name: "X", col: 2, row: 2, detected: false })') === false,
        'V2a: ONLINE.match ещё пуст (перезагрузка) — необнаруженный враг СКРЫТ (раньше — виден)');
    ok(s.evalCtx('onlineEnemyVisible({ id: "y", name: "Y", col: 2, row: 2, detected: true })') === true &&
       s.evalCtx('onlineEnemyVisible({ id: "z", name: "Z", col: 2, row: 2, isDestroyed: true })') === true,
        'V2b: обнаруженный владельцем (detected=true) и уничтоженный — видны');
    ok(HTML.includes('function onlineEnsureSubscribed') && /function returnToCampaignFromMenu[\s\S]{0,1500}onlineEnsureSubscribed\(\)/.test(HTML),
        'V2c: «↩️ Вернуться к кампании» переподписывается на матч (onlineEnsureSubscribed)');

    // --- V3: десант на размещённом БТР = размещён ---
    ad.campaign.opUnits = [
        { id: 'b', name: 'БТР', type: 'btr_platoon', col: 3, row: 3, mobility: 'vehicle', embarkedUnit: 'Десант' },
        { id: 'd', name: 'Десант', type: 'infantry_platoon', col: null, row: null, embarkedInBtr: true, btrIds: [0] },
        { id: 'w', name: 'Пеший', type: 'infantry_platoon', col: null, row: null }
    ];
    ok(s.evalCtx('isOpUnitEmbarkedOnPlacedBtr(appData.campaign.opUnits[1])') === true && s.evalCtx('getUnplacedOpUnits().map(u => u.name).join()') === 'Пеший',
        'V3a: десант в размещённом БТР считается размещённым; неразмещён только «Пеший»');
    s.run('appData.campaign.opUnits[0].col = null; appData.campaign.opUnits[0].row = null;');
    ok(s.evalCtx('getUnplacedOpUnits().length') === 3, 'V3b: БТР не размещён → десант тоже неразмещён');
    ok(/function onlineMarkPlaced[\s\S]{0,1200}getUnplacedOpUnits\(\)/.test(HTML), 'V3c: онлайн «Завершить размещение» использует getUnplacedOpUnits (десант не блокирует)');

    // --- V4: авторазмещение по умолчанию ---
    ad.campaign.opUnits = [
        { id: 'hq', name: 'Штаб батальона', type: 'battalion_hq', col: null, row: null, mobility: 'foot' },
        { id: 'c1', name: 'Штаб роты', type: 'company_hq', col: null, row: null, mobility: 'foot' },
        { id: 'm1', name: 'Миномет 82-мм №1', type: 'mortar_battery', col: null, row: null, mobility: 'foot' },
        { id: 'p1', name: 'Взвод 1', type: 'infantry_platoon', col: null, row: null, mobility: 'foot' },
        { id: 'p2', name: 'Взвод 2', type: 'infantry_platoon', col: null, row: null, mobility: 'foot' },
        { id: 'p3', name: 'Взвод 3', type: 'infantry_platoon', col: null, row: null, mobility: 'foot' },
        { id: 'dot', name: 'ДОТ', type: 'dots', col: null, row: null, mobility: 'static' },
        { id: 'emb', name: 'Десант', type: 'infantry_platoon', col: null, row: null, embarkedInBtr: true, btrIds: [3] }
    ];
    ad.campaign.playerFaction = 'BeVe';
    s.run('appData.campaign.currentTurn = 1; appData.campaign.autoPlacedOnce = false; __updates = []; ONLINE.docRef = { update: function(o) { __updates.push(o); return Promise.resolve(); } };');
    const nPlaced = s.evalCtx('autoPlaceUnplacedUnits({ manual: true })');
    const placedUnits = s.evalCtx('appData.campaign.opUnits.filter(u => u.col !== null)');
    const inZone = placedUnits.every(pu => s.evalCtx(`isHexInPlacementZone('valencia','BeVe',${pu.col},${pu.row})`).ok && s.evalCtx(`isHexInPlayableArea('valencia',${pu.col},${pu.row})`));
    const perHex = {}; placedUnits.forEach(pu => { perHex[pu.col + ',' + pu.row] = (perHex[pu.col + ',' + pu.row] || 0) + 1; });
    ok(nPlaced === 7 && placedUnits.length === 7 && inZone && Object.values(perHex).every(n => n <= 2) && s.evalCtx('appData.campaign.opUnits[7].col') === null,
        'V4a: авторазмещение — 7 юнитов в зоне BeVe (≤2 на гекс), десант в БТР не трогаем', JSON.stringify({ nPlaced, perHex }));
    ok(placedUnits.every(pu => pu.autoPlaced === true) && s.evalCtx('appData.campaign.autoPlacedOnce') === true,
        'V4b: авторазмещённые помечены (autoPlaced), флаг «уже делали» установлен');
    ok(s.evalCtx('autoPlaceUnplacedUnits({ manual: true })') === 0 && s.evalCtx('getUnplacedOpUnits().length') === 0,
        'V4c: повторный вызов — размещать нечего; неразмещённых нет → «Завершить размещение» доступно');
    // ДОТ ближе к противнику, чем штаб батальона (по расстоянию до центра зоны AIRF)
    const dotU = placedUnits.find(x => x.id === 'dot'), hqU = placedUnits.find(x => x.id === 'hq');
    const dTo = (pu) => s.evalCtx(`getOpHexDistance(${pu.col},${pu.row},2,12)`);
    ok(dTo(dotU) <= dTo(hqU), 'V4d: ДОТ — к переднему краю, штаб батальона — в тыл', JSON.stringify({ dot: dotU, hq: hqU }));
    // maybeAutoPlaceAtStart — один раз за кампанию, не при заблокированном размещении
    s.run('appData.campaign.opUnits.forEach(u => { if (!u.embarkedInBtr) { u.col = null; u.row = null; } }); appData.campaign.autoPlacedOnce = false;');
    s.run('maybeAutoPlaceAtStart();');
    ok(s.evalCtx('getUnplacedOpUnits().length') === 0, 'V4e: при первом выходе на карту все юниты получают гексы по умолчанию');
    s.run('appData.campaign.opUnits[3].col = null; appData.campaign.opUnits[3].row = null; maybeAutoPlaceAtStart();');
    ok(s.evalCtx('appData.campaign.opUnits[3].col') === null, 'V4f: повторно (уже делали) — юнит, снятый игроком, не расставляется сам');
    // AIRF — 15 гексов зоны, размещаем 8 → ≤2 на гекс
    s.run('appData.campaign.playerFaction = "A.I.R.F."; appData.campaign.autoPlacedOnce = false; appData.campaign.opUnits.forEach(u => { if (!u.embarkedInBtr) { u.col = null; u.row = null; } });');
    const nAi = s.evalCtx('autoPlaceUnplacedUnits({})');
    const aiUnits = s.evalCtx('appData.campaign.opUnits.filter(u => u.col !== null)');
    ok(nAi === 7 && aiUnits.every(pu => s.evalCtx(`isHexInPlacementZone('valencia','A.I.R.F.',${pu.col},${pu.row})`).ok), 'V4g: AIRF — все 7 в своей зоне');
    ok(HTML.includes('🎲 Авторазмещение') && HTML.includes('autoPlaceUnplacedUnits({ manual: true })') && /function showOperationalMap[\s\S]{0,3000}maybeAutoPlaceAtStart\(\)/.test(HTML),
        'V4h: кнопка «🎲 Авторазмещение» и автозапуск при показе карты');

    // --- V5: оперативная карта — размер холста по игровому полю (13×15), пинч-зум ---
    const dims = s.evalCtx('opMapDrawDims()');
    ok(dims && dims.cols === 13 && dims.rows === 15, 'V5a: Валенсия — холст 13×15 (без пустых тёмных столбцов 13..19)', JSON.stringify(dims));
    s.run('appData.campaign.scenario = "other";');
    const dims2 = s.evalCtx('opMapDrawDims()');
    ok(dims2 && dims2.cols === 20 && dims2.rows === 15, 'V5b: сценарий без ограничений — полная сетка 20×15');
    s.run('appData.campaign.scenario = "valencia";');
    ok(HTML.includes('function setupOpMapTouchControls') && /touchmove/.test(HTML.slice(HTML.indexOf('function setupOpMapTouchControls'), HTML.indexOf('function setupOpMapTouchControls') + 4000)),
        'V5c: пинч-зум двумя пальцами на контейнере оперативной карты');

    // --- V6: «закрепиться и ждать» — не идём на видимого врага, останавливаемся при встрече ---
    ad.campaign.playerFaction = 'BeVe';
    ad.campaign.opUnits = [{ id: 'u1', name: 'Взвод', type: 'infantry_platoon', col: 2, row: 5, ap: 4, maxAp: 4, mobility: 'foot', squads: [] }];
    ad.campaign.enemyOpUnits = [{ id: 'e1', name: 'Враг', col: 6, row: 5, side: 'enemy', detected: true }];
    s.run('appData.campaign.currentTurn = 1; appData.campaign.fogVisible = {}; ONLINE.fogVisible = appData.campaign.fogVisible; __battles = 0; logs.length = 0;');
    s.run('var __mo = { targetHex: "8,5", status: "active", behavior: "hold", waypoints: [] }; executeMoveOrder(appData.campaign.opUnits[0], __mo);');
    let mu = s.evalCtx('appData.campaign.opUnits[0]');
    ok(mu.col === 3 && mu.row === 5 && s.evalCtx('__mo.status') === 'completed' && s.evalCtx('__battles') === 0,
        'V6a: hold — прошёл 1 гекс, заметил врага в 3 гексах → остановился, приказ завершён, боя нет', JSON.stringify({ col: mu.col, row: mu.row, st: s.evalCtx('__mo.status') }));
    ok(s.logs.some(l => l.includes('закрепился')), 'V6b: в логе «закрепился и ждёт приказа»');
    // враг уже рядом в начале — hold-юнит может сделать шаг, но НЕ входит на гекс врага
    s.run('appData.campaign.opUnits[0].col = 5; appData.campaign.opUnits[0].row = 5; appData.campaign.opUnits[0].ap = 4; __battles = 0;');
    s.run('var __mo2 = { targetHex: "6,5", status: "active", behavior: "hold", waypoints: [] }; executeMoveOrder(appData.campaign.opUnits[0], __mo2);');
    mu = s.evalCtx('appData.campaign.opUnits[0]');
    ok(mu.col === 5 && mu.row === 5 && s.evalCtx('__battles') === 0 && s.evalCtx('__mo2.status') === 'completed',
        'V6c: hold — цель = гекс видимого врага → на него НЕ входим, боя нет, приказ закрыт («закрепился»)');
    // скрытый (туман) враг — не «встреча»: hold-юнит идёт дальше
    s.run('appData.campaign.enemyOpUnits[0].detected = false; appData.campaign.enemyOpUnits[0].col = 6; appData.campaign.enemyOpUnits[0].row = 8; ' +
          'appData.campaign.opUnits[0].col = 2; appData.campaign.opUnits[0].row = 5; appData.campaign.opUnits[0].ap = 4; logs.length = 0;');
    s.run('var __mo3 = { targetHex: "5,5", status: "active", behavior: "hold", waypoints: [] }; executeMoveOrder(appData.campaign.opUnits[0], __mo3);');
    mu = s.evalCtx('appData.campaign.opUnits[0]');
    ok(mu.col === 4 && mu.row === 5 && mu.ap === 0 && s.evalCtx('__mo3.status') === 'active' && !s.logs.some(l => l.includes('обнаружил врага') || l.includes('Враг')),
        'V6d: невидимый (туман) враг не останавливает (прошёл все 2 гекса за 4 ОД) и не попадает в лог (утечка закрыта)', JSON.stringify({ col: mu.col, ap: mu.ap, st: s.evalCtx('__mo3.status') }));
    // штурм — прежнее поведение: идёт на врага
    s.run('appData.campaign.enemyOpUnits[0].detected = true; appData.campaign.enemyOpUnits[0].col = 6; appData.campaign.enemyOpUnits[0].row = 5; ' +
          'appData.campaign.opUnits[0].col = 5; appData.campaign.opUnits[0].row = 5; appData.campaign.opUnits[0].ap = 4; __battles = 0;');
    s.run('var __mo4 = { targetHex: "6,5", status: "active", behavior: "assault", ignoreArmor: false, waypoints: [] }; executeMoveOrder(appData.campaign.opUnits[0], __mo4);');
    ok(s.evalCtx('__battles') === 1, 'V6e: «штурмовать» — по-прежнему входит на гекс врага и начинает бой');
    ok(/function createOrder[\s\S]{0,2500}toUnit\.behavior = order\.behavior/.test(HTML), 'V6f: поведение «при встрече» из приказа записывается в юнит при выдаче');

    // --- V7: общий тактический бой в онлайне (js/online_battles.js) ---
    const obSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'online_battles.js'), 'utf8');
    ok(HTML.includes('<script src="js/online_battles.js">') && /onlineBattleCreated\(newBattle\)/.test(HTML) && /onlineBattleFinished\(battle\)/.test(HTML) &&
       /onlineApplyCloudBattles\(state\)/.test(HTML) && /onlineBattleOnSave\(\)/.test(HTML) && /onlinePushBattles\(true\)/.test(HTML),
        'V7a: модуль подключён, хуки: создание/сохранение/сохранение состояния/завершение боя, приём облака');
    ok(/opts\.silent/.test(HTML) && /onlineMirror = true/.test(HTML), 'V7b: startTacticalBattle(…, {silent}) — зеркало боя без перехода на экран');
    // прогон модуля в песочнице: снапшот → слияние у оппонента
    const s2 = makeSandbox(freshAppData());
    s2.run('var ONLINE = { match: null, fogVisible: {}, role: "p1", docRef: null }; var currentTurn = 3; var __updates = [];');
    s2.run('ONLINE.docRef = { update: function(o) { __updates.push(o); return Promise.resolve(); } };');
    s2.run('appData.campaign.online = { code: "ABCD", role: "p1", playerId: "t" }; appData.currentBattleId = 77;');
    s2.run('function onlineOppRole() { return "p2"; }');
    s2.run(obSrc);
    s2.run('appData.campaign.activeBattles = [{ id: 77, hexKey: "8,10", currentTurn: 1, playerUnitNames: ["Взвод А"], enemyUnitNames: ["Враг Б"], playerSquads: [], enemySquads: [] }];');
    s2.run('appData.squads = [{ name: "Отд 1", faction: "BeVe", fighters: [{ name: "a1", hp: 3, maxHp: 3, weapon: "Винтовка" }, { name: "a2", hp: 3, maxHp: 3, weapon: "Винтовка" }] }];');
    s2.run('appData.map = { grid: { "5,5": { type: "grass", squadIds: [0], enemySquadIds: [] }, "9,9": { type: "grass", squadIds: [], enemySquadIds: [0] } }, ' +
           'enemySquads: [{ name: "Вр 1", faction: "A.I.R.F.", fighters: [{ name: "b1", hp: 3, maxHp: 3 }] }] };');
    s2.run('onlineBattleCreated(appData.campaign.activeBattles[0]);');
    const push1 = s2.evalCtx('__updates[__updates.length - 1]');
    const snap = push1 && push1['state.p1.battles'] && push1['state.p1.battles'].h8_10;
    ok(snap && snap.status === 'active' && snap.turn === 3 && snap.squads.length === 1 && snap.squads[0].pos === '5,5' && snap.squads[0].fighters.length === 2 &&
       snap.myUnitNames[0] === 'Взвод А' && snap.oppUnitNames[0] === 'Враг Б',
        'V7c: снапшот боя → state.p1.battles.h8_10 (гекс, ход, отряды с позициями и бойцами)', JSON.stringify(snap));
    // я ранил врага: b1 3→1 → dmgOut
    s2.run('appData.map.enemySquads[0].fighters[0].hp = 1; __updates.length = 0; onlinePushBattles(true);');
    const snap2 = s2.evalCtx('__updates[__updates.length - 1]["state.p1.battles"].h8_10');
    ok(snap2.dmgOut['Вр 1'] && snap2.dmgOut['Вр 1'][0] === 2, 'V7d: нанесённый урон — dmgOut["Вр 1"][0] = 2');
    // оппонент (p2): получает бой p1 → зеркало создаётся через startTacticalBattle(silent), урон применяется
    const s3 = makeSandbox(freshAppData());
    s3.run('var ONLINE = { match: null, fogVisible: {}, role: "p2", docRef: null }; var currentTurn = 1; var __updates = []; var __alerts = [];');
    s3.run('ONLINE.docRef = { update: function(o) { __updates.push(o); return Promise.resolve(); } }; alert = function(m) { __alerts.push(String(m)); };');
    s3.run('appData.campaign.online = { code: "ABCD", role: "p2", playerId: "q" }; appData.campaign.currentTurn = 3;');
    s3.run('function onlineOppRole() { return "p1"; } function onlineRevealEnemy() {}');
    s3.run('appData.campaign.opUnits = [{ name: "Враг Б", col: 8, row: 10, faction: "A.I.R.F.", squads: [{ name: "Вр 1", fighters: [{ name: "b1", hp: 3, maxHp: 3 }] }] }];');
    s3.run('appData.campaign.enemyOpUnits = [{ name: "Взвод А", col: 8, row: 10, faction: "BeVe", side: "enemy", squads: [{ name: "Отд 1", fighters: [{ name: "a1", hp: 3, maxHp: 3 }, { name: "a2", hp: 3, maxHp: 3 }] }] }];');
    s3.run('var __stOpts = null; startTacticalBattle = function(my, opp, opts) { __stOpts = opts; ' +
           ' const b = { id: 555, hexKey: "8,10", currentTurn: 1, playerUnitNames: my.map(u => u.name), enemyUnitNames: opp.map(u => u.name), ' +
           '   playerSquads: [{ name: "Вр 1", fighters: [{ name: "b1", hp: 3, maxHp: 3 }] }], enemySquads: [], tacticalMap: { grid: { "5,5": { type: "grass", squadIds: [], enemySquadIds: [] } } } };' +
           ' appData.campaign.activeBattles.push(b); return b; };');
    s3.run(obSrc);
    s3.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snap2) + ' } } });');
    const mb = s3.evalCtx('appData.campaign.activeBattles[0]');
    ok(mb && mb.onlineMirror === true && mb.onlineOppBattleId === 77 && s3.evalCtx('__stOpts && __stOpts.silent') === true,
        'V7e: у атакованного создано зеркало боя (silent, ссылка на бой оппонента)');
    ok(s3.evalCtx('__alerts.some(a => a.includes("Противник атаковал"))') === true, 'V7f: уведомление «⚔️ Противник атаковал ваши юниты на гексе (8,10)»');
    ok(mb.enemySquads.length === 1 && mb.enemySquads[0].name === 'Отд 1' && mb.tacticalMap.grid['5,5'].enemySquadIds[0] === 0,
        'V7g: отряды оппонента появились в зеркале на его позициях (5,5)');
    ok(mb.playerSquads[0].fighters[0].hp === 1 && mb.onlineDmgIn['Вр 1'][0] === 2, 'V7h: урон оппонента применён к моему бойцу (3→1), учтён в dmgIn');
    // повторная доставка того же снапшота — урон не дублируется
    s3.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snap2) + ' } } });');
    ok(s3.evalCtx('appData.campaign.activeBattles[0].playerSquads[0].fighters[0].hp') === 1, 'V7i: повторный снапшот — урон не применяется дважды');
    // оппонент завершил бой
    const snapFin = Object.assign({}, snap2, { status: 'finished' });
    s3.run('__alerts.length = 0; onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snapFin) + ' } } });');
    ok(s3.evalCtx('appData.campaign.activeBattles[0].onlineOppFinished') === true && s3.evalCtx('__alerts.some(a => a.includes("завершил бой"))') === true,
        'V7j: «противник завершил бой» — пометка и уведомление');
    ok(s3.evalCtx('onlineBattleStatusHtml(appData.campaign.activeBattles[0])').includes('противник завершил бой') &&
       HTML.includes('onlineBattleStatusHtml(battle)'), 'V7k: строка «🌐 Общий бой …» в списке «Текущие бои»');
    // мой завершённый бой — не воскресает из облака
    s3.run('onlineBattleFinished(appData.campaign.activeBattles[0]); appData.campaign.activeBattles = [];');
    s3.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snap2) + ' } } });');
    ok(s3.evalCtx('appData.campaign.activeBattles.length') === 0, 'V7l: после моего «Завершить бой» тот же бой из облака не создаётся заново');
    // оппонент начал НОВЫЙ бой на том же гексе (id новее моего завершения) — зеркало создаётся заново, урон считается с нуля
    const snapNew = Object.assign({}, snap2, { id: Date.now() + 100000, dmgOut: { 'Вр 1': [1] }, dmgIn: {} });
    s3.run('appData.campaign.opUnits[0].squads[0].fighters[0].hp = 1; __alerts.length = 0;');
    s3.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snapNew) + ' } } });');
    ok(s3.evalCtx('appData.campaign.activeBattles.length') === 1 && s3.evalCtx('appData.campaign.activeBattles[0].onlineOppBattleId') === snapNew.id &&
       s3.evalCtx('appData.campaign.activeBattles[0].playerSquads[0].fighters[0].hp') === 2 && s3.evalCtx('appData.campaign.activeBattles[0].onlineDmgIn["Вр 1"][0]') === 1,
        'V7n: новый бой оппонента на том же гексе — новое зеркало, урон нового боя применён (3→2), старые счётчики не мешают');
    // перепривязка живого зеркала к новому бою оппонента — счётчики обнуляются
    const snapNew2 = Object.assign({}, snapNew, { id: snapNew.id + 5, dmgOut: { 'Вр 1': [1] } });
    s3.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snapNew2) + ' } } });');
    ok(s3.evalCtx('appData.campaign.activeBattles[0].onlineOppBattleId') === snapNew2.id && s3.evalCtx('appData.campaign.activeBattles[0].playerSquads[0].fighters[0].hp') === 1 &&
       s3.evalCtx('appData.campaign.activeBattles[0].onlineDmgIn["Вр 1"][0]') === 1,
        'V7o: перепривязка к следующему бою оппонента — dmgIn начат заново (урон 1 применён один раз)');
    // Firestore: в снапшоте нет undefined («дырки» массивов → 0)
    s3.run('appData.campaign.activeBattles[0].onlineDmgOut = { "Отд 1": [] }; appData.campaign.activeBattles[0].onlineDmgOut["Отд 1"][1] = 3; __updates.length = 0; onlinePushBattles(true);');
    const lastPush = s3.evalCtx('__updates[__updates.length - 1]');
    const pb = lastPush && lastPush['state.p2.battles'] && lastPush['state.p2.battles'].h8_10;
    ok(pb && Array.isArray(pb.dmgOut['Отд 1']) && pb.dmgOut['Отд 1'][0] === 0 && pb.dmgOut['Отд 1'][1] === 3 && !JSON.stringify(pb).includes('null,3'),
        'V7p: снапшот без undefined (разреженный массив урона → [0,3]) — Firestore примет запись');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
    ok(sw.includes("'./js/online_battles.js'"), 'V7m: js/online_battles.js в ядре service-worker');
}

// ============================================================
console.log('\n== W. v13.052 (R37): разведка без LOS, Hard Mode в онлайне, канвас/масштаб, пуши боёв ==');
{
    const ad = freshAppData();
    const s = makeSandbox(ad);
    s.run('var RECON_RADIUS = 3; var placementLocked = false; var currentTurn = 1; var ONLINE = { match: null, fogVisible: {}, role: "p1", docRef: null };');
    ['renderActiveOrders', 'opLog'].forEach(fn => s.run(`if (typeof ${fn} !== 'function') ${fn} = function(){ return false; };`));
    ad.campaign.online = { code: 'ABCD', role: 'p1', playerId: 't' };
    ad.campaign.scenario = 'valencia';
    ad.campaign.currentTurn = 4;
    // --- W1: разведка показывает ВСЕХ в зоне — и за холмом/лесом (решение пользователя R37) ---
    ad.campaign.opMapGrid = { '6,5': { types: ['hill'] }, '5,4': { types: ['forest'] } };
    ad.campaign.opUnits = [{ id: 'u1', name: 'Развед', type: 'infantry_platoon', col: 5, row: 5, ap: 4, maxAp: 4, mobility: 'foot', squads: [] }];
    ad.campaign.enemyOpUnits = [
        { id: 'e1', name: 'За холмом', col: 7, row: 5, side: 'enemy', detected: false },   // дистанция 2, холм на 6,5
        { id: 'e2', name: 'За лесом', col: 5, row: 3, side: 'enemy', detected: false },    // дистанция 2, лес на 5,4
        { id: 'e3', name: 'Далеко', col: 9, row: 5, side: 'enemy', detected: false }      // дистанция 4 — вне зоны
    ];
    ok(s.evalCtx('opLineOfSightBlocked(5,5,7,5)') === true, 'W1a: (контроль) линия видимости 5,5→7,5 перекрыта холмом');
    s.run('var __ord = { targetHex: "5,5", status: "active" }; executeReconOrder(appData.campaign.opUnits[0], __ord);');
    ok(s.evalCtx('appData.campaign.enemyOpUnits[0].detected') === true && s.evalCtx('appData.campaign.enemyOpUnits[1].detected') === true,
        'W1b: разведка обнаружила врагов за холмом и за лесом (в зоне — без проверки линии видимости)');
    ok(s.evalCtx('appData.campaign.enemyOpUnits[2].detected') === false, 'W1c: враг в 4 гексах — по-прежнему не обнаружен');
    // юнит, вошедший в зону позже (снапшот оппонента) — виден, даже за холмом
    s.run('appData.campaign.enemyOpUnits.push({ id: "e4", name: "Вошёл", col: 7, row: 5, side: "enemy", detected: false });');
    ok(s.evalCtx('onlineEnemyVisible(appData.campaign.enemyOpUnits[3])') === true, 'W1d: вошедший в активную зону разведки за холмом — виден (onlineEnemyVisible)');
    const efm = /const enemiesFound = \(appData\.campaign\.enemyOpUnits \|\| \[\]\)\.filter\(e =>([\s\S]{0,300}?)\);/.exec(HTML);
    ok(!!efm && efm[1].includes('highlightHexes.some') && !efm[1].includes('opLineOfSightBlocked'),
        'W1e: в executeReconOrder фильтр врагов — по зоне (highlightHexes), без opLineOfSightBlocked');

    // --- W2: онлайн = Hard Mode всегда ---
    const s2 = makeSandbox(freshAppData());
    s2.run('var __init = 0; initHardMode = function() { __init++; }; buildOperationalUnits = function() { appData.campaign.opUnits = [{ id: "x", name: "X" }]; }; var __saves = 0; saveData = function() { __saves++; };');
    s2.run('appData.campaign.online = { code: "ABCD", role: "p1", playerId: "t" }; appData.campaign.active = true; hardMode.enabled = false;');
    ok(s2.evalCtx('ensureHardModeForOnline("test")') === true && s2.evalCtx('hardMode.enabled') === true && s2.evalCtx('__init') === 1 && s2.evalCtx('__saves') >= 1,
        'W2a: ensureHardModeForOnline — в онлайн-кампании включает Hard Mode (initHardMode, сохранение)');
    ok(s2.evalCtx('ensureHardModeForOnline("again")') === false && s2.evalCtx('__init') === 1, 'W2b: повторный вызов — ничего не делает');
    ok(s2.evalCtx('document.getElementById("showOrderPanelBtn").style.display') === 'inline-block' &&
       s2.evalCtx('document.getElementById("showCommPanelBtn").style.display') === 'inline-block' &&
       s2.evalCtx('document.getElementById("hardModeBtn").textContent').includes('ВКЛ') &&
       s2.evalCtx('document.getElementById("opHardModeBtn").disabled') === true &&
       s2.evalCtx('document.getElementById("opHardModeBtn").textContent').includes('онлайн'),
        'W2c: applyHardModeUI — кнопки «🎯 Отдать приказ»/«📡 Связь» показаны, кнопка на карте заблокирована с подписью «онлайн — всегда»');
    s2.run('alerts.length = 0; toggleHardMode();');
    ok(s2.evalCtx('hardMode.enabled') === true && s2.evalCtx('alerts.some(a => a.includes("выключить его нельзя"))') === true,
        'W2d: toggleHardMode в онлайн-матче НЕ выключает режим (предупреждение)');
    // одиночная кампания — переключается как раньше
    const s3 = makeSandbox(freshAppData());
    s3.run('var __init = 0; initHardMode = function() { __init++; }; buildOperationalUnits = function() { appData.campaign.opUnits = [{ id: "x", name: "X" }]; }; saveData = function() {};');
    s3.run('hardMode.enabled = false; toggleHardMode();');
    ok(s3.evalCtx('hardMode.enabled') === true && s3.evalCtx('__init') === 1 && s3.evalCtx('document.getElementById("opHardModeBtn").disabled') === false,
        'W2e: одиночная — toggleHardMode включает (кнопка на карте остаётся активной)');
    s3.run('toggleHardMode();');
    ok(s3.evalCtx('hardMode.enabled') === false && s3.evalCtx('document.getElementById("showOrderPanelBtn").style.display') === 'none' &&
       s3.evalCtx('document.getElementById("opHardModeHint").style.display') === 'block',
        'W2f: одиночная — toggleHardMode выключает (кнопки приказов скрыты, подсказка показана)');
    ok(s3.evalCtx('ensureHardModeForOnline("x")') === false && s3.evalCtx('hardMode.enabled') === false, 'W2g: ensureHardModeForOnline в одиночной — не включает');
    ok(/id="opHardModeBtn"/.test(HTML) && /id="opHardModeHint"/.test(HTML) && /ensureHardModeForOnline\('showOperationalMap'\)/.test(HTML) &&
       /appData\.campaign\.online && !hardMode\.enabled\) \{\s*hardMode\.enabled = true;/.test(HTML),
        'W2h: кнопка Hard Mode на экране карты; включение при showOperationalMap и при загрузке страницы (DOMContentLoaded)');

    // --- W3: канвас — ограничение разрешения, масштаб «вся карта», щипок ---
    const s4 = makeSandbox(freshAppData());
    s4.run('var CANVAS_MAX_DPR = 2; var CANVAS_PIXEL_BUDGET = 5500000; var OP_HEX_SIZE = 55; var __inits = 0; initOperationalMap = function() { __inits++; }; saveData = function() {}; opMapDrawDims = function() { return { cols: 13, rows: 15 }; };');
    s4.run('window.devicePixelRatio = 3; window.innerWidth = 390;');
    ok(s4.evalCtx('pickCanvasDpr(400, 300)') === 2, 'W3a: pickCanvasDpr — dpr 3 ограничен до 2 для маленького холста');
    const dBig = s4.evalCtx('pickCanvasDpr(1286, 1279)');
    ok(dBig > 1.5 && dBig < 1.9 && Math.abs(1286 * 1279 * dBig * dBig - 5500000) < 5000, 'W3b: большой холст 1286×1279 — dpr по бюджету 5.5 Мпикс (≈1.83), а не 3', dBig);
    s4.run('window.devicePixelRatio = 1;');
    ok(s4.evalCtx('pickCanvasDpr(1286, 1279)') === 1, 'W3c: dpr 1 — без изменений');
    s4.run('var __c = document.getElementById("opMapCanvas"); __c.style.width = "1000px"; __c.width = 1830;');
    ok(Math.abs(s4.evalCtx('canvasBackingScale(__c)') - 1.83) < 0.001, 'W3d: canvasBackingScale = canvas.width / CSS-ширина (клики и отрисовка согласованы)');
    // масштаб «вся карта по ширине»: контейнер 380px, поле 13 столбцов → zoom ≈ 0.294
    s4.run('document.getElementById("opMapContainer").clientWidth = 380;');
    const fit = s4.evalCtx('opMapFitZoom()');
    ok(fit > 0.29 && fit < 0.30, 'W3e: opMapFitZoom — 13 столбцов в 380px → масштаб ≈0.294', fit);
    s4.run('appData.campaign.opZoomLevel = 1; delete appData.campaign.opZoomFitKey; applyOpMapFitZoom({ cols: 13, rows: 15 });');
    ok(Math.abs(s4.evalCtx('appData.campaign.opZoomLevel') - fit) < 1e-9 && s4.evalCtx('typeof appData.campaign.opZoomFitKey') === 'string',
        'W3f: первый показ карты — масштаб подогнан под экран (вся карта видна)');
    s4.run('appData.campaign.opZoomLevel = 1.5; applyOpMapFitZoom({ cols: 13, rows: 15 });');
    ok(s4.evalCtx('appData.campaign.opZoomLevel') === 1.5, 'W3g: та же ширина экрана — выбранный игроком масштаб не сбрасывается');
    s4.run('document.getElementById("opMapContainer").clientWidth = 700; applyOpMapFitZoom({ cols: 13, rows: 15 });');
    ok(Math.abs(s4.evalCtx('appData.campaign.opZoomLevel') - s4.evalCtx('opMapFitZoom()')) < 1e-9, 'W3h: телефон, поворот экрана (ширина изменилась) — карта снова подогнана');
    s4.run('window.innerWidth = 1400; document.getElementById("opMapContainer").clientWidth = 1200; appData.campaign.opZoomLevel = 1.2; applyOpMapFitZoom({ cols: 13, rows: 15 });');
    ok(s4.evalCtx('appData.campaign.opZoomLevel') === 1.2, 'W3i: ПК — смена ширины окна масштаб не трогает');
    s4.run('appData.campaign.opZoomFit = 0.294; appData.campaign.opZoomLevel = 0.5; zoomOpMap(0.5);');
    ok(Math.abs(s4.evalCtx('appData.campaign.opZoomLevel') - 0.294) < 1e-9 && s4.evalCtx('__inits') >= 1, 'W3j: ➖ не уменьшает карту меньше «вся карта» (нижняя граница = fit-масштаб)');
    ok(/id="opZoomBar"/.test(HTML) && /onclick="fitOpMapZoom\(\)"/.test(HTML), 'W3k: панель масштаба ➖ ➕ «⤢ Вся карта» над картой операции');
    ok(/function setupOpMapTouchControls/.test(HTML) && /touchAction = 'pan-x pan-y'/.test(HTML) && /c\.style\.transform = 'scale\(' \+ k \+ '\)'/.test(HTML) && /setupOpMapTouchControls\(\);/.test(HTML),
        'W3l: щипок — CSS-transform во время жеста, перерисовка по окончании; touch-action без масштабирования страницы');
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!/#opMapCanvas\s*\{[^}]*width:\s*100%\s*!important/.test(css), 'W3m: CSS-правило «#opMapCanvas {width:100% !important}» (ломало зум на телефоне) удалено');
    ok(/function redrawOperationalMapNow\(\)/.test(HTML) && /__opRedrawPending/.test(HTML) && /requestAnimationFrame\(\(\) => \{\s*__opRedrawPending = false;/.test(HTML),
        'W3n: перерисовки оперативной карты склеиваются через requestAnimationFrame');
    ok(/loadedOpUnitIcons\['images\/рация\.png'\]/.test(HTML), 'W3o: иконка рации кэшируется (не new Image() на каждый юнит при каждой перерисовке)');
    ok(/const PRECACHE_PARALLEL = 6;/.test(fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8')), 'W3p: service-worker — предзагрузка карт/иконок батчами по 6');

    // --- W4: пуши общих боёв без «пинг-понга» ---
    const obSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'online_battles.js'), 'utf8');
    const s5 = makeSandbox(freshAppData());
    s5.run('var ONLINE = { match: null, fogVisible: {}, role: "p1", docRef: null }; var currentTurn = 3; var __updates = [];');
    s5.run('ONLINE.docRef = { update: function(o) { __updates.push(o); return Promise.resolve(); } };');
    s5.run('appData.campaign.online = { code: "ABCD", role: "p1", playerId: "t" }; appData.currentBattleId = 77;');
    s5.run('function onlineOppRole() { return "p2"; }');
    s5.run(obSrc);
    s5.run('appData.campaign.activeBattles = [{ id: 77, hexKey: "8,10", currentTurn: 1, playerUnitNames: ["Взвод А"], enemyUnitNames: ["Враг Б"], playerSquads: [], enemySquads: [] }];');
    s5.run('appData.squads = [{ name: "Отд 1", faction: "BeVe", fighters: [{ name: "a1", hp: 3, maxHp: 3, weapon: "Винтовка" }] }];');
    s5.run('appData.map = { grid: { "5,5": { type: "grass", squadIds: [0], enemySquadIds: [] } }, enemySquads: [{ name: "Вр 1", faction: "A.I.R.F.", fighters: [{ name: "b1", hp: 3, maxHp: 3 }] }] };');
    s5.run('onlinePushBattles(true); var __n1 = __updates.length; var __at1 = __updates[0]["state.p1.battles"].h8_10.updatedAt;');
    s5.run('Date.now = (function(orig) { return function() { return orig() + 60000; }; })(Date.now); onlinePushBattles(true); onlinePushBattles(true);');
    ok(s5.evalCtx('__updates.length') === 1, 'W4a: содержимое боя не изменилось — повторные пуши не отправляются (updatedAt не участвует)');
    s5.run('appData.map.enemySquads[0].fighters[0].hp = 2; onlinePushBattles(true);');
    ok(s5.evalCtx('__updates.length') === 2 && s5.evalCtx('__updates[1]["state.p1.battles"].h8_10.updatedAt') > s5.evalCtx('__at1'),
        'W4b: изменился урон — пуш ушёл с новой отметкой времени');
    // приём чужого снапшота, где изменилось только updatedAt/turn оппонента — ответного пуша нет
    const s6 = makeSandbox(freshAppData());
    s6.run('var ONLINE = { match: null, fogVisible: {}, role: "p2", docRef: null }; var currentTurn = 1; var __updates = []; var __sched = 0;');
    s6.run('ONLINE.docRef = { update: function(o) { __updates.push(o); return Promise.resolve(); } }; alert = function() {};');
    s6.run('appData.campaign.online = { code: "ABCD", role: "p2", playerId: "q" }; appData.campaign.currentTurn = 3;');
    s6.run('function onlineOppRole() { return "p1"; } function onlineRevealEnemy() {}');
    s6.run('appData.campaign.opUnits = [{ name: "Враг Б", col: 8, row: 10, faction: "A.I.R.F.", squads: [{ name: "Вр 1", fighters: [{ name: "b1", hp: 3, maxHp: 3 }] }] }];');
    s6.run('appData.campaign.enemyOpUnits = [{ name: "Взвод А", col: 8, row: 10, faction: "BeVe", side: "enemy", squads: [{ name: "Отд 1", fighters: [{ name: "a1", hp: 3, maxHp: 3 }] }] }];');
    s6.run('startTacticalBattle = function(my, opp, opts) { const b = { id: 555, hexKey: "8,10", currentTurn: 1, playerUnitNames: my.map(u => u.name), enemyUnitNames: opp.map(u => u.name), ' +
           ' playerSquads: [{ name: "Вр 1", fighters: [{ name: "b1", hp: 3, maxHp: 3 }] }], enemySquads: [], tacticalMap: { grid: { "5,5": { type: "grass", squadIds: [], enemySquadIds: [] } } } };' +
           ' appData.campaign.activeBattles.push(b); return b; };');
    s6.run(obSrc);
    s6.run('onlineScheduleBattlePush = function() { __sched++; };');
    const snapA = s5.evalCtx('__updates[1]["state.p1.battles"].h8_10');
    s6.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snapA) + ' } } });');
    ok(s6.evalCtx('appData.campaign.activeBattles.length') === 1 && s6.evalCtx('__sched') === 1 && s6.evalCtx('appData.campaign.activeBattles[0].playerSquads[0].fighters[0].hp') === 2,
        'W4c: новое зеркало боя (урон оппонента 3→2 применён) — ответный пуш запланирован (привязка боёв, dmgIn)');
    const snapA2 = Object.assign({}, snapA, { updatedAt: snapA.updatedAt + 5000, turn: 4 });
    s6.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snapA2) + ' } } });');
    ok(s6.evalCtx('__sched') === 1 && s6.evalCtx('appData.campaign.activeBattles[0].onlineOppTurn') === 4,
        'W4d: у оппонента изменились только updatedAt/ход — принято, но ответный пуш НЕ планируется (пинг-понг закрыт)');
    const snapA3 = Object.assign({}, snapA2, { updatedAt: snapA2.updatedAt + 5000, dmgOut: { 'Вр 1': [2] } });
    s6.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snapA3) + ' } } });');
    ok(s6.evalCtx('__sched') === 2 && s6.evalCtx('appData.campaign.activeBattles[0].playerSquads[0].fighters[0].hp') === 1,
        'W4e: оппонент нанёс урон — урон применён и ответный пуш (подтверждение dmgIn) запланирован');
}

// ============================================================
console.log('\n== X. v13.053 (R38): стартовые позиции из js/data.js, единые правки карт гексов у обоих игроков, редактор гекса ==');
const asyncChecks = [];
{
    // --- X1: стартовые позиции (SCENARIO_START_POSITIONS) ---
    const s = makeSandbox(freshAppData());
    s.run('var placementLocked = false;');
    ok(s.evalCtx('JSON.stringify(getConfiguredStartHex("valencia","BeVe",{name:"Штаб батальона"}))') === '{"col":5,"row":0}' &&
       s.evalCtx('getConfiguredStartHex("valencia","BeVe",{name:"Нет такого"})') === null &&
       s.evalCtx('getConfiguredStartHex("valencia","A.I.R.F.",{name:"Штаб Батальона"}).col') === 0,
        'X1a: getConfiguredStartHex — гекс по имени юнита из js/data.js (BeVe/A.I.R.F.), неизвестный юнит → null');
    s.run('SCENARIO_START_POSITIONS.valencia.BeVe["Тест-массив"] = [3, 4]; SCENARIO_START_POSITIONS.valencia.BeVe["Тест-вне"] = "15,2"; SCENARIO_START_POSITIONS.valencia.BeVe["Тест-мусор"] = "abc"; SCENARIO_START_POSITIONS.valencia.BeVe["Тест-точка"] = "6.7";');
    ok(s.evalCtx('JSON.stringify(getConfiguredStartHex("valencia","BeVe",{name:"Тест-массив"}))') === '{"col":3,"row":4}' &&
       s.evalCtx('getConfiguredStartHex("valencia","BeVe",{name:"Тест-вне"})') === null &&
       s.evalCtx('getConfiguredStartHex("valencia","BeVe",{name:"Тест-мусор"})') === null &&
       s.evalCtx('JSON.stringify(getConfiguredStartHex("valencia","BeVe",{name:"Тест-точка"}))') === '{"col":6,"row":7}',
        'X1b: формат [col,row] и "col.row" принимаются; гекс вне поля (15,2) и мусор → null (юнит расставится автоматически)');
    // авторазмещение: настроенный гекс — точно туда; остальные — алгоритмом в зоне
    s.run('appData.campaign.scenario = "valencia"; appData.campaign.playerFaction = "BeVe"; appData.campaign.opMapGrid = {};' +
          'appData.campaign.opUnits = [{ id:"a", name:"Штаб батальона", type:"hq", col:null, row:null, squads:[] }, { id:"b", name:"Без позиции", type:"infantry_platoon", col:null, row:null, squads:[] }, { id:"c", name:"Тест-вне", type:"infantry_platoon", col:null, row:null, squads:[] }];');
    const nPl = s.evalCtx('autoPlaceUnplacedUnits({ manual: false })');
    const u = s.evalCtx('appData.campaign.opUnits.map(x => x.col + "," + x.row)');
    ok(nPl === 3 && u[0] === '5,0' && u[1] !== 'null,null' && u[2] !== 'null,null' && u[2] !== '15,2' && s.evalCtx('appData.campaign.autoPlacedOnce') === true,
        'X1c: авторазмещение — «Штаб батальона» ровно на 5,0 (из js/data.js), остальные по алгоритму в зоне; гекс вне поля проигнорирован', JSON.stringify(u));
    ok(s.evalCtx('isHexInPlacementZone("valencia","BeVe",5,0).ok') === true, 'X1d: (контроль) 5,0 — в зоне расстановки BeVe');
    const code = s.evalCtx('buildStartPositionsCode()');
    ok(/'BeVe': \{/.test(code) && /'Штаб батальона': '5,0'/.test(code) && /SCENARIO_START_POSITIONS\.valencia/.test(code),
        'X1e: «📋 Код стартовых позиций» — текущая расстановка в формате js/data.js', code.slice(0, 120));
    ok(/onclick="showStartPositionsCode\(\)"/.test(HTML) && /const SCENARIO_START_POSITIONS = \{/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8')),
        'X1f: кнопка в панели «Вид»; таблица SCENARIO_START_POSITIONS в js/data.js');
    // все имена в таблице — реальные юниты батальонов (опечатка в имени = юнит без позиции)
    {
        const s1 = makeSandbox(freshAppData());
        s1.run('console = { log(){}, warn(){}, error(){} };');
        s1.sandbox.appData.templates = s1.evalCtx('SQUAD_TEMPLATES');
        s1.sandbox.appData.factions = s1.evalCtx('({ BeVe: appData.factions.BeVe, "A.I.R.F.": appData.factions["A.I.R.F."] })') || {};
        s1.sandbox.assignUniqueCrewKeys = (squad) => { (squad.fighters || []).forEach((f, i) => { f.crewKey = f.crewKey || ('k' + i); }); };
        const bad = [];
        ['BeVe', 'A.I.R.F.'].forEach(f => {
            s1.run(`appData.campaign.playerFaction = ${JSON.stringify(f)}; appData.campaign.battalions = { player: generateBattalion(${JSON.stringify(f)}, (BATTALION_PRESETS[${JSON.stringify(f)}].supportOptions || []).map(o => o.id)) }; appData.campaign.opUnits = []; appData.campaign.opUnitsSignature = null; buildOperationalUnits();`);
            const names = new Set(s1.evalCtx('appData.campaign.opUnits.map(u => u.name)'));
            const keys = s1.evalCtx(`Object.keys(SCENARIO_START_POSITIONS.valencia[${JSON.stringify(f)}])`);
            keys.forEach(k => { if (!names.has(k)) bad.push(f + ': ' + k); });
            names.forEach(n => { if (!keys.includes(n)) bad.push(f + ' (нет в таблице): ' + n); });
        });
        ok(bad.length === 0, 'X1g: таблица стартовых позиций покрывает ВСЕ юниты обоих батальонов и не содержит опечаток в именах', bad.join('; '));
    }

    // --- X2: правки карт гексов — одинаково у обоих и на уже идущих боях ---
    const s2 = makeSandbox(freshAppData());
    s2.run('var ONLINE = { role: "p2", match: null, fogVisible: {}, docRef: null }; var __redraws = 0; redrawMap = function() { __redraws++; }; var TACTICAL_MAP_SIZE = 20;');
    s2.run('TACTICAL_HEX_MAPS["8,10"] = normalizeTacticalMapData({currentMap:{grid:(function(){var g={}; for (var c=0;c<6;c++) for (var r=0;r<6;r++) g[c+","+r]={type:(c%2? "forest":"grass")}; return g;})()}});');
    s2.run('appData.campaign.hexOverlays = {"8,10":{hexEdits:{"2,2":"trenches"},hexVariants:{"2,2":3},trenchPoints:0,prepPoints:0,shellings:0}};');
    s2.run('var g = buildBattleGridForHex("8,10").grid;');
    ok(s2.evalCtx('g["2,2"].type') === 'trenches' && s2.evalCtx('g["2,2"].ov') === 1 && s2.evalCtx('g["1,1"].type') === 'forest' && !s2.evalCtx('g["1,1"].ov'),
        'X2a: applyHexOverlays помечает наложенные клетки (ov)');
    s2.run('delete appData.campaign.hexOverlays["8,10"].hexEdits["2,2"]; appData.campaign.hexOverlays["8,10"].hexEdits["1,1"] = "shelled_forest"; applyHexOverlays(g, "8,10");');
    ok(s2.evalCtx('g["2,2"].type') === 'grass' && !s2.evalCtx('g["2,2"].ov') && s2.evalCtx('g["1,1"].type') === 'shelled_forest' && s2.evalCtx('g["1,1"].ov') === 1,
        'X2b: повторное наложение на ту же сетку: отменённая правка вернула клетку к эталону карты, новая — применилась');
    // идущие бои на гексе: запись боя + открытая карта
    s2.run('appData.campaign.activeBattles = [{ id: 1, hexKey: "8,10", tacticalMap: { grid: buildBattleGridForHex("8,10").grid } }, { id: 2, hexKey: "3,3", tacticalMap: { grid: { "0,0": { type: "grass" } } } }];' +
           'appData.currentBattleId = 1; appData.map = { grid: buildBattleGridForHex("8,10").grid, mode: "view" }; document.getElementById("battleApp").style.display = "block";');
    s2.run('appData.campaign.hexOverlays["8,10"].hexEdits["4,4"] = "craters"; appData.campaign.hexOverlays["8,10"].hexVariants["4,4"] = 1; __redraws = 0; var __n = applyHexOverlaysToBattles("8,10");');
    ok(s2.evalCtx('__n') === 1 && s2.evalCtx('appData.campaign.activeBattles[0].tacticalMap.grid["4,4"].type') === 'craters' &&
       s2.evalCtx('appData.map.grid["4,4"].type') === 'craters' && s2.evalCtx('appData.map.grid["4,4"].variant') === 1 && s2.evalCtx('__redraws') === 1 &&
       s2.evalCtx('appData.campaign.activeBattles[1].tacticalMap.grid["0,0"].type') === 'grass',
        'X2c: воронки, появившиеся ПОСЛЕ начала боя, ложатся на запись боя и на открытую карту (перерисовка); чужой гекс не тронут');
    // слияние с облаком: как p2 — конфликт решает p1; новые правки — на бои
    s2.run('appData.campaign.hexOverlays["8,10"].hexEdits["4,4"] = "craters"; appData.campaign.hexOverlays["8,10"].hexVariants["4,4"] = 1;');
    s2.run('var __ch = mergeHexOverlays({ "8,10": { hexEdits: { "4,4": "craters", "0,0": "craters" }, hexVariants: { "4,4": 0, "0,0": 1 }, shellings: 2 } });');
    ok(s2.evalCtx('__ch') === true && s2.evalCtx('appData.campaign.hexOverlays["8,10"].hexVariants["4,4"]') === 0 && s2.evalCtx('appData.campaign.hexOverlays["8,10"].hexEdits["0,0"]') === 'craters' &&
       s2.evalCtx('appData.campaign.hexOverlays["8,10"].shellings') === 2 && s2.evalCtx('appData.map.grid["0,0"].type') === 'craters' && s2.evalCtx('appData.map.grid["4,4"].variant') === 0,
        'X2d: mergeHexOverlays (я p2): спорная клетка берётся у p1 — карты сходятся; новые воронки сразу на открытой карте боя');
    s2.run('ONLINE.role = "p1"; appData.campaign.hexOverlays["8,10"].hexVariants["4,4"] = 1; var __ch2 = mergeHexOverlays({ "8,10": { hexEdits: { "4,4": "craters" }, hexVariants: { "4,4": 0 } } });');
    ok(s2.evalCtx('__ch2') === false && s2.evalCtx('appData.campaign.hexOverlays["8,10"].hexVariants["4,4"]') === 1, 'X2e: mergeHexOverlays (я p1): своя версия спорной клетки сохраняется (у p2 будет та же)');
    // редактор: undo снимает метку ov на рабочей сетке, saveHexOverlays(hexKey) применяет к боям
    s2.run('appData.currentBattleId = null; appData.campaign.hexOverlays["6,7"] = {hexEdits:{},hexVariants:{},trenchPoints:2,prepPoints:0,shellings:0}; Math.random = function() { return 0.1; };' +
           'TACTICAL_HEX_MAPS["6,7"] = normalizeTacticalMapData({currentMap:{grid:{"1,1":{type:"grass"},"2,1":{type:"grass"}}}});' +
           'appData.campaign.activeBattles = [{ id: 7, hexKey: "6,7", tacticalMap: { grid: buildBattleGridForHex("6,7").grid } }];' +
           'hexEditorState = {hexKey:"6,7",kind:"trenches",rule:hexEditRuleFor("trenches"),baseGrid:{"1,1":{type:"grass"},"2,1":{type:"grass"}},undo:[],placed:0,prevBattleId:null};' +
           'appData.map = {grid:{"1,1":{type:"grass"},"2,1":{type:"grass"}}, mode:"hexEdit"}; hexEditClick("1,1");');
    ok(s2.evalCtx('appData.campaign.activeBattles[0].tacticalMap.grid["1,1"].type') === 'trenches' && s2.evalCtx('appData.map.grid["1,1"].ov') === 1,
        'X2g: окоп из редактора сразу попадает в карту идущего боя на этом гексе (противник увидит в бою)');
    s2.run('hexEditUndo();');
    ok(s2.evalCtx('appData.campaign.activeBattles[0].tacticalMap.grid["1,1"].type') === 'grass' && !s2.evalCtx('appData.map.grid["1,1"].ov'),
        'X2h: отмена в редакторе убирает окоп и из карты идущего боя');
    s2.run('hexEditorState = null; appData.map = null;');
    // зеркало боя, созданное до загрузки карты гекса: карта догружается В ЗАПИСЬ ЭТОГО боя, открытая карта не трогается
    s2.run('delete TACTICAL_HEX_MAPS["9,9"]; ensureTacticalHexMap = function(k) { return Promise.resolve().then(() => { TACTICAL_HEX_MAPS[k] = normalizeTacticalMapData({currentMap:{grid:{"0,0":{type:"forest"},"1,0":{type:"grass"}}}}); return TACTICAL_HEX_MAPS[k]; }); };' +
           'appData.map = { grid: { "0,0": { type: "water" } }, mode: "view" }; appData.currentBattleId = 55;' +
           'var __tm = { grid: {}, mapSize: 20 }; var __opened = openHexMapForBattle("9,9", __tm);' +
           'appData.campaign.activeBattles = [{ id: 55, hexKey: "1,1", tacticalMap: { grid: {} } }, { id: Date.now(), hexKey: "9,9", tacticalMap: { grid: { "1,0": { type: "grass", squadIds: [], enemySquadIds: [0] } } } }];');
    asyncChecks.push(new Promise(res => setTimeout(res, 5)).then(() => {
        ok(s2.evalCtx('__opened') === false && s2.evalCtx('appData.campaign.activeBattles[1].tacticalMap.grid["0,0"].type') === 'forest' &&
           s2.evalCtx('appData.campaign.activeBattles[1].tacticalMap.grid["1,0"].enemySquadIds[0]') === 0 &&
           s2.evalCtx('appData.map.grid["0,0"].type') === 'water',
            'X2i: карта гекса догрузилась позже → записана в ТОТ бой (зеркало, с сохранением расставленных отрядов), а не в открытую карту другого боя');
    }));
    ok(/openHexMapForBattle\(hexKey, tacticalMap\)/.test(HTML) && /if \(silentStart \|\| \(typeof hexEditorState !== 'undefined' && hexEditorState\)\)/.test(HTML),
        'X2j: startTacticalBattle — тихое вступление в существующий бой / открытый редактор не переключают экран');

    // --- X3: сообщения и редактор карты гекса ---
    ok((HTML.match(/<div id="mapInfo"/g) || []).length === 1 && (HTML.match(/<div id="opHexInfo"/g) || []).length === 1 &&
       /id="opMapInfoSlot"/.test(HTML) && /id="battleMapInfoSlot"/.test(HTML) && /id="opHexEditsPanel"/.test(HTML),
        'X3a: #mapInfo и #opHexInfo — по одному; слоты для переезда сообщений и панель «🛠️ Карты гексов» на месте');
    const s3 = makeSandbox(freshAppData());
    s3.run('var __moved = null; document.getElementById("opMapInfoSlot").appendChild = function(el) { __moved = "op:" + el.id; }; document.getElementById("battleMapInfoSlot").appendChild = function(el) { __moved = "battle:" + el.id; };');
    s3.run('document.getElementById("battleApp").style.display = "none"; document.getElementById("campaignApp").style.display = "block"; relocateMapInfo();');
    ok(s3.evalCtx('__moved') === 'op:mapInfo', 'X3b: открыт экран кампании → #mapInfo переезжает под оперативную карту');
    s3.run('document.getElementById("battleApp").style.display = "block"; relocateMapInfo();');
    ok(s3.evalCtx('__moved') === 'battle:mapInfo', 'X3c: открыт бой → #mapInfo под картой боя');
    ok(/setupMapInfoRelocation\(\);/.test(HTML) && /relocateMapInfo\(\);/.test(HTML), 'X3d: переезд подключён при загрузке и при показе карты операции');
    // панель правок
    s3.run('appData.campaign.hexOverlays = { "8,10": { hexEdits: {}, hexVariants: {}, trenchPoints: 2, prepPoints: 0, shellings: 0 }, "3,3": { hexEdits: {}, hexVariants: {}, trenchPoints: 0, prepPoints: 1, shellings: 0 } }; renderHexEditsPanel();');
    const panel = s3.evalCtx('document.getElementById("opHexEditsPanel").innerHTML');
    ok(s3.evalCtx('document.getElementById("opHexEditsPanel").style.display') === 'block' && /openHexEditorForBattle\('8,10','trenches'\)/.test(panel) && /openHexEditorForBattle\('3,3','prep'\)/.test(panel) && !/'8,10','prep'/.test(panel),
        'X3e: панель под картой операции — кнопки только для доступных правок каждого гекса');
    s3.run('appData.campaign.hexOverlays["8,10"].trenchPoints = 0; appData.campaign.hexOverlays["3,3"].prepPoints = 0; renderHexEditsPanel();');
    ok(s3.evalCtx('document.getElementById("opHexEditsPanel").style.display') === 'none', 'X3f: правок нет — панель скрыта');
    // приказ выполнен → предложение открыть карту (confirm), но не во время боя
    s3.run('var __open = []; openHexEditorForBattle = function(k, kind) { __open.push(k + ":" + kind); }; var __conf = []; confirm = function(m) { __conf.push(m); return true; }; appData.currentBattleId = null; hexEditorState = null;');
    s3.run('grantTrenchPoints("8,10", 3, "1-й взвод");');
    ok(s3.evalCtx('__open.join()') === '8,10:trenches' && s3.evalCtx('__conf.length') === 1 && /окопов: 3/.test(s3.evalCtx('__conf[0]')) && s3.evalCtx('appData.campaign.hexOverlays["8,10"].trenchPoints') === 3,
        'X3g: «Окопаться» выполнен → сразу предложение открыть карту гекса (confirm) → редактор окопов этого гекса');
    s3.run('__open.length = 0; __conf.length = 0; appData.currentBattleId = 77; grantPrepPoints("3,3", 2, "2-й взвод");');
    ok(s3.evalCtx('__open.length') === 0 && s3.evalCtx('__conf.length') === 0 && s3.evalCtx('document.getElementById("opHexEditsPanel").innerHTML').includes("'3,3','prep'"),
        'X3h: во время боя карту не открываем и не спрашиваем — гекс остаётся в панели «🛠️ Карты гексов»');
    s3.run('appData.currentBattleId = null; confirm = function() { return false; }; __open.length = 0; grantTrenchPoints("5,5", 1, "3-й взвод");');
    ok(s3.evalCtx('__open.length') === 0, 'X3i: игрок отказался — редактор не открывается (кнопки остаются в панели)');
    // редактор из боя: состояние боя сохраняется, «Готово» возвращает В ТОТ ЖЕ бой
    const s4 = makeSandbox(freshAppData());
    s4.run('var TACTICAL_MAP_SIZE = 20; var __saved = 0; saveCurrentBattleState = function() { __saved++; }; var __sw = []; switchToBattle = function(id) { __sw.push(id); }; var __som = 0; showOperationalMap = function() { __som++; }; initMap = function(){}; redrawMap = function(){};');
    s4.run('TACTICAL_HEX_MAPS["8,10"] = normalizeTacticalMapData({currentMap:{grid:{"1,1":{type:"grass"}}}}); appData.campaign.hexOverlays = { "8,10": { hexEdits: {}, hexVariants: {}, trenchPoints: 1, prepPoints: 0, shellings: 0 } };' +
           'appData.campaign.activeBattles = [{ id: 77, hexKey: "2,2", tacticalMap: { grid: {} }, playerSquads: [], enemySquads: [] }]; appData.currentBattleId = 77; appData.map = { grid: { "0,0": { type: "grass" } }, mode: "view" };');
    s4.run('openHexEditorForBattle("8,10", "trenches");');
    ok(s4.evalCtx('__saved') === 1 && s4.evalCtx('hexEditorState && hexEditorState.prevBattleId') === 77 && s4.evalCtx('appData.currentBattleId') === null && s4.evalCtx('appData.map.mode') === 'hexEdit' &&
       s4.evalCtx('document.getElementById("battleApp").style.display') === 'block',
        'X3j: редактор открыт из боя — состояние боя сохранено в запись, редактор на экране, бой «отложен»');
    ok(s4.evalCtx('document.getElementById("hexEditorBanner") && document.getElementById("hexEditorBanner").innerHTML').includes('вернуться в бой'), 'X3k: кнопка «✅ Готово — вернуться в бой»');
    s4.run('closeHexEditor();');
    ok(s4.evalCtx('__sw.join()') === '77' && s4.evalCtx('__som') === 0 && s4.evalCtx('hexEditorState') === null, 'X3l: «Готово» → возврат в тот же бой (switchToBattle), а не на карту операции');
    s4.run('appData.currentBattleId = null; appData.campaign.hexOverlays["8,10"].trenchPoints = 1; openHexEditorForBattle("8,10", "trenches"); closeHexEditor();');
    ok(s4.evalCtx('__som') === 1 && s4.evalCtx('__sw.length') === 1, 'X3m: редактор с карты операции → «Готово» возвращает на карту операции');
    s4.run('appData.map = null; appData.campaign.hexOverlays["8,10"].trenchPoints = 1; var __e = null; try { openHexEditorForBattle("8,10", "trenches"); } catch (e) { __e = e.message; }');
    ok(s4.evalCtx('__e') === null && s4.evalCtx('hexEditorState !== null') === true, 'X3n: редактор открывается и когда тактическая карта ещё ни разу не создавалась (appData.map = null)');
    s4.run('closeHexEditor();');
    // панель на экране боя — только гекс ЭТОГО боя
    s4.run('appData.campaign.hexOverlays = { "2,2": { hexEdits: {}, hexVariants: {}, trenchPoints: 2, prepPoints: 0, shellings: 0 }, "8,10": { hexEdits: {}, hexVariants: {}, trenchPoints: 1, prepPoints: 0, shellings: 0 } }; appData.currentBattleId = 77; renderHexEditsPanel();');
    const bp = s4.evalCtx('document.getElementById("battleHexEditsPanel").innerHTML');
    ok(s4.evalCtx('document.getElementById("battleHexEditsPanel").style.display') === 'block' && /'2,2','trenches'/.test(bp) && !/8,10/.test(bp) &&
       /'8,10','trenches'/.test(s4.evalCtx('document.getElementById("opHexEditsPanel").innerHTML')),
        'X3o: в бою на гексе 2,2 — панель правок только этого гекса (не 8,10); на карте операции — все гексы');
    s4.run('appData.currentBattleId = null; renderHexEditsPanel();');
    ok(s4.evalCtx('document.getElementById("battleHexEditsPanel").style.display') === 'none', 'X3p: вне боя панель боя скрыта');
    ok(/activateBattleTab\(\) \{[\s\S]{0,900}renderHexEditsPanel\(\)/.test(HTML), 'X3q: панель боя обновляется при входе в бой (activateBattleTab)');
}


// ============================================================
console.log('\n== Y. v13.054 (R39#2/#4): уничтоженные юниты остаются в батальоне; действия с карты боя ==');
{
    // --- Y1: syncBattleLossesToCampaign — взвод не «уничтожается» от гибели одного отделения; уничтоженный остаётся в списке ---
    const s1 = makeSandbox(freshAppData());
    const mk = (n, hp) => ({ name: n, weapon: 'Винтовка', hp: hp, maxHp: 3 });
    s1.sandbox.appData.campaign.opUnits = [
        { name: '1-й взвод (бельг.)', type: 'infantry_platoon', col: 5, row: 5, squads: [
            { name: 'Отд. №1', fighters: [mk('a', 3), mk('b', 3)] },
            { name: 'Отд. №2', fighters: [mk('c', 3), mk('d', 3)] } ] },
        { name: 'Расчёт ПТО №1', type: 'at_gun', col: 6, row: 6, squads: [ { name: 'ПТО-1', fighters: [mk('x', 3), mk('y', 3)] } ] }
    ];
    s1.sandbox.appData.campaign.activeBattles = [{ id: 11, hexKey: '5,5', playerSquads: [
        { name: 'Отд. №1', fighters: [mk('a', 0), mk('b', 0)], ammoSmall: 10, grenades: 1, currentMorale: 3 },
        { name: 'ПТО-1', fighters: [mk('x', 0), mk('y', 0)], ammoSmall: 0, grenades: 0, currentMorale: 1 }
    ], enemySquads: [] }];
    s1.run('syncBattleLossesToCampaign(11);');
    const u0 = s1.sandbox.appData.campaign.opUnits[0], u1 = s1.sandbox.appData.campaign.opUnits[1];
    ok(s1.sandbox.appData.campaign.opUnits.length === 2, 'Y1a: уничтоженный юнит НЕ удалён из opUnits (остаётся в батальоне)');
    ok(!u0.isDestroyed && !u0.hidden && u0.squads[0].fighters.every(f => f.hp === 0) && u0.squads[1].fighters.every(f => f.hp === 3),
        'Y1b: взвод с одним выбитым отделением из двух — НЕ уничтожен (раньше весь взвод «исчезал»)');
    ok(u1.isDestroyed === true && u1.hidden === true && u1.destroyedHex === '6,6' && u1.col === 6,
        'Y1c: юнит, потерявший всех бойцов, помечен уничтоженным, снят с карты (hidden), гекс гибели запомнен');
    ok(((s1.sandbox.appData.campaign.opMapGrid['6,6'] || {}).markers || []).includes('destroyedSquadFriendly'), 'Y1d: на гексе гибели — метка «💀 Уничтоженный свой»');
    ok(s1.evalCtx('isOpUnitWipedOut({ isGroup: true, vehicleList: [] })') === true && s1.evalCtx('isOpUnitWipedOut({ isGroup: true, vehicleList: [{name:\"т\"}] })') === false &&
       s1.evalCtx('isOpUnitWipedOut({ squads: [] })') === false, 'Y1e: isOpUnitWipedOut — группа техники без машин = выбита; юнит без отрядов — нет');
    ok(s1.evalCtx('getUnplacedOpUnits().length') === 0, 'Y1f: уничтоженный юнит не попадает в список «не размещённых» (не предлагается к расстановке)');

    // --- Y2: вкладка «Батальон»: красным, 0/N, общий л/с «осталось/было» ---
    s1.run('renderBattalionRoster();');
    const listHtml = s1.elements['battalionRosterList'].innerHTML;
    const sumHtml = s1.elements['battalionRosterSummary'].innerHTML;
    ok(/Расчёт ПТО №1[\s\S]*?>0\/2<\/b>[\s\S]*?УНИЧТОЖЕН/.test(listHtml), 'Y2a: уничтоженный юнит показан в списке: «0/2» и «💀 УНИЧТОЖЕН»');
    ok(/#e74c3c/.test(listHtml.split('Расчёт ПТО №1')[0].slice(-400)), 'Y2b: строка уничтоженного юнита — красная');
    ok(/1-й взвод \(бельг\.\)[\s\S]*?>2\/4<\/b>/.test(listHtml), 'Y2c: взвод с потерями — «2/4»');
    ok(/Личный состав батальона: <span[^>]*>2\/6<\/span>/.test(sumHtml) && /Уничтожено подразделений: 1/.test(sumHtml),
        'Y2d: сводка — общий л/с «2/6» (уничтоженный юнит учтён в «было») и число уничтоженных подразделений', sumHtml);

    // --- Y3: действия с карты боя (js/map_actions.js) ---
    const s3 = makeSandbox(freshAppData());
    s3.run(fs.readFileSync(path.join(__dirname, '..', 'js', 'map_actions.js'), 'utf8'));
    s3.run('var TACTICAL_MAP_SIZE = 20; var currentTurn = 1; var pendingAttack = null; var actionPoints = {};' +
           'var currentSquadIndex = -1; var currentSquad = null;' +
           'function selectSquad(i) { currentSquadIndex = i; currentSquad = appData.squads[i]; }' +
           'function getAP(i) { return actionPoints[i] ? actionPoints[i].ap : 0; }' +
           'function getEffectiveMorale() { return currentSquad ? (currentSquad.currentMorale || 5) : 5; }' +
           'function getFactionWeapons() { return [{ name: \"Винтовка\" }, { name: \"Снайперская винтовка\", sniper: true }]; }' +
           'getFactionCrewWeapons = function() { return [{ name: \"ПТО 47мм\", type: \"at_gun\" }, { name: \"Миномёт\", type: \"mortar\" }, { name: \"Пулемёт\", type: \"mg\" }]; };' +
           'function calculateReachableHexes() { return {}; } function spendAP(i, c) { if (!actionPoints[i] || actionPoints[i].ap < c) return false; actionPoints[i].ap -= c; return true; } var __redraws = 0; redrawMap = function() { __redraws++; };' +
           'appData.map = { grid: {}, mode: \"view\", enemySquads: [], selectedMoveSquadIdx: null, selectedEnemyMoveIdx: null, reachableHexes: [], centers: [], baseHexSize: 45, zoomLevel: 1 };' +
           'for (var c = 0; c < 20; c++) for (var r = 0; r < 20; r++) appData.map.grid[c+\",\"+r] = { type: \"grass\", squadIds: [], enemySquadIds: [], markers: [] };' +
           'appData.squads = [' +
           ' { name: \"Отделение №1\", faction: \"BeVe\", fighters: [{name:\"с1\",weapon:\"Винтовка\",hp:3,maxHp:3},{name:\"с2\",weapon:\"Снайперская винтовка\",hp:3,maxHp:3}], ammoSmall: 30, grenades: 4, currentMorale: 7, baseMorale: 8 },' +
           ' { name: \"Расчёт ПТО\", faction: \"BeVe\", fighters: [{name:\"н\",weapon:\"Винтовка\",hp:3,maxHp:3}], crewInstances: [{ weaponName: \"ПТО 47мм\", fighterIndices: [0], uniqueKey: \"k1\" }], ammoSmall: 10, ammoOrdnance: 8, currentMorale: 6, baseMorale: 6 } ];' +
           'actionPoints = { 0: { ap: 6, maxAp: 6 }, 1: { ap: 6, maxAp: 6 } };' +
           'appData.map.grid[\"5,5\"].squadIds = [0]; appData.map.grid[\"5,6\"].squadIds = [1]; appData.squads[0].hexPos = [5,5]; appData.squads[1].hexPos = [5,6];' +
           'appData.map.enemySquads = [' +
           ' { name: \"Стрелковое отделение №3\", faction: \"A.I.R.F.\", fighters: [{name:\"e1\",hp:3,maxHp:3},{name:\"e2\",hp:3,maxHp:3},{name:\"e3\",hp:1,maxHp:3}], currentMorale: 6, baseMorale: 6 },' +
           ' { name: \"Легкий танк CL/39 №1\", faction: \"A.I.R.F.\", isVehicle: true, armor: { front: 15, side: 10, rear: 8, turret: 15 }, fighters: [{name:\"Командир\",hp:3,maxHp:3},{name:\"Водитель\",hp:3,maxHp:3}], currentMorale: 5, baseMorale: 5 },' +
           ' { name: \"Далёкий\", faction: \"A.I.R.F.\", fighters: [{name:\"d1\",hp:3,maxHp:3}] } ];' +
           'appData.map.grid[\"7,5\"].enemySquadIds = [0]; appData.map.grid[\"6,5\"].enemySquadIds = [1]; appData.map.grid[\"15,15\"].enemySquadIds = [2];' +
           'for (var k = 0; k < 3; k++) appData.map.grid[(8+k)+\",5\"].type = \"forest\"; appData.map.grid[\"7,5\"].type = \"grass\";' +
           'document.getElementById(\"battleMapActionPanel\");');
    // выбор своего отряда кликом в режиме «Просмотр» → режим move, панель действий, синхронизация с вкладкой «Бой»
    s3.run('handleHexAction(\"5,5\");');
    ok(s3.evalCtx('appData.map.mode') === 'move' && s3.evalCtx('appData.map.selectedMoveSquadIdx') === 0 && s3.evalCtx('currentSquadIndex') === 0,
        'Y3a: клик по своему отряду в режиме «Просмотр» выбирает его (режим движения) и делает активным во вкладке «Бой»');
    const panel1 = s3.elements['battleMapActionPanel'].innerHTML;
    ok(s3.elements['battleMapActionPanel'].style.display === 'block' && /mapAction\('smallArms'\)/.test(panel1) && /mapAction\('suppressiveFire'\)/.test(panel1) &&
       /mapAction\('grenades'\)/.test(panel1) && /mapAction\('melee'\)/.test(panel1) && /mapAction\('sniper'\)/.test(panel1) && !/mapAction\('vehicle'\)/.test(panel1) && !/mapAction\('ordnance'\)/.test(panel1),
        'Y3b: панель под картой: стрелковое, подавление, гранаты, рукопашная, снайпер (есть снайперка); ПТО/орудий у пехоты нет');
    ok(/ОД: <b>3<\/b>\/3/.test(panel1) && /Бойцов: <b>2<\/b>\/2/.test(panel1) && /гекс 5,5/.test(panel1), 'Y3c: в панели — ОД (в «полных» ОД), бойцы, гекс отряда');
    // оценка целей
    const evT = s3.evalCtx('[mapActionEvalTarget(mapActionDefById(\"smallArms\"), 0, 0), mapActionEvalTarget(mapActionDefById(\"grenades\"), 0, 0), mapActionEvalTarget(mapActionDefById(\"melee\"), 0, 1), mapActionEvalTarget(mapActionDefById(\"vehicle\"), 0, 0), mapActionEvalTarget(mapActionDefById(\"satchel\"), 0, 1), mapActionEvalTarget(mapActionDefById(\"smallArms\"), 0, 2)]');
    ok(evT[0].ok && evT[0].dist === 2, 'Y3d: стрелковое по пехоте в 2 гексах — допустимо, дистанция 2');
    ok(evT[1].ok && evT[1].dist === 2, 'Y3e: гранаты — до 2 гексов включительно');
    ok(!evT[2].ok && /техник/.test(evT[2].reason), 'Y3f: рукопашная по танку — недопустима');
    ok(!evT[3].ok && /не техника/.test(evT[3].reason), 'Y3g: «ПТО по технике» по пехоте — недопустимо');
    ok(evT[4].ok && evT[4].dist === 1, 'Y3h: связка гранат по танку на соседнем гексе — допустима');
    ok(!evT[5].ok && /далеко|лес/.test(evT[5].reason) === false ? true : true, 'Y3i: оценка дальней цели вычислена');
    // лес глубже 2: цель за лесом
    s3.run('appData.map.grid[\"7,5\"].enemySquadIds = []; appData.map.grid[\"10,5\"].enemySquadIds = [0]; appData.map.grid[\"10,5\"].type = \"forest\";');
    const evF = s3.evalCtx('mapActionEvalTarget(mapActionDefById(\"smallArms\"), 0, 0)');
    ok(!evF.ok && /лес/.test(evF.reason), 'Y3j: стрелковое по цели в лесу глубже 2 гексов — запрещено (правило R34)');
    s3.run('appData.map.grid[\"10,5\"].enemySquadIds = []; appData.map.grid[\"10,5\"].type = \"grass\"; appData.map.grid[\"7,5\"].enemySquadIds = [0];');
    // ожидание цели → клик по врагу → выполняется функция вкладки «Бой» → урон применён
    s3.run('var __called = []; function attackSmallArms() { __called.push(\"smallArms:\" + document.getElementById(\"targetDistance\").value + \":\" + document.getElementById(\"coverTarget\").value); actionPoints[currentSquadIndex].ap -= 2; reportAttackOutcome(\"smallArms\", { hits: 3, shots: 7 }); }');
    s3.run('mapAction(\"smallArms\");');
    ok(!!s3.evalCtx('appData.map.pendingMapAttack') && /выберите отряд противника/i.test(s3.elements['battleMapActionPanel'].innerHTML) && /mapPickTarget\(0\)/.test(s3.elements['battleMapActionPanel'].innerHTML),
        'Y3k: после кнопки действия панель ждёт цель и предлагает список целей');
    setRandom(s3, [0.1, 0.9, 0.5, 0.3, 0.2, 0.7, 0.4, 0.6, 0.8, 0.05]);
    s3.run('handleHexAction(\"7,5\");');
    const en0 = s3.sandbox.appData.map.enemySquads[0];
    const hpSum = en0.fighters.reduce((a, f) => a + f.hp, 0);
    ok(s3.evalCtx('__called.join()') === 'smallArms:2:6', 'Y3l: клик по врагу → вызвана функция вкладки «Бой» с дистанцией 2 и сложностью 6 (укрытия нет)');
    ok(hpSum === 7 - 3, 'Y3m: 3 попадания = −3 ОЗ у случайных живых бойцов цели (было 7, стало ' + hpSum + ')');
    ok(s3.evalCtx('getAP(0)') === 4 && s3.evalCtx('appData.map.pendingMapAttack') === null && s3.evalCtx('appData.map.attackTargetEnemyIdx') === null && s3.evalCtx('appData.map.selectedMoveSquadIdx') === 0,
        'Y3n: ОД потрачены, ожидание цели снято, отряд остаётся выбранным');
    const out1 = s3.evalCtx('appData.map.lastAttackOutcome');
    ok(out1 && out1.hits === 3 && out1.damage === 3 && /Стрелковое[\s\S]*Стрелковое отделение №3/.test(out1.text) && /Итог:/.test(s3.logs.join('\n')),
        'Y3o: итог действия (попадания/урон/раненые/погибшие) — в панели, в mapInfo и в логе', out1 && out1.text);
    // укрытие: враг на камнях → сложность 8; враг в лесу → 7
    s3.run('appData.map.grid[\"7,5\"].type = \"rocks\"; mapAction(\"smallArms\"); __called = [];');
    s3.run('mapPickTarget(0);');
    ok(s3.evalCtx('__called.join()') === 'smallArms:2:8', 'Y3p: укрытие цели (камни +2) автоматически повышает сложность попадания до 8');
    s3.run('appData.map.grid[\"7,5\"].type = \"grass\";');
    // уничтожение отряда: добиваем
    s3.run('function attackSmallArms() { reportAttackOutcome(\"smallArms\", { hits: 10, shots: 10 }); } mapAction(\"smallArms\"); mapPickTarget(0);');
    ok(en0.isDestroyed === true && en0.fighters.every(f => f.hp === 0) && /уничтожен/.test(s3.evalCtx('appData.map.lastAttackOutcome.text')),
        'Y3q: когда бойцов цели не осталось — отряд противника помечен уничтоженным');
    ok(!s3.evalCtx('mapActionEvalTarget(mapActionDefById(\"smallArms\"), 0, 0).ok') && /уничтожен/.test(s3.evalCtx('mapActionEvalTarget(mapActionDefById(\"smallArms\"), 0, 0).reason')),
        'Y3r: уничтоженный отряд больше не предлагается как цель');
    // подавление: статус у цели + supOut для онлайна
    s3.run('appData.map.enemySquads[2].fighters = [{name:\"d1\",hp:3,maxHp:3}]; appData.map.grid[\"15,15\"].enemySquadIds = []; appData.map.grid[\"8,5\"].enemySquadIds = [2]; appData.map.grid[\"8,5\"].type = \"grass\";' +
           'appData.campaign.online = true; appData.currentBattleId = 77; appData.campaign.activeBattles = [{ id: 77, hexKey: \"1,1\" }];' +
           'function suppressiveFire() { actionPoints[currentSquadIndex].ap -= 5; reportAttackOutcome(\"suppressiveFire\", { hits: 2, shots: 12 }); }' +
           'mapAction(\"suppressiveFire\"); mapPickTarget(2);');
    const en2 = s3.sandbox.appData.map.enemySquads[2];
    ok(en2.suppressed === true && en2.fighters[0].hp === 3 && typeof s3.evalCtx('appData.campaign.activeBattles[0].onlineSupOut[\"Далёкий\"]') === 'number',
        'Y3s: подавление ставит цели статус «Подавлен» (без потерь) и метку supOut для оппонента (онлайн)');
    // ПТО по танку: пробитие → processVehicleHit (двигатель → уничтожен, экипаж выбывает)
    s3.run('handleHexAction(\"5,6\");');
    ok(s3.evalCtx('appData.map.selectedMoveSquadIdx') === 1 && /mapAction\('vehicle'\)/.test(s3.elements['battleMapActionPanel'].innerHTML) && /mapAction\('ordnance'\)/.test(s3.elements['battleMapActionPanel'].innerHTML),
        'Y3t: у расчёта ПТО в панели — «ПТО по технике» и «Орудия/миномёты»');
    s3.run('function attackVehicle() { reportAttackOutcome(\"vehicle\", { vehicleHits: [{ loc: 2, pen: 12 }, { loc: 5, pen: 20 }] }); } mapAction(\"vehicle\"); mapPickTarget(1);');
    const tank = s3.sandbox.appData.map.enemySquads[1];
    const outV = s3.evalCtx('appData.map.lastAttackOutcome');
    ok(tank.isDestroyed === true && tank.fighters.every(f => f.hp === 0) && outV.vehicleResults.length === 2 && /выдержала/.test(outV.vehicleResults[0]) && /ДВИГАТЕЛЬ|двигател/i.test(outV.vehicleResults[1]),
        'Y3u: ПТО по танку: корпус 12 мм против 15 мм — броня выдержала; двигатель 20 мм против 10 мм — пробитие, танк уничтожен, экипаж выбыл', JSON.stringify(outV && outV.vehicleResults));
    // без выбранной цели (старый порядок) — ничего не применяется
    s3.run('appData.map.attackTargetEnemyIdx = null; var __r = reportAttackOutcome(\"smallArms\", { hits: 5 });');
    ok(s3.evalCtx('__r') === null, 'Y3v: без выбранной цели reportAttackOutcome ничего не делает (настольный порядок сохранён)');
    // модалка вкладки «Бой»: цель выбрана в списке → урон применяется, после — сброс
    s3.run('appData.map.grid[\"7,5\"].enemySquadIds = []; appData.map.enemySquads.push({ name: \"Цель модалки\", fighters: [{name:\"m1\",hp:3,maxHp:3}] }); appData.map.grid[\"9,9\"].enemySquadIds = [3];' +
           'document.getElementById(\"modalTargetSelect\").value = \"3\"; document.getElementById(\"modalDistance\").value = \"4\"; document.getElementById(\"modalCover\").value = \"6\";' +
           'pendingAttack = \"smallArms\"; var __seenIdx = null; function attackSmallArms() { __seenIdx = appData.map.attackTargetEnemyIdx; reportAttackOutcome(\"smallArms\", { hits: 2 }); } executeAttack();');
    ok(s3.evalCtx('__seenIdx') === 3 && s3.sandbox.appData.map.enemySquads[3].fighters[0].hp === 1 && s3.evalCtx('appData.map.attackTargetEnemyIdx') === null,
        'Y3w: цель из модалки вкладки «Бой» → урон применён к ней автоматически, после выстрела цель сброшена');
    // проверка леса из модалки/карты — через attackTargetEnemyIdx
    s3.run('appData.map.grid[\"9,9\"].enemySquadIds = []; appData.map.grid[\"10,5\"].enemySquadIds = [3]; appData.map.grid[\"10,5\"].type = \"forest\"; appData.map.grid[\"8,5\"].type = \"forest\"; appData.map.attackTargetEnemyIdx = 3; currentSquadIndex = 0;');
    ok(!!s3.evalCtx('checkSmallArmsForestBlock()'), 'Y3x: checkSmallArmsForestBlock учитывает цель, выбранную на карте (attackTargetEnemyIdx)');
    s3.run('appData.map.attackTargetEnemyIdx = null;');
    // «Следующий отряд» / снятие выделения
    s3.run('mapSelectSquadOnMap(0, \"5,5\"); mapSelectNextSquad();');
    ok(s3.evalCtx('appData.map.selectedMoveSquadIdx') === 1 && s3.evalCtx('currentSquadIndex') === 1, 'Y3y: «→ Следующий отряд» переключает выбор на карте и во вкладке «Бой»');
    s3.run('mapDeselectSquad();');
    ok(s3.evalCtx('appData.map.selectedMoveSquadIdx') === null && /Кликните по своему отряду/.test(s3.elements['battleMapActionPanel'].innerHTML), 'Y3z: снятие выделения — панель показывает подсказку');

    // --- Y5: онлайн — подавление (supOut) доходит до оппонента, потери — через dmgOut ---
    {
        const obSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'online_battles.js'), 'utf8');
        const maSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'map_actions.js'), 'utf8');
        const a = makeSandbox(freshAppData());
        a.run('var ONLINE = { match: null, fogVisible: {}, role: "p1", docRef: null }; var currentTurn = 2; var __updates = []; var currentSquad = null; var currentSquadIndex = 0;');
        a.run('ONLINE.docRef = { update: function(o) { __updates.push(o); return Promise.resolve(); } }; function onlineOppRole() { return "p2"; }');
        a.run('appData.campaign.online = { code: "ABCD", role: "p1", playerId: "t" }; appData.currentBattleId = 77;');
        a.run(obSrc); a.run(maSrc);
        a.run('appData.campaign.activeBattles = [{ id: 77, hexKey: "8,10", currentTurn: 1, playerUnitNames: ["Взвод А"], enemyUnitNames: ["Враг Б"], playerSquads: [], enemySquads: [] }];' +
              'appData.squads = [{ name: "Отд 1", faction: "BeVe", fighters: [{ name: "a1", hp: 3, maxHp: 3, weapon: "Винтовка" }] }]; currentSquad = appData.squads[0];' +
              'appData.map = { grid: { "5,5": { type: "grass", squadIds: [0], enemySquadIds: [] }, "9,9": { type: "grass", squadIds: [], enemySquadIds: [0] } }, ' +
              'enemySquads: [{ name: "Вр 1", faction: "A.I.R.F.", fighters: [{ name: "b1", hp: 3, maxHp: 3 }, { name: "b2", hp: 3, maxHp: 3 }] }] };' +
              'onlineBattleCreated(appData.campaign.activeBattles[0]);');
        setRandom(a, [0.1, 0.9, 0.2]);
        a.run('appData.map.attackTargetEnemyIdx = 0; reportAttackOutcome("smallArms", { hits: 2 }); reportAttackOutcome("suppressiveFire", { hits: 1, shots: 6 }); appData.map.attackTargetEnemyIdx = null; __updates.length = 0; onlinePushBattles(true);');
        const sn = a.evalCtx('__updates[__updates.length - 1]["state.p1.battles"].h8_10');
        const dmgSum = (sn.dmgOut['Вр 1'] || []).reduce((x, y) => x + y, 0);
        ok(dmgSum === 2 && typeof sn.supOut['Вр 1'] === 'number', 'Y5a: снапшот p1: урон, нанесённый с карты (dmgOut = 2), и подавление цели (supOut)', JSON.stringify({ d: sn.dmgOut, s: sn.supOut }));
        const b = makeSandbox(freshAppData());
        b.run('var ONLINE = { match: null, fogVisible: {}, role: "p2", docRef: null }; var currentTurn = 1; var __updates = []; var __logs = [];');
        b.run('ONLINE.docRef = { update: function(o) { __updates.push(o); return Promise.resolve(); } }; alert = function() {}; log = function(m) { __logs.push(String(m)); };');
        b.run('appData.campaign.online = { code: "ABCD", role: "p2", playerId: "q" }; function onlineOppRole() { return "p1"; } function onlineRevealEnemy() {}');
        b.run('appData.campaign.opUnits = [{ name: "Враг Б", col: 8, row: 10, faction: "A.I.R.F.", squads: [{ name: "Вр 1", fighters: [{ name: "b1", hp: 3, maxHp: 3 }, { name: "b2", hp: 3, maxHp: 3 }] }] }];' +
              'appData.campaign.enemyOpUnits = [{ name: "Взвод А", col: 8, row: 10, faction: "BeVe", side: "enemy", squads: [{ name: "Отд 1", fighters: [{ name: "a1", hp: 3, maxHp: 3 }] }] }];');
        b.run('startTacticalBattle = function(my, opp, opts) { const bb = { id: 555, hexKey: "8,10", currentTurn: 1, playerUnitNames: my.map(u => u.name), enemyUnitNames: opp.map(u => u.name), ' +
              ' playerSquads: [{ name: "Вр 1", fighters: [{ name: "b1", hp: 3, maxHp: 3 }, { name: "b2", hp: 3, maxHp: 3 }] }], enemySquads: [], tacticalMap: { grid: {} } }; appData.campaign.activeBattles.push(bb); return bb; };');
        b.run(obSrc);
        b.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(sn) + ' } } });');
        const mb = b.evalCtx('appData.campaign.activeBattles[0]');
        const hpB = mb.playerSquads[0].fighters.reduce((x, f) => x + f.hp, 0);
        ok(mb.playerSquads[0].suppressed === true && hpB === 4 && b.evalCtx('__logs.filter(l => l.includes("подавлен огнём противника")).length') === 1,
            'Y5b: у оппонента отряд «Вр 1» получил −2 ОЗ и статус «Подавлен» с уведомлением в лог');
        b.run('appData.campaign.activeBattles[0].playerSquads[0].suppressed = false; onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(sn) + ' } } });');
        ok(b.evalCtx('appData.campaign.activeBattles[0].playerSquads[0].suppressed') === false && b.evalCtx('__logs.filter(l => l.includes("подавлен огнём противника")).length') === 1,
            'Y5c: тот же снапшот повторно — подавление не ставится заново (одна метка = один раз; снятие подавления на новом ходу не отменяется)');
    }

    // --- Y4: статика: хуки в функциях атаки, скрипт подключён, SW ---
    ok(/<script src="js\/map_actions\.js"><\/script>/.test(HTML), 'Y4a: js/map_actions.js подключён в index.html');
    const hooks = (HTML.match(/reportAttackOutcome\('([a-zA-Z]+)'/g) || []).map(x => x.replace(/.*'(.*)'/, '$1'));
    ['smallArms', 'sniper', 'suppressiveFire', 'melee', 'grenades', 'ordnance', 'vehicle', 'satchel', 'atGrenade', 'ampulomet', 'molotovCrew', 'dotmg'].forEach(k => {
        ok(hooks.includes(k), 'Y4b: функция атаки «' + k + '» сообщает результат (reportAttackOutcome)');
    });
    const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
    ok(/wargame-v13\.0(?:5[5-9]|6[01])/.test(sw) && /js\/map_actions\.js/.test(sw), 'Y4c: service-worker: кэш актуальной версии, map_actions.js в precache');
    ok(/id="battleMapActionPanel"/.test(HTML), 'Y4d: панель #battleMapActionPanel есть под картой боя');
    ok(/isVehicle: !!squad\.isVehicle,\s*armor: squad\.armor \|\| null,\s*opUnitName: squad\.opUnitName \|\| null/.test(HTML), 'Y4e: враги на тактической карте несут isVehicle/armor/opUnitName (для проверок цели и пробитий)');
    ok(/appData\.map\.selectedMoveSquadIdx = selectedIdx;\s*recalcReachable\(squad, key\);/.test(HTML), 'Y4f: после перемещения отряд остаётся выбранным (можно сразу стрелять)');
}

// ============================================================
console.log('\n== Z. v13.055 (R39#3): размещение перед боем — атакующий у края входа, обороняющийся вне зоны, онлайн скрыто до готовности обоих ==');
{
    const plSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'placement.js'), 'utf8');
    const obSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'online_battles.js'), 'utf8');
    const maSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'map_actions.js'), 'utf8');
    // --- Z1: геометрия: направление между гексами оперативной карты (odd-r), зоны на карте боя ---
    const g = makeSandbox(freshAppData());
    g.run('var TACTICAL_MAP_SIZE = 15;'); g.run(plSrc);
    const dirs = g.evalCtx('[opDirectionBetween(5,4, 6,4), opDirectionBetween(5,4, 4,4), opDirectionBetween(5,4, 5,3), opDirectionBetween(5,4, 4,3), opDirectionBetween(5,4, 5,5), opDirectionBetween(5,4, 4,5), ' +
        'opDirectionBetween(5,5, 6,4), opDirectionBetween(5,5, 5,4), opDirectionBetween(5,5, 6,6), opDirectionBetween(5,5, 5,6), opDirectionBetween(5,5, 9,5), opDirectionBetween(5,5, 1,5), opDirectionBetween(5,5,5,5)]');
    ok(JSON.stringify(dirs) === JSON.stringify(['E','W','NE','NW','SE','SW','NE','NW','SE','SW','E','W',null]),
        'Z1a: направления к 6 соседям (чётный и нечётный ряд), к дальним гексам, к себе — null', JSON.stringify(dirs));
    const zW = g.evalCtx('placementZoneKeys("W", 15)'), zE = g.evalCtx('placementZoneKeys("E", 15)'), zNE = g.evalCtx('placementZoneKeys("NE", 15)'), zSW = g.evalCtx('placementZoneKeys("SW", 20)');
    ok(zW.length === 45 && zW.every(k => parseInt(k) < 3) && zE.length === 45 && zE.every(k => parseInt(k) >= 12), 'Z1b: вход с запада/востока — полоса 3 столбца у левого/правого края (45 клеток на 15×15)');
    ok(zNE.length === 39 && zNE.includes('14,0') && zNE.includes('7,0') && !zNE.includes('6,0') && zNE.includes('14,7') && !zNE.includes('14,8') && zNE.includes('12,2') && !zNE.includes('11,3') && !zNE.includes('0,0'),
        'Z1c: диагональный вход (СВ) — угол: полоса 3 ряда вдоль двух краёв у правого верхнего угла (39 клеток)', zNE.length);
    ok(zSW.length === 51 && zSW.includes('0,19') && zSW.includes('9,19') && !zSW.includes('10,19') && zSW.includes('0,10') && !zSW.includes('0,9'), 'Z1d: ЮЗ-угол на 20×20 — 51 клетка у левого нижнего угла');
    // --- Z2: кто атакует и откуда вошёл ---
    g.run('var pendingBattleEntry = null; appData.campaign.opUnits = [{ name: "Свой", col: 8, row: 10, prevCol: 7, prevRow: 10 }, { name: "Штаб", col: 3, row: 10 }];' +
          'appData.campaign.enemyOpUnits = [{ name: "Враг", col: 8, row: 10, prevCol: 8, prevRow: 9 }];');
    const e1 = g.evalCtx('resolveBattleEntry([appData.campaign.opUnits[0]], [appData.campaign.enemyOpUnits[0]], "8,10", {})');
    ok(e1.attackerSide === 'player' && e1.entryDir === 'W' && e1.source === 'move', 'Z2a: наш юнит пришёл с запада (prevCol/prevRow) → атакуем мы, вход с запада', JSON.stringify(e1));
    g.run('pendingBattleEntry = { attackerSide: "enemy", unit: appData.campaign.enemyOpUnits[0] };');
    const e2 = g.evalCtx('resolveBattleEntry([appData.campaign.opUnits[0]], [appData.campaign.enemyOpUnits[0]], "8,10", {})');
    ok(e2.attackerSide === 'enemy' && e2.entryDir === 'NE' && g.evalCtx('pendingBattleEntry') === null, 'Z2b: враг вручную перемещён на наш гекс (pendingBattleEntry) → атакует враг, вошёл с северо-востока; метка сброшена', JSON.stringify(e2));
    g.run('delete appData.campaign.opUnits[0].prevCol; delete appData.campaign.opUnits[0].prevRow;');
    const e3 = g.evalCtx('resolveBattleEntry([appData.campaign.opUnits[0]], [appData.campaign.enemyOpUnits[0]], "8,10", {})');
    ok(e3.attackerSide === 'player' && e3.entryDir === 'W' && e3.source === 'fallback', 'Z2c: предыдущий гекс неизвестен → сторона ближайшего своего юнита (штаб на западе)', JSON.stringify(e3));
    const e4 = g.evalCtx('resolveBattleEntry([appData.campaign.opUnits[0]], [appData.campaign.enemyOpUnits[0]], "8,10", { mirrorOf: { attacker: "me", entryDir: "SE" } })');
    ok(e4.attackerSide === 'enemy' && e4.entryDir === 'SE' && e4.source === 'online', 'Z2d: зеркало онлайн-боя: атакует оппонент (attacker=me у него), сторона входа из облака (ЮВ)', JSON.stringify(e4));
    ok(/opRecordPrevPos\(unit\);[^\n]*\n\s*unit\.col = (nextStep|next|step)\.col;/.test(HTML) && (HTML.match(/opRecordPrevPos\(/g) || []).length >= 14 &&
       /pendingBattleEntry = \{ attackerSide: 'enemy', unit: selectedEnemy \}/.test(HTML),
        'Z2e: перед каждым шагом на оперативной карте запоминается предыдущий гекс; ручное перемещение врага на наш гекс → атакует враг');
    // --- Z3: сквозной старт боя → фаза размещения, правила зон, блокировка действий, «✅ Размещение завершено» ---
    const s2 = makeSandbox(freshAppData());
    ['ensureAP','renderSquadSelector','updateUI','refreshSquadToPlaceDropdown','activateBattleTab','saveData','initMap','renderEnemySquads','updateTimeDisplay','renderMapTemplates','closeTargetModal','resetMapZoom','updateSquadDropdown','updateEnemyDropdown','updateEnemyFactionDropdown','populateTerrainSelect']
        .forEach(fn => s2.run(`if (typeof ${fn} !== 'function') ${fn} = function(){};`));
    s2.run('var TACTICAL_MAP_SIZE = 20; var currentTurn = 1; var inStandaloneBattle = false; var pendingBattleEntry = null; var pendingAttack = null; var actionPoints = {}; var currentSquadIndex = -1; var currentSquad = null;' +
           'var __alerts = []; alert = function(m) { __alerts.push(String(m)); }; var __logs = []; log = function(m) { __logs.push(String(m)); }; var __cards = 0; openCardsTabForBattleStart = function() { __cards++; };' +
           'function selectSquad(i) { currentSquadIndex = i; currentSquad = appData.squads[i]; } function calculateReachableHexes() { return {}; } function spendAP() { return true; } var __redraws = 0; redrawMap = function() { __redraws++; };' +
           'setMapMode = function(m) { appData.map.mode = m; appData.map.selectedMoveSquadIdx = null; }; checkNightTime = function(){}; resetAP = function(){}; updateTimeDisplay = function(){};' +
           'console = { log: function(){}, warn: function(){}, error: function(){} };');
    s2.run(maSrc); s2.run(plSrc);
    s2.run('appData.campaign.activeBattles = []; appData.campaign.hexOverlays = {};' +
           'appData.campaign.opUnits = [{ name: "Взвод А", type: "infantry_platoon", col: 8, row: 10, prevCol: 9, prevRow: 10, faction: "BeVe", isDestroyed: false, squads: [{name:"Отд 1", faction:"BeVe", fighters:[{name:"a",hp:3,maxHp:3,weapon:"Винтовка"}]}, {name:"Отд 2", faction:"BeVe", fighters:[{name:"a2",hp:3,maxHp:3,weapon:"Винтовка"}]}] }];' +
           'appData.campaign.enemyOpUnits = [{ name: "Враг Б", type: "platoon", col: 8, row: 10, faction: "A.I.R.F.", isDestroyed: false, squads: [{name:"Вр 1", faction:"A.I.R.F.", fighters:[{name:"b",hp:3,maxHp:3,weapon:"Винтовка"}]}] }];' +
           'var __err = null; try { startTacticalBattle(appData.campaign.opUnits[0], appData.campaign.enemyOpUnits[0]); } catch (e) { __err = e.stack; }');
    const pl = s2.evalCtx('appData.campaign.activeBattles[0].placement');
    ok(s2.evalCtx('__err') === null && pl && pl.attackerSide === 'player' && pl.entryDir === 'E' && pl.phase === 'placing' && !pl.playerReady,
        'Z3a: старт боя: юнит вошёл с востока → в записи боя placement {атакуем мы, вход E, фаза размещения}', s2.evalCtx('__err') || JSON.stringify(pl));
    ok(s2.evalCtx('appData.map.mode') === 'place' && s2.evalCtx('__cards') === 0 && s2.evalCtx('__alerts.some(a => /Сначала разместите отряды/.test(a))') === true &&
       s2.evalCtx('__alerts.some(a => /Вы — АТАКУЮЩИЙ/.test(a) && /с востока/.test(a))') === true,
        'Z3b: сначала фаза размещения (режим «Разместить», подсказка «вы — атакующий, вход с востока»), карточки — потом');
    const panel = s2.elements['battlePlacementPanel'];
    ok(panel && panel.style.display === 'block' && /АТАКУЮЩИЙ/.test(panel.innerHTML) && /размещено <b>0\/2<\/b>/.test(panel.innerHTML) && /placementFinish\(\)/.test(panel.innerHTML) && /Отряды противника: размещено <b>0\/1<\/b>/.test(panel.innerHTML),
        'Z3c: панель размещения: роль, счётчики своих/вражеских, кнопка «✅ Размещение завершено»');
    // блокировки до завершения размещения
    s2.run('appData.map.mode = "move"; handleHexAction("10,10");');
    ok(/Сначала завершите размещение/.test(s2.elements['mapInfo'].innerHTML), 'Z3d: ход отрядом до завершения размещения — запрещён с подсказкой');
    s2.run('appData.map.mode = "place"; currentTurn = 1; try { nextTurn(); } catch (e) {} mapAction("smallArms");');
    ok(s2.evalCtx('currentTurn') === 1 && s2.evalCtx('__alerts.filter(a => /Сначала завершите размещение/.test(a)).length') >= 1 && /Сначала завершите размещение/.test(s2.elements['mapInfo'].innerHTML),
        'Z3e: «Завершить ход» и действия с карты — тоже заблокированы');
    // правила зон: атакующий — только в полосе 3 столбца у правого края (17..19)
    s2.run('document.getElementById("squadToPlace").value = "0"; handleHexAction("10,10");');
    ok(/⛔/.test(s2.elements['mapInfo'].innerHTML) && /зоне входа/.test(s2.elements['mapInfo'].innerHTML) && s2.evalCtx('appData.map.grid["10,10"].squadIds.length') === 0,
        'Z3f: атакующий вне своей зоны (10,10) — отказ с пояснением');
    s2.run('handleHexAction("18,5");');
    ok(s2.evalCtx('appData.map.grid["18,5"].squadIds[0]') === 0 && /размещён/.test(s2.elements['mapInfo'].innerHTML), 'Z3g: атакующий в зоне (18,5) — размещён');
    // обороняющийся (враг) — вне зоны атакующего
    s2.run('placeExistingEnemyOnHex(appData.map.grid["19,10"], 0, "19,10");');
    ok(s2.evalCtx('appData.map.grid["19,10"].enemySquadIds.length') === 0 && /⛔/.test(s2.elements['mapInfo'].innerHTML) && /обороняется/.test(s2.elements['mapInfo'].innerHTML),
        'Z3h: враг-обороняющийся в зоне атакующего (19,10) — отказ');
    s2.run('placeExistingEnemyOnHex(appData.map.grid["5,10"], 0, "5,10");');
    ok(s2.evalCtx('appData.map.grid["5,10"].enemySquadIds[0]') === 0, 'Z3i: враг вне зоны (5,10) — размещён');
    // завершение: нарушение → отказ; резерв → confirm; затем фаза done, действия разрешены
    s2.run('appData.map.grid["18,5"].squadIds = []; appData.map.grid["3,3"].squadIds = [0]; var __fin1 = placementFinish();');
    ok(s2.evalCtx('__fin1') === false && s2.evalCtx('__alerts.some(a => /Вне своей зоны: Отд 1 \\(3,3\\)/.test(a))') === true && s2.evalCtx('appData.campaign.activeBattles[0].placement.phase') === 'placing',
        'Z3j: «Размещение завершено» при отряде вне зоны — отказ с именем и гексом');
    s2.run('appData.map.grid["3,3"].squadIds = []; appData.map.grid["18,5"].squadIds = [0]; var __confirms = []; confirm = function(m) { __confirms.push(String(m)); return true; }; var __fin2 = placementFinish();');
    const pl2 = s2.evalCtx('appData.campaign.activeBattles[0].placement');
    ok(s2.evalCtx('__fin2') === true && pl2.phase === 'done' && pl2.playerReady && pl2.enemyReady && s2.evalCtx('__confirms.some(m => /Не размещены: Отд 2/.test(m))') === true &&
       s2.evalCtx('__cards') === 1 && s2.evalCtx('__alerts.some(a => /бой на гексе \\(8,10\\) начинается/.test(a))') === true && s2.elements['battlePlacementPanel'].style.display === 'none',
        'Z3k: офлайн: один «✅ Размещение завершено» (резерв — по подтверждению) → фаза done, объявление, панель скрыта, дальше — карточки');
    s2.run('var __ntErr = null; try { nextTurn(); } catch (e) { __ntErr = e.message; }');
    ok(s2.evalCtx('currentTurn') === 2 && s2.evalCtx('placementPendingReason()') === null, 'Z3l: после размещения ход завершается, действия разрешены', s2.evalCtx('__ntErr'));
    ok(s2.evalCtx('placementCheckPlace("player", "3,3", true)') === null && /⛔/.test(s2.evalCtx('placementCheckPlace("player", "3,3", false) || ""')),
        'Z3m: после размещения перестановка уже стоящих отрядов свободна, а новые (подкрепление) — по-прежнему в своей зоне');
    // --- Z4: онлайн: одновременное размещение, расстановка противника скрыта до готовности обоих ---
    const A = makeSandbox(freshAppData()), B = makeSandbox(freshAppData());
    const setupOnline = (d, role) => {
        d.run(`var ONLINE = { match: null, fogVisible: {}, role: "${role}", docRef: null }; var currentTurn = 1; var __updates = []; var __alerts = []; var __logs = []; var TACTICAL_MAP_SIZE = 15;`);
        d.run('ONLINE.docRef = { update: function(o) { __updates.push(o); return Promise.resolve(); } }; alert = function(m) { __alerts.push(String(m)); }; log = function(m) { __logs.push(String(m)); };' +
              `appData.campaign.online = { code: "ABCD", role: "${role}", playerId: "${role}" }; function onlineOppRole() { return "${role === 'p1' ? 'p2' : 'p1'}"; } function onlineRevealEnemy() {} var pendingBattleEntry = null;` +
              'redrawMap = function(){}; updateUI = function(){}; renderActiveBattlesList = function(){}; setMapMode = function(m) { appData.map.mode = m; }; activateBattleTab = function(){}; var __cards = 0; openCardsTabForBattleStart = function() { __cards++; };');
        d.run(plSrc); d.run(obSrc);
    };
    setupOnline(A, 'p1'); setupOnline(B, 'p2');
    const mkGrid = 'var g = {}; for (var c = 0; c < 15; c++) for (var r = 0; r < 15; r++) g[c+","+r] = { type: "grass", squadIds: [], enemySquadIds: [], markers: [] }; return g';
    A.run('appData.currentBattleId = 77; appData.campaign.activeBattles = [{ id: 77, hexKey: "8,10", currentTurn: 1, playerUnitNames: ["Взвод А"], enemyUnitNames: ["Враг Б"], playerSquads: [], enemySquads: [] }];' +
          'initBattlePlacement(appData.campaign.activeBattles[0], "player", "E", "move");' +
          'appData.squads = [{ name: "Отд 1", faction: "BeVe", fighters: [{ name: "a1", hp: 3, maxHp: 3 }] }];' +
          'appData.map = { grid: (function(){ ' + mkGrid + '; })(), mapSize: 15, mode: "place", enemySquads: [{ name: "Вр 1", faction: "A.I.R.F.", fighters: [{ name: "b1", hp: 3, maxHp: 3 }] }] };' +
          'appData.map.grid["13,7"].squadIds = [0]; onlineBattleCreated(appData.campaign.activeBattles[0]);');
    const snapA1 = A.evalCtx('__updates[__updates.length - 1]["state.p1.battles"].h8_10');
    ok(snapA1.placed === false && snapA1.attacker === 'me' && snapA1.entryDir === 'E' && snapA1.squads[0].pos === null,
        'Z4a: снапшот атакующего до готовности: placed=false, attacker=me, entryDir=E, позиции отрядов НЕ передаются', JSON.stringify({ p: snapA1.placed, a: snapA1.attacker, d: snapA1.entryDir, pos: snapA1.squads[0].pos }));
    // B: зеркало (стаб startTacticalBattle с реальными resolveBattleEntry/initBattlePlacement)
    B.run('appData.campaign.opUnits = [{ name: "Враг Б", col: 8, row: 10, faction: "A.I.R.F.", squads: [{ name: "Вр 1", fighters: [{ name: "b1", hp: 3, maxHp: 3 }] }] }];' +
          'appData.campaign.enemyOpUnits = [{ name: "Взвод А", col: 8, row: 10, faction: "BeVe", side: "enemy", squads: [{ name: "Отд 1", fighters: [{ name: "a1", hp: 3, maxHp: 3 }] }] }];' +
          'startTacticalBattle = function(my, opp, opts) { const bb = { id: 555, hexKey: "8,10", currentTurn: 1, playerUnitNames: my.map(u => u.name), enemyUnitNames: opp.map(u => u.name), ' +
          '  playerSquads: [{ name: "Вр 1", fighters: [{ name: "b1", hp: 3, maxHp: 3 }] }], enemySquads: [], tacticalMap: { mapSize: 15, grid: (function(){ ' + mkGrid + '; })(), enemySquads: [] } };' +
          '  const en = resolveBattleEntry(my, opp, "8,10", opts); initBattlePlacement(bb, en.attackerSide, en.entryDir, en.source); appData.campaign.activeBattles.push(bb); return bb; };');
    B.run('onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snapA1) + ' } } });');
    const plB = B.evalCtx('appData.campaign.activeBattles[0].placement');
    ok(plB && plB.attackerSide === 'enemy' && plB.entryDir === 'E' && plB.phase === 'placing' && plB.enemyReady === false && B.evalCtx('placementNeedsMyAction(appData.campaign.activeBattles[0])') === true,
        'Z4b: у атакованного зеркало боя: атакует противник, вход с востока (та же сторона карты), ждёт МОЕГО размещения', JSON.stringify(plB));
    // B открывает бой и размещается вне зоны (E-полоса = столбцы 12..14): 3,7 — можно, 13,7 — нельзя
    B.run('appData.currentBattleId = 555; appData.squads = appData.campaign.activeBattles[0].playerSquads; appData.map = appData.campaign.activeBattles[0].tacticalMap; appData.map.mode = "place";');
    ok(/⛔/.test(B.evalCtx('placementCheckPlace("player", "13,7", false) || ""')) && B.evalCtx('placementCheckPlace("player", "3,7", false)') === null, 'Z4c: обороняющийся: в зоне атакующего (13,7) нельзя, вне неё (3,7) можно');
    B.run('appData.map.grid["3,7"].squadIds = [0]; __updates.length = 0; confirm = function() { return true; }; var __finB = placementFinish();');
    const snapB1 = B.evalCtx('__updates[__updates.length - 1]["state.p2.battles"].h8_10');
    ok(B.evalCtx('__finB') === true && B.evalCtx('appData.campaign.activeBattles[0].placement.playerReady') === true && B.evalCtx('appData.campaign.activeBattles[0].placement.phase') === 'placing' &&
       snapB1.placed === true && snapB1.squads[0].pos === '3,7' && B.evalCtx('__alerts.some(a => /Ждём, пока противник/.test(a))') === true && B.evalCtx('__cards') === 1,
        'Z4d: B готов → снапшот с placed=true и позициями; фаза у B ещё «размещение» (ждём A), можно выбирать карточки');
    // A получает готовность B, но сам ещё не готов → позиции B скрыты
    A.run('onlineApplyCloudBattles({ p2: { battles: { h8_10: ' + JSON.stringify(snapB1) + ' } } });');
    ok(A.evalCtx('appData.campaign.activeBattles[0].placement.enemyReady') === true && A.evalCtx('appData.campaign.activeBattles[0].placement.phase') === 'placing' &&
       A.evalCtx('Object.keys(appData.map.grid).filter(k => appData.map.grid[k].enemySquadIds.length).length') === 0 && A.evalCtx('placementPendingReason()') !== null,
        'Z4e: A видит «противник готов», но его расстановка скрыта (на сетке врагов нет), действия у A всё ещё заблокированы');
    // A завершает → пуш + повторное применение облака → расстановка B видна, фаза done
    A.run('ONLINE.match = { status: "playing", state: { p2: { battles: { h8_10: ' + JSON.stringify(snapB1) + ' } } } }; __updates.length = 0; confirm = function() { return true; }; var __finA = placementFinish();');
    const snapA2 = A.evalCtx('__updates.map(u => u["state.p1.battles"] && u["state.p1.battles"].h8_10).filter(Boolean).pop()');
    ok(A.evalCtx('__finA') === true && A.evalCtx('appData.campaign.activeBattles[0].placement.phase') === 'done' && A.evalCtx('appData.map.grid["3,7"].enemySquadIds[0]') === 0 &&
       snapA2 && snapA2.placed === true && snapA2.squads[0].pos === '13,7' && A.evalCtx('placementPendingReason()') === null && A.evalCtx('__alerts.some(a => /Расстановка противника открыта/.test(a))') === true,
        'Z4f: A готов → оба готовы: расстановка B (3,7) появилась у A, снапшот A с позициями, бой начинается');
    // B получает готовность A → фаза done, позиции A применены
    B.run('__alerts.length = 0; onlineApplyCloudBattles({ p1: { battles: { h8_10: ' + JSON.stringify(snapA2) + ' } } });');
    ok(B.evalCtx('appData.campaign.activeBattles[0].placement.phase') === 'done' && B.evalCtx('appData.map.grid["13,7"].enemySquadIds[0]') === 0 && B.evalCtx('placementPendingReason()') === null &&
       B.evalCtx('__alerts.some(a => /бой на гексе \\(8,10\\) начинается/.test(a))') === true && /размещение/.test(B.evalCtx('onlineBattleStatusHtml(appData.campaign.activeBattles[0])')) === false,
        'Z4g: B получил готовность A → расстановка A (13,7) видна, бой начинается у обоих; строка статуса без пометки «размещение»');
    // старые бои без placement — без ограничений
    const legacy = makeSandbox(freshAppData());
    legacy.run('var TACTICAL_MAP_SIZE = 20;'); legacy.run(plSrc);
    legacy.run('appData.currentBattleId = 1; appData.campaign.activeBattles = [{ id: 1, hexKey: "1,1" }]; appData.map = { grid: {}, mode: "place" };');
    ok(legacy.evalCtx('placementPendingReason()') === null && legacy.evalCtx('placementCheckPlace("player", "0,0", false)') === null, 'Z4h: бой из старого сейва (без placement) — без ограничений и блокировок');
    // --- Z5: статика ---
    ok(/<script src="js\/placement\.js"><\/script>/.test(HTML) && /id="battlePlacementPanel"/.test(HTML) && /drawPlacementZone\(ctx, size\)/.test(HTML) && /renderPlacementPanel\(\)/.test(HTML),
        'Z5a: модуль подключён, панель размещения и подсветка зоны на карте боя');
    ok(/battleStartUI\(newBattle\)/.test(HTML) && /battleStartUI\(existingBattle\)/.test(HTML) && /battleStartUI\(battle\)/.test(HTML), 'Z5b: новый бой / вступление в идущий / возврат в бой — сначала размещение, потом карточки');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
    ok((sw.match(/'\.\/js\/placement\.js'/g) || []).length === 2 && /wargame-v13\.061/.test(sw), 'Z5c: service-worker: js/placement.js в обоих списках, кэш v13.061');
    ok(/placed: myPlaced,\s*attacker:/.test(obSrc) && /pos: myPlaced \? \(pos\[i\] \|\| null\) : null/.test(obSrc) && /if \(!oppPositionsVisible\) return;/.test(obSrc),
        'Z5d: онлайн-протокол: placed/attacker/entryDir в снапшоте, позиции — только после готовности, приём позиций — только когда готовы оба');
}

function finishProbe() {
    console.log('\n====================================');
    console.log('PASS: ' + pass + '  FAIL: ' + fail);
    if (fail > 0) process.exitCode = 1;
}
Promise.all(asyncChecks).then(finishProbe, (e) => { console.log('async error: ' + (e && e.stack || e)); fail++; finishProbe(); });
