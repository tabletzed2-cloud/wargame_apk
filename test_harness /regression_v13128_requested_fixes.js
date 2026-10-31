'use strict';
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const mapActions = fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8');
const online = fs.readFileSync(path.join(ROOT, 'js/online_battles.js'), 'utf8');
const operationalUi = fs.readFileSync(path.join(ROOT, 'js/operational_ui.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/operational_ui.css'), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('✓ ' + name); } catch (e) { fail++; console.error('✗ ' + name + ' — ' + e.message); } }
function assert(value, message) { if (!value) throw new Error(message || 'assertion failed'); }

test('операционная карточка юнита — выдвижная, скрываемая, содержит иконку, состав, мораль и боезапас', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'showOpUnitInfoPopup'));
  s.run(sliceFunction(HTML, 'closeOpUnitInfoPopup'));
  s.run(`var drawer=null; document.getElementById=(id)=>id==='opUnitInfoPopup'?drawer:null;
    document.createElement=()=>drawer={hidden:true,setAttribute(){},className:'',innerHTML:''};
    document.body.appendChild=()=>{};
    showOpUnitInfoPopup({name:'Взвод',faction:'BeVe',type:'infantry_platoon',icon:'icon.png',col:2,row:4,ap:3,currentMorale:60,
      squads:[{fighters:[{hp:3},{hp:0}],ammoSmall:9,ammoOrdnance:2,grenades:1}]});
    var wasShown=!drawer.hidden, rendered=drawer.innerHTML; closeOpUnitInfoPopup(); var wasHidden=drawer.hidden;`);
  assert(s.evalCtx('wasShown && wasHidden'), 'drawer opens on selection and has an explicit hide action');
  assert(s.evalCtx("rendered.includes('Взвод') && rendered.includes('1/2') && rendered.includes('60') && rendered.includes('9') && rendered.includes('icon.png')"), 'icon, living/full headcount, morale and ammo are rendered');
  assert(css.includes('.op-unit-drawer[hidden] { display: none !important; }'), 'drawer can be fully hidden');
});
test('размещение даёт спешивание только велосипедным подразделениям BeVe', () => {
  // v13.136 (п.9): гейты переведены на строгую проверку велосипеда (без мотоциклов);
  //  порядок проверок в unitDismountOptionAllowed: сначала unitCanExecuteOrderType.
  assert(HTML.includes("unit.mobility === 'bicycle' && !unit.dismounted"), 'placement gate is bicycle only');
  assert(operationalUi.includes("if (action === 'dismount') return unit.mobility === 'bicycle' && !unit.dismounted;"), 'order action gate matches placement');
  assert(operationalUi.includes("if (action === 'remount') return !!unit.dismounted && (unit.dismountedFromMobility === 'bicycle' || unit.mobility === 'bicycle');"), 'remount gate matches');
});

test('снайперские звенья OIP BeVe получают бинокль; разведанный гекс подсвечивается', () => {
  assert(mapActions.includes("squad.faction === 'BeVe' && /снайперское звено OIP/i.test"), 'BeVe sniper squad has access');
  assert(mapActions.includes('reconRevealedHexes.push({ key: String(key)'), 'selected hex is persisted as recon reveal');
  assert(HTML.includes('appData.map.reconRevealedHexes || []') && HTML.includes("rgba(241,196,15,.20)"), 'revealed hex is visible and highlighted outside normal vision');
  assert(mapActions.includes('tacticalSmokeBlocksSight(observerPos.key, key, appData.map)') && HTML.includes('window.tacticalHasLineOfSight'), 'smoke, forest and height block the binocular line');
});

