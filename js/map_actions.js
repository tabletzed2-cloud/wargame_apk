// v13.062: correct ranges, melee immunity, bicycle controls and tank guns.
// ⚡ v13.061: explicit and morale-driven tactical retreat; respect melee and active side.
// ═══════════════════════════════════════════════════════════════════════════
// ⚡ v13.054 (R39#4): ДЕЙСТВИЯ ОТРЯДА ПРЯМО НА ТАКТИЧЕСКОЙ КАРТЕ
//
//   Клик по своему отряду на карте боя → под картой появляется панель со ВСЕМИ
//   кнопками действий (стрелковое, орудия, ПТО, подавление, гранаты, связка,
//   рукопашная, снайпер, бутылкомёт, пулемёты ДОТа). Движение — как раньше,
//   кликом по подсвеченному гексу.
//
//   Атака: кнопка → «выберите отряд противника» (клик по врагу на карте или
//   кнопка в списке целей) → дистанция и укрытие подставляются автоматически
//   → выполняется ТА ЖЕ функция, что и во вкладке «⚡ Бой» (тратит ОД, патроны,
//   учитывает карточки/модификаторы, лимиты выстрелов) → результат
//   (попадания / урон / пробития) АВТОМАТИЧЕСКИ применяется к выбранному
//   отряду противника: 1 ед. урона = −1 ОЗ случайному живому бойцу
//   (как «💥 Получить урон» у себя), пробитие — модули/экипаж техники,
//   подавление — статус «Подавлен» у цели. В онлайне потери уходят оппоненту
//   (dmgOut по разнице ОЗ), подавление — отдельным полем supOut.
//
//   Если цель НЕ выбрана (старый порядок — модалка с ручной дистанцией), всё
//   работает как раньше: результат только в лог, урон оппонент вносит сам.
// ═══════════════════════════════════════════════════════════════════════════

var MAP_ACTION_LOC_NAMES = ['Рикошет', 'Корпус', 'Гусеницы', 'Башня', 'Двигатель', 'Укладка/бак'];
var MAP_ACTION_LOC_KEYS = ['ricochet', 'hull', 'suspension', 'turret', 'engine', 'ammo'];

// Описание действий: какие цели допустимы и при каких условиях кнопка видна
var MAP_ACTION_DEFS = [
    { id: 'smallArms',       label: '🔫 Стрелковое / пулемёты', targets: 'any',      small: true,
      show: s => !(s.name || '').includes('ДОТ') },
    { id: 'ordnance',        label: '💥 Орудия / миномёты',     targets: 'any',
      show: s => mapActionHasCrewType(s, ['at_gun', 'mortar', 'tank_gun']) },
    { id: 'vehicle',         label: '🚀 ПТО по технике',        targets: 'vehicle',
      show: s => mapActionHasCrewType(s, ['at_gun', 'tank_gun']) },
    { id: 'sniper',          label: '🎯 Снайперский выстрел',   targets: 'infantry', small: true,
      show: s => mapActionHasSniper(s) },
    { id: 'suppressiveFire', label: '💫 Подавить (2,5 ОД)',     targets: 'infantry', small: true,
      show: s => !s.armor && !(s.name || '').includes('ДОТ') && (s.ammoSmall || 0) > 0 },
    { id: 'grenades',        label: '💣 Гранаты (до 1 гекса)', targets: 'infantry', maxDist: 1,
      show: s => !s.armor },
    { id: 'satchel',         label: '🧨 Связка гранат (техника рядом)', targets: 'vehicle', maxDist: 1,
      show: s => !s.armor },
    { id: 'melee',           label: '⚔️ Рукопашная (тот же гекс)',   targets: 'infantry', maxDist: 0,
      show: s => !s.armor },
    { id: 'molotovCrew',     label: '🍾 Бутылкомёт по технике', targets: 'vehicle',  small: true,
      show: s => mapActionHasCrewFlag(s, 'isMolotov') },
    { id: 'ampulomet',       label: '🔥 Ампуломёт по технике',  targets: 'vehicle',  small: true,
      show: s => mapActionHasCrewFlag(s, 'isAmpulomet') },
    { id: 'atGrenade',       label: '💥 Кумулятивная винт. граната', targets: 'vehicle', maxDist: 2,
      show: s => (s.atRifleGrenades || 0) > 0 }
];

// Отряд выбран на карте (клик) → он же становится активным во вкладке «⚡ Бой»
//    (действия с карты выполняются функциями этой вкладки для currentSquad)
function mapActionsOnSelect(idx) {
    if (typeof mapCloseQuickActionMenu === 'function') mapCloseQuickActionMenu();
    try {
        if (typeof currentSquadIndex !== 'undefined' && currentSquadIndex !== idx && typeof selectSquad === 'function') selectSquad(idx);
    } catch (e) {}
    if (appData && appData.map) {
        appData.map.pendingMapAttack = null;
        appData.map.pendingMapBinoculars = null;
    }
    renderMapActionPanel();
}

function mapActionCrewWeapons(squad) {
    try { return getFactionCrewWeapons(squad.faction) || []; } catch (e) { return []; }
}
function mapActionHasCrewType(squad, types) {
    const cws = mapActionCrewWeapons(squad);
    return (squad.crewInstances || []).some(ci => {
        if (!ci || ci.active === false || ci.status === 'destroyed') return false;
        const cw = cws.find(w => w.name === ci.weaponName);
        return !!cw && types.indexOf(cw.type) >= 0;
    });
}
function mapActionHasCrewFlag(squad, flag) {
    const cws = mapActionCrewWeapons(squad);
    return (squad.crewInstances || []).some(ci => {
        if (!ci || ci.active === false || ci.status === 'destroyed') return false;
        const cw = cws.find(w => w.name === ci.weaponName);
        return !!cw && !!cw[flag];
    });
}
function mapActionDotCrewIndices(squad, types) {
    const cws = mapActionCrewWeapons(squad);
    return (squad && squad.crewInstances || []).map((ci, index) => ({ ci, index }))
        .filter(({ ci }) => {
            if (!ci || ci.active === false || ci.status === 'destroyed' || ci.status === 'blinded') return false;
            const cw = cws.find(w => w.name === ci.weaponName);
            return !!cw && types.includes(cw.type);
        }).map(item => item.index);
}
function mapActionHasSniper(squad) {
    let ws = [];
    try { ws = getFactionWeapons(squad.faction) || []; } catch (e) { return false; }
    return (squad.fighters || []).some(f => f && f.hp > 0 && ws.some(w => w.name === f.weapon && w.sniper));
}

// Боец, который может сходить за боеприпасами: не командир и не наводчик пулемёта.
function mapActionEligibleAmmoRunners(squad) {
    if (!squad || squad.hidden || squad.isDestroyed) return [];
    const excluded = new Set();
    const crewWeapons = mapActionCrewWeapons(squad);
    (squad.crewInstances || []).forEach(ci => {
        if (!ci) return;
        const weapon = crewWeapons.find(w => w && w.name === ci.weaponName);
        if (!weapon || weapon.type !== 'mg') return;
        const indices = Array.isArray(ci.fighterIndices) ? ci.fighterIndices : [];
        const explicit = [ci.gunnerIndex, ci.machineGunnerIndex, ci.operatorIndex]
            .map(Number).find(Number.isInteger);
        if (explicit !== undefined && indices.includes(explicit)) {
            excluded.add(explicit);
            return;
        }
        const namedGunner = indices.find(i => /пулем[её]тчик|наводчик.*пулем/i.test(String((squad.fighters || [])[i]?.name || '')));
        if (namedGunner !== undefined) excluded.add(namedGunner);
        else if (indices.length) excluded.add(indices[0]);
    });
    return (squad.fighters || []).map((fighter, index) => ({ fighter, index })).filter(({ fighter, index }) => {
        if (!fighter || fighter.hp <= 0 || fighter.isAway || fighter.isCommander || excluded.has(index)) return false;
        if (fighter.isMachineGunner || fighter.isGunner) return false;
        return !/командир|пулем[её]тчик|наводчик.*пулем/i.test(String(fighter.name || ''));
    });
}

