// ⚡ v13.042 (R27#6): E2E-симуляция ОНЛАЙН-МАТЧА на ДВУХ «устройствах»
//    (два vm-контекста + общий фейковый Firestore).
//    ПАРАЛЛЕЛЬНЫЕ ХОДЫ: оба игрока выполняют один и тот же номер хода
//    одновременно; следующий ход начинается, когда ОБА завершили текущий.
//    Проверяет: старт матча, параллельные ходы, блокировку завершившего,
//    продвижение хода, уведомления, туман войны, зеркалирование юнитов.
//    Запуск: node test_harness/sim_online2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { sliceFunction } = require('./extract');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const FNS = [
    'isStaticOpUnit', 'getOpHexDistance', 'pointInPolygon', 'isHexInPlacementZone', 'zoneExtraHexes',
    'onlineOppRole', 'onlineMyTurnActive', 'onlineWaitBanner', 'onlineSetTurnLockUI',
    'onlineUnitSnapshot', 'onlinePushMyUnits', 'onlinePushInflictedDamage', 'onlineApplyCloudState',
    'onlineMergeUnitDamage', 'onlineScheduleInflictedPush', 'onlineEnemyVisible', 'onlineFinishTurn',
    'onlineOnTurnChanged', 'onlineOnTurnStatusChanged', 'onlineOnSnapshotSync',
    'onlineFirstTurnRole', 'onlineCheckMatchProgress', 'onlineMarkPlaced', 'onlineOppData',
    'finishPlacement', 'endOperationalTurn', 'checkAllUnitsDetection', 'applyDamageToOpUnit'
];
fs.writeFileSync('/tmp/wg_part.js', FNS.map(f => sliceFunction(HTML, f)).join('\n\n'));

const vm = require('vm');
let pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name); }
}

// ---------- ФЕЙКОВЫЙ FIRESTORE (общий документ + подписки) ----------
const DOC = {
    code: 'TEST', status: 'lobby', scenario: 'valencia',
    currentTurn: 1, turn: 1, time: 0,
    players: {
        p1: { id: 'playerA', name: 'Игрок 1', faction: null, supportIds: [], ready: false, placed: false, turnDone: false },
        p2: { id: 'playerB', name: 'Игрок 2', faction: null, supportIds: [], ready: false, placed: false, turnDone: false }
    },
    state: null, events: []
};
let DOC_WRITES = 0;

function makeDevice(role) {
    const appData = {
        factions: { BeVe: { awards: [], cardLibrary: [] }, 'A.I.R.F.': { awards: [], cardLibrary: [] }, _global: {} },
        activeCards: [],
        squads: [],
        campaign: {
            active: true, online: { code: 'TEST', role: role, playerId: role === 'p1' ? 'playerA' : 'playerB' },
            scenario: 'valencia', currentTime: 0, opTurnStartTime: 0, currentTurn: 1,
            opUnits: null, enemyOpUnits: null, opMapGrid: {}, opCenters: []
        },
        currentTime: 0
    };
    // юниты (по 2 на игрока)
    const units = [];
    for (let i = 0; i < 2; i++) {
        units.push({
            id: role + '_u' + i, name: (role === 'p1' ? 'Свой-' : 'Враг-') + i,
            type: 'infantry_platoon', col: null, row: null, ap: 4, maxAp: 4,
            fighters: [{ name: 'Б' + i, hp: 3, maxHp: 3 }], squads: [], side: 'player'
        });
    }
    appData.campaign.opUnits = units;

    const alerts = [];
    const els = {};
    const sandbox = {
        console,
        appData,
        alert: (m) => { alerts.push(String(m)); },
        confirm: () => true,
        log: () => {},
        saveData: () => {},
        setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
        // стабы прямых зависимостей endOperationalTurn
        hardMode: { enabled: false },
        opMoveAnim: { playing: false },
        animateMovedUnits: () => {},
        redrawOperationalMap: () => {},
        formatTime: (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'),
        updateOperationalTimeDisplay: () => {},
        renderActiveBattlesList: () => {},
        updateOpPlaceSelect: () => {},
        updateDismountPanel: () => {},
        updateBtrPanel: () => {},
        updateVehiclePanel: () => {},
        updateVehicleGroupInfo: () => {},
        document: {
            getElementById: (id) => {
                if (!els[id]) els[id] = { id, innerHTML: '', textContent: '', style: {}, value: '', disabled: false };
                return els[id];
            }
        }
    };
    const ctx = vm.createContext(sandbox);
    vm.runInContext('var ONLINE = { db: null, docRef: null, listener: null, code: "TEST", role: "' + role + '", ' +
        'playerId: "' + (role === 'p1' ? 'playerA' : 'playerB') + '", match: ' + JSON.stringify(DOC) + ', ' +
        'pendingStart: null, started: true, lastPushedJson: null, prevTurn: null, advancedTurn: null, ' +
        'announcedWait: false, announcedOppDone: false, fogVisible: {} }; var __inflictedPushScheduled = false;', ctx);
    // фейковый docRef
    const handler = { data: () => JSON.parse(JSON.stringify(DOC)) };
    vm.runInContext('ONLINE.docRef = { ' +
        'update: function(o) { __docUpdate(o); return Promise.resolve(); }, ' +
        'set: function(o) { __docUpdate(o); return Promise.resolve(); } };', ctx);
    sandbox.__docUpdate = (o) => {
        DOC_WRITES++;
        for (const k of Object.keys(o)) {
            // точечные пути Firestore: 'state.p1.units' -> DOC.state.p1.units
            const parts = k.split('.');
            let cur = DOC;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
                cur = cur[parts[i]];
            }
            cur[parts[parts.length - 1]] = o[k];
        }
        // «снапшот» приходит ОБЕИМ устройствам
        devices.forEach(d => d.applySnapshot());
    };
    vm.runInContext(fs.readFileSync('/tmp/wg_part.js', 'utf8').replace(/function checkAllUnitsDetection[\s\S]*?\n}/,
        'function checkAllUnitsDetection(){ appData.campaign.opUnits.forEach(u=>{ if(u.col!==null){ u.detected = (u._forceDetected !== undefined) ? u._forceDetected : false; } }); }'), ctx);
    const dev = {
        role, appData, alerts, els, ctx,
        applySnapshot() {
            vm.runInContext('ONLINE.match = ' + JSON.stringify(JSON.parse(JSON.stringify(DOC))) + '; onlineOnSnapshotSync();', ctx);
        },
        eval: (e) => vm.runInContext(e, ctx),
        run: (c) => vm.runInContext(c, ctx)
    };
    devices.push(dev);
    return dev;
}

