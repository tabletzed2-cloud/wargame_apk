'use strict';
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData, sliceFunction } = require('./sandbox');
const { HTML, ROOT, sliceConst } = require('./extract');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (error) { fail++; console.error(`✗ ${name} — ${error.message}`); }
}
function assert(value, message) { if (!value) throw new Error(message || 'assertion failed'); }
function equal(actual, expected, message) {
  assert(actual === expected, `${message}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// #10: the emergency action sets an explicit draw result and bypasses the normal
// unresolved-enemy/withdrawal gates without awarding either side a victory.
test('emergency button forces a draw while preserving the battle record for normal loss sync', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    var finishCalls=0, confirmAnswer=true;
    function confirm(){return confirmAnswer;}
    function log(){}
    function finishBattle(){finishCalls++;}
    appData.currentBattleId='battle-draw';
    appData.campaign.activeBattles=[{id:'battle-draw'}];
  `);
  s.run(sliceFunction(HTML, 'forceFinishBattleAsDraw'));
  s.run('var drawFinished=forceFinishBattleAsDraw();');
  equal(s.evalCtx('drawFinished'), true, 'the emergency action succeeds');
  equal(s.evalCtx('finishCalls'), 1, 'normal battle cleanup still runs');
  equal(s.evalCtx("appData.campaign.activeBattles[0].result"), 'draw', 'the stored battle result is a draw');
  equal(s.evalCtx("appData.campaign.activeBattles[0].drawReason"), 'manual_force_finish', 'the draw is auditable');
  const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const finish = sliceFunction(HTML, 'finishBattle');
  assert(finish.includes('!forcedDraw && unresolved.length > 0'), 'unresolved enemies do not block a forced draw');
  assert(finish.includes('!forcedDraw && !battle.onlineMirror) checkAndGrantTacticalAwards'), 'a draw grants no tactical victory awards');
  assert(source.includes('id="btnForceFinishBattleAsDraw"') && source.includes('onclick="forceFinishBattleAsDraw()"'), 'the temporary action is available in tactical battle UI');
});

// #11: Veloblitz grants an eligible mounted attacker a freely chosen flank,
// but all cells in the special strip must have tactical elevation level zero.
test('Veloblitz chooses any flank and restricts deployment to level zero', () => {
  const s = createSandbox(freshAppData());
  ['PLACEMENT_DIRS', 'PLACEMENT_STRIP_DEPTH'].forEach(name => s.run(sliceConst(fs.readFileSync(path.join(ROOT, 'js/placement.js'), 'utf8'), name)));
  const placement = fs.readFileSync(path.join(ROOT, 'js/placement.js'), 'utf8');
  [
    'placementZoneKeys', 'placementBattleGrid', 'placementMapSize',
    'placementBicycleBlitzHasCard', 'placementBicycleBlitzUnitNames', 'placementBicycleBlitzEligible',
    'placementBicycleBlitzZoneKeys', 'placementRegisterBicycleBlitz', 'placementSideAllowed'
  ].forEach(name => s.run(sliceFunction(placement, name)));
  s.run(`
    function isBicycleTacticalSquad(squad){return !!(squad && squad.mobilityType==='bicycle');}
    function getCurrentBattleRecord(){return battle;}
    var battle={id:'bicycle-battle',hexKey:'2,2',playerSquads:[],tacticalMap:{mapSize:6,grid:{}},placement:{
      phase:'placing',attackerSide:'player',entryDir:'W',bicycleBlitzUnitNames:['Bike'],bicycleBlitzDirections:{Bike:'E'}
    }};
    appData.currentBattleId=battle.id;
    appData.map={mapSize:6,grid:{}};
    for(let row=0;row<6;row++) for(let col=0;col<6;col++) {
      const key=col+','+row; appData.map.grid[key]={level:0}; battle.tacticalMap.grid[key]={level:0};
    }
    appData.map.grid['5,0'].level=1; battle.tacticalMap.grid['5,0'].level=1;
    var bike={name:'Велосипедное отделение №1',opUnitName:'Bike',mobilityType:'bicycle',dismounted:false,
      effects:{bicycleBlitz:{active:true}},appliedCards:['Велоблиц'],fighters:[{hp:3}]};
    battle.playerSquads=[bike];
    var eastLevelZero=placementBicycleBlitzZoneKeys(battle,'Bike','E').find(key=>key!=='5,0');
    var eastHillRejected=placementSideAllowed(battle,'player','5,0',bike);
    var eastFlatAllowed=placementSideAllowed(battle,'player',eastLevelZero,bike);
    var westRejected=placementSideAllowed(battle,'player','0,1',bike);
    var everyFlankFlat=PLACEMENT_DIRS.every(dir=>placementBicycleBlitzZoneKeys(battle,'Bike',dir).length>0 &&
      placementBicycleBlitzZoneKeys(battle,'Bike',dir).every(key=>(appData.map.grid[key].level||0)===0));
    battle.placement.bicycleBlitzDirections.Bike='NE';
    var northEast=placementBicycleBlitzZoneKeys(battle,'Bike','NE')[0];
    var northEastAllowed=placementSideAllowed(battle,'player',northEast,bike);
  `);
  equal(s.evalCtx('eastHillRejected'), false, 'a level-one cell is forbidden');
  equal(s.evalCtx('eastFlatAllowed'), true, 'a level-zero cell on the selected flank is allowed');
  equal(s.evalCtx('westRejected'), false, 'the same squad cannot deploy on a different flank');
  equal(s.evalCtx('everyFlankFlat'), true, 'all six flank choices exclude elevated cells');
  equal(s.evalCtx('northEastAllowed'), true, 'the player can switch to another flank');
});