function mapActionCanUseBinoculars(squad) {
    const label = `${(squad && squad.name) || ''} ${(squad && squad.opUnitName) || ''} ${(squad && squad.opUnitType) || ''}`;
    return /(штаб|headquarters|\bhq\b|battalion_hq|company_hq|развед)/i.test(label) && !/снабж/i.test(label);
}

function mapActionEnemyAlive(enemy) {
    if (!enemy || enemy.isDestroyed || enemy.isRetreated || enemy.status === 'retreated') return 0;
    return (enemy.fighters || []).filter(f => f && f.hp > 0).length;
}
function mapActionEnemyTargetable(enemy) {
    return !!enemy && enemy.hidden !== true && !!enemy.detected && !enemy.isRetreated && enemy.status !== 'retreated' && mapActionEnemyAlive(enemy) > 0;
}
function mapActionEnemyIsVehicle(enemy) {
    return !!(enemy && (enemy.isVehicle || enemy.armor));
}

// Текущий выбранный на карте отряд (индекс в appData.squads) или -1
function mapActionSelectedIdx() {
    if (!appData || !appData.map) return -1;
    const idx = appData.map.selectedMoveSquadIdx;
    if (idx === null || idx === undefined || idx < 0) return -1;
    if (!appData.squads || !appData.squads[idx]) return -1;
    return idx;
}

// Цель по индексу: дистанция/укрытие/причина недопустимости для действия
function mapActionEvalTarget(def, shooterIdx, enemyIdx, extra) {
    const grid = appData.map.grid;
    const enemy = (appData.map.enemySquads || [])[enemyIdx];
    const out = { idx: enemyIdx, enemy, ok: false, reason: '', dist: null, cover: null };
    if (!enemy) { out.reason = 'нет отряда'; return out; }
    if (enemy.hidden === true || !enemy.detected) { out.reason = 'не обнаружен'; return out; }
    if (mapActionEnemyAlive(enemy) === 0) { out.reason = 'уничтожен'; return out; }
    const sPos = getBattleSquadHex(grid, shooterIdx, false);
    const tPos = getBattleSquadHex(grid, enemyIdx, true);
    if (!sPos) { out.reason = 'ваш отряд не на карте'; return out; }
    if (!tPos) { out.reason = 'не на карте'; return out; }
    if (def.id !== 'melee' && typeof tacticalSmokeBlocksSight === 'function' && tacticalSmokeBlocksSight(sPos.key, tPos.key, appData.map)) {
        out.reason = 'линия обстрела перекрыта дымом'; return out;
    }
    out.dist = hexGridDistance(sPos.col, sPos.row, tPos.col, tPos.row);
    out.cover = getTacticalCoverInfoForEnemy(grid, enemyIdx);
    const shooterSquad = appData.squads[shooterIdx];
    // ⚡ v13.065 (R43#7): в гексе цели стоит свой отряд — стрелять нельзя (не бей своих)
    if (def.id !== 'melee' && typeof tacticalEnemyHexHasFriendlies === 'function') {
        const friend = tacticalEnemyHexHasFriendlies(enemy);
        if (friend && friend !== shooterSquad) { out.reason = 'в гексе свои — бить нельзя'; return out; }
    }
    if (def.id !== 'melee' && typeof tacticalIsMeleeEngaged === 'function' && tacticalIsMeleeEngaged(enemy)) { out.reason = 'цель связана рукопашной'; return out; }
    if (def.id === 'melee' && tacticalIsMeleeEngaged(shooterSquad) && shooterSquad.meleeOpponentName && shooterSquad.meleeOpponentName !== enemy.name) { out.reason = 'продолжайте текущую рукопашную'; return out; }
    const isVeh = mapActionEnemyIsVehicle(enemy);
    if (def.targets === 'vehicle' && !isVeh) { out.reason = 'цель — не техника'; return out; }
    if (def.targets === 'infantry' && isVeh) { out.reason = 'по технике так нельзя'; return out; }
    let maxDist = def.maxDist;
    const shooter = (appData.squads || [])[shooterIdx];
    if (shooter && /ДОТ/i.test(String(shooter.name || '')) && typeof tacticalDotCanFireAtTarget === 'function') {
        if (def.id === 'ordnance') {
            const crewIndices = mapActionDotCrewIndices(shooter, ['at_gun', 'mortar', 'tank_gun']);
            if (crewIndices.length && !tacticalDotCanFireAtTarget(shooterIdx, enemyIdx, crewIndices)) {
                out.reason = 'цель вне сектора орудий ДОТа'; return out;
            }
        } else if (def.id === 'dotmg') {
            const crewIndices = mapActionDotCrewIndices(shooter, ['mg']);
            const selectedCrew = Number.isInteger(Number(extra)) ? Number(extra) : null;
            const relevant = selectedCrew === null ? crewIndices : crewIndices.filter(i => i === selectedCrew);
            if (relevant.length && !tacticalDotCanFireAtTarget(shooterIdx, enemyIdx, relevant)) {
                out.reason = 'цель вне сектора пулемётной амбразуры'; return out;
            }
        }
    }
    if (def.id === 'ordnance' && typeof is82mmMortarSquad === 'function' && is82mmMortarSquad(shooter)) {
        maxDist = (maxDist === undefined) ? 4 : Math.min(maxDist, 4);
    }
    if (maxDist !== undefined && out.dist > maxDist) { out.reason = `далеко (${out.dist} > ${maxDist})`; return out; }
    if (def.small) {
        const blocked = smallArmsBlockedByForest(grid, shooterIdx, enemyIdx);
        if (blocked) { out.reason = `лес глубиной ${blocked.depth} (>2)`; return out; }
    }
    out.ok = true;
    return out;
}

function mapActionDefById(id) {
    if (id === 'dotmg') return { id: 'dotmg', label: 'Пулемёт ДОТа', targets: 'infantry', small: true };
    return MAP_ACTION_DEFS.find(d => d.id === id) || null;
}

