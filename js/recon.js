// ⚡ BUILD-МАРКЕР: v13.173 — разведывательные миссии и приказ «Наблюдение»
// ═══════════════════════════════════════════════════════════════════════
// ⚡ v13.157: НОВАЯ РАЗВЕДКА (заменяет подсветку радиуса v13.018…v13.099)
//
//   Было: приказ «🔍 Разведка» → юнит ехал к гексу и подсвечивал окружность
//   радиуса 3 (у бронеавтомобиля — 2), зона гасла через ход. Постоянного
//   наблюдения и докладов не было.
//
//   Стало:
//     • РАЗВЕДЫВАТЕЛЬНЫЕ АКТИВЫ (campaign.reconAssets) — мотоциклист-разведчик
//       и мотоциклист-посыльный при штабе взвода BeVe, бронеавтомобили BeVe,
//       развед.взвод A.I.R.F., AL-41 Hidalgo при штабе батальона A.I.R.F.
//     • РАЗВЕДЫВАТЕЛЬНАЯ МИССИЯ (campaign.reconMissions) — маршрут до 8 точек,
//       режим наблюдения (проходить / занять в конце / пауза) и способ доклада
//       (рация / посыльный / вернуться). Актив движется сам, каждый ход
//       наблюдает и докладывает с задержкой.
//     • ПРИКАЗ «👁️ Наблюдение» — доступен ЛЮБОМУ юниту: стоит на месте,
//       каждый ход проверяет радиус 5 с −1 к броску, пул активов не тратит.
//
//   Дальность наблюдения ЕДИНАЯ для всех активов (никакого «бонуса оптики
//   техники» — бинокль есть у всех): 3 гекса в движении, 5 стоя, 8 с холма;
//   наблюдатель в лесу −2, в кустах/камнях −1, дым между наблюдателем и целью
//   — автоматический провал.
// ═══════════════════════════════════════════════════════════════════════

// ---------- Типы активов (см. §2 постановки) ----------
const RECON_ASSET_TYPES = {
    beve_motorcycle_scout: {
        name: 'Мотоциклист-разведчик', faction: 'BeVe', kind: 'motorcycle',
        canRecon: true, icon: 'images/BeVe/разведчик бенилюкс мото1.png',
        // дорога / трава / кусты / лес; НЕ холм, болото, камни
        speed: { road: 4, grass: 2, bushes: 2, forest: 1 }
    },
    beve_motorcycle_messenger: {
        name: 'Мотоциклист-посыльный', faction: 'BeVe', kind: 'motorcycle',
        canRecon: false, isMessenger: true, icon: 'images/BeVe/разведчик бенилюкс мото.png',
        speed: { road: 4, grass: 2, bushes: 2, forest: 1 }
    },
    // ⚡ v13.164: бронеавтомобилям BeVe снова можно отдавать приказ на разведку.
    //    Это по-прежнему ОТДЕЛЬНЫЕ машины поддержки (Landsverk 183 №1–3), а не
    //    отряды при штабе: в миссию уходит сама машина.
    beve_armored_car: {
        name: 'Бронеавтомобиль Landsverk 183', faction: 'BeVe', kind: 'armored_car',
        canRecon: true, icon: 'images/BeVe/БА Landsverk 183 №1.jpg',
        // дорога / трава / кусты; НЕ лес, болото, камни, холм
        speed: { road: 4, grass: 4, bushes: 4 }
    },
    airf_recon_platoon: {
        name: 'Развед. взвод', faction: 'A.I.R.F.', kind: 'foot',
        canRecon: true, icon: 'images/развед аирф.png',
        // любая проходимая местность
        speed: { road: 2, grass: 2, bushes: 2, forest: 2, rocks: 2, hill: 2, craters: 2, trenches: 2, swamp_passable: 2, fallen_forest: 2, shelled_forest: 2 }
    },
    airf_hidalgo: {
        name: 'AL-41 Hidalgo', faction: 'A.I.R.F.', kind: 'light_car',
        canRecon: true, icon: 'images/AIRF/Hidalgo GL-41.png',
        // дорога / трава; НЕ лес, кусты, холм, болото, камни
        speed: { road: 4, grass: 4 }
    }
};

// Единые дальности наблюдения (гексы). Техника НЕ даёт бонуса оптики.
const RECON_RANGE_MOVING = 3;
const RECON_RANGE_STANDING = 5;
const RECON_RANGE_HILL = 8;
// Броски d10: 8+ — обнаружен, 6–7 — «шум», ≤5 — не обнаружен
const RECON_DETECT_THRESHOLD = 8;
const RECON_NOISE_THRESHOLD = 6;
// Сколько «гексов пути» актив проходит за один операционный ход
const RECON_TURN_BUDGET = 4;
// Максимальное число точек маршрута
const RECON_ROUTE_MAX_POINTS = 8;

// Черновик миссии в панели «🔍 Разведка» (см. renderReconPanel)
let reconDraft = null;

// ---------- Базовые помощники ----------
function reconCampaign() {
    const c = (typeof appData !== 'undefined' && appData && appData.campaign) ? appData.campaign : null;
    if (!c) return null;
    if (!c.reconAssets || typeof c.reconAssets !== 'object') c.reconAssets = {};
    if (!Array.isArray(c.reconMissions)) c.reconMissions = [];
    if (!Array.isArray(c.reconPendingReveals)) c.reconPendingReveals = [];
    return c;
}
function reconTurnNumber() {
    const c = reconCampaign();
    return Number((c && c.currentTurn) || (typeof currentTurn === 'number' ? currentTurn : 1)) || 1;
}
function reconKeyOf(hex) {
    if (!hex) return null;
    const col = Number(hex.col), row = Number(hex.row);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    return `${col},${row}`;
}
function reconHexFromKey(key) {
    if (!key) return null;
    const parts = String(key).split(',').map(Number);
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    return { col: parts[0], row: parts[1] };
}
function reconTerrainAt(hex) {
    if (!hex || typeof getOpHexTypes !== 'function') return null;
    const types = getOpHexTypes(Number(hex.col), Number(hex.row)) || [];
    return types.length ? String(types[0]) : null;
}

// ---------- Определение активов в войсках ----------
function reconAssetKeyForSquad(squad) {
    if (!squad) return null;
    const name = String(squad.name || '');
    // ⚡ v13.160: штаб развед. взвода не разведывает сам — он остаётся при управлении,
    //    даже если в шаблоне у него остался reconAssetKey.
    if (/Штаб развед\. взвода/i.test(name)) return null;
    if (squad.reconAssetKey && RECON_ASSET_TYPES[squad.reconAssetKey]) return squad.reconAssetKey;
    if (/Мотоциклист-разведчик/i.test(name)) return 'beve_motorcycle_scout';
    if (/Мотоциклист-посыльный/i.test(name)) return 'beve_motorcycle_messenger';
    if (/AL-41\s*Hidalgo|Hidalgo/i.test(name)) return 'airf_hidalgo';
    // ⚡ v13.160: развед-актив — только боевые развед. отделения; штаб развед.
    //    взвода активом не является (он остаётся при управлении).
    if (/Развед\. отделение/i.test(name)) return 'airf_recon_platoon';
    return null;
}
// Юнит, который сам является активом (бронеавтомобиль, развед.взвод).
function reconStandaloneKeyForUnit(unit) {
    if (!unit) return null;
    if (unit.reconAssetKey && RECON_ASSET_TYPES[unit.reconAssetKey]) return unit.reconAssetKey;
    // ⚡ v13.164: бронеавтомобиль Landsverk 183 — самостоятельный развед-актив BeVe
    //    (отдельная машина поддержки, в миссию уходит она сама).
    //    Слитые группы машин («Отряд Бронеавтомобиль (2шт)») активом не считаем.
    if (unit.isGroup && (Number(unit.groupSize) > 1 || !Array.isArray(unit.vehicleList) || unit.vehicleList.length !== 1 || !unit.vehicleList[0].name)) return null;
    if (Array.isArray(unit.vehicleList) && unit.vehicleList.length > 1) return null;
    const unitName = String(unit.name || '') + ' ' + String((unit.vehicleList && unit.vehicleList[0] && unit.vehicleList[0].name) || '');
    if (/Landsverk|Бронеавтомобил/i.test(unitName)) return 'beve_armored_car';
    // ⚡ v13.160: разделённый развед. взвод — каждое отделение со своим гексом
    //    становится отдельным активом; штаб развед. взвода активом не считается.
    const hasReconSquad = ((unit && unit.squads) || [])
        .some(squad => squad && /Развед\. отделение/i.test(String(squad.name || '')));
    const isReconPlatoon = unit.type === 'recon_platoon' || /^Развед\.?\s*взвод/i.test(String(unit.name || ''));
    if (isReconPlatoon && hasReconSquad) return 'airf_recon_platoon';
    return null;
}
function reconAssetKeyForUnit(unit) {
    const standalone = reconStandaloneKeyForUnit(unit);
    if (standalone) return standalone;
    const squad = ((unit && unit.squads) || []).find(sq => sq && RECON_ASSET_TYPES[reconAssetKeyForSquad(sq)]);
    return squad ? reconAssetKeyForSquad(squad) : null;
}
// Все доступные в войсках активы: [{ assetKey, unitId, squadName, name }]
function reconListAssetSources() {
    const c = reconCampaign();
    if (!c) return [];
    const out = [];
    (c.opUnits || []).forEach((unit, unitId) => {
        if (!unit || unit.isDestroyed) return;
        const standalone = reconStandaloneKeyForUnit(unit);
        if (standalone) {
            out.push({ assetKey: standalone, unitId, squadName: null, name: unit.name || RECON_ASSET_TYPES[standalone].name });
            return;
        }
        (unit.squads || []).forEach(squad => {
            const key = reconAssetKeyForSquad(squad);
            if (!key || !RECON_ASSET_TYPES[key]) return;
            out.push({ assetKey: key, unitId, squadName: squad.name, name: squad.name });
        });
    });
    return out;
}
// Пересчёт пула активов из войск (кампания стартовала / состав изменился)
// ⚡ v13.164: пул пересчитывается ПЕРЕД каждым обращением (см. syncReconAssetPool)
//    и вызывается после чистки состава при загрузке: раньше у начатого похода
//    пул оставался от прежнего состава, и развед-отряды штаба (Hidalgo, развед.
//    взвод, мотоциклисты) не попадали в список доступных активов.
function syncReconAssetPool() {
    const c = reconCampaign();
    if (!c) return null;
    const counts = {};
    reconListAssetSources().forEach(source => {
        counts[source.assetKey] = (counts[source.assetKey] || 0) + 1;
    });
    const busyCounts = {};
    reconActiveMissions().forEach(mission => {
        if (!mission || !mission.assetKey) return;
        busyCounts[mission.assetKey] = (busyCounts[mission.assetKey] || 0) + 1;
    });
    const assets = {};
    Object.keys(RECON_ASSET_TYPES).forEach(key => {
        let total = counts[key] || 0;
        // ⚡ потеря актива (гибель) закрывает этот тип до конца операции
        if (c.reconLost && c.reconLost[key]) total = 0;
        const busy = busyCounts[key] || 0;
        assets[key] = { total, available: Math.max(0, total - busy) };
    });
    c.reconAssets = assets;
    return assets;
}
function initReconAssets() {
    return syncReconAssetPool();
}
function reconActiveMissions() {
    const c = reconCampaign();
    if (!c) return [];
    return (c.reconMissions || []).filter(m => m && ['active', 'observing', 'returning'].includes(m.status));
}
// Список активов для выпадающего списка миссии (только canRecon и available > 0)
function getReconAssetList(unitOrSquad) {
    const c = reconCampaign();
    if (!c) return [];
    syncReconAssetPool();
    const all = reconListAssetSources();
    const out = [];
    Object.keys(RECON_ASSET_TYPES).forEach(key => {
        const def = RECON_ASSET_TYPES[key];
        if (!def || !def.canRecon) return;
        const pool = (c.reconAssets && c.reconAssets[key]) || { total: 0, available: 0 };
        if (!pool.total || !pool.available) return;
        const sources = all.filter(s => s.assetKey === key);
        if (!sources.length) return;
        out.push({
            key,
            name: def.name,
            kind: def.kind,
            total: pool.total,
            available: pool.available,
            sources
        });
    });
    return out;
}
// ⚡ v13.164: активы, которые принадлежат ИМЕННО этому юниту. Карточка взвода
//    больше не показывает чужих разведчиков (мотоциклистов штаба, Hidalgo,
//    развед. взвод соседа) — только свои.
function reconAssetSourcesForUnit(unitOrId) {
    const c = reconCampaign();
    if (!c) return [];
    const unitId = typeof unitOrId === 'number' ? unitOrId
        : ((c.opUnits || []).indexOf(unitOrId));
    if (!(unitId >= 0)) return [];
    return reconListAssetSources().filter(source => Number(source.unitId) === Number(unitId));
}
function getOwnReconAssetList(unitOrId) {
    const c = reconCampaign();
    if (!c) return [];
    const sources = reconAssetSourcesForUnit(unitOrId);
    if (!sources.length) return [];
    syncReconAssetPool();
    const out = [];
    const seen = new Set();
    sources.forEach(source => {
        const def = RECON_ASSET_TYPES[source.assetKey];
        if (!def || !def.canRecon || seen.has(source.assetKey)) return;
        seen.add(source.assetKey);
        const pool = (c.reconAssets && c.reconAssets[source.assetKey]) || { total: 0, available: 0 };
        out.push({
            key: source.assetKey,
            name: def.name,
            kind: def.kind,
            total: Number(pool.total) || 0,
            available: Number(pool.available) || 0,
            sources: sources.filter(item => item.assetKey === source.assetKey)
        });
    });
    return out;
}
// ⚡ v13.168: активные миссии ЭТОГО юнита (по индексу ИЛИ по имени носителя,
//    чтобы сдвиг `opUnits` не «отвязывал» миссию от штаба).
function reconMissionsForUnit(unitOrId) {
    const c = reconCampaign();
    if (!c) return [];
    const unit = (typeof unitOrId === 'number') ? (c.opUnits || [])[unitOrId] : unitOrId;
    const unitId = (typeof unitOrId === 'number') ? unitOrId : (c.opUnits || []).indexOf(unitOrId);
    const unitName = unit && unit.name ? String(unit.name) : '';
    return reconActiveMissions().filter(mission => {
        if (!mission) return false;
        if (unitId >= 0 && mission.unitId !== null && mission.unitId !== undefined &&
            Number(mission.unitId) === Number(unitId)) return true;
        const wanted = mission.unitName || mission.ownerUnitName;
        return !!(unitName && wanted && String(wanted) === unitName);
    });
}
// Развед-актив этого юнита прямо сейчас на задании?
function reconUnitOnMissionAssetKeys(unitOrId) {
    return reconMissionsForUnit(unitOrId).map(mission => mission.assetKey);
}

