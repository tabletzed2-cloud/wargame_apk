'use strict';
// ⚡ v13.167 — девять замечаний playtest:
//   1) пешая/вьючная колонна снабжения ходила 4 гекса за ход (как техника) —
//      должна идти пехотным темпом: 2 гекса за ход;
//   2) иконки грузовиков/автомобилей на оперкарте были крупнее иконок юнитов;
//   3) «Отозвать» у разведки не работал: актив висел на точке и оставался
//      скрытым; теперь отзыв возвращает в СВОЁ расположение либо в выбранную
//      точку, с обходом препятствий;
//   4) при «Перерезать пути» гексы не подсвечивались при выборе;
//   5) кнопки в панели разведки вылезали за пределы панели;
//   6) мотоциклиста-разведчика при штабе BeVe / Hidalgo при штабе A.I.R.F.
//      нельзя выбрать как юнит — теперь у иконки миссии есть карточка актива;
//   7) из карточки юнита — кнопка «Отправить снабжение»;
//   8) после разведки пропадал БА (числился живым, но не рисовался);
//   9) смешанная колонна (грузовик + носильщики) вставала намертво, если один
//      из транспортов не мог проехать.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML } = require('./extract');
const ROOT = path.join(__dirname, '..');
const RECON_SRC = fs.readFileSync(path.join(ROOT, 'js/recon.js'), 'utf8');
const OPSUI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/operational_ui.css'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
const CURRENT_VERSION = (/var APP_VERSION = '([^']+)'/.exec(HTML) || [])[1] || '';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}

// ─────────────────────────── 1. Скорость колонн снабжения ───────────────────────────
const SUPPLY_FNS = [
    'supplyAssetIds', 'supplyAssetCounts', 'supplyAssetMobilityClass', 'supplyMobilityIsMotorized',
    'supplyAssetsMobility', 'supplyMoveCost', 'supplyDeliveryMobilityClasses', 'supplyDeliveryMoveCost',
    'findSupplyRoute', 'supplyRouteCost', 'supplyStepToward', 'getOpHexNeighbors',
    'operationalHexHasActiveBattle'
];
function supplySandbox(gridJs) {
    const s = createSandbox(freshAppData());
    s.run(['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_CONVOY_BUDGET'].map(n => sliceConst(HTML, n)).join('\n'));
    SUPPLY_FNS.forEach(fn => { try { s.run(sliceFunction(HTML, fn)); } catch (e) { console.log('  (нет ' + fn + ')'); } });
    s.run(`
      function isHexInPlayableArea() { return true; }
      function getOpHexTypes(col, row) {
        const cell = (appData.campaign.opMapGrid || {})[col + ',' + row];
        if (!cell) return ['grass'];
        return Array.isArray(cell) ? cell : (cell.types || ['grass']);
      }
      appData.campaign.enemyOpUnits = [];
      ${gridJs || ''}
    `);
    return s;
}

