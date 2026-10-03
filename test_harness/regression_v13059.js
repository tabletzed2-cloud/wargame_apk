// ⚡ v13.059: regressions for max-AP movement, bicycle blitz, trenches, hidden targets, and online casualties.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const FNS = [
    'isBicycleTacticalSquad', 'hasBicycleBlitz', 'refreshTacticalAPForSquad', 'getMaxAP', 'ensureAP', 'getAP', 'spendAP',
    'getHexNeighbors', 'calculateReachableHexes', 'recalcReachable', 'addAppliedCardName',
    'applyBicycleBlitzToSquad', 'applyCardToPlatoon', 'getBicycleBlitzFlankBonus', 'onlineOppRole'
];
fs.writeFileSync('/tmp/wg_part.js', FNS.map(name => sliceFunction(HTML, name)).join('\n\n'));

let pass = 0, fail = 0;
function ok(condition, name, detail) {
    if (condition) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (detail ? ' | ' + detail : '')); }
}
function makeSandbox() {
    const appData = freshAppData();
    const s = createSandbox(appData);
    return { appData, s };
}

console.log('== v13.059 regressions ==');

// Version strings must agree across the UI, runtime constant, and cache.
{
    const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
    ok(HTML.includes("var APP_VERSION = 'v13.059'") && HTML.includes('>v13.059</p>') &&
       sw.includes("const CACHE_NAME = 'wargame-v13.059'"),
       'Версия интерфейса, APP_VERSION и service-worker синхронизированы на v13.059');
}

// Movement preview is based on max AP; actual movement still checks current AP.
{
    const { appData, s } = makeSandbox();
    s.sandbox.getMovementCost = () => 2;
    s.run('var actionPoints = [{ ap: 0, maxAp: 4 }]; var TACTICAL_MAP_SIZE = 8; ' +
          'appData.squads = [{ name: "Пехотное отделение", fighters: [] }]; ' +
          'appData.map = { grid: {}, isCrouchMode: false, reachableHexes: [], reachableCosts: {} };');
    s.run('recalcReachable(appData.squads[0], "3,3");');
    const reachableCount = s.evalCtx('appData.map.reachableHexes.length');
    const reachedTwoSteps = s.evalCtx('Object.values(appData.map.reachableCosts).includes(4)');
    const spendRejected = s.evalCtx('spendAP(0, 2) === false && actionPoints[0].ap === 0');
    ok(reachableCount > 0 && reachedTwoSteps, 'Подсветка дальности использует maxAp, даже когда остаток ОД равен нулю');
    ok(spendRejected, 'Фактическое перемещение по-прежнему отклоняется при нехватке оставшихся ОД');
}

// Bicycle blitz grants three ordinary grass hexes and preserves spent AP through mount/dismount.
{
    const { appData, s } = makeSandbox();
    s.run('var actionPoints = [{ ap: 2, maxAp: 6 }]; ' +
          'var bike = { name: "Самокатное отделение №1", mobilityType: "bicycle", dismounted: false, fighters: [{ hp: 1 }] }; ' +
          'var foot = { name: "Пехотное отделение №1", mobilityType: "foot", fighters: [{ hp: 1 }] }; ' +
          'appData.squads = [bike, foot];');
    const card = s.evalCtx("GLOBAL_CARDS.find(c => c.name === 'Велоблиц')");
    s.run("applyCardToPlatoon(GLOBAL_CARDS.find(c => c.name === 'Велоблиц'), 'BeVe', { name: 'Взвод' }, appData.squads, [appData.squads[0].name], {});");
    const afterCard = s.evalCtx('JSON.stringify({ max: actionPoints[0].maxAp, ap: actionPoints[0].ap, applied: appData.squads[0].effects.bicycleBlitz.active, foot: !!appData.squads[1].effects })');
    const stateAfterCard = JSON.parse(afterCard);
    s.run('appData.squads[0].dismounted = true; refreshTacticalAPForSquad(appData.squads[0]);');
    const dismounted = s.evalCtx('actionPoints[0].maxAp === 6 && actionPoints[0].ap === 2');
    s.run('appData.squads[0].dismounted = false; refreshTacticalAPForSquad(appData.squads[0]);');
    const remounted = s.evalCtx('actionPoints[0].maxAp === 12 && actionPoints[0].ap === 8');
    const cardText = String(card.desc || '') + ' ' + String(card.effect || '');
    ok(stateAfterCard.max === 12 && stateAfterCard.ap === 8 && stateAfterCard.applied && !stateAfterCard.foot,
       '«Велоблиц» добавляет 6 полу-ОД только выбранному живому велосипедному отряду');
    ok(dismounted && remounted, 'Посадка/спешивание пересчитывает максимум ОД без сброса уже потраченных ОД');
    ok(/\+3/.test(cardText) && /фланг/i.test(cardText), 'Описание и эффект карты «Велоблиц» отражают бонусы движения и фланга');
}