test('Veloblitz card chosen after initial deployment reopens only the opening deployment phase', () => {
  const s = createSandbox(freshAppData());
  const placement = fs.readFileSync(path.join(ROOT, 'js/placement.js'), 'utf8');
  ['PLACEMENT_DIRS', 'PLACEMENT_STRIP_DEPTH'].forEach(name => s.run(sliceConst(placement, name)));
  ['placementZoneKeys', 'placementBattleGrid', 'placementMapSize', 'placementBicycleBlitzHasCard',
    'placementBicycleBlitzUnitNames', 'placementBicycleBlitzEligible', 'placementBicycleBlitzZoneKeys',
    'placementRegisterBicycleBlitz', 'placementRecordBicycleBlitzCardSelection', 'placementMaybeReopenForBicycleBlitz']
    .forEach(name => s.run(sliceFunction(placement, name)));
  s.run(`
    function isBicycleTacticalSquad(squad){return !!(squad && squad.mobilityType==='bicycle');}
    function saveData(){}
    var openCalls=0; function openPlacementPhase(){openCalls++;}
    var bike={name:'Велосипедное отделение',opUnitName:'Bike',mobilityType:'bicycle',dismounted:false,
      effects:{bicycleBlitz:{active:true}},appliedCards:['Велоблиц'],fighters:[{hp:3}]};
    var grid={}; for(let row=0;row<6;row++) for(let col=0;col<6;col++) grid[col+','+row]={level:0};
    var battle={id:'battle',currentTurn:1,tacticalPhasesCompleted:0,playerSquads:[bike],
      tacticalMap:{mapSize:6,grid:grid},placement:{phase:'done',playerReady:true,
      enemyReady:true,bicycleBlitzOpportunityUnitName:'Bike'}};
    var recorded=placementRecordBicycleBlitzCardSelection(battle,'Bike',{cards:[{name:'Велоблиц'}]});
    var reopened=placementMaybeReopenForBicycleBlitz(battle);
  `);
  equal(s.evalCtx('recorded'), true, 'the selected card is tied to the entering platoon');
  equal(s.evalCtx('reopened'), true, 'the special placement window opens before the first tactical phase');
  equal(s.evalCtx('openCalls'), 1, 'the placement UI is reopened');
  equal(s.evalCtx("battle.placement.phase"), 'placing', 'placement, not combat, is active');
  equal(s.evalCtx('battle.placement.playerReady'), false, 'the player must confirm the special placement');
});

