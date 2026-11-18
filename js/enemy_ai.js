// ⚡ BUILD-МАРКЕР: v13.186 — противник, который играет: доктрины, авто-фаза, VP
// ═══════════════════════════════════════════════════════════════════════════
// ⚡ v13.186 (этап B): ПРОТИВНИК ДЕЙСТВУЕТ САМ.
//
// До этой версии враг на оперативной карте не двигался вообще: 190 обращений
// к `enemyOpUnits` — все на чтение. Бой начинался только когда игрок сам
// наступал на вражеский гекс. Единственные автономные действия — артиллерия
// (`planEnemyArtilleryFire`) и ремонт телефонных линий.
//
// ПРАВИЛА ЧЕСТНОСТИ (согласовано: «строго по правилам»):
//   • враг видит только ОБНАРУЖЕННЫЕ отряды игрока (`detected === true` или
//     `noiseMarker`) — ровно те, что игрок видит про себя;
//   • обнаружение считается теми же функциями (`opLineOfSightBlocked`,
//     `opDetectionModifier`), что и для игрока;
//   • движение — через `getOpMoveCost` (та же местность, те же перерезанные
//     пути), стоимость ОД считается как у игрока: 1 гекс = 1 ОД;
//   • бой начинается только по контакту на гексе — тем же `startTacticalBattle`.
//   • никакого подглядывания: если отряд не обнаружен, его в списке целей нет.
// ═══════════════════════════════════════════════════════════════════════════

// Доктрины противника. Позиция отряда — не приказ, а характер: она определяет,
// куда враг пойдёт, когда игрок что-то сделал.
var ENEMY_DOCTRINES = {
    hold: {
        label: 'Удержание',
        hint: 'стоит на месте, окапывается, бьёт артиллерией по обнаруженным'
    },
    counterattack: {
        label: 'Контратака',
        hint: 'идёт к объективу, который игрок занял или оспаривает'
    },
    fallback: {
        label: 'Отход',
        hint: 'уходит к своему тылу при низком духе или больших потерях'
    },
    ambush: {
        label: 'Засада',
        hint: 'скрытно занимает гекс на пути игрока и ждёт'
    }
};
var ENEMY_DOCTRINE_KEYS = Object.keys(ENEMY_DOCTRINES);

// Порог отхода по духу: ниже — отряд ломается и уходит к своим.
var ENEMY_AI_FALLBACK_MORALE = 30;
// Порог потерь (доля выбитых бойцов), после которого отряд тоже уходит.
var ENEMY_AI_FALLBACK_LOSSES = 0.6;
// Насколько далеко враг готов идти за объективом (гексов).
var ENEMY_AI_OBJECTIVE_REACH = 14;

// ── назначение доктрин ─────────────────────────────────────────────────────

// Кто чем играет. Определяется по типу/имени отряда — так существующие сейвы
// получают доктрины без миграции, а новые кампании — сразу.
function enemyAiDoctrineFor(unit) {
    if (!unit) return 'hold';
    if (ENEMY_DOCTRINE_KEYS.indexOf(unit.aiDoctrine) >= 0) return unit.aiDoctrine;
    const name = String(unit.name || '');
    const type = String(unit.type || '');
    // ДОТы и укрепления никуда не ходят по определению.
    if (typeof isStaticOpUnit === 'function' && isStaticOpUnit(unit)) return 'hold';
    // Артиллерия и обозы проверяются ДО танков: «самоходная артиллерийская
    // установка» содержит «артиллери», «САУ» содержит «САУ» — они держат позицию,
    // а не контратакуют (иначе батарея уезжала бы в бой вместо поддержки).
    if (/снабжен|обоз|грузовик|транспорт|санитар/i.test(name)) return 'fallback';
    if (/миномет|артиллери|самоходн|\bСАУ\b|гаубиц|батаре/i.test(name) ||
        type === 'sau_battery' || type === 'mortar_battery' || type === 'regimental_artillery') return 'hold';
    if (/танк|panzer|Pz\./i.test(name) || type === 'tank_platoon' || type === 'armored_group') return 'counterattack';
    if (/мотоцикл|развед|Recon|Hidalgo|Landsverk|бронеавтомоб/i.test(name)) return 'ambush';
    if (/штаб|HQ/i.test(name) || type === 'hq' || type === 'battalion_hq' || type === 'company_hq') return 'fallback';
    // Пехота: половина держит, половина контратакует — по чётности индекса,
    // чтобы состав был предсказуем и не менялся между ходами.
    const idx = ((typeof appData !== 'undefined' && appData.campaign && appData.campaign.enemyOpUnits) || []).indexOf(unit);
    if (/пулемёт|пулемет|ПТО|противотанк/i.test(name)) return 'ambush';
    return (idx >= 0 && idx % 3 === 1) ? 'counterattack' : 'hold';
}