test('маскировка доступна только в первом раунде до движения/стрельбы на подходящей местности', () => {
  const s = createSandbox(freshAppData());
  for (const fn of ['tacticalRoundNumber','tacticalSquadHasFired','tacticalCanCamouflage','tacticalBreakCamouflage','tacticalCamouflageSelectedSquad','autoDetectOneSquad']) s.run(sliceFunction(HTML, fn));
  s.run(`
    var currentTurn=1, currentSquadIndex=0, actionPoints=[{ap:3}], spent=0;
    function getTacticalBattleRecord(){return {};} function getTacticalRoundProgress(){return {round:1};}
    function getBattleSquadHex(){return {key:'0,0',col:0,row:0};}
    function tacticalActionAllowed(){return true;} function spendAP(i,n){spent=n;actionPoints[i].ap-=n;return true;}
    function log(){} function saveData(){} function updateUI(){} function redrawMap(){}
    appData.squads=[{name:'Пехота',fighters:[{hp:3}],actionsThisTurn:{shots:0}}];
    appData.map={grid:{'0,0':{type:'forest'}}}; var currentSquad=appData.squads[0];
    var canForest=tacticalCanCamouflage(currentSquad); var didMask=tacticalCamouflageSelectedSquad();
    var savedDetected=currentSquad.detected; autoDetectOneSquad(currentSquad,'player');
  `);
  assert(s.evalCtx('canForest && didMask && currentSquad.camouflaged && spent===2'), 'forest camouflage costs one OD and applies');
  assert(s.evalCtx('currentSquad.detected===false'), 'camouflaged squad does not become detected');
  s.run(`currentSquad.camouflaged=false; currentSquad.movedThisTurn=true; var movedCannotMask=tacticalCanCamouflage(currentSquad); currentSquad.movedThisTurn=false; currentSquad.actionsThisTurn.shots=1; var firedCannotMask=tacticalCanCamouflage(currentSquad);`);
  assert(s.evalCtx('!movedCannotMask && !firedCannotMask'), 'movement or any shot in the round prevents concealment');
  s.run(`currentSquad.actionsThisTurn.shots=0; appData.map.grid['0,0'].type='grass'; var openCannotMask=tacticalCanCamouflage(currentSquad);`);
  assert(s.evalCtx('!openCannotMask'), 'open terrain is not eligible');
  assert(mapActions.includes('tacticalCamouflageSelectedSquad'), 'camouflage appears as an action on the tactical map');
  assert(online.includes('camouflaged: !!s.camouflaged') && online.includes('if (cs.camouflaged) s.detected = false'), 'online snapshots preserve concealment');
});

test('тактические отряды наследуют оперативный дух на общей шкале 0–100', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceConst(HTML, 'ARMOR_TACTICAL_MORALE'));
  s.run(`currentSquad=null; morale=0; appData.campaign.opUnits=[{name:'Взвод',operationalMorale:63}];
    function tacticalMarkStartingMoraleCasualties(){};`);
  for (const fn of ['tacticalNormalizeMoraleScale','tacticalMoraleScale','tacticalMoraleCurrent','tacticalMoraleDeltaPercent',
    'tacticalFindOperationalMoraleOwner','tacticalIsSniperOrMortarSquad','isArmoredTacticalSquad','tacticalInitializeSquadMorale']) s.run(sliceFunction(HTML, fn));
  s.run(`var squad={name:'Пехота',opUnitName:'Взвод',fighters:[{hp:3}],operationalMoralePercent:0};
    tacticalInitializeSquadMorale(squad,'battle');`);
  assert(s.evalCtx('squad.currentMorale===63 && squad.tacticalMoraleMax===100 && squad.tacticalMoraleScaleVersion===1'), 'the tactical squad inherits its platoon morale on the normalized scale');
});

test('подкрепление не переносит центр активного боя; бронеавтомобиль не входит на холм/камни', () => {
  assert(!HTML.includes('existingBattle.hexKey = hexKey;'), 'reinforcement cannot shift the battle anchor');
  assert(HTML.includes('Подкрепление присоединено к бою') && HTML.includes('центр столкновения не переносится'), 'anchor preservation is explicit');
  const s = createSandbox(freshAppData()); s.run(sliceFunction(HTML, 'getOpMoveCost'));
  s.run(`function isHexInPlayableArea(){return true;} function getOpHexTypes(c,r){return [r===1?'hill':'rocks'];}
    var armored={name:'Бронеавтомобиль',type:'armored_vehicle_platoon',mobility:'vehicle',col:0,row:0};
    var hillCost=getOpMoveCost(armored,0,0,1,1); var rockCost=getOpMoveCost(armored,0,0,1,0);`);
  assert(s.evalCtx('hillCost===Infinity && rockCost===Infinity'), 'armored-car restriction works even with legacy mobility data');
});

