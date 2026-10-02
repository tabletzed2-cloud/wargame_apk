// ⚡ v13.058: regressions for physical signal teams and hand-routed telephone cable.
const fs = require('fs');
const path = require('path');
const { sliceFunction, HTML } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const FNS = [
    'ensureSignalPlatoonState', 'isArmoredUnit', 'isArmoredCommunicationUnit',
    'signalAssignmentsFor', 'signalDeviceLabel', 'signalAssignmentId', 'createSignalTeam',
    'getSignalTeam', 'signalTeamAlive', 'addSignalTeamToUnit', 'removeSignalTeamFromUnit',
    'getSignalHQ', 'getSignalTeamFromHQ', 'findSignalPath', 'signalInfantryMover',
    'normalizePhoneRoutePoints', 'phoneLinePathHexKeys', 'validatePhoneSignalRoute',
    'installVehicleRadioMark', 'removeVehicleRadioMark', 'finishSignalTransfer',
    'requestSignalIssue', 'requestSignalRecall', 'advanceSignalTransfers',
    'migrateSignalAssignments', 'refreshSignalLosses', 'hasActivePhoneAt', 'hasRadio',
    'hasPhoneLine', 'getOpHexNeighbors', 'getOpMoveCost', 'getOpHexDistance',
    'renderCommunicationPanel', 'removePhoneLine', 'setPhoneRouteMessage', 'handlePhoneRouteDraftHex', 'handlePhoneRouteDraftClick',
    'assignPhoneToSelected', 'cancelPhoneRouteDraft'
];
fs.writeFileSync('/tmp/wg_part.js', FNS.map(name => sliceFunction(HTML, name)).join('\n\n'));

let pass = 0;
let fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

const s = createSandbox(freshAppData());
s.sandbox.getFactionWeapons = () => [];
s.sandbox.isStaticOpUnit = () => false;
s.run(`
  var hardMode = {
    enabled: true, hqUnitId: 0,
    signalPlatoon: {
      radios: { total: 3, available: 3, assigned: [{ unitId: 0, isHQ: true }] },
      phones: { total: 3, available: 3, assigned: [{ unitId: 0, isHQ: true }] },
      transfers: []
    },
    phoneLines: [], orders: [], pendingOrders: [], orderQueue: []
  };
  appData.campaign.currentTurn = 1;
  appData.campaign.scenario = null;
  appData.campaign.opMapGrid = {};
  appData.campaign.enemyOpUnits = [];
  appData.campaign.opUnits = [
    { name: 'Штаб батальона', type: 'battalion_hq', faction: 'BeVe', col: 2, row: 2, squads: [] },
    { name: 'Телефонный получатель', type: 'infantry_platoon', faction: 'BeVe', col: 4, row: 4, squads: [] },
    { name: 'Радио получатель', type: 'infantry_platoon', faction: 'BeVe', col: 2, row: 4, squads: [] },
    { name: 'Второй телефонный получатель', type: 'infantry_platoon', faction: 'BeVe', col: 3, row: 2, squads: [] }
  ];
  migrateSignalAssignments();
`);

// Headquarters devices are migrated too; each radio/phone gets a distinct two-person crew.
ok(s.evalCtx(`(() => {
  const r = hardMode.signalPlatoon.radios.assigned.find(x => x.isHQ);
  const p = hardMode.signalPlatoon.phones.assigned.find(x => x.isHQ);
  const rt = getSignalTeam(appData.campaign.opUnits[0], r);
  const pt = getSignalTeam(appData.campaign.opUnits[0], p);
  return !!r.signalTeamId && !!p.signalTeamId && r.signalTeamId !== p.signalTeamId &&
    rt && pt && rt.fighters.length === 2 && pt.fighters.length === 2 && signalTeamAlive(appData.campaign.opUnits[0], r) &&
    signalTeamAlive(appData.campaign.opUnits[0], p) && hasRadio(appData.campaign.opUnits[0]) && hasActivePhoneAt(0);
})()`) === true,
   'Пара штаба мигрирует отдельно для рации и телефона; на каждое устройство приходится два связиста');