function enemyAiAssignDoctrines() {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    if (!camp || !Array.isArray(camp.enemyOpUnits)) return 0;
    let assigned = 0;
    camp.enemyOpUnits.forEach(unit => {
        if (!unit) return;
        if (ENEMY_DOCTRINE_KEYS.indexOf(unit.aiDoctrine) >= 0) { assigned++; return; }
        unit.aiDoctrine = enemyAiDoctrineFor(unit);
        assigned++;
    });
    return assigned;
}

// ── восприятие: только обнаруженное ────────────────────────────────────────

function enemyAiIsAlive(unit) {
    if (!unit) return false;
    if (unit.isDestroyed || unit.isSurrendered || unit.isRetreated) return false;
    if (unit.status === 'retreated' || unit.status === 'surrendered') return false;
    if (typeof isOpUnitWipedOut === 'function' && isOpUnitWipedOut(unit)) return false;
    return unit.col != null && unit.row != null;
}

// Отряд игрока, который противник ВПРАВЕ считать известным.
// Обнаруженный — да. «Шум» — только приблизительно (гекс известен).
function enemyAiSeesPlayerUnit(unit) {
    if (!unit || unit.isDestroyed || unit.isSurrendered) return false;
    if (unit.col == null || unit.row == null) return false;
    if (typeof operationalUnitInTacticalBattle === 'function' && operationalUnitInTacticalBattle(unit)) return false;
    return unit.detected === true || unit.noiseMarker === true;
}

function enemyAiKnownPlayerUnits() {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    if (!camp) return [];
    return (camp.opUnits || []).filter(enemyAiSeesPlayerUnit);
}

// Ближайший известный отряд игрока. null — противник «слеп» в этом ходу.
function enemyAiNearestKnownFoe(unit) {
    if (!unit || unit.col == null || unit.row == null) return null;
    const foes = enemyAiKnownPlayerUnits();
    let best = null, bestDist = Infinity;
    foes.forEach(foe => {
        const d = (typeof getOpHexDistance === 'function')
            ? getOpHexDistance(unit.col, unit.row, foe.col, foe.row)
            : Math.max(Math.abs(foe.col - unit.col), Math.abs(foe.row - unit.row));
        if (d < bestDist) { bestDist = d; best = foe; }
    });
    return best ? { unit: best, distance: bestDist } : null;
}

// ── состояние отряда ───────────────────────────────────────────────────────

