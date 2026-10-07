// ⚡ v13.067: регрессии текущего релиза —
//    1) связисты, приданные юниту, вливаются в штатное отделение получателя
//       («Радист 1/2» / «Телефонист 1/2»): личный состав штаба растёт на пару;
//    2) штаты штабов рот (9 чел.) и батальона (15 чел., включая 2 радистов и
//       2 телефонистов) — и в шаблонах, и в уже существующих сохранениях;
//    3) резерв пар связистов хранится отдельно от личного состава штаба;
//       связистов не теряет возврат из боя и они не считаются боевым составом.
//    Запуск: node 'test_harness /regression_v13067.js' (после regression_v13066.js)
'use strict';
const fs = require('fs');
const assert = require('assert/strict');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const TEMPLATES = fs.readFileSync(ROOT + '/js/templates.js', 'utf8');
// свежая песочница: чужой /tmp/wg_part.js от предыдущих прогонов не подмешиваем
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗ ' + name + ' — ' + e.message); }
}

const FNS = [
  'ensureSignalPlatoonState', 'isArmoredCommunicationUnit', 'signalAssignmentsFor', 'signalTransferLabel',
  'signalDeviceLabel', 'signalAssignmentId', 'createSignalTeam', 'getSignalTeam', 'signalTeamAlive',
  'findUnitStaffSquad', 'signalStaffRank', 'mergeSignalTeamIntoStaffSquad', 'attachSignalTeamToUnit',
  'signalMergedFighters', 'signalReserveTeams', 'signalReserveStore', 'addSignalTeamToUnit',
  'removeSignalTeamFromUnit', 'getSignalHQ', 'getSignalTeamFromHQ', 'finishSignalTransfer',
  'requestSignalRecall', 'refreshSignalLosses', 'migrateSignalAssignments', 'hqStandardPositions',
  'hqStandardWeapons', 'ensureHQStaffComposition', 'migrateSignalReserve', 'migrateSignalStaffSquads',
  'mergeMissingFightersIntoBattleSquad', 'getOperationalCombatFighters', 'isOpUnitWipedOut',
  'migrateHQPersonnelOnLoad', 'installVehicleRadioMark', 'removeVehicleRadioMark',
  // ⚡ v13.068: в списке батальона появилась шкала боезапаса
  'supplyAmmoBarHtml', 'unitAmmoStatus', 'supplyAmmoPercent', 'supplyOrdnanceFull',
  'cloneTemplate', 'assignUniqueCrewKeys', 'renderBattalionRoster', 'showUnitDetails', 'operationalMoraleMarkup',
  'getOperationalMorale', 'isOperationalMoraleUnit'
];

// ⚡ v13.068: константы снабжения нужны шкале боезапаса
const CONSTS = ['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_DEPOT_MAX',
                'SUPPLY_AMMO_PER_MAN', 'SUPPLY_GREN_PER_MAN', 'SUPPLY_CONVOY_BUDGET'];

function sandbox() {
  const s = createSandbox(freshAppData());
  s.run(CONSTS.map(n => sliceConst(HTML, n)).join('\n') + '\n' +
        FNS.map(n => sliceFunction(HTML, n)).join('\n') + '\n');
  s.run(`
    globalThis.renderCommunicationPanel = function () {};
    globalThis.redrawOperationalMap = function () {};
    globalThis.hasActiveRadioAt = function () { return true; };
    globalThis.hasActivePhoneAt = function () { return true; };
    globalThis.normalizePhoneRoutePoints = function () { return []; };
    globalThis.installVehicleRadioMark = function () {};
    globalThis.removeVehicleRadioMark = function () {};
    globalThis.hardMode = { enabled: true, hqUnitId: null, signalPlatoon: { radios: { total: 3, available: 3, assigned: [] }, phones: { total: 3, available: 3, assigned: [] }, transfers: [] }, phoneLines: [] };
    function fighter(name, weapon) { return { name: name, weapon: weapon || 'Винтовка FN model 24/30', hp: 3, maxHp: 3, isCommander: false }; }
    function squad(name, names) { return { name: name, faction: 'BeVe', fighters: names.map(n => fighter(n)), ammoSmall: 32, grenades: 8, isSignalSquad: false }; }
  `);
  return s;
}