// ═══════════════════════════════════════════════════════════════════════════
// ⚡ v13.171 (п.1): ВЫБОР КОНКРЕТНОЙ МАШИНЫ ДЛЯ РАЗВЕДКИ.
//    У BeVe в разведку ходят бронеавтомобили Landsverk 183 №1–3 — это ТРИ
//    разные машины (у каждой свой гекс, свой экипаж и своя судьба). Раньше
//    игрок выбирал только ТИП «Бронеавтомобиль Landsverk 183», а в миссию
//    уходила первая свободная машина. Теперь в панели разведки есть второй
//    список: какой именно бронеавтомобиль отправить на задание.
// ═══════════════════════════════════════════════════════════════════════════
function reconMissionBusyKey(mission) {
    if (!mission) return '';
    return `${Number(mission.unitId)}|${String(mission.squadName || '')}`;
}
function reconSourceKey(source) {
    if (!source) return '';
    return `${Number(source.unitId)}|${String(source.squadName || '')}`;
}
function reconSourceIsOnMission(source) {
    const key = reconSourceKey(source);
    return reconActiveMissions().some(mission => reconMissionBusyKey(mission) === key);
}
// Свободные носители выбранного актива — для второго списка «какая машина».
function reconAvailableSources(assetKey) {
    const c = reconCampaign();
    if (!c || !assetKey) return [];
    const units = c.opUnits || [];
    return reconListAssetSources()
        .filter(source => source && source.assetKey === assetKey)
        .filter(source => {
            const unit = units[source.unitId];
            if (!unit || unit.isDestroyed) return false;
            if (unit.reconHidden || unit.reconMissionId) return false;
            if (source.squadName) {
                const squad = (unit.squads || []).find(sq => sq && String(sq.name) === String(source.squadName));
                if (!squad || squad.reconHidden || squad.onReconMission) return false;
            }
            return !reconSourceIsOnMission(source);
        });
}
function reconSourceName(source) {
    if (!source) return '';
    const c = reconCampaign();
    const unit = c && (c.opUnits || [])[source.unitId];
    if (source.squadName && !(unit && unit.reconHidden)) return String(source.squadName);
    return String((unit && unit.name) || source.name || 'развед-актив');
}
function reconSourceIndex(source) {
    if (!reconDraft || !reconDraft.assetKey) return -1;
    const key = reconSourceKey(source);
    return reconAvailableSources(reconDraft.assetKey).findIndex(item => reconSourceKey(item) === key);
}
// Выбор машины/отряда в панели (индекс в reconAvailableSources).
function reconSelectSource(index) {
    if (!reconDraft) return false;
    const list = reconAvailableSources(reconDraft.assetKey);
    const chosen = list[Number(index)];
    if (!chosen) return false;
    reconDraft.unitId = chosen.unitId;
    reconDraft.squadName = chosen.squadName || null;
    reconDraft.sourceIndex = Number(index);
    reconDraft.pickingRoute = true;
    renderReconPanel();
    if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
    return true;
}
// Держим выбор валидным: выбранная машина могла уйти в миссию или погибнуть.
function reconDraftEnsureSource() {
    if (!reconDraft) return null;
    const list = reconAvailableSources(reconDraft.assetKey);
    if (!list.length) {
        reconDraft.unitId = null;
        reconDraft.squadName = null;
        reconDraft.sourceIndex = null;
        return null;
    }
    let index = (reconDraft.unitId === null || reconDraft.unitId === undefined) ? -1
        : list.findIndex(item => Number(item.unitId) === Number(reconDraft.unitId) &&
            (reconDraft.squadName ? String(item.squadName || '') === String(reconDraft.squadName) : true));
    if (index < 0 && Number.isInteger(Number(reconDraft.sourceIndex)) && list[Number(reconDraft.sourceIndex)]) {
        index = Number(reconDraft.sourceIndex);
    }
    if (index < 0) index = 0;
    const chosen = list[index];
    reconDraft.unitId = chosen.unitId;
    reconDraft.squadName = chosen.squadName || null;
    reconDraft.sourceIndex = index;
    return chosen;
}

// ---------- Проходимость и скорость ----------
function getReconSpeed(assetKind, terrain) {
    const def = Object.keys(RECON_ASSET_TYPES)
        .map(key => RECON_ASSET_TYPES[key])
        .find(item => item && item.kind === assetKind);
    const speeds = (def && def.speed) || {};
    const terrainName = String(terrain || '');
    if (!terrainName) {
        return Object.keys(speeds).reduce((max, key) => Math.max(max, Number(speeds[key]) || 0), 0) || 1;
    }
    return Number(speeds[terrainName]) || 0;
}
function canReconMoveTo(assetKind, fromHex, toHex) {
    if (!toHex) return false;
    const col = Number(toHex.col), row = Number(toHex.row);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return false;
    if (typeof isHexInPlayableArea === 'function' && typeof appData !== 'undefined' &&
        !isHexInPlayableArea(appData.campaign && appData.campaign.scenario, col, row)) return false;
    const terrain = reconTerrainAt({ col, row });
    if (!terrain) return false;
    if (terrain === 'water' || terrain === 'swamp_impassable') return false;
    const def = Object.keys(RECON_ASSET_TYPES)
        .map(key => RECON_ASSET_TYPES[key])
        .find(item => item && item.kind === assetKind);
    if (!def) return false;
    // ⚡ разведчик-пехотинец проходит любую проходимую местность
    if (assetKind === 'foot') return true;
    return Object.prototype.hasOwnProperty.call(def.speed, terrain);
}
// Стоимость шага в «гексах пути» (дорога — 1, лес для мотоцикла — 4 и т.п.)
function getReconMoveCost(assetKind, toHex) {
    const terrain = reconTerrainAt(toHex);
    const speed = getReconSpeed(assetKind, terrain);
    if (!speed) return Infinity;
    const maxSpeed = getReconSpeed(assetKind, null) || 1;
    return Math.max(1, maxSpeed / speed) * (assetKind === 'foot' ? 2 : 1);
}

// ---------- Наблюдение ----------
function getReconObserveRange(mission, hex, moving) {
    const point = hex || (mission && mission.currentHex) || null;
    const types = point && typeof getOpHexTypes === 'function'
        ? (getOpHexTypes(Number(point.col), Number(point.row)) || []) : [];
    const onHill = types.includes('hill');
    let range = moving ? RECON_RANGE_MOVING : (onHill ? RECON_RANGE_HILL : RECON_RANGE_STANDING);
    if (types.includes('forest') || types.includes('shelled_forest')) range -= 2;
    else if (types.includes('bushes') || types.includes('rocks')) range -= 1;
    return Math.max(1, range);
}
function reconIlluminationActive() {
    try {
        if (typeof tacticalIlluminationActive === 'function' && tacticalIlluminationActive(reconTurnNumber())) return true;
    } catch (e) {}
    const c = reconCampaign();
    if (c && Number(c.opIlluminationTurn) >= reconTurnNumber()) return true;
    return false;
}
// Дым между наблюдателем и целью — автоматический провал
function reconSmokeBlocks(observerHex, targetHex) {
    if (!observerHex || !targetHex) return false;
    const c = reconCampaign();
    const clouds = (c && Array.isArray(c.opSmokeClouds)) ? c.opSmokeClouds : [];
    try {
        if (clouds.length && typeof tacticalSmokeBlocksSight === 'function' &&
            tacticalSmokeBlocksSight(reconKeyOf(observerHex), reconKeyOf(targetHex), { smokeClouds: clouds }, reconTurnNumber())) return true;
    } catch (e) {}
    if (!clouds.length) return false;
    const fromKey = reconKeyOf(observerHex);
    const targetKey = reconKeyOf(targetHex);
    const total = (typeof getOpHexDistance === 'function')
        ? getOpHexDistance(Number(observerHex.col), Number(observerHex.row), Number(targetHex.col), Number(targetHex.row))
        : 0;
    // дым на линии наблюдения (в том числе в гексе цели или наблюдателя)
    return clouds.some(cloud => {
        const key = cloud && (cloud.hexKey || cloud.key || (cloud.col !== undefined ? `${cloud.col},${cloud.row}` : null));
        if (!key) return false;
        if (key === fromKey || key === targetKey) return true;
        const hex = reconHexFromKey(key);
        if (!hex) return false;
        const distToCloud = (typeof getOpHexDistance === 'function')
            ? getOpHexDistance(Number(observerHex.col), Number(observerHex.row), hex.col, hex.row)
            : 99;
        return distToCloud < total;
    });
}
// Модификаторы к броску обнаружения (см. §1.2 постановки)
function reconObserveModifier(observerHex, target, opts) {
    opts = opts || {};
    const parts = [];
    let mod = 0;
    const dist = (observerHex && target && typeof getOpHexDistance === 'function')
        ? getOpHexDistance(Number(observerHex.col), Number(observerHex.row), Number(target.col), Number(target.row))
        : 99;
    let distMod = 0;
    if (dist <= 1) distMod = 3;
    else if (dist === 2) distMod = 2;
    else if (dist === 3) distMod = 1;
    else if (dist <= 5) distMod = 0;
    else distMod = -2;
    mod += distMod; parts.push(`дистанция ${dist}: ${distMod >= 0 ? '+' : ''}${distMod}`);
    if (target && target.movedThisTurn) { mod += 2; parts.push('цель двигалась: +2'); }
    if (target && target.firedThisTurn) { mod += 3; parts.push('цель стреляла: +3'); }
    const armored = (typeof opDetectionIsArmored === 'function') ? opDetectionIsArmored(target)
        : !!(target && target.type === 'vehicle');
    if (armored) { mod += 2; parts.push('бронетехника: +2'); }
    const targetTypes = target && typeof getOpHexTypes === 'function'
        ? (getOpHexTypes(Number(target.col), Number(target.row)) || []) : [];
    const cell = (target && reconCampaign() && reconCampaign().opMapGrid)
        ? reconCampaign().opMapGrid[`${target.col},${target.row}`] : null;
    const markers = (cell && !Array.isArray(cell) && Array.isArray(cell.markers)) ? cell.markers : [];
    if (targetTypes.includes('forest') || targetTypes.includes('shelled_forest') || markers.includes('forest') ||
        markers.includes('trenches') || targetTypes.includes('trenches')) {
        mod -= 2; parts.push('цель в лесу/окопе: −2');
    } else if (targetTypes.includes('bushes') || targetTypes.includes('rocks') || markers.includes('bushes') ||
               markers.includes('rocks')) {
        mod -= 1; parts.push('цель в кустах/камнях: −1');
    } else if (targetTypes.includes('road') || targetTypes.includes('water')) {
        mod += 1; parts.push('цель на дороге/у воды: +1');
    }
    if (opts.isScout) { mod += 1; parts.push('наблюдатель-разведчик: +1'); }
    if (opts.penalty) { mod += Number(opts.penalty); parts.push(`штраф наблюдателя: ${Number(opts.penalty)}`); }
    if (opts.pauseBonus) { mod += Number(opts.pauseBonus); parts.push(`пауза на точке: +${Number(opts.pauseBonus)}`); }
    if (typeof isNightTime === 'function' && isNightTime() && !reconIlluminationActive()) {
        const nightMod = dist <= 1 ? -1 : -2;
        mod += nightMod; parts.push(`ночь: ${nightMod}`);
    }
    return { mod, parts, distance: dist };
}
function reconSquadAlive(squad) {
    if (!squad) return false;
    const fighters = squad.fighters || [];
    if (!fighters.length) return true;
    return fighters.some(f => Number(f && f.hp) > 0);
}
// Единая проверка наблюдения: возвращает { found:[enemy...], noise:[enemy...], rolls:[] }
function observeInRange(observer, mission, range, opts) {
    opts = opts || {};
    const c = reconCampaign();
    if (!c) return { found: [], noise: [], rolls: [] };
    const observerHex = (mission && mission.currentHex) || (observer ? { col: observer.col, row: observer.row } : null);
    if (!observerHex || !Number.isFinite(Number(observerHex.col))) return { found: [], noise: [], rolls: [] };
    const limit = Number(range) || RECON_RANGE_MOVING;
    const enemies = (c.enemyOpUnits || []).filter(e => e && !e.isDestroyed &&
        Number.isFinite(Number(e.col)) && Number.isFinite(Number(e.row)));
    const found = [], noise = [], rolls = [];
    enemies.forEach(enemy => {
        const dist = (typeof getOpHexDistance === 'function')
            ? getOpHexDistance(Number(observerHex.col), Number(observerHex.row), Number(enemy.col), Number(enemy.row))
            : 99;
        if (dist > limit) return;
        // дым между наблюдателем и целью — автоматический провал
        if (reconSmokeBlocks(observerHex, enemy)) {
            rolls.push({ enemy: enemy.name, roll: null, mod: null, total: null, smoke: true });
            return;
        }
        if (typeof opLineOfSightBlocked === 'function' &&
            opLineOfSightBlocked(Number(observerHex.col), Number(observerHex.row), Number(enemy.col), Number(enemy.row))) {
            rolls.push({ enemy: enemy.name, blocked: true });
            return;
        }
        const modifier = reconObserveModifier(observerHex, enemy, opts);
        const roll = (typeof rollD10 === 'function') ? rollD10() : (Math.floor(Math.random() * 10) + 1);
        const total = roll + modifier.mod;
        rolls.push({ enemy: enemy.name, roll, mod: modifier.mod, total, parts: modifier.parts });
        if (total >= RECON_DETECT_THRESHOLD) found.push(enemy);
        else if (total >= RECON_NOISE_THRESHOLD) noise.push(enemy);
    });
    if (opts.log !== false && rolls.length) {
        const detected = rolls.filter(r => r.total !== null && r.total !== undefined && r.total >= RECON_DETECT_THRESHOLD).length;
        const noisy = rolls.filter(r => r.total !== null && r.total !== undefined &&
            r.total >= RECON_NOISE_THRESHOLD && r.total < RECON_DETECT_THRESHOLD).length;
        if (typeof log === 'function') {
            log(`👁️ Наблюдение (${limit} гекс.): проверено ${rolls.length} целей — обнаружено ${detected}, шум ${noisy}.`);
        }
    }
    // «Шум» — обезличенные маркеры в гексе цели и соседних
    noise.forEach(enemy => {
        try {
            if (typeof addOperationalArtilleryNoise === 'function') addOperationalArtilleryNoise(enemy, `recon:${enemy.name}`, 'enemy');
        } catch (e) {}
    });
    if (found.length && typeof reportFindings === 'function') reportFindings(mission, found, opts);
    return { found, noise, rolls };
}