function enemyAiMorale(unit) {
    if (!unit) return 100;
    const direct = Number(unit.currentMorale);
    if (Number.isFinite(direct)) return direct;
    const squads = Array.isArray(unit.squads) ? unit.squads : [];
    const values = squads.map(s => Number(s && s.currentMorale)).filter(Number.isFinite);
    if (!values.length) return 100;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function enemyAiLossRatio(unit) {
    if (!unit) return 0;
    let total = 0, dead = 0;
    (Array.isArray(unit.squads) ? unit.squads : []).forEach(squad => {
        (squad && Array.isArray(squad.fighters) ? squad.fighters : []).forEach(f => {
            if (!f) return;
            total++;
            if (Number(f.hp) <= 0) dead++;
        });
    });
    return total ? dead / total : 0;
}

function enemyAiShouldBreakOff(unit) {
    if (!unit) return false;
    if (unit.operationalRouted || unit.operationalAmmoRouted) return true;
    if (enemyAiMorale(unit) <= ENEMY_AI_FALLBACK_MORALE) return true;
    return enemyAiLossRatio(unit) >= ENEMY_AI_FALLBACK_LOSSES;
}

// Куда отходить: свой край карты. У BeVe (оборона) — верх/низ по фракции,
// поэтому берём гекс штаба батальона своей стороны, а если его нет —
// дальний от ближайшего известного врага угол.
function enemyAiFallbackHex(unit) {
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    if (!camp || !unit || unit.col == null) return null;
    const ownHq = (camp.enemyOpUnits || []).find(u => u && u !== unit && enemyAiIsAlive(u) &&
        (u.type === 'battalion_hq' || u.type === 'hq' || (u.name && /штаб/i.test(u.name))));
    if (ownHq && Number.isFinite(ownHq.col)) return { col: ownHq.col, row: ownHq.row, source: 'штаб' };
    // Иначе — отойти от ближайшего известного врага на 2–3 гекса назад.
    const foe = enemyAiNearestKnownFoe(unit);
    if (!foe || !foe.unit) return null;
    const dc = Math.sign(unit.col - foe.unit.col) || (unit.col < 6 ? -1 : 1);
    const dr = Math.sign(unit.row - foe.unit.row) || 0;
    return { col: unit.col + dc * 3, row: unit.row + dr * 3, source: 'отрыв' };
}

// ── объективы ──────────────────────────────────────────────────────────────

// Гексы объективов из уже существующего CAMPAIGN_OBJECTIVE_DEFINITIONS.
// VP здесь не изобретаются: берём то, что игра и так считает задачей.
function enemyAiObjectiveHexes() {
    const out = [];
    let defs = null;
    try { defs = (typeof campaignObjectiveDefinitions === 'function') ? campaignObjectiveDefinitions() : null; } catch (e) { defs = null; }
    if (!defs) return out;
    [...(defs.primary || []), ...(defs.additional || [])].forEach(obj => {
        if (!obj) return;
        if (Number.isFinite(obj.col) && Number.isFinite(obj.row)) {
            out.push({ col: Number(obj.col), row: Number(obj.row), id: obj.id, kind: obj.kind, label: obj.label || '', weight: obj.kind === 'limit_enemy_hold' ? 2 : 1 });
        }
        (obj.hexes || []).forEach(point => {
            if (Array.isArray(point) && Number.isFinite(point[0])) {
                out.push({ col: Number(point[0]), row: Number(point[1]), id: obj.id, kind: obj.kind, label: obj.label || '', weight: 1 });
            }
        });
    });
    return out;
}

// Объектив, который игрок занял или оспаривает — цель контратаки.
// Если такого нет, берём ближайший объектив, который ещё ничей.
function enemyAiContestedObjective(unit) {
    if (!unit || unit.col == null) return null;
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    if (!camp) return null;
    const hexes = enemyAiObjectiveHexes();
    if (!hexes.length) return null;
    const control = (col, row) => (typeof campaignObjectiveHexControl === 'function')
        ? campaignObjectiveHexControl(col, row) : 'neutral';
    const dist = (col, row) => (typeof getOpHexDistance === 'function')
        ? getOpHexDistance(unit.col, unit.row, col, row)
        : Math.max(Math.abs(col - unit.col), Math.abs(row - unit.row));

    const candidates = hexes
        .map(h => ({ ...h, control: control(h.col, h.row), distance: dist(h.col, h.row) }))
        .filter(h => h.distance > 0 && h.distance <= ENEMY_AI_OBJECTIVE_REACH);
    if (!candidates.length) return null;

    // 1) гекс под игроком или спорный — самое срочное;
    const takeable = candidates.filter(h => h.control === 'player' || h.control === 'contested');
    if (takeable.length) {
        takeable.sort((a, b) => (a.distance - b.distance) || (b.weight - a.weight));
        return { ...takeable[0], reason: takeable[0].control === 'player' ? 'игрок занял объектив' : 'объектив спорный' };
    }
    // 2) иначе — ничейный объектив, к которому ближе всего.
    const neutral = candidates.filter(h => h.control === 'neutral' || h.control === undefined);
    if (neutral.length) {
        neutral.sort((a, b) => (a.distance - b.distance) || (b.weight - a.weight));
        return { ...neutral[0], reason: 'объектив не занят' };
    }
    return null;
}

// ── решение ────────────────────────────────────────────────────────────────

// Чистая функция: по отряду и обстановке вернуть намерение.
// Ничего не мутирует — поэтому её можно проверять в node без DOM.
function enemyAiDecideAction(unit, ctx) {
    ctx = ctx || {};
    const doctrine = enemyAiDoctrineFor(unit);
    const known = ctx.nearest || enemyAiNearestKnownFoe(unit);
    const objective = ctx.objective !== undefined ? ctx.objective : enemyAiContestedObjective(unit);
    const base = { unit, doctrine, targetHex: null, reason: '' };

    // 1. Ломается — уходит, что бы доктрина ни говорила.
    if (enemyAiShouldBreakOff(unit)) {
        const back = (ctx.fallback !== undefined) ? ctx.fallback : enemyAiFallbackHex(unit);
        if (back) {
            return { ...base, doctrine: 'fallback', action: 'move', targetHex: `${back.col},${back.row}`,
                reason: `отход: дух ${enemyAiMorale(unit)}%, потери ${Math.round(enemyAiLossRatio(unit) * 100)}%` };
        }
        return { ...base, action: 'hold', reason: 'нет пути отхода — держится' };
    }

    // 2. Дальше — по доктрине.
    if (doctrine === 'hold') {
        // Артиллерия и ДОТы бьют сами (planEnemyArtilleryFire), пехота держит гекс.
        if (known && known.distance <= 1) {
            return { ...base, action: 'defend', targetHex: `${unit.col},${unit.row}`,
                reason: 'противник в упор — обороняет гекс' };
        }
        return { ...base, action: 'hold', reason: 'удерживает позицию' };
    }

    if (doctrine === 'counterattack') {
        if (objective) {
            return { ...base, action: 'move', targetHex: `${objective.col},${objective.row}`, reason: objective.reason };
        }
        if (known && known.unit) {
            return { ...base, action: 'move', targetHex: `${known.unit.col},${known.unit.row}`,
                reason: 'контратака по обнаруженному отряду' };
        }
        return { ...base, action: 'hold', reason: 'нет цели для контратаки' };
    }

    if (doctrine === 'ambush') {
        // Засада встаёт на пути игрока к объективу: гекс рядом с объективом,
        // но не на нём (на объективе стоит гарнизон).
        if (unit.isAmbush) return { ...base, action: 'hold', reason: 'уже в засаде' };
        const target = objective || (known && known.unit ? { col: known.unit.col, row: known.unit.row, reason: 'на пути отряда' } : null);
        if (target) {
            return { ...base, action: 'ambush', targetHex: `${target.col},${target.row}`, reason: target.reason || 'засада на пути' };
        }
        return { ...base, action: 'ambush', targetHex: `${unit.col},${unit.row}`, reason: 'засада на месте' };
    }

    // fallback как доктрина (обозы, штабы): если рядом враг — отойти.
    if (known && known.distance <= 3) {
        const back = (ctx.fallback !== undefined) ? ctx.fallback : enemyAiFallbackHex(unit);
        if (back) return { ...base, action: 'move', targetHex: `${back.col},${back.row}`, reason: 'игрок рядом — отход' };
    }
    return { ...base, action: 'hold', reason: 'тыловой отряд, угрозы нет' };
}

// ── исполнение: движение ───────────────────────────────────────────────────

// Один шаг к цели. Возвращает {moved, contact, reached, cost}.
// Стоимость — как у игрока: 1 гекс = 1 ОД (см. ручное перемещение на опкарте).
function enemyAiStepToward(unit, targetCol, targetRow) {
    const result = { moved: false, contact: false, reached: false, cost: 0 };
    if (!unit || unit.col == null || !Number.isFinite(targetCol) || !Number.isFinite(targetRow)) return result;
    if ((Number(unit.ap) || 0) <= 0) return result;

    const route = (typeof getRouteToTarget === 'function')
        ? getRouteToTarget(unit.col, unit.row, targetCol, targetRow, unit) : [];
    if (!Array.isArray(route) || route.length === 0) return result;

    // getRouteToTarget отдаёт маршрут; первый элемент — следующий гекс.
    const next = route[0];
    if (!next || !Number.isFinite(next.col) || !Number.isFinite(next.row)) return result;

    const moveCost = (typeof getOpMoveCost === 'function')
        ? getOpMoveCost(unit, unit.col, unit.row, next.col, next.row) : 1;
    if (!Number.isFinite(moveCost)) return result;      // непроходимо (или путь перерезан)
    const apCost = 1;                                    // 1 гекс = 1 ОД, как у игрока
    if ((Number(unit.ap) || 0) < apCost) return result;

    const foesOnTarget = ((typeof appData !== 'undefined' && appData.campaign && appData.campaign.opUnits) || [])
        .filter(u => u && !u.isDestroyed && !u.isSurrendered && u.col === next.col && u.row === next.row);

    unit.ap -= apCost;
    if (typeof opRecordPrevPos === 'function') opRecordPrevPos(unit);
    unit.col = next.col;
    unit.row = next.row;
    unit.movedThisTurn = true;
    // Выход из засады раскрывает отряд — те же правила, что у игрока.
    if (unit.isAmbush) {
        unit.isAmbush = false;
        unit.ambushReconImmune = false;
        unit.hidden = false;
    }
    result.moved = true;
    result.cost = apCost;
    result.reached = (unit.col === targetCol && unit.row === targetRow);
    if (foesOnTarget.length) result.contact = true;
    return result;
}

// ── фаза противника на оперативной карте ──────────────────────────────────

// Вызывается из endOperationalTurn рядом с processOrders().
// Возвращает отчёт для журнала и для тестов.
function runEnemyOperationalPhase(options) {
    options = options || {};
    const camp = (typeof appData !== 'undefined' && appData && appData.campaign) || null;
    const report = { turn: null, units: 0, moved: 0, ambushed: 0, held: 0, battles: [], skipped: null, details: [] };
    if (!camp || !Array.isArray(camp.enemyOpUnits) || !camp.enemyOpUnits.length) return report;
    // В онлайн-матче врагом управляет живой игрок.
    if (camp.online) { report.skipped = 'онлайн-матч'; return report; }
    if (camp.enemyAiDisabled === true) { report.skipped = 'выключено'; return report; }

    report.turn = camp.currentTurn || 1;
    let battlesStarted = 0;
    const maxBattlesPerTurn = 3;

    const units = camp.enemyOpUnits.filter(enemyAiIsAlive);
    report.units = units.length;

    units.forEach(unit => {
        // ДОТы/укрепления и стационарные отряды не двигаются, но могут дать бой
        const staticUnit = (typeof isStaticOpUnit === 'function') && isStaticOpUnit(unit);
        const plan = enemyAiDecideAction(unit);
        let acted = plan.action;

        if (staticUnit) acted = 'hold';
        if (typeof operationalUnitInTacticalBattle === 'function' && operationalUnitInTacticalBattle(unit)) acted = 'hold';

        let movedAny = false;
        if (acted === 'move' && plan.targetHex) {
            const [tc, tr] = String(plan.targetHex).split(',').map(Number);
            let steps = 0;
            const maxSteps = 6;
            while (steps < maxSteps) {
                const step = enemyAiStepToward(unit, tc, tr);
                if (!step.moved) break;
                steps++; movedAny = true;
                if (step.contact) {
                    const foes = (camp.opUnits || []).filter(u => u && !u.isDestroyed && !u.isSurrendered &&
                        u.col === unit.col && u.row === unit.row);
                    if (foes.length && battlesStarted < maxBattlesPerTurn) {
                        battlesStarted++;
                        try {
                            if (typeof startTacticalBattle === 'function') {
                                startTacticalBattle(foes, [unit], { battleHexKey: `${unit.col},${unit.row}` });
                                report.battles.push({ hex: `${unit.col},${unit.row}`, enemy: unit.name, player: foes.map(f => f.name) });
                            }
                        } catch (e) { console.warn('enemy AI battle:', e && e.message); }
                    }
                    break;
                }
                if (step.reached) break;
            }
            if (movedAny) report.moved++;
        } else if (acted === 'ambush' && plan.targetHex) {
            const [tc, tr] = String(plan.targetHex).split(',').map(Number);
            const step = enemyAiStepToward(unit, tc, tr);
            if (step.moved) { movedAny = true; report.moved++; }
            if (unit.col === tc && unit.row === tr) {
                unit.isAmbush = true;
                unit.ambushHex = `${unit.col},${unit.row}`;
                unit.ambushReconImmune = true;
                unit.canMove = false;
                unit.detected = false;
                unit.noiseMarker = false;
                report.ambushed++;
            } else if (!movedAny) {
                report.held++;
            }
        } else {
            report.held++;
        }

        report.details.push({
            name: unit.name,
            doctrine: plan.doctrine,
            action: acted,
            reason: plan.reason,
            col: unit.col,
            row: unit.row,
            moved: movedAny
        });
    });

    if (typeof log === 'function' && (report.moved || report.ambushed || report.battles.length)) {
        try {
            log(`🎯 Противник действует: переместилось ${report.moved}, в засаде ${report.ambushed}, боёв начато ${report.battles.length}.`);
        } catch (e) {}
    }
    return report;
}

// ── враг в тактической рукопашной ─────────────────────────────────────────

// ⚡ v13.186: закрывает пробел. resolveTacticalMeleesForTurn обходит ТОЛЬКО
// appData.squads — вражеский отряд в рукопашную не вступал вообще, даже если
// игрок вошёл в его гекс. Теперь бой считается симметрично.
function resolveTacticalMeleesForEnemySide() {
    const map = (typeof appData !== 'undefined' && appData && appData.map) || null;
    if (!map || !Array.isArray(map.enemySquads)) return 0;
    const turn = (typeof currentTurn !== 'undefined') ? currentTurn : null;
    let resolved = 0;
    map.enemySquads.forEach((enemy, idx) => {
        if (!enemy || enemy.armor || enemy.meleeResolvedTurn === turn) return;
        if (typeof tacticalEnemyIsNeutralized === 'function' && tacticalEnemyIsNeutralized(enemy)) return;
        const contacts = (typeof tacticalSquadsInSameHex === 'function') ? tacticalSquadsInSameHex(enemy) : [];
        const target = contacts.find(c => c && !c.isEnemy && c.squad && !c.squad.armor);
        if (!target) return;
        const saveIdx = currentSquadIndex, saveSquad = currentSquad;
        const saveTarget = map.attackTargetEnemyIdx;
        try {
            // meleeAttack работает от currentSquad; для врага подставляем его.
            currentSquadIndex = idx;
            currentSquad = enemy;
            // tacticalMeleeTarget ищет врага в map.enemySquads для своей стороны,
            // поэтому для вражеского хода цель задаём явно через его meleeOpponentName.
            enemy.meleeOpponentName = target.squad.name;
            if (typeof meleeAttack === 'function') meleeAttack(true);
            resolved++;
        } catch (e) {
            console.warn('enemy melee:', e && e.message);
        } finally {
            currentSquadIndex = saveIdx;
            currentSquad = saveSquad;
            if (map) map.attackTargetEnemyIdx = saveTarget;
        }
    });
    return resolved;
}

// ── VP: оцифровка существующих объективов ─────────────────────────────────

// Стоимость объективов в победных очках. Не новая механика: те же задачи,
// что в CAMPAIGN_OBJECTIVE_DEFINITIONS, но с весом.
var OBJECTIVE_VP_WEIGHTS = {
    hold_at_deadline: 3,
    control_at_deadline: 2,
    capture_by: 3,
    limit_enemy_hold: 2,
    destroy_dots: 2,
    first_tank_battle: 1,
    hold: 2
};

function campaignObjectiveVpTable() {
    let defs = null;
    try { defs = (typeof campaignObjectiveDefinitions === 'function') ? campaignObjectiveDefinitions() : null; } catch (e) { defs = null; }
    if (!defs) return { primary: [], additional: [], max: 0 };
    const make = obj => ({
        id: obj.id,
        kind: obj.kind,
        vp: Number(OBJECTIVE_VP_WEIGHTS[obj.kind]) || 1,
        label: obj.label || ''
    });
    const primary = (defs.primary || []).map(make);
    const additional = (defs.additional || []).map(make);
    const max = [...primary, ...additional].reduce((sum, o) => sum + o.vp, 0);
    return { primary, additional, max };
}

// Текущий счёт: выполненные задачи дают VP, проваленные — нет.
function campaignObjectiveVpScore() {
    const table = campaignObjectiveVpTable();
    const state = (typeof ensureCampaignObjectiveState === 'function') ? ensureCampaignObjectiveState() : null;
    const status = (state && state.status) || {};
    let player = 0, max = 0, pending = 0;
    [...table.primary, ...table.additional].forEach(obj => {
        max += obj.vp;
        const s = status[obj.id];
        if (s === 'completed') player += obj.vp;
        else if (s !== 'failed') pending++;
    });
    return { player, max, pending, table };
}

// VP за конкретный тактический бой: оцифровка его собственного исхода.
// Это то, чем потом можно сравнивать бои между собой в отчёте.
function tacticalBattleVictoryPoints(battle) {
    const points = { player: 0, enemy: 0, detail: [] };
    if (!battle) return points;
    const resultOf = battle.result || null;
    if (resultOf === 'victory') { points.player += 3; points.detail.push('поле боя за нами +3'); }
    else if (resultOf === 'defeat') { points.enemy += 3; points.detail.push('поле боя за противником +3'); }

    const playerSquads = Array.isArray(battle.playerSquads) ? battle.playerSquads : [];
    const enemySquads = Array.isArray(battle.enemySquads) ? battle.enemySquads : [];
    const neutralized = list => list.filter(s => {
        if (!s) return false;
        if (s.isDestroyed || s.isSurrendered || s.isRetreated) return true;
        if (typeof tacticalEnemyIsNeutralized === 'function') return tacticalEnemyIsNeutralized(s);
        const f = Array.isArray(s.fighters) ? s.fighters : [];
        return f.length > 0 && f.every(x => !x || Number(x.hp) <= 0);
    }).length;

    const enemyLosses = neutralized(enemySquads);
    const playerLosses = neutralized(playerSquads);
    if (enemyLosses) { points.player += enemyLosses; points.detail.push(`уничтожено отрядов противника: ${enemyLosses}`); }
    if (playerLosses) { points.enemy += playerLosses; points.detail.push(`наши потери в отрядах: ${playerLosses}`); }

    points.margin = points.player - points.enemy;
    return points;
}

// ── лимит раундов боя ─────────────────────────────────────────────────────

// Бой больше не может тянуться бесконечно: после лимита раундов он
// завершается по счёту VP. Значение считаем в раундах (2 фазы).
var TACTICAL_BATTLE_ROUND_LIMIT = 12;

function tacticalBattleRoundsPlayed(battle) {
    if (!battle) return 0;
    if (typeof tacticalRoundsCompletedForBattle === 'function') {
        const n = Number(tacticalRoundsCompletedForBattle(battle));
        if (Number.isFinite(n)) return n;
    }
    const phases = Number(battle.tacticalPhasesCompleted);
    const perRound = (typeof tacticalPhasesPerRound === 'function') ? Number(tacticalPhasesPerRound()) || 2 : 2;
    return Number.isFinite(phases) ? Math.floor(phases / perRound) : 0;
}

// Исход по очкам, когда раунды кончились.
function tacticalBattleLimitOutcome(battle) {
    const points = tacticalBattleVictoryPoints(battle);
    if (points.margin > 0) return { result: 'victory', reason: 'лимит раундов, победа по очкам', points };
    if (points.margin < 0) return { result: 'defeat', reason: 'лимит раундов, поражение по очкам', points };
    return { result: 'draw', reason: 'лимит раундов, ничья по очкам', points };
}

function tacticalBattleReachedRoundLimit(battle) {
    return tacticalBattleRoundsPlayed(battle) >= TACTICAL_BATTLE_ROUND_LIMIT;
}

// Экспорт для node-тестов (в браузере globalThis === window, поведение то же).
if (typeof globalThis !== 'undefined') {
    globalThis.ENEMY_AI = {
        doctrines: ENEMY_DOCTRINES,
        doctrineFor: enemyAiDoctrineFor,
        assignDoctrines: enemyAiAssignDoctrines,
        decideAction: enemyAiDecideAction,
        contestedObjective: enemyAiContestedObjective,
        objectiveHexes: enemyAiObjectiveHexes,
        shouldBreakOff: enemyAiShouldBreakOff,
        fallbackHex: enemyAiFallbackHex,
        nearestKnownFoe: enemyAiNearestKnownFoe,
        seesPlayerUnit: enemyAiSeesPlayerUnit,
        lossRatio: enemyAiLossRatio,
        morale: enemyAiMorale,
        stepToward: enemyAiStepToward,
        runOperationalPhase: runEnemyOperationalPhase,
        resolveEnemyMelees: resolveTacticalMeleesForEnemySide,
        vpTable: campaignObjectiveVpTable,
        vpScore: campaignObjectiveVpScore,
        battleVictoryPoints: tacticalBattleVictoryPoints,
        roundsPlayed: tacticalBattleRoundsPlayed,
        reachedRoundLimit: tacticalBattleReachedRoundLimit,
        limitOutcome: tacticalBattleLimitOutcome,
        weights: OBJECTIVE_VP_WEIGHTS,
        roundLimit: () => TACTICAL_BATTLE_ROUND_LIMIT
    };
}
