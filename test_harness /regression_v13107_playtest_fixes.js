// v13.107: Regression tests for the 6 playtest fixes.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

// ─── 1. Бутылки с зажигательной смесью раздаются всем отрядам взвода ───
test('1: «Бутылки с зажигательной смесью» раздаются всем живым небронированным отрядам взвода без выбора одного', () => {
  const s = createSandbox(freshAppData());
  for (const fn of ['getCardTargetSpec', 'getCardTargetCandidates', 'cardSelectionTargetNames', 'addAppliedCardName', 'applyCardToPlatoon']) {
    s.run(sliceFunction(HTML, fn));
  }
  assert.equal(s.evalCtx("getCardTargetSpec('Бутылки с зажигательной смесью')"), null, 'карта не должна требовать выбора одного отряда');
  assert.equal(
    s.evalCtx("cardSelectionTargetNames({ targets: { 'Бутылки с зажигательной смесью': ['Стрелковое отделение №1'] } }, 'Бутылки с зажигательной смесью').length"),
    0,
    'старые одиночные цели игнорируются'
  );
  s.run(`
    var unit = {
      name: '1-й стрелковый взвод',
      squads: [
        { name: 'Штаб взвода', faction: 'A.I.R.F.', grenades: 2, armor: null, fighters: [{ hp: 3 }, { hp: 3 }, { hp: 3 }] },
        { name: 'Стрелковое отделение №1', faction: 'A.I.R.F.', grenades: 10, armor: null, fighters: [{ hp: 3 }, { hp: 3 }, { hp: 3 }, { hp: 3 }] },
        { name: 'Стрелковое отделение №2', faction: 'A.I.R.F.', grenades: 10, armor: null, fighters: [{ hp: 3 }, { hp: 3 }, { hp: 0 }] },
        { name: 'Бронеавтомобиль', faction: 'A.I.R.F.', grenades: 0, armor: { front: 10, side: 8, rear: 6 }, fighters: [{ hp: 3 }] }
      ]
    };
    var card = { name: 'Бутылки с зажигательной смесью', faction: 'A.I.R.F.' };
    applyCardToPlatoon(card, 'A.I.R.F.', unit, unit.squads, ['Стрелковое отделение №1'], { initial: true });
  `);
  assert.equal(s.evalCtx('unit.squads[0].effects && unit.squads[0].effects.molotov'), true);
  assert.equal(s.evalCtx('unit.squads[0].grenades'), 3);
  assert.equal(s.evalCtx('unit.squads[1].effects && unit.squads[1].effects.molotov'), true);
  assert.equal(s.evalCtx('unit.squads[1].grenades'), 4);
  assert.equal(s.evalCtx('unit.squads[2].effects && unit.squads[2].effects.molotov'), true);
  assert.equal(s.evalCtx('unit.squads[2].grenades'), 2);
  assert.equal(s.evalCtx('Boolean(unit.squads[3].effects && unit.squads[3].effects.molotov)'), false);
});

