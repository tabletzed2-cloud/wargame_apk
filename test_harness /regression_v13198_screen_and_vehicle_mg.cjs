'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, freshAppData, sliceFunction } = require('./sandbox');
const { sliceConst } = require('./extract');
const { HTML, ROOT } = require('./extract');

const sandbox = createSandbox(freshAppData());
sandbox.run(sliceFunction(HTML, 'showOnlyAppScreen'));
for (const screenId of ['mainMenu', 'battleApp', 'campaignApp', 'rulesPage', 'historyPage']) {
  sandbox.run(`showOnlyAppScreen(${JSON.stringify(screenId)})`);
  for (const id of ['mainMenu', 'battleApp', 'campaignApp', 'rulesPage', 'historyPage']) {
    assert.equal(sandbox.evalCtx(`document.getElementById(${JSON.stringify(id)}).style.display`), id === screenId ? 'block' : 'none',
      `${screenId} should be the only visible root`);
  }
}
assert.match(HTML, /else if \(resumeScreen === 'mainMenu'\)[\s\S]{0,240}showOnlyAppScreen\('mainMenu'\)/);
assert.doesNotMatch(HTML, /if \(isReload && campaignCanResume\(\)\) returnToCampaignFromMenu\(\)/);

// Existing save names become the new model-based names, but each crew instance
// retains a distinct sector and the selected crew assignments are untouched.
const oldSave = freshAppData();
oldSave.factions = {
  BeVe: { crewWeapons: [{ name: 'Курсовой пулемёт SAU Brugge' }] },
  'A.I.R.F.': { crewWeapons: [{ name: 'Курсовой пулемет Hotchkiss Mle 1914' }] }
};
oldSave.squads = [
  { faction: 'BeVe', name: 'SAU Brugge', crewInstances: [
    { weaponName: 'Курсовой пулемёт SAU Brugge', fighterIndices: [1], active: true },
    { weaponName: 'Спаренный пулемёт SAU Brugge', fighterIndices: [2, 3], active: true },
    { weaponName: 'Кормовой пулемёт SAU Brugge', fighterIndices: [4], active: true }
  ] },
  { faction: 'A.I.R.F.', name: 'БТР Llanero', crewInstances: [
    { weaponName: 'Курсовой пулемет Hotchkiss Mle 1914', fighterIndices: [0], active: true }
  ] }
];
const oldSaveRef = oldSave;
sandbox.sandbox.testMigrationData = oldSaveRef;
sandbox.run(sliceConst(HTML, 'VEHICLE_MG_NAME_MIGRATIONS'));
sandbox.run(sliceFunction(HTML, 'migrateVehicleMountedWeaponNames'));
assert.equal(sandbox.evalCtx('migrateVehicleMountedWeaponNames(testMigrationData)'), true);
const migrated = JSON.parse(sandbox.evalCtx('JSON.stringify(testMigrationData)'));
assert.deepEqual(migrated.squads[0].crewInstances.map(ci => [ci.weaponName, ci.sectorRole, ci.fighterIndices]), [
  ['Пулемёт Schwarzlose танковый', 'bow', [1]],
  ['Пулемёт Schwarzlose танковый', 'coax', [2, 3]],
  ['Пулемёт Schwarzlose танковый', 'rear', [4]]
]);
assert.deepEqual(migrated.squads[1].crewInstances.map(ci => [ci.weaponName, ci.sectorRole, ci.fighterIndices]), [
  ['Пулемёт Hotchkiss танковый', 'bow', [0]]
]);
assert.ok(migrated.factions.BeVe.crewWeapons.some(w => w.name === 'Пулемёт Schwarzlose танковый'));
assert.ok(migrated.factions['A.I.R.F.'].crewWeapons.some(w => w.name === 'Пулемёт Hotchkiss танковый'));

const templates = fs.readFileSync(path.join(ROOT, 'js/templates.js'), 'utf8');
assert.match(templates, /"weaponName": "Пулемёт Schwarzlose танковый", "sectorRole": "rear"/);
assert.match(templates, /"weaponName"\s*:\s*"Пулемёт Hotchkiss танковый","sectorRole":"bow"/);
console.log('PASS: top-level screens are exclusive; refresh remains at menu; old saves migrate names without losing sectors or crews.');
