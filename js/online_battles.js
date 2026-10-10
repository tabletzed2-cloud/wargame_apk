// v13.062: monotonic turn handoff; synchronize routing and melee without stale phase rollback.
// ⚡ v13.061: sync retreat state and attacker/defender phase in online battle snapshots.
// ============================================================
// ⚡ v13.051 (R36#5): ОБЩИЕ ТАКТИЧЕСКИЕ БОИ В ОНЛАЙН-МАТЧЕ
//   Раньше тактический бой существовал только на устройстве того, кто его
//   начал: атакованный игрок его не видел вовсе. Теперь:
//   • начавший бой пушит его в облако: state.<роль>.battles.<hКлюч> —
//     гекс, участники, СВОИ отряды (позиции на карте боя, бойцы, hp),
//     накопленный урон, нанесённый отрядам оппонента (dmgOut), и сколько
//     урона оппонента уже применено к своим (dmgIn);
//   • атакованный получает «зеркало» боя (тот же гекс → та же карта поля
//     боя + правки, его юниты на гексе → его отряды; отряды оппонента —
//     с позициями из облака), уведомление и запись в «⚔️ Текущие бои»;
//   • обе стороны играют своими отрядами на своих устройствах; изменения
//     (позиции, потери, ход) синхронизируются через облако с задержкой
//     ~1 с; урон оппоненту передаётся дельтами (dmgOut/dmgIn) — устойчиво
//     к порядку доставки и к лечению санитаром;
//   • «⏹ Завершить бой» одной стороны отмечается у другой; каждая сторона
//     завершает бой сама (потери уже синхронизированы).
//   Ходы боя у сторон независимые (как параллельные ходы оперативной карты).
// ============================================================

let __onlineBattlePushTimer = null;
let __onlineBattleLastJson = null;
// ⚡ v13.052 (R37#4): отметка времени каждой записи меняется ТОЛЬКО когда меняется
//    её содержимое — иначе два клиента бесконечно «пинг-понговали» пушами
//    (каждый приём чужого updatedAt → свой пуш с новым updatedAt → …).
const __onlineBattleEntrySig = {};
function onlineBattleStampEntries(out) {
    const seen = {};
    Object.keys(out).forEach(k => {
        const e = out[k];
        const prevAt = e.updatedAt;
        const sig = JSON.stringify(e, (key, v) => (key === 'updatedAt') ? undefined : v);
        const prev = __onlineBattleEntrySig[k];
        if (prev && prev.sig === sig) e.updatedAt = prev.at;
        else __onlineBattleEntrySig[k] = { sig: sig, at: (e.updatedAt = (typeof prevAt === 'number' && prevAt && prev === undefined) ? prevAt : Date.now()) };
        seen[k] = true;
    });
    Object.keys(__onlineBattleEntrySig).forEach(k => { if (!seen[k]) delete __onlineBattleEntrySig[k]; });
    return out;
}

function onlineBattlesEnabled() {
    return !!(typeof appData !== 'undefined' && appData.campaign && appData.campaign.online &&
        typeof ONLINE !== 'undefined' && ONLINE && ONLINE.docRef && ONLINE.role);
}

function onlineBattleKey(hexKey) {
    return 'h' + String(hexKey || '').replace(/[^0-9]/g, '_');
}

// Живой ли это бой (открыт на экране) — тогда актуальные данные в appData.squads / appData.map
function onlineBattleIsLive(battle) {
    return !!(battle && typeof appData !== 'undefined' && appData.currentBattleId === battle.id);
}

function onlineBattleMySquads(battle) {
    return onlineBattleIsLive(battle) ? (appData.squads || []) : (battle.playerSquads || []);
}
function onlineBattleEnemySquads(battle) {
    if (onlineBattleIsLive(battle)) {
        if (!appData.map.enemySquads) appData.map.enemySquads = [];
        return appData.map.enemySquads;
    }
    // не открытый бой: при входе (switchToBattle) загружается battle.tacticalMap —
    // значит, правим tacticalMap.enemySquads (индексы grid.enemySquadIds — по нему),
    // а battle.enemySquads (копия для syncBattleLossesToCampaign) выравниваем после слияния
    if (!battle.tacticalMap) battle.tacticalMap = { grid: {}, enemySquads: [] };
    if (!Array.isArray(battle.tacticalMap.enemySquads)) {
        battle.tacticalMap.enemySquads = Array.isArray(battle.enemySquads)
            ? battle.enemySquads.map(e => JSON.parse(JSON.stringify(e))) : [];
    }
    return battle.tacticalMap.enemySquads;
}
function onlineSyncBattleEnemyCopy(battle) {
    if (onlineBattleIsLive(battle)) return;
    if (battle.tacticalMap && Array.isArray(battle.tacticalMap.enemySquads)) {
        battle.enemySquads = battle.tacticalMap.enemySquads.map(e => JSON.parse(JSON.stringify(e)));
    }
}
function onlineBattleGrid(battle) {
    if (onlineBattleIsLive(battle)) return (appData.map && appData.map.grid) || {};
    return (battle.tacticalMap && battle.tacticalMap.grid) || {};
}

