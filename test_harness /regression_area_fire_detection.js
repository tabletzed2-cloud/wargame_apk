'use strict';
const fs = require('fs');
const path = require('path');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
function ok(v, name) { if (v) { pass++; console.log('✓ ' + name); } else { fail++; console.error('✗ ' + name); } }
const s = createSandbox(freshAppData());
s.run(`
  function log() {}
  function rollD10() { return __roll; }
  function opDetectionModifier() { return 0; }
  function opLineOfSightBlocked() { return __los; }
  var __roll = 10, __los = false;
  appData.campaign.currentTurn = 4;
`);
for (const fn of ['addOperationalArtilleryNoise', 'opDetectionIsArmored', 'opCheckUnitDetection', 'opIsIndirectFireUnit', 'tacticalCanFireAreaHex', 'tacticalAreaOccupantsAtTarget', 'hasCardNamed', 'cardDraftBonusLimit', 'bonusCardSelectionLimit', 'cardSelectionNeedsDebuff']) {
  try { s.run(sliceFunction(HTML, fn)); } catch (e) { console.error(fn, e.message); }
}
s.run(`var directUnit = {name:'Пехота', col:1,row:1}; var directResult = opCheckUnitDetection(directUnit,{fireType:'direct'});`);
ok(s.evalCtx('directUnit.detected === true && directResult.immediate === true'), 'прямой огонь немедленно раскрывает стрелявший отряд');
s.run(`appData.campaign.enemyOpUnits = [{name:'Наблюдатель',col:8,row:8}]; var indirectUnit = {name:'Минбатарея', type:'mortar_battery', col:1,row:1}; var indirectSight = opCheckUnitDetection(indirectUnit,{fireType:'indirect'});`);
ok(s.evalCtx('indirectUnit.detected === false && indirectSight.anonymous === true && appData.campaign.opNoiseMarkers.length === 3'), 'батарея при огне создаёт три анонимных маркера шума, не раскрывая свою позицию');
s.run(`__los = true; __roll = 1; var concealedGun = {name:'САУ', type:'sau_battery', col:1,row:1}; var indirectHidden = opCheckUnitDetection(concealedGun,{fireType:'indirect'});`);
ok(s.evalCtx('concealedGun.detected === false && concealedGun.fireDetectionResolvedTurn === 4 && concealedGun.noiseMarker === false'), 'непрямой огонь САУ не создаёт точный маркер на позиции стрелка');
s.run(`
  __los = false;
  var shooter = {faction:'A', name:'82-мм миномёт', crewInstances:[]};
  appData.map = {grid:{}, enemySquads:[{name:'цель 1'},{name:'цель 2'}]};
  function tacticalSquadIsPlayerSide() { return true; }
  function getBattleSquadHex(grid, idx) { return {key: idx < 2 ? '3,4' : '8,8'}; }
  var areaList = tacticalAreaOccupantsAtTarget(shooter,0);
`);
ok(s.evalCtx('tacticalCanFireAreaHex(shooter) === true'), 'миномёт получает режим площадного огня');
ok(s.evalCtx('areaList.length === 2'), 'площадной огонь выбирает все отряды, размещённые в целевом гексе');
const html = read('index.html'), actions = read('js/map_actions.js');
ok(/Math\.min\(0\.60,[\s\S]{0,100}0\.15/.test(html), 'плотная цель даёт общий бонус до 60% по 15% за дополнительный отряд');
ok(/data\.areaFire === true/.test(actions) && /applyDamagePointsToEnemy\(victim, 1, one/.test(actions), 'урон площадного огня распределяется по бойцам разных отрядов');
const grenadeFn = sliceFunction(HTML, 'throwGrenades');
s.run(grenadeFn);
ok(/grenadeAreaTargets\.length > 1/.test(grenadeFn) && /reportAttackOutcome\('grenades',[\s\S]{0,120}areaFire: grenadeArea/.test(grenadeFn), 'гранатный бросок по скоплению активирует площадное распределение урона');
ok(/if \(currentSquad\.grenades <= 0\)[\s\S]{0,180}spendAP/.test(grenadeFn), 'отсутствие гранат проверяется до списания ОД');
s.run(`var commLimit = bonusCardSelectionLimit([{name:'Комиссар'}]); var commRandom = cardSelectionNeedsDebuff(3,[{name:'Комиссар'}]); var commBelow = cardSelectionNeedsDebuff(2,[{name:'Комиссар'}]); var tradeRandom = cardSelectionNeedsDebuff(4,[{name:'Торговый дух'}]);`);
ok(s.evalCtx('commLimit === 3 && commRandom === true && commBelow === false && tradeRandom === false'), 'Комиссар: 3 выбора + случайная карта; Торговый дух: 4 выбора без случайной (v13.135)');
console.log(`Итог: PASS ${pass} · FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