// ---------- Доклады ----------
function reconUnitHasRadio(unit) {
    try {
        if (!unit || typeof hasRadio !== 'function') return false;
        return !!hasRadio(unit);
    } catch (e) { return false; }
}
// ⚡ v13.165 (п.6): рация, выданная АДРЕСНО разведоргану (отделению при штабе).
//    hasRadio(unit) проверяет только юниты из opUnits, поэтому для Hidalgo или
//    мотоциклиста-разведчика внутри штаба нужна отдельная проверка по имени
//    отделения (см. hasSquadRadio в index.html).
function reconOrganHasRadio(mission) {
    if (!mission || !mission.squadName) return false;
    const unit = reconMissionUnit(mission);
    if (!unit) return false;
    try {
        if (typeof hasSquadRadio === 'function') return !!hasSquadRadio(unit, mission.squadName);
    } catch (e) { return false; }
    return false;
}
// Штаб, ближайший к активу (батальон или рота) — для дистанции доклада
function reconNearestHQ(mission) {
    const c = reconCampaign();
    if (!c) return null;
    const point = (mission && mission.currentHex) || null;
    let best = null, bestDist = Infinity;
    (c.opUnits || []).forEach(unit => {
        if (!unit || unit.isDestroyed) return;
        const isHQ = ['battalion_hq', 'company_hq', 'hq'].includes(unit.type) || /штаб/i.test(String(unit.name || ''));
        if (!isHQ || !Number.isFinite(Number(unit.col))) return;
        const dist = (point && typeof getOpHexDistance === 'function')
            ? getOpHexDistance(Number(point.col), Number(point.row), Number(unit.col), Number(unit.row)) : 0;
        if (dist < bestDist) { bestDist = dist; best = unit; }
    });
    return best ? { unit: best, distance: bestDist } : null;
}
function getReconReportDelay(mission, distToHQ) {
    const dist = Number.isFinite(Number(distToHQ)) ? Number(distToHQ) : 0;
    const method = (mission && mission.reportMethod) || 'radio';
    if (method === 'radio') {
        const hq = reconNearestHQ(mission);
        const assetUnit = reconMissionUnit(mission);
        // ⚡ v13.165 (п.6): рация может быть выдана самому разведоргану
        const assetRadio = reconUnitHasRadio(assetUnit) || reconOrganHasRadio(mission);
        const hqRadio = hq && reconUnitHasRadio(hq.unit);
        if (assetRadio && hqRadio) return 0;      // рация у актива и у штаба
        return 1;                                  // рация без приёмника — курьер штаба
    }
    if (method === 'messenger') return Math.max(1, Math.ceil(dist / 3));
    return Math.max(1, Math.ceil(dist / 4));       // возврат в штаб
}
function scheduleReveal(enemy, turnToReveal) {
    const c = reconCampaign();
    if (!c || !enemy) return false;
    const name = typeof enemy === 'string' ? enemy : (enemy.name || null);
    if (!name) return false;
    c.reconPendingReveals.push({
        target: name,
        turn: Math.max(reconTurnNumber(), Number(turnToReveal) || reconTurnNumber())
    });
    return true;
}
// Раскрытие найденных врагов с задержкой по способу доклада
function reportFindings(mission, enemies, opts) {
    opts = opts || {};
    const c = reconCampaign();
    if (!c || !Array.isArray(enemies) || !enemies.length) return 0;
    const turn = reconTurnNumber();
    const hq = reconNearestHQ(mission);
    const delay = Number.isFinite(Number(opts.delay)) ? Number(opts.delay) : getReconReportDelay(mission, hq ? hq.distance : 0);
    const label = (mission && mission.assetName) || opts.label || 'наблюдатель';
    if (delay <= 0) {
        enemies.forEach(enemy => {
            enemy.detected = true;
            if (enemy.noiseMarker) enemy.noiseMarker = false;
            try {
                if (typeof onlineRevealEnemy === 'function') onlineRevealEnemy(enemy, turn + 1);
            } catch (e) {}
        });
        if (typeof log === 'function') {
            const hex = (mission && mission.currentHex) ? `(${mission.currentHex.col},${mission.currentHex.row})`
                : 'позиции';
            log(`📡 [${label}]: на ${hex} обнаружено ${enemies.length} отр. Доклад в этом же ходу — враг раскрыт до конца следующего хода.`);
        }
    } else {
        enemies.forEach(enemy => scheduleReveal(enemy, turn + delay));
        if (typeof log === 'function') {
            const hex = (mission && mission.currentHex) ? `(${mission.currentHex.col},${mission.currentHex.row})`
                : 'позиции';
            log(`📡 [${label}]: на ${hex} обнаружено ${enemies.length} отр. Доклад через ${delay} ход(ов).`);
        }
    }
    if (mission) {
        if (!Array.isArray(mission.foundEnemies)) mission.foundEnemies = [];
        enemies.forEach(enemy => {
            const name = String(enemy.name || '');
            if (name && !mission.foundEnemies.includes(name)) mission.foundEnemies.push(name);
        });
    }
    return delay;
}

// ---------- Миссия: актив и его юнит ----------
// ⚡ v13.168: `mission.unitId` — это ИНДЕКС в `opUnits`, а индекс не стабилен:
//    приход подкрепления, слияние/разделение взводов, гибель юнита наверху
//    списка сдвигают массив. После сдвига индекс указывал на ЧУЖОЙ юнит,
//    `reconMissionSquad` не находил отделение, миссия падала с «потерей актива»,
//    а сам разведчик (мотоциклист при штабе, Hidalgo, развед. отделение)
//    оставался со флагом `reconHidden` — то есть исчезал с карты навсегда.
//    Теперь в миссии хранится имя носителя: сначала пробуем индекс и сверяем
//    имя, при расхождении ищем по имени и переписываем индекс.
function reconResolveUnitIndex(unitName) {
    const c = reconCampaign();
    if (!c || !unitName) return -1;
    return (c.opUnits || []).findIndex(unit => unit && String(unit.name || '') === String(unitName));
}
function reconMissionUnit(mission) {
    const c = reconCampaign();
    if (!c || !mission) return null;
    const units = c.opUnits || [];
    const wantedName = mission.unitName || mission.ownerUnitName || null;
    let unit = null;
    if (mission.unitId !== null && mission.unitId !== undefined) {
        unit = units[Number(mission.unitId)] || null;
    }
    if (wantedName && (!unit || String(unit.name || '') !== String(wantedName))) {
        const index = reconResolveUnitIndex(wantedName);
        if (index >= 0) {
            unit = units[index];
            mission.unitId = index;
        } else if (!unit) {
            // носитель не найден по имени — индекс не трогаем, вернём что есть
            unit = null;
        }
    }
    return unit || null;
}
function reconMissionSquad(mission) {
    const unit = reconMissionUnit(mission);
    if (!unit || !mission || !mission.squadName) return null;
    return (unit.squads || []).find(sq => sq && String(sq.name) === String(mission.squadName)) || null;
}
function reconMissionIsAlive(mission) {
    if (!mission) return false;
    if (mission.unitId !== null && mission.unitId !== undefined) {
        const unit = reconMissionUnit(mission);
        if (!unit || unit.isDestroyed) return false;
        if (mission.squadName) {
            const squad = reconMissionSquad(mission);
            if (!squad || !reconSquadAlive(squad)) return false;
        }
        return true;
    }
    return true;
}
// ═══════════════════════════════════════════════════════════════════════════
// ⚡ v13.168: ЛЕЧЕНИЕ «ЗАБЫТЫХ» ФЛАГОВ СКРЫТИЯ.
//    Если у отделения/юнита остался `reconHidden`/`onReconMission`, а активной
//    миссии с этим id нет (миссия провалилась из-за сдвига индекса, сейв от
//    старой версии, ручной откат хода), разведчик исчезал с карты навсегда —
//    именно «в какой-то момент мотоциклист пропадает, и непонятно где он».
//    Теперь каждый ход (и при отрисовке панели) такие флаги снимаются, юнит
//    возвращается на карту, а «потерянный» тип актива — снова доступен.
// ═══════════════════════════════════════════════════════════════════════════
function reconcileReconHiddenFlags() {
    const c = reconCampaign();
    if (!c) return 0;
    const active = reconActiveMissions();
    const activeIds = new Set(active.map(m => String(m.id)));
    let healed = 0;
    const healAsset = (squad, unit) => {
        const key = (squad && reconAssetKeyForSquad(squad)) ||
            (unit && reconStandaloneKeyForUnit(unit)) || null;
        if (key && c.reconLost && c.reconLost[key]) {
            delete c.reconLost[key];
            if (typeof log === 'function') {
                log(`🔍 Разведка «${(RECON_ASSET_TYPES[key] || {}).name || key}» снова доступна: актив на месте.`);
            }
        }
    };
    (c.opUnits || []).forEach(unit => {
        if (!unit) return;
        const onMission = reconMissionsForUnit(unit);
        const busyIds = new Set(onMission.map(m => String(m.id)));
        const busySquads = new Set(onMission.filter(m => m.squadName).map(m => String(m.squadName)));
        // флаг на самом юните (бронеавтомобиль, развед. взвод)
        if (unit.reconMissionId && !busyIds.has(String(unit.reconMissionId))) {
            if (typeof log === 'function') {
                log(`↩️ ${unit.name || 'Развед-актив'} снова на карте — миссия уже не активна.`);
            }
            delete unit.reconMissionId;
            delete unit.reconHidden;
            healAsset(null, unit);
            healed++;
        } else if (unit.reconHidden && !unit.reconMissionId) {
            delete unit.reconHidden;
            healed++;
        }
        // флаги на отделениях (мотоциклист при штабе, Hidalgo, развед. отделение)
        (unit.squads || []).forEach(squad => {
            if (!squad) return;
            const flagged = squad.onReconMission || squad.reconHidden;
            if (!flagged) return;
            const onActiveMission = squad.onReconMission && activeIds.has(String(squad.onReconMission));
            if (onActiveMission || busySquads.has(String(squad.name))) return;
            if (typeof log === 'function') {
                log(`↩️ ${squad.name || 'Развед-отряд'} вернулся в ${unit.name || 'расположение'} — снова на карте.`);
            }
            delete squad.onReconMission;
            delete squad.reconHidden;
            healAsset(squad, unit);
            healed++;
        });
    });
    if (healed) {
        // пул активов пересчитываем сразу — иначе в панели оставалось
        // «0/0» до следующей перерисовки, и разведчик «числился потерянным»
        try { syncReconAssetPool(); } catch (e) {}
        if (typeof redrawOperationalMap === 'function') {
            try { redrawOperationalMap(); } catch (e) {}
        }
    }
    return healed;
}
function releaseReconAsset(assetKey) {
    const c = reconCampaign();
    if (!c || !assetKey) return false;
    if (!c.reconAssets || !c.reconAssets[assetKey]) initReconAssets();
    const pool = c.reconAssets && c.reconAssets[assetKey];
    if (pool) pool.available = Math.min(Number(pool.total) || 0, (Number(pool.available) || 0) + 1);
    return true;
}
function finishReconMission(missionId, status) {
    const c = reconCampaign();
    if (!c) return false;
    const mission = (c.reconMissions || []).find(m => m && String(m.id) === String(missionId));
    if (!mission) return false;
    mission.status = status || 'completed';
    mission.finishedTurn = reconTurnNumber();
    if (mission.status === 'failed') {
        // ⚡ §4.4: потеря актива — тип недоступен до конца операции
        c.reconLost = c.reconLost || {};
        c.reconLost[mission.assetKey] = true;
        if (c.reconAssets && c.reconAssets[mission.assetKey]) {
            c.reconAssets[mission.assetKey].total = 0;
            c.reconAssets[mission.assetKey].available = 0;
        }
        if (typeof log === 'function') {
            log(`❌ [${mission.assetName}]: потерян. Разведка этого типа недоступна до конца операции.`);
        }
        // ⚡ v13.167 (п.8): даже при провале снимаем флаги скрытия — живой юнит
        //    не должен оставаться невидимым на операционной карте.
        if (mission.unitId !== null && mission.unitId !== undefined) {
            const lostUnit = reconMissionUnit(mission);
            if (lostUnit && !lostUnit.isDestroyed) {
                delete lostUnit.reconMissionId;
                delete lostUnit.reconHidden;
                if (mission.squadName) {
                    const squad = (lostUnit.squads || []).find(sq => sq && String(sq.name) === String(mission.squadName));
                    if (squad) { delete squad.onReconMission; delete squad.reconHidden; }
                }
            }
        }
    } else {
        if (mission.status === 'completed') releaseReconAsset(mission.assetKey);
        if (mission.unitId !== null && mission.unitId !== undefined) {
            const unit = reconMissionUnit(mission);
            if (unit && mission.squadName) {
                // ⚡ v13.160: отряд вернулся в юнит — носитель остаётся на месте
                const squad = (unit.squads || []).find(sq => sq && String(sq.name) === String(mission.squadName));
                if (squad) { delete squad.onReconMission; delete squad.reconHidden; }
            } else if (unit) {
                // ⚡ v13.167 (п.8): актив, завершивший миссию, ОБЯЗАН вернуться на
                //    карту. Раньше флаг скрытия снимался, но если возврат застревал
                //    (см. reconAdvanceReturn), БА оставался невидимым, хотя в
                //    «Батальоне» числился живым. Теперь место возврата — точка
                //    отзыва / своё расположение, а не «последний гекс в поле».
                delete unit.reconMissionId;
                delete unit.reconHidden;
                const home = reconRecallDestination(mission);
                if (home && Number.isFinite(home.col) && Number.isFinite(home.row) &&
                    (!mission.currentHex || reconKeyOf(mission.currentHex) !== `${home.col},${home.row}`)) {
                    unit.col = Number(home.col);
                    unit.row = Number(home.row);
                } else if (mission.currentHex) {
                    unit.col = Number(mission.currentHex.col);
                    unit.row = Number(mission.currentHex.row);
                }
            }
        }
    }
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
    if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
    return true;
}

