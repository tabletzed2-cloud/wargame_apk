// ⚡ v13.061: syntax check for the current app release.
// ⚡ dev-инструмент: синтаксическая проверка всех inline-скриптов index.html
//    (node test_harness/checkhtml.js) — без запуска кода
// ⚡ v13.185: добавлена проверка ДУБЛЕЙ определений функций. В v13.184 в одном
//    <script> жили две `tacticalSquadHexPosition`: вторая (короткая) молча
//    перекрывала первую и возвращала объект без isEnemy/idx, из-за чего
//    рукопашная строила выборку противников по undefined. Синтаксис при этом
//    оставался валидным, поэтому нужна отдельная проверка.
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

// ── дубли определений функций внутри одного script-блока ─────────────────────
function lineOf(offset) {
    return html.slice(0, offset).split('\n').length;
}
function findDuplicates(code, offset) {
    const counts = new Map();
    const fnRe = /(^|\n)[ \t]*function[ \t]+([A-Za-z0-9_$]+)[ \t]*\(/g;
    let hit;
    while ((hit = fnRe.exec(code))) {
        const name = hit[2];
        const abs = offset + hit.index + hit[1].length;
        if (!counts.has(name)) counts.set(name, []);
        counts.get(name).push({ name, offset: abs });
    }
    return Array.from(counts.values()).filter(list => list.length > 1);
}
re.lastIndex = 0;
let dupCount = 0;
while ((m = re.exec(html))) {
    const dupes = findDuplicates(m[1], m.index);
    dupes.forEach(list => {
        dupCount++;
        bad++;
        console.log('✗ дубль функции ' + list[0].name + ' в блоке (' + list.map(d => 'строка ' + lineOf(d.offset)).join(', ') + ')' +
            ' — действует последнее определение, предыдущее молча теряется');
    });
}

console.log('blocks ' + blocks + ' bad ' + bad + (dupCount ? ' (дублей: ' + dupCount + ')' : ''));
if (bad) process.exitCode = 1;
