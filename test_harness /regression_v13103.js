const assert = require('node:assert/strict');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceConst, sliceFunction, HTML } = require('./extract');
const getFunction = sliceFunction;

const s = createSandbox(freshAppData());
s.run(sliceConst(HTML, 'VEHICLE_AIM_AP_COST'));
s.run(sliceFunction(HTML, 'tacticalVehicleMovementAccuracyPenalty'));
assert.equal(s.evalCtx('VEHICLE_AIM_AP_COST'), 2, '1 OD equals two half-OD action points');
assert.equal(s.evalCtx('tacticalVehicleMovementAccuracyPenalty({ armor: {}, movedThisTurn: true })'), -1);
assert.equal(s.evalCtx('tacticalVehicleMovementAccuracyPenalty({ armor: {}, movedThisTurn: false })'), 0);
assert.equal(s.evalCtx('tacticalVehicleMovementAccuracyPenalty({ movedThisTurn: true })'), 0);
assert.match(getFunction(HTML, 'vehicleAcquireTarget'), /spendAP\(currentSquadIndex, VEHICLE_AIM_AP_COST\)/);
assert.match(getFunction(HTML, 'attackSmallArms'), /tacticalVehicleMovementAccuracyPenalty\(currentSquad\)/);
assert.match(getFunction(HTML, 'attackOrdnance'), /tacticalVehicleMovementAccuracyPenalty\(currentSquad\)/);
assert.match(HTML, /Навестись на выбранную цель \(\+1 меткость, 1 ОД\)/);
assert.match(HTML, /Наведение на выбранную цель стоит 1 ОД/);
console.log('v13.103 armor aim and movement accuracy: PASS');
