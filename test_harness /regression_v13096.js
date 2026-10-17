// v13.096: actual card rows in the post-communications menu and visible DOT sectors.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { failed++; console.error(`✗ ${name}: ${error.message}`); }
}
function loadHtml(s, names) { names.forEach(name => s.run(sliceFunction(HTML, name))); }
function json(s, expression) { return JSON.parse(s.evalCtx(`JSON.stringify(${expression})`)); }

function cardsSandbox() {
  const s = createSandbox(freshAppData());
  s.run(sliceConst(HTML, 'INITIAL_CAMPAIGN_CARD_CATEGORIES'));
  loadHtml(s, ['computeSubFactionFromSquads', 'getUnitCardFactionContext', 'getCardDefinitionByName',
    'getCardTargetSpec', 'getCardTargetCandidates', 'isCardAvailableToUnit', 'isCardSelectableOpUnit',
    'collectCardLibraryForContext', 'escapeCardHtml', 'initialCampaignCardUnitHtml',
    'initialCardDistributionHtml', 'saveInitialCampaignCardDraft', 'openInitialCardDistributionStage', 'countBattalionBonusCardCopies', 'campaignBonusCardLimitReached',
    'getFactionScopedCardEntries', 'getRandomNegativeCardForUnit', 'addAppliedCardName',
    'applyCardToPlatoon', 'commitInitialCampaignCardAssignments', 'tacticalCurrentCellForSquad']);
  s.run(`
    var selectedFaction = 'BeVe';
    appData.templates = SQUAD_TEMPLATES;
    appData.factions = {
      BeVe: { cardLibrary: BEVE_CARDS }, 'A.I.R.F.': { cardLibrary: AIRF_CARDS },
      _global: { cardLibrary: GLOBAL_CARDS.concat([
        { name: 'Общая тестовая карта', type: 'bonus', effect: 'Общий бонус' },
        { name: 'Бонус без типа', effect: 'Бонус' }
      ]) }
    };
    function isBicycleTacticalSquad(squad) { return squad.mobilityType === 'bicycle'; }
    function getCurrentCampaignBattle() { return null; }
    function platoon(faction, type, subfaction) {
      return { name: faction + ' ' + type + ' ' + subfaction, type, faction,
        squads: [{ name: 'Пехотное отделение', faction, subfaction, ammoSmall: 12, grenades: 3,
          fighters: [{ name: 'Боец', hp: 3, maxHp: 3 }] }] };
    }
  `);
  return s;
}

for (const [faction, subfaction] of [['BeVe', 'belgian'], ['BeVe', 'dutch'], ['A.I.R.F.', null]]) {
  test(`карточное меню: все бонусы ${faction}/${subfaction || 'common'} и общие, без дубликатов`, () => {
    const s = cardsSandbox();
    s.run(`
      var unit = platoon(${JSON.stringify(faction)}, 'infantry_platoon', ${JSON.stringify(subfaction)});
      var context = getUnitCardFactionContext(unit);
      var expected = collectCardLibraryForContext(context).filter(card => (card.type || 'bonus') === 'bonus');
      var rows = initialCampaignCardUnitHtml(unit, 2);
    `);
    const rows = s.evalCtx('rows');
    const cards = json(s, 'expected');
    assert(cards.length > 5, 'real faction catalog must not be empty');
    assert.equal((rows.match(/class="initial-campaign-card"/g) || []).length, cards.length);
    assert(!rows.includes('Нет доступных бонусных карт.'));
    for (const card of cards) {
      assert(rows.includes(`data-card-name="${card.name}"`), `missing ${card.name}`);
      assert(rows.includes(`data-card-faction="${card.faction}"`), `missing owner ${card.faction}`);
    }
    assert(rows.includes('Общая тестовая карта'));
    assert(rows.includes('Бонус без типа'));
    assert.equal((rows.match(/data-card-name="Двойной БК"/g) || []).length, 1);
    assert(!rows.includes('data-card-name="Нестабильные гранаты"'), 'negative cards are automatic, not selectable');
    if (faction === 'A.I.R.F.') assert(!rows.includes('data-card-name="Фламандская Фурия"'));
    else assert(!rows.includes('data-card-name="Термитный заряд"'));
    if (subfaction === 'belgian') assert(!rows.includes('data-card-name="Кальвинистская эффективность"'));
    if (subfaction === 'dutch') assert(!rows.includes('data-card-name="Фламандская Фурия"'));
  });
}

