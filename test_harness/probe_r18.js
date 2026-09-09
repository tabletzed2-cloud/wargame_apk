// ⚡ dev-пробник R18: v13.025 (AIRF), v13.026 (Van Hees), v13.027 (HQ +20%),
//    v13.028 (BeVe без пушек + автопересборка сейвов) + regression обстрела
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
    'pointInPolygon', 'isHexInPlacementZone',
    'openOnlineMenu', 'onlineDiagnostics', 'onlineFirebaseReady', 'onlineCreateRoom', 'onlineJoinRoom',
    'onlineBody', 'onlineGoToCampaign', 'closeOnlineModal', 'onlineShowJoin',
    'onlineSelfTest', 'onlineSelfTestMeaning'
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
    const hitLine = s.logs.find(l => l.includes('Попаданий:'));
    ok(!!hitLine, 'F2: итог «Попаданий: H/20» в логе', hitLine);
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
    // M1: каждая установленная icon ведёт на существующий файл (или icon = null → эмодзи)
    let missing = [];
    Object.keys(map).forEach(k => {
        if (map[k].icon && !fs.existsSync(path2.join(root, map[k].icon))) missing.push(map[k].icon);
    });
    ok(missing.length === 0, 'M1: все установленные файлы иконок меток на месте', missing.join(', '));
    // M2: fallback — нормальный эмодзи, а не «??»
    const badFb = Object.keys(map).filter(k => map[k].fallback === '??' || map[k].fallback === '???');
    ok(badFb.length === 0, 'M2: fallback без «??» (эмодзи)', JSON.stringify(badFb));
    // M3: сгенерированные v13.029 иконки удалены — у меток icon = null
    const nullIcons = ['detected', 'noise', 'artillery', 'ammoPoint', 'destroyedVehicle', 'destroyedSquadFriendly', 'destroyedSquadEnemy', 'dot'];
    const wrong = nullIcons.filter(k => map[k].icon !== null);
    ok(wrong.length === 0, 'M3: 8 сгенерированных иконок удалены (icon = null, метка = эмодзи)', JSON.stringify(wrong));
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
    ok(nBe === 43 && nAi === 14, `N2: вершин: BeVe=${nBe} (ожид. 43), AIRF=${nAi} (ожид. 14)`);
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

console.log('\n====================================');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) process.exitCode = 1;
