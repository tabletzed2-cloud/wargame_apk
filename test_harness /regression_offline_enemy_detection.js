'use strict';
// Offline operational enemies start concealed, then use symmetric detection rules after setup/orders.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFunction, HTML } = require('./extract');
const ROOT = path.join(__dirname, '..');

function extractFunction(source, name, context) {
  vm.runInContext(sliceFunction(source, name), context);
}

// The regular offline opponent roster is not pre-discovered. Online defaults stay unchanged.
for (const online of [false, true]) {
  const context = {
    appData: { campaign: { online, battalions: { enemy: { faction: 'A.I.R.F.', units: [
      { type: 'infantry_company', name: 'Пехотная рота', icon: '',
        platoons: [{ name: '1-й пехотный взвод', squads: [{ name: 'Отделение', fighters: [{ hp: 3 }] }] }],
        hq: { name: 'Штаб роты', fighters: [{ hp: 3 }] } }
    ] } } } }, console
  };
  vm.createContext(context);
  extractFunction(HTML, 'createEnemyOperationalUnits', context);
  vm.runInContext('createEnemyOperationalUnits()', context);
  const enemies = vm.runInContext('appData.campaign.enemyOpUnits', context);
  assert.ok(enemies.length >= 2);
  assert.ok(enemies.every(unit => unit.detected === online),
    online ? 'online behavior preserves its prior visibility default' : 'offline enemy roster begins undetected');
}

// Operational visibility uses the detected/noise state; fixed scenario forts keep their known-position rule.
{
  const context = { appData: { campaign: { online: false } } };
  vm.createContext(context);
  extractFunction(HTML, 'opEnemyVisibleToPlayer', context);
  const visible = expr => vm.runInContext(expr, context);
  assert.equal(visible("opEnemyVisibleToPlayer({name:'hidden',detected:false})"), false);
  assert.equal(visible("opEnemyVisibleToPlayer({name:'noise',detected:false,noiseMarker:true})"), true);
  assert.equal(visible("opEnemyVisibleToPlayer({name:'spotted',detected:true})"), true);
  assert.equal(visible("opEnemyVisibleToPlayer({name:'ДОТ 1',detected:false})"), true,
    'known static fortifications retain the existing scenario rule');
}

// The actual operational map icon layout uses the same visibility gate, not only the click handler.
{
  const context = {
    appData: { campaign: { online: false, opUnits: [], enemyOpUnits: [
      { name: 'Hidden', col: 1, row: 1, detected: false },
      { name: 'Detected', col: 2, row: 2, detected: true },
      { name: 'Static fort', type: 'dots', col: 3, row: 3, detected: false }
    ] } },
    opUnitAnimPixel: {},
    onlineEnemyVisible: () => true
  };
  vm.createContext(context);
  extractFunction(HTML, 'opEnemyVisibleToPlayer', context);
  extractFunction(HTML, 'operationalUnitIconLayout', context);
  const names = vm.runInContext('operationalUnitIconLayout(40, 12).map(entry => entry.unit.name)', context);
  assert.deepEqual(JSON.parse(JSON.stringify(names)), ['Detected', 'Static fort']);

  // Preserve the map's pre-existing online visibility authority, even if local detected flags differ.
  context.appData.campaign.online = true;
  context.onlineEnemyVisible = unit => unit.name === 'Hidden';
  const onlineNames = vm.runInContext('operationalUnitIconLayout(40, 12).map(entry => entry.unit.name)', context);
  assert.deepEqual(JSON.parse(JSON.stringify(onlineNames)), ['Hidden']);
}