function json(v) { return JSON.stringify(v === undefined ? null : v); }
function eq(s, expr, expected, msg) { assert.equal(json(s.evalCtx(expr)), json(expected), msg); }

// ───────────────────────── 1. Штаты в шаблонах ─────────────────────────
function templatesByName(name) {
  const out = [];
  TEMPLATES.split('\n').forEach(line => {
    const m = /^\s*\{"name": "([^"]+)",/.exec(line);
    if (!m || m[1] !== name) return;
    out.push(JSON.parse(line.trim().replace(/,$/, '')));
  });
  return out;
}

test('R45#2: штаб роты — 9 человек с ротными должностями (обе фракции)', () => {
  const names = ['Штаб роты №1 Бельгийцы', 'Штаб роты №2 Голландцы', 'Штаб роты №3 Самокатной',
                 'Штаб роты №1', 'Штаб роты №2', 'Штаб роты №3'];
  const required = ['Заместитель командира роты', 'Старшина роты', 'Интендант', 'Писарь', 'Фельдшер',
                    'Связной', 'Посыльный 1', 'Посыльный 2'];
  let checked = 0;
  names.forEach(n => templatesByName(n).forEach(t => {
    checked++;
    assert.equal(t.fighters.length, 9, `${n} [${t.faction}]: бойцов 9`);
    required.forEach(pos => assert.ok(t.fighters.some(f => f.name === pos), `${n}: нет должности «${pos}»`));
    assert.equal(t.fighters.filter(f => f.isCommander).length, 1, `${n}: командир ровно один`);
  }));
  assert.equal(checked, 6, 'найдены все шесть ротных штабов (3 BeVe + 3 A.I.R.F.)');
});

test('R45#2: штаб батальона — 15 человек, включая 2 радистов и 2 телефонистов', () => {
  const list = templatesByName('Штаб Батальона');
  assert.equal(list.length, 2, 'штабы батальона BeVe и A.I.R.F.');
  const required = ['Заместитель командира батальона', 'Начальник штаба', 'Старшина батальона', 'Интендант',
                    'Писарь', 'Фельдшер', 'Кладовщик (каптенармус)', 'Связной',
                    'Посыльный 1', 'Посыльный 2', 'Радист 1', 'Радист 2', 'Телефонист 1', 'Телефонист 2'];
  list.forEach(t => {
    assert.equal(t.fighters.length, 15, `${t.faction}: бойцов 15`);
    required.forEach(pos => assert.ok(t.fighters.some(f => f.name === pos), `${t.faction}: нет должности «${pos}»`));
    assert.equal(t.ammoSmall, 120, `${t.faction}: патроны по числу людей (8 на человека)`);
    assert.equal(t.grenades, 30, `${t.faction}: гранаты (2 на человека)`);
  });
});

test('R45#2: взводные штабы не раздувались — по-прежнему 4 человека', () => {
  ['Штаб взвода №1 Бельгийцы', 'Штаб взвода №5 Голландцы', 'Штаб взвода №9 Самокатный', 'Штаб взвода №1']
    .forEach(n => templatesByName(n).forEach(t => assert.equal(t.fighters.length, 4, `${n}: 4 бойца`)));
});

// ─────────── 2. Миграция штатов в существующих сохранениях ───────────
const OLD_UNITS = `
    appData.campaign.opUnits = [
      { type: 'hq', name: 'Штаб батальона', faction: 'BeVe', col: 5, row: 5, squads: [
          squad('Штаб батальона', ['Майор', 'Заместитель', 'Посыльный', 'Посыльный'])] },
      { type: 'company_hq', name: 'Штаб роты (бельг.)', faction: 'BeVe', col: 4, row: 4, squads: [
          squad('Штаб роты (бельг.)', ['Капитан', 'Заместитель', 'Посыльный', 'Посыльный'])] },
      { type: 'bicycle_platoon', name: '1-й самокатный взвод', faction: 'BeVe', col: 3, row: 3, squads: [
          squad('Штаб взвода №1 Самокатный', ['Лейтенант', 'Заместитель', 'Посыльный', 'Посыльный']),
          squad('Самокатное отделение №1', ['Сержант', 'Стрелок 1'])] }
    ];
    hardMode.hqUnitId = 0;
`;

