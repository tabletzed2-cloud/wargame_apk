// ⚡ v13.066: регрессии текущего релиза —
//    1) пункт боепитания (📦) в гексе штаба взвода на тактической карте;
//    2) начальная расстановка — только ДОТы (окопы убраны), ДОТ ставится как
//       юнит с иконкой и в бою стоит на заданной клетке;
//    3) миникарта кампании с подсветкой открытого оперативного гекса.
//    Запуск: node 'test_harness /regression_v13066.js' (после regression_v13065.js)
'use strict';
const fs = require('fs');
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const HEX = fs.readFileSync(ROOT + '/js/hexmaps.js', 'utf8');
const PLACE = fs.readFileSync(ROOT + '/js/placement.js', 'utf8');
// свежая песочница: чужой /tmp/wg_part.js от предыдущих прогонов не подмешиваем
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗ ' + name + ' — ' + e.message); }
}

const HEX_FNS = [
  'isDotOperationalUnit', 'initialDotUnits', 'initialFortificationHexCount',
  'initialFortificationComplete', 'dotFixedSquadsForHex', 'cellHasRealDotUnit',
  'initialFortificationWord', 'getHexOverlay', 'getHexOverlays', 'getInitialFortificationData',
  'countHexTrenchCells', 'normalizeHexRotation', 'initialDotCandidates', 'initialDotIdForHex',
  'initialDotSelector', 'bindInitialDot', 'initialFortificationEditClick',
  'setInitialFortificationTool', 'hexEditRuleFor', 'applyHexOverlays', 'isPlatoonHQBattleSquad',
  'supplyPointStateKey', 'syncSupplyPointsOnGrid', 'syncBattleRecordSupplyPoints',
  'syncLiveMapSupplyPoints', 'applyFixedDotPositions'
];
const HTML_FNS = [
  'campaignMiniMapCurrentHex', 'campaignMiniMapVisible', 'toggleCampaignMiniMap',
  'renderCampaignMiniMap', 'opMapDrawDims', 'getOpHexTypes', 'pickCanvasDpr', 'canvasBackingScale'
];

function sandbox() {
  const s = createSandbox(freshAppData());
  s.run(HEX_FNS.map(n => sliceFunction(HEX, n)).join('\n') + '\n'
      + HTML_FNS.map(n => sliceFunction(HTML, n)).join('\n'));
  s.run(`
    // OP_MAP_* в приложении объявлены как const — в песочнице их нет
    globalThis.OP_MAP_COLS = 13; globalThis.OP_MAP_ROWS = 15; globalThis.OP_HEX_SIZE = 45;
    globalThis.CANVAS_MAX_DPR = 2; globalThis.CANVAS_PIXEL_BUDGET = 5500000;
    globalThis.TACTICAL_HEX_MAPS = {};
    globalThis.campaignMiniMapCollapsed = false;
    globalThis.__logs = [];
    function log(m) { __logs.push(String(m)); }
    function saveData() {}
    function redrawMap() {}
    function showHexEditorBanner() {}
    function saveHexOverlays() {}
    function redrawOperationalMap() {}
    function alert() {}
    function isHexInPlacementZone() { return { ok: true }; }
    if (typeof applyHexOverlays === 'undefined') globalThis.applyHexOverlays = function () { return null; };
    function onlinePushHexOverlays() {}
    appData.map = { grid: {}, enemySquads: [], mode: 'view' };
  `);
  return s;
}
function hexCell() { return { type: 'grass', squadIds: [], enemySquadIds: [], markers: [] }; }
// объекты из vm-контекста имеют чужие прототипы — сравниваем через JSON
function json(v) { return JSON.stringify(v === undefined ? null : v); }
function eq(s, expr, expected, msg) {
  assert.equal(json(s.evalCtx(expr)), json(expected), msg);
}

