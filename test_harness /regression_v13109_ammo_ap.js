const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
function body(name, signature = `${name}()`) {
  const start = src.indexOf(`function ${signature}`);
  if (start < 0) throw new Error(`missing ${signature}`);
  const next = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, next < 0 ? src.length : next);
}
for (const [name, crew, ammoCheck] of [
  ['attackSmallArms', 'Патроны закончились — стрелять нельзя, ОД не потрачены', 'ammoSmall'],
  ['sniperShot', 'Нет патронов — снайперский выстрел невозможен', 'ammoSmall'],
  ['attackAmpulometAtVehicle', 'ампуломёт — ОД не потрачены', 'ammoOrdnance'],
  ['attackMolotovCrew', 'бутылкомёта — ОД не потрачены', 'ammoOrdnance']
]) {
  const text = body(name);
  const check = text.indexOf(ammoCheck);
  const ap = text.indexOf('spendAP(');
  if (check < 0 || ap < 0 || check > ap) throw new Error(`${name}: ammo validation must precede AP expenditure`);
  if (!text.includes(ammoCheck)) throw new Error(`${name}: expected no-ammo message missing`);
}
const dot = body('fireDOTMG', 'fireDOTMG(ciIndex)');
const dotAmmoCheck = dot.indexOf('патроны закончились, ОД не потрачены');
const dotApSpend = dot.indexOf('spendAP(');
if (dotAmmoCheck < 0 || dotApSpend < 0 || dotAmmoCheck > dotApSpend) throw new Error('DOT MG must check ammo before spending AP');
if (!src.includes('Выбранная цель связана рукопашной; цель переключена на')) throw new Error('melee target alternative routing missing');
console.log('v13.109 ammo-before-AP/melee target routing: PASS');
