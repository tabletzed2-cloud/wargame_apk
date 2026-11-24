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
  const squad = { name: 'Routed section', fighters: [{ hp: 1 }], isRouting: true };
  const ctx = {
    tacticalMoralePercent: () => morale,
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
  vm.runInContext(surrender, ctx);
  const result = vm.runInContext("tacticalSurrenderUnit(squad, 'player', 0, 'retreat_blocked')", ctx);
  return { result, squad };
}

const tooHigh = runSurrender(10.01);
assert.equal(tooHigh.result, false, 'surrender is forbidden above 10% morale');
assert.equal(tooHigh.squad.isSurrendered, undefined);
assert.equal(tooHigh.squad.isRouting, false, 'a non-surrendering blocked rout stops instead of entering an endless rout loop');

const threshold = runSurrender(10);
assert.equal(threshold.result, true, '10% morale is within the surrender threshold');
assert.equal(threshold.squad.isSurrendered, true);
assert.equal(threshold.squad.status, 'surrendered');

console.log('tactical low-morale edge exit and surrender threshold: PASS');
