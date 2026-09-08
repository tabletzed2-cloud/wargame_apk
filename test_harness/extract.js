// ⚡ dev-инструмент: извлекает функции из index.html для тестов в node
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function sliceFunction(html, name) {
    const re = new RegExp('^[ \\t]*function ' + name + '[ \\t]*\\(', 'm');
    const m = re.exec(html);
    if (!m) throw new Error('function not found: ' + name);
    const braceStart = html.indexOf('{', m.index);
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

module.exports = { HTML, sliceFunction, ROOT };