test('«Торговый дух» BeVe доступен трижды на батальон и не доступен AIRF-сапёрам', () => {
  const s = cardsSandbox();
  s.run(`
    function getCurrentCampaignBattle() { return {id:99}; }
    var existing = platoon('BeVe','infantry_platoon','belgian');
    existing.cardSelection={done:true,cards:[{name:'Торговый дух',type:'bonus'}]};
    var beveEngineer = platoon('BeVe','engineer_platoon',null);
    var airfEngineer = platoon('A.I.R.F.','engineer_platoon',null);
    var trade = {name:'Торговый дух',type:'bonus'};
    appData.campaign.opUnits=[existing,beveEngineer,airfEngineer];
    var copies=countBattalionBonusCardCopies('Торговый дух');
    var twoCopiesAvailable=campaignBonusCardLimitReached(trade,beveEngineer);
    var beveAvailable=isCardAvailableToUnit(trade,beveEngineer,beveEngineer.squads);
    existing.cardSelection.cards.push({name:'Торговый дух',type:'bonus'},{name:'Торговый дух',type:'bonus'});
    var threeCopies=countBattalionBonusCardCopies('Торговый дух');
    var fourthBlocked=campaignBonusCardLimitReached(trade,beveEngineer);
    var airfAvailable=isCardAvailableToUnit(trade,airfEngineer,airfEngineer.squads);
  `);
  assert.equal(s.evalCtx('copies'), 1);
  assert.equal(s.evalCtx('twoCopiesAvailable'), false, 'вторую карту можно назначить при лимите 3 на батальон');
  assert.equal(s.evalCtx('beveAvailable'), true, 'до третьей карты BeVe-доступность сохраняется');
  assert.equal(s.evalCtx('threeCopies'), 3);
  assert.equal(s.evalCtx('fourthBlocked'), true, 'четвёртая карта блокируется после исчерпания лимита');
  assert.equal(s.evalCtx('airfAvailable'), false, 'обход ограничения карт сапёрами не снимает BeVe-привязку');
});

test('«Торговый дух» включён в лимит 4 и отменяет дебафф за третью бонусную', () => {
  const s = cardsSandbox();
  s.run(`
    var unit=platoon('BeVe','infantry_platoon','belgian');
    appData.campaign.opUnits=[unit];
    var ok=commitInitialCampaignCardAssignments([{unitName:unit.name,cards:[
      {name:'Торговый дух',faction:'BeVe'},
      {name:'Двойной БК',faction:'BeVe'},
      {name:'Общая тестовая карта',faction:'_global'},
      {name:'Бонус без типа',faction:'_global'}
    ]}]);
  `);
  assert.equal(s.evalCtx('ok'), true, 'допустимы четыре бонусные карты вместе с «Торговым духом»');
  assert.equal(s.evalCtx('unit.cardSelection.cards.filter(card=>card.type === "bonus").length'), 4);
  assert.equal(s.evalCtx('unit.cardSelection.cards.filter(card=>card.type === "negative").length'), 0, 'авто-дебафф не добавляется');
});

test('этап после связи действительно содержит карточки пехоты, сапёров и разведки', () => {
  const s = cardsSandbox();
  s.run(`
    appData.campaign.opSetupStage = 'cards';
    appData.campaign.opUnits = [platoon('BeVe', 'infantry_platoon', 'belgian'),
      platoon('A.I.R.F.', 'engineer_platoon', null), platoon('A.I.R.F.', 'recon_platoon', null)];
    openInitialCardDistributionStage();
  `);
  const menu = s.elements.initialCardStageOverlay;
  assert.equal(menu.style.display, 'block');
  assert.equal((menu.innerHTML.match(/class="initial-card-unit"/g) || []).length, 3);
  assert((menu.innerHTML.match(/class="initial-campaign-card"/g) || []).length > 15);
  assert(menu.innerHTML.includes('Термитный заряд'), 'sappers must see faction-specific cards');
  assert(menu.innerHTML.includes('Торговый дух'), 'initial menu must not discard informational faction cards');
});