// ───────────────────────── ПАНЕЛЬ ПОД КАРТОЙ ─────────────────────────
function renderMapActionPanel() {
    const panel = (typeof document !== 'undefined') ? document.getElementById('battleMapActionPanel') : null;
    if (!panel) return;
    if (!appData || !appData.map || !appData.map.grid || !Array.isArray(appData.squads)) { panel.style.display = 'none'; return; }
    if (typeof hexEditorState !== 'undefined' && hexEditorState) { panel.style.display = 'none'; return; }
    const idx = mapActionSelectedIdx();
    if (idx < 0) {
        const anyPlaced = appData.squads.some((s, i) => !s.hidden && getBattleSquadHex(appData.map.grid, i, false));
        if (!anyPlaced) { panel.style.display = 'none'; return; }
        panel.style.display = 'block';
        panel.innerHTML = '<span style="color:#aaa;">👆 Кликните по своему отряду на карте — появятся кнопки действий (стрельба, подавление, гранаты, рукопашная) и подсветка движения.</span>';
        return;
    }
    const squad = appData.squads[idx];
    const ap = (typeof getAP === 'function') ? getAP(idx) : 0;
    const maxAp = (typeof actionPoints !== 'undefined' && actionPoints[idx]) ? actionPoints[idx].maxAp : 0;
    const alive = (squad.fighters || []).filter(f => f && f.hp > 0).length;
    const total = (squad.fighters || []).length;
    const pos = getBattleSquadHex(appData.map.grid, idx, false);
    const morale = (squad.currentMorale !== undefined && squad.currentMorale !== null) ? squad.currentMorale : squad.baseMorale;
    const fmtAp = v => (Math.round(v) / 2).toString().replace('.5', ',5');

    let html = `<div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:6px;">` +
        (squad.icon ? `<img src="${squad.icon}" style="height:32px; border-radius:4px;">` : '') +
        `<b style="color:#f1c40f;">${squad.name}</b>` +
        `<span>ОД: <b>${fmtAp(ap)}</b>/${fmtAp(maxAp)}</span>` +
        `<span>Бойцов: <b>${alive}</b>/${total}</span>` +
        `<span>Дух: ${morale}/${squad.baseMorale}</span>` +
        (squad.armor ? '' : `<span>Патроны: ${squad.ammoSmall || 0} · Гранаты: ${squad.grenades || 0}</span>`) +
        (squad.ammoOrdnance ? `<span>Снаряды: ${squad.ammoOrdnance}</span>` : '') +
        (squad.suppressed ? `<span style="color:#f39c12;">💫 подавлен: без движения, стрельба −2</span>` : '') +
        (pos ? `<span style="color:#aaa;">гекс ${pos.key}</span>` : `<span style="color:#e74c3c;">не размещён</span>`) +
        `</div>`;

    const pa = appData.map.pendingMapAttack;
    const binocularsPending = appData.map.pendingMapBinoculars;
    if (binocularsPending) {
        html += `<div style="background:#152c38; border:1px solid #3498db; border-radius:6px; padding:6px; margin-bottom:6px;">` +
            `<b style="color:#5dade2;">🔭 Бинокль</b>: выберите гекс на карте для проверки скрытых противников.` +
            `<div style="margin-top:6px;"><button onclick="mapCancelAction()" style="background:#555;">✖ Отмена</button></div></div>`;
    } else if (pa) {
        const def = mapActionDefById(pa.type);
        html += `<div style="background:#3a2a12; border:1px solid #f39c12; border-radius:6px; padding:6px; margin-bottom:6px;">` +
            `<b style="color:#f39c12;">🎯 ${def ? def.label : pa.type}</b>: выберите отряд противника — кликните по нему на карте или в списке:` +
            `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">`;
        const enemies = appData.map.enemySquads || [];
        const hexFilter = appData.map.pendingTargetHex;
        const evals = enemies.map((e, i) => mapActionEvalTarget(def || { targets: 'any' }, idx, i, pa.extra))
            .filter(ev => ev.enemy && ev.enemy.hidden !== true && ev.enemy.detected && ev.dist !== null)
            .filter(ev => {
                if (!hexFilter) return true;
                const pos = (typeof getBattleSquadHex === 'function') ? getBattleSquadHex(appData.map.grid, ev.idx, true) : null;
                return pos && pos.key === hexFilter;
            })
            .sort((a, b) => a.dist - b.dist);
        if (evals.length === 0) html += '<span style="color:#e74c3c;">Отрядов противника на карте нет.</span>';
        evals.forEach(ev => {
            const e = ev.enemy;
            const al = mapActionEnemyAlive(e);
            const cov = (ev.cover && ev.cover.mod) ? `, укрытие ${ev.cover.label} +${ev.cover.mod}` : '';
            const title = `${e.name} — ${ev.dist} гекс(ов)${cov}, бойцов ${al}/${(e.fighters || []).length}` + (e.suppressed ? ', подавлен' : '');
            if (ev.ok) {
                html += `<button onclick="mapPickTarget(${ev.idx})" style="background:#c0392b;">${title}</button>`;
            } else {
                html += `<button disabled title="${ev.reason}" style="background:#555; opacity:0.7;">${title} — ${ev.reason}</button>`;
            }
        });
        html += `</div><div style="margin-top:6px;"><button onclick="mapCancelAction()" style="background:#555;">✖ Отмена</button></div></div>`;
    } else {
        html += `<div style="display:flex; flex-wrap:wrap; gap:4px;">`;
        const routed = (typeof getEffectiveMorale === 'function' && typeof currentSquadIndex !== 'undefined' && currentSquadIndex === idx) ? (getEffectiveMorale() <= 1) : false;
        const phaseLocked = typeof getTacticalActiveSide === 'function' && getTacticalActiveSide() !== 'player';
        if (typeof isBicycleTacticalSquad === 'function' && isBicycleTacticalSquad(squad) && !squad.dismounted) {
            html += `<button onclick="selectSquad(${idx}); dismountBicycle(); renderMapActionPanel();" ${tacticalActionAllowed(squad, 'utility', true) ? '' : 'disabled'}>🚲 Спешиться</button>`;
        }
        if (typeof tacticalIsMeleeEngaged === 'function' && tacticalIsMeleeEngaged(squad)) {
            html += `<button onclick="selectSquad(${idx}); retreatFromMelee();" ${tacticalActionAllowed(squad, 'retreatMelee', true) ? '' : 'disabled'}>↩ Отступить из рукопашной</button>`;
        }
        const meleeEngaged = typeof tacticalIsMeleeEngaged === 'function' && tacticalIsMeleeEngaged(squad);
        MAP_ACTION_DEFS.forEach(def => {
            let show = false;
            try { show = def.show(squad); } catch (e) { show = false; }
            if (!show) return;
            const isMeleeAction = def.id === 'melee';
            const actionAllowed = typeof tacticalActionAllowed !== 'function' || tacticalActionAllowed(squad, isMeleeAction ? 'melee' : 'attack', true);
            const dis = (ap <= 0 || routed || !pos || phaseLocked || (meleeEngaged && !isMeleeAction) || !actionAllowed) ? 'disabled' : '';
            html += `<button onclick="mapAction('${def.id}')" ${dis}>${def.label}</button>`;
        });
        const utilityAllowed = typeof tacticalActionAllowed !== 'function' || tacticalActionAllowed(squad, 'utility', true);
        const utilityDisabled = (ap < 2 || routed || !pos || phaseLocked || meleeEngaged || !utilityAllowed) ? 'disabled' : '';
        if (mapActionCanUseBinoculars(squad)) {
            html += `<button onclick="mapBeginBinoculars()" ${utilityDisabled} title="1 ОД: выбрать гекс и обнаружить скрытые в нём отряды">🔭 Бинокль (1 ОД)</button>`;
        }
        if (Number(squad.flares) > 0) {
            html += `<button onclick="mapFireFlare(${idx})" ${utilityDisabled} title="Запустить осветительную ракету; действует до конца хода">🚀 Осветительная ракета (${Number(squad.flares)} шт.)</button>`;
        }
        const ammoRunners = mapActionEligibleAmmoRunners(squad);
        const ammoRunDisabled = (routed || !pos || phaseLocked || meleeEngaged || !utilityAllowed) ? 'disabled' : '';
        if (ammoRunners.length > 0) {
            html += `<button onclick="mapBeginAmmoRun()" ${ammoRunDisabled} title="Случайный боец вернётся с максимальным количеством выбранного боеприпаса">📦 За боеприпасами (${ammoRunners.length} бойц.)</button>`;
        }
        // пулемёты ДОТа — по амбразурам
        if ((squad.name || '').includes('ДОТ') && squad.crewInstances) {
            const cws = mapActionCrewWeapons(squad);
            squad.crewInstances.forEach((ci, ciIdx) => {
                if (!ci || ci.active === false || ci.status === 'destroyed' || ci.status === 'blinded') return;
                const cw = cws.find(w => w.name === ci.weaponName);
                if (!cw || cw.type !== 'mg') return;
                const dotAllowed = typeof tacticalActionAllowed !== 'function' || tacticalActionAllowed(squad, 'shoot', true);
                html += `<button onclick="mapAction('dotmg', ${ciIdx})" ${ap < 2 || phaseLocked || meleeEngaged || !dotAllowed ? 'disabled' : ''}>Пулемёт ${ciIdx + 1}-й амбразуры</button>`;
            });
        }
        html += `</div>`;
        html += `<div style="margin-top:6px; color:#aaa; font-size:0.85rem;">🚶 Движение: клик по подсвеченному гексу` +
            (phaseLocked ? ' — <span style="color:#e67e22;">сейчас фаза противника</span>' : '') +
            (meleeEngaged ? ' — <span style="color:#e67e22;">связан рукопашной</span>' : '') +
            (ap <= 0 ? ' — <span style="color:#e74c3c;">ОД закончились</span>' : '') +
            (routed ? ' — <span style="color:#e74c3c;">отряд бежит (дух ≤ 1)</span>' : '') +
            (!pos ? ' — <span style="color:#e74c3c;">сначала разместите отряд («🏷️ Разместить»)</span>' : '') +
            `</div>`;
        html += `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">` +
            `<button onclick="mapSelectNextSquad()" style="background:#2980b9;">→ Следующий отряд</button>` +
            `<button onclick="mapDeselectSquad()" style="background:#555;">Снять выделение</button>` +
            `</div>`;
    }
    const last = appData.map.lastAttackOutcome;
    if (last && last.text) {
        html += `<div style="margin-top:6px; padding:6px; background:#1e2a1e; border:1px solid #27ae60; border-radius:6px; font-size:0.9rem;">${last.text}</div>`;
    }
    panel.style.display = 'block';
    panel.innerHTML = html;
}

