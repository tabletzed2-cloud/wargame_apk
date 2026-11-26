// ⚡ BUILD-МАРКЕР: v13.205
// Shared rule helpers: placement geometry, meeting entries, directional sight.
function tacticalRuleNeighbors(key, size) {
  const [c,r] = String(key).split(',').map(Number);
  const offsets = r % 2 ? [[1,0],[1,1],[0,1],[-1,0],[0,-1],[1,-1]] : [[1,0],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1]];
  return offsets.map(([dc,dr]) => [c+dc,r+dr]).filter(([x,y]) => x>=0 && y>=0 && x<size && y<size).map(p => p.join(','));
}
const tacticalEdgeDistanceCache = new Map();
function tacticalEdgeDistances(size) {
  if (tacticalEdgeDistanceCache.has(size)) return tacticalEdgeDistanceCache.get(size);
  const distances = new Map(), queue = [];
  for (let r=0;r<size;r++) for(let c=0;c<size;c++) if(c===0||r===0||c===size-1||r===size-1) {
    const key=c+','+r; distances.set(key,0);queue.push(key);
  }
  for(let i=0;i<queue.length;i++) for(const key of tacticalRuleNeighbors(queue[i],size)) if(!distances.has(key)) {
    distances.set(key,distances.get(queue[i])+1);queue.push(key);
  }
  tacticalEdgeDistanceCache.set(size,distances);return distances;
}
function tacticalDefenderZoneKeys(size) {
  return [...tacticalEdgeDistances(size)].filter(([,distance]) => distance>3).map(([key]) => key);
}
function tacticalMeetingEntry(players, enemies, hexKey, turn, rng) {
  const [col,row] = String(hexKey).split(',').map(Number);
  const entrant = units => (units || []).find(u => u && Number(u.col)===col && Number(u.row)===row &&
    Number(u.opLastMoveTurn)===Number(turn) && Number.isFinite(u.prevCol) && Number.isFinite(u.prevRow) &&
    (u.prevCol!==col || u.prevRow!==row));
  const player=entrant(players), enemy=entrant(enemies);
  if(!player || !enemy) return null;
  return {battleMode:'meeting', firstSide:(rng || Math.random)()<0.5?'player':'enemy',
    entryDirs:{player:opDirectionBetween(col,row,player.prevCol,player.prevRow),enemy:opDirectionBetween(col,row,enemy.prevCol,enemy.prevRow)}};
}
function tacticalIsEngineer(unit) {
  return !!(unit && (unit.type==='engineer_platoon' || /сап[её]р/i.test(`${unit.name || ''} ${unit.opUnitName || ''}`) ||
    (unit.squads || []).some(s => /сап[её]р/i.test(String(s && s.name || '')))));
}
function tacticalRulePixel(key) {
  const [c,r]=String(key).split(',').map(Number);
  return {x:Math.sqrt(3)*(c+(r%2)/2),y:r*1.5};
}
function tacticalRuleAngle(fromKey,toKey) {
  const from=tacticalRulePixel(fromKey),to=tacticalRulePixel(toKey);
  return Math.atan2(to.y-from.y,to.x-from.x);
}
function tacticalAimZoneKeys(squad, fromKey, night, grid, size) {
  const aim=squad && squad.vehicleAim;
  if(!aim || !aim.hexKey || aim.fromKey!==String(fromKey) || !grid[aim.hexKey]) return [];
  const neighbors=tacticalRuleNeighbors(aim.hexKey,size).filter(key => grid[key]);
  if(!night) return [aim.hexKey,...neighbors];
  const axis=tacticalRuleAngle(fromKey,aim.hexKey);
  // Two wings, not the straight continuation: quantize the viewing axis and
  // select its two flanking forward neighbors (a symmetric night fan).
  const direction=Math.round(axis/(Math.PI/3));
  const angleError=(a,b) => Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
  const wings=[direction-1,direction+1].map(d => {
    const wanted=d*Math.PI/3;
    return neighbors.slice().sort((a,b) => angleError(tacticalRuleAngle(aim.hexKey,a),wanted)-angleError(tacticalRuleAngle(aim.hexKey,b),wanted))[0];
  }).filter(Boolean);
  return [...new Set([aim.hexKey,...wings])];
}
function tacticalVehicleHasRearMG(squad) {
  const weapons=typeof getFactionCrewWeapons==='function'?getFactionCrewWeapons(squad.faction)||[]:[];
  return (squad.crewInstances || []).some(ci => {
    if(!ci || ci.active===false || ci.status==='destroyed' || ci.status==='blinded')return false;
    const weapon=weapons.find(w => w.name===ci.weaponName);
    if(!weapon || weapon.type!=='mg')return false;
    const spec=typeof vehicleWeaponSectorSpec==='function'?vehicleWeaponSectorSpec(squad,ci.weaponName,'mg',ci):null;
    return (ci.sectorRole==='rear' || spec && spec.role==='rear') &&
      (ci.fighterIndices || []).some(i => squad.fighters && squad.fighters[i] && squad.fighters[i].hp>0);
  });
}
function tacticalObserverCanSeeHex(squad, fromKey, targetKey, night, mapLike) {
  const map=mapLike || appData.map;
  const [c,r]=String(fromKey).split(',').map(Number),[tc,tr]=String(targetKey).split(',').map(Number);
  const distance=hexGridDistance(c,r,tc,tr);
  const vehicle=!!(squad.armor || squad.isVehicle || typeof vehicleFamilyFor==='function' && vehicleFamilyFor(squad));
  if(vehicle) {
    const index=['e','se','sw','w','nw','ne'].indexOf(vehicleFacingDir(squad));
    const axis=Math.max(0,index)*Math.PI/3;
    const relative=Math.abs(Math.atan2(Math.sin(tacticalRuleAngle(fromKey,targetKey)-axis),Math.cos(tacticalRuleAngle(fromKey,targetKey)-axis)));
    // Front and rear each cover a 120-degree arc, remaining directions are flanks.
    const front=relative<=Math.PI/3+1e-9, rear=relative>=2*Math.PI/3-1e-9;
    const range=front || rear && tacticalVehicleHasRearMG(squad) ? (night?3:5) : (night?1:2);
    const aimed=tacticalAimZoneKeys(squad,fromKey,night,map.grid,typeof TACTICAL_MAP_SIZE==='number'?TACTICAL_MAP_SIZE:20).includes(String(targetKey));
    if(distance>range && !aimed)return false;
  } else {
    const base=Math.max(1,Number(squad.visionRange)||6);
    if(distance>(night?Math.max(1,Math.floor(base/2)):base))return false;
  }
  if(typeof tacticalSmokeBlocksSight==='function' && tacticalSmokeBlocksSight(fromKey,targetKey,map))return false;
  return typeof tacticalHasLineOfSight!=='function' || tacticalHasLineOfSight({col:c,row:r},{col:tc,row:tr});
}
function tacticalTurretWeapon(squad, crew, weapon) {
  if(!squad || !squad.armor || !crew || !weapon || !Number(squad.armor.turret))return false;
  const spec=typeof vehicleWeaponSectorSpec==='function'?vehicleWeaponSectorSpec(squad,crew.weaponName,weapon.type,crew):null;
  const role=crew.sectorRole || spec && spec.role;
  if(['bow','rear','parallel'].includes(role))return false;
  return role==='coax' || ['at_gun','tank_gun'].includes(weapon.type);
}
function tacticalAimedWeaponBonus(squad, crew, weapon, targetKey) {
  if(!tacticalTurretWeapon(squad,crew,weapon) || !targetKey)return 0;
  const pos=tacticalSquadHexPosition(squad);
  if(!pos)return 0;
  const night=typeof isNightTime==='function' && isNightTime() && !(typeof tacticalIlluminationActive==='function' && tacticalIlluminationActive());
  return tacticalAimZoneKeys(squad,pos.key,night,appData.map.grid,TACTICAL_MAP_SIZE).includes(String(targetKey)) &&
    tacticalObserverCanSeeHex(squad,pos.key,targetKey,night,appData.map)?1:0;
}
function drawTacticalAimOverlay(ctx,size) {
  const map=appData.map,index=map.selectedMoveSquadIdx;
  const squad=appData.squads[index!=null?index:currentSquadIndex];
  const pos=squad && tacticalSquadHexPosition(squad);
  if(!pos)return;
  const night=isNightTime() && !tacticalIlluminationActive();
  const keys=new Set(tacticalAimZoneKeys(squad,pos.key,night,map.grid,TACTICAL_MAP_SIZE));
  ctx.save();ctx.fillStyle='rgba(75,195,255,.25)';ctx.strokeStyle='#4bc3ff';ctx.lineWidth=2;
  for(const center of map.centers || []) if(keys.has(center.key)) {
    ctx.beginPath();for(let i=0;i<6;i++) {const a=(60*i-30)*Math.PI/180;const x=center.x+size*Math.cos(a),y=center.y+size*Math.sin(a);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
    ctx.closePath();ctx.fill();ctx.stroke();
  }
  ctx.restore();
}

function tacticalFortifiedTarget(squad) {
  if(!squad)return false;
  if(squad.fixedTacticalPosition || squad.isDugIn || squad.inTrench || typeof tacticalIsDotSquad==='function' && tacticalIsDotSquad(squad))return true;
  const pos=typeof tacticalSquadHexPosition==='function'?tacticalSquadHexPosition(squad):null;
  const cell=pos && appData.map.grid[pos.key];
  return !!(cell && [cell.type,...cell.markers || []].some(value => /trenches|fortification|bunker/.test(String(value))));
}
function tacticalEngineerCardPriority(card) {
  const name=String(card && card.name || '');
  return /Термит/.test(name)?100:/РОКС/.test(name)?90:/Дымовые гранаты|Двойной БК/i.test(name)?20:0;
}