test('обстрел длится минимум 20 минут: 10 минут пристрелки без расхода, каждый полный интервал тратит единицу', () => {
  const s = createSandbox(freshAppData()); s.run(sliceFunction(HTML, 'executeArtilleryStrikeOrder'));
  s.run(`var salvos=[]; var currentTurn=2; appData.campaign.currentTurn=2; appData.campaign.artilleryStrikesUsed=0;
    function orderShouldExecuteNow(){return true;} function executeArtilleryStrikeSalvo(o,ranging){salvos.push(ranging);o.status='completed';}
    function log(){} function saveData(){} function renderActiveOrders(){}
    var order={status:'active',issueTurn:1,artilleryLastStepTurn:1,artilleryDurationMin:30,artilleryUnitsReserved:2,artilleryUnitsFired:0};
    executeArtilleryStrikeOrder(order); var first={status:order.status,elapsed:order.artilleryElapsedMinutes,used:appData.campaign.artilleryStrikesUsed};
    currentTurn=3; appData.campaign.currentTurn=3; executeArtilleryStrikeOrder(order); var second={status:order.status,elapsed:order.artilleryElapsedMinutes,used:appData.campaign.artilleryStrikesUsed};
    currentTurn=4; appData.campaign.currentTurn=4; executeArtilleryStrikeOrder(order); var third={status:order.status,elapsed:order.artilleryElapsedMinutes,used:appData.campaign.artilleryStrikesUsed};`);
  assert(s.evalCtx('first.status===\'active\' && first.elapsed===10 && first.used===0'), 'first interval is ranging, no artillery unit is charged');
  assert(s.evalCtx('second.status===\'active\' && second.elapsed===20 && second.used===1'), 'first full-fire interval charges one unit');
  assert(s.evalCtx('third.status===\'completed\' && third.elapsed===30 && third.used===2'), 'second full-fire interval completes order and charges second unit');
  assert(s.evalCtx('salvos.length===3 && salvos[0]===true && salvos[1]===false'), 'ranging and full-fire salvos are distinguished');
  assert(operationalUi.includes('data-draft-field="duration"') && operationalUi.includes('[20,30,40,50]'), 'duration is configurable in 10-minute steps');
  const durationUi = createSandbox(freshAppData()); durationUi.run(sliceFunction(operationalUi, 'applyDraftField'));
  durationUi.run(`var state={draft:{duration:20}}; applyDraftField('duration','40');`);
  assert(durationUi.evalCtx('state.draft.duration===40'), 'duration selector updates its actual order draft');
  assert(HTML.includes('artilleryUnitsReserved: unitsNeeded') && HTML.includes('getOpHexDistance(observer.col, observer.row, targetCol, targetRow) > 2'), 'units are reserved and spotter range is bounded to two hexes');
  const salvoLogic = sliceFunction(HTML, 'executeArtilleryStrikeSalvo');
  assert(salvoLogic.includes('const shellCount = rangingShot ? 10 : 20') && salvoLogic.includes('rangingShot ? 0.05 : (spotterPresent'), 'calibration and full salvos use separate shell counts and fixed 5% ranging accuracy');
  assert(salvoLogic.includes('0.40 + Math.max(0, targetInfantryCount - 1) * 0.05') && salvoLogic.includes('targetHasTrenches ? 0.15 : 0.25'), 'spotter gives 40% plus 5 points per extra infantry unit; trenches lower uncorrected accuracy');
  assert(salvoLogic.includes('collect(appData.campaign.opUnits, false)') && salvoLogic.includes('collect(appData.campaign.enemyOpUnits, true)'), 'both friendly and enemy occupants can be selected');
  assert(salvoLogic.includes('alive[Math.floor(Math.random() * alive.length)]'), 'each point of operational artillery damage randomly selects a living fighter');
  const legacy = createSandbox(freshAppData()); legacy.run(sliceFunction(HTML, 'executeArtilleryStrikeOrder'));
  legacy.run(`var salvoTypes=[]; var currentTurn=2; appData.campaign.currentTurn=2; appData.campaign.artilleryStrikesUsed=1;
    function orderShouldExecuteNow(){return true;} function executeArtilleryStrikeSalvo(o,ranging){salvoTypes.push(ranging);o.status='completed';}
    function log(){} function saveData(){} function renderActiveOrders(){}
    var oldOrder={status:'active',issueTurn:1}; executeArtilleryStrikeOrder(oldOrder);
    currentTurn=3; appData.campaign.currentTurn=3; executeArtilleryStrikeOrder(oldOrder);`);
  assert(legacy.evalCtx("appData.campaign.artilleryStrikesUsed===1 && oldOrder.status==='completed' && salvoTypes.length===2"), 'pre-v13.128 active orders retain their already charged unit without double billing');
  const actual = createSandbox(freshAppData());
  actual.run(sliceConst(HTML, 'OP_ARTILLERY_ARMOR_DAMAGE_CHANCE'));
  actual.run(sliceConst(HTML, 'OP_ARTILLERY_ARMOR_PENETRATION_MM'));
  actual.run(sliceFunction(HTML, 'applyOperationalArtilleryArmorHit'));
  actual.run(sliceFunction(HTML, 'applyOperationalArtilleryArmorHitsAtHex'));
  actual.run(sliceFunction(HTML, 'executeArtilleryStrikeSalvo')); actual.run(sliceFunction(HTML, 'executeArtilleryStrikeOrder'));
  actual.run(`var currentTurn=2; OP_MAP_COLS=40; OP_MAP_ROWS=40; Math.random=()=>0;
    function isArmoredUnit(){return false;} function processVehicleHit(){return null;} function selectTargetVehicle(){return null;}
    function orderShouldExecuteNow(){return true;} function isHexInPlayableArea(){return true;}
    function getOpHexDistance(a,b,c,d){return Math.max(Math.abs(a-c),Math.abs(b-d));}
    function hasRadio(){return true;} function hasActivePhoneAt(){return false;}
    function isStaticOpUnit(){return false;} function getOperationalCombatFighters(u){return u.squads.flatMap(s=>s.fighters);}
    function isOperationalMoraleUnit(){return false;} function isOpUnitWipedOut(){return false;}
    function rollD12(){return 12;} function log(){} function saveData(){} function redrawOperationalMap(){}
    function renderActiveOrders(){} function renderShellNotices(){}
    appData.campaign={currentTurn:2,currentTime:600,artilleryStrikesUsed:0,opMapGrid:{'1,1':{types:['grass'],markers:[]}},
      opUnits:[{name:'Штаб',col:0,row:0}],enemyOpUnits:[{name:'Цель',col:1,row:1,detected:true,squads:[{name:'отделение',fighters:[{name:'Боец 1',hp:100},{name:'Боец 2',hp:100},{name:'Боец 3',hp:100}]}]}]};
    hardMode={phoneLines:[]}; var order={status:'active',issueTurn:1,targetHex:'1,1',fromUnitId:0,artilleryDurationMin:20,artilleryUnitsReserved:1,artilleryUnitsFired:0,artilleryLastStepTurn:1};
    executeArtilleryStrikeOrder(order); var afterRangingTotal=appData.campaign.enemyOpUnits[0].squads[0].fighters.reduce((n,f)=>n+f.hp,0); var chargedAfterRanging=appData.campaign.artilleryStrikesUsed;
    currentTurn=3; appData.campaign.currentTurn=3; executeArtilleryStrikeOrder(order);
    var afterFullTotal=appData.campaign.enemyOpUnits[0].squads[0].fighters.reduce((n,f)=>n+f.hp,0);`);
  assert(actual.evalCtx('afterRangingTotal===180 && chargedAfterRanging===0'), 'real ranging salvo launches ten 1d12 shells at fixed five-percent chance without charging full-fire ammunition');
  assert(actual.evalCtx("afterFullTotal===0 && appData.campaign.artilleryStrikesUsed===1 && order.status==='completed'"), 'real 20-shell full salvo applies d12 damage, spends one unit and completes the 20-minute mission');
});