// #12: an eligible Anarchist squad gets an actual small-arms attack instead of
// the former resource-only placeholder; the canonical morale bonus migrates too.
test('Anarchists perform a random visible infantry shot and old saves get morale +2', () => {
  const s = createSandbox(freshAppData());
  ['resolveAnarchistWildFire', 'resolveAnarchistsAtTurnStart'].forEach(name => s.run(sliceFunction(HTML, name)));
  s.run(`
    var currentSquadIndex=0, currentSquad=null, actionPoints=[{ap:6}], shots=[];
    var rolls=[0.1,0.9,0.2]; Math.random=()=>rolls.length ? rolls.shift() : 0.2;
    var documentTarget={value:'1'};
    document.getElementById=function(){return documentTarget;};
    var MAP_ACTION_DEFS=[{id:'smallArms'}];
    function mapActionEvalTarget(){return {ok:true,dist:2,cover:{mod:0}};}
    function getBattleSquadHex(grid,index,isEnemy){return isEnemy?{key:'2,0',col:2,row:0}:{key:'0,0',col:0,row:0};}
    function selectSquad(idx){currentSquadIndex=idx;currentSquad=appData.squads[idx];}
    function log(){}
    function attackSmallArms(){shots.push({idx:currentSquadIndex,target:appData.map.attackTargetEnemyIdx});}
    appData.map={grid:{'0,0':{squadIds:[0]},'2,0':{enemySquadIds:[0]}},enemySquads:[
      {name:'Видимая пехота',detected:true,fighters:[{hp:3}],armor:null}
    ]};
    appData.squads=[{name:'Анархисты',effects:{anarchists:true},faction:'A.I.R.F.',ammoSmall:4,
      fighters:[{hp:3}],actionsThisTurn:{}}];
    resolveAnarchistsAtTurnStart();
  `);
  equal(s.evalCtx('shots.length'), 1, 'хаотическая фаза действительно вызывает стрельбу');
  equal(s.evalCtx('shots[0].idx'), 0, 'стреляет именно отряд с дебаффом');
  equal(s.evalCtx('shots[0].target'), 0, 'выбирается доступная видимая пехотная цель');
  const cards = fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // ⚡ v13.144: шкала духа карточек переведена на 0–100 (+1 → +10), поэтому
  //    «Анархисты» обещают +20, а старые сейвы подтягиваются к этому значению.
  assert(/name\": \"Анархисты\"[^\\n]*moraleMod\": 20/.test(cards), 'каталог обещает моральный бонус +20');
  assert(html.includes("if (sc.name === 'Анархисты') { sc.desc = dc.desc; sc.effect = dc.effect; sc.moraleMod = Number(dc.moraleMod) || 20; }"), 'старое сохранённое значение moraleMod=0 обновляется до +20');
});

// The updated canonical card text is copied over old saved card definitions.
test('Veloblitz description is updated in both catalogs and old saved copies synchronize', () => {
  const cards = fs.readFileSync(path.join(ROOT, 'js/cards.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert((cards.match(/name": "Велоблиц"/g) || []).length >= 2, 'both shared catalog copies exist');
  assert(cards.includes('только на клетках уровня высоты 0'), 'the card explains the level-zero restriction');
  assert(cards.includes('выбрать любой фланг'), 'the card explains free flank choice');
  assert(html.includes("if (sc.name === 'Велоблиц') { sc.desc = dc.desc; sc.effect = dc.effect;"), 'old saved card descriptions are synchronized');
});

console.log(`Итог v13.130: PASS ${pass} · FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