// ⚡ гибель юнита-актива (артобстрел, бой) → миссия провалена, тип закрыт
function reconOnUnitDestroyed(unit) {
    const c = reconCampaign();
    if (!c || !unit) return false;
    let failed = 0;
    (c.reconMissions || []).forEach(mission => {
        if (!mission || !['active', 'observing', 'returning'].includes(mission.status)) return;
        if (mission.unitId === null || mission.unitId === undefined) return;
        if ((c.opUnits || [])[Number(mission.unitId)] !== unit) return;
        finishReconMission(mission.id, 'failed');
        failed += 1;
    });
    return failed > 0;
}

// ---------- Создание миссии ----------
// One mission API is shared by the recon dock and the unit special order.
function reconCanReceiveMission(unit) {
    if (!unit || unit.isDestroyed || unit.isSurrendered || unit.reconMissionId || unit.embarkedInBtr) return false;
    const key = reconStandaloneKeyForUnit(unit);
    return !!(key && RECON_ASSET_TYPES[key] && RECON_ASSET_TYPES[key].canRecon);
}
function reconPlanRoute(assetKind, startHex, waypoints) {
    if (!startHex || startHex.col == null || startHex.row == null || !Array.isArray(waypoints)) return null;
    const result = [];
    let current = { col: Number(startHex.col), row: Number(startHex.row) };
    for (const point of waypoints) {
        if (!point || point.col == null || point.row == null ||
            !Number.isFinite(Number(point.col)) || !Number.isFinite(Number(point.row))) return null;
        const path = reconFindPath({ assetKind, currentHex: current }, point);
        if (path === null) return null;
        path.forEach(hex => result.push({ col: hex.col, row: hex.row, observe: false }));
        if (!path.length && !result.length) result.push({ col: current.col, row: current.row, observe: false });
        if (result.length) result[result.length - 1].observe = point.observe !== false;
        current = { col: Number(point.col), row: Number(point.row) };
        if (result.length > 2000) return null;
    }
    return result;
}
function executeReconMissionOrder(unit, order) {
    if (!unit || !order) return false;
    if (!reconCanReceiveMission(unit)) {
        order.status = 'cancelled';
        if (typeof log === 'function') log('⛔ Для этого подразделения разведывательная миссия недоступна.');
        return false;
    }
    const c = reconCampaign();
    let route = order.route || order.waypoints || [];
    if (!route.length && order.targetHex) {
        const point = reconHexFromKey(order.targetHex);
        if (point) route = [point];
    }
    const mission = createReconMission({
        assetKey: reconStandaloneKeyForUnit(unit), unitId: c.opUnits.indexOf(unit),
        route, observeMode: order.observeMode || 'stationary', reportMethod: order.reportMethod || 'radio'
    });
    order.status = mission ? 'completed' : 'cancelled';
    if (mission) order.reconMissionId = mission.id;
    return !!mission;
}
function reconDraftPreviewRoute() {
    if (!reconDraft || !reconDraft.assetKey) return null;
    const def = RECON_ASSET_TYPES[reconDraft.assetKey];
    const c = reconCampaign();
    const mission = reconDraft.missionId && reconActiveMissions().find(m => m.id === reconDraft.missionId);
    const unit = c && (c.opUnits || [])[reconDraft.unitId];
    const start = mission ? mission.currentHex : unit;
    return def && start ? reconPlanRoute(def.kind, start, reconDraft.route || []) : null;
}
function reconToggleObservation(index, enabled) {
    if (!reconDraft || !reconDraft.route || !reconDraft.route[index]) return false;
    reconDraft.route[index].observe = !!enabled;
    renderReconPanel();
    if (typeof redrawOperationalMap === 'function') redrawOperationalMap();
    return true;
}
function reconMissionFeedback(message, success) {
    if (typeof document !== 'undefined') {
        let notice = document.getElementById('reconMissionFeedback');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'reconMissionFeedback';
            notice.setAttribute('role', 'status');
            notice.setAttribute('aria-live', 'polite');
            document.body.appendChild(notice);
        }
        notice.className = success ? 'recon-feedback success' : 'recon-feedback error';
        notice.textContent = message;
        clearTimeout(reconMissionFeedback.timer);
        reconMissionFeedback.timer = setTimeout(() => notice.remove(), success ? 6000 : 10000);
    }
    if (typeof log === 'function') log(message);
}
function createReconMission(opts) {
    opts = opts || {};
    const c = reconCampaign();
    if (!c) return null;
    const assetKey = opts.assetKey;
    const def = RECON_ASSET_TYPES[assetKey];
    if (!def || !def.canRecon) return null;
    let route = (Array.isArray(opts.route) ? opts.route : [])
        .map(point => ({ col: Number(point && point.col), row: Number(point && point.row), observe: point && point.observe !== false }))
        .filter(point => Number.isFinite(point.col) && Number.isFinite(point.row))
        .slice(0, RECON_ROUTE_MAX_POINTS);
    if (!route.length) return null;
    // ⚡ v13.164: пул пересчитываем из состава войск прямо перед отправкой —
    //    иначе у начатого похода «available» мог остаться нулевым от прежнего состава.
    syncReconAssetPool();
    const pool = c.reconAssets && c.reconAssets[assetKey];
    if (!pool || !pool.available) return null;
    // источник: конкретный юнит/отряд, если он передан, иначе первый свободный
    const sources = reconListAssetSources().filter(source => source.assetKey === assetKey &&
        !reconActiveMissions().some(m => m.assetKey === assetKey &&
            ((m.unitId !== null && m.unitId === source.unitId) && String(m.squadName || '') === String(source.squadName || ''))));
    let source = null;
    if (opts.unitId !== null && opts.unitId !== undefined) {
        source = sources.find(s => Number(s.unitId) === Number(opts.unitId) &&
            (opts.squadName ? String(s.squadName || '') === String(opts.squadName) : true)) || null;
    }
    if (!source && (opts.unitId === null || opts.unitId === undefined)) source = sources[0] || null;
    if (!source) return null;
    const unit = (c.opUnits || [])[source.unitId] || null;
    if (!unit || unit.col == null || unit.row == null || !Number.isFinite(Number(unit.col)) || !Number.isFinite(Number(unit.row))) return null;
    const startHex = { col: Number(unit.col), row: Number(unit.row) };
    route = reconPlanRoute(def.kind, startHex, route);
    if (!route || !route.length) return null;
    const mission = {
        routeVersion: 2,
        stealth: def.kind === 'foot',
        id: opts.id || `recon-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        assetKey,
        assetName: source.name || def.name,
        unitId: source.unitId,
        // ⚡ v13.168: имя носителя — стабильный ключ (индекс в opUnits «плывёт»)
        unitName: (unit && unit.name) || source.name || null,
        squadName: source.squadName,
        ownerUnitId: source.unitId,
        ownerUnitName: (unit && unit.name) || null,
        assetKind: def.kind,
        route,
        // ⚡ v13.167 (п.3): «своё расположение» — гекс, с которого актив ушёл.
        //    Отзыв возвращает актив ИМЕННО туда (развед-орган при штабе — к
        //    штабу-носителю), а не «в ближайший штаб по прямой».
        originHex: { col: Number(startHex.col), row: Number(startHex.row) },
        recallHex: null,
        returnStuck: 0,
        observeMode: ['pass', 'pause', 'stationary'].includes(opts.observeMode) ? opts.observeMode : 'stationary',
        reportMethod: ['radio', 'messenger', 'return'].includes(opts.reportMethod) ? opts.reportMethod : 'radio',
        status: 'active',
        currentIndex: 0,
        currentHex: startHex,
        ap: RECON_TURN_BUDGET,
        startedTurn: reconTurnNumber(),
        lastMoveTurn: reconTurnNumber(),
        pendingReports: [],
        foundEnemies: [],
        log: []
    };
    pool.available = Math.max(0, Number(pool.available) - 1);
    c.reconMissions.push(mission);
    // актив скрывается с карты как боевой юнит
    if (unit && !source.squadName) {
        unit.reconMissionId = mission.id;
        unit.reconHidden = true;
        unit.stealthMove = def.kind === 'foot';
    } else if (unit) {
        // ⚡ v13.160: отряд внутри юнита (мотоциклист при штабе батальона, развед.
        //    отделение) уходит в миссию САМ — юнит-носитель с места не двигается.
        unit.reconMissionId = unit.reconMissionId || null;
        const squad = (unit.squads || []).find(sq => sq && String(sq.name) === String(source.squadName));
        if (squad) {
            squad.onReconMission = mission.id;
            squad.reconHidden = true;
        }
    }
    // ⚡ v13.164: машина/взвод уходит в миссию и скрывается с карты — снимаем
    //    выбор, иначе подсветка и панель приказов оставались на «невидимом» юните.
    if (!source.squadName && typeof appData !== 'undefined' && appData.campaign &&
        appData.campaign.selectedOpUnit === unit) {
        appData.campaign.selectedOpUnit = null;
        try { if (typeof closeOpUnitInfoPopup === 'function') closeOpUnitInfoPopup(); } catch (e) {}
    }
    if (typeof log === 'function') {
        log(`🔍 [${mission.assetName}] отправлен. Маршрут: ${route.map(p => `(${p.col},${p.row})`).join('→')}.`);
    }
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
    if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
    return mission;
}

// ⚡ v13.167 (п.3): КУДА возвращается отозванный разведчик.
//    Приоритет: явная точка отзыва (игрок выбрал на карте) → своё расположение
//    (для развед-органа при штабе — текущий гекс штаба-носителя) → ближайший штаб.
//    Раньше отзыв всегда вёл «в ближайший штаб по прямой» и застревал, если
//    прямой шаг был невозможен.
function reconRecallDestination(mission) {
    if (!mission) return null;
    const valid = (point) => !!(point && Number.isFinite(Number(point.col)) && Number.isFinite(Number(point.row)));
    if (valid(mission.recallHex)) return { col: Number(mission.recallHex.col), row: Number(mission.recallHex.row) };
    if (mission.squadName) {
        const unit = reconMissionUnit(mission);
        if (unit && valid({ col: unit.col, row: unit.row })) return { col: Number(unit.col), row: Number(unit.row) };
    }
    if (valid(mission.originHex)) return { col: Number(mission.originHex.col), row: Number(mission.originHex.row) };
    const hq = reconNearestHQ(mission);
    if (hq && hq.unit) return { col: Number(hq.unit.col), row: Number(hq.unit.row) };
    return null;
}
// Поиск пути (Дейкстра) с учётом проходимости и скорости актива. Гreedy-шаг
// «сосед, ближе к цели» застревал в лесу/у воды: все соседи дальше — и актив
// висел на точке навсегда (и оставался скрытым с карты, см. п.8).
function reconFindPath(mission, dest) {
    if (!mission || !dest) return null;
    const startHex = mission.currentHex;
    if (!startHex || !Number.isFinite(Number(startHex.col))) return null;
    const start = reconKeyOf(startHex);
    const goal = reconKeyOf(dest);
    if (!start || !goal) return null;
    if (start === goal) return [];
    const best = new Map([[start, 0]]);
    const previous = new Map();
    const queue = [{ col: Number(startHex.col), row: Number(startHex.row), cost: 0 }];
    let guard = 0;
    while (queue.length && guard++ < 6000) {
        let bestIndex = 0;
        for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[bestIndex].cost) bestIndex = i;
        const current = queue.splice(bestIndex, 1)[0];
        const currentKey = `${current.col},${current.row}`;
        if (currentKey === goal) break;
        if (current.cost > (best.get(currentKey) ?? Infinity)) continue;
        const neighbors = (typeof getOpHexNeighbors === 'function')
            ? getOpHexNeighbors(current.col, current.row) : [];
        neighbors.forEach(neighbor => {
            const col = Number(neighbor && neighbor.col), row = Number(neighbor && neighbor.row);
            if (!Number.isFinite(col) || !Number.isFinite(row)) return;
            const key = `${col},${row}`;
            if (!canReconMoveTo(mission.assetKind, { col: current.col, row: current.row }, { col, row })) return;
            const stepCost = getReconMoveCost(mission.assetKind, { col, row });
            if (!Number.isFinite(stepCost)) return;
            const cost = current.cost + stepCost;
            if (cost < (best.get(key) ?? Infinity)) {
                best.set(key, cost);
                previous.set(key, currentKey);
                queue.push({ col, row, cost });
            }
        });
    }
    if (!previous.has(goal)) return null;
    const path = [];
    let key = goal, steps = 0;
    while (key !== start && steps++ < 2000) {
        const [col, row] = String(key).split(',').map(Number);
        path.push({ col, row });
        key = previous.get(key);
        if (!key) return null;
    }
    return key === start ? path.reverse() : null;
}
// Шаг к точке отзыва по найденному пути (в пределах ОД текущего хода).
function reconAdvanceReturn(mission) {
    const dest = reconRecallDestination(mission);
    if (!dest) return 'no_destination';
    const goalKey = `${Number(dest.col)},${Number(dest.row)}`;
    let moved = 0;
    let guard = 0;
    while (guard++ < 24) {
        // ⚡ v13.167: «прибыл» — это состояние гекса, а не «в этом ходу не двигался».
        //    Раньше актив, дошедший до точки на последнем шаге хода, возвращал
        //    'moved' и миссия висела в «возвращается» лишний ход.
        if (reconKeyOf(mission.currentHex) === goalKey) return 'arrived';
        const path = reconFindPath(mission, dest);
        if (!path || !path.length) return moved ? 'moved' : 'blocked';
        const result = moveReconAsset(mission, path[0]);
        if (result === 'moved') { moved++; continue; }
        if (result === 'no_ap') return moved ? 'moved' : 'no_ap';
        return moved ? 'moved' : 'blocked';
    }
    return moved ? 'moved' : 'blocked';
}

// ---------- Движение ----------
function moveReconAsset(mission, toHex) {
    if (!mission || !toHex) return 'no_route';
    if (!canReconMoveTo(mission.assetKind, mission.currentHex, toHex)) return 'blocked';
    const cost = getReconMoveCost(mission.assetKind, toHex);
    if (!Number.isFinite(cost)) return 'blocked';
    if (Number(mission.ap) < cost) return 'no_ap';
    mission.ap = Number(mission.ap) - cost;
    mission.currentHex = { col: Number(toHex.col), row: Number(toHex.row) };
    mission.lastMoveTurn = reconTurnNumber();
    // юнит-актив двигается вместе с миссией (иконка не рисуется — см. §9.4);
    // отряд внутри юнита ходит сам, носитель остаётся на своём гексе
    if (!mission.squadName) {
        const unit = reconMissionUnit(mission);
        if (unit) {
            unit.col = mission.currentHex.col; unit.row = mission.currentHex.row;
            unit.stealthMove = mission.assetKind === 'foot';
            unit.movedThisTurn = true;
        }
    }
    return 'moved';
}
function reconRouteTarget(mission) {
    if (!mission || !Array.isArray(mission.route)) return null;
    const index = Math.min(Number(mission.currentIndex) || 0, mission.route.length - 1);
    return mission.route[index] || null;
}
// Шаг к следующей точке маршрута
function reconStepAlongRoute(mission) {
    if (!mission) return 'no_route';
    const target = reconRouteTarget(mission);
    if (!target) return 'no_route';
    const current = mission.currentHex || { col: target.col, row: target.row };
    const atTarget = Number(current.col) === Number(target.col) && Number(current.row) === Number(target.row);
    if (atTarget) {
        if (mission.routeVersion === 2 && target.observe && mission.lastObservedIndex !== mission.currentIndex) {
            observeInRange(null, mission, getReconObserveRange(mission, current, false), {
                isScout: true, pauseBonus: mission.observeMode === 'pause' ? 2 : 0
            });
            mission.lastObservedIndex = mission.currentIndex;
            if (mission.observeMode === 'pause') { mission.ap = 0; return 'no_ap'; }
        }
        if (Number(mission.currentIndex) >= mission.route.length - 1) return 'end';
        mission.currentIndex = Number(mission.currentIndex) + 1;
        return 'point';
    }
    const path = reconFindPath(mission, target);
    const step = path && path[0];
    if (!step) return 'blocked';
    return moveReconAsset(mission, step);
}

// ---------- Ход: исполнение всех миссий ----------
function advanceReconMissions() {
    const c = reconCampaign();
    if (!c) return;
    const turn = reconTurnNumber();
    // ⚡ v13.168: перед ходом снимаем «забытые» флаги скрытия — разведчик с
    //    флагом, но без активной миссии, не должен оставаться невидимым.
    try { reconcileReconHiddenFlags(); } catch (e) { console.warn('reconcileReconHiddenFlags:', e.message); }
    // отложенные доклады раскрываются, когда подошёл срок
    if (Array.isArray(c.reconPendingReveals) && c.reconPendingReveals.length) {
        const due = c.reconPendingReveals.filter(item => item && Number(item.turn) <= turn);
        const rest = c.reconPendingReveals.filter(item => item && Number(item.turn) > turn);
        c.reconPendingReveals = rest;
        due.forEach(item => {
            const enemy = (c.enemyOpUnits || []).find(e => e && !e.isDestroyed && String(e.name) === String(item.target));
            if (!enemy) return;
            enemy.detected = true;
            if (enemy.noiseMarker) enemy.noiseMarker = false;
            try { if (typeof onlineRevealEnemy === 'function') onlineRevealEnemy(enemy, turn + 1); } catch (e) {}
            if (typeof log === 'function') {
                log(`⏳ Доклад разведки пришёл: враг «${enemy.name}» раскрыт на (${enemy.col},${enemy.row}) до конца следующего хода.`);
            }
        });
    }
    const missions = c.reconMissions || [];
    if (!missions.length) return;
    let dirty = false;
    missions.forEach(mission => {
        if (!mission || !['active', 'observing', 'returning'].includes(mission.status)) return;
        dirty = true;
        // гибель актива — миссия провалена
        if (!reconMissionIsAlive(mission)) {
            // ⚡ v13.168: «носитель не найден» ≠ «актив погиб». Раньше сдвиг
            //    индекса в opUnits закрывал миссию как провал, тип актива
            //    помечался потерянным до конца операции, и разведчик исчезал.
            const carrier = reconMissionUnit(mission);
            if (!carrier) {
                if (typeof log === 'function') {
                    log(`⚠️ [${mission.assetName}] носитель не найден — миссия закрыта без потери актива.`);
                }
                finishReconMission(mission.id, 'completed');
            } else {
                finishReconMission(mission.id, 'failed');
            }
            return;
        }
        if (mission.status === 'active') {
            mission.ap = RECON_TURN_BUDGET;
            let guard = 0;
            let outcome = 'moved';
            while (guard++ < 2000) {
                outcome = reconStepAlongRoute(mission);
                if (outcome === 'moved') {
                    // наблюдение на каждом пройденном гексе
                    if (mission.routeVersion !== 2 && (mission.observeMode === 'pass' || mission.observeMode === 'pause')) {
                        observeInRange(null, mission, getReconObserveRange(mission, mission.currentHex, true), {
                            isScout: true,
                            pauseBonus: mission.observeMode === 'pause' ? 2 : 0
                        });
                    }
                    continue;
                }
                if (outcome === 'point') continue;
                break;
            }
            if (outcome === 'end') {
                const endpoint = mission.route[mission.route.length - 1];
                if (mission.routeVersion === 2 && !endpoint.observe) {
                    mission.status = 'returning';
                    return;
                }
                const range = getReconObserveRange(mission, mission.currentHex, false);
                if (mission.routeVersion !== 2 || mission.lastObservedIndex !== mission.currentIndex) observeInRange(null, mission, range, {
                    isScout: true,
                    pauseBonus: mission.observeMode === 'pause' ? 2 : 0
                });
                if (mission.reportMethod === 'return') {
                    mission.status = 'returning';
                    if (typeof log === 'function') {
                        log(`↩️ [${mission.assetName}] докладывает лично — возвращается в штаб.`);
                    }
                } else {
                    mission.status = 'observing';
                    if (typeof log === 'function') {
                        log(`👁️ [${mission.assetName}] занял наблюдение на (${mission.currentHex.col},${mission.currentHex.row}) — радиус ${range} гексов.`);
                    }
                }
            } else if (outcome === 'blocked' || outcome === 'no_route') {
                if (typeof log === 'function') {
                    log(`⚠️ [${mission.assetName}] маршрут заблокирован на (${mission.currentHex.col},${mission.currentHex.row}) — ждёт следующего хода.`);
                }
            }
        } else if (mission.status === 'observing') {
            mission.ap = RECON_TURN_BUDGET;
            const range = getReconObserveRange(mission, mission.currentHex, false);
            observeInRange(null, mission, range, {
                isScout: true,
                pauseBonus: mission.observeMode === 'pause' ? 2 : 0
            });
        } else if (mission.status === 'returning') {
            // ⚡ v13.167 (п.3): возврат по НАЙДЕННОМУ пути (обход леса/воды), а не
            //    «шаг к штабу по прямой». Если обхода нет два хода подряд —
            //    актив возвращается в расположение принудительно (иначе он
            //    навсегда оставался скрытым с карты — см. п.8).
            mission.ap = RECON_TURN_BUDGET;
            const destination = reconRecallDestination(mission);
            const outcome = reconAdvanceReturn(mission);
            if (outcome === 'arrived') {
                const where = destination ? `(${destination.col},${destination.row})` : 'в расположение';
                if (typeof log === 'function') log(`✅ [${mission.assetName}] вернулся ${where} — снова доступен.`);
                finishReconMission(mission.id, 'completed');
                return;
            }
            if (outcome === 'no_destination') {
                if (typeof log === 'function') log(`✅ [${mission.assetName}] отозван: расположение не найдено, миссия завершена.`);
                finishReconMission(mission.id, 'completed');
                return;
            }
            if (outcome === 'blocked') {
                mission.returnStuck = (Number(mission.returnStuck) || 0) + 1;
                if (mission.returnStuck >= 2) {
                    if (destination) mission.currentHex = { col: Number(destination.col), row: Number(destination.row) };
                    if (typeof log === 'function') {
                        log(`↩️ [${mission.assetName}] обхода к точке отзыва нет — вернулся в расположение ${destination ? `(${destination.col},${destination.row})` : ''} своим ходом.`);
                    }
                    finishReconMission(mission.id, 'completed');
                    return;
                }
                if (typeof log === 'function') {
                    log(`⚠️ [${mission.assetName}] обратный путь перекрыт на (${mission.currentHex.col},${mission.currentHex.row}) — ищет обход.`);
                }
            } else {
                mission.returnStuck = 0;
            }
        }
    });
    // миссии-«наблюдатели» в поле остаются в списке, завершённые — чистим историю
    c.reconMissions = (c.reconMissions || []).filter(m => m && m.status !== 'cancelled');
    if (dirty) {
        initReconAssets();
        if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
    }
}

// ---------- Управление миссией ----------
// ⚡ v13.167 (п.3): отзыв актива. Без аргументов — возврат в СВОЁ расположение
//    (развед-орган батальона — к своему штабу). С гексом — возврат в указанную
//    точку (игрок прокладывает маршрут отзыва сам).
function recallReconMission(missionId, destHex) {
    const c = reconCampaign();
    if (!c) return false;
    const mission = (c.reconMissions || []).find(m => m && String(m.id) === String(missionId));
    if (!mission) return false;
    if (destHex && Number.isFinite(Number(destHex.col)) && Number.isFinite(Number(destHex.row))) {
        mission.recallHex = { col: Number(destHex.col), row: Number(destHex.row) };
    } else if (!mission.recallHex) {
        const destination = reconRecallDestination(mission);
        if (destination) mission.recallHex = { col: destination.col, row: destination.row };
    }
    const destination = reconRecallDestination(mission);
    if (mission.status === 'returning') {
        if (typeof log === 'function') {
            log(`↩️ [${mission.assetName}] уже возвращается${destination ? ` в (${destination.col},${destination.row})` : ''}.`);
        }
        renderReconPanel();
        return true;
    }
    mission.status = 'returning';
    mission.returnStuck = 0;
    const dist = (destination && Number.isFinite(Number(mission.currentHex && mission.currentHex.col)))
        ? ((typeof getOpHexDistance === 'function')
            ? getOpHexDistance(Number(mission.currentHex.col), Number(mission.currentHex.row), destination.col, destination.row) : 0)
        : 0;
    const turns = Math.max(1, Math.ceil(dist / 2));
    if (typeof log === 'function') {
        log(`↩️ [${mission.assetName}] отозван: возвращается ${destination ? `в (${destination.col},${destination.row})` : 'в расположение'} — примерно ${turns} ход(ов).`);
    }
    // отзыв — это приказ, а не «зависание»: подсветка на карте обновится сразу
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
    try { renderReconPanel(); } catch (e) {}
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
    return true;
}
// ⚡ v13.167 (п.3): выбор точки отзыва кликом по карте.
let reconRecallPick = null;
function reconStartRecallPointPick(missionId) {
    const c = reconCampaign();
    if (!c) return false;
    const mission = (c.reconMissions || []).find(m => m && String(m.id) === String(missionId));
    if (!mission) return false;
    reconRecallPick = { missionId: mission.id };
    try { if (typeof closeReconAssetPopup === 'function') closeReconAssetPopup(); } catch (e) {}
    if (typeof log === 'function') log(`📍 [${mission.assetName}] кликните по гексу — туда будет отозван актив.`);
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
    return true;
}
function reconIsPickingRecall() {
    return !!(reconRecallPick && reconRecallPick.missionId);
}
function reconCancelRecallPointPick() {
    reconRecallPick = null;
    return true;
}
function handleReconRecallPickClick(clickX, clickY, size) {
    if (!reconIsPickingRecall()) return false;
    const centers = (typeof appData !== 'undefined' && appData.campaign && appData.campaign.opCenters) || [];
    let closest = null, minDist = Infinity;
    centers.forEach(center => {
        const dist = Math.sqrt((clickX - center.x) ** 2 + (clickY - center.y) ** 2);
        if (dist < minDist) { minDist = dist; closest = center; }
    });
    if (!closest || minDist > size) return false;
    const hex = reconHexFromKey(closest.key);
    const missionId = reconRecallPick.missionId;
    reconRecallPick = null;
    if (!hex) return true;
    recallReconMission(missionId, hex);
    return true;
}
function changeReconMissionOrder(missionId, newOrder) {
    const c = reconCampaign();
    if (!c) return false;
    const mission = (c.reconMissions || []).find(m => m && String(m.id) === String(missionId));
    if (!mission || !newOrder) return false;
    const hq = reconNearestHQ(mission);
    const assetUnit = reconMissionUnit(mission);
    const canRadio = reconUnitHasRadio(assetUnit) && hq && reconUnitHasRadio(hq.unit);
    if (!canRadio) {
        if (typeof log === 'function') {
            log(`⛔ [${mission.assetName}] нет рации у актива и штаба — новый приказ только посыльным или после возврата.`);
        }
        return false;
    }
    if (Array.isArray(newOrder.route) && newOrder.route.length) {
        const route = reconPlanRoute(mission.assetKind, mission.currentHex,
            newOrder.route.slice(0, RECON_ROUTE_MAX_POINTS));
        if (!route || !route.length) return false;
        mission.route = route;
        mission.routeVersion = 2;
        mission.stealth = mission.assetKind === 'foot';
        mission.lastObservedIndex = null;
        mission.currentIndex = 0;
        mission.status = 'active';
    }
    if (newOrder.observeMode) mission.observeMode = newOrder.observeMode;
    if (newOrder.reportMethod) mission.reportMethod = newOrder.reportMethod;
    if (typeof log === 'function') log(`📡 [${mission.assetName}] новый приказ по рации принят.`);
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
    return true;
}

// ---------- Приказ «Наблюдение» (любой юнит) ----------
function executeObserveOrder(unit, order) {
    if (!unit || !order) return;
    // ⚡ §6.2: юнит остаётся на месте, ОД не тратит; каждый ход — проверка радиуса 5 с −1
    if (!Number.isFinite(Number(unit.col))) { order.status = 'cancelled'; return; }
    if (unit.isInBattle) return; // приказ живёт, пока идёт бой
    const missionLike = {
        id: order.id ? `observe-${order.id}` : 'observe',
        assetName: unit.name,
        currentHex: { col: Number(unit.col), row: Number(unit.row) },
        reportMethod: 'radio',
        unitId: (reconCampaign() && (reconCampaign().opUnits || []).indexOf(unit) >= 0)
            ? (reconCampaign().opUnits || []).indexOf(unit) : null,
        assetKey: null
    };
    const result = observeInRange(unit, missionLike, RECON_RANGE_STANDING, { penalty: -1 });
    // приказ бессрочный: остаётся active, пока не отменят или не втянут в бой
    order.status = 'active';
    order.lastObserveTurn = reconTurnNumber();
    order.observedCount = (Number(order.observedCount) || 0) + result.found.length;
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
    return result;
}

// ---------- Панель «🔍 Разведка» ----------
function reconFindUnitIndex(unitOrId) {
    const c = reconCampaign();
    if (!c) return -1;
    if (typeof unitOrId === 'number') return unitOrId;
    if (!unitOrId) return -1;
    return (c.opUnits || []).indexOf(unitOrId);
}
function openReconMissionModal(unitId, squadName) {
    const c = reconCampaign();
    if (!c) return false;
    // ⚡ при открытии на конкретном юните — сразу подставляем его актив
    const unit = (typeof unitId === 'number') ? (c.opUnits || [])[unitId] : null;
    const key = unit ? reconAssetKeyForUnit(unit) : null;
    reconDraft = {
        assetKey: key,
        unitId: (typeof unitId === 'number') ? unitId : null,
        squadName: squadName || null,
        // ⚡ v13.171 (п.1): какой ИМЕННО носитель актива выбран в панели
        sourceIndex: null,
        route: [],
        observeMode: 'stationary',
        reportMethod: 'radio',
        missionId: null,
        pickingRoute: true
    };
    return showReconPanel(true);
}
// ⚡ v13.163: выдача приказа на разведку ИЗ ШТАБА — конкретным развед-отрядом
//    штаба (мотоциклист-разведчик BeVe, AL-41 Hidalgo A.I.R.F.).
//    Штаб — узел выдачи: сам он не двигается, в миссию уходит его отряд.
function openReconMissionModalForAsset(unitId, assetKey) {
    const c = reconCampaign();
    if (!c) return false;
    const def = RECON_ASSET_TYPES[assetKey];
    if (!def || !def.canRecon) return false;
    const sources = reconListAssetSources().filter(source => source.assetKey === assetKey &&
        (unitId === null || unitId === undefined || Number(source.unitId) === Number(unitId)));
    const source = sources[0] || null;
    openReconMissionModal(
        source ? source.unitId : unitId,
        source ? source.squadName : null
    );
    if (reconDraft) {
        reconDraft.assetKey = assetKey;
        // ⚡ v13.171 (п.1): конкретная машина выбирается в панели — здесь только
        //    подсказываем первую свободную этого типа.
        reconDraft.sourceIndex = reconSourceIndex(source);
    }
    renderReconPanel();
    return true;
}
// ⚡ v13.165 (п.3): меню разведки — третья вкладка левого дока (как «Связь» и
//    «Снабжение»). Клик по вкладке открывает док; повторный клик закрывает его.
function showReconPanel(force) {
    const panel = (typeof document !== 'undefined') ? document.getElementById('reconPanel') : null;
    const hasDock = (typeof window !== 'undefined' && typeof window.openOperationalSidePanel === 'function');
    if (hasDock) {
        let alreadyOpen = false;
        try {
            alreadyOpen = typeof window.isOperationalSidePanelOpen === 'function' && window.isOperationalSidePanelOpen('recon');
        } catch (e) { alreadyOpen = false; }
        if (alreadyOpen && !force) {
            window.closeOperationalSidePanels();
            if (panel) panel.style.display = 'none';
            reconDraft = reconDraft || null;
            if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
            return true;
        }
        window.openOperationalSidePanel('recon', true);
    }
    if (panel) panel.style.display = 'block';
    if (!reconDraft) {
        reconDraft = {
            assetKey: null, unitId: null, squadName: null, sourceIndex: null, route: [],
            observeMode: 'stationary', reportMethod: 'radio', missionId: null, pickingRoute: false
        };
    }
    renderReconPanel();
    return true;
}
function closeReconPanel() {
    const panel = (typeof document !== 'undefined') ? document.getElementById('reconPanel') : null;
    if (panel) panel.style.display = 'none';
    // ⚡ v13.165 (п.3): панель живёт в левом доке — закрываем и док, иначе
    //    остаётся пустая колонка «🔍 Разведка».
    try {
        if (typeof window !== 'undefined' && typeof window.isOperationalSidePanelOpen === 'function' &&
            window.isOperationalSidePanelOpen('recon') && typeof window.closeOperationalSidePanels === 'function') {
            window.closeOperationalSidePanels();
        }
    } catch (e) {}
    reconDraft = null;
    if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
    return true;
}
function cancelReconMissionModal() {
    return closeReconPanel();
}
function reconSelectAsset(assetKey) {
    if (!reconDraft) showReconPanel();
    if (!reconDraft) return false;
    reconDraft.assetKey = assetKey;
    reconDraft.unitId = null;
    reconDraft.squadName = null;
    reconDraft.sourceIndex = null;
    reconDraft.pickingRoute = true;
    renderReconPanel();
    return true;
}
function reconSetObserveMode(mode) {
    if (!reconDraft) return false;
    if (['pass', 'pause', 'stationary'].includes(mode)) reconDraft.observeMode = mode;
    renderReconPanel();
    return true;
}
function reconSetReportMethod(method) {
    if (!reconDraft) return false;
    if (['radio', 'messenger', 'return'].includes(method)) reconDraft.reportMethod = method;
    renderReconPanel();
    return true;
}
function reconClearRoute() {
    if (!reconDraft) return false;
    reconDraft.route = [];
    renderReconPanel();
    if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
    return true;
}
// ⚡ v13.163: пауза/продолжение набора маршрута. Раньше pickingRoute держался
//    до отправки миссии, и клики по своим отрядам уходили в маршрут — выбрать
//    другой отряд было невозможно, пока открыта панель разведки.
function reconPauseRoutePicking() {
    if (!reconDraft || !reconDraft.pickingRoute) return false;
    reconDraft.pickingRoute = false;
    renderReconPanel();
    if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
    return true;
}
function reconResumeRoutePicking() {
    if (!reconDraft) showReconPanel();
    if (!reconDraft) return false;
    reconDraft.pickingRoute = true;
    renderReconPanel();
    return true;
}
function reconIsPickingRoute() {
    return !!(reconDraft && reconDraft.pickingRoute);
}
// Клик по карте во время набора маршрута
function handleReconRouteDraftClick(clickX, clickY, size) {
    if (!reconDraft || !reconDraft.pickingRoute) return false;
    let closest = null, minDist = Infinity;
    const centers = (typeof appData !== 'undefined' && appData.campaign && appData.campaign.opCenters) || [];
    centers.forEach(center => {
        const dist = Math.sqrt((clickX - center.x) ** 2 + (clickY - center.y) ** 2);
        if (dist < minDist) { minDist = dist; closest = center; }
    });
    if (!closest || minDist > size) return false;
    const hex = reconHexFromKey(closest.key);
    if (!hex) return false;
    if (!Array.isArray(reconDraft.route)) reconDraft.route = [];
    if (reconDraft.route.length >= RECON_ROUTE_MAX_POINTS) {
        if (typeof log === 'function') log(`⚠️ Маршрут разведки — не больше ${RECON_ROUTE_MAX_POINTS} точек.`);
        return true;
    }
    const last = reconDraft.route[reconDraft.route.length - 1];
    if (last && Number(last.col) === hex.col && Number(last.row) === hex.row) return true;
    reconDraft.route.push({ ...hex, observe: true });
    renderReconPanel();
    if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
    return true;
}
function buildReconMissionRoute() {
    return (reconDraft && Array.isArray(reconDraft.route)) ? reconDraft.route.slice() : [];
}
function reconSubmitMission() {
    if (!reconDraft) return null;
    const c = reconCampaign();
    if (c && c.online && typeof onlineMyTurnActive === 'function' && !onlineMyTurnActive()) {
        reconMissionFeedback('⏳ Сейчас ход оппонента. Черновик разведки сохранён в открытом меню.', false);
        return null;
    }
    // ⚡ v13.171 (п.1): отправляем ИМЕННО выбранную машину (а не первую свободную)
    if (reconDraft.assetKey && !reconDraft.missionId) reconDraftEnsureSource();
    const route = (reconDraft.route || []).slice();
    if (!reconDraft.assetKey) {
        reconMissionFeedback('⛔ Разведка: сначала выберите актив.', false);
        return null;
    }
    if (!route.length) {
        reconMissionFeedback('⛔ Разведка: кликните по карте, чтобы задать маршрут.', false);
        return null;
    }
    if (reconDraft.missionId) {
        const ok = changeReconMissionOrder(reconDraft.missionId, {
            route, observeMode: reconDraft.observeMode, reportMethod: reconDraft.reportMethod
        });
        if (ok) { closeReconPanel(); reconMissionFeedback('✅ Новый маршрут разведки передан.', true); }
        else reconMissionFeedback('⛔ Приказ не передан: нет связи или проходимого маршрута.', false);
        return ok;
    }
    const mission = createReconMission({
        assetKey: reconDraft.assetKey,
        unitId: reconDraft.unitId,
        squadName: reconDraft.squadName,
        route,
        observeMode: reconDraft.observeMode,
        reportMethod: reconDraft.reportMethod
    });
    if (mission) {
        closeReconPanel();
        reconMissionFeedback('✅ Задача разведки передана: ' + mission.assetName + '. Маршрут принят.', true);
    } else reconMissionFeedback('⛔ Разведка не отправлена: актив занят, потерян или маршрут непроходим.', false);
    return mission;
}
// «📡 Новый приказ» для активной миссии — по рации, без возврата
function reconNewOrderForMission(missionId) {
    const c = reconCampaign();
    if (!c) return false;
    const mission = (c.reconMissions || []).find(m => m && String(m.id) === String(missionId));
    if (!mission) return false;
    reconDraft = {
        assetKey: mission.assetKey,
        unitId: mission.unitId,
        squadName: mission.squadName,
        route: [],
        observeMode: mission.observeMode,
        reportMethod: mission.reportMethod,
        missionId: mission.id,
        pickingRoute: true
    };
    return showReconPanel(true);
}
function reconMissionStatusLabel(mission) {
    if (!mission) return '';
    const labels = {
        active: '➡️ на маршруте',
        observing: '👁️ наблюдает',
        returning: '↩️ отозван, возвращается',
        completed: '✅ завершена',
        failed: '❌ провалена'
    };
    return labels[mission.status] || mission.status;
}
function reconMissionsPanelHtml() {
    const c = reconCampaign();
    if (!c) return '';
    const list = reconActiveMissions();
    if (!list.length) return '';
    const rows = list.map(mission => {
        const hex = mission.currentHex ? `(${mission.currentHex.col},${mission.currentHex.row})` : '—';
        const destination = reconRecallDestination(mission);
        const eta = mission.status === 'returning' && destination
            ? ` · возврат в (${destination.col},${destination.row})` : '';
        // ⚡ v13.167 (п.5): кнопки больше не вылезают за пределы панели —
        //    строки и кнопки переносятся (классы recon-mission-*).
        return `<div class="recon-mission-row">
            <span class="recon-mission-title">🔍 <b>${mission.assetName}</b> — на ${hex}, ${reconMissionStatusLabel(mission)}${eta}</span>
            <span class="recon-mission-actions">
              <button type="button" onclick="reconSelectMissionAsset('${mission.id}')" title="Выбрать актив как юнит">👆 Выбрать</button>
              <button type="button" onclick="reconNewOrderForMission('${mission.id}')" style="background:#2980b9;">📡 Новый приказ</button>
              <button type="button" onclick="recallReconMission('${mission.id}')" style="background:#7f3b30;">↩️ Отозвать</button>
              <button type="button" onclick="reconStartRecallPointPick('${mission.id}')" style="background:#8e44ad;" title="Кликните по карте — туда будет отозван актив">📍 Точка отзыва</button>
            </span>
        </div>`;
    }).join('');
    return `<div class="recon-missions-block">
        <b style="color:#5dade2;">🔍 Активные разведывательные миссии:</b>${rows}</div>`;
}
function renderReconPanel() {
    const panel = (typeof document !== 'undefined') ? document.getElementById('reconPanel') : null;
    if (!panel) return false;
    const c = reconCampaign();
    if (!c) return false;
    // ⚡ v13.168: панель — ещё одна точка самовосстановления (сейвы со старыми
    //    «висящими» флагами разведчиков чинятся при первом открытии).
    try { reconcileReconHiddenFlags(); } catch (e) {}
    if (!c.reconAssets || !Object.keys(c.reconAssets).length) initReconAssets();
    if (!reconDraft) {
        reconDraft = {
            assetKey: null, unitId: null, squadName: null, sourceIndex: null, route: [],
            observeMode: 'stationary', reportMethod: 'radio', missionId: null, pickingRoute: false
        };
    }
    const assets = getReconAssetList();
    if (reconDraft.missionId && !assets.some(a => a.key === reconDraft.assetKey)) {
        const def = RECON_ASSET_TYPES[reconDraft.assetKey];
        if (def) assets.push({ key: reconDraft.assetKey, name: def.name, available: 0, total: 1 });
    }
    if (!assets.length) {
        panel.innerHTML = `<b style="color:#f1c40f;">🔍 Разведка</b>
            <div style="color:#bbb; font-size:.85rem; margin-top:4px;">Нет доступных разведывательных активов: в батальоне нет мотоциклистов, бронеавтомобилей, развед.взвода или Hidalgo — либо все они на задании.</div>
            ${reconMissionsPanelHtml()}`;
        return true;
    }
    if (!reconDraft.assetKey) {
        reconDraft.assetKey = assets[0].key;
        reconDraft.pickingRoute = true;
    }
    const unavailable = reconDraft.assetKey && !assets.some(a => a.key === reconDraft.assetKey)
        ? `<option value="${reconDraft.assetKey}" selected disabled>Выбранный актив занят или недоступен</option>` : '';
    const assetOptions = unavailable + assets.map(asset =>
        `<option value="${asset.key}" ${reconDraft.assetKey === asset.key ? 'selected' : ''}>${asset.name} (${asset.available}/${asset.total})</option>`
    ).join('');
    // ⚡ v13.171 (п.1): какую именно машину отправить (у BeVe — Landsverk №1/№2/№3)
    if (reconDraft.assetKey && !reconDraft.missionId) reconDraftEnsureSource();
    const sourceList = reconAvailableSources(reconDraft.assetKey);
    const sourceSelect = sourceList.length > 1
        ? `<div style="margin-top:6px; font-size:.82rem; color:#ddd;">
            <label>Машина: <select onchange="reconSelectSource(this.value)" style="background:#444; color:#fff; max-width:240px;">
                ${sourceList.map((source, index) => {
                    const chosen = Number(reconDraft.unitId) === Number(source.unitId) &&
                        String(reconDraft.squadName || '') === String(source.squadName || '');
                    return `<option value="${index}" ${chosen ? 'selected' : ''}>${reconSourceName(source)}</option>`;
                }).join('')}
            </select></label>
            <div style="color:#888; font-size:.75rem;">В разведку уйдёт именно эта машина: у каждой свой гекс, экипаж и своя судьба.</div>
        </div>`
        : (sourceList.length === 1
            ? `<div style="margin-top:4px; color:#8ecbff; font-size:.78rem;">Машина: ${reconSourceName(sourceList[0])}</div>`
            : '');
    const preview = reconDraftPreviewRoute();
    const routeText = preview && preview.length
        ? preview.map(point => `${point.observe ? '👁️ ' : ''}(${point.col},${point.row})`).join(' → ')
        : ((reconDraft.route || []).length ? '⛔ Нет проходимого маршрута от выбранного актива' : 'кликните по гексам на карте');
    const observationChecks = (reconDraft.route || []).map((point, index) =>
        `<label class="recon-observation-point"><input type="checkbox" ${point.observe !== false ? 'checked' : ''}
          onchange="reconToggleObservation(${index},this.checked)"> 👁️ Разведать (${point.col},${point.row})</label>`).join('');
    const modeRadio = [['pass', 'Наблюдать в отмеченных местах'], ['stationary', 'Занять в конце'], ['pause', 'Пауза в отмеченных местах (+2)']]
        .map(([value, label]) => `<label style="margin-right:10px; color:#ddd; font-size:.8rem;">
            <input type="radio" name="reconMode" value="${value}" ${reconDraft.observeMode === value ? 'checked' : ''}
                   onchange="reconSetObserveMode('${value}')"> ${label}</label>`).join('');
    const reportRadio = [['radio', 'Рация (мгновенно)'], ['messenger', 'Посыльный'], ['return', 'Вернуться в штаб']]
        .map(([value, label]) => `<label style="margin-right:10px; color:#ddd; font-size:.8rem;">
            <input type="radio" name="reconReport" value="${value}" ${reconDraft.reportMethod === value ? 'checked' : ''}
                   onchange="reconSetReportMethod('${value}')"> ${label}</label>`).join('');
    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <b style="color:#5dade2;">🔍 Разведывательная миссия</b>
            <button onclick="closeReconPanel()" style="background:#555; font-size:.75rem; padding:2px 7px;">✖ Закрыть</button>
        </div>
        <div style="margin-top:6px; font-size:.82rem; color:#ddd;">
            <label>1. Актив:
                <select onchange="reconSelectAsset(this.value)" style="background:#444; color:#fff; max-width:240px;">
                    ${assetOptions}
                </select>
            </label>
        </div>
        ${sourceSelect}
        <div style="margin-top:6px; font-size:.82rem; color:#ddd;">
            2. Полный маршрут: <span style="color:#f1c40f;">${routeText}</span>
            <div>${observationChecks}</div>
            ${RECON_ASSET_TYPES[reconDraft.assetKey] && RECON_ASSET_TYPES[reconDraft.assetKey].kind === 'foot' ? '<div>🥷 Пешая разведка всегда движется скрытно.</div>' : ''}
            <button onclick="reconClearRoute()" style="background:#555; font-size:.7rem; padding:1px 6px; margin-left:6px;">Очистить маршрут</button>
            ${reconDraft.pickingRoute
                ? `<button onclick="reconPauseRoutePicking()" style="background:#7f6a2b; font-size:.7rem; padding:1px 6px; margin-left:4px;" title="Клики по карте снова выбирают отряды, маршрут сохраняется">✋ Закончить набор</button>`
                : `<button onclick="reconResumeRoutePicking()" style="background:#2980b9; font-size:.7rem; padding:1px 6px; margin-left:4px;" title="Клики по гексам снова добавляют точки маршрута">➕ Добавить точки</button>`}
            <div style="color:#888; font-size:.75rem;">${reconDraft.pickingRoute
                ? `Клик задаёт изгиб маршрута (до ${RECON_ROUTE_MAX_POINTS}). Между ними строится проходимый путь. Галочками отметьте, где провести разведку; остальные гексы — только движение. Клик по своему отряду прерывает набор и выбирает отряд.`
                : 'Набор точек приостановлен — клики по карте выбирают отряды. Маршрут сохранён.'}</div>
        </div>
        <div style="margin-top:6px; font-size:.82rem; color:#ddd;">3. Наблюдение: ${modeRadio}</div>
        <div style="margin-top:4px; font-size:.82rem; color:#ddd;">4. Доклад: ${reportRadio}</div>
        <div style="margin-top:8px; display:flex; gap:8px;">
            <button onclick="reconSubmitMission()" style="background:#27ae60;">🚀 ${reconDraft.missionId ? 'Передать приказ' : 'Отправить'}</button>
            <button onclick="cancelReconMissionModal()" style="background:#7f3b30;">Отмена</button>
        </div>
        ${reconMissionsPanelHtml()}`;
    return true;
}

// ---------- Карта: маршруты миссий и иконки активов ----------
// ⚡ v13.165 (п.4): на карте у выполняющего приказ разведотряда рисуется ЕГО
//    иконка (тот же файл, что в карточке), а не безликая лупа 🔍.
const reconAssetIconImages = {};
function reconAssetImage(src) {
    if (!src || typeof Image === 'undefined') return null;
    let img = reconAssetIconImages[src];
    if (!img) {
        img = new Image();
        img.src = src;
        img.onload = () => { if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} } };
        reconAssetIconImages[src] = img;
    }
    return (img.complete && img.naturalWidth > 0) ? img : null;
}
function reconMissionIcon(mission) {
    const def = RECON_ASSET_TYPES[mission && mission.assetKey];
    if (def && def.icon) return def.icon;
    const unit = reconMissionUnit(mission);
    return (unit && unit.icon) || null;
}
// ═══════════════════════════════════════════════════════════════════════════
// ⚡ v13.167 (п.6): развед-актив на карте — это «юнит», который можно ВЫБРАТЬ.
//    Мотоциклист-разведчик при штабе BeVe и Hidalgo при штабе A.I.R.F. уходят
//    в миссию ОТДЕЛЕНИЕМ внутри штаба и как самостоятельные юниты на карте не
//    рисуются — кликнуть по ним было нечем, и отозвать/переприказать их можно
//    было только из панели, если догадаться её открыть. Теперь у иконки миссии
//    есть карточка актива: отозвать (в своё расположение или в выбранную точку)
//    и отдать новый приказ на разведку.
// ═══════════════════════════════════════════════════════════════════════════
function reconMissionById(missionId) {
    const c = reconCampaign();
    if (!c) return null;
    return (c.reconMissions || []).find(m => m && String(m.id) === String(missionId)) || null;
}
// Иконка миссии в пиксельных координатах карты (та же формула, что в отрисовке).
function reconMissionIconCenter(mission, size) {
    const hex = mission && mission.currentHex;
    if (!hex || !Number.isFinite(Number(hex.col))) return null;
    return {
        x: Number(hex.col) * Math.sqrt(3) * size + (Number(hex.row) % 2) * Math.sqrt(3) * size / 2 + Math.sqrt(3) * size / 2,
        y: Number(hex.row) * 1.5 * size + size,
        radius: Math.max(10, size * 0.40)
    };
}
function opReconMissionAtPoint(clickX, clickY, size) {
    if (!reconCampaign()) return null;
    let best = null, bestDist = Infinity;
    reconActiveMissions().forEach(mission => {
        const center = reconMissionIconCenter(mission, size);
        if (!center) return;
        const dist = Math.hypot(Number(clickX) - center.x, Number(clickY) - center.y);
        if (dist <= Math.max(14, center.radius) && dist < bestDist) { bestDist = dist; best = mission; }
    });
    return best;
}
function reconSelectMissionAsset(missionId) {
    const mission = reconMissionById(missionId);
    if (!mission) return false;
    const c = reconCampaign();
    if (c) c.selectedReconMissionId = mission.id;
    openReconAssetPopup(mission.id);
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
    return true;
}
function closeReconAssetPopup() {
    const popup = (typeof document !== 'undefined') ? document.getElementById('reconAssetPopup') : null;
    if (popup) { popup.hidden = true; popup.style.display = 'none'; }
    const c = reconCampaign();
    if (c && c.selectedReconMissionId) c.selectedReconMissionId = null;
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
    return true;
}
function openReconAssetPopup(missionId) {
    if (typeof document === 'undefined') return false;
    const mission = reconMissionById(missionId);
    if (!mission) return false;
    const c = reconCampaign();
    if (c) c.selectedReconMissionId = mission.id;
    let popup = document.getElementById('reconAssetPopup');
    if (!popup) {
        popup = document.createElement('aside');
        popup.id = 'reconAssetPopup';
        popup.className = 'op-unit-drawer recon-asset-drawer';
        popup.setAttribute('role', 'dialog');
        document.body.appendChild(popup);
    }
    const esc = (value) => String(value == null ? '' : value)
        .replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const destination = reconRecallDestination(mission);
    const iconSrc = reconMissionIcon(mission);
    const routeText = (mission.route || []).map(point => `(${point.col},${point.row})`).join(' → ') || '—';
    const hq = reconNearestHQ(mission);
    const radio = reconUnitHasRadio(reconMissionUnit(mission)) || reconOrganHasRadio(mission);
    const found = (mission.foundEnemies || []).length;
    const modeLabel = { pass: 'проходить', stationary: 'занять в конце', pause: 'пауза на точках (+2)' }[mission.observeMode] || mission.observeMode;
    const reportLabel = { radio: 'рация', messenger: 'посыльный', return: 'вернуться в штаб' }[mission.reportMethod] || mission.reportMethod;
    popup.innerHTML =
        `<div class="op-unit-drawer-head">${iconSrc ? `<img src="${esc(iconSrc)}" alt="">` : '<span class="op-unit-drawer-icon">🔍</span>'}` +
        `<div><b>${esc(mission.assetName || 'Развед-актив')}</b><small>разведывательная миссия · ${esc(mission.assetKey || '')}</small></div>` +
        `<button type="button" aria-label="Закрыть" onclick="closeReconAssetPopup()">×</button></div>` +
        `<div class="op-unit-drawer-stats">` +
        `<span>📍 Сейчас</span><b>(${esc(mission.currentHex ? mission.currentHex.col : '—')},${esc(mission.currentHex ? mission.currentHex.row : '—')})</b>` +
        `<span>🚦 Состояние</span><b>${esc(reconMissionStatusLabel(mission))}</b>` +
        `<span>🎯 Возврат</span><b>${destination ? `(${destination.col},${destination.row})` : '—'}</b>` +
        `<span>📡 Доклад</span><b>${esc(reportLabel)}${radio ? ' · рация' : ''}</b>` +
        `<span>👁️ Режим</span><b>${esc(modeLabel)}</b>` +
        `<span>🔎 Найдено</span><b>${found}</b>` +
        `<span>🧭 Маршрут</span><b>${esc(routeText)}</b>` +
        (hq ? `<span>🏳️ Штаб</span><b>${esc(hq.unit.name || 'штаб')} · ${esc(hq.distance)} гекс.</b>` : '') +
        `</div>` +
        `<div class="op-unit-drawer-cards recon-asset-actions">` +
        `<button type="button" onclick="recallReconMission('${mission.id}')" style="background:#7f3b30;">↩️ Отозвать в своё расположение</button>` +
        `<button type="button" onclick="reconStartRecallPointPick('${mission.id}')" style="background:#8e44ad;">📍 Отозвать в точку…</button>` +
        `<button type="button" onclick="reconNewOrderForMission('${mission.id}')" style="background:#2980b9;">📡 Новый приказ на разведку</button>` +
        `<button type="button" onclick="showReconPanel(true)" style="background:#555;">🔍 Панель разведки</button>` +
        `</div>`;
    popup.hidden = false;
    popup.style.display = 'block';
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
    return true;
}

