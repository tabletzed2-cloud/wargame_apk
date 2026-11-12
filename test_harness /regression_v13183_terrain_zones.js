// ⚡ v13.183: регрессия ЗОН местности Валенсии.
//    Слои — не «метки на гексах»: зоны в координатах картинки применяются к
//    переходу (середина ребра) с допуском. Дорога — по связям и без штрафов.
//    На карте кампании слои не рисуются.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { HTML, sliceFunction: slice } = require('./extract');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}`); }
}
const sliceFunction = (name) => slice(HTML, name);

// ── песочница: те же хелперы, что в игре ──────────────────────────────────
function makeEnv(grid, layers, roadEdges, transform) {
    const code = [
        sliceFunction('opHexSourcePoint'),
        sliceFunction('opLayersReady'),
        sliceFunction('opPointInPolygon'),
        sliceFunction('opZoneCovers'),
        sliceFunction('opZoneLevelAt'),
        sliceFunction('getOpHexBaseTypes'),
        sliceFunction('getOpHexLevel'),
        sliceFunction('opHasRoadData'),
        sliceFunction('opRoadConnected'),
        sliceFunction('getOpMoveCost'),
        'var OP_STEALTH_HILL_COST = 2;'
    ].join('\n');
    const ctx = {
        appData: {
            campaign: {
                opMapGrid: grid,
                opLayers: layers,
                opRoadEdges: roadEdges,
                opMapScaleX: 0.61, opMapScaleY: 0.62,
                opMapOffsetX: -380, opMapOffsetY: -45
            }
        },
        OP_HEX_SIZE: 55, OP_MAP_COLS: 20, OP_MAP_ROWS: 15,
        console: { log() {}, warn() {} },
        getOpHexTypes: (c, r) => {
            const cell = grid[`${c},${r}`];
            if (!cell) return ['grass'];
            return Array.isArray(cell) ? cell.slice() : (cell.types || ['grass']).slice();
        },
        opVehicleIsImmobile: () => false,
        isHexInPlayableArea: () => true,
        tacticalHexHasSublevel2: () => true
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return ctx;
}

const TRANSFORM = { hexSize: 55, columns: 20, rows: 15, scaleX: 0.61, scaleY: 0.62,
    offsetX: -380, offsetY: -45 };
const LAYERS = {
    imageSize: [1184, 1170],
    gameTransform: TRANSFORM,
    transferTolerancePixels: 10,
    layers: { height1: [], height2: [], height3: [], forest: [], bushes: [],
        swamp_passable: [], swamp_impassable: [], water: [] }
};

// ── 1. Зона в координатах картинки: перекрывает только часть карты ─────────
const realLayers = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'valencia_layers.json'), 'utf8'));
const realTerrain = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'valencia_terrain.json'), 'utf8'));
const realRoads = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'valencia_roads.json'), 'utf8'));
const realEdges = Array.isArray(realRoads) ? realRoads : realRoads.edges;
const realCtx = makeEnv(realTerrain, realLayers, realEdges);

check('зоны загружены (8 групп)', realCtx.opLayersReady() === true);
check('49 полигонов в файле зон',
    Object.values(realLayers.layers).reduce((n, l) => n + l.length, 0) === 49);
check('зоны не пишутся в гексы (нет level/типов растительности)',
    Object.values(realTerrain).every(c => !Array.isArray(c) && c.level === undefined &&
        !(c.types || []).some(t => ['forest', 'bushes', 'water', 'swamp_impassable', 'swamp_passable', 'hill'].includes(t))));

// разные переходы одного и того же гекса дают разный результат — это зона, а не метка
let mixed = 0, mixedExample = null;
for (let row = 0; row < 14 && mixed < 3; row++) {
    for (let col = 0; col < 19 && mixed < 3; col++) {
        const center = realCtx.getOpHexLevel(col, row);
        const fromWest = realCtx.getOpHexLevel(col, row, col + 1, row);
        const fromSouth = realCtx.getOpHexLevel(col, row, col, row + 1);
        if (center !== fromWest || center !== fromSouth) {
            mixed++; mixedExample = { col, row, center, fromWest, fromSouth };
        }
    }
}
check('граница зоны ломаная, а не по гексам: ' + JSON.stringify(mixedExample), mixed > 0);

// уровни по центрам гексов совпадают с контрольным набора 143/19/9/4
const byLevel = { 0: 0, 1: 0, 2: 0, 3: 0 };
Object.keys(realTerrain).forEach(k => {
    const [c, r] = k.split(',').map(Number);
    byLevel[realCtx.getOpHexLevel(c, r)]++;
});
check('уровни по центрам 248/19/9/4 = ' + JSON.stringify(byLevel),
    byLevel[0] === 248 && byLevel[1] === 19 && byLevel[2] === 9 && byLevel[3] === 4);

// вода/болото/лес тоже из зон
const typeCounts = {};
Object.keys(realTerrain).forEach(k => {
    const [c, r] = k.split(',').map(Number);
    realCtx.getOpHexBaseTypes(c, r).forEach(t => { typeCounts[t] = (typeCounts[t] || 0) + 1; });
});
check('лес из зон есть: ' + (typeCounts.forest || 0), (typeCounts.forest || 0) > 10);
check('вода из зон есть: ' + (typeCounts.water || 0), (typeCounts.water || 0) > 5);
check('непроходимое болото из зон есть: ' + (typeCounts.swamp_impassable || 0),
    (typeCounts.swamp_impassable || 0) > 3);