// One survivor keeps a normal device operational; losing both disconnects it.
s.run(`
  appData.campaign.selectedOpUnit = appData.campaign.opUnits[2];
  requestSignalIssue('radio', appData.campaign.selectedOpUnit);
  var __radioTransfer = hardMode.signalPlatoon.transfers.find(t => t.type === 'radio');
`);
ok(s.evalCtx('__radioTransfer && __radioTransfer.team.fighters.length === 2 && __radioTransfer.signalTeamId !== hardMode.signalPlatoon.phones.assigned[0].signalTeamId') === true,
   'Выданная рация отправляет собственную пару из двух связистов, не используя пару телефона');
s.run(`
  appData.campaign.currentTurn = 2;
  advanceSignalTransfers();
  var __radioEntry = hardMode.signalPlatoon.radios.assigned.find(a => a.unitId === 2);
  var __radioTeam = getSignalTeam(appData.campaign.opUnits[2], __radioEntry);
  __radioTeam.fighters[0].hp = 0;
`);
ok(s.evalCtx('hasRadio(appData.campaign.opUnits[2]) === true && signalTeamAlive(appData.campaign.opUnits[2], __radioEntry)') === true,
   'Рация продолжает работать, пока в её паре жив хотя бы один связист');
s.run('__radioTeam.fighters[1].hp = 0; refreshSignalLosses();');
ok(s.evalCtx('hasRadio(appData.campaign.opUnits[2]) === false && __radioEntry.status === "lost"') === true,
   'Рация отключается только после гибели обоих связистов пары');

// Starting phone issue opens a saved route draft without consuming a phone or moving a team.
s.run(`
  appData.campaign.selectedOpUnit = appData.campaign.opUnits[1];
  assignPhoneToSelected();
`);
ok(s.evalCtx('hardMode.signalPlatoon.phoneRouteDraft.unitId === 1 && hardMode.signalPlatoon.phoneRouteDraft.path.length === 1 && hardMode.signalPlatoon.phones.available === 3 && hardMode.signalPlatoon.transfers.filter(t => t.type === "phone").length === 0') === true,
   'Выдача телефона начинает ручное рисование от штаба, не списывая аппарат до подтверждения маршрута');
s.run('cancelPhoneRouteDraft(); var __cancelLeftPhonePool = hardMode.signalPlatoon.phones.available;');
ok(s.evalCtx('__cancelLeftPhonePool === 3 && hardMode.signalPlatoon.phoneRouteDraft === null && hardMode.signalPlatoon.transfers.filter(t => t.type === "phone").length === 0') === true,
   'Отмена незавершённого маршрута не расходует телефон и не отправляет связистов');
s.run('appData.campaign.selectedOpUnit = appData.campaign.opUnits[1]; assignPhoneToSelected();');

// Exercise the same coordinate-to-hex helper used by operational-map clicks.
s.run('appData.campaign.opCenters = [{ key: "2,3", x: 10, y: 10 }];');
ok(s.evalCtx('handlePhoneRouteDraftClick(10, 10, 20)') === true && s.evalCtx('hardMode.signalPlatoon.phoneRouteDraft.path.length') === 2,
   'Клик по центру гекса добавляет соседний шаг телефонного маршрута');
s.run(`
  var __routeBeforeReject = hardMode.signalPlatoon.phoneRouteDraft.path.length;
  handlePhoneRouteDraftHex('8,8');
`);
ok(s.evalCtx('hardMode.signalPlatoon.phoneRouteDraft.path.length === __routeBeforeReject') === true,
   'Непососедний гекс отвергается без изменения сохранённого маршрута');
