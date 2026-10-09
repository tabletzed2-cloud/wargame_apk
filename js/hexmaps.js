// ⚡ BUILD-МАРКЕР: v13.079 — синхронизируется с APP_VERSION (см. index.html, самопроверка сборки)
// ⚡ v13.066: start fortifications are DOT-only (trenches are standard on the
//    maps), DOTs are placed as real units with their own icons, and every
//    platoon HQ hex gets an ammo point marker.
// v13.062: initial eight-cell budget is separate from order-earned trenches.
// ⚡ v13.061: initial five-hex fortification setup with trench and DOT overlays.
// ═══════════════════════════════════════════════════════════════════════════
// ⚡ v13.049 (R34): КАРТЫ ГЕКСОВ ОПЕРАТИВНОЙ КАРТЫ ДЛЯ ТАКТИЧЕСКОГО БОЯ
//
// 1) Тактический бой начинается на гексе оперативной карты (col,row) и
//    открывает карту поля боя из папки «maps/Карты Валенсия/» — файл, имя
//    которого начинается с «col.row» (например «8.10 мост.json»).
//    Если карты для гекса нет — остаётся обычное поле 20×20 (как раньше).
//
// 2) Правки местности (окопы, подготовка позиций, воронки от обстрелов)
//    хранятся в appData.campaign.hexOverlays['col,row'].hexEdits и
//    НАКЛАДЫВАЮТСЯ на карту гекса и в редакторе, и в бою, у обоих игроков
//    (в онлайне — через state.p<role>.hexOverlays).
// ═══════════════════════════════════════════════════════════════════════════

// ⚡ v13.078: A.I.R.F. — глобальный бонус «Талреп-якорь». Бронетехника с талрепом
//    может заехать на гекс оперкарты с terrain='hill' ТОЛЬКО если на тактической
//    карте этого гекса есть хотя бы один гекс с level<=2 (т.е. есть «низменность»
//    или «среднегорье» — куда заехать с якорем можно). Если ВСЕ гексы
//    тактической карты — level=3 (самые высокие пики), заехать нельзя:
//    талрепу не за что зацепиться.
//    Использует кеш TACTICAL_HEX_MAPS; если карта ещё не загружена — вернёт
//    'unknown' (UI трактует как «не сейчас, проверь позже»).
//    Параметр includeOverlay — учитывать ли накопленные правки местности гекса
//    (по умолчанию false: проверка по эталону — иначе после обстрела ландшафт
//    может «открыть» низину, и это не та логика, что задумана).
function tacticalHexHasSublevel2(hexKey, includeOverlay) {
    if (!hexKey) return 'unknown';
    const map = TACTICAL_HEX_MAPS[hexKey];
    if (!map) return 'unknown';
    const grid = map.grid;
    if (!grid) return 'unknown';
    for (const k in grid) {
        const cell = grid[k];
        if (!cell) continue;
        const lvl = (cell.level !== undefined && cell.level !== null) ? cell.level : 0;
        if (lvl <= 2) return true;
    }
    return false;
}

const HEX_MAP_DIR = 'maps/Карты Валенсия/';
const HEX_MAP_DIR_ALT = 'maps/';
const HEX_MAP_INDEX_FILES = [HEX_MAP_DIR + 'index.json', HEX_MAP_DIR_ALT + 'index.json'];

let TACTICAL_HEX_INDEX = null;          // [{name, file}]
let tacticalHexIndexPromise = null;
const TACTICAL_HEX_MAPS = {};           // '8,10' → {grid, w, h} (без правок, эталон)
const TACTICAL_HEX_MAP_LOADING = {};    // '8,10' → Promise

// Текущее состояние редактора гекса (режим карты 'hexEdit')
let hexEditorState = null;

// ─────────────────────────── РАЗБОР ИМЁН И ИНДЕКС ───────────────────────────

// «8.10 мост.json» / «8,10.json» / «8-10 ...» → '8,10'
function tacticalHexKeyFromMapName(name) {
    if (!name) return null;
    const base = String(name).split('/').pop().replace(/\.json$/i, '').trim();
    const m = base.match(/^(\d{1,2})\s*[.,\-–]\s*(\d{1,2})(?!\d)/);
    if (!m) return null;
    return parseInt(m[1], 10) + ',' + parseInt(m[2], 10);
}

function normalizeTacticalMapData(raw) {
    let grid = null, enemySquads = [];
    if (raw) {
        if (raw.currentMap && raw.currentMap.grid) { grid = raw.currentMap.grid; enemySquads = raw.currentMap.enemySquads || []; }
        else if (raw.tacticalMap && raw.tacticalMap.grid) { grid = raw.tacticalMap.grid; enemySquads = raw.tacticalMap.enemySquads || []; }
        else if (raw.grid) { grid = raw.grid; enemySquads = raw.enemySquads || []; }
    }
    if (!grid) return null;
    let w = 0, h = 0;
    const out = {};
    const put = (col, row, cell) => {
        if (!cell) return;
        const c = { ...cell };
        if (!c.type) c.type = 'grass';
        if (!Array.isArray(c.squadIds)) c.squadIds = [];
        if (!Array.isArray(c.enemySquadIds)) c.enemySquadIds = [];
        if (!Array.isArray(c.markers)) c.markers = [];
        if (c.rotation === undefined) c.rotation = 0;
        if (c.variant === undefined) c.variant = 0;
        if (c.level === undefined) c.level = 0;
        out[col + ',' + row] = c;
        if (col + 1 > w) w = col + 1;
        if (row + 1 > h) h = row + 1;
    };
    if (Array.isArray(grid)) {
        // сетка как массив строк/столбцов
        grid.forEach((rowArr, row) => {
            if (Array.isArray(rowArr)) rowArr.forEach((cell, col) => put(col, row, cell));
        });
    } else {
        Object.keys(grid).forEach(k => {
            const parts = String(k).split(',').map(Number);
            if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return;
            put(parts[0], parts[1], grid[k]);
        });
    }
    if (w === 0 || h === 0) return null;
    return { grid: out, w, h, enemySquads };
}

