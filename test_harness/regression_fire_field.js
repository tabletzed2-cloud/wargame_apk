// Регрессия карточного «Огненного поля»: приказ, приватная разметка,
// срабатывание/оттеснение, онлайн-обмен только после поджога.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData, setRandom } = require('./sandbox');
const { HTML, ROOT, sliceFunction, sliceConst } = require('./extract');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (error) { fail++; console.log(`✗ ${name} — ${error.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message || 'утверждение не выполнено'); }
function equal(actual, expected, message) {
  assert(actual === expected, `${message || 'равенство'}: получили ${JSON.stringify(actual)}, ждали ${JSON.stringify(expected)}`);
}
function loadHtml(s, names) { names.forEach(name => s.run(sliceFunction(HTML, name))); }
function loadModuleFunctions(s, filename, names) {
  const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  names.forEach(name => s.run(sliceFunction(source, name)));
}

// Карточка открывает отдельный оперативный приказ; без карты/после подготовки его нет.
test('«Разлить нефть» доступен только владельцу «Огненного поля» и блокируется после выдачи', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['campaignUnitHasCard']);
  loadModuleFunctions(s, 'js/operational_ui.js', ['canIssueSpecial']);
  s.run(`
    function units() { return appData.campaign.opUnits || []; }
    function getAllOrdersList() { return appData.testOrders || []; }
    function campaignUnitHasCard(unit, name) {
      return !!(unit && unit.cardSelection && unit.cardSelection.cards.some(c => (typeof c === 'string' ? c : c.name) === name));
    }
    var unit = { name:'Пехотный взвод', col:4, row:5, cardSelection:{cards:[{name:'Огненное поле'}]} };
    appData.campaign.opUnits = [unit];
    var canIssueBefore = canIssueSpecial(unit, 'pour_oil');
    unit.fireFieldOrderState = 'draft';
    var canIssueAfter = canIssueSpecial(unit, 'pour_oil');
    delete unit.fireFieldOrderState;
    unit.cardSelection.cards = [];
    var canIssueWithoutCard = canIssueSpecial(unit, 'pour_oil');
  `);
  equal(s.evalCtx('canIssueBefore'), true, 'взвод с картой получает приказ');
  equal(s.evalCtx('canIssueAfter'), false, 'после выполнения приказ нельзя выдать повторно');
  equal(s.evalCtx('canIssueWithoutCard'), false, 'без назначенной карты приказ недоступен');
});

test('выполнение приказа создаёт локальный черновик разметки из трёх клеток', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['campaignUnitHasCard', 'executePourOilOrder']);
  s.run(`
    var owner = { name:'Взвод с огненным полем', col:4, row:5,
      cardSelection:{cards:[{name:'Огненное поле'}]} };
    appData.campaign.opUnits = [owner];
    var order = { type:'pour_oil', status:'active' };
    executePourOilOrder(owner, order);
    var savedFireField = appData.campaign.hexOverlays['4,5'].fireField;
  `);
  equal(s.evalCtx('order.status'), 'completed', 'оперативный приказ отмечен выполненным');
  equal(s.evalCtx('owner.fireFieldOrderState'), 'draft', 'взвод ожидает выбора клеток');
  equal(s.evalCtx('owner.fireFieldOpHex'), '4,5', 'запомнен гекс будущего боя');
  equal(s.evalCtx('savedFireField.state'), 'draft', 'разметка пока не активна');
  equal(s.evalCtx('savedFireField.cells.length'), 0, 'пока не выбраны клетки');
  assert(s.elements.opHexEditsPanel.innerHTML.includes('Разметить 3 клетки'), 'панель даёт открыть редактор поля');
});

test('редактор принимает любые три клетки, не требует смежности и не позволяет выбрать четвёртую', () => {
  const s = createSandbox(freshAppData());
  s.run(`
    TACTICAL_MAP_SIZE = 5;
    var owner = { name:'Взвод', fireFieldOrderState:'draft' };
    appData.campaign.opUnits = [owner];
    appData.campaign.hexOverlays = { '4,5': { fireField:{ ownerUnitName:'Взвод', cells:[], state:'draft' } } };
    appData.map = { grid:{}, hexKey:'4,5', mode:'hexEdit' };
    for (var r=0; r<5; r++) for (var c=0; c<5; c++) appData.map.grid[c+','+r] = {type:'grass',markers:[]};
    hexEditorState = { kind:'fireField', hexKey:'4,5', undo:[], placed:0, rule:{hint:'выберите три'} };
    fireFieldEditClick(hexEditorState, '0,0');
    fireFieldEditClick(hexEditorState, '4,0');
    fireFieldEditClick(hexEditorState, '1,4');
    var cellsAfterThree = appData.campaign.hexOverlays['4,5'].fireField.cells.slice();
    var stateAfterThree = appData.campaign.hexOverlays['4,5'].fireField.state;
    fireFieldEditClick(hexEditorState, '3,3');
    var cellsAfterFour = appData.campaign.hexOverlays['4,5'].fireField.cells.slice();
  `);
  equal(s.evalCtx('cellsAfterThree.length'), 3, 'выбраны ровно три клетки');
  equal(s.evalCtx('stateAfterThree'), 'armed', 'поле подготовлено после третьего выбора');
  assert(s.evalCtx(`cellsAfterThree.includes('0,0') && cellsAfterThree.includes('4,0') && cellsAfterThree.includes('1,4')`),
    'клетки могут находиться далеко друг от друга');
  equal(s.evalCtx('cellsAfterFour.length'), 3, 'четвёртая клетка не добавляется без замены выбранной');
  equal(s.evalCtx("appData.map.grid['0,0'].markers.includes('fireField')"), true, 'неактивная метка отображается на карте владельца');
});

test('поджог наносит d6 урона, зажигает все клетки и выталкивает врага в ближайший безопасный гекс', () => {
  const s = createSandbox(freshAppData());
  const helperNames = [
    'tacticalFireFieldCurrentTurn', 'tacticalEnsureFireFields', 'tacticalActiveFireFields',
    'tacticalFireFieldAt', 'tacticalSyncFireFieldMarkers', 'tacticalFireFieldSnapshot',
    'tacticalMergeFireFields', 'tacticalFireFieldPosition', 'tacticalFireFieldAlive',
    'tacticalFireFieldOccupied', 'tacticalFireFieldMoveSquad', 'tacticalFireFieldPushTarget',
    'tacticalApplyFireFieldDamage', 'tacticalMaybeTriggerFireField', 'tacticalExpireFireFields',
    'tacticalApplyOnlineFireFieldEvents'
  ];
  loadHtml(s, helperNames);
  s.run(sliceConst(HTML, 'TACTICAL_FIRE_FIELD_DURATION_PHASES'));
  s.run(`
    TACTICAL_MAP_SIZE = 5;
    var currentTurn = 5;
    function getHexNeighbors(key) {
      var p=String(key).split(',').map(Number), c=p[0], r=p[1];
      var off=(r%2===0)?[[1,0],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1]]:[[1,0],[1,1],[0,1],[-1,0],[0,-1],[1,-1]];
      return off.map(x=>(c+x[0])+','+(r+x[1])).filter(k=>{var q=k.split(',').map(Number);return q[0]>=0&&q[0]<5&&q[1]>=0&&q[1]<5;});
    }
    function getBattleSquadHex(grid,index,isEnemy) {
      var prop=isEnemy?'enemySquadIds':'squadIds';
      var key=Object.keys(grid).find(k=>grid[k] && (grid[k][prop]||[]).includes(index));
      if (!key) return null;
      var p=key.split(',').map(Number); return {key,col:p[0],row:p[1]};
    }
    function getMovementCost() { return 2; }
    function getMaxAP() { return 6; }
    function rollD6() { return 2; }
    function applyDamagePointsToEnemy(target, points, result) {
      for (var i=0; i<points; i++) {
        var alive=target.fighters.filter(f=>f.hp>0); if (!alive.length) break;
        alive[0].hp--; result.damage++;
        if (alive[0].hp<=0) result.killed.push(alive[0].name);
      }
      if (target.fighters.every(f=>f.hp<=0)) target.isDestroyed=true;
    }
    function getOpUnitByName(name) { return appData.campaign.opUnits.find(u=>u.name===name); }
    function saveHexOverlays() {}
    function saveCurrentBattleState() {}
    var owner={name:'Взвод-владелец',fireFieldOrderState:'armed'};
    var target={name:'Вражеский взвод',fighters:[{name:'Боец',hp:5,maxHp:5}],currentMorale:5};
    appData.campaign.opUnits=[owner];
    appData.campaign.hexOverlays={'4,5':{fireField:{ownerUnitName:owner.name,cells:['1,1','4,4','0,4'],state:'armed'}}};
    var grid={};
    for(var r=0;r<5;r++) for(var c=0;c<5;c++) grid[c+','+r]={type:'grass',markers:[],squadIds:[],enemySquadIds:[]};
    grid['0,0'].squadIds=[0]; grid['1,1'].enemySquadIds=[0];
    var ownerSquad={name:'Свои',fighters:[{hp:5}]};
    appData.squads=[ownerSquad];
    appData.map={hexKey:'4,5',grid:grid,enemySquads:[target],currentTurn:5};
    var triggered=tacticalMaybeTriggerFireField(target,'enemy','2,1','1,1',appData.map);
    var pushedPosition=getBattleSquadHex(appData.map.grid,0,true).key;
    var activeSnapshot=tacticalFireFieldSnapshot(appData.map,5);
    var markers=appData.map.fireFields[0].hexes.map(k=>appData.map.grid[k].markers.includes('fireFieldBurning'));
    var aliveAtTurn6=tacticalFireFieldAt('1,1',appData.map,6);
    tacticalExpireFireFields(6);
    var remainsAt6=appData.map.fireFields.length;
    tacticalExpireFireFields(7);
    var remainsAt7=appData.map.fireFields.length;
    var aliveAtTurn7=tacticalFireFieldAt('1,1',appData.map,7);
    var noSafeMap={grid:{'0,0':{markers:[],squadIds:[],enemySquadIds:[]},'1,0':{markers:[],squadIds:[],enemySquadIds:[]}},
      enemySquads:[],fireFields:[{id:'blocked-oil',state:'burning',hexes:['0,0','1,0']}]};
    var noSafePush=tacticalFireFieldPushTarget({name:'Зажатый',fighters:[{hp:3}]},'enemy','0,0',noSafeMap,5);
  `);
  assert(s.evalCtx('!!triggered.field'), 'вход во вражескую неактивную метку запускает поджог');
  equal(s.evalCtx('appData.campaign.hexOverlays["4,5"].fireField.state'), 'used', 'разметка становится одноразовой после поджога');
  equal(s.evalCtx('target.fighters[0].hp'), 3, 'урон d6 применяется по 1 HP за единицу выпавшего значения');
  assert(s.evalCtx("pushedPosition !== '1,1'"), 'враг оттеснён из огня');
  equal(s.evalCtx('activeSnapshot.length'), 1, 'в онлайн-снимке появляется активное поле');
  assert(s.evalCtx('markers.every(Boolean)'), 'после срабатывания горят все три выбранные клетки');
  equal(s.evalCtx('aliveAtTurn6'), true, 'поле активно в следующий тактический ход');
  equal(s.evalCtx('remainsAt6'), 1, 'до конца следующего хода поле ещё существует');
  equal(s.evalCtx('remainsAt7'), 0, 'после двух ходов поле удаляется');
  equal(s.evalCtx('aliveAtTurn7'), false, 'после срока клетки снова проходимы');
  equal(s.evalCtx('noSafePush.key'), '0,0', 'если безопасного гекса нет, отряд остаётся в поле');
  equal(s.evalCtx('noSafePush.maraudingTriggered'), false, 'нет безопасного перемещения — нет вторичного «Мародёрства»');
});

test('если выталкивание огнём запускает «Мародёрство», оставшийся маршрут останавливается', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, [
    'tacticalFireFieldCurrentTurn', 'tacticalEnsureFireFields', 'tacticalActiveFireFields', 'tacticalFireFieldAt',
    'tacticalSyncFireFieldMarkers', 'tacticalFireFieldPosition', 'tacticalFireFieldAlive', 'tacticalFireFieldOccupied',
    'tacticalFireFieldMoveSquad', 'tacticalFireFieldPushTarget', 'tacticalApplyFireFieldDamage', 'tacticalMaybeTriggerFireField',
    'tacticalSquadHasCard', 'tacticalPlatoonHasCommissar', 'tacticalBattleAttackerSide', 'tacticalMaraudingBlocksAction',
    'tacticalCheckMaraudingOnEntry', 'tacticalMoveAlongPath'
  ]);
  s.run(sliceConst(HTML, 'TACTICAL_FIRE_FIELD_DURATION_PHASES'));
  s.run(`
    TACTICAL_MAP_SIZE=5;
    var currentTurn=5, __tacticalMovementToken=0, __tacticalMovement=null;
    var actionPoints=[{ap:6,maxAp:6}];
    function getAP(){return actionPoints[0].ap;} function getMaxAP(){return 6;}
    function spendAP(index,cost){if(actionPoints[index].ap<cost)return false;actionPoints[index].ap-=cost;return true;}
    function getMovementCost(){return 1;} function tacticalDogSledEligible(){return false;}
    function tacticalAutoEngageMelee(){return null;} function recalcReachable(){} function recordDaggerApproachIfEligible(){}
    function getHexNeighbors(key){
      var p=String(key).split(',').map(Number),c=p[0],r=p[1];
      var off=(r%2===0)?[[1,0],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1]]:[[1,0],[1,1],[0,1],[-1,0],[0,-1],[1,-1]];
      return off.map(x=>(c+x[0])+','+(r+x[1])).filter(k=>{var q=k.split(',').map(Number);return q[0]>=0&&q[0]<5&&q[1]>=0&&q[1]<5;});
    }
    function getBattleSquadHex(grid,index,isEnemy){
      var prop=isEnemy?'enemySquadIds':'squadIds',key=Object.keys(grid).find(k=>grid[k]&&(grid[k][prop]||[]).includes(index));
      if(!key)return null;var p=key.split(',').map(Number);return{key,col:p[0],row:p[1]};
    }
    function tacticalMarkTacticalHexOccupied(key,side,map){
      var c=map.grid[key];c.tacticalOccupantsSeen=c.tacticalOccupantsSeen||{};c.tacticalOccupantsSeen[side]=true;return true;
    }
    function rollD6(){return 1;}
    var grid={};
    for(var r=0;r<5;r++)for(var c=0;c<5;c++)grid[c+','+r]={type:'grass',markers:[],squadIds:[],enemySquadIds:[],tacticalOccupantsSeen:{enemy:true}};
    var marauder={name:'AIRF разведчики',faction:'A.I.R.F.',opUnitName:'Взвод AIRF',appliedCards:['Мародёрство'],hexPos:[0,1],
      fighters:[{name:'Боец',hp:5,maxHp:5}],currentMorale:5,baseMorale:5};
    appData.squads=[marauder];appData.map={grid,enemySquads:[],hexKey:'4,5',attackerSide:'player',fireFields:[
      {id:'enemy-oil',ownerSide:'enemy',state:'armed',hexes:['1,1','4,4','3,4']}
    ]};
    grid['0,1'].squadIds=[0];
    var started=tacticalMoveAlongPath(0,['1,1','2,1'],'2,1');
    var finalHex=getBattleSquadHex(grid,0,false).key;
    var routeStillRunning=__tacticalMovement!==null;
    var spent=6-actionPoints[0].ap;
    var inactiveThrough=marauder.maraudingInactivityThroughTurn;
  `);
  equal(s.evalCtx('started'), true, 'маршрут запущен');
  equal(s.evalCtx('finalHex'), '0,1', 'принудительный толчок переместил отряд в безопасный гекс');
  equal(s.evalCtx('spent'), 1, 'оплачивается только один пройденный гекс до срабатывания');
  equal(s.evalCtx('inactiveThrough'), 7, '«Мародёрство» сработало именно на гексе принудительного перемещения');
  equal(s.evalCtx('routeStillRunning'), false, 'оставшийся шаг маршрута остановлен');
});

test('онлайн-снимок/оверлей не раскрывает неактивную разметку', () => {
  const s = createSandbox(freshAppData());
  loadHtml(s, ['onlineUnitSnapshot', 'onlinePushHexOverlays', 'tacticalFireFieldCurrentTurn', 'tacticalEnsureFireFields', 'tacticalActiveFireFields', 'tacticalFireFieldSnapshot']);
  s.run(`
    appData.campaign.online=true;
    appData.campaign.hexOverlays={'4,5':{hexEdits:{},hexVariants:{},hexRotations:{},fireField:{ownerUnitName:'Тайный взвод',cells:['0,0','5,5','9,9'],state:'armed'}}};
    var sent=null;
    var ONLINE={role:'p1',match:{status:'playing'},docRef:{update(x){sent=x;return {catch(){}};}}};
    onlinePushHexOverlays();
    var unitSnapshot=onlineUnitSnapshot({name:'Тайный взвод',fireFieldOpHex:'4,5',fireFieldOrderState:'draft'});
    var localMap={hexKey:'4,5',fireFields:[{id:'hidden',ownerSide:'player',state:'armed',hexes:['0,0','5,5','9,9']}]};
    var hiddenSnapshot=tacticalFireFieldSnapshot(localMap,1);
    localMap.fireFields[0].state='burning'; localMap.fireFields[0].createdTurn=1; localMap.fireFields[0].expiresAfterTurn=3;
    var revealedSnapshot=tacticalFireFieldSnapshot(localMap,1);
  `);
  assert(!JSON.stringify(s.evalCtx('sent')).includes('Тайный взвод') && !JSON.stringify(s.evalCtx('sent')).includes('fireField'),
    'пуш оверлеев не отправляет состояние поля');
  assert(!JSON.stringify(s.evalCtx('unitSnapshot')).includes('fireField'), 'снимок оперативного юнита убирает скрытые свойства');
  equal(s.evalCtx('hiddenSnapshot.length'), 0, 'неактивная разметка не попадает в тактический онлайн-снимок');
  equal(s.evalCtx('revealedSnapshot.length'), 1, 'после срабатывания поле передаётся сопернику');
});

console.log(`\nРезультат: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