test('R45#2: старые штабы дополняются должностями по штату (рота 9, батальон 15)', () => {
  const s = sandbox();
  s.run(OLD_UNITS + `
    globalThis.__added = ensureHQStaffComposition();
    globalThis.__company = JSON.parse(JSON.stringify(appData.campaign.opUnits[1].squads[0].fighters.map(f => f.name)));
    globalThis.__battalion = JSON.parse(JSON.stringify(appData.campaign.opUnits[0].squads[0].fighters.map(f => f.name)));
    globalThis.__again = ensureHQStaffComposition();
    globalThis.__platoon = appData.campaign.opUnits[2].squads[0].fighters.length;
  `);
  eq(s, '__company', ['Капитан', 'Заместитель командира роты', 'Посыльный 1', 'Посыльный 2', 'Старшина роты',
                      'Интендант', 'Писарь', 'Фельдшер', 'Связной'], 'ротный штаб достроен и переименован');
  eq(s, '__battalion', ['Майор', 'Заместитель командира батальона', 'Посыльный 1', 'Посыльный 2',
                        'Начальник штаба', 'Старшина батальона', 'Интендант', 'Писарь', 'Фельдшер',
                        'Кладовщик (каптенармус)', 'Связной', 'Радист 1', 'Радист 2',
                        'Телефонист 1', 'Телефонист 2'], 'батальонный штаб достроен');
  assert.equal(s.evalCtx('__added'), 5 + 11, 'добавлено 5 человек роте и 11 батальону');
  assert.equal(s.evalCtx('__again'), 0, 'повторная миграция ничего не добавляет');
  assert.equal(s.evalCtx('__platoon'), 4, 'взводные штабы не трогаем');
});

test('R45#2: вражеский штаб тоже достраивается по штату (A.I.R.F. — 9/15)', () => {
  const s = sandbox();
  s.run(`
    appData.campaign.opUnits = [];
    appData.campaign.enemyOpUnits = [
      { type: 'company_hq', name: 'Штаб роты №1', faction: 'A.I.R.F.', col: 6, row: 6, squads: [
          squad('Штаб роты №1', ['Капитан', 'Заместитель', 'Посыльный', 'Посыльный'])] },
      { type: 'battalion_hq', name: 'Штаб батальона A.I.R.F.', faction: 'A.I.R.F.', col: 7, row: 7, squads: [
          squad('Штаб батальона A.I.R.F.', ['Майор', 'Посыльный'])] }
    ];
    globalThis.__enemyAdded = ensureHQStaffComposition();
    globalThis.__enemyCompany = appData.campaign.enemyOpUnits[0].squads[0].fighters.length;
    globalThis.__enemyBattalion = appData.campaign.enemyOpUnits[1].squads[0].fighters.length;
    globalThis.__enemyPosts = JSON.stringify(appData.campaign.enemyOpUnits[0].squads[0].fighters.map(f => f.name));
  `);
  assert.equal(s.evalCtx('__enemyAdded'), 5 + 13, 'достроены оба вражеских штаба');
  assert.equal(s.evalCtx('__enemyCompany'), 9, 'вражеская рота = 9');
  assert.equal(s.evalCtx('__enemyBattalion'), 15, 'вражеский батальон = 15');
  assert.deepEqual(JSON.parse(String(s.evalCtx('__enemyPosts'))).slice(1, 3),
    ['Заместитель командира роты', 'Посыльный 1'], 'старые должности переименованы по штату');
});

