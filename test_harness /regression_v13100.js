// ⚡ v13.100: регрессии по отчёту тестировщика (пункты 1–11 второго круга).
// Проверяем и поведение функций, и связку интерфейса (кнопки/подписи) с логикой.
'use strict';

const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData, sliceFunction: sliceFromSrc } = require('./sandbox');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HEXMAPS = read('js/hexmaps.js');
const OPUI = read('js/operational_ui.js');
const PLACEMENT = read('js/placement.js');
const SW = read('service-worker.js');
const MANIFEST = read('manifest.json');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' | ' + extra : '')); }
}
function loadHtml(s, names) { names.forEach(name => s.run(sliceFunction(HTML, name))); }

console.log('== v13.100: пункты 1–11 ==');

// ─────────────────────────── п.1: карта гекса сразу при «окопаться»/«расчистить» ───────────────────────────
{
  ok(/function openHexEditorForIssuedOrder\(/.test(OPUI) && /openHexEditorForBattle\(/.test(OPUI),
    'п.1: приказ открывает редактор гекса (openHexEditorForIssuedOrder)');
  ok(/dig_in[\s\S]{0,1800}beginPendingHexEditDraft/.test(OPUI) && /prep_positions[\s\S]{0,1800}beginPendingHexEditDraft/.test(OPUI),
    'п.1: и «окопаться», и «расчистить местность» открывают черновик правок на гексе выполнения');
  ok(/function beginPendingHexEditDraft\(/.test(HEXMAPS) && /function pendingHexEditDraftActive\(/.test(HEXMAPS) &&
     /function applyPendingHexEdits\(/.test(HEXMAPS),
    'п.1: черновик (beginPendingHexEditDraft → pendingHexEditDraftActive → applyPendingHexEdits) живёт в js/hexmaps.js');
  ok(/const draftModeOpen = hasPendingDraft \|\| activeOrderForHex/.test(HEXMAPS) &&
     /budget <= 0 && !existingTrenchesCanBeEdited && !draftModeOpen/.test(HEXMAPS),
    'п.1: меню правок гекса открывается по черновику приказа, даже когда очков подготовки нет');
  ok(/grantTrenchPoints|grantPrepPoints/.test(HEXMAPS),
    'п.1: очки окопов/подготовки начисляются при завершении приказа');
}

// ─────────────────────────── п.2: закрытое меню раздачи стартовых карт можно вернуть ───────────────────────────
{
  const bar = /function updateInitialCardStageRestoreBar\([\s\S]{0,2200}?\n\}/.exec(HTML);
  ok(!!bar && /initialPlatoonCardsAssigned/.test(bar[0]) && /restoreInitialCardDistributionStage/.test(bar[0]),
    'п.2: плавающая кнопка «Раздача карт» показывается, пока карты взвода не назначены');
  ok(!/initialCardStageMinimized/.test(bar ? bar[0] : ''),
    'п.2: возврат меню больше не требует, чтобы игрок САМ свернул окно');
  ok(/function restoreInitialCardDistributionStage\(/.test(HTML) && /openInitialCardDistributionStage\(/.test(HTML),
    'п.2: кнопка возврата открывает меню раздачи заново');
}

// ─────────────────────────── п.3: необнаруженные цели не раскрываются ───────────────────────────
{
  ok(/function opVictimHiddenFromPlayer\(/.test(HTML), 'п.3: есть общий признак «цель скрыта от игрока»');
  ok(/hiddenVictimsHit/.test(HTML) && /hiddenDamage/.test(HTML) && /hiddenKilled/.test(HTML),
    'п.3: урон/потери по невидимым целям считаются отдельно и не попадают в отчёт');
  ok(/const visibleNames = enemies\.filter\(e => !victimHiddenFn\(e\)\)\.map\(e => e\.name\);/.test(HTML),
    'п.3: имена в сводке — только обнаруженные цели');
  ok(/if \(visibleNames\.length\) \{[\s\S]{0,220}showShootNotification/.test(HTML),
    'п.3: уведомление об обстреле не показывается, когда видимых целей нет');
  ok(/видимых разведке целей на гексе нет/.test(HTML), 'п.3: в сводке честная формулировка «видимых целей нет»');
  ok(!/скрытая цель/.test(HTML), 'п.3: заглушки «скрытая цель» из уведомлений убраны');
}

// ─────────────────────────── п.4: у ДОТа Van Hees 2 амбразуры (по числу расчётов) ───────────────────────────
{
  const s = createSandbox(freshAppData());
  loadHtml(s, ['dotEmbrasureWeapons', 'dotEmbrasureCount', 'dotEmbrasureShots', 'dotEmbrasureHp']);
  s.run(`getFactionCrewWeapons = function () { return [
      { name: 'Расчёт ПТО Bohler M37', type: 'at_gun' },
      { name: 'Станковый пулемет Schwarzlose M.08/15', type: 'mg' }
    ]; };`);
  const vanHees = s.evalCtx(`dotEmbrasureCount({ name: 'ДОТ Van Hees', faction: 'BeVe', crewInstances: [
      { weaponName: 'Расчёт ПТО Bohler M37' },
      { weaponName: 'Станковый пулемет Schwarzlose M.08/15' }
    ] })`);
  const bosh = s.evalCtx(`dotEmbrasureCount({ name: 'ДОТ Bosh', faction: 'BeVe', crewInstances: [
      { weaponName: 'Расчёт ПТО Bohler M37' },
      { weaponName: 'Станковый пулемет Schwarzlose M.08/15' },
      { weaponName: 'Станковый пулемет Schwarzlose M.08/15' }
    ] })`);
  ok(vanHees === 2, 'п.4: Van Hees — 2 амбразуры', vanHees);
  ok(bosh === 3, 'п.4: Bosh — 3 амбразуры (расчётов три)', bosh);
  const shotsVH = s.evalCtx(`dotEmbrasureShots({ faction: 'BeVe', crewInstances: [{ weaponName: 'Расчёт ПТО Bohler M37' }, { weaponName: 'Станковый пулемет Schwarzlose M.08/15' }] })`);
  ok(shotsVH === 3, 'п.4: у Van Hees 3 выстрела за фазу (1 ПТО + 2 пулемётных)', shotsVH);
  // ⚡ у оперативного юнита расчёты лежат в его отрядах
  const opUnit = s.evalCtx(`dotEmbrasureCount({ name: 'ДОТ Van Hees', faction: 'BeVe', squads: [
      { crewInstances: [{ weaponName: 'Расчёт ПТО Bohler M37' }, { weaponName: 'Станковый пулемет Schwarzlose M.08/15' }] }] })`);
  ok(opUnit === 2, 'п.4: на оперативной карте у Van Hees тоже 2 амбразуры (расчёты в squads[].crewInstances)', opUnit);
  const def = s.evalCtx(`dotEmbrasureHp({ name: 'ДОТ без данных' })`);
  ok(def === 3, 'п.4: без данных о расчётах — исторические 3 (страховка старых сохранений)', def);
  ok(/dotEmbrasureShots\(squad\)/.test(HTML) && /dotEmbrasureCount\(t\.unit\)/.test(HTML),
    'п.4: лимит выстрелов и подписи «осталось X/N» берут число амбразур из расчётов');
}

// ─────────────────────────── п.5: пункт боепитания противника скрыт до обнаружения ───────────────────────────
{
  const s = createSandbox(freshAppData()); // js/hexmaps.js песочница грузит целиком
  const hidden = s.evalCtx(`(function () {
    var map = { autoSupplyKeysEnemy: ['4,4'], enemySquads: [
      { name: 'Штаб взвода', detected: false, hexPos: [4,4], fighters: [{ hp: 3 }] }] };
    return { own: supplyPointVisibleToPlayer(map, '4,4'), markers: tacticalVisibleMarkers(map, '4,4', ['ammoPoint','dot']) };
  })()`);
  ok(hidden.own === false && hidden.markers.length === 1 && hidden.markers[0] === 'dot',
    'п.5: пока штаб взвода противника не обнаружен, его пункт боепитания не рисуется', JSON.stringify(hidden));
  const revealed = s.evalCtx(`(function () {
    var map = { autoSupplyKeysEnemy: ['4,4'], enemySquads: [
      { name: 'Штаб взвода', detected: true, hexPos: [4,4], fighters: [{ hp: 3 }] }] };
    return supplyPointVisibleToPlayer(map, '4,4');
  })()`);
  ok(revealed === true, 'п.5: обнаруженный штаб взвода открывает свой пункт боепитания');
  ok(/log\('📦 Пункт боепитания противника: перемещение штаба учтено \(место скрыто до обнаружения\)\.'\)/.test(HEXMAPS),
    'п.5: журнал синхронизации тоже не выдаёт место вражеского пункта');
  ok(/tacticalVisibleMarkers\(appData\.map, hexKey, markers\)/.test(HTML),
    'п.5: фильтр применяется при отрисовке меток тактической карты');
}

// ─────────────────────────── п.6: стрельба не блокируется локом/ложной рукопашной; подавление — 1 отделение на раунд ───────────────────────────
{
  ok(/var __tacticalActionRefusal = null;/.test(HTML) && /function tacticalLastActionRefusal\(\)/.test(HTML) &&
     /tacticalLastActionRefusal\(\)/.test(HTML),
    'п.6: отказ боя запоминает настоящую причину (её и показывает панель)');
  ok(!/Сейчас стрелять нельзя: рукопашная, подавление по морали/.test(HTML),
    'п.6: общий список условий («рукопашная, подавление, фаза…») убран');
  ok(/const TACTICAL_MOVEMENT_LOCK_TTL_MS/.test(HTML) && /function releaseStaleTacticalMovementLock\(/.test(HTML) &&
     /releaseStaleTacticalMovementLock\(\)/.test(HTML.slice(HTML.indexOf('function tacticalActionAllowed'))),
    'п.6: зависший лок движения снимается по TTL и не блокирует действия всем отрядам');
  ok(/function tacticalIsMeleeEngaged\(squad\)[\s\S]{0,1200}if \(!a \|\| !b\) return false;/.test(HTML),
    'п.6: неизвестная позиция больше не считается рукопашной');
  const s = createSandbox(freshAppData());
  s.run('TACTICAL_PHASES_PER_ROUND = 2; TACTICAL_ROUNDS_PER_OPERATIONAL_TURN = 5; var currentTurn = 1;');
  loadHtml(s, ['getTacticalRoundProgress', 'tacticalSuppressionRoundStamp', 'markTacticalSuppressed', 'expireTacticalSuppression']);
  s.run(`appData.squads = [{ name: 'A', fighters: [] }, { name: 'B', fighters: [] }];
         appData.map = { enemySquads: [] };`);
  s.run(`markTacticalSuppressed(appData.squads[0], 'enemy');`);
  ok(s.evalCtx('appData.squads[0].suppressed === true && !appData.squads[1].suppressed'),
    'п.6: подавление ставится ОДНОМУ отделению, а не всему взводу');
  ok(s.evalCtx('appData.squads[0].suppressedRound === 1') && s.evalCtx('appData.squads[0].suppressedPhases === 0'),
    'п.6: у подавления стоит метка раунда/фазы');
  s.run('expireTacticalSuppression({ tacticalPhasesCompleted: 1 });');
  ok(s.evalCtx('appData.squads[0].suppressed === true'), 'п.6: свой раунд подавление ещё держится');
  s.run('expireTacticalSuppression({ tacticalPhasesCompleted: 2 });');
  ok(s.evalCtx('appData.squads[0].suppressed === false') && s.evalCtx('appData.squads[0].suppressedRound === undefined'),
    'п.6: со следующего раунда подавление снимается (один раунд, не навсегда)');
  ok(/expireTacticalSuppression\(/.test(sliceFunction(HTML, 'nextTurn')),
    'п.6: истечение подавления вызывается в nextTurn');
}

// ─────────────────────────── п.7: раунд = 2 фазы, 5 раундов = оперативный ход ───────────────────────────
{
  const s = createSandbox(freshAppData());
  s.run('TACTICAL_PHASES_PER_ROUND = 2; TACTICAL_ROUNDS_PER_OPERATIONAL_TURN = 5;');
  loadHtml(s, ['tacticalPhasesPerRound', 'tacticalRoundsPerOperationalTurn', 'tacticalRoundsWindowPhases', 'RPTX_PHASES_PER_WINDOW', 'getTacticalRoundProgress']);
  const rows = s.evalCtx(`[0,1,2,3,8,9,10].map(function (n) { var p = getTacticalRoundProgress({ tacticalPhasesCompleted: n }); return [n, p.round, p.completed, p.windowComplete]; })`);
  ok(JSON.stringify(rows) === JSON.stringify([[0,1,0,false],[1,1,1,false],[2,2,2,false],[3,2,3,false],[8,5,8,false],[9,5,9,false],[10,5,10,true]]),
    'п.7: 2 фазы = раунд; 5 раундов = 10 фаз = конец оперативного окна', JSON.stringify(rows));
  ok(/фаза атакующего \+ фаза обороняющегося/.test(HTML) && /turnCounterMax/.test(HTML),
    'п.7: в шапке боя раунды подписаны как «фаза атакующего + фаза обороняющегося»');
  ok(/pausedForOrders/.test(HTML) && /pauseCampaignTacticalBattlesForOrders/.test(HTML),
    'п.7: после 5 раундов бой приостанавливается до приказов');
  ok(/windowComplete/.test(HTML) || /RPTX_PHASES_PER_WINDOW/.test(HTML),
    'п.7: окно оперативного хода — произведение фаз и раундов, а не жёсткое 5 фаз');
}

// ─────────────────────────── п.8: вражеский ДОТ виден в тактическом бою ───────────────────────────
{
  ok(/function tacticalSquadIsFixedFortification\(/.test(HTML) && /function tacticalSquadIsFixedFortification\([\s\S]{0,400}isStatic/.test(HTML),
    'п.8: ДОТ/бункер опознаётся как стационарное укрепление');
  ok(/tacticalSquadIsFixedFortification[\s\S]{0,400}\.detected = true/.test(HTML),
    'п.8: при сборке боя укрепления получают detected (не прячутся и видны вражеские)');
  ok(/tacticalSquadIsFixedFortification\(enemy\)|fixedFort\(enemy\)/.test(HTML),
    'п.8: отрисовка вражеского ДОТа идёт мимо проверки detected');
}

// ─────────────────────────── п.9: ДОТ с запертой дверью не в рукопашной и стреляет ───────────────────────────
{
  const s = createSandbox(freshAppData());
  loadHtml(s, ['tacticalEnemyIsNeutralized', 'tacticalIsDotSquad', 'tacticalDotMeleeImmune', 'tacticalIsMeleeEngaged']);
  s.run(sliceFunction(HEXMAPS, 'getBattleSquadHex'));
  s.run(`appData.map = { grid: { '3,3': { enemySquadIds: [0], squadIds: [0] } }, enemySquads: [
      { name: 'Стрелковое отделение', detected: true, fighters: [{ hp: 3 }] }] };
     appData.squads = [{ name: 'ДОТ Van Hees', crewInstances: [], fighters: [{ hp: 3 }] }];
     appData.squads[0].meleeOpponentName = 'Стрелковое отделение';
     appData.map.enemySquads[0].meleeOpponentName = 'ДОТ Van Hees';`);
  ok(s.evalCtx('tacticalDotMeleeImmune(appData.squads[0]) === true'),
    'п.9: пока дверь цела, ДОТ неуязвим для рукопашной');
  ok(s.evalCtx('tacticalIsMeleeEngaged(appData.squads[0]) === false'),
    'п.9: враг в гексе ДОТа не считается рукопашной с ДОТом');
  s.run('appData.squads[0].dotDoorDestroyed = true;');
  ok(s.evalCtx('tacticalDotMeleeImmune(appData.squads[0]) === false') && s.evalCtx('tacticalIsMeleeEngaged(appData.squads[0]) === true'),
    'п.9: после подрыва двери рукопашная с ДОТом возможна');

  const s2 = createSandbox(freshAppData());
  loadHtml(s2, ['tacticalIsDotSquad', 'tacticalDotBlindedBySmoke', 'tacticalDotFireRefusal']);
  s2.run(`tacticalSquadBattlePosition = function (squad) { return { key: '3,3' }; };
          tacticalHexIsSmoky = function () { return false; };
          appData.map = { grid: {} };`);
  const intact = s2.evalCtx(`tacticalDotFireRefusal({ name: 'ДОТ Van Hees', fighters: [{ hp: 3 }], crewInstances: [
      { weaponName: 'ПТО', fighterIndices: [0], active: true }] })`);
  ok(intact === null, 'п.9: ДОТ с живым расчётом стреляет, даже если враг стоит в его гексе', intact);
  s2.run(`tacticalHexIsSmoky = function () { return true; };`);
  ok(/Дым в гексе ДОТа/.test(String(s2.evalCtx(`tacticalDotFireRefusal({ name: 'ДОТ Van Hees', fighters: [{ hp: 3 }], crewInstances: [
      { weaponName: 'ПТО', fighterIndices: [0], active: true }] })`))),
    'п.9: ослеплённый дымом ДОТ огня не ведёт');
  s2.run(`tacticalHexIsSmoky = function () { return false; };`);
  const noCrew = s2.evalCtx(`tacticalDotFireRefusal({ name: 'ДОТ Van Hees', fighters: [{ hp: 3 }], crewInstances: [
      { weaponName: 'ПТО', fighterIndices: [0], active: false }] })`);
  ok(/Все амбразуры ДОТа выведены/.test(String(noCrew)), 'п.9: с выведенными амбразурами ДОТ огня не ведёт', noCrew);
  ok(/dotDoorDestroyed/.test(HTML.slice(HTML.indexOf('function resolveTacticalMeleesForTurn'), HTML.indexOf('function resolveTacticalMeleesForTurn') + 2500)),
    'п.9: рукопашная с ДОТом разрешается только после подрыва двери');
}

// ─────────────────────────── п.10: «закрепиться и ждать» — сначала дойти до конечной точки ───────────────────────────
{
  const body = sliceFunction(HTML, 'executeMoveOrder');
  ok(/holdMarchingOn/.test(body), 'п.10: марш к конечной точке не тормозит из-за видимого врага рядом');
  ok(/destinationBlockedByEnemy/.test(body), 'п.10: отдельно различается «конечная точка занята врагом»');
  ok(/Ещё не на конечной точке/.test(body) && /Закрепился и ждёт приказа/.test(body),
    'п.10: приказ «закрепиться» закрывается только на конечной точке');
  ok(/onDestination/.test(body), 'п.10: огонь открывается после прибытия на конечную точку');
  ok(/behavior === 'hold' \? 1 : 3/.test(HTML) && /order\.holdFireDistance != null \? order\.holdFireDistance : 1/.test(HTML),
    'п.10: дистанция огня «закрепиться» по умолчанию — 1 гекс');
}

// ─────────────────────────── п.11: обстрел гекса — залп по площади; прочие механики ───────────────────────────
{
  // v13.106: поля метки задаёт buildOpAreaFireMark (число залпов по ходам — turnsLeft)
  ok(/buildOpAreaFireMark/.test(HTML) && /rounds: rounds/.test(HTML) && /damageDie: isSau/.test(HTML) && /isMortar: isMortar/.test(HTML),
    'п.11: приказ «обстрелять гекс» сохраняет число снарядов, тип оружия и кость урона');
  const area = HTML.slice(HTML.indexOf('function resolveOperationalAreaFire'), HTML.indexOf('function isMediumArtillery'));
  ok(/for \(let i = 0; i < rounds; i\+\+\)/.test(area) && /Math\.random\(\) > 0\.5/.test(area),
    'п.11: обстрел площади — залп по снарядам (каждый ложится с вероятностью 50%)');
  ok(/hiddenHits/.test(area) && /видимых разведке целей там нет/.test(area),
    'п.11: скрытые попадания не раскрываются и в залпе по площади');
  ok(/const opGrid = appData\.campaign && appData\.campaign\.opMapGrid;/.test(HTML),
    'п.11: отрисовка оперативной карты не падает, когда карты гексов ещё нет (opMapGrid = null)');
  ok(/const PLACEMENT_STRIP_DEPTH = 2;/.test(PLACEMENT), 'п.11: ширина полосы выставления — 2 гекса (как в v13.099)');
}

// ─────────────────────────── служебное: версия и сборка ───────────────────────────
{
  const app = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
  ok(/^v13\.\d{3}$/.test(app) && Number(app.slice(4)) >= 100, 'версия приложения обновлена (' + app + ')');
  ok(new RegExp("CACHE_NAME = 'wargame-" + app + "'").test(SW), 'service-worker: кэш совпадает с версией');
  ok(MANIFEST.includes('БМ ' + app), 'manifest: short_name совпадает с версией');
  const marked = ['js/cards.js', 'js/data.js', 'js/hexmaps.js', 'js/operational_ui.js', 'js/templates.js'];
  const stale = marked.filter(rel => !read(rel).split('\n')[0].includes('⚡ BUILD-МАРКЕР: ' + app));
  ok(stale.length === 0, 'build-маркеры модулей синхронизированы', stale.join(', '));
  ok(SW.split('\n')[0].includes('⚡ BUILD-МАРКЕР: ' + app), 'service-worker: маркер сборки в шапке');
  ok(/Боевой модуль v13\.104/.test(HTML) && /appVersionBadge/.test(HTML), 'интерфейс показывает v13.104');
}

console.log(`\nИтог v13.100: PASS ${pass} · FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