console.log('— п.1: пешая и вьючная колонна идут пехотным темпом —');
{
    const s = supplySandbox(`
      const g = {};
      for (let c = 0; c < 12; c++) for (let r = 0; r < 12; r++) g[c + ',' + r] = { types: ['grass'] };
      appData.campaign.opMapGrid = g;
    `);
    const cost = (mob, key) => s.evalCtx(`supplyMoveCost('${mob}', ...'${key}'.split(',').map(Number))`);
    ok(cost('foot', '1,1') === 2, 'пеший гекс по траве стоит 2 ОД (как у пехоты)', String(cost('foot', '1,1')));
    ok(cost('foot', '1,1') * 2 === s.evalCtx('SUPPLY_CONVOY_BUDGET'),
        'за ход пешая колонна проходит ровно 2 гекса по траве');
    s.run(`
      appData.campaign.opMapGrid['4,4'] = { types: ['hill'] };
      appData.campaign.opMapGrid['5,5'] = { types: ['swamp_passable'] };
    `);
    ok(s.evalCtx("supplyMoveCost('foot', 4, 4) === 3"), 'холм — 3 ОД за гекс, как у пехоты');
    ok(s.evalCtx("supplyMoveCost('foot', 5, 5) === 3"), 'проходимое болото — тоже 3 ОД');
    ok(s.evalCtx("Number.isFinite(supplyMoveCost('foot', 4, 4))"), 'пешая колонна проходит холм');
    // шаг колонны за ход: 0,1 -> 2,1 (два гекса, третий не влезает в 4 ОД)
    s.run(`
      const walk = { col: 0, row: 1, mobility: 'foot', assets: [{ id: 'porter', count: 4 }] };
      globalThis.__walkFoot = supplyStepToward(walk, 6, 1) ? null : { col: walk.col, row: walk.row };
      const mule = { col: 0, row: 1, mobility: 'foot', assets: [{ id: 'mule', count: 1 }] };
      globalThis.__walkMule = supplyStepToward(mule, 6, 1) ? null : { col: mule.col, row: mule.row };
    `);
    ok(s.evalCtx('__walkFoot.col') === 2, 'за ход носильщики проходят 2 гекса (было 4)', JSON.stringify(s.evalCtx('__walkFoot')));
    ok(s.evalCtx('__walkMule.col') === 2, 'мул с бойцом — тоже 2 гекса за ход', JSON.stringify(s.evalCtx('__walkMule')));
    ok(s.evalCtx("supplyMoveCost('halftrack', 1, 1) === 1 && supplyMoveCost('foot', 1, 1) === 2"),
        'вездеход TG-41 по-прежнему вдвое быстрее пеших');
    ok(s.evalCtx("supplyMoveCost('vehicle', 1, 1) === 1"), 'грузовик по дороге/траве — 4 гекса за ход');
}

// ─────────────────────────── 9. Смешанная колонна ───────────────────────────
console.log('— п.9: смешанная колонна не встаёт из-за «слабого» транспорта —');
{
    const s = supplySandbox(`
      const g = {};
      for (let c = 0; c < 12; c++) for (let r = 0; r < 12; r++) g[c + ',' + r] = { types: ['forest'] };
      // коридор травы: 0,1 -> 1,1 -> 2,1 -> 3,1 ; всё остальное — лес
      ['0,1', '1,1', '2,1', '3,1'].forEach(k => { g[k] = { types: ['grass'] }; });
      appData.campaign.opMapGrid = g;
    `);
    ok(s.evalCtx("supplyMoveCost('vehicle', 6, 6) === Infinity"), 'грузовик в лес не заезжает');
    ok(s.evalCtx("supplyDeliveryMoveCost({ assets: [{id:'truck',count:1},{id:'porter',count:2}] }, 6, 6)") === 2,
        'смешанная колонна идёт темпом носильщиков там, где машина не пройдёт');
    ok(s.evalCtx("supplyAssetMobilityClass('truck') === 'vehicle' && supplyAssetMobilityClass('porter') === 'foot'"),
        'классы подвижности средств различаются');
    s.run(`
      appData.campaign.enemyOpUnits = [];
      // цель — гекс в лесу: пешие дойдут, грузовик нет
      globalThis.__mixedRoute = findSupplyRoute({ col: 0, row: 1, assets: [{id:'truck',count:1},{id:'porter',count:2}] }, 3, 5);
      const truckOnly = { col: 0, row: 1, assets: [{id:'truck',count:1}] };
      globalThis.__truckRoute = findSupplyRoute(truckOnly, 3, 5);
    `);
    ok(Array.isArray(s.evalCtx('__mixedRoute')) && s.evalCtx('__mixedRoute.length') > 0,
        'маршрут смешанной колонны строится, хотя грузовик один не прошёл бы', String(s.evalCtx('__mixedRoute && __mixedRoute.length')));
    ok(s.evalCtx('__truckRoute') === null, 'один грузовик по такому маршруту не проходит');
    s.run(`
      const mixed = { col: 0, row: 1, assets: [{id:'truck',count:1},{id:'porter',count:2}] };
      globalThis.__mixedArrived = supplyStepToward(mixed, 1, 1) || { col: mixed.col, row: mixed.row };
    `);
    ok(s.evalCtx('__mixedArrived') === true, 'смешанная колонна двигается к получателю, а не стоит');
}

