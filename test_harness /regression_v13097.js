// v13.097: embarked orders, resumable card stage, canonical bonus, tactical rounds.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const UI = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { failed++; console.error(`✗ ${name}: ${error.message.split('\n')[0]}`); }
}
function load(s, source, names) { names.forEach(name => s.run(sliceFunction(source, name))); }
function json(s, expression) { return JSON.parse(s.evalCtx(`JSON.stringify(${expression})`)); }

function ordersSandbox() {
  const s = createSandbox(freshAppData());
  load(s, HTML, ['markJustDisembarked', 'justDisembarkedThisTurn', 'executeOrder']);
  if (HTML.includes('function operationalOrderWaitsForDisembark(')) load(s, HTML, ['operationalOrderWaitsForDisembark']);
  s.run(`
    var calls = 0;
    function getOrderTypeLabel(type) { return type; }
    function executeMoveOrder(u, o) { calls++; u.ap--; o.progress = 1; }
    function executeAttackOrder(u, o) { calls++; }
    function executeReconOrder(u, o) { calls++; }
    function executeHoldOrder(u, o) { calls++; }
    function executeFireAtWillOrder(u, o) { calls++; }
    function executeShootAtOrder(u, o) { calls++; }
    function executeShootOrder(u, o) { calls++; }
    function executeShootEnemyOrder(u, o) { calls++; }
    function executeSectorFireOrder(u, o) { calls++; }
    function executeAmbushOrder(u, o) { calls++; }
    function executeDisembarkOrder(u, o) { calls++; }
    function executeSeriesOrder(u, o) { calls++; }
    var unit = { id: 0, name: 'Десант', type: 'infantry_platoon', embarkedInBtr: true,
      hidden: true, col: 4, row: 4, ap: 8, behavior: 'ignore' };
    appData.campaign.opUnits = [unit];
    appData.campaign.currentTurn = 3;
  `);
  return s;
}
for (const type of ['move', 'attack', 'recon', 'hold', 'fire_at_will', 'shoot_at', 'shoot', 'shoot_enemy', 'sector_fire', 'ambush']) {
  test(`десант: ${type} ждёт высадки без расхода ОД, прогресса и изменения поведения`, () => {
    const s = ordersSandbox();
    s.run(`var order = { type: '${type}', toUnitId: 0, status: 'active', behavior: 'engage',
      progress: 0, waypoints: [{col:6,row:4}] }; executeOrder(order); executeOrder(order);`);
    assert.equal(s.evalCtx('calls'), 0);
    assert.equal(s.evalCtx('unit.ap'), 8);
    assert.equal(s.evalCtx('unit.behavior'), 'ignore');
    assert.equal(s.evalCtx('order.progress'), 0);
    assert.equal(s.evalCtx('order.status'), 'active');
    assert.deepEqual(json(s, 'order.waypoints'), [{ col: 6, row: 4 }]);
    assert.equal(s.logs.length, 1, 'ожидание не засоряет журнал каждое исполнение');
  });
}
test('десант: обычный приказ возобновляется со следующего оперативного хода после высадки', () => {
  const s = ordersSandbox();
  s.run(`var order = {type:'move', toUnitId:0, status:'active', behavior:'engage', progress:0};
    executeOrder(order); unit.embarkedInBtr = false; unit.hidden = false;
    markJustDisembarked(unit); executeOrder(order); var callsOnExit = calls;
    appData.campaign.currentTurn++; unit.ap = 8; executeOrder(order);`);
  assert.equal(s.evalCtx('callsOnExit'), 0);
  assert.equal(s.evalCtx('calls'), 1);
  assert.equal(s.evalCtx('unit.behavior'), 'engage');
  assert.equal(s.evalCtx('order.progress'), 1);
});
test('десант: явная высадка и шаг высадки в серии разрешены, обычный шаг ждёт', () => {
  const s = ordersSandbox();
  s.run(`var explicit = {type:'disembark', toUnitId:0, status:'active'}; executeOrder(explicit);
    var chain = {type:'series', toUnitId:0, status:'active', series:[{type:'disembark',status:'active'},{type:'move'}]};
    executeOrder(chain); chain.series[0].status = 'completed'; executeOrder(chain);`);
  assert.equal(s.evalCtx('calls'), 2, 'высадка не блокируется, действие следующего шага блокируется');
});
test('десант: меню не добавляет автоматическую высадку к обычному приказу', () => {
  const s = createSandbox(freshAppData());
  load(s, UI, ['issueDraftOrder']);
  s.run(`
    var passenger = {name:'Десант',embarkedInBtr:true};
    var state = {draft:{}}; var issued;
    function selectedUnit(){return {unit:passenger,id:1};}
    function units(){return [{name:'БТР'},passenger];}
    function isOnlineTurn(){return true;} function ensureHardMode(){return true;}
    function parseDraftOptions(){return {type:'move',options:{waypoints:[{col:7,row:4}],targetHex:'7,4'}};}
    function seriesStep(type, options){return {type,...options};}
    function isBtrUnit(){return false;} function carrierIdForPassenger(){return 0;}
    function issueOneOrder(id,type,options){issued={id,type,...options,status:'active'};return issued;}
    function setMapMessage(){} function markChecklist(){} function closeCommandMenu(){}
    issueDraftOrder();
  `);
  assert.equal(s.evalCtx('issued.type'), 'move');
  assert.equal(s.evalCtx('issued.series'), undefined);
  assert.deepEqual(json(s, 'issued.waypoints'), [{ col: 7, row: 4 }]);
});
for (const selectCarrier of [false, true]) {
  test(`десант: ручная высадка (${selectCarrier ? 'выбран БТР' : 'выбран пассажир'}) — текущая позиция машины и ОД=0`, () => {
    const s = ordersSandbox();
    load(s, HTML, ['showBtrDisembarkDialog']);
    s.run(`var carrier = {name:'БТР',type:'btr_platoon',col:8,row:5,embarkedUnit:unit.name,embarkedUnitId:0};
      unit.btrIds=[1]; unit.embarkedCol=1; unit.embarkedRow=1;
      appData.campaign.opUnits=[unit,carrier];
      appData.campaign.selectedOpUnit=${selectCarrier ? 'carrier' : 'unit'};
      function updateBtrPanel(){} showBtrDisembarkDialog();`);
    assert.equal(s.evalCtx('unit.embarkedInBtr'), false);
    assert.equal(s.evalCtx('unit.col'), 8); assert.equal(s.evalCtx('unit.row'), 5);
    assert.equal(s.evalCtx('unit.ap'), 0);
    assert.equal(s.evalCtx('unit.justDisembarkedTurn'), 3);
    assert.equal(s.evalCtx('carrier.embarkedUnit'), null);
  });
}
test('десант: ETA не обещает выполнить приказ на борту в конце текущего хода', () => {
  const s = ordersSandbox();
  load(s, HTML, ['getOpTurnMinutes','getOrderEta','describeOrderEta']);
  s.run(`var order={type:'move',toUnitId:0,status:'active'}; var eta=getOrderEta(order); var description=describeOrderEta(order);`);
  assert.equal(s.evalCtx('eta.turns'), null);
  assert.match(s.evalCtx('eta.text'), /ждёт отдельной высадки/i);
  assert.match(s.evalCtx('description'), /ждёт отдельной высадки/i);
});
test('десант: постобработка атаки не обходит ожидание высадки', () => {
  const process = sliceFunction(HTML, 'processOrders');
  const attack = process.slice(process.indexOf('// 3. Обработка приказов'));
  assert.match(attack, /!unit\.embarkedInBtr/);
  assert.match(attack, /!justDisembarkedThisTurn\(unit\)/);
  assert.match(sliceFunction(HTML, 'createOrder'), /!toUnit\.embarkedInBtr/);
});

