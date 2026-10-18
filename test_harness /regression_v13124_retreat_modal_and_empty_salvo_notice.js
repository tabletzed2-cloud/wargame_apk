const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const endStart = src.indexOf('function endOpShellCapture(');
const endEnd = src.indexOf('\nfunction ', endStart + 10);
const endFn = src.slice(endStart, endEnd);
if (!endFn.includes('!rows.length && !capture.salvoLaunched')) throw new Error('successful no-hit salvo must create persistent notice');
if (!endFn.includes("note: note")) throw new Error('shell notice must retain no-hit explanation');
const artillery = src.slice(src.indexOf('const ammoBeforeSalvo'), src.indexOf('const salvoMiAfter', src.indexOf('const ammoBeforeSalvo')));
if (!artillery.includes('shellCap.salvoLaunched')) throw new Error('artillery capture must distinguish fired salvos from refusals');
const modalStart = src.indexOf('function openRetreatZoneChoice()');
const modalEnd = src.indexOf('\nfunction retreatFromBattle(', modalStart);
const modal = src.slice(modalStart, modalEnd);
for (const token of ['width:min(420px,calc(100vw - 24px))', 'min-width:0', 'max-height:calc(100dvh - 24px)', 'overflow-y:auto', 'aria-modal', 'role', 'Отмена']) {
  if (!modal.includes(token)) throw new Error(`retreat zone dialog missing ${token}`);
}
console.log('v13.124 retreat dialog mobile layout / no-hit artillery notification: PASS');