test('R45#2: без Hard Mode штаты всё равно достраиваются при загрузке', () => {
  const s = sandbox();
  s.run(OLD_UNITS + `
    hardMode.enabled = false;
    globalThis.__touched = migrateHQPersonnelOnLoad();
    globalThis.__company = appData.campaign.opUnits[1].squads[0].fighters.length;
    globalThis.__battalion = appData.campaign.opUnits[0].squads[0].fighters.length;
    globalThis.__again = migrateHQPersonnelOnLoad();
  `);
  assert.equal(s.evalCtx('__touched'), 16, 'миграции сработали без Hard Mode');
  assert.equal(s.evalCtx('__company'), 9, 'ротный штаб = 9');
  assert.equal(s.evalCtx('__battalion'), 15, 'штаб батальона = 15');
  assert.equal(s.evalCtx('__again'), 0, 'повторная загрузка ничего не меняет');
});

test('R45#2: выбитый штаб новыми должностями не «оживает»', () => {
  const s = sandbox();
  s.run(OLD_UNITS + `
    appData.campaign.opUnits[1].squads[0].fighters.forEach(f => { f.hp = 0; });
    globalThis.__added = ensureHQStaffComposition();
    globalThis.__company = appData.campaign.opUnits[1].squads[0].fighters.length;
  `);
  assert.equal(s.evalCtx('__added'), 11, 'дополнен только живой штаб батальона');
  assert.equal(s.evalCtx('__company'), 4, 'выбитый ротный штаб остался как есть');
});

test('R45#2: новым людям добавляется боезапас (8 патронов и 2 гранаты на человека)', () => {
  const s = sandbox();
  s.run(OLD_UNITS + `
    ensureHQStaffComposition();
    globalThis.__companyAmmo = appData.campaign.opUnits[1].squads[0].ammoSmall;
    globalThis.__companyGren = appData.campaign.opUnits[1].squads[0].grenades;
  `);
  assert.equal(s.evalCtx('__companyAmmo'), 32 + 5 * 8, 'патроны ротного штаба');
  assert.equal(s.evalCtx('__companyGren'), 8 + 5 * 2, 'гранаты ротного штаба');
});

// ─────── 3. Прибытие связистов: вливание в штат получателя ───────
const RECIPIENTS = `
    appData.campaign.opUnits = [
      { type: 'hq', name: 'Штаб батальона', faction: 'BeVe', col: 5, row: 5, squads: [
          squad('Штаб батальона', ['Майор', 'Заместитель командира батальона', 'Начальник штата', 'Радист 1'])] },
      { type: 'company_hq', name: 'Штаб роты (бельг.)', faction: 'BeVe', col: 4, row: 4, squads: [
          squad('Штаб роты (бельг.)', ['Капитан', 'Старшина роты'])] },
      { type: 'infantry_platoon', name: '1-й взвод (бельг.)', faction: 'BeVe', col: 3, row: 3, squads: [
          squad('Штаб взвода №1 Бельгийцы', ['Лейтенант', 'Посыльный 1']),
          squad('Пехотное отделение №1 Бельгийцы', ['Сержант', 'Стрелок 1'])] },
      { type: 'mortar_battery', name: 'Батарея 82-мм миномётов', faction: 'BeVe', col: 2, row: 2, squads: [
          squad('Миномет 82-мм №1', ['Командир расчёта', 'Номер 1'])] }
    ];
    hardMode.hqUnitId = 0;
`;
function deliver(s, kind, unitId, id) {
  s.run(`
    const __team = createSignalTeam('${kind}', '${id}', 'BeVe');
    finishSignalTransfer({ id: '${id}', assignmentId: '${id}', signalTeamId: '${id}', type: '${kind}',
      direction: 'to_unit', status: 'in_transit', unitId: ${unitId}, hqUnitId: 0,
      col: appData.campaign.opUnits[${unitId}].col, row: appData.campaign.opUnits[${unitId}].row, team: __team });
    globalThis.__names = JSON.parse(JSON.stringify(appData.campaign.opUnits[${unitId}].squads[0].fighters.map(f => f.name)));
    globalThis.__signals = JSON.parse(JSON.stringify(appData.campaign.opUnits[${unitId}].squads[0].fighters
      .filter(f => f.isSignalman).map(f => ({ name: f.name, device: f.signalDeviceType, alive: f.hp > 0 }))));
    globalThis.__squads = appData.campaign.opUnits[${unitId}].squads.length;
  `);
}

