// ⚡ BUILD-МАРКЕР: v13.207
/* Single-player campaign AI. This script intentionally does nothing in online games. */
function isOfflineCampaignAIEnabled() {
    const campaign = (typeof appData !== 'undefined' && appData) ? appData.campaign : null;
    return !!(campaign && campaign.active && !campaign.online && Array.isArray(campaign.enemyOpUnits));
}

function operationalAIEnemyFaction() {
    const campaign = appData && appData.campaign;
    if (!campaign) return null;
    return campaign.playerFaction === 'BeVe' ? 'A.I.R.F.' : 'BeVe';
}

// Pick once per campaign and persist the result so a reload never rerolls the
// opponent's operational doctrine. Profiles are data-only at this stage; later
// action planners consume their routes, roles, and behavior constraints.
function operationalAIGroupEnemyArmor() {
    if (!isOfflineCampaignAIEnabled()) return 0;
    const campaign = appData.campaign;
    if (campaign.enemyAIGroupsInitialized || typeof createEnemyVehicleGroup !== 'function') return 0;
    const vehicles = typeof getAvailableEnemyVehicles === 'function' ? getAvailableEnemyVehicles() :
        (campaign.enemyOpUnits || []).filter(unit => unit && !unit.isGroup &&
            (typeof isArmoredUnit === 'function' ? isArmoredUnit(unit) : /танк|бронеавтомобиль|БТР|САУ|Landsverk|CL\/39/i.test(String(unit.name || ''))));
    const groups = new Map();
    vehicles.filter(unit => !unit.isDestroyed && !unit.isInBattle && !unit.embarkedUnit && unit.embarkedUnitId == null &&
        Number.isFinite(Number(unit.col)) && Number.isFinite(Number(unit.row))).forEach(unit => {
        const kind = String(unit.type || unit.name || 'vehicle');
        const key = `${unit.col},${unit.row}|${kind}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(unit);
    });
    let grouped = 0;
    groups.forEach(units => {
        if (units.length < 2) return;
        try {
            createEnemyVehicleGroup(units);
            grouped += units.length;
        } catch (e) { console.warn('Enemy AI vehicle grouping:', e && e.message); }
    });
    campaign.enemyAIGroupsInitialized = true;
    if (grouped) {
        try { log(`🧠 Противник объединил ${grouped} бронемашин в группы для согласованного манёвра.`); } catch (e) {}
    }
    return grouped;
}

function operationalAIEnsureStrategy() {
    if (!isOfflineCampaignAIEnabled()) return null;
    const campaign = appData.campaign;
    const faction = operationalAIEnemyFaction();
    if (!faction) return null;
    const current = campaign.enemyAIDoctrine;
    if (current && current.version === 1 && current.faction === faction && current.strategyId) return current;

    const units = (campaign.enemyOpUnits || []).filter(unit => unit && !unit.isDestroyed && !unit.isSurrendered);
    const preparation = typeof operationalAIReconPreparation === 'function' ? operationalAIReconPreparation(campaign,faction,units) : null;
    if (preparation) {campaign.enemyAIDoctrine=preparation;return preparation;}
    const counts = {
        mobile: units.filter(unit => /танк|бронеавтомоб|бронемашин|бтр|самокат|велосипед|мотоцикл/i.test(`${unit.name || ''} ${unit.type || ''}`)).length,
        armor: units.filter(unit => /танк|бронеавтомоб|бронемашин|бтр/i.test(`${unit.name || ''} ${unit.type || ''}`)).length,
        infantry: units.filter(unit => /взвод|пехот|стрелков|штурмов|сапер|сапёр/i.test(`${unit.name || ''} ${unit.type || ''}`)).length,
        recon: units.filter(unit => /развед/i.test(`${unit.name || ''} ${unit.type || ''}`)).length,
        artillery: units.filter(unit => /сау|мином|артиллер/i.test(`${unit.name || ''} ${unit.type || ''}`)).length,
        winch: units.some(unit => unit.winch || unit.hasWinch || (unit.squads || []).some(squad => squad && (squad.winch || squad.hasWinch)))
    };
    let plans;
    if (faction === 'BeVe') {
        plans = [
            { id: 'beve_defense', label: 'Оборонительный сценарий', mode: 'defense', weight: 1,
                objectives: [[4, 7], [8, 10], [11, 8]], retreatHexes: [[3, 5], [4, 5], [5, 6], [4, 7]],
                patrolRoute: [[3, 3], [0, 1]], reserveAreas: [[10, 7], [7, 8], [8, 8]] },
            { id: 'beve_aggressive_raids', label: 'Агрессивная оборона и рейды', mode: 'aggressive', weight: 1,
                route: [[7, 0], [11, 8]], objectives: [[7, 0], [11, 8]], raidTargets: ['enemy_hq', 'enemy_supply', 'enemy_signal_lines'],
                preserveForces: false }
        ];
    } else {
        plans = [
            { id: 'airf_road_breakthrough', label: 'Прорыв бронетехникой по дороге', mode: 'main_breakthrough',
                weight: 1 + Math.min(counts.armor, 4) * 0.8 + Math.min(counts.mobile, 5) * 0.2,
                route: [[11, 8]], forceRoles: ['armor', 'btr_infantry', 'infantry'], acceptHeavyLosses: true },
            { id: 'airf_left_flank', label: 'Скрытый обход слева к гексу 7,0', mode: 'concealed_flank',
                weight: 1 + Math.min(counts.recon, 2) * 0.8 + Math.min(counts.infantry, 6) * 0.15,
                route: [[7, 0]], followUpTargets: [[2, 7], [4, 7], [6, 6], [3, 5], [4, 5]] },
            { id: 'airf_southern_dot_bypass', label: 'Обход через 7,13 и ДОТ у 8,10', mode: 'dot_bypass',
                weight: 1 + Math.min(counts.mobile, 5) * 0.25 + Math.min(counts.infantry, 6) * 0.15,
                route: [[7, 13], [8, 10], [11, 8]], seizeFortification: true },
            { id: 'airf_flexible_raid', label: 'Гибкий удар с бронетанковым рейдом', mode: 'flexible_raid',
                weight: 1 + Math.min(counts.mobile, 5) * 0.35 + Math.min(counts.recon, 2) * 0.6,
                route: [[11, 8]], raidRoutes: [[[7, 0]], [[6, 6], [4, 7]]], raidTargets: ['enemy_hq', 'enemy_supply'] },
            { id: 'airf_heights_assault', label: 'Штурм высот с развитием прорыва', mode: 'heights_assault',
                weight: 1 + Math.min(counts.infantry, 8) * 0.2 + (counts.winch ? 1 : 0) + Math.min(counts.artillery, 3) * 0.2,
                route: [[2, 7], [4, 7], [6, 6], [3, 5], [4, 5]], followUpTargets: [[7, 0], [11, 8]],
                preferWinchArmor: counts.winch }
        ];
    }
    const intel = (campaign.opUnits || []).filter(u=>u && !u.isDestroyed && u.detected===true);
    const knownArmor = intel.some(u=>isArmoredUnit(u));
    const knownFort = intel.some(u=>isStaticOpUnit(u) || u.isDugIn);
    plans.forEach(plan=> {
        if (knownArmor && /defense|flank/.test(plan.mode || '')) plan.weight *= 1.6;
        if (knownFort && /bypass|concealed/.test(plan.mode || '')) plan.weight *= 1.8;
    });
    const totalWeight = plans.reduce((sum, plan) => sum + Math.max(0.01, Number(plan.weight) || 0.01), 0);
    let roll = Math.random() * totalWeight;
    let selected = plans[plans.length - 1];
    for (const plan of plans) {
        roll -= Math.max(0.01, Number(plan.weight) || 0.01);
        if (roll <= 0) { selected = plan; break; }
    }
    campaign.enemyAIDoctrine = {
        version: 1, faction, strategyId: selected.id, label: selected.label, mode: selected.mode,
        selectedAtTurn: Number(campaign.currentTurn) || 1, selectedAt: Date.now(),
        patrolEnabled: selected.id === 'beve_defense' ? Math.random() < 0.45 : false,
        weights: plans.map(plan => ({ id: plan.id, weight: Number(plan.weight) || 1 })),
        plan: JSON.parse(JSON.stringify(selected))
    };
    try { saveData(); } catch (e) {}
    try { log(`🧠 Оперативный ИИ ${faction} выбрал план: «${selected.label}».`); } catch (e) {}
    return campaign.enemyAIDoctrine;
}

function operationalAITargets() {
    const campaign = appData.campaign;
    const enemies = (campaign.opUnits || []).filter(unit => unit && !unit.isDestroyed && !unit.isSurrendered &&
        !isOpUnitWipedOut(unit) && !operationalUnitInTacticalBattle(unit) && Number.isFinite(Number(unit.col)) && Number.isFinite(Number(unit.row)));
    const visible = enemies.filter(unit => unit.detected === true);
    const objectiveDefs = (typeof CAMPAIGN_OBJECTIVE_DEFINITIONS !== 'undefined' && CAMPAIGN_OBJECTIVE_DEFINITIONS[campaign.scenario])
        ? CAMPAIGN_OBJECTIVE_DEFINITIONS[campaign.scenario][operationalAIEnemyFaction()] : null;
    const objectives = objectiveDefs ? [
        ...(objectiveDefs.primary || []).map(obj => ({ ...obj, objectivePriority: 'primary' })),
        ...(objectiveDefs.additional || []).map(obj => ({ ...obj, objectivePriority: 'additional' }))
    ].filter(obj => Number.isFinite(Number(obj.col)) && Number.isFinite(Number(obj.row)) &&
        (!obj.id || !campaign.objectiveProgress || !campaign.objectiveProgress.status || campaign.objectiveProgress.status[obj.id] !== 'completed'))
        .map(obj => ({ col: Number(obj.col), row: Number(obj.row), label: obj.label || 'цель кампании',
            objectiveId: obj.id, kind: obj.objectivePriority, objectiveType: obj.kind })) : [];
    return { enemies, visible, objectives };
}

function operationalAIUnitDistance(a, b) {
    return getOpHexDistance(Number(a.col), Number(a.row), Number(b.col), Number(b.row));
}

function operationalAICardEligible(unit) {
    if (!unit || unit.isDestroyed || !(unit.squads || []).some(squad => squad &&
        (squad.fighters || []).some(fighter => fighter && Number(fighter.hp) > 0))) return false;
    if (typeof isCardSelectableOpUnit === 'function' && isCardSelectableOpUnit(unit)) return true;
    // Enemy AIRF reconnaissance is represented as an HQ-type op unit in older
    // battalion presets; it is still an eligible infantry platoon for cards.
    return /развед/i.test(String(unit.name || '')) && Array.isArray(unit.squads) && unit.squads.length > 0;
}

function operationalAICardScore(card, unit) {
    if (!card || (card.type || 'bonus') !== 'bonus' || !unit) return -Infinity;
    if (typeof isCardPlayableInTacticalBattle === 'function' && !isCardPlayableInTacticalBattle(card)) return -Infinity;
    const name = String(card.name || '').toLowerCase();
    const text = `${card.effect || ''} ${card.desc || ''}`.toLowerCase();
    const role = operationalAIRole(unit);
    let score = 1;
    if (tacticalIsEngineer(unit)) {
        if (/термит/.test(name)) score += 100;
        else if (/огнем[её]т|рокс/.test(name)) score += 90;
        else if (/дымовые гранаты|двойной бк/.test(name)) score += 20;
    }
    if (/двойной бк|индивидуальный перевязочный пакет|дополнительный па[её]к|ветераны/.test(name)) score += 4;
    if (/дымовые гранаты|бутылки с зажигательной смесью|фосфорные гранаты|кумулятивные винтовочные гранаты/.test(name)) score += 2;
    if (/меткост|точност|боевой дух|укрыти|маскировк|подавлен/.test(text)) score += 1;
    if (role === 'recon' && /развед|обнаруж|маскировк|скрытност/.test(`${name} ${text}`)) score += 4;
    if (role === 'infantry' && /винтовк|пехот|стрелков|штурмов/.test(`${name} ${text}`)) score += 2;
    if (role === 'anti_armor' && /противотанк|кумулятив|бронетехник|гранат/.test(`${name} ${text}`)) score += 4;
    if (role === 'mobile' && /велоблиц|броне|движен|десант/.test(`${name} ${text}`)) score += 3;
    const campaign = appData && appData.campaign;
    const doctrine = campaign && campaign.enemyAIDoctrine;
    const plan = doctrine && doctrine.plan || {};
    const route = (plan.route || []).map(point => Array.isArray(point) ? point.join(',') : '');
    const isSapper = (unit.squads || []).some(squad => squad && /сап[её]р/i.test(String(squad.name || '')));
    const hasEnemyArmor = (campaign && campaign.opUnits || []).some(enemy => enemy && !enemy.isDestroyed && isArmoredUnit(enemy));
    if (/термит/.test(name) && isSapper && doctrine && /dot_bypass|heights_assault|concealed_flank/.test(doctrine.mode || '')) score += 9;
    if (/термит/.test(name) && isSapper && campaign && campaign.enemyAIDoctrine &&
        (campaign.enemyAIDoctrine.plan.route || []).some(point => Array.isArray(point) && [[4, 7], [8, 10]].some(dot => point[0] === dot[0] && point[1] === dot[1]))) score += 8;
    if (/кумулятив|panzerblinde|ослепляющ/.test(`${name} ${text}`) && hasEnemyArmor) score += 6;
    if (/двойной бк/.test(name) && doctrine && (route.length > 1 || doctrine.mode === 'flexible_raid' || doctrine.mode === 'main_breakthrough')) score += 5;
    if (/маскиров|скрытност|горное пончо/.test(`${name} ${text}`) && doctrine && doctrine.mode === 'concealed_flank' && (role === 'recon' || role === 'infantry')) score += 8;
    if (/термит|фосфор|рукопаш|боевой дух|па[её]к|ветеран/.test(`${name} ${text}`) && doctrine &&
        /main_breakthrough|heights_assault|dot_bypass/.test(doctrine.mode || '') && role === 'infantry') score += 2;
    if (/условн|только если/.test(text) && !card.informational) score -= 1;
    return score;
}

function operationalAIEnsureEnemyCards() {
    if (!isOfflineCampaignAIEnabled()) return 0;
    const campaign = appData.campaign;
    const copyCounts = Object.create(null);
    (campaign.enemyOpUnits || []).forEach(unit => (unit && unit.cardSelection && unit.cardSelection.cards || []).forEach(entry => {
        const cardName = typeof entry === 'string' ? entry : entry && entry.name;
        if (cardName) copyCounts[cardName] = (copyCounts[cardName] || 0) + 1;
    }));
    let assignedCount = 0;
    (campaign.enemyOpUnits || []).forEach(unit => {
        if (!operationalAICardEligible(unit) || unit.cardSelection && unit.cardSelection.done) return;
        try {
            const context = (typeof getUnitCardFactionContext === 'function')
                ? getUnitCardFactionContext(unit) : { faction: unit.faction || operationalAIEnemyFaction(), subFaction: null };
            const library = (typeof collectCardLibraryForContext === 'function') ? collectCardLibraryForContext(context) : [];
            const candidates = library.filter(card => card && (card.type || 'bonus') === 'bonus' &&
                (!copyCounts[card.name] || copyCounts[card.name] < 3) &&
                (typeof isCardAvailableToUnit !== 'function' || isCardAvailableToUnit(card, unit, unit.squads || [])))
                .map(card => ({ card, score: operationalAICardScore(card, unit) }))
                .filter(item => Number.isFinite(item.score) && item.score > 0)
                .sort((a, b) => b.score - a.score || String(a.card.name).localeCompare(String(b.card.name)));
            const selected = [];
            const targets = {};
            for (const item of candidates) {
                if (selected.length >= (typeof cardDraftBonusLimit === 'function' ? cardDraftBonusLimit(selected.map(x => x.card.name),unit) : tacticalIsEngineer(unit) ? 3 : 2)) break;
                if (selected.some(entry => entry.card.name === item.card.name)) continue;
                const spec = (typeof getCardTargetSpec === 'function') ? getCardTargetSpec(item.card.name) : null;
                let targetNames = [];
                if (spec) {
                    const targetSquads = (typeof getCardTargetCandidates === 'function')
                        ? getCardTargetCandidates(item.card.name, unit.squads || []) : [];
                    const orderedTargets = targetSquads.slice().sort((a, b) => {
                        const prefersHQ = /санитар|штаб/i.test(item.card.name);
                        return Number(prefersHQ && /штаб/i.test(b.name || '')) - Number(prefersHQ && /штаб/i.test(a.name || ''));
                    });
                    targetNames = orderedTargets.slice(0, Math.min(spec.count, orderedTargets.length)).map(squad => squad.name);
                    if (targetNames.length < Math.min(spec.count, targetSquads.length)) continue;
                    targets[item.card.name] = targetNames;
                }
                selected.push(item);
                copyCounts[item.card.name] = (copyCounts[item.card.name] || 0) + 1;
            }
            const assigned = [];
            selected.forEach(({ card }) => {
                const faction = card.faction || context.faction;
                try {
                    if (typeof applyCardToPlatoon === 'function') {
                        applyCardToPlatoon(card, faction, unit, unit.squads || [], targets[card.name] || [], { initial: true });
                    }
                    assigned.push({ name: card.name, faction, type: 'bonus' });
                } catch (e) { console.warn(`Enemy card ${card.name}:`, e && e.message); }
            });
            unit.cardSelection = { version: 1, done: true, cards: assigned, targets, campaignStart: true,
                automaticAI: true, lockedAt: Date.now() };
            if (assigned.length) assignedCount++;
        } catch (e) {
            console.warn(`Enemy AI cards for ${unit.name}:`, e && e.message);
            unit.cardSelection = { version: 1, done: true, cards: [], targets: {}, campaignStart: true, automaticAI: true };
        }
    });
    campaign.enemyAICardsInitialized = true;
    if (assignedCount) {
        try { log(`🃏 Противник распределил карты поддержки между ${assignedCount} подходящими подразделениями.`); } catch (e) {}
        try { saveData(); } catch (e) {}
    }
    return assignedCount;
}

function operationalAIRole(unit) {
    const name = String((unit && unit.name) || '');
    if (!unit) return 'reserve';
    if (isStaticOpUnit(unit)) return 'fortification';
    if (typeof isMediumArtillery === 'function' && isMediumArtillery(unit)) return 'artillery';
    if (/развед/i.test(name) || unit.type === 'recon_platoon') return 'recon';
    if (tacticalIsEngineer(unit)) return 'sapper';
    if (/штаб/i.test(name) || unit.type === 'battalion_hq' || unit.type === 'company_hq' || unit.type === 'hq') return 'command';
    if (/снабж|обоз|носильщик|склад/i.test(name)) return 'logistics';
    if (/самокат|велосипед|мотоцикл/i.test(name) || /bicycle|motorcycle|cyclist/i.test(String(unit.type || ''))) return 'mobile';
    if ((typeof hasAtGunWeapons === 'function' && hasAtGunWeapons(unit)) &&
        !(typeof isArmoredUnit === 'function' && isArmoredUnit(unit))) return 'anti_armor';
    if (typeof isArmoredUnit === 'function' && isArmoredUnit(unit)) return 'mobile';
    return 'infantry';
}

function operationalAIRoleCanAdvance(role) {
    return role === 'infantry' || role === 'mobile' || role === 'recon' || role === 'sapper';
}

function operationalAIPlanRouteTask(unit, doctrine) {
    let points = doctrine && doctrine.plan && Array.isArray(doctrine.plan.route) ? doctrine.plan.route : [];
    let routeId = doctrine && doctrine.strategyId;
    if (!points.length && doctrine && doctrine.faction === 'BeVe' && doctrine.strategyId === 'beve_defense' &&
        doctrine.patrolEnabled && operationalAIRole(unit) === 'recon' && Array.isArray(doctrine.plan.patrolRoute)) {
        points = doctrine.plan.patrolRoute;
        routeId = `${routeId}:patrol`;
    }
    if (!points.length) return null;
    let step = unit && unit.enemyAI && unit.enemyAI.routeId === routeId
        ? Math.max(0, Math.min(points.length, Number(unit.enemyAI.planStep) || 0)) : 0;
    while (step < points.length && Number(unit.col) === Number(points[step][0]) && Number(unit.row) === Number(points[step][1])) step++;
    if (step >= points.length) return null;
    const [col, row] = points[step];
    return { planStep: step, routeId, objective: { col, row, objectiveId: `plan:${routeId}:${step}`,
        label: `${doctrine.label}: этап ${step + 1}`, kind: 'plan', strategyTask: true } };
}

function operationalAIStrategyTasks(doctrine) {
    if (!doctrine || doctrine.faction !== 'BeVe' || doctrine.strategyId !== 'beve_defense') return [];
    const make = (id, point, role, priority, capacity) => ({
        objective: { col: point[0], row: point[1], objectiveId: `garrison:${id}`,
            label: `Оборонительная позиция ${id}`, kind: 'plan', strategyTask: true },
        role, priority, capacity
    });
    return [
        make('screen_2_7', [2, 7], 'infantry', 8, 1),
        make('dot_4_7', [4, 7], 'infantry', 7, 1),
        make('dot_8_10', [8, 10], 'infantry', 7, 1),
        make('support_3_5', [3, 5], 'infantry', 4, 1),
        make('support_5_6', [5, 6], 'infantry', 4, 1),
        make('support_7_8', [7, 8], 'infantry', 3, 1),
        make('support_8_8', [8, 8], 'infantry', 3, 1),
        make('reserve_10_7', [10, 7], 'mobile', 6, 1),
        make('reserve_7_8', [7, 8], 'mobile', 4, 1),
        make('reserve_8_8', [8, 8], 'mobile', 4, 1)
    ];
}

function operationalAIHasEnemyPhoneConnection(fromUnit, toUnit) {
    if (!fromUnit || !toUnit || fromUnit === toUnit) return !!(fromUnit && toUnit);
    const lines = (typeof hardMode !== 'undefined' && hardMode && Array.isArray(hardMode.enemyPhoneLines))
        ? hardMode.enemyPhoneLines.filter(line => line && line.intact !== false && !line.laying) : [];
    const graph = new Map();
    lines.forEach(line => {
        const from = String(line.fromName || ''), to = String(line.toName || '');
        if (!from || !to) return;
        if (!graph.has(from)) graph.set(from, new Set());
        if (!graph.has(to)) graph.set(to, new Set());
        graph.get(from).add(to); graph.get(to).add(from);
    });
    const start = String(fromUnit.name || ''), goal = String(toUnit.name || '');
    const queue = [start], seen = new Set(queue);
    while (queue.length) {
        const name = queue.shift();
        if (name === goal) return true;
        (graph.get(name) || []).forEach(next => { if (!seen.has(next)) { seen.add(next); queue.push(next); } });
    }
    return false;
}

function operationalAIAllocateRadios(assignments, previousByUnit, doctrine) {
    const campaign = appData.campaign;
    let profile = null;
    try { profile = typeof signalEquipmentFor === 'function' ? signalEquipmentFor(doctrine && doctrine.faction) : null; } catch (e) {}
    const portableCount = Math.max(0, Number(profile && profile.radios) - Number(profile && profile.companyRadios || 0));
    const hq = (campaign.enemyOpUnits || []).find(unit => unit && (/штаб батальона/i.test(String(unit.name || '')) ||
        unit.type === 'battalion_hq' || unit.type === 'hq'));
    const range = Number(profile && profile.radioRange) || 10;
    const priority = assignment => {
        const role = assignment.role || '';
        let score = assignment.planTarget ? 5 : 0;
        if (doctrine && doctrine.faction === 'A.I.R.F.') {
            if (doctrine.mode === 'main_breakthrough') score += role === 'mobile' ? 8 : role === 'infantry' ? 5 : 0;
            else if (doctrine.mode === 'concealed_flank') score += role === 'recon' ? 10 : role === 'infantry' ? 4 : 0;
            else score += role === 'mobile' ? 6 : role === 'recon' ? 5 : 2;
        } else if (doctrine && doctrine.faction === 'BeVe') {
            if (doctrine.mode === 'defense') score += role === 'anti_armor' ? 10 : role === 'mobile' ? 7 : role === 'infantry' && assignment.planTarget ? 6 : 0;
            else score += role === 'mobile' ? 10 : role === 'recon' ? 7 : 3;
        }
        return score;
    };
    const ranked = assignments.map((assignment, index) => ({ assignment, index,
        unit: (campaign.enemyOpUnits || []).find(unit => unit && unit.name === assignment.unitName) }))
        .filter(item => item.unit && !item.unit.isDestroyed && !item.unit.isSurrendered &&
            Number.isFinite(Number(item.unit.col)) && Number.isFinite(Number(item.unit.row)))
        .filter(item => !hq || typeof getOpHexDistance !== 'function' ||
            getOpHexDistance(hq.col, hq.row, item.unit.col, item.unit.row) <= range)
        .filter(item => !hq || !operationalAIHasEnemyPhoneConnection(hq, item.unit))
        .sort((a, b) => priority(b.assignment) - priority(a.assignment) || a.index - b.index);
    const assigned = ranked.slice(0, portableCount);
    const radioNames = new Set(assigned.map(item => item.assignment.unitName));
    const turn = Number(campaign.currentTurn) || 1;
    assignments.forEach(assignment => {
        const unit = (campaign.enemyOpUnits || []).find(candidate => candidate && candidate.name === assignment.unitName);
        if (!unit) return;
        const prior = previousByUnit.get(unit);
        assignment.radioAssigned = radioNames.has(assignment.unitName);
        if (assignment.radioAssigned && (!prior || !prior.radioAssigned)) {
            try { log(`📻 Штаб ИИ закрепил рацию за «${unit.name}» как подразделением первоочередного управления.`); } catch (e) {}
        }
        const targetHex = assignment.targetHex || assignment.planTarget;
        const signature = [assignment.strategyId, assignment.orderType || 'hold', assignment.objectiveId, assignment.routeId || '',
            targetHex ? `${targetHex.col},${targetHex.row}` : ''].join('|');
        const phoneConnected = !!(hq && operationalAIHasEnemyPhoneConnection(hq, unit));
        const commandMethod = assignment.radioAssigned ? 'radio' : phoneConnected ? 'phone' : 'messenger';
        const sameOrder = prior && prior.commandSignature === signature && prior.commandMethod === commandMethod;
        assignment.commandSignature = signature;
        if (sameOrder && Number.isFinite(Number(prior.commandReadyTurn))) {
            assignment.commandIssuedTurn = prior.commandIssuedTurn;
            assignment.commandReadyTurn = prior.commandReadyTurn;
            assignment.commandMethod = prior.commandMethod;
        } else {
            const distance = hq && typeof getOpHexDistance === 'function'
                ? getOpHexDistance(hq.col, hq.row, unit.col, unit.row) : 0;
            const movePerTurn = doctrine && doctrine.faction === 'BeVe' ? 4 : 3;
            const deliveryTurns = commandMethod === 'messenger' ? Math.max(1, Math.ceil(Math.max(0, distance) / movePerTurn)) : 0;
            assignment.commandIssuedTurn = turn;
            assignment.commandReadyTurn = turn + deliveryTurns;
            assignment.commandMethod = commandMethod;
        }
        unit.enemyAI = assignment;
    });
    return assigned.map(item => ({ unitName: item.assignment.unitName, priority: priority(item.assignment) }));
}

function operationalAIPlanAssignments(targets) {
    const campaign = appData.campaign;
    const doctrine = operationalAIEnsureStrategy();
    const eligible = (campaign.enemyOpUnits || []).filter(unit => unit && !unit.isDestroyed && !unit.isSurrendered &&
        !isOpUnitWipedOut(unit) && !operationalUnitInTacticalBattle(unit) &&
        Number.isFinite(Number(unit.col)) && Number.isFinite(Number(unit.row)));
    const assignments = [];
    const objectiveUse = Object.create(null);
    const previousByUnit = new Map();
    const strategyTasks = operationalAIStrategyTasks(doctrine);
    // Fast/mobile groups choose first; slower infantry then fills gaps instead of
    // every unit independently converging on the same nearest map marker.
    const planners = eligible.filter(unit => operationalAIRoleCanAdvance(operationalAIRole(unit)))
        .sort((a, b) => {
            const roleRank = role => role === 'mobile' ? 0 : role === 'recon' ? 1 : 2;
            return roleRank(operationalAIRole(a)) - roleRank(operationalAIRole(b)) || String(a.name).localeCompare(String(b.name));
        });
    planners.forEach(unit => {
        const unitRole = operationalAIRole(unit);
        let best = null;
        const consider = (objective, taskPriority, planStep) => {
            let route = [];
            try { route = getRouteToTarget(Number(unit.col), Number(unit.row), objective.col, objective.row, unit) || []; }
            catch (e) { return; }
            const distance = operationalAIUnitDistance(unit, objective);
            if (distance > 0 && !route.length) return;
            const used = objectiveUse[objective.objectiveId] || 0;
            const alreadyHeld = (campaign.enemyOpUnits || []).some(other => other && !other.isDestroyed &&
                Number(other.col) === Number(objective.col) && Number(other.row) === Number(objective.row));
            const contestedByPlayer = targets.visible.some(other => other && !other.isDestroyed &&
                Number(other.col) === Number(objective.col) && Number(other.row) === Number(objective.row));
            const importance = objective.kind === 'primary' ? 3 : 0;
            const garrisonAdjustment = alreadyHeld ? 2 : 0;
            const contactAdjustment = contestedByPlayer ? -4 : 0;
            const score = route.length + used * 3 - importance + garrisonAdjustment + contactAdjustment - (taskPriority || 0);
            if (!best || score < best.score) best = { objective, route, score, planStep };
        };
        targets.objectives.forEach(objective => consider(objective, 0, null));
        if (unitRole === 'sapper') targets.visible.filter(target => target && !target.isDestroyed &&
            (isStaticOpUnit(target) || target.isDugIn || (typeof getOpHexTypes === 'function' && getOpHexTypes(target.col,target.row).some(type => /trenches|fortification|bunker/.test(String(type)))) || (target.squads || []).some(s => s && (s.fixedTacticalPosition || s.isDugIn || s.inTrench))))
            .forEach(target => consider({col:Number(target.col),row:Number(target.row),objectiveId:'sapper-fort-'+target.col+','+target.row,kind:'fortification',name:target.name},18,null));
        const routeTask = operationalAIPlanRouteTask(unit, doctrine);
        if (routeTask) consider(routeTask.objective, 8, routeTask.planStep);
        strategyTasks.filter(task => task.role === unitRole &&
            (objectiveUse[task.objective.objectiveId] || 0) < task.capacity).forEach(task =>
            consider(task.objective, task.priority, null));

        const selected = best && best.objective;
        previousByUnit.set(unit, unit.enemyAI || null);
        const selectedIsRoute = !!(selected && routeTask && selected.objectiveId === routeTask.objective.objectiveId);
        const selectedIsGarrison = !!(selected && selected.strategyTask && String(selected.objectiveId).startsWith('garrison:'));
        const selectedIsReserve = !!(selected && selected.strategyTask && String(selected.objectiveId).startsWith('garrison:reserve_'));
        const selectedIsScreen = !!(selected && selected.strategyTask && String(selected.objectiveId).includes('screen_2_7'));
        let orderType = 'hold';
        if (selectedIsRoute) orderType = 'move';
        else if (selectedIsGarrison) orderType = selectedIsReserve || selectedIsScreen ? 'defend' :
            (Number(unit.col) === Number(selected.col) && Number(unit.row) === Number(selected.row) ? 'dig_in' : 'defend');
        else if (selected) orderType = targets.visible.some(enemy => enemy && !enemy.isDestroyed &&
            Number(enemy.col) === Number(selected.col) && Number(enemy.row) === Number(selected.row)) ? 'attack' : 'move';
        const assignment = {
            unitName: unit.name, role: unitRole, objectiveId: selected ? selected.objectiveId : null, orderType,
            strategyId: doctrine ? doctrine.strategyId : null,
            ...(selected ? { targetHex: { col: Number(selected.col), row: Number(selected.row) } } : {}),
            ...(selected && selected.strategyTask ? { planTarget: { col: selected.col, row: selected.row, id: selected.objectiveId } } : {}),
            ...(best && best.planStep !== null && best.planStep !== undefined ? { planStep: best.planStep, routeId: selectedIsRoute ? routeTask.routeId : doctrine.strategyId } : {})
        };
        unit.enemyAI = assignment;
        if (selected) objectiveUse[selected.objectiveId] = (objectiveUse[selected.objectiveId] || 0) + 1;
        assignments.push(assignment);
    });
    eligible.filter(unit => !operationalAIRoleCanAdvance(operationalAIRole(unit))).forEach(unit => {
        previousByUnit.set(unit, unit.enemyAI || null);
        const role = operationalAIRole(unit);
        unit.enemyAI = { unitName: unit.name, role, objectiveId: null,
            orderType: role === 'artillery' ? 'shoot' : role === 'anti_armor' ? 'defend' : 'hold',
            strategyId: doctrine ? doctrine.strategyId : null };
        assignments.push(unit.enemyAI);
    });
    const radioAssignments = operationalAIAllocateRadios(assignments, previousByUnit, doctrine);
    campaign.enemyAIState = {
        version: 1,
        plannedTurn: Number(campaign.currentTurn) || 1,
        stance: doctrine ? doctrine.mode : 'balanced',
        strategyId: doctrine ? doctrine.strategyId : null,
        strategyLabel: doctrine ? doctrine.label : null,
        assignments,
        orders: assignments.map(assignment => ({ unitName: assignment.unitName, role: assignment.role,
            type: assignment.orderType || 'hold', objectiveId: assignment.objectiveId,
            target: assignment.targetHex ? { col: assignment.targetHex.col, row: assignment.targetHex.row } :
                assignment.planTarget ? { col: assignment.planTarget.col, row: assignment.planTarget.row } : null,
            issuedTurn: Number(assignment.commandIssuedTurn) || Number(campaign.currentTurn) || 1,
            readyTurn: Number(assignment.commandReadyTurn) || Number(campaign.currentTurn) || 1,
            delivery: assignment.commandMethod || 'radio', radioAssigned: !!assignment.radioAssigned })),
        radioAssignments
    };
    return assignments;
}

function operationalAIChooseTarget(unit, targets, assignment) {
    const role = assignment && assignment.role || operationalAIRole(unit);
    const candidates = targets.visible.map(target => ({ target, kind: 'contact', priority: -2 }))
        .concat(targets.objectives.filter(objective => assignment && assignment.objectiveId === objective.objectiveId)
            .map(target => ({ target, kind: 'objective', priority: 0 })))
        .concat(assignment && assignment.planTarget ? [{
            target: { col: assignment.planTarget.col, row: assignment.planTarget.row, objectiveId: assignment.planTarget.id },
            kind: 'plan', priority: -1
        }] : []);
    if (!operationalAIRoleCanAdvance(role) && role !== 'anti_armor') return null;
    if (role === 'anti_armor' && !targets.visible.some(target => isArmoredUnit(target))) return null;
    let best = null;
    candidates.forEach(candidate => {
        if (role === 'anti_armor' && candidate.kind === 'contact' && !isArmoredUnit(candidate.target)) return;
        const distance = operationalAIUnitDistance(unit, candidate.target);
        let route = [];
        try { route = getRouteToTarget(Number(unit.col), Number(unit.row), candidate.target.col, candidate.target.row, unit) || []; }
        catch (e) { return; }
        if (distance > 0 && !route.length) return;
        const score = candidate.priority + distance + route.length * 0.05;
        if (!best || score < best.score) best = { ...candidate, score, route };
    });
    return best;
}

function operationalAIUnitStrength(unit) {
    if (!unit || unit.isDestroyed || unit.isSurrendered) return 0;
    let strength = 0;
    const squads = (typeof operationalAmmoSquads === 'function') ? operationalAmmoSquads(unit) : (unit.squads || []);
    squads.forEach(squad => (squad && squad.fighters || []).forEach(fighter => {
        if (fighter && Number(fighter.hp) > 0 && !fighter.isAway) strength += Number(fighter.hp) > 1 ? Number(fighter.hp) : 1;
    }));
    if (unit.isGroup) strength += (unit.vehicleList || []).filter(vehicle => vehicle && !vehicle.isDestroyed && !vehicle.destroyed).length * 8;
    else if (isArmoredUnit(unit)) strength += 8;
    if (operationalAIRole(unit) === 'artillery') strength *= 0.75;
    return strength;
}

function operationalAIUnitCasualtyRatio(unit) {
    if (!unit) return 0;
    let fighters = [];
    const squads = typeof operationalAmmoSquads === 'function' ? operationalAmmoSquads(unit) : (unit.squads || []);
    (squads || []).forEach(squad => {
        if (!squad || squad.isSignalSquad || squad.isSurrendered || squad.status === 'surrendered' || squad.isDestroyed || !Array.isArray(squad.fighters)) return;
        fighters.push(...squad.fighters.filter(fighter => fighter && !fighter.isSignalman));
    });
    const living = fighters.filter(fighter => Number(fighter.hp) > 0).length;
    const recordedInitial = Number(unit.operationalInitialStrength);
    const initial = Math.max(fighters.length, Number.isFinite(recordedInitial) && recordedInitial > 0 ? recordedInitial : 0);
    return initial > 0 ? Math.max(0, Math.min(1, 1 - living / initial)) : 0;
}

function operationalAIRetreatTask(unit, doctrine, visibleTargets) {
    if (!unit || !doctrine || doctrine.faction !== 'BeVe' || doctrine.strategyId !== 'beve_defense') return null;
    const alreadyRetreating = !!unit.enemyAIForcedRetreat;
    if (!alreadyRetreating && !(Number(unit.col) === 2 && Number(unit.row) === 7)) return null;
    if (alreadyRetreating && unit.enemyAIRetreatTarget) {
        const retreatTarget = unit.enemyAIRetreatTarget;
        if (Number(unit.col) === Number(retreatTarget.col) && Number(unit.row) === Number(retreatTarget.row)) {
            unit.enemyAIForcedRetreat = false;
            unit.enemyAIRetreatTarget = null;
            return null;
        }
        let retreatRoute = [];
        try { retreatRoute = getRouteToTarget(Number(unit.col), Number(unit.row), Number(retreatTarget.col), Number(retreatTarget.row), unit) || []; } catch (e) {}
        return retreatRoute.length ? { target: retreatTarget, route: retreatRoute } : { waiting: true };
    }
    const nearbyEnemies = (visibleTargets || []).filter(enemy => operationalAIUnitDistance(unit, enemy) <= 2);
    if (!alreadyRetreating) {
        if (!nearbyEnemies.length) return null;
        const allies = (appData.campaign.enemyOpUnits || []).filter(friend => friend && friend !== unit &&
            !friend.isDestroyed && !friend.isSurrendered && !operationalUnitInTacticalBattle(friend) &&
            operationalAIUnitDistance(unit, friend) <= 2);
        const ourStrength = operationalAIUnitStrength(unit) + allies.reduce((sum, friend) => sum + operationalAIUnitStrength(friend), 0);
        const enemyStrength = nearbyEnemies.reduce((sum, enemy) => sum + operationalAIUnitStrength(enemy), 0);
        const enemyArmor = nearbyEnemies.some(enemy => isArmoredUnit(enemy));
        const morale = typeof getOperationalMorale === 'function' &&
            (typeof isOperationalMoraleUnit !== 'function' || isOperationalMoraleUnit(unit))
            ? Number(getOperationalMorale(unit)) : 100;
        const casualtyRatio = operationalAIUnitCasualtyRatio(unit);
        const lowMorale = morale <= 40;
        const heavyLosses = casualtyRatio >= 0.4;
        const criticalLosses = casualtyRatio >= 0.6;
        const outnumbered = enemyStrength > ourStrength;
        const severePressure = enemyStrength >= Math.max(1, ourStrength) * 1.4 ||
            (enemyArmor && enemyStrength >= Math.max(1, ourStrength) * 1.1) ||
            (nearbyEnemies.length >= allies.length + 2 && outnumbered) ||
            (nearbyEnemies.length > 0 && lowMorale && enemyStrength >= Math.max(1, ourStrength) * 0.85) ||
            (nearbyEnemies.length > 0 && heavyLosses && enemyStrength >= Math.max(1, ourStrength) * 0.8) ||
            (nearbyEnemies.length > 0 && criticalLosses);
        if (!severePressure) return null;
        unit.enemyAIForcedRetreat = true;
        if (unit.enemyAI) {
            unit.enemyAI.retreatStartedTurn = Number(appData.campaign.currentTurn) || 1;
            unit.enemyAI.orderType = 'retreat';
        }
        const reason = criticalLosses ? 'критические потери' : lowMorale ? 'низкий боевой дух' :
            heavyLosses ? 'тяжёлые потери при локальном давлении' : 'локальное превосходство атакующего';
        try { log(`🏃 БеВе: ${unit.name} оставляет гекс 2,7 — ${reason}; ` +
            `соотношение сил ${Math.round(enemyStrength)}:${Math.round(ourStrength)}, дух ${Math.round(morale)}/100, потери ${Math.round(casualtyRatio * 100)}%.`); } catch (e) {}
    }
    const candidates = (doctrine.plan && doctrine.plan.retreatHexes || [[3, 5], [4, 5], [5, 6], [4, 7]])
        .filter(point => !(Number(point[0]) === Number(unit.col) && Number(point[1]) === Number(unit.row)))
        .map(point => ({ col: Number(point[0]), row: Number(point[1]) }))
        .filter(point => !nearbyEnemies.some(enemy => Number(enemy.col) === point.col && Number(enemy.row) === point.row))
        .map(point => {
            let route = [];
            try { route = getRouteToTarget(Number(unit.col), Number(unit.row), point.col, point.row, unit) || []; } catch (e) {}
            const unsafe = route.some(step => (appData.campaign.opUnits || []).some(enemy => enemy && !enemy.isDestroyed &&
                Number(enemy.col) === Number(step.col) && Number(enemy.row) === Number(step.row)));
            return { ...point, route, unsafe };
        }).filter(point => !point.unsafe && point.route.length)
        .sort((a, b) => a.route.length - b.route.length);
    if (!candidates.length) return { waiting: true };
    const target = candidates[0];
    unit.enemyAIRetreatTarget = { col: target.col, row: target.row };
    return { target, route: target.route };
}

function operationalAIAmmoAllowsShot(unit, target, distance) {
    if (!unit || typeof operationalAmmoSquads !== 'function') return true;
    const tracked = operationalAmmoSquads(unit).filter(squad => squad && Array.isArray(squad.fighters) &&
        squad.fighters.some(fighter => fighter && Number(fighter.hp) > 0) &&
        (squad.ammoSmall !== undefined || squad.ammoOrdnance !== undefined));
    if (!tracked.length) return true;
    const kind = isArmoredUnit(target) ? 'ordnance' : 'small';
    let available = 0;
    try { available = typeof unitOperationalAmmoTotal === 'function' ? unitOperationalAmmoTotal(unit, kind) : 0; } catch (e) {}
    // Always preserve the final round; operational fire must not drain a unit
    // completely: a real supply convoy may be delayed, intercepted or out of stock.
    if (available <= 1) return false;
    const reserve = unit.ammoReserve || {};
    const initial = Number(reserve[`initial${kind}`]) || 0;
    if (initial > 0 && available <= Math.max(2, initial * 0.2) && distance > 1) return false;
    return true;
}

function operationalAIImproveDefensivePosition(unit, doctrine, visibleTargets) {
    if (!unit || !doctrine || doctrine.strategyId !== 'beve_defense' || operationalAIRole(unit) !== 'infantry' ||
        !unit.enemyAI || !unit.enemyAI.planTarget || !String(unit.enemyAI.planTarget.id || '').startsWith('garrison:') ||
        String(unit.enemyAI.planTarget.id || '').includes('screen_2_7') ||
        Number(unit.enemyAI.planTarget.col) !== Number(unit.col) || Number(unit.enemyAI.planTarget.row) !== Number(unit.row) || Number(unit.ap) <= 0) return false;
    if ((visibleTargets || []).some(enemy => operationalAIUnitDistance(unit, enemy) <= 2)) {
        unit.enemyAIDigProgress = 0;
        return false;
    }
    const key = `${unit.col},${unit.row}`;
    if (unit.enemyAIDigHex && unit.enemyAIDigHex !== key) unit.enemyAIDigProgress = 0;
    unit.enemyAIDigHex = key;
    const grid = appData.campaign.opMapGrid || (appData.campaign.opMapGrid = {});
    const cell = grid[key] || (grid[key] = { types: ['grass'], markers: [] });
    if (Array.isArray(cell)) grid[key] = { types: cell, markers: [] };
    if (!Array.isArray(grid[key].markers)) grid[key].markers = [];
    if (grid[key].markers.includes('trenches')) { unit.enemyAIDigProgress = 0; return false; }
    unit.enemyAIDigProgress = Number(unit.enemyAIDigProgress) || 0;
    unit.ap = 0;
    unit.enemyAIDigProgress++;
    if (unit.enemyAIDigProgress < 3) {
        try { log(`🧠 ${unit.name} укрепляет оборонительную позицию (${unit.enemyAIDigProgress}/3).`); } catch (e) {}
        return true;
    }
    if (typeof markOperationalMarkerOwner === 'function') markOperationalMarkerOwner(key, 'trenches', unit);
    else if (!grid[key].markers.includes('trenches')) grid[key].markers.push('trenches');
    try { if (typeof grantTrenchPoints === 'function' && typeof countSquadsForHexEdit === 'function') grantTrenchPoints(key, countSquadsForHexEdit(unit), unit.name, true); } catch (e) {}
    unit.enemyAIDigProgress = 0;
    try { log(`🕳️ ${unit.name} подготовил окопы на оборонительном гексе (${key}).`); } catch (e) {}
    try { saveData(); } catch (e) {}
    try { redrawOperationalMap(); } catch (e) {}
    return true;
}

function operationalAIArtilleryHasAmmo(unit) {
    if (!unit || typeof operationalAmmoSquads !== 'function') return true;
    const tracked = operationalAmmoSquads(unit).filter(squad => squad && Array.isArray(squad.fighters) &&
        squad.fighters.some(fighter => fighter && Number(fighter.hp) > 0) && squad.ammoOrdnance !== undefined);
    if (!tracked.length) return true;
    let available = 0;
    try { available = typeof unitOperationalAmmoTotal === 'function' ? unitOperationalAmmoTotal(unit, 'ordnance') : 0; } catch (e) {}
    if (available <= 1) return false;
    const initial = Number((unit.ammoReserve || {}).initialordnance) || 0;
    return !initial || available > Math.max(2, initial * 0.2);
}

function operationalAIIsValidEnemy(unit) {
    return !!(unit && !unit.isDestroyed && !unit.isSurrendered && !isOpUnitWipedOut(unit) &&
        !isStaticOpUnit(unit) && !operationalUnitInTacticalBattle(unit) &&
        Number.isFinite(Number(unit.col)) && Number.isFinite(Number(unit.row)) && Number(unit.ap) > 0);
}

function operationalAIEngage(unit, visibleTargets) {
    if (!unit || unit.firedThisTurn || operationalUnitInTacticalBattle(unit)) return false;
    if (typeof isMediumArtillery === 'function' && isMediumArtillery(unit)) return false; // её ведёт отдельная артиллерийская фаза
    if (unit.movedThisTurn && typeof opMovingFireAllowed === 'function' && !opMovingFireAllowed(unit)) return false;
    const role = operationalAIRole(unit);
    const range = (typeof operationalFireAtWillRange === 'function') ? operationalFireAtWillRange(unit) : 3;
    const hasAT = (typeof hasAtGunWeapons === 'function') && hasAtGunWeapons(unit);
    const hasMG = (typeof hasMgWeapons === 'function') && hasMgWeapons(unit);
    const targets = visibleTargets.map(target => ({ target, distance: operationalAIUnitDistance(unit, target),
        armored: (typeof isArmoredUnit === 'function') && isArmoredUnit(target) }))
        .filter(candidate => (role !== 'anti_armor' || candidate.armored) &&
            candidate.distance <= range &&
            !opLineOfSightBlocked(unit.col, unit.row, candidate.target.col, candidate.target.row) &&
            (!candidate.armored || hasAT) &&
            (candidate.armored || hasMG || hasAT || (unit.fighters && unit.fighters.length)) &&
            operationalAIAmmoAllowsShot(unit, candidate.target, candidate.distance))
        .sort((a, b) => a.distance - b.distance);
    if (!targets.length) return false;
    const { target, distance: targetDistance, armored } = targets[0];

    const previous = { active: opShootingState.active, shooter: opShootingState.shooter,
        targets: opShootingState.targets, weaponType: opShootingState.weaponType };
    try {
        opShootingState.active = true;
        opShootingState.shooter = unit;
        opShootingState.targets = [target];
        opShootingState.weaponType = armored ? 'at' : 'mg';
        if (armored) executeOpShootAt([target], operationalAIUnitDistance(unit, target));
        else executeOpShoot([target], operationalAIUnitDistance(unit, target));
        return !!unit.firedThisTurn;
    } catch (e) {
        console.warn('Operational enemy AI fire:', e && e.message);
        return false;
    } finally {
        // The shooting helpers normally clear this state themselves. Restore it
        // only when a helper left it active, without disrupting another action.
        if (opShootingState.active && opShootingState.shooter === unit) {
            opShootingState.active = previous.active;
            opShootingState.shooter = previous.shooter;
            opShootingState.targets = previous.targets;
            opShootingState.weaponType = previous.weaponType;
        }
    }
}

function operationalAIMove(unit, route) {
    if (!route || !route.length || Number(unit.ap) <= 0 || isStaticOpUnit(unit)) return 0;
    let moved = 0;
    for (const hex of route) {
        let cost = getOpPlannedMoveCost(unit, Number(unit.col), Number(unit.row), Number(hex.col), Number(hex.row));
        if (!Number.isFinite(cost) && (unit.mobility === 'bicycle' || unit.mobility === 'motorcycle') && !unit.dismounted &&
            typeof autoDismountOperational === 'function') {
            autoDismountOperational(unit);
            cost = getOpPlannedMoveCost(unit, Number(unit.col), Number(unit.row), Number(hex.col), Number(hex.row));
        }
        if (!Number.isFinite(cost) || cost <= 0 || cost > Number(unit.ap)) break;
        // Keep the same terrain and movement rules as player-planned routes.
        unit.ap -= cost;
        unit.prevCol = Number(unit.col);
        unit.prevRow = Number(unit.row);
        unit.col = Number(hex.col);
        unit.row = Number(hex.row);
        try { if (typeof checkPhoneLineCrossing === 'function') checkPhoneLineCrossing(unit, unit.prevCol, unit.prevRow, unit.col, unit.row); } catch (e) {}
        unit.movedThisTurn = true;
        moved++;
        if (typeof opVehicleIsImmobile === 'function' && opVehicleIsImmobile(unit)) break;
        const contact = (appData.campaign.opUnits || []).find(player => player && !player.isDestroyed && !player.isSurrendered &&
            !isOpUnitWipedOut(player) && !operationalUnitInTacticalBattle(player) &&
            Number(player.col) === Number(unit.col) && Number(player.row) === Number(unit.row));
        if (contact) {
            try {
                log(`⚔️ Противник (${unit.name}) вступил в бой с ${contact.name}.`);
                startTacticalBattle([contact], [unit], operationalAIBattleEntry(unit));
            } catch (e) { console.warn('Operational enemy AI contact:', e && e.message); }
            break;
        }
    }
    return moved;
}

function operationalAIBattleEntry(unit) {
    const hexCol = Number(unit && unit.col), hexRow = Number(unit && unit.row);
    let entryDir = null;
    if (unit && unit.movedThisTurn === true && unit.prevCol !== null && unit.prevCol !== undefined &&
        unit.prevRow !== null && unit.prevRow !== undefined && Number.isFinite(Number(unit.prevCol)) &&
        Number.isFinite(Number(unit.prevRow)) && (Number(unit.prevCol) !== hexCol || Number(unit.prevRow) !== hexRow) &&
        typeof opDirectionBetween === 'function') {
        entryDir = opDirectionBetween(hexCol, hexRow, Number(unit.prevCol), Number(unit.prevRow));
    }
    if (!entryDir && typeof placementFallbackDir === 'function') {
        entryDir = placementFallbackDir('enemy', hexCol, hexRow,
            (appData && appData.campaign && appData.campaign.enemyOpUnits) || [],
            (appData && appData.campaign && appData.campaign.opUnits) || []);
    }
    return { entry: { attackerSide: 'enemy', entryDir: entryDir || 'W', source: 'offline-ai' } };
}

function operationalAIPlaceEnemyBattleSquads(battle) {
    if (!isOfflineCampaignAIEnabled() || !battle || !battle.placement || !battle.tacticalMap ||
        !battle.tacticalMap.grid || !Array.isArray(battle.tacticalMap.enemySquads) ||
        battle.placement.aiDeploymentDone || battle.placement.ambush) return 0;
    if (typeof placementSideAllowed !== 'function' || typeof placementZoneKeys !== 'function') return 0;
    const map = battle.tacticalMap;
    const grid = map.grid;
    const squads = map.enemySquads;
    const size = Number(map.mapSize) || (typeof TACTICAL_MAP_SIZE !== 'undefined' ? Number(TACTICAL_MAP_SIZE) : 20) || 20;
    const playerZone = Object.keys(grid).filter(key => grid[key] && placementSideAllowed(battle, 'player', key));
    const centerOf = keys => {
        const points = (keys || []).map(key => String(key).split(',').map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite));
        if (!points.length) return null;
        return `${Math.round(points.reduce((sum, p) => sum + p[0], 0) / points.length)},${Math.round(points.reduce((sum, p) => sum + p[1], 0) / points.length)}`;
    };
    const aimKey = centerOf(playerZone);
    const coverScore = cell => {
        const layers = [cell && cell.type, ...((cell && cell.markers) || [])].map(x => String(x || '').toLowerCase());
        let score = 0;
        if (layers.includes('trenches')) score += 6;
        if (layers.includes('building')) score += 5;
        if (layers.some(x => /forest|shelter|ruin/.test(x))) score += 4;
        if (layers.some(x => /rocks|bushes|crater/.test(x))) score += 2;
        if (Number(cell && cell.level) > 0) score += 1;
        return score;
    };
    const role = squad => {
        const name = String((squad && squad.name) || '');
        if (typeof tacticalSquadIsFixedFortification === 'function' && tacticalSquadIsFixedFortification(squad)) return 'fortification';
        if (typeof isArmoredTacticalSquad === 'function' && isArmoredTacticalSquad(squad)) return 'armor';
        if (/штаб|командир|санитар|снабж/i.test(name)) return 'support';
        if (/пулем|мином|оруд|пто|противотанк|расч[её]т/i.test(name)) return 'weapon_team';
        return 'infantry';
    };
    const alive = (squad) => squad && !squad.hidden && !squad.isDestroyed &&
        (squad.fighters || []).some(fighter => fighter && Number(fighter.hp) > 0);
    const entries = squads.map((squad, index) => ({ squad, index, role: role(squad) })).filter(entry => alive(entry.squad));
    const fixedPositions = new Set();
    // Give each AI fortification a legal tactical hex, preserving any explicit
    // per-map placement already stored in the campaign.
    entries.filter(entry => entry.role === 'fortification').forEach(entry => {
        const squad = entry.squad;
        let fixed = squad.fixedTacticalPosition;
        if (fixed && String(fixed.hexKey) !== String(battle.hexKey)) fixed = null;
        let key = fixed && fixed.key && grid[fixed.key] &&
            placementSideAllowed(battle, 'enemy', String(fixed.key), squad) &&
            !(grid[fixed.key].squadIds || []).length ? String(fixed.key) : null;
        if (!key) {
            const candidates = Object.keys(grid).filter(candidate => grid[candidate] &&
                placementSideAllowed(battle, 'enemy', candidate, squad) &&
                !(grid[candidate].enemySquadIds || []).length && !(grid[candidate].squadIds || []).length);
            candidates.sort((a, b) => coverScore(grid[b]) - coverScore(grid[a]) || String(a).localeCompare(String(b)));
            key = candidates[0] || null;
        }
        if (!key) return;
        let weaponSectors = Object.assign({}, (fixed && fixed.weaponSectors) || {});
        const crewWeapons = (typeof getFactionCrewWeapons === 'function') ? getFactionCrewWeapons(squad.faction) || [] : [];
        (squad.crewInstances || []).forEach((crew, crewIndex) => {
            if (!crew || crew.active === false || crew.status === 'destroyed' || crew.status === 'blinded') return;
            const weapon = crewWeapons.find(item => item && item.name === crew.weaponName);
            if (!weapon || !['mg', 'at_gun', 'tank_gun'].includes(weapon.type)) return;
            if (!weaponSectors[String(crewIndex)]) {
                let axis = null;
                try { axis = aimKey && typeof tacticalSectorIdBetween === 'function' ? tacticalSectorIdBetween(key, aimKey) : null; } catch (e) {}
                weaponSectors[String(crewIndex)] = axis || 'e';
            }
        });
        squad.fixedTacticalPosition = { ...(fixed || {}), hexKey: String(battle.hexKey), key,
            ...(Object.keys(weaponSectors).length ? { weaponSectors } : {}) };
        const storedSquad = (battle.enemySquads || [])[entry.index];
        if (storedSquad) storedSquad.fixedTacticalPosition = JSON.parse(JSON.stringify(squad.fixedTacticalPosition));
        fixedPositions.add(entry.index);
    });

    // Place forts first, then fighting units; leaders and support are kept close
    // to the body of the force. Cover and a usable frontage matter more for the
    // defender, while attackers prefer cover without bunching on one cell.
    const placed = [];
    entries.sort((a, b) => {
        const order = { fortification: 0, infantry: 1, armor: 2, weapon_team: 3, support: 4 };
        return order[a.role] - order[b.role] || String(a.squad.name).localeCompare(String(b.squad.name));
    }).forEach(({ squad, index, role: unitRole }) => {
        const fixed = fixedPositions.has(index);
        let candidates = fixed ? [String(squad.fixedTacticalPosition.key)] : Object.keys(grid).filter(key => grid[key] &&
            placementSideAllowed(battle, 'enemy', key, squad) &&
            !(grid[key].enemySquadIds || []).length && !(grid[key].squadIds || []).length);
        if (!fixed && !candidates.length) candidates = Object.keys(grid).filter(key => grid[key] &&
            placementSideAllowed(battle, 'enemy', key, squad) && !(grid[key].squadIds || []).length);
        const distance = (a, b) => {
            const p = String(a).split(',').map(Number), q = String(b).split(',').map(Number);
            if (p.length !== 2 || q.length !== 2) return 99;
            return (typeof getOpHexDistance === 'function') ? getOpHexDistance(p[0], p[1], q[0], q[1]) : Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
        };
        const score = key => {
            const cell = grid[key] || {};
            const friends = placed.map(item => distance(key, item.key));
            const spacing = friends.length ? Math.min(...friends) : 3;
            const cover = coverScore(cell);
            const clustered = unitRole === 'support' ? -Math.abs(spacing - 1) * 1.5 : Math.min(spacing, 4) * 0.45;
            const attackDistance = aimKey ? distance(key, aimKey) : 4;
            const frontage = battle.placement.attackerSide === 'enemy' ? -attackDistance * 0.2 : Math.min(attackDistance, 6) * 0.15;
            const terrainPreference = unitRole === 'weapon_team' ? cover * 0.65 : cover;
            return terrainPreference + clustered + frontage;
        };
        candidates.sort((a, b) => score(b) - score(a) || String(a).localeCompare(String(b)));
        const key = candidates[0];
        if (!key || !grid[key]) return;
        const cell = grid[key];
        if (!Array.isArray(cell.enemySquadIds)) cell.enemySquadIds = [];
        cell.enemySquadIds = cell.enemySquadIds.filter(id => id !== index);
        cell.enemySquadIds.push(index);
        squad.hexPos = String(key).split(',').map(Number);
        const storedSquad = (battle.enemySquads || [])[index];
        if (storedSquad) storedSquad.hexPos = squad.hexPos.slice();
        placed.push({ index, key, role: unitRole, name: squad.name });
    });
    battle.placement.aiDeploymentDone = true;
    battle.placement.aiDeployment = placed;
    battle.placement.enemyReady = true;
    if (placed.length) {
        try { log(`🧠 Противник автоматически разместил ${placed.length} тактических отрядов; ДОТы закреплены и ориентированы на зону подхода.`); } catch (e) {}
    }
    return placed.length;
}

function processOfflineCampaignAI() {
    if (!isOfflineCampaignAIEnabled()) return { moved: 0, fired: 0 };
    const campaign = appData.campaign;
    if (typeof operationalAIProcessSupply==='function' && typeof supplyAssetCounts==='function') operationalAIProcessSupply();
    try { operationalAIEnsureEnemyCards(); } catch (e) { console.warn('Enemy AI card setup:', e && e.message); }
    const targets = operationalAITargets();
    const assignments = operationalAIPlanAssignments(targets);
    const assignmentByName = new Map(assignments.map(assignment => [assignment.unitName, assignment]));
    let moved = 0, fired = 0, improved = 0;
    (campaign.enemyOpUnits || []).forEach(unit => {
        if (!operationalAIIsValidEnemy(unit) || operationalUnitInTacticalBattle(unit)) return;
        const sameHexContact = (campaign.opUnits || []).find(player => player && !player.isDestroyed && !player.isSurrendered &&
            !isOpUnitWipedOut(player) && !operationalUnitInTacticalBattle(player) &&
            Number(player.col) === Number(unit.col) && Number(player.row) === Number(unit.row));
        if (sameHexContact) {
            try {
                log(`⚔️ Противник (${unit.name}) вступил в бой с ${sameHexContact.name}.`);
                startTacticalBattle([sameHexContact], [unit], operationalAIBattleEntry(unit));
            } catch (e) { console.warn('Operational enemy AI contact:', e && e.message); }
            return;
        }
        const doctrine = campaign.enemyAIDoctrine || null;
        if (doctrine && doctrine.mode==='recon_prepare' &&
            !(campaign.enemyAIRecon && campaign.enemyAIRecon.scoutNames || []).includes(unit.name)) {
            if (unit.enemyAI) unit.enemyAI.orderType='hold';
            return;
        }
        const retreat = operationalAIRetreatTask(unit, doctrine, targets.visible);
        if (retreat) {
            if (unit.enemyAI) unit.enemyAI.orderType = 'retreat';
            const storedOrder = (campaign.enemyAIState && campaign.enemyAIState.orders || []).find(order => order && order.unitName === unit.name);
            if (storedOrder) { storedOrder.type = 'retreat'; if (retreat.target) storedOrder.target = { col: retreat.target.col, row: retreat.target.row }; }
            if (retreat.route && retreat.route.length) {
                moved += operationalAIMove(unit, retreat.route);
                const retreatTarget = retreat.target;
                if (retreatTarget && Number(unit.col) === Number(retreatTarget.col) && Number(unit.row) === Number(retreatTarget.row)) {
                    unit.enemyAIForcedRetreat = false;
                    unit.enemyAIRetreatTarget = null;
                }
            }
            return;
        }
        const commandReadyTurn = Number(unit.enemyAI && unit.enemyAI.commandReadyTurn) || 0;
        if (commandReadyTurn > (Number(campaign.currentTurn) || 1)) {
            if (unit.enemyAICommandWaitLoggedTurn !== campaign.currentTurn) {
                unit.enemyAICommandWaitLoggedTurn = campaign.currentTurn;
                log(`📨 ${unit.name}: приказ «${unit.enemyAI.objectiveId || 'оперативная задача'}» ещё доставляется посыльным; исполнение начнётся с хода ${commandReadyTurn}.`);
            }
            return;
        }
        if (operationalAIEngage(unit, targets.visible)) { fired++; return; }
        const assignment = assignmentByName.get(unit.name) || { role: operationalAIRole(unit), objectiveId: null };
        const choice = operationalAIChooseTarget(unit, targets, assignment);
        if (!choice || !choice.route || !choice.route.length) {
            if (operationalAIImproveDefensivePosition(unit, doctrine, targets.visible)) improved++;
            return;
        }
        moved += operationalAIMove(unit, choice.route);
        // If a visible contact enters range after advancing, the unit may fire
        // this turn unless it has just joined a tactical battle.
        if (!operationalUnitInTacticalBattle(unit) && operationalAIEngage(unit, targets.visible)) fired++;
    });
    if (campaign.enemyAIDoctrine && campaign.enemyAIDoctrine.mode==='recon_prepare') {
        (campaign.opUnits || []).forEach(target=> {
            try { if (typeof opCheckUnitDetection==='function') opCheckUnitDetection(target,{log:false}); } catch(e) {}
        });
    }
    // Re-evaluate enemy visibility after orders: the detection check at the
    // beginning of the operational phase refers to the units' old positions.
    try { if (typeof refreshOfflineEnemyDetectionAfterAI === 'function') refreshOfflineEnemyDetectionAfterAI(); }
    catch (e) { console.warn('Enemy AI detection refresh:', e && e.message); }
    if (moved || fired || improved) {
        try { log(`🧠 Противник: перемещено ${moved} гекс(ов), обстрелов: ${fired}, действий по укреплению позиции: ${improved}.`); } catch (e) {}
        try { saveData(); } catch (e) {}
        try { redrawOperationalMap(); } catch (e) {}
    } else {
        // Radio/messenger delivery timers and issued command state must survive reloads.
        try { saveData(); } catch (e) {}
    }
    return { moved, fired, improved };
}

// Enemy logistics has its own finite depot and real roster transports. Never
// borrow the player's supply state or refill a fighting tactical snapshot.
function operationalAIProcessSupply() {
    if (!isOfflineCampaignAIEnabled()) return 0;
    const camp=appData.campaign,turn=Number(camp.currentTurn)||1;
    const depot=(camp.enemyOpUnits || []).find(u=>u && !u.isDestroyed && !u.isSurrendered &&
        isSupplyOperationalUnit(u) && u.col!=null && u.row!=null);
    if (!depot || operationalUnitInTacticalBattle(depot)) return 0;
    const hostileAt=(col,row)=>(camp.opUnits || []).some(u=>u && !u.isDestroyed && !u.isSurrendered &&
        u.col!=null && u.row!=null && Number(u.col)===Number(col) && Number(u.row)===Number(row));
    if (hostileAt(depot.col,depot.row)) return 0;
    const state=camp.enemyAISupply || (camp.enemyAISupply={stock:{...SUPPLY_DEPOT_MAX},deliveries:[]});
    if (state.processedTurn===turn) return 0;
    state.processedTurn=turn;
    let delivered=0;
    const counts=supplyAssetCounts(depot);
    state.lostAssets ||= {};
    for (const id of Object.keys(counts)) counts[id]=Math.max(0,counts[id]-(Number(state.lostAssets[id])||0));
    for (const trip of state.deliveries.slice()) {
        if (hostileAt(trip.col,trip.row) || !(counts[trip.assetId]>0)) {
            state.lostAssets[trip.assetId]=(Number(state.lostAssets[trip.assetId])||0)+1;
            state.deliveries=state.deliveries.filter(x=>x!==trip);continue;
        }
        const recipient=(camp.enemyOpUnits || []).find(u=>u && u.name===trip.unitName && !u.isDestroyed && !u.isSurrendered);
        if (!recipient || recipient.col==null || recipient.row==null) trip.returning=true;
        const target=trip.returning?depot:recipient;
        if (!target) continue;
        const probe={name:'Колонна снабжения противника',mobility:supplyAssetsMobility([{id:trip.assetId,count:1}]),col:trip.col,row:trip.row};
        const route=operationalAISupplyRoute(probe,target) || [];
        let ap=4;
        for (const step of route) {
            const cost=supplyMoveCost(probe.mobility,step.col,step.row,trip.col,trip.row);
            if (!Number.isFinite(cost) || cost>ap) break;
            ap-=cost;trip.col=Number(step.col);trip.row=Number(step.row);
            if (hostileAt(trip.col,trip.row)) {trip.lost=true;break;}
        }
        if (trip.lost) {state.lostAssets[trip.assetId]=(Number(state.lostAssets[trip.assetId])||0)+1;state.deliveries=state.deliveries.filter(x=>x!==trip);continue;}
        if (trip.col!==Number(target.col) || trip.row!==Number(target.row)) continue;
        if (trip.returning) {
            for (const kind of ['ammoSmall','ammoOrdnance','grenades']) state.stock[kind]+=Number(trip.cargo[kind])||0;
            state.deliveries=state.deliveries.filter(x=>x!==trip);
        } else if (!operationalUnitInTacticalBattle(recipient)) {
            trip.cargo=operationalAIReceiveSupply(recipient,trip.cargo);trip.returning=true;delivered++;
        }
    }
    const requests=(camp.enemyOpUnits || []).filter(u=>u && u!==depot && !u.isDestroyed && !u.isSurrendered &&
        !u.embarkedInBtr && u.col!=null && u.row!=null && !operationalUnitInTacticalBattle(u) &&
        !state.deliveries.some(d=>d.unitName===u.name)).map(unit=>({unit,status:operationalAIAmmoSupplyStatus(unit).status}))
        .filter(({status})=>['ammoSmall','ammoOrdnance'].some(k=>status[k].max>0 && status[k].cur/status[k].max<=0.2))
        .sort((a,b)=>supplyAmmoPercent(a.unit)-supplyAmmoPercent(b.unit));
    for (const {unit,status} of requests) {
        const assetId=supplyAssetIds().find(id=>Number(counts[id])>
            state.deliveries.filter(d=>d.assetId===id).length &&
            Object.entries(supplyCargoOf([{id,count:1}])).some(([k,n])=>n>0 && state.stock[k]>0 && status[k]?.cur<status[k]?.max));
        if (!assetId) continue;
        const probe={col:Number(depot.col),row:Number(depot.row),mobility:supplyAssetsMobility([{id:assetId,count:1}])};
        const route=operationalAISupplyRoute(probe,unit) || [];
        if (!route.length && (unit.col!==depot.col || unit.row!==depot.row)) continue;
        const capacity=supplyCargoOf([{id:assetId,count:1}]),cargo={};
        for (const kind of ['ammoSmall','ammoOrdnance','grenades']) {
            cargo[kind]=Math.max(0,Math.min(Number(capacity[kind])||0,Number(state.stock[kind])||0,status[kind].max-status[kind].cur));
            state.stock[kind]-=cargo[kind];
        }
        state.deliveries.push({unitName:unit.name,assetId,cargo,col:Number(depot.col),row:Number(depot.row),returning:false});
        break; // one newly dispatched convoy per operational turn
    }
    return delivered;
}

// Supply routes use supply terrain costs, not player-side combat-unit paths.
function operationalAISupplyRoute(probe,target) {
    const start=`${probe.col},${probe.row}`,goal=`${target.col},${target.row}`;
    if (start===goal) return [];
    const camp=appData.campaign;
    const danger=new Set((camp.opUnits || []).filter(u=>u && !u.isDestroyed && !u.isSurrendered &&
        (u.detected || u.noiseMarker) && u.col!=null && u.row!=null).map(u=>`${u.col},${u.row}`));
    const queue=[{col:probe.col,row:probe.row,cost:0}],best=new Map([[start,0]]),previous=new Map();
    while(queue.length) {
        queue.sort((a,b)=>a.cost-b.cost);
        const current=queue.shift(),key=`${current.col},${current.row}`;
        if (key===goal) break;
        if (current.cost>best.get(key)) continue;
        for(const next of getOpHexNeighbors(current.col,current.row)) {
            const nk=`${next.col},${next.row}`;
            if (danger.has(nk) || typeof operationalHexHasActiveBattle==='function' && operationalHexHasActiveBattle(next.col,next.row) ||
                typeof opHexIsCutByPlayer==='function' && opHexIsCutByPlayer(next.col,next.row)) continue;
            const step=supplyMoveCost(probe.mobility,next.col,next.row,current.col,current.row);
            if (!Number.isFinite(step) || step>4) continue;
            const cost=current.cost+step;
            if (cost>=(best.get(nk)??Infinity)) continue;
            best.set(nk,cost);previous.set(nk,key);queue.push({...next,cost});
        }
    }
    if (!previous.has(goal)) return null;
    const route=[];
    for(let key=goal;key!==start;key=previous.get(key)) {
        if (!key) return null;
        const [col,row]=key.split(',').map(Number);route.unshift({col,row});
    }
    return route;
}
