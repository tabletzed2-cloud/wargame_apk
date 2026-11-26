'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {HTML,ROOT,sliceFunction}=require('./extract');
const source=f=>fs.readFileSync(ROOT+'/'+f,'utf8');
const placement=source('js/placement.js'),recon=source('js/recon.js'),editor=source('js/hexmaps.js'),ui=source('js/operational_ui.js');
const ctx=vm.createContext({console,appData:{campaign:{currentTurn:1,opUnits:[],enemyOpUnits:[]},map:{grid:{}},squads:[]},hardMode:{enabled:true,phoneLines:[]},
  log:()=>{},saveData:()=>{},redrawOperationalMap:()=>{},renderActiveOrders:()=>{},redrawMap:()=>{},
  observeInRange:()=>{ctx.observations++},observations:0,
  getOpHexDistance:(c,r,x,y)=>Math.max(Math.abs(c-x),Math.abs(r-y)),rollD10:()=>7,
  hasActivePhoneAt:()=>true,buildPhoneSignalRouteTo:(a,b)=>Math.abs(a.col-b.col)>7?{ok:false}:{ok:true,route:[a,b]},
  document:{getElementById:()=>({clientWidth:400,style:{}})},isMobileViewport:()=>true,opMapFitZoom:()=>0.4,
  opDirectionBetween:(c,r,x,y)=>x<c?'W':'E',PLACEMENT_DIRS:['W','E','NE','NW','SE','SW'],tacticalMeetingEntry:()=>null,
  setMapMode:()=>{},renderPlacementPanel:()=>{},refreshSquadToPlaceDropdown:()=>{}});
