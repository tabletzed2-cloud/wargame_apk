// ⚡ v13.059: syntax check for the current app release.
// ⚡ dev-инструмент: синтаксическая проверка всех inline-скриптов index.html
//    (node test_harness/checkhtml.js) — без запуска кода
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, blocks = 0, bad = 0;
while ((m = re.exec(html))) {
    blocks++;
    const code = m[1];
    const line = html.slice(0, m.index).split('\n').length;
    try { new vm.Script(code, { filename: 'index.html:block' + blocks }); }
    catch (e) {
        bad++;
        const em = /:(\d+)/.exec(e.stack || '');
        console.log('✗ блок ' + blocks + ' (начало на строке ' + line + '): ' + e.message + (em ? ' @ строка блока ' + em[1] + ' (файл ~' + (line + Number(em[1]) - 1) + ')' : ''));
    }
}
console.log('blocks ' + blocks + ' bad ' + bad);
if (bad) process.exitCode = 1;