test('тактический артналёт: d10 задаёт снос, окопы снижают урон, число отрядов умножает его', () => {
  const s = createSandbox(freshAppData());
  for (const fn of ['tacticalArtilleryScatterHex','tacticalArtilleryHexHasTrenches','tacticalArtilleryHexOccupants','tacticalArtilleryApplyDamage','tacticalArtilleryResolveCall']) s.run(sliceFunction(HTML, fn));
  s.run(`
    TACTICAL_ARTY_HIT_THRESHOLD=7;
    appData.map={grid:{'5,5':{type:'trenches',squadIds:[0],enemySquadIds:[0]},'6,5':{},'6,4':{},'6,6':{},'4,5':{},'5,6':{},'5,4':{}},enemySquads:[]};
    appData.squads=[{name:'Свой взвод',fighters:[{name:'свой',hp:100}]},{name:'Вражеский взвод',fighters:[{name:'враг',hp:100}]}];
    appData.map.grid['5,5'].enemySquadIds=[0]; appData.map.enemySquads=[appData.squads[1]];
    function tacticalIsDotSquad(){return false;}
    function applyDamagePointsToEnemy(squad,points,res){var f=squad.fighters.find(x=>x.hp>0);if(!f)return 0;f.hp-=points;res.damage+=points;if(f.hp<=0)res.killed.push(f.name);return points;}
    function rollD10(){return 7;} function rollD6(){return 5;} function log(){} function markTacticalSuppressed(){} function tacticalChangeMorale(){}
    var seq=[0,.75,0,.75,0,.75],ix=0; Math.random=()=>seq[ix++%seq.length];
    var scatter=[1,2,3,4,5,6].map(n=>tacticalArtilleryScatterHex('5,5',n,appData.map));
    var resolved=tacticalArtilleryResolveCall({targetHex:'5,5',shells:1,isSau:false,batteryName:'82-мм миномёты'},{});
    var ownHp=appData.squads[0].fighters[0].hp, enemyHp=appData.squads[1].fighters[0].hp;
  `);
  assert(s.evalCtx("scatter.join('|')==='6,5|6,4|6,6|4,5|5,6|5,4'"), 'd10=1–6 maps to the six fixed neighbouring cells; 7–10 stays on target');
  assert(s.evalCtx('resolved.hits===1 && resolved.damage===6 && ownHp===97 && enemyHp===97'), '1d6=5 becomes 3 in trenches, doubles for two squads and is randomly split across both sides');
});


