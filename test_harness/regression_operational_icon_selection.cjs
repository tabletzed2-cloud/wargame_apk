'use strict';
// No dependencies: run production layout/pickers and the real click handler.
const assert = require('assert/strict');
const vm = require('vm');
const {HTML, sliceFunction} = require('./extract');
const nodes = new Map();
const canvas = {width:2400,height:2400,getBoundingClientRect:()=>({left:17,top:23,width:600,height:600})};
const context = vm.createContext({
  appData:{campaign:{opUnits:[],enemyOpUnits:[],opZoomLevel:1,opMapMode:'view',opCenters:[]}},
  OP_HEX_SIZE:45,opUnitAnimPixel:{},hardMode:{enabled:false},pickingTargetHex:false,
  canvasBackingScale:()=>2,onlineEnemyVisible:u=>u.detected !== false,
  opEnemyVisibleToPlayer:u=>u.detected !== false,
  document:{getElementById(id){
    if(id==='opMapCanvas') return canvas;
    if(!nodes.has(id))nodes.set(id,{style:{},innerHTML:'',textContent:''});
    return nodes.get(id);
  }},
  isStaticOpUnit:()=>false,redrawOperationalMap:()=>{},
  updateDismountPanel:()=>{},updateBtrPanel:()=>{},updateVehiclePanel:()=>{},
  renderVehicleStatus:()=>{},opUnitKindLabel:()=> 'unit'
});
for(const name of ['operationalUnitIconLayout','operationalUnitAtPoint','opOwnUnitAtPoint','tryMoveSelectedOpUnitToHex','handleOpMapClick']) {
  vm.runInContext(sliceFunction(HTML,name),context);
}
let checks=0;
function equal(a,b,label){assert.equal(a,b,label);checks++;}
function click(entry){
  // Backing DPR=2, CSS display scaled to half the logical canvas size.
  context.handleOpMapClick({clientX:17+entry.x/2,clientY:23+entry.y/2});
}
const camp=context.appData.campaign;
for(const zoom of [.5,1,2]) for(const count of [1,2,3,8,20]) {
  camp.opZoomLevel=zoom;
  camp.opUnits=Array.from({length:count},(_,i)=>({name:`own ${i}`,col:2,row:2,ap:5}));
  camp.opUnits.push({name:'destroyed',col:2,row:2,isDestroyed:true},
    {name:'passenger',col:2,row:2,embarkedInBtr:'carrier'},
    {name:'scout away',col:2,row:2,reconMissionId:'mission'});
  camp.enemyOpUnits=[{name:'visible enemy',col:2,row:2,detected:true},
    {name:'hidden enemy',col:2,row:2,detected:false}];
  const size=45*zoom;
  const entries=context.operationalUnitIconLayout(size,18*zoom);
  equal(entries.length,count+1,'only rendered units participate in hit layout');
  for(const entry of entries){
    equal(context.operationalUnitAtPoint(entry.x,entry.y,size,[entry.unit]),entry.unit,'mixed-side layout point selects rendered unit');
    if(!entry.isEnemy){
      equal(context.opOwnUnitAtPoint(entry.x,entry.y,size),entry.unit,'own picker selects exact icon, not first unit on hex');
      equal(context.opOwnUnitAtPoint(entry.x+entry.radius*.9,entry.y+entry.radius*.9,size),entry.unit,'square icon corner remains clickable');
      camp.selectedOpUnit=camp.opUnits[(camp.opUnits.indexOf(entry.unit)+1)%count];
      if(camp.selectedOpUnit!==entry.unit) camp.selectedOpUnit.availableHexes=[{col:entry.unit.col,row:entry.unit.row}];
      click(entry);
      camp.opUnits.forEach(u=>delete u.availableHexes);
      equal(camp.selectedOpUnit,entry.unit,'real view click selects exact unit with CSS scaling and DPR');
    } else {
      equal(context.opOwnUnitAtPoint(entry.x,entry.y,size),null,'enemy icon must not hit a nearby own icon');
      click(entry);
      equal(camp.selectedEnemyOpUnit,entry.unit,'real view click selects exact visible enemy');
    }
  }
  equal(context.opOwnUnitAtPoint(-100,-100,size),null,'empty space is not a unit');
}
// Animated positions must also be picked where they are actually drawn.
camp.opUnits=[{name:'moving',col:2,row:2},{name:'stationary',col:2,row:2}];
camp.enemyOpUnits=[];camp.opZoomLevel=1;
context.opUnitAnimPixel[0]={x:111,y:222};
equal(context.opOwnUnitAtPoint(111,222,45),camp.opUnits[0],'animated icon uses current pixel position');
click({x:111,y:222});
equal(camp.selectedOpUnit,camp.opUnits[0],'real click selects animated unit');
console.log(`PASS: operational icon selection (${checks} checks)`);
