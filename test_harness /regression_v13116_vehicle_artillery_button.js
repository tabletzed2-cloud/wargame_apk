const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
if (!src.includes("weapon.type === 'at_gun' || weapon.type === 'tank_gun'")) throw new Error('vehicle artillery weapon detection missing');
if (!src.includes('💥 Огонь артиллерией · ${escapeCardHtml(vehicleArtillery.name)}')) throw new Error('vehicle artillery button label missing');
if (!src.includes("onclick=\"openTargetModal('ordnance')\" ${noVehicleShells ? 'disabled title=\"Нет снарядов — ОД не будут потрачены\"' : ''}")) throw new Error('vehicle artillery button must invoke ordnance fire and explain empty ammo');
console.log('v13.116 armored vehicle artillery button: PASS');