// Список карт: maps/Карты Валенсия/index.json, иначе maps/index.json
function loadTacticalHexIndex() {
    if (TACTICAL_HEX_INDEX) return Promise.resolve(TACTICAL_HEX_INDEX);
    if (tacticalHexIndexPromise) return tacticalHexIndexPromise;
    const tryFetch = (url) => {
        if (typeof fetch !== 'function') return Promise.resolve(null);
        return fetch(url, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
    };
    tacticalHexIndexPromise = tryFetch(HEX_MAP_INDEX_FILES[0])
        .then(list => list || tryFetch(HEX_MAP_INDEX_FILES[1]))
        .then(list => {
            TACTICAL_HEX_INDEX = Array.isArray(list) ? list.filter(x => x && (x.file || x.name)) : [];
            return TACTICAL_HEX_INDEX;
        })
        .catch(() => { TACTICAL_HEX_INDEX = []; return TACTICAL_HEX_INDEX; });
    return tacticalHexIndexPromise;
}

function findHexMapEntry(hexKey) {
    if (!TACTICAL_HEX_INDEX) return null;
    const [c, r] = String(hexKey).split(',').map(Number);
    const exact = TACTICAL_HEX_INDEX.find(x => tacticalHexKeyFromMapName(x.name || '') === hexKey ||
                                               tacticalHexKeyFromMapName(x.file || '') === hexKey);
    if (exact) return exact;
    // «начинается с номера гекса» — 8.10 → 8,10 (первое совпадение)
    return TACTICAL_HEX_INDEX.find(x => {
        const k1 = tacticalHexKeyFromMapName(x.name || '');
        const k2 = tacticalHexKeyFromMapName(x.file || '');
        return k1 === hexKey || k2 === hexKey || (c === c && false);
    }) || null;
}

// Загрузка и кэширование карты гекса (без правок — эталон)
function ensureTacticalHexMap(hexKey) {
    if (TACTICAL_HEX_MAPS[hexKey]) return Promise.resolve(TACTICAL_HEX_MAPS[hexKey]);
    if (TACTICAL_HEX_MAP_LOADING[hexKey]) return TACTICAL_HEX_MAP_LOADING[hexKey];
    if (typeof fetch !== 'function') return Promise.resolve(null);
    const [c, r] = String(hexKey).split(',').map(Number);
    const load = (url) => fetch(url, { cache: 'no-cache' })
        .then(res => res.ok ? res.json() : null)
        .then(raw => normalizeTacticalMapData(raw))
        .catch(() => null);
    const p = loadTacticalHexIndex().then(list => {
        const cands = [];
        const entry = findHexMapEntry(hexKey);
        if (entry && entry.file) {
            const f = entry.file.indexOf('/') >= 0 ? entry.file : HEX_MAP_DIR + entry.file;
            cands.push(f);
            // ⚡ v13.053: в maps/index.json имя может отличаться от файла числом пробелов
            //    после номера гекса («10.8 дорога» ↔ «10.8  дорога») — пробуем оба варианта
            const f1 = f.replace(/(\d)\s{2,}/, '$1 ');
            const f2 = f.replace(/(\d) (?=\S)/, '$1  ');
            if (f1 !== f) cands.push(f1);
            if (f2 !== f) cands.push(f2);
        }
        cands.push(HEX_MAP_DIR + c + '.' + r + '.json');
        cands.push(HEX_MAP_DIR + c + ',' + r + '.json');
        cands.push(HEX_MAP_DIR_ALT + c + '.' + r + '.json');
        const step = (i) => (i >= cands.length ? Promise.resolve(null)
            : load(cands[i]).then(m => m || step(i + 1)));
        return step(0);
    }).then(mapData => {
        if (mapData) TACTICAL_HEX_MAPS[hexKey] = mapData;
        delete TACTICAL_HEX_MAP_LOADING[hexKey];
        return mapData;
    });
    TACTICAL_HEX_MAP_LOADING[hexKey] = p;
    return p;
}

// Фоновая загрузка карт из индекса (чтобы бой открывался мгновенно).
// ⚡ v13.050: карт стало ~150 (≈10 МБ) — грузим не все разом, а очередью
//    по 3 параллельно; первыми — гексы, где стоят юниты (свои и противника)
//    и их соседи, т.е. где бой вероятнее всего.
let _hexPreloadStarted = false;
function preloadTacticalHexMaps() {
    if (_hexPreloadStarted) return;
    _hexPreloadStarted = true;
    loadTacticalHexIndex().then(list => {
        const keys = [];
        (list || []).forEach(item => {
            const key = item.hex || tacticalHexKeyFromMapName(item.name || '') || tacticalHexKeyFromMapName(item.file || '');
            if (key && !TACTICAL_HEX_MAPS[key] && keys.indexOf(key) < 0) keys.push(key);
        });
        // приоритет: гексы с юнитами + соседи
        const hot = new Set();
        try {
            const units = [].concat((appData.campaign && appData.campaign.opUnits) || [],
                                    (appData.campaign && appData.campaign.enemyOpUnits) || []);
            units.forEach(u => {
                if (!u || u.col === null || u.col === undefined || u.row === null || u.row === undefined) return;
                hot.add(u.col + ',' + u.row);
                const nb = (typeof getOpHexNeighbors === 'function') ? getOpHexNeighbors(u.col, u.row) : [];
                (nb || []).forEach(n => { if (n && n.col !== undefined) hot.add(n.col + ',' + n.row); });
            });
        } catch (e) {}
        keys.sort((a, b) => (hot.has(b) ? 1 : 0) - (hot.has(a) ? 1 : 0));
        let i = 0;
        const next = () => {
            if (i >= keys.length) return Promise.resolve();
            const key = keys[i++];
            return ensureTacticalHexMap(key).catch(() => null).then(next);
        };
        for (let w = 0; w < 3; w++) next();
    }).catch(() => {});
}

// ─────────────────────────── ПРАВКИ МЕСТНОСТИ (ОВЕРЛЕИ) ───────────────────────────

function getHexOverlays() {
    if (!appData.campaign) appData.campaign = {};
    if (!appData.campaign.hexOverlays || typeof appData.campaign.hexOverlays !== 'object') {
        appData.campaign.hexOverlays = {};
    }
    return appData.campaign.hexOverlays;
}

function getHexOverlay(hexKey, create) {
    const all = getHexOverlays();
    let ov = all[hexKey];
    if (!ov && create) {
        ov = { hexEdits: {}, hexVariants: {}, hexRotations: {}, trenchPoints: 0, prepPoints: 0, shellings: 0 };
        all[hexKey] = ov;
    }
    if (ov) {
        if (!ov.hexEdits) ov.hexEdits = {};
        if (!ov.hexVariants) ov.hexVariants = {};
        if (!ov.hexRotations || typeof ov.hexRotations !== 'object') ov.hexRotations = {};
        if (typeof ov.trenchPoints !== 'number') ov.trenchPoints = 0;
        if (typeof ov.prepPoints !== 'number') ov.prepPoints = 0;
        if (typeof ov.shellings !== 'number') ov.shellings = 0;
        if (!ov.initialFortifications || typeof ov.initialFortifications !== 'object') {
            ov.initialFortifications = { trenchCells: [], dotCells: [] };
        }
        if (!Array.isArray(ov.initialFortifications.trenchCells)) ov.initialFortifications.trenchCells = [];
        if (!Array.isArray(ov.initialFortifications.dotCells)) ov.initialFortifications.dotCells = [];
    }
    return ov || null;
}

// ⚡ v13.066: на старте расставляются ТОЛЬКО ДОТы (окопы уже нарисованы на
//    картах по стандарту). Игрок за BeVe выбирает столько оперативных гексов,
//    сколько у него ДОТов, и в каждом указывает клетку для конкретного ДОТа.
const INITIAL_FORTIFICATION_TRENCH_LIMIT = 8;   // хранение старых сейвов (окопы v13.061–v13.065)
function countHexTrenchCells(ov) {
    ov = ov || {};
    const initial = ov.initialFortifications || {};
    const legacy = Object.keys(ov.hexEdits || {}).filter(k => ov.hexEdits[k] === 'trenches');
    return new Set([...(Array.isArray(initial.trenchCells) ? initial.trenchCells : []), ...legacy].map(String)).size;
}
// ─── ⚡ v13.066: ДОТы начальной расстановки ───
// У BeVe ДОТы идут опцией поддержки (обычно два: «ДОТ Bosh» и «ДОТ Van Hees»).
// Один оперативный гекс — один ДОТ: игрок выбирает два гекса, открывает карту
// каждого и кликом ставит туда конкретный ДОТ (иконка юнита, не метка).
function isDotOperationalUnit(u) {
    if (!u) return false;
    if (u.type === 'dots') return true;
    return /ДОТ/i.test(String(u.name || ''));
}
function initialDotUnits() {
    if (typeof appData === 'undefined' || !appData || !appData.campaign) return [];
    return (appData.campaign.opUnits || []).filter(isDotOperationalUnit);
}
// Сколько оперативных гексов нужно выбрать: по одному на каждый ДОТ батальона.
function initialFortificationHexCount() {
    return initialDotCandidates().length;
}
// Все ли ДОТы закреплены (каждый на своём оперативном гексе)
function initialFortificationComplete() {
    const cands = initialDotCandidates();
    if (!cands.length) return true;                 // ДОТов нет — расставлять нечего
    const hexes = new Set();
    let bound = 0;
    cands.forEach(x => {
        const p = x.squad && x.squad.fixedTacticalPosition;
        if (p && p.hexKey && p.key) { bound++; hexes.add(String(p.hexKey)); }
    });
    return bound === cands.length && hexes.size === cands.length;
}
// Клетки оперативного гекса, за которыми закреплён ДОТ: 'клетка' → {icon, name}
// Используется, чтобы в редакторе карты гекса рисовать ИКОНКУ юнита ДОТа.
function dotFixedSquadsForHex(hexKey) {
    const out = {};
    if (!hexKey || typeof appData === 'undefined' || !appData || !appData.campaign) return out;
    (appData.campaign.opUnits || []).forEach(u => {
        (u.squads || []).forEach(s => {
            const p = s && s.fixedTacticalPosition;
            if (!p || String(p.hexKey) !== String(hexKey) || !p.key) return;
            out[p.key] = { icon: s.icon || u.icon || 'images/BeVe/ДОТ Bosh.png', name: s.name || u.name || 'ДОТ' };
        });
    });
    return out;
}
// Стоит ли на клетке настоящий юнит ДОТа (в бою) — тогда метку «🏰» не рисуем:
// вместо неё уже нарисована иконка отряда.
function cellHasRealDotUnit(hexData) {
    if (!hexData) return false;
    const isDot = s => !!s && /ДОТ/i.test(String(s.name || ''));
    const own = (typeof appData !== 'undefined' && appData && Array.isArray(appData.squads)) ? appData.squads : [];
    if ((hexData.squadIds || []).some(i => isDot(own[i]))) return true;
    const enemies = (typeof appData !== 'undefined' && appData && appData.map && Array.isArray(appData.map.enemySquads))
        ? appData.map.enemySquads : [];
    return (hexData.enemySquadIds || []).some(i => isDot(enemies[i]));
}
function normalizeHexRotation(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Number.isFinite(fallback) ? fallback : 0;
    return ((Math.round(n / 60) * 60) % 360 + 360) % 360;
}
function isEnemyOperationalUnit(unitOrName) {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || {};
    const name = typeof unitOrName === 'string' ? unitOrName : (unitOrName && unitOrName.name);
    return (camp.enemyOpUnits || []).some(enemy => enemy && (
        enemy === unitOrName || (name && enemy.name === name &&
            (typeof unitOrName === 'string' || !unitOrName.faction || !enemy.faction || enemy.faction === unitOrName.faction))
    ));
}
function getInitialFortificationData(hexKey, create) {
    const ov = getHexOverlay(hexKey, !!create);
    return ov ? ov.initialFortifications : null;
}
// Русские числительные для подсказок («2 гекса», «5 гексов»)
function initialFortificationWord(n, forms) {
    const a = Math.abs(Number(n) || 0) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
}
function renderInitialFortificationStatus() {
    const panel = (typeof document !== 'undefined') ? document.getElementById('initialFortificationStatus') : null;
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    const button = (typeof document !== 'undefined') ? document.getElementById('btnInitialFortificationSetup') : null;
    const total = initialFortificationHexCount();
    // ⚡ v13.066: укрепления на старте расставляет только BeVe и только по ДОТам
    const enabled = !!(camp && camp.playerFaction === 'BeVe' && total > 0);
    if (button) {
        button.style.display = enabled ? 'inline-block' : 'none';
        if (enabled) button.innerHTML = `🪖 Расставить ДОТы (${total})`;
    }
    if (!panel || !camp) return;
    if (!enabled) { panel.style.display = 'none'; return; }
    const state = camp.initialFortificationSetup || {};
    const done = initialFortificationComplete();
    if (!state.phase && !done && ((camp.currentTurn || 1) > 1 || (typeof placementLocked !== 'undefined' && placementLocked))) {
        panel.style.display = 'none';
        return;
    }
    const keys = Array.isArray(state.hexKeys) ? state.hexKeys : (camp.initialFortificationHexes || []);
    const safeKeys = keys.map(k => String(k).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));
    let text = '';
    if (done) {
        text = `✅ ДОТы расставлены: ${safeKeys.length ? safeKeys.map(k => `(${k})`).join(', ') : 'все'}. Окопы на старте больше не расставляются — они уже нарисованы на картах по стандарту. Можно открыть редактор ДОТов повторно.`;
    } else if (state.phase === 'edit') {
        text = `🛠️ Расстановка ДОТов: карта ${Math.min((state.nextIndex || 0) + 1, Math.max(1, total))}/${total} — гексы: ${safeKeys.map(k => `(${k})`).join(', ')}.`;
    } else if (state.phase === 'select' || camp.opMapMode === 'selectInitialFortificationHexes') {
        text = `🪖 Выбрано гексов: ${safeKeys.length}/${total}. Кликните по оперативной карте, чтобы выбрать ещё ${Math.max(0, total - safeKeys.length)} (каждый гекс — под один ДОТ). Повторный клик снимает выбор.`;
    } else {
        text = `Перед завершением начальной расстановки выберите ${total} ${initialFortificationWord(total, ['гекс', 'гекса', 'гексов'])} оперативной карты — по одному под каждый ДОТ — и укажите на тактической карте клетку для ДОТа.`;
    }
    panel.innerHTML = text;
    panel.style.display = 'block';
}
function startInitialFortificationSetup() {
    const camp = appData && appData.campaign;
    if (!camp || camp.playerFaction !== 'BeVe') return false;
    if (appData.currentBattleId || hexEditorState) {
        alert('Сначала выйдите из редактора карты гекса или тактического боя.');
        return false;
    }
    if ((camp.currentTurn || 1) > 1 || (typeof placementLocked !== 'undefined' && placementLocked)) {
        alert('ДОТы расставляются только при начальной расстановке.');
        return false;
    }
    const total = initialFortificationHexCount();
    if (total <= 0) {
        alert('В батальоне нет ДОТов — расставлять нечего.');
        renderInitialFortificationStatus();
        return false;
    }
    let state = camp.initialFortificationSetup;
    const staleState = !state || !Array.isArray(state.hexKeys) || state.hexKeys.length !== total;
    if (staleState) {
        state = { phase: 'select', hexKeys: [], nextIndex: 0, complete: false };
        camp.initialFortificationSetup = state;
    }
    if (state.complete || initialFortificationComplete()) {
        // повторное открытие редактора: заменяем уже поставленные ДОТы
        state.phase = 'select';
        state.hexKeys = [];
        state.nextIndex = 0;
        state.complete = false;
        camp.initialFortificationHexes = [];
    }
    if (state.phase === 'edit' && state.hexKeys.length === total) {
        const index = Math.max(0, Math.min(state.nextIndex || 0, total - 1));
        state.nextIndex = index;
        renderInitialFortificationStatus();
        saveData();
        openHexEditorForBattle(state.hexKeys[index], 'initialFortification');
        return true;
    }
    state.phase = 'select';
    state.complete = false;
    if (typeof setOpMapMode === 'function') setOpMapMode('selectInitialFortificationHexes');
    else camp.opMapMode = 'selectInitialFortificationHexes';
    renderInitialFortificationStatus();
    const mi = document.getElementById('mapInfo');
    if (mi) {
        mi.innerHTML = `🪖 Выберите ${total} ${initialFortificationWord(total, ['гекс', 'гекса', 'гексов'])} оперативной карты — по одному под каждый ДОТ. Повторный клик снимает отметку.`;
        mi.style.color = '#f1c40f';
    }
    saveData();
    return true;
}
function selectInitialFortificationHex(hexKey) {
    const camp = appData && appData.campaign;
    const state = camp && camp.initialFortificationSetup;
    if (!state || state.phase !== 'select' || !hexKey) return false;
    const total = Math.max(1, initialFortificationHexCount());
    const mi = document.getElementById('mapInfo');
    // ДОТ ставится только в своей стартовой зоне
    const [col, row] = String(hexKey).split(',').map(Number);
    if (typeof isHexInPlacementZone === 'function' && camp.scenario &&
        !isHexInPlacementZone(camp.scenario, camp.playerFaction, col, row).ok) {
        if (mi) { mi.innerHTML = `⛔ Гекс (${hexKey}) вне вашей стартовой зоны — ДОТ там стоять не может.`; mi.style.color = '#e74c3c'; }
        return true;
    }
    const keys = Array.isArray(state.hexKeys) ? state.hexKeys : (state.hexKeys = []);
    const idx = keys.indexOf(hexKey);
    if (idx >= 0) keys.splice(idx, 1);
    else if (keys.length >= total) {
        if (mi) { mi.innerHTML = `Уже выбрано ${total} ${initialFortificationWord(total, ['гекс', 'гекса', 'гексов'])}. Повторно кликните выбранный, чтобы заменить его.`; mi.style.color = '#e67e22'; }
        return true;
    } else keys.push(hexKey);
    camp.initialFortificationHexes = keys.slice();
    if (keys.length === total) {
        state.phase = 'edit';
        state.nextIndex = 0;
        state.complete = false;
        camp.opMapMode = 'view';
        saveData();
        renderInitialFortificationStatus();
        openHexEditorForBattle(keys[0], 'initialFortification');
    } else {
        saveData();
        renderInitialFortificationStatus();
        if (mi) { mi.innerHTML = `✅ Отмечен гекс (${hexKey}). Выбрано ${keys.length}/${total}.`; mi.style.color = '#27ae60'; }
        try { redrawOperationalMap(); } catch (e) {}
    }
    return true;
}