// Flank geometry must recognize all six odd-row hex directions.
{
    const { appData, s } = makeSandbox();
    s.run('var bike = { name: "Самокатное отделение", mobilityType: "bicycle", dismounted: false, ' +
          'effects: { bicycleBlitz: { active: true } }, fighters: [{ hp: 1 }] }; ' +
          'var ally = { name: "Стрелковое отделение", fighters: [{ hp: 1 }] }; ' +
          'var target = { name: "Цель", fighters: [{ hp: 1 }] }; ' +
          'appData.squads = [bike, ally]; appData.map = { attackTargetEnemyIdx: 0, enemySquads: [target], grid: {' +
          '"5,3": { squadIds: [0], enemySquadIds: [] }, "4,5": { squadIds: [1], enemySquadIds: [] }, ' +
          '"5,4": { squadIds: [], enemySquadIds: [0] } } };');
    const flank = s.evalCtx('getBicycleBlitzFlankBonus(appData.squads[0])');
    s.run('appData.map.grid["4,5"].squadIds = [];');
    const noFlank = s.evalCtx('getBicycleBlitzFlankBonus(appData.squads[0])');
    ok(flank === 1 && noFlank === 0, 'Второй дружественный угол даёт +1 к меткости; без обходящего отряда бонуса нет');
}

// Hidden and destroyed enemies never enter the target modal/list or map highlights.
{
    const { appData, s } = makeSandbox();
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8'), s.ctx, { filename: 'js/map_actions.js' });
    s.run('var currentSquadIndex = 0; var currentSquad = null; var actionPoints = [{ ap: 4, maxAp: 4 }]; ' +
          'appData.squads = [{ name: "Свои", fighters: [{ hp: 1 }] }]; currentSquad = appData.squads[0]; ' +
          'appData.map = { grid: {' +
          '"0,0": { type: "grass", squadIds: [0], enemySquadIds: [] }, ' +
          '"1,0": { type: "grass", squadIds: [], enemySquadIds: [0] }, ' +
          '"2,0": { type: "grass", squadIds: [], enemySquadIds: [1] }, ' +
          '"3,0": { type: "grass", squadIds: [], enemySquadIds: [2] } }, ' +
          'enemySquads: [' +
          '{ name: "Скрытый", hidden: true, fighters: [{ hp: 1 }] }, ' +
          '{ name: "Уничтоженный", fighters: [{ hp: 0 }] }, ' +
          '{ name: "Видимый", fighters: [{ hp: 1 }] }], ' +
          'selectedMoveSquadIdx: 0, pendingMapAttack: { type: "smallArms" }, centers: [' +
          '{ key: "1,0", x: 10, y: 10 }, { key: "2,0", x: 20, y: 10 }, { key: "3,0", x: 30, y: 10 }] };');
    s.run("fillModalTargets('smallArms');");
    const targetHtml = s.evalCtx('document.getElementById("modalTargetSelect").innerHTML');
    const modalOk = targetHtml.includes('Видимый') && !targetHtml.includes('Скрытый') && !targetHtml.includes('Уничтоженный');
    const targetReason = s.evalCtx('mapActionEvalTarget(MAP_ACTION_DEFS[0], 0, 0).reason');
    const hiddenTargetable = s.evalCtx('mapActionEnemyTargetable(appData.map.enemySquads[0])');
    const arcs = { count: 0 };
    const ctx = new Proxy({}, { get(_t, key) { if (key === 'arc') return () => { arcs.count++; }; return () => {}; }, set() { return true; } });
    s.sandbox.__ctxForHighlight = ctx;
    s.run('drawMapActionTargetHighlights(__ctxForHighlight, 20);');
    ok(modalOk, 'Модальное окно предлагает только живые и видимые вражеские отряды');
    ok(targetReason === 'скрыт' && hiddenTargetable === false, 'Скрытого противника нельзя выбрать целью действия с карты');
    ok(arcs.count === 1, 'Подсветка целей пропускает скрытых и уничтоженных врагов');
}