// позиции отрядов по сетке: индекс отряда → 'c,r'
function onlineSquadPositions(grid, field) {
    const pos = {};
    Object.keys(grid || {}).forEach(k => {
        const cell = grid[k];
        if (!cell) return;
        (cell[field] || []).forEach(i => { pos[i] = k; });
    });
    return pos;
}

// накопленный урон отрядам оппонента (по разнице с последним известным hp)
function onlineAccumulateDmgOut(battle) {
    const enemies = onlineBattleEnemySquads(battle);
    if (!battle.onlineDmgOut) battle.onlineDmgOut = {};
    if (!battle.onlineOppHpSeen) battle.onlineOppHpSeen = {};
    enemies.forEach(s => {
        if (!s || !s.name) return;
        const seen = battle.onlineOppHpSeen[s.name] || (battle.onlineOppHpSeen[s.name] = []);
        const out = battle.onlineDmgOut[s.name] || (battle.onlineDmgOut[s.name] = []);
        (s.fighters || []).forEach((f, i) => {
            const hp = (typeof f.hp === 'number') ? f.hp : 0;
            if (seen[i] === undefined || seen[i] === null) { seen[i] = hp; return; }
            if (hp < seen[i]) out[i] = (out[i] || 0) + (seen[i] - hp);
            seen[i] = hp;
        });
    });
}

// Firestore не принимает undefined (в т.ч. «дырки» в разреженных массивах) — нормализуем
function onlineDmgPlain(map) {
    const out = {};
    Object.keys(map || {}).forEach(name => {
        const arr = map[name];
        if (!Array.isArray(arr)) return;
        out[name] = Array.from(arr, v => (typeof v === 'number' && isFinite(v)) ? v : 0);
    });
    return out;
}

function onlineBattleSnapshot(battle, status) {
    const live = onlineBattleIsLive(battle);
    const squads = onlineBattleMySquads(battle);
    const pos = onlineSquadPositions(onlineBattleGrid(battle), 'squadIds');
    onlineAccumulateDmgOut(battle);
    // ⚡ v13.055 (R39#3): фаза размещения — позиции своих отрядов уходят оппоненту
    //    только после «✅ Размещение завершено» (расстановка скрыта до готовности обоих)
    const pl = battle.placement || null;
    const myPlaced = !pl || !!pl.playerReady;
    const localActiveSide = (typeof getTacticalActiveSide === 'function')
        ? getTacticalActiveSide(battle)
        : (battle.activeSide || (pl && pl.attackerSide === 'enemy' ? 'enemy' : 'player'));
    const localAttackerSide = pl && pl.attackerSide === 'enemy' ? 'enemy' : 'player';
    const activeSide = localActiveSide === localAttackerSide ? 'attacker' : 'defender';
    return {
        placed: myPlaced,
        attacker: pl ? (pl.attackerSide === 'player' ? 'me' : 'opp') : null,
        activeSide: activeSide,
        phaseRevision: battle.phaseRevision || 0,
        entryDir: pl ? (pl.entryDir || null) : null,
        id: battle.id,
        hexKey: battle.hexKey,
        status: status || (battle.onlineFinished ? 'finished' : 'active'),
        turn: live ? ((typeof currentTurn !== 'undefined' && currentTurn) || battle.currentTurn || 1) : (battle.currentTurn || 1),
        myUnitNames: battle.playerUnitNames || (battle.playerUnitName ? battle.playerUnitName.split(', ') : []),
        oppUnitNames: battle.enemyUnitNames || (battle.enemyUnitName ? battle.enemyUnitName.split(', ') : []),
        startedBy: battle.onlineMirror ? 'opponent' : 'me',
        oppBattleId: battle.onlineOppBattleId || null,
        updatedAt: Date.now(),
        squads: squads.map((s, i) => ({
            name: s.name,
            opUnitName: s.opUnitName || null,
            faction: s.faction || null,
            icon: s.icon || s.vehicleIcon || null,
            isVehicle: !!s.isVehicle,
            armor: s.armor || null,
            pos: myPlaced ? (pos[i] || null) : null,
            hidden: !!s.hidden,
            detected: !!s.detected,
            firedThisTurn: !!(s.actionsThisTurn && (s.actionsThisTurn.shots || 0) > 0),
            isDestroyed: !!s.isDestroyed,
            isRetreated: !!s.isRetreated,
            isRouting: !!s.isRouting,
            meleeOpponentName: s.meleeOpponentName || null,
            dismounted: !!s.dismounted,
            status: s.status || null,
            retreatReason: s.retreatReason || null,
            retreatTurn: Number.isFinite(s.retreatTurn) ? s.retreatTurn : null,
            suppressed: !!s.suppressed,
            currentMorale: (s.currentMorale !== undefined) ? s.currentMorale : null,
            fighters: (s.fighters || []).map(f => ({
                name: f.name || null, weapon: f.weapon || null,
                hp: (typeof f.hp === 'number') ? f.hp : 0,
                maxHp: (typeof f.maxHp === 'number') ? f.maxHp : ((typeof f.hp === 'number') ? f.hp : 0)
            }))
        })),
        moraleOut: onlineSupPlain(battle.onlineMoraleOut),
        moraleIn: onlineSupPlain(battle.onlineMoraleIn),
        dmgOut: onlineDmgPlain(battle.onlineDmgOut),
        dmgIn: onlineDmgPlain(battle.onlineDmgIn),
        // ⚡ v13.054 (R39#4): подавление отрядов оппонента моим огнём с карты
        //    {имя отряда: метка времени} — у оппонента отряд получит «Подавлен»
        supOut: onlineSupPlain(battle.onlineSupOut)
    };
}

