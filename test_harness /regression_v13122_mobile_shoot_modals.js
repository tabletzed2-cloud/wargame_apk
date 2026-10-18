const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
for (const [label, startMarker, endMarker] of [
  ['PTO result', 'function showAtShootResultModal', 'function showShootResultModal'],
  ['fire type choice', 'function showWeaponChoiceDialog', 'function executeOpShootFromDialog']
]) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  const chunk = src.slice(start, end < 0 ? src.length : end);
  for (const token of ['width:min(', 'min-width:0', 'max-height:calc(100dvh - 24px)', 'overflow-y:auto', 'aria-modal="true"']) {
    if (!chunk.includes(token)) throw new Error(`${label} modal missing ${token}`);
  }
}
console.log('v13.122 mobile tactical/operational shoot modals: PASS');