test('карты из строк меню закрепляются за выбранным взводом, третья добавляет дебафф', () => {
  const s = cardsSandbox();
  s.run(`
    var unit = platoon('BeVe', 'infantry_platoon', 'belgian');
    var other = platoon('A.I.R.F.', 'engineer_platoon', null);
    appData.campaign.opUnits = [unit, other];
    var ok = commitInitialCampaignCardAssignments([{ unitName: unit.name, cards: [
      { name: 'Двойной БК', faction: 'BeVe' },
      { name: 'Общая тестовая карта', faction: '_global' },
      { name: 'Бонус без типа', faction: '_global' }
    ], targets: { 'Двойной БК': ['Пехотное отделение'] } }]);
  `);
  assert.equal(s.evalCtx('ok'), true);
  assert.equal(s.evalCtx('unit.squads[0].ammoSmall'), 24);
  assert.equal(s.evalCtx('other.squads[0].ammoSmall'), 12);
  assert.equal(s.evalCtx('unit.cardSelection.cards.filter(card => card.type === "bonus").length'), 3);
  assert.equal(s.evalCtx('unit.cardSelection.cards.filter(card => card.type === "negative").length'), 1);
  assert.equal(s.evalCtx('appData.campaign.initialPlatoonCardsAssigned'), true);
});

function dotSandbox(name = 'ДОТ Bosh') {
  const s = createSandbox(freshAppData());
  s.run(`
    function getFactionCrewWeapons() { return BEVE_CREW_WEAPONS; }
    var dot = JSON.parse(JSON.stringify(SQUAD_TEMPLATES.find(s => s.name === ${JSON.stringify(name)})));
    dot.fixedTacticalPosition = { hexKey: '3,3', key: '4,4', weaponSectors: { 0: 'e', 1: 'w', 2: 'ne' } };
    appData.campaign.opUnits = [{ name: 'ДОТы', squads: [dot] }];
    appData.map = { mode: 'hexEdit', baseHexSize: 30, zoomLevel: 1, grid: {}, centers: [] };
    for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) {
      var key = c + ',' + r;
      appData.map.grid[key] = { type: 'grass' };
      appData.map.centers.push({ key,
        x: (c + (r % 2) / 2 + .5) * Math.sqrt(3) * 30, y: (r * 1.5 + 1) * 30 });
    }
    hexEditorState = { kind: 'initialFortification', hexKey: '3,3', dotId: '0:0',
      dotSectorCandidateId: '0:0', dotWeaponSectors: { 0: 'e', 1: 'w', 2: 'ne' } };
    var redraws = 0, saves = 0;
    function redrawMap() { redraws++; }
    function showHexEditorBanner() {}
    function saveHexOverlays() { saves++; }
  `);
  return s;
}

function recordPreview(s) {
  const fills = [], strokes = [];
  let points = [], stack = [];
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() { stack.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle }); },
    restore() { Object.assign(this, stack.pop()); },
    beginPath() { points = []; }, closePath() {}, setLineDash() {},
    moveTo(x, y) { points.push([x, y]); }, lineTo(x, y) { points.push([x, y]); },
    arc(x, y, radius) { points.push([x, y, radius]); },
    fill() { fills.push({ points: points.slice(), color: this.fillStyle, alpha: this.globalAlpha }); },
    stroke() { strokes.push({ points: points.slice(), color: this.strokeStyle, alpha: this.globalAlpha }); }
  };
  s.sandbox.previewCtx = ctx;
  s.run('drawInitialDotSectorOverlay(previewCtx, 30)');
  return { fills, strokes };
}

function filledHexes(s, recording, crewIndex) {
  const color = s.evalCtx(`initialDotSectorColor(${crewIndex})`);
  const centers = json(s, 'appData.map.centers');
  return recording.fills.filter(fill => fill.color === color && fill.points.length === 6).map(fill => {
    const x = fill.points.reduce((sum, point) => sum + point[0], 0) / 6;
    const y = fill.points.reduce((sum, point) => sum + point[1], 0) / 6;
    const center = centers.find(c => Math.hypot(c.x - x, c.y - y) < .01);
    assert(center, 'filled hex must be on the map');
    return center.key;
  }).sort();
}

