'use strict';
// ⚡ v13.170 — «У взводов снабжения убрать охранник 1 и охранник 2, сделать
//   отделение охраны склада снабжения».
//
//   Было: два отдельных отделения «Стрелок охранник №1» (Охранник 1, 2) и
//         «Стрелок охранник №2» (Охранник 3, 4) — по два бойца каждое.
//   Стало: ОДНО отделение «Отделение охраны склада снабжения» с четырьмя
//          бойцами охраны («Боец охраны 1..4»).
//
// Проверяем:
//   1) состав батальона: в взводе снабжения больше нет «Стрелок охранник №1/№2»;
//   2) шаблоны отделений: один шаблон охраны на фракцию, 4 бойца, оружие/БК;
//   3) боевой состав: охрана сводится в отряд «охрана склада» (и по новым,
//      и по старым именам бойцов);
//   4) миграция уже начатого похода: два отделения → одно, HP и БК сохранены,
//      шаблоны не дублируются, повторный запуск ничего не меняет;
//   5) пул средств снабжения не изменился (охрана в него не входит);
//   6) панель снабжения видит охрану («стрелки на месте»);
//   7) версия и BUILD-маркеры.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sliceFunction, sliceConst, HTML } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const ROOT = path.join(__dirname, '..');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
const DATA = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
const TEMPLATES = fs.readFileSync(path.join(ROOT, 'js/templates.js'), 'utf8');
const CURRENT_VERSION = (/var APP_VERSION = '([^']+)'/.exec(HTML) || [])[1] || '';
const GUARD_NAME = 'Отделение охраны склада снабжения';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}
const J = (s, code) => s.evalCtx(`JSON.stringify(${code})`);

function dataCtx(src) {
    const ctx = { console };
    vm.runInNewContext(src, ctx);
    return ctx;
}
const PRESET_CTX = dataCtx(DATA + '\nthis.__p = BATTALION_PRESETS; this.__t = typeof SQUAD_TEMPLATES !== "undefined" ? SQUAD_TEMPLATES : null;');
const TEMPLATE_CTX = dataCtx(TEMPLATES + '\nthis.__t = SQUAD_TEMPLATES;');

console.log('— 1. состав взводов снабжения —');
{
    ['BeVe', 'A.I.R.F.'].forEach(faction => {
        const platoon = PRESET_CTX.__p[faction].standard.find(u => u && u.name === 'Взвод снабжения');
        const names = platoon.squads.map(q => q.name);
        const guards = names.filter(n => /охран/i.test(n));
        ok(!names.some(n => /Стрелок охранник/i.test(n)),
            `${faction}: отдельных «Стрелок охранник №1/№2» больше нет`, names.join(', '));
        ok(guards.length === 1 && guards[0] === GUARD_NAME,
            `${faction}: охрана склада — одно отделение «${GUARD_NAME}»`, JSON.stringify(guards));
        ok(platoon.squads.filter(q => q.name === GUARD_NAME)[0].templateName.indexOf(GUARD_NAME) === 0,
            `${faction}: отделение ссылается на свой шаблон`);
        ok(platoon.squads.length === (faction === 'BeVe' ? 13 : 11),
            `${faction}: отделений во взводе — ${faction === 'BeVe' ? 13 : 11}`, String(platoon.squads.length));
    });
}

console.log('— 2. шаблоны отделения охраны —');
{
    const all = TEMPLATE_CTX.__t;
    ['BeVe', 'A.I.R.F.'].forEach(faction => {
        const own = all.filter(t => t.faction === faction && /охран/i.test(String(t.name || '')));
        ok(own.length === 1, `${faction}: ровно один шаблон охраны (было два «Стрелок охранник»)`, String(own.length));
        const t = own[0];
        ok(t.name.indexOf(GUARD_NAME) === 0, `${faction}: шаблон называется «${GUARD_NAME} …»`, t.name);
        ok(t.fighters.length === 4, `${faction}: в отделении 4 бойца (было два по два)`, String(t.fighters.length));
        ok(t.fighters.map(f => f.name).join(',') === 'Боец охраны 1,Боец охраны 2,Боец охраны 3,Боец охраны 4',
            `${faction}: бойцы названы «Боец охраны 1..4»`, t.fighters.map(f => f.name).join(', '));
        ok(t.fighters.every(f => /Винтовка/.test(f.weapon || '')), `${faction}: все вооружены винтовками`);
        ok(t.fighters.every(f => f.hp === 3 && f.maxHp === 3), `${faction}: у всех по 3 HP`);
        ok(t.ammoSmall === 32 && t.grenades === 8, `${faction}: БК отделения — 32 патрона и 8 гранат`,
            `${t.ammoSmall}/${t.grenades}`);
        ok(!all.some(x => x.faction === faction && /Стрелок охранник/i.test(String(x.name || ''))),
            `${faction}: старые шаблоны охранников удалены`);
    });
}

