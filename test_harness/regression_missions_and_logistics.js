'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, HTML } = require('./extract');
const recon = fs.readFileSync(path.join(__dirname, '..', 'js/recon.js'), 'utf8');
const s = createSandbox(freshAppData());
s.run(`
function getOpHexNeighbors(col,row) {
  return [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]].map(([x,y])=>({col:col+x,row:row+y}))
    .filter(p=>p.col>=0 && p.row>=0 && p.col<8 && p.row<8);
}
function isHexInPlayableArea(s,col,row) { return col>=0 && row>=0 && col<8 && row<8; }
function operationalHexHasActiveBattle(col,row) { return (appData.campaign.battleKeys||[]).includes(col+','+row); }
appData.campaign.opMapGrid = {};
for(let col=0;col<8;col++) for(let row=0;row<8;row++) appData.campaign.opMapGrid[col+','+row]={types:['grass']};
appData.campaign.opMapGrid['1,1']={types:['forest']};
appData.campaign.opUnits=[{name:'Landsverk test',type:'armored_vehicle_platoon',col:0,row:1,squads:[{name:'Экипаж',fighters:[{hp:3}]}]}];
appData.campaign.reconMissions=[];
`);
s.run(recon);
let route = s.evalCtx("reconPlanRoute('armored_car',{col:0,row:1},[{col:3,row:1,observe:false},{col:4,row:2,observe:true}])");
assert(route && route.length > 2);
assert(!route.some(p => p.col === 1 && p.row === 1), 'route avoids impassable forest');
assert.equal(route.filter(p => p.observe).length, 1, 'transit point is not an observation point');
let current = { col: 0, row: 1 };
for (const hex of route) {
    const adjacent = s.evalCtx(`getOpHexNeighbors(${current.col},${current.row}).some(p=>p.col===${hex.col}&&p.row===${hex.row})`);
    assert(adjacent, 'every planned step is adjacent'); current = hex;
}
assert.equal(s.evalCtx("reconPlanRoute('armored_car',{col:0,row:1},[{col:1,row:1}])"), null);
assert.equal(s.evalCtx("getReconMoveCost('foot',{col:0,row:0})"), 2, 'foot recon uses hidden half pace');
assert(!s.evalCtx("reconCanReceiveMission({type:'infantry_platoon',name:'Пехота',squads:[]})"));
assert(!s.evalCtx("reconCanReceiveMission({type:'engineer_platoon',name:'Саперы',squads:[]})"));
assert(!s.evalCtx("reconCanReceiveMission({type:'at_gun',name:'ПТО',squads:[]})"));
assert(s.evalCtx('reconCanReceiveMission(appData.campaign.opUnits[0])'));
s.run(`var mission = createReconMission({assetKey:'beve_armored_car',unitId:0,route:[{col:3,row:1,observe:true}]});`);
assert(s.evalCtx('!!mission && mission.routeVersion===2 && mission.route.length>1'));
s.run(`var seen=[]; observeInRange=(a,m)=>seen.push(m.currentHex.col+','+m.currentHex.row);
mission.ap=100; var result; for(let i=0;i<100;i++){result=reconStepAlongRoute(mission);if(result==='end')break;}`);
assert.equal(s.evalCtx('result'), 'end');
assert.equal(s.evalCtx('seen.join("|")'), '3,1', 'observe only at the marked location, once');
// Unsafe endpoints, manual exclusions, known enemy threat radius and hidden UI.
for (const name of ['supplyDangerKeys', 'findSupplyRoute']) s.run(sliceFunction(HTML, name));
s.run(`function supplyDeliveryMoveCost(){return 1;}
appData.campaign.enemyOpUnits=[{name:'known',col:3,row:3,detected:true},{name:'hidden',col:7,row:7,detected:false}];
appData.campaign.supplyDangerHexes=['1,1']; appData.campaign.battleKeys=['4,4'];
var convoy={col:0,row:0,assets:[]};
`);
assert(s.evalCtx("supplyDangerKeys(true).has('3,3') && supplyDangerKeys(true).has('3,2')"));
assert(!s.evalCtx("supplyDangerKeys(false).has('7,7')"), 'danger overlay must not reveal hidden enemy');
assert.equal(s.evalCtx('findSupplyRoute(convoy,3,3)'), null, 'no enemy goal exception');
assert.equal(s.evalCtx('findSupplyRoute(convoy,4,4)'), null, 'no battle goal exception');
assert.equal(s.evalCtx('findSupplyRoute(convoy,1,1)'), null, 'player exclusions also apply to destinations');
route = s.evalCtx('findSupplyRoute(convoy,6,0)');
assert(route && route.length);
for(const hex of route) assert(!s.evalCtx(`supplyDangerKeys(true).has('${hex.col},${hex.row}')`));
s.run("getOpHexNeighbors = (col,row) => [{col:col+1,row}].filter(p=>p.col<8); appData.campaign.supplyDangerHexes=['2,0']; appData.campaign.enemyOpUnits=[];");
assert.equal(s.evalCtx('findSupplyRoute(convoy,6,0)'), null, 'blocked corridor waits instead of taking unsafe route');
// Messenger release out of order cannot free another order's courier.
for(const name of ['assignMessenger','returnMessenger']) s.run(sliceFunction(HTML,name));
s.run(`appData.campaign.opUnits=[{type:'battalion_hq'}];
hardMode={messengers:{battalion:{available:3,active:[]},companies:{}}};
function dispatchQueuedOrders(){};
var hq=appData.campaign.opUnits[0]; var a=assignMessenger(hq,'a'),b=assignMessenger(hq,'b'),c=assignMessenger(hq,'c');
returnMessenger(hq,'b',b);`);
assert.equal(s.evalCtx("hardMode.messengers.battalion.active.map(a=>a.orderId).join(',')"), 'a,c');
assert.equal(s.evalCtx('hardMode.messengers.battalion.available'), 1);
assert(!s.evalCtx("returnMessenger(hq,'b',b)"));
assert.equal(s.evalCtx('hardMode.messengers.battalion.available'), 1);
s.run(`returnMessenger(hq,'a',a); returnMessenger(hq,'c',c);`);
assert.equal(s.evalCtx('hardMode.messengers.battalion.available'), 3);
console.log('Full recon routes, observation marks, stealth, eligibility, safe supply routes, messenger identities: PASS');
// Mission-only changes must sync even when the ordinary unit snapshot is unchanged.
s.run(sliceFunction(HTML,'onlinePushMyUnits'));
s.run(`var updates=[];
ONLINE={docRef:{update: obj=>{updates.push(obj);return {catch(){}};}},role:'p1',match:{status:'playing'},lastPushedJson:'[]'};
appData.campaign.online=true; appData.campaign.opUnits=[];
function onlineUnitSnapshot(u){return u;}
appData.campaign.reconMissions=[{id:'online-route',assetKind:'foot',status:'active',routeVersion:2,currentHex:{col:0,row:0},route:[{col:1,row:0,observe:true}],currentIndex:0}];
onlinePushMyUnits();`);
assert(s.evalCtx("updates.some(obj=>obj['state.p1.reconMissions'] && obj['state.p1.reconMissions'][0].routeVersion===2)"));
console.log('Mission-only online route synchronization: PASS');
