// ⚡ BUILD-МАРКЕР: v13.108
// v13.062: fixed DOT coordinates and no placement bypass for eliminated squads.
// ⚡ v13.061: current release tactical deployment rules.
// ============================================================
// ⚡ v13.055 (R39#3): РАЗМЕЩЕНИЕ В НАЧАЛЕ ТАКТИЧЕСКОГО БОЯ
//   • Атакующий — тот, кто ВОШЁЛ на гекс. Его зона размещения — полоса
//     2 ряда у края карты боя со стороны входа (вход по диагонали — угол:
//     та же полоса 2 ряда, «согнутая» вдоль двух краёв у угла);
//     см. v13.099 (п.19) — ширина зоны уменьшена с 3 гексов до 2.
//   • Обороняющийся размещает отряды где угодно ВНЕ зоны атакующего.
//   • Пока размещение не завершено — двигаться, стрелять и завершать ход
//     нельзя (кнопка «✅ Размещение завершено» под картой боя).
//   • Онлайн: обе стороны размещаются одновременно; расстановка противника
//     скрыта, пока не готовы оба (js/online_battles.js: placed/attacker/entryDir).
//   • Сторона входа определяется по последнему шагу юнита на оперативной
//     карте (unit.prevCol/prevRow — см. opRecordPrevPos в index.html);
//     при ручном перемещении ВРАГА на гекс с нашими юнитами атакует враг.
//   Старые бои (без battle.placement) идут как раньше — без ограничений.
// ============================================================

// v13.099 (п.19): ширина зоны размещения атакующего — 2 гекса (было 3).
const PLACEMENT_STRIP_DEPTH = 2;
const PLACEMENT_DIRS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];
const PLACEMENT_DIR_LABELS = {
    E:  'с востока (правый край)',
    W:  'с запада (левый край)',
    NE: 'с северо-востока (правый верхний угол)',
    NW: 'с северо-запада (левый верхний угол)',
    SE: 'с юго-востока (правый нижний угол)',
    SW: 'с юго-запада (левый нижний угол)'
};

// ---------- геометрия ----------
// Центр гекса оперативной/тактической карты в «единицах» (odd-r: нечётные ряды сдвинуты вправо)
function opHexCenterUnits(col, row) {
    return { x: col * Math.sqrt(3) + ((row % 2) ? Math.sqrt(3) / 2 : 0), y: row * 1.5 };
}

// Направление от гекса (c1,r1) К гексу (c2,r2) — одно из E/NE/NW/W/SW/SE (по углу,
// работает и для несоседних гексов). Ряд 0 — север (верх карты).
function opDirectionBetween(c1, r1, c2, r2) {
    if (![c1, r1, c2, r2].every(v => typeof v === 'number' && isFinite(v))) return null;
    if (c1 === c2 && r1 === r2) return null;
    const a = opHexCenterUnits(c1, r1), b = opHexCenterUnits(c2, r2);
    let ang = Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI; // 0° = восток, 90° = север
    if (ang <= -30) ang += 360;                                      // → (-30, 330]
    if (ang <= 30) return 'E';
    if (ang <= 90) return 'NE';
    if (ang <= 150) return 'NW';
    if (ang <= 210) return 'W';
    if (ang <= 270) return 'SW';
    return 'SE';
}

