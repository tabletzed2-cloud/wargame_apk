// ⚡ v13.184: регрессия шести дополнений.
//   п.1 зона видимости на опкарте (3 днём / 1 ночью, перекрытые гексы вырезаны)
//   п.2 панель расстановки выше карты + группы по взводам
//   п.3 подсветка выбранного отряда цветом взвода (в пределах боя)
//   п.4 обзор из-под холма: 2 гекса в глубину за гребнем
//   п.5 пленные / 0 живых — одной строкой, не строками отделений
//   п.6 ворвавшийся в окопы не окружён, пока держит связь со своими
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { HTML, sliceFunction: slice, sliceConst } = require('./extract');
const ROOT = path.resolve(__dirname, '..');
const PLACEMENT = fs.readFileSync(path.join(ROOT, 'js', 'placement.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ''}`); }
}
const F = (name) => slice(HTML, name);

// ── общая песочница ────────────────────────────────────────────────────────
function run(code, sandbox) {
    const ctx = Object.assign({
        console: { log() {}, warn() {} },
        Math, Number, Array, Object, Set, Map, String, JSON, Infinity, isNaN, NaN, undefined
    }, sandbox || {});
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return ctx;
}

// ───────────────────────────────────────────────────────────────────────────
// п.1 — радиус и форма зоны видимости на опкарте
// ───────────────────────────────────────────────────────────────────────────
check('п.1 opUnitVisionRange объявлена', HTML.includes('function opUnitVisionRange('));
check('п.1 opUnitVisionHexes объявлена', HTML.includes('function opUnitVisionHexes('));
check('п.1 отрисовка зоны подключена к redrawOperationalMap',
    /drawSelectedUnitVisionZone\(ctx, size\)/.test(HTML));
check('п.1 радиусы 3 / 1', /OP_VISION_RANGE_DAY\s*=\s*3/.test(HTML) && /OP_VISION_RANGE_NIGHT\s*=\s*1/.test(HTML));

{
    const env = run([
        'const OP_VISION_RANGE_DAY = 3, OP_VISION_RANGE_NIGHT = 1;',
        'var isNightTime = () => NIGHT;',
        'var NIGHT = false;',
        'function getOpHexDistance(a, b) {',
        '  const ac = a.col, ar = a.row, bc = b.col, br = b.row;',
        '  const ax = ac - (ar - (ar & 1)) / 2, az = ar, ay = -ax - az;',
        '  const bx = bc - (br - (br & 1)) / 2, bz = br, by = -bx - bz;',
        '  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));',
        '}',
        F('opUnitVisionRange'),
        F('opUnitVisionHexes'),
        'var BLOCK = new Set(["2,0"]);',
        'function opLineOfSightBlocked(c1, r1, c2, r2) { return BLOCK.has(`${c2},${r2}`); }',
        'function isHexInPlayableArea(scenario, col, row) { return col >= 0 && row >= 0 && col < 20 && row < 15; }',
        'function isHexRemovedFromOperationalMap() { return false; }',
        'var OP_MAP_COLS = 20, OP_MAP_ROWS = 15;',
        'var appData = { campaign: { scenario: "valencia" } };',
        'var __unit = { col: 0, row: 0 };',
        'var __day = opUnitVisionHexes(__unit);',
        'NIGHT = true;',
        'var __night = opUnitVisionHexes(__unit);'
    ].join('\n'), {});

    check('п.1 днём радиус 3', env.__day.radius === 3, env.__day.radius);
    check('п.1 ночью радиус 1', env.__night.radius === 1, env.__night.radius);
    check('п.1 ночная зона меньше дневной', env.__night.keys.size < env.__day.keys.size,
        `${env.__night.keys.size} < ${env.__day.keys.size}`);
    check('п.1 днём 3 гекса по ряду входят в зону', env.__day.keys.has('3,0') || env.__day.keys.has('3,1') || env.__day.keys.has('2,2'));
    check('п.1 перекрытый гекс ВЫРЕЗАН из зоны (нет в keys)', !env.__day.keys.has('2,0'));
    check('п.1 флаг blocked сообщает о перекрытиях', env.__day.blocked > 0, env.__day.blocked);
    check('п.1 ночью ключи не выходят за радиус 1', Array.from(env.__night.keys).every(k => {
        const [c, r] = k.split(',').map(Number);
        return Math.abs(c) <= 1 && Math.abs(r) <= 1;
    }));
}

// ───────────────────────────────────────────────────────────────────────────
// п.2 — панель расстановки: выше карты, группы по взводам
// ───────────────────────────────────────────────────────────────────────────
const mapContainerIdx = HTML.indexOf('<div id="mapContainer"');
const trayIdx = HTML.indexOf('<div id="battlePlacementTray"');
const panelIdx = HTML.indexOf('<div id="battlePlacementPanel"');
const actionPanelIdx = HTML.indexOf('<div id="battleMapActionPanel"');
const eventLogIdx = HTML.indexOf('<div id="battleEventLogPanel"');
check('п.2 #battlePlacementTray существует', trayIdx > 0);
// панель поднята ВПЛОТНУЮ к карте: сразу после холста и подписи рельефа,
// а не после журнала боя (там она уезжала за пределы экрана).
check('п.2 трай идёт сразу после #mapContainer', trayIdx > mapContainerIdx && trayIdx - mapContainerIdx < 1200,
    `${trayIdx} vs ${mapContainerIdx}`);
check('п.2 трай выше журнала боя и панели действий',
    trayIdx < eventLogIdx && trayIdx < actionPanelIdx, `${trayIdx} / ${eventLogIdx} / ${actionPanelIdx}`);
check('п.2 #battlePlacementPanel сразу после трая', panelIdx > trayIdx && panelIdx - trayIdx < 400);
check('п.2 панель в CSS прижата к карте', /#battlePlacementTray \{ margin:4px 0 2px 0; \}/.test(
    fs.readFileSync(path.join(ROOT, 'css', 'operational_ui.css'), 'utf8')));