// ── 2. Дорога: по связи и БЕЗ штрафов ─────────────────────────────────────
const edge = realEdges[0];
const [c1, r1] = String(edge[0]).split(',').map(Number);
const [c2, r2] = String(edge[1]).split(',').map(Number);
const foot = { name: 'Пехота', mobility: 'foot', maxAp: 4 };
const tank = { name: 'Танк', type: 'tank_platoon', mobility: 'vehicle', maxAp: 4 };
const track = { name: 'БТР', type: 'btr_platoon', mobility: 'vehicle', maxAp: 4 };
const moto = { name: 'Мотоцикл', mobility: 'motorcycle', maxAp: 4 };
check('дорога: пехота 1 ОД', realCtx.getOpMoveCost(foot, c1, r1, c2, r2) === 1);
check('дорога: танк 1 ОД', realCtx.getOpMoveCost(tank, c1, r1, c2, r2) === 1);
check('дорога: колёсная 1 ОД', realCtx.getOpMoveCost(track, c1, r1, c2, r2) === 1);
check('дорога: мотоцикл 1 ОД', realCtx.getOpMoveCost(moto, c1, r1, c2, r2) === 1);
check('дорога в обратную сторону тоже 1 ОД', realCtx.getOpMoveCost(foot, c2, r2, c1, r1) === 1);

// ── 3. Искусственные зоны: точная геометрия ───────────────────────────────
//    Полигон в координатах картинки накрывает только восточную часть карты —
//    проверяем, что правило срабатывает именно там и не срабатывает рядом.
function square(x0, y0, x1, y1) {
    return [{ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }];
}
const grid = {};
for (let row = 0; row < 15; row++) for (let col = 0; col < 20; col++) grid[`${col},${row}`] = ['grass'];
const zoneCtx = makeEnv(grid, {
    imageSize: [1184, 1170], gameTransform: TRANSFORM, transferTolerancePixels: 10,
    layers: Object.assign({}, LAYERS.layers, { height1: square(0, 0, 1184, 1170) })
}, [], TRANSFORM);
check('зона на всю карту: уровень 1 в центре', zoneCtx.getOpHexLevel(10, 7) === 1);
check('зона на всю карту: пехота 3 ОД на высоту', zoneCtx.getOpMoveCost(foot, 9, 7, 10, 7) === 3);
check('зона на всю карту: танк без талрепа не едет', zoneCtx.getOpMoveCost(tank, 9, 7, 10, 7) === Infinity);

const noZone = makeEnv(grid, {
    imageSize: [1184, 1170], gameTransform: TRANSFORM, transferTolerancePixels: 10,
    layers: LAYERS.layers
}, [], TRANSFORM);
check('без зон уровень 0 и трава', noZone.getOpHexLevel(10, 7) === 0 && noZone.getOpMoveCost(foot, 9, 7, 10, 7) === 2);
check('без зон танк едет по траве', noZone.getOpMoveCost(tank, 9, 7, 10, 7) === 1.3);

// вода в маленьком квадрате: только внутри
const waterGrid = {};
for (let row = 0; row < 15; row++) for (let col = 0; col < 20; col++) waterGrid[`${col},${row}`] = ['grass'];
const pt = noZone.opHexSourcePoint(10, 7);
const waterCtx = makeEnv(waterGrid, {
    imageSize: [1184, 1170], gameTransform: TRANSFORM, transferTolerancePixels: 4,
    layers: Object.assign({}, LAYERS.layers, {
        water: square(pt.x - 30, pt.y - 30, pt.x + 30, pt.y + 30)
    })
}, [], TRANSFORM);
check('вода в зоне: пехота не проходит', waterCtx.getOpMoveCost(foot, 9, 7, 10, 7) === Infinity);
check('вода в зоне: амфибия плавает (4)', waterCtx.getOpMoveCost({ name: 'DAF', mobility: 'amphibious' }, 9, 7, 10, 7) === 4);
check('вода в зоне: танк не проходит', waterCtx.getOpMoveCost(tank, 9, 7, 10, 7) === Infinity);

// ── 4. На карте кампании слои не рисуются ─────────────────────────────────
check('в отрисовке карты нет слоёв местности',
    !/levelFill|▲\$\{lvl\}|#ff54cb/.test(HTML));
check('нет надписи ▲N для уровней кампании',
    !HTML.includes('`▲${lvl}`'));

// ── 5. Реальные дороги: все переходы стоят 1 ОД ───────────────────────────
let roadBad = 0;
realEdges.forEach(e => {
    const [a, b] = e.map(s => String(s).split(',').map(Number));
    if (realCtx.getOpMoveCost(foot, a[0], a[1], b[0], b[1]) !== 1) roadBad++;
    if (realCtx.getOpMoveCost(tank, a[0], a[1], b[0], b[1]) !== 1) roadBad++;
});
check('все 27 рёбер: по 1 ОД для пехоты и танка', realEdges.length === 27 && roadBad === 0);

console.log(`\nИтог v13.183 (зоны местности: контуры, дорога без штрафов, без графики): ` +
    `${fail === 0 ? 'PASS' : 'FAIL'} ${pass} · FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