var mapQuickMenuOutsideHandler = null;
function mapCloseQuickActionMenu() {
    if (typeof document === 'undefined') return;
    const menu = document.getElementById('mapQuickActionMenu');
    if (mapQuickMenuOutsideHandler) {
        document.removeEventListener('pointerdown', mapQuickMenuOutsideHandler, true);
        mapQuickMenuOutsideHandler = null;
    }
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
}

function mapShowQuickActionMenu(idx, hexKey, clientX, clientY) {
    const squad = appData && appData.squads && appData.squads[idx];
    if (!squad || !appData.map) return;
    mapCloseQuickActionMenu();
    const ap = (typeof getAP === 'function') ? getAP(idx) : 0;
    const pos = getBattleSquadHex(appData.map.grid, idx, false);
    const routed = typeof getEffectiveMorale === 'function' && typeof currentSquadIndex !== 'undefined' && currentSquadIndex === idx
        ? getEffectiveMorale() <= 1 : false;
    const phaseLocked = typeof getTacticalActiveSide === 'function' && getTacticalActiveSide() !== 'player';
    const meleeEngaged = typeof tacticalIsMeleeEngaged === 'function' && tacticalIsMeleeEngaged(squad);
    const utilityAllowed = typeof tacticalActionAllowed !== 'function' || tacticalActionAllowed(squad, 'utility', true);
    const attackAllowed = typeof tacticalActionAllowed !== 'function' || tacticalActionAllowed(squad, 'attack', true);
    const meleeAllowed = typeof tacticalActionAllowed !== 'function' || tacticalActionAllowed(squad, 'melee', true);
    const disableBase = routed || !pos || phaseLocked;
    const esc = value => String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const button = (id, label, disabled, title) =>
        `<button type="button" data-map-quick-action="${id}" ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''} ` +
        `style="width:100%; padding:7px 9px; text-align:left; border:1px solid #52616b; border-radius:6px; background:${disabled ? '#444' : '#263743'}; color:#f2f4f5; opacity:${disabled ? '.58' : '1'};">${label}</button>`;
    let html = `<div style="font-weight:700; color:#f1c40f; margin-bottom:6px;">${esc(squad.name)}</div>`;
    html += `<div style="font-size:.78rem; color:#aeb9bf; margin-bottom:6px;">Гекс ${esc(hexKey || (pos && pos.key) || '')} · ОД ${typeof getAP === 'function' ? (getAP(idx) / 2) : 0}</div>`;
    html += '<div style="display:grid; gap:4px; max-height:50vh; overflow-y:auto;">';
    let actionCount = 0;
    MAP_ACTION_DEFS.forEach(def => {
        let show = false;
        try { show = def.show(squad); } catch (e) { show = false; }
        if (!show) return;
        const isMelee = def.id === 'melee';
        const disabled = disableBase || ap <= 0 || (meleeEngaged && !isMelee) ||
            !((isMelee ? meleeAllowed : attackAllowed));
        html += button(`attack:${def.id}`, def.label, disabled);
        actionCount++;
    });
    if (typeof isBicycleTacticalSquad === 'function' && isBicycleTacticalSquad(squad) && !squad.dismounted) {
        html += button('dismount', '🚲 Спешиться', disableBase || meleeEngaged || !utilityAllowed);
        actionCount++;
    }
    if (meleeEngaged) {
        const allowed = typeof tacticalActionAllowed !== 'function' || tacticalActionAllowed(squad, 'retreatMelee', true);
        html += button('retreat-melee', '↩ Отступить из рукопашной', disableBase || !allowed);
        actionCount++;
    }
    const runnerCount = mapActionEligibleAmmoRunners(squad).length;
    if (runnerCount > 0) {
        html += button('ammo-run', `📦 За боеприпасами (${runnerCount} бойц.)`, disableBase || meleeEngaged || !utilityAllowed,
            'Боец вернётся с 30 патронами, 10 снарядами или 5 гранатами');
        actionCount++;
    }
    if (mapActionCanUseBinoculars(squad)) {
        html += button('binoculars', '🔭 Бинокль', disableBase || ap < 2 || meleeEngaged || !utilityAllowed, '1 ОД: выбрать гекс и обнаружить скрытые отряды');
        actionCount++;
    }
    if (Number(squad.flares) > 0) {
        html += button('flare', `🚀 Осветительная ракета (${Number(squad.flares)})`, disableBase || ap < 2 || meleeEngaged || !utilityAllowed,
            'Запустить ракету до конца текущего хода');
        actionCount++;
    }
    if ((squad.name || '').includes('ДОТ') && squad.crewInstances) {
        const cws = mapActionCrewWeapons(squad);
        squad.crewInstances.forEach((ci, ciIdx) => {
            if (!ci || ci.active === false || ci.status === 'destroyed' || ci.status === 'blinded') return;
            const cw = cws.find(w => w.name === ci.weaponName);
            if (!cw || cw.type !== 'mg') return;
            const dotAllowed = typeof tacticalActionAllowed !== 'function' || tacticalActionAllowed(squad, 'shoot', true);
            html += button(`dotmg:${ciIdx}`, `🏰 Пулемёт ${ciIdx + 1}-й амбразуры`, disableBase || ap < 2 || meleeEngaged || !dotAllowed);
            actionCount++;
        });
    }
    if (!actionCount) html += '<span style="color:#aaa; padding:4px;">Дополнительных действий нет.</span>';
    html += '</div><button type="button" data-map-quick-action="close" style="width:100%; margin-top:7px; background:#555;">Закрыть</button>';

    const menu = document.createElement('div');
    menu.id = 'mapQuickActionMenu';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = 'position:fixed; z-index:1200; width:min(300px, calc(100vw - 16px)); max-height:60vh; overflow:auto; padding:9px; background:rgba(18,25,31,.98); border:1px solid #607d8b; border-radius:9px; box-shadow:0 8px 28px rgba(0,0,0,.65); font-size:.88rem;';
    menu.innerHTML = html;
    menu.addEventListener('click', event => {
        const clicked = event.target && event.target.closest ? event.target.closest('[data-map-quick-action]') : null;
        if (!clicked || clicked.disabled) return;
        const action = clicked.getAttribute('data-map-quick-action') || '';
        mapCloseQuickActionMenu();
        if (action === 'close') return;
        if (action.startsWith('attack:')) { mapAction(action.slice(7)); return; }
        if (action.startsWith('dotmg:')) { mapAction('dotmg', Number(action.slice(6))); return; }
        if (action === 'ammo-run') { mapBeginAmmoRun(); return; }
        if (action === 'binoculars') { mapBeginBinoculars(); return; }
        if (action === 'flare') { mapFireFlare(idx); return; }
        if (action === 'dismount') {
            if (typeof selectSquad === 'function') selectSquad(idx);
            if (typeof dismountBicycle === 'function') dismountBicycle();
            renderMapActionPanel();
            return;
        }
        if (action === 'retreat-melee') {
            if (typeof selectSquad === 'function') selectSquad(idx);
            if (typeof retreatFromMelee === 'function') retreatFromMelee();
        }
    });
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 1024;
    const viewportHeight = (typeof window !== 'undefined' && window.innerHeight) || 768;
    const left = Math.max(8, Math.min((Number(clientX) || 0) - rect.width / 2, viewportWidth - rect.width - 8));
    let top = (Number(clientY) || 0) - rect.height - 10;
    if (top < 8) top = Math.min(viewportHeight - rect.height - 8, (Number(clientY) || 0) + 10);
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    mapQuickMenuOutsideHandler = event => {
        if (!menu.contains(event.target)) mapCloseQuickActionMenu();
    };
    document.addEventListener('pointerdown', mapQuickMenuOutsideHandler, true);
}