function placementOppositeDir(dir) {
    return { E: 'W', W: 'E', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' }[dir] || null;
}

// Клетки зоны атакующего на карте боя N×N для стороны входа entryDir
function placementZoneKeys(entryDir, size) {
    const N = Math.max(4, parseInt(size, 10) || (typeof TACTICAL_MAP_SIZE !== 'undefined' ? TACTICAL_MAP_SIZE : 20) || 20);
    const D = PLACEMENT_STRIP_DEPTH;
    const arm = Math.ceil(N / 2); // длина «рукавов» угла вдоль краёв
    const keys = [];
    for (let row = 0; row < N; row++) {
        for (let col = 0; col < N; col++) {
            let inZone = false;
            switch (entryDir) {
                case 'E':  inZone = col >= N - D; break;
                case 'W':  inZone = col < D; break;
                case 'NE': inZone = (row < D && col >= N - arm) || (col >= N - D && row < arm); break;
                case 'NW': inZone = (row < D && col < arm) || (col < D && row < arm); break;
                case 'SE': inZone = (row >= N - D && col >= N - arm) || (col >= N - D && row >= N - arm); break;
                case 'SW': inZone = (row >= N - D && col < arm) || (col < D && row >= N - arm); break;
                default: inZone = false;
            }
            if (inZone) keys.push(col + ',' + row);
        }
    }
    return keys;
}

// ---------- запись боя ----------
function getBattleRecordById(id) {
    if (typeof appData === 'undefined' || !appData.campaign || !Array.isArray(appData.campaign.activeBattles)) return null;
    return appData.campaign.activeBattles.find(b => b && b.id === id) || null;
}
function getCurrentBattleRecord() {
    if (typeof appData === 'undefined' || !appData.currentBattleId) return null;
    return getBattleRecordById(appData.currentBattleId);
}

function placementMapSize(battle) {
    if (battle && typeof appData !== 'undefined' && appData.currentBattleId === battle.id && appData.map && appData.map.mapSize) return appData.map.mapSize;
    if (battle && battle.tacticalMap && battle.tacticalMap.mapSize) return battle.tacticalMap.mapSize;
    return (typeof TACTICAL_MAP_SIZE !== 'undefined' && TACTICAL_MAP_SIZE) || 20;
}

// Кто атакует и откуда вошёл. Вызывается из startTacticalBattle.
//   opts.entry      — {attackerSide, entryDir} задано явно;
//   opts.mirrorOf   — зеркало онлайн-боя: attacker/entryDir из снапшота оппонента;
//   pendingBattleEntry — враг вручную перемещён на гекс с нашими юнитами (атакует враг);
//   иначе атакует наш юнит: направление — из последнего шага (prevCol/prevRow),
//   запасной вариант — сторона ближайшего своего юнита, потом — запад.
function resolveBattleEntry(playerUnits, enemyUnits, hexKey, opts) {
    opts = opts || {};
    if (opts.entry && opts.entry.attackerSide) {
        return { attackerSide: opts.entry.attackerSide, entryDir: PLACEMENT_DIRS.includes(opts.entry.entryDir) ? opts.entry.entryDir : 'W', source: 'manual' };
    }
    const parts = String(hexKey || '').split(',').map(Number);
    const hc = parts[0], hr = parts[1];
    if (opts.mirrorOf) {
        const e = opts.mirrorOf;
        const attackerSide = (e.attacker === 'opp') ? 'player' : 'enemy'; // бой начал оппонент → обычно атакует он
        let dir = PLACEMENT_DIRS.includes(e.entryDir) ? e.entryDir : null;
        if (!dir) dir = placementFallbackDir(attackerSide, hc, hr, enemyUnits, playerUnits);
        return { attackerSide: attackerSide, entryDir: dir, source: 'online' };
    }
    let attackerSide = 'player';
    let mover = (playerUnits || [])[0] || null;
    const pend = (typeof pendingBattleEntry !== 'undefined') ? pendingBattleEntry : null;
    if (pend && pend.attackerSide === 'enemy' && pend.unit && (enemyUnits || []).includes(pend.unit)) {
        attackerSide = 'enemy';
        mover = pend.unit;
    }
    if (typeof pendingBattleEntry !== 'undefined') pendingBattleEntry = null;
    let dir = null;
    if (mover && typeof mover.prevCol === 'number' && typeof mover.prevRow === 'number' && (mover.prevCol !== hc || mover.prevRow !== hr)) {
        dir = opDirectionBetween(hc, hr, mover.prevCol, mover.prevRow);
    }
    if (!dir) dir = placementFallbackDir(attackerSide, hc, hr, enemyUnits, playerUnits);
    return { attackerSide: attackerSide, entryDir: dir, source: mover && dir && typeof mover.prevCol === 'number' ? 'move' : 'fallback' };
}

// Запасное направление: сторона ближайшего к гексу боя юнита атакующей стороны (не на самом гексе)
function placementFallbackDir(attackerSide, hc, hr, enemyUnits, playerUnits) {
    try {
        const camp = (typeof appData !== 'undefined' && appData.campaign) || {};
        const pool = attackerSide === 'enemy' ? (camp.enemyOpUnits || []) : (camp.opUnits || []);
        let best = null, bestD = Infinity;
        pool.forEach(u => {
            if (!u || u.isDestroyed || typeof u.col !== 'number' || typeof u.row !== 'number') return;
            if (u.col === hc && u.row === hr) return;
            const d = (typeof getOpHexDistance === 'function') ? getOpHexDistance(hc, hr, u.col, u.row)
                : Math.max(Math.abs(u.col - hc), Math.abs(u.row - hr));
            if (d < bestD) { bestD = d; best = u; }
        });
        if (best) return opDirectionBetween(hc, hr, best.col, best.row) || 'W';
    } catch (e) {}
    return 'W';
}

function initBattlePlacement(battle, attackerSide, entryDir, source) {
    if (!battle) return null;
    battle.placement = {
        attackerSide: attackerSide === 'enemy' ? 'enemy' : 'player',
        entryDir: PLACEMENT_DIRS.includes(entryDir) ? entryDir : 'W',
        phase: 'placing',
        playerReady: false,
        enemyReady: false,
        source: source || null,
        createdAt: Date.now()
    };
    return battle.placement;
}

// Нужно ли МНЕ ещё разместиться в этом бою
function placementNeedsMyAction(battle) {
    const p = battle && battle.placement;
    return !!(p && p.phase !== 'done' && !p.playerReady);
}

// Причина, по которой действия в бою пока запрещены (null — можно)
function placementPendingReason(battle) {
    battle = battle || getCurrentBattleRecord();
    const p = battle && battle.placement;
    if (!p || p.phase === 'done') return null;
    if (!p.playerReady) return '📍 Сначала завершите размещение отрядов: вкладка «🗺️ Поле боя» → «✅ Размещение завершено».';
    return '⏳ Противник ещё размещает отряды — дождитесь его готовности (бой начнётся автоматически).';
}

// Можно ли стороне side ('player'|'enemy') стоять на клетке key по правилам зон
function placementSideAllowed(battle, side, key, squad) {
    const p = battle && battle.placement;
    const squads = side === 'player' ? (battle && battle.playerSquads || []) : (battle && battle.tacticalMap && battle.tacticalMap.enemySquads || []);
    if (squads.some(s => s.fixedTacticalPosition && s.fixedTacticalPosition.key === key && s.fixedTacticalPosition.hexKey === battle.hexKey)) return true;
    if (!p) return true;
    if (p.ambush) return true;
    // ⚡ v13.099 (п.18): подкрепление обороны входит со своим подразделением
    //    с той стороны, откуда оно пришло на гекс боя (полоса у соответствующего края).
    if (squad && squad.placementArrivalDir && side !== p.attackerSide) {
        const arrivalZone = placementZoneKeys(squad.placementArrivalDir, placementMapSize(battle));
        return arrivalZone.includes(key);
    }
    const zone = placementZoneKeys(p.entryDir, placementMapSize(battle));
    const inZone = zone.includes(key);
    return (p.attackerSide === side) ? inZone : !inZone;
}

// Проверка при размещении (режим «🏷️ Разместить» / «📌 Разместить врага»).
// wasPlaced — отряд уже стоял на карте до этого клика (переставляем).
// Возвращает текст запрета или null.
function placementCheckPlace(side, key, wasPlaced, squad) {
    if (squad && (squad.isDestroyed || squad.isRetreated || squad.status === 'retreated' || (squad.fighters || []).every(f => !f || f.hp <= 0))) return 'Уничтоженный или отступивший отряд нельзя размещать.';
    const battle = getCurrentBattleRecord();
    // ⚡ v13.066: закреплённый ДОТ нельзя переставлять, но только в СВОЁМ
    //    оперативном гексе: ДОТы одного юнита могут стоять на разных гексах,
    //    и в чужом бою отряд ДОТа размещается как обычный.
    if (squad && squad.fixedTacticalPosition) {
        const sameHex = !battle || !battle.hexKey || String(squad.fixedTacticalPosition.hexKey) === String(battle.hexKey);
        if (sameHex) return key === squad.fixedTacticalPosition.key ? null : 'ДОТ закреплён на постоянной позиции.';
    }
    const p = battle && battle.placement;
    if (!p) return null;
    if (p.phase === 'done' && wasPlaced) return null; // после размещения — как раньше (свободная перестановка)
    if (p.phase !== 'done' && side === 'player' && p.playerReady) return '✅ Вы уже завершили размещение — переставлять отряды нельзя, ждём противника.';
    if (placementSideAllowed(battle, side, key, squad)) return null;
    // Обороняющемуся игроку не раскрываем направление и форму стартовой зоны атакующего.
    if (squad && squad.placementArrivalDir && p.attackerSide !== side) {
        return `⛔ Подкрепление размещается со стороны, откуда пришло (${PLACEMENT_DIR_LABELS[squad.placementArrivalDir] || squad.placementArrivalDir}) — подсвеченная полоса у края карты.`;
    }
    if (p.attackerSide === 'enemy') return '⛔ Этот гекс недоступен для размещения. Выберите другой гекс.';
    const isAttacker = (p.attackerSide === side);
    const who = side === 'player' ? 'Ваш' : 'Вражеский';
    return isAttacker
        ? `⛔ ${who} отряд атакует и размещается только в зоне входа (${PLACEMENT_DIR_LABELS[p.entryDir]}, 2 ряда у края — подсвечено на карте).`
        : `⛔ ${who} отряд обороняется — размещайте его ВНЕ зоны атакующего (подсвечена на карте, ${PLACEMENT_DIR_LABELS[p.entryDir]}).`;
}

// позиции отрядов на сетке: индекс → 'c,r'
function placementPositions(grid, field) {
    const pos = {};
    Object.keys(grid || {}).forEach(k => {
        const cell = grid[k];
        if (!cell || !Array.isArray(cell[field])) return;
        cell[field].forEach(i => { pos[i] = k; });
    });
    return pos;
}

// При срабатывании засады противник не использует стартовую полосу: его живые
// отряды (кроме скрытого десанта внутри БТР) случайно расставляются по карте.
function placementRandomizeAmbushEnemies(tacticalMap) {
    if (!tacticalMap || !tacticalMap.grid || !Array.isArray(tacticalMap.enemySquads)) return {};
    const grid = tacticalMap.grid;
    const squads = tacticalMap.enemySquads;
    const positions = placementPositions(grid, 'enemySquadIds');
    const fixed = new Set();
    squads.forEach((s, i) => {
        if (!s || !s.fixedTacticalPosition || !s.fixedTacticalPosition.key) return;
        const sameBattle = !s.fixedTacticalPosition.hexKey || String(s.fixedTacticalPosition.hexKey) === String(tacticalMap.hexKey);
        if (sameBattle) fixed.add(i);
    });
    Object.keys(grid).forEach(key => {
        const cell = grid[key];
        if (!cell) return;
        cell.enemySquadIds = (cell.enemySquadIds || []).filter(i => fixed.has(i));
    });
    squads.forEach((s, i) => {
        if (!s) return;
        s.detected = true;
        // hidden is reserved for passengers inside carriers; all deployed enemy
        // combat squads are revealed for an ambush deployment.
        if (!fixed.has(i)) delete s.hexPos;
    });
    const passable = Object.keys(grid).filter(key => {
        if (!/^\d+,\d+$/.test(key) || !grid[key]) return false;
        const type = grid[key].type;
        const terrain = (typeof TERRAIN_DATA !== 'undefined' && TERRAIN_DATA && TERRAIN_DATA[type]) || null;
        return !terrain || !Number.isFinite(Number(terrain.baseCost)) || Number(terrain.baseCost) < 999;
    });
    const available = passable.filter(key => {
        const cell = grid[key];
        return !(cell.squadIds || []).length && !(cell.enemySquadIds || []).length;
    });
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }
    // If every empty tile is taken, allow enemy stacking but never overwrite a
    // friendly deployment cell.
    const fallback = passable.filter(key => !(grid[key].squadIds || []).length);
    for (let i = fallback.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fallback[i], fallback[j]] = [fallback[j], fallback[i]];
    }
    const result = {};
    let next = 0;
    squads.forEach((s, i) => {
        if (!s || s.hidden || s.isDestroyed || (s.fighters || []).every(f => !f || f.hp <= 0)) return;
        let key = fixed.has(i) ? positions[i] : available[next++];
        if (!key) key = fallback.find(k => !(grid[k].enemySquadIds || []).includes(i)) || passable[0];
        if (!key || !grid[key]) return;
        const cell = grid[key];
        if (!Array.isArray(cell.enemySquadIds)) cell.enemySquadIds = [];
        if (!cell.enemySquadIds.includes(i)) cell.enemySquadIds.push(i);
        s.hexPos = key.split(',').map(Number);
        result[i] = key;
    });
    return result;
}

