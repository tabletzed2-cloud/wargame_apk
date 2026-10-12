'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction } = require('./extract');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const UI_JS = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');

let n = 0, f = [];
function test(name, fn) {
  try { fn(); n++; console.log('✓', name); }
  catch (e) { f.push(name + ': ' + e.message); console.log('✗', name, e.message); }
}

test('v13.084: версия и кэш', () => {
  assert.match(HTML, /var APP_VERSION = 'v13\.084'/);
  assert.match(SW, /const CACHE_NAME = 'wargame-v13\.084'/);
  assert.ok(fs.existsSync(path.join(ROOT, 'images/AIRF/Взвод снабжения АИРФ №1.png')), 'файл иконки АИРФ существует');
  assert.ok(fs.existsSync(path.join(ROOT, 'images/BeVe/Взвод снабжения BeVe №1.png')), 'файл иконки BeVe существует');
  assert.ok(SW.includes('./images/AIRF/Взвод снабжения АИРФ №1.png'), 'иконка АИРФ в кэше SW');
  assert.ok(SW.includes('./images/BeVe/Взвод снабжения BeVe №1.png'), 'иконка BeVe в кэше SW');
});

test('v13.084: иконки взводов снабжения в BATTALION_PRESETS и SQUAD_TEMPLATES', () => {
  const s = createSandbox(freshAppData());
  const presets = s.evalCtx('BATTALION_PRESETS');
  const templates = s.evalCtx('SQUAD_TEMPLATES');

  const bevePlatoon = presets['BeVe'].standard.find(u => u.name === 'Взвод снабжения');
  const airfPlatoon = presets['A.I.R.F.'].standard.find(u => u.name === 'Взвод снабжения');
  assert.equal(bevePlatoon.icon, 'images/BeVe/Взвод снабжения BeVe №1.png');
  assert.equal(airfPlatoon.icon, 'images/AIRF/Взвод снабжения АИРФ №1.png');

  bevePlatoon.squads.forEach(sq => {
    const tmpl = templates.find(t => t.name === sq.templateName && t.faction === 'BeVe');
    assert.ok(tmpl, `шаблон BeVe ${sq.templateName}`);
    assert.equal(tmpl.icon, 'images/BeVe/Взвод снабжения BeVe №1.png', `иконка шаблона ${sq.templateName}`);
  });

  airfPlatoon.squads.forEach(sq => {
    const tmpl = templates.find(t => t.name === sq.templateName && t.faction === 'A.I.R.F.');
    assert.ok(tmpl, `шаблон A.I.R.F. ${sq.templateName}`);
    assert.equal(tmpl.icon, 'images/AIRF/Взвод снабжения АИРФ №1.png', `иконка шаблона ${sq.templateName}`);
  });
});


test('v13.084: wizard, fixed action bar, replacement checklist, and cached UI assets', () => {
  assert.match(HTML, /var APP_VERSION = 'v13\.084'/);
  assert.match(SW, /const CACHE_NAME = 'wargame-v13\.084'/);
  assert.ok(SW.includes("'./js/operational_ui.js'"));
  assert.ok(SW.includes("'./css/operational_ui.css'"));
  assert.match(UI_JS, /BUILD-МАРКЕР: v13\.084/);
  for (const stage of ['placement', 'fortifications', 'communications', 'orders']) assert.ok(UI_JS.includes(`'${stage}'`));
  assert.match(UI_JS, /ensureHardMode\(\);\s*setStage\('communications'\)/);
  assert.match(UI_JS, /position|opQuickActions/);
  assert.match(HTML, /data-quick-action="communication"/);
  assert.match(HTML, /data-quick-action="order"/);
  assert.match(HTML, /data-quick-action="supply"/);
  assert.match(HTML, /Наладить связь/);
  assert.match(HTML, /Отдать приказы/);
  assert.doesNotMatch(HTML, /label: '⬜ Двинуть отряд'/);
  assert.doesNotMatch(HTML, /label: '⬜ Открыть огонь'/);
  assert.match(UI_JS, /Перетащите карточки отрядов на гексы/);
  assert.match(UI_JS, /pointerdown/);
  assert.match(HTML, /drawUnitNameLabels/);
  assert.match(HTML, /icons\.some\(icon => overlaps\(rect, icon\)\)/);
  assert.match(UI_JS, /data-draft-field="targetEnemyId"/);
  assert.match(UI_JS, /data-draft-field="btrUnitId"/);
  assert.match(UI_JS, /created\.push\(issueOneOrder\(vehicleId, result\.type, mirroredOptions, picked\.id\)\)/);
  assert.match(UI_JS, /waypoints: \(result\.options\.waypoints \|\| \[\]\)\.map/);
  assert.match(UI_JS, /title="\$\{esc\(u\.name\)\}"/);
  assert.match(UI_JS, /updatePlacementSelectionStyles\(\); \/\/ do not replace the dragged DOM node/);
  assert.match(UI_JS, /campaign\(\)\.selectedOpUnit/);
  assert.match(UI_JS, /data-kind="sector_fire"/);
  assert.match(UI_JS, /data-kind="ambush"/);
  assert.match(UI_JS, /fire_at_will/);
  assert.match(fs.readFileSync(path.join(ROOT, 'css/operational_ui.css'), 'utf8'), /\.op-shoot-notification[\s\S]*overflow-y: auto/);
});