test('снайпер наносит 3 урона одному случайному бойцу без переноса остатка', () => {
  const s = createSandbox(freshAppData());
  for (const fn of ['mapActionTacticalSide','mapActionEnemyAlive','applyDamagePointsToEnemy','reportAttackOutcome']) s.run(sliceFunction(mapActions, fn));
  s.run(`
    appData.map={attackTargetEnemyIdx:0,enemySquads:[]};
    var enemy={name:'Цель',fighters:[{name:'Раненый',hp:1},{name:'Целый',hp:3}]};
    appData.map.enemySquads=[enemy]; Math.random=()=>0;
    function mapActionDefById(){return {label:'снайпер'};} function mapActionInfo(){} function log(){}
    var woundedShot=reportAttackOutcome('sniper',{hits:1,damage:3});
    var woundedResult={dead:enemy.fighters[0].hp===0,untouched:enemy.fighters[1].hp===3,damage:woundedShot.damage,kills:woundedShot.killed.length};
    enemy={name:'Цель',fighters:[{name:'Полный',hp:3},{name:'Сосед',hp:3}]}; appData.map.enemySquads=[enemy];
    var lethalShot=reportAttackOutcome('sniper',{hits:1,damage:3});
    var lethalResult={dead:enemy.fighters[0].hp===0,untouched:enemy.fighters[1].hp===3,damage:lethalShot.damage,kills:lethalShot.killed.length};
  `);
  assert(s.evalCtx('woundedResult.dead && woundedResult.untouched && woundedResult.damage===1 && woundedResult.kills===1'), 'a wounded selected fighter dies; unused damage is not transferred');
  assert(s.evalCtx('lethalResult.dead && lethalResult.untouched && lethalResult.damage===3 && lethalResult.kills===1'), 'a full-health selected fighter takes all three damage; another fighter is untouched');
  assert(HTML.includes('const damage = 3; // Один снайперский выстрел всегда даёт 3 урона одному выбранному бойцу.'), 'sniper attack always provides exactly three damage');
});