// Накладываем правки на сетку (и в редакторе, и в бою, у обоих игроков).
// ⚡ v13.053 (R38#2): можно вызывать ПОВТОРНО на уже идущей карте боя — клетки,
//    наложенные раньше (cell.ov), но исчезнувшие из правок (отмена в редакторе),
//    возвращаются к типу эталонной карты гекса; отряды на клетках не трогаем.
function applyHexOverlays(grid, hexKey) {
    if (!grid) return grid;
    const ov = getHexOverlay(hexKey, false);
    const edits = (ov && ov.hexEdits) || {};
    const rotations = (ov && ov.hexRotations) || {};
    const fort = (ov && ov.initialFortifications) || { trenchCells: [], dotCells: [] };
    const trenches = new Set(Array.isArray(fort.trenchCells) ? fort.trenchCells : []);
    const dots = new Set(Array.isArray(fort.dotCells) ? fort.dotCells : []);
    const md = TACTICAL_HEX_MAPS[hexKey];
    Object.keys(grid).forEach(k => {
        const cell = grid[k];
        if (!cell) return;
        const base = md && md.grid ? md.grid[k] : null;
        if (cell._deploymentTrenchOverlay) {
            cell.type = edits[k] || (base ? base.type : 'grass');
            cell.variant = edits[k] ? ((ov.hexVariants && ov.hexVariants[k]) || 0) : (base ? (base.variant || 0) : 0);
            cell.rotation = (rotations[k] !== undefined) ? normalizeHexRotation(rotations[k]) : normalizeHexRotation(base && base.rotation, 0);
            delete cell._deploymentTrenchOverlay;
        }
        if (cell._deploymentDotOverlay) {
            if (Array.isArray(cell.markers)) cell.markers = cell.markers.filter(m => m !== 'dot');
            delete cell._deploymentDotOverlay;
        }
        // Старые hexEdits удалённые редактором возвращаются к эталонной клетке.
        if (cell.ov && !edits[k] && !trenches.has(k)) {
            cell.type = base ? base.type : 'grass';
            cell.variant = base ? (base.variant || 0) : 0;
            if (rotations[k] === undefined) cell.rotation = normalizeHexRotation(base && base.rotation, 0);
            delete cell.ov;
        }
    });
    Object.keys(edits).forEach(k => {
        const cell = grid[k];
        if (!cell) return;
        cell.type = edits[k];
        cell.variant = (ov.hexVariants && ov.hexVariants[k]) || 0;
        cell.ov = 1;
    });
    trenches.forEach(k => {
        const cell = grid[k];
        if (!cell) return;
        cell.type = 'trenches';
        cell.variant = (ov.hexVariants && ov.hexVariants[k]) || 0;
        cell.ov = 1;
        cell._deploymentTrenchOverlay = 1;
    });
    dots.forEach(k => {
        const cell = grid[k];
        if (!cell) return;
        if (!Array.isArray(cell.markers)) cell.markers = [];
        if (!cell.markers.includes('dot')) cell.markers.push('dot');
        cell._deploymentDotOverlay = 1;
    });
    Object.keys(rotations).forEach(k => {
        if (grid[k]) grid[k].rotation = normalizeHexRotation(rotations[k], grid[k].rotation || 0);
    });
    return grid;
}

// ⚡ v13.053 (R38#2): правки гекса → на карты УЖЕ ИДУЩИХ боёв на этом гексе
//    (и на открытую карту боя). Раньше карта боя строилась один раз при старте:
//    воронки от обстрела/окопы, появившиеся позже (или пришедшие от оппонента
//    позже), в идущем бою не появлялись — у двух игроков карты расходились.
function applyHexOverlaysToBattles(hexKey) {
    if (!hexKey || typeof appData === 'undefined' || !appData.campaign) return 0;
    let n = 0;
    (appData.campaign.activeBattles || []).forEach(b => {
        if (!b || b.hexKey !== hexKey) return;
        if (b.tacticalMap && b.tacticalMap.grid) { applyHexOverlays(b.tacticalMap.grid, hexKey); n++; }
        const live = appData.currentBattleId !== null && appData.currentBattleId !== undefined && appData.currentBattleId === b.id;
        if (live && appData.map && appData.map.grid && appData.map.mode !== 'hexEdit') {
            applyHexOverlays(appData.map.grid, hexKey);
            const ba = document.getElementById('battleApp');
            if (ba && ba.style.display !== 'none') { try { redrawMap(); } catch (e) {} }
        }
    });
    return n;
}

function saveHexOverlays(hexKey) {
    if (hexKey) { try { applyHexOverlaysToBattles(hexKey); } catch (e) {} }
    try { saveData(); } catch (e) {}
    if (typeof onlinePushHexOverlays === 'function') { try { onlinePushHexOverlays(); } catch (e) {} }
}

// Слияние облачных правок с локальными.
// ⚡ v13.053 (R38#2): объединение — одинаковое у обоих игроков: клетка, которую
//    правили ОБА (например, воронки двух обстрелов легли на одну клетку с разной
//    текстурой), берётся у игрока p1 — у обоих получается одна и та же карта.
//    Изменившиеся гексы сразу накладываются на карты идущих боёв.
function mergeHexOverlays(cloud) {
    if (!cloud || typeof cloud !== 'object') return false;
    const local = getHexOverlays();
    const cloudWins = (typeof ONLINE !== 'undefined' && ONLINE && ONLINE.role === 'p2'); // облако = p1
    let changed = false;
    const touched = [];
    Object.keys(cloud).forEach(hexKey => {
        const c = cloud[hexKey] || {};
        let hexChanged = false;
        if (!local[hexKey]) {
            local[hexKey] = { hexEdits: {}, hexVariants: {}, hexRotations: {}, trenchPoints: 0, prepPoints: 0, shellings: 0 };
            hexChanged = true;
        }
        const l = local[hexKey];
        if (!l.hexEdits) l.hexEdits = {};
        if (!l.hexVariants) l.hexVariants = {};
        if (!l.hexRotations || typeof l.hexRotations !== 'object') l.hexRotations = {};
        if (!l.initialFortifications || typeof l.initialFortifications !== 'object') l.initialFortifications = { trenchCells: [], dotCells: [] };
        if (!Array.isArray(l.initialFortifications.trenchCells)) l.initialFortifications.trenchCells = [];
        if (!Array.isArray(l.initialFortifications.dotCells)) l.initialFortifications.dotCells = [];
        Object.keys(c.hexEdits || {}).forEach(k => {
            const cv = c.hexEdits[k];
            const cvar = (c.hexVariants && c.hexVariants[k] !== undefined) ? c.hexVariants[k] : 0;
            if (!(k in l.hexEdits)) { l.hexEdits[k] = cv; l.hexVariants[k] = cvar; hexChanged = true; return; }
            if (cloudWins && (l.hexEdits[k] !== cv || (l.hexVariants[k] || 0) !== cvar)) {
                l.hexEdits[k] = cv; l.hexVariants[k] = cvar; hexChanged = true;
            }
        });
        Object.keys(c.hexRotations || {}).forEach(k => {
            const value = normalizeHexRotation(c.hexRotations[k]);
            if (!(k in l.hexRotations)) { l.hexRotations[k] = value; hexChanged = true; return; }
            if (cloudWins && normalizeHexRotation(l.hexRotations[k]) !== value) {
                l.hexRotations[k] = value;
                hexChanged = true;
            }
        });
        const cf = c.initialFortifications || {};
        ['trenchCells', 'dotCells'].forEach(field => {
            const merged = Array.from(new Set([...(l.initialFortifications[field] || []), ...(Array.isArray(cf[field]) ? cf[field] : [])].map(String))).sort();
            const bounded = field === 'trenchCells' ? merged.slice(0, INITIAL_FORTIFICATION_TRENCH_LIMIT) : merged;
            if (JSON.stringify(l.initialFortifications[field]) !== JSON.stringify(bounded)) {
                l.initialFortifications[field] = bounded;
                hexChanged = true;
            }
        });
        // Бюджеты приказов — локальные: право размещать окопы/позиции
        // принадлежит игроку, чей оперативный отряд выполнил приказ.
        // Сопернику синхронизируем только уже внесённые правки и число обстрелов.
        const cloudShellings = Number(c.shellings) || 0;
        if (cloudShellings > (Number(l.shellings) || 0)) {
            l.shellings = cloudShellings;
            hexChanged = true;
        }
        if (hexChanged) { changed = true; touched.push(hexKey); }
    });
    touched.forEach(hexKey => { try { applyHexOverlaysToBattles(hexKey); } catch (e) {} });
    return changed;
}

// ─────────────────────── СЕТКА БОЯ ИЗ КАРТЫ ГЕКСА ───────────────────────

// Синхронно: готовая сетка для боя (null — карты ещё нет/не загружена)
function buildBattleGridForHex(hexKey) {
    const md = TACTICAL_HEX_MAPS[hexKey];
    if (!md) return null;
    const size = Math.max(md.w || 0, md.h || 0, 15);
    const grid = {};
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const k = col + ',' + row;
            const src = md.grid[k];
            // ⚡ v13.050: поворот (дороги/окопы), вариант текстуры (склоны, рожь)
            //    и уровень высоты берём ИЗ КАРТЫ автора — сбрасываем только
            //    боевое состояние (отряды, метки боя).
            grid[k] = src ? { ...src, squadIds: [], enemySquadIds: [], markers: [],
                              rotation: src.rotation || 0, variant: src.variant || 0, level: src.level || 0 }
                          : { type: 'grass', squadIds: [], enemySquadIds: [], markers: [], rotation: 0, variant: 0, level: 0 };
        }
    }
    applyHexOverlays(grid, hexKey);
    return { grid, size };
}

// Открывает карту гекса для текущего боя (если не загружена — подгрузит и перерисует)
function openHexMapForBattle(hexKey, tacticalMap) {
    // ⚡ v13.077: туман войны — бой на оперативном гексе «открывает» его:
    // окопы/подготовленные позиции противника становятся видны на карте кампании
    try { if (typeof opFogRevealHex === 'function') opFogRevealHex(hexKey); } catch (e) {}
    const built = buildBattleGridForHex(hexKey);
    if (built) {
        tacticalMap.grid = built.grid;
        tacticalMap.mapSize = built.size;
        if (typeof TACTICAL_MAP_SIZE !== 'undefined') TACTICAL_MAP_SIZE = built.size;
        return true;
    }
    // ⚡ v13.053 (R38#2): карта догружается ПОЗЖЕ — обновляем именно ТОТ бой,
    //    который создаётся сейчас (по гексу), а не «что открыто на экране»:
    //    раньше зеркало боя оппонента, созданное в фоне, оставалось на пустом
    //    поле 20×20, а карта гекса вписывалась в чужую открытую карту (или в
    //    редактор окопов) — карты у двух игроков расходились.
    const startedAt = Date.now();
    ensureTacticalHexMap(hexKey).then(md => {
        if (!md) return;
        const built2 = buildBattleGridForHex(hexKey);
        if (!built2) return;
        const withKeep = (srcGrid) => {
            const g = JSON.parse(JSON.stringify(built2.grid));
            Object.keys(srcGrid || {}).forEach(k => {
                const h = srcGrid[k];
                if (h && ((h.squadIds && h.squadIds.length) || (h.enemySquadIds && h.enemySquadIds.length))) {
                    if (!g[k]) g[k] = { type: 'grass', squadIds: [], enemySquadIds: [], markers: [], rotation: 0, variant: 0, level: 0 };
                    Object.assign(g[k], { squadIds: h.squadIds, enemySquadIds: h.enemySquadIds, markers: h.markers || [] });
                }
            });
            return g;
        };
        const battles = (appData.campaign && appData.campaign.activeBattles) || [];
        // бой на этом гексе, созданный этим вызовом (самый новый, но не раньше вызова)
        const b = battles.filter(x => x && x.hexKey === hexKey && typeof x.id === 'number' && x.id >= startedAt - 1000)
            .sort((a, c) => c.id - a.id)[0] || battles.filter(x => x && x.hexKey === hexKey).sort((a, c) => c.id - a.id)[0] || null;
        if (b && b.tacticalMap) {
            b.tacticalMap.grid = withKeep(b.tacticalMap.grid);
            b.tacticalMap.mapSize = built2.size;
            applyFixedDotPositions(b);
        }
        const live = b && appData.currentBattleId !== null && appData.currentBattleId !== undefined && appData.currentBattleId === b.id;
        const editorOpen = (typeof hexEditorState !== 'undefined') && !!hexEditorState;
        if (live && !editorOpen && appData.map) {
            appData.map.grid = withKeep(appData.map.grid);
            appData.map.mapSize = built2.size;
            applyFixedDotPositions({ hexKey, tacticalMap: appData.map, playerSquads: appData.squads });
            try { TACTICAL_MAP_SIZE = built2.size; } catch (e) {}
            try { initMap(); redrawMap(); } catch (e) {}
            const mi = document.getElementById('mapInfo');
            if (mi) { mi.innerHTML = '🗺️ Карта гекса (' + hexKey + ') загружена.'; mi.style.color = '#27ae60'; }
        }
        try { saveData(); } catch (e) {}
    });
    return false;
}