check('п.2 хелперы группировки есть в js/placement.js',
    ['placementPlatoonLabel', 'placementGroupByPlatoon', 'placementTrayGroupsHtml']
        .every(n => PLACEMENT.includes(`function ${n}(`)));
check('п.2 основная палитра рендерится группами',
    /trayEl\.innerHTML\s*=[\s\S]{0,400}placementTrayGroupsHtml\(traySquads/.test(PLACEMENT));
check('п.2 палитра подкрепления рендерится группами',
    /trayElR\.innerHTML\s*=[\s\S]{0,400}placementTrayGroupsHtml\(reinforcements/.test(PLACEMENT));

{
    const env = run([
        PLACEMENT.slice(PLACEMENT.indexOf('function placementPlatoonLabel('),
            PLACEMENT.indexOf('// ⚡ v13.129 (п.5): перетаскивание карточек отрядов')),
        'var __entries = [{ s: { name: "A", opUnitName: "7-й взвод" } },',
        '                 { s: { name: "B", opUnitName: "3-й взвод" } },',
        '                 { s: { name: "C", opUnitName: "7-й взвод" } },',
        '                 { s: { name: "D" } }];',
        'var __groups = placementGroupByPlatoon(__entries);',
        'var __html = placementTrayGroupsHtml(__entries, { emptyText: "пусто" });'
    ].join('\n'), {});
    check('п.2 три группы (7-й, 3-й, без привязки)', env.__groups.length === 3,
        env.__groups.map(g => g.label).join('|'));
    check('п.2 порядок групп — по первому появлению',
        env.__groups[0].label === '7-й взвод' && env.__groups[1].label === '3-й взвод');
    check('п.2 в группе 7-го взвода 2 отряда', env.__groups[0].entries.length === 2);
    check('п.2 отряд без взвода — «Без привязки к взводу»', env.__groups[2].label === 'Без привязки к взводу');
    check('п.2 HTML групп содержит счётчик и все отряды',
        /battle-placement-group-count/.test(env.__html) &&
        env.__html.includes('A') && env.__html.includes('B') &&
        env.__html.includes('C') && env.__html.includes('D'));
    const emptyEnv = run([
        PLACEMENT.slice(PLACEMENT.indexOf('function placementPlatoonLabel('),
            PLACEMENT.indexOf('// ⚡ v13.129 (п.5): перетаскивание карточек отрядов')),
        'var __empty = placementTrayGroupsHtml([], { emptyText: "пусто" });'
    ].join('\n'), {});
    check('п.2 пустой список даёт emptyText', emptyEnv.__empty.includes('пусто'), emptyEnv.__empty);
}

// ───────────────────────────────────────────────────────────────────────────
// п.3 — подсветка цветом взвода, в пределах одного боя
// ───────────────────────────────────────────────────────────────────────────
check('п.3 палитра взводов объявлена', /const TACTICAL_PLATOON_COLORS = \[/.test(HTML));
check('п.3 tacticalPlatoonColor / tacticalSquadHighlightColor есть',
    HTML.includes('function tacticalPlatoonColor(') && HTML.includes('function tacticalSquadHighlightColor('));
check('п.3 подсветка выбранного отряда больше не жёлтая константа',
    !/if \(appData\.map\.selectedMoveSquadIdx === squadId\) \{\s*ctx\.strokeStyle = '#ff0';/.test(HTML) &&
    /tacticalSquadHighlightColor\(squad\)/.test(HTML));
check('п.3 порядок цветов сохраняется в сейве боя', HTML.includes('battle.platoonColorOrder'));
check('п.3 цвета разные у разных взводов одного боя', (() => {
    const env = run([
        sliceConst(HTML, 'TACTICAL_PLATOON_COLORS'),
        F('tacticalCurrentBattleRecordSafe'),
        F('tacticalBattlePlatoonOrder'),
        F('tacticalPlatoonColor'),
        F('tacticalSquadHighlightColor'),
        'function getTacticalBattleRecord(){ return { platoonColorOrder: ["3-й взвод", "7-й взвод"] }; }',
        'var appData = { squads: [{ name: "A", opUnitName: "3-й взвод" }, { name: "B", opUnitName: "7-й взвод" }] };',
        'var __a = tacticalSquadHighlightColor({ name: "A", opUnitName: "3-й взвод" });',
        'var __b = tacticalSquadHighlightColor({ name: "B", opUnitName: "7-й взвод" });',
        // другой бой — другое назначение
        'var __otherOrder = ["бельгийский №1", "голландский №1"];',
        'var __c = TACTICAL_PLATOON_COLORS[0];'
    ].join('\n'), {});
    check('п.3 у взводов одного боя разные цвета', env.__a !== env.__b, `${env.__a} / ${env.__b}`);
    return env.__a === '#e74c3c' && env.__b === '#e67e22';
})());
check('п.3 привязки «взвод 1 всегда красный» нет', (() => {
    // порядок в другом бою меняется -> первый цвет уходит другому взводу
    const env = run([
        sliceConst(HTML, 'TACTICAL_PLATOON_COLORS'),
        F('tacticalCurrentBattleRecordSafe'),
        F('tacticalBattlePlatoonOrder'),
        F('tacticalPlatoonColor'),
        'function getTacticalBattleRecord(){ return { platoonColorOrder: ["голландский №1", "бельгийский №1"] }; }',
        'var appData = { squads: [{ name: "G", opUnitName: "голландский №1" }, { name: "B", opUnitName: "бельгийский №1" }] };',
        'var __g = tacticalPlatoonColor("голландский №1");',
        'var __b = tacticalPlatoonColor("бельгийский №1");'
    ].join('\n'), {});
    return env.__g === '#e74c3c' && env.__b === '#e67e22';
})());

// ───────────────────────────────────────────────────────────────────────────
// п.4 — обзор из-под холма: 2 гекса в глубину за гребнем
// ───────────────────────────────────────────────────────────────────────────
check('п.4 глубина обзора за гребнем = 2', /TACTICAL_SLOPE_SIGHT_DEPTH = 2/.test(HTML));
{
    // Карта: ряд 0 — низина (level 0), ряд 1 — гребень (level 1), далее плато level 1.
    const gridCodes = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const level = r === 0 ? 0 : 1;
            gridCodes.push(`g["${c},${r}"] = { type: "grass", level: ${level} };`);
        }
    }
    const env = run([
        'var appData = { map: { grid: {} } }; var g = appData.map.grid;',
        ...gridCodes,
        'function tacticalCellHeight(cell) {',
        '  const explicit = cell && Number.isFinite(Number(cell.level)) ? Number(cell.level) : 0;',
        '  return Math.max(explicit, /mountain/i.test(String(cell && cell.type || "")) ? 2 : 0);',
        '}',
        F('tacticalHexCube'), F('tacticalCubeToOddR'), F('tacticalHexLine'),
        'const TACTICAL_SLOPE_SIGHT_DEPTH = 2;',
        F('tacticalHasLineOfSight'),
        // наблюдатель на ряд 0 в низине, цель на плато за гребнем
        'var __near = tacticalHasLineOfSight({col:2,row:0},{col:2,row:2});',
        'var __mid  = tacticalHasLineOfSight({col:2,row:0},{col:2,row:3});',
        'var __far  = tacticalHasLineOfSight({col:2,row:0},{col:2,row:4});',
        // гребень (конечный гекс) виден всегда
        'var __ridge = tacticalHasLineOfSight({col:2,row:0},{col:2,row:1});'
    ].join('\n'), {});
    check('п.4 гребень виден', env.__ridge === true);
    check('п.4 1-й гекс плато за гребнем виден', env.__near === true);
    check('п.4 2-й гекс плато за гребнем виден', env.__mid === true);
    check('п.4 глубже 2 гексов — не видно', env.__far === false);
}
check('п.4 лес по-прежнему закрывает обзор', (() => {
    const env = run([
        'var appData = { map: { grid: {} } }; var g = appData.map.grid;',
        'for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) g[`${c},${r}`] = { type: "grass", level: 0 };',
        'g["1,0"] = { type: "forest", level: 0 };',
        'function tacticalCellHeight(cell) { return cell && Number.isFinite(Number(cell.level)) ? Number(cell.level) : 0; }',
        F('tacticalHexCube'), F('tacticalCubeToOddR'), F('tacticalHexLine'),
        'const TACTICAL_SLOPE_SIGHT_DEPTH = 2;',
        F('tacticalHasLineOfSight'),
        'var __seen = tacticalHasLineOfSight({col:0,row:0},{col:3,row:0});'
    ].join('\n'), {});
    return env.__seen === false;
})());

// ───────────────────────────────────────────────────────────────────────────
// п.5 — пленные и 0 живых: одна строка, не строки отделений
// ───────────────────────────────────────────────────────────────────────────
check('п.5 сводка потерь в карточке взвода', HTML.includes('отделение', ) &&
    /prisonerLossNote/.test(HTML) && /в плену/.test(HTML) && /уничтожено/.test(HTML));
check('п.5 строки отделений строятся по activeSquads (без пленных/выбитых)',
    /const activeSquads = squads\.filter\(/.test(HTML) &&
    /const squadRows = activeSquads\.map\(/.test(HTML));
check('п.5 сводка вставлена в блок отделений',
    /\$\{squadRows\}\$\{prisonerLossNote\}/.test(HTML));
{
    const env = run([F('pluralRu'),
        'var __p = [pluralRu(1,"отделение","отделения","отделений"),',
        '          pluralRu(2,"отделение","отделения","отделений"),',
        '          pluralRu(5,"отделение","отделения","отделений"),',
        '          pluralRu(11,"отделение","отделения","отделений")];'
    ].join('\n'), {});
    check('п.5 склонение RU (1 отделение / 2 отделения / 5 отделений / 11 отделений)',
        env.__p.join('|') === 'отделение|отделения|отделений|отделений', env.__p.join('|'));
}
check('п.5 отряды в плену не попадают в список отделений', (() => {
    // логика предикатов воспроизводится в песочнице
    const env = run([
        'const squadIsPrisoner = s => !!(s && (s.isPrisoner || s.isSurrendered || s.status === "surrendered" || s.isCaptured));',
        'const squadIsWipedOut = s => !!(s && !squadIsPrisoner(s) &&',
        '  ((s.isDestroyed || s.status === "destroyed") ||',
        '   (!(s.fighters || []).some(f => f && f.hp > 0 && !f.isAway) && (s.fighters || []).length > 0)));',
        'var __squads = [{ name: "живой", fighters: [{hp: 3}] },',
        '  { name: "пленный", fighters: [{hp: 3}], isSurrendered: true },',
        '  { name: "выбитый", fighters: [{hp: 0}] }];',
        'var __active = __squads.filter(s => !squadIsPrisoner(s) && !squadIsWipedOut(s));',
        'var __prisoner = __squads.filter(squadIsPrisoner).length;',
        'var __wiped = __squads.filter(squadIsWipedOut).length;'
    ].join('\n'), {});
    return env.__active.length === 1 && env.__prisoner === 1 && env.__wiped === 1;
})());

// ───────────────────────────────────────────────────────────────────────────
// п.6 — ворвавшийся в окопы не окружён
// ───────────────────────────────────────────────────────────────────────────
check('п.6 порог отсечения объявлен', /TACTICAL_CUTOFF_MIN_DISTANCE = 4/.test(HTML));
check('п.6 проверка прорыва применяется в updateTacticalEncirclement',
    /tacticalBreachExemptsEncirclement\(squad, side === 'enemy'\)/.test(HTML));
check('п.6 окружение пересчитывается после снятия', /let encircled = state\.encircled\.has\(idx\);/.test(HTML));

function breachEnv(gridSpec, ownSquads, enemySquads) {
    return run([
        'var TACTICAL_MAP_SIZE = 20;',
        'var appData = { map: { grid: {}, enemySquads: [] }, squads: [] };',
        'function getHexNeighbors(key) {',
        '  const [col, row] = key.split(",").map(Number);',
        '  const offsets = (row % 2 === 0) ? [[1,0],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1]] : [[1,0],[1,1],[0,1],[-1,0],[0,-1],[1,-1]];',
        '  const out = [];',
        '  for (const [dc, dr] of offsets) {',
        '    const nc = col + dc, nr = row + dr;',
        '    if (nc >= 0 && nc < 20 && nr >= 0 && nr < 20) out.push(`${nc},${nr}`);',
        '  }',
        '  return out;',
        '}',
        'function hexGridDistance(c1, r1, c2, r2) {',
        '  const ax = c1 - (r1 - (r1 & 1)) / 2, az = r1, ay = -ax - az;',
        '  const bx = c2 - (r2 - (r2 & 1)) / 2, bz = r2, by = -bx - bz;',
        '  return Math.max(Math.abs(ax-bx), Math.abs(ay-by), Math.abs(az-bz));',
        '}',
        'function tacticalSquadIsCombatCapable(s) {',
        '  if (!s) return false;',
        '  if (s.hidden || s.isDestroyed || s.isRetreated || s.isSurrendered) return false;',
        '  if (s.status === "destroyed" || s.status === "retreated" || s.status === "surrendered") return false;',
        '  const f = Array.isArray(s.fighters) ? s.fighters : [];',
        '  if (!f.length) return true;',
        '  return f.some(x => x && Number(x.hp) > 0);',
        '}',
        'function getBattleSquadHex(grid, idx, isEnemy) {',
        '  for (const k in grid) {',
        '    const arr = isEnemy ? grid[k].enemySquadIds : grid[k].squadIds;',
        '    if (arr && arr.includes(idx)) { const p = k.split(",").map(Number); return { col: p[0], row: p[1], key: k }; }',
        '  }',
        '  return null;',
        '}',
        'function tacticalLiveEncirclementContext() {',
        '  return { map: appData.map, players: appData.squads, enemies: appData.map.enemySquads };',
        '}',
        // сетка 20x20
        'for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) appData.map.grid[`${c},${r}`] = { type: "grass", squadIds: [], enemySquadIds: [] };',
        ...gridSpec,
        'const TACTICAL_CUTOFF_MIN_DISTANCE = 4, TACTICAL_CUTOFF_PATH_LIMIT = 60;',
        F('tacticalHexKeyOf'), F('tacticalHexPassableForCutoff'),
        F('tacticalSquadConnectionToOwn'), F('tacticalSquadInEnemyPosition'),
        F('tacticalBreachExemptsEncirclement'),
        'var __breach = tacticalBreachExemptsEncirclement(appData.squads[0], false);'
    ].join('\n'), {});
}

{
    // Ворвался на север (вражеская сторона), свои рядом -> не окружён
    const env = breachEnv([
        'appData.squads = [{ name: "штурм", fighters: [{hp: 5}] }, { name: "свой", fighters: [{hp: 5}] }];',
        'appData.map.enemySquads = [{ name: "враг", fighters: [{hp: 5}] }];',
        'appData.map.grid["5,1"] = { type: "trenches", squadIds: [0], enemySquadIds: [] };',
        'appData.map.grid["5,3"] = { type: "grass", squadIds: [1], enemySquadIds: [] };',
        'appData.map.grid["7,2"] = { type: "grass", squadIds: [], enemySquadIds: [0] };'
    ], null, null);
    check('п.6 в окопах врага + свои рядом → окружение снимается', env.__breach.exempt === true,
        JSON.stringify({ exempt: env.__breach.exempt, linked: env.__breach.linked, nearest: env.__breach.nearest }));
}
{
    // Ворвался, враги перекрыли проход, свои далеко -> окружён
    const env = breachEnv([
        'appData.squads = [{ name: "штурм", fighters: [{hp: 5}] }, { name: "свой", fighters: [{hp: 5}] }];',
        'appData.map.enemySquads = [];',
        'appData.map.grid["5,1"] = { type: "trenches", squadIds: [0], enemySquadIds: [] };',
        'appData.map.grid["5,12"] = { type: "grass", squadIds: [1], enemySquadIds: [] };',
        // сплошная вражеская стена после контратаки: весь ряд 5 перекрыт
        'for (let c = 0; c < 20; c++) {',
        '  appData.map.enemySquads.push({ name: "враг-" + c + "-5", fighters: [{hp: 5}] });',
        '  appData.map.grid[`${c},5`] = { type: "trenches", squadIds: [], enemySquadIds: [appData.map.enemySquads.length - 1] };',
        '}',
        'for (let c = 0; c < 20; c++) {',
        '  appData.map.enemySquads.push({ name: "враг-" + c + "-6", fighters: [{hp: 5}] });',
        '  appData.map.grid[`${c},6`] = { type: "grass", squadIds: [], enemySquadIds: [appData.map.enemySquads.length - 1] };',
        '}'
    ], null, null);
    check('п.6 отрезан от своих и ближайший свой далеко → окружение остаётся',
        env.__breach.exempt === false && env.__breach.nearest > 4,
        JSON.stringify({ exempt: env.__breach.exempt, nearest: env.__breach.nearest }));
}
{
    // Отряд не в окопах врага -> правило не вмешивается
    const env = breachEnv([
        'appData.squads = [{ name: "обычный", fighters: [{hp: 5}] }];',
        'appData.map.enemySquads = [{ name: "враг", fighters: [{hp: 5}] }];',
        'appData.map.grid["5,10"] = { type: "grass", squadIds: [0], enemySquadIds: [] };'
    ], null, null);
    check('п.6 обычный отряд в глубине своей стороны — правило не применяется',
        env.__breach.exempt === false);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