function drawReconMissionOverlay(ctx, size) {
    const c = reconCampaign();
    if (!ctx || !c) return;
    const missions = reconActiveMissions();
    const draft = (reconDraft && Array.isArray(reconDraft.route) && reconDraft.route.length)
        ? reconDraft : null;
    if (!missions.length && !draft) return;
    const center = (hex) => ({
        x: Number(hex.col) * Math.sqrt(3) * size + (Number(hex.row) % 2) * Math.sqrt(3) * size / 2 + Math.sqrt(3) * size / 2,
        y: Number(hex.row) * 1.5 * size + size
    });
    const drawRoute = (points, color) => {
        if (!points || points.length < 1) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.setLineDash([Math.max(6, size * 0.18), Math.max(5, size * 0.12)]);
        ctx.beginPath();
        points.forEach((point, index) => {
            const p = center(point);
            if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    };
    ctx.save();
    missions.forEach(mission => {
        const points = [];
        if (mission.currentHex) points.push(mission.currentHex);
        const route = mission.route || [];
        const from = Math.min(Number(mission.currentIndex) || 0, route.length - 1);
        for (let i = from; i < route.length; i++) points.push(route[i]);
        drawRoute(points, 'rgba(93,173,226,.9)');
        // ⚡ v13.165 (п.4): иконка САМОГО отряда, выполняющего разведприказ.
        if (mission.currentHex) {
            const p = center(mission.currentHex);
            const radius = Math.max(10, size * 0.40);
            const iconSrc = reconMissionIcon(mission);
            const iconImg = iconSrc ? reconAssetImage(iconSrc) : null;
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(20,30,45,.92)';
            ctx.fill();
            ctx.strokeStyle = '#5dade2';
            ctx.lineWidth = Math.max(2, size * 0.06);
            ctx.stroke();
            if (iconImg) {
                const box = radius * 2 * 0.88;
                const scale = Math.min(box / iconImg.naturalWidth, box / iconImg.naturalHeight);
                const w = iconImg.naturalWidth * scale;
                const h = iconImg.naturalHeight * scale;
                ctx.save();
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius * 0.96, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(iconImg, p.x - w / 2, p.y - h / 2, w, h);
                ctx.restore();
            } else {
                ctx.fillStyle = '#8ecbff';
                ctx.font = `bold ${Math.max(10, radius)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔍', p.x, p.y + 0.5);
            }
            ctx.restore();
            // ⚡ v13.168: под иконкой актива всегда видно, ГДЕ он находится.
            //    Раньше разведчик «пропадал»: иконка есть, но ни координат, ни
            //    подписи — по карте не понять, где именно мотоциклист.
            try {
                const arrow = mission.status === 'returning' ? '↩' : (mission.status === 'observing' ? '👁' : '➡');
                const label = `${arrow}(${mission.currentHex.col},${mission.currentHex.row})`;
                const fontSize = Math.max(9, size * 0.26);
                ctx.save();
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                let textWidth = fontSize * 4;
                try {
                    if (typeof ctx.measureText === 'function') {
                        const m = ctx.measureText(label);
                        if (m && Number.isFinite(m.width) && m.width > 0) textWidth = m.width;
                    }
                } catch (e) {}
                const padX = fontSize * 0.35;
                const boxW = textWidth + padX * 2;
                const boxH = fontSize * 1.35;
                const boxY = p.y + radius * 1.05 + boxH / 2;
                ctx.fillStyle = 'rgba(20,30,45,.88)';
                ctx.strokeStyle = '#5dade2';
                ctx.lineWidth = Math.max(1, size * 0.02);
                ctx.beginPath();
                ctx.rect(p.x - boxW / 2, boxY - boxH / 2, boxW, boxH);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#dfefff';
                ctx.fillText(label, p.x, boxY + 0.5);
                ctx.restore();
            } catch (e) {}
        }
        // ⚡ v13.167 (п.6): выбранный актив подсвечивается, как выбранный юнит.
        try {
            const camp = reconCampaign();
            if (camp && camp.selectedReconMissionId && String(camp.selectedReconMissionId) === String(mission.id) && mission.currentHex) {
                const p = center(mission.currentHex);
                const radius = Math.max(10, size * 0.40);
                ctx.save();
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = Math.max(3, size * 0.08);
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius + Math.max(4, size * 0.10), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        } catch (e) {}
        // маркер точки наблюдения (глаз) на конечной точке
        const observationPoints = mission.routeVersion === 2 ? route.filter(point => point.observe) : route.slice(-1);
        observationPoints.forEach(point => {
          if (mission.status !== 'returning') {
            const p = center(point);
            ctx.save();
            ctx.fillStyle = '#f1c40f';
            ctx.font = `bold ${Math.max(10, size * 0.34)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('👁️', p.x, p.y - size * 0.55);
            ctx.restore();
          }
        });
    });
    if (draft) {
        const preview = reconDraftPreviewRoute();
        if (preview) drawRoute(preview, 'rgba(241,196,15,.95)');
        (draft.route || []).filter(point => point.observe !== false).forEach(point => {
            const p = center(point);
            ctx.font = `bold ${Math.max(12, size * 0.34)}px Arial`;
            ctx.fillStyle = '#f1c40f';
            ctx.fillText('👁️', p.x, p.y - size * 0.4);
        });
    }
    ctx.restore();
}