test('v13.084: createOrder preserves compact fields for delivery and relay', () => {
  const s = createSandbox(freshAppData());
  s.run(`var currentTurn = 1;
    hardMode.enabled = true; hardMode.orders = []; hardMode.pendingOrders = []; hardMode.messengerQueue = [];
    function checkCommunication(){ return 'radio'; } function pushUndoAction(){};
    function mirrorOrderToEscorts(){ return 0; } // ⚡ v13.089: дублирование приказов сопровождению`);
  s.run(sliceFunction(HTML, 'createOrder'));
  s.run(`appData.campaign.opUnits = [{name:'HQ', col:0, row:0}, {name:'Infantry', col:1, row:1}];
    var createdOrder = createOrder(0, 1, 'sector_fire', {
      targetEnemyId: 4, targetEnemyUnitId: 'enemy-4', targetEnemyName: 'Gun crew',
      targetHexes: ['2,3', '3,4'], btrUnitId: 7,
      contactRadius: 2, holdFireDistance: 1, ambushStealthBonus: true,
      retreatDistance: 3, startTimeMin: 650, escortInfantryId: 1,
      stealth: true, waypoints: [{col:2,row:2}]
    });`);
  const order = s.evalCtx('createdOrder');
  assert.equal(order.status, 'active');
  assert.equal(order.targetEnemyId, 4);
  assert.equal(order.targetEnemyUnitId, 'enemy-4');
  assert.equal(order.targetEnemyName, 'Gun crew');
  assert.deepEqual(Array.from(order.targetHexes), ['2,3', '3,4']);
  assert.equal(order.btrUnitId, 7);
  assert.equal(order.contactRadius, 2);
  assert.equal(order.holdFireDistance, 1);
  assert.equal(order.ambushStealthBonus, true);
  assert.equal(order.startTimeMin, 650);
  assert.equal(order.escortInfantryId, 1);
  assert.equal(order.stealth, true);
  const relay = HTML.slice(HTML.indexOf('function executeCompanyOrder'), HTML.indexOf('function ', HTML.indexOf('function executeCompanyOrder') + 10));
  assert.match(relay, /targetEnemyUnitId: order\.targetEnemyUnitId != null \? String\(order\.targetEnemyUnitId\) : null/);
  assert.match(relay, /targetEnemyName: order\.targetEnemyName \|\| null/);
  assert.match(relay, /targetHexes: Array\.isArray\(order\.targetHexes\)/);
  assert.match(HTML, /contactRadius: order\.contactRadius != null \? Number\(order\.contactRadius\) : null/);
});

test('v13.084: contact radius and fire are limited to one shot per turn', () => {
  const s = createSandbox(freshAppData());
  s.run(`var shots = 0;
    var opShootingState = {active:false, shooter:null, targets:[], weaponType:null};
    function getOpHexDistance(c1,r1,c2,r2){ return Math.max(Math.abs(c1-c2), Math.abs(r1-r2)); }
    function canUnitShoot(){ return true; } function hasAtGunWeapons(){ return false; }
    function isArmoredUnit(){ return false; }
    function executeOpShoot(){ shots++; opShootingState.shooter.firedThisTurn = true; }
    function executeOpShootAt(){ shots++; opShootingState.shooter.firedThisTurn = true; }
    function isStaticOpUnit(){ return false; }`);
  s.run(sliceFunction(HTML, 'checkEnemyEncounter'));
  s.run(`var shooter = {name:'rifle', col:2, row:2, ap:4, behavior:'hold', firedThisTurn:false};
    var foe = {name:'foe', col:3, row:2, isDestroyed:false}; appData.campaign.enemyOpUnits = [foe];
    var holdOrder = {status:'active', contactRadius:2, holdFireDistance:1};
    var firstContact = checkEnemyEncounter(shooter, 'hold', holdOrder);
    var firstStatus = holdOrder.status;
    var secondContact = checkEnemyEncounter(shooter, 'engage', {status:'active', contactRadius:2});`);
  assert.equal(s.evalCtx('shots'), 1);
  assert.equal(s.evalCtx('firstContact'), true);
  assert.equal(s.evalCtx('firstStatus'), 'completed');
  assert.equal(s.evalCtx('secondContact'), true);
  s.run(sliceFunction(HTML, 'unitAutoFire'));
  assert.equal(s.evalCtx("unitAutoFire({name:'already fired', firedThisTurn:true}, 3)"), false);
});