// ─────────────────── ПРАВИЛА: ГЛУБИНА ЛЕСА И УКРЫТИЕ ───────────────────

function _hexCubeCoords(c, r) { const x = c - (r - (r & 1)) / 2; const z = r; return { x, y: -x - z, z }; }

function hexGridDistance(c1, r1, c2, r2) {
    const a = _hexCubeCoords(c1, r1), b = _hexCubeCoords(c2, r2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

// Гекс, на котором стоит отряд боя (свой — squadIds, враг — enemySquadIds)
function getBattleSquadHex(grid, idx, isEnemy) {
    for (const k in grid) {
        const cell = grid[k];
        const arr = isEnemy ? cell.enemySquadIds : cell.squadIds;
        if (arr && arr.includes(idx)) {
            const p = k.split(',').map(Number);
            return { col: p[0], row: p[1], key: k };
        }
    }
    return null;
}

function isForestHexType(type) { return (typeof FOREST_LIKE_TYPES !== 'undefined') && FOREST_LIKE_TYPES.indexOf(type) >= 0; }

// Глубина леса от гекса цели в сторону стрелка (сколько гексов леса подряд,
// считая сам гекс цели). Не более 3 для проверки «>2».
function tacticalForestDepth(grid, sc, sr, tc, tr) {
    const steps = hexGridDistance(sc, sr, tc, tr);
    if (steps <= 0) return 0;
    const tCell = grid[tc + ',' + tr];
    if (!tCell || !isForestHexType(tCell.type)) return 0;
    const a = _hexCubeCoords(sc, sr), b = _hexCubeCoords(tc, tr);
    let depth = 0;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(b.x + (a.x - b.x) * t);
        const y = Math.round(b.y + (a.y - b.y) * t);
        const z = Math.round(b.z + (a.z - b.z) * t);
        const col = x + (z - (z & 1)) / 2, row = z;
        const cell = grid[col + ',' + row];
        if (cell && isForestHexType(cell.type)) { depth++; if (depth > 2) return depth; }
        else if (i > 0) break;   // лес кончился — глубина посчитана
        else return 0;           // цель не в лесу
    }
    return depth;
}

// Стрельба из стрелкового оружия по цели в лесу глубже 2 гексов — запрещена
function smallArmsBlockedByForest(grid, shooterIdx, targetIdx) {
    if (!grid) return null;
    const s = getBattleSquadHex(grid, shooterIdx, false);
    const t = getBattleSquadHex(grid, targetIdx, true);
    if (!s || !t) return null;
    const d = tacticalForestDepth(grid, s.col, s.row, t.col, t.row);
    if (d > 2) return { depth: d, from: s, to: t };
    return null;
}

// Укрытие местности: воронки — как камни (+2 к сложности попадания)
function getTacticalCoverMod(type) {
    if (typeof COVER_LIKE_ROCKS_TYPES !== 'undefined' && COVER_LIKE_ROCKS_TYPES.indexOf(type) >= 0) return 2;
    if (isForestHexType(type)) return 1;
    if (type === 'bushes' || type === 'trenches') return 1;
    return 0;
}

function getTacticalCoverInfoForEnemy(grid, enemyIdx) {
    const pos = getBattleSquadHex(grid, enemyIdx, true);
    if (!pos) return null;
    const cell = grid[pos.key];
    const mod = getTacticalCoverMod(cell ? cell.type : 'grass');
    const names = { rocks: 'камни', craters: 'воронки', forest: 'лес', shelled_forest: 'обстрелянный лес',
                    bushes: 'кусты', trenches: 'окопы' };
    return { pos, mod, type: cell ? cell.type : 'grass', label: names[cell ? cell.type : 'grass'] || (cell ? cell.type : '') };
}

// ─────────────────── ВОРОНКИ ОТ АРТИЛЛЕРИЙСКОГО ОБСТРЕЛА ───────────────────

// За каждый обстрел гекса — 5 гексов воронок/обстрелянного леса.
// Места: случайные, приоритет — рядом с окопами. Позиции фиксируются
// в оверлее, поэтому у обоих игроков картина одинаковая.
function addShellingCraters(hexKey, count) {
    count = count || 5;
    return ensureTacticalHexMap(hexKey).then(md => {
        if (!md) return 0;
        return _applyShellingCraters(hexKey, count);
    });
}

// Синхронная часть (карта гекса уже загружена) — 5 гексов воронок/обстрелянного
// леса за обстрел; позиции фиксируются в оверлее (одинаково у обоих игроков)
function _applyShellingCraters(hexKey, count) {
    const md = TACTICAL_HEX_MAPS[hexKey];
    if (!md) return 0;
    count = count || 5;
    {
        const ov = getHexOverlay(hexKey, true);
        ov.shellings = (ov.shellings || 0) + 1;
        const size = Math.max(md.w || 0, md.h || 0, 15);
        const usable = [];
        const nearTrenches = [];
        Object.keys(md.grid).forEach(k => {
            if (ov.hexEdits[k]) return;                 // уже правили — не трогаем
            const cell = md.grid[k];
            const t = cell.type;
            if (isForestHexType(t) || t === 'grass' || t === 'bushes') {
                const p = k.split(',').map(Number);
                // рядом (в 1 гексе) есть окоп?
                let near = false;
                for (let dc = -1; dc <= 1 && !near; dc++) {
                    for (let dr = -1; dr <= 1 && !near; dr++) {
                        if (dc === 0 && dr === 0) continue;
                        if (ov.hexEdits[(p[0] + dc) + ',' + (p[1] + dr)] === 'trenches') near = true;
                    }
                }
                (near ? nearTrenches : usable).push(k);
            }
        });
        const pick = (arr) => {
            const i = Math.floor(Math.random() * arr.length);
            return arr.splice(i, 1)[0];
        };
        let placed = 0;
        while (placed < count && (usable.length || nearTrenches.length)) {
            const k = (nearTrenches.length && (usable.length === 0 || Math.random() < 0.5)) ? pick(nearTrenches) : pick(usable);
            const cell = md.grid[k];
            if (isForestHexType(cell.type)) {
                ov.hexEdits[k] = 'shelled_forest';
            } else {
                ov.hexEdits[k] = 'craters';
            }
            // ⚡ случайная текстура из набора типа (воронки 1/2, обстрелянный лес 1/2)
            const tData = (typeof TERRAIN_DATA !== 'undefined') ? TERRAIN_DATA[ov.hexEdits[k]] : null;
            const nVar = (tData && tData.images) ? tData.images.length : 1;
            ov.hexVariants[k] = (nVar > 1) ? Math.floor(Math.random() * nVar) : 0;
            placed++;
        }
        saveHexOverlays(hexKey);
        log(`💥 Обстрел гекса (${hexKey}): на тактической карте появилось воронок/обстрелянного леса — ${placed} (всего обстрелов: ${ov.shellings}).`);
        return placed;
    }
}

// ─────────────────── ВЫДАЧА ПРАВОК ПО ПРИКАЗАМ ───────────────────

// Окопы: за каждый отряд взвода, который окапывался на гексе, — 1 гекс окопа
function grantTrenchPoints(hexKey, squadsCount, unitName, enemySide) {
    const ov = getHexOverlay(hexKey, true);
    const n = Math.max(1, Math.floor(Number(squadsCount) || 1));
    if (enemySide === undefined) enemySide = isEnemyOperationalUnit(unitName);
    if (enemySide) {
        log(`🕳️ ${unitName || 'Вражеский отряд'} завершил окапывание на гексе (${hexKey}); бюджет редактирования игроку не выдаётся.`);
        return ov.trenchPoints || 0;
    }
    const currentBudget = Math.max(0, Math.floor(Number(ov.trenchPoints) || 0));
    const granted = n;
    ov.trenchPoints = currentBudget + granted;
    saveHexOverlays(hexKey);
    if (granted > 0) {
        log(`🕳️ ${unitName || 'Отряд'}: доступно гексов окопов на гексе (${hexKey}) — +${granted} (всего ${ov.trenchPoints}).`);
        showHexEditButton(hexKey, 'trenches');
        queueHexEditPrompt(hexKey, 'trenches', unitName);
    } else {
        log(`🕳️ ${unitName || 'Отряд'}: лимит ${INITIAL_FORTIFICATION_TRENCH_LIMIT} клеток окопов на гексе (${hexKey}) уже исчерпан.`);
    }
    return ov.trenchPoints;
}

// Подготовка позиций: за каждый отряд взвода — 1 правка местности
// (лес → поваленный лес, кусты → трава)
function grantPrepPoints(hexKey, squadsCount, unitName, enemySide) {
    const ov = getHexOverlay(hexKey, true);
    if (enemySide === undefined) enemySide = isEnemyOperationalUnit(unitName);
    if (enemySide) {
        log(`🪓 ${unitName || 'Вражеский отряд'} завершил подготовку позиций на гексе (${hexKey}); бюджет редактирования игроку не выдаётся.`);
        return ov.prepPoints || 0;
    }
    const n = Math.max(1, Math.floor(Number(squadsCount) || 1));
    ov.prepPoints = (ov.prepPoints || 0) + n;
    saveHexOverlays(hexKey);
    log(`🪓 ${unitName || 'Отряд'}: доступно правок «подготовка позиций» на гексе (${hexKey}) — +${n} (всего ${ov.prepPoints}).`);
    showHexEditButton(hexKey, 'prep');
    queueHexEditPrompt(hexKey, 'prep', unitName);
    return ov.prepPoints;
}

// ⚡ v13.053 (R38#3): приказ выполнен → сразу предлагаем открыть карту гекса
//    (одно окно на все приказы этого хода; из боя карту не открываем —
//    остаётся панель «🛠️ Карты гексов» под оперативной картой)
let __hexEditPromptQueue = [];
let __hexEditPromptTimer = null;
function queueHexEditPrompt(hexKey, kind, unitName) {
    if (isEnemyOperationalUnit(unitName)) return;
    __hexEditPromptQueue.push({ hexKey, kind, unitName });
    if (__hexEditPromptTimer) return;
    __hexEditPromptTimer = setTimeout(() => { __hexEditPromptTimer = null; promptPendingHexEdits(); }, 50);
}
function promptPendingHexEdits() {
    const q = __hexEditPromptQueue.splice(0);
    renderHexEditsPanel();
    if (q.length === 0) return false;
    if (typeof confirm !== 'function') return false;
    if (hexEditorState) return false;
    if (typeof appData !== 'undefined' && appData.currentBattleId) return false; // идёт бой — не прерываем
    const first = q[0];
    const ov = getHexOverlay(first.hexKey, false) || {};
    const left = first.kind === 'trenches' ? (ov.trenchPoints || 0) : (ov.prepPoints || 0);
    if (left <= 0) return false;
    const what = first.kind === 'trenches' ? `окопов: ${left}` : `правок «подготовка позиций»: ${left}`;
    const more = q.length > 1 ? `\n(ещё гексов с правками: ${q.length - 1} — см. панель «🛠️ Карты гексов» под картой)` : '';
    let yes = false;
    try {
        yes = confirm(`✅ ${first.unitName || 'Отряд'}: приказ выполнен на гексе (${first.hexKey}) — доступно ${what}.\n` +
                      `Открыть карту гекса и расставить сейчас?${more}`);
    } catch (e) { yes = false; }
    if (yes) {
        // остальные гексы предложим после «Готово»
        __hexEditPromptQueue = q.slice(1).filter(x => x.hexKey !== first.hexKey);
        try { openHexEditorForBattle(first.hexKey, first.kind); } catch (e) { console.warn('openHexEditorForBattle:', e.message); }
    }
    return yes;
}

// ⚡ v13.053 (R38#3): постоянная панель под оперативной картой — гексы с
//    доступными правками и кнопки открытия карты (не зависит от строки сообщений)
function renderHexEditsPanel() {
    const all = (typeof appData !== 'undefined' && appData.campaign && appData.campaign.hexOverlays) || {};
    const rows = Object.keys(all).filter(k => all[k] && ((all[k].trenchPoints || 0) > 0 || (all[k].prepPoints || 0) > 0 || countHexTrenchCells(all[k]) > 0));
    const rowHtml = (k) => {
        const ov = all[k];
        const placed = countHexTrenchCells(ov);
        return `· гекс <b>(${k})</b>: ` +
            ((ov.trenchPoints || 0) || placed ? `<button onclick="openHexEditorForBattle('${k}','trenches')" style="background:#8e44ad; font-size:0.85rem;">🕳️ ${ov.trenchPoints ? `Расставить окопы (${ov.trenchPoints})` : `Текстура/поворот окопов (${placed})`}</button> ` : '') +
            ((ov.prepPoints || 0) ? `<button onclick="openHexEditorForBattle('${k}','prep')" style="background:#16a085; font-size:0.85rem;">🪓 Подготовка позиций (${ov.prepPoints})</button>` : '');
    };
    const setPanel = (panel, html) => {
        if (!panel) return;
        if (!html) { if (panel.style.display !== 'none') { panel.style.display = 'none'; panel.innerHTML = ''; } return; }
        if (panel.innerHTML !== html) panel.innerHTML = html;
        if (panel.style.display !== 'block') panel.style.display = 'block';
    };
    // карта операции — все гексы с правками
    setPanel(document.getElementById('opHexEditsPanel'), rows.length === 0 ? '' :
        '<b style="color:#2ecc71;">🛠️ Карты гексов — доступны правки местности</b> ' +
        '<span style="color:#aaa; font-size:0.8rem;">(приказы «Окопаться» / «Подготовка позиций» выполнены; правки увидит и противник в бою на этом гексе)</span><br>' +
        rows.map(rowHtml).join('<br>'));
    // экран боя — только гекс ЭТОГО боя
    let battleHtml = '';
    if (typeof appData !== 'undefined' && appData.currentBattleId && !hexEditorState) {
        const b = (appData.campaign.activeBattles || []).find(x => x && x.id === appData.currentBattleId);
        if (b && b.hexKey && rows.includes(b.hexKey)) {
            battleHtml = `<b style="color:#2ecc71;">🛠️ На гексе этого боя (${b.hexKey}) доступны правки карты</b> ` +
                '<span style="color:#aaa; font-size:0.8rem;">(после «✅ Готово» вернётесь в этот бой; правки увидит и противник)</span><br>' + rowHtml(b.hexKey);
        }
    }
    setPanel(document.getElementById('battleHexEditsPanel'), battleHtml);
}

// ⚡ v13.051 (R36#3): кнопки редактора для гекса (если на нём есть доступные
//    правки) — вставляются в строку «Гекс: c,r» под оперативной картой при
//    клике по гексу. Нет правок — пустая строка.
function hexEditButtonsHtml(hexKey) {
    if (!hexKey) return '';
    const ov = getHexOverlay(hexKey, false) || {};
    const t = ov.trenchPoints || 0, p = ov.prepPoints || 0;
    const placedTrenches = countHexTrenchCells(ov);
    if (!t && !p && !placedTrenches) return '';
    let html = '<span style="color:#f1c40f;">🛠️ правки карты гекса — окопов к размещению: <b>' + t + '</b>, уже на карте: <b>' + placedTrenches + '</b>, подготовка позиций: <b>' + p + '</b></span> ';
    if (t || placedTrenches) html += `<button onclick="openHexEditorForBattle('${hexKey}','trenches')" style="background:#8e44ad; font-size:0.8rem;">${t ? '🕳️ Расставить/текстура окопов' : '🕳️ Текстура/поворот окопов'}</button> `;
    if (p) html += `<button onclick="openHexEditorForBattle('${hexKey}','prep')" style="background:#16a085; font-size:0.8rem;">🪓 Подготовка позиций</button>`;
    return html;
}

// Кнопка «открыть карту гекса» на оперативной карте для игрока
function showHexEditButton(hexKey, kind) {
    const mi = document.getElementById('mapInfo');
    if (!mi) return;
    const ov = getHexOverlay(hexKey, false) || {};
    const t = ov.trenchPoints || 0, p = ov.prepPoints || 0;
    mi.innerHTML = `🛠️ Гекс (${hexKey}): доступны правки карты — окопов: <b>${t}</b>, подготовка позиций: <b>${p}</b>. ` +
        `<button onclick="openHexEditorForBattle('${hexKey}','trenches')" ${t ? '' : 'disabled'} style="background:#8e44ad;">🕳️ Расставить окопы</button> ` +
        `<button onclick="openHexEditorForBattle('${hexKey}','prep')" ${p ? '' : 'disabled'} style="background:#16a085;">🪓 Подготовка позиций</button>`;
    mi.style.color = '#f1c40f';
}

// ─────────────────── РЕДАКТОР КАРТЫ ГЕКСА (окопы / подготовка) ───────────────────

function hexEditRuleFor(kind) {
    if (kind === 'initialFortification') {
        return {
            title: '🪖 Расстановка ДОТов',
            hint: 'Выберите ДОТ в списке и кликните по клетке — на карте появится ИКОНКА юнита этого ДОТа, и он будет стоять здесь в тактическом бою на этом гексе. Окопы на старте не расставляются: они уже нарисованы на картах. Кнопка «Готово» откроет следующую карту.',
            allowed: () => true,
            targetType: null,
            pointsField: null
        };
    }
    if (kind === 'trenches') {
        return {
            title: '🕳️ Расстановка окопов',
            hint: 'Клик по траве/дороге ставит окоп; повторные клики по нему листают текстуры. Выберите клетку и нажмите «Повернуть» для поворота на 60°. Новая клетка расходует одно очко приказа (по одному на отделение).' ,
            allowed: (baseType) => baseType === 'grass' || baseType === 'road',
            targetType: 'trenches',
            pointsField: 'trenchPoints'
        };
    }
    return {
        title: '🪓 Подготовка позиций',
        hint: 'Клик по гексу: «лес» → «поваленный лес» (обзор открыт), «кусты» → «трава». Деревья валят, кусты вырубают — глубина леса для стрельбы считается по оставшемуся лесу.',
        allowed: (baseType) => isForestHexType(baseType) || baseType === 'bushes',
        targetType: null,   // лес → поваленный лес, кусты → трава
        pointsField: 'prepPoints'
    };
}

function openHexEditorForBattle(hexKey, kind) {
    if (!hexKey) return;
    kind = kind || 'trenches';
    const ov = getHexOverlay(hexKey, true);
    const rule = hexEditRuleFor(kind);
    const budget = rule.pointsField ? (ov[rule.pointsField] || 0) : 0;
    const existingTrenchesCanBeEdited = kind === 'trenches' && countHexTrenchCells(ov) > 0;
    if (kind !== 'initialFortification' && budget <= 0 && !existingTrenchesCanBeEdited) {
        alert('Нет доступных правок. Отдайте приказ «' + (kind === 'trenches' ? 'Окопаться' : 'Подготовка позиций') + '» и дождитесь его выполнения (3 хода).');
        return;
    }
    if (hexEditorState) {
        alert('Уже открыт редактор карты гекса (' + hexEditorState.hexKey + '). Нажмите «✅ Готово», чтобы выйти.');
        return;
    }
    // ⚡ v13.053 (R38#3): открыли из идущего боя — сначала сохраняем его состояние
    //    в запись боя (по «Готово» вернёмся в бой через switchToBattle)
    const prevBattleId = appData.currentBattleId;
    if (prevBattleId && typeof saveCurrentBattleState === 'function') { try { saveCurrentBattleState(); } catch (e) {} }
    if (!appData.map || typeof appData.map !== 'object') {
        appData.map = { grid: {}, baseHexSize: 45, zoomLevel: 1, mode: 'view', enemySquads: [], selectedMoveSquadIdx: null, selectedEnemyMoveIdx: null, reachableHexes: [], isCrouchMode: false };
    }
    const proceed = (md) => {
        // снимок состояния кампании для возврата
        hexEditorState = {
            hexKey, kind, rule,
            tool: kind === 'initialFortification' ? 'dot' : null,
            dotId: kind === 'initialFortification' ? initialDotIdForHex(hexKey) : null,
            initialSetupIndex: kind === 'initialFortification' && appData.campaign.initialFortificationSetup
                ? appData.campaign.initialFortificationSetup.nextIndex || 0 : null,
            prevMap: JSON.parse(JSON.stringify(appData.map)),
            prevSize: (typeof TACTICAL_MAP_SIZE !== 'undefined') ? TACTICAL_MAP_SIZE : 20,
            prevBattleId: prevBattleId,
            prevEnemySquads: null,
            baseGrid: md ? JSON.parse(JSON.stringify(md.grid)) : {},
            undo: [],
            placed: 0
        };
        let baseGrid = hexEditorState.baseGrid;
        const size = Math.max(md ? Math.max(md.w || 0, md.h || 0) : 0, 15);
        const grid = {};
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const k = col + ',' + row;
                const src = baseGrid[k];
                grid[k] = src ? { ...src, squadIds: [], enemySquadIds: [], markers: [], rotation: 0, variant: 0, level: src.level || 0 }
                              : { type: 'grass', squadIds: [], enemySquadIds: [], markers: [], rotation: 0, variant: 0, level: 0 };
            }
        }
        applyHexOverlays(grid, hexKey);
        appData.map.grid = grid;
        appData.map.enemySquads = [];
        appData.map.baseHexSize = 45;
        appData.map.zoomLevel = 1;
        appData.map.mode = 'hexEdit';
        appData.map.selectedMoveSquadIdx = null;
        appData.map.selectedEnemyMoveIdx = null;
        appData.map.reachableHexes = [];
        if (typeof TACTICAL_MAP_SIZE !== 'undefined') TACTICAL_MAP_SIZE = size;
        appData.currentBattleId = null;   // это не бой — состояние боя не трогаем

        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('campaignApp').style.display = 'none';
        document.getElementById('campaignMapScreen').style.display = 'none';
        document.getElementById('battleApp').style.display = 'block';
        try { showHexEditorMapTab(); } catch (e) {}
        const btnBack = document.getElementById('btnReturnToCampaign');
        if (btnBack) btnBack.style.display = 'none';
        const btnFinish = document.getElementById('btnFinishBattle');
        if (btnFinish) btnFinish.style.display = 'none';
        const btnRetreat = document.getElementById('btnRetreatBattle');
        if (btnRetreat) btnRetreat.style.display = 'none';
        showHexEditorBanner();
        try { initMap(); } catch (e) {}
        try { redrawMap(); } catch (e) {}
    };
    if (TACTICAL_HEX_MAPS[hexKey]) {
        proceed(TACTICAL_HEX_MAPS[hexKey]);
    } else {
        ensureTacticalHexMap(hexKey).then(md => {
            if (!md && kind === 'initialFortification') {
                const grid = {};
                for (let row = 0; row < 20; row++) for (let col = 0; col < 20; col++) {
                    grid[col + ',' + row] = { type: 'grass', squadIds: [], enemySquadIds: [], markers: [], rotation: 0, variant: 0, level: 0 };
                }
                proceed({ grid, w: 20, h: 20 });
                return;
            }
            if (!md) {
                alert('Карта для гекса (' + hexKey + ') не найдена в папке «' + HEX_MAP_DIR + '». Файл должен называться, например, «' +
                      hexKey.replace(',', '.') + ' ...json».');
                return;
            }
            proceed(md);
        });
    }
}