s.run(`
  handlePhoneRouteDraftHex('3,3');
  handlePhoneRouteDraftHex('2,3'); // шаг назад отменяет последний отрезок
  handlePhoneRouteDraftHex('3,3');
  handlePhoneRouteDraftHex('4,3');
  handlePhoneRouteDraftHex('4,4');
  var __phoneTransfer = hardMode.signalPlatoon.transfers.find(t => t.type === 'phone');
`);
ok(s.evalCtx('__phoneTransfer && hardMode.signalPlatoon.phoneRouteDraft === null && __phoneTransfer.route.map(p => p.col + "," + p.row).join("|") === "2,2|2,3|3,3|4,3|4,4" && __phoneTransfer.routeIndex === 0') === true,
   'Игрок может вручную выбрать трассу, откатить шаг, завершить её на получателе; передача сохраняет точный путь');
ok(s.evalCtx('hardMode.signalPlatoon.phones.available === 2 && hardMode.phoneLines[0].laying === true && hardMode.phoneLines[0].intact === false && hardMode.phoneLines[0].path.length === 1') === true,
   'После утверждения маршрута списывается один телефон и кабель начинает прокладываться за связистами');

// The selected route is walked cell-by-cell at infantry pace, and the cable grows behind the pair.
s.run('appData.campaign.currentTurn = 3; advanceSignalTransfers();');
ok(s.evalCtx('__phoneTransfer.col === 3 && __phoneTransfer.row === 3 && __phoneTransfer.routeIndex === 2 && hardMode.phoneLines[0].path.length === 3 && hardMode.signalPlatoon.phones.assigned.length === 1') === true,
   'За 4 ОД пешего хода команда проходит два обычных гекса, прокладывая только уже пройденный кабель');
s.run('appData.campaign.currentTurn = 4; advanceSignalTransfers();');
ok(s.evalCtx('hardMode.signalPlatoon.transfers.every(t => t.type !== "phone") && hardMode.signalPlatoon.phones.assigned.some(a => a.unitId === 1 && a.status === "active") && hardMode.phoneLines[0].intact === true') === true,
   'По прибытии пара закрепляется у получателя, телефон активируется и кабель становится целым');
ok(s.evalCtx('hasPhoneLine(appData.campaign.opUnits[0], appData.campaign.opUnits[1]) === true && hardMode.phoneLines[0].path.map(p => p.col + "," + p.row).join("|") === "2,2|2,3|3,3|4,3|4,4"') === true,
   'Связь штаба с получателем работает именно по сохранённой вручную выбранной трассе');

// A single surviving phone signalman keeps communication; recall removes the cable immediately.
s.run(`
  var __phoneEntry = hardMode.signalPlatoon.phones.assigned.find(a => a.unitId === 1);
  var __phoneTeam = getSignalTeam(appData.campaign.opUnits[1], __phoneEntry);
  __phoneTeam.fighters[0].hp = 0;
  var __phoneWorksWithOne = hasPhoneLine(appData.campaign.opUnits[0], appData.campaign.opUnits[1]);
  removePhoneLine(0); // кнопка управления кабелем должна отзывать пару, а не только стирать запись.
`);
ok(s.evalCtx('__phoneWorksWithOne === true && hardMode.phoneLines.length === 0 && hasPhoneLine(appData.campaign.opUnits[0], appData.campaign.opUnits[1]) === false && __phoneEntry.status === "returning"') === true,
   'Один живой связист сохраняет телефон; при отзыве кабель исчезает сразу, а команда уходит пешком');
s.run('appData.campaign.currentTurn = 5; advanceSignalTransfers();');
ok(s.evalCtx('hardMode.signalPlatoon.transfers.some(t => t.direction === "to_hq" && (t.col !== 2 || t.row !== 2))') === true,
   'Отзываемая телефонная пара физически проходит обратный путь и не телепортируется в штаб');
