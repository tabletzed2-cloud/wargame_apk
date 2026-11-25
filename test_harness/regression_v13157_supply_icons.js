'use strict';
// ⚡ v13.157: иконки техники взводов снабжения.
//    Картинки нарисовал и загрузил игрок:
//      images/BeVe/DAF Trado.png                              — «Грузовик DAF Trado II»
//      images/BeVe/DAF MC-V.png                               — «Автомобиль DAF MC-V»
//      images/BeVe/Лёгкий грузовик CLg-37 «Викунья» (Vicuña).png — CLg-37 «Викунья»
//      images/BeVe/разведчик бенилюкс мото.png / …мото1.png    — мото-посыльный и мото-разведчик
//      images/BeVe/мотоцикл беве 1–3 мин.png                  — мотоциклетные миномётные расчёты
//      images/AIRF/Hidalgo GL-41.png                          — AL-41 Hidalgo
//    Тест проверяет: файлы на месте, пути в шаблонах и в прекэше, и что
//    миграция сейвов не затирает иконку техники общим значком взвода.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const TEMPLATES = fs.readFileSync(path.join(ROOT, 'js/templates.js'), 'utf8');
const RECON = fs.readFileSync(path.join(ROOT, 'js/recon.js'), 'utf8');

let pass = 0; const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}

const FILES = {
    trado: 'images/BeVe/DAF Trado.png',
    mcv: 'images/BeVe/DAF MC-V.png',
    vicuna: 'images/BeVe/Лёгкий грузовик CLg-37 «Викунья» (Vicuña).png',
    scout: 'images/BeVe/разведчик бенилюкс мото1.png',
    messenger: 'images/BeVe/разведчик бенилюкс мото.png',
    mortar1: 'images/BeVe/мотоцикл беве 1 мин.png',
    mortar2: 'images/BeVe/мотоцикл беве 2 мин.png',
    mortar3: 'images/BeVe/мотоцикл беве 3 мин.png',
    hidalgo: 'images/AIRF/Hidalgo GL-41.png'
};

console.log('== v13.157: иконки техники снабжения и разведки ==');

// 1. файлы
Object.keys(FILES).forEach(k => {
    const rel = FILES[k];
    const abs = path.join(ROOT, rel);
    ok(fs.existsSync(abs), `есть файл ${rel}`);
    ok(fs.existsSync(abs) && fs.statSync(abs).size > 10000, `файл не пустой: ${rel}`,
        fs.existsSync(abs) ? fs.statSync(abs).size : 'нет файла');
});

// 2. пути в шаблонах отрядов
const s = createSandbox(freshAppData());
const templates = s.evalCtx('SQUAD_TEMPLATES');
const byName = (n) => templates.find(t => t.name === n);

ok(byName('Грузовик DAF Trado II (Бельгийцы)').icon === FILES.trado,
    'DAF Trado II → images/BeVe/DAF Trado.png', byName('Грузовик DAF Trado II (Бельгийцы)').icon);
ok(byName('Автомобиль DAF MC-V (Бельгийцы)').icon === FILES.mcv,
    'DAF MC-V → images/BeVe/DAF MC-V.png', byName('Автомобиль DAF MC-V (Бельгийцы)').icon);
ok(byName('Легкий грузовик CLg-37 «Викунья» (A.I.R.F.)').icon === FILES.vicuna,
    'CLg-37 «Викунья» → images/BeVe/Лёгкий грузовик CLg-37 «Викунья» (Vicuña).png',
    byName('Легкий грузовик CLg-37 «Викунья» (A.I.R.F.)').icon);
ok(byName('Мотоциклист-разведчик').icon === FILES.scout,
    'мото-разведчик → …разведчик бенилюкс мото1.png', byName('Мотоциклист-разведчик').icon);
ok(byName('Мотоциклист-посыльный').icon === FILES.messenger,
    'мото-посыльный → …разведчик бенилюкс мото.png', byName('Мотоциклист-посыльный').icon);
ok(byName('Мотоциклетный миномётный расчёт 50-мм №1').icon === FILES.mortar1,
    'миномётный расчёт №1 → мотоцикл беве 1 мин.png', byName('Мотоциклетный миномётный расчёт 50-мм №1').icon);