function showHexEditorMapTab() {
    document.querySelectorAll('.tabcontent').forEach(e => { e.style.display = 'none'; });
    document.querySelectorAll('.tablinks').forEach(e => { e.classList.remove('active'); });
    const mapTab = document.getElementById('mapTab');
    if (mapTab) mapTab.style.display = 'block';
    const btn = document.querySelector('.tablinks[onclick*="mapTab"]');
    if (btn && btn.classList) btn.classList.add('active');
    // ⚡ v13.066: миникарта кампании — видно, какой оперативный гекс открыт
    try { if (typeof renderCampaignMiniMap === 'function') renderCampaignMiniMap(); } catch (e) {}
}

// ⚡ v13.057: пункт меню «Карты гексов» всегда пишет результат в отдельный,
// постоянно видимый статус; сообщение не зависит от наличия #mapInfo.
function showHexEditorsMenu() {
    const all = getHexOverlays();
    const rows = Object.keys(all).filter(k => all[k] && ((all[k].trenchPoints || 0) > 0 || (all[k].prepPoints || 0) > 0));
    const status = document.getElementById('opHexMenuStatus');
    const mi = document.getElementById('mapInfo');
    const safeKey = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    if (rows.length === 0) {
        renderHexEditsPanel();
        const sel = (typeof appData !== 'undefined' && appData.campaign) ? appData.campaign.selectedOpUnit : null;
        const selTxt = (sel && sel.col !== null && sel.col !== undefined) ? ` Выбран юнит «${sel.name}» на гексе (${sel.col},${sel.row}) — правок для этого гекса пока нет.` : '';
        const message = '🛠️ Нет доступных правок карт гексов. Отдайте приказ «🕳️ Окопаться» или «🪓 Подготовка позиций» (🎯 Отдать приказ) — через 3 хода после выполнения здесь и в строке «Гекс: …» под картой появятся кнопки «Расставить окопы» / «Подготовка позиций».' + selTxt;
        if (status) { status.innerHTML = message; status.style.display = 'block'; }
        if (mi) { mi.innerHTML = message; mi.style.color = '#f1c40f'; }
        return false;
    }

    renderHexEditsPanel();
    const summary = '🛠️ Найдены правки на гексах: ' + rows.map(k => {
        const ov = all[k];
        return `<b>(${safeKey(k)})</b> — окопы: ${ov.trenchPoints || 0}, подготовка: ${ov.prepPoints || 0}`;
    }).join('; ') + '. Кнопки открытия карты расположены ниже оперативной карты.';
    if (status) { status.innerHTML = summary; status.style.display = 'block'; }
    if (mi) {
        mi.innerHTML = '🛠️ Гексы с доступными правками карты:<br>' + rows.map(k => {
            const ov = all[k];
            const key = safeKey(k);
            return `· гекс (${key}): окопов ${ov.trenchPoints || 0}, подготовка позиций ${ov.prepPoints || 0} — ` +
                `<button onclick="openHexEditorForBattle('${key}','trenches')" ${(ov.trenchPoints || 0) ? '' : 'disabled'} style="background:#8e44ad;">🕳️ окопы</button> ` +
                `<button onclick="openHexEditorForBattle('${key}','prep')" ${(ov.prepPoints || 0) ? '' : 'disabled'} style="background:#16a085;">🪓 подготовка</button>`;
        }).join('<br>');
        mi.style.color = '#f1c40f';
    }
    return true;
}