function mapActionInfo(msg, color) {
    try {
        const mi = document.getElementById('mapInfo');
        if (mi) { mi.innerHTML = msg; mi.style.color = color || '#f1c40f'; }
    } catch (e) {}
}

// Кнопка действия нажата — ждём выбор цели
function mapAction(type, extra) {
    // ⚡ v13.055 (R39#3): пока не завершено размещение — действий нет
    if (typeof placementPendingReason === 'function') {
        const pr = placementPendingReason();
        if (pr) { mapActionInfo(pr, '#e67e22'); return; }
    }
    const idx = mapActionSelectedIdx();
    if (idx < 0) { mapActionInfo('⚠️ Сначала выберите свой отряд на карте.', '#e74c3c'); return; }
    const squad = appData.squads[idx];
    const action = type === 'melee' ? 'melee' : 'attack';
    if (typeof tacticalActionAllowed === 'function' && !tacticalActionAllowed(squad, action)) { renderMapActionPanel(); return; }
    if (!getBattleSquadHex(appData.map.grid, idx, false)) { mapActionInfo('⚠️ Отряд не размещён на карте.', '#e74c3c'); return; }
    if (typeof currentSquadIndex !== 'undefined' && currentSquadIndex !== idx && typeof selectSquad === 'function') selectSquad(idx);
    appData.map.pendingMapBinoculars = null;
    appData.map.pendingMapAttack = { type: type, extra: (extra === undefined ? null : extra), squadIdx: idx };
    const def = mapActionDefById(type);
    mapActionInfo(`🎯 ${def ? def.label : type}: кликните по отряду противника на карте (или выберите в списке под картой).`);
    renderMapActionPanel();
    if (typeof redrawMap === 'function') redrawMap();
}

function mapCancelAction() {
    if (appData && appData.map) {
        appData.map.pendingMapAttack = null;
        appData.map.pendingMapBinoculars = null;
        appData.map.pendingTargetHex = null;
    }
    mapActionInfo('Действие отменено.', '#aaa');
    renderMapActionPanel();
    if (typeof redrawMap === 'function') redrawMap();
}

function mapDeselectSquad() {
    mapCloseQuickActionMenu();
    if (!appData || !appData.map) return;
    appData.map.pendingMapAttack = null;
    appData.map.pendingMapBinoculars = null;
    appData.map.selectedMoveSquadIdx = null;
    appData.map.reachableHexes = [];
    appData.map.reachableCosts = null;
    renderMapActionPanel();
    if (typeof redrawMap === 'function') redrawMap();
}

function mapBeginAmmoRun() {
    if (typeof placementPendingReason === 'function') {
        const reason = placementPendingReason();
        if (reason) { mapActionInfo(reason, '#e67e22'); return; }
    }
    const idx = mapActionSelectedIdx();
    if (idx < 0) { mapActionInfo('⚠️ Сначала выберите свой отряд на карте.', '#e74c3c'); return; }
    const squad = appData.squads[idx];
    if (typeof tacticalActionAllowed === 'function' && !tacticalActionAllowed(squad, 'utility')) return;
    if (!getBattleSquadHex(appData.map.grid, idx, false)) { mapActionInfo('⚠️ Отряд не размещён на карте.', '#e74c3c'); return; }
    if (typeof tacticalIsMeleeEngaged === 'function' && tacticalIsMeleeEngaged(squad)) {
        mapActionInfo('⛔ Нельзя отправить бойца за боеприпасами во время рукопашной.', '#e67e22');
        return;
    }
    const runners = mapActionEligibleAmmoRunners(squad);
    if (!runners.length) { mapActionInfo('Нет свободного живого бойца (кроме командира и наводчика пулемёта), который может идти за боеприпасами.', '#e67e22'); return; }
    if (typeof syncLiveMapSupplyPoints === 'function') syncLiveMapSupplyPoints();
    const pos = getBattleSquadHex(appData.map.grid, idx, false);
    const supplyKeys = typeof activeSupplyPointKeys === 'function'
        ? activeSupplyPointKeys(appData.map, 'player') : [];
    if (!supplyKeys.length) {
        mapActionInfo('⛔ Нет действующего пункта боепитания — отправка за БК запрещена.', '#e74c3c');
        return;
    }
    const turns = (pos && typeof estimateAmmoDeliveryTurns === 'function')
        ? estimateAmmoDeliveryTurns(appData.map, pos.key, 'player') : null;
    if (!Number.isInteger(turns) || turns <= 0) {
        mapActionInfo('⛔ Не удалось рассчитать маршрут до пункта боепитания.', '#e74c3c');
        return;
    }
    const type = prompt('Что принести?\n1 — Патроны (30)\n2 — Снаряды (10)\n3 — Гранаты (5)', '1');
    if (type === null) return;
    if (!['1', '2', '3'].includes(String(type).trim())) { mapActionInfo('Выберите тип боеприпаса: 1, 2 или 3.', '#e67e22'); return; }
    const runner = runners[Math.floor(Math.random() * runners.length)].fighter;
    runner.isAway = true;
    runner.turnsToReturn = turns;
    runner.ammoType = String(type).trim();
    runner.ammoSupplyHex = nearestSupplyPoint(appData.map, pos.key, 'player')?.key || null;
    const ammoName = runner.ammoType === '1' ? 'патронами (+30)' : runner.ammoType === '2' ? 'снарядами (+10)' : 'гранатами (+5)';
    const message = `📦 ${runner.name} из отряда «${squad.name}» отправился за ${ammoName} к пункту ${runner.ammoSupplyHex}; ETA ${turns} такт. фаз(ы) / ${turns * 2} мин.`;
    if (typeof log === 'function') log(message);
    mapActionInfo(message, '#27ae60');
    if (typeof updateUI === 'function') updateUI();
    if (typeof saveData === 'function') saveData();
    renderMapActionPanel();
}

// Следующий свой отряд, стоящий на карте (по кругу)
function mapSelectNextSquad() {
    const n = (appData.squads || []).length;
    if (!n) return;
    const cur = mapActionSelectedIdx();
    for (let step = 1; step <= n; step++) {
        const i = ((cur < 0 ? -1 : cur) + step) % n;
        const s = appData.squads[i];
        if (!s || s.hidden) continue;
        const pos = getBattleSquadHex(appData.map.grid, i, false);
        if (!pos) continue;
        mapSelectSquadOnMap(i, pos.key);
        return;
    }
    mapActionInfo('Нет других размещённых отрядов.', '#aaa');
}