function placementSideStatus(battle, side) {
    const grid = (appData.map && appData.map.grid) || {};
    const list = side === 'player' ? (appData.squads || []) : ((appData.map && appData.map.enemySquads) || []);
    const pos = placementPositions(grid, side === 'player' ? 'squadIds' : 'enemySquadIds');
    const placed = [], unplaced = [], violations = [];
    list.forEach((s, i) => {
        if (!s || s.hidden || s.isDestroyed) return;
        const alive = (s.fighters || []).some(f => f && f.hp > 0);
        if (!alive) return;
        if (pos[i]) {
            placed.push(s.name);
            if (!placementSideAllowed(battle, side, pos[i])) violations.push(`${s.name} (${pos[i]})`);
        } else unplaced.push(s.name);
    });
    return { placed, unplaced, violations, total: placed.length + unplaced.length };
}

function placementInfo(text, color) {
    const mi = document.getElementById('mapInfo');
    if (mi) { mi.innerHTML = text; mi.style.color = color || '#f1c40f'; }
}

// ---------- фаза размещения (UI) ----------
function placementIntroText(battle) {
    const p = battle.placement;
    const iAmAttacker = p.attackerSide === 'player';
    const hp = String(battle.hexKey || '').split(',');
    let s = `📍 Размещение перед боем на гексе (${hp[0]},${hp[1]}).\n\n`;
    if (p.ambush) {
        s += '🥷 Засада сработала: все отряды противника обнаружены и уже расставлены случайно. Вы можете разместить свои отряды в любой точке карты.';
    } else if (iAmAttacker) {
        s += `Вы — АТАКУЮЩИЙ: ваши юниты вошли на гекс ${PLACEMENT_DIR_LABELS[p.entryDir]}. Ваша зона размещения — 2 ряда у этого края карты боя (зелёная подсветка).`;
    } else {
        s += 'Вы — ОБОРОНЯЮЩИЙСЯ. Разместите свои отряды и подтвердите готовность; стартовая зона противника скрыта.';
    }
    s += '\n\nРежим «🏷️ Разместить»: выберите отряд в списке «Отряд» и кликните по гексу. Затем нажмите «✅ Размещение завершено».';
    if (appData.campaign && appData.campaign.online) s += '\n\n🌐 Онлайн: противник размещается одновременно с вами, его расстановка откроется, когда готовы будут оба.';
    else if (!p.ambush) s += '\n\nОтряды противника размещаются в панели «Разместить врага» ниже.';
    return s;
}

