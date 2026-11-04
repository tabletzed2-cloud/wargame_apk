'use strict';
// ⚡ v13.153 — партия 3 «артиллерия, подавление, пожар»:
//  23. артобстрел бьёт по площади целевого гекса: по каждому отряду — случайный
//      шанс попадания (окопы защищают), внутрь 1–3 бойца, дух −5…−15;
//  29. дух ниже 30 — подразделение отходит (та же модель, что в п.23);
//  24. «Скоординированное подавление»: два гекса за 2,5 ОД, только отделения
//      поддержки и пулемётные расчёты с карточкой «Скоординированный
//      заградительный огонь»;
//  32. ампуломёт/бутылкомёт поджигают технику: пожар ослепляет экипаж (30 %),
//      со второго хода может добраться до двигателя, сам затухает.
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

const MORALE_FNS = ['tacticalMoralePercent', 'tacticalSetMoralePercent', 'tacticalShiftMoralePercent',
    'tacticalShouldRetreatOnMorale', 'tacticalForceLowMoraleRetreat', 'tacticalSquadIndexOnMap',
    'tacticalNormalizeMoraleScale', 'tacticalMoraleScale', 'tacticalMoraleCurrent'];
const MORALE_CONSTS = ['ARTY_AREA_MORALE_MIN', 'ARTY_AREA_MORALE_MAX', 'TACTICAL_MORALE_RETREAT_POINTS'];