function onlineSupPlain(map) {
    const out = {};
    Object.keys(map || {}).forEach(name => {
        const v = map[name];
        if (typeof v === 'number' && isFinite(v)) out[name] = v;
    });
    return out;
}

// ---------- ПУШ ----------
function onlinePushBattles(immediate) {
    if (!onlineBattlesEnabled()) return;
    const m = ONLINE.match;
    if (m && m.status !== 'playing' && m.status !== 'placing') return;
    const out = {};
    (appData.campaign.activeBattles || []).forEach(b => {
        if (!b || !b.hexKey) return;
        out[onlineBattleKey(b.hexKey)] = onlineBattleSnapshot(b);
    });
    // завершённые с моей стороны — оппонент должен об этом узнать
    const fin = appData.campaign.onlineFinishedBattles || {};
    Object.keys(fin).forEach(k => {
        const f = fin[k];
        if (!f || !f.hexKey) return;
        if (out[onlineBattleKey(f.hexKey)]) return; // новый бой на этом гексе — важнее
        out[onlineBattleKey(f.hexKey)] = { id: f.id, hexKey: f.hexKey, status: 'finished', turn: f.turn || 1,
            oppBattleId: f.oppBattleId || null, updatedAt: f.at || Date.now(), squads: [],
            dmgOut: onlineDmgPlain(f.dmgOut), dmgIn: onlineDmgPlain(f.dmgIn) };
    });
    onlineBattleStampEntries(out);
    const json = JSON.stringify(out);
    if (json === __onlineBattleLastJson) return;
    __onlineBattleLastJson = json;
    ONLINE.docRef.update({ ['state.' + ONLINE.role + '.battles']: out })
        .catch(e => { __onlineBattleLastJson = null; console.warn('onlinePushBattles:', e.message); });
}

function onlineScheduleBattlePush(delayMs) {
    if (!onlineBattlesEnabled()) return;
    if (__onlineBattlePushTimer) return;
    __onlineBattlePushTimer = setTimeout(() => {
        __onlineBattlePushTimer = null;
        try { onlinePushBattles(); } catch (e) { console.warn('onlinePushBattles:', e.message); }
    }, (delayMs === undefined) ? 1000 : delayMs);
}

// Вызывается из saveData(): открытый бой → отправка с задержкой
function onlineBattleOnSave() {
    if (typeof appData === 'undefined' || !appData || !appData.currentBattleId) return;
    if (!onlineBattlesEnabled()) return;
    onlineScheduleBattlePush(1000);
}

// Бой создан у меня (я начал или получил зеркало) — сразу в облако
function onlineBattleCreated(battle) {
    if (!onlineBattlesEnabled() || !battle) return;
    // начальные «известные» hp отрядов оппонента — чтобы урон считался от них
    onlineAccumulateDmgOut(battle);
    onlinePushBattles(true);
}

// Я завершил бой — запоминаем (чтобы не получить зеркало заново) и сообщаем
function onlineBattleFinished(battle) {
    if (typeof appData === 'undefined' || !appData.campaign || !battle) return;
    if (!appData.campaign.online) return;
    onlineAccumulateDmgOut(battle);
    if (!appData.campaign.onlineFinishedBattles) appData.campaign.onlineFinishedBattles = {};
    appData.campaign.onlineFinishedBattles[onlineBattleKey(battle.hexKey)] = {
        id: battle.id, hexKey: battle.hexKey, turn: battle.currentTurn || 1,
        oppBattleId: battle.onlineOppBattleId || null, at: Date.now(),
        moraleOut: onlineSupPlain(battle.onlineMoraleOut),
        moraleIn: onlineSupPlain(battle.onlineMoraleIn),
        dmgOut: onlineDmgPlain(battle.onlineDmgOut), dmgIn: onlineDmgPlain(battle.onlineDmgIn)
    };
    battle.onlineFinished = true;
    if (onlineBattlesEnabled()) {
        // бой ещё в списке — снапшот уйдёт со статусом finished
        try { onlinePushBattles(true); } catch (e) {}
        // а после удаления из списка — из onlineFinishedBattles
        onlineScheduleBattlePush(300);
    }
}