ok(byName('Мотоциклетный миномётный расчёт 50-мм №2').icon === FILES.mortar2, 'миномётный расчёт №2 → мотоцикл беве 2 мин.png');
ok(byName('Мотоциклетный миномётный расчёт 50-мм №3').icon === FILES.mortar3, 'миномётный расчёт №3 → мотоцикл беве 3 мин.png');
ok(byName('AL-41 Hidalgo').icon === FILES.hidalgo,
    'AL-41 Hidalgo → images/AIRF/Hidalgo GL-41.png', byName('AL-41 Hidalgo').icon);

// 3. js/recon.js ссылается на те же файлы
ok(RECON.includes(FILES.scout), 'js/recon.js: иконка мото-разведчика');
ok(RECON.includes(FILES.messenger), 'js/recon.js: иконка мото-посыльного');
ok(RECON.includes(FILES.hidalgo), 'js/recon.js: иконка AL-41 Hidalgo');

// 4. выбор иконки: техника — своя, пешие отделения — общий значок
const icon = (n, f) => s.evalCtx(`supplySquadIcon(${JSON.stringify(n)}, ${JSON.stringify(f)})`);
ok(icon('Грузовик DAF Trado II', 'BeVe') === FILES.trado, 'supplySquadIcon: DAF Trado II');
ok(icon('Грузовик DAF Trado II №4', 'BeVe') === FILES.trado, 'supplySquadIcon: DAF Trado II №4');
ok(icon('Автомобиль DAF MC-V', 'BeVe') === FILES.mcv, 'supplySquadIcon: DAF MC-V');
ok(icon('Легкий грузовик CLg-37 «Викунья» №3', 'A.I.R.F.') === FILES.vicuna, 'supplySquadIcon: «Викунья» №3');
ok(icon('Носильщики №1', 'A.I.R.F.') === 'images/AIRF/Взвод снабжения АИРФ №1.png', 'supplySquadIcon: носильщики — общий значок А.И.Р.Ф.');
ok(icon('Мул с бойцом №2', 'BeVe') === 'images/BeVe/Взвод снабжения BeVe №1.png', 'supplySquadIcon: мул — общий значок BeVe');
ok(icon('Горный транспортёр TG-41 «Лама»', 'A.I.R.F.') === 'images/AIRF/Взвод снабжения АИРФ №1.png',
    'supplySquadIcon: у TG-41 своей картинки нет — общий значок');
ok(icon('Стрелковое отделение №1', 'BeVe') === 'images/BeVe/Взвод снабжения BeVe №1.png',
    'supplySquadIcon: не-снабженческий отряд получает общий значок (вызывается только по списку)');

// 5. миграция в index.html не затирает иконку техники
const migrationCalls = (HTML.match(/s\.icon = supplySquadIcon\(s\.name, s\.faction\)/g) || []).length;
ok(migrationCalls >= 2, 'миграция отрядов и шаблонов зовёт supplySquadIcon', migrationCalls);
ok(!/s\.icon = s\.faction === 'A\.I\.R\.F\.' \? 'images\/AIRF\/Взвод снабжения/.test(HTML),
    'жёсткой подмены иконки снабжения в index.html больше нет');
ok(/u\.icon = supplySquadIcon\(u\.name, fac\)/.test(HTML), 'иконки оп-юнитов снабжения — через supplySquadIcon');

// 6. прекэш service-worker
Object.keys(FILES).forEach(k => {
    ok(SW.includes("'./" + FILES[k] + "'"), `прекэш SW: ${FILES[k]}`);
});

// 7. ни одной отсутствующей картинки из шаблонов/разведки
const referenced = new Set();
[templates, s.evalCtx('BATTALION_PRESETS')].forEach(data => {
    JSON.stringify(data).replace(/images\/[^"\\]+\.(?:png|jpg|jpeg)/g, m => { referenced.add(m); return m; });
});
const missing = [...referenced].filter(p => !fs.existsSync(path.join(ROOT, p)));
ok(missing.length === 0, 'все иконки шаблонов и пресетов существуют на диске', missing.join(', '));

console.log(`\nИтог v13.157 (иконки): PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