test('карточки: обе фазовые системы считают cards подготовкой, даже при placementLocked', () => {
  const s = createSandbox(freshAppData());
  load(s, HTML, ['currentPhase']);
  s.run(`var placementLocked = true; appData.campaign.opSetupStage = 'cards';`);
  assert.equal(s.evalCtx('currentPhase()'), 'deploy');
  assert.doesNotMatch(sliceFunction(UI, 'renderSetupCore'), /deployGroup\.style\.display = \(typeof placementLocked/);
});
test('карточки: сохранённая завершённая раздача переводит stale cards в orders', () => {
  const s = createSandbox(freshAppData());
  load(s, UI, ['setInitialStage']);
  s.run(`var placementLocked = false; var STAGES = ['placement','fortifications','communications','cards','orders'];
    function campaign(){return appData.campaign;} function ensureHardMode(){return true;}
    appData.campaign.opSetupStage = 'cards'; appData.campaign.initialPlatoonCardsAssigned = true;
    setInitialStage();`);
  assert.equal(s.evalCtx('appData.campaign.opSetupStage'), 'orders');
  assert.equal(s.evalCtx('placementLocked'), true);
});
test('карточки: незавершённый cards остаётся cards, восстановление не пропускает раздачу', () => {
  const s = createSandbox(freshAppData());
  load(s, UI, ['setInitialStage']);
  s.run(`var placementLocked = true; var STAGES = ['placement','fortifications','communications','cards','orders'];
    function campaign(){return appData.campaign;} function ensureHardMode(){return true;}
    appData.campaign.opSetupStage = 'cards'; appData.campaign.initialPlatoonCardsAssigned = false;
    setInitialStage();`);
  assert.equal(s.evalCtx('appData.campaign.opSetupStage'), 'cards');
  assert.equal(s.evalCtx('placementLocked'), true);
});
test('карточки: при возврате на карту восстанавливается меню, при автосохранении — черновик', () => {
  assert.match(UI, /function restoreCardStage\(/);
  assert.match(UI.slice(UI.indexOf('window.showOperationalMap = function')), /restoreCardStage\(\)/);
  assert.match(UI, /addEventListener\('resume', restoreCardStage\)/);
  assert.match(sliceFunction(HTML, 'saveData'), /saveInitialCampaignCardDraft\(\)/);
  assert.match(sliceFunction(HTML, 'toggleInitialCampaignCard'), /saveInitialCampaignCardDraft\(\)/);
});
test('карточки: сохранённый выбор отмечается в меню без применения эффектов', () => {
  const s = createSandbox(freshAppData());
  load(s, HTML, ['escapeCardHtml', 'initialCampaignCardUnitHtml']);
  s.run(`function getUnitCardFactionContext(){return {faction:'BeVe'};}
    function collectCardLibraryForContext(){return [{name:'Бонус',faction:'BeVe',type:'bonus'},
      {name:'Недоступный',faction:'BeVe',type:'bonus'}];}
    function isCardAvailableToUnit(card){return card.name !== 'Недоступный';}
    var unit = {name:'Взвод',squads:[]};
    appData.campaign.initialCardDraft = [{unitName:'Взвод',cards:[{name:'Бонус',faction:'BeVe'},
      {name:'Недоступный',faction:'BeVe'}]}]; var menu = initialCampaignCardUnitHtml(unit,0);`);
  assert.match(s.evalCtx('menu'), /checked/);
  assert.match(s.evalCtx('menu'), /Выбрано: 1\/3/);
  assert.equal(s.evalCtx('unit.cardSelection'), undefined);
});

test('карточки: скрытый старый DOM не затирает черновик, подтверждённая раздача не пересохраняется', () => {
  const s = createSandbox(freshAppData());
  load(s, HTML, ['saveInitialCampaignCardDraft']);
  s.run(`appData.campaign.opSetupStage='cards'; appData.campaign.opUnits=[{name:'Взвод'}];
    var overlay=document.getElementById('initialCardStageOverlay'); overlay.style.display='block';
    overlay.querySelectorAll=()=>[{dataset:{initialCardGroup:'0'},querySelectorAll:()=>[
      {dataset:{cardName:'Бонус',cardFaction:'BeVe'}}]}]; saveInitialCampaignCardDraft();
    var captured=JSON.stringify(appData.campaign.initialCardDraft);
    overlay.style.display='none'; overlay.querySelectorAll=()=>[];
    var hiddenSaved=saveInitialCampaignCardDraft();
    overlay.style.display='block'; appData.campaign.initialPlatoonCardsAssigned=true;
    var assignedSaved=saveInitialCampaignCardDraft();`);
  assert.deepEqual(json(s,'appData.campaign.initialCardDraft'), [{unitName:'Взвод',cards:[{name:'Бонус',faction:'BeVe'}]}]);
  assert.equal(s.evalCtx('hiddenSaved'), false); assert.equal(s.evalCtx('assignedSaved'), false);
});
test('загрузка: раннее сохранение Hard Mode не затирает экран и ОД сохранённого боя', () => {
  const s = createSandbox(freshAppData());
  load(s, HTML, ['saveData']);
  s.run(`var uiRestorePending=true, currentTurn=1, actionPoints={0:{ap:0,maxAp:6}}, STORAGE_KEY='test';
    var saved, rememberCalls=0; var battle={id:5,currentTurn:4,actionPoints:{0:{ap:5,maxAp:6}}};
    appData.lastUiScreen='campaignMap'; appData.currentBattleId=5; appData.map={grid:{}};
    appData.campaign.activeBattles=[battle];
    function rememberUiScreen(){rememberCalls++;appData.lastUiScreen='mainMenu';}
    function saveInitialCampaignCardDraft(){} function getTacticalBattleRecord(){return battle;}
    function safeLocalStorage(action,key,value){saved=JSON.parse(value);}
    saveData();`);
  assert.equal(s.evalCtx('rememberCalls'), 0);
  assert.equal(s.evalCtx('saved.lastUiScreen'), 'campaignMap');
  assert.equal(s.evalCtx('battle.currentTurn'), 4);
  assert.equal(s.evalCtx('battle.actionPoints[0].ap'), 5);
  s.run('uiRestorePending=false; currentTurn=4; saveData();');
  assert.equal(s.evalCtx('rememberCalls'), 1, 'после восстановления обычное автосохранение работает');
  assert.equal(s.evalCtx('saved.lastUiScreen'), 'mainMenu');
  assert.equal(s.evalCtx('battle.actionPoints[0].ap'), 0);
});

test('Кальвинистская эффективность: дефолтные глобальный и BeVe каталоги — bonus', () => {
  const s = createSandbox(freshAppData());
  assert.equal(s.evalCtx(`GLOBAL_CARDS.find(c=>c.name==='Кальвинистская эффективность').type`), 'bonus');
  assert.equal(s.evalCtx(`BEVE_CARDS.find(c=>c.name==='Кальвинистская эффективность').type`), 'bonus');
});
for (const scope of ['catalogs', 'active', 'units']) {
  test(`Кальвинистская эффективность: миграция старого negative — ${scope}`, () => {
    const s = createSandbox(freshAppData());
    load(s, HTML, ['syncFactionCatalogs']);
    s.run(`
      function getDefaultData(){return {factions:{BeVe:{cardLibrary:BEVE_CARDS},_global:{cardLibrary:GLOBAL_CARDS}}};}
      var legacy = {name:'Кальвинистская эффективность',type:'negative',automaticDebuff:true};
      appData.factions = {BeVe:{cardLibrary:[{...legacy}]},_global:{cardLibrary:[{...legacy}]}};
      appData.activeCards = [{...legacy}]; appData.campaign.opUnits = [{cardSelection:{cards:[{...legacy}]}}];
      appData.campaign.enemyOpUnits = [{cardSelection:{cards:[{...legacy}]}}]; syncFactionCatalogs();
    `);
    if (scope === 'catalogs') for (const faction of ['BeVe', '_global']) {
      assert.equal(s.evalCtx(`appData.factions[${JSON.stringify(faction)}].cardLibrary[0].type`), 'bonus');
    }
    if (scope === 'active') {
      assert.equal(s.evalCtx('appData.activeCards[0].type'), 'bonus');
      assert.equal(s.evalCtx('appData.activeCards[0].automaticDebuff'), undefined);
    }
    if (scope === 'units') for (const list of ['opUnits', 'enemyOpUnits']) {
      assert.equal(s.evalCtx(`appData.campaign.${list}[0].cardSelection.cards[0].type`), 'bonus');
      assert.equal(s.evalCtx(`appData.campaign.${list}[0].cardSelection.cards[0].automaticDebuff`), undefined);
    }
  });
}

function roundsSandbox() {
  const s = createSandbox(freshAppData());
  load(s, HTML, ['registerCompletedTacticalPhase', 'pauseCampaignTacticalBattlesForOrders',
    'resumePausedCampaignBattlesAfterOrders', 'getTacticalRoundProgress', 'updateTacticalRoundUI',
    'tacticalOrdersPauseMessage', 'renderTacticalOrdersPauseBanner', 'showTacticalOrdersPauseNotice', 'closeTacticalOrdersPauseNotice']);
  s.run(`var currentTurn = 1; var ONLINE = {started:false};
    var battle = {id:101,currentTurn:1,tacticalPhasesCompleted:0,tacticalMap:{grid:{}}};
    appData.campaign.online = false; appData.campaign.activeBattles = [battle];
    appData.currentBattleId = 101; appData.campaign.inBattle = true; appData.map = {grid:{}};
    function getTacticalBattleRecord(){return battle;}`);
  return s;
}
test('тактика: раунды 1–5 видны на общей панели (раунд = фаза атакующего + фаза обороняющегося)', () => {
  const s = roundsSandbox();
  for (let round = 1; round <= 5; round++) {
    // ⚡ v13.099 (п.9): раунд закрывается ДВУМЯ фазами, поэтому фаз = (round-1)*2
    s.run(`currentTurn=1; battle.currentTurn=currentTurn; battle.tacticalPhasesCompleted=${(round - 1) * 2}; updateTacticalRoundUI();`);
    assert.equal(s.elements.tacticalRoundLabel.textContent, `Раунд ${round}/5`);
    assert.match(s.elements.tacticalRoundProgress.textContent, new RegExp(`${round}/5`));
    assert.notEqual(s.elements.tacticalRoundBar.style.display, 'none');
  }
});
test('тактика: пауза содержит явное требование завершить оперативный ход, уведомление не toast', () => {
  const s = roundsSandbox();
  // ⚡ v13.099 (п.9): окно оперативного хода — 5 раундов = 10 фаз
  s.run(`currentTurn=11; battle.currentTurn=currentTurn; battle.tacticalPhasesCompleted=10;
    pauseCampaignTacticalBattlesForOrders(battle); showTacticalOrdersPauseNotice(); updateTacticalRoundUI();`);
  assert.equal(s.elements.tacticalOrdersPauseOverlay.style.display, 'flex');
  assert.match(s.elements.tacticalOrdersPauseBanner.textContent, /завершите оперативный ход/i);
  assert.match(s.elements.tacticalOrdersPauseBanner.textContent, /следующем оперативном ходу/i);
  assert.match(s.elements.tacticalRoundLabel.textContent, /5\/5.*завершён/);
  assert.match(HTML, /id="tacticalOrdersPauseOverlay"[^>]*role="dialog"/);
  assert.match(sliceFunction(HTML, 'updateTacticalTurnUI'), /button\.disabled = waiting \|\| paused/);
});
test('тактика: пауза сохраняется при загрузке, после закрытия окна остаётся баннер', () => {
  const s = roundsSandbox();
  s.run(`battle.currentTurn=11; battle.tacticalPhasesCompleted=10; pauseCampaignTacticalBattlesForOrders(battle);
    appData = JSON.parse(JSON.stringify(appData)); battle = appData.campaign.activeBattles[0];
    showTacticalOrdersPauseNotice(); closeTacticalOrdersPauseNotice(); renderTacticalOrdersPauseBanner();`);
  assert.equal(s.elements.tacticalOrdersPauseOverlay.style.display, 'none');
  assert.notEqual(s.elements.tacticalOrdersPauseBanner.style.display, 'none');
  assert.equal(s.evalCtx('battle.pausedForOrders'), true);
  s.run('showTacticalOrdersPauseNotice();');
  assert.equal(s.elements.tacticalOrdersPauseOverlay.style.display, 'none', 'повторные online snapshots не открывают окно заново');
});
test('тактика: следующий оперативный ход начинает блок 1/5 заново, пауза повторяется после пятого раунда', () => {
  const s = roundsSandbox();
  s.run(`battle.currentTurn=11; currentTurn=11; battle.tacticalPhasesCompleted=10;
    pauseCampaignTacticalBattlesForOrders(battle); showTacticalOrdersPauseNotice();
    appData.campaign.currentTurn++; resumePausedCampaignBattlesAfterOrders(appData.campaign.currentTurn,true);
    updateTacticalRoundUI();`);
  assert.equal(s.elements.tacticalOrdersPauseOverlay.style.display, 'none');
  assert.equal(s.elements.tacticalOrdersPauseBanner.style.display, 'none');
  assert.equal(s.elements.tacticalRoundLabel.textContent, 'Раунд 1/5');
  assert.match(s.elements.tacticalRoundProgress.textContent, /0\/5|1\/5/);
  // ⚡ v13.099 (п.9): 5 раундов нового оперативного хода = 10 фаз
  s.run(`for(var i=0;i<10;i++){ battle.currentTurn++; currentTurn=battle.currentTurn; registerCompletedTacticalPhase(battle); }
    pauseCampaignTacticalBattlesForOrders(battle); showTacticalOrdersPauseNotice(); updateTacticalRoundUI();`);
  assert.equal(s.elements.tacticalOrdersPauseOverlay.style.display, 'flex');
  assert.match(s.elements.tacticalRoundLabel.textContent, /5\/5.*завершён/);
});
test('тактика: общий online-маркер показывает то же окно и требует готовность обоих игроков', () => {
  const s = roundsSandbox();
  s.run(fs.readFileSync(path.join(ROOT,'js/online_battles.js'),'utf8'));
  s.run(`ONLINE={started:true,role:'p1',match:{turn:7,time:100,status:'playing'}};
    appData.campaign.online=true; appData.campaign.currentTurn=7;
    var pause={active:true,operationalTurn:7,campaignTime:110,campaignTurn:7,sourceBattleId:101};
    onlineHandleGlobalTacticalPause(pause);`);
  assert.equal(s.elements.tacticalOrdersPauseOverlay.style.display, 'flex');
  assert.match(s.elements.tacticalOrdersPauseText.textContent, /оба игрока/);
  s.run('closeTacticalOrdersPauseNotice(); onlineHandleGlobalTacticalPause(pause);');
  assert.equal(s.elements.tacticalOrdersPauseOverlay.style.display, 'none', 'повторный marker не спамит модальным окном');
  assert.equal(s.evalCtx('resumePausedCampaignBattlesAfterOrders(7,false)'), false);
  assert.equal(s.evalCtx('resumePausedCampaignBattlesAfterOrders(8,false)'), true);
  assert.equal(s.elements.tacticalOrdersPauseBanner.style.display, 'none');
});
test('тактика: панель раунда скрыта в редакторе ДОТов, но возвращается в настоящем бою', () => {
  const s = roundsSandbox();
  s.run('hexEditorState={kind:"initialFortification"}; updateTacticalRoundUI();');
  assert.equal(s.elements.tacticalRoundBar.style.display, 'none');
  s.run('hexEditorState=null; updateTacticalRoundUI();');
  assert.equal(s.elements.tacticalRoundBar.style.display, 'flex');
});
test('тактика: новая кампания с тем же временем не наследует дедупликацию прошлого уведомления', () => {
  const s = roundsSandbox();
  s.run(`battle.currentTurn=6; battle.tacticalPhasesCompleted=5;
    pauseCampaignTacticalBattlesForOrders(battle); showTacticalOrdersPauseNotice(); closeTacticalOrdersPauseNotice();
    appData.campaign.tacticalOrdersBarrier=null; battle.pausedForOrders=false; renderTacticalOrdersPauseBanner();
    pauseCampaignTacticalBattlesForOrders(battle); showTacticalOrdersPauseNotice();`);
  assert.equal(s.elements.tacticalOrdersPauseOverlay.style.display, 'flex');
});
test('тактика: номер и напоминание доступны на тактической карте, а не только в списке отрядов', () => {
  assert(HTML.indexOf('id="tacticalRoundBar"') < HTML.indexOf('id="battleTab"'), 'общая панель над вкладками');
  assert.match(UI, /showTacticalOrdersPauseNotice/);
  assert.match(fs.readFileSync(path.join(ROOT,'js/online_battles.js'),'utf8'), /showTacticalOrdersPauseNotice/);
  assert.match(sliceFunction(HTML,'nextTurn'), /showTacticalOrdersPauseNotice\(\)/);
});

console.log(`\nИтог v13.097: PASS ${passed} · FAIL ${failed}`);
process.exitCode = failed ? 1 : 0;