// ---------- ПРИЁМ ----------
function onlineApplyCloudBattles(state) {
    if (!onlineBattlesEnabled()) return;
    if (!state) return;
    const oppRole = (typeof onlineOppRole === 'function') ? onlineOppRole() : (ONLINE.role === 'p1' ? 'p2' : 'p1');
    const oppBattles = (state[oppRole] && state[oppRole].battles) || null;
    if (!oppBattles || typeof oppBattles !== 'object') return;
    let changedAny = false;
    let mineChanged = false; // ⚡ v13.052: ответный пуш — только если изменились мои данные
    Object.keys(oppBattles).forEach(k => {
        const e = oppBattles[k];
        if (!e || !e.hexKey) return;
        let battle = (appData.campaign.activeBattles || []).find(b => b && b.hexKey === e.hexKey);
        if (!battle) {
            if (e.status !== 'active') return;
            const fin = (appData.campaign.onlineFinishedBattles || {})[onlineBattleKey(e.hexKey)];
            // я уже завершил этот бой (или он завершён раньше, чем начат новый) — не воскрешаем
            if (fin && (fin.oppBattleId === e.id || (typeof e.id === 'number' && typeof fin.at === 'number' && e.id <= fin.at))) return;
            if (fin && e.oppBattleId && fin.id === e.oppBattleId) return;
            if (appData.currentBattleId) return; // я в другом бою — создадим зеркало, когда выйду
            battle = onlineCreateMirrorBattle(e);
            if (!battle) return;
            changedAny = true;
            mineChanged = true;
        }
        __onlineMergeMineChanged = false;
        if (onlineMergeOppBattle(battle, e)) changedAny = true;
        if (__onlineMergeMineChanged) mineChanged = true;
    });
    if (changedAny) {
        try { saveData(); } catch (e) {}
        if (typeof renderActiveBattlesList === 'function') { try { renderActiveBattlesList(); } catch (e) {} }
        if (appData.currentBattleId) {
            if (typeof redrawMap === 'function') { try { redrawMap(); } catch (e) {} }
            if (typeof updateUI === 'function') { try { updateUI(); } catch (e) {} }
        } else if (typeof redrawOperationalMap === 'function') {
            // потери на оперативной карте + отправка своих юнитов (внутри redraw)
            try { redrawOperationalMap(); } catch (e) {}
        }
        // подтверждение принятого урона (dmgIn) / привязка боёв — оппоненту.
        // ⚡ v13.052: только если изменилось МОЁ (иначе — вечный обмен пушами)
        if (mineChanged) onlineScheduleBattlePush(1000);
    }
}

// Повторная проверка облака (после выхода из боя: отложенные зеркала)
function onlineBattlesRecheck() {
    if (!onlineBattlesEnabled() || !ONLINE.match) return;
    onlineApplyCloudBattles(ONLINE.match.state || {});
}

function onlineCreateMirrorBattle(e) {
    const parts = String(e.hexKey).split(',').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    const [col, row] = parts;
    const myUnits = (appData.campaign.opUnits || []).filter(u => u && !u.isDestroyed &&
        ((Array.isArray(e.oppUnitNames) && e.oppUnitNames.includes(u.name)) || (u.col === col && u.row === row)));
    if (myUnits.length === 0) return null; // моих юнитов там (уже) нет — зеркалить нечего
    let oppUnits = (appData.campaign.enemyOpUnits || []).filter(u => u && !u.isDestroyed &&
        ((Array.isArray(e.myUnitNames) && e.myUnitNames.includes(u.name)) || (u.col === col && u.row === row)));
    if (oppUnits.length === 0 && Array.isArray(e.squads) && e.squads.length > 0) {
        // юнитов оппонента в моём снапшоте нет — временный юнит из данных боя
        oppUnits = [{
            name: (e.myUnitNames && e.myUnitNames[0]) || 'Противник', col: col, row: row, side: 'enemy',
            faction: e.squads[0].faction || null,
            squads: e.squads.map(s => ({ name: s.name, faction: s.faction, icon: s.icon, armor: s.armor, isVehicle: s.isVehicle,
                fighters: (s.fighters || []).map(f => ({ name: f.name, weapon: f.weapon, hp: f.hp, maxHp: f.maxHp })) }))
        }];
    }
    if (oppUnits.length === 0) return null;
    // юниты оппонента, вошедшие в бой, — известны (бой не спрячешь)
    oppUnits.forEach(u => { if (typeof onlineRevealEnemy === 'function') onlineRevealEnemy(u, ((appData.campaign.currentTurn || 1) + 1)); });
    let battle = null;
    try {
        battle = startTacticalBattle(myUnits, oppUnits, { silent: true, mirrorOf: e });
    } catch (err) {
        console.warn('onlineCreateMirrorBattle:', err.message);
        return null;
    }
    if (!battle) battle = (appData.campaign.activeBattles || []).find(b => b && b.hexKey === e.hexKey) || null;
    if (!battle) return null;
    battle.onlineMirror = true;
    battle.onlineOppBattleId = e.id;
    const myNames = myUnits.map(u => u.name).join(', ');
    const msg = `⚔️ Противник атаковал ваши юниты на гексе (${e.hexKey})! Ваши: ${myNames}. ` +
        'Бой открыт в «⚔️ Текущие бои» — нажмите «➡️ Перейти в бой», расставьте отряды и ведите бой своими силами.';
    try { log(msg); } catch (err) {}
    try { alert(msg); } catch (err) { /* WebView без alert */ }
    const mi = document.getElementById('mapInfo');
    if (mi) { mi.innerHTML = msg; mi.style.color = '#e74c3c'; }
    return battle;
}