function openPlacementPhase(battle) {
    battle = battle || getCurrentBattleRecord();
    if (!battle || !battle.placement) return false;
    try {
        document.querySelectorAll('.tabcontent').forEach(e => e.style.display = 'none');
        document.querySelectorAll('.tablinks').forEach(e => e.classList.remove('active'));
        const tab = document.getElementById('mapTab');
        const btn = document.querySelector('.tablinks[onclick*="mapTab"]');
        if (tab) tab.style.display = 'block';
        if (btn) btn.classList.add('active');
    } catch (e) {}
    ['resetMapZoom', 'initMap', 'updateSquadDropdown', 'refreshSquadToPlaceDropdown', 'updateEnemyDropdown', 'updateEnemyFactionDropdown', 'populateTerrainSelect'].forEach(fn => {
        try { if (typeof window !== 'undefined' && typeof window[fn] === 'function') window[fn](); } catch (e) {}
    });
    try { if (typeof setMapMode === 'function') setMapMode('place'); } catch (e) {}
    renderPlacementPanel();
    try { if (typeof updateTacticalRoundUI === 'function') updateTacticalRoundUI(); } catch (e) {}
    const msg = placementIntroText(battle);
    try { log(msg.replace(/\n+/g, ' ')); } catch (e) {}
    placementInfo(msg.split('\n')[2] || msg, '#f1c40f');
    try { alert(msg); } catch (e) { /* WebView без alert */ }
    try { if (typeof redrawMap === 'function') redrawMap(); } catch (e) {}
    return true;
}

