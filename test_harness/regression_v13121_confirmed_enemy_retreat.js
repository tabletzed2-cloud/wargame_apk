const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
function extract(name) { const start = src.indexOf(`function ${name}(`); const next = src.indexOf('\nfunction ', start + 10); return src.slice(start, next < 0 ? src.length : next); }
const context = {
  appData: { campaign: { enemyOpUnits: [{ col: 1, row: 0, isDestroyed: false }], opUnits: [] } },
  getOpHexNeighbors: () => [{ col: 1, row: 0 }],
  opDirectionBetween: () => 'E',
  operationalHexHasActiveBattle: () => false,
  getOpMoveCost: () => 1,
  getOpHexDistance: () => 1
};
vm.createContext(context);
vm.runInContext(extract('findRetreatHex'), context);
const unit = { name: 'Пехота', col: 0, row: 0, ap: 2 };
const allowed = context.findRetreatHex(unit, 0, 0, 'E', true);
if (!allowed || allowed.col !== 1 || allowed.row !== 0) throw new Error('confirmed manual zone can be occupied enemy hex');
const denied = context.findRetreatHex(unit, 0, 0, 'E', false);
if (denied !== null) throw new Error('enemy hex must be excluded without manual confirmation');
if (!src.includes('Отступление туда может привести к немедленному новому бою и потерям')) throw new Error('explicit danger confirmation missing');
console.log('v13.121 confirmed occupied-enemy retreat zone: PASS');
