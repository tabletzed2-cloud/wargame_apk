const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
if (!src.includes('const tacticalVehicleSelected = appData.map.selectedMoveSquadIdx === squadId ||')) throw new Error('vehicle sectors must follow selected tactical squad');
if (!src.includes('if (tacticalVehicleSelected && typeof drawTacticalVehicleSectorLines === \'function\')')) throw new Error('vehicle sectors draw condition missing');
console.log('v13.115 armored vehicle sectors follow tactical squad selection: PASS');
