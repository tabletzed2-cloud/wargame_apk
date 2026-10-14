// Full-browser v13.097: card-stage recovery, migrated bonus, BTR orders and tactical rounds.
// Requires playwright and Chromium. Set CHROMIUM_PATH for a system browser.
// Optional: SPARTICUZ_CHROMIUM=1 uses the @sparticuz/chromium npm package.
// Screenshots, when requested via SCREENSHOT_DIR, must stay outside tracked assets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

async function browserOptions() {
  const options = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'] };
  if (process.env.CHROMIUM_PATH) options.executablePath = process.env.CHROMIUM_PATH;
  else if (process.env.SPARTICUZ_CHROMIUM) {
    const module = require('@sparticuz/chromium');
    const packaged = module.default || module;
    options.executablePath = await packaged.executablePath();
    options.args = packaged.args;
  }
  return options;
}
async function routeLocalFiles(route) {
  const url = new URL(route.request().url());
  if (url.host !== 'game.test') return route.abort();
  const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return route.fulfill({ status: 404, body: '' });
  }
  return route.fulfill({ body: fs.readFileSync(file), contentType: MIME[path.extname(file)] || 'application/octet-stream' });
}
async function screenshot(page, name, selector) {
  if (!process.env.SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
  const options = { path: path.join(process.env.SCREENSHOT_DIR, name + '.png') };
  if (selector) await page.locator(selector).screenshot(options);
  else await page.screenshot(options);
}

async function reloadCampaign(page, cards) {
  await page.reload({ waitUntil: 'load' });
  try { await page.waitForFunction(() => document.getElementById('campaignMapScreen').style.display !== 'none'); }
  catch (error) {
    console.error('RELOAD STATE', await page.evaluate(() => ({ lastUiScreen:appData.lastUiScreen,
      active:appData.campaign.active, stage:appData.campaign.opSetupStage,
      screen:document.getElementById('campaignMapScreen').style.display,
      menu:document.getElementById('mainMenu').style.display,
      stored:JSON.parse(localStorage.getItem(STORAGE_KEY)).lastUiScreen,
      overlay:document.getElementById('initialCardStageOverlay')?.style.display })));
    await screenshot(page,'resume-debug'); throw error;
  }
  if (cards) await page.locator('#initialCardStageOverlay').waitFor({ state: 'visible' });
}
async function checkCardsResume(page, faction, label) {
  await page.evaluate(faction => {
    appData.campaign.online = false; appData.campaign.scenario = 'valencia';
    confirmBattalion(faction, BATTALION_PRESETS[faction].supportOptions
      .slice(0, faction === 'BeVe' ? 3 : undefined).map(s => s.id));
    appData.campaign.currentTime = 540; appData.campaign.opTurnStartTime = 540; appData.currentTime = 540;
    appData.campaign.opSetupStage = 'cards'; appData.campaign.initialPlatoonCardsAssigned = false;
    showOperationalMap();
  }, faction);
  assert(await page.locator('#initialCardStageOverlay').isVisible(), 'cards reopen without advanceSetup');
  const choices = await page.evaluate(() => {
    const group = document.querySelector('.initial-card-unit');
    const inputs = [...group.querySelectorAll('.initial-campaign-card:not(:disabled)')]
      .filter(input => !getCardTargetSpec(input.dataset.cardName));
    return { index: Number(group.dataset.initialCardGroup), cards: inputs.slice(0,2).map(input => input.dataset.cardName) };
  });
  assert.equal(choices.cards.length, 2);
  let group = page.locator(`[data-initial-card-group="${choices.index}"]`);
  for (const name of choices.cards) await group.locator(`input[data-card-name=${JSON.stringify(name)}]`).check();
  assert.equal(await page.evaluate(index => appData.campaign.opUnits[index].cardSelection, choices.index), undefined);
  await reloadCampaign(page, true);
  group = page.locator(`[data-initial-card-group="${choices.index}"]`);
  assert.deepEqual(await group.locator('input:checked').evaluateAll(inputs => inputs.map(input => input.dataset.cardName)), choices.cards);
  assert.equal(await group.locator('[data-initial-card-count]').textContent(), 'Выбрано: 2/3');
  await screenshot(page, `cards-resume-${label}`);
  await page.evaluate(() => { closeInitialCardDistributionStage(); document.dispatchEvent(new Event('resume')); });
  assert(await page.locator('#initialCardStageOverlay').isVisible(), 'Cordova resume restores unfinished menu');
  await page.evaluate(() => closeInitialCardDistributionStage());
  await page.waitForFunction(() => getComputedStyle(document.getElementById('opPhaseDeploy')).display !== 'none');
  await page.locator('#btnFinishPlacement').click();
  assert(await page.locator('#initialCardStageOverlay').isVisible(), 'continue is reachable with placement locked');
  await page.locator('#initialCardStageOverlay button[onclick="selectInitialCampaignBonusCards()"]').click();
  await page.waitForFunction(() => appData.campaign.opSetupStage === 'orders' && appData.campaign.initialPlatoonCardsAssigned);
  assert(!(await page.locator('#initialCardStageOverlay').isVisible()));
  assert.equal(await page.evaluate(() => appData.campaign.initialCardDraft), undefined);
  await page.evaluate(index => {
    const unit = appData.campaign.opUnits[index]; unit.col = 3; unit.row = 3;
    appData.campaign.selectedOpUnit = unit; opOperationalUiState.selectedUnitId = index;
    redrawOperationalMap(); document.getElementById('opMapContainer').scrollTo(0,0); opOpenCommandMenu();
  }, choices.index);
  await page.locator('#opCommandMenu [data-category="special"]').click();
  await page.locator('#opCommandMenu [data-draft-field="specialAction"]').selectOption('recon');
  await page.locator('#opCommandMenu [data-cmd="submit"]').click();
  await page.waitForFunction(() => getAllOrdersList().some(o => o.type === 'recon' || o.orderType === 'recon'));
  console.log(`✓ ${label}: 2-card draft, reload/resume, accessible continue and actual order submission`);
}
async function checkBonusMigration(page, label) {
  await page.evaluate(() => {
    for (const faction of ['BeVe', '_global']) {
      appData.factions[faction].cardLibrary.find(c => c.name === 'Кальвинистская эффективность').type = 'negative';
    }
    appData.campaign.opUnits[0].cardSelection = { done: true,
      cards: [{name:'Кальвинистская эффективность',type:'negative',automaticDebuff:true}] };
    appData.activeCards.push({name:'Кальвинистская эффективность',type:'negative',automaticDebuff:true});
    saveData();
  });
  await reloadCampaign(page, false);
  const migration = await page.evaluate(() => ({
    types: ['BeVe','_global'].map(f => appData.factions[f].cardLibrary.find(c => c.name === 'Кальвинистская эффективность').type),
    assigned: appData.campaign.opUnits[0].cardSelection.cards[0],
    active: appData.activeCards.find(c => c.name === 'Кальвинистская эффективность')
  }));
  assert.deepEqual(migration.types, ['bonus','bonus']);
  assert.equal(migration.assigned.type, 'bonus'); assert.equal(migration.assigned.automaticDebuff, undefined);
  if (migration.active) { assert.equal(migration.active.type, 'bonus'); assert.equal(migration.active.automaticDebuff, undefined); }
  console.log(`✓ ${label}: real saved negative migrated to bonus without campaign reset`);
}
async function checkEmbarkedOrders(page, label) {
  await page.evaluate(() => {
    const list = appData.campaign.opUnits;
    const passenger = list.find(u => u.type === 'infantry_platoon');
    const hq = list.find(u => u.type === 'battalion_hq' || u.type === 'hq');
    passenger.col = null; passenger.row = null; passenger.hidden = true; passenger.embarkedInBtr = true;
    passenger.btrIds = [2]; passenger.maxAp = 8; passenger.ap = 8; passenger.behavior = 'ignore';
    hq.col = 3; hq.row = 3;
    const template = appData.templates.find(s => /БТР/.test(s.name));
    const carrier = {name:'БТР проверки',type:'btr_platoon',faction:appData.campaign.playerFaction,col:3,row:3,ap:8,maxAp:8,
      embarkedUnit:passenger.name,embarkedUnitId:1,squads:[JSON.parse(JSON.stringify(template))]};
    appData.campaign.opUnits = [hq,passenger,carrier]; appData.campaign.enemyOpUnits = [];
    appData.campaign.selectedOpUnit = passenger; hardMode.hqUnitId = 0;
    hardMode.orders = []; hardMode.pendingOrders = []; hardMode.messengerQueue = []; hardMode.orderQueue = [];
    opOperationalUiState.selectedUnitId = 1; redrawOperationalMap(); opOpenCommandMenu();
  });
  assert((await page.locator('#opCommandMenu').textContent()).includes('ждать отдельной высадки'));
  assert(await page.locator('#opCommandMenu [data-category="fire"]').isVisible());
  await page.locator('#opCommandMenu [data-category="move"]').click();
  await page.evaluate(() => { opOperationalUiState.draft.waypoints = [{col:4,row:3}]; });
  await page.locator('#opCommandMenu [data-cmd="submit"]').click();
  await page.waitForFunction(() => getAllOrdersList().some(o => o.toUnitId === 1 && o.type === 'move'));
  const before = await page.evaluate(() => {
    const order = getAllOrdersList().find(o => o.toUnitId === 1 && o.type === 'move');
    window.__embarkedOrderId = order.id; order.status = 'active';
    hardMode.pendingOrders = hardMode.pendingOrders.filter(o => o.id !== order.id);
    hardMode.messengerQueue = hardMode.messengerQueue.filter(o => o.id !== order.id);
    if (!hardMode.orders.some(o => o.id === order.id)) hardMode.orders.push(order);
    const unit = appData.campaign.opUnits[1]; processOrders();
    return {type:order.type,series:order.series,status:order.status,ap:unit.ap,boarded:unit.embarkedInBtr,
      col:unit.col,row:unit.row,behavior:unit.behavior,waypoints:order.waypoints};
  });
  assert.equal(before.type, 'move'); assert(!before.series || before.series.length === 0, 'no inserted disembark');
  assert.equal(before.status, 'active'); assert.equal(before.boarded, true); assert.equal(before.ap, 8);
  assert.equal(before.col, null); assert.equal(before.row, null); assert.equal(before.behavior, 'ignore');
  assert.deepEqual(before.waypoints, [{col:4,row:3}]);
  const afterExit = await page.evaluate(() => {
    const unit = appData.campaign.opUnits[1], carrier = appData.campaign.opUnits[2]; carrier.col = 4; carrier.row = 4;
    executeOrder({type:'disembark',toUnitId:2,disembarkUnitId:1,targetHex:'4,4',status:'active'});
    const order = hardMode.orders.find(o => o.id === window.__embarkedOrderId); executeOrder(order); saveData();
    return {boarded:unit.embarkedInBtr,col:unit.col,row:unit.row,ap:unit.ap,status:order.status};
  });
  assert.deepEqual(afterExit, {boarded:false,col:4,row:4,ap:0,status:'active'});
  await reloadCampaign(page, false);
  assert.equal(await page.evaluate(() => appData.campaign.opUnits[1].ap), 0);
  const resumed = await page.evaluate(() => {
    endOperationalTurn(); const unit = appData.campaign.opUnits[1];
    return {col:unit.col,row:unit.row,turn:appData.campaign.currentTurn,
      orderStatus:hardMode.orders.find(o => o.toUnitId === 1 && o.type === 'move').status};
  });
  assert.equal(resumed.col, 4); assert.equal(resumed.row, 3); assert.equal(resumed.orderStatus, 'completed');
  console.log(`✓ ${label}: real passenger move waits aboard and in exit turn; survives reload and executes next operational turn`);
}
async function checkTacticalRounds(page, label) {
  const start = await page.evaluate(() => {
    const player = appData.campaign.opUnits.find(u => u.type === 'infantry_platoon');
    const hq = appData.campaign.opUnits.find(u => u.type === 'battalion_hq' || u.type === 'hq');
    player.col = 8; player.row = 8; player.isInBattle = false;
    player.behavior = 'ignore'; // isolate round progression from unrelated operational idle-fire popups
    appData.campaign.opUnits = [hq,player]; hardMode.orders = []; hardMode.hqUnitId = 0;
    hardMode.pendingOrders = []; hardMode.messengerQueue = []; hardMode.orderQueue = [];
    const template = appData.templates.find(s => s.faction === 'A.I.R.F.' && !s.armor && s.fighters && s.fighters.length >= 5);
    const squad = JSON.parse(JSON.stringify(template)); squad.name = 'Отделение противника проверки';
    squad.ammoSmall = 200; squad.currentMorale = squad.baseMorale; squad.effects = {};
    const enemy = {name:'Взвод противника проверки',type:'infantry_platoon',faction:'A.I.R.F.',
      col:8,row:8,maxAp:8,ap:8,squads:[squad],detected:true};
    appData.campaign.enemyOpUnits = [enemy];
    const time = appData.campaign.currentTime, turn = appData.campaign.currentTurn;
    startTacticalBattle([player],[enemy]);
    const battle = getTacticalBattleRecord();
    const keys = Object.keys(appData.map.grid).filter(key => placementSideAllowed(battle,'player',key));
    appData.squads.forEach((s,i) => {
      const key = keys[i]; appData.map.grid[key].squadIds = [i]; s.hexPos = key.split(',').map(Number);
    });
    if (!placementFinish()) throw new Error('real placement confirmation failed');
    battle.cardsChosen = true; battle.cardSelectionQueue = [];
    refreshBattleCardPickUI(); activateBattleTab(); updateUI(); saveCurrentBattleState();
    return {time,turn,battleId:battle.id};
  });
  await page.locator('#battleApp .tablinks[onclick*="mapTab"]').click();
  assert(await page.locator('#tacticalRoundBar').isVisible(), 'counter is visible in tactical map tab');
  const phaseButton = page.locator('#mapTab button[onclick="nextTurn()"]');
  for (let round = 1; round <= 5; round++) {
    assert.equal(await page.locator('#tacticalRoundLabel').textContent(), `Раунд ${round}`);
    assert((await page.locator('#tacticalRoundProgress').textContent()).includes(`${round}/5`));
    if (round === 3) { await page.evaluate(() => window.scrollTo(0,0)); await screenshot(page, `tactical-round-${label}`); }
    await phaseButton.click();
  }
  await page.locator('#tacticalOrdersPauseOverlay').waitFor({state:'visible'});
  assert((await page.locator('#tacticalOrdersPauseText').textContent()).includes('завершите оперативный ход'));
  assert(await page.locator('#campaignMapScreen').isVisible());
  assert(await page.locator('button[onclick="nextTurn()"]').evaluateAll(buttons => buttons.every(b => b.disabled)));
  const paused = await page.evaluate(id => {
    const b = appData.campaign.activeBattles.find(b => b.id === id);
    return {paused:b.pausedForOrders,round:b.currentTurn,phases:b.tacticalPhasesCompleted,
      time:appData.campaign.currentTime,turn:appData.campaign.currentTurn};
  }, start.battleId);
  assert.deepEqual(paused, {paused:true,round:6,phases:5,time:start.time+10,turn:start.turn});
  await screenshot(page, `tactical-pause-${label}`);
  await reloadCampaign(page, false);
  assert(await page.locator('#tacticalOrdersPauseOverlay').isVisible(), 'notice returns after loading paused campaign');
  await page.locator('#tacticalOrdersPauseAcknowledge').click();
  assert(await page.locator('#tacticalOrdersPauseBanner').isVisible(), 'closing modal does not remove reminder or resume');
  await page.evaluate(id => switchToBattle(id), start.battleId);
  assert.equal(await page.evaluate(() => appData.currentBattleId), null, 'direct re-entry cannot bypass pause');
  assert(await page.locator('#tacticalOrdersPauseOverlay').isVisible());
  await page.locator('#tacticalOrdersPauseAcknowledge').click();
  await page.locator('#opEndTurnBtn').click();
  assert(!(await page.locator('#tacticalOrdersPauseBanner').isVisible()));
  assert.equal(await page.evaluate(id => appData.campaign.activeBattles.find(b => b.id === id).tacticalPhasesCompleted, start.battleId), 0);
  await page.locator(`#activeBattlesList button[onclick="switchToBattle(${start.battleId})"]`).click();
  await page.locator('#battleApp .tablinks[onclick*="mapTab"]').click();
  assert.equal(await page.locator('#tacticalRoundLabel').textContent(), 'Раунд 6');
  assert((await page.locator('#tacticalRoundProgress').textContent()).includes('1/5'));
  await phaseButton.click();
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(() => document.getElementById('battleApp').style.display !== 'none' && appData.currentBattleId);
  assert.equal(await page.locator('#tacticalRoundLabel').textContent(), 'Раунд 7');
  assert((await page.locator('#tacticalRoundProgress').textContent()).includes('2/5'));
  await page.locator('#battleApp .tablinks[onclick*="mapTab"]').click();
  for (let round = 7; round <= 10; round++) {
    assert.equal(await page.locator('#tacticalRoundLabel').textContent(), `Раунд ${round}`);
    await phaseButton.click();
  }
  assert(await page.locator('#tacticalOrdersPauseOverlay').isVisible(), 'notice repeats after round 10');
  assert.equal(await page.evaluate(id => appData.campaign.activeBattles.find(b => b.id === id).currentTurn, start.battleId), 11);
  assert.equal(await page.evaluate(() => appData.campaign.currentTurn), start.turn+1);
  console.log(`✓ ${label}: real rounds 1–10, +10 minutes/window, pauses after 5/10, reload, manual operational turn and resume`);
}
(async () => {
  for (const layout of [
    {name:'desktop',viewport:{width:1440,height:1000}},
    {name:'mobile',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
  ]) for (const faction of ['BeVe','A.I.R.F.']) {
    if (process.env.BROWSER_LAYOUT && layout.name !== process.env.BROWSER_LAYOUT) continue;
    const browser = await chromium.launch(await browserOptions());
    try {
      const {name,...options} = layout;
      const page = await browser.newPage(options); page.setDefaultTimeout(15000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', dialog => dialog.accept());
      await page.route('**/*', routeLocalFiles);
      await page.goto('http://game.test/', {waitUntil:'load'});
      const label = faction.replace(/\./g,'') + '-' + name;
      await checkCardsResume(page,faction,label);
      await checkBonusMigration(page,label);
      if (faction === 'A.I.R.F.') await checkEmbarkedOrders(page,label);
      else await checkTacticalRounds(page,label);
      assert.deepEqual(errors, [], 'no uncaught page errors');
    } finally { await browser.close(); }
  }
  console.log(`Browser v13.097: PASS (BeVe/AIRF recovery; BTR and rounds 1–10; ${process.env.BROWSER_LAYOUT || 'desktop and mobile'})`);
})().catch(error => { console.error(error); process.exitCode = 1; });
