'use strict';
// Tactical AI adapter must execute the shared attack function with a temporary actor/target context.
const assert = require('node:assert/strict');
const { sliceFunction, HTML } = require('./extract');
const vm = require('node:vm');

const player = { name: 'Игрок', fighters: [{ hp: 2 }] };
const enemy = { name: 'ИИ', fighters: [{ hp: 2 }], tacticalAP: 4 };
const inputs = Object.fromEntries(['targetDistance', 'modalDistance', 'coverTarget', 'modalCover'].map(id => [id, { value: 'old-' + id }]));
const context = {
  appData: { squads: [player], campaign: { online: false }, map: { grid: {}, activeSide: 'enemy', enemySquads: [enemy], attackTargetEnemyIdx: 7, tacticalAreaFireMode: true, selectedVehicleFireWeaponKey: 'player-gun' } },
  document: { getElementById: id => inputs[id] || null },
  getTacticalActiveSide: () => context.appData.map.activeSide,
  mapActionDefById: id => ({ id }),
  mapActionEvalTarget: (_def, shooter, target, _extra, side) => {
    context.lastEval = { shooter, target, side };
    return context.allowed ? { ok: true, dist: 3, cover: { mod: 2 } } : { ok: false, reason: 'нет линии видимости' };
  },
  mapRunAttack: (id, extra) => {
    context.ran = { id, extra, actor: vm.runInContext('currentSquad', context), idx: vm.runInContext('currentSquadIndex', context), target: context.appData.map.attackTargetEnemyIdx };
    context.appData.map.enemySquads[0].tacticalAP -= 1;
    context.appData.map.lastAttackOutcome = { kind: id, target: 'Игрок', hits: 1 };
  },
  tacticalActionAllowed: (_squad, _action, _quiet, options) => !!options.ai && options.side === 'enemy',
  getTacticalSideAP: squad => squad.tacticalAP,
  updateUI: () => {},
  saveData: () => {},
  console,
  allowed: true
};
vm.createContext(context);
vm.runInContext('let currentSquad = appData.squads[0]; let currentSquadIndex = 0; let morale = 55; let moraleSourceIdx = 0; var __tacticalAIActionContext = null;', context);
vm.runInContext(sliceFunction(HTML, 'runTacticalAIAction'), context);

const result = vm.runInContext("runTacticalAIAction(appData.map.enemySquads[0], 0, 'smallArms', {mode:'test'})", context);
assert.equal(result.ok, true);
assert.equal(result.spentAP, 1);
assert.equal(result.outcome.target, 'Игрок');
assert.deepEqual(context.lastEval, { shooter: 0, target: 0, side: 'enemy' });
assert.equal(context.ran.actor.name, 'ИИ');
assert.equal(context.ran.target, 0);
assert.equal(vm.runInContext('currentSquad.name', context), 'Игрок', 'previous selected squad is restored');
assert.equal(vm.runInContext('currentSquadIndex', context), 0);
assert.equal(context.appData.map.attackTargetEnemyIdx, 7, 'previous UI target is restored');
assert.equal(context.appData.map.tacticalAreaFireMode, true, 'player area-fire preference is restored');
assert.equal(context.appData.map.selectedVehicleFireWeaponKey, 'player-gun', 'player vehicle selection is restored');
assert.equal(inputs.targetDistance.value, 'old-targetDistance');
assert.equal(vm.runInContext('__tacticalAIActionContext', context), null);

context.appData.campaign.online = true;
assert.equal(vm.runInContext("runTacticalAIAction(appData.map.enemySquads[0], 0, 'smallArms').ok", context), false, 'online execution is refused');
context.appData.campaign.online = false;
context.allowed = false;
assert.equal(vm.runInContext("runTacticalAIAction(appData.map.enemySquads[0], 0, 'smallArms').reason", context), 'нет линии видимости');

console.log('PASS: AI dispatch reuses the shared attack entry point, restores UI context, and refuses online/illegal actions.');