// Что показать игроку при входе в бой (новый бой / возврат): размещение → карточки → бой
function battleStartUI(battle) {
    battle = battle || getCurrentBattleRecord();
    if (!battle) return;
    if (battle.placement && battle.placement.phase === 'done' && typeof tacticalCaptureStartingHexes === 'function') {
        try { if (tacticalCaptureStartingHexes(battle)) saveData(); } catch (e) {}
    }
    if (placementNeedsMyAction(battle)) { openPlacementPhase(battle); return; }
    if (!battle.cardsChosen && typeof openCardsTabForBattleStart === 'function') openCardsTabForBattleStart();
}

function renderPlacementPanel() {
    const el = document.getElementById('battlePlacementPanel');
    if (!el) return;
    const battle = getCurrentBattleRecord();
    const p = battle && battle.placement;
    if (!p || p.phase === 'done') { el.style.display = 'none'; el.innerHTML = ''; return; }
    const online = !!(appData.campaign && appData.campaign.online);
    const iAmAttacker = p.attackerSide === 'player';
    const mine = placementSideStatus(battle, 'player');
    let html = `<div style="font-weight:bold; color:#f1c40f; margin-bottom:4px;">📍 Размещение перед боем — вы ${iAmAttacker ? 'АТАКУЮЩИЙ' : 'ОБОРОНЯЮЩИЙСЯ'}</div>`;
    if (p.ambush) {
        html += '<div>🥷 Засада сработала: противник расставлен случайно и обнаружен. Свои отряды размещайте в любой точке карты.</div>';
    } else if (iAmAttacker) {
        html += `<div>Вы вошли ${PLACEMENT_DIR_LABELS[p.entryDir]}: размещайтесь в зелёной зоне у края карты.</div>`;
    } else {
        html += '<div>Вы обороняетесь. Стартовая зона противника скрыта; выберите место для своих отрядов.</div>';
    }
    html += `<div style="margin-top:4px;">Ваши отряды: размещено <b>${mine.placed.length}/${mine.total}</b>` +
        (mine.unplaced.length ? ` · не размещены: ${mine.unplaced.join(', ')}` : '') +
        (mine.violations.length ? ` · <span style="color:#e74c3c;">вне своей зоны: ${mine.violations.join(', ')}</span>` : '') + '</div>';
    if (online) {
        html += `<div>Противник: ${p.enemyReady ? '<span style="color:#2ecc71;">✅ готов</span>' : '<span style="color:#e67e22;">⏳ размещает отряды</span>'}` +
            (p.playerReady ? ' · вы: <span style="color:#2ecc71;">✅ готовы</span>' : '') + '</div>';
    } else if (p.ambush) {
        html += '<div>Отряды противника: случайная расстановка завершена; обнаружены все.</div>';
    } else {
        const en = placementSideStatus(battle, 'enemy');
        html += `<div>Отряды противника: размещено <b>${en.placed.length}/${en.total}</b>` +
            (en.unplaced.length ? ` · не размещены: ${en.unplaced.join(', ')}` : '') +
            (en.violations.length ? ` · <span style="color:#e74c3c;">вне своей зоны: ${en.violations.join(', ')}</span>` : '') +
            ' (панель «📌 Разместить врага» ниже)</div>';
    }
    const canEdit = !p.ambush && iAmAttacker && !p.playerReady && (!online || !battle.onlineMirror);
    if (canEdit) {
        html += '<div style="margin-top:4px; font-size:0.85em; color:#bbb;">Поправить (если определилось неверно): сторона входа ' +
            `<select onchange="placementSetDir(this.value)" style="background:#444; color:#fff;">` +
            PLACEMENT_DIRS.map(d => `<option value="${d}" ${d === p.entryDir ? 'selected' : ''}>${PLACEMENT_DIR_LABELS[d]}</option>`).join('') +
            '</select> · атакует <select onchange="placementSetAttacker(this.value)" style="background:#444; color:#fff;">' +
            `<option value="player" ${iAmAttacker ? 'selected' : ''}>мы</option><option value="enemy" ${!iAmAttacker ? 'selected' : ''}>противник</option></select></div>`;
    }
    html += '<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">' +
        `<button onclick="placementFinish()" style="background:${p.playerReady ? '#555' : '#27ae60'};" ${p.playerReady ? 'disabled' : ''}>✅ Размещение завершено</button>` +
        '<button onclick="setMapMode(\'place\')" style="background:#27ae60;">🏷️ Разместить</button>' +
        (p.playerReady ? '<span style="color:#e67e22;">⏳ ждём противника…</span>' : '<span style="font-size:0.85em; color:#bbb;">выберите отряд в списке «Отряд» и кликните по гексу</span>') +
        '</div>';
    el.innerHTML = html;
    el.style.display = 'block';
}

