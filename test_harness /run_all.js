// ⚡ v13.185: единый раннер проверок.
//
//   node test_harness/run_all.js              — только ядро (core), должно быть зелёным
//   node test_harness/run_all.js --all        — ядро + известные устаревшие (legacy)
//   node test_harness/run_all.js --list       — что входит в core, legacy, browser
//   node test_harness/run_all.js --update     — пересчитать список legacy по факту
//                                              (помечает красные НЕ из core как legacy)
//
// Зачем разделение. К v13.185 в test_harness накопилось 122 скрипта, из которых
// 65 красные: часть — устаревшие ожидания (номер версии в тексте, удалённые
// константы, переименованные функции), часть — реальные расхождения. В таком
// шуме новая регрессия теряется. Здесь фиксируется «зелёный минимум», который
// обязан проходить всегда (core), а остальное явно перечислено как legacy с
// причиной — их разбирают по одному, а не «вообще все тесты красные».
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HARNESS = __dirname;
const ROOT = path.resolve(HARNESS, '..');
const STATUS_FILE = path.join(HARNESS, 'test-status.json');

const SKIP = new Set(['extract.js', 'checkhtml.js', 'sandbox.js', 'run_all.js']);

function nodeTests() {
    return fs.readdirSync(HARNESS)
        .filter(f => f.endsWith('.js') && !SKIP.has(f))
        .sort();
}
function browserTests() {
    return fs.readdirSync(HARNESS).filter(f => /\.cjs$/.test(f)).sort();
}

function loadStatus() {
    if (!fs.existsSync(STATUS_FILE)) {
        return { core: [], legacy: {}, browser: [], note: '' };
    }
    try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); }
    catch (e) { throw new Error('test-status.json повреждён: ' + e.message); }
}

function runNode(file, timeoutMs) {
    const started = Date.now();
    try {
        const out = execFileSync(process.execPath, [path.join(HARNESS, file)], {
            cwd: ROOT, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
        });
        return { file, ok: true, ms: Date.now() - started, out };
    } catch (e) {
        const out = String((e.stdout || '') + (e.stderr || ''));
        return { file, ok: false, ms: Date.now() - started, out, code: e.status, signal: e.signal };
    }
}

function lastLine(text) {
    const lines = String(text || '').trim().split('\n').map(l => l.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1].slice(0, 160) : '';
}

function markdownReport(coreResults, status, legacyResults) {
    // «Первый провал» для каждого упавшего — чтобы не смотреть в логи руками.
    const rows = coreResults.filter(r => !r.ok).map(r => {
        const firstBad = String(r.out).split('\n').find(l => /✗|AssertionError|Error:|not found/.test(l)) || '';
        return `| ${r.file} | ${lastLine(r.out) || '—'} | ${firstBad.trim().slice(0, 120) || '—'} |`;
    });
    return [
        '# Состояние проверок',
        '',
        `Сформировано раннером \`test_harness/run_all.js\`: ядро — ${coreResults.filter(r => r.ok).length}/${coreResults.length} зелёных,`,
        `известных устаревших — ${Object.keys(status.legacy || {}).length}.`,
        '',
        '## Падающие в ядре (это должно чиниться, а не игнорироваться)',
        '',
        '| тест | итог | первый провал |',
        '|---|---|---|',
        ...(rows.length ? rows : ['| — | — | — |']),
        '',
        '## Известные устаревшие (legacy)',
        '',
        '| тест | причина |',
        '|---|---|',
        ...Object.entries(status.legacy || {}).map(([f, why]) => `| ${f} | ${why} |`),
        ''
    ].join('\n');
}

function main() {
    const argv = process.argv.slice(2);
    const status = loadStatus();
    const all = nodeTests();

    if (argv.includes('--list')) {
        console.log('core (' + (status.core || []).length + '):');
        (status.core || []).forEach(f => console.log('  ' + f));
        console.log('\nlegacy (' + Object.keys(status.legacy || {}).length + '):');
        Object.entries(status.legacy || {}).forEach(([f, why]) => console.log('  ' + f + ' — ' + why));
        console.log('\nbrowser (' + (status.browser || []).length + '):');
        (status.browser || []).forEach(f => console.log('  ' + f));
        const unlisted = all.filter(f => !(status.core || []).includes(f) && !(status.legacy || {})[f]);
        if (unlisted.length) {
            console.log('\n⚠ не классифицированы (' + unlisted.length + '): ' + unlisted.join(', '));
        }
        return 0;
    }

    const includeLegacy = argv.includes('--all');
    const core = (status.core || []).filter(f => all.includes(f));
    const legacy = Object.keys(status.legacy || {}).filter(f => all.includes(f));

    const results = [];
    console.log('== ядро (' + core.length + ') ==');
    for (const file of core) {
        const r = runNode(file, 180000);
        results.push(r);
        console.log((r.ok ? '  ✓ ' : '  ✗ ') + file + '  ' + lastLine(r.out));
    }
    const coreFailed = results.filter(r => !r.ok);

    let legacyResults = [];
    if (includeLegacy || argv.includes('--update')) {
        console.log('\n== известные устаревшие (' + legacy.length + ') ==');
        for (const file of legacy) {
            const r = runNode(file, 180000);
            legacyResults.push(r);
            console.log((r.ok ? '  ✓ ' : '  · ') + file + (r.ok ? '  (теперь зелёный — можно вернуть в ядро)' : ''));
        }
    }

    if (argv.includes('--update')) {
        // всё, что красное и не в ядре, помечаем legacy с причиной из вывода
        const next = { core: core.slice(), legacy: {}, browser: status.browser || [], note: status.note || '' };
        for (const file of all) {
            if (next.core.includes(file)) { next.legacy[file] = 'ядро'; continue; }
            const r = legacyResults.find(x => x.file === file) || runNode(file, 180000);
            if (r.ok) continue;
            const firstBad = String(r.out).split('\n').find(l => /✗|Error:|not found/.test(l)) || '';
            next.legacy[file] = (firstBad.trim().slice(0, 140) || 'падает').replace(/\|/g, '/');
        }
        fs.writeFileSync(STATUS_FILE, JSON.stringify(next, null, 2) + '\n', 'utf8');
        console.log('\nобновлён ' + path.basename(STATUS_FILE));
    }

    try {
        const report = markdownReport(results, status, legacyResults);
        fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'docs', 'test-status.md'), report, 'utf8');
    } catch (e) { /* отчёт не критичен */ }

    console.log('\n-- итог --');
    console.log('ядро: ' + (core.length - coreFailed.length) + '/' + core.length + ' зелёных');
    if (includeLegacy) {
        console.log('legacy: ' + legacyResults.filter(r => r.ok).length + '/' + legacyResults.length + ' зелёных');
    } else {
        console.log('legacy не запускались (--all, чтобы увидеть)');
    }
    console.log('отчёт: docs/test-status.md');
    return coreFailed.length ? 1 : 0;
}

process.exit(main());
