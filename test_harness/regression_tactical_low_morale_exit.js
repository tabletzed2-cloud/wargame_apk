'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { sliceFunction } = require('./extract');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const routing = sliceFunction(index, 'processTacticalRouts');
const surrender = sliceFunction(index, 'tacticalSurrenderUnit');

// A morale rout may rally at its HQ, but reaching a map edge must permanently
// remove the squad from the battle rather than restore morale on the edge.
assert.match(routing, /destinationInfo\.type === 'headquarters'[\s\S]*?tacticalRoutRallyAtHQ\(s, side, idx, destinationInfo\.type\)[\s\S]*?\} else \{[\s\S]*?tacticalRetreatUnit\(s, side, idx, s\.retreatReason === 'command' \? 'command' : 'morale'\)/);
assert.doesNotMatch(routing, /destinationInfo\.type === 'headquarters'\s*\|\|\s*destinationInfo\.type === 'edge'/);

function runSurrender(morale) {
  const squad = { name: 'Routed section', currentMorale:morale,ammoSmall:0,ammoOrdnance:0,grenades:0,fighters: [{ hp: 1 }], isRouting: true };
  const ctx = {
    tacticalMoralePercent: () => morale,
    tacticalMoraleCurrent:s=>s.currentMorale,tacticalSquadsDistance:()=>3,
    tacticalSquadHasStubbornCard: () => false,
    tacticalHasLiveHeadquartersFor: () => true,
    tacticalIsHeadquartersSquad: () => false,
    tacticalClearMeleeEngagement: () => {},
    tacticalPlaceSurrenderMarker: () => {},
    tacticalRecordNearbyMoraleLoss: () => {},
    log: () => {}, saveData: () => {}, updateTacticalTurnUI: () => {}, updateUI: () => {}, redrawMap: () => {},
    recordEnemyPrisoners: () => {}, appData: { squads: [], map: { grid: {}, enemySquads: [] }, campaign: {} },
    currentTurn: 1
  };
  vm.createContext(ctx);
  ctx.squad = squad;
  ctx.appData.squads=[squad];ctx.appData.map.enemySquads=[{fighters:[{hp:3}]}];
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js','playtest_rules.js'),'utf8'),ctx);
  vm.runInContext(sliceFunction(index,'tacticalSideSquads'),ctx);
  vm.runInContext(surrender, ctx);
  const result = vm.runInContext("tacticalSurrenderUnit(squad, 'player', 0, 'retreat_blocked')", ctx);
  return { result, squad };
}

const tooHigh = runSurrender(10.01);
assert.equal(tooHigh.result, false, 'surrender is forbidden above 10% morale');
assert.equal(tooHigh.squad.isSurrendered, undefined);
assert.equal(tooHigh.squad.isSurrendered, undefined, 'blocked retreat alone never causes surrender');

assert.equal(runSurrender(10).result,false,'v13.203: 10% is not zero morale');
const threshold = runSurrender(0);
assert.equal(threshold.result, true, 'zero morale, zero ammunition and enemy within three hexes');
assert.equal(threshold.squad.isSurrendered, true);
assert.equal(threshold.squad.status, 'surrendered');

console.log('tactical low-morale edge exit and surrender threshold: PASS');
