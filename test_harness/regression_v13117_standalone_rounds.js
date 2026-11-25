const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
function functionSource(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  const next = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, next < 0 ? src.length : next);
}
const context = { appData: { _standaloneTacticalPhasesCompleted: 0 }, inStandaloneBattle: true, getTacticalBattleRecord: () => null };
vm.createContext(context);
vm.runInContext('const TACTICAL_PHASES_PER_ROUND=2; const TACTICAL_ROUNDS_PER_OPERATIONAL_TURN=5;\n' + functionSource('getTacticalRoundProgress') + '\n' + functionSource('registerCompletedTacticalPhase'), context);
if (vm.runInContext('getTacticalRoundProgress().round', context) !== 1) throw new Error('standalone initial round should be 1');
vm.runInContext('registerCompletedTacticalPhase(null)', context);
if (vm.runInContext('getTacticalRoundProgress().round', context) !== 1) throw new Error('round must not increment after only one side phase');
vm.runInContext('registerCompletedTacticalPhase(null)', context);
if (vm.runInContext('getTacticalRoundProgress().round', context) !== 2) throw new Error('standalone round should increment after both phases');
console.log('v13.117 standalone tactical round progression: PASS');
