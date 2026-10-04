// ⚡ v13.061: regressions for operational placement zone, trenches, enemy-side prompts and 82-mm mortar range.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const FNS = [
    'maybeAutoPlaceAtStart', 'rotateSelectedHex', 'executeOpShoot', 'is82mmMortarSquad',
    'operationalMediumArtilleryRange', 'isMediumArtillery', 'isMortarUnit', 'artilleryCaliberMm',
    'onlinePushHexOverlays'
];
fs.writeFileSync('/tmp/wg_part.js', FNS.map(name => sliceFunction(HTML, name)).join('\n\n'));

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}
function fresh() {
    const appData = freshAppData();
    return { appData, s: createSandbox(appData) };
}

console.log('== v13.061 field regressions ==');

// Online deployment must keep the start zone visible and avoid silently auto-placing units.
{
    const { appData, s } = fresh();
    s.run('var autoPlaceCalls = 0; function autoPlaceUnplacedUnits() { autoPlaceCalls++; return 7; } ' +
          'function getUnplacedOpUnits() { return [{ name: "не размещён" }]; } ' +
          'var ONLINE = { started: true, match: { status: "placing" } }; ' +
          'appData.campaign.online = true; appData.campaign.currentTurn = 1;');
    const placed = s.evalCtx('maybeAutoPlaceAtStart()');
    const calls = s.evalCtx('autoPlaceCalls');
    ok(placed === 0 && calls === 0, 'Онлайн-расстановка не автозаполняется до подтверждения игрока');
    ok(/onlinePlacementPhase/.test(HTML) && /onlinePlacementPhase \|\| hasUnplacedPlayerUnits/.test(HTML),
       'Операционная карта рисует зону весь статус placing, даже если в сохранении есть позиции');
}

// Trench texture cycling, rotation persistence and a hard eight-cell cap.
{
    const { appData, s } = fresh();
    s.run(`
      var baseCell = { type: 'grass', variant: 0, rotation: 0, level: 2, squadIds: [], enemySquadIds: [], markers: [] };
      TACTICAL_HEX_MAPS['4,4'] = { grid: { '0,0': baseCell }, w: 1, h: 1 };
      appData.campaign.hexOverlays = { '4,4': { hexEdits: {}, hexVariants: {}, hexRotations: {}, trenchPoints: 2, prepPoints: 0, shellings: 0 } };
      appData.map = { grid: { '0,0': { ...baseCell } }, mode: 'hexEdit', lastEditedHex: null };
      hexEditorState = { hexKey: '4,4', kind: 'trenches', rule: hexEditRuleFor('trenches'), baseGrid: { '0,0': baseCell }, undo: [], placed: 0 };
    `);
    s.run('hexEditClick("0,0");');
    const first = s.evalCtx('JSON.stringify({ variant: appData.map.grid["0,0"].variant, left: getHexOverlay("4,4", false).trenchPoints })');
    s.run('hexEditClick("0,0");');
    const second = s.evalCtx('JSON.stringify({ variant: appData.map.grid["0,0"].variant, left: getHexOverlay("4,4", false).trenchPoints })');
    s.run('rotateSelectedHex();');
    const rotated = s.evalCtx('JSON.stringify({ rotation: appData.map.grid["0,0"].rotation, saved: getHexOverlay("4,4", false).hexRotations["0,0"] })');
    const variantCount = s.evalCtx('TERRAIN_DATA.trenches.images.length');
    s.run('applyHexOverlays({ "0,0": { type: "grass", variant: 0, rotation: 0, squadIds: [], enemySquadIds: [], markers: [] } }, "4,4");');
    const reapplied = s.evalCtx('appData.map.grid["0,0"].rotation === 60');
    const parsedFirst = JSON.parse(first), parsedSecond = JSON.parse(second), parsedRotated = JSON.parse(rotated);
    ok(parsedFirst.variant === 0 && parsedSecond.variant === 1 && parsedSecond.left === 1 && variantCount > 1,
       'Повторные клики по окопу циклически выбирают текстуру без повторного списания очка');
    ok(parsedRotated.rotation === 60 && parsedRotated.saved === 60 && reapplied,
       'Поворот окопа на 60° сохраняется в overlay и применяется к карте боя');

    // Existing plus initial trenches count toward the same per-map cap.
    s.run(`
      var ovCap = getHexOverlay('4,4', true);
      ovCap.trenchPoints = 0;
      for (var i = 1; i < 8; i++) ovCap.hexEdits[i + ',0'] = 'trenches';
      var grantedAtCap = grantTrenchPoints('4,4', 3, 'Свой взвод');
    `);
    ok(s.evalCtx('countHexTrenchCells(getHexOverlay("4,4", false)) === 8 && grantedAtCap === 0'),
       'Нельзя получить или разместить больше восьми клеток окопов на тактической карте гекса');
}