// Выбрать свой отряд на карте (режим движения + подсветка + панель)
function mapSelectSquadOnMap(i, key) {
    appData.map.pendingMapAttack = null;
    appData.map.pendingMapBinoculars = null;
    if (appData.map.mode !== 'move') {
        appData.map.mode = 'move';
        try { const cl = document.getElementById('crouchLabel'); if (cl) cl.style.display = 'inline-block'; } catch (e) {}
    }
    appData.map.selectedMoveSquadIdx = i;
    if (!appData.squads[i].hexPos) appData.squads[i].hexPos = key.split(',').map(Number);
    if (typeof recalcReachable === 'function') { try { recalcReachable(appData.squads[i], key); } catch (e) {} }
    mapActionInfo(`Выбран отряд «${appData.squads[i].name}» (гекс ${key}). Кликните по гексу для перемещения или выберите действие под картой.`);
    mapActionsOnSelect(i);
    if (typeof redrawMap === 'function') redrawMap();
}

function mapBeginBinoculars() {
    const idx = mapActionSelectedIdx();
    if (idx < 0) { mapActionInfo('⚠️ Сначала выберите свой отряд на карте.', '#e74c3c'); return; }
    const squad = appData.squads[idx];
    if (!mapActionCanUseBinoculars(squad)) { mapActionInfo('🔭 Бинокль доступен только штабам и разведывательным отделениям.', '#e74c3c'); return; }
    if (typeof tacticalActionAllowed === 'function' && !tacticalActionAllowed(squad, 'utility')) return;
    if (!getBattleSquadHex(appData.map.grid, idx, false)) { mapActionInfo('⚠️ Отряд не размещён на карте.', '#e74c3c'); return; }
    if ((typeof getAP === 'function' ? getAP(idx) : 0) < 2) { mapActionInfo('⛔ Для бинокля требуется 1 ОД.', '#e74c3c'); return; }
    appData.map.pendingMapAttack = null;
    appData.map.pendingMapBinoculars = { squadIdx: idx };
    mapActionInfo('🔭 Выберите гекс на карте. Бинокль обнаружит все скрытые в нём вражеские отряды.');
    renderMapActionPanel();
    if (typeof redrawMap === 'function') redrawMap();
}

function mapHexClickDuringBinoculars(key) {
    const pending = appData && appData.map && appData.map.pendingMapBinoculars;
    if (!pending) return false;
    const idx = Number(pending.squadIdx);
    const squad = (appData.squads || [])[idx];
    if (!squad || !mapActionCanUseBinoculars(squad)) {
        mapCancelAction();
        mapActionInfo('🔭 Действие отменено: выбранный отряд больше не доступен.', '#e74c3c');
        return true;
    }
    if (typeof tacticalActionAllowed === 'function' && !tacticalActionAllowed(squad, 'utility')) {
        mapCancelAction();
        renderMapActionPanel();
        return true;
    }
    if (!getBattleSquadHex(appData.map.grid, idx, false)) {
        mapCancelAction();
        mapActionInfo('⚠️ Отряд не размещён на карте.', '#e74c3c');
        return true;
    }
    if (typeof getAP === 'function' && getAP(idx) < 2) {
        mapCancelAction();
        mapActionInfo('⛔ Для бинокля требуется 1 ОД.', '#e74c3c');
        renderMapActionPanel();
        return true;
    }
    if (!appData.map.grid[key]) {
        mapActionInfo(`⛔ Гекс ${key} не найден на карте.`, '#e74c3c');
        return true;
    }
    const observerPos = getBattleSquadHex(appData.map.grid, idx, false);
    if (observerPos && typeof tacticalSmokeBlocksSight === 'function' && tacticalSmokeBlocksSight(observerPos.key, key, appData.map)) {
        mapActionInfo('💨 Дымовая завеса закрывает линию обзора — цель не обнаружена.');
        return true;
    }
    const enemies = appData.map.enemySquads || [];
    const found = [];
    enemies.forEach((enemy, enemyIdx) => {
        if (!enemy || (typeof tacticalEnemyIsNeutralized === 'function' && tacticalEnemyIsNeutralized(enemy)) || mapActionEnemyAlive(enemy) <= 0) return;
        let pos = getBattleSquadHex(appData.map.grid, enemyIdx, true);
        if (!pos && Array.isArray(enemy.hexPos)) pos = { key: enemy.hexPos.join(',') };
        if (!pos || pos.key !== key) return;
        if (enemy.hidden === true || enemy.detected !== true) found.push(enemy);
    });
    if (typeof spendAP === 'function' && !spendAP(idx, 2, 'utility')) {
        mapCancelAction();
        mapActionInfo('⛔ Недостаточно ОД для бинокля.', '#e74c3c');
        renderMapActionPanel();
        return true;
    }
    found.forEach(enemy => {
        enemy.hidden = false;
        enemy.detected = true;
        enemy.binocularsDetectedTurn = (typeof currentTurn !== 'undefined') ? currentTurn : 1;
    });
    appData.map.pendingMapBinoculars = null;
    if (found.length) {
        mapActionInfo(`🔭 На гексе ${key} обнаружены: ${found.map(e => e.name).join(', ')}.`, '#2ecc71');
        try { log(`🔭 Бинокль: обнаружены вражеские отряды на гексе ${key}: ${found.map(e => e.name).join(', ')}.`); } catch (e) {}
    } else {
        mapActionInfo(`🔭 На гексе ${key} скрытых вражеских отрядов нет.`, '#aaa');
        try { log(`🔭 Бинокль проверил гекс ${key}: скрытых вражеских отрядов нет.`); } catch (e) {}
    }
    try { saveData(); } catch (e) {}
    try { if (appData.campaign && appData.campaign.online && typeof onlinePushBattles === 'function') onlinePushBattles(true); } catch (e) {}
    renderMapActionPanel();
    if (typeof redrawMap === 'function') redrawMap();
    return true;
}

function mapFireFlare(idx) {
    idx = Number.isInteger(Number(idx)) ? Number(idx) : mapActionSelectedIdx();
    const squad = (appData.squads || [])[idx];
    if (!squad || Number(squad.flares) <= 0) return;
    if (typeof tacticalActionAllowed === 'function' && !tacticalActionAllowed(squad, 'utility')) return;
    if (typeof selectSquad === 'function' && currentSquadIndex !== idx) selectSquad(idx);
    if (typeof fireFlare === 'function') fireFlare();
    renderMapActionPanel();
    if (typeof redrawMap === 'function') redrawMap();
}

// Клик по гексу карты, пока ждём цель. true — клик обработан
function mapHexClickDuringAttack(key) {
    const pa = appData.map.pendingMapAttack;
    if (!pa) return false;
    const hex = appData.map.grid[key];
    const ids = (hex && hex.enemySquadIds) ? hex.enemySquadIds.filter(i => mapActionEnemyTargetable((appData.map.enemySquads || [])[i])) : [];
    if (ids.length === 0) {
        // клик по своему отряду — переключаем выбор
        if (hex && hex.squadIds && hex.squadIds.length > 0) {
            mapSelectSquadOnMap(hex.squadIds[0], key);
            return true;
        }
        mapActionInfo('На этом гексе нет отрядов противника. Кликните по врагу или нажмите «✖ Отмена».', '#e74c3c');
        return true;
    }
    if (ids.length === 1) { mapPickTarget(ids[0]); return true; }
    appData.map.pendingTargetHex = key;
    mapActionInfo(`На гексе ${key} несколько отрядов — нажмите кнопку нужного под картой.`);
    renderMapActionPanel();
    return true;
}

function mapActionLastLogLine() {
    try {
        const d = document.getElementById('log');
        if (!d || !d.innerHTML) return '';
        const parts = String(d.innerHTML).split('<br>').filter(x => x && x.trim());
        return parts.length ? parts[parts.length - 1] : '';
    } catch (e) { return ''; }
}