// ─── 2. Недоступность функции подавления ДОТа ───
test('2: Функция подавления недоступна против ДОТа (карта, модалка, стрельба, статус, онлайн)', () => {
  const s = createSandbox(freshAppData());
  for (const fn of [
    'tacticalIsDotSquad', 'tacticalEnemyIsNeutralized', 'tacticalDotMeleeImmune', 'tacticalIsMeleeEngaged',
    'tacticalMoraleScale', 'tacticalMoraleCurrent', 'tacticalEffectiveMoraleForSquad',
    'tacticalMoraleIsSuppressed', 'tacticalSquadIsSuppressed', 'tacticalSuppressionRoundStamp',
    'markTacticalSuppressed', 'toggleSuppression', 'suppressiveFire'
  ]) {
    s.run(sliceFunction(HTML, fn));
  }
  const hexmapsCode = fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8');
  s.run(sliceFunction(hexmapsCode, 'getBattleSquadHex'));
  s.run(sliceFunction(hexmapsCode, 'fillModalTargets'));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8'), s.ctx);

  s.run(`
    var currentSquadIndex = 0, currentTurn = 1;
    var shooter = { name: 'Стрелковое отделение №1', faction: 'A.I.R.F.', ammoSmall: 100, armor: null, fighters: [{ name: 'Стрелок', weapon: 'Винтовка', hp: 3, maxHp: 3 }] };
    var dotEnemy = { name: 'ДОТ Van Hees', faction: 'BeVe', detected: true, armor: null, fighters: [{ name: 'Пулемётчик', hp: 3, maxHp: 3 }], crewInstances: [{ weaponName: 'Станковый пулемет', fighterIndices: [0], active: true }] };
    var infEnemy = { name: 'Пехотное отделение №1', faction: 'BeVe', detected: true, armor: null, fighters: [{ name: 'Боец', hp: 3, maxHp: 3 }] };
    var currentSquad = shooter;
    appData.squads = [shooter];
    appData.map = {
      grid: {
        '2,2': { squadIds: [0], enemySquadIds: [] },
        '2,3': { squadIds: [], enemySquadIds: [0] },
        '2,4': { squadIds: [], enemySquadIds: [1] }
      },
      enemySquads: [dotEnemy, infEnemy],
      attackTargetEnemyIdx: 0
    };
  `);
  const evalDot = s.evalCtx("mapActionEvalTarget(mapActionDefById('suppressiveFire'), 0, 0)");
  assert.equal(evalDot.ok, false, 'ДОТ нельзя выбрать целью подавления на карте');
  assert.match(evalDot.reason, /ДОТ/i);

  const evalInf = s.evalCtx("mapActionEvalTarget(mapActionDefById('suppressiveFire'), 0, 1)");
  assert.equal(evalInf.ok, true, 'обычная пехота остаётся доступной целью подавления');

  assert.equal(s.evalCtx('markTacticalSuppressed(dotEnemy, "player")'), false, 'markTacticalSuppressed не ставит подавление на ДОТ');
  assert.equal(s.evalCtx('Boolean(dotEnemy.suppressed)'), false);
  s.run('dotEnemy.currentMorale = 0; dotEnemy.baseMorale = 5; dotEnemy.tacticalMoraleMax = 5;');
  assert.equal(s.evalCtx('tacticalMoraleIsSuppressed(dotEnemy)'), false, 'ДОТ не подавляется низким духом');
  assert.equal(s.evalCtx('tacticalSquadIsSuppressed(dotEnemy)'), false, 'tacticalSquadIsSuppressed возвращает false для ДОТа');

  s.run('currentSquad = dotEnemy; toggleSuppression();');
  assert.equal(s.evalCtx('Boolean(dotEnemy.suppressed)'), false, 'ручной переключатель подавления не включает подавление на ДОТе');
});