// ─────────────────────────── 2. Размер иконок снабжения ───────────────────────────
console.log('— п.2: иконки техники снабжения не крупнее иконок юнитов —');
{
    const draw = sliceFunction(HTML, 'drawSupplyDeliveriesOnMap');
    ok(/unitIconRadius/.test(draw), 'радиус плашки колонны ограничен радиусом иконки юнита');
    ok(/Math\.min\(size \* \(vehicleImg \? 0\.70 : 0\.52\), unitIconRadius\)/.test(draw),
        'плашка не больше иконки юнита (18 * zoom)');
    ok(/18 \/ \(typeof OP_HEX_SIZE/.test(draw), 'ограничение привязано к OP_HEX_SIZE (радиус 18 у юнитов)');
    ok(!/ctx\.font = `\$\{size \* 0\.56\}px Arial`/.test(draw), 'эмодзи в плашке масштабируется от радиуса, а не от гекса');
}

// ─────────────────────────── 3/6/8. Разведка: отзыв, выбор, «пропавший» БА ───────────────────────────
const RECON_STUBS = `
var currentTurn = 1;
function getOpHexDistance(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }
function isHexInPlayableArea() { return true; }
function getOpHexNeighbors(col, row) {
  const parity = Math.abs(row) % 2;
  const offsets = parity === 0
    ? [[1,0],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1]]
    : [[1,0],[1,1],[0,1],[-1,0],[0,-1],[1,-1]];
  return offsets.map(o => ({ col: col + o[0], row: row + o[1] }))
    .filter(p => p.col >= 0 && p.col < 14 && p.row >= 0 && p.row < 14);
}
function opLineOfSightBlocked() { return false; }
function isNightTime() { return false; }
function rollD10() { return 6; }
function hasRadio() { return true; }
function hasSquadRadio() { return true; }
function opDetectionIsArmored() { return true; }
function tacticalSmokeBlocksSight() { return false; }
function tacticalIlluminationActive() { return false; }
function addOperationalArtilleryNoise() {}
function operationalHexHasActiveBattle() { return false; }
`;
function reconSandbox(unitsJs, gridJs) {
    const ad = freshAppData();
    ad.campaign.playerFaction = 'BeVe';
    const s = createSandbox(ad);
    s.run(RECON_SRC);
    s.run(RECON_STUBS);
    s.run(`
      const g = {};
      for (let c = 0; c < 14; c++) for (let r = 0; r < 14; r++) g[c + ',' + r] = { types: ['grass'] };
      appData.campaign.opMapGrid = g;
      ${gridJs || ''}
      appData.campaign.opUnits = ${unitsJs};
      initReconAssets();
    `);
    return s;
}
const CAR_UNITS = `[
  { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'BeVe', col: 1, row: 1,
    squads: [{ name: 'Штаб', fighters: [{ hp: 3 }] }] },
  { name: 'Бронеавтомобиль Landsverk 183 №1', type: 'armored_vehicle_platoon', faction: 'BeVe', col: 3, row: 3,
    squads: [{ name: 'Экипаж', fighters: [{ hp: 3 }] }] }
]`;

console.log('— п.3: отзыв разведчика возвращает его в своё расположение —');
{
    // лесная «стена»: прямой шаг к штабу невозможен, нужен обход
    const s = reconSandbox(CAR_UNITS, `
      Object.keys(appData.campaign.opMapGrid).forEach(k => { appData.campaign.opMapGrid[k] = { types: ['forest'] }; });
      // коридор: 3,3 -> 4,3 -> 4,2 -> 3,2 -> 2,2 -> 1,2 -> 1,1
      ['1,1','1,2','2,2','3,2','4,2','4,3','3,3','5,3'].forEach(k => {
        appData.campaign.opMapGrid[k] = { types: ['grass'] };
      });
    `);
    s.run("openReconMissionModalForAsset(1, 'beve_armored_car'); reconDraft.route = [{col:5,row:3}]; reconSubmitMission();");
    s.run('appData.campaign.currentTurn = 1; advanceReconMissions();');
    const mission = JSON.parse(s.evalCtx('JSON.stringify(appData.campaign.reconMissions[0])'));
    ok(mission && mission.originHex && mission.originHex.col === 3 && mission.originHex.row === 3,
        'в миссии запомнено своё расположение актива', JSON.stringify(mission && mission.originHex));
    ok(mission && mission.currentHex.col === 5 && mission.currentHex.row === 3, 'актив ушёл на маршрут');
    ok(s.evalCtx('!!appData.campaign.opUnits[1].reconHidden') === true, 'на миссии актив скрыт с карты');

    ok(s.run("recallReconMission(appData.campaign.reconMissions[0].id)") === true, 'кнопка «Отозвать» срабатывает');
    ok(s.evalCtx('appData.campaign.reconMissions[0].status') === 'returning', 'миссия переходит в возврат');
    ok(s.evalCtx('JSON.stringify(appData.campaign.reconMissions[0].recallHex)') === '{"col":3,"row":3}',
        'точка отзыва — своё расположение', s.evalCtx('JSON.stringify(appData.campaign.reconMissions[0].recallHex)'));

    s.run('appData.campaign.currentTurn = 2; advanceReconMissions();');
    ok(s.evalCtx('appData.campaign.reconMissions[0].status') === 'completed',
        'за ход актив находит обход и доходит (раньше висел на точке)',
        s.evalCtx('JSON.stringify(appData.campaign.reconMissions[0].currentHex)'));
    ok(s.evalCtx("appData.campaign.opUnits[1].col + ',' + appData.campaign.opUnits[1].row") === '3,3',
        'юнит вернулся в своё расположение');
    ok(s.evalCtx('!!appData.campaign.opUnits[1].reconHidden') === false &&
       s.evalCtx('!!appData.campaign.opUnits[1].reconMissionId') === false,
        'флаги скрытия сняты — юнит снова на карте (п.8)');
    ok(s.evalCtx('appData.campaign.reconAssets.beve_armored_car.available') === 1, 'актив снова доступен');
}

console.log('— п.3: точка отзыва выбирается кликом по карте —');
{
    const s = reconSandbox(CAR_UNITS);
    s.run("openReconMissionModalForAsset(1, 'beve_armored_car'); reconDraft.route = [{col:6,row:3}]; reconSubmitMission();");
    s.run('appData.campaign.currentTurn = 1; advanceReconMissions();');
    ok(s.run("reconStartRecallPointPick(appData.campaign.reconMissions[0].id)") === true,
        '«Отозвать в точку» включает режим выбора гекса');
    ok(s.evalCtx('reconIsPickingRecall()') === true, 'режим выбора точки активен');
    s.run(`appData.campaign.opCenters = [{ key: '2,5', x: 100, y: 100 }];`);
    ok(s.run('handleReconRecallPickClick(101, 99, 55)') === true, 'клик по карте ловит точку отзыва');
    ok(s.evalCtx('reconIsPickingRecall()') === false, 'после клика режим выключается');
    ok(s.evalCtx('JSON.stringify(appData.campaign.reconMissions[0].recallHex)') === '{"col":2,"row":5}',
        'точка отзыва записана', s.evalCtx('JSON.stringify(appData.campaign.reconMissions[0].recallHex)'));
    ok(s.evalCtx('appData.campaign.reconMissions[0].status') === 'returning', 'актив сразу отозван в эту точку');
    for (let turn = 2; turn <= 4; turn++) s.run(`appData.campaign.currentTurn = ${turn}; advanceReconMissions();`);
    ok(s.evalCtx("appData.campaign.opUnits[1].col + ',' + appData.campaign.opUnits[1].row") === '2,5',
        'актив дошёл именно в выбранную точку');
}

console.log('— п.3/п.8: если обхода нет, актив всё равно возвращается, а не пропадает —');
{
    const s = reconSandbox(CAR_UNITS, `
      Object.keys(appData.campaign.opMapGrid).forEach(k => { appData.campaign.opMapGrid[k] = { types: ['forest'] }; });
      appData.campaign.opMapGrid['3,3'] = { types: ['grass'] };
      appData.campaign.opMapGrid['5,3'] = { types: ['grass'] };
      appData.campaign.opMapGrid['6,3'] = { types: ['grass'] };
    `);
    // актив стоит на изолированном гексе — пути к штабу нет вообще
    s.run(`
      appData.campaign.opUnits[1].col = 5; appData.campaign.opUnits[1].row = 3;
      appData.campaign.reconMissions = [{
        id: 'm-isolated', assetKey: 'beve_armored_car', assetName: 'БА Landsverk',
        unitId: 1, squadName: null, assetKind: 'armored_car',
        route: [{ col: 5, row: 3 }], currentIndex: 0, currentHex: { col: 5, row: 3 }, ap: 4,
        status: 'observing', observeMode: 'stationary', reportMethod: 'radio',
        originHex: { col: 3, row: 3 }, recallHex: null, returnStuck: 0,
        pendingReports: [], foundEnemies: [], log: []
      }];
      appData.campaign.opUnits[1].reconHidden = true;
      appData.campaign.opUnits[1].reconMissionId = 'm-isolated';
      recallReconMission('m-isolated');
      appData.campaign.currentTurn = 2; advanceReconMissions();
      appData.campaign.currentTurn = 3; advanceReconMissions();
    `);
    ok(s.evalCtx("(appData.campaign.reconMissions.find(m => m.id === 'm-isolated') || {}).status") === 'completed',
        'после невозможного обхода миссия не висит в «возвращается»');
    ok(s.evalCtx('!!appData.campaign.opUnits[1].reconHidden') === false, 'юнит перестал быть скрытым');
    ok(s.evalCtx("appData.campaign.opUnits[1].col + ',' + appData.campaign.opUnits[1].row") === '3,3',
        'юнит поставлен в своё расположение', s.evalCtx("appData.campaign.opUnits[1].col + ',' + appData.campaign.opUnits[1].row"));
    ok(/обхода к точке отзыва нет/.test(s.logs.join('\n')), 'в логе объясняется, почему вернулся «своим ходом»');
}

console.log('— п.6: развед-актив при штабе выбирается как юнит —');
{
    const s = reconSandbox(`[
      { name: 'Штаб Батальона', type: 'battalion_hq', faction: 'BeVe', col: 1, row: 1,
        squads: [{ name: 'Штаб', fighters: [{ hp: 3 }] },
                 { name: 'Мотоциклист-разведчик', fighters: [{ hp: 1 }] }] },
      { name: 'Пехотный взвод', type: 'infantry_platoon', faction: 'BeVe', col: 6, row: 6,
        squads: [{ name: 'Отд', fighters: [{ hp: 3 }] }] }
    ]`);
    s.run("openReconMissionModalForAsset(0, 'beve_motorcycle_scout'); reconDraft.route = [{col:5,row:5}]; reconSubmitMission();");
    s.run('appData.campaign.currentTurn = 1; advanceReconMissions();');
    const size = 55;
    const cx = s.evalCtx(`reconMissionIconCenter(appData.campaign.reconMissions[0], ${size}).x`);
    const cy = s.evalCtx(`reconMissionIconCenter(appData.campaign.reconMissions[0], ${size}).y`);
    ok(s.evalCtx(`!!opReconMissionAtPoint(${cx}, ${cy + 4}, ${size})`) === true,
        'клик по иконке миссии попадает в актив');
    ok(s.evalCtx(`opReconMissionAtPoint(${cx + 500}, ${cy}, ${size})`) === null, 'клик мимо иконки актив не выбирает');
    ok(s.run(`reconSelectMissionAsset('${JSON.parse(s.evalCtx('JSON.stringify(appData.campaign.reconMissions[0].id)'))}')`) === true,
        'актив можно «выбрать как юнит»');
    ok(s.evalCtx('appData.campaign.selectedReconMissionId') !== null, 'выбранный актив запоминается для подсветки');
    const html = s.evalCtx("String(document.getElementById('reconAssetPopup').innerHTML)");
    ok(/recallReconMission\(/.test(html), 'в карточке актива есть «Отозвать»');
    ok(/reconStartRecallPointPick\(/.test(html), 'в карточке актива есть «Отозвать в точку»');
    ok(/reconNewOrderForMission\(/.test(html), 'в карточке актива есть «Новый приказ»');
    ok(/Мотоциклист-разведчик/.test(html), 'карточка показывает имя развед-отряда');
    // отзыв развед-органа при штабе не двигает штаб и снимает флаги отряда
    s.run("recallReconMission(appData.campaign.reconMissions[0].id); appData.campaign.currentTurn = 2; advanceReconMissions();");
    ok(s.evalCtx("appData.campaign.opUnits[0].col + ',' + appData.campaign.opUnits[0].row") === '1,1',
        'штаб-носитель остался на месте');
    ok(s.evalCtx('!!appData.campaign.opUnits[0].squads[1].onReconMission') === false,
        'отряд вернулся в штаб и снова доступен');
}

// ─────────────────────────── 7. Снабжение из карточки юнита ───────────────────────────
console.log('— п.7: кнопка «Отправить снабжение» в карточке юнита —');
{
    const cardSrc = sliceFunction(HTML, 'showOpUnitInfoPopup');
    ok(/openSupplyForUnit\(\$\{unitIndex\}\)/.test(cardSrc), 'в карточке есть кнопка «Отправить снабжение»');
    ok(/🚚 Снабжение/.test(cardSrc), 'у кнопки есть заголовок «Снабжение»');
    ok(/supplyUnitAmmoDeficits/.test(cardSrc) && /Боезапас/.test(cardSrc), 'карточка показывает боезапас получателя');
    ok(/typeof openSupplyForUnit === 'undefined'|function openSupplyForUnit/.test(HTML), 'функция openSupplyForUnit объявлена');

    const s = createSandbox(freshAppData());
    s.run(sliceFunction(HTML, 'openSupplyForUnit'));
    s.run(`
      var supplySelection = -1;
      function supplyPanelSetSelection(v) { supplySelection = Number(v); }
      function showSupplyPanel() { globalThis.panelOpened = (globalThis.panelOpened || 0) + 1; }
      function renderSupplyPanel() {}
      function closeOpUnitInfoPopup() {}
      function ensureSupplyChoicesHint() {}
      appData.campaign.opUnits = [
        { name: 'Штаб Батальона', type: 'battalion_hq', col: 1, row: 1, squads: [] },
        { name: 'Пехотный взвод', type: 'infantry_platoon', col: 4, row: 4, squads: [] }
      ];
      globalThis.__open = openSupplyForUnit(1);
    `);
    ok(s.evalCtx('__open') === true, 'openSupplyForUnit открывает снабжение для юнита');
    ok(s.evalCtx('supplySelection') === 1, 'в панели снабжения сразу выбран этот получатель');
    ok(s.evalCtx('globalThis.panelOpened') === 1, 'панель снабжения открывается');
    ok(/Снабжение: выбран получатель/.test(s.logs.join('\n')), 'в лог уходит подсказка, кому отправляем');
}

// ─────────────────────────── 9. Колонна не «зависает» на перекрытом маршруте ───────────────────────────
console.log('— п.9: колонна не стоит на месте бесконечно —');
{
    // проходимого маршрута нет вообще (нет пути по местности) — колонна сразу разворачивается
    const s1 = createSandbox(freshAppData());
    s1.run(sliceFunction(HTML, 'advanceSupplyDeliveries'));
    s1.run(sliceFunction(HTML, 'notifySupplyDelivery'));
    s1.run(`
      function ensureSupplyState() { return appData.campaign.supply; }
      function syncSupplyDepotStatus() {}
      function syncSupplyAssetsFromPlatoon() {}
      function getSupplyDepotHex() { return { col: 0, row: 0 }; }
      function supplyRearPoint() { return { col: 0, row: 0 }; }
      function supplyRecipientIsCutOff() { return false; }
      function supplyRearConnectionIsLost() { return false; }
      function supplyRearRouteBlocked() { return false; }
      function supplyDepotCaptured() { return false; }
      function supplyAmbushCheck() { return null; }
      function operationalHexHasActiveBattle() { return false; }
      function supplyAssetsLabel() { return 'носильщики'; }
      function supplyStepToward(delivery) { delivery.routeBlocked = true; return false; }
      function findSupplyRoute() { return null; }   // ни по местности, ни с обходом
      appData.campaign.supply = {
        stock: { ammoSmall: 0, grenades: 0, ammoOrdnance: 0 },
        max: { ammoSmall: 100, grenades: 10, ammoOrdnance: 10 },
        deliveries: [{
          id: 'd1', kind: 'unit', targetUnitId: 0, status: 'outbound', col: 0, row: 0, delayTurns: 0,
          assets: [{ id: 'porter', count: 2 }], cargo: { ammoSmall: 50, grenades: 5, ammoOrdnance: 0 }
        }]
      };
      appData.campaign.opUnits = [{ name: 'Пехотный взвод', col: 5, row: 5 }];
      appData.campaign.enemyOpUnits = [];
      advanceSupplyDeliveries();
      globalThis.__impossible = appData.campaign.supply.deliveries[0];
    `);
    ok(s1.evalCtx('__impossible.status') === 'returning',
        'нет проходимого маршрута — колонна сразу возвращается на склад', s1.evalCtx('__impossible.status'));
    ok(/проходимого маршрута/.test(String(s1.evalCtx('__impossible.notice'))), 'игроку объяснена причина');

    // маршрут есть по местности, но его перекрыл противник — ждём обход 3 хода
    const s2 = createSandbox(freshAppData());
    s2.run(sliceFunction(HTML, 'advanceSupplyDeliveries'));
    s2.run(sliceFunction(HTML, 'notifySupplyDelivery'));
    s2.run(`
      function ensureSupplyState() { return appData.campaign.supply; }
      function syncSupplyDepotStatus() {}
      function syncSupplyAssetsFromPlatoon() {}
      function getSupplyDepotHex() { return { col: 0, row: 0 }; }
      function supplyRearPoint() { return { col: 0, row: 0 }; }
      function supplyRecipientIsCutOff() { return false; }
      function supplyRearConnectionIsLost() { return false; }
      function supplyRearRouteBlocked() { return false; }
      function supplyDepotCaptured() { return false; }
      function supplyAmbushCheck() { return null; }
      function operationalHexHasActiveBattle() { return false; }
      function supplyAssetsLabel() { return 'носильщики'; }
      function supplyStepToward(delivery) { delivery.routeBlocked = true; return false; }
      function findSupplyRoute(delivery, col, row, opts) {
        return (opts && opts.ignoreEnemies) ? [{ col: 1, row: 0 }] : null;
      }
      appData.campaign.supply = {
        stock: { ammoSmall: 0, grenades: 0, ammoOrdnance: 0 },
        max: { ammoSmall: 100, grenades: 10, ammoOrdnance: 10 },
        deliveries: [{
          id: 'd2', kind: 'unit', targetUnitId: 0, status: 'outbound', col: 0, row: 0, delayTurns: 0,
          assets: [{ id: 'porter', count: 2 }], cargo: { ammoSmall: 50, grenades: 5, ammoOrdnance: 0 }
        }]
      };
      appData.campaign.opUnits = [{ name: 'Пехотный взвод', col: 5, row: 5 }];
      appData.campaign.enemyOpUnits = [];
      globalThis.__turns = [];
      for (let i = 0; i < 3; i++) {
        advanceSupplyDeliveries();
        globalThis.__turns.push((appData.campaign.supply.deliveries[0] || {}).status || 'finished');
      }
    `);
    const turns = JSON.parse(s2.evalCtx('JSON.stringify(__turns)'));
    ok(turns[0] === 'outbound' && turns[1] === 'outbound',
        'перекрытый противником маршрут: два хода колонна ищет обход', JSON.stringify(turns));
    ok(turns[2] === 'returning' || turns[2] === 'finished',
        'после третьего хода колонна возвращается с грузом, а не стоит', JSON.stringify(turns));
}

// ─────────────────────────── 4. Подсветка гексов «Перерезать пути» ───────────────────────────
console.log('— п.4: гексы «Перерезать пути» подсвечиваются при выборе —');
{
    ok(/window\.uxGetCutPathsDraftHexes = function/.test(OPSUI), 'черновик перерезания отдаётся карте');
    ok(/mapPick !== 'cutpaths'/.test(OPSUI), 'подсветка работает именно в режиме выбора гексов перерезания');
    ok(/кандидаты|подсказк/.test(OPSUI) || /candidates/.test(OPSUI), 'считаются и подсказки, куда ставить следующий гекс');
    ok(/function drawOperationalCutPathsDraftHighlights/.test(HTML), 'есть отрисовка подсветки перерезания');
    ok(/drawOperationalCutPathsDraftHighlights\(ctx, size\)/.test(HTML), 'отрисовка вызывается при перерисовке карты');

    // функциональная проверка отрисовки: выбранные гексы и кандидаты попадают на карту
    const ctxCalls = [];
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key === 'fillText') return (text, x, y) => ctxCalls.push({ type: 'text', text: String(text), x, y });
            if (key === 'beginPath') return () => ctxCalls.push({ type: 'beginPath' });
            if (key === 'fill') return () => ctxCalls.push({ type: 'fill' });
            return () => {};
        },
        set() { return true; }
    });
    const sandbox = {
        Math,
        console,
        window: { uxGetCutPathsDraftHexes: () => ({ chosen: [{ col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 }], candidates: [] }) }
    };
    vm.runInNewContext(sliceFunction(HTML, 'opCutPathsHexPath') + '\n' + sliceFunction(HTML, 'drawOperationalCutPathsDraftHighlights') + '\ndrawOperationalCutPathsDraftHighlights(__ctx, 55);', Object.assign(sandbox, { __ctx: ctx }));
    const texts = ctxCalls.filter(c => c.type === 'text').map(c => c.text);
    ok(texts.includes('✂️1') && texts.includes('✂️2') && texts.includes('✂️3'), 'выбранные гексы помечены ✂️1..3', texts.join(','));
    ok(texts.includes('взвод'), 'средний гекс (место взвода) подписан');
    ok(ctxCalls.filter(c => c.type === 'fill').length === 3, 'залиты все три выбранных гекса');

    // кандидаты рисуются только пунктиром
    const ctxCalls2 = [];
    const ctx2 = new Proxy({}, {
        get(target, key) {
            if (key === 'fillText') return () => {};
            if (key === 'fill') return () => ctxCalls2.push('fill');
            return () => {};
        },
        set() { return true; }
    });
    const sandbox2 = {
        Math,
        console,
        window: { uxGetCutPathsDraftHexes: () => ({ chosen: [], candidates: [{ col: 1, row: 1 }] }) }
    };
    vm.runInNewContext(sliceFunction(HTML, 'opCutPathsHexPath') + '\n' + sliceFunction(HTML, 'drawOperationalCutPathsDraftHighlights') + '\ndrawOperationalCutPathsDraftHighlights(__ctx, 55);', Object.assign(sandbox2, { __ctx: ctx2 }));
    ok(ctxCalls2.length === 1, 'пока ничего не выбрано — подсвечиваются только гексы-кандидаты');
}

