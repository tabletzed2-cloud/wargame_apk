// ⚡ v13.040 (R25): E2E-симуляция ОНЛАЙН-МАТЧА на ДВУХ «устройствах»
//    (два vm-контекста + общий фейковый Firestore).
//    Проверяет: старт матча, строгий порядок ходов, передача хода,
//    уведомления, туман войны, зеркалирование юнитов.
//    Запуск: node test_harness/sim_online2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { sliceFunction } = require('./extract');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const FNS = [
    'isStaticOpUnit', 'getOpHexDistance', 'pointInPolygon', 'isHexInPlacementZone', 'zoneExtraHexes',
    'onlineOppRole', 'onlineMyTurnActive', 'onlineWaitBanner', 'onlineSetTurnLockUI',
    'onlineUnitSnapshot', 'onlinePushMyUnits', 'onlineApplyCloudState',
    'onlineEnemyVisible', 'onlineHandTurn', 'onlineOnTurnChanged', 'onlineOnSnapshotSync',
    'onlineFirstTurnRole', 'onlineCheckMatchProgress', 'onlineMarkPlaced', 'onlineOppData',
    'finishPlacement', 'endOperationalTurn', 'checkAllUnitsDetection'
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
    currentTurn: 1, whoseTurn: null, turn: 1, time: 0,
    players: {
        p1: { id: 'playerA', name: 'Игрок 1', faction: null, supportIds: [], ready: false, placed: false },
        p2: { id: 'playerB', name: 'Игрок 2', faction: null, supportIds: [], ready: false, placed: false }
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
        setTimeout: () => 0,
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
        'pendingStart: null, started: true, lastPushedJson: null, prevWhoseTurn: null, fogPending: {}, fogVisible: {} };', ctx);
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
console.log('\n== R25 E2E: онлайн-матч (два устройства) ==');

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
ok(!B.alerts.some(a => a.includes('Ваш ход')), 'E1b: ходов ещё нет (фаза размещения) — уведомлений «Ваш ход»');

// 2. Туман: размещение публично НЕ отображается (R25#1)
A.eval('appData.campaign.opUnits[0].col = 2; appData.campaign.opUnits[0].row = 2; onlinePushMyUnits();');
A.applySnapshot(); B.applySnapshot();
ok(B.eval('appData.campaign.enemyOpUnits.length') === 2, 'E3: юниты п1 зеркалируются у п2 (данные в облаке)');
ok(B.eval('onlineEnemyVisible(appData.campaign.enemyOpUnits[0])') === false,
    'E4: в фазе размещения/до провала проверки — юнит СКРЫТ туманом (R25#1)');

// 3. Оба «завершают размещение»
A.run('appData.campaign.opUnits[0].row = 2; appData.campaign.opUnits[1].col = 3; appData.campaign.opUnits[1].row = 2; onlineMarkPlaced();');
B.run('appData.campaign.opUnits[0].col = 1; appData.campaign.opUnits[0].row = 12; appData.campaign.opUnits[1].col = 2; appData.campaign.opUnits[1].row = 12; onlineMarkPlaced();');
A.applySnapshot(); B.applySnapshot();
A.eval('onlineCheckMatchProgress()');
A.applySnapshot(); B.applySnapshot();
ok(DOC.status === 'playing' && DOC.whoseTurn === 'p2' && DOC.turn === 1, 'E5: оба разместились — playing, первый ход у A.I.R.F. (p2), ход=1');
ok(B.alerts.some(a => a.includes('Ваш ход') && a.includes('ход 1')), 'E2: п2 (A.I.R.F.) получил «Ваш ход, ход 1»');
ok(!A.alerts.some(a => a.includes('Ваш ход')), 'E2b: п1 (BeVe) не получил «Ваш ход» (ещё не его)');
ok(A.alerts.some(a => a.includes('Ход оппонента')), 'E2c: п1 получил «Ход оппонента» (ждёт)');

