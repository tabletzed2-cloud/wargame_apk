// ⚡ BUILD-МАРКЕР: v13.106 — синхронизируется с APP_VERSION (см. index.html, самопроверка сборки)
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
        ov = { hexEdits: {}, hexVariants: {}, hexRotations: {}, hexEditOwners: {}, trenchPoints: 0, prepPoints: 0, shellings: 0 };
        all[hexKey] = ov;
    }
    if (ov) {
        if (!ov.hexEdits) ov.hexEdits = {};
        if (!ov.hexVariants) ov.hexVariants = {};
        if (!ov.hexRotations || typeof ov.hexRotations !== 'object') ov.hexRotations = {};
        if (!ov.hexEditOwners || typeof ov.hexEditOwners !== 'object') ov.hexEditOwners = {};
        if (typeof ov.trenchPoints !== 'number') ov.trenchPoints = 0;
        if (typeof ov.prepPoints !== 'number') ov.prepPoints = 0;
        if (typeof ov.shellings !== 'number') ov.shellings = 0;
        if (ov.fireField && typeof ov.fireField === 'object') {
            if (!Array.isArray(ov.fireField.cells)) ov.fireField.cells = [];
            ov.fireField.cells = Array.from(new Set(ov.fireField.cells.map(String))).slice(0, 3);
            if (!['draft', 'armed', 'used'].includes(ov.fireField.state)) ov.fireField.state = ov.fireField.cells.length === 3 ? 'armed' : 'draft';
        }
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
function operationalFactionForUnit(unit) {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || {};
    if (unit && unit.faction) return unit.faction;
    const enemy = isEnemyOperationalUnit(unit);
    if (!enemy) return camp.playerFaction || null;
    const onlineEnemy = camp.onlineOpponent && camp.onlineOpponent.faction;
    if (onlineEnemy) return onlineEnemy;
    return camp.playerFaction === 'BeVe' ? 'A.I.R.F.' : 'BeVe';
}
function markOperationalMarkerOwner(hexKey, markerType, unit) {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    const grid = camp && camp.opMapGrid;
    if (!grid || !hexKey || !markerType) return null;
    let cell = grid[hexKey];
    if (Array.isArray(cell)) cell = grid[hexKey] = { types: cell.slice(), markers: [] };
    if (!cell || typeof cell !== 'object') cell = grid[hexKey] = { types: ['grass'], markers: [] };
    if (!Array.isArray(cell.markers)) cell.markers = [];
    if (!cell.markers.includes(markerType)) cell.markers.push(markerType);
    if (!cell.markerOwners || typeof cell.markerOwners !== 'object') cell.markerOwners = {};
    cell.markerOwners[markerType] = operationalFactionForUnit(unit) || (isEnemyOperationalUnit(unit) ? 'enemy' : 'player');
    return cell.markerOwners[markerType];
}
function logOperationalFortificationActivity(unit, message) {
    if (typeof isEnemyOperationalUnit === 'function' && isEnemyOperationalUnit(unit)) return;
    if (typeof log === 'function') log(message);
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
        // ⚡ v13.092 (п.2): гексы ДОТов заданы стартовыми позициями — игрок
        //    выбирает только клетку на карте гекса, поэтому выбор не нужен
        text = `🪖 ДОТы стоят на гексах стартовых позиций: ${safeKeys.map(k => `(${k})`).join(', ') || '—'}. Нажмите «🪖 Расставить ДОТы» и укажите на карте каждого гекса клетку для ДОТа.`;
    } else {
        text = `Перед завершением начальной расстановки укажите на карте каждого гекса клетку для ДОТа: ${safeKeys.map(k => `(${k})`).join(', ') || '—'} (гексы ДОТов — из стартовых позиций в js/data.js, их нельзя менять).`;
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
    // ⚡ v13.092 (п.2): оперативные гексы ДОТов НЕ выбираются игроком — они
    //    всегда берутся из стартовых позиций js/data.js (SCENARIO_START_POSITIONS).
    //    Игрок за BeVe выбирает только КЛЕТКУ на карте гекса (редактор ниже).
    const keys = initialDotStartHexes();
    if (!keys.length) {
        alert('Для ДОТов не заданы стартовые гексы — проверьте SCENARIO_START_POSITIONS в js/data.js.');
        renderInitialFortificationStatus();
        return false;
    }
    // повторное открытие редактора: проходим те же гексы заново — уже
    // поставленные ДОТы видны на своих картах, клетку можно заменить
    let state = camp.initialFortificationSetup;
    if (!state || typeof state !== 'object') state = {};
    state.phase = 'edit';
    state.hexKeys = keys.slice();
    state.nextIndex = 0;
    state.complete = false;
    camp.initialFortificationSetup = state;
    camp.initialFortificationHexes = keys.slice();
    camp.opMapMode = 'view';
    renderInitialFortificationStatus();
    const mi = document.getElementById('mapInfo');
    if (mi) {
        mi.innerHTML = `🪖 ДОТы стоят на гексах стартовых позиций: ${keys.map(k => `(${k})`).join(', ')}. ` +
            'Открываем карту гекса — укажите на ней клетку для ДОТа.';
        mi.style.color = '#f1c40f';
    }
    saveData();
    openHexEditorForBattle(keys[0], 'initialFortification');
    return true;
}
// ⚡ v13.092 (п.2): оперативный гекс ДОТа — из стартовых позиций js/data.js
//    (SCENARIO_START_POSITIONS), иначе — текущий гекс юнита.
function initialDotHexForUnit(unit) {
    const camp = appData && appData.campaign;
    if (!camp || !unit) return null;
    if (typeof getConfiguredStartHex === 'function') {
        const faction = camp.playerFaction ||
            ((camp.battalions && camp.battalions.player) || {}).faction;
        const h = getConfiguredStartHex(camp.scenario, faction, unit);
        if (h) return h.col + ',' + h.row;
    }
    if (unit.col != null && unit.row != null) return unit.col + ',' + unit.row;
    return null;
}
// Ближайший свободный гекс стартовой зоны — если у двух ДОТов одна стартовая
// позиция (или позиция не задана вовсе): один оперативный гекс — один ДОТ.
function freeHexForInitialDot(taken, nearKey) {
    const camp = appData && appData.campaign;
    if (!camp || typeof getFactionPlacementHexes !== 'function') return null;
    const zone = getFactionPlacementHexes(camp.scenario, camp.playerFaction) || [];
    if (!zone.length) return null;
    let near = null;
    if (nearKey) {
        const p = String(nearKey).split(',').map(Number);
        if (p.length === 2 && isFinite(p[0]) && isFinite(p[1])) near = { col: p[0], row: p[1] };
    }
    const dist = (h) => near
        ? ((typeof getOpHexDistance === 'function')
            ? getOpHexDistance(h.col, h.row, near.col, near.row)
            : Math.abs(h.col - near.col) + Math.abs(h.row - near.row))
        : 0;
    const free = zone.filter(h => !taken.has(h.col + ',' + h.row)).sort((a, b) => dist(a) - dist(b));
    return free.length ? (free[0].col + ',' + free[0].row) : null;
}
// Номер гекса (из списка гексов ДОТов), на котором стоит ДОТ без клетки
function initialDotFirstUnfixedIndex(keys) {
    const list = Array.isArray(keys) ? keys : [];
    const cands = initialDotCandidates();
    for (let i = 0; i < cands.length; i++) {
        const p = cands[i].squad && cands[i].squad.fixedTacticalPosition;
        if (p) continue;
        const key = initialDotHexForUnit(cands[i].unit);
        const idx = key ? list.indexOf(key) : -1;
        if (idx >= 0) return idx;
        return Math.min(i, Math.max(0, list.length - 1));
    }
    return 0;
}
// Гексы, на которых стоят ДОТы начальной расстановки (по одному на ДОТ).
function initialDotStartHexes() {
    const camp = appData && appData.campaign;
    if (!camp) return [];
    const taken = new Set();
    const hexes = [];
    initialDotCandidates().forEach(x => {
        const wanted = initialDotHexForUnit(x.unit);
        const key = (wanted && !taken.has(wanted)) ? wanted : freeHexForInitialDot(taken, wanted);
        if (!key) return;
        taken.add(key);
        hexes.push(key);
        // ⚡ v13.092 (п.2): юнит ДОТа всегда стоит на своём гексе стартовых позиций
        const [col, row] = String(key).split(',').map(Number);
        if (isFinite(col) && isFinite(row)) { x.unit.col = col; x.unit.row = row; }
    });
    return hexes;
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
    const editOwners = (ov && ov.hexEditOwners) || {};
    const fort = (ov && ov.initialFortifications) || { trenchCells: [], dotCells: [] };
    const trenches = new Set(Array.isArray(fort.trenchCells) ? fort.trenchCells : []);
    // ⚡ v13.105 (п.2): черновик приказа хранит тип, текстуру и поворот клеток
    const pendingDraft = (typeof pendingHexEditDraft === 'function') ? pendingHexEditDraft(hexKey) : null;
    const draftCells = (pendingDraft && pendingDraft.cells) || {};
    const draftVariants = (pendingDraft && pendingDraft.variants) || {};
    const draftRotations = (pendingDraft && pendingDraft.rotations) || {};
    const md = TACTICAL_HEX_MAPS[hexKey];
    const applyFortificationOwner = (cell, key) => {
        const fallbackFaction = ov && ov.placedByMe && appData && appData.campaign && appData.campaign.playerFaction;
        const owner = editOwners[key] || fallbackFaction;
        if (!cell || !owner) return;
        if (!cell._hexEditOwnerApplied) {
            cell._hexEditOwnerOriginalPresent = Object.prototype.hasOwnProperty.call(cell, 'fortificationOwner');
            if (cell._hexEditOwnerOriginalPresent) cell._hexEditOwnerOriginal = cell.fortificationOwner;
        }
        cell.fortificationOwner = owner;
        cell._hexEditOwnerApplied = true;
    };
    Object.keys(grid).forEach(k => {
        const cell = grid[k];
        if (!cell) return;
        if (cell._hexEditOwnerApplied) {
            if (cell._hexEditOwnerOriginalPresent) cell.fortificationOwner = cell._hexEditOwnerOriginal;
            else delete cell.fortificationOwner;
            delete cell._hexEditOwnerApplied;
            delete cell._hexEditOwnerOriginalPresent;
            delete cell._hexEditOwnerOriginal;
        }
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
        if (cell.ov && !edits[k] && !trenches.has(k) && draftCells[k] === undefined) {
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
        if (edits[k] === 'trenches') applyFortificationOwner(cell, k);
    });
    trenches.forEach(k => {
        const cell = grid[k];
        if (!cell) return;
        cell.type = 'trenches';
        cell.variant = (ov.hexVariants && ov.hexVariants[k]) || 0;
        cell.ov = 1;
        cell._deploymentTrenchOverlay = 1;
        applyFortificationOwner(cell, k);
    });
    // ⚡ v13.105 (п.5): метки «dot» (🏰) больше не ставятся: ДОТ отображается своим
    //    юнитом, а накопленные dotCells давали лишние метки на чужих гексах.
    // ⚡ v13.105 (п.2): клетки черновика сохраняют заданные при планировании значения
    Object.keys(draftCells).forEach(k => {
        const cell = grid[k];
        if (!cell) return;
        cell.type = draftCells[k];
        cell.variant = Number.isFinite(draftVariants[k]) ? draftVariants[k] : (cell.variant || 0);
        if (draftRotations[k] !== undefined) cell.rotation = normalizeHexRotation(draftRotations[k], 0);
        cell.ov = 1;
    });
    // «Огненное поле» хранится в локальном оверлее владельца, но не отправляется
    // противнику. Пока оно не загорелось, метки появляются только на его карте.
    const fireField = ov && ov.fireField;
    Object.keys(grid).forEach(k => {
        const cell = grid[k];
        if (cell && Array.isArray(cell.markers)) cell.markers = cell.markers.filter(marker => marker !== 'fireField');
    });
    if (fireField && fireField.state === 'armed') {
        (fireField.cells || []).forEach(k => {
            const cell = grid[k];
            if (!cell) return;
            if (!Array.isArray(cell.markers)) cell.markers = [];
            if (!cell.markers.includes('fireField')) cell.markers.push('fireField');
        });
    } else if (fireField) {
        (fireField.cells || []).forEach(k => {
            const cell = grid[k];
            if (cell && Array.isArray(cell.markers)) cell.markers = cell.markers.filter(marker => marker !== 'fireField');
        });
    }
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

function operationalHexIsRevealed(hexKey) {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    if (!camp || !hexKey) return false;
    if (Array.isArray(camp.fogRevealedHexes) && camp.fogRevealedHexes.indexOf(String(hexKey)) >= 0) return true;
    return !!(appData.currentBattleId && appData.map && String(appData.map.hexKey || '') === String(hexKey));
}
function hexOverlayEditIsCovert(hexOverlay, cellKey, operationalHexKey) {
    const source = hexOverlay && hexOverlay.hexEditSources && hexOverlay.hexEditSources[cellKey];
    if (source === 'trenches' || source === 'prep' || source === 'prep_positions' || source === 'dig_in') return true;
    const terrain = hexOverlay && hexOverlay.hexEdits && hexOverlay.hexEdits[cellKey];
    if (terrain === 'trenches' || terrain === 'fallen_forest') return true;
    // Совместимость с облачными/старыми сохранениями без hexEditSources:
    // подготовка кустов меняет их на grass, а подготовка леса — на fallen_forest.
    if (terrain === 'grass') {
        const md = operationalHexKey && TACTICAL_HEX_MAPS[operationalHexKey];
        const baseType = md && md.grid && md.grid[cellKey] && md.grid[cellKey].type;
        return baseType === 'bushes' || (typeof isForestHexType === 'function' && isForestHexType(baseType));
    }
    return false;
}

// Слияние облачных правок с локальными.
// ⚡ v13.053 (R38#2): объединение — одинаковое у обоих игроков: клетка, которую
//    правили ОБА (например, воронки двух обстрелов легли на одну клетку с разной
//    текстурой), берётся у игрока p1 — у обоих получается одна и та же карта.
//    Изменившиеся гексы сразу накладываются на карты идущих боёв.
//    Работы противника по окопам и расчистке открываются только при раскрытии
//    соответствующего оперативного гекса боем.
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
        if (!l.hexEditOwners || typeof l.hexEditOwners !== 'object') l.hexEditOwners = {};
        if (!l.hexEditSources || typeof l.hexEditSources !== 'object') l.hexEditSources = {};
        if (!l.initialFortifications || typeof l.initialFortifications !== 'object') l.initialFortifications = { trenchCells: [], dotCells: [] };
        if (!Array.isArray(l.initialFortifications.trenchCells)) l.initialFortifications.trenchCells = [];
        if (!Array.isArray(l.initialFortifications.dotCells)) l.initialFortifications.dotCells = [];
        const revealed = operationalHexIsRevealed(hexKey);
        Object.keys(c.hexEdits || {}).forEach(k => {
            if (!revealed && hexOverlayEditIsCovert(c, k, hexKey)) return;
            const cv = c.hexEdits[k];
            const cvar = (c.hexVariants && c.hexVariants[k] !== undefined) ? c.hexVariants[k] : 0;
            const source = c.hexEditSources && c.hexEditSources[k];
            const owner = c.hexEditOwners && c.hexEditOwners[k];
            if (!(k in l.hexEdits)) {
                l.hexEdits[k] = cv; l.hexVariants[k] = cvar;
                if (source) l.hexEditSources[k] = source;
                if (owner) l.hexEditOwners[k] = owner;
                hexChanged = true; return;
            }
            if (cloudWins && (l.hexEdits[k] !== cv || (l.hexVariants[k] || 0) !== cvar)) {
                l.hexEdits[k] = cv; l.hexVariants[k] = cvar;
                if (source) l.hexEditSources[k] = source;
                if (owner) l.hexEditOwners[k] = owner;
                hexChanged = true;
            } else {
                if (source && !l.hexEditSources[k]) l.hexEditSources[k] = source;
                if (owner && (cloudWins || !l.hexEditOwners[k]) && l.hexEditOwners[k] !== owner) {
                    l.hexEditOwners[k] = owner;
                    hexChanged = true;
                }
            }
        });
        Object.keys(c.hexRotations || {}).forEach(k => {
            if (!revealed && hexOverlayEditIsCovert(c, k, hexKey)) return;
            const value = normalizeHexRotation(c.hexRotations[k]);
            if (!(k in l.hexRotations)) { l.hexRotations[k] = value; hexChanged = true; return; }
            if (cloudWins && normalizeHexRotation(l.hexRotations[k]) !== value) {
                l.hexRotations[k] = value;
                hexChanged = true;
            }
        });
        const cf = c.initialFortifications || {};
        ['trenchCells', 'dotCells'].forEach(field => {
            if (field === 'trenchCells' && !revealed) return;
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

const TACTICAL_FIRE_SECTOR_OPTIONS = [
    { id: 'e', label: '→ Восток', cube: { x: 1, y: -1, z: 0 } },
    { id: 'se', label: '↘ Юго-восток', cube: { x: 0, y: -1, z: 1 } },
    { id: 'sw', label: '↙ Юго-запад', cube: { x: -1, y: 0, z: 1 } },
    { id: 'w', label: '← Запад', cube: { x: -1, y: 1, z: 0 } },
    { id: 'nw', label: '↖ Северо-запад', cube: { x: 0, y: 1, z: -1 } },
    { id: 'ne', label: '↗ Северо-восток', cube: { x: 1, y: 0, z: -1 } }
];
// ⚡ v13.099 (п.1): дальность обстрела ДОТа — не дальше 3 гексов. Сектор
//    амбразуры на ОПЕРАТИВНОЙ карте рисуется и действует только в этом радиусе.
const DOT_FIRE_RANGE_HEXES = 3;
// ⚡ v13.095 (п.2): ШИРИНА сектора обстрела амбразуры ДОТа зависит от типа ДОТа
//    и оружия: ДОТ «Van Hees»: ПТ-орудие — круговой сектор 360°, пулемёт — 90°.
//    ДОТ «Bosh»: два пулемёта — по 60°, орудие — 90°. Секторы разных амбразур
//    МОГУТ совпадать/перекрываться. Направление по-прежнему задаёт игрок.
function dotSectorWeaponKind(squad, crewIndex) {
    const crew = squad && Array.isArray(squad.crewInstances) ? squad.crewInstances[crewIndex] : null;
    const name = String((crew && crew.weaponName) || '');
    if (/пулем|максим|шварцлозе|виккерс|браунинг|hotchkiss|гочкис|\bmg\b/i.test(name)) return 'mg';
    if (/оруд|пушк|противотанк|bohler|бёлер|белер|гаубиц|миномёт|миномет|птр/i.test(name)) return 'gun';
    return null;
}
function dotSectorWidthDeg(squad, crewIndex) {
    const squadName = String((squad && squad.name) || '');
    const kind = dotSectorWeaponKind(squad, crewIndex);
    if (/van hees|ван хеес/i.test(squadName)) return kind === 'gun' ? 360 : 90;
    if (/bosh|бош/i.test(squadName)) return kind === 'mg' ? 60 : 90;
    return 60; // прочие ДОТы — прежний веер 60°
}
function _cubeToPixel2D(cube) { return { x: Math.sqrt(3) * (cube.x + cube.z / 2), y: 1.5 * cube.z }; }
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
function tacticalWeaponFireSector(squad, crewIndex) {
    const pos = squad && squad.fixedTacticalPosition;
    const sectors = (pos && pos.weaponSectors) || (squad && squad.weaponSectors) || {};
    const value = sectors[String(crewIndex)];
    return TACTICAL_FIRE_SECTOR_OPTIONS.some(option => option.id === value) ? value : null;
}
function tacticalDotHasConfiguredSectors(squad) {
    return !!squad && !!squad.fixedTacticalPosition &&
        !!(squad.fixedTacticalPosition.weaponSectors && Object.keys(squad.fixedTacticalPosition.weaponSectors).length);
}
function tacticalHexInFireSector(fromKey, targetKey, sectorId, widthDeg) {
    const direction = TACTICAL_FIRE_SECTOR_OPTIONS.find(option => option.id === sectorId);
    if (!direction || !fromKey || !targetKey) return true;
    const from = String(fromKey).split(',').map(Number), target = String(targetKey).split(',').map(Number);
    if (from.length !== 2 || target.length !== 2 || !from.every(Number.isFinite) || !target.every(Number.isFinite)) return false;
    const a = _hexCubeCoords(from[0], from[1]), b = _hexCubeCoords(target[0], target[1]);
    const distance = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z));
    if (distance <= 0) return false;
    const width = Number.isFinite(Number(widthDeg)) ? Number(widthDeg) : 60;
    if (width >= 360) return true; // круговой обстрел (ПТ-амбразура Van Hees)
    // Угол между осью сектора и направлением на цель (в пиксельной плоскости).
    const tp = _cubeToPixel2D({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
    const dp = _cubeToPixel2D(direction.cube);
    const tLen = Math.hypot(tp.x, tp.y), dLen = Math.hypot(dp.x, dp.y);
    if (tLen <= 0 || dLen <= 0) return false;
    const cos = Math.max(-1, Math.min(1, (tp.x * dp.x + tp.y * dp.y) / (tLen * dLen)));
    const angleDeg = Math.acos(cos) * 180 / Math.PI;
    return angleDeg <= width / 2 + 0.5;
}
// ⚡ v13.095 (п.2): те же сектора действуют и на ОПЕРАТИВНОЙ карте: ДОТ может
//    обстреливать только те оперативные гексы, что попадают в сектор хотя бы
//    одной его амбразуры (ширина — по типу ДОТа/оружия).
function operationalDotSectorAllows(unit, targetCol, targetRow) {
    if (!unit || !Array.isArray(unit.squads)) return true;
    const dotSquads = unit.squads.filter(sq => sq && /ДОТ/i.test(String(sq.name || '')) && tacticalDotHasConfiguredSectors(sq));
    if (!dotSquads.length) return true; // сектора не настроены — ограничений нет
    const fromKey = unit.col + ',' + unit.row, targetKey = targetCol + ',' + targetRow;
    // ⚡ v13.099 (п.1): ДОТ стреляет не дальше 3 гексов — вне радиуса сектор не действует.
    if (typeof hexGridDistance === 'function' &&
        hexGridDistance(Number(unit.col), Number(unit.row), Number(targetCol), Number(targetRow)) > DOT_FIRE_RANGE_HEXES) return false;
    return dotSquads.some(squad => {
        const sectors = (squad.fixedTacticalPosition && squad.fixedTacticalPosition.weaponSectors) || {};
        return Object.keys(sectors).some(key => {
            const crewIndex = Number(key);
            return tacticalHexInFireSector(fromKey, targetKey, sectors[key], dotSectorWidthDeg(squad, crewIndex));
        });
    });
}
function tacticalDotWeaponCanTarget(squadIndex, targetIndex, crewIndex) {
    const squad = (appData && appData.squads || [])[squadIndex];
    const target = (appData && appData.map && appData.map.enemySquads || [])[targetIndex];
    const sector = tacticalWeaponFireSector(squad, crewIndex);
    if (!sector) return true; // старые сохранения без направления остаются совместимы
    if (!squad || !target || !appData.map || !appData.map.grid) return false;
    const from = getBattleSquadHex(appData.map.grid, squadIndex, false);
    const to = getBattleSquadHex(appData.map.grid, targetIndex, true);
    return !!(from && to && tacticalHexInFireSector(from.key, to.key, sector, dotSectorWidthDeg(squad, crewIndex)));
}
function tacticalDotCanFireAtTarget(squadIndex, targetIndex, crewIndices) {
    const squad = (appData && appData.squads || [])[squadIndex];
    const indices = Array.isArray(crewIndices) ? crewIndices : [];
    if (!tacticalDotHasConfiguredSectors(squad)) return true;
    if (!indices.length) return false;
    return indices.some(index => !tacticalWeaponFireSector(squad, index) ||
        tacticalDotWeaponCanTarget(squadIndex, targetIndex, index));
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
        // Скрываем от игрока ход выполнения и результат вражеского окапывания.
        return ov.trenchPoints || 0;
    }
    // ⚡ v13.099 (п.6): приказ выполнен — переносим черновик правок на карту и
    //    зачитываем эти отметки в счёт выданных правок.
    let drafted = 0;
    try { if (typeof applyPendingHexEdits === 'function') drafted = applyPendingHexEdits(hexKey, 'trenches'); } catch (e) { console.warn('applyPendingHexEdits:', e.message); }
    const currentBudget = Math.max(0, Math.floor(Number(ov.trenchPoints) || 0));
    const granted = Math.max(0, n - drafted);
    ov.trenchPoints = currentBudget + granted;
    ov.placedByMe = true;
    saveHexOverlays(hexKey);
    if (granted > 0) {
        log(`🕳️ ${unitName || 'Отряд'}: доступно гексов окопов на гексе (${hexKey}) — +${granted} (всего ${ov.trenchPoints}).`);
        try { if (typeof window !== 'undefined' && typeof window.toast === 'function') window.toast(`🕳️ Окопы готовы: гекс (${hexKey}) — можно разместить ${ov.trenchPoints} окоп(а).`, 'success'); } catch (e) {}
        showHexEditButton(hexKey, 'trenches');
        if (!drafted) queueHexEditPrompt(hexKey, 'trenches', unitName);
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
        // Скрываем от игрока ход выполнения и результат вражеской подготовки.
        return ov.prepPoints || 0;
    }
    // ⚡ v13.099 (п.6): приказ выполнен — переносим черновик правок на карту
    let drafted = 0;
    try { if (typeof applyPendingHexEdits === 'function') drafted = applyPendingHexEdits(hexKey, 'prep'); } catch (e) { console.warn('applyPendingHexEdits:', e.message); }
    const n = Math.max(0, Math.max(1, Math.floor(Number(squadsCount) || 1)) - drafted);
    ov.prepPoints = (ov.prepPoints || 0) + n;
    ov.placedByMe = true;
    saveHexOverlays(hexKey);
    log(`🪓 ${unitName || 'Отряд'}: доступно правок «подготовка позиций» на гексе (${hexKey}) — +${n} (всего ${ov.prepPoints}).`);
    try { if (typeof window !== 'undefined' && typeof window.toast === 'function') window.toast(`🪓 Расчистка позиций готова: гекс (${hexKey}) — доступно правок: ${ov.prepPoints}.`, 'success'); } catch (e) {}
    if (!drafted) { showHexEditButton(hexKey, 'prep'); queueHexEditPrompt(hexKey, 'prep', unitName); }
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
        try { openHexEditorForBattle(first.hexKey, first.kind, first.unitName); } catch (e) { console.warn('openHexEditorForBattle:', e.message); }
    }
    return yes;
}

// ⚡ v13.053 (R38#3): постоянная панель под оперативной картой — гексы с
//    доступными правками и кнопки открытия карты (не зависит от строки сообщений)
function renderHexEditsPanel() {
    const all = (typeof appData !== 'undefined' && appData.campaign && appData.campaign.hexOverlays) || {};
    const campaignUnits = (typeof appData !== 'undefined' && appData.campaign && appData.campaign.opUnits) || [];
    const fireFieldDrafts = campaignUnits.filter(unit => {
        if (!unit || unit.fireFieldOrderState !== 'draft' || !/^\d+,\d+$/.test(String(unit.fireFieldOpHex || ''))) return false;
        const fire = all[unit.fireFieldOpHex] && all[unit.fireFieldOpHex].fireField;
        return !!(fire && fire.ownerUnitName === unit.name && fire.state === 'draft');
    });
    const fireFieldSetupRows = fireFieldDrafts.map(unit =>
        `<button onclick="openHexEditorForBattle('${unit.fireFieldOpHex}','fireField')" style="background:#c0392b; font-size:0.85rem;">🔥 Разметить 3 клетки · ${typeof escapeCardHtml === 'function' ? escapeCardHtml(unit.name) : 'взвод'} (${unit.fireFieldOpHex})</button>`
    ).join('<br>');
    // ⚡ v13.094 (п.8): панель видна, только пока есть НЕИСПОЛЬЗОВАННЫЕ очки
    //    своих приказов; после расстановки она скрывается до новых приказов.
    //    Чужие работы в онлайне не показываем, пока гекс не раскрыт боем.
    const rows = Object.keys(all).filter(k => {
        const ov = all[k];
        if (!ov || !((ov.trenchPoints || 0) > 0 || (ov.prepPoints || 0) > 0)) return false;
        if (appData.campaign && appData.campaign.online && !ov.placedByMe && !operationalHexIsRevealed(k)) return false;
        return true;
    });
    const rowHtml = (k, inRunningBattle = false) => {
        const ov = all[k];
        const placed = countHexTrenchCells(ov);
        // В уже идущем тактическом бою, если бюджет расстановки исчерпан,
        // больше не открываем редактор окопов только ради повторной расстановки.
        // В оперативном интерфейсе текстуру/поворот существующих окопов менять можно.
        const canOpenTrenchEditor = (ov.trenchPoints || 0) > 0;
        return `· гекс <b>(${k})</b>: ` +
            (canOpenTrenchEditor ? `<button onclick="openHexEditorForBattle('${k}','trenches')" style="background:#8e44ad; font-size:0.85rem;">🕳️ ${(ov.trenchPoints || 0) ? `Расставить окопы (${ov.trenchPoints})` : `Текстура/поворот окопов (${placed})`}</button> ` : '') +
            ((ov.prepPoints || 0) ? `<button onclick="openHexEditorForBattle('${k}','prep')" style="background:#16a085; font-size:0.85rem;">🪓 Подготовка позиций (${ov.prepPoints})</button>` : '');
    };
    const setPanel = (panel, html) => {
        if (!panel) return;
        if (!html) { if (panel.style.display !== 'none') { panel.style.display = 'none'; panel.innerHTML = ''; } return; }
        if (panel.innerHTML !== html) panel.innerHTML = html;
        if (panel.style.display !== 'block') panel.style.display = 'block';
    };
    // карта операции — все гексы с правками
    const opPanelParts = [];
    if (rows.length) {
        opPanelParts.push('<b style="color:#2ecc71;">🛠️ Карты гексов — доступны правки местности</b> ' +
            '<span style="color:#aaa; font-size:0.8rem;">(приказы «Окопаться» / «Подготовка позиций» выполнены; правки увидит и противник в бою на этом гексе)</span><br>' +
            rows.map(rowHtml).join('<br>'));
    }
    if (fireFieldSetupRows) {
        opPanelParts.push('<b style="color:#ff9f43;">🔥 Огненное поле — требуется выбрать клетки</b> ' +
            '<span style="color:#aaa; font-size:0.8rem;">(до срабатывания разметка скрыта от противника)</span><br>' + fireFieldSetupRows);
    }
    setPanel(document.getElementById('opHexEditsPanel'), opPanelParts.join('<hr style="border-color:#555;">'));
    // экран боя — только гекс ЭТОГО боя
    let battleHtml = '';
    if (typeof appData !== 'undefined' && appData.currentBattleId && !hexEditorState) {
        const b = (appData.campaign.activeBattles || []).find(x => x && x.id === appData.currentBattleId);
        if (b && b.hexKey) {
            const battleOverlay = all[b.hexKey] || {};
            const hasUnusedEditPoints = (battleOverlay.trenchPoints || 0) > 0 || (battleOverlay.prepPoints || 0) > 0;
            const battleFireDrafts = fireFieldDrafts.filter(unit => String(unit.fireFieldOpHex) === String(b.hexKey));
            if (hasUnusedEditPoints || battleFireDrafts.length) {
                if (hasUnusedEditPoints) {
                    battleHtml = `<b style="color:#2ecc71;">🛠️ На гексе этого боя (${b.hexKey}) доступны правки карты</b> ` +
                        '<span style="color:#aaa; font-size:0.8rem;">(после «✅ Готово» вернётесь в этот бой; правки местности видны обеим сторонам)</span><br>' + rowHtml(b.hexKey, true);
                }
                if (battleFireDrafts.length) {
                    if (battleHtml) battleHtml += '<hr style="border-color:#555;">';
                    battleHtml += '<b style="color:#ff9f43;">🔥 Огненное поле — выберите три клетки</b><br>' +
                        battleFireDrafts.map(unit =>
                            `<button onclick="openHexEditorForBattle('${unit.fireFieldOpHex}','fireField')" style="background:#c0392b; font-size:0.85rem;">🔥 Разметить 3 клетки · ${typeof escapeCardHtml === 'function' ? escapeCardHtml(unit.name) : 'взвод'}</button>`
                        ).join('<br>');
                }
            }
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
    if (kind === 'fireField') {
        return {
            title: '🔥 Огненное поле',
            hint: 'Разлейте нефть на трёх любых клетках тактической карты. До срабатывания метки видны только вам; движение по ним свободно.',
            allowed: () => true,
            targetType: null,
            pointsField: null
        };
    }
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

function openHexEditorForBattle(hexKey, kind, ownerUnitName) {
    if (!hexKey) return;
    kind = kind || 'trenches';
    const ov = getHexOverlay(hexKey, true);
    const rule = hexEditRuleFor(kind);
    const budget = rule.pointsField ? (ov[rule.pointsField] || 0) : 0;
    const existingTrenchesCanBeEdited = kind === 'trenches' && countHexTrenchCells(ov) > 0;
    const canEditFireField = kind === 'fireField' && ov.fireField && ['draft', 'armed'].includes(ov.fireField.state);
    // ⚡ v13.100 (п.1): приказ «Окопаться» / «Расчистка местности» открывает карту
    //    гекса СРАЗУ после отдачи приказа. Пока приказ не выполнен, правки идут
    //    ЧЕРНОВИКОМ, поэтому очки правок ещё не выданы — это не повод не пускать
    //    игрока в редактор: разрешаем вход, если по гексу есть черновик или
    //    активный приказ нужного типа.
    const draftKind = (kind === 'prep') ? 'prep' : 'trenches';
    const hasPendingDraft = (typeof pendingHexEditDraftActive === 'function') && pendingHexEditDraftActive(hexKey);
    const orderKindForHex = (kind === 'prep') ? 'prep_positions' : 'dig_in';
    const activeOrderForHex = (() => {
        try {
            const list = (typeof hardMode !== 'undefined' && hardMode && Array.isArray(hardMode.orders)) ? hardMode.orders : [];
            const pending = (typeof hardMode !== 'undefined' && hardMode && Array.isArray(hardMode.pendingOrders)) ? hardMode.pendingOrders : [];
            const all = list.concat(pending, (typeof hardMode !== 'undefined' && hardMode && Array.isArray(hardMode.messengerQueue)) ? hardMode.messengerQueue : []);
            return all.some(o => {
                if (!o || ['completed', 'cancelled'].includes(o.status)) return false;
                const type = (o.type === 'company_order') ? o.orderType : o.type;
                if (type !== orderKindForHex && !(Array.isArray(o.series) && o.series.some(st => st && st.type === orderKindForHex))) return false;
                const hex = o.targetHex || o.startHex || (o.originalHex || null);
                return !hex || String(hex) === String(hexKey);
            });
        } catch (e) { return false; }
    })();
    if (!hasPendingDraft && activeOrderForHex && typeof beginPendingHexEditDraft === 'function') {
        try { beginPendingHexEditDraft(hexKey, draftKind, ownerUnitName); } catch (e) {}
    }
    const draftModeOpen = hasPendingDraft || activeOrderForHex ||
        ((typeof pendingHexEditDraftActive === 'function') && pendingHexEditDraftActive(hexKey));
    if (kind === 'fireField' && !canEditFireField) {
        alert('Нет готового приказа «Разлить нефть» для этого оперативного гекса.');
        return;
    }
    if (kind !== 'initialFortification' && !canEditFireField && budget <= 0 && !existingTrenchesCanBeEdited && !draftModeOpen) {
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
        const ownerUnit = ownerUnitName && typeof getOpUnitByName === 'function' ? getOpUnitByName(ownerUnitName) : null;
        hexEditorState = {
            hexKey, kind, rule,
            ownerUnitName: ownerUnitName || null,
            ownerFaction: ownerUnit && ownerUnit.faction || (appData.campaign && appData.campaign.playerFaction) || null,
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
        // ⚡ v13.099 (п.6/23): черновик подготовки (пока приказ не выполнен) и
        //    запись открытого гекса для подсветки на миникарте кампании
        hexEditorState.draftMode = (typeof pendingHexEditDraftActive === 'function') && pendingHexEditDraftActive(hexKey);
        try {
            if (appData.campaign) appData.campaign.lastOpenedHexKey = String(hexKey);
            if (appData.map) appData.map.hexKey = String(hexKey);
            if (typeof renderCampaignMiniMap === 'function') renderCampaignMiniMap();
        } catch (e) {}
        if (hexEditorState.draftMode) {
            log('📝 Редактор открыт в режиме ЧЕРНОВИКА: отметки попадут на карту после выполнения приказа «' +
                (pendingHexEditDraft(hexKey).kind === 'prep' ? 'расчистка местности' : 'окапывание') + '».');
        }
        let baseGrid = hexEditorState.baseGrid;
        const size = Math.max(md ? Math.max(md.w || 0, md.h || 0) : 0, 15);
        const grid = {};
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const k = col + ',' + row;
                const src = baseGrid[k];
                // ⚡ v13.105 (п.2): текстура и поворот, заданные при создании карты, не сбрасываются
                grid[k] = src ? { ...src, squadIds: [], enemySquadIds: [], markers: [], rotation: src.rotation || 0, variant: src.variant || 0, level: src.level || 0 }
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
            if (!md && (kind === 'initialFortification' || kind === 'fireField')) {
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
    const battleRoot = document.getElementById('battleApp');
    if (battleRoot && battleRoot.classList) {
        const editorMode = !!st && ['trenches', 'prep'].includes(st.kind);
        if (typeof battleRoot.classList.toggle === 'function') battleRoot.classList.toggle('hex-editor-mode', editorMode);
        else if (editorMode && typeof battleRoot.classList.add === 'function') battleRoot.classList.add('hex-editor-mode');
        else if (!editorMode && typeof battleRoot.classList.remove === 'function') battleRoot.classList.remove('hex-editor-mode');
    }
    if (!st) { banner.style.display = 'none'; return; }
    // ⚡ v13.066: миникарта кампании — какой оперативный гекс открыт сейчас
    try { if (typeof renderCampaignMiniMap === 'function') renderCampaignMiniMap(); } catch (e) {}
    banner.style.cssText = 'display:block; background:#12241a; border:2px solid #27ae60; border-radius:8px; padding:10px; margin-bottom:8px;';
    if (st.kind === 'fireField') {
        const ov = getHexOverlay(st.hexKey, true);
        const fire = ov.fireField || { cells: [], state: 'draft' };
        const count = Array.isArray(fire.cells) ? fire.cells.length : 0;
        const active = st.undo && st.undo.length > 0;
        banner.innerHTML = `<b style="color:#ff9f43;">🔥 Огненное поле — гекс операции (${st.hexKey})</b><br>` +
          `<span style="color:#ccc; font-size:.85rem;">${st.rule.hint}</span><br>` +
          `<span style="color:#f1c40f;">Выбрано клеток: <b>${count}/3</b>${fire.state === 'armed' ? ' · поле размечено и скрыто от противника' : ''}</span>` +
          `<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">` +
            `<button onclick="hexEditUndo()" ${count ? '' : 'disabled'} style="background:#8e44ad;">↩️ Убрать последнюю выбранную</button>` +
            `<button onclick="closeHexEditor()" style="background:#27ae60;">✅ Готово — ${st.prevBattleId ? 'вернуться в бой' : 'на карту операции'}</button>` +
          `</div><div style="color:#888; font-size:.8rem; margin-top:4px;">Кликните любые три клетки карты; они не обязаны быть рядом. После третьей клетки поле будет подготовлено.</div>`;
        return;
    }
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
          initialDotSectorControls(st) +
          `<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">` +
            `<button onclick="setInitialFortificationTool('dot')" style="${active('dot')}">🏰 Поставить ДОТ</button>` +
            `<button onclick="setInitialFortificationTool('erase')" style="${active('erase')}">🧹 Стереть</button>` +
            `<button onclick="closeHexEditor()" style="background:#27ae60;">✅ Готово — ${index + 1 < total ? 'следующий гекс' : 'завершить'}</button>` +
          `</div><div style="color:#888; font-size:.8rem; margin-top:4px;">Окопы не расставляются: они уже нарисованы на картах по стандарту. ДОТ сохраняется как юнит и в бою на этом гексе встанет на указанную клетку.</div>`;
        return;
    }
    const ov = getHexOverlay(st.hexKey, true);
    const left = ov[st.rule.pointsField] || 0;
    // ⚠️ v13.106 (п.12): в режиме черновика — его статус и кнопка отмены
    const draft = pendingHexEditDraft(st.hexKey);
    const draftCells = draft && draft.cells ? Object.keys(draft.cells) : [];
    const draftRow = (pendingHexEditDraftActive(st.hexKey) && draftCells.length)
        ? `<span style="color:#f39c12; font-size:0.9rem;">📝 Черновик приказа: отмечено клеток <b>${draftCells.length}</b> (на карте появятся после выполнения приказа)</span><br>`
        : '';
    const draftCancelBtn = (pendingHexEditDraftActive(st.hexKey) && draftCells.length)
        ? `<button onclick="cancelPendingHexEditDraftUI()" style="background:#c0392b;">❌ Снять все отметки черновика</button>`
        : '';
    banner.innerHTML = `
      <b style="color:#2ecc71;">${st.rule.title} — гекс (${st.hexKey})</b><br>
      <span style="color:#ccc; font-size:0.85rem;">${st.rule.hint}</span><br>
      ${draftRow}
      <span style="color:#f1c40f; font-size:0.9rem;">Осталось правок: <b>${left}</b> (поставлено в этой сессии: ${st.placed})</span>
      <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
        <button onclick="hexEditUndo()" style="background:#8e44ad;">↩️ Отменить последнюю</button>
        <button onclick="rotateSelectedHex()" style="background:#8e44ad;">↻ Повернуть выбранную клетку (60°)</button>
        ${draftCancelBtn}
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

function fireFieldEditClick(st, hexKeyCell) {
    const ov = getHexOverlay(st.hexKey, true);
    const fire = ov.fireField;
    const infoBox = document.getElementById('mapInfo');
    if (!fire || !['draft', 'armed'].includes(fire.state)) {
        if (infoBox) { infoBox.textContent = '⛔ Это огненное поле уже использовано.'; infoBox.style.color = '#e74c3c'; }
        return true;
    }
    const before = fire.cells.slice();
    st.undo.push(before);
    const index = fire.cells.indexOf(String(hexKeyCell));
    if (index >= 0) {
        fire.cells.splice(index, 1);
    } else if (fire.cells.length >= 3) {
        st.undo.pop();
        if (infoBox) { infoBox.textContent = 'Вы уже выбрали три клетки. Уберите выбранную клетку перед заменой.'; infoBox.style.color = '#e67e22'; }
        return true;
    } else {
        fire.cells.push(String(hexKeyCell));
    }
    fire.state = fire.cells.length === 3 ? 'armed' : 'draft';
    st.placed = fire.cells.length;
    const owner = typeof getOpUnitByName === 'function' ? getOpUnitByName(fire.ownerUnitName) : null;
    if (owner) owner.fireFieldOrderState = fire.state;
    saveHexOverlays(st.hexKey);
    try { if (appData.map && appData.map.grid) applyHexOverlays(appData.map.grid, st.hexKey); } catch (e) {}
    if (infoBox) {
        infoBox.textContent = fire.state === 'armed'
            ? '✅ Выбраны три клетки — огненное поле подготовлено и скрыто от противника.'
            : `Выбрано клеток: ${fire.cells.length}/3. Кликните ещё ${3 - fire.cells.length}.`;
        infoBox.style.color = fire.state === 'armed' ? '#27ae60' : '#f1c40f';
    }
    showHexEditorBanner();
    try { redrawMap(); } catch (e) {}
    return true;
}

// Клик по гексу в режиме 'hexEdit'
// ⚡ v13.099 (п.6): приказ «окопаться»/«расчистить местность» открывает редактор
//    гекса СРАЗУ, но правки до выполнения приказа лежат ЧЕРНОВИКОМ: на карте они
//    появятся только когда приказ будет выполнен (applyPendingHexEdits).
function beginPendingHexEditDraft(hexKey, kind, unitName) {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    if (!camp || !hexKey) return null;
    if (!camp.pendingHexEdits || typeof camp.pendingHexEdits !== 'object') camp.pendingHexEdits = {};
    const draftKind = kind === 'prep' ? 'prep' : 'trenches';
    camp.pendingHexEdits[String(hexKey)] = {
        kind: draftKind,
        unitName: unitName || null,
        turn: camp.currentTurn || 1,
        cells: {},
        variants: {},
        rotations: {},
        // ⚡ v13.105 (п.2): окопов в черновике не больше, чем может выкопать юнит по приказу
        limit: draftKind === 'trenches' ? trenchLimitForDraftUnit(unitName) : null
    };
    log(`📝 Черновик подготовки гекса (${hexKey}): изменения появятся на карте только после выполнения приказа.`);
    return camp.pendingHexEdits[String(hexKey)];
}
// Сколько окопов может выкопать юнит по приказу: по одному на каждый живой отряд.
function trenchLimitForDraftUnit(unitName) {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    const units = (camp && camp.opUnits) || [];
    const unit = unitName ? units.find(u => u && u.name === unitName && !u.isDestroyed) : null;
    return unit ? Math.max(1, countSquadsForHexEdit(unit)) : 1;
}
function pendingHexEditDraft(hexKey) {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    if (!camp || !camp.pendingHexEdits) return null;
    return camp.pendingHexEdits[String(hexKey || '')] || null;
}
function pendingHexEditDraftActive(hexKey) { return !!pendingHexEditDraft(hexKey); }
function clearPendingHexEditDraft(hexKey) {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    if (!camp || !camp.pendingHexEdits) return;
    delete camp.pendingHexEdits[String(hexKey || '')];
}
// ⚠️ v13.106 (п.12): снять ВСЕ отметки черновика (кнопка в редакторе).
//    Сам приказ при этом не отменяется — отменить его можно в журнале
//    приказов; после выполнения приказа без отметок правок не будет.
function cancelPendingHexEditDraftUI() {
    const st = hexEditorState;
    if (!st) return false;
    const draft = pendingHexEditDraft(st.hexKey);
    if (!draft || !draft.cells || !Object.keys(draft.cells).length) return false;
    Object.keys(draft.cells).forEach(cell => {
        const working = appData.map.grid[cell];
        const baseCell = st.baseGrid[cell];
        if (working) {
            working.type = baseCell ? baseCell.type : 'grass';
            working.variant = (baseCell && Number.isFinite(baseCell.variant)) ? baseCell.variant : 0;
            working.rotation = normalizeHexRotation(baseCell ? baseCell.rotation : undefined, 0);
            if (baseCell && Number.isFinite(baseCell.level)) working.level = baseCell.level;
            delete working.ov;
        }
    });
    const n = Object.keys(draft.cells).length;
    clearPendingHexEditDraft(st.hexKey);
    const infoBox = document.getElementById('mapInfo');
    if (infoBox) { infoBox.textContent = `↩️ Черновик снят: снято отметок ${n}. Сам приказ можно отменить в журнале приказов.`; infoBox.style.color = '#f1c40f'; }
    try { saveData(); } catch (e) {}
    showHexEditorBanner();
    try { redrawMap(); } catch (e) {}
    return true;
}
// Клик в редакторе по черновику: отметку запоминаем, карту не меняем и правки не тратим
function recordPendingHexEditClick(st, cell) {
    const infoBox = document.getElementById('mapInfo');
    const readable = t => (t === 'grass' ? 'трава' : t === 'fallen_forest' ? 'поваленный лес' : 'окоп');
    const draft = pendingHexEditDraft(st.hexKey);
    if (!draft) return false;
    if (!draft.variants || typeof draft.variants !== 'object') draft.variants = {};
    if (!draft.rotations || typeof draft.rotations !== 'object') draft.rotations = {};
    const showInfo = (html, color) => { if (infoBox) { infoBox.innerHTML = html; infoBox.style.color = color; } };
    const baseCell = st.baseGrid[cell];
    const baseType = baseCell ? baseCell.type : 'grass';
    const working = appData.map.grid[cell];
    if (!working) { showInfo('⚠️ Гекс ' + cell + ' вне карты этого гекса.', '#e67e22'); return true; }
    const trenchData = (typeof TERRAIN_DATA !== 'undefined') ? TERRAIN_DATA.trenches : null;
    const nTrenchTextures = (trenchData && Array.isArray(trenchData.images) && trenchData.images.length) ? trenchData.images.length : 1;
    const trenchCount = () => Object.keys(draft.cells).filter(k => draft.cells[k] === 'trenches').length;
    // ⚡ v13.105 (п.2): окоп уже в черновике — клик листает его текстуры без расхода правок;
    //    после последней текстуры следующий клик снимает окоп.
    if (draft.cells[cell]) {
        if (st.kind === 'trenches' && draft.cells[cell] === 'trenches') {
            const cur = Number.isFinite(draft.variants[cell]) ? draft.variants[cell] : (Number(working.variant) || 0);
            if (cur + 1 < nTrenchTextures) {
                draft.variants[cell] = cur + 1;
                working.variant = cur + 1;
                working.type = 'trenches';
                working.ov = 1;
                showInfo(`📝 Черновик: окоп на гексе ${cell} — текстура ${cur + 2}/${nTrenchTextures}. Правки не потрачены.`, '#f1c40f');
                try { saveData(); } catch (e) {}
                try { redrawMap(); } catch (e) {}
                return true;
            }
        }
        delete draft.cells[cell];
        delete draft.variants[cell];
        delete draft.rotations[cell];
        working.type = baseType;
        working.variant = baseCell && Number.isFinite(baseCell.variant) ? baseCell.variant : 0;
        if (baseCell && Number.isFinite(baseCell.level)) working.level = baseCell.level;
        showInfo(`↩️ Черновик: гекс ${cell} — отметка снята. Отметок: ${Object.keys(draft.cells).length}.`, '#f1c40f');
        try { saveData(); } catch (e) {}
        try { redrawMap(); } catch (e) {}
        return true;
    }
    if (!st.rule.allowed(baseType)) {
        showInfo(`❌ Гекс ${cell} (${baseType}) менять нельзя.` +
            (st.kind === 'trenches' ? ' Окоп ставится только на «траву» и «дорогу».' : ' Менять можно только «лес» и «кусты».'), '#e74c3c');
        return true;
    }
    if (st.kind === 'trenches') {
        const limit = draft.limit || trenchLimitForDraftUnit(draft.unitName);
        if (trenchCount() >= limit) {
            showInfo(`⛔ Лимит окопов по приказу: ${limit} (по одному на каждый отряд, который окапывается). Снимите лишний окоп, чтобы поставить новый.`, '#e74c3c');
            return true;
        }
    }
    const newType = (st.kind === 'trenches') ? 'trenches' : (isForestHexType(baseType) ? 'fallen_forest' : 'grass');
    // Окоп начинается с первой текстуры окопа; вырубка леса/кустов — фиксированная текстура.
    const FIXED_VARIANT_FILES = { fallen_forest: 'images/лес поваленный1.png', grass: 'images/трава1.png' };
    const tData = (typeof TERRAIN_DATA !== 'undefined') ? TERRAIN_DATA[newType] : null;
    const fixedFile = st.kind === 'trenches' ? null : FIXED_VARIANT_FILES[newType];
    const fixedIndex = (fixedFile && tData && Array.isArray(tData.images)) ? tData.images.indexOf(fixedFile) : -1;
    const variant = fixedIndex >= 0 ? fixedIndex : 0;
    draft.cells[cell] = newType;
    draft.variants[cell] = variant;
    // ⚡ v13.105 (п.2): поворот клетки, заданный при создании карты, запоминается в черновике
    draft.rotations[cell] = normalizeHexRotation(working.rotation, 0);
    working.type = newType;
    working.variant = variant;
    working.ov = 1;
    const count = Object.keys(draft.cells).length;
    showInfo(`📝 Черновик: гекс ${cell}: ${readable(baseType)} → ${readable(newType)}. Отметок: ${count}` +
        (st.kind === 'trenches' ? ` (окопов ${trenchCount()} из ${draft.limit || trenchLimitForDraftUnit(draft.unitName)})` : '') + '. ' +
        `На карте появятся после выполнения приказа (${draft.kind === 'prep' ? 'расчистка местности' : 'окапывание'}).`, '#f1c40f');
    try { saveData(); } catch (e) {}
    try { redrawMap(); } catch (e) {}
    return true;
}
// Приказ выполнен — переносим черновик на карту гекса (правки уже оплачены приказом)
function applyPendingHexEdits(hexKey, kind) {
    const draft = pendingHexEditDraft(hexKey);
    if (!draft) return 0;
    const cells = Object.keys(draft.cells || {});
    if (!cells.length) { clearPendingHexEditDraft(hexKey); return 0; }
    const ov = getHexOverlay(String(hexKey), true);
    if (!ov.hexEdits || typeof ov.hexEdits !== 'object') ov.hexEdits = {};
    if (!ov.hexVariants || typeof ov.hexVariants !== 'object') ov.hexVariants = {};
    if (!ov.hexEditSources || typeof ov.hexEditSources !== 'object') ov.hexEditSources = {};
    const FIXED_VARIANT_FILES = { fallen_forest: 'images/лес поваленный1.png', grass: 'images/трава1.png' };
    cells.forEach(cell => {
        const newType = draft.cells[cell];
        ov.hexEdits[cell] = newType;
        ov.hexEditSources[cell] = draft.kind === 'prep' ? 'prep' : 'trenches';
        const tData = (typeof TERRAIN_DATA !== 'undefined') ? TERRAIN_DATA[newType] : null;
        const fixedFile = draft.kind === 'prep' ? FIXED_VARIANT_FILES[newType] : null;
        const fixedIndex = (fixedFile && tData && Array.isArray(tData.images)) ? tData.images.indexOf(fixedFile) : -1;
        // ⚡ v13.105 (п.2): текстура окопа — та, что выбрана при планировании
        ov.hexVariants[cell] = (Number.isFinite(draft.variants && draft.variants[cell])) ? draft.variants[cell] : (fixedIndex >= 0 ? fixedIndex : 0);
        if (draft.rotations && draft.rotations[cell] !== undefined) {
            if (!ov.hexRotations || typeof ov.hexRotations !== 'object') ov.hexRotations = {};
            ov.hexRotations[cell] = normalizeHexRotation(draft.rotations[cell], 0);
        }
        if (newType === 'trenches') {
            if (!ov.hexEditOwners || typeof ov.hexEditOwners !== 'object') ov.hexEditOwners = {};
            const ownerFaction = (appData.campaign && appData.campaign.playerFaction) || null;
            if (ownerFaction) ov.hexEditOwners[cell] = ownerFaction;
        }
        if (appData.map && appData.map.grid && appData.map.grid[cell]) {
            appData.map.grid[cell].type = newType;
            appData.map.grid[cell].variant = ov.hexVariants[cell];
            if (ov.hexRotations && ov.hexRotations[cell] !== undefined) appData.map.grid[cell].rotation = ov.hexRotations[cell];
            appData.map.grid[cell].ov = 1;
        }
    });
    ov.placedByMe = true;
    saveHexOverlays(String(hexKey));
    clearPendingHexEditDraft(hexKey);
    log(`✅ Подготовка гекса (${hexKey}) применена: изменено клеток ${cells.length} (приказ выполнен).`);
    try { if (typeof window !== 'undefined' && typeof window.toast === 'function') window.toast(`✅ Гекс (${hexKey}): изменения применены на карте`, 'success'); } catch (e) {}
    return cells.length;
}
function hexEditClick(hexKeyCell) {
    const st = hexEditorState;
    if (!st) return false;
    // ⚡ v13.099 (п.6): правки приказа, который ещё не выполнен, идут в черновик
    if (st.draftMode) return recordPendingHexEditClick(st, hexKeyCell);
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
    if (st.kind === 'initialFortification') {
        if (st.dotSectorPickCrew !== null && st.dotSectorPickCrew !== undefined) return applyInitialDotSectorPick(st, hexKeyCell);
        return initialFortificationEditClick(st, hexKeyCell, baseCell, working);
    }
    if (st.kind === 'fireField') return fireFieldEditClick(st, hexKeyCell);

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
    if (!ov.hexEditSources || typeof ov.hexEditSources !== 'object') ov.hexEditSources = {};
    ov.hexEditSources[hexKeyCell] = st.kind;
    if (newType === 'trenches') {
        if (!ov.hexEditOwners || typeof ov.hexEditOwners !== 'object') ov.hexEditOwners = {};
        const ownerFaction = st.ownerFaction || (appData.campaign && appData.campaign.playerFaction);
        if (ownerFaction) ov.hexEditOwners[hexKeyCell] = ownerFaction;
    }
    const tData = (typeof TERRAIN_DATA !== 'undefined') ? TERRAIN_DATA[newType] : null;
    const nVar = (tData && tData.images && tData.images.length) ? tData.images.length : 1;
    // ⚡ v13.087: вырубка леса → «лес поваленный1», вырубка кустов → «трава1».
    //    Текстура фиксирована (не случайна), чтобы результат был предсказуем.
    const FIXED_VARIANT_FILES = { fallen_forest: 'images/лес поваленный1.png', grass: 'images/трава1.png' };
    const fixedFile = st.kind === 'trenches' ? null : FIXED_VARIANT_FILES[newType];
    const fixedIndex = (fixedFile && tData && Array.isArray(tData.images)) ? tData.images.indexOf(fixedFile) : -1;
    // Для окопа начинаем с первой текстуры: дальнейшие клики идут циклом, как в редакторе.
    const variant = st.kind === 'trenches' ? 0
        : (fixedIndex >= 0 ? fixedIndex : ((nVar > 1) ? Math.floor(Math.random() * nVar) : 0));
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
    if (!st) return;
    // ⚠️ v13.106 (п.12): в режиме черновика (приказ «окопаться»/
    //    «расчистить местность») правки лежат в черновике, а не в
    //    оверлее — раньше кнопка молча ничего не делала (st.undo пуста).
    const draft = pendingHexEditDraft(st.hexKey);
    if (draft && draft.cells && Object.keys(draft.cells).length) {
        const lastKey = Object.keys(draft.cells).pop();
        delete draft.cells[lastKey];
        if (draft.variants) delete draft.variants[lastKey];
        if (draft.rotations) delete draft.rotations[lastKey];
        const working = appData.map.grid[lastKey];
        const baseCell = st.baseGrid[lastKey];
        if (working) {
            working.type = baseCell ? baseCell.type : 'grass';
            working.variant = (baseCell && Number.isFinite(baseCell.variant)) ? baseCell.variant : 0;
            working.rotation = normalizeHexRotation(baseCell ? baseCell.rotation : undefined, 0);
            if (baseCell && Number.isFinite(baseCell.level)) working.level = baseCell.level;
            delete working.ov;
        }
        const infoBox = document.getElementById('mapInfo');
        if (infoBox) { infoBox.textContent = `↩️ Черновик: последняя отметка (${lastKey}) снята. Отметок: ${Object.keys(draft.cells).length}.`; infoBox.style.color = '#f1c40f'; }
        try { saveData(); } catch (e) {}
        showHexEditorBanner();
        try { redrawMap(); } catch (e) {}
        return;
    }
    if (!st.undo || st.undo.length === 0) return;
    if (st.kind === 'fireField') {
        const ov = getHexOverlay(st.hexKey, true);
        const fire = ov.fireField;
        if (!fire || !['draft', 'armed'].includes(fire.state)) return;
        fire.cells = st.undo.pop().slice(0, 3).map(String);
        fire.state = fire.cells.length === 3 ? 'armed' : 'draft';
        st.placed = fire.cells.length;
        const owner = typeof getOpUnitByName === 'function' ? getOpUnitByName(fire.ownerUnitName) : null;
        if (owner) owner.fireFieldOrderState = fire.state;
        saveHexOverlays(st.hexKey);
        try { if (appData.map && appData.map.grid) applyHexOverlays(appData.map.grid, st.hexKey); } catch (e) {}
        const infoBox = document.getElementById('mapInfo');
        if (infoBox) { infoBox.textContent = `Выбор восстановлен: ${fire.cells.length}/3 клеток.`; infoBox.style.color = '#f1c40f'; }
        showHexEditorBanner();
        try { redrawMap(); } catch (e) {}
        return;
    }
    const k = st.undo.pop();
    const ov = getHexOverlay(st.hexKey, true);
    if (k in ov.hexEdits) {
        delete ov.hexEdits[k];
        if (ov.hexVariants) delete ov.hexVariants[k];
        if (ov.hexRotations) delete ov.hexRotations[k];
        if (ov.hexEditSources) delete ov.hexEditSources[k];
        if (ov.hexEditOwners) delete ov.hexEditOwners[k];
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
    // ⚡ v13.099 (п.23): миникарта кампании перестаёт подсвечивать закрытый гекс
    try { if (typeof renderCampaignMiniMap === 'function') renderCampaignMiniMap(); } catch (e) {}
    const banner = document.getElementById('hexEditorBanner');
    if (banner) banner.style.display = 'none';
    const battleRoot = document.getElementById('battleApp');
    if (battleRoot && battleRoot.classList && typeof battleRoot.classList.remove === 'function') battleRoot.classList.remove('hex-editor-mode');
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
        // ⚡ v13.092 (п.2): гексы ДОТов заданы стартовыми позициями, поэтому
        //    просто проходим все карты по очереди (даже если ДОТы уже стояли —
        //    клетку можно заменить), а выбор гексов игроку больше не нужен.
        if (setup.nextIndex < total) {
            setup.phase = 'edit';
            setup.complete = false;
            appData.campaign.initialFortificationHexes = (setup.hexKeys || []).slice();
            renderInitialFortificationStatus();
            saveData();
            const nextKey = setup.hexKeys[setup.nextIndex];
            if (nextKey) setTimeout(() => openHexEditorForBattle(nextKey, 'initialFortification'), 0);
            return;
        }
        if (!doneAll) {
            // остались ДОТы без клетки — открываем карту их гекса заново
            setup.phase = 'edit';
            setup.complete = false;
            setup.nextIndex = initialDotFirstUnfixedIndex(setup.hexKeys);
            appData.campaign.initialFortificationHexes = (setup.hexKeys || []).slice();
            renderInitialFortificationStatus();
            const miIncomplete = document.getElementById('mapInfo');
            if (miIncomplete) {
                const left = initialDotCandidates().filter(x => !(x.squad && x.squad.fixedTacticalPosition)).map(x => x.squad.name || x.unit.name);
                miIncomplete.innerHTML = `⚠️ Не закреплены ДОТы: ${left.join(', ')}. Открываем карту их гекса — укажите клетку для ДОТа.`;
                miIncomplete.style.color = '#e67e22';
            }
            saveData();
            const nextKey = setup.hexKeys[setup.nextIndex];
            if (nextKey) setTimeout(() => openHexEditorForBattle(nextKey, 'initialFortification'), 0);
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
        logOperationalFortificationActivity(unit, `❌ ${unit.name} вступил в тактический бой! Подготовка позиций прервана.`);
        return;
    }
    if (unit.isDestroyed) {
        order.status = 'cancelled';
        logOperationalFortificationActivity(unit, `❌ ${unit.name} уничтожен!`);
        return;
    }

    // ЕСЛИ ЕСТЬ ЦЕЛЕВОЙ ГЕКС И ЮНИТ НЕ ТАМ — ДВИГАЕМСЯ ПОШАГОВО
    if (order.targetHex) {
        const [targetCol, targetRow] = order.targetHex.split(',').map(Number);
        if (unit.col !== targetCol || unit.row !== targetRow) {
            const result = stepUnitTowardTarget(unit, targetCol, targetRow);
            if (result === 'no_route') {
                order.status = 'cancelled';
                logOperationalFortificationActivity(unit, `❌ ${unit.name} не может достичь гекса (${targetCol},${targetRow}) для подготовки позиций. Приказ отменён.`);
                saveData();
                redrawOperationalMap();
                return;
            }
            if (result === 'battle') {
                logOperationalFortificationActivity(unit, `⚔️ ${unit.name} вступил в бой на пути к позициям. Продолжение в следующем ходу.`);
                saveData();
                redrawOperationalMap();
                return;
            }
            if (result !== 'reached') {
                logOperationalFortificationActivity(unit, `⏳ ${unit.name} выдвигается на гекс (${targetCol},${targetRow}) для подготовки позиций. Осталось ОД: ${unit.ap}.`);
                saveData();
                redrawOperationalMap();
                return;
            }
            logOperationalFortificationActivity(unit, `🚶 ${unit.name} выдвинулся на гекс (${unit.col},${unit.row}) для подготовки позиций.`);
        }
    }
    if (order.originalHex && order.originalHex !== `${unit.col},${unit.row}`) {
        order.status = 'cancelled';
        logOperationalFortificationActivity(unit, `❌ ${unit.name} покинул гекс подготовки позиций. Приказ отменён.`);
        saveData();
        redrawOperationalMap();
        return;
    }
    if (unit.ap <= 0) {
        logOperationalFortificationActivity(unit, `⏳ ${unit.name} не хватает ОД для подготовки позиций. Ожидание следующего хода.`);
        return;
    }

    if (!order.digProgress) order.digProgress = 0;
    unit.ap = 0;
    order.digProgress++;
    logOperationalFortificationActivity(unit, `🪓 ${unit.name} готовит позиции (валят лес, вырубают кусты)... Прогресс: ${order.digProgress}/3`);

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
                if (typeof markOperationalMarkerOwner === 'function') markOperationalMarkerOwner(hexKey, 'prep_positions', unit);
                else if (!appData.campaign.opMapGrid[hexKey].markers.includes('prep_positions')) {
                    appData.campaign.opMapGrid[hexKey].markers.push('prep_positions');
                }
            }
        } catch (e) {}
        order.status = 'completed';
        logOperationalFortificationActivity(unit, `✅ ${unit.name} завершил подготовку позиций на гексе (${unit.col},${unit.row})!`);
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
        if (!e.detected) return;
        if (attackType === 'smallArms' && currentSquad.armor && appData.map.selectedVehicleFireWeaponKey &&
            typeof tacticalVehicleWeaponCanTarget === 'function') {
            const selectedCrew = (currentSquad.crewInstances || []).find(ci => ci && ci.uniqueKey === appData.map.selectedVehicleFireWeaponKey);
            const weapon = selectedCrew && (getFactionCrewWeapons(currentSquad.faction) || []).find(w => w && w.name === selectedCrew.weaponName);
            if (weapon && !tacticalVehicleWeaponCanTarget(currentSquad, weapon.name, weapon.type, pos.key)) return;
        }
        if (attackType !== 'melee' && typeof tacticalSmokeBlocksAttack === 'function' && tacticalSmokeBlocksAttack(shooterIdx, idx)) return;
        if (attackType === 'ordnance' && /ДОТ/i.test(String(currentSquad.name || '')) &&
            typeof tacticalDotHasConfiguredSectors === 'function' && tacticalDotHasConfiguredSectors(currentSquad)) {
            const weapons = (typeof getFactionCrewWeapons === 'function') ? getFactionCrewWeapons(currentSquad.faction) || [] : [];
            const crewIndices = (currentSquad.crewInstances || []).map((ci, crewIndex) => ({ ci, crewIndex }))
                .filter(({ ci }) => {
                    if (!ci || ci.active === false || ci.status === 'destroyed' || ci.status === 'blinded') return false;
                    const weapon = weapons.find(w => w.name === ci.weaponName);
                    return weapon && ['at_gun', 'mortar', 'tank_gun'].includes(weapon.type);
                }).map(item => item.crewIndex);
            if (crewIndices.length && !tacticalDotCanFireAtTarget(shooterIdx, idx, crewIndices)) return;
        }
        html += `<option value="${idx}" data-dist="${d}" data-cover="${cov ? cov.mod : 0}">${e.name} @ ${pos.key} — ${d} гекс(ов)` +
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
function initialDotSectorCrewEntries(candidate) {
    if (!candidate || !candidate.squad || !Array.isArray(candidate.squad.crewInstances)) return [];
    let weapons = [];
    try { weapons = (typeof getFactionCrewWeapons === 'function') ? getFactionCrewWeapons(candidate.squad.faction) || [] : []; } catch (e) {}
    return candidate.squad.crewInstances.map((crew, index) => {
        const weapon = weapons.find(item => item && crew && item.name === crew.weaponName);
        return { crew, index, weapon };
    }).filter(item => item.weapon && ['at_gun', 'tank_gun', 'mg'].includes(item.weapon.type));
}
// Цвет совпадает с легендой у соответствующего орудия/амбразуры.
function initialDotSectorColor(crewIndex) {
    const colors = ['#f1c40f', '#33d6ff', '#ff5c8a', '#b36bff', '#65d46e'];
    return colors[Number(crewIndex) % colors.length] || colors[0];
}

// Отдельный верхний слой: рисуется ПОСЛЕ всех клеток карты. Короткий веер
// внутри drawHex закрывался иконкой ДОТа, а длинные линии — соседними клетками.
function drawInitialDotSectorOverlay(ctx, size) {
    const st = hexEditorState;
    const map = appData.map;
    if (!st || st.kind !== 'initialFortification' || !map || map.mode !== 'hexEdit') return;
    const candidate = initialDotCandidates().find(item => item.id === st.dotId);
    const pos = candidate && candidate.squad.fixedTacticalPosition;
    if (!pos || String(pos.hexKey) !== String(st.hexKey)) return;
    const centers = map.centers || [];
    const origin = centers.find(center => String(center.key) === String(pos.key));
    if (!origin) return;
    const sectors = st.dotSectorCandidateId === st.dotId && st.dotWeaponSectors
        ? st.dotWeaponSectors : pos.weaponSectors || {};
    const activeCrew = st.dotSectorPickCrew != null ? st.dotSectorPickCrew : st.dotSectorHighlightCrew;
    const entries = initialDotSectorCrewEntries(candidate);
    // Активный сектор рисуем последним, чтобы он оставался виден при перекрытии.
    entries.sort((a, b) => Number(a.index === activeCrew) - Number(b.index === activeCrew));
    const reach = centers.reduce((max, center) => Math.max(max,
        Math.hypot(center.x - origin.x, center.y - origin.y) + size), size);

    entries.forEach(({ index }) => {
        const sectorId = sectors[String(index)] || 'e';
        const direction = TACTICAL_FIRE_SECTOR_OPTIONS.find(option => option.id === sectorId);
        if (!direction) return;
        const widthDeg = dotSectorWidthDeg(candidate.squad, index);
        const active = index === activeCrew;
        const color = initialDotSectorColor(index);
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = active ? 0.26 : activeCrew != null ? 0.045 : 0.13;
        centers.forEach(center => {
            // Точно та же геометрия, что у проверки допустимой цели для оружия.
            if (!tacticalHexInFireSector(pos.key, center.key, sectorId, widthDeg)) return;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (60 * i - 30) * Math.PI / 180;
                const x = center.x + Math.cos(angle) * size * 0.94;
                const y = center.y + Math.sin(angle) * size * 0.94;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
        });
        ctx.globalAlpha = active || activeCrew == null ? 0.95 : 0.35;
        ctx.strokeStyle = color;
        ctx.lineWidth = active ? 3.5 : 2;
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        if (widthDeg < 360) {
            const vector = _cubeToPixel2D(direction.cube);
            const angle = Math.atan2(vector.y, vector.x);
            const half = widthDeg * Math.PI / 360;
            ctx.setLineDash([10, 6]);
            [-half, half].forEach(offset => {
                ctx.beginPath();
                // Не закрываем иконку: линии начинаются на краю клетки ДОТа.
                ctx.moveTo(origin.x + Math.cos(angle + offset) * size * 0.65,
                    origin.y + Math.sin(angle + offset) * size * 0.65);
                ctx.lineTo(origin.x + Math.cos(angle + offset) * reach,
                    origin.y + Math.sin(angle + offset) * reach);
                ctx.stroke();
            });
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(origin.x + Math.cos(angle) * size * 0.65,
                origin.y + Math.sin(angle) * size * 0.65);
            ctx.lineTo(origin.x + Math.cos(angle) * reach, origin.y + Math.sin(angle) * reach);
            ctx.stroke();
        } else {
            // Круговой сектор не имеет направления: вся карта уже подсвечена.
            ctx.beginPath();
            ctx.arc(origin.x, origin.y, size * 0.65, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    });
}

function setInitialDotCandidate(candidateId) {
    const st = hexEditorState;
    if (!st || st.kind !== 'initialFortification') return;
    st.dotId = String(candidateId || '');
    st.dotSectorPickCrew = null;
    st.dotSectorHighlightCrew = null;
    const candidate = initialDotCandidates().find(item => item.id === st.dotId);
    st.dotSectorCandidateId = st.dotId;
    st.dotWeaponSectors = Object.assign({}, (candidate && candidate.squad.fixedTacticalPosition &&
        candidate.squad.fixedTacticalPosition.weaponSectors) || {});
    showHexEditorBanner();
    try { redrawMap(); } catch (e) {}
}
function setInitialDotWeaponSector(crewIndex, sectorId) {
    const st = hexEditorState;
    if (!st || st.kind !== 'initialFortification') return;
    if (!st.dotWeaponSectors || st.dotSectorCandidateId !== st.dotId) setInitialDotCandidate(st.dotId);
    if (!TACTICAL_FIRE_SECTOR_OPTIONS.some(option => option.id === sectorId)) return;
    st.dotWeaponSectors[String(crewIndex)] = sectorId;
    st.dotSectorHighlightCrew = crewIndex;
    st.dotSectorCandidateId = st.dotId;
    persistInitialDotSectors(st);
    showHexEditorBanner();
    try { redrawMap(); } catch (e) {}
}
// ⚡ v13.094 (п.3): сектор амбразуры задаётся КЛИКОМ по клетке карты: линия от
//    клетки ДОТа к кликнутой клетке = ось сектора (ширина — по типу оружия).
function tacticalSectorIdBetween(fromKey, toKey) {
    const from = String(fromKey || '').split(',').map(Number);
    const to = String(toKey || '').split(',').map(Number);
    if (from.length !== 2 || to.length !== 2 || !from.every(Number.isFinite) || !to.every(Number.isFinite)) return null;
    if (from[0] === to[0] && from[1] === to[1]) return null;
    const a = _hexCubeCoords(from[0], from[1]), b = _hexCubeCoords(to[0], to[1]);
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    let best = null, bestDot = -Infinity;
    TACTICAL_FIRE_SECTOR_OPTIONS.forEach(option => {
        const v = option.cube;
        const dot = d.x * v.x + d.y * v.y + d.z * v.z;
        if (dot > bestDot) { bestDot = dot; best = option.id; }
    });
    return best;
}
function setInitialDotSectorPick(crewIndex) {
    const st = hexEditorState;
    if (!st || st.kind !== 'initialFortification') return;
    st.dotSectorPickCrew = (st.dotSectorPickCrew === crewIndex) ? null : crewIndex;
    st.dotSectorHighlightCrew = crewIndex;
    showHexEditorBanner();
    try { redrawMap(); } catch (e) {}
}
function persistInitialDotSectors(st) {
    const candidate = initialDotCandidates().find(item => item.id === st.dotId);
    if (!candidate || !candidate.squad.fixedTacticalPosition) return false;
    if (String(candidate.squad.fixedTacticalPosition.hexKey) !== String(st.hexKey)) return false;
    candidate.squad.fixedTacticalPosition.weaponSectors = Object.assign({}, st.dotWeaponSectors || {});
    saveHexOverlays(st.hexKey);
    return true;
}
function applyInitialDotSectorPick(st, cellKey) {
    const candidate = initialDotCandidates().find(item => item.id === st.dotId);
    const infoBox = document.getElementById('mapInfo');
    const pos = candidate && candidate.squad.fixedTacticalPosition;
    if (!candidate || !pos || String(pos.hexKey) !== String(st.hexKey)) {
        if (infoBox) { infoBox.innerHTML = '⛔ Сначала поставьте ДОТ на клетку этой карты, затем указывайте сектора амбразур.'; infoBox.style.color = '#e74c3c'; }
        st.dotSectorPickCrew = null;
        showHexEditorBanner();
        return true;
    }
    const sectorId = tacticalSectorIdBetween(pos.key, cellKey);
    if (!sectorId) {
        if (infoBox) { infoBox.innerHTML = '⛔ Кликните по другой клетке — направление сектора задаётся от клетки ДОТа к кликнутой.'; infoBox.style.color = '#e74c3c'; }
        return true;
    }
    if (!st.dotWeaponSectors || st.dotSectorCandidateId !== st.dotId) setInitialDotCandidate(st.dotId);
    st.dotWeaponSectors[String(st.dotSectorPickCrew)] = sectorId;
    st.dotSectorHighlightCrew = st.dotSectorPickCrew;
    st.dotSectorCandidateId = st.dotId;
    persistInitialDotSectors(st);
    const label = (TACTICAL_FIRE_SECTOR_OPTIONS.find(o => o.id === sectorId) || {}).label || sectorId;
    if (infoBox) { infoBox.innerHTML = `🎯 Сектор амбразуры: линия от ДОТа (${pos.key}) к клетке ${cellKey} — ${label}. Линии сектора нарисованы на карте.`; infoBox.style.color = '#27ae60'; }
    st.dotSectorPickCrew = null;
    showHexEditorBanner();
    try { redrawMap(); } catch (e) {}
    return true;
}
function initialDotSectorControls(st) {
    const candidate = initialDotCandidates().find(item => item.id === st.dotId);
    const entries = initialDotSectorCrewEntries(candidate);
    if (!entries.length) return '<div style="color:#888; font-size:.8rem;">Для этого ДОТа не заданы отдельные орудийные/пулемётные расчёты.</div>';
    if (!st.dotWeaponSectors || st.dotSectorCandidateId !== st.dotId) {
        st.dotWeaponSectors = Object.assign({}, (candidate.squad.fixedTacticalPosition &&
            candidate.squad.fixedTacticalPosition.weaponSectors) || {});
        st.dotSectorCandidateId = st.dotId;
    }
    const counters = { mg: 0, gun: 0 };
    return '<div style="display:flex; flex-wrap:wrap; gap:8px; margin:6px 0; align-items:center;">' +
        entries.map(({ crew, index, weapon }) => {
            const isMg = weapon.type === 'mg';
            const label = isMg ? `Амбразура ${++counters.mg}` : `Орудие ${++counters.gun}`;
            const value = st.dotWeaponSectors[String(index)] || 'e';
            const options = TACTICAL_FIRE_SECTOR_OPTIONS.map(option =>
                `<option value="${option.id}" ${option.id === value ? 'selected' : ''}>${option.label}</option>`).join('');
            const picking = st.dotSectorPickCrew === index;
            const widthDeg = dotSectorWidthDeg(candidate.squad, index);
            const color = initialDotSectorColor(index);
            return `<label style="color:#ddd; font-size:.82rem; border-left:4px solid ${color}; padding-left:6px;">${label} — ${String(weapon.name || crew.weaponName)} (сектор ${widthDeg >= 360 ? '360° — круговой' : widthDeg + '°'}): ` +
                `<select onchange="setInitialDotWeaponSector(${index},this.value)">${options}</select> ` +
                `<button type="button" onclick="setInitialDotSectorPick(${index})" style="${picking ? 'background:#e67e22;' : 'background:#2980b9;'} font-size:.78rem;">${picking ? '🎯 Кликните клетку направления…' : '🎯 Указать на карте'}</button></label>`;
        }).join('') + '</div><div style="color:#888; font-size:.78rem;">У каждого расчёта свой сектор: Van Hees — ПТ-орудие 360° (круговой), пулемёт 90°; Bosh — пулемёты по 60°, орудие 90°. Цвет каждой амбразуры совпадает с подсветкой на карте; выбранная амбразура выделяется ярче. Подсветка показывает направление и ширину сектора в радиусе обстрела ДОТа — 3 гекса (дальше ДОТ не стреляет). Секторы могут перекрываться. Цель вне сектора для этого оружия недоступна — и в тактическом бою, и на оперативной карте. «🎯 Указать на карте» — затем кликните клетку, куда смотрит амбразура: линии сектора появятся на карте от клетки ДОТа.</div>';
}
function initialDotSelector(st) {
    const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const candidates = initialDotCandidates();
    if (!candidates.length) return '<span>В батальоне нет доступных ДОТов.</span>';
    if (!candidates.some(x => x.id === st.dotId)) st.dotId = initialDotIdForHex(st.hexKey) || candidates[0].id;
    return '<label>ДОТ: <select onchange="setInitialDotCandidate(this.value)">' + candidates.map(x => {
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
    const weaponSectors = Object.assign({}, (st.dotSectorCandidateId === st.dotId && st.dotWeaponSectors) ||
        (old && old.weaponSectors) || {});
    initialDotSectorCrewEntries(candidate).forEach(({ index }) => {
        if (!TACTICAL_FIRE_SECTOR_OPTIONS.some(option => option.id === weaponSectors[String(index)])) {
            weaponSectors[String(index)] = 'e';
        }
    });
    // ⚡ v13.066: ДОТы одного юнита (например «ДОТ Bosh» и «ДОТ Van Hees»)
    //    МОГУТ стоять на разных оперативных гексах — игрок выбирает по гексу
    //    на каждый ДОТ. На оперативной карте юнит остаётся на первом гексе,
    //    а в бой на втором гексе он попадает по позиции своего ДОТа.
    const fixedPosition = { hexKey: st.hexKey, key };
    if (Object.keys(weaponSectors).length) fixedPosition.weaponSectors = weaponSectors;
    squad.fixedTacticalPosition = fixedPosition;
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
function supplyPointOriginStateKey(side) {
    return side === 'enemy' ? 'supplyPointOriginsEnemy' : 'supplyPointOriginsPlayer';
}
// Пересчёт меток пунктов боепитания на карте: mapLike — appData.map или
// battle.tacticalMap; squads — отряды стороны; field — 'squadIds' | 'enemySquadIds'.
// Метка закрепляется в гексе, где штаб впервые появился в этом бою, а не следует
// за штабом при его последующем перемещении. Автоматические и ручные метки
// хранятся раздельно, чтобы пересчёт не удалял пользовательскую 📦.
function syncSupplyPointsOnGrid(mapLike, squads, field, side) {
    if (!mapLike || !mapLike.grid || !Array.isArray(squads)) return [];
    const pos = {};
    Object.keys(mapLike.grid).forEach(k => {
        const cell = mapLike.grid[k];
        if (!cell || !Array.isArray(cell[field])) return;
        cell[field].forEach(i => { pos[i] = k; });
    });
    const stateKey = supplyPointStateKey(side);
    const originKey = supplyPointOriginStateKey(side);
    const prev = Array.isArray(mapLike[stateKey]) ? mapLike[stateKey] : [];
    const origins = (mapLike[originKey] && typeof mapLike[originKey] === 'object')
        ? mapLike[originKey] : {};
    let changed = false;
    const wanted = [];
    let hqOrdinal = 0;
    const platoonGroups = new Map();
    squads.forEach((s, i) => {
        if (!s || s.hidden || s.status === 'retreated' || s.isRetreated) return;
        const groupName = String(s.opUnitName || '').trim();
        if (!groupName) return;
        if (!platoonGroups.has(groupName)) platoonGroups.set(groupName, []);
        platoonGroups.get(groupName).push({ squad: s, index: i });
    });
    const fallbackOriginsKey = side === 'enemy' ? 'supplyFallbackOriginsEnemy' : 'supplyFallbackOriginsPlayer';
    const fallbackOrigins = mapLike[fallbackOriginsKey] && typeof mapLike[fallbackOriginsKey] === 'object' ? mapLike[fallbackOriginsKey] : {};
    platoonGroups.forEach((members, groupName) => {
        if (members.some(entry => isPlatoonHQBattleSquad(entry.squad))) return;
        const fallbackId = groupName;
        if (!fallbackOrigins[fallbackId]) {
            const firstPlaced = members.find(entry => pos[entry.index]);
            if (firstPlaced) { fallbackOrigins[fallbackId] = pos[firstPlaced.index]; changed = true; }
        }
        const fallbackKey = fallbackOrigins[fallbackId];
        if (fallbackKey && mapLike.grid[fallbackKey] && wanted.indexOf(fallbackKey) < 0) wanted.push(fallbackKey);
    });
    mapLike[fallbackOriginsKey] = fallbackOrigins;
    squads.forEach((s, i) => {
        if (!isPlatoonHQBattleSquad(s)) return;
        const currentKey = pos[i];
        // Для старых сохранений используем предыдущую автоматически отмеченную
        // клетку как исходную, иначе привязываем пункт при первом размещении.
        if (!origins[i] && currentKey) {
            origins[i] = prev[hqOrdinal] || currentKey;
            changed = true;
        }
        hqOrdinal++;
        if (s.hidden || s.isRetreated || s.status === 'retreated') return;
        const anchor = origins[i] || currentKey;
        const noLivingCrew = !(s.fighters || []).some(f => f && Number(f.hp) > 0);
        const destroyed = !!(s.isDestroyed || s.status === 'destroyed' || noLivingCrew);
        // Пункт снабжения закреплён за местом штаба на начало боя и остаётся
        // действующим даже после уничтожения расчёта/штаба.
        if (destroyed) {
            if (origins[i] && mapLike.grid[origins[i]] && wanted.indexOf(origins[i]) < 0) wanted.push(origins[i]);
            return;
        }
        if (anchor && mapLike.grid[anchor] && wanted.indexOf(anchor) < 0) wanted.push(anchor);
    });
    const otherSideKey = supplyPointStateKey(side === 'enemy' ? 'player' : 'enemy');
    const otherWanted = Array.isArray(mapLike[otherSideKey]) ? mapLike[otherSideKey] : [];
    prev.forEach(k => {
        if (wanted.indexOf(k) >= 0 || otherWanted.indexOf(k) >= 0) return;
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
    mapLike[originKey] = origins;
    if (JSON.stringify(mapLike[stateKey] || []) !== JSON.stringify(wanted)) changed = true;
    mapLike[stateKey] = wanted.slice();
    if (changed && typeof log === 'function') {
        try {
            // ⚡ v13.100 (п.5): место пункта боепитания противника игроку не
            //    сообщаем — иначе скрытая метка всё равно выдаётся журналом.
            if (side === 'enemy') {
                log('📦 Пункт боепитания противника: перемещение штаба учтено (место скрыто до обнаружения).');
            } else {
                log(`📦 Пункт боепитания (наши) — исходный гекс(ы): ${wanted.length ? wanted.join(', ') : 'штаб взвода не размещён'}.`);
            }
        } catch (e) {}
    }
    return wanted;
}
// ⚡ v13.100 (п.5): пункт боепитания ПРОТИВНИКА не показывается игроку, пока его
//    не обнаружат свои подразделения. Свой пункт (и ручные метки 📦) видны всегда;
//    вражеская метка появляется, когда её штаб взвода обнаружен (detected) или
//    гекс вскрыт боем (этот гекс — гекс текущего боя).
function supplyPointOriginKeyForSquad(mapLike, side, index) {
    const originKey = supplyPointOriginStateKey(side);
    const origins = (mapLike && mapLike[originKey] && typeof mapLike[originKey] === 'object') ? mapLike[originKey] : {};
    return origins[index] || null;
}
function supplyPointVisibleToPlayer(mapLike, key) {
    if (!mapLike || !key) return true;
    const enemyKeys = Array.isArray(mapLike.autoSupplyKeysEnemy) ? mapLike.autoSupplyKeysEnemy : [];
    if (enemyKeys.indexOf(String(key)) < 0) return true;   // наш пункт / ручная метка
    const enemySquads = Array.isArray(mapLike.enemySquads) ? mapLike.enemySquads : [];
    const hqAlive = (s) => !!(s && !s.isDestroyed && !s.isRetreated && s.status !== 'retreated' &&
        (s.fighters || []).some(f => f && Number(f.hp) > 0));
    const revealed = enemySquads.some((squad, index) => {
        if (!hqAlive(squad) || !squad.detected) return false;
        if (typeof isPlatoonHQBattleSquad === 'function' && !isPlatoonHQBattleSquad(squad)) return false;
        const origin = supplyPointOriginKeyForSquad(mapLike, 'enemy', index);
        if (origin && String(origin) === String(key)) return true;
        // штаб уже сместился — метка закреплена на исходном гексе
        const pos = (squad.hexPos && squad.hexPos.length === 2) ? `${squad.hexPos[0]},${squad.hexPos[1]}` : null;
        return !!pos && String(pos) === String(key);
    });
    if (revealed) return true;
    try {
        const battle = (typeof appData !== 'undefined' && appData) ? appData.map : null;
        if (battle && battle.hexKey && String(battle.hexKey) === String(key) && appData.currentBattleId) return true;
    } catch (e) {}
    return false;
}
// Метки гекса тактической карты, видимые игроку (с учётом скрытых пунктов боепитания)
function tacticalVisibleMarkers(mapLike, cellKey, markers) {
    const list = Array.isArray(markers) ? markers : [];
    return list.filter(m => !(m === SUPPLY_POINT_MARKER && !supplyPointVisibleToPlayer(mapLike, cellKey)));
}
function activeSupplyPointKeys(mapLike, side) {
    if (!mapLike || !mapLike.grid) return [];
    const stateKey = supplyPointStateKey(side || 'player');
    return (Array.isArray(mapLike[stateKey]) ? mapLike[stateKey] : []).filter(k => {
        const cell = mapLike.grid[k];
        return !!(cell && Array.isArray(cell.markers) && cell.markers.includes(SUPPLY_POINT_MARKER));
    });
}
function nearestSupplyPoint(mapLike, fromKey, side) {
    const from = String(fromKey || '').split(',').map(Number);
    if (from.length !== 2 || !from.every(Number.isFinite)) return null;
    let best = null;
    activeSupplyPointKeys(mapLike, side || 'player').forEach(key => {
        const to = String(key).split(',').map(Number);
        if (to.length !== 2 || !to.every(Number.isFinite)) return;
        const distance = (typeof hexGridDistance === 'function')
            ? hexGridDistance(from[0], from[1], to[0], to[1])
            : Math.max(Math.abs(from[0] - to[0]), Math.abs(from[1] - to[1]));
        if (!best || distance < best.distance) best = { key, distance };
    });
    return best;
}
// Боец идёт пешком к ближайшему пункту и возвращается. Обычная пехота
// проходит до трёх травяных гексов за фазу (6 полу-ОД, по 2 на гекс);
// одна фаза тактики длится 2 минуты.
function estimateAmmoDeliveryTurns(mapLike, fromKey, side) {
    const point = nearestSupplyPoint(mapLike, fromKey, side || 'player');
    if (!point) return null;
    return Math.max(1, Math.ceil((point.distance * 2) / 3));
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
