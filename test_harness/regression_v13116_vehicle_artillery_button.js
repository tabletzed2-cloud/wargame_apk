const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
if (src.includes('Огонь артиллерией ·')) throw new Error('obsolete artillery button must be removed');
if (!src.includes("['mg', 'at_gun', 'tank_gun', 'mortar'].includes(cw.type)")) throw new Error('vehicle per-weapon buttons missing');
if (!src.includes("prepareTacticalVehicleWeaponAndFire('${key}','${cw.type}')")) throw new Error('weapon button must launch only the selected weapon');
if (!src.includes('const disabled = !usable || !ammo || !shotsLeft')) throw new Error('dead/empty/used weapon crew must be disabled');
console.log('v13.116 legacy armored vehicle artillery button replaced by per-weapon fire controls: PASS');