// ─────────────────────────── 5. Панель разведки: кнопки не вылезают ───────────────────────────
console.log('— п.5: кнопки панели разведки не вылезают за пределы панели —');
{
    ok(/#reconPanel \{[^}]*max-width: 100%/.test(CSS), 'панель разведки ограничена шириной дока');
    ok(/#reconPanel button \{[^}]*white-space: normal/.test(CSS), 'кнопки переносят текст вместо nowrap');
    ok(/#reconPanel \.recon-mission-row \{[^}]*flex-wrap: wrap/.test(CSS), 'строка миссии переносится');
    ok(/#reconPanel \.recon-mission-actions \{[^}]*flex-wrap: wrap/.test(CSS), 'кнопки миссии переносятся на новую строку');
    ok(/recon-mission-row/.test(RECON_SRC) && !/white-space:nowrap/.test(RECON_SRC.split('reconMissionsPanelHtml')[1] || ''),
        'разметка миссий использует классы, а не inline-nowrap');
    ok(/recon-mission-actions/.test(RECON_SRC), 'кнопки миссии в своей обёртке');
}

// ─────────────────────────── версия и сборка ───────────────────────────
console.log('— версия и сборка —');
{
    ok(/^v\d+\.\d+$/.test(CURRENT_VERSION), 'APP_VERSION в формате vNN.NNN', CURRENT_VERSION);
    ok(SW.indexOf('wargame-' + CURRENT_VERSION) >= 0, 'CACHE_NAME совпадает с APP_VERSION');
    ok(MANIFEST.indexOf(CURRENT_VERSION) >= 0, 'manifest.short_name совпадает с APP_VERSION');
    ok(RECON_SRC.split('\n')[0].indexOf(CURRENT_VERSION) >= 0, 'BUILD-маркер js/recon.js = ' + CURRENT_VERSION);
    ok(OPSUI.split('\n')[0].indexOf(CURRENT_VERSION) >= 0, 'BUILD-маркер js/operational_ui.js = ' + CURRENT_VERSION);
}

console.log('');
if (fails.length) {
    console.log('Итог v13.167: PASS ' + pass + ' · FAIL ' + fails.length);
    fails.forEach(f => console.log('   ✗ ' + f));
    process.exit(1);
} else {
    console.log('Итог v13.167 (скорость караванов, размер иконок, отзыв разведки, подсветка перерезания, карточка актива, снабжение из карточки, смешанные колонны): PASS ' + pass + ' · FAIL 0');
}
