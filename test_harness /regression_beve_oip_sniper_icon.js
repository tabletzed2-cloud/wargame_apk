'use strict';
// OIP sniper icon must be visible for BeVe fighters, including saves with stale weapon metadata.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFunction, HTML } = require('./extract');
const root = path.join(__dirname, '..');
const iconPath = path.join(root, 'images/BeVe/OIP.png');
const icon = fs.readFileSync(iconPath);
assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'OIP illustration is a valid PNG');
assert.match(fs.readFileSync(path.join(root, 'js/weapons.js'), 'utf8'),
  /"name": "Geweer OIP M\.38"[^\n]*"sniper": true[^\n]*"icon": "images\/BeVe\/OIP\.png"/,
  'the BeVe sniper weapon points to the scoped OIP illustration');
assert.match(fs.readFileSync(path.join(root, 'js/templates.js'), 'utf8'),
  /Снайперское звено OIP №1[^\n]*"weapon":"Geweer OIP M\.38"/,
  'the BeVe sniper template assigns the OIP weapon to its sniper');
assert.match(HTML, /getFighterWeaponIcon\(currentSquad, f\)/,
  'the fighter card uses the weapon-image helper');

const context = {
  appData: { factions: { BeVe: { weapons: [{ name: 'Geweer OIP M.38' }] } } },
  getFactionWeapons: faction => context.appData.factions[faction].weapons
};
vm.createContext(context);
vm.runInContext(sliceFunction(HTML, 'getFighterWeaponIcon'), context);
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext(
  "getFighterWeaponIcon({faction:'BeVe'}, {weapon:'Geweer OIP M.38'})", context))),
  { src: 'images/BeVe/OIP.png', height: '56px' }, 'legacy saves without weapon icon metadata still show the OIP scope');
assert.equal(vm.runInContext(
  "getFighterWeaponIcon({faction:'BeVe'}, {weapon:'Винтовка Geweer M95'})", context), null,
  'regular BeVe rifles are not mislabeled as scoped OIP');
console.log('PASS: BeVe sniper fighter cards display the attached scoped Geweer OIP M.38 image.');
