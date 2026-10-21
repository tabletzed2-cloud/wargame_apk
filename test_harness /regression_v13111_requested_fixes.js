'use strict';
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML, ROOT } = require('./extract');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('✓ ' + name); } catch (e) { fail++; console.error('✗ ' + name + ' — ' + e.message); } }
function assert(v, message) { if (!v) throw new Error(message || 'assertion failed'); }

test('night halves tactical and operational visual range', () => {
  assert(HTML.includes('Math.floor(baseRange / 2)'), 'tactical fog range is halved at night');
  const s = createSandbox(freshAppData());
  s.run(`
    function isNightTime(){return nightFlag;}
    function getOpHexDistance(a,b,c,d){return Math.abs(a-c)+Math.abs(b-d);}
    function opLineOfSightBlocked(){return false;}
    var nightFlag=false; var target={col:3,row:0};
    appData.campaign.opUnits=[{col:0,row:0}]; appData.campaign.enemyOpUnits=[target];
  `);
  s.run(sliceFunction(HTML, 'opUnitInPlayerSight'));
  assert(s.evalCtx('opUnitInPlayerSight(target)'), 'three hexes remain in daytime operational sight');
  s.run('nightFlag=true;');
  assert(s.evalCtx('!opUnitInPlayerSight(target)'), 'operational sight shrinks to one hex at night');
  s.run('target.col=1;');
  assert(s.evalCtx('opUnitInPlayerSight(target)'), 'one hex remains visible at night');
});

test('offline tactical battle keeps enemy deployment tools; online battle blocks them', () => {
  const html = read('index.html');
  assert(html.includes('function syncTacticalEnemyPlacementPanel()'), 'enemy placement panel has an explicit availability gate');
  assert(html.includes('panel.style.display = onlineBattle ? \'none\' : \'flex\''), 'enemy deployment tools remain visible offline');
  assert(html.includes("if ((mode === 'placeEnemy' || mode === 'moveEnemy') && appData && appData.campaign && appData.campaign.online && appData.currentBattleId)"), 'placing enemy squads is blocked in online battles');
});

test('invalid operational anti-tank shots do not spend campaign ammunition', () => {
  const start = HTML.indexOf('function executeOpShootAt(targets, distance)');
  const end = HTML.indexOf('\nfunction ', start + 15);
  const body = HTML.slice(start, end);
  const armorCheck = body.indexOf('const armorTargets = getArmorUnits(targets)');
  const noTargetCheck = body.indexOf('if (armorTargets.length === 0)');
  const gunCheck = body.indexOf('if (gunCount === 0)');
  const spend = body.indexOf("consumeOperationalAmmo(shooter, 'ordnance')");
  assert(armorCheck >= 0 && noTargetCheck > armorCheck && gunCheck > noTargetCheck && spend > gunCheck, 'ammo is consumed only after valid armor target and active gun are confirmed');
});

test('Calvinist thrift is a bonus card and gives cumulative 20% ammo savings', () => {
  const cards = read('js/cards.js');
  assert(cards.includes('Расход боеприпасов −20% (голландцы)') && cards.includes('"ammoSaving": 0.2') && !cards.includes('"ammoRegen": 3'), 'both card-library entries use the new bonus effect');
  assert(HTML.includes('s.effects.calvinistAmmoSaving = true'), 'card application enables the saver on eligible Dutch squads');
  const s = createSandbox(freshAppData());
  s.run('function tacticalSquadHasCard(s,n){return (s.appliedCards||[]).includes(n); }');
  for (const fn of ['tacticalAmmoSavingApplies','tacticalAmmoCostAfterCards','spendTacticalAmmo']) s.run(sliceFunction(HTML, fn));
  s.run(`var squad={ammoSmall:100,effects:{calvinistAmmoSaving:true}}; var paid=0; for(var i=0;i<5;i++) paid += spendTacticalAmmo(squad,'ammoSmall',1);`);
  assert(s.evalCtx('paid === 4 && squad.ammoSmall === 96'), 'five one-round attacks consume four rounds in aggregate');
  s.run(`var ordinary={ammoSmall:100}; var ordinaryPaid=spendTacticalAmmo(ordinary,'ammoSmall',5);`);
  assert(s.evalCtx('ordinaryPaid === 5 && ordinary.ammoSmall === 95'), 'units without the card retain normal ammo cost');
});

console.log(`Итог v13.111: PASS ${pass} · FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