// ─────────────────────────── 1. Пункт боепитания ───────────────────────────
test('R44#1: пункт боепитания встаёт в гекс штаба взвода (только взводного)', () => {
  const s = sandbox();
  s.run(`
    appData.squads = [
      { name: 'Пехотное отделение №1 Бельгийцы', fighters: [{ hp: 3, maxHp: 3 }] },
      { name: 'Штаб взвода №1 Бельгийцы', fighters: [{ hp: 3, maxHp: 3 }] },
      { name: 'Штаб роты (бельг.)', fighters: [{ hp: 3, maxHp: 3 }] },
      { name: 'Штаб батальона', fighters: [{ hp: 3, maxHp: 3 }] }
    ];
    ['0,0','1,0','2,0','3,0'].forEach(k => appData.map.grid[k] = { type: 'grass', squadIds: [], enemySquadIds: [], markers: [] });
    appData.map.grid['0,0'].squadIds.push(0);
    appData.map.grid['1,0'].squadIds.push(1);
    appData.map.grid['2,0'].squadIds.push(2);
    appData.map.grid['3,0'].squadIds.push(3);
    syncLiveMapSupplyPoints();
  `);
  eq(s, 'appData.map.autoSupplyKeysPlayer', ['1,0'], 'метка только у штаба взвода');
  assert.ok(s.evalCtx("appData.map.grid['1,0'].markers").includes('ammoPoint'), '📦 на гексе штаба взвода');
  assert.ok(!s.evalCtx("appData.map.grid['2,0'].markers").includes('ammoPoint'), 'штаб роты — без метки');
  assert.ok(!s.evalCtx("appData.map.grid['3,0'].markers").includes('ammoPoint'), 'штаб батальона — без метки');
  assert.ok(!s.evalCtx("appData.map.grid['0,0'].markers").includes('ammoPoint'), 'пехотное отделение — без метки');
});

test('R44#1: метка следует за штабом и снимается при уничтожении', () => {
  const s = sandbox();
  s.run(`
    appData.squads = [{ name: 'Штаб взвода №2 Голландцы', fighters: [{ hp: 3, maxHp: 3 }] }];
    appData.map.grid['4,4'] = { type: 'grass', squadIds: [0], enemySquadIds: [], markers: [] };
    appData.map.grid['7,7'] = { type: 'grass', squadIds: [], enemySquadIds: [], markers: [] };
    syncLiveMapSupplyPoints();
    appData.map.grid['4,4'].squadIds = [];
    appData.map.grid['7,7'].squadIds = [0];
    syncLiveMapSupplyPoints();
    globalThis.__afterMove = JSON.parse(JSON.stringify(appData.map));
    appData.squads[0].isDestroyed = true;
    syncLiveMapSupplyPoints();
    globalThis.__afterDeath = JSON.parse(JSON.stringify(appData.map));
  `);
  eq(s, '__afterMove.grid["4,4"].markers', [], 'старый гекс очищен');
  assert.ok(s.evalCtx('__afterMove.grid["7,7"].markers').includes('ammoPoint'), 'метка переехала со штабом');
  eq(s, '__afterDeath.grid["7,7"].markers', [], 'у уничтоженного штаба метки нет');
  eq(s, 'appData.map.autoSupplyKeysPlayer', []);
});

test('R44#1: скрытые отряды противника метку не получают, видимые — получают', () => {
  const s = sandbox();
  s.run(`
    appData.map.enemySquads = [{ name: 'Штаб взвода №4', hidden: true, fighters: [{ hp: 3, maxHp: 3 }] }];
    appData.map.grid['5,5'] = { type: 'grass', squadIds: [], enemySquadIds: [0], markers: [] };
    syncLiveMapSupplyPoints();
    globalThis.__hidden = JSON.parse(JSON.stringify(appData.map.grid['5,5'].markers));
    appData.map.enemySquads[0].hidden = false;
    syncLiveMapSupplyPoints();
    globalThis.__visible = JSON.parse(JSON.stringify(appData.map.grid['5,5'].markers));
  `);
  eq(s, '__hidden', [], 'скрытая расстановка не выдаёт штаб');
  assert.ok(s.evalCtx('__visible').includes('ammoPoint'), 'после раскрытия метка видна');
});

test('R44#1: пользовательская метка 📦 не стирается пересчётом', () => {
  const s = sandbox();
  s.run(`
    appData.squads = [{ name: 'Штаб взвода №3', fighters: [{ hp: 3, maxHp: 3 }] }];
    appData.map.grid['1,1'] = { type: 'grass', squadIds: [0], enemySquadIds: [], markers: [] };
    appData.map.grid['9,9'] = { type: 'grass', squadIds: [], enemySquadIds: [], markers: ['ammoPoint'] };
    syncLiveMapSupplyPoints();
  `);
  assert.ok(s.evalCtx("appData.map.grid['9,9'].markers").includes('ammoPoint'), 'ручная метка осталась');
});

