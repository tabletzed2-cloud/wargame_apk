'use strict';
// Regressions for the latest tactical vehicle playtest feedback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, freshAppData, sliceFunction } = require('./sandbox');
const { HTML } = require('./extract');
const root = path.join(__dirname, '..');

// Armored cars use normal vehicle terrain rules again; unarmored trucks/cars
// outpace infantry on roads and the traversable common terrain.
{
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'getMovementCost'));
  s.run(`
    appData.map = { grid: {
      '0,0': {type:'grass', level:0}, '1,0': {type:'bushes', level:0},
      '2,0': {type:'road', level:0}, '3,0': {type:'forest', level:0}
    }};
    function tacticalIsSlowWeaponCrew(){ return false; }
    function getScopedActiveCardsForSquad(){ return []; }
    function tacticalFireFieldAt(){ return false; }
    function vehicleFamilyFor(squad){ return /Landsverk/i.test(String(squad && squad.name || '')) ? {id:'landsverk'} : null; }
    var currentTurn = 1;
  `);
  const cost = (squad, key) => s.evalCtx(`getMovementCost(${JSON.stringify(squad)}, '0,0', '${key}', false, 4)`);
  const armoredCar = { name: 'Бронеавтомобиль Landsverk 183', armor: {front:20} };
  assert.equal(cost(armoredCar, '1,0'), 1, 'armored cars can enter bushes using standard vehicle movement');
  assert.equal(cost({name:'Бронеавтомобиль Landsverk 183'}, '1,0'), 1, 'a missing armor field does not strand a named armored car');
  const truck = { name: 'Грузовик DAF Trado II (Бельгийцы)' };
  const infantry = { name: 'Пехотное отделение' };
  for (const terrain of ['2,0', '0,0', '1,0', '3,0']) {
    assert.ok(cost(truck, terrain) < cost(infantry, terrain), `truck is faster than infantry on ${terrain}`);
  }
}

// Correct BeVe small-arms loadout and user-supplied numbered MG team icons.
{
  const templates = fs.readFileSync(path.join(root, 'js/templates.js'), 'utf8');
  assert.doesNotMatch(templates, /Mauser 1889/, 'BeVe motorcycle scouts/messengers do not carry the nonstandard Mauser');
  assert.match(templates, /Мотоциклист-разведчик[\s\S]*?Разведчик", "weapon": "Винтовка Geweer M95/);
  assert.match(templates, /Мотоциклист-посыльный[\s\S]*?Посыльный", "weapon": "Винтовка Geweer M95/);
  assert.match(templates, /Водитель DAF Trado II", "weapon": "Винтовка Geweer M95"/);
  assert.match(templates, /Водитель DAF MC-V", "weapon": "Винтовка Geweer M95"/);
  for (let n = 1; n <= 3; n++) {
    const image = fs.readFileSync(path.join(root, `images/BeVe/mg-team-${n}.png`));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `class ${n} icon is a PNG`);
    assert.match(templates, new RegExp(`Пулеметный расчёт №${n}[^\\n]*mg-team-${n}\\.png`));
  }
}

// MG controls are direct sector selectors (not a follow-up target/fire-button
// cascade), and selected-sector opponents are called out with a map outline.
{
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /Курсовой пулемёт/);
  assert.match(source, /Спаренный пулемёт/);
  assert.match(source, /Кормовой пулемёт/);
  assert.match(source, /reach = size \* Math\.sqrt\(27\)/);
  assert.doesNotMatch(source, /Кто попадает в сектор|Цели в секторе/);
  assert.doesNotMatch(source.slice(source.indexOf('function renderFieldVehiclePanel'), source.indexOf('function renderActiveCardButtons')), /setTacticalVehicleFireWeapon/);
  assert.match(source, /tacticalVehicleTargetIsInSelectedSector\(enemy\)/);
  assert.match(source, /distance > 3\) return false/);
  assert.doesNotMatch(source, /openTargetModal\('smallArms'\).*Выбрать цель и стрелять/s,
    'choosing a sector does not expose a separate follow-up fire button');
}

console.log('PASS: tactical vehicle playtest movement, MG sectors, BeVe rifles, and icons.');
