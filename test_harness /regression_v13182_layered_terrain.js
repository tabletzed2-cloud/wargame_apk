// ⚡ v13.182: регрессия многослойной местности Валенсии.
//    Проверяем, что правила движения читают БАЗОВЫЕ типы (без меток),
//    уровень гекса и дорожные рёбра из maps/valencia_roads.json.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sliceFunction: slice } = require('./extract');
const { HTML } = require('./extract');
const sliceFunction = (name) => slice(HTML, name);

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}`); }
}

// ── песочница с подменяемой картой ─────────────────────────────────────────
function makeEnv(grid, roadEdges) {
    const code = [
        sliceFunction('getOpHexBaseTypes'),
        sliceFunction('getOpHexLevel'),
        sliceFunction('opHasRoadData'),
        sliceFunction('opRoadConnected'),
        sliceFunction('getOpMoveCost'),
        'var OP_STEALTH_HILL_COST = 2;'
    ].join('\n');
    const appData = { campaign: { opMapGrid: grid, opRoadEdges: roadEdges } };
    const ctx = {
        appData,
        console: { log() {}, warn() {} },
        getOpHexTypes: (c, r) => {
            const cell = grid[`${c},${r}`];
            if (!cell) return ['grass'];
            return Array.isArray(cell) ? cell.slice() : (cell.types || ['grass']).slice();
        },
        getOpHexTypesRaw: null,
        opVehicleIsImmobile: () => false,
        isHexInPlayableArea: () => true,
        tacticalHexHasSublevel2: () => true
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return ctx;
}

// ── 1. Хелперы уровней и связей ────────────────────────────────────────────
const grid = {
    '0,0': { types: ['grass', 'road'], markers: [], level: 0 },
    '1,0': { types: ['forest', 'road'], markers: ['trimmedForest'], level: 0 }, // метка поверх леса
    '2,0': { types: ['hill'], markers: [], level: 2 },
    '3,0': { types: ['hill'], markers: [], level: 3 },
    '4,0': { types: ['swamp_impassable'], markers: [], level: 0 },
    '5,0': { types: ['water'], markers: [], level: 0 },
    '6,0': ['grass']                                                       // старый формат
};
const edges = [['0,0', '1,0'], ['1,0', '2,0']];
const ctx = makeEnv(grid, edges);

check('метки не попадают в базовые типы', !ctx.getOpHexBaseTypes(1, 0).includes('trimmedForest'));
check('базовые типы сохраняют лес', ctx.getOpHexBaseTypes(1, 0).includes('forest'));
check('уровень читается', ctx.getOpHexLevel(2, 0) === 2 && ctx.getOpHexLevel(3, 0) === 3);
check('уровень вне карты = 0', ctx.getOpHexLevel(9, 9) === 0);
check('рёбра загружены', ctx.opHasRoadData() === true);
check('связь в обе стороны', ctx.opRoadConnected(0, 0, 1, 0) && ctx.opRoadConnected(1, 0, 0, 0));
check('нет связи через два гекса', ctx.opRoadConnected(0, 0, 2, 0) === false);
check('старый формат (массив) — уровень 0', ctx.getOpHexLevel(6, 0) === 0);

// ── 2. Дорога по связи, а не по типу ───────────────────────────────────────
const tracked = { name: 'Танк', type: 'tank_platoon', mobility: 'vehicle', maxAp: 4 };
// 1,0 — лес с меткой; вне дороги колёсная/гусеничная в лес не входит,
// но по связи из 0,0 это дорога.
check('гусеничная по дороге в лесной гекс — 1', ctx.getOpMoveCost(tracked, 0, 0, 1, 0) === 1);
const noRoadGrid = { '0,0': { types: ['grass'], markers: [], level: 0 }, '1,0': { types: ['forest'], markers: [], level: 0 } };
const noRoadCtx = makeEnv(noRoadGrid, null);
check('без рёбер лес непроходим для гусеничной', noRoadCtx.getOpMoveCost(tracked, 0, 0, 1, 0) === 2);
check('без рёбер лес непроходим для колёсной',
    noRoadCtx.getOpMoveCost({ name: 'БТР', type: 'btr_platoon', mobility: 'vehicle' }, 0, 0, 1, 0) === Infinity);
// рёбра есть, но между этой парой гексов связи нет → лес снова закрыт
const partRoadGrid = { '0,0': { types: ['grass'], markers: [], level: 0 }, '1,0': { types: ['forest'], markers: [], level: 0 } };
const partCtx = makeEnv(partRoadGrid, [['7,7', '8,7']]);
check('чужая дорога не делает лес проезжим',
    partCtx.getOpMoveCost({ name: 'БТР', type: 'btr_platoon', mobility: 'vehicle' }, 0, 0, 1, 0) === Infinity);

// ── 3. Высоты технике вне дороги ───────────────────────────────────────────
check('танк без талрепа не входит на уровень 2', ctx.getOpMoveCost(tracked, 1, 0, 2, 0) === 1); // по дороге
const hillGrid = { '0,0': { types: ['grass'], markers: [], level: 0 }, '1,0': { types: ['hill'], markers: [], level: 2 } };
const hillCtx = makeEnv(hillGrid, []);
check('танк вне дороги не входит на уровень 2', hillCtx.getOpMoveCost(tracked, 0, 0, 1, 0) === Infinity);
check('пехота входит на уровень 2 (3 ОД)', hillCtx.getOpMoveCost({ name: 'Пехота', mobility: 'foot', maxAp: 4 }, 0, 0, 1, 0) === 3);

// ── 4. Талреп только на уровень 1 ──────────────────────────────────────────
const winchGrid = {
    '0,0': { types: ['grass'], markers: [], level: 0 },
    '1,0': { types: ['hill'], markers: [], level: 1 },
    '2,0': { types: ['hill'], markers: [], level: 2 }
};
const winchCtx = makeEnv(winchGrid, []);
const winchTank = { name: 'Танк', type: 'tank_platoon', mobility: 'vehicle', maxAp: 4, winch: true };
check('талреп: уровень 1 доступен', Number.isFinite(winchCtx.getOpMoveCost(winchTank, 0, 0, 1, 0)));
check('талреп: цена = весь ход', winchCtx.getOpMoveCost(winchTank, 0, 0, 1, 0) === 4);
check('талреп: уровень 2 закрыт', winchCtx.getOpMoveCost(winchTank, 0, 0, 2, 0) === Infinity);

// ── 5. Вода и болота ───────────────────────────────────────────────────────
check('вода: пехота не проходит', ctx.getOpMoveCost({ name: 'Пехота', mobility: 'foot' }, 0, 0, 5, 0) === Infinity);
check('непроходимое болото: пехота не проходит', ctx.getOpMoveCost({ name: 'Пехота', mobility: 'foot' }, 0, 0, 4, 0) === Infinity);
check('амфибия плавает по воде (4)', ctx.getOpMoveCost({ name: 'DAF', mobility: 'amphibious' }, 0, 0, 5, 0) === 4);

// ── 6. Снабжение читает те же слои ─────────────────────────────────────────
const supplyCode = [
    sliceFunction('supplyMoveCost'),
    sliceFunction('supplyDeliveryMobilityClasses'),
    sliceFunction('supplyDeliveryMoveCost'),
    'var SUPPLY_ASSET_TYPES = { daf: { mobility: "amphibious" }, foot: { mobility: "foot" } };',
    'function supplyAssetMobilityClass(id) { return SUPPLY_ASSET_TYPES[id].mobility; }'
].join('\n');
const supCtx = {
    appData: { campaign: { opMapGrid: grid, opRoadEdges: edges, scenario: 'valencia' } },
    console: { log() {}, warn() {} },
    isHexInPlayableArea: () => true,
    getOpHexTypes: (c, r) => {
        const cell = grid[`${c},${r}`];
        return Array.isArray(cell) ? cell.slice() : (cell.types || ['grass']).slice();
    }
};
vm.createContext(supCtx);
vm.runInContext(ctx.getOpHexBaseTypes.toString() + '\n' +
    ctx.getOpHexLevel.toString() + '\n' +
    ctx.opHasRoadData.toString() + '\n' +
    ctx.opRoadConnected.toString() + '\n' + supplyCode, supCtx);

check('снабжение: дорога по связи в лес — 1', supCtx.supplyMoveCost('vehicle', 1, 0, 0, 0) === 1);
check('снабжение: лес вне дороги — Infinity', supCtx.supplyMoveCost('vehicle', 1, 0, 0, 1) === Infinity);
check('снабжение: пешие по траве — 2', supCtx.supplyMoveCost('foot', 0, 0, 0, 0, 0, 0) === 2);
check('снабжение: вода — Infinity для машины', supCtx.supplyMoveCost('vehicle', 5, 0) === Infinity);
check('снабжение: амфибия в воде — 4', supCtx.supplyMoveCost('amphibious', 5, 0) === 4);
check('снабжение: колонна из амфибии — 4', supCtx.supplyDeliveryMoveCost({ assets: [{ id: 'daf', count: 1 }] }, 5, 0) === 4);
check('снабжение: смешанная колонна — минимум', supCtx.supplyDeliveryMoveCost(
    { assets: [{ id: 'foot', count: 1 }, { id: 'daf', count: 1 }] }, 5, 0) === 4);

// ── 7. Реальные данные Валенсии ────────────────────────────────────────────
const terrain = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'valencia_terrain.json'), 'utf8'));
const roadsFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'valencia_roads.json'), 'utf8'));
const roads = Array.isArray(roadsFile) ? roadsFile : roadsFile.edges;
check('Валенсия: 280 гексов', Object.keys(terrain).length === 280);
check('Валенсия: 175 объектных гексов с уровнем/маркерами', Object.values(terrain).filter(c => !Array.isArray(c)).length === 175);
check('Валенсия: 27 рёбер', roads.length === 27);
const levels = {};
Object.values(terrain).filter(c => !Array.isArray(c))
    .forEach(cell => { const l = cell.level || 0; levels[l] = (levels[l] || 0) + 1; });
check('Валенсия: уровни среди объектных гексов 0/1/2/3 = 143/19/9/4',
    levels[0] === 143 && levels[1] === 19 && levels[2] === 9 && levels[3] === 4);
const realCtx = makeEnv(terrain, roads);
check('Валенсия: рёбра читаются', realCtx.opHasRoadData() === true);
check('Валенсия: первое ребро связано', realCtx.opRoadConnected(
    ...roads[0][0].split(',').map(Number), ...roads[0][1].split(',').map(Number)));

console.log(`\nИтог v13.182 (многослойная местность: типы, уровни, дорожные рёбра, снабжение): ` +
    `${fail === 0 ? 'PASS' : 'FAIL'} ${pass} · FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