test('R45#1: рация — двое связистов в штате роты («Радист 1/2»), штат вырос на 2', () => {
  const s = sandbox();
  s.run(RECIPIENTS);
  deliver(s, 'radio', 1, 'r1');
  eq(s, '__names', ['Капитан', 'Старшина роты', 'Радист 1', 'Радист 2'], 'двое радистов в штате роты');
  eq(s, '__signals', [{ name: 'Радист 1', device: 'radio', alive: true },
                      { name: 'Радист 2', device: 'radio', alive: true }]);
  assert.equal(s.evalCtx('__squads'), 1, 'отдельного отряда «Связисты» не появилось');
  assert.equal(s.evalCtx("appData.campaign.opUnits[1].squads[0].fighters.length"), 4, 'штат вырос ровно на пару');
  assert.equal(s.evalCtx("hardMode.signalPlatoon.radios.assigned.length"), 1, 'выдача зарегистрирована');
  assert.equal(s.evalCtx("hardMode.signalPlatoon.radios.assigned[0].signalSquadName"), 'Штаб роты (бельг.)', 'запись ведёт на штат');
  assert.equal(s.evalCtx("signalTeamAlive(appData.campaign.opUnits[1], hardMode.signalPlatoon.radios.assigned[0])"), true, 'связь действует');
});

test('R45#1: телефон — двое связистов в штате взвода («Телефонист 1/2»)', () => {
  const s = sandbox();
  s.run(RECIPIENTS);
  deliver(s, 'phone', 2, 'p1');
  eq(s, '__names', ['Лейтенант', 'Посыльный 1', 'Телефонист 1', 'Телефонист 2'], 'телефонисты в штабе взвода');
  assert.equal(s.evalCtx("appData.campaign.opUnits[2].squads[1].fighters.length"), 2, 'боевое отделение не тронуто');
});

test('R45#1: без штаба в юните связисты остаются отдельным отрядом (как раньше)', () => {
  const s = sandbox();
  s.run(RECIPIENTS);
  deliver(s, 'radio', 3, 'r3');
  assert.equal(s.evalCtx("appData.campaign.opUnits[3].squads.length"), 2, 'добавлен отдельный отряд');
  assert.match(String(s.evalCtx("appData.campaign.opUnits[3].squads[1].name")), /Связисты \(радио\)/);
  assert.equal(s.evalCtx("appData.campaign.opUnits[3].squads[0].fighters.length"), 2, 'расчёт миномёта не тронут');
});

test('R45#1: отзыв связистов убирает пару из штата и не раздувает штаб батальона', () => {
  const s = sandbox();
  s.run(RECIPIENTS);
  deliver(s, 'radio', 1, 'r1');
  s.run(`
    requestSignalRecall('radio', 0);
    const back = hardMode.signalPlatoon.transfers[hardMode.signalPlatoon.transfers.length - 1];
    globalThis.__backStatus = back && back.status;
    finishSignalTransfer(back);
    globalThis.__after = JSON.parse(JSON.stringify(appData.campaign.opUnits[1].squads[0].fighters.map(f => f.name)));
    globalThis.__hqSquads = appData.campaign.opUnits[0].squads.length;
    globalThis.__hqFighters = appData.campaign.opUnits[0].squads[0].fighters.length;
    globalThis.__reserve = signalReserveTeams('radio').length;
    globalThis.__assigned = hardMode.signalPlatoon.radios.assigned.length;
  `);
  eq(s, '__after', ['Капитан', 'Старшина роты'], 'связисты покинули штат роты');
  assert.equal(s.evalCtx('__backStatus'), 'returning', 'пара идёт обратно в штаб');
  assert.equal(s.evalCtx('__hqSquads'), 1, 'в штабе батальона не появилось отрядов связистов');
  assert.equal(s.evalCtx('__hqFighters'), 4, 'личный состав штаба батальона не вырос');
  assert.equal(s.evalCtx('__reserve'), 1, 'пара вернулась в резерв');
  assert.equal(s.evalCtx('__assigned'), 0, 'выдача снята');
});