// Цель выбрана → подставляем дистанцию/укрытие → выполняем действие вкладки «Бой»
function mapPickTarget(enemyIdx) {
    const pa = appData.map.pendingMapAttack;
    if (!pa) return;
    const idx = mapActionSelectedIdx();
    if (idx < 0) { mapCancelAction(); return; }
    const selectedSquad = appData.squads[idx];
    const action = pa.type === 'melee' ? 'melee' : 'attack';
    if (typeof tacticalActionAllowed === 'function' && !tacticalActionAllowed(selectedSquad, action)) {
        appData.map.pendingMapAttack = null;
        renderMapActionPanel();
        return;
    }
    const def = mapActionDefById(pa.type) || { targets: 'any' };
    const ev = mapActionEvalTarget(def, idx, enemyIdx, pa.extra);
    if (!ev.ok) {
        mapActionInfo(`⛔ Цель «${ev.enemy ? ev.enemy.name : enemyIdx}» недопустима: ${ev.reason}.`, '#e74c3c');
        renderMapActionPanel();
        return;
    }
    if (typeof currentSquadIndex !== 'undefined' && currentSquadIndex !== idx && typeof selectSquad === 'function') selectSquad(idx);
    // дистанция и укрытие — как в модалке выбора цели (R34#3)
    const coverVal = Math.min(10, 6 + ((ev.cover && ev.cover.mod) || 0));
    ['targetDistance', 'modalDistance'].forEach(id => { const el = document.getElementById(id); if (el) el.value = Math.max(1, ev.dist); });
    ['coverTarget', 'modalCover'].forEach(id => { const el = document.getElementById(id); if (el) el.value = coverVal; });
    appData.map.attackTargetEnemyIdx = enemyIdx;
    appData.map.lastAttackOutcome = null;
    const enemy = ev.enemy;
    try { log(`🎯 [карта] ${appData.squads[idx].name} → «${enemy.name}»: ${def.label || pa.type}, дистанция ${ev.dist}, сложность ${coverVal}` + ((ev.cover && ev.cover.mod) ? ` (укрытие: ${ev.cover.label})` : '')); } catch (e) {}
    let err = null;
    try {
        mapRunAttack(pa.type, pa.extra);
    } catch (e) {
        err = e;
        try { log('❌ Ошибка действия: ' + e.message); } catch (e2) {}
        console.warn('mapRunAttack:', e);
    }
    appData.map.pendingMapAttack = null;
    appData.map.attackTargetEnemyIdx = null;
    if (!appData.map.lastAttackOutcome) {
        const why = err ? err.message : (mapActionLastLogLine() || 'см. лог во вкладке «⚡ Бой»');
        appData.map.lastAttackOutcome = { text: `⚠️ Действие «${def.label || pa.type}» не выполнено: ${why}` };
        mapActionInfo(appData.map.lastAttackOutcome.text, '#e74c3c');
    }
    try { saveData(); } catch (e) {}
    // после действия отряд остаётся выбранным (можно двигаться / стрелять ещё)
    const pos = getBattleSquadHex(appData.map.grid, idx, false);
    if (pos && typeof recalcReachable === 'function') { try { recalcReachable(appData.squads[idx], pos.key); } catch (e) {} }
    renderMapActionPanel();
    if (typeof redrawMap === 'function') redrawMap();
}

function mapRunAttack(type, extra) {
    switch (type) {
        case 'smallArms': return attackSmallArms();
        case 'ordnance': return attackOrdnance();
        case 'vehicle': return attackVehicle();
        case 'sniper': return sniperShot();
        case 'molotovCrew': return attackMolotovCrew();
        case 'ampulomet': return attackAmpulometAtVehicle();
        case 'atGrenade': return useATGrenade();
        case 'suppressiveFire': return suppressiveFire();
        case 'grenades': return throwGrenades();
        case 'satchel': return satchelCharge();
        case 'melee': return meleeAttack();
        case 'dotmg': return fireDOTMG(extra);
        default: throw new Error('неизвестное действие ' + type);
    }
}

// ───────────────────── ПРИМЕНЕНИЕ РЕЗУЛЬТАТА К ЦЕЛИ ─────────────────────

// Урон «по единице» случайным живым бойцам отряда противника
function applyDamagePointsToEnemy(enemy, points, res) {
    let applied = 0;
    for (let i = 0; i < points; i++) {
        const alive = (enemy.fighters || []).filter(f => f && f.hp > 0);
        if (alive.length === 0) break;
        const f = alive[Math.floor(Math.random() * alive.length)];
        f.hp = Math.max(0, (f.hp || 0) - 1);
        applied++;
        if (f.hp === 0) {
            res.killed.push(f.name || 'боец');
            const m = (enemy.currentMorale !== undefined && enemy.currentMorale !== null) ? enemy.currentMorale : (enemy.baseMorale || 5);
            enemy.currentMorale = Math.max(0, m - (f.isCommander ? 2 : 1));
            try { log(`   ☠️ «${enemy.name}»: ${f.name || 'боец'} погиб`); } catch (e) {}
        } else {
            if (res.wounded.indexOf(f.name || 'боец') < 0) res.wounded.push(f.name || 'боец');
            try { log(`   🔻 «${enemy.name}»: ${f.name || 'боец'} ранен (${f.hp}/${f.maxHp || f.hp})`); } catch (e) {}
        }
    }
    res.damage += applied;
    if (mapActionEnemyAlive(enemy) === 0 && (enemy.fighters || []).length > 0) {
        enemy.isDestroyed = true;
        res.notes.push('💀 отряд противника уничтожен');
        try { log(`💀 Отряд противника «${enemy.name}» уничтожен!`); } catch (e) {}
    }
    return applied;
}

// Пробитие техники: локация d6 (1..6) и пробитие в мм → модули/экипаж (processVehicleHit)
function applyVehicleHitToEnemy(enemy, loc, penMM, res, shooterName) {
    const li = Math.max(1, Math.min(6, parseInt(loc, 10) || 1)) - 1;
    const key = MAP_ACTION_LOC_KEYS[li];
    if (!mapActionEnemyIsVehicle(enemy)) {
        // по пехоте пробитие смысла не имеет — 1 урон за попадание корпусной болванкой
        if (key !== 'ricochet') applyDamagePointsToEnemy(enemy, 1, res);
        return;
    }
    const a = enemy.armor || {};
    let armorValue;
    switch (key) {
        case 'hull': armorValue = a.front || 20; break;
        case 'suspension': armorValue = 5; break;
        case 'turret': armorValue = (a.turret !== null && a.turret !== undefined) ? a.turret : (a.front || 20); break;
        case 'engine': case 'ammo': armorValue = a.side || a.rear || 15; break;
        default: armorValue = a.front || 20;
    }
    let r;
    if (typeof processVehicleHit === 'function') {
        r = processVehicleHit(enemy, key, penMM, armorValue, shooterName || '');
    } else {
        r = { result: (penMM > armorValue) ? 'penetrated' : 'no_penetration', message: (penMM > armorValue) ? 'пробитие' : 'броня выдержала' };
        if (penMM > armorValue && (key === 'engine' || key === 'ammo')) enemy.isDestroyed = true;
    }
    res.vehicleResults.push(`${MAP_ACTION_LOC_NAMES[li]} (${penMM} мм против ${armorValue} мм): ${r.message || r.result}`);
    try { log(`   🛡️ «${enemy.name}»: ${r.message || r.result}`); } catch (e) {}
    if (r.result === 'crew_killed') res.killed.push('член экипажа');
    if (enemy.isDestroyed) {
        // машина уничтожена — экипаж выбывает (так потери уходят оппоненту по ОЗ)
        (enemy.fighters || []).forEach(f => { if (f && f.hp > 0) { f.hp = 0; res.killed.push(f.name || 'экипаж'); } });
        res.notes.push('💀 техника уничтожена');
    }
}

