'use strict';
const assert=require('assert/strict');
const vm=require('vm');
const {HTML,sliceFunction,sliceConst}=require('./extract');
const c={currentTurn:5,opUnits:[
 {name:'Battalion',type:'battalion_hq',col:0,row:0,radio:true},
 {name:'Company 1',type:'company_hq',col:1,row:0,radio:true,ap:1},
 {name:'Platoon 1',type:'infantry_platoon',col:1,row:0,radio:true,ap:1},
 {name:'Platoon 2',type:'infantry_platoon',col:1,row:0,radio:true,ap:1}],enemyOpUnits:[]};
const s=vm.createContext({appData:{campaign:c},hardMode:{orders:[],pendingOrders:[],messengers:{companies:{1:{}}}},
 console:{log(){},warn(){}},log(){},saveData(){},redrawOperationalMap(){},renderActiveOrders(){},
 getCommandingHQUnit:()=>c.opUnits[0],hasRadio:u=>!!u.radio,isInRadioRange:(a,b)=>Math.abs(a.col-b.col)<=10,
 hasPhoneLine:()=>false,hasActivePhoneAt:()=>true,justDisembarkedThisTurn:()=>false,
 operationalOrderWaitsForDisembark:()=>false,opCutPathsApplyNewOrder(){},isVehicleMobilityUnit:()=>false,
 isStaticOpUnit:()=>false,getOpHexDistance:(a,b,d,e)=>Math.abs(a-d)+Math.abs(b-e),
 getOpMoveCost:()=>1,opRecordPrevPos(){},checkMovingFire(){},reconnectPhoneLinesAfterUnitMove(){},
 buildOrderRoute:(u,waypoints)=>({route:[{col:u.col+1,row:0}],waypoints:waypoints.map(w=>({...w})),target:{col:5,row:0}}),OP_MAP_COLS:30,OP_MAP_ROWS:30,
 assignMessenger:()=>null});
for(const name of ['checkCommunication','orderInstantDeliveryIsLegit','demoteOrderToMessenger','executeOrder','executeCompanyOrder','executeMoveOrder',
 'operationalOrderEffectiveType','operationalOrderIsBlocking','operationalOrderPredecessor','operationalOrderWaitsForPredecessor'])vm.runInContext(sliceFunction(HTML,name),s);
vm.runInContext(sliceConst(HTML,'OP_ORDER_BLOCKING_TYPES'),s);
assert.equal(s.checkCommunication(c.opUnits[1],c.opUnits[2]),'radio','company and platoon with radios must not wait for a messenger');
const parent={id:100,fromUnitId:0,toUnitId:1,type:'company_order',orderType:'move',status:'active',
 subUnitIds:[2,3],subUnitIdsAll:[2,3],turnIssued:4,waypoints:[{col:5,row:0}],behavior:'ignore',deliveryMethod:'radio'};
s.hardMode.orders=[parent];
s.executeOrder(parent);
assert.deepEqual(c.opUnits.slice(1).map(u=>u.col),[2,2,2],'HQ and both platoons advance in the same operational turn');
assert.deepEqual(c.opUnits.slice(1).map(u=>u.ap),[0,0,0],'each unit spends its own AP exactly once');
assert.equal(s.hardMode.pendingOrders.length,0);
assert.equal(parent.status,'completed');
const children=s.hardMode.orders.filter(o=>o.relayParentId===100);
assert.equal(children.length,3);
assert.notEqual(children[0].waypoints,children[1].waypoints,'routes must not share mutable arrays');
s.executeCompanyOrder(c.opUnits[1],parent);
assert.equal(s.hardMode.orders.length,4,'retries must not duplicate orders');
// Continue all three real movement orders in the following operational turn.
c.currentTurn++;
c.opUnits.slice(1).forEach(u=>{u.ap=1;});
for(const o of s.hardMode.orders.slice()) {
 if(o.status==='active' && !s.operationalOrderWaitsForPredecessor(o)) s.executeOrder(o);
}
assert.deepEqual(c.opUnits.slice(1).map(u=>u.col),[3,3,3],'HQ and platoons keep progressing together on subsequent turns');
// Still sending to another platoon must not block an already delivered sibling.
parent.status='active';parent.subUnitIds=[3];
assert.equal(s.operationalOrderPredecessor(children.find(o=>o.toUnitId===2)),null,'relay envelope is not an earlier task for its own child');
const earlier={id:50,toUnitId:2,type:'move',turnIssued:3,status:'active'};
s.hardMode.orders.unshift(earlier);
assert.equal(s.operationalOrderPredecessor(children.find(o=>o.toUnitId===2)),earlier,'real older orders must still block');
s.hardMode.orders=[];
// No radio/phone: preserve physical messenger delivery and do not execute early.
c.opUnits[2].radio=false;
assert.equal(s.checkCommunication(c.opUnits[1],c.opUnits[2]),'messenger');
c.opUnits[2].ap=1;
const delayed={...parent,id:200,companySelfOrderId:null,subUnitIds:[2],subUnitIdsAll:[2]};
s.assignMessenger=()=> 'messenger-1';
s.executeCompanyOrder(c.opUnits[1],delayed);
assert.equal(s.hardMode.pendingOrders.length,1);
assert.equal(s.hardMode.pendingOrders[0].status,'delivering');
assert.equal(c.opUnits[2].ap,1,'platoon cannot act before messenger arrives');
c.opUnits[2].radio=true;c.opUnits[2].col=25;
assert.equal(s.checkCommunication(c.opUnits[1],c.opUnits[2]),'messenger','radio range still applies');
c.opUnits[2].col=2;c.opUnits[1].radio=false;
assert.equal(s.checkCommunication(c.opUnits[1],c.opUnits[2]),'messenger','company needs its own radio');
s.hasPhoneLine=()=>true;
assert.equal(s.checkCommunication(c.opUnits[1],c.opUnits[2]),'phone','working phone is still an instant delivery channel');
s.hasPhoneLine=()=>false;
c.opUnits[1].radio=true;
s.getCommandingHQUnit=()=>c.opUnits[1];
assert.equal(s.checkCommunication(c.opUnits[1],c.opUnits[2]),'radio','company command succession keeps radio delivery');
console.log('PASS: company parallel execution, real radio delivery/movement, predecessor isolation, and messenger/range safeguards');