test('секторы Bosh: подсвечены все клетки внутри 90°/60°, границы выходят за клетку ДОТа', () => {
  const s = dotSandbox();
  const recording = recordPreview(s);
  assert(recording.fills.length > 10);
  for (const crewIndex of [0, 1, 2]) {
    const expected = json(s, `appData.map.centers.filter(center => tacticalHexInFireSector(
      '4,4', center.key, hexEditorState.dotWeaponSectors[${crewIndex}], dotSectorWidthDeg(dot, ${crewIndex})))
      .map(center => center.key).sort()`);
    assert.deepEqual(filledHexes(s, recording, crewIndex), expected);
  }
  assert(recording.strokes.some(stroke => stroke.points.some(point =>
    Math.hypot(point[0] - s.evalCtx('appData.map.centers[40].x'), point[1] - s.evalCtx('appData.map.centers[40].y')) > 150)),
    'sector lines must span the map, not hide under the DOT icon');
});

test('Van Hees: круговое орудие подсвечивает всю карту, пулемёт только свои 90°', () => {
  const s = dotSandbox('ДОТ Van Hees');
  const recording = recordPreview(s);
  assert.equal(filledHexes(s, recording, 0).length, 80);
  assert(filledHexes(s, recording, 1).length < 40);
});

test('клик/список меняют подсветку, сохраняют направление и выделяют выбранную амбразуру', () => {
  const s = dotSandbox();
  s.run('setInitialDotWeaponSector(1, "e"); setInitialDotSectorPick(1);');
  const east = recordPreview(s);
  assert(filledHexes(s, east, 1).includes('8,4'));
  assert(!filledHexes(s, east, 1).includes('0,4'));
  const activeColor = s.evalCtx('initialDotSectorColor(1)');
  const activeAlpha = Math.max(...east.fills.filter(fill => fill.color === activeColor).map(fill => fill.alpha));
  const otherAlpha = Math.max(...east.fills.filter(fill => fill.color !== activeColor).map(fill => fill.alpha));
  assert(activeAlpha > otherAlpha, 'selected embrasure must stand out');
  s.run('applyInitialDotSectorPick(hexEditorState, "0,4");');
  const west = recordPreview(s);
  assert(filledHexes(s, west, 1).includes('0,4'));
  assert(!filledHexes(s, west, 1).includes('8,4'));
  assert.equal(s.evalCtx('dot.fixedTacticalPosition.weaponSectors[1]'), 'w');
  assert.equal(s.evalCtx('hexEditorState.dotSectorPickCrew'), null);
  assert(s.evalCtx('redraws') >= 3);
});

test('смена ДОТа сбрасывает выбор амбразуры и сразу перерисовывает карту', () => {
  const s = dotSandbox();
  s.run(`
    var secondDot = JSON.parse(JSON.stringify(dot));
    secondDot.fixedTacticalPosition.key = '2,2';
    appData.campaign.opUnits[0].squads.push(secondDot);
    setInitialDotSectorPick(2);
    setInitialDotCandidate('0:1');
  `);
  assert.equal(s.evalCtx('hexEditorState.dotSectorPickCrew'), null);
  assert(s.evalCtx('redraws') >= 2);
});

test('подсветка не рисуется для другого гекса, неразмещённого ДОТа или вне редактора', () => {
  for (const setup of [
    'hexEditorState.hexKey = "7,7"',
    'delete dot.fixedTacticalPosition',
    'hexEditorState = null',
    'appData.map.mode = "view"',
    'hexEditorState.kind = "trenches"'
  ]) {
    const s = dotSandbox();
    s.run(setup);
    const recording = recordPreview(s);
    assert.equal(recording.fills.length + recording.strokes.length, 0, setup);
  }
});

test('сектора рисуются отдельным верхним слоем, после всей местности', () => {
  const redraw = sliceFunction(HTML, 'redrawMap');
  assert(redraw.indexOf('drawInitialDotSectorOverlay(ctx, size)') > redraw.indexOf('drawHex(ctx, x, y, size, hexData, key)'));
});

test('версия приложения, offline-кэша, manifest и маркеры сборки синхронизированы', () => {
  const version = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
  assert.match(version, /^v13\.\d{3}$/);
  const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert(read('service-worker.js').includes(`const CACHE_NAME = 'wargame-${version}';`));
  assert.equal(JSON.parse(read('manifest.json')).short_name, `БМ ${version}`);
  for (const file of ['js/data.js', 'js/cards.js', 'js/templates.js', 'js/hexmaps.js', 'js/operational_ui.js', 'service-worker.js']) {
    assert(read(file).startsWith(`// ⚡ BUILD-МАРКЕР: ${version}`), file);
  }
});

console.log(`\nv13.096 regression: ${passed} PASS, ${failed} FAIL`);
process.exitCode = failed ? 1 : 0;