test('R44#1: в записи боя метки ставятся и нашей стороне, и противнику', () => {
  const s = sandbox();
  s.run(`
    const battle = { hexKey: '8,10', playerSquads: [{ name: 'Штаб взвода №1 Бельгийцы', fighters: [{ hp: 3 }] }],
      tacticalMap: { grid: { '2,2': { type: 'grass', squadIds: [0], enemySquadIds: [], markers: [] },
                             '5,5': { type: 'grass', squadIds: [], enemySquadIds: [0], markers: [] } },
                     enemySquads: [{ name: 'Штаб взвода №4', fighters: [{ hp: 2 }] }] } };
    syncBattleRecordSupplyPoints(battle);
    globalThis.__battle = battle;
  `);
  assert.ok(s.evalCtx('__battle.tacticalMap.grid["2,2"].markers').includes('ammoPoint'), 'свой штаб взвода');
  assert.ok(s.evalCtx('__battle.tacticalMap.grid["5,5"].markers').includes('ammoPoint'), 'штаб взвода противника');
});

// ─────────────────────── 2. Стартовая расстановка ДОТов ───────────────────────
const DOT_UNITS = `
    appData.campaign.playerFaction = 'BeVe';
    appData.campaign.scenario = 'valencia';
    appData.campaign.opUnits = [{ name: 'Расчёты ДОТов и ДОТы (стационарные)', type: 'dots', icon: 'images/BeVe/ДОТ Bosh.png', col: null, row: null, squads: [
      { name: 'ДОТ Bosh', icon: 'images/BeVe/ДОТ Bosh.png', fighters: [{ hp: 3, maxHp: 3 }] },
      { name: 'ДОТ Van Hees', icon: 'images/BeVe/ДОТ Van Hees.png', fighters: [{ hp: 3, maxHp: 3 }] }
    ] }];
`;

function dotSandbox() {
  const s = sandbox();
  s.run(DOT_UNITS + `
    appData.map.grid['12,12'] = { type: 'grass', squadIds: [], enemySquadIds: [], markers: [] };
    appData.map.grid['7,7'] = { type: 'grass', squadIds: [], enemySquadIds: [], markers: [] };
  `);
  return s;
}

test('R44#2: гексов для выбора столько же, сколько ДОТов (два)', () => {
  const s = dotSandbox();
  assert.equal(s.evalCtx('initialFortificationHexCount()'), 2);
  assert.equal(s.evalCtx('initialFortificationComplete()'), false, 'пока ДОТы не расставлены');
  assert.equal(s.evalCtx('initialDotCandidates().length'), 2);
});

test('R44#2: окопы на старте не расставляются — инструмент отключён', () => {
  const s = dotSandbox();
  s.run(`
    globalThis.__st = { hexKey: '8,10', kind: 'initialFortification', rule: hexEditRuleFor('initialFortification'), tool: 'trenches' };
    hexEditorState = __st;
    initialFortificationEditClick(__st, '5,5', { type: 'grass' }, {});
    globalThis.__fort = getHexOverlay('8,10', true).initialFortifications;
    setInitialFortificationTool('trenches');
    globalThis.__toolAfter = hexEditorState.tool;
    setInitialFortificationTool('erase');
    globalThis.__toolAfterErase = hexEditorState.tool;
  `);
  eq(s, '__fort.trenchCells', [], 'ни одного окопа начальной расстановки');
  assert.equal(s.evalCtx('__toolAfter'), 'trenches', 'инструмент «окоп» не принимается редактором');
  assert.equal(s.evalCtx('__toolAfterErase'), 'erase', 'ластик доступен');
});