console.log('— 3. боевой состав: охрана сводится в отряд —');
{
    const s = createSandbox(freshAppData());
    s.run(sliceFunction(HTML, 'supplyBattleForceSquads'));
    s.run(`
      function isSupplyOperationalUnit(u) { return !!u && /снабж/i.test(String(u.name || '')); }
      appData.campaign.opUnits = [
        { name: 'Взвод снабжения', type: 'supply_platoon', squads: [
          { name: '${GUARD_NAME}', fighters: [
            { name: 'Боец охраны 1', hp: 3 }, { name: 'Боец охраны 2', hp: 3 },
            { name: 'Боец охраны 3', hp: 0 }, { name: 'Боец охраны 4', hp: 3 }] },
          { name: 'Носильщики №1', fighters: [{ name: 'Носильщик 1', hp: 3 }] },
          { name: 'Мул с бойцом №1', fighters: [{ name: 'Погонщик мула №1', hp: 3 }] },
          { name: 'Грузовик DAF Trado II', fighters: [{ name: 'Водитель', hp: 3 }, { name: 'Помощник водителя', hp: 3, isAway: true }] }
        ] }
      ];
    `);
    const force = JSON.parse(J(s, 'supplyBattleForceSquads(appData.campaign.opUnits[0]) || []'));
    ok(force.length === 2, 'в бою два отряда: охрана и обоз', JSON.stringify(force.map(f => f.name)));
    ok(/охрана склада/i.test(force[0].name), 'первый отряд — охрана склада', force[0].name);
    ok(force[0].fighters.map(f => f.name).join(',') === 'Боец охраны 1,Боец охраны 2,Боец охраны 4',
        'в охрану попали все живые бойцы отделения (погибший — нет)', force[0].fighters.map(f => f.name).join(', '));
    ok(/обоз/i.test(force[1].name), 'второй отряд — обоз и носильщики', force[1].name);
    ok(!force[1].fighters.some(f => /Помощник водителя/.test(f.name)), 'ушедший в рейс за боеприпасами в бой не идёт');
    // обратная совместимость: старое имя бойца «Охранник N»
    s.run(`appData.campaign.opUnits[1] = { name: 'Взвод снабжения (старый сейв)', type: 'supply_platoon', squads: [
        { name: 'Стрелок охранник №1', fighters: [{ name: 'Охранник 1', hp: 3 }, { name: 'Охранник 2', hp: 3 }] }] };`);
    const legacy = JSON.parse(J(s, 'supplyBattleForceSquads(appData.campaign.opUnits[1]) || []'));
    ok(legacy.length === 1 && legacy[0].fighters.length === 2,
        'старые «Охранник N» по-прежнему считаются охраной', JSON.stringify(legacy.map(f => f.fighters.length)));
}

