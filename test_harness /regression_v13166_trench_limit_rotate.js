'use strict';
// ⚡ v13.166 — два замечания по окопам:
//   1) при расстановке окопов по приказу кнопки поворота появлялись, но были
//      недоступны (disabled) — баннер редактора не перерисовывался после клика
//      по клетке, а выбранная клетка не подсвечивалась для поворота;
//   2) окопов по приказу можно было поставить бесконечное количество — лимит
//      хранился как объект и сравнение «отмечено ≥ лимита» не срабатывало.
//      Новое правило: лимит по ЖИВЫМ БОЙЦАМ отряда — 8 бойцов = 1 гекс окопов,
//      у сапёров 5 бойцов = 1 гекс (округление вниз); то же для расчистки.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML } = require('./extract');
const ROOT = path.join(__dirname, '..');
const HEXMAPS = fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
const CURRENT_VERSION = (/var APP_VERSION = '([^']+)'/.exec(HTML) || [])[1] || '';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}
const fighters = (n, hp = 3) => Array.from({ length: n }, () => ({ hp }));
const wp = Array.from({ length: 36 }, (_, i) => ({ col: i % 6, row: Math.floor(i / 6) }));

// Песочница с редактором окопов и черновиком приказа
function openDraft(unit, kind, terrainPatch) {
    fs.writeFileSync('/tmp/wg_part.js', sliceFunction(HTML, 'rotateSelectedHex'));
    const s = createSandbox(freshAppData());
    s.run(`
var appData = globalThis.appData;
appData.campaign.hexOverlays = {};
appData.campaign.currentTurn = 1;
var unit = ${JSON.stringify(unit)};
appData.campaign.opUnits = [unit];
globalThis.bannerRenders = 0;
showHexEditorBanner = function () { globalThis.bannerRenders++; };
log = function () {};
redrawMap = function () {};
appData.map = { grid: {}, mode: 'hexEdit', hexKey: '4,4' };
for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) appData.map.grid[c + ',' + r] = { type: 'grass', variant: 0, rotation: 0, level: 0 };
Object.keys(${JSON.stringify(terrainPatch || {})}).forEach(k => { appData.map.grid[k].type = ${JSON.stringify(terrainPatch || {})}[k]; });
hexEditorState = { hexKey: '4,4', kind: '${kind || 'trenches'}', rule: hexEditRuleFor('${kind || 'trenches'}'),
  baseGrid: JSON.parse(JSON.stringify(appData.map.grid)), undo: [], placed: 0, lastCell: null, draftMode: true };
beginPendingHexEditDraft('4,4', '${kind || 'trenches'}', unit.name);
`);
    return s;
}
const INFANTRY_27 = {
    name: '1-й взвод', col: 4, row: 4,
    squads: [{ name: 'Отд1', fighters: fighters(9) }, { name: 'Отд2', fighters: fighters(9) },
             { name: 'Отд3', fighters: fighters(9) }]
};
const INFANTRY_20 = {
    name: '2-й взвод', col: 4, row: 4,
    squads: [{ name: 'Отд1', fighters: fighters(5) }, { name: 'Отд2', fighters: fighters(15) }]
};
const SAPPER_14 = {
    name: '1-й Саперный взвод', col: 4, row: 4, type: 'engineer_platoon',
    squads: [{ name: 'Саперное отделение №1', fighters: fighters(7) },
             { name: 'Саперное отделение №2', fighters: fighters(7) }]
};