function placementSetDir(dir) {
    const battle = getCurrentBattleRecord();
    const p = battle && battle.placement;
    if (!p || !PLACEMENT_DIRS.includes(dir)) return;
    p.entryDir = dir;
    p.source = 'manual';
    try { log(`📍 Сторона входа атакующего изменена: ${PLACEMENT_DIR_LABELS[dir]}.`); } catch (e) {}
    try { saveData(); } catch (e) {}
    renderPlacementPanel();
    try { if (typeof redrawMap === 'function') redrawMap(); } catch (e) {}
}

function placementSetAttacker(side) {
    const battle = getCurrentBattleRecord();
    const p = battle && battle.placement;
    if (!p) return;
    p.attackerSide = side === 'enemy' ? 'enemy' : 'player';
    p.source = 'manual';
    if (Number(battle.phaseRevision || 0) === 0 && Number(battle.tacticalPhasesCompleted || 0) === 0) {
        battle.activeSide = p.attackerSide;
        if (battle.tacticalMap) battle.tacticalMap.activeSide = p.attackerSide;
        if (typeof appData !== 'undefined' && appData && appData.map) appData.map.activeSide = p.attackerSide;
    }
    try { log(`📍 Атакующая сторона изменена: ${p.attackerSide === 'player' ? 'мы' : 'противник'}.`); } catch (e) {}
    try { saveData(); } catch (e) {}
    renderPlacementPanel();
    try { if (typeof updateTacticalRoundUI === 'function') updateTacticalRoundUI(); } catch (e) {}
    try { if (typeof redrawMap === 'function') redrawMap(); } catch (e) {}
}