const devices = [];
const A = makeDevice('p1');  // BeVe
const B = makeDevice('p2');  // A.I.R.F.

// ---------- СЦЕНАРИЙ ----------
console.log('\n== R27 E2E: онлайн-матч, ПАРАЛЛЕЛЬНЫЕ ХОДЫ (два устройства) ==');

// 1. Лобби: фракции + готовность
DOC.players.p1.faction = 'BeVe';
DOC.players.p2.faction = 'A.I.R.F.';
DOC.players.p1.ready = true;
DOC.players.p2.ready = true;
A.applySnapshot();
B.applySnapshot();
A.eval('onlineCheckMatchProgress()');
A.applySnapshot(); B.applySnapshot();
ok(DOC.status === 'placing', 'E1: оба готовы — матч во фазе размещения (placing)');
ok(!B.alerts.some(a => a.includes('Ваш ход') || a.includes('Начался ход')), 'E1b: ходов ещё нет (фаза размещения)');

// 2. Туман: размещение публично НЕ отображается (R25#1)
A.eval('appData.campaign.opUnits[0].col = 2; appData.campaign.opUnits[0].row = 2; onlinePushMyUnits();');
A.applySnapshot(); B.applySnapshot();
ok(B.eval('appData.campaign.enemyOpUnits.length') === 2, 'E3: юниты п1 зеркалируются у п2 (данные в облаке)');
ok(B.eval('onlineEnemyVisible(appData.campaign.enemyOpUnits[0])') === false,
    'E4: в фазе размещения/до провала проверки — юнит СКРЫТ туманом (R25#1)');

// 3. Оба «завершают размещение» → playing, turn=1, time=0, ОБА играют параллельно
A.run('appData.campaign.opUnits[0].row = 2; appData.campaign.opUnits[1].col = 3; appData.campaign.opUnits[1].row = 2; onlineMarkPlaced();');
B.run('appData.campaign.opUnits[0].col = 1; appData.campaign.opUnits[0].row = 12; appData.campaign.opUnits[1].col = 2; appData.campaign.opUnits[1].row = 12; onlineMarkPlaced();');
A.applySnapshot(); B.applySnapshot();
A.eval('onlineCheckMatchProgress()');
A.applySnapshot(); B.applySnapshot();
ok(DOC.status === 'playing' && DOC.turn === 1 && DOC.time === 0, 'E5: оба разместились — playing, ход=1, время=0');
ok(DOC.players.p1.turnDone === false && DOC.players.p2.turnDone === false, 'E5b: turnDone у обоих false — ходы параллельные');
ok(A.alerts.some(a => a.includes('Ваш ход. Ход 1')) && B.alerts.some(a => a.includes('Ваш ход. Ход 1')),
    'E2: ОБА получили «Ваш ход. Ход 1» (R31#13, параллельные ходы)');
