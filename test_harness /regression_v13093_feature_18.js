// Regression tests for the five-phase tactical pause and operational-order barrier.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.log(`✗ ${name} — ${e.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function equal(actual, expected, message) {
  assert(actual === expected, `${message || 'equality'}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function loadHtml(s, names) { names.forEach(name => s.run(sliceFunction(HTML, name))); }

function makePauseSandbox() {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['advanceTacticalClock', 'registerCompletedTacticalPhase', 'pauseCampaignTacticalBattlesForOrders', 'resumePausedCampaignBattlesAfterOrders', 'switchToBattle']);
  s.run(`
    var ONLINE = { started: false, match: null };
    appData.campaign = { online: false, currentTurn: 1, currentTime: 0, opTurnStartTime: 0,
      activeBattles: [
        { id: 101, currentTurn: 1, tacticalPhasesCompleted: 0, tacticalMap: { grid: {} } },
        { id: 102, currentTurn: 3, tacticalPhasesCompleted: 2, tacticalMap: { grid: {} } }
      ] };
    appData.currentTime = 0;
    appData.currentTurn = 1;
    appData.currentBattleId = 101;
    appData.map = { pausedForOrders: false };
    var sourceBattle = appData.campaign.activeBattles[0];
    for (var i = 0; i < 5; i++) {
      advanceTacticalClock(2, true);
      sourceBattle.currentTurn++;
      registerCompletedTacticalPhase(sourceBattle);
    }
    var pausedCount = pauseCampaignTacticalBattlesForOrders(sourceBattle);
    var wasPausedAtFive = appData.campaign.activeBattles.every(b => b.pausedForOrders);
    var timeAtPause = appData.campaign.currentTime;
    var opTurnAtPause = appData.campaign.currentTurn;
  `);
  return s;
}

test('18: after five tactical phases, campaign time is +10 min, with no automatic operational-turn advance', () => {
  const s = makePauseSandbox();
  equal(s.evalCtx('timeAtPause'), 10, 'пять фаз по две минуты дают +10 минут');
  equal(s.evalCtx('opTurnAtPause'), 1, 'номер оперативного хода не переключается автоматически');
  equal(s.evalCtx('appData.campaign.opTurnStartTime'), 0, 'точка старта оперативного хода сохраняется до приказов');
  equal(s.evalCtx('appData.campaign.activeBattles[0].tacticalPhasesCompleted'), 5, 'счётчик пяти фаз сохраняется в бою');
});

test('18: достижение пяти фаз ставит на паузу все параллельные бои', () => {
  const s = makePauseSandbox();
  equal(s.evalCtx('pausedCount'), 2, 'приостановлены оба боя кампании');
  equal(s.evalCtx('wasPausedAtFive'), true, 'обе записи боя ждут оперативные приказы');
  equal(s.evalCtx('appData.map.pausedForOrders'), true, 'активная тактическая карта помечена как приостановленная');
  equal(s.evalCtx('appData.campaign.tacticalOrdersBarrier.requiredReadyPlayers'), 1, 'в офлайн-кампании приказ подтверждает один игрок');
});

test('18: офлайн-бои остаются на паузе до ручного завершения оперативного хода', () => {
  const s = makePauseSandbox();
  s.run(`var earlyResume = resumePausedCampaignBattlesAfterOrders(1, false);`);
  equal(s.evalCtx('earlyResume'), false, 'нельзя снять паузу автоматом до приказов');
  equal(s.evalCtx('appData.campaign.activeBattles[0].pausedForOrders'), true, 'бой всё ещё заблокирован');
  s.run(`appData.campaign.currentTurn = 2; var resumed = resumePausedCampaignBattlesAfterOrders(2, true);`);
  equal(s.evalCtx('resumed'), true, 'после завершения оперативных приказов пауза снимается');
  equal(s.evalCtx('appData.campaign.activeBattles.some(b => b.pausedForOrders)'), false, 'все параллельные бои снова доступны');
  equal(s.evalCtx('appData.campaign.tacticalOrdersBarrier'), null, 'барьер оперативных приказов закрыт');
});

test('18: онлайн-бои ждут новый номер хода, то есть готовность обоих игроков', () => {
  const s = makePauseSandbox();
  s.run(`
    ONLINE.started = true;
    ONLINE.match = { status: 'playing', turn: 7, time: 110 };
    appData.campaign.online = true;
    pauseCampaignTacticalBattlesForOrders(sourceBattle, {
      pausedAtOperationalTurn: 7, pausedCampaignTime: 110, pausedCampaignTurn: 7, pauseSourceBattleId: 101
    });
    var beforeBothReady = resumePausedCampaignBattlesAfterOrders(7, false);
    var remainedPaused = appData.campaign.activeBattles.every(b => b.pausedForOrders);
    ONLINE.match.turn = 8;
    var afterBothReady = resumePausedCampaignBattlesAfterOrders(8, false);
  `);
  equal(s.evalCtx('beforeBothReady'), false, 'ход не возобновляется, пока оба игрока не завершили приказы');
  equal(s.evalCtx('remainedPaused'), true, 'все параллельные бои ждут общей синхронизации');
  equal(s.evalCtx('afterBothReady'), true, 'новый общий оперативный ход снимает паузу');
  equal(s.evalCtx('appData.campaign.currentTime'), 110, 'после синхронизации часы совпадают с временем общего хода');
  equal(s.evalCtx('appData.campaign.currentTurn'), 8, 'кампания переходит на синхронный номер хода');
});

test('18: общий онлайн-маркер приостанавливает локальные бои и синхронизирует время', () => {
  const s = makePauseSandbox();
  const source = fs.readFileSync(path.join(ROOT, 'js/online_battles.js'), 'utf8');
  s.run(source);
  s.run(`
    ONLINE = { started: true, role: 'p1', match: { status: 'playing', turn: 7, time: 100 } };
    appData.campaign.online = true;
    appData.campaign.currentTime = 100;
    appData.currentTime = 100;
    var globalPauseHandled = onlineHandleGlobalTacticalPause({ active: true, operationalTurn: 7,
      campaignTime: 110, campaignTurn: 7, sourceBattleId: 101 });
  `);
  equal(s.evalCtx('globalPauseHandled'), true, 'получен общий маркер паузы');
  equal(s.evalCtx('appData.campaign.activeBattles.every(b => b.pausedForOrders)'), true, 'маркер блокирует все известные параллельные бои');
  equal(s.evalCtx('appData.campaign.currentTime'), 110, 'время +10 передано от инициатора паузы');
  equal(s.evalCtx('appData.campaign.tacticalOrdersBarrier.pausedAtOperationalTurn'), 7, 'сохранён номер общего оперативного хода');
});

test('18: в облачный снимок боя передаются фаза и состояние общей паузы', () => {
  const s = createSandbox(freshAppData());
  const source = fs.readFileSync(path.join(ROOT, 'js/online_battles.js'), 'utf8');
  s.run(source);
  s.run(`
    appData.campaign.online = true;
    appData.currentBattleId = null;
    var battleForSnapshot = { id: 5, hexKey: '2,3', currentTurn: 6, tacticalPhasesCompleted: 5,
      pausedForOrders: true, pausedAtOperationalTurn: 9, pausedCampaignTime: 100, pausedCampaignTurn: 9,
      playerSquads: [{ name: 'отряд', fighters: [] }], enemySquads: [], tacticalMap: { grid: {}, enemySquads: [] } };
    var pauseSnapshot = onlineBattleSnapshot(battleForSnapshot);
  `);
  equal(s.evalCtx('pauseSnapshot.tacticalPhasesCompleted'), 5, 'счётчик фаз передан');
  equal(s.evalCtx('pauseSnapshot.pausedForOrders'), true, 'флаг паузы передан');
  equal(s.evalCtx('pauseSnapshot.pausedAtOperationalTurn'), 9, 'передан номер оперативного хода барьера');
  equal(s.evalCtx('pauseSnapshot.pausedCampaignTime'), 100, 'передано синхронизированное время кампании');
});

test('18: паузу нельзя обойти прямым переходом в бой', () => {
  const s = makePauseSandbox();
  s.run(`appData.currentBattleId = null; switchToBattle(101);`);
  equal(s.evalCtx('appData.currentBattleId'), null, 'запись боя остаётся в кампании и не загружается в тактический экран');
  equal(s.evalCtx('document.getElementById("mapInfo").textContent.includes("приостановлен")'), true, 'игрок получает объяснение блокировки');
});

test('18: пятый тактический ход не вызывает автоматическое завершение оперативного хода', () => {
  const nextTurn = sliceFunction(HTML, 'nextTurn');
  assert(!/endOperationalTurn\s*\(/.test(nextTurn), 'nextTurn не должен автоматически вызывать endOperationalTurn');
  assert(/tacticalPhasesCompleted\s*>=\s*5/.test(nextTurn), 'после пяти завершённых фаз должна срабатывать тактическая пауза');
});

console.log(`\nИтог критерия 18: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
