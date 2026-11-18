// ⚡ v13.185: регрессия этапа A («стабилизация»).
//
//   A1. Версия синхронна во ВСЕХ местах: APP_VERSION, manifest, CACHE_NAME,
//       BUILD-МАРКЕРы модулей и — отдельно — в интерфейсе (<title>, <h1>,
//       #battleModuleTitle, #appVersionBadge). В v13.184 интерфейс показывал
//       v13.183 при APP_VERSION = v13.184.
//   A2. Нет дублей определений функций: в v13.184 вторая (короткая) копия
//       tacticalSquadHexPosition перекрывала полную и теряла isEnemy/idx,
//       из-за чего рукопашная строила выборку противников по undefined.
//   A3. tools/bump_version.py умеет и проверять, и проставлять версию.
//   A4. Раннер test_harness/run_all.js и список core/legacy на месте.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { HTML, ROOT } = require('./extract');

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✓ ' + name); }
    else { fail++; console.log('✗ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── A1. Версия во всех местах ───────────────────────────────────────────────
const APP = /var APP_VERSION = '(v\d+\.\d+)'/.exec(HTML)[1];
const MARKER = '⚡ BUILD-MARKER-NEVER' + 'МАРКЕР: ' + APP; // защита от самоподмены
const MARKER_TEXT = '⚡ BUILD-МАРКЕР: ' + APP;

check('A1 APP_VERSION в формате vX.YYY', /^v\d+\.\d{3}$/.test(APP), APP);
check('A1 manifest.json short_name = ' + APP,
    new RegExp('"short_name":\\s*"БМ ' + APP + '"').test(read('manifest.json')),
    (/"short_name":\s*"[^"]*"/.exec(read('manifest.json')) || [])[0]);
check('A1 service-worker CACHE_NAME = ' + APP,
    new RegExp("const CACHE_NAME = 'wargame-" + APP + "';").test(read('service-worker.js')));
check('A1 service-worker BUILD-МАРКЕР в первой строке',
    read('service-worker.js').split('\n')[0].includes(MARKER_TEXT));

const MODULES = ['js/data.js', 'js/hexmaps.js', 'js/templates.js', 'js/operational_ui.js',
    'js/cards.js', 'js/map_actions.js', 'js/online_battles.js', 'js/placement.js',
    'js/recon.js', 'js/weapons.js'];
const staleModules = MODULES.filter(m => !read(m).split('\n')[0].includes(MARKER_TEXT));
check('A1 BUILD-МАРКЕР во всех ' + MODULES.length + ' модулях = ' + APP,
    staleModules.length === 0, staleModules.join(', '));

check('A1 <title> показывает ' + APP,
    new RegExp('<title>Боевой модуль ' + APP).test(HTML));
check('A1 #appVersionBadge показывает ' + APP,
    new RegExp('id="appVersionBadge"[^>]*>' + APP + '<').test(HTML),
    (/id="appVersionBadge"[^>]*>([^<]*)</.exec(HTML) || [])[1]);
check('A1 #battleModuleTitle показывает ' + APP,
    new RegExp('id="battleModuleTitle"[^>]*>⚔️ Боевой модуль ' + APP).test(HTML));

// ── A2. Дубли определений функций ───────────────────────────────────────────
(function () {
    const code = HTML; // все inline-скрипты ищем одним проходом по тексту блоков
    const blocks = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(HTML))) blocks.push(m[1]);
    const dupes = [];
    blocks.forEach((block, bi) => {
        const seen = new Map();
        const fnRe = /(^|\n)[ \t]*function[ \t]+([A-Za-z0-9_$]+)[ \t]*\(/g;
        let hit;
        while ((hit = fnRe.exec(block))) {
            const name = hit[2];
            if (seen.has(name)) dupes.push(name + ' (блок ' + (bi + 1) + ')');
            seen.set(name, true);
        }
    });
    check('A2 нет дублей определений функций', dupes.length === 0, dupes.join(', '));
    void code;
})();

check('A2 tacticalSquadHexPosition объявлена один раз',
    (HTML.match(/function tacticalSquadHexPosition\(/g) || []).length === 1);
check('A2 useAdrenaline объявлена один раз',
    (HTML.match(/function useAdrenaline\(/g) || []).length === 1);

// Оставшаяся реализация обязана возвращать isEnemy/idx — на них держится рукопашная.
(function () {
    const start = HTML.indexOf('function tacticalSquadHexPosition(');
    const body = HTML.slice(start, HTML.indexOf('\n}\n', start) + 3);
    check('A2 tacticalSquadHexPosition возвращает isEnemy', /isEnemy:/.test(body));
    check('A2 tacticalSquadHexPosition возвращает idx', /idx:/.test(body));
    check('A2 подсказка о снятом дубле сохранена в коде',
        /вторая \(короткая\) копия tacticalSquadHexPosition/i.test(HTML) ||
        /ВТОРАЯ \(короткая\) копия tacticalSquadHexPosition/i.test(HTML));

    // Поведение: свой отряд в одном гексе с врагом даёт контакт с меткой isEnemy.
    const ctx = {
        Math, Number, Object, Array, Set, Map, console,
        appData: {
            squads: [{ name: 'свой', fighters: [{ hp: 3 }] }],
            map: {
                // enemySquadIds — индексы массива enemySquads, squadIds — индексы squads
                grid: { '5,5': { type: 'grass', squadIds: [0], enemySquadIds: [0] } },
                enemySquads: [{ name: 'враг', fighters: [{ hp: 3 }] }]
            }
        },
        hexGridDistance: (a, b, c, d) => (a === c && b === d ? 0 : 1),
        getBattleSquadHex(grid, idx, isEnemy) {
            for (const k in grid) {
                const arr = isEnemy ? grid[k].enemySquadIds : grid[k].squadIds;
                if (arr && arr.includes(idx)) {
                    const p = k.split(',').map(Number);
                    return { col: p[0], row: p[1], key: k };
                }
            }
            return null;
        }
    };
    vm.createContext(ctx);
    // упрощённая копия боевой логики: важна только ветка «свои/враги» (её и ломал дубль)
    const helpers = [
        'function tacticalSquadsDistance(a, b) {',
        '  const pa = tacticalSquadHexPosition(a), pb = tacticalSquadHexPosition(b);',
        '  if (!pa || !pb) return null;',
        '  return hexGridDistance(pa.col, pa.row, pb.col, pb.row);',
        '}',
        'function tacticalSquadsInSameHex(squad) {',
        '  const pos = tacticalSquadHexPosition(squad);',
        '  if (!pos) return [];',
        '  const opponents = pos.isEnemy ? appData.squads : appData.map.enemySquads;',
        '  const out = [];',
        '  opponents.forEach((other, idx) => {',
        '    if (!other || other === squad) return;',
        '    if (tacticalSquadsDistance(squad, other) !== 0) return;',
        '    out.push({ squad: other, idx, isEnemy: !pos.isEnemy });',
        '  });',
        '  return out;',
        '}'
    ].join('\n');
    vm.runInContext(body + '\n' + helpers + '\nvar __pos = tacticalSquadHexPosition(appData.squads[0]);', ctx);
    check('A2 положение отряда содержит isEnemy=false для своего отряда',
        ctx.__pos && ctx.__pos.isEnemy === false, JSON.stringify(ctx.__pos));
    check('A2 положение отряда содержит idx=0', ctx.__pos && ctx.__pos.idx === 0);
    const enemyPos = ctx.tacticalSquadHexPosition(ctx.appData.map.enemySquads[0]);
    check('A2 положение врага помечено isEnemy=true', enemyPos && enemyPos.isEnemy === true, JSON.stringify(enemyPos));
    const own = ctx.tacticalSquadsInSameHex(ctx.appData.squads[0]);
    check('A2 свой отряд видит врага в своём гексе', own.length === 1 && own[0].isEnemy === true, JSON.stringify(own));
    const enemyView = ctx.tacticalSquadsInSameHex(ctx.appData.map.enemySquads[0]);
    check('A2 вражеский отряд видит игрока (регресс дубля: opponents = enemies)',
        enemyView.length === 1 && enemyView[0].isEnemy === false, JSON.stringify(enemyView));
})();

// ── A3. Инструмент версий ───────────────────────────────────────────────────
check('A3 tools/bump_version.py существует', fs.existsSync(path.join(ROOT, 'tools', 'bump_version.py')));
(function () {
    let out = '', code = 0;
    try {
        out = execFileSync('python3', [path.join(ROOT, 'tools', 'bump_version.py'), '--check'],
            { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
        code = e.status || 1;
        out = String((e.stdout || '') + (e.stderr || ''));
    }
    check('A3 bump_version.py --check проходит (версии синхронны)', code === 0, out.split('\n').slice(-4).join(' / '));
    check('A3 --check видит интерфейсные места версии', /#appVersionBadge/.test(out) && /<title>/.test(out));
})();

// ── A4. Раннер проверок ─────────────────────────────────────────────────────
const statusPath = path.join(__dirname, 'test-status.json');
check('A4 test_harness/test-status.json существует', fs.existsSync(statusPath));
if (fs.existsSync(statusPath)) {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    check('A4 в core есть тесты', Array.isArray(status.core) && status.core.length >= 40, (status.core || []).length);
    check('A4 core и legacy не пересекаются',
        (status.core || []).every(f => !(status.legacy || {})[f]));
    check('A4 каждый тест из core существует на диске',
        (status.core || []).every(f => fs.existsSync(path.join(__dirname, f))),
        (status.core || []).filter(f => !fs.existsSync(path.join(__dirname, f))).join(', '));
    check('A4 у legacy-тестов указана причина',
        Object.values(status.legacy || {}).every(v => typeof v === 'string' && v.length > 5));
    check('A4 сама эта регрессия входит в core',
        (status.core || []).indexOf('regression_v13185_stabilization.js') >= 0);
}
check('A4 run_all.js существует', fs.existsSync(path.join(__dirname, 'run_all.js')));
check('A4 отчёт docs/test-status.md существует',
    fs.existsSync(path.join(ROOT, 'docs', 'test-status.md')));

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ` v13.185 (стабилизация): ${pass} проверок, ${fail} падений`);
process.exit(fail ? 1 : 0);