// ─────────────────── 23. Артобстрел по площади ───────────────────
{
    ok(/const ARTY_AREA_HIT_CHANCE = 0\.60;/.test(HTML), 'шанс попадания по отряду — 60 % на открытой местности');
    ok(/const ARTY_AREA_TRENCH_HIT_CHANCE = 0\.30;/.test(HTML), 'в окопах шанс попадания — 30 %');
    const shell = sliceFunction(HTML, 'tacticalArtilleryResolveCall');
    ok(/tacticalArtillerySquadHitChance\(trenches\)/.test(shell), 'резолвер считает шанс с поправкой на окопы');
    ok(/tacticalArtilleryFightersHit\(trenches\)/.test(shell), 'внутрь отряда попадает 1–3 бойца');
    ok(!/afterTerrain \* damageable\.length/.test(shell), 'прежнее «урон × число отрядов» убрано');
    ok(/tacticalShiftMoralePercent\(squad, -moraleLoss\)/.test(shell), 'дух падает по числу потерь');
    ok(/tacticalForceLowMoraleRetreat\(squad/.test(shell), 'при духе ниже 30 отряд отходит');
}
{
    const s = createSandbox(freshAppData());
    ['tacticalArtilleryScatterHex', 'tacticalArtilleryHexHasTrenches', 'tacticalArtilleryHexOccupants',
        'tacticalArtilleryApplyDamage', 'tacticalArtilleryResolveCall',
        'tacticalArtilleryFightersHit', 'tacticalArtillerySquadHitChance', 'tacticalArtilleryMoraleLoss']
        .concat(MORALE_FNS).forEach(fn => s.run(sliceFunction(HTML, fn)));
    ['ARTY_AREA_HIT_CHANCE', 'ARTY_AREA_TRENCH_HIT_CHANCE', 'TACTICAL_ARTY_HIT_THRESHOLD'].concat(MORALE_CONSTS)
        .forEach(n => s.run(sliceConst(HTML, n)));
    s.run(`
        function log() {}
        function markTacticalSuppressed() {}
        function tacticalIsDotSquad() { return false; }
        function processTacticalRouts() {}
        appData.map = { grid: { '2,2': { type: 'grass', squadIds: [], enemySquadIds: [0, 1] } }, enemySquads: [] };
        var n1 = { name: '1-й взвод', tacticalMoraleScaleVersion: 1, fighters: [{ name: 'a', hp: 5 }, { name: 'b', hp: 5 }, { name: 'c', hp: 5 }], currentMorale: 100 };
        var n2 = { name: '2-й взвод', tacticalMoraleScaleVersion: 1, fighters: [{ name: 'd', hp: 5 }, { name: 'e', hp: 5 }], currentMorale: 100 };
        appData.squads = [];
        appData.map.enemySquads = [n1, n2];
        function applyDamagePointsToEnemy(squad, points, res) {
            let applied = 0;
            for (let i = 0; i < points; i++) {
                const alive = squad.fighters.filter(f => f.hp > 0);
                if (!alive.length) break;
                const f = alive[Math.floor(Math.random() * alive.length)];
                f.hp -= 1; applied++;
                if (f.hp <= 0) res.killed.push(f.name);
            }
            res.damage += applied;
            return applied;
        }
        function rollD10() { return 8; }
        function rollD6() { return 3; }
        Math.random = () => 0;
        var before = [n1.fighters.reduce((a, f) => a + f.hp, 0), n2.fighters.reduce((a, f) => a + f.hp, 0)];
        var res = tacticalArtilleryResolveCall({ targetHex: '2,2', shells: 1, isSau: false, batteryName: '82-мм' }, {});
        var after = [n1.fighters.reduce((a, f) => a + f.hp, 0), n2.fighters.reduce((a, f) => a + f.hp, 0)];
        var lost = [before[0] - after[0], before[1] - after[1]];
        var morale = [n1.currentMorale, n2.currentMorale];
    `);
    ok(s.evalCtx('lost[0] >= 1 && lost[0] <= 3 && lost[1] >= 1 && lost[1] <= 3'),
        'каждый отряд гекса теряет 1–3 бойца', JSON.stringify(s.evalCtx('JSON.stringify(lost)')));
    ok(s.evalCtx('morale[0] <= 95 && morale[0] >= 85'),
        'дух упал на 5–15 пунктов', JSON.stringify(s.evalCtx('JSON.stringify(morale)')));
    ok(s.evalCtx('res.damage > 0'), 'итог налёта содержит урон');
    // окопы: шанс ниже и не больше двух бойцов
    ok(s.evalCtx('tacticalArtillerySquadHitChance(true) === 0.30 && tacticalArtillerySquadHitChance(false) === 0.60'),
        'окопы режут шанс попадания вдвое');
    ok(s.evalCtx('tacticalArtilleryFightersHit(true) <= 2'), 'в окопах поражается не больше двух бойцов');
    ok(s.evalCtx('tacticalArtilleryMoraleLoss(0, 10, false) === 5 && tacticalArtilleryMoraleLoss(3, 10, false) === 11 && ' +
        'tacticalArtilleryMoraleLoss(9, 5, false) === 15'), 'дух −5…−15 в зависимости от потерь');
}

// ─────────────────── 29. Дух ниже 30 — отход ───────────────────
{
    const s = createSandbox(freshAppData());
    MORALE_FNS.forEach(fn => s.run(sliceFunction(HTML, fn)));
    MORALE_CONSTS.forEach(n => s.run(sliceConst(HTML, n)));
    s.run(`
        function log() {}
        appData.squads = [
            { name: 'Развед. взвод', tacticalMoraleScaleVersion: 1, fighters: [{ name: 'последний', hp: 2 }], currentMorale: 92 },
            { name: 'Стойкий', tacticalMoraleScaleVersion: 1, fighters: [{ name: 'a', hp: 3 }], currentMorale: 95 }
        ];
        appData.map = { enemySquads: [] };
        globalThis.__pct = tacticalMoralePercent(appData.squads[0]);
        tacticalShiftMoralePercent(appData.squads[0], -15);
        globalThis.__after = tacticalMoralePercent(appData.squads[0]);
        globalThis.__forced = tacticalForceLowMoraleRetreat(appData.squads[0], 'player', 0, 'артобстрел');
        globalThis.__routing = appData.squads[0].isRouting;
        globalThis.__flag = appData.squads[0].tacticalLowMoraleRout;
        globalThis.__calm = tacticalForceLowMoraleRetreat(appData.squads[1], 'player', 1, 'артобстрел');
    `);
    ok(s.evalCtx('__pct') === 92, 'дух в процентах читается верно', String(s.evalCtx('__pct')));
    ok(s.evalCtx('__after') === 77, 'потери роняют дух на 15 пунктов', String(s.evalCtx('__after')));
    ok(s.evalCtx('__forced') === false, 'при духе 77 отряд не отходит');
    ok(s.evalCtx('__calm') === false, 'стойкий отряд с высоким духом остаётся');
    s.run(`
        // 1 живой боец из взвода — тяжёлые потери: дух падает до порога отхода
        tacticalSetMoralePercent(appData.squads[0], 25);
        globalThis.__forced2 = tacticalForceLowMoraleRetreat(appData.squads[0], 'player', 0, 'артобстрел');
        globalThis.__routing2 = appData.squads[0].isRouting;
        globalThis.__reason = appData.squads[0].retreatReason;
    `);
    ok(s.evalCtx('__forced2') === true, 'дух ниже 30 — подразделение отходит');
    ok(s.evalCtx('__routing2') === true && s.evalCtx('__reason') === 'morale', 'флаг отхода по духу выставлен');
    const maybe = sliceFunction(HTML, 'tacticalMaybeAutoRetreat');
    ok(/squad\.tacticalLowMoraleRout/.test(maybe) && /tacticalShouldRetreatOnMorale/.test(maybe),
        'отход держится, пока дух ниже 30 (не снимается сразу)');
}

// ─────────────────── 24. Скоординированное подавление ───────────────────
{
    const s = createSandbox(freshAppData());
    s.run(['TACTICAL_SUPPRESSIVE_COST', 'TACTICAL_COORDINATED_BARRAGE_COST', 'COORDINATED_SUPPRESSION_HEXES',
        'COORDINATED_SUPPRESSION_COST'].map(n => sliceConst(HTML, n)).join('\n'));
    ['tacticalHasCoordinatedBarrage', 'tacticalIsSuppressionSupportSquad', 'tacticalCanUseCoordinatedSuppression',
        'tacticalSuppressiveFireCost', 'tacticalOdLabel'].forEach(fn => s.run(sliceFunction(HTML, fn)));
    s.run('function tacticalSquadHasCard(){ return false; }');
    ok(s.evalCtx('COORDINATED_SUPPRESSION_HEXES') === 2, 'подавляются два гекса');
    ok(s.evalCtx('COORDINATED_SUPPRESSION_COST') === 5, 'стоимость — 2,5 ОД');
    ok(s.evalCtx("tacticalCanUseCoordinatedSuppression({ name: 'Отделение поддержки', effects: { coordinatedBarrage: true } })") === true,
        'отделение поддержки с карточкой может подавлять два гекса');
    ok(s.evalCtx("tacticalCanUseCoordinatedSuppression({ name: 'Пулемётное отделение', effects: { coordinatedBarrage: true } })") === true,
        'пулемётное отделение — тоже');
    ok(s.evalCtx("tacticalCanUseCoordinatedSuppression({ name: 'Пехотное отделение №1', effects: { coordinatedBarrage: true } })") === false,
        'обычная пехота — нет');
    ok(s.evalCtx("tacticalCanUseCoordinatedSuppression({ name: 'Штаб взвода', effects: { coordinatedBarrage: true } })") === false,
        'штаб — нет');
    ok(s.evalCtx("tacticalCanUseCoordinatedSuppression({ name: 'Отделение поддержки' })") === false,
        'без карточки скоординированного подавления нет');
    ok(s.evalCtx("tacticalSuppressiveFireCost({ name: 'Отделение поддержки', effects: { coordinatedBarrage: true } })") === 5,
        'цена не снижается — 2,5 ОД');
    // кнопка и выбор двух гексов
    const render = HTML;
    ok(/Скоординированное подавление \(2 гекса/.test(render), 'кнопка называется «Скоординированное подавление»');
    ok(/onclick="beginCoordinatedSuppression\(\)"/.test(render), 'кнопка запускает выбор двух гексов');
    ok(/pendingCoordinatedSuppression/.test(render), 'выбор гексов ждёт кликов по карте');
    const click = sliceFunction(HTML, 'mapHexClickDuringCoordinatedSuppression');
    ok(/hexes\.length < COORDINATED_SUPPRESSION_HEXES/.test(click), 'первый клик выбирает первый гекс');
    ok(/suppressiveFire\(hexes\)/.test(click), 'после двух кликов подавление выполняется');
    const suppress = sliceFunction(HTML, 'suppressiveFire');
    ok(/function suppressiveFire\(hexKeys\)/.test(suppress), 'подавление принимает список гексов');
    ok(/tacticalSuppressCoordinatedHexes\(coordinatedHexes/.test(suppress), 'скоординированное подавление накрывает оба гекса');
    ok(!/tacticalHasCoordinatedBarrage\(squad\) \? TACTICAL_COORDINATED_BARRAGE_COST/.test(HTML),
        'прежняя скидка 1,5 ОД больше не применяется');
    ok(/два выбранных гекса за 2,5 ОД/.test(fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8')),
        'описание карточки обновлено');
}

// ─────────────────── 24 (функционально): два гекса подавляются ───────────────────
{
    const s = createSandbox(freshAppData());
    s.run(sliceConst(HTML, 'COORDINATED_SUPPRESSION_HEXES'));
    [['tacticalEnemySquadsOnTacticalHex'], ['tacticalSuppressCoordinatedHexes']].forEach(([fn]) => s.run(sliceFunction(HTML, fn)));
    s.run(`
        function log() {}
        function markTacticalSuppressed(sq, side) { sq.suppressed = true; sq.suppressedBySide = side; return true; }
        function tacticalIsDotSquad() { return false; }
        var a = { name: 'Взвод А', fighters: [{ hp: 3 }] };
        var b = { name: 'Взвод Б', fighters: [{ hp: 3 }] };
        var c = { name: 'В другой гекс', fighters: [{ hp: 3 }] };
        appData.map = { grid: { '1,1': { enemySquadIds: [0] }, '2,2': { enemySquadIds: [1] }, '3,3': { enemySquadIds: [2] } },
                        enemySquads: [a, b, c] };
        var result = tacticalSuppressCoordinatedHexes(['1,1', '2,2'], 4, 8);
    `);
    ok(s.evalCtx('result.length') === 2, 'подавлены отряды в обоих выбранных гексах', String(s.evalCtx('result.length')));
    ok(s.evalCtx('a.suppressed === true && b.suppressed === true'),
        'оба отряда получили состояние «подавлен»');
    ok(s.evalCtx('!c.suppressed'), 'отряд вне выбранных гексов не задет');
}

// ─────────────────── 32. Пожар на бронетехнике ───────────────────
{
    for (const [name, value] of [['INCENDIARY_BLIND_CHANCE', '0.30'], ['BURNING_ENGINE_FIRE_CHANCE', '0.25'], ['BURNING_MAX_TURNS', '3']]) {
        ok(new RegExp('const ' + name + ' = ' + value + ';').test(HTML), `${name} = ${value}`);
    }
    const s = createSandbox(freshAppData());
    s.run(sliceConst(HTML, 'INCENDIARY_BLIND_CHANCE'));
    s.run(sliceConst(HTML, 'BURNING_ENGINE_FIRE_CHANCE'));
    s.run(sliceConst(HTML, 'BURNING_MAX_TURNS'));
    ['tacticalVehicleBurning', 'tacticalVehicleBlindedByFire', 'tacticalIgniteVehicle', 'processBurningVehicles']
        .forEach(fn => s.run(sliceFunction(HTML, fn)));
    s.run(`
        function log() {}
        appData.map = { enemySquads: [] };
        var tank = { name: 'Бронеавтомобиль', armor: { front: 15 }, fighters: [{ name: 'Водитель', hp: 3 }, { name: 'Стрелок', hp: 3 }] };
        var truck = { name: 'Грузовик', armor: { front: 5 }, fighters: [{ name: 'Водитель', hp: 3 }] };
        appData.squads = [tank];
        appData.map.enemySquads = [truck];
        globalThis.__ignited = tacticalIgniteVehicle(tank, 'ампуломёт');
        globalThis.__burning = tacticalVehicleBurning(tank);
        Math.random = () => 0.10; // 10 % < 30 % — ослепление; < 25 % — двигатель (со 2-го хода)
        processBurningVehicles();
        globalThis.__blinded = tank.blindedTurns;
        globalThis.__crewAfterBlind = tank.fighters.reduce((a, f) => a + f.hp, 0);
        globalThis.__gone = !!tank.isDestroyed;
        processBurningVehicles();
        globalThis.__gone2 = !!tank.isDestroyed;
        globalThis.__crewAfterEngine = tank.fighters.reduce((a, f) => a + f.hp, 0);
        globalThis.__engineFire = !!tank.engineFire;
    `);
    ok(s.evalCtx('__ignited') === true && s.evalCtx('__burning') === true, 'поджог ставит машину в состояние «горит»');
    ok(s.evalCtx('__blinded') === 1, '30 % — пламя ослепило экипаж на ход', String(s.evalCtx('__blinded')));
    ok(s.evalCtx('__gone') === false, 'в первый ход двигатель ещё не загорелся');
    ok(s.evalCtx('__crewAfterBlind') === 6, 'экипаж не теряет ОЗ от самого горения', String(s.evalCtx('__crewAfterBlind')));
    ok(s.evalCtx('__gone2') === true && s.evalCtx('__engineFire') === true,
        'со второго хода огонь добирается до двигателя — машина выходит из строя');
    ok(s.evalCtx('__crewAfterEngine') < 6, 'урон экипажу приходит только вместе с двигателем',
        String(s.evalCtx('__crewAfterEngine')));
    // без ослепления и без пожара двигателя — машина остаётся в строю после затухания
    const s2 = createSandbox(freshAppData());
    ['INCENDIARY_BLIND_CHANCE', 'BURNING_ENGINE_FIRE_CHANCE', 'BURNING_MAX_TURNS'].forEach(n => s2.run(sliceConst(HTML, n)));
    ['tacticalVehicleBurning', 'tacticalVehicleBlindedByFire', 'tacticalIgniteVehicle', 'processBurningVehicles']
        .forEach(fn => s2.run(sliceFunction(HTML, fn)));
    s2.run(`
        function log() {}
        appData.map = { enemySquads: [] };
        var car = { name: 'Машина', armor: {}, fighters: [{ name: 'Водитель', hp: 3 }] };
        appData.squads = [car]; appData.map.enemySquads = [];
        tacticalIgniteVehicle(car);
        Math.random = () => 0.99; // ни ослепления, ни пожара двигателя
        processBurningVehicles(); processBurningVehicles(); processBurningVehicles();
        globalThis.__extinguished = !car.burning;
        globalThis.__alive = !car.isDestroyed && car.fighters[0].hp === 3;
    `);
    ok(s2.evalCtx('__extinguished') === true, 'через 3 хода пожар затухает сам');
    ok(s2.evalCtx('__alive') === true, 'машина остаётся в строю без урона экипажу');
    // блокировка действий ослеплённой машины
    const allowed = sliceFunction(HTML, 'tacticalActionAllowed');
    ok(/ослеплена пожаром/.test(allowed) && /blindedTurns/.test(allowed),
        'ослеплённая пожаром машина не двигается и не стреляет');
    // поджог доезжает из ампуломёта и бутылкомёта
    const mapActions = fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8');
    ok(/case 'ampulomet':[\s\S]{0,400}tacticalIgniteVehicle\(enemy, 'ампуломёт'\)/.test(mapActions),
        'ампуломёт поджигает технику через tacticalIgniteVehicle');
    ok(/case 'molotovCrew':[\s\S]{0,400}tacticalIgniteVehicle\(enemy, 'бутылкомёт'\)/.test(mapActions),
        'бутылкомёт поджигает технику через tacticalIgniteVehicle');
    ok(/reportAttackOutcome\('molotovCrew'/.test(HTML),
        'бросок бутылки применяет поджог к выбранной машине');
    ok(/processBurningVehicles\(\);/.test(HTML), 'пожар обрабатывается на границе фаз');
}

console.log(`\nИтог v13.153 (артиллерия, подавление, пожар): PASS ${pass} · FAIL ${fail}\n`);
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}
process.exit(fail ? 1 : 0);