function showHexEditorBanner() {    let banner = document.getElementById('hexEditorBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'hexEditorBanner';
        const mapTab = document.getElementById('mapTab');
        if (mapTab) mapTab.insertBefore(banner, mapTab.firstChild);
        else document.getElementById('battleApp').insertBefore(banner, document.getElementById('battleApp').firstChild);
    }
    const st = hexEditorState;
    if (!st) { banner.style.display = 'none'; return; }
    // ⚡ v13.066: миникарта кампании — какой оперативный гекс открыт сейчас
    try { if (typeof renderCampaignMiniMap === 'function') renderCampaignMiniMap(); } catch (e) {}
    banner.style.cssText = 'display:block; background:#12241a; border:2px solid #27ae60; border-radius:8px; padding:10px; margin-bottom:8px;';
    if (st.kind === 'initialFortification') {
        const ov = getHexOverlay(st.hexKey, true);
        const fort = ov.initialFortifications;
        const total = Math.max(1, initialFortificationHexCount());
        const setup = appData.campaign.initialFortificationSetup || {};
        const index = Number.isInteger(st.initialSetupIndex) ? st.initialSetupIndex : (setup.nextIndex || 0);
        const active = tool => st.tool === tool ? 'background:#27ae60;' : 'background:#555;';
        const here = Object.keys(dotFixedSquadsForHex(st.hexKey)).length;
        banner.innerHTML = `<b style="color:#2ecc71;">🪖 Расстановка ДОТов — оперативный гекс (${st.hexKey}), карта ${index + 1}/${total}</b><br>` +
          `<span style="color:#ccc; font-size:.85rem;">${st.rule.hint}</span><br>` +
          `<span style="color:#f1c40f;">ДОТов на этой карте: <b>${here}</b> · всего ДОТов: <b>${initialDotCandidates().length}</b> · Инструмент: <b>${st.tool === 'erase' ? 'ластик' : 'ДОТ'}</b></span> ` +
          initialDotSelector(st) +
          `<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">` +
            `<button onclick="setInitialFortificationTool('dot')" style="${active('dot')}">🏰 Поставить ДОТ</button>` +
            `<button onclick="setInitialFortificationTool('erase')" style="${active('erase')}">🧹 Стереть</button>` +
            `<button onclick="closeHexEditor()" style="background:#27ae60;">✅ Готово — ${index + 1 < total ? 'следующий гекс' : 'завершить'}</button>` +
          `</div><div style="color:#888; font-size:.8rem; margin-top:4px;">Окопы не расставляются: они уже нарисованы на картах по стандарту. ДОТ сохраняется как юнит и в бою на этом гексе встанет на указанную клетку.</div>`;
        return;
    }
    const ov = getHexOverlay(st.hexKey, true);
    const left = ov[st.rule.pointsField] || 0;
    banner.innerHTML = `
      <b style="color:#2ecc71;">${st.rule.title} — гекс (${st.hexKey})</b><br>
      <span style="color:#ccc; font-size:0.85rem;">${st.rule.hint}</span><br>
      <span style="color:#f1c40f; font-size:0.9rem;">Осталось правок: <b>${left}</b> (поставлено в этой сессии: ${st.placed})</span>
      <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
        <button onclick="hexEditUndo()" style="background:#8e44ad;">↩️ Отменить последнюю</button>
        <button onclick="rotateSelectedHex()" style="background:#8e44ad;">↻ Повернуть выбранную клетку (60°)</button>
        <button onclick="closeHexEditor()" style="background:#27ae60;">✅ Готово — ${st.prevBattleId ? 'вернуться в бой' : 'на карту операции'}</button>
      </div>
      <div style="color:#888; font-size:0.8rem; margin-top:4px;">Это карта поля боя гекса (${st.hexKey}) оперативной карты. Правки сохраняются сразу и видны противнику в бою на этом гексе.</div>`;
}

function setInitialFortificationTool(tool) {
    if (!hexEditorState || hexEditorState.kind !== 'initialFortification') return;
    // ⚡ v13.066: окопы на старте не расставляются — только ДОТ и ластик
    if (!['dot', 'erase'].includes(tool)) return;
    hexEditorState.tool = tool;
    showHexEditorBanner();
}

function initialFortificationEditClick(st, hexKeyCell, baseCell, working) {
    const ov = getHexOverlay(st.hexKey, true);
    const fort = ov.initialFortifications;
    // Старые сейвы могли содержать окопы начальной расстановки: их по-прежнему
    // можно стереть ластиком, но поставить новые — нельзя.
    const legacyTrenchIndex = fort.trenchCells.indexOf(hexKeyCell);
    const dotIndex = fort.dotCells.indexOf(hexKeyCell);
    const infoBox = document.getElementById('mapInfo');
    let message = '';
    if (st.tool === 'dot') {
        message = bindInitialDot(st, hexKeyCell);
    } else {
        let changed = false;
        if (legacyTrenchIndex >= 0) { fort.trenchCells.splice(legacyTrenchIndex, 1); changed = true; }
        if (dotIndex >= 0) {
            initialDotCandidates().forEach(x => { const p = x.squad.fixedTacticalPosition; if (p && p.hexKey === st.hexKey && p.key === hexKeyCell) delete x.squad.fixedTacticalPosition; });
            fort.dotCells.splice(dotIndex, 1); changed = true;
        }
        if (changed && !ov.hexEdits[hexKeyCell]) {
            delete ov.hexVariants[hexKeyCell];
            delete ov.hexRotations[hexKeyCell];
        }
        message = changed ? `🧹 Укрепление убрано с клетки ${hexKeyCell}.` : `На клетке ${hexKeyCell} нет укрепления этой расстановки.`;
    }
    applyHexOverlays(appData.map.grid, st.hexKey);
    saveHexOverlays(st.hexKey);
    if (infoBox) { infoBox.innerHTML = message; infoBox.style.color = message.startsWith('⛔') ? '#e74c3c' : '#27ae60'; }
    showHexEditorBanner();
    try { redrawMap(); } catch (e) {}
    return true;
}

// Клик по гексу в режиме 'hexEdit'
function hexEditClick(hexKeyCell) {
    const st = hexEditorState;
    if (!st) return false;
    const ov = getHexOverlay(st.hexKey, true);
    const left = ov[st.rule.pointsField] || 0;
    const infoBox = document.getElementById('mapInfo');
    const baseCell = st.baseGrid[hexKeyCell];
    const baseType = baseCell ? baseCell.type : 'grass';
    const working = appData.map.grid[hexKeyCell];
    if (!working) {
        if (infoBox) { infoBox.innerHTML = '⚠️ Гекс ' + hexKeyCell + ' вне карты этого гекса.'; infoBox.style.color = '#e67e22'; }
        return true;
    }
    appData.map.lastEditedHex = hexKeyCell;
    if (st.kind === 'initialFortification') return initialFortificationEditClick(st, hexKeyCell, baseCell, working);

    // Окоп уже поставлен: повторный клик листает его текстуры, не расходуя правку.
    if (ov.hexEdits[hexKeyCell]) {
        if (st.kind === 'trenches' && ov.hexEdits[hexKeyCell] === 'trenches') {
            const trenchData = (typeof TERRAIN_DATA !== 'undefined') ? TERRAIN_DATA.trenches : null;
            const nVar = (trenchData && trenchData.images && trenchData.images.length) ? trenchData.images.length : 1;
            const currentVariant = (ov.hexVariants && Number.isFinite(ov.hexVariants[hexKeyCell]))
                ? ov.hexVariants[hexKeyCell] : (Number.isFinite(working.variant) ? working.variant : 0);
            const variant = (currentVariant + 1) % nVar;
            ov.hexVariants[hexKeyCell] = variant;
            working.variant = variant;
            if (baseCell && Number.isFinite(baseCell.level)) working.level = baseCell.level;
            saveHexOverlays(st.hexKey);
            if (infoBox) { infoBox.innerHTML = `🕳️ Гекс ${hexKeyCell}: текстура окопа ${variant + 1}/${nVar}. Правки не потрачены.`; infoBox.style.color = '#27ae60'; }
            showHexEditorBanner();
            try { redrawMap(); } catch (e) {}
            return true;
        }
        if (infoBox) { infoBox.innerHTML = `⚠️ Гекс ${hexKeyCell} уже правили (${ov.hexEdits[hexKeyCell]}). Выберите другой.`; infoBox.style.color = '#e67e22'; }
        return true;
    }
    if (left <= 0) {
        if (infoBox) { infoBox.innerHTML = '✅ Правки закончились — нажмите «Готово», чтобы вернуться в кампанию.'; infoBox.style.color = '#f1c40f'; }
        return true;
    }
    if (!st.rule.allowed(baseType)) {
        const bad = { forest: 'лес', shelled_forest: 'обстрелянный лес', swamp_passable: 'болото', swamp_impassable: 'болото',
                      rocks: 'камни', hill: 'склон холма', water: 'вода', trenches: 'окопы', craters: 'воронки', fallen_forest: 'поваленный лес' };
        if (infoBox) {
            infoBox.innerHTML = `❌ Гекс ${hexKeyCell} (${bad[baseType] || baseType}) менять нельзя.` +
                (st.kind === 'trenches' ? ' Окоп можно ставить только на «траву» и «дорогу».' : ' Можно менять только «лес» и «кусты».');
            infoBox.style.color = '#e74c3c';
        }
        return true;
    }
    const newType = (st.kind === 'trenches') ? 'trenches'
        : (isForestHexType(baseType) ? 'fallen_forest' : 'grass');
    ov.hexEdits[hexKeyCell] = newType;
    const tData = (typeof TERRAIN_DATA !== 'undefined') ? TERRAIN_DATA[newType] : null;
    const nVar = (tData && tData.images && tData.images.length) ? tData.images.length : 1;
    // Для окопа начинаем с первой текстуры: дальнейшие клики идут циклом, как в редакторе.
    const variant = st.kind === 'trenches' ? 0 : ((nVar > 1) ? Math.floor(Math.random() * nVar) : 0);
    ov.hexVariants[hexKeyCell] = variant;
    ov[st.rule.pointsField] = left - 1;
    st.undo.push(hexKeyCell);
    st.placed++;
    working.type = newType;
    working.variant = variant;
    if (baseCell && Number.isFinite(baseCell.level)) working.level = baseCell.level;
    working.ov = 1;
    saveHexOverlays(st.hexKey);
    if (infoBox) {
        infoBox.innerHTML = `✅ Гекс ${hexKeyCell}: ${baseType} → ${newType}. Осталось правок: ${ov[st.rule.pointsField]}.`;
        infoBox.style.color = '#27ae60';
    }
    showHexEditorBanner();
    try { redrawMap(); } catch (e) {}
    return true;
}