// The common detection pass checks all offline enemy units, not just vehicles; online remains host-owned.
{
  const player = { name: 'Player' };
  const infantry = { name: 'Enemy infantry', shouldDetect: false };
  const armor = { name: 'Enemy armor', shouldDetect: true };
  const context = {
    appData: { campaign: { online: false, opUnits: [player], enemyOpUnits: [infantry, armor, { name: 'ДОТ', type: 'dots' }] } },
    checked: [],
    isStaticOpUnit: unit => unit && unit.type === 'dots',
    opCheckUnitDetection: unit => {
      context.checked.push(unit.name);
      unit.detected = !!unit.shouldDetect;
      return { result: unit.detected ? 'detected' : 'hidden' };
    },
    log: () => {}, saveData: () => {}, redrawOperationalMap: () => {}
  };
  vm.createContext(context);
  extractFunction(HTML, 'checkAllUnitsDetection', context);
  vm.runInContext('checkAllUnitsDetection()', context);
  assert.deepEqual(context.checked, ['Player', 'Enemy infantry', 'Enemy armor']);
  assert.equal(infantry.detected, false);
  assert.equal(armor.detected, true);
  context.appData.campaign.online = true;
  context.checked.length = 0;
  vm.runInContext('checkAllUnitsDetection()', context);
  assert.deepEqual(context.checked, ['Player'], 'online opponent detection is not locally recalculated');
}

// After a non-firing AI move, detection is recalculated at the new position rather than leaving stale contact.
{
  const enemy = { name: 'Enemy scout', col: 4, row: 4, movedThisTurn: true,
    fireDetectionResolvedTurn: 2, detected: true };
  const context = {
    appData: { campaign: { online: false, currentTurn: 2, enemyOpUnits: [enemy] } },
    isStaticOpUnit: () => false,
    opCheckUnitDetection: unit => {
      context.rechecked = !Object.hasOwn(unit, 'fireDetectionResolvedTurn');
      unit.detected = false;
      unit.noiseMarker = false;
      return { result: 'hidden' };
    }
  };
  vm.createContext(context);
  extractFunction(HTML, 'refreshOfflineEnemyDetectionAfterAI', context);
  assert.equal(vm.runInContext('refreshOfflineEnemyDetectionAfterAI()', context), 1);
  assert.equal(context.rechecked, true);
  assert.equal(enemy.detected, false);
}

// Enemy order target pickers must not disclose hidden names or coordinates either.
{
  const source = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
  const enemies = [
    { name: 'Unknown', col: 1, row: 1, detected: false },
    { name: 'Noise contact', col: 2, row: 2, detected: false, noiseMarker: true },
    { name: 'Spotted', col: 3, row: 3, detected: true }
  ];
  const context = {
    appData: { campaign: { online: false, enemyOpUnits: enemies } },
    campaign: () => context.appData.campaign,
    onlineEnemyVisible: () => true,
    esc: value => String(value)
  };
  vm.createContext(context);
  extractFunction(HTML, 'opEnemyVisibleToPlayer', context);
  extractFunction(source, 'enemyVisibleToPlayer', context);
  extractFunction(source, 'enemyOptions', context);
  const html = vm.runInContext('enemyOptions(null)', context);
  assert.ok(!html.includes('Unknown'));
  assert.ok(html.includes('Noise contact') && html.includes('Spotted'));

  // Online target pickers continue to defer to the host-authoritative visibility check.
  context.appData.campaign.online = true;
  context.onlineEnemyVisible = enemy => enemy.detected === true;
  const onlineHtml = vm.runInContext('enemyOptions(null)', context);
  assert.ok(onlineHtml.includes('Unknown') === false && onlineHtml.includes('Noise contact') === false);
  assert.ok(onlineHtml.includes('Spotted'));
}

const aiSource = fs.readFileSync(path.join(ROOT, 'js/operational_ai.js'), 'utf8');
assert.match(aiSource, /refreshOfflineEnemyDetectionAfterAI\(\)/,
  'offline AI refreshes visibility after completing its operational actions');
assert.match(HTML, /offlineEnemyInitialDetectionDone[\s\S]*?checkAllUnitsDetection\(\)/,
  'the initial visibility roll occurs once after scenario placement');
console.log('PASS: offline enemy units start concealed, use detection to appear in map and target pickers, and refresh after AI movement; online is unchanged.');
