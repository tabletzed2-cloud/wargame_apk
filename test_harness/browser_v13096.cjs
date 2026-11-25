// Full-page regression: post-communications card selection and DOT-sector picking.
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

async function checkCardMenu(page, faction, label) {
  await page.evaluate(faction => {
    hardMode.enabled = false;
    appData.campaign.online = false;
    appData.campaign.scenario = 'valencia';
    const supportIds = BATTALION_PRESETS[faction].supportOptions
      .slice(0, faction === 'BeVe' ? 3 : undefined).map(support => support.id);
    confirmBattalion(faction, supportIds);
    appData.campaign.opSetupStage = 'cards';
    showOperationalMap();
    opSetupAdvance();
  }, faction);
  assert(await page.locator('#initialCardStageOverlay').isVisible());
  const menu = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.initial-card-unit')];
    return groups.map(group => {
      const unit = appData.campaign.opUnits[Number(group.dataset.initialCardGroup)];
      const expected = collectCardLibraryForContext(getUnitCardFactionContext(unit))
        .filter(card => (card.type || 'bonus') === 'bonus').map(card => ({ name: card.name, faction: card.faction }));
      const actual = [...group.querySelectorAll('.initial-campaign-card')]
        .map(input => ({ name: input.dataset.cardName, faction: input.dataset.cardFaction }));
      return { expected, actual };
    });
  });
  assert(menu.length > 0);
  for (const group of menu) {
    assert(group.expected.length > 5, 'real faction library is not empty');
    assert.deepEqual(group.actual, group.expected, 'every faction/common bonus must have a checkbox');
    assert.equal(new Set(group.actual.map(card => card.name)).size, group.actual.length);
  }
  await screenshot(page, `cards-${label}`);
  const choices = await page.evaluate(() => {
    const group = document.querySelector('.initial-card-unit');
    const inputs = [...group.querySelectorAll('.initial-campaign-card:not(:disabled)')]
      .filter(input => !getCardTargetSpec(input.dataset.cardName));
    return inputs.slice(0, 4).map(input => ({ name: input.dataset.cardName, faction: input.dataset.cardFaction }));
  });
  assert.equal(choices.length, 4, 'fixture has enough selectable non-targeted cards');
  const group = page.locator('.initial-card-unit').first();
  for (const card of choices.slice(0, 3)) await group.locator(`input[data-card-name=${JSON.stringify(card.name)}]`).check();
  await group.locator(`input[data-card-name=${JSON.stringify(choices[3].name)}]`).click();
  assert.equal(await group.locator('input:checked').count(), 3, 'fourth bonus must be rejected');
  assert.equal(await group.locator('[data-initial-card-count]').textContent(), 'Выбрано: 3/3');
  const second = group.locator(`input[data-card-name=${JSON.stringify(choices[1].name)}]`);
  await second.uncheck();
  assert.equal(await group.locator('[data-initial-card-count]').textContent(), 'Выбрано: 2/3');
  await second.check();
  await page.locator('#initialCardStageOverlay button[onclick="selectInitialCampaignBonusCards()"]')
    .click();
  await page.waitForFunction(() => appData.campaign.opSetupStage === 'orders' && appData.campaign.initialPlatoonCardsAssigned);
  assert(!(await page.locator('#initialCardStageOverlay').isVisible()));
  const assigned = await page.evaluate(() => {
    const unit = appData.campaign.opUnits.find(unit => unit.cardSelection && unit.cardSelection.cards.length);
    return unit.cardSelection.cards;
  });
  assert.deepEqual(assigned.filter(card => card.type === 'bonus').map(({ name, faction }) => ({ name, faction })), choices.slice(0, 3));
  assert.equal(assigned.filter(card => card.type === 'negative').length, 1);
  console.log(`✓ ${label}: ${menu.length} platoons, ${menu.reduce((sum, group) => sum + group.actual.length, 0)} cards; selection, limit and save work`);
}

