// ⚡ BUILD-МАРКЕР: v13.157 — разведывательные миссии и приказ «Наблюдение»
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
    beve_armored_car: {
        name: 'Бронеавтомобиль', faction: 'BeVe', kind: 'armored_car',
        canRecon: true, icon: null,
        // дорога / трава / кусты; НЕ лес, холм, болото, камни
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
    if (squad.reconAssetKey) return squad.reconAssetKey;
    const name = String(squad.name || '');
    if (/Мотоциклист-разведчик/i.test(name)) return 'beve_motorcycle_scout';
    if (/Мотоциклист-посыльный/i.test(name)) return 'beve_motorcycle_messenger';
    if (/AL-41\s*Hidalgo|Hidalgo/i.test(name)) return 'airf_hidalgo';
    if (/Штаб развед\. взвода|Развед\. отделение/i.test(name)) return 'airf_recon_platoon';
    if (/Бронеавтомобиль|Landsverk/i.test(name)) return 'beve_armored_car';
    return null;
}
// Юнит, который сам является активом (бронеавтомобиль, развед.взвод).
function reconStandaloneKeyForUnit(unit) {
    if (!unit) return null;
    if (unit.reconAssetKey) return unit.reconAssetKey;
    if (unit.type === 'recon_platoon') return 'airf_recon_platoon';
    const name = String(unit.name || '');
    if (/^Развед\.?\s*взвод/i.test(name)) return 'airf_recon_platoon';
    if ((unit.type === 'vehicle' || unit.type === 'armored_vehicle_platoon') &&
        /Бронеавтомобиль|Landsverk/i.test(name)) return 'beve_armored_car';
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
function initReconAssets() {
    const c = reconCampaign();
    if (!c) return null;
    const counts = {};
    reconListAssetSources().forEach(source => {
        counts[source.assetKey] = (counts[source.assetKey] || 0) + 1;
    });
    const assets = {};
    Object.keys(RECON_ASSET_TYPES).forEach(key => {
        let total = counts[key] || 0;
        // ⚡ потеря актива (гибель) закрывает этот тип до конца операции
        if (c.reconLost && c.reconLost[key]) total = 0;
        const busy = reconActiveMissions().filter(m => m && m.assetKey === key).length;
        assets[key] = { total, available: Math.max(0, total - busy) };
    });
    c.reconAssets = assets;
    return assets;
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
    if (!c.reconAssets || !Object.keys(c.reconAssets).length) initReconAssets();
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
    // если передан конкретный юнит/отряд — активы этого юнита идут первыми
    if (unitOrSquad) {
        const unitId = typeof unitOrSquad === 'number' ? unitOrSquad
            : ((c.opUnits || []).indexOf(unitOrSquad));
        if (unitId >= 0) out.sort((a, b) => {
            const aOwn = a.sources.some(s => s.unitId === unitId) ? 0 : 1;
            const bOwn = b.sources.some(s => s.unitId === unitId) ? 0 : 1;
            return aOwn - bOwn;
        });
    }
    return out;
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
    return Math.max(1, maxSpeed / speed);
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
        const assetRadio = reconUnitHasRadio(assetUnit);
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
function reconMissionUnit(mission) {
    const c = reconCampaign();
    if (!c || !mission) return null;
    if (mission.unitId !== null && mission.unitId !== undefined) {
        return (c.opUnits || [])[Number(mission.unitId)] || null;
    }
    return null;
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
    } else {
        if (mission.status === 'completed') releaseReconAsset(mission.assetKey);
        if (mission.unitId !== null && mission.unitId !== undefined) {
            const unit = reconMissionUnit(mission);
            if (unit) {
                delete unit.reconMissionId;
                delete unit.reconHidden;
                if (mission.currentHex) {
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
function createReconMission(opts) {
    opts = opts || {};
    const c = reconCampaign();
    if (!c) return null;
    const assetKey = opts.assetKey;
    const def = RECON_ASSET_TYPES[assetKey];
    if (!def || !def.canRecon) return null;
    const route = (Array.isArray(opts.route) ? opts.route : [])
        .map(point => ({ col: Number(point && point.col), row: Number(point && point.row) }))
        .filter(point => Number.isFinite(point.col) && Number.isFinite(point.row))
        .slice(0, RECON_ROUTE_MAX_POINTS);
    if (!route.length) return null;
    if (!c.reconAssets || !c.reconAssets[assetKey]) initReconAssets();
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
    if (!source) source = sources[0] || null;
    if (!source) return null;
    const unit = (c.opUnits || [])[source.unitId] || null;
    const startHex = (unit && Number.isFinite(Number(unit.col)))
        ? { col: Number(unit.col), row: Number(unit.row) } : { col: route[0].col, row: route[0].row };
    const mission = {
        id: opts.id || `recon-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        assetKey,
        assetName: source.name || def.name,
        unitId: source.unitId,
        squadName: source.squadName,
        ownerUnitId: source.unitId,
        assetKind: def.kind,
        route,
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
    } else if (unit) {
        unit.reconMissionId = unit.reconMissionId || null;
    }
    if (typeof log === 'function') {
        log(`🔍 [${mission.assetName}] отправлен. Маршрут: ${route.map(p => `(${p.col},${p.row})`).join('→')}.`);
    }
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
    if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
    return mission;
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
    // юнит-актив двигается вместе с миссией (иконка не рисуется — см. §9.4)
    const unit = reconMissionUnit(mission);
    if (unit) { unit.col = mission.currentHex.col; unit.row = mission.currentHex.row; }
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
        if (Number(mission.currentIndex) >= mission.route.length - 1) return 'end';
        mission.currentIndex = Number(mission.currentIndex) + 1;
        return 'point';
    }
    // идём по прямой к точке: промежуточный гекс — сосед в сторону цели
    let step = null;
    const neighbors = (typeof getOpHexNeighbors === 'function')
        ? getOpHexNeighbors(Number(current.col), Number(current.row)) : [];
    let bestDist = Infinity;
    neighbors.forEach(neighbor => {
        const dist = (typeof getOpHexDistance === 'function')
            ? getOpHexDistance(neighbor.col, neighbor.row, Number(target.col), Number(target.row)) : 99;
        if (dist < bestDist && canReconMoveTo(mission.assetKind, current, neighbor)) {
            bestDist = dist; step = neighbor;
        }
    });
    if (!step) {
        // прямой сосед недоступен — пробуем саму точку (может быть на расстоянии 2)
        if (canReconMoveTo(mission.assetKind, current, target)) step = { col: Number(target.col), row: Number(target.row) };
    }
    if (!step) return 'blocked';
    return moveReconAsset(mission, step);
}

// ---------- Ход: исполнение всех миссий ----------
function advanceReconMissions() {
    const c = reconCampaign();
    if (!c) return;
    const turn = reconTurnNumber();
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
            finishReconMission(mission.id, 'failed');
            return;
        }
        if (mission.status === 'active') {
            mission.ap = RECON_TURN_BUDGET;
            let guard = 0;
            let outcome = 'moved';
            while (guard++ < 12) {
                outcome = reconStepAlongRoute(mission);
                if (outcome === 'moved') {
                    // наблюдение на каждом пройденном гексе
                    if (mission.observeMode === 'pass' || mission.observeMode === 'pause') {
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
                const range = getReconObserveRange(mission, mission.currentHex, false);
                observeInRange(null, mission, range, {
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
            mission.ap = RECON_TURN_BUDGET;
            const hq = reconNearestHQ(mission);
            if (!hq) { finishReconMission(mission.id, 'completed'); return; }
            const hqHex = { col: Number(hq.unit.col), row: Number(hq.unit.row) };
            const dist = (typeof getOpHexDistance === 'function')
                ? getOpHexDistance(Number(mission.currentHex.col), Number(mission.currentHex.row), hqHex.col, hqHex.row) : 0;
            if (dist === 0) {
                if (typeof log === 'function') log(`✅ [${mission.assetName}] вернулся в штаб — снова доступен.`);
                finishReconMission(mission.id, 'completed');
                return;
            }
            let guard = 0;
            while (guard++ < 12) {
                const before = `${mission.currentHex.col},${mission.currentHex.row}`;
                const targetDist = (typeof getOpHexDistance === 'function')
                    ? getOpHexDistance(hqHex.col, hqHex.row, Number(mission.currentHex.col), Number(mission.currentHex.row)) : 0;
                if (targetDist === 0) break;
                // шаг в сторону штаба
                const neighbors = (typeof getOpHexNeighbors === 'function')
                    ? getOpHexNeighbors(Number(mission.currentHex.col), Number(mission.currentHex.row)) : [];
                let step = null, best = Infinity;
                neighbors.forEach(neighbor => {
                    const d = getOpHexDistance(neighbor.col, neighbor.row, hqHex.col, hqHex.row);
                    if (d < best && canReconMoveTo(mission.assetKind, mission.currentHex, neighbor)) { best = d; step = neighbor; }
                });
                if (!step) break;
                const result = moveReconAsset(mission, step);
                if (result !== 'moved') break;
                if (`${mission.currentHex.col},${mission.currentHex.row}` === before) break;
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
function recallReconMission(missionId) {
    const c = reconCampaign();
    if (!c) return false;
    const mission = (c.reconMissions || []).find(m => m && String(m.id) === String(missionId));
    if (!mission) return false;
    if (mission.status === 'returning') return true;
    mission.status = 'returning';
    const hq = reconNearestHQ(mission);
    const dist = hq ? hq.distance : 0;
    if (typeof log === 'function') {
        log(`↩️ [${mission.assetName}] отозван. Возврат в штаб: ${Math.max(1, Math.ceil(dist / 4))} ход(ов).`);
    }
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
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
        mission.route = newOrder.route.slice(0, RECON_ROUTE_MAX_POINTS)
            .map(point => ({ col: Number(point.col), row: Number(point.row) }))
            .filter(point => Number.isFinite(point.col) && Number.isFinite(point.row));
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
        route: [],
        observeMode: 'stationary',
        reportMethod: 'radio',
        missionId: null,
        pickingRoute: true
    };
    return showReconPanel();
}
function showReconPanel() {
    const panel = (typeof document !== 'undefined') ? document.getElementById('reconPanel') : null;
    if (panel) panel.style.display = 'block';
    if (!reconDraft) {
        reconDraft = {
            assetKey: null, unitId: null, squadName: null, route: [],
            observeMode: 'stationary', reportMethod: 'radio', missionId: null, pickingRoute: false
        };
    }
    renderReconPanel();
    return true;
}
function closeReconPanel() {
    const panel = (typeof document !== 'undefined') ? document.getElementById('reconPanel') : null;
    if (panel) panel.style.display = 'none';
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
    reconDraft.route.push(hex);
    renderReconPanel();
    if (typeof redrawOperationalMap === 'function') { try { redrawOperationalMap(); } catch (e) {} }
    return true;
}
function buildReconMissionRoute() {
    return (reconDraft && Array.isArray(reconDraft.route)) ? reconDraft.route.slice() : [];
}
function reconSubmitMission() {
    if (!reconDraft) return null;
    const route = (reconDraft.route || []).slice();
    if (!reconDraft.assetKey) {
        if (typeof log === 'function') log('⛔ Разведка: сначала выберите актив.');
        return null;
    }
    if (!route.length) {
        if (typeof log === 'function') log('⛔ Разведка: кликните по карте, чтобы задать маршрут.');
        return null;
    }
    if (reconDraft.missionId) {
        const ok = changeReconMissionOrder(reconDraft.missionId, {
            route, observeMode: reconDraft.observeMode, reportMethod: reconDraft.reportMethod
        });
        if (ok) closeReconPanel();
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
    if (mission) closeReconPanel();
    else if (typeof log === 'function') log('⛔ Разведка: актив недоступен (занят или потерян).');
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
    return showReconPanel();
}
function reconMissionStatusLabel(mission) {
    if (!mission) return '';
    const labels = {
        active: '➡️ на маршруте',
        observing: '👁️ наблюдает',
        returning: '↩️ возвращается в штаб',
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
        const hq = reconNearestHQ(mission);
        const dist = hq ? hq.distance : 0;
        const eta = mission.status === 'returning' ? ` · возврат ${Math.max(1, Math.ceil(dist / 4))} ход(ов)` : '';
        return `<div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin:3px 0; padding:4px 6px; background:#20242e; border-left:3px solid #3498db; border-radius:4px; font-size:.8rem;">
            <span>🔍 <b>${mission.assetName}</b> — на ${hex}, ${reconMissionStatusLabel(mission)}${eta}</span>
            <span style="white-space:nowrap;">
              <button onclick="reconNewOrderForMission('${mission.id}')" style="background:#2980b9; font-size:.7rem; padding:1px 6px;">📡 Новый приказ</button>
              <button onclick="recallReconMission('${mission.id}');renderActiveOrders();renderReconPanel();" style="background:#7f3b30; font-size:.7rem; padding:1px 6px;">↩️ Отозвать</button>
            </span>
        </div>`;
    }).join('');
    return `<div style="margin:6px 0; padding:6px; background:#141a24; border:1px solid #3498db; border-radius:6px;">
        <b style="color:#5dade2;">🔍 Активные разведывательные миссии:</b>${rows}</div>`;
}
function renderReconPanel() {
    const panel = (typeof document !== 'undefined') ? document.getElementById('reconPanel') : null;
    if (!panel) return false;
    const c = reconCampaign();
    if (!c) return false;
    if (!c.reconAssets || !Object.keys(c.reconAssets).length) initReconAssets();
    if (!reconDraft) {
        reconDraft = {
            assetKey: null, unitId: null, squadName: null, route: [],
            observeMode: 'stationary', reportMethod: 'radio', missionId: null, pickingRoute: false
        };
    }
    const assets = getReconAssetList();
    if (!assets.length) {
        panel.innerHTML = `<b style="color:#f1c40f;">🔍 Разведка</b>
            <div style="color:#bbb; font-size:.85rem; margin-top:4px;">Нет доступных разведывательных активов: в батальоне нет мотоциклистов, бронеавтомобилей, развед.взвода или Hidalgo — либо все они на задании.</div>
            ${reconMissionsPanelHtml()}`;
        return true;
    }
    const assetOptions = assets.map(asset =>
        `<option value="${asset.key}" ${reconDraft.assetKey === asset.key ? 'selected' : ''}>${asset.name} (${asset.available}/${asset.total})</option>`
    ).join('');
    const routeText = (reconDraft.route || []).map(point => `(${point.col},${point.row})`).join(' → ') || 'кликните по гексам на карте';
    const modeRadio = [['pass', 'Проходить'], ['stationary', 'Занять в конце'], ['pause', 'Пауза на точках (+2)']]
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
        <div style="margin-top:6px; font-size:.82rem; color:#ddd;">
            2. Маршрут: <span style="color:#f1c40f;">${routeText}</span>
            <button onclick="reconClearRoute()" style="background:#555; font-size:.7rem; padding:1px 6px; margin-left:6px;">Очистить маршрут</button>
            <div style="color:#888; font-size:.75rem;">Клик по гексам на карте добавляет точку (до ${RECON_ROUTE_MAX_POINTS}); последняя точка — точка наблюдения.</div>
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
function reconMissionIcon(mission) {
    const def = RECON_ASSET_TYPES[mission && mission.assetKey];
    if (def && def.icon) return def.icon;
    const unit = reconMissionUnit(mission);
    return (unit && unit.icon) || null;
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
        // иконка актива на текущем гексе
        if (mission.currentHex) {
            const p = center(mission.currentHex);
            const radius = Math.max(8, size * 0.32);
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(20,30,45,.85)';
            ctx.fill();
            ctx.strokeStyle = '#5dade2';
            ctx.lineWidth = Math.max(1.5, size * 0.05);
            ctx.stroke();
            ctx.fillStyle = '#8ecbff';
            ctx.font = `bold ${Math.max(9, radius)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔍', p.x, p.y + 0.5);
            ctx.restore();
        }
        // маркер точки наблюдения (глаз) на конечной точке
        const last = route[route.length - 1];
        if (last && mission.status !== 'returning') {
            const p = center(last);
            ctx.save();
            ctx.fillStyle = '#f1c40f';
            ctx.font = `bold ${Math.max(10, size * 0.34)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('👁️', p.x, p.y - size * 0.55);
            ctx.restore();
        }
    });
    if (draft) drawRoute(draft.route, 'rgba(241,196,15,.95)');
    ctx.restore();
}