// Слияние данных оппонента в мой бой. Возвращает true, если что-то изменилось.
// ⚡ v13.052: флаг «изменились мои данные (нужен ответный пуш)» — привязка боёв, принятый урон
let __onlineMergeMineChanged = false;
function onlineAcceptBattlePhase(battle, e, live) {
    const revision = Number(e.phaseRevision);
    const localRevision = Number(battle.phaseRevision || 0);
    if (!Number.isInteger(revision) || revision !== localRevision + 1) return false;
    const attackerIsPlayer = !battle.placement || battle.placement.attackerSide !== 'enemy';
    const localSide = battle.activeSide || (attackerIsPlayer ? 'player' : 'enemy');
    const nextSide = ((e.activeSide === 'attacker') === attackerIsPlayer) ? 'player' : 'enemy';
    // Only the opponent can end its phase; duplicate and delayed snapshots cannot transfer it.
    if (localSide !== 'enemy' || nextSide !== 'player' || !['attacker', 'defender'].includes(e.activeSide)) return false;
    battle.phaseRevision = revision;
    battle.activeSide = nextSide;
    battle.currentTurn = (battle.currentTurn || 1) + 1;
    if (typeof advanceTacticalClock === 'function') advanceTacticalClock(2);
    if (live) {
        appData.map.activeSide = nextSide;
        currentTurn = battle.currentTurn;
        appData.currentTurn = currentTurn;
        if (typeof resetAP === 'function') resetAP();
        (appData.squads || []).forEach(s => { s.actionsThisTurn = {}; s.movedThisTurn = false; s.suppressed = false; });
        if (typeof syncNightModifier === 'function') syncNightModifier();
    } else {
        battle.actionPoints = (battle.playerSquads || []).map(s => ({ ap: getMaxAP(s), maxAp: getMaxAP(s) }));
        (battle.playerSquads || []).forEach(s => { s.actionsThisTurn = {}; s.movedThisTurn = false; s.suppressed = false; });
        if (battle.tacticalMap) battle.tacticalMap.activeSide = nextSide;
    }
    return true;
}
function onlineMergeOppBattle(battle, e) {
    let changed = false;
    // --- привязка боёв друг к другу (мой id ↔ id оппонента) ---
    //     счётчики урона (dmgOut/dmgIn) имеют смысл только внутри одной пары боёв
    const linked = (battle.onlineOppBattleId !== undefined && battle.onlineOppBattleId !== null && battle.onlineOppBattleId === e.id) ||
        (e.oppBattleId !== undefined && e.oppBattleId !== null && e.oppBattleId === battle.id);
    if (!linked) {
        if (e.status !== 'active') return false; // завершённый чужой (старый) бой на этом гексе — не наш
        if (battle.onlineOppBattleId !== undefined && battle.onlineOppBattleId !== null && battle.onlineOppBattleId !== e.id) {
            // оппонент завершил прежний бой и начал НОВЫЙ на этом же гексе —
            // перепривязываемся, счётчики урона начинаем заново
            battle.onlineDmgIn = {}; battle.onlineDmgOut = {}; battle.onlineOppHpSeen = {};
            battle.onlineOppFinished = false;
            try { log(`🌐 Противник начал новый бой на гексе (${battle.hexKey}) — ваш бой продолжается вместе с ним.`); } catch (err) {}
        }
        battle.onlineOppBattleId = e.id;
        changed = true;
        __onlineMergeMineChanged = true;
    }
    const live = onlineBattleIsLive(battle);
    const enemies = onlineBattleEnemySquads(battle);
    const grid = onlineBattleGrid(battle);
    if (!battle.onlineOppHpSeen) battle.onlineOppHpSeen = {};
    if (!battle.onlineDmgOut) battle.onlineDmgOut = {};
    if (!battle.onlineDmgIn) battle.onlineDmgIn = {};
    // сначала учтём урон, который я уже нанёс локально (чтобы не потерять его при слиянии hp)
    onlineAccumulateDmgOut(battle);

    // --- ⚡ v13.055 (R39#3): фаза размещения ---
    //     кто атакует / сторона входа — от того, кто начал бой (зеркало берёт из облака);
    //     готовность оппонента (placed); позиции его отрядов видны только когда готовы ОБА
    if (e.attacker && (battle.onlineMirror || (typeof e.id === 'number' && typeof battle.id === 'number' && e.id < battle.id))) {
        const side = (e.attacker === 'me') ? 'enemy' : 'player';
        const dir = e.entryDir || null;
        if (!battle.placement) {
            if (typeof initBattlePlacement === 'function') { initBattlePlacement(battle, side, dir, 'online'); changed = true; }
        } else if (battle.placement.attackerSide !== side || (dir && battle.placement.entryDir !== dir)) {
            battle.placement.attackerSide = side;
            if (dir) battle.placement.entryDir = dir;
            changed = true;
        }
    }
    const oppPlaced = (e.placed === undefined || e.placed === null) ? true : !!e.placed;
    const myPl = battle.placement || null;
    if (myPl) {
        if (!!myPl.enemyReady !== oppPlaced) {
            myPl.enemyReady = oppPlaced;
            changed = true;
            if (oppPlaced && myPl.phase !== 'done') { try { log(`📍 Противник завершил размещение на гексе (${battle.hexKey}).`); } catch (err) {} }
        }
        if (myPl.phase !== 'done' && myPl.playerReady && myPl.enemyReady) {
            myPl.phase = 'done';
            changed = true;
            try { if (typeof placementAnnounceDone === 'function') placementAnnounceDone(battle); } catch (err) {}
        }
    }
    const oppPositionsVisible = !myPl || myPl.phase === 'done' || (!!myPl.playerReady && oppPlaced);

    if (onlineAcceptBattlePhase(battle, e, live)) changed = true;

    const theirDmgIn = e.dmgIn || {};
    (Array.isArray(e.squads) ? e.squads : []).forEach(cs => {
        if (!cs || !cs.name) return;
        let idx = enemies.findIndex(s => s && s.name === cs.name);
        if (idx < 0) {
            enemies.push({
                name: cs.name, faction: cs.faction || null, icon: cs.icon || null, vehicleIcon: cs.icon || null,
                isVehicle: !!cs.isVehicle, armor: cs.armor || null, isRetreated: !!cs.isRetreated,
                status: cs.status || null, retreatReason: cs.retreatReason || null, retreatTurn: cs.retreatTurn || null,
                currentMorale: (cs.currentMorale !== null && cs.currentMorale !== undefined) ? cs.currentMorale : 5,
                baseMorale: 5, embarkedSquadIndex: null,
                fighters: (cs.fighters || []).map(f => ({ name: f.name || 'Боец', weapon: f.weapon || 'Винтовка', hp: f.hp, maxHp: f.maxHp }))
            });
            idx = enemies.length - 1;
            changed = true;
        }
        const s = enemies[idx];
        const seen = battle.onlineOppHpSeen[s.name] || (battle.onlineOppHpSeen[s.name] = []);
        const mineOut = battle.onlineDmgOut[s.name] || [];
        const ackIn = theirDmgIn[s.name] || [];
        if (!Array.isArray(s.fighters)) s.fighters = [];
        (cs.fighters || []).forEach((cf, i) => {
            if (!s.fighters[i]) { s.fighters[i] = { name: cf.name || 'Боец', weapon: cf.weapon || 'Винтовка', hp: cf.hp, maxHp: cf.maxHp }; changed = true; }
            const f = s.fighters[i];
            if (cf.maxHp !== undefined && f.maxHp !== cf.maxHp) f.maxHp = cf.maxHp;
            if (cf.weapon && f.weapon !== cf.weapon) f.weapon = cf.weapon;
            // мой урон, который оппонент ещё не применил, вычитаем из его hp
            const pending = Math.max(0, (mineOut[i] || 0) - (ackIn[i] || 0));
            const expected = Math.max(0, (typeof cf.hp === 'number' ? cf.hp : 0) - pending);
            if (f.hp !== expected) { f.hp = expected; changed = true; }
            seen[i] = f.hp;
        });
        ['hidden', 'isDestroyed', 'isRetreated', 'isRouting', 'dismounted', 'suppressed'].forEach(k => {
            const v = !!cs[k];
            if (!!s[k] !== v) { s[k] = v; changed = true; }
        });
        ['status', 'retreatReason', 'retreatTurn'].forEach(k => {
            const v = cs[k] === undefined ? null : cs[k];
            if ((s[k] || null) !== v) { if (v === null) delete s[k]; else s[k] = v; changed = true; }
        });
        if (cs.meleeOpponentName) s.meleeOpponentName = cs.meleeOpponentName;
        else if (s.meleeOpponentName && (battle.phaseRevision || 0) <= (e.phaseRevision || 0)) delete s.meleeOpponentName;
        if (s.isRetreated && typeof tacticalClearMeleeEngagement === 'function') tacticalClearMeleeEngagement(s);
        if (cs.detected || cs.firedThisTurn) s.detected = true;
        if (cs.currentMorale !== null && cs.currentMorale !== undefined) {
            const pendingMorale = Math.max(0, (battle.onlineMoraleOut && battle.onlineMoraleOut[s.name] || 0) - (e.moraleIn && e.moraleIn[s.name] || 0));
            const value = Math.max(0, cs.currentMorale - pendingMorale);
            if (s.currentMorale !== value) { s.currentMorale = value; changed = true; }
        }
        // позиция на карте боя (⚡ v13.055: до готовности обоих расстановка оппонента скрыта)
        if (!oppPositionsVisible) return;
        const curPos = Object.keys(grid).find(k => grid[k] && Array.isArray(grid[k].enemySquadIds) && grid[k].enemySquadIds.includes(idx)) || null;
        const newPos = (cs.isRetreated || cs.status === 'retreated') ? null : (cs.pos || null);
        if (curPos !== newPos) {
            if (curPos && grid[curPos]) grid[curPos].enemySquadIds = grid[curPos].enemySquadIds.filter(x => x !== idx);
            if (newPos) {
                if (!grid[newPos]) grid[newPos] = { type: 'grass', squadIds: [], enemySquadIds: [], markers: [], rotation: 0, variant: 0, level: 0 };
                if (!Array.isArray(grid[newPos].enemySquadIds)) grid[newPos].enemySquadIds = [];
                if (!grid[newPos].enemySquadIds.includes(idx)) grid[newPos].enemySquadIds.push(idx);
            }
            changed = true;
        }
    });

    // --- урон МОИМ отрядам от оппонента (дельты) ---
    const mySquads = onlineBattleMySquads(battle);
    const theirOut = e.dmgOut || {};
    // ⚡ v13.054 (R39#4): подавление моих отрядов огнём оппонента (supOut: имя → метка)
    const theirSup = e.supOut || {};
    if (!battle.onlineSupSeen) battle.onlineSupSeen = {};
    Object.keys(theirSup).forEach(name => {
        const ts = theirSup[name];
        if (typeof ts !== 'number' || battle.onlineSupSeen[name] === ts) return;
        battle.onlineSupSeen[name] = ts;
        const s = mySquads.find(x => x && x.name === name);
        if (!s) return;
        if (!s.suppressed) { s.suppressed = true; changed = true; }
        try { log(`💫 Отряд «${name}» подавлен огнём противника (действие с карты боя).`); } catch (err) {}
    });
    battle.onlineMoraleIn = battle.onlineMoraleIn || {};
    Object.entries(e.moraleOut || {}).forEach(([name, total]) => {
        const squad = mySquads.find(s => s && s.name === name);
        const delta = Number(total) - (battle.onlineMoraleIn[name] || 0);
        if (!squad || !Number.isFinite(delta) || delta <= 0) return;
        squad.currentMorale = Math.max(0, (squad.currentMorale ?? squad.baseMorale ?? 5) - delta);
        battle.onlineMoraleIn[name] = Number(total);
        if (squad.currentMorale <= 1 && !squad.isDestroyed && !squad.isRetreated) squad.isRouting = true;
        if (live && typeof currentSquad !== 'undefined' && currentSquad === squad) morale = squad.currentMorale;
        changed = true; __onlineMergeMineChanged = true;
    });
    const hurt = [];
    let lossesChanged = false;
    Object.keys(theirOut).forEach(name => {
        const s = mySquads.find(x => x && x.name === name);
        if (!s || !Array.isArray(s.fighters)) return;
        const applied = battle.onlineDmgIn[name] || (battle.onlineDmgIn[name] = []);
        (theirOut[name] || []).forEach((total, i) => {
            const delta = (total || 0) - (applied[i] || 0);
            if (delta <= 0 || !s.fighters[i]) return;
            const f = s.fighters[i];
            const before = (typeof f.hp === 'number') ? f.hp : 0;
            f.hp = Math.max(0, before - delta);
            applied[i] = (applied[i] || 0) + delta;
            if (before > 0 && f.hp <= 0) {
                const morale = (s.currentMorale !== undefined && s.currentMorale !== null) ? Number(s.currentMorale) : Number(s.baseMorale || 5);
                s.currentMorale = Math.max(0, (Number.isFinite(morale) ? morale : 5) - (f.isCommander ? 2 : 1));
            }
            if (f.hp !== before) {
                lossesChanged = true;
                hurt.push(`${f.name || 'боец'} (${s.name}) ${before}→${f.hp}${f.hp <= 0 ? ' 💀' : ''}`);
            }
            changed = true;
            __onlineMergeMineChanged = true;
        });
        if (live && typeof currentSquad !== 'undefined' && currentSquad === s) morale = s.currentMorale;
        const wipedOut = (s.fighters || []).length > 0 && (s.fighters || []).every(f => !f || f.hp <= 0);
        if (wipedOut && !s.isDestroyed) {
            s.isDestroyed = true;
            lossesChanged = true;
            changed = true;
            try { log(`💀 Ваш отряд «${s.name}» уничтожен огнём противника.`); } catch (err) {}
        } else if (!wipedOut && !s.isRetreated && Number(s.currentMorale) <= 1 &&
                   (s.fighters || []).some(f => f && f.hp > 0)) {
            s.isRouting = true;
            s.retreatReason = 'morale';
            lossesChanged = true;
            changed = true;
            __onlineMergeMineChanged = true;
            try { log(`🏳️ Ваш отряд «${s.name}» автоматически отступил из-за низкого боевого духа.`); } catch (err) {}
        }
    });
    if (hurt.length > 0) {
        const msg = `💥 Бой на гексе (${battle.hexKey}): противник нанёс урон — ` + hurt.join(', ');
        try { log(msg); } catch (err) {}
        const mi = document.getElementById('mapInfo');
        if (mi && !live) { mi.innerHTML = msg; mi.style.color = '#e74c3c'; }
    }

    // --- служебное ---
    if (battle.onlineOppTurn !== e.turn) { battle.onlineOppTurn = e.turn; changed = true; }
    if (e.updatedAt && battle.onlineOppUpdatedAt !== e.updatedAt) { battle.onlineOppUpdatedAt = e.updatedAt; changed = true; }
    if (e.status === 'finished' && !battle.onlineOppFinished) {
        battle.onlineOppFinished = true;
        changed = true;
        (enemies || []).forEach(s => {
            if (s && !s.isDestroyed) { s.isRetreated = true; s.status = 'retreated'; }
        });
        const msg = `🏁 Противник отступил/завершил бой на гексе (${battle.hexKey}). Нажмите «✅ Завершить бой».`;
        try { log(msg); } catch (err) {}
        try { alert(msg); } catch (err) {}
        try { if (typeof updateTacticalTurnUI === 'function') updateTacticalTurnUI(); } catch (err) {}
    }
    if (changed && live) {
        // Сохраняем входящий урон в запись боя немедленно, а не только при выходе.
        battle.playerSquads = mySquads.map(s => JSON.parse(JSON.stringify(s)));
        battle.tacticalMap = JSON.parse(JSON.stringify(appData.map));
        battle.enemySquads = (appData.map.enemySquads || []).map(s => JSON.parse(JSON.stringify(s)));
        if (lossesChanged && typeof syncBattleLossesToCampaign === 'function') {
            try { syncBattleLossesToCampaign(battle.id); } catch (err) {}
        }
    }
    // Потери в оперативные юниты: незакрытый бой обновляем сразу; открытый — выше,
    // чтобы уничтожение было видно и на тактической карте текущего хода.
    if (changed && !live) {
        onlineSyncBattleEnemyCopy(battle);
        if (typeof syncBattleLossesToCampaign === 'function') { try { syncBattleLossesToCampaign(battle.id); } catch (err) {} }
    }
    return changed;
}

// Строка статуса общего боя в «⚔️ Текущие бои»
function onlineBattleStatusHtml(battle) {
    if (!battle || typeof appData === 'undefined' || !appData.campaign || !appData.campaign.online) return '';
    const who = battle.onlineMirror ? 'бой начал противник' : 'бой начали вы';
    let s = `<div style="color:#f1c40f; font-size:0.8em; margin-bottom:4px;">🌐 Общий бой — ${who}`;
    if (battle.onlineOppTurn) s += ` · ход противника ${battle.onlineOppTurn}`;
    if (battle.onlineOppUpdatedAt) {
        const d = new Date(battle.onlineOppUpdatedAt);
        s += ` · обновлено ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    if (battle.onlineOppFinished) s += ' · <b style="color:#e67e22;">противник завершил бой</b>';
    // ⚡ v13.055 (R39#3): фаза размещения
    if (battle.placement && battle.placement.phase !== 'done') {
        s += ' · 📍 размещение: вы ' + (battle.placement.playerReady ? '✅' : '⏳') + ', противник ' + (battle.placement.enemyReady ? '✅' : '⏳');
    }
    s += '</div>';
    return s;
}
