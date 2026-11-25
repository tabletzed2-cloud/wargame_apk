'use strict';
const assert = require('node:assert/strict');
const { HTML, sliceFunction } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const s = createSandbox(freshAppData());
for (const name of ['tacticalCrewWeaponsByType', 'tacticalPtoCrewState',
  'tacticalEnsurePtoCrewOrigins', 'tacticalIsPtoCrewSquad', 'tacticalIsSlowWeaponCrew',
  'tacticalResolvePtoCrewLosses', 'getMovementCost', 'getHexNeighbors',
  'calculateReachableHexes', 'recalcReachable', 'shouldShowTacticalReachability']) {
  s.run(sliceFunction(HTML, name));
}
s.run(`
  appData.factions = {
    BeVe: {crewWeapons: BEVE_CREW_WEAPONS},
    'A.I.R.F.': {crewWeapons: AIRF_CREW_WEAPONS}
  };
  var currentTurn = 1, TACTICAL_MAP_SIZE = 5;
  var actionPoints = {0:{ap:8}};
  function getAP(i) { return actionPoints[i].ap; }
  function tacticalDogSledEligible() { return false; }
  function getScopedActiveCardsForSquad() { return []; }
  function tacticalFireFieldAt() { return false; }
  function getMovementAPForStep(squad, ap) { return ap; }
  appData.map = {mode:'move', selectedMoveSquadIdx:0, grid:{}, enemySquads:[]};
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
    appData.map.grid[col + ',' + row] = {type:'grass', level:0, squadIds:[], enemySquadIds:[]};
  }
  var vehicleTemplates = SQUAD_TEMPLATES.filter(t => /Landsverk|CL\\/39/.test(t.name));
`);
assert.equal(s.evalCtx('vehicleTemplates.length'), 8, 'test all three Landsverks and five CL/39s');
for (let i = 0; i < 8; i++) {
  s.run(`var vehicle = JSON.parse(JSON.stringify(vehicleTemplates[${i}])); appData.squads = [vehicle];`);
  const name = s.evalCtx('vehicle.name');
  assert.equal(s.evalCtx('tacticalIsPtoCrewSquad(vehicle)'), false, `${name}: mounted gun is not a towed AT gun`);
  assert.equal(s.evalCtx('tacticalEnsurePtoCrewOrigins(vehicle)'), false, `${name}: no infantry gun-crew markers`);
  assert.equal(s.evalCtx('getMovementCost(vehicle, "2,2", "3,2", false, 8)'), 1, `${name}: normal vehicle movement`);
  s.run('recalcReachable(vehicle, "2,2")');
  assert.equal(s.evalCtx('shouldShowTacticalReachability()'), true);
  assert.equal(s.evalCtx('appData.map.reachableHexes.includes("3,2")'), true, `${name}: zone includes neighboring hex`);
  assert.equal(s.evalCtx('appData.map.reachablePrevious["3,2"]'), '2,2', `${name}: clickable route is recorded`);
  s.run('vehicle.isImmobilized = true');
  assert.equal(s.evalCtx('getMovementCost(vehicle, "2,2", "3,2", false, 8)'), Infinity, 'real immobilization still blocks vehicles');
  s.run('vehicle.isImmobilized = false; vehicle.fighters[2].hp = 0; vehicle.fighters[3].hp = 0;');
  assert.equal(s.evalCtx('tacticalResolvePtoCrewLosses(vehicle)'), false, 'lost tank gunners do not abandon the vehicle as an infantry gun');
  assert.equal(s.evalCtx('appData.squads.length'), 1, 'no spurious detached infantry');
}
// Preserve the minimum-three-crew restriction and uphill cost for actual towed guns.
s.run(`
  var gun = {name:'Расчёт ПТО', faction:'BeVe', fighters:[{hp:3},{hp:3},{hp:3}],
    crewInstances:[{weaponName:'Расчёт ПТО Bohler M37', fighterIndices:[0,1,2], active:true}]};
  tacticalEnsurePtoCrewOrigins(gun);
`);
assert.equal(s.evalCtx('tacticalIsPtoCrewSquad(gun)'), true);
assert.equal(s.evalCtx('getMovementCost(gun, "2,2", "3,2", false, 8)'), 3);
s.run('appData.map.grid["3,2"].level = 1');
assert.equal(s.evalCtx('getMovementCost(gun, "2,2", "3,2", false, 8)'), 8);
s.run('appData.map.grid["3,2"].level = 0; gun.fighters[2].hp = 0');
assert.equal(s.evalCtx('getMovementCost(gun, "2,2", "3,2", false, 8)'), Infinity);

// Exercise the real redraw entry point. A later hex or relief pass must never
// paint over the sector; origins must match the actual multi-unit icon layout.
const draw = createSandbox(freshAppData());
for (const name of ['redrawMap', 'drawTacticalVehicleSectorOverlay']) draw.run(sliceFunction(HTML, name));
draw.run(`
  var events = [], TACTICAL_MAP_SIZE = 2, currentSquadIndex = -1;
  var tacticalVisibleHexes;
  var ctx = new Proxy({}, {get:() => () => {}, set:() => true});
  document.getElementById('gameMap').getContext = () => ctx;
  function canvasBackingScale() { return 1; }
  function buildTacticalVisibleHexes() { return null; }
  function buildReliefOverlay() { events.push({kind:'relief'}); return null; }
  function drawHex() { events.push({kind:'hex'}); }
  function drawTacticalVehicleSectorLines(ctx,x,y,size,key,squad) { events.push({kind:'sector',x,y,key,squad}); }
  appData.squads = [{name:'Landsverk',armor:{front:20}}, {name:'CL/39',armor:{front:40}}];
  appData.map = {mode:'view',baseHexSize:40,zoomLevel:1,selectedMoveSquadIdx:1,
    grid:{'0,0':{squadIds:[0,1]}},enemySquads:[]};
  redrawMap();
`);
assert.equal(draw.evalCtx('events.filter(e => e.kind === "sector").length'), 1);
assert.equal(draw.evalCtx('events.findIndex(e => e.kind === "sector") > events.map(e => e.kind).lastIndexOf("hex")'), true, 'all hexes before sectors');
assert.equal(draw.evalCtx('events.findIndex(e => e.kind === "sector") > events.findIndex(e => e.kind === "relief")'), true, 'relief before sectors');
assert.equal(draw.evalCtx(`(() => {
  const center = appData.map.centers.find(c => c.key === '0,0');
  const layout = tacticalCellIconLayout(appData.map.grid['0,0'],center.x,center.y,40,'0,0');
  const sector = events.find(e => e.kind === 'sector');
  return sector.squad === appData.squads[1] && sector.x === layout.playerPositions[1].x && sector.y === layout.playerPositions[1].y;
})()`), true, 'sector anchored to selected icon, including stacked units');
draw.run('events = []; appData.map.selectedMoveSquadIdx = null; currentSquadIndex = 0; redrawMap();');
assert.equal(draw.evalCtx('events.find(e => e.kind === "sector").squad === appData.squads[0]'), true, 'panel selection also shows sector');
assert.doesNotMatch(sliceFunction(HTML, 'drawHex'), /drawTacticalVehicleSectorLines\(/, 'no duplicate per-hex sector painting');
console.log('PASS: Landsverk/CL39 mobility, towed-gun rules, and post-map sector overlay.');