s.run('appData.campaign.currentTurn = 6; advanceSignalTransfers();');
ok(s.evalCtx('hardMode.signalPlatoon.transfers.length === 0 && hardMode.signalPlatoon.phones.available === 3 && hardMode.signalPlatoon.phones.assigned.length === 1 && appData.campaign.opUnits[0].squads.some(s => s.isSignalSquad && s.signalPool && s.fighters.some(f => f.hp > 0))') === true,
   'После возвращения пара пополняет резерв, а телефон снова доступен');

// The seven-hex limit is enforced independently of the map-click workflow.
s.run(`
  var __tooLong = [];
  for (var __r = 2; __r <= 10; __r++) __tooLong.push({ col: 2, row: __r });
  var __farRecipient = { col: 2, row: 10 };
  var __tooLongResult = validatePhoneSignalRoute(__tooLong, appData.campaign.opUnits[0], __farRecipient);
`);
ok(s.evalCtx('__tooLongResult.ok === false && __tooLongResult.reason.includes("7")') === true,
   'Маршрут длиннее 7 переходов отклоняется до выдачи телефона');

// A second phone verifies that death of both members drops the cable, while the armored exception remains.
s.run(`
  var __phoneTarget2 = appData.campaign.opUnits[3];
  requestSignalIssue('phone', __phoneTarget2, [{ col: 2, row: 2 }, { col: 3, row: 2 }]);
  appData.campaign.currentTurn = 7;
  advanceSignalTransfers();
  var __phoneEntry2 = hardMode.signalPlatoon.phones.assigned.find(a => a.unitId === 3);
  var __phoneTeam2 = getSignalTeam(__phoneTarget2, __phoneEntry2);
  __phoneTeam2.fighters.forEach(f => { f.hp = 0; });
  refreshSignalLosses();
`);
ok(s.evalCtx('__phoneEntry2.status === "lost" && hasActivePhoneAt(3) === false && hardMode.phoneLines.some(line => line.toUnitId === 3 && line.intact === false)') === true,
   'Если оба связиста телефона погибли, телефон и соответствующий кабель отключаются');
s.run(`
  var __hqPhoneEntry = hardMode.signalPlatoon.phones.assigned.find(a => a.isHQ);
  getSignalTeam(appData.campaign.opUnits[0], __hqPhoneEntry).fighters.forEach(f => { f.hp = 0; });
  refreshSignalLosses();
  var __availableBeforeHqLossIssue = hardMode.signalPlatoon.phones.available;
  var __issueWithoutHqPhone = requestSignalIssue('phone', appData.campaign.opUnits[2],
    [{ col: 2, row: 2 }, { col: 2, row: 3 }, { col: 2, row: 4 }]);
`);
ok(s.evalCtx('__issueWithoutHqPhone === false && hardMode.signalPlatoon.phones.available === __availableBeforeHqLossIssue && !hardMode.signalPlatoon.transfers.some(t => t.type === "phone" && t.unitId === 2)') === true,
   'Новый телефон нельзя выдать, если потеряна отдельная телефонная пара самого штаба');
ok(s.evalCtx('signalTeamAlive({ type: "tank_platoon", name: "Танк" }, { signalTeamId: "armored-exception" }) === true') === true,
   'Бронетехника сохраняет оговорённое исключение из правила сигналистов');

// Static integration checks: version, route-click interception and actual path rendering.
const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
ok(HTML.includes("var APP_VERSION = 'v13.058'") && sw.includes("const CACHE_NAME = 'wargame-v13.058'"),
   'Версия интерфейса и service-worker cache синхронизированы на v13.058');
ok(HTML.includes('handlePhoneRouteDraftClick(clickX, clickY, size)') && HTML.includes('lineTo(point.x, point.y)') &&
   HTML.includes('line.path = t.route.slice(0, t.routeIndex + 1)'),
   'Карта перехватывает ручные клики, рисует выбранную трассу и кабель следует за связистами');

console.log(`\nИтог v13.058 — связь: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exitCode = 1;