test('R45#1: сейв переживает выгрузку/загрузку (JSON) без потери связистов', () => {
  const s = sandbox();
  s.run(RECIPIENTS + `
    // как после загрузки сейва: штаты достраиваются, затем приходит пара связистов
    migrateHQPersonnelOnLoad();
  `);
  deliver(s, 'radio', 1, 'r1');
  s.run(`
    // экспорт/импорт кампании — это JSON-круг по appData.campaign
    const dump = JSON.stringify({ campaign: appData.campaign, currentTime: appData.currentTime, currentTurn: appData.currentTurn });
    const back = JSON.parse(dump);
    appData.campaign = back.campaign;
    hardMode.enabled = false;
    globalThis.__touched = migrateHQPersonnelOnLoad();
    globalThis.__signals = JSON.parse(JSON.stringify(appData.campaign.opUnits[1].squads[0].fighters
      .filter(f => f.isSignalman).map(f => f.name)));
    globalThis.__roster = appData.campaign.opUnits[1].squads[0].fighters.length;
    globalThis.__status = hardMode.signalPlatoon.radios.assigned.length;
    globalThis.__assignedName = (hardMode.signalPlatoon.radios.assigned[0] || {}).signalSquadName;
  `);
  assert.equal(s.evalCtx('__touched'), 0, 'штат уже полный — миграция ничего не портит');
  eq(s, '__signals', ['Радист 1', 'Радист 2'], 'приданные радисты остались в штате');
  assert.equal(s.evalCtx('__roster'), 11, 'штат роты в сейве: 9 штатных + 2 связиста');
  assert.equal(s.evalCtx('__status'), 1, 'выдача связи сохранилась в сейве');
  assert.equal(s.evalCtx('__assignedName'), 'Штаб роты (бельг.)', 'запись по-прежнему указывает на штат');
});

test('R45#1: гибель связистов → связь потеряна', () => {
  const s = sandbox();
  s.run(RECIPIENTS);
  deliver(s, 'radio', 1, 'r1');
  s.run(`
    appData.campaign.opUnits[1].squads[0].fighters.filter(f => f.isSignalman).forEach(f => { f.hp = 0; });
    globalThis.__alive = signalTeamAlive(appData.campaign.opUnits[1], hardMode.signalPlatoon.radios.assigned[0]);
    globalThis.__lost = refreshSignalLosses();
    globalThis.__status = hardMode.signalPlatoon.radios.assigned[0].status;
  `);
  assert.equal(s.evalCtx('__alive'), false, 'мёртвые связисты не держат связь');
  assert.equal(s.evalCtx('__lost'), 1, 'потеря зафиксирована');
  assert.equal(s.evalCtx('__status'), 'lost', 'связь помечена потерянной');
});

test('R45#1: пара из резерва выдаётся заново, резерв не мешает штабу', () => {
  const s = sandbox();
  s.run(RECIPIENTS + `
    signalReserveStore('radio', createSignalTeam('radio', 'res-1', 'BeVe'), 'res-1');
    globalThis.__before = appData.campaign.opUnits[0].squads.length;
    const pulled = getSignalTeamFromHQ(appData.campaign.opUnits[0], 'radio', 'r9');
    globalThis.__pulled = JSON.parse(JSON.stringify(pulled.fighters.map(f => f.name)));
    globalThis.__poolAfter = signalReserveTeams('radio').length;
    globalThis.__after = appData.campaign.opUnits[0].squads.length;
  `);
  assert.equal(s.evalCtx('__before'), s.evalCtx('__after'), 'личный состав штаба не меняется');
  assert.equal(s.evalCtx('__poolAfter'), 0, 'пара ушла из резерва');
  eq(s, '__pulled', ['Связист 1 (res-1)', 'Связист 2 (res-1)'], 'выдана именно резервная пара');
});