function hexEditUndo() {
    const st = hexEditorState;
    if (!st || !st.undo || st.undo.length === 0) return;
    const k = st.undo.pop();
    const ov = getHexOverlay(st.hexKey, true);
    if (k in ov.hexEdits) {
        delete ov.hexEdits[k];
        if (ov.hexVariants) delete ov.hexVariants[k];
        if (ov.hexRotations) delete ov.hexRotations[k];
        ov[st.rule.pointsField] = (ov[st.rule.pointsField] || 0) + 1;
        st.placed = Math.max(0, st.placed - 1);
        // восстанавливаем исходный тип на рабочей сетке
        const baseCell = st.baseGrid[k];
        if (appData.map.grid[k]) {
            appData.map.grid[k].type = baseCell ? baseCell.type : 'grass';
            appData.map.grid[k].variant = (baseCell && Number.isFinite(baseCell.variant)) ? baseCell.variant : 0;
            appData.map.grid[k].level = (baseCell && Number.isFinite(baseCell.level)) ? baseCell.level : 0;
            delete appData.map.grid[k].ov;
        }
        saveHexOverlays(st.hexKey);
    }
    showHexEditorBanner();
    try { redrawMap(); } catch (e) {}
}

function closeHexEditor() {
    const st = hexEditorState;
    hexEditorState = null;
    const banner = document.getElementById('hexEditorBanner');
    if (banner) banner.style.display = 'none';
    if (st) {
        if (typeof TACTICAL_MAP_SIZE !== 'undefined') { try { TACTICAL_MAP_SIZE = st.prevSize; } catch (e) {} }
        appData.currentBattleId = null;
        appData.map = st.prevMap;
        if (appData.map && appData.map.mode === 'hexEdit') appData.map.mode = 'view';
    }
    // ⚡ v13.053 (R38#3): открывали из боя — возвращаемся в ТОТ ЖЕ бой (состояние
    //    берём из записи боя: туда уже наложены правки и пришедшие изменения)
    const backBattle = st && st.prevBattleId && (appData.campaign.activeBattles || []).find(b => b && b.id === st.prevBattleId);
    if (backBattle && typeof switchToBattle === 'function') {
        try { switchToBattle(backBattle.id); } catch (e) { console.warn('closeHexEditor/switchToBattle:', e.message); }
    } else {
        try {
            document.getElementById('battleApp').style.display = 'none';
            document.getElementById('campaignApp').style.display = 'block';
            showOperationalMap();
        } catch (e) {}
    }
    if (st && st.kind === 'initialFortification') {
        const setup = appData.campaign.initialFortificationSetup || {};
        const total = Math.max(1, initialFortificationHexCount());
        setup.nextIndex = Math.max(setup.nextIndex || 0, (st.initialSetupIndex || 0) + 1);
        appData.campaign.initialFortificationSetup = setup;
        const doneAll = initialFortificationComplete();
        if (!doneAll && setup.nextIndex < total) {
            setup.phase = 'edit';
            setup.complete = false;
            renderInitialFortificationStatus();
            saveData();
            const nextKey = setup.hexKeys[setup.nextIndex];
            if (nextKey) setTimeout(() => openHexEditorForBattle(nextKey, 'initialFortification'), 0);
            return;
        }
        if (!doneAll) {
            // ⚡ v13.066: не все ДОТы закреплены — возвращаем выбор гексов
            setup.phase = 'select';
            setup.complete = false;
            setup.nextIndex = 0;
            setup.hexKeys = [];
            appData.campaign.initialFortificationHexes = [];
            renderInitialFortificationStatus();
            const miIncomplete = document.getElementById('mapInfo');
            if (miIncomplete) {
                const left = initialDotCandidates().filter(x => !(x.squad && x.squad.fixedTacticalPosition)).map(x => x.squad.name || x.unit.name);
                miIncomplete.innerHTML = `⚠️ Не закреплены ДОТы: ${left.join(', ')}. Нажмите «🪖 Расставить ДОТы», выберите гекс и укажите клетку на карте.`;
                miIncomplete.style.color = '#e67e22';
            }
            saveData();
            if (typeof setOpMapMode === 'function') { try { setOpMapMode('selectInitialFortificationHexes'); } catch (e) {} }
            return;
        }
        setup.nextIndex = total;
        setup.phase = 'complete';
        setup.complete = true;
        appData.campaign.initialFortificationHexes = setup.hexKeys.slice(0, total);
        renderInitialFortificationStatus();
        const done = document.getElementById('mapInfo');
        if (done) { done.innerHTML = `✅ ДОТы расставлены на гексах: ${setup.hexKeys.map(k => `(${k})`).join(', ')}. В бою на этих гексах ДОТы встанут на указанные клетки.`; done.style.color = '#27ae60'; }
        saveData();
        try { renderHexEditsPanel(); } catch (e) {}
        return;
    }
    const ov = st ? getHexOverlay(st.hexKey, false) : null;
    const mi = document.getElementById('mapInfo');
    if (mi && ov) {
        mi.innerHTML = `🛠️ Правки карты гекса (${st.hexKey}) сохранены. Окопов осталось: ${ov.trenchPoints || 0}, подготовки позиций: ${ov.prepPoints || 0}.`;
        mi.style.color = '#27ae60';
    }
    try { renderHexEditsPanel(); } catch (e) {}
    try { saveData(); } catch (e) {}
    // оставшиеся правки по другим гексам — напомним
    try { if (!backBattle) promptPendingHexEdits(); } catch (e) {}
}

// ─────────────────── ПРИКАЗ «ПОДГОТОВКА ПОЗИЦИЙ» (R34#3) ───────────────────

// Сколько отрядов взвода выполняет работу на гексе (по 1 правке на отряд)
function countSquadsForHexEdit(unit) {
    if (!unit) return 1;
    const alive = (unit.squads || []).filter(s => s && s.fighters && s.fighters.some(f => f.hp > 0));
    if (alive.length > 0) return alive.length;
    return 1;
}

// Приказ выполняется 3 хода (как окапывание). По завершении игрок получает
// по 1 правке на каждый отряд взвода: «лес» → «поваленный лес» (обзор открыт),
// «кусты» → «трава» — на карте гекса, где выполнялся приказ.
function executePrepPositionsOrder(unit, order) {
    if (unit.isInBattle) {
        order.status = 'cancelled';
        log(`❌ ${unit.name} вступил в тактический бой! Подготовка позиций прервана.`);
        return;
    }
    if (unit.isDestroyed) {
        order.status = 'cancelled';
        log(`❌ ${unit.name} уничтожен!`);
        return;
    }

    // ЕСЛИ ЕСТЬ ЦЕЛЕВОЙ ГЕКС И ЮНИТ НЕ ТАМ — ДВИГАЕМСЯ ПОШАГОВО
    if (order.targetHex) {
        const [targetCol, targetRow] = order.targetHex.split(',').map(Number);
        if (unit.col !== targetCol || unit.row !== targetRow) {
            const result = stepUnitTowardTarget(unit, targetCol, targetRow);
            if (result === 'no_route') {
                order.status = 'cancelled';
                log(`❌ ${unit.name} не может достичь гекса (${targetCol},${targetRow}) для подготовки позиций. Приказ отменён.`);
                saveData();
                redrawOperationalMap();
                return;
            }
            if (result === 'battle') {
                log(`⚔️ ${unit.name} вступил в бой на пути к позициям. Продолжение в следующем ходу.`);
                saveData();
                redrawOperationalMap();
                return;
            }
            if (result !== 'reached') {
                log(`⏳ ${unit.name} выдвигается на гекс (${targetCol},${targetRow}) для подготовки позиций. Осталось ОД: ${unit.ap}.`);
                saveData();
                redrawOperationalMap();
                return;
            }
            log(`🚶 ${unit.name} выдвинулся на гекс (${unit.col},${unit.row}) для подготовки позиций.`);
        }
    }
    if (order.originalHex && order.originalHex !== `${unit.col},${unit.row}`) {
        order.status = 'cancelled';
        log(`❌ ${unit.name} покинул гекс подготовки позиций. Приказ отменён.`);
        saveData();
        redrawOperationalMap();
        return;
    }
    if (unit.ap <= 0) {
        log(`⏳ ${unit.name} не хватает ОД для подготовки позиций. Ожидание следующего хода.`);
        return;
    }

    if (!order.digProgress) order.digProgress = 0;
    unit.ap = 0;
    order.digProgress++;
    log(`🪓 ${unit.name} готовит позиции (валят лес, вырубают кусты)... Прогресс: ${order.digProgress}/3`);

    if (order.digProgress >= 3) {
        const hexKey = `${unit.col},${unit.row}`;
        try {
            if (appData.campaign.opMapGrid) {
                if (!appData.campaign.opMapGrid[hexKey]) {
                    appData.campaign.opMapGrid[hexKey] = { types: ['grass'], markers: [] };
                }
                const hx = appData.campaign.opMapGrid[hexKey];
                if (Array.isArray(hx)) appData.campaign.opMapGrid[hexKey] = { types: hx, markers: [] };
                if (!appData.campaign.opMapGrid[hexKey].markers) appData.campaign.opMapGrid[hexKey].markers = [];
                if (!appData.campaign.opMapGrid[hexKey].markers.includes('prep_positions')) {
                    appData.campaign.opMapGrid[hexKey].markers.push('prep_positions');
                }
            }
        } catch (e) {}
        order.status = 'completed';
        log(`✅ ${unit.name} завершил подготовку позиций на гексе (${unit.col},${unit.row})!`);
        const enemySide = isEnemyOperationalUnit(unit);
        grantPrepPoints(hexKey, countSquadsForHexEdit(unit), unit.name, enemySide);
        saveData();
        redrawOperationalMap();
        try { renderActiveOrders(); } catch (e) {}
        return;
    }

    if (!order.originalHex) order.originalHex = `${unit.col},${unit.row}`;
    saveData();
    redrawOperationalMap();
}

// ─────────────────── ЦЕЛЬ НА ТАКТИЧЕСКОЙ КАРТЕ (R34#3) ───────────────────
// В модалке стрельбы можно выбрать конкретный вражеский отряд на карте:
// дистанция и укрытие подставляются автоматически; стрельба из стрелкового
// оружия по цели в лесу глубже 2 гексов запрещена (ПТО и орудия — могут).

function fillModalTargets(attackType) {
    const row = document.getElementById('modalTargetRow');
    const sel = document.getElementById('modalTargetSelect');
    if (!row || !sel) return;
    if (!currentSquad || !appData.map || !appData.map.grid) { row.style.display = 'none'; return; }
    const shooterIdx = currentSquadIndex;
    const shooterPos = getBattleSquadHex(appData.map.grid, shooterIdx, false);
    const enemies = appData.map.enemySquads || [];
    if (!shooterPos || enemies.length === 0) { row.style.display = 'none'; return; }
    let html = '<option value="-1">— не выбрана (ввести вручную) —</option>';
    enemies.forEach((e, idx) => {
        if (!e || e.hidden || e.isDestroyed || !(e.fighters || []).some(f => f && f.hp > 0)) return;
        const pos = getBattleSquadHex(appData.map.grid, idx, true);
        if (!pos) return;
        const d = hexGridDistance(shooterPos.col, shooterPos.row, pos.col, pos.row);
        const cov = getTacticalCoverInfoForEnemy(appData.map.grid, idx);
        html += `<option value="${idx}" data-dist="${d}" data-cover="${cov ? cov.mod : 0}">${e.name} — ${d} гекс(ов)` +
                `${cov && cov.mod ? ', укрытие ' + cov.label + ' +' + cov.mod : ''}</option>`;
    });
    sel.innerHTML = html;
    sel.value = '-1';
    row.style.display = (enemies.some((e, idx) => e && !e.hidden && !e.isDestroyed &&
        (e.fighters || []).some(f => f && f.hp > 0) && getBattleSquadHex(appData.map.grid, idx, true))) ? 'block' : 'none';
    const info = document.getElementById('modalTargetInfo');
    if (info) info.innerHTML = '';
    // правила для стрелкового оружия
    if (row.style.display === 'block' && (attackType === 'smallArms' || attackType === 'sniper' || attackType === 'suppressiveFire')) {
        if (!info) return;
        info.innerHTML = '🎯 Стрельба в лес глубже 2 гексов из стрелкового оружия запрещена. ПТО/орудия — могут.';
    }
}