console.log('— п.1: кнопки поворота окопа доступны в режиме расстановки —');
{
    const s = openDraft(INFANTRY_27);
    ok(s.evalCtx('hexEditSelectedTrenchCell()') === null, 'до клика клетка для поворота не выбрана');
    s.run("hexEditClick('0,0');");
    ok(s.evalCtx('hexEditorState.lastCell') === '0,0', 'клик по клетке её запоминает');
    ok(s.evalCtx('hexEditSelectedTrenchCell()') === '0,0', 'выбранная клетка окопа видна кнопкам поворота');
    ok(s.evalCtx('bannerRenders') >= 1, 'баннер редактора перерисовывается после клика (кнопки включаются)');
    s.run('rotateSelectedHex(60);');
    ok(s.evalCtx("appData.map.grid['0,0'].rotation") === 60, 'поворот +60° применяется к выбранной клетке');
    ok(s.evalCtx("JSON.stringify(pendingHexEditDraft('4,4').rotations)") === '{"0,0":60}',
        'угол сохраняется в черновике приказа');
    ok(s.evalCtx("JSON.stringify((getHexOverlay('4,4', false) || {}).hexRotations || {})") === '{}',
        'до выполнения приказа угол НЕ применяется к карте боя');
    s.run('rotateSelectedHex(-999);');
    ok(s.evalCtx("appData.map.grid['0,0'].rotation") === 0, '«Исходный вид» возвращает 0°');
    ok(/refreshBanner/.test(HEXMAPS), 'отрисовка баннера вызывается из клика по черновику');
    ok(/if \(st\.draftMode \|\| pendingHexEditDraftActive\(st\.hexKey\)\)/.test(HEXMAPS),
        'клик по черновику перехватывается даже если флаг режима не выставлен');
    ok(/gridCell && gridCell\.type === 'trenches'/.test(HEXMAPS), 'уже применённый окоп тоже можно крутить');
}

console.log('— п.2: лимит окопов по живым бойцам —');
{
    ok(/const HEX_EDIT_FIGHTERS_PER_TRENCH = 8;/.test(HEXMAPS), 'норма 8 живых бойцов на гекс окопа');
    ok(/const HEX_EDIT_FIGHTERS_PER_TRENCH_SAPPER = 5;/.test(HEXMAPS), 'у сапёров 5 живых бойцов на гекс');

    const inf = openDraft(INFANTRY_27);
    ok(inf.evalCtx("pendingHexEditDraft('4,4').limit") === 3, '27 бойцов → 3 гекса окопов (27 ÷ 8)');
    ok(inf.evalCtx("pendingHexEditDraft('4,4').limit") === 3 && typeof inf.evalCtx("pendingHexEditDraft('4,4').limit") === 'number',
        'лимит в черновике — ЧИСЛО, а не объект (раньше проверка не срабатывала)');
    inf.run("for (let c = 0; c < 5; c++) hexEditClick(c + ',0');");
    ok(inf.evalCtx("Object.keys(pendingHexEditDraft('4,4').cells).length") === 3,
        'больше трёх отметок поставить нельзя');
    ok(inf.evalCtx("JSON.stringify(Object.keys(pendingHexEditDraft('4,4').cells))") === '["0,0","1,0","2,0"]',
        'лишние клики не добавляют клетки');

    const inf20 = openDraft(INFANTRY_20);
    ok(inf20.evalCtx("pendingHexEditDraft('4,4').limit") === 2, '20 бойцов → 2 гекса (округление вниз)');
    // убитые бойцы не считаются
    const wounded = openDraft(INFANTRY_27);
    wounded.run("appData.campaign.opUnits[0].squads.forEach(sq => sq.fighters.forEach((f, i) => { if (i > 2) f.hp = 0; }));");
    wounded.run("pendingHexEditDraft('4,4').limit = draftLimitForUnit('trenches', appData.campaign.opUnits[0].name).limit;");
    ok(wounded.evalCtx("pendingHexEditDraft('4,4').limit") === 1, '9 живых бойцов из 27 → 1 гекс');

    const sap = openDraft(SAPPER_14);
    ok(sap.evalCtx("pendingHexEditDraft('4,4').limit") === 2, 'сапёры: 14 бойцов → 2 гекса (14 ÷ 5)');
    sap.run("for (let c = 0; c < 4; c++) hexEditClick(c + ',0');");
    ok(sap.evalCtx("Object.keys(pendingHexEditDraft('4,4').cells).length") === 2, 'у сапёров тоже действует предел');
    ok(/hexEditUnitIsSapper/.test(HEXMAPS) && /engineer_platoon/.test(HEXMAPS), 'сапёрный отряд определяется по типу и названию');
    ok(/сап\[её\]р/.test(HEXMAPS), 'сапёрные отделения узнаются по названию');
}