console.log('— 4. миграция уже начатого похода —');
{
    const ad = freshAppData();
    ad.templates = [
        { name: 'Стрелок охранник №1 (Бельгийцы)', faction: 'BeVe', ammoSmall: 16, grenades: 4, ammoOrdnance: 0,
          fighters: [{ name: 'Охранник 1', weapon: 'Винтовка FN model 24/30', hp: 3, maxHp: 3 },
                     { name: 'Охранник 2', weapon: 'Винтовка FN model 24/30', hp: 3, maxHp: 3 }] },
        { name: 'Стрелок охранник №2 (Бельгийцы)', faction: 'BeVe', ammoSmall: 16, grenades: 4, ammoOrdnance: 0,
          fighters: [{ name: 'Охранник 3', weapon: 'Винтовка FN model 24/30', hp: 3, maxHp: 3 },
                     { name: 'Охранник 4', weapon: 'Винтовка FN model 24/30', hp: 3, maxHp: 3 }] }
    ];
    ad.campaign.opUnits = [{
        name: 'Взвод снабжения', type: 'hq', col: 4, row: 4, squads: [
            { name: 'Штаб взвода снабжения', fighters: [{ name: 'Кладовщик', hp: 3 }] },
            { name: 'Носильщики №1', fighters: [{ name: 'Носильщик 1', hp: 3 }, { name: 'Носильщик 2', hp: 3 }] },
            { name: 'Стрелок охранник №1', ammoSmall: 16, grenades: 4, ammoOrdnance: 0,
              fighters: [{ name: 'Охранник 1', hp: 2 }, { name: 'Охранник 2', hp: 3 }] },
            { name: 'Стрелок охранник №2', ammoSmall: 16, grenades: 4, ammoOrdnance: 0,
              fighters: [{ name: 'Охранник 3', hp: 0 }, { name: 'Охранник 4', hp: 3 }] }
        ]
    }];
    const s = createSandbox(ad);
    s.run(['SUPPLY_GUARD_SQUAD_NAME', 'SUPPLY_GUARD_SQUAD_RE', 'SUPPLY_SQUAD_RENAMES'].map(n => sliceConst(HTML, n)).join('\n'));
    ['migrateSupplyGuardSquads', 'supplyGuardTemplateFor', 'supplySquadRenamed']
        .forEach(fn => { try { s.run(sliceFunction(HTML, fn)); } catch (e) { console.log('  (нет ' + fn + ')'); } });
    s.run('appData.templates.push(JSON.parse(JSON.stringify(SQUAD_TEMPLATES.find(t => t.faction === "BeVe" && /Отделение охраны/.test(t.name)))));');
    s.run('globalThis.__n1 = migrateSupplyGuardSquads();');
    const squads = JSON.parse(J(s, 'appData.campaign.opUnits[0].squads.map(q => ({ n: q.name, hp: (q.fighters || []).map(f => f.hp), ammo: q.ammoSmall, gren: q.grenades }))'));
    const guardRows = squads.filter(q => /охран/i.test(q.n));
    ok(guardRows.length === 1, 'два отдельных охранника сведены в одно отделение', JSON.stringify(guardRows));
    ok(guardRows[0].n === GUARD_NAME, 'отделение получило новое имя', guardRows[0].n);
    ok(guardRows[0].hp.length === 4, 'в отделении все четверо бойцов', JSON.stringify(guardRows[0].hp));
    ok(guardRows[0].hp.join(',') === '2,3,0,3', 'HP бойцов сохранены (раненый и погибший тоже)', guardRows[0].hp.join(','));
    ok(guardRows[0].ammo === 32 && guardRows[0].gren === 8, 'боезапас двух отделений сложен, а не потерян',
        `${guardRows[0].ammo}/${guardRows[0].gren}`);
    ok(squads.length === 3, 'лишнее отделение убрано (штаб + носильщики + охрана)', String(squads.length));
    ok(squads.some(q => q.n === 'Носильщики №1'), 'остальные отделения на месте');
    const templates = JSON.parse(J(s, 'appData.templates.map(t => ({ n: t.name, men: (t.fighters || []).length }))'));
    const guardTemplates = templates.filter(t => /охран/i.test(t.n));
    ok(guardTemplates.length === 1, 'шаблон охраны не дублируется', JSON.stringify(guardTemplates));
    ok(guardTemplates[0].men === 4, 'шаблон охраны — 4 бойца, а не 2', String(guardTemplates[0].men));
    s.run('globalThis.__n2 = migrateSupplyGuardSquads();');
    ok(s.evalCtx('__n2') === 0, 'повторная миграция ничего не меняет (идемпотентность)', String(s.evalCtx('__n2')));
    ok(s.evalCtx('__n1') > 0, 'первая миграция действительно что-то исправила', String(s.evalCtx('__n1')));
    // старые имена в карте переименований
    ok(s.evalCtx("supplySquadRenamed('Стрелок охранник №1')") === GUARD_NAME,
        'старое имя отделения переименовывается в новое');
    ok(s.evalCtx("supplySquadRenamed('Стрелок охранник №2 (Бельгийцы)')") === GUARD_NAME + ' (Бельгийцы)',
        'и старое имя шаблона тоже');
}