// ─── 3. Счётчик раундов тактического боя ───
test('3: Счётчик раундов тактического боя корректно считает 1/5..5/5 и синхронизируется', () => {
  const s = createSandbox(freshAppData());
  for (const fn of [
    'tacticalPhasesPerRound', 'tacticalRoundsPerOperationalTurn', 'tacticalRoundsWindowPhases',
    'RPTX_PHASES_PER_WINDOW', 'tacticalRoundsCompletedForBattle', 'getTacticalRoundProgress',
    'getTacticalBattleRecord', 'getTacticalActiveSide', 'setTacticalActiveSide',
    'registerCompletedTacticalPhase', 'updateTacticalRoundUI', 'pauseCampaignTacticalBattlesForOrders',
    'resumePausedCampaignBattlesAfterOrders', 'tacticalOrdersPauseMessage',
    'renderTacticalOrdersPauseBanner', 'showTacticalOrdersPauseNotice', 'closeTacticalOrdersPauseNotice'
  ]) {
    s.run(sliceFunction(HTML, fn));
  }
  s.run(`
    var currentTurn = 1, inStandaloneBattle = false;
    var battle = {
      id: 77,
      hexKey: '4,5',
      currentTurn: 1,
      tacticalPhasesCompleted: 0,
      phaseRevision: 0,
      activeSide: 'player',
      placement: { phase: 'done', attackerSide: 'player' },
      playerSquads: [{ name: 'Стрелковое отделение', fighters: [{ hp: 3 }] }],
      enemySquads: [{ name: 'Пехотное отделение', fighters: [{ hp: 3 }] }],
      tacticalMap: { activeSide: 'player', attackerSide: 'player', enemySquads: [{ name: 'Пехотное отделение', fighters: [{ hp: 3 }] }] }
    };
    appData.currentBattleId = 77;
    appData.campaign.activeBattles = [battle];
    appData.map = battle.tacticalMap;
    updateTacticalRoundUI(battle);
  `);
  assert.equal(s.elements.turnCounter.innerText, 1);
  assert.equal(s.elements.turnCounterMax.innerText, 5);
  assert.match(s.elements.tacticalRoundLabel.textContent, /Раунд 1\/5/);
  assert.match(s.elements.turnCounterMap.textContent, /Раунд: 1\/5/);

  // Проходим фазы 1..9 и проверяем номер раунда в шапке, на полосе и на карте
  for (let phase = 1; phase <= 9; phase++) {
    s.run(`
      battle.currentTurn++;
      currentTurn = battle.currentTurn;
      battle.activeSide = battle.activeSide === 'player' ? 'enemy' : 'player';
      registerCompletedTacticalPhase(battle);
      updateTacticalRoundUI(battle);
    `);
    const expectedRound = Math.min(5, Math.floor(phase / 2) + 1);
    assert.equal(Number(s.elements.turnCounter.innerText), expectedRound, `шапка на фазе ${phase}`);
    assert.match(s.elements.tacticalRoundLabel.textContent, new RegExp(`Раунд ${expectedRound}/5`), `полоса на фазе ${phase}`);
    assert.match(s.elements.turnCounterMap.textContent, new RegExp(`Раунд: ${expectedRound}/5`), `карта на фазе ${phase}`);
  }

  // Одиночный бой даже после перезагрузки (inStandaloneBattle === false, battle === null)
  s.run(`
    appData.currentBattleId = null;
    appData.campaign.activeBattles = [];
    inStandaloneBattle = false;
    appData._standaloneTacticalPhasesCompleted = 0;
    registerCompletedTacticalPhase(null);
    registerCompletedTacticalPhase(null);
    updateTacticalRoundUI(null);
  `);
  assert.equal(Number(s.elements.turnCounter.innerText), 2, 'одиночный бой после 2 фаз показывает Раунд 2/5 даже после перезагрузки');
  assert.match(s.elements.tacticalRoundLabel.textContent, /Раунд 2\/5/);
});

// ─── 4. Боевой дух снайперов и миномётов = 5 ───
test('4: У снайперов и миномётов базовый и тактический боевой дух равен 5', () => {
  const s = createSandbox(freshAppData());
  for (const fn of ['tacticalIsSniperOrMortarSquad', 'tacticalMarkStartingMoraleCasualties', 'tacticalInitializeSquadMorale']) {
    s.run(sliceFunction(HTML, fn));
  }
  const templates = s.evalCtx("SQUAD_TEMPLATES.filter(t => /Снайперское звено|Минометный расч[её]т/i.test(t.name || ''))");
  assert(templates.length >= 15, 'шаблоны снайперов и миномётов найдены');
  templates.forEach(t => {
    assert.equal(t.baseMorale, 5, `шаблон ${t.name} должен иметь baseMorale = 5`);
    assert.equal(t.currentMorale, 5, `шаблон ${t.name} должен иметь currentMorale = 5`);
  });

  s.run(`
    var sniper = { name: 'Снайперское звено OIP №1', faction: 'BeVe', baseMorale: 5, currentMorale: 5, fighters: [{ name: 'Снайпер', weapon: 'Geweer OIP M.38', hp: 3 }, { name: 'Наблюдатель', weapon: 'Винтовка Geweer M95', hp: 3 }] };
    var mortar = { name: 'Минометный расчёт 82-мм №1', faction: 'A.I.R.F.', baseMorale: 5, currentMorale: 5, crewInstances: [{ weaponName: '82-мм миномет', fighterIndices: [0, 1, 2], active: true }], fighters: [{ hp: 3 }, { hp: 3 }, { hp: 3 }] };
    tacticalInitializeSquadMorale(sniper, 'b-1');
    tacticalInitializeSquadMorale(mortar, 'b-1');
  `);
  assert.equal(s.evalCtx('sniper.baseMorale'), 5);
  assert.equal(s.evalCtx('sniper.currentMorale'), 5);
  assert.equal(s.evalCtx('sniper.tacticalMoraleMax'), 5);
  assert.equal(s.evalCtx('mortar.baseMorale'), 5);
  assert.equal(s.evalCtx('mortar.currentMorale'), 5);
  assert.equal(s.evalCtx('mortar.tacticalMoraleMax'), 5);
});

