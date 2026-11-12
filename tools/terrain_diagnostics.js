/* Offline diagnostic only: never loaded by the game. */
(function(){
'use strict';
const names={water:'вода',swamp_impassable:'непроходимое болото',swamp_passable:'проходимое болото',forest:'лес',bushes:'кусты'};
const color={allowed:'#57e389',blocked:'#ff6565',review:'#ffc658'};
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function onSegment(a,b,p){return Math.abs(cross(a,b,p))<1e-7&&p.x>=Math.min(a.x,b.x)-1e-7&&p.x<=Math.max(a.x,b.x)+1e-7&&p.y>=Math.min(a.y,b.y)-1e-7&&p.y<=Math.max(a.y,b.y)+1e-7;}
function pointInside(p,poly){
 let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a={x:poly[i][0],y:poly[i][1]},b={x:poly[j][0],y:poly[j][1]};
  if(onSegment(a,b,p))return true;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
function intersect(a,b,c,d){
 const u=cross(a,b,c),v=cross(a,b,d),s=cross(c,d,a),t=cross(c,d,b);
 return (u*v<0&&s*t<0)||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
function hits(a,b,poly){
 if(pointInside(a,poly)||pointInside(b,poly))return true;
 return poly.some((p,i)=>intersect(a,b,{x:p[0],y:p[1]},{x:poly[(i+1)%poly.length][0],y:poly[(i+1)%poly.length][1]}));
}
function layersAt(data,a,b){return data.layers.filter(l=>l.polygons.some(p=>b?hits(a,b,p.points):pointInside(a,p.points))).map(l=>l.id);}
function hexDistance(a,b){const dq=(a.col-(a.row-(a.row%2))/2)-(b.col-(b.row-(b.row%2))/2),dr=a.row-b.row;return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));}
function describe(data,c){
 const layers=layersAt(data,c),level=Math.max(0,...data.layers.filter(l=>layers.includes(l.id)&&l.level).map(l=>l.level));
 const vegetation=layers.includes('forest')?'лес':layers.includes('bushes')?'кусты':'';
 const surface=layers.includes('water')?'вода':layers.includes('swamp_impassable')?'непроходимое болото':layers.includes('swamp_passable')?'проходимое болото':'суша';
 return `${surface}${vegetation?', '+vegetation:''}; ${level*15} м`;
}
const profiles={foot:{vehicle:false},wheeled:{vehicle:true},tracked:{vehicle:true},amphibious:{vehicle:true,water:true},daf:{vehicle:true,water:true,swamp:true}};
function roadConnected(data,a,b){const key=c=>`${c.col},${c.row}`;return (data.road?.edges||[]).some(e=>e.includes(key(a))&&e.includes(key(b)));}
function assess(data,a,b,profile,options={}){
 const rules=profiles[profile]||profiles.foot,ids=layersAt(data,a,b),road=roadConnected(data,a,b);
 const result=(status,reason,speed='field')=>({status,reason,speed,road,layers:ids,landing:{x:b.x,y:b.y,col:b.col,row:b.row}});
 if(ids.includes('water')){
  if(!rules.water)return result('blocked','Вода на прямом переходе: нужна амфибия; дорога сама по себе не означает мост');
  // Water capability never overrides an intervening mountain or swamp.
 }
 const swamp=ids.includes('swamp_impassable')||ids.includes('swamp_passable');
 if(road&&!ids.includes('water'))return result('allowed','Дорожная связь: полная дорожная скорость, включая гексы с высотами','road');
 const level=Math.max(0,...data.layers.filter(l=>ids.includes(l.id)&&l.level).map(l=>l.level));
 if(rules.vehicle&&level>0&&(!options.anchor||level>1))return result('blocked',options.anchor?'Талреп-якорь допускает только уровень 1 (15 м), но не 2/3':'Высота вне дороги: технике нужен Талреп-якорь для уровня 1');
 if(swamp&&rules.vehicle&&!rules.swamp)return result('blocked','Болото вне дороги: обычной и амфибийной технике запрещено; исключение — DAF MC-V');
 if(ids.includes('swamp_impassable')&&!rules.swamp)return result('blocked','Непроходимое болото на прямом переходе');
 if(ids.includes('forest')&&['wheeled','amphibious','daf'].includes(profile))return result('blocked','Лес вне дороги: колёсной технике запрещено в проверочной модели');
 if(swamp&&rules.swamp)return result('allowed','DAF MC-V проходит оба типа болот с большим штрафом скорости','very-slow');
 if(ids.includes('water'))return result('allowed','Амфибийное движение по воде; не дорожный режим','water');
 if(rules.vehicle&&level===1&&options.anchor)return result('allowed','Уровень 1 (15 м) доступен с Талреп-якорем; не дорожный режим','anchor');
 return result('allowed',swamp?'Пехота: проходимое болото, с замедлением':ids.includes('forest')&&profile==='tracked'?'Гусеничная бронетехника: движение по лесу разрешено':'Прямой переход свободен',swamp?'slow':'field');
}
// Source positions can differ from cell centers. Hex geometry remains the real
// game grid; the endpoint search never bends a ray around an obstacle.
function hexVertices(data,c){
 const t=data.gameTransform;
 const rx=t?t.hexSize*data.imageSize[0]/t.drawWidth:55;
 const ry=t?t.hexSize*data.imageSize[1]/t.drawHeight:55;
 return Array.from({length:6},(_,i)=>{const angle=(-90+i*60)*Math.PI/180;return [c.x+rx*Math.cos(angle),c.y+ry*Math.sin(angle)];});
}
function candidates(data,c){
 const vertices=hexVertices(data,c),polygon=vertices;
 const points=[{x:c.x,y:c.y,col:c.col,row:c.row}];
 const add=(x,y)=>{if(pointInside({x,y},polygon)&&(!data.imageSize||(x>=0&&y>=0&&x<data.imageSize[0]&&y<data.imageSize[1])))points.push({x,y,col:c.col,row:c.row});};
 for(const fraction of [.25,.5,.75,.94])for(let i=0;i<6;i++){
  const v=vertices[i],w=vertices[(i+1)%6];
  for(const u of [0,.25,.5,.75])add(c.x+((v[0]*(1-u)+w[0]*u)-c.x)*fraction,c.y+((v[1]*(1-u)+w[1]*u)-c.y)*fraction);
 }
 // Add points on both sides of clipped terrain boundaries to detect narrow
 // dry portions that would be missed by center-only or coarse sampling.
 for(const layer of data.layers)for(const p of layer.polygons)for(let i=0;i<p.points.length;i++){
  const a=p.points[i],b=p.points[(i+1)%p.points.length];
  if(Math.max(a[0],b[0])<Math.min(...vertices.map(v=>v[0]))||Math.min(a[0],b[0])>Math.max(...vertices.map(v=>v[0]))||Math.max(a[1],b[1])<Math.min(...vertices.map(v=>v[1]))||Math.min(a[1],b[1])>Math.max(...vertices.map(v=>v[1])))continue;
  const probes=[a];
  for(let j=0;j<6;j++){
   const v=vertices[j],w=vertices[(j+1)%6],r={x:b[0]-a[0],y:b[1]-a[1]},q={x:w[0]-v[0],y:w[1]-v[1]};
   const den=r.x*q.y-r.y*q.x;if(Math.abs(den)<1e-9)continue;
   const dx=v[0]-a[0],dy=v[1]-a[1],u=(dx*q.y-dy*q.x)/den,z=(dx*r.y-dy*r.x)/den;
   if(u>=0&&u<=1&&z>=0&&z<=1)probes.push([a[0]+u*r.x,a[1]+u*r.y]);
  }
  for(const v of probes)for(const dx of [-1,1])for(const dy of [-1,1])add(v[0]+dx,v[1]+dy);
 }
 return points;
}
function evaluate(data,a,b,profile,options={}){
 if(hexDistance(a,b)!==1)return {status:'blocked',reason:'Можно проверять только соседние гексы',road:false,layers:[]};
 const centered=assess(data,a,b,profile,options);
 if(centered.status==='allowed')return centered;
 let review=centered.status==='review'?centered:null;
 for(const endpoint of candidates(data,b)){
  const value=assess(data,a,endpoint,profile,options);
  if(value.status==='allowed')return {...value,partial:true,reason:'Вход в доступную часть гекса (не в центр). '+value.reason};
  if(value.status==='review'&&!review)review=value;
 }
 return review||{...centered,reason:centered.reason+'. Прямой вход в проверенные части гекса не найден'};
}
window.terrainReviewDiagnostics={pointInside,hits,layersAt,hexDistance,describe,evaluate,assess,candidates,hexVertices};
if(window.__terrainReviewTest)return;
const data=JSON.parse(document.getElementById('terrain-review-data').textContent);
const svg=document.querySelector('svg'),rays=document.getElementById('movement-rays');let selected=null;
const summary=document.getElementById('movement-summary'),results=document.getElementById('movement-results');
function line(a,b,status){const el=document.createElementNS('http://www.w3.org/2000/svg','line');Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color[status],'stroke-width':5,'stroke-dasharray':status==='review'?'8 5':'none'}).forEach(([k,v])=>el.setAttribute(k,v));rays.appendChild(el);}
function render(){
 rays.replaceChildren();results.replaceChildren();
 if(!selected){summary.textContent='Выберите гекс на карте.';return;}
 summary.textContent=`Позиция в гексе ${selected.col},${selected.row}: ${describe(data,selected)}. Координаты ${selected.x.toFixed(1)}, ${selected.y.toFixed(1)}. Нажмите зелёную карточку перехода, чтобы переместить проверочную позицию; точка входа сохранится.`;
 for(const target of data.centers.filter(c=>hexDistance(selected,c)===1)){
  const v=evaluate(data,selected,target,document.getElementById('movement-profile').value,{anchor:document.getElementById('movement-anchor').checked});
  line(selected,v.landing||target,v.status);
  const item=document.createElement('div');item.style.borderColor=color[v.status];const speed={road:'Полная дорожная скорость',field:'По полю медленнее, чем по дороге','very-slow':'Большой штраф скорости',water:'Плавание: скорость отдельно от дороги',anchor:'Подъём с якорем: скорость ещё не задана',slow:'С замедлением'}[v.speed]||'';item.textContent=`→ ${target.col},${target.row}: ${describe(data,v.landing||target)}. ${v.reason}. ${speed}.`;if(v.status==='allowed'){const button=document.createElement('button');button.type='button';button.textContent='Перейти в проверке';button.onclick=()=>{selected={...v.landing};render();};item.appendChild(button);}results.appendChild(item);
 }
 const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');Object.entries({cx:selected.x,cy:selected.y,r:8,fill:'#fff',stroke:'#111','stroke-width':3}).forEach(([k,v])=>dot.setAttribute(k,v));rays.appendChild(dot);
}
svg.addEventListener('click',event=>{
 const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const ctm=svg.getScreenCTM();if(!ctm)return;const p2=p.matrixTransform(ctm.inverse());
 const nearest=data.centers.reduce((a,b)=>Math.hypot(a.x-p2.x,a.y-p2.y)<Math.hypot(b.x-p2.x,b.y-p2.y)?a:b);
 if(Math.hypot(nearest.x-p2.x,nearest.y-p2.y)>65)return;selected={...nearest};if(pointInside(p2,hexVertices(data,nearest))){selected.x=p2.x;selected.y=p2.y;}render();
});
document.getElementById('movement-profile').addEventListener('change',render);
document.getElementById('movement-anchor').addEventListener('change',render);
document.getElementById('movement-clear').addEventListener('click',()=>{selected=null;render();});
})();
