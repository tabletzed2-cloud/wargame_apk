#!/usr/bin/env node
// ⚡ v13.061: map index generator emits per-map release markers.
// ⚡ v13.049 (R34): сборка индекса карт полей боя для гексов оперативной карты.
// ⚡ v13.050: проверка файлов карт (JSON + сетка), предупреждение о дублях
//    (два файла на один гекс), естественная сортировка по номеру гекса.
//
// Кладём карты в папку «maps/Карты Валенсия/», имя файла начинается с номера
// гекса оперативной карты: «8.10 мост.json» → бой на гексе (8,10) откроет её.
// Затем запускаем:  node tools/build_hex_map_index.js
// Он создаёт «maps/Карты Валенсия/index.json» — список карт (имя + путь + гекс),
// по которому игра находит карту нужного гекса, а сервис-воркер кэширует
// карты для офлайн-режима.
const VERSION = 'v13.061';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'maps', 'Карты Валенсия');
const ALT_DIR = path.join(ROOT, 'maps');

function hexKeyFromName(name) {
    const base = String(name).split('/').pop().replace(/\.json$/i, '').trim();
    const m = base.match(/^(\d{1,2})\s*[.,\-–]\s*(\d{1,2})(?!\d)/);
    if (!m) return null;
    return parseInt(m[1], 10) + ',' + parseInt(m[2], 10);
}

// Проверка: файл читается как JSON и содержит сетку (grid | currentMap.grid | tacticalMap.grid)
function inspectMap(fullPath) {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
        return { ok: false, error: 'не JSON: ' + e.message };
    }
    const grid = (raw && raw.grid) ||
                 (raw && raw.currentMap && raw.currentMap.grid) ||
                 (raw && raw.tacticalMap && raw.tacticalMap.grid) || null;
    if (!grid) return { ok: false, error: 'нет поля grid / currentMap.grid' };
    let w = 0, h = 0, cells = 0;
    if (Array.isArray(grid)) {
        h = grid.length;
        grid.forEach(r => { if (Array.isArray(r)) { w = Math.max(w, r.length); cells += r.length; } });
    } else {
        Object.keys(grid).forEach(k => {
            const p = k.split(',').map(Number);
            if (p.length !== 2 || isNaN(p[0]) || isNaN(p[1])) return;
            cells++; w = Math.max(w, p[0] + 1); h = Math.max(h, p[1] + 1);
        });
    }
    if (cells === 0) return { ok: false, error: 'сетка пуста' };
    return { ok: true, w, h, cells };
}

function collect(dir, relPrefix) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => /\.json$/i.test(f) && f.toLowerCase() !== 'index.json')
        .filter(f => hexKeyFromName(f))
        .map(f => ({ name: f.replace(/\.json$/i, ''), file: relPrefix + f, hex: hexKeyFromName(f), full: path.join(dir, f) }))
        .sort((a, b) => {
            const [ac, ar] = a.hex.split(',').map(Number), [bc, br] = b.hex.split(',').map(Number);
            return (ac - bc) || (ar - br) || a.name.localeCompare(b.name, 'ru');
        });
}

let items = collect(DIR, 'maps/Карты Валенсия/');
if (items.length === 0) {
    // запасной вариант — карты лежат прямо в maps/
    items = collect(ALT_DIR, 'maps/');
}

if (items.length === 0) {
    console.log('⚠️  Карты не найдены. Положите файлы в «maps/Карты Валенсия/» с именем,');
    console.log('    начинающимся с номера гекса (например «8.10 мост.json»), и запустите снова.');
    process.exit(1);
}

const out = [];
const seen = {};
const problems = [];
items.forEach(x => {
    const info = inspectMap(x.full);
    if (!info.ok) { problems.push(`   ✗ ${x.file} — ${info.error} (пропущена)`); return; }
    if (seen[x.hex]) {
        problems.push(`   ⚠ гекс (${x.hex}): два файла — используется «${seen[x.hex]}», пропущен «${x.name}»`);
        return;
    }
    seen[x.hex] = x.name;
    out.push({ _version: VERSION, name: x.name, file: x.file, hex: x.hex, size: info.w + 'x' + info.h });
});

const target = path.join(DIR, 'index.json');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`✅ Индекс карт записан: ${path.relative(ROOT, target)} — ${out.length} карт(ы)`);
if (problems.length) { console.log('Замечания:'); problems.forEach(p => console.log(p)); }
if (process.argv.includes('--list')) out.forEach(x => console.log(`   · гекс (${x.hex}) ${x.size} ← ${x.file}`));
