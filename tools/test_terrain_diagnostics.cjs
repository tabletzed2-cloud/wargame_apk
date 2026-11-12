'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx={window:{__terrainReviewTest:true}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/terrain_diagnostics.js','utf8'),ctx);
const api=ctx.window.terrainReviewDiagnostics;
let checks=0;const check=(x,m)=>{assert.ok(x,m);checks++;};
const box=(x1,y1,x2,y2)=>[[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
const a={x:0,y:0,col:0,row:0},b={x:100,y:0,col:1,row:0};
const wall=box(48,-100,52,100);
const layer=(id,points=wall,level)=>({id,level,polygons:[{points}]});
const data=(...layers)=>({layers,road:{edges:[]}});
check(!api.pointInside(a,wall)&&!api.pointInside(b,wall),'dry centers on either side of water');
check(api.hits(a,b,wall),'thin obstacle between centers is detected');
check(api.pointInside({x:48,y:0},wall),'boundary point belongs to obstacle');
check(!api.hits({x:0,y:102},{x:100,y:102},wall),'parallel outside ray is clear');
for(const profile of ['wheeled','tracked','amphibious','daf']){
 for(const level of [1,2,3]){
  const d=data(layer('height'+level,wall,level));
  check(api.evaluate(d,a,b,profile).status==='blocked',`${profile} cannot enter height ${level} without road/anchor`);
  check(api.evaluate(d,a,b,profile,{anchor:true}).status===(level===1?'allowed':'blocked'),`${profile} anchor only permits height 1`);
  d.road.edges=[['0,0','1,0']];
  const r=api.evaluate(d,a,b,profile);check(r.status==='allowed'&&r.speed==='road',`${profile} road overrides height ${level} at full road speed`);
 }
}
for(const terrain of ['swamp_passable','swamp_impassable']){
 const d=data(layer(terrain));
 for(const profile of ['wheeled','tracked','amphibious']){
  check(api.evaluate(d,a,b,profile).status==='blocked',`${terrain} blocks ${profile}`);
  check(api.evaluate(d,a,b,profile,{anchor:true}).status==='blocked','anchor does not unlock swamps');
 }
 const r=api.evaluate(d,a,b,'daf');check(r.status==='allowed'&&r.speed==='very-slow','DAF crosses both swamp types with large penalty');
 d.road.edges=[['0,0','1,0']];check(api.evaluate(d,a,b,'wheeled').speed==='road','connected road permits passage at road speed');
}
const water=data(layer('water'));
for(const p of ['foot','tracked','wheeled'])check(api.evaluate(water,a,b,p).status==='blocked','non-amphibians cannot cross water wall');
for(const p of ['amphibious','daf'])check(api.evaluate(water,a,b,p).status==='allowed','amphibians cross water');
water.road.edges=[['0,0','1,0']];check(api.evaluate(water,a,b,'wheeled').status==='blocked','road alone does not fabricate water bridge');
check(api.evaluate(water,a,b,'daf').speed==='water','water capability does not become road speed');
const mixed=data(layer('water'),layer('height2',wall,2));check(api.evaluate(mixed,a,b,'daf').status==='blocked','amphibious ability does not bypass mountain restriction');
const partial=data(layer('water',box(80,-100,150,100)));
const landing=api.evaluate(partial,a,b,'wheeled');
check(landing.status==='allowed'&&landing.partial&&landing.landing.x<80,'water at center and majority of target does not block accessible dry portion');
check(!api.hits(a,landing.landing,partial.layers[0].polygons[0].points),'accepted partial transition is a straight unobstructed segment');
const enclosed=data(layer('water',box(48,-100,52,100)),layer('water',box(80,-100,150,100)));
check(api.evaluate(enclosed,a,b,'wheeled').status==='blocked','dry destination portion behind a wall is not reachable by teleport');
check(api.hexDistance({col:0,row:0},{col:0,row:1})===1,'odd-row neighbors');
check(api.hexDistance({col:0,row:0},{col:1,row:1})===2,'non-neighbors not accidentally linked');
const forest=data(layer('forest'));
check(api.evaluate(forest,a,b,'tracked').status==='allowed','tracked armor may cross forest');
for(const p of ['wheeled','amphibious','daf'])check(api.evaluate(forest,a,b,p).status==='blocked','wheeled profiles cannot cross forest off road');
forest.road.edges=[['0,0','1,0']];check(api.evaluate(forest,a,b,'wheeled').speed==='road','road through forest remains usable by wheeled armor');
for(const terrain of ['swamp_passable','swamp_impassable'])check(api.evaluate(data(layer('forest'),layer(terrain)),a,b,'tracked').status==='blocked','forest permission never unlocks swamp for tracked armor');
check(api.evaluate(data(layer('forest'),layer('height1',wall,1)),a,b,'tracked').status==='blocked','forest permission does not unlock mountains');
check(api.evaluate(data(layer('forest'),layer('swamp_impassable')),a,b,'daf').status==='blocked','DAF swamp capability does not unlock forest for a wheeled vehicle');
const overlap=data(layer('forest'),layer('bushes'));
check(api.describe(overlap,{x:50,y:0}).includes('лес')&&!api.describe(overlap,{x:50,y:0}).includes('кусты'),'agreed forest priority');
const j=JSON.parse(fs.readFileSync(__dirname+'/../docs/terrain-review/valencia/contours.review.json','utf8'));
for(const edge of j.road.edges){const [from,to]=edge.map(id=>j.centers.find(c=>`${c.col},${c.row}`===id));check(from&&to&&api.hexDistance(from,to)===1,'every road candidate links existing adjacent centers');}
check(j.road.endpointCount===3,'T-shaped original road has three open ends');
console.log(`PASS: ${checks} movement diagnostic checks`);