test('R44#2: ДОТ ставится как юнит (иконка + позиция), а не как метка', () => {
  const s = dotSandbox();
  s.run(`
    globalThis.__st = { hexKey: '8,10', kind: 'initialFortification', rule: hexEditRuleFor('initialFortification'),
                        tool: 'dot', dotId: initialDotIdForHex('8,10') };
    hexEditorState = __st;
    initialFortificationEditClick(__st, '12,12', { type: 'grass' }, {});
    globalThis.__msg = document.getElementById('mapInfo').innerHTML;
    globalThis.__dot = JSON.parse(JSON.stringify(appData.campaign.opUnits[0].squads[0].fixedTacticalPosition));
    globalThis.__icon = appData.campaign.opUnits[0].squads[0].icon;
    globalThis.__unitPos = appData.campaign.opUnits[0].col + ',' + appData.campaign.opUnits[0].row;
    globalThis.__fort = JSON.parse(JSON.stringify(getHexOverlay('8,10', true).initialFortifications));
    globalThis.__preview = dotFixedSquadsForHex('8,10');
  `);
  eq(s, '__dot', { hexKey: '8,10', key: '12,12' }, 'постоянная позиция ДОТа');
  assert.equal(s.evalCtx('__icon'), 'images/BeVe/ДОТ Bosh.png', 'иконка юнита ДОТа');
  assert.equal(s.evalCtx('__unitPos'), '8,10', 'ДОТ-юнит переставлен на выбранный опер. гекс');
  assert.ok(s.evalCtx('__fort.dotCells').includes('12,12'), 'клетка помечена как ДОТ');
  assert.equal(s.evalCtx('__preview["12,12"].icon'), 'images/BeVe/ДОТ Bosh.png', 'в редакторе рисуется иконка ДОТа');
  assert.match(String(s.evalCtx('__msg')), /постоянная позиция 12,12/, 'сообщение игроку');
});

test('R44#2: иконка вместо метки «🏰», когда ДОТ стоит на клетке', () => {
  const s = dotSandbox();
  s.run(`
    appData.squads = [{ name: 'ДОТ Bosh', fighters: [{ hp: 3 }] }];
    appData.map.enemySquads = [{ name: 'Стрелковое отделение №1', fighters: [{ hp: 3 }] }];
    globalThis.__own = cellHasRealDotUnit({ squadIds: [0], enemySquadIds: [] });
    globalThis.__foe = cellHasRealDotUnit({ squadIds: [], enemySquadIds: [0] });
    globalThis.__plain = cellHasRealDotUnit({ squadIds: [], enemySquadIds: [] });
  `);
  assert.equal(s.evalCtx('__own'), true, 'свой ДОТ');
  assert.equal(s.evalCtx('__foe'), false, 'пехота противника — не ДОТ');
  assert.equal(s.evalCtx('__plain'), false, 'пустая клетка');
  assert.match(HTML, /if \(type === 'dot' && dotShownAsUnit\) return;/);
  assert.match(HTML, /dotFixedSquadsForHex/);
});

test('R44#2: два ДОТа на двух гексах — расстановка завершена; ластик снимает', () => {
  const s = dotSandbox();
  s.run(`
    globalThis.__st = { hexKey: '8,10', kind: 'initialFortification', rule: hexEditRuleFor('initialFortification'),
                        tool: 'dot', dotId: initialDotIdForHex('8,10') };
    hexEditorState = __st;
    initialFortificationEditClick(__st, '12,12', { type: 'grass' }, {});
    __st.hexKey = '9,9';
    __st.dotId = initialDotIdForHex('9,9');
    globalThis.__secondId = __st.dotId;
    initialFortificationEditClick(__st, '7,7', { type: 'grass' }, {});
    globalThis.__done = initialFortificationComplete();
    globalThis.__second = JSON.parse(JSON.stringify(appData.campaign.opUnits[0].squads[1].fixedTacticalPosition));
    __st.tool = 'erase';
    initialFortificationEditClick(__st, '7,7', { type: 'grass' }, {});
    globalThis.__afterErase = initialFortificationComplete();
    globalThis.__secondAfterErase = (appData.campaign.opUnits[0].squads[1].fixedTacticalPosition === undefined) ? null
        : JSON.stringify(appData.campaign.opUnits[0].squads[1].fixedTacticalPosition);
  `);
  assert.equal(s.evalCtx('__secondId'), '0:1', 'для второй карты предложен свободный ДОТ');
  eq(s, '__second', { hexKey: '9,9', key: '7,7' });
  assert.equal(s.evalCtx('__done'), true, 'оба ДОТа на своих гексах');
  assert.equal(s.evalCtx('__afterErase'), false, 'после стирания расстановка не завершена');
  assert.equal(s.evalCtx('__secondAfterErase'), null, 'позиция снята');
});

