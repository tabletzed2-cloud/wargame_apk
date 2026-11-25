const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const start = src.indexOf('function installGlobalMenuButton()');
const end = src.indexOf('\nfunction ', start + 10);
const fn = src.slice(start, end);
for (const token of ["btn.textContent = '🏠'", "btn.setAttribute('aria-label'", 'width:36px; height:36px', 'top:8px; left:8px', 'opacity:0.48']) {
  if (!fn.includes(token)) throw new Error(`compact global menu button missing ${token}`);
}
console.log('v13.113 compact global menu button: PASS');
