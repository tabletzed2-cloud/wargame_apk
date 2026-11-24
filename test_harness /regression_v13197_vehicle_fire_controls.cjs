'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const templates = fs.readFileSync(path.join(root, 'js/templates.js'), 'utf8');
const { createSandbox, freshAppData, sliceFunction } = require('./sandbox');
const { HTML } = require('./extract');

// Both reported vehicle classes remain traversable on common terrain when not immobilized.
{
  const sandbox = createSandbox(freshAppData());
  sandbox.run(sliceFunction(HTML, 'getMovementCost'));
  sandbox.run(`
    appData.map = { grid: {'0,0': {type:'grass', level:0}, '1,0': {type:'grass', level:0}} };
    function tacticalIsSlowWeaponCrew(){ return false; }
    function getScopedActiveCardsForSquad(){ return []; }
    function tacticalFireFieldAt(){ return false; }
    function vehicleFamilyFor(squad){ return /Landsverk/i.test(String(squad && squad.name || '')) ? {id:'landsverk'} : null; }
  `);
  for (const vehicle of [
    {name:'Бронеавтомобиль Landsverk BeVe', armor:{front:20}},
    {name:'Легкий танк CL/39 A.I.R.F.', armor:{front:40}}
  ]) {
    assert.equal(sandbox.evalCtx(`getMovementCost(${JSON.stringify(vehicle)}, '0,0', '1,0', false, 4)`), 1);
  }
}

// Armored units render a dedicated firing action for every mounted MG/gun;
// dead crews, empty magazines, and spent weapon limits disable their action.
assert.match(html, /prepareTacticalVehicleWeaponAndFire\('\$\{key\}','\$\{cw\.type\}'\)/);
assert.match(html, /const disabled = !usable \|\| !ammo \|\| !shotsLeft/);
assert.match(html, /\['mg', 'at_gun', 'tank_gun', 'mortar'\]/);
assert.match(html, /if \(!currentSquad\.armor && smallArmsBlockReason\)/);
assert.match(html, /if \(!currentSquad\.armor && currentSquad\.crewInstances/);
assert.doesNotMatch(html, /Огонь артиллерией ·/);
assert.match(html, /function vehicleWeaponSectorSpec\(squad, weaponName, weaponType, crewInstance\)/);
assert.match(html, /instance\.sectorRole \|\| instance\.mountRole/);
assert.match(html, /function migrateVehicleMountedWeaponNames\(data\)/);
assert.match(html, /'Курсовой пулемёт SAU Brugge': \{ name: 'Пулемёт Schwarzlose танковый', sectorRole: 'bow' \}/);
assert.match(html, /'Курсовой пулемет Hotchkiss Mle 1914': \{ name: 'Пулемёт Hotchkiss танковый', sectorRole: 'bow' \}/);
assert.match(html, /function showOnlyAppScreen\(screenId\)/);
assert.match(html, /else if \(resumeScreen === 'mainMenu'\)[\s\S]{0,240}showOnlyAppScreen\('mainMenu'\)/);
assert.doesNotMatch(html, /if \(isReload && campaignCanResume\(\)\) returnToCampaignFromMenu\(\)/);

// The selected crew key constrains each vehicle attack path to one gun/MG.
assert.match(html, /isVehicle && appData\.map && appData\.map\.selectedVehicleFireWeaponKey && ci\.uniqueKey !== appData\.map\.selectedVehicleFireWeaponKey/);
assert.match(html, /currentSquad\.armor && appData\.map && appData\.map\.selectedVehicleFireWeaponKey && ci\.uniqueKey !== appData\.map\.selectedVehicleFireWeaponKey/);
assert.match(html, /function prepareTacticalVehicleWeaponAndFire\(uniqueKey, weaponType\)/);

// Every requested vehicle template has a mechanic-driver, and coaxial guns
// share the physical main-gun crew rather than consuming a second crew.
for (const vehicleName of [/Бронеавтомобиль Landsverk 183 №1/, /Бронеавтомобиль Landsverk 183 №2/, /Бронеавтомобиль Landsverk 183 №3/, /Легкий танк CL\/39 №1/, /Легкий танк CL\/39 №2/, /Легкий танк CL\/39 №3/, /Легкий танк CL\/39 №4/, /Легкий танк CL\/39 №5/]) {
  const i = templates.search(vehicleName);
  assert.ok(i >= 0, `missing template ${vehicleName}`);
  const unit = templates.slice(i, templates.indexOf('"armor"', i));
  assert.match(unit, /Механик-водитель/, `driver missing for ${vehicleName}`);
}
assert.match(templates, /"weaponName": "Пулемёт Hotchkiss танковый", "sectorRole": "coax", "fighterIndices": \[2, 3\]/);
assert.match(templates, /"weaponName": "Пулемёт Schwarzlose танковый", "sectorRole": "coax", "fighterIndices": \[2, 3, 4\]/);
assert.match(templates, /"weaponName": "Пулемёт Schwarzlose танковый", "sectorRole": "coax", "fighterIndices": \[3, 4\]/);

// Vehicle ammunition appears only once in its tactical popup, and mounted
// vehicles cannot use the adjacent-infantry crew reinforcement action.
assert.match(html, /\$\{\(squad\.armor \|\| squad\.isVehicle\) \? '' :/);
assert.match(html, /if \(!squad \|\| squad\.armor \|\| !tacticalIsPtoCrewSquad\(squad\)/);

console.log('PASS: per-weapon vehicle fire controls, crew gating, coaxial crew sharing, ammo de-duplication, and no armored-crew reinforcement.');
