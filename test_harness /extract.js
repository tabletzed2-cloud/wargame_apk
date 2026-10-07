// ⚡ v13.061: helpers for current-release regression tests.
// ⚡ dev-инструмент: извлекает функции из index.html для тестов в node
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function sliceFunction(html, name) {
    const re = new RegExp('^[ \\t]*function ' + name + '[ \\t]*\\(', 'm');
    const m = re.exec(html);
    if (!m) throw new Error('function not found: ' + name);
    // ⚡ v13.069: ищем «{» именно после закрывающей «)» списка параметров —
    //    иначе параметр по умолчанию (`options = {}`) принимается за тело функции,
    //    и срез обрывается на сигнатуре (было при sliceFunction('createOrder')).
    let p = html.indexOf('(', m.index), paren = 0, quote = null, braceStart = -1;
    for (; p < html.length; p++) {
        const ch = html[p];
        if (quote) { if (ch === '\\') { p++; continue; } if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '(') paren++;
        else if (ch === ')') { paren--; if (paren === 0) { braceStart = html.indexOf('{', p); break; } }
    }
    if (braceStart < 0) throw new Error('function body not found: ' + name);
    let depth = 0, end = -1;
    for (let p = braceStart; p < html.length; p++) {
        if (html[p] === '{') depth++;
        else if (html[p] === '}') {
            depth--;
            if (depth === 0) { end = p; break; }
        }
    }
    if (end < 0) throw new Error('unbalanced braces: ' + name);
    return html.slice(m.index, end + 1);
}

// ⚡ v13.068: вырезать объявление константы (таблицы снабжения и т.п.) для тестов.
//    Поддерживает объекты/массивы/числа/строки — балансировка { } и [ ].
function sliceConst(html, name) {
    const re = new RegExp('^[ \\t]*const ' + name + '[ \\t]*=', 'm');
    const m = re.exec(html);
    if (!m) throw new Error('const not found: ' + name);
    const start = m.index;
    let p = html.indexOf('=', m.index) + 1;
    let depth = 0, quote = null, end = -1;
    for (; p < html.length; p++) {
        const ch = html[p];
        if (quote) { if (ch === '\\') { p++; continue; } if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { end = p; break; } }
        else if (ch === ';' && depth === 0) { end = p - 1; break; }
    }
    if (end < 0) throw new Error('unbalanced const: ' + name);
    return html.slice(start, end + 1) + ';';
}

module.exports = { HTML, sliceFunction, sliceConst, ROOT };