test('R44#2: без ДОТов в батальоне расстановка не требуется', () => {
  const s = sandbox();
  s.run(`
    appData.campaign.playerFaction = 'BeVe';
    appData.campaign.opUnits = [{ name: 'Штаб батальона', squads: [{ name: 'Штаб батальона', fighters: [{ hp: 3 }] }] }];
  `);
  assert.equal(s.evalCtx('initialFortificationHexCount()'), 0);
  assert.equal(s.evalCtx('initialFortificationComplete()'), true);
});

test('R44#2: в бою на этом гексе ДОТ уже стоит на заданной клетке', () => {
  const s = dotSandbox();
  s.run(`
    const battle = { hexKey: '8,10',
      playerSquads: [{ name: 'ДОТ Bosh', icon: 'images/BeVe/ДОТ Bosh.png', fixedTacticalPosition: { hexKey: '8,10', key: '12,12' }, fighters: [{ hp: 3 }] }],
      tacticalMap: { grid: { '12,12': { type: 'grass', squadIds: [], enemySquadIds: [], markers: [] } }, enemySquads: [] } };
    applyFixedDotPositions(battle);
    globalThis.__gridIds = JSON.stringify(battle.tacticalMap.grid['12,12'].squadIds);
    globalThis.__hexPos = JSON.stringify(battle.playerSquads[0].hexPos);
  `);
  assert.equal(s.evalCtx('__gridIds'), '[0]', 'ДОТ в заданной клетке');
  assert.equal(s.evalCtx('__hexPos'), '[12,12]', 'позиция отряда обновлена');
});