test('R45#1: миграция старых отрядов связистов переносит их в штат', () => {
  const s = sandbox();
  s.run(RECIPIENTS);
  deliver(s, 'radio', 3, 'r3');   // батарея — отдельный отряд
  s.run(`
    // теперь у юнита появился штаб (раньше его не было)
    appData.campaign.opUnits[3].squads.push(squad('Штаб батареи', ['Командир батареи']));
    const entry = { id: 'r3', unitId: 3, status: 'active', type: 'radio', signalTeamId: 'r3' };
    hardMode.signalPlatoon.radios.assigned = [entry];
    globalThis.__moved = migrateSignalStaffSquads();
    globalThis.__names = JSON.parse(JSON.stringify(appData.campaign.opUnits[3].squads.map(sq => sq.name)));
    globalThis.__staff = JSON.parse(JSON.stringify(appData.campaign.opUnits[3].squads.find(sq => /Штаб/.test(sq.name)).fighters.map(f => f.name)));
  `);
  assert.equal(s.evalCtx('__moved'), 1, 'одна пара перенесена');
  eq(s, '__names', ['Миномет 82-мм №1', 'Штаб батареи'], 'отдельный отряд связистов удалён');
  eq(s, '__staff', ['Командир батареи', 'Радист 1', 'Радист 2'], 'связисты влиты в штат');
});

// ─────── 4. Штабной персонал в бою и личном составе ───────
test('R45#1: связисты не считаются боевым составом и не удерживают юнит в строю', () => {
  const s = sandbox();
  s.run(RECIPIENTS);
  deliver(s, 'radio', 1, 'r1');
  s.run(`
    globalThis.__combat = getOperationalCombatFighters(appData.campaign.opUnits[1]).length;
    appData.campaign.opUnits[1].squads[0].fighters.filter(f => !f.isSignalman).forEach(f => { f.hp = 0; });
    globalThis.__wiped = isOpUnitWipedOut(appData.campaign.opUnits[1]);
  `);
  assert.equal(s.evalCtx('__combat'), 2, 'в боевой состав идут только штатные бойцы');
  assert.equal(s.evalCtx('__wiped'), true, 'живые связисты не удерживают выбитый юнит');
});

test('R45#1: новые бойцы штаба не теряются при возврате из старой записи боя', () => {
  const s = sandbox();
  s.run(`
    const battleSquad = { name: 'Штаб роты (бельг.)', fighters: [fighter('Капитан'), fighter('Старшина роты')] };
    const campaignSquad = { name: 'Штаб роты (бельг.)', fighters: [fighter('Капитан'), fighter('Старшина роты'), fighter('Радист 1'), fighter('Радист 2')] };
    globalThis.__merged = mergeMissingFightersIntoBattleSquad(battleSquad, campaignSquad);
    globalThis.__names = JSON.parse(JSON.stringify(battleSquad.fighters.map(f => f.name)));
    globalThis.__again = mergeMissingFightersIntoBattleSquad(battleSquad, campaignSquad);
  `);
  assert.equal(s.evalCtx('__merged'), 2, 'добавлены двое прибывших связистов');
  eq(s, '__names', ['Капитан', 'Старшина роты', 'Радист 1', 'Радист 2'], 'состав боя восстановлен');
  assert.equal(s.evalCtx('__again'), 0, 'повторная синхронизация ничего не добавляет');
});

test('R45#1: личный состав в списке батальона считает влитых связистов', () => {
  const s = sandbox();
  s.run(RECIPIENTS);
  deliver(s, 'radio', 1, 'r1');
  s.run(`
    let total = 0;
    (appData.campaign.opUnits[1].squads || []).forEach(sq => { total += (sq.fighters || []).length; });
    globalThis.__total = total;
  `);
  assert.equal(s.evalCtx('__total'), 4, 'штат роты в списке: 2 штатных + 2 связиста');
});