async function checkSectors(page, label) {
  await page.evaluate(() => {
    appData.campaign.opUnits = [{ name: 'ДОТы', type: 'dots', faction: 'BeVe', col: 9, row: 5,
      squads: ['ДОТ Bosh', 'ДОТ Van Hees'].map((name, index) => {
        const squad = JSON.parse(JSON.stringify(appData.templates.find(template => template.name === name)));
        squad.fixedTacticalPosition = { hexKey: '9,5', key: (7 - index * 2) + ',7',
          weaponSectors: { 0: 'e', 1: 'w', 2: 'ne' } };
        return squad;
      }) }];
    openHexEditorForBattle('9,5', 'initialFortification');
  });
  await page.waitForFunction(() => hexEditorState && hexEditorState.kind === 'initialFortification' && appData.map.centers.length);
  const sectorSelect = page.locator('#hexEditorBanner select[onchange="setInitialDotWeaponSector(1,this.value)"]');
  await sectorSelect.selectOption('w');
  assert.equal(await page.evaluate(() => appData.campaign.opUnits[0].squads[0].fixedTacticalPosition.weaponSectors[1]), 'w');
  const pixelChanges = await page.evaluate(() => {
    const canvas = document.getElementById('gameMap');
    const ctx = canvas.getContext('2d');
    const scale = canvasBackingScale(canvas);
    const sample = () => appData.map.centers.map(center => [...ctx.getImageData(
      Math.floor(center.x * scale), Math.floor((center.y + 10) * scale), 1, 1).data]);
    hexEditorState.kind = 'trenches';
    redrawMap();
    const baseline = sample();
    hexEditorState.kind = 'initialFortification';
    redrawMap();
    const visible = sample();
    return visible.filter((pixel, index) => pixel.some((channel, c) => Math.abs(channel - baseline[index][c]) > 5)).length;
  });
  assert(pixelChanges > 20, 'sector must visibly tint multiple real canvas cells after terrain rendering');
  await page.locator('#hexEditorBanner button[onclick="setInitialDotSectorPick(1)"]').click();
  await page.evaluate(() => {
    const canvas = document.getElementById('gameMap');
    const target = appData.map.centers.find(center => center.key === '11,7');
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0,
      clientX: rect.left + target.x, clientY: rect.top + target.y }));
  });
  await page.waitForFunction(() => hexEditorState.dotSectorPickCrew === null && hexEditorState.dotWeaponSectors[1] === 'e');
  assert.equal(await page.evaluate(() => appData.campaign.opUnits[0].squads[0].fixedTacticalPosition.weaponSectors[1]), 'e');
  await screenshot(page, `sectors-${label}`, '#mapContainer');
  await page.locator('#hexEditorBanner button[onclick="setInitialDotSectorPick(2)"]').click();
  await page.locator('#hexEditorBanner select[onchange="setInitialDotCandidate(this.value)"]').selectOption('0:1');
  assert.equal(await page.evaluate(() => hexEditorState.dotSectorPickCrew), null);
  assert((await page.locator('#hexEditorBanner').textContent()).includes('360°'));
  await sectorSelect.selectOption('w');
  assert.equal(await page.evaluate(() => dotSectorWidthDeg(appData.campaign.opUnits[0].squads[1], 0)), 360);
  console.log(`✓ ${label}: Bosh/Van Hees sectors are visible (${pixelChanges} tinted cells); list, map click and DOT switching work`);
}

(async () => {
  for (const layout of [
    { name: 'desktop', viewport: { width: 1440, height: 1000 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  ]) {
    for (const faction of ['BeVe', 'A.I.R.F.']) {
      // Single-process Chromium cannot reliably reuse a closed browser context.
      const browser = await chromium.launch(await browserOptions());
      try {
        const { name, ...pageOptions } = layout;
        const page = await browser.newPage(pageOptions);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.dismiss());
        await page.route('**/*', routeLocalFiles);
        await page.goto('http://game.test/', { waitUntil: 'load' });
        const label = faction.replace(/\./g, '') + '-' + name;
        await checkCardMenu(page, faction, label);
        if (faction === 'BeVe') await checkSectors(page, label);
        assert.deepEqual(errors, [], 'no page errors');
      } finally { await browser.close(); }
    }
  }
  console.log('Browser regression: PASS (both factions, desktop and mobile)');
})().catch(error => { console.error(error); process.exitCode = 1; });