function onModalTargetChange() {
    const sel = document.getElementById('modalTargetSelect');
    const info = document.getElementById('modalTargetInfo');
    if (!sel || !info) return;
    const idx = parseInt(sel.value, 10);
    if (isNaN(idx) || idx < 0) {
        info.innerHTML = '🎯 Цель не выбрана — введите дистанцию и укрытие вручную.';
        return;
    }
    const opt = sel.options[sel.selectedIndex] || {};
    const d = parseInt(opt.getAttribute ? opt.getAttribute('data-dist') : 0, 10) || 0;
    const mod = parseInt(opt.getAttribute ? opt.getAttribute('data-cover') : 0, 10) || 0;
    if (d > 0) document.getElementById('modalDistance').value = d;
    document.getElementById('modalCover').value = Math.min(10, 6 + mod);
    const cov = getTacticalCoverInfoForEnemy(appData.map.grid, idx);
    let msg = `🎯 Цель: ${(appData.map.enemySquads[idx] || {}).name} — ${d} гекс(ов)`;
    if (cov && cov.mod) msg += `, укрытие «${cov.label}» (+${cov.mod} к сложности)`;
    // правило леса — только для стрелкового оружия
    const smallArms = ['smallArms', 'sniper', 'suppressiveFire', 'molotovCrew', 'atGrenade'];
    if (smallArms.indexOf(pendingAttack) >= 0) {
        const blocked = smallArmsBlockedByForest(appData.map.grid, currentSquadIndex, idx);
        if (blocked) {
            msg += `<br>⛔ Стрельба запрещена: цель в лесу глубиной ${blocked.depth} гекса (больше 2). ` +
                   'Вырубите лес (приказ «Подготовка позиций») или бейте из ПТО/орудий.';
            info.style.color = '#e74c3c';
            info.innerHTML = msg;
            return;
        }
    }
    info.style.color = '#27ae60';
    info.innerHTML = msg;
}

// Проверка перед выстрелом из стрелкового оружия (цель выбрана в модалке)
function checkSmallArmsForestBlock() {
    try {
        if (!appData.map || !appData.map.grid) return null;
        // ⚡ v13.054 (R39#4): цель, выбранная на карте/в модалке (attackTargetEnemyIdx) — приоритет
        const ti = appData.map.attackTargetEnemyIdx;
        if (ti !== null && ti !== undefined && ti >= 0) {
            return smallArmsBlockedByForest(appData.map.grid, currentSquadIndex, ti);
        }
        const sel = document.getElementById('modalTargetSelect');
        if (!sel || parseInt(sel.value, 10) < 0) return null;
        return smallArmsBlockedByForest(appData.map.grid, currentSquadIndex, parseInt(sel.value, 10));
    } catch (e) { return null; }
}

function reportForestBlock(blocked) {
    if (!blocked) return;
    const msg = `⛔ Стрельба по цели в лесу глубже 2 гексов (глубина ${blocked.depth}) из стрелкового оружия запрещена. ` +
                'Нужна «Подготовка позиций» (вырубить лес) или огонь из ПТО/орудий.';
    log(msg);
    try {
        const info = document.getElementById('modalTargetInfo');
        if (info) { info.innerHTML = msg; info.style.color = '#e74c3c'; }
        const mi = document.getElementById('mapInfo');
        if (mi) { mi.innerHTML = msg; mi.style.color = '#e74c3c'; }
    } catch (e) {}
}

// v13.062: start fortifications bind real DOT squads, not unlimited decorative markers.
function initialDotCandidates() {
    const out = [];
    (appData.campaign.opUnits || []).forEach((u, ui) => {
        (u.squads || []).forEach((s, si) => {
            if (!u.isDestroyed && !s.isDestroyed && /ДОТ/i.test(s.name || u.name || '')) out.push({ unit: u, squad: s, id: `${ui}:${si}` });
        });
    });
    return out;
}
// Какой ДОТ предлагать для этой карты: уже стоящий здесь, иначе первый свободный
function initialDotIdForHex(hexKey) {
    const candidates = initialDotCandidates();
    if (!candidates.length) return null;
    const here = candidates.find(x => {
        const p = x.squad && x.squad.fixedTacticalPosition;
        return p && String(p.hexKey) === String(hexKey);
    });
    if (here) return here.id;
    const free = candidates.find(x => !(x.squad && x.squad.fixedTacticalPosition));
    return (free || candidates[0]).id;
}
function initialDotSelector(st) {
    const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const candidates = initialDotCandidates();
    if (!candidates.length) return '<span>В батальоне нет доступных ДОТов.</span>';
    if (!candidates.some(x => x.id === st.dotId)) st.dotId = initialDotIdForHex(st.hexKey) || candidates[0].id;
    return '<label>ДОТ: <select onchange="hexEditorState.dotId=this.value">' + candidates.map(x => {
        const p = x.squad && x.squad.fixedTacticalPosition;
        const where = (p && String(p.hexKey) !== String(st.hexKey)) ? ` — уже на гексе (${p.hexKey})` : '';
        return `<option value="${x.id}" ${x.id === st.dotId ? 'selected' : ''}>${escape(x.squad.name || x.unit.name)}${where}</option>`;
    }).join('') + '</select></label>';
}
function bindInitialDot(st, key) {
    const candidate = initialDotCandidates().find(x => x.id === st.dotId);
    if (!candidate) return '⛔ Выберите реальный отряд с ДОТом.';
    const [col, row] = st.hexKey.split(',').map(Number);
    const camp = appData.campaign;
    if (typeof isHexInPlacementZone === 'function' && !isHexInPlacementZone(camp.scenario, camp.playerFaction, col, row).ok) return '⛔ ДОТ можно поставить только в своей стартовой зоне.';
    const { unit, squad } = candidate;
    const old = squad.fixedTacticalPosition;
    if (old) {
        const oldFort = getInitialFortificationData(old.hexKey, true);
        oldFort.dotCells = oldFort.dotCells.filter(k => k !== old.key);
        saveHexOverlays(old.hexKey);
    }
    // ⚡ v13.066: ДОТы одного юнита (например «ДОТ Bosh» и «ДОТ Van Hees»)
    //    МОГУТ стоять на разных оперативных гексах — игрок выбирает по гексу
    //    на каждый ДОТ. На оперативной карте юнит остаётся на первом гексе,
    //    а в бой на втором гексе он попадает по позиции своего ДОТа.
    squad.fixedTacticalPosition = { hexKey: st.hexKey, key };
    // ⚡ v13.066: иконка ДОТа — от самого юнита, чтобы на тактической карте
    //    (и в бою) рисовалась иконка конкретного ДОТа, а не общая метка.
    if (!squad.icon) squad.icon = unit.icon || 'images/BeVe/ДОТ Bosh.png';
    const otherHex = (unit.squads || []).some(s => s !== squad && s.fixedTacticalPosition &&
        String(s.fixedTacticalPosition.hexKey) !== String(st.hexKey));
    if (!otherHex) { unit.col = col; unit.row = row; }
    const fort = getInitialFortificationData(st.hexKey, true);
    if (!fort.dotCells.includes(key)) fort.dotCells.push(key);
    return `✅ ${squad.name}: постоянная позиция ${key} на гексе (${st.hexKey}) — в бою здесь будет стоять юнит ДОТа.`;
}
function applyFixedDotPositions(battle) {
    if (!battle || !battle.tacticalMap) return;
    const grid = battle.tacticalMap.grid;
    [[battle.playerSquads || [], 'squadIds'], [battle.tacticalMap.enemySquads || [], 'enemySquadIds']].forEach(([squads, field]) => {
        squads.forEach((s, idx) => {
            const pos = s.fixedTacticalPosition;
            if (!pos || String(pos.hexKey) !== String(battle.hexKey) || !grid[pos.key] || s.isDestroyed || s.isRetreated) return;
            // ⚡ v13.066: иконка юнита — от карты гекса может отличаться от шаблона
            if (!Array.isArray(grid[pos.key][field])) grid[pos.key][field] = [];
            Object.values(grid).forEach(cell => { cell[field] = (cell[field] || []).filter(i => i !== idx); });
            grid[pos.key][field].push(idx);
            s.hexPos = pos.key.split(',').map(Number);
        });
    });
}

// ═══════════════ ⚡ v13.066: ПУНКТ БОЕПИТАНИЯ У ШТАБА ВЗВОДА ═══════════════
// У каждого взвода — свой пункт боепитания: на тактической карте он отмечается
// меткой «📦» в том гексе, где стоит штаб взвода («Штаб взвода …»).
// Метки пересчитываются при старте боя, размещении и перемещении отрядов,
// поэтому пункт боепитания всегда стоит в гексе штаба своего взвода.
const SUPPLY_POINT_MARKER = 'ammoPoint';

function isPlatoonHQBattleSquad(squad) {
    if (!squad) return false;
    const name = String(squad.name || '');
    if (!/Штаб взвода/i.test(name)) return false;
    if (/батальона|роты/i.test(name)) return false;   // это не взводный штаб
    // ⚡ v13.068: штаб взвода снабжения — это склад снабжения, а не пункт боепитания
    if (/снабж/i.test(name)) return false;
    return true;
}
function supplyPointStateKey(side) {
    return side === 'enemy' ? 'autoSupplyKeysEnemy' : 'autoSupplyKeysPlayer';
}
// Пересчёт меток пунктов боепитания на карте: mapLike — appData.map или
// battle.tacticalMap; squads — отряды стороны; field — 'squadIds' | 'enemySquadIds'.
// Автоматически поставленные метки запоминаются в mapLike[autoSupplyKeys*],
// чтобы не тронуть метки, выставленные игроком вручную.
function syncSupplyPointsOnGrid(mapLike, squads, field, side) {
    if (!mapLike || !mapLike.grid || !Array.isArray(squads)) return [];
    const pos = {};
    Object.keys(mapLike.grid).forEach(k => {
        const cell = mapLike.grid[k];
        if (!cell || !Array.isArray(cell[field])) return;
        cell[field].forEach(i => { pos[i] = k; });
    });
    const wanted = [];
    squads.forEach((s, i) => {
        if (!isPlatoonHQBattleSquad(s)) return;
        if (s.hidden || s.isDestroyed || s.isRetreated || s.status === 'retreated') return;
        if (!(s.fighters || []).some(f => f && f.hp > 0)) return;
        const k = pos[i];
        if (k && mapLike.grid[k] && wanted.indexOf(k) < 0) wanted.push(k);
    });
    const stateKey = supplyPointStateKey(side);
    const prev = Array.isArray(mapLike[stateKey]) ? mapLike[stateKey] : [];
    let changed = false;
    prev.forEach(k => {
        if (wanted.indexOf(k) >= 0) return;
        const cell = mapLike.grid[k];
        if (cell && Array.isArray(cell.markers) && cell.markers.indexOf(SUPPLY_POINT_MARKER) >= 0) {
            cell.markers = cell.markers.filter(m => m !== SUPPLY_POINT_MARKER);
            changed = true;
        }
    });
    wanted.forEach(k => {
        const cell = mapLike.grid[k];
        if (!cell) return;
        if (!Array.isArray(cell.markers)) cell.markers = [];
        if (cell.markers.indexOf(SUPPLY_POINT_MARKER) < 0) { cell.markers.push(SUPPLY_POINT_MARKER); changed = true; }
    });
    mapLike[stateKey] = wanted.slice();
    if (changed && typeof log === 'function') {
        try {
            log(`📦 Пункт боепитания (${side === 'enemy' ? 'противник' : 'наши'}) — гекс(ы): ${wanted.length ? wanted.join(', ') : 'штаб взвода не размещён'}.`);
        } catch (e) {}
    }
    return wanted;
}
function syncBattleRecordSupplyPoints(battle) {
    if (!battle || !battle.tacticalMap) return;
    syncSupplyPointsOnGrid(battle.tacticalMap, battle.playerSquads || [], 'squadIds', 'player');
    const enemies = Array.isArray(battle.enemySquads) ? battle.enemySquads : (battle.tacticalMap.enemySquads || []);
    syncSupplyPointsOnGrid(battle.tacticalMap, enemies, 'enemySquadIds', 'enemy');
}
function syncLiveMapSupplyPoints() {
    if (typeof appData === 'undefined' || !appData || !appData.map || !appData.map.grid) return;
    syncSupplyPointsOnGrid(appData.map, appData.squads || [], 'squadIds', 'player');
    syncSupplyPointsOnGrid(appData.map, appData.map.enemySquads || [], 'enemySquadIds', 'enemy');
}