test('телефонная карта занимает всю ширину, прокрутка ограничена размером карты, миникарта не перекрывает низ', () => {
  assert(css.includes('.op-map-workspace { width:100vw !important; margin-left:calc(50% - 50vw) !important; margin-right:calc(50% - 50vw) !important; }'), 'mobile map has no side gutters');
  assert(operationalUi.includes('Math.max(0, Math.min(viewport.scrollLeft') && operationalUi.includes('scrollWidth - viewport.clientWidth'), 'pan clamps to content bounds');
  assert(css.includes('#campaignMiniMapPanel { top:max(8px') && css.includes('bottom:auto !important'), 'mobile minimap is at the top, away from bottom actions');
});

test('приказы роты создают приказы взводов до собственного действия штаба', () => {
  assert(HTML.includes("((b && b.type === 'company_order') ? 1 : 0) - ((a && a.type === 'company_order') ? 1 : 0)"), 'company command is dispatched ahead of HQ orders');
  assert(HTML.includes('executeOrder(subOrder);') && HTML.includes('Мгновенная доставка (рация/телефон): взвод выполняет приказ'), 'immediate suborders begin in the company relay pass');
  assert(HTML.includes('order.waypoints = planned.waypoints;') && HTML.includes('unitIdx > 0'), 'each platoon keeps its own remaining route');
});



test('приказы взводам штаба роты получают независимые копии одного маршрута', () => {
  const s = createSandbox(freshAppData()); s.run(sliceFunction(HTML, 'executeCompanyOrder'));
  s.run(`var childCalls=[]; var company={name:'Штаб роты'}; var p1={name:'Взвод 1',col:0,row:0}; var p2={name:'Взвод 2',col:1,row:0};
    appData.campaign.opUnits=[company,p1,p2]; hardMode={orders:[],pendingOrders:[],messengers:{companies:{0:{available:1}}}};
    function checkCommunication(){return 'radio';} function isVehicleMobilityUnit(){return false;}
    function executeOrder(o){childCalls.push(o);} function log(){} function getOpHexDistance(){return 1;}
    var parent={id:99,status:'active',subUnitIds:[1,2],orderType:'move',waypoints:[{col:4,row:4},{col:5,row:5}],targetHex:'5,5'};
    executeCompanyOrder(company,parent); childCalls[0].waypoints.shift();
  `);
  assert(s.evalCtx("childCalls.length===2 && childCalls[0].type==='move' && childCalls[1].type==='move'"), 'both subordinate platoons receive and immediately start the order');
  assert(s.evalCtx("childCalls[0].waypoints!==childCalls[1].waypoints && childCalls[1].waypoints.length===2 && parent.status==='completed'"), 'a platoon entering combat cannot consume or reset its sibling route');
  assert(HTML.includes("((b && b.type === 'company_order') ? 1 : 0) - ((a && a.type === 'company_order') ? 1 : 0)"), 'company relay pass precedes the HQ order');
});

test('осветительная ракета действует ровно две последовательные фазы независимо от стороны', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'createTacticalFlareEvent')); s.run(sliceFunction(HTML, 'tacticalIlluminationActive'));
  s.run(`var currentTurn=10; appData.map={};
    function getTacticalBattleRecord(){return {};}
    var first=createTacticalFlareEvent('player'); var firstExpiry=appData.map.illuminationFlare.expiresTurn;
    var playerPhaseActive=tacticalIlluminationActive(10); var enemyPhaseActive=tacticalIlluminationActive(11); var expiredAfterTwoPhases=!tacticalIlluminationActive(12);
    currentTurn=21; var second=createTacticalFlareEvent('enemy'); var secondExpiry=appData.map.illuminationFlare.expiresTurn;
    var enemyPhaseActiveFirst=tacticalIlluminationActive(21); var playerPhaseActiveNext=tacticalIlluminationActive(22); var expiredAfterNextPhase=!tacticalIlluminationActive(23);`);
  assert(s.evalCtx('firstExpiry===11 && playerPhaseActive && enemyPhaseActive && expiredAfterTwoPhases'), 'player flare spans its own phase and the opposing phase only');
  assert(s.evalCtx('secondExpiry===22 && enemyPhaseActiveFirst && playerPhaseActiveNext && expiredAfterNextPhase'), 'enemy flare spans its own phase and the player phase only');
  assert(HTML.includes('две фазы'), 'flare log states the two-phase duration');
});

console.log(`Итог v13.128: PASS ${pass} · FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