test('v13.084: ambush has stealth, recon immunity, and clears only on a valid move', () => {
  const s = createSandbox(freshAppData());
  s.run(`function isStaticOpUnit(){ return false; } function isNightTime(){ return false; }
    var detectionRolls = 0; function rollD10(){ detectionRolls++; return 10; }
    function getOpHexTypes(){ return ['grass']; }`);
  for (const name of ['getOpDetectionModifier', 'executeAmbushOrder', 'checkOpDetection', 'executeMoveOrder']) {
    s.run(sliceFunction(HTML, name));
  }
  s.run(`var ambusher = {name:'Scout', type:'infantry_platoon', col:2, row:2, ap:4, canMove:true, detected:true, noiseMarker:true};
    appData.campaign.opUnits = [ambusher]; appData.campaign.selectedOpUnit = ambusher;
    var ambushOrder = {targetHex:'2,2', ambushStealthBonus:true, behavior:'ignore', status:'active'};
    executeAmbushOrder(ambusher, ambushOrder);`);
  assert.equal(s.evalCtx('ambusher.isAmbush'), true);
  assert.equal(s.evalCtx('ambusher.ambushStealthBonus'), 2);
  assert.equal(s.evalCtx('ambusher.ambushReconImmune'), true);
  assert.equal(s.evalCtx('ambusher.canMove'), false);
  assert.equal(s.evalCtx("getOpDetectionModifier(ambusher)"), -2); // ambush stealth penalty
  s.run('checkOpDetection();');
  assert.equal(s.evalCtx('detectionRolls'), 0, 'recon cannot roll against an immune ambush');
  s.run(`var invalidMove = {status:'active'}; executeMoveOrder(ambusher, invalidMove);`);
  assert.equal(s.evalCtx('ambusher.isAmbush'), true, 'invalid move must not break concealment');
  s.run(`var validMove = {status:'active', targetHex:'2,2'}; executeMoveOrder(ambusher, validMove);`);
  assert.equal(s.evalCtx('ambusher.isAmbush'), false);
  assert.equal(s.evalCtx('ambusher.ambushStealthBonus'), 0);
  assert.equal(s.evalCtx('ambusher.ambushReconImmune'), false);
  assert.equal(s.evalCtx('ambusher.canMove'), true);
});

test('v13.084: BTR embark/disembark preserves carrier, position and mobility', () => {
  const s = createSandbox(freshAppData());
  s.sandbox.document.readyState = 'loading'; // expose module handlers without running the DOM installer
  vm.runInContext(UI_JS, s.ctx, { filename: 'js/operational_ui.js' });
  s.run(`function getUnitBtrRequirement(){ return 1; }
    var passenger = {name:'Bicycle platoon', type:'bicycle_platoon', col:3, row:4, mobility:'bicycle', hidden:false};
    var carrier = {name:'БТР №1', type:'btr_platoon', col:3, row:4, groupSize:1, isGroup:false};
    appData.campaign.opUnits = [passenger, carrier];
    var embarkOrder = {btrUnitId:1, status:'active'};
    window.executeOperationalEmbarkOrder(passenger, embarkOrder);`);
  assert.equal(s.evalCtx('passenger.embarkedInBtr'), true);
  assert.equal(s.evalCtx('passenger.hidden'), true);
  assert.equal(s.evalCtx('passenger.col'), null);
  assert.equal(s.evalCtx('carrier.embarkedUnitId'), 0);
  assert.equal(s.evalCtx('embarkOrder.status'), 'completed');
  // ⚡ v13.088: executeDisembarkOrder теперь читает гекс высадки через orderDisembarkHex
  s.run(sliceFunction(HTML, 'orderDisembarkHex'));
  s.run(sliceFunction(HTML, 'executeDisembarkOrder'));
  s.run(`var disembarkOrder = {status:'active'}; executeDisembarkOrder(passenger, disembarkOrder);`);
  assert.equal(s.evalCtx('passenger.embarkedInBtr'), false);
  assert.equal(s.evalCtx('passenger.hidden'), false);
  assert.equal(s.evalCtx('passenger.col'), 3);
  assert.equal(s.evalCtx('passenger.row'), 4);
  assert.equal(s.evalCtx('passenger.mobility'), 'bicycle');
  assert.equal(s.evalCtx('carrier.embarkedUnit'), null);
  assert.equal(s.evalCtx('disembarkOrder.status'), 'completed');
});

console.log(n + ' passed, ' + f.length + ' failed');
if (f.length) process.exit(1);
