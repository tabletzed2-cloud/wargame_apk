const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'hexmaps.js'), 'utf8');
function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  const next = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, next < 0 ? src.length : next);
}
const names = ['isPlatoonHQBattleSquad', 'supplyPointStateKey', 'supplyPointOriginStateKey', 'syncSupplyPointsOnGrid'];
const code = "const SUPPLY_POINT_MARKER='ammoPoint';\n" + names.map(extract).join('\n');
const context = { log() {} };
vm.createContext(context);
vm.runInContext(code, context);
const map = { grid: { '2,3': { squadIds: [0], markers: [] } }, autoSupplyKeysPlayer: ['2,3'], supplyPointOriginsPlayer: { 0: '2,3' } };
const destroyedHQ = { name: 'Штаб взвода пехоты', isDestroyed: true, fighters: [{ hp: 0 }] };
const result = context.syncSupplyPointsOnGrid(map, [destroyedHQ], 'squadIds', 'player');
if (result[0] !== '2,3' || !map.grid['2,3'].markers.includes('ammoPoint')) throw new Error('supply point should persist at origin after HQ destruction');
console.log('v13.118 platoon supply point survives HQ destruction: PASS');