test('R44#2: ДОТы одного юнита могут стоять на двух гексах — в бою каждый свой', () => {
  // юнит со закреплённым ДОТом попадает в бой на гексе ДОТа
  assert.match(HTML, /const unitBelongsToHex = \(u, col, row\) => \{/);
  assert.match(HTML, /s\.fixedTacticalPosition\.hexKey\.split\(','\)\[0\]/);
  assert.match(HTML, /s\.fixedTacticalPosition\.hexKey\.split\(','\)\[1\]/);
  // в «чужом» бою отряд ДОТа не заперт на постоянной позиции
  assert.match(PLACE, /String\(squad\.fixedTacticalPosition\.hexKey\) === String\(battle\.hexKey\)/);
  // правило «ДОТы одного юнита — только один оперативный гекс» снято
  assert.ok(!/ДОТы одного юнита должны находиться на одном оперативном гексе/.test(HEX), 'запрет снят');
});

test('R44#2: старые окопы начальной расстановки остаются на карте (совместимость)', () => {
  const s = dotSandbox();
  s.run(`
    const ov = getHexOverlay('8,10', true);
    ov.initialFortifications.trenchCells = ['3,3'];
    appData.map.grid['3,3'] = { type: 'grass', squadIds: [], enemySquadIds: [], markers: [], variant: 0, rotation: 0 };
    applyHexOverlays(appData.map.grid, '8,10');
    globalThis.__legacyType = appData.map.grid['3,3'].type;
    globalThis.__count = countHexTrenchCells(ov);
  `);
  assert.equal(s.evalCtx('__legacyType'), 'trenches', 'окоп из старого сейва остаётся');
  assert.equal(s.evalCtx('__count'), 1, 'счётчик окопов видит старую клетку');
});

test('R44#2: в бою на чужом гексе второй расчёт ДОТа не участвует', () => {
  // фильтр startTacticalBattle: отряды, закреплённые на другом оперативном гексе,
  // в этот бой не попадают (остаются на своей позиции)
  assert.match(HTML, /playerSquads = playerSquads\.filter\(squadBelongsToHex\)/);
  assert.match(HTML, /enemySquads = enemySquads\.filter\(squadBelongsToHex\)/);
});

test('R44#2: гейт «Завершить размещение» смотрит на расстановку ДОТов', () => {
  assert.match(HTML, /initialFortificationHexCount\(\) > 0/);
  assert.match(HTML, /initialFortificationComplete\(\)/);
  assert.match(HTML, /Сначала расставьте ДОТы/);
  const button = /id="btnInitialFortificationSetup"[^>]*style="background:#8e44ad; display:none;"/.test(HTML);
  assert.ok(button, 'кнопка ДОТов скрыта по умолчанию (только BeVe и только при наличии ДОТов)');
});

// ─────────────────────── 3. Миникарта кампании ───────────────────────
test('R44#3: миникарта подсвечивает открытый гекс (редактор гекса)', () => {
  const s = sandbox();
  s.run(`
    appData.campaign.opUnits = [{ name: '1-й взвод', col: 3, row: 4 }];
    appData.campaign.enemyOpUnits = [{ name: 'Враг', col: 1, row: 13 }];
    for (let row = 0; row < 15; row++) for (let col = 0; col < 13; col++) {
      appData.campaign.opMapGrid[col + ',' + row] = { types: ['grass'], markers: [] };
    }
    hexEditorState = { hexKey: '8,10', kind: 'trenches', tool: 'trenches' };
    document.getElementById('battleApp').style.display = 'block';
    renderCampaignMiniMap();
  `);
  assert.equal(s.evalCtx('campaignMiniMapCurrentHex()'), '8,10');
  assert.equal(s.evalCtx("document.getElementById('campaignMiniMapPanel').style.display"), 'block');
  assert.equal(s.evalCtx("document.getElementById('campaignMiniMapCaption').textContent"), 'гекс (8,10)');
});

test('R44#3: без редактора подсвечивается гекс идущего боя', () => {
  const s = sandbox();
  s.run(`
    hexEditorState = null;
    appData.currentBattleId = 77;
    appData.campaign.activeBattles = [{ id: 77, hexKey: '5,6' }];
    appData.campaign.opMapGrid['5,6'] = { types: ['trees'], markers: [] };
    document.getElementById('battleApp').style.display = 'block';
    renderCampaignMiniMap();
  `);
  assert.equal(s.evalCtx('campaignMiniMapCurrentHex()'), '5,6');
  assert.equal(s.evalCtx("document.getElementById('campaignMiniMapCaption').textContent"), 'гекс (5,6)');
});

test('R44#3: на карте кампании (без боя) миникарта скрыта', () => {
  const s = sandbox();
  s.run(`
    hexEditorState = null;
    document.getElementById('battleApp').style.display = 'none';
    renderCampaignMiniMap();
  `);
  assert.equal(s.evalCtx('campaignMiniMapVisible()'), false);
  assert.equal(s.evalCtx("document.getElementById('campaignMiniMapPanel').style.display"), 'none');
});

test('R44#3: миникарта вызывается при входе в бой и в редактор гекса', () => {
  assert.match(HTML, /id="campaignMiniMapPanel"/);
  assert.match(HTML, /id="campaignMiniMapCanvas"/);
  assert.match(HTML, /function renderCampaignMiniMap\(\)/);
  assert.match(HTML, /if \(typeof renderCampaignMiniMap === 'function'\) \{ try \{ renderCampaignMiniMap\(\); \} catch \(e\) \{\} \}/);
  assert.match(HEX, /if \(typeof renderCampaignMiniMap === 'function'\) renderCampaignMiniMap\(\);/);
});

// ─────────────────────────── версия и оформление ───────────────────────────
test('v13.066: версия одинакова в приложении, манифесте и кэше', () => {
  const m = /var APP_VERSION = 'v(\d+\.\d+)'/.exec(HTML);
  assert.ok(m, 'APP_VERSION найден');
  const v = m[1].replace('.', '\\.');
  assert.match(HTML, new RegExp('<title>Боевой модуль v' + v));
  assert.match(fs.readFileSync(ROOT + '/manifest.json', 'utf8'), new RegExp('БМ v' + v));
  assert.match(fs.readFileSync(ROOT + '/service-worker.js', 'utf8'), new RegExp("const CACHE_NAME = 'wargame-v" + v + "'"));
});

test('v13.066: пункт боепитания пересчитывается перед отрисовкой карты боя', () => {
  assert.match(HTML, /syncLiveMapSupplyPoints\(\);/);
  assert.match(HTML, /syncSupplyPointsOnGrid\(tacticalMap, playerSquads, 'squadIds', 'player'\)/);
  assert.match(HTML, /if \(typeof syncBattleRecordSupplyPoints === 'function'\) syncBattleRecordSupplyPoints/);
});

console.log(`\nИтог v13.066: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) {
  failures.forEach(f => console.log('  · ' + f));
  process.exitCode = 1;
}