console.log('— 5. пул средств снабжения не изменился —');
{
    const ad = freshAppData();
    ad.templates = JSON.parse(JSON.stringify(TEMPLATE_CTX.__t));
    const s = createSandbox(ad);
    s.run(['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_CONVOY_BUDGET'].map(n => sliceConst(HTML, n)).join('\n'));
    ['supplyAssetIds', 'supplyAssetCounts'].forEach(fn => s.run(sliceFunction(HTML, fn)));
    s.run(`
      appData.campaign.opUnits = [{ name: 'Взвод снабжения', squads: [
        { name: 'Носильщики №1', fighters: [{ hp: 3 }, { hp: 3 }, { hp: 3 }, { hp: 3 }] },
        { name: 'Носильщики №2', fighters: [{ hp: 3 }, { hp: 3 }, { hp: 3 }, { hp: 3 }] },
        { name: 'Мул с бойцом №1', fighters: [{ hp: 3 }] },
        { name: '${GUARD_NAME}', fighters: [{ hp: 3 }, { hp: 3 }, { hp: 3 }, { hp: 3 }] }
      ] }];
      globalThis.__counts = supplyAssetCounts(appData.campaign.opUnits[0]);
    `);
    const counts = JSON.parse(J(s, '__counts'));
    ok(counts.porter === 8, 'носильщиков по-прежнему 8 (охрана в пул не входит)', String(counts.porter));
    ok(counts.mule === 1, 'мул считается как раньше');
    ok(!Object.keys(counts).some(k => /guard|охран/i.test(k)), 'типа средства «охрана» в снабжении нет');
}

console.log('— 6. панель снабжения видит охрану —');
{
    const panelSrc = sliceFunction(HTML, 'renderSupplyPanel');
    ok(/\.some\(sq => \/охран\/i\.test\(String\(sq\.name \|\| ''\)\)\)/.test(panelSrc),
        'панель считает охрану по /охран/i (ловит и новое имя отделения)');
    ok(/стрелки на месте/.test(panelSrc) && /нет охраны/.test(panelSrc),
        'статус охраны склада в панели сохранён');
    ok(new RegExp(GUARD_NAME).test(GUARD_NAME) && /охран/i.test(GUARD_NAME),
        'новое имя отделения удовлетворяет проверке панели');
    // иконка отделения — общий значок взвода снабжения (не техника)
    const tctx = dataCtx(TEMPLATES + '\nthis.__icon = supplySquadIcon;');
    ok(tctx.__icon(GUARD_NAME, 'BeVe') === 'images/BeVe/Взвод снабжения BeVe №1.png',
        'иконка BeVe — общий значок взвода снабжения', String(tctx.__icon(GUARD_NAME, 'BeVe')));
    ok(tctx.__icon(GUARD_NAME, 'A.I.R.F.') === 'images/AIRF/Взвод снабжения АИРФ №1.png',
        'иконка A.I.R.F. — свой значок', String(tctx.__icon(GUARD_NAME, 'A.I.R.F.')));
}

console.log('— 7. версия и сборка —');
{
    ok(/^v\d+\.\d+$/.test(CURRENT_VERSION), 'APP_VERSION в формате vNN.NNN', CURRENT_VERSION);
    ok(SW.indexOf('wargame-' + CURRENT_VERSION) >= 0, 'CACHE_NAME совпадает с APP_VERSION');
    ok(MANIFEST.indexOf(CURRENT_VERSION) >= 0, 'manifest.short_name совпадает с APP_VERSION');
    ok(/migrateSupplyGuardSquads/.test(HTML), 'миграция старых сейвов подключена в index.html');
    ok(TEMPLATES.split('\n')[0].indexOf(CURRENT_VERSION) >= 0, 'BUILD-маркер js/templates.js = ' + CURRENT_VERSION);
    ok(DATA.split('\n')[0].indexOf(CURRENT_VERSION) >= 0, 'BUILD-маркер js/data.js = ' + CURRENT_VERSION);
}

console.log('');
if (fails.length) {
    console.log('Итог v13.170 (отделение охраны склада снабжения): PASS ' + pass + ' · FAIL ' + fails.length);
    fails.forEach(f => console.log('   ✗ ' + f));
    process.exit(1);
} else {
    console.log('Итог v13.170 (два «Стрелок охранник» заменены одним отделением охраны склада снабжения): PASS ' + pass + ' · FAIL 0');
}