// «✅ Размещение завершено»
function placementFinish() {
    const battle = getCurrentBattleRecord();
    const p = battle && battle.placement;
    if (!p) return false;
    if (p.playerReady) { placementInfo('✅ Размещение уже завершено.'); return false; }
    const online = !!(appData.campaign && appData.campaign.online);
    const mine = placementSideStatus(battle, 'player');
    if (mine.violations.length) {
        const msg = `⛔ Вне своей зоны: ${mine.violations.join(', ')}. Переставьте их и повторите.`;
        placementInfo(msg, '#e74c3c'); try { alert(msg); } catch (e) {}
        return false;
    }
    if (mine.placed.length === 0) {
        const msg = '⚠️ Разместите хотя бы один свой отряд (режим «🏷️ Разместить»).';
        placementInfo(msg, '#e74c3c'); try { alert(msg); } catch (e) {}
        return false;
    }
    if (mine.unplaced.length > 0) {
        let ok = true;
        try { ok = confirm(`Не размещены: ${mine.unplaced.join(', ')}. Они останутся вне карты (резерв). Завершить размещение?`); } catch (e) {}
        if (!ok) return false;
    }
    if (!online) {
        const en = placementSideStatus(battle, 'enemy');
        if (en.violations.length) {
            const msg = `⛔ Отряды противника вне его зоны: ${en.violations.join(', ')}. Переставьте их и повторите.`;
            placementInfo(msg, '#e74c3c'); try { alert(msg); } catch (e) {}
            return false;
        }
        if (en.unplaced.length > 0 && en.total > 0) {
            let ok = true;
            try { ok = confirm(`Отряды противника не размещены: ${en.unplaced.join(', ')}. Завершить размещение без них?`); } catch (e) {}
            if (!ok) return false;
        }
    }
    p.playerReady = true;
    p.playerReadyAt = Date.now();
    if (!online) p.enemyReady = true;
    if (p.playerReady && p.enemyReady) p.phase = 'done';
    try { log(`📍 Размещение: вы готовы (${mine.placed.length} отр.)${p.phase === 'done' ? ' — бой начинается!' : ' — ждём противника.'}`); } catch (e) {}
    try { saveData(); } catch (e) {}
    if (online) {
        try { if (typeof onlinePushBattles === 'function') onlinePushBattles(true); } catch (e) {}
        // расстановка оппонента могла прийти раньше (была скрыта) — применяем сейчас
        try { if (typeof onlineBattlesRecheck === 'function') onlineBattlesRecheck(); } catch (e) {}
    }
    try { if (typeof setMapMode === 'function') setMapMode('view'); } catch (e) {}
    renderPlacementPanel();
    try { if (typeof redrawMap === 'function') redrawMap(); } catch (e) {}
    if (p.phase === 'done') placementAnnounceDone(battle);
    else {
        const msg = '✅ Ваше размещение отправлено. ⏳ Ждём, пока противник расставит отряды — его расстановка откроется, когда будут готовы оба. Пока можно выбрать карточки.';
        placementInfo(msg); try { alert(msg); } catch (e) {}
    }
    if (!battle.cardsChosen && typeof openCardsTabForBattleStart === 'function') openCardsTabForBattleStart();
    else if (p.phase === 'done' && typeof activateBattleTab === 'function') { try { activateBattleTab(); } catch (e) {} }
    try { if (typeof updateTacticalTurnUI === 'function') updateTacticalTurnUI(); else if (typeof updateTacticalRoundUI === 'function') updateTacticalRoundUI(battle); } catch (e) {}
    return true;
}