console.log('— п.2: расчистка местности — тот же лимит —');
{
    const prep = openDraft({
        name: 'Лесной взвод', col: 4, row: 4,
        squads: [{ name: 'Отд1', fighters: fighters(12) }, { name: 'Отд2', fighters: fighters(12) }]
    }, 'prep', { '0,0': 'forest', '1,0': 'forest', '2,0': 'bushes', '3,0': 'bushes', '4,0': 'bushes' });
    ok(prep.evalCtx("pendingHexEditDraft('4,4').limit") === 3, 'расчистка: 24 бойца → 3 клетки (24 ÷ 8)');
    prep.run("hexEditClick('0,0'); hexEditClick('1,0'); hexEditClick('2,0'); hexEditClick('3,0'); hexEditClick('4,0');");
    ok(prep.evalCtx("Object.keys(pendingHexEditDraft('4,4').cells).length") === 3,
        'клеток расчистки не больше лимита по живым бойцам');
}

console.log('— п.2: выполнение приказа не выдаёт больше лимита —');
{
    const s = createSandbox(freshAppData());
    s.run(`
var appData = globalThis.appData;
appData.campaign.opUnits = ${JSON.stringify(INFANTRY_27)} && [${JSON.stringify(INFANTRY_27)}];
appData.campaign.hexOverlays = {};
log = function () {};
function showHexEditButton() {}
function queueHexEditPrompt() {}
function renderHexEditsPanel() {}
function isEnemyOperationalUnit() { return false; }
function saveHexOverlays() {}
function applyHexEditsToBattle() {}
if (typeof window === 'undefined') window = globalThis;
`);
    const limit = s.evalCtx("countSquadsForHexEdit(appData.campaign.opUnits[0])");
    ok(limit === 3, 'countSquadsForHexEdit теперь = число гексов по живым бойцам', limit);
    s.run("grantTrenchPoints('4,4', countSquadsForHexEdit(appData.campaign.opUnits[0]), '1-й взвод');");
    ok(s.evalCtx("getHexOverlay('4,4', false).trenchPoints") === 3, 'приказ выдаёт 3 очка окопов');
    s.run("grantTrenchPoints('4,4', countSquadsForHexEdit(appData.campaign.opUnits[0]), '1-й взвод');");
    ok(s.evalCtx("getHexOverlay('4,4', false).trenchPoints") === 3,
        'повторный приказ на том же гексе не накапливает очки сверх лимита');
    s.run("grantPrepPoints('4,4', countSquadsForHexEdit(appData.campaign.opUnits[0]), '1-й взвод');");
    ok(s.evalCtx("getHexOverlay('4,4', false).prepPoints") === 3, 'расчистка выдаётся по тому же лимиту');
    s.run("grantPrepPoints('4,4', countSquadsForHexEdit(appData.campaign.opUnits[0]), '1-й взвод');");
    ok(s.evalCtx("getHexOverlay('4,4', false).prepPoints") === 3, 'и тоже не копится сверх лимита');
}

console.log('— подписи и подсказки —');
{
    ok(/8 бойцов = 1 гекс, у сапёров 5 бойцов = 1 гекс/.test(HEXMAPS), 'подсказка редактора объясняет новую норму');
    ok(/Лимит по приказу/.test(HEXMAPS), 'в баннере редактора видно лимит по приказу');
    ok(/по живым бойцам/.test(HTML), 'в коде приказа окапывания указана причина лимита');
}

console.log('— версия и сборка —');
{
    ok(/^v\d+\.\d+$/.test(CURRENT_VERSION), 'APP_VERSION в формате vNN.NNN', CURRENT_VERSION);
    ok(SW.indexOf('wargame-' + CURRENT_VERSION) >= 0, 'CACHE_NAME совпадает с APP_VERSION');
    ok(MANIFEST.indexOf(CURRENT_VERSION) >= 0, 'manifest.short_name совпадает с APP_VERSION');
    ok(HEXMAPS.split('\n')[0].indexOf(CURRENT_VERSION) >= 0, 'BUILD-маркер js/hexmaps.js = ' + CURRENT_VERSION);
}

console.log('');
if (fails.length) {
    console.log('Итог v13.166: PASS ' + pass + ' · FAIL ' + fails.length);
    fails.forEach(f => console.log('   ✗ ' + f));
    process.exit(1);
} else {
    console.log('Итог v13.166 (поворот окопов доступен, лимит окопов и расчистки по живым бойцам): PASS ' + pass + ' · FAIL 0');
}
