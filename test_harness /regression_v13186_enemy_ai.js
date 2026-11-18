// ⚡ v13.186 (этап B): ПРОТИВНИК, КОТОРЫЙ ИГРАЕТ.
//
// Проверяем ровно то, что согласовано с заказчиком:
//   B1. Доктрины назначаются каждому вражескому отряду и предсказуемы.
//   B2. Враг ЧЕСТЕН: видит только обнаруженные отряды игрока.
//   B3. Решения по доктринам: удержание / контратака / отход / засада.
//   B4. Отход при низком духе и больших потерях.
//   B5. Движение: 1 гекс = 1 ОД, непроходимость учитывается, контакт → бой.
//   B6. Рукопашная симметрична (вражеская сторона тоже бьёт).
//   B7. VP: оцифровка существующих объективов и итог боя.
//   B8. Лимит раундов: бой не может тянуться бесконечно.
//   B9. Модуль подключён к index.html и не включён в онлайн-матчах.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, HTML } = require('./extract');

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✓ ' + name); }
    else { fail++; console.log('✗ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}

// ── песочница: грузим модуль отдельно, подкладывая функции движка ──────────
function makeSandbox(opts) {
    opts = opts || {};
    const camps = opts.campaign;
    const ctx = {
        console,
        Math,
        Number,
        Array,
        Object,
        String,
        JSON,
        Date,
        isFinite,
        appData: { campaign: camps },
        log: () => {},
        getOpHexDistance: (c1, r1, c2, r2) => (Math.abs(c1 - c2) + Math.abs(r1 - r2) + Math.abs(c1 + r1 - c2 - r2)) / 2,
        getOpMoveCost: opts.getOpMoveCost || (() => 1),
        getRouteToTarget: opts.getRouteToTarget || ((fc, fr, tc, tr) => {
            const out = [];
            let c = fc, r = fr;
            while (c !== tc || r !== tr) {
                if (c !== tc) c += Math.sign(tc - c);
                else r += Math.sign(tr - r);
                out.push({ col: c, row: r });
                if (out.length > 40) break;
            }
            return out;
        }),
        opRecordPrevPos: () => {},
        campaignObjectiveHexControl: opts.hexControl || (() => 'neutral'),
        campaignObjectiveDefinitions: opts.objectives || (() => null),
        isStaticOpUnit: u => !!(u && (u.type === 'dots' || (u.name && String(u.name).includes('ДОТ')))),
        isOpUnitWipedOut: u => !!(u && u.wipedOut),
        operationalUnitInTacticalBattle: u => !!(u && u.isInBattle),
        startTacticalBattle: (players, enemies, o) => { ctx.__battles.push({ players, enemies, o }); },
        opLineOfSightBlocked: () => false,
        tacticalEnemyIsNeutralized: e => {
            if (!e) return true;
            if (e.isDestroyed || e.isSurrendered || e.isRetreated) return true;
            const f = Array.isArray(e.fighters) ? e.fighters : [];
            return f.length > 0 && f.every(x => !x || Number(x.hp) <= 0);
        },
        tacticalSquadsInSameHex: () => [],
        meleeAttack: () => {},
        currentTurn: 3,
        currentSquadIndex: -1,
        currentSquad: null,
        __battles: []
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    const src = fs.readFileSync(path.join(ROOT, 'js', 'enemy_ai.js'), 'utf8');
    vm.runInContext(src, ctx);
    return ctx;
}

function squadWith(hpList, morale) {
    return {
        fighters: hpList.map(hp => ({ hp })),
        currentMorale: morale
    };
}

// ── B1. Доктрины ───────────────────────────────────────────────────────────
(function () {
    const enemyUnits = [
        { name: 'ДОТ «Van Hees»', type: 'dots' },
        { name: '1-й танковый взвод', type: 'tank_platoon' },
        { name: 'Грузовик снабжения', type: 'supply' },
        { name: 'Разведка на мотоциклах' },
        { name: 'Миномётная батарея 82-мм' },
        { name: 'Штаб батальона', type: 'battalion_hq' },
        { name: '1-я пехотная рота' },
        { name: '2-я пехотная рота' },
        { name: '3-я пехотная рота' },
        { name: '4-я пехотная рота' }
    ];
    const ctx = makeSandbox({ campaign: { enemyOpUnits: enemyUnits, opUnits: [] } });
    ctx.ENEMY_AI.assignDoctrines();
    check('B1 доктрина назначена всем отрядам',
        enemyUnits.every(u => ctx.ENEMY_AI.doctrines[u.aiDoctrine]), enemyUnits.map(u => u.aiDoctrine).join(','));
    check('B1 ДОТ — удержание', enemyUnits[0].aiDoctrine === 'hold', enemyUnits[0].aiDoctrine);
    check('B1 танки — контратака', enemyUnits[1].aiDoctrine === 'counterattack', enemyUnits[1].aiDoctrine);
    check('B1 снабжение — отход', enemyUnits[2].aiDoctrine === 'fallback', enemyUnits[2].aiDoctrine);
    check('B1 разведка/мотоциклы — засада', enemyUnits[3].aiDoctrine === 'ambush', enemyUnits[3].aiDoctrine);
    check('B1 артиллерия — удержание', enemyUnits[4].aiDoctrine === 'hold', enemyUnits[4].aiDoctrine);
    check('B1 штаб — отход', enemyUnits[5].aiDoctrine === 'fallback', enemyUnits[5].aiDoctrine);
    const inf = enemyUnits.slice(6).map(u => u.aiDoctrine);
    check('B1 пехота делится между удержанием и контратакой',
        inf.includes('hold') && inf.includes('counterattack'), inf.join(','));
    check('B1 назначение идемпотентно (повтор не меняет)',
        (() => { const before = enemyUnits.map(u => u.aiDoctrine).join(); ctx.ENEMY_AI.assignDoctrines(); return before === enemyUnits.map(u => u.aiDoctrine).join(); })());
    // явно заданная доктрина не перетирается
    enemyUnits[6].aiDoctrine = 'ambush';
    check('B1 явная доктрина сохраняется',
        (ctx.ENEMY_AI.doctrineFor(enemyUnits[6]) === 'ambush'));
})();

// ── B2. Честность восприятия ───────────────────────────────────────────────
(function () {
    const playerUnits = [
        { name: 'обнаруженный', col: 5, row: 5, detected: true },
        { name: 'скрытый', col: 6, row: 5, detected: false },
        { name: 'шум', col: 7, row: 5, noiseMarker: true },
        { name: 'в бою', col: 8, row: 5, detected: true, isInBattle: true }
    ];
    const enemy = { name: 'взвод', col: 5, row: 4, squads: [squadWith([1, 1, 1])] };
    const ctx = makeSandbox({ campaign: { opUnits: playerUnits, enemyOpUnits: [enemy] } });

    check('B2 обнаруженный отряд виден', ctx.ENEMY_AI.seesPlayerUnit(playerUnits[0]) === true);
    check('B2 СКРЫТЫЙ отряд не виден — враг не подглядывает',
        ctx.ENEMY_AI.seesPlayerUnit(playerUnits[1]) === false);
    check('B2 маркер «шум» считается известным', ctx.ENEMY_AI.seesPlayerUnit(playerUnits[2]) === true);
    check('B2 отряд в тактическом бою не цель', ctx.ENEMY_AI.seesPlayerUnit(playerUnits[3]) === false);

    const nearest = ctx.ENEMY_AI.nearestKnownFoe(enemy);
    check('B2 ближайший известный — обнаруженный, а не скрытый',
        nearest && nearest.unit.name === 'обнаруженный', nearest && nearest.unit.name);

    // если ничего не обнаружено — враг «слеп»
    playerUnits.forEach(u => { u.detected = false; u.noiseMarker = false; });
    check('B2 без обнаруженных целей враг слеп',
        ctx.ENEMY_AI.nearestKnownFoe(enemy) === null);
    const plan = ctx.ENEMY_AI.decideAction(enemy, { nearest: null, objective: null, fallback: null });
    check('B2 слепой враг не идёт в контратаку по невидимке',
        plan.action !== 'move', plan.action);
})();

// ── B3. Решения по доктринам ───────────────────────────────────────────────
(function () {
    const ctx = makeSandbox({ campaign: { opUnits: [], enemyOpUnits: [] } });

    const holder = { name: 'ДОТ', type: 'dots', col: 3, row: 3, squads: [squadWith([1, 1])] };
    const holdPlan = ctx.ENEMY_AI.decideAction(holder, { nearest: null, objective: null, fallback: null });
    check('B3 удержание: стоит на месте', holdPlan.action === 'hold', holdPlan.action);

    const holderContact = { name: 'пехота', type: 'infantry', col: 3, row: 3, aiDoctrine: 'hold', squads: [squadWith([1, 1])] };
    const defendPlan = ctx.ENEMY_AI.decideAction(holderContact, { nearest: { unit: { col: 3, row: 3 }, distance: 0 }, objective: null, fallback: null });
    check('B3 удержание при враге в упор — оборона гекса', defendPlan.action === 'defend', defendPlan.action);

    const attacker = { name: 'танковый взвод', col: 2, row: 2, aiDoctrine: 'counterattack', squads: [squadWith([1, 1, 1])] };
    const counterPlan = ctx.ENEMY_AI.decideAction(attacker, {
        nearest: null, fallback: null,
        objective: { col: 6, row: 6, reason: 'игрок занял объектив', control: 'player', distance: 8 }
    });
    check('B3 контратака идёт к объективу', counterPlan.action === 'move' && counterPlan.targetHex === '6,6',
        `${counterPlan.action} ${counterPlan.targetHex}`);
    check('B3 причина контратаки сохранена', /объектив/.test(counterPlan.reason), counterPlan.reason);

    const counterNoObj = ctx.ENEMY_AI.decideAction(attacker, {
        nearest: { unit: { col: 7, row: 7 }, distance: 9 }, objective: null, fallback: null
    });
    check('B3 контратака без объектива идёт на обнаруженного',
        counterNoObj.action === 'move' && counterNoObj.targetHex === '7,7', counterNoObj.targetHex);

    const ambusher = { name: 'разведка', col: 4, row: 4, aiDoctrine: 'ambush', squads: [squadWith([1, 1])] };
    const ambushPlan = ctx.ENEMY_AI.decideAction(ambusher, {
        nearest: null, fallback: null, objective: { col: 5, row: 6, reason: 'на пути', distance: 3 }
    });
    check('B3 засада выдвигается на путь', ambushPlan.action === 'ambush', ambushPlan.action);
    ambusher.isAmbush = true;
    check('B3 уже в засаде — не дёргается',
        ctx.ENEMY_AI.decideAction(ambusher, { nearest: null, objective: null, fallback: null }).action === 'hold');
})();

// ── B4. Отход ──────────────────────────────────────────────────────────────
(function () {
    const ctx = makeSandbox({ campaign: { opUnits: [], enemyOpUnits: [] } });
    const broken = { name: 'танки', col: 5, row: 5, aiDoctrine: 'counterattack', squads: [squadWith([0, 0, 1], 20)] };
    check('B4 низкий дух = отход', ctx.ENEMY_AI.shouldBreakOff(broken) === true,
        'дух ' + ctx.ENEMY_AI.morale(broken));
    const plan = ctx.ENEMY_AI.decideAction(broken, { nearest: { unit: { col: 9, row: 5 }, distance: 4 }, objective: { col: 9, row: 5 }, fallback: { col: 1, row: 5 } });
    check('B4 ломается и уходит в тыл, а не в контратаку',
        plan.action === 'move' && plan.doctrine === 'fallback' && plan.targetHex === '1,5',
        `${plan.action}/${plan.doctrine}/${plan.targetHex}`);

    const heavyLosses = { name: 'пехота', col: 5, row: 5, aiDoctrine: 'hold', squads: [squadWith([0, 0, 0, 1, 1], 100)] };
    check('B4 большие потери = отход', ctx.ENEMY_AI.shouldBreakOff(heavyLosses) === true,
        'потери ' + ctx.ENEMY_AI.lossRatio(heavyLosses));

    const steady = { name: 'пехота', col: 5, row: 5, aiDoctrine: 'hold', squads: [squadWith([1, 1, 1], 90)] };
    check('B4 крепкий отряд не отходит', ctx.ENEMY_AI.shouldBreakOff(steady) === false);

    check('B4 без пути отхода не убегает с карты',
        ctx.ENEMY_AI.decideAction(broken, { nearest: null, objective: null, fallback: null }).action === 'hold');
})();

// ── B5. Движение ───────────────────────────────────────────────────────────
(function () {
    const enemy = { name: 'танки', col: 0, row: 0, ap: 3, aiDoctrine: 'counterattack', squads: [squadWith([1, 1, 1])] };
    const ctx = makeSandbox({ campaign: { opUnits: [{ name: 'цель', col: 6, row: 0, detected: true }], enemyOpUnits: [enemy] } });
    const step = ctx.ENEMY_AI.stepToward(enemy, 3, 0);
    check('B5 шаг сделан', step.moved === true);
    check('B5 один шаг = 1 гекс', enemy.col === 1 && enemy.row === 0, `${enemy.col},${enemy.row}`);
    check('B5 стоимость шага — 1 ОД', step.cost === 1 && enemy.ap === 2, `cost=${step.cost} ap=${enemy.ap}`);
    check('B5 отмечено движение (для обнаружения)', enemy.movedThisTurn === true);

    // ОД кончились — не двигается
    enemy.ap = 0;
    check('B5 без ОД не двигается', ctx.ENEMY_AI.stepToward(enemy, 5, 0).moved === false);

    // непроходимая местность
    const blocked = { name: 'пехота', col: 2, row: 2, ap: 4, squads: [squadWith([1])] };
    const ctx2 = makeSandbox({
        campaign: { opUnits: [], enemyOpUnits: [blocked] },
        getOpMoveCost: () => Infinity
    });
    check('B5 непроходимый гекс не проходится', ctx2.ENEMY_AI.stepToward(blocked, 5, 2).moved === false);

    // контакт с отрядом игрока на следующем гексе
    const foe = { name: 'наш взвод', col: 1, row: 0, detected: true };
    // враг стоит в (0,0) и шагает в (1,0), где стоит наш отряд
    const contactor = { name: 'пехота', col: 0, row: 0, ap: 3, squads: [squadWith([1, 1])] };
    const contactCtx = makeSandbox({ campaign: { opUnits: [foe], enemyOpUnits: [contactor] } });
    const cstep = contactCtx.ENEMY_AI.stepToward(contactor, 4, 0);
    check('B5 вход на гекс игрока помечен контактом', cstep.contact === true);

    // полная фаза: двигается и начинает бой
    const runner = { name: 'танки', col: 0, row: 0, ap: 3, aiDoctrine: 'counterattack', squads: [squadWith([1, 1, 1])] };
    const target = { name: 'наш взвод', col: 2, row: 0, detected: true };
    const ctx3 = makeSandbox({ campaign: { currentTurn: 5, opUnits: [target], enemyOpUnits: [runner] } });
    const report = ctx3.ENEMY_AI.runOperationalPhase();
    check('B5 фаза противника отработала', report.units === 1 && report.moved >= 1, JSON.stringify(report.details));
    check('B5 бой начат по контакту', report.battles.length === 1 && ctx3.__battles.length === 1,
        JSON.stringify(report.battles));
    check('B5 в бою участвует именно этот отряд',
        ctx3.__battles[0] && ctx3.__battles[0].enemies[0].name === 'танки');
})();

// ── B6. Рукопашная симметрия ───────────────────────────────────────────────
(function () {
    let enemyMeleeCalls = 0;
    const enemySquad = { name: 'вражеский взвод', fighters: [{ hp: 2 }], meleeResolvedTurn: null };
    const playerSquad = { name: 'наш взвод', fighters: [{ hp: 2 }] };
    const campaign = { opUnits: [], enemyOpUnits: [] };
    const ctx = makeSandbox({ campaign });
    ctx.appData.map = { enemySquads: [enemySquad], grid: {} };
    ctx.appData.squads = [playerSquad];
    ctx.tacticalSquadsInSameHex = sq => (sq === enemySquad
        ? [{ squad: playerSquad, idx: 0, isEnemy: false }]
        : [{ squad: enemySquad, idx: 0, isEnemy: true }]);
    ctx.meleeAttack = () => { enemyMeleeCalls++; };
    const resolved = ctx.ENEMY_AI.resolveEnemyMelees();
    check('B6 вражеский отряд вступает в рукопашную', resolved === 1, resolved);
    check('B6 удар нанесён (meleeAttack вызван)', enemyMeleeCalls === 1, enemyMeleeCalls);

    // без общего гекса — не бьёт
    ctx.tacticalSquadsInSameHex = () => [];
    enemySquad.meleeResolvedTurn = null;
    check('B6 вне общего гекса рукопашной нет', ctx.ENEMY_AI.resolveEnemyMelees() === 0);

    // техника в рукопашной не участвует
    ctx.tacticalSquadsInSameHex = () => [{ squad: playerSquad, idx: 0, isEnemy: false }];
    const vehicle = { name: 'танк', armor: { front: 3 }, fighters: [{ hp: 3 }] };
    ctx.appData.map.enemySquads = [vehicle];
    check('B6 вражеская техника в рукопашную не идёт', ctx.ENEMY_AI.resolveEnemyMelees() === 0);
})();

// ── B7. VP ─────────────────────────────────────────────────────────────────
(function () {
    const objectives = () => ({
        primary: [
            { id: 'p1', kind: 'hold_at_deadline', col: 11, row: 8, label: 'удержать (11,8)' },
            { id: 'p2', kind: 'limit_enemy_hold', col: 7, row: 0, label: 'не пустить' }
        ],
        additional: [
            { id: 'a1', kind: 'control_at_deadline', hexes: [[4, 7], [8, 10]], label: 'оба ДОТа' }
        ]
    });
    const ctx = makeSandbox({ campaign: { opUnits: [], enemyOpUnits: [] }, objectives });
    const table = ctx.ENEMY_AI.vpTable();
    check('B7 VP считаются по существующим объективам',
        table.primary.length === 2 && table.additional.length === 1, JSON.stringify(table));
    check('B7 у объективов есть вес', table.primary.every(o => o.vp >= 1) && table.max > 0, table.max);

    // score без состояния не падает
    const score = ctx.ENEMY_AI.vpScore();
    check('B7 счёт VP без состояния не падает', score && score.max === table.max, JSON.stringify(score));

    // итог боя
    const victoryBattle = {
        result: 'victory',
        playerSquads: [{ fighters: [{ hp: 2 }] }],
        enemySquads: [{ isDestroyed: true, fighters: [{ hp: 0 }] }, { fighters: [{ hp: 0 }] }]
    };
    const vp = ctx.ENEMY_AI.battleVictoryPoints(victoryBattle);
    check('B7 победа даёт очки игроку', vp.player > vp.enemy, JSON.stringify(vp));
    check('B7 уничтоженные отряды врага учтены', vp.player >= 5, vp.player);
    check('B7 у очков есть разница (margin)', vp.margin === vp.player - vp.enemy);

    const losingBattle = { result: 'defeat', playerSquads: [{ isDestroyed: true, fighters: [{ hp: 0 }] }], enemySquads: [{ fighters: [{ hp: 2 }] }] };
    check('B7 поражение даёт очки противнику', ctx.ENEMY_AI.battleVictoryPoints(losingBattle).margin < 0);
})();

// ── B8. Лимит раундов ──────────────────────────────────────────────────────
(function () {
    const ctx = makeSandbox({ campaign: { opUnits: [], enemyOpUnits: [] } });
    const limit = ctx.ENEMY_AI.roundLimit();
    check('B8 лимит раундов задан и конечен', Number.isFinite(limit) && limit > 0 && limit <= 30, limit);

    const fresh = { tacticalPhasesCompleted: 0 };
    check('B8 свежий бой лимит не достиг', ctx.ENEMY_AI.reachedRoundLimit(fresh) === false);
    const long = { tacticalPhasesCompleted: limit * 2 };
    check('B8 долгий бой упирается в лимит', ctx.ENEMY_AI.reachedRoundLimit(long) === true);
    check('B8 раунды считаются из фаз', ctx.ENEMY_AI.roundsPlayed(long) === limit, ctx.ENEMY_AI.roundsPlayed(long));

    const winning = { result: 'victory', playerSquads: [{ fighters: [{ hp: 1 }] }], enemySquads: [{ isDestroyed: true, fighters: [{ hp: 0 }] }] };
    check('B8 по очкам — победа', ctx.ENEMY_AI.limitOutcome(winning).result === 'victory');
    const even = { playerSquads: [{ fighters: [{ hp: 1 }] }], enemySquads: [{ fighters: [{ hp: 1 }] }] };
    check('B8 равный счёт — ничья', ctx.ENEMY_AI.limitOutcome(even).result === 'draw');
})();

// ── B9. Интеграция ─────────────────────────────────────────────────────────
(function () {
    check('B9 js/enemy_ai.js существует', fs.existsSync(path.join(ROOT, 'js', 'enemy_ai.js')));
    check('B9 модуль подключён в index.html', /<script src="js\/enemy_ai\.js"><\/script>/.test(HTML));
    check('B9 модуль в кэше service-worker', /'\.\/js\/enemy_ai\.js'/.test(fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8')));
    check('B9 фаза противника вызывается из endOperationalTurn',
        /runEnemyOperationalPhase\(\)/.test(HTML));
    check('B9 вражеская рукопашная вызывается из resolveTacticalMeleesForTurn',
        /resolveTacticalMeleesForEnemySide\('\)|resolveTacticalMeleesForEnemySide\(\)/.test(HTML));
    check('B9 лимит раундов применяется в finishBattle',
        /tacticalBattleReachedRoundLimit\(battle\)/.test(HTML));
    check('B9 в онлайн-матче враг не управляется кодом',
        /if \(camp\.online\) \{ report\.skipped = 'онлайн-матч'; return report; \}/.test(
            fs.readFileSync(path.join(ROOT, 'js', 'enemy_ai.js'), 'utf8')));
    check('B9 нет дублей определений функций в модуле',
        (() => {
            const src = fs.readFileSync(path.join(ROOT, 'js', 'enemy_ai.js'), 'utf8');
            const seen = new Set(), dup = [];
            const re = /(^|\n)function[ \t]+([A-Za-z0-9_$]+)[ \t]*\(/g;
            let m;
            while ((m = re.exec(src))) { if (seen.has(m[2])) dup.push(m[2]); seen.add(m[2]); }
            return dup.length === 0;
        })());
})();

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ` v13.186 (противник, который играет): ${pass} проверок, ${fail} падений`);
process.exit(fail ? 1 : 0);