// 4. Ход 1 — у п2. п1 пытается завершить ход — НЕ его ход
A.alerts.length = 0;
A.eval('endOperationalTurn()');
ok(DOC.whoseTurn === 'p2' && DOC.turn === 1, 'E6: завершение хода НЕ-своим игроком не передаёт ход');
ok(String(A.els.mapInfo.innerHTML).includes('ждём') || String(A.els.mapInfo.innerHTML).includes('Ход оппонента'), 'E6b: на карте п1 баннер «ждём оппонента»');

// 5. Ход п2: п2 двигает юнит и завершает ход (проверка обнаружения: провал)
B.run('appData.campaign.opUnits[0]._forceDetected = false; appData.campaign.opUnits[1]._forceDetected = true; ' +
      'appData.campaign.opUnits[0].col = 2; appData.campaign.opUnits[0].row = 11; onlinePushMyUnits();');
B.applySnapshot(); A.applySnapshot();
B.alerts.length = 0;
B.eval('endOperationalTurn()');
A.applySnapshot(); B.applySnapshot();
ok(DOC.whoseTurn === 'p1', 'E7: ход передан п2→п1 (whoseTurn=p1)');
ok(DOC.turn === 2 && DOC.time === 10, 'E8: общий счётчик: ход=2, время=+10');
ok(A.alerts.some(a => a.includes('Ваш ход') && a.includes('ход 2')), 'E9: п1 получил «Ваш ход, ход 2» (после хода оппонента)');
ok(B.alerts.some(a => a.includes('Ход оппонента') && a.includes('ход 2')), 'E10: п2 получил уведомление «Ход оппонента» (передача подтверждена)');

// 6. Туман на ходе п1: п2-юнит с detected=false ЕЩЁ СКРЫТ (появится в начале хода п2)
ok(A.eval('onlineEnemyVisible(appData.campaign.enemyOpUnits.find(u=>u.id==="p2_u0"))') === false,
    'E11: проваливший проверку юнит п2 ещё скрыт в ход п1 (R22#5 — ждём начало хода оппонента)');
// detected=true юнит — тоже скрыт (видимость только по провалу/разведке)
ok(A.eval('onlineEnemyVisible(appData.campaign.enemyOpUnits.find(u=>u.id==="p2_u1"))') === false,
    'E12: обнаруженный (detected=true) юнит в тумане (видимость — только провал/разведка/обстрел)');

// 7. Ход п1: п1 завершает ход → туман открывается (начало хода п2)
A.run('appData.campaign.opUnits[0]._forceDetected = false; onlinePushMyUnits();');
A.applySnapshot(); B.applySnapshot();
A.alerts.length = 0;
A.eval('endOperationalTurn()');
A.applySnapshot(); B.applySnapshot();
ok(DOC.whoseTurn === 'p2' && DOC.turn === 3 && DOC.time === 20, 'E13: ход п1→п2, ход=3, время=20');
ok(A.eval('onlineEnemyVisible(appData.campaign.enemyOpUnits.find(u=>u.id==="p2_u0"))') === true,
    'E14: в начале хода оппонента проваливший проверку юнит СТАЛ видим (R22#5)');
ok(B.alerts.some(a => a.includes('Ваш ход') && a.includes('ход 3')), 'E15: п2 получил «Ваш ход, ход 3»');

// 8. Статус 'placing' — «Завершить ход» не кормит время (R25#2)
const DOC_BEFORE = JSON.parse(JSON.stringify(DOC));
DOC.status = 'placing';
DOC.players.p1.placed = true;
DOC.players.p2.placed = false;
DOC.whoseTurn = 'p1';
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

// 9. Рассинхрон whoseTurn — передача по действию игрока (R25#2)
DOC.whoseTurn = 'p2'; // «официально» ход п2
A.applySnapshot();
A.alerts.length = 0;
A.eval('onlineHandTurn()'); // п1 «закончил свой ход» при рассинхроне whoseTurn
A.applySnapshot(); B.applySnapshot();
ok(DOC.whoseTurn === 'p2' && DOC.turn === 4, 'E19: при рассинхроне whoseTurn — onlineHandTurn всё равно передаёт ход (turn=4, ход → оппоненту п1)');

console.log('\n====================================');
console.log('E2E PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) process.exitCode = 1;