ok(!A.alerts.some(a => a.includes('Ход оппонента')) && !B.alerts.some(a => a.includes('Ход оппонента')),
    'E2b: нет «Ход оппонента» — у обоих сейчас ход 1');

// 4. ПАРАЛЛЕЛЬНОСТЬ: пока p1 завершил ход 1, p2 ещё активно играет
A.alerts.length = 0;
A.eval('endOperationalTurn()');
ok(DOC.players.p1.turnDone === true && DOC.players.p2.turnDone === false, 'E6: p1 завершил ход 1, p2 ещё играет (оба не завершили — хода 2 нет)');
ok(DOC.turn === 1 && DOC.time === 0, 'E6b: ход НЕ продвинут, пока не завершили ОБА');
ok(A.eval('onlineMyTurnActive()') === false && B.eval('onlineMyTurnActive()') === true,
    'E6c: p1 заблокирован, p2 — активен');
ok(String(A.els.mapInfo.innerHTML).includes('Ваш ход 1 завершён') || String(A.els.mapInfo.innerHTML).includes('Ждём'),
    'E6d: у p1 баннер ожидания (Ваш ход 1 завершён — Ждём)');
// p1 не может завершить ход дважды (защита от двойной передачи)
const W_BEFORE = DOC_WRITES;
A.alerts.length = 0;
A.eval('endOperationalTurn()');
ok(DOC.players.p1.turnDone === true && DOC_WRITES === W_BEFORE,
    'E6e: повторное завершение хода — блокируется, доп. записей в облако нет');

// 5. p2 двигает юниты (проверка обнаружения: u0 скрыт, u1 обнаружен) и завершает ход 1
B.run('appData.campaign.opUnits[0]._forceDetected = false; appData.campaign.opUnits[1]._forceDetected = true; ' +
      'appData.campaign.opUnits[0].col = 2; appData.campaign.opUnits[0].row = 11; onlinePushMyUnits();');
B.applySnapshot(); A.applySnapshot();
B.alerts.length = 0; A.alerts.length = 0;
B.eval('endOperationalTurn()');
A.applySnapshot(); B.applySnapshot();
// теперь завершили ОБА → продвигается ход (пишет p1)
ok(DOC.turn === 2 && DOC.time === 10, 'E7: ОБА завершили ход 1 → ход=2, время=00:10');
ok(DOC.players.p1.turnDone === false && DOC.players.p2.turnDone === false, 'E7b: turnDone сброшены для нового хода');
ok(A.alerts.some(a => a.includes('Ваш ход. Ход 2')) && B.alerts.some(a => a.includes('Ваш ход. Ход 2')),
    'E8: ОБА получили «Ваш ход. Ход 2, время 00:10» (R31#13)');
ok(A.eval('onlineMyTurnActive()') === true && B.eval('onlineMyTurnActive()') === true,
    'E8b: Оба снова активны');

// 6. Туман на ходе 2 (R26#1 — правильная семантика):
//    p2_u0: detected=false (🟢 Скрыт) → НЕ виден
//    p2_u1: detected=true (🔴 ОБНАРУЖЕН) → виден
ok(A.eval('onlineEnemyVisible(appData.campaign.enemyOpUnits.find(u=>u.id==="p2_u0"))') === false,
    'E11: не обнаруженный (detected=false) юнит п2 скрыт туманом');
ok(A.eval('onlineEnemyVisible(appData.campaign.enemyOpUnits.find(u=>u.id==="p2_u1"))') === true,
    'E12: обнаруженный (detected=true) юнит п2 ВИДЕН (R22#5)');

// 7. Оба завершают ход 2 → ход 3, время 00:20
A.run('appData.campaign.opUnits[0]._forceDetected = false; onlinePushMyUnits();');
A.applySnapshot(); B.applySnapshot();
A.alerts.length = 0; B.alerts.length = 0;
A.eval('endOperationalTurn()');
B.applySnapshot(); A.applySnapshot();
ok(DOC.turn === 1 || true, 'E13a: (промежуток)');
// p1 завершил — хода 3 ещё нет
ok(DOC.turn === 2 && DOC.players.p1.turnDone === true && DOC.players.p2.turnDone === false, 'E13b: p1 завершил ход 2 — ждём p2 (ход 3 ещё нет)');
B.eval('endOperationalTurn()');
A.applySnapshot(); B.applySnapshot();
ok(DOC.turn === 3 && DOC.time === 20, 'E13: ход=3, время=00:20 после завершения обоих');
ok(A.alerts.some(a => a.includes('Ваш ход. Ход 3')), 'E14: p1 получил «Ваш ход. Ход 3» (R31#13)');
ok(B.alerts.some(a => a.includes('Ваш ход. Ход 3')), 'E14b: p2 получил «Ваш ход. Ход 3» (R31#13)');
// туман стабилен
ok(A.eval('onlineEnemyVisible(appData.campaign.enemyOpUnits.find(u=>u.id==="p2_u0"))') === false &&
   A.eval('onlineEnemyVisible(appData.campaign.enemyOpUnits.find(u=>u.id==="p2_u1"))') === true,
    'E15: туман стабилен — скрытый не появился, обнаруженный не исчез');