// ─── 5. Два отряда противника в одном гексе: гранаты, орудия/миномёты и подавление ───
test('5: При 2 отрядах противника в одном гексе гранаты, орудия/миномёты и подавление выбирают весь гекс и действуют на оба отряда', () => {
  const s = createSandbox(freshAppData());
  for (const fn of [
    'tacticalIsDotSquad', 'tacticalEnemyIsNeutralized', 'tacticalDotMeleeImmune', 'tacticalIsMeleeEngaged',
    'tacticalSquadIsPlayerSide', 'tacticalAreaOccupantsAtTarget', 'tacticalSuppressionRoundStamp',
    'markTacticalSuppressed', 'tacticalRecordIncomingCasualty', 'tacticalMoraleScale', 'tacticalMoraleCurrent',
    'tacticalChangeMorale', 'tacticalMoraleBattleKey', 'tacticalApplyFighterMoraleLoss'
  ]) {
    s.run(sliceFunction(HTML, fn));
  }
  const hexmapsCode = fs.readFileSync(path.join(ROOT, 'js/hexmaps.js'), 'utf8');
  s.run(sliceFunction(hexmapsCode, 'getBattleSquadHex'));
  s.run(sliceFunction(hexmapsCode, 'fillModalTargets'));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8'), s.ctx);

  s.run(`
    var currentSquadIndex = 0, currentTurn = 1;
    var shooter = {
      name: 'Стрелковое отделение №1',
      faction: 'A.I.R.F.',
      ammoSmall: 100,
      ammoOrdnance: 20,
      grenades: 10,
      armor: null,
      fighters: [{ name: 'Стрелок', weapon: 'Винтовка', hp: 3, maxHp: 3 }]
    };
    var currentSquad = shooter;
    var e1 = { name: 'Пехотное отделение №1', faction: 'BeVe', detected: true, suppressed: false, fighters: [{ name: 'Б1', hp: 3, maxHp: 3 }, { name: 'Б2', hp: 3, maxHp: 3 }] };
    var e2 = { name: 'Пехотное отделение №2', faction: 'BeVe', detected: true, suppressed: false, fighters: [{ name: 'Б3', hp: 3, maxHp: 3 }, { name: 'Б4', hp: 3, maxHp: 3 }] };
    appData.squads = [shooter];
    appData.map = {
      grid: {
        '3,3': { squadIds: [0], enemySquadIds: [] },
        '3,4': { squadIds: [], enemySquadIds: [0, 1] }
      },
      enemySquads: [e1, e2],
      attackTargetEnemyIdx: 0
    };
  `);

  // Проверяем, что в модалке для гранат/орудий/подавления 2 отряда в одном гексе объединены в одну опцию гекса
  s.run("fillModalTargets('ordnance');");
  const ordnanceHtml = s.elements.modalTargetSelect.innerHTML;
  assert.match(ordnanceHtml, /Гекс 3,4 \(Пехотное отделение №1 \+ Пехотное отделение №2\)/, 'в списке целей орудий/миномётов должен выбираться весь гекс');
  const optionCount = (ordnanceHtml.match(/<option /g) || []).length;
  assert.equal(optionCount, 2, 'кроме пустой опции должна быть ровно 1 объединённая опция гекса');

  // Проверяем урон по обоим отрядам от гранат/орудий
  s.run("reportAttackOutcome('grenades', { hits: 2, damage: 4 });");
  const hp1 = s.evalCtx('e1.fighters.reduce((sum, f) => sum + f.hp, 0)');
  const hp2 = s.evalCtx('e2.fighters.reduce((sum, f) => sum + f.hp, 0)');
  assert.equal(hp1, 4, 'первый отряд в гексе получил половину урона');
  assert.equal(hp2, 4, 'второй отряд в гексе получил половину урона');

  // Проверяем подавление всего гекса (оба отряда подавлены, HP не снимается)
  s.run("reportAttackOutcome('suppressiveFire', { hits: 3, shots: 6 });");
  assert.equal(s.evalCtx('e1.suppressed'), true, 'первый отряд в гексе подавлен');
  assert.equal(s.evalCtx('e2.suppressed'), true, 'второй отряд в гексе подавлен');
  assert.equal(s.evalCtx('e1.fighters.reduce((sum, f) => sum + f.hp, 0)'), 4, 'подавление не снимает HP первого отряда');
  assert.equal(s.evalCtx('e2.fighters.reduce((sum, f) => sum + f.hp, 0)'), 4, 'подавление не снимает HP второго отряда');
});