const run=s=>vm.runInContext(s,ctx),load=(s,names)=>names.forEach(n=>run(sliceFunction(s,n)));
run(source('js/playtest_rules.js'));
// 1: checkpoints pause once, preserve ordinary unit and route; no detached mission.
load(recon,['executeReconMissionOrder']);
ctx.executeMoveOrder=(u,o)=>{ctx.moveOrder=o;};
ctx.reconHexFromKey=k=>{const [col,row]=k.split(',').map(Number);return {col,row};};
run("var scout={name:'Разведвзвод',type:'recon_platoon',col:0,row:0,ap:8}; appData.campaign.opUnits=[scout]; var order={id:1,status:'active',waypoints:[{col:1,row:0},{col:3,row:0}]};executeReconMissionOrder(scout,order);");
assert.equal(run('order.reconRoute'),true);assert.equal(run('order.waypoints.length'),2);assert.equal(run('scout.hidden'),undefined);
run('scout.col=1;reconRouteCheckpoint(scout,order);reconRouteCheckpoint(scout,order)');assert.equal(ctx.observations,1);
run('appData.campaign.currentTurn++;scout.ap=8;');assert.equal(run('reconRouteCheckpoint(scout,order)'),false);
run('scout.col=3;reconRouteCheckpoint(scout,order)');assert.equal(ctx.observations,2);assert.equal(run('order.status'),'active');
// 2: either cable endpoint follows within seven, out-of-range return reconnects,
// physically cut and unfinished laying lines never heal from moving.
run("var hq={col:0,row:0},pl={col:6,row:0};appData.campaign.opUnits=[hq,pl];var cable={id:1,fromUnitId:0,toUnitId:1,intact:true};hardMode.phoneLines=[cable];extendMovingPhoneLines(pl)");
assert.equal(run('cable.intact'),true);run('pl.col=8;extendMovingPhoneLines(pl)');assert.equal(run('cable.intact'),false);
run('pl.col=7;extendMovingPhoneLines(pl)');assert.equal(run('cable.intact'),true);
run("cable.intact=false;cable.cutReason='enemy';cable.cutHex='3,0';extendMovingPhoneLines(pl)");assert.equal(run('cable.intact'),false);
run("cable.cutReason=null;cable.laying=true;extendMovingPhoneLines(pl)");assert.equal(run('cable.intact'),false);
ctx.rollD10=()=>9;
assert.equal(run("signalRepairContact({},[{name:'enemy',col:2,row:0}],0,0)"),null);
ctx.rollD10=()=>10;assert.equal(run("!!signalRepairContact({},[{name:'enemy',col:2,row:0}],0,0)"),true);
ctx.rollD10=()=>1;assert.equal(run("!!signalRepairContact({},[{name:'enemy',col:0,row:0}],0,0)"),true);
run("var party={};signalRepairContact(party,[{name:'same',col:2,row:0}],0,0)");
assert.equal(run("!!signalRepairContact(party,[{name:'same',col:2,row:0}],2,0)"),true);
// Artillery ignores repair-party stealth, but only on the struck hex.
ctx.rollD6=()=>6;
ctx.losePhoneLineRepairTeam=(task)=>{ctx.hardMode.phoneLineRepairTasks=ctx.hardMode.phoneLineRepairTasks.filter(t=>t!==task);};
run("hardMode.phoneLineRepairTasks=[{lineId:1,col:4,row:4},{lineId:1,col:5,row:5}];signalRepairsHitByShelling('4,4')");
assert.equal(run('hardMode.phoneLineRepairTasks.length'),1);assert.equal(run('hardMode.phoneLineRepairTasks[0].col'),5);
// 3: resize and first render cannot overwrite a user zoom.
load(HTML,['applyOpMapFitZoom']);run("appData.campaign.opZoomLevel=2;appData.campaign.opZoomUserSet=true;applyOpMapFitZoom({cols:20})");assert.equal(run('appData.campaign.opZoomLevel'),2);
assert.doesNotMatch(HTML,/mapTab'\) \{ resetMapZoom/);
// 4: real truck mobility and at least one exit, central safe deployment.
ctx.getOpMoveCost=(u,c,r,x,y)=>{assert.equal(u.mobility,'vehicle');return c===0?Infinity:1;};ctx.getOpHexNeighbors=(c,r)=>[{col:c+1,row:r}];
run("var depot={name:'supply'},friends=[{col:1,row:0},{col:5,row:0}],zone=[{col:0,row:0},{col:1,row:0},{col:3,row:0},{col:5,row:0}]");
assert.equal(run('operationalSupplyDeployment(depot,zone,friends,[]).col'),3);
// 5: no doctrine until report; bounded deliberate blind exception, no omniscient coordinates.
ctx.operationalAIRole=u=>u.role;
run("appData.campaign.currentTurn=1;appData.campaign.opUnits=[{detected:false,col:99,row:99}];appData.campaign.enemyAIRecon=null;var scouts=[{name:'recon',role:'recon'}]");
assert.equal(run("operationalAIReconPreparation(appData.campaign,'BeVe',scouts).mode"),'recon_prepare');
run('appData.campaign.opUnits[0].detected=true');assert.equal(run("operationalAIReconPreparation(appData.campaign,'BeVe',scouts)"),null);
run('appData.campaign.opUnits[0].detected=false;appData.campaign.currentTurn=4');assert.equal(run("operationalAIReconPreparation(appData.campaign,'BeVe',scouts)"),null);assert.equal(run('appData.campaign.enemyAIRecon.blindAssault'),true);
// 6: continuous lane in a mixed hex, not a blanket permission through water.
load(HTML,['opPointInPolygon']);ctx.opLayersReady=()=>true;ctx.opHexSourcePoint=(c,r)=>({x:c*100,y:r*100});
run("appData.campaign.opLayers={layers:{water:[{points:[[40,-100],[110,-100],[110,0],[40,0]]}]}}");
assert.ok(run('opLayerFootCorridor(0,0,1,0)'));
run("appData.campaign.opLayers.layers.water=[{points:[[40,-100],[110,-100],[110,100],[40,100]]}]");assert.equal(run('opLayerFootCorridor(0,0,1,0)'),null);
run("appData.campaign.opLayers.layers.water=[{points:[[76,-100],[77,-100],[77,100],[76,100]]}]");
assert.equal(run('opLayerFootCorridor(0,0,1,0)'),null,'thin continuous water barrier cannot be skipped between samples');
// 7: texture variants persist in both old overlay and a new order draft.
load(editor,['hexEditCycleTrenchTexture']);run("var hexEditorState={hexKey:'8,12'},overlay={},draft=null;appData.map.grid={'1,1':{type:'trenches',variant:0}};var TERRAIN_DATA={trenches:{images:['a','b','c']}}");
ctx.hexEditSelectedTrenchCell=()=> '1,1';ctx.getHexOverlay=()=>ctx.overlay;ctx.pendingHexEditDraft=()=>ctx.draft;ctx.saveHexOverlays=()=>{};ctx.showHexEditorBanner=()=>{};
run('hexEditCycleTrenchTexture()');assert.equal(run("overlay.hexVariants['1,1']"),1);
run("draft={cells:{'1,1':'trenches'},variants:{}};hexEditCycleTrenchTexture()");assert.equal(run("draft.variants['1,1']"),2);
// 8: public cut intel contains no endpoint names or route geometry.
assert.equal(run("enemyCableCutPublicNotice({cutHex:'8,12',fromName:'SECRET HQ',toName:'SECRET PL',path:[{},{}]})"),'✂️ На гексе (8,12) перерезан телефонный кабель противника.');
assert.doesNotMatch(sliceFunction(HTML,'beginEnemyPhoneLineRepairs'),/log\([\s\S]*?enemyPhoneLineLabel/);
const draw=HTML.slice(HTML.indexOf('//    только те, что он перерезал'),HTML.indexOf('// Временный маршрут игрока'));
assert.doesNotMatch(draw,/line\.path|fromName|toName/);
// 9: a player who just moved is attacker even with a stale enemy hint.
load(placement,['resolveBattleEntry']);run("appData.campaign.currentTurn=4;var entrant={col:4,row:4,prevCol:3,prevRow:4,opLastMoveTurn:4}, defender={col:4,row:4,prevCol:5,prevRow:4,opLastMoveTurn:3}");
assert.equal(run("resolveBattleEntry([entrant],[defender],'4,4',{entry:{attackerSide:'enemy'}}).attackerSide"),'player');
// 10: deployment reserves exclude placed squads even before confirmation.
load(placement,['placementTrayUnplacedSquads']);ctx.placementBattleGrid=()=>ctx.appData.map.grid;
run("appData.squads=[{name:'placed',fighters:[{hp:1}]},{name:'reserve',fighters:[{hp:1}]}];appData.map.grid={'0,0':{squadIds:[0]}}");assert.deepEqual(Array.from(run("placementTrayUnplacedSquads({placement:{phase:'placing'}}).map(x=>x.i)")),[1]);
// 11: issuing a platoon step never appends to the whole-company envelope.
load(ui,['appendTurnOrder','seriesStep']);ctx.campaign=()=>ctx.appData.campaign;
run("hardMode.orders=[{type:'company_order',toUnitId:0,subUnitIds:[1,2],subUnitIdsAll:[1,2],turnIssued:4,status:'pending'}]");assert.equal(run("appendTurnOrder(1,'recon',{})"),null);
run("hardMode.orders=[{type:'company_order',toUnitId:0,subUnitIds:[1],subUnitIdsAll:[1],relayOnly:true,orderType:'move',turnIssued:4,status:'pending'}]");assert.ok(run("appendTurnOrder(1,'recon',{})"));assert.equal(run('hardMode.orders[0].series.length'),2);
load(HTML,['executeCompanyOrder']);ctx.executeOrder=()=>{throw Error('Relay must not command HQ');};
run("executeCompanyOrder({}, {relayOnly:true,status:'active',subUnitIds:[]})");
// 12: border follows the square image footprint.
assert.match(HTML,/if \(hqFrameColor\) \{[\s\S]*?ctx\.strokeRect\(drawX - radius, drawY - radius, radius \* 2, radius \* 2\)/);
// 13: completion remains visible after the last unit is placed, does not reset round.
load(placement,['placementFinishReinforcements','placementReinforcementPending']);
run("var battle={id:1,placement:{phase:'done',reinforcementPending:true},round:4,tacticalMap:{}};appData.campaign.online=false");
ctx.getCurrentBattleRecord=()=>ctx.battle;ctx.placementReinforcementUnplaced=()=>[];
assert.equal(run('placementReinforcementPending(battle)'),true);assert.equal(run('placementFinishReinforcements()'),true);assert.equal(run('battle.round'),4);assert.equal(run('battle.placement.reinforcementPending'),false);
// 14: the complete elevation badge, not only its number, is lowered.
assert.match(HTML,/c\.y \+= size \* 0\.60/);
console.log('PASS: 14 playtest regression groups (route recon, cable/stealth, zoom, AI, terrain, trench, intel, attacker, reserves, relay, frame, reinforcement, elevation).');