// Оба готовы (вызывается и из onlineMergeOppBattle, когда готов оппонент)
function placementAnnounceDone(battle) {
    battle = battle || getCurrentBattleRecord();
    const p = battle && battle.placement;
    if (!p || p.phase !== 'done') return;
    let capturedStartHexes = false;
    try { if (typeof tacticalCaptureStartingHexes === 'function') capturedStartHexes = tacticalCaptureStartingHexes(battle); } catch (e) {}
    try {
        if (typeof tacticalInitializeBattleOccupancyHistory === 'function') {
            tacticalInitializeBattleOccupancyHistory(battle.tacticalMap || (appData && appData.map), battle.playerSquads || [],
                (battle.tacticalMap && battle.tacticalMap.enemySquads) || battle.enemySquads || []);
        }
        if (typeof tacticalInitializeBattleMorale === 'function' && battle.cardsChosen !== false) tacticalInitializeBattleMorale(battle);
    } catch (e) {}
    if (capturedStartHexes) { try { if (typeof saveData === 'function') saveData(); } catch (e) {} }
    if (p.announced) return;
    p.announced = true;
    const hp = String(battle.hexKey || '').split(',');
    const msg = `⚔️ Размещение завершено — бой на гексе (${hp[0]},${hp[1]}) начинается!` +
        ((appData.campaign && appData.campaign.online) ? ' Расстановка противника открыта.' : '');
    try { log(msg); } catch (e) {}
    placementInfo(msg, '#2ecc71');
    if (typeof appData !== 'undefined' && appData.currentBattleId === battle.id) {
        try { alert(msg); } catch (e) {}
        renderPlacementPanel();
        try { if (typeof updateTacticalTurnUI === 'function') updateTacticalTurnUI(); else if (typeof updateTacticalRoundUI === 'function') updateTacticalRoundUI(battle); } catch (e) {}
        try { if (typeof redrawMap === 'function') redrawMap(); } catch (e) {}
    }
}

// ---------- отрисовка зоны на карте боя ----------
function drawPlacementZone(ctx, size) {
    const battle = getCurrentBattleRecord();
    const p = battle && battle.placement;
    if (!p || !ctx || p.ambush) return;
    // The defending player must not see the attacker's deployment strip.
    if (p.attackerSide === 'enemy') return;
    if (p.phase === 'done' && !(appData.map && appData.map.mode === 'place')) return;
    const zone = placementZoneKeys(p.entryDir, placementMapSize(battle));
    if (!zone.length) return;
    const centers = {};
    (appData.map.centers || []).forEach(c => { centers[c.key] = c; });
    const mine = p.attackerSide === 'player';
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = mine ? '#2ecc71' : '#e74c3c';
    zone.forEach(key => {
        const c = centers[key];
        if (!c) return;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 180 * (60 * i - 30);
            const xi = c.x + size * Math.cos(a), yi = c.y + size * Math.sin(a);
            if (i === 0) ctx.moveTo(xi, yi); else ctx.lineTo(xi, yi);
        }
        ctx.closePath();
        ctx.fill();
    });
    ctx.restore();
}
