#!/usr/bin/env node
// ⚡ v13.049 (R34): сборка индекса карт полей боя для гексов оперативной карты.
//
// Кладём карты в папку «maps/Карты Валенсия/», имя файла начинается с номера
// гекса оперативной карты: «8.10 мост.json» → бой на гексе (8,10) откроет её.
// Затем запускаем:  node tools/build_hex_map_index.js
// Он создаёт «maps/Карты Валенсия/index.json» — список карт (имя + путь),
// по которому игра находит карту нужного гекса.
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

function collect(dir, relPrefix) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => /\.json$/i.test(f) && f.toLowerCase() !== 'index.json')
        .filter(f => hexKeyFromName(f))
        .sort()
        .map(f => ({ name: f.replace(/\.json$/i, ''), file: relPrefix + f, hex: hexKeyFromName(f) }));
}

const items = collect(DIR, 'maps/Карты Валенсия/');
if (items.length === 0) {
    // запасной вариант — карты лежат прямо в maps/
    const alt = collect(ALT_DIR, 'maps/').filter(x => x.hex !== '14,2' || true);
    if (alt.length) items.push(...alt);
}

if (items.length === 0) {
    console.log('⚠️  Карты не найдены. Положите файлы в «maps/Карты Валенсия/» с именем,');
    console.log('    начинающимся с номера гекса (например «8.10 мост.json»), и запустите снова.');
    process.exit(1);
}

const out = items.map(x => ({ name: x.name, file: x.file, hex: x.hex }));
const target = path.join(DIR, 'index.json');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`✅ Индекс карт записан: ${path.relative(ROOT, target)} — ${out.length} карт(ы)`);
out.forEach(x => console.log(`   · гекс (${x.hex}) ← ${x.file}`));