// ───────────────────────── 5. Отображение и оформление ─────────────────────────
test('R45: связисты видны в личном составе штаба с должностью и устройством', () => {
  assert.match(HTML, /📡 \$\{f\.name\} \(\$\{f\.signalDeviceType === 'radio' \? 'рация' : 'телефон'\}\)/);
  assert.match(HTML, /f\.name === 'Заместитель'\) f\.name = deputy\.name;/);
  assert.match(HTML, /f\.name = 'Посыльный ' \+ posNumbers;/);
});

test('R45: штатные 2 радиста и 2 телефониста — в шаблоне, резерв — отдельно от штаба', () => {
  assert.match(HTML, /signalReserveTeams/);
  assert.match(HTML, /reserve\.shift\(\) \|\| createSignalTeam/);
  assert.ok(!/hq\.squads\.push\(team\)/.test(HTML), 'пары больше не висят в личном составе штаба');
});

test('R45: панель «личный состав» показывает штат и приданных связистов', () => {
  const s = sandbox();
  s.sandbox.appData.templates = s.evalCtx('SQUAD_TEMPLATES');
  s.run(RECIPIENTS + `
    globalThis.__wrap = (tn, nm, type) => ({ name: nm, type: type, squads: [cloneTemplate('BeVe', nm, tn)],
        col: 4, row: 4, side: 'player', ap: 4, maxAp: 4, mobility: 'foot' });
  `);
  // штабу батальона — полный шаблон (15 чел.), ротному штабу — полный (9 чел.)
  s.run(`
    appData.campaign.opUnits[0] = __wrap('Штаб Батальона', 'Штаб батальона', 'hq');
    appData.campaign.opUnits[1] = __wrap('Штаб роты №1 Бельгийцы', 'Штаб роты (бельг.)', 'company_hq');
    hardMode.hqUnitId = 0;
  `);
  deliver(s, 'radio', 1, 'r1');
  s.run(`
    showUnitDetails(1);
    globalThis.__companyHtml = document.getElementById('battalionUnitDetails').innerHTML;
    showUnitDetails(0);
    globalThis.__battalionHtml = document.getElementById('battalionUnitDetails').innerHTML;
    renderBattalionRoster();
    globalThis.__rosterHtml = document.getElementById('battalionRosterList').innerHTML;
  `);
  const company = String(s.evalCtx('__companyHtml'));
  ['Заместитель командира роты', 'Старшина роты', 'Интендант', 'Писарь', 'Фельдшер', 'Связной',
   'Посыльный 1', 'Посыльный 2'].forEach(pos => assert.ok(company.includes(pos), `ротный штат: нет «${pos}»`));
  assert.ok(company.includes('📡 Радист 1 (рация)'), 'приданный радист виден в штате роты');
  assert.ok(company.includes('📡 Радист 2 (рация)'), 'второй приданный радист виден');
  const battalion = String(s.evalCtx('__battalionHtml'));
  ['Начальник штаба', 'Старшина батальона', 'Кладовщик (каптенармус)', 'Радист 1', 'Радист 2',
   'Телефонист 1', 'Телефонист 2'].forEach(pos => assert.ok(battalion.includes(pos), `штаб батальона: нет «${pos}»`));
  assert.ok(battalion.includes('Майор'), 'командир батальона на месте');
  assert.ok(String(s.evalCtx('__rosterHtml')).includes('Штаб батальона'), 'список батальона строится без ошибок');
});

test('v13.067: версия одинакова в приложении, манифесте и кэше', () => {
  const m = /var APP_VERSION = 'v(\d+\.\d+)'/.exec(HTML);
  assert.ok(m, 'APP_VERSION найден');
  const v = m[1].replace('.', '\\.');
  assert.match(HTML, new RegExp('<title>Боевой модуль v' + v));
  assert.match(fs.readFileSync(ROOT + '/manifest.json', 'utf8'), new RegExp('БМ v' + v));
  assert.match(fs.readFileSync(ROOT + '/service-worker.js', 'utf8'), new RegExp("const CACHE_NAME = 'wargame-v" + v + "'"));
});

console.log(`\nИтог v13.067: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) {
  failures.forEach(f => console.log('  · ' + f));
  process.exitCode = 1;
}