// Trench texture cycling costs no additional edit; undo restores base texture and elevation.
{
    const { appData, s } = makeSandbox();
    s.sandbox.document.getElementById('hexEditorBanner');
    s.run('var baseCell = { type: "grass", variant: 2, level: 3, rotation: 0, squadIds: [], enemySquadIds: [], markers: [] }; ' +
          'TACTICAL_HEX_MAPS["4,4"] = { grid: { "0,0": baseCell }, w: 1, h: 1 }; ' +
          'appData.campaign.hexOverlays = { "4,4": { hexEdits: {}, hexVariants: {}, trenchPoints: 1, prepPoints: 0, shellings: 0 } }; ' +
          'appData.map = { grid: { "0,0": { ...baseCell } }, enemySquads: [], mode: "hexEdit" }; ' +
          'hexEditorState = { hexKey: "4,4", kind: "trenches", rule: hexEditRuleFor("trenches"), baseGrid: { "0,0": baseCell }, undo: [], placed: 0 };');
    const variants = s.evalCtx('TERRAIN_DATA.trenches.images.length');
    s.run('hexEditClick("0,0");');
    const afterPlace = s.evalCtx('JSON.stringify({ type: appData.map.grid["0,0"].type, variant: appData.map.grid["0,0"].variant, level: appData.map.grid["0,0"].level, points: getHexOverlay("4,4", false).trenchPoints, undo: hexEditorState.undo.length })');
    s.run('hexEditClick("0,0");');
    const afterCycle = s.evalCtx('JSON.stringify({ variant: appData.map.grid["0,0"].variant, points: getHexOverlay("4,4", false).trenchPoints, undo: hexEditorState.undo.length })');
    const placed = JSON.parse(afterPlace), cycled = JSON.parse(afterCycle);
    s.run('hexEditUndo();');
    const undone = s.evalCtx('JSON.stringify({ type: appData.map.grid["0,0"].type, variant: appData.map.grid["0,0"].variant, level: appData.map.grid["0,0"].level, points: getHexOverlay("4,4", false).trenchPoints })');
    const restored = JSON.parse(undone);
    ok(placed.type === 'trenches' && placed.variant === 0 && placed.level === 3 && placed.points === 0 && placed.undo === 1,
       'Постановка окопа расходует одну правку и сохраняет уровень рельефа');
    ok(variants > 1 && cycled.variant === 1 && cycled.points === 0 && cycled.undo === 1,
       'Повторный клик циклически меняет текстуру без расхода правки и без новой записи undo');
    ok(restored.type === 'grass' && restored.variant === 2 && restored.level === 3 && restored.points === 1,
       'Отмена восстанавливает исходные тип, вариант, уровень и бюджет правок');
}

// Incoming online damage must update the open tactical record and mark a wiped squad.
{
    const { appData, s } = makeSandbox();
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/online_battles.js'), 'utf8'), s.ctx, { filename: 'js/online_battles.js' });
    s.run('var ONLINE = { role: "p1", match: { status: "playing" }, docRef: { update: function() { return Promise.resolve(); } } }; ' +
          'var syncCalls = 0; function syncBattleLossesToCampaign() { syncCalls++; } ' +
          'var own = { name: "Своя рота", opUnitName: "Свой взвод", fighters: [{ name: "Боец", hp: 2, maxHp: 2 }] }; ' +
          'var battle = { id: 501, hexKey: "5,4", onlineOppBattleId: 99, playerUnitNames: ["Свой взвод"], ' +
          'playerSquads: [JSON.parse(JSON.stringify(own))], enemySquads: [], onlineDmgIn: {}, onlineDmgOut: {}, onlineOppHpSeen: {} }; ' +
          'appData.campaign.online = true; appData.campaign.activeBattles = [battle]; appData.currentBattleId = 501; ' +
          'appData.squads = [own]; appData.map = { grid: { "0,0": { squadIds: [0], enemySquadIds: [], type: "grass" } }, enemySquads: [], mode: "view" };');
    s.run('onlineApplyCloudBattles({ p2: { battles: { h5_4: { id: 99, hexKey: "5,4", status: "active", turn: 2, updatedAt: 123, squads: [], dmgOut: { "Своя рота": [2] }, dmgIn: {}, supOut: {} } } } });');
    const casualty = s.evalCtx('JSON.stringify({ hp: appData.squads[0].fighters[0].hp, destroyed: appData.squads[0].isDestroyed, ' +
          'savedHp: appData.campaign.activeBattles[0].playerSquads[0].fighters[0].hp, savedDestroyed: appData.campaign.activeBattles[0].playerSquads[0].isDestroyed, ' +
          'mapIndex: appData.campaign.activeBattles[0].tacticalMap.grid["0,0"].squadIds[0], syncCalls: syncCalls })');
    const result = JSON.parse(casualty);
    ok(result.hp === 0 && result.destroyed === true, 'Входящий онлайн-урон мгновенно уничтожает отряд с нулевым HP');
    ok(result.savedHp === 0 && result.savedDestroyed === true && result.mapIndex === 0,
       'Потери сохраняются в живой записи боя, а отряд остаётся на карте для красного креста');
    ok(result.syncCalls === 1, 'Потери сразу передаются в оперативную кампанию');
}

console.log(`\nИтог v13.059: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exitCode = 1;
