const assert = require('node:assert/strict');
const { HTML, sliceFunction } = require('./extract');
const overlay = sliceFunction(HTML, 'drawTacticalVehicleSectorOverlay');
assert.match(overlay, /map\.selectedMoveSquadIdx/, 'vehicle sectors follow map selection');
assert.match(overlay, /currentSquadIndex/, 'vehicle sectors follow panel selection');
assert.match(overlay, /selected\.has\(id\)/, 'only selected squads draw sectors');
assert.match(overlay, /drawTacticalVehicleSectorLines\(/, 'sector rendering is called in the overlay');
console.log('v13.115 armored vehicle sectors follow tactical squad selection: PASS');