// Вызывается из функций атаки вкладки «⚡ Бой» (после подсчёта результата).
// Без выбранной цели (attackTargetEnemyIdx) — ничего не делает (старый порядок).
function reportAttackOutcome(kind, data) {
    data = data || {};
    if (!appData || !appData.map) return null;
    const idx = appData.map.attackTargetEnemyIdx;
    if (idx === null || idx === undefined || idx < 0) return null;
    const enemy = (appData.map.enemySquads || [])[idx];
    if (!enemy) return null;
    if (kind !== 'melee' && typeof currentSquadIndex === 'number' && typeof tacticalSmokeBlocksAttack === 'function' && tacticalSmokeBlocksAttack(currentSquadIndex, idx)) {
        try { log('⛔ Дымовая завеса блокирует обнаружение и обстрел цели.'); } catch (e) {}
        return { blocked: true, target: enemy.name, damage: 0 };
    }
    const shooterName = (typeof currentSquad !== 'undefined' && currentSquad) ? currentSquad.name : '';
    const res = { kind, target: enemy.name, hits: data.hits || 0, damage: 0, killed: [], wounded: [], notes: [], vehicleResults: [] };
    const before = mapActionEnemyAlive(enemy);
    switch (kind) {
        case 'smallArms':
            applyDamagePointsToEnemy(enemy, data.hits || 0, res);
            break;
        case 'dotmg':
            if (mapActionEnemyIsVehicle(enemy)) res.notes.push('пулемёт ДОТа не наносит урон бронетехнике');
            else applyDamagePointsToEnemy(enemy, data.hits || 0, res);
            break;
        case 'sniper':
            applyDamagePointsToEnemy(enemy, (data.hits ? (data.damage || 0) : 0), res);
            break;
        case 'grenades':
        case 'ordnance':
        case 'ampulomet':
            applyDamagePointsToEnemy(enemy, data.damage || 0, res);
            if (kind === 'ampulomet' && data.fires) { enemy.burning = true; res.notes.push('🔥 техника горит'); }
            break;
        case 'melee': {
            applyDamagePointsToEnemy(enemy, data.damage || 0, res);
            const m = (enemy.currentMorale !== undefined && enemy.currentMorale !== null) ? enemy.currentMorale : (enemy.baseMorale || 5);
            enemy.currentMorale = Math.max(0, m - 1);
            const battle = typeof getTacticalBattleRecord === 'function' ? getTacticalBattleRecord() : null;
            if (battle) { battle.onlineMoraleOut = battle.onlineMoraleOut || {}; battle.onlineMoraleOut[enemy.name] = (battle.onlineMoraleOut[enemy.name] || 0) + 1; }
            if (mapActionEnemyAlive(enemy) > 0 && typeof currentSquad !== 'undefined' && currentSquad) {
                currentSquad.meleeOpponentName = enemy.name;
                currentSquad.meleeOpponentEnemyIdx = idx;
                enemy.meleeOpponentName = currentSquad.name;
                enemy.meleeOpponentSquadIdx = currentSquadIndex;
            } else if (typeof tacticalClearMeleeEngagement === 'function') {
                tacticalClearMeleeEngagement(enemy);
            }
            res.notes.push('дух противника −1');
            break;
        }
        case 'suppressiveFire':
            if ((data.hits || 0) > 0 || (data.shots || 0) > 0) {
                if (typeof markTacticalSuppressed === 'function') markTacticalSuppressed(enemy, 'player');
                else {
                    enemy.suppressed = true;
                    enemy.suppressedTurn = (typeof currentTurn !== 'undefined') ? currentTurn : 1;
                    enemy.suppressedBySide = 'player';
                }
                res.notes.push('💫 цель подавлена; перемещение запрещено в следующей фазе');
                mapActionMarkSuppressOut(enemy.name);
            }
            break;
        case 'vehicle':
        case 'satchel':
        case 'atGrenade':
            (data.vehicleHits || []).forEach(h => applyVehicleHitToEnemy(enemy, h.loc, h.pen, res, shooterName));
            res.hits = (data.vehicleHits || []).length;
            break;
        case 'molotovCrew':
            if (data.fires) { enemy.burning = true; res.notes.push('🔥 техника горит'); }
            if (data.blinds) { enemy.blinded = true; res.notes.push('👁️ техника ослеплена на ход'); }
            break;
        default:
            break;
    }
    if (enemy.isDestroyed) {
        if (typeof tacticalClearMeleeEngagement === 'function') tacticalClearMeleeEngagement(enemy);
    } else if (typeof tacticalMaybeAutoRetreat === 'function') {
        const retreated = tacticalMaybeAutoRetreat(enemy, 'enemy', idx);
        if (retreated) res.notes.push('🏳️ противник автоматически отступил из-за низкого боевого духа');
    }
    const after = mapActionEnemyAlive(enemy);
    if (typeof currentSquad !== 'undefined' && currentSquad) {
        if (typeof recordTacticalAwardCombatEvent === 'function' && (kind === 'melee' || kind === 'grenades')) {
            recordTacticalAwardCombatEvent(currentSquad, kind, enemy);
        }
        enemy.lastAwardAttackerSquadName = currentSquad.name;
        enemy.lastAwardAttackerSquadIdx = (typeof currentSquadIndex === 'number') ? currentSquadIndex : null;
        if (before > 0 && after === 0 && typeof recordTacticalAwardEnemyDefeat === 'function') {
            recordTacticalAwardEnemyDefeat(currentSquad, enemy, idx);
        }
    }
    const label = (mapActionDefById(kind) || { label: kind }).label;
    let text = `${label} → «${enemy.name}»: попаданий ${res.hits}`;
    if (res.damage) text += `, урон ${res.damage}`;
    if (res.killed.length) text += `, погибло ${res.killed.length}`;
    if (res.wounded.length) text += `, ранено ${res.wounded.length}`;
    if (res.vehicleResults.length) text += `; ${res.vehicleResults.join('; ')}`;
    if (res.notes.length) text += `; ${res.notes.join(', ')}`;
    text += `. Осталось бойцов: ${after}/${(enemy.fighters || []).length}` + (after !== before ? ` (было ${before})` : '');
    res.text = text;
    appData.map.lastAttackOutcome = res;
    try { log(`🎯 Итог: ${text}`); } catch (e) {}
    mapActionInfo(text, res.killed.length || res.damage ? '#2ecc71' : '#f1c40f');
    return res;
}

// Онлайн: подавление цели — отдельным полем снапшота (у оппонента отряд получит «Подавлен»)
function mapActionMarkSuppressOut(name) {
    try {
        if (!appData.campaign || !appData.campaign.online || !appData.currentBattleId) return;
        const b = (appData.campaign.activeBattles || []).find(x => x && x.id === appData.currentBattleId);
        if (!b) return;
        if (!b.onlineSupOut) b.onlineSupOut = {};
        b.onlineSupOut[name] = Date.now();
    } catch (e) {}
}

// Подсветка целей на карте (вызывается из redrawMap после отрисовки врагов)
function drawMapActionTargetHighlights(ctx, size) {
    if (!appData || !appData.map || !appData.map.pendingMapAttack) return;
    const idx = mapActionSelectedIdx();
    if (idx < 0) return;
    const def = mapActionDefById(appData.map.pendingMapAttack.type) || { targets: 'any' };
    const enemies = appData.map.enemySquads || [];
    ctx.save();
    enemies.forEach((e, i) => {
        if (!mapActionEnemyTargetable(e)) return;
        const pos = getBattleSquadHex(appData.map.grid, i, true);
        if (!pos) return;
        const c = (appData.map.centers || []).find(cc => cc.key === pos.key);
        if (!c) return;
        const ev = mapActionEvalTarget(def, idx, i);
        ctx.beginPath();
        ctx.arc(c.x, c.y, size * 0.75, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(3, size * 0.08);
        ctx.strokeStyle = ev.ok ? '#ff3b30' : 'rgba(255,255,255,0.35)';
        ctx.setLineDash(ev.ok ? [] : [6, 6]);
        ctx.stroke();
        if (ev.dist !== null) {
            ctx.setLineDash([]);
            ctx.fillStyle = ev.ok ? '#ff3b30' : '#aaa';
            ctx.font = 'bold ' + (size * 0.28) + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(ev.dist + ' гекс', c.x, c.y + size * 0.62);
        }
    });
    ctx.restore();
}
