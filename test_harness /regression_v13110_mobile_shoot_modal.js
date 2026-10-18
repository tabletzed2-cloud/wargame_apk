const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const start = src.indexOf('function showShootResultModal(result)');
const end = src.indexOf('\nfunction ', start + 10);
const fn = src.slice(start, end < 0 ? src.length : end);
for (const token of ['width:min(600px,calc(100vw - 24px))', 'min-width:0', 'max-height:calc(100dvh - 24px)', 'overflow-y:auto', 'position:sticky; top:0', "this.closest('.shoot-result-modal').remove()", 'aria-modal="true"']) {
  if (!fn.includes(token)) throw new Error(`responsive/cancellable shoot result modal missing: ${token}`);
}
console.log('v13.110 mobile shoot result modal sizing/close: PASS');