// ─── 6. Отображение иконки карточки заменённого боеприпаса на кнопке гранат ───
test('6: При замене гранат карточкой на кнопке броска гранат отображается иконка и название карточки', () => {
  const s = createSandbox(freshAppData());
  for (const fn of ['escapeCardHtml', 'getSquadGrenadeReplacementInfo']) {
    s.run(sliceFunction(HTML, fn));
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8'), s.ctx);

  s.run(`
    var molotovSquad = { name: 'Стрелковое отделение №1', faction: 'A.I.R.F.', grenades: 5, effects: { molotov: true }, appliedCards: ['Бутылки с зажигательной смесью'] };
    var phosSquad = { name: 'Стрелковое отделение №2', faction: 'A.I.R.F.', grenades: 7, effects: { phosphorusGrenades: true }, appliedCards: ['Фосфорные гранаты'] };
    var dynSquad = { name: 'Штурмовое отделение №1', faction: 'A.I.R.F.', grenades: 10, effects: { dynamic: { active: true } }, appliedCards: ['Шахтерский динамит'] };
    var unstabSquad = { name: 'Пехотное отделение №1', faction: 'BeVe', grenades: 6, effects: { unstableGrenades: true }, appliedCards: ['Нестабильные гранаты'] };
    var plainSquad = { name: 'Пехотное отделение №2', faction: 'BeVe', grenades: 6, effects: {}, appliedCards: [] };
  `);

  const mInfo = s.evalCtx('getSquadGrenadeReplacementInfo(molotovSquad)');
  assert.equal(mInfo.cardName, 'Бутылки с зажигательной смесью');
  assert.match(mInfo.icon, /Бутылки с зажигательной смесью\.png$/);
  assert.match(mInfo.buttonLabel, /Бутылки с зажигательной смесью/);

  const pInfo = s.evalCtx('getSquadGrenadeReplacementInfo(phosSquad)');
  assert.equal(pInfo.cardName, 'Фосфорные гранаты');
  assert.match(pInfo.icon, /Фосфорные гранаты\.png$/);

  const dInfo = s.evalCtx('getSquadGrenadeReplacementInfo(dynSquad)');
  assert.equal(dInfo.cardName, 'Шахтерский динамит');
  assert.match(dInfo.icon, /Шахтерский динамит\.png$/);

  const uInfo = s.evalCtx('getSquadGrenadeReplacementInfo(unstabSquad)');
  assert.equal(uInfo.cardName, 'Нестабильные гранаты');
  assert.match(uInfo.icon, /Нестабильные гранаты\.png$/);

  assert.equal(s.evalCtx('getSquadGrenadeReplacementInfo(plainSquad)'), null);

  const mapBtnHtml = s.evalCtx("mapActionFormatActionLabel(mapActionDefById('grenades'), molotovSquad)");
  assert.match(mapBtnHtml, /grenade-card-btn-icon/, 'кнопка гранат на карте содержит иконку карточки');
  assert.match(mapBtnHtml, /Бутылки с зажигательной смесью/, 'кнопка гранат на карте содержит название карточки');
});

console.log(`\nИтог v13.107: PASS ${passed} · FAIL 0`);