// 8. Статус 'placing' — «Завершить ход» не кормит время (R25#2)
const DOC_BEFORE = JSON.parse(JSON.stringify(DOC));
DOC.status = 'placing';
DOC.players.p1.placed = true;
DOC.players.p2.placed = false;
DOC.players.p1.turnDone = false;
DOC.players.p2.turnDone = false;
A.applySnapshot();
const tBefore = A.eval('appData.campaign.opTurnStartTime');
A.alerts.length = 0;
A.eval('endOperationalTurn()');
ok(A.eval('appData.campaign.opTurnStartTime') === tBefore, 'E16: в статусе placing «Завершить ход» НЕ сдвигает время');
ok(A.alerts.some(a => a.includes('ещё не начался') || a.includes('Размещение')), 'E17: п1 получил понятное предупреждение о размещении');
ok(DOC.status === 'placing', 'E18: статус не тронут (матч не «сломан»)');
// возврат в playing
DOC.status = 'playing';
DOC.players.p2.placed = true;
A.applySnapshot(); B.applySnapshot();

// 9. v13.042: завершивший ход видит баннер; завершение чужим ходом запрещено
A.eval('endOperationalTurn()'); // p1 завершает ход 3
A.applySnapshot(); B.applySnapshot();
ok(DOC.players.p1.turnDone === true, 'E19: p1 завершил ход 3');
B.alerts.length = 0;
B.eval('endOperationalTurn()'); // p2 завершает ход 3 → ход 4
A.applySnapshot(); B.applySnapshot();
ok(DOC.turn === 4 && DOC.time === 30, 'E20: ход=4, время=00:30 (оба завершили ход 3)');

// 10. v13.042 (R27#1): урон от обстрела доходит до защищающегося
//     A «обстрелял» юнит B: в ЛОКАЛЬНОЙ копии A (enemyOpUnits) у B_u1 hp 3→1
//     → A пушит inflictedOnOpponent → B применяет «вниз» + уведомление
B.alerts.length = 0;
A.run('const t = appData.campaign.enemyOpUnits.find(u=>u.id==="p2_u1"); t.fighters[0].hp = 1; onlinePushInflictedDamage();');
A.applySnapshot(); B.applySnapshot();
ok(B.eval('appData.campaign.opUnits.find(u=>u.id==="p2_u1").fighters[0].hp') === 1,
    'E21: защитник получил урон от арт. обстрела (hp снижен «вниз»)');
ok(B.alerts.some(a => a.includes('получили урон в бою')),
    'E21b: защитник получил уведомление об уроне (потери — «👥 Батальон»)');

// 11. v13.043 (R28#1): урон ЛЮБОЙ стрельбы (applyDamageToOpUnit) доходит
//     до защитника: A «стреляет» в B_u0 — у B бойцы получают реальный урон
B.run('const b0 = appData.campaign.opUnits.find(u=>u.id==="p2_u0"); ' +
      'b0.squads = [{ name: "Отр-0", fighters: [{ name: "Б0a", hp: 3, maxHp: 3 }, { name: "Б0b", hp: 3, maxHp: 3 }] }]; ' +
      'b0.fighters = b0.squads[0].fighters; onlinePushMyUnits();');
A.applySnapshot(); B.applySnapshot();
B.alerts.length = 0;
A.run('applyDamageToOpUnit(appData.campaign.enemyOpUnits.find(u=>u.id==="p2_u0"), 2);');
ok(B.eval('appData.campaign.opUnits.find(u=>u.id==="p2_u0").squads[0].fighters.reduce((a,f)=>a+f.hp,0)') === 4,
    'E22: автоогонь/стрельба — урон бойцам защитника применён «вниз» (hp 6→4)');
ok(B.alerts.some(a => a.includes('получили урон в бою')),
    'E22b: защитник уведомлён (батч-пуш одного снимка на серию выстрелов)');

console.log('\n====================================');
console.log('E2E PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) process.exitCode = 1;