// An enemy's entrenchment budget is private to that side and does not generate a local prompt.
{
    const { appData, s } = fresh();
    s.run(`appData.campaign.enemyOpUnits = [{ name: 'Противник', faction: 'AIRF' }];
          grantTrenchPoints('5,5', 3, 'Противник');`);
    ok(s.evalCtx('(getHexOverlay("5,5", false).trenchPoints || 0) === 0 && __hexEditPromptQueue.length === 0') && s.alerts.length === 0,
       'Окапывание противника не выдаёт игроку бюджет и не вызывает окно размещения');

    const { appData: onlineData, s: online } = fresh();
    online.run(`var ONLINE = { role: 'p2', started: true, match: { status: 'playing' }, docRef: { update: function(v) { window.__pushed = v; return Promise.resolve(); } } };
      appData.campaign.online = true;
      var localOverlay = getHexOverlay('6,6', true); localOverlay.trenchPoints = 2; localOverlay.prepPoints = 1;
      localOverlay.hexEdits['0,0'] = 'trenches';
      onlinePushHexOverlays();`);
    const outgoing = online.evalCtx('window.__pushed["state.p2.hexOverlays"]["6,6"]');
    ok(outgoing && outgoing.trenchPoints === undefined && outgoing.prepPoints === undefined && outgoing.hexEdits['0,0'] === 'trenches',
       'Онлайн-снимок передаёт фактические правки, но не чужие неиспользованные бюджеты приказов');
    online.run("ONLINE = { role: 'p2' }; mergeHexOverlays({ '6,6': { trenchPoints: 4, prepPoints: 2, shellings: 1, hexEdits: { '1,0': 'trenches' } } });");
    ok(online.evalCtx('getHexOverlay("6,6", false).trenchPoints === 2 && getHexOverlay("6,6", false).prepPoints === 1'),
       'Слияние облачных данных не копирует бюджеты окопов/позиций соперника');
}

// 82-mm mortars have a hard five-hex limit in operational fire and map-target selection.
{
    const { appData, s } = fresh();
    s.sandbox.getFactionCrewWeapons = () => [{ type: 'mortar', name: 'Минометный расчёт 82мм' }];
    s.run(`var op82 = { type: 'mortar_battery', name: 'Батарея 82-мм миномётов' };
      var op50 = { type: 'mortar_battery', name: 'Батарея 50-мм миномётов' };
      var sau = { type: 'sau_battery', name: 'Батарея САУ' };
      var squad82 = { name: 'Миномётный взвод', faction: 'BeVe', crewInstances: [{ weaponName: 'Минометный расчёт 82мм' }] };`);
    const range82 = s.evalCtx('operationalMediumArtilleryRange(op82)');
    const range50 = s.evalCtx('operationalMediumArtilleryRange(op50)');
    const rangeSau = s.evalCtx('operationalMediumArtilleryRange(sau)');
    const recognized = s.evalCtx('is82mmMortarSquad(squad82)');
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8'), s.ctx, { filename: 'js/map_actions.js' });
    s.run(`
      var targetDistanceForTest = 6;
      function getBattleSquadHex(_grid, idx, isEnemy) { const col = isEnemy ? targetDistanceForTest : 0; return { key: col + ',0', col, row: 0 }; }
      function hexGridDistance(c1, r1, c2, r2) { return Math.max(Math.abs(c1-c2), Math.abs(r1-r2)); }
      function getTacticalCoverInfoForEnemy() { return { mod: 0, label: '', pos: { col: 6, row: 0, key: '6,0' } }; }
      function smallArmsBlockedByForest() { return null; }
      appData.squads = [squad82];
      appData.map = { grid: {}, enemySquads: [{ name: 'Цель', fighters: [{ hp: 1 }] }] };
      var rangeEval6 = mapActionEvalTarget({ id: 'ordnance', targets: 'any' }, 0, 0);
      targetDistanceForTest = 5;
      var rangeEval5 = mapActionEvalTarget({ id: 'ordnance', targets: 'any' }, 0, 0);
    `);
    ok(range82 === 5 && range50 === 10 && rangeSau === 10 && recognized,
       '82-мм ограничен пятью гексами; дальность 50-мм миномёта и прочей артиллерии не меняется');
    s.run(`var manualMortarShots = [];
      executeMortarSalvo = function() { manualMortarShots.push(Array.from(arguments)); };
      mortarRoundsForUnit = function(_unit, n) { return n; };
      opShootingState.shooter = op82;
      executeOpShoot([{ name: 'цель', col: 5, row: 0 }], 5);
      opShootingState.shooter = op82;
      executeOpShoot([{ name: 'дальняя цель', col: 6, row: 0 }], 6);`);
    ok(s.evalCtx('manualMortarShots.length === 1 && manualMortarShots[0][2] === 5 && manualMortarShots[0][3] === 15'),
       'Ручная стрельба 82-мм миномёта доступна на пяти гексах и блокируется дальше пяти');
    ok(s.evalCtx('rangeEval6.ok === false && /6 > 5/.test(rangeEval6.reason) && rangeEval5.ok === true'),
       'Действие «орудия/миномёты» отклоняет цель дальше пяти гексов, но допускает ровно пять');
    const shootOrderBody = sliceFunction(HTML, 'executeShootOrder');
    ok(/is82mmMortarSquad\(currentSquad\) && dist > 5/.test(HTML) &&
       /const maxRange = isMediumArt \? operationalMediumArtilleryRange\(unit\) : 3/.test(shootOrderBody) &&
       /effectiveRange": 5/.test(fs.readFileSync(path.join(ROOT, 'js/weapons.js'), 'utf8')),
       'Пять гексов проверяются в атаке и операционном приказе, оружейная дальность 82-мм обновлена');
}

console.log(`\nИтог v13.061: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exitCode = 1;
