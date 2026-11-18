'use strict';
// NODE_PATH=/tmp/browsertest/node_modules LD_LIBRARY_PATH=/tmp/chromlibs/lib node this-file
// ⚡ v13.185: проверка стабилизации в живом приложении.
//   • версия на экране совпадает с APP_VERSION;
//   • дублей определений нет, tacticalSquadHexPosition отдаёт isEnemy/idx;
//   • рукопашная на карте боя видит врага в своём гексе (до v13.185 — нет).
const {chromium} = require('playwright-core');
const chromiumPackage = require('@sparticuz/chromium');
const portable = chromiumPackage.default || chromiumPackage;
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.env.WARGAME_ROOT || path.join(__dirname, '..'));

(async () => {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      const t = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
      res.setHeader('Content-Type', t[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '0.0.0.0', r));
  let browser, failures = 0;
  try {
    browser = await chromium.launch({executablePath: await portable.executablePath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--enable-unsafe-swiftshader', '--use-angle=swiftshader'], headless: true});
    const page = await browser.newPage({viewport: {width: 900, height: 900}, serviceWorkers: 'block'});
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    page.on('dialog', d => d.dismiss());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'load'});
    await page.waitForFunction(() => typeof tacticalSquadsInSameHex === 'function');

    const r = await page.evaluate(() => {
      const checks = [];
      const check = (name, ok, extra) => checks.push({name, ok: !!ok, extra});

      // версия на экране
      check('APP_VERSION = v13.185', APP_VERSION === 'v13.185', APP_VERSION);
      check('#appVersionBadge показывает APP_VERSION',
        (document.getElementById('appVersionBadge') || {}).textContent === APP_VERSION,
        (document.getElementById('appVersionBadge') || {}).textContent);
      check('title содержит APP_VERSION', document.title.includes(APP_VERSION), document.title);

      // дубли определений: ищем в тексте всех inline-скриптов
      const dupes = [];
      Array.from(document.scripts).filter(s => !s.src).forEach((s, bi) => {
        const seen = new Set();
        const re = /(^|\n)[ \t]*function[ \t]+([A-Za-z0-9_$]+)[ \t]*\(/g;
        let m;
        while ((m = re.exec(s.textContent))) {
          if (seen.has(m[2])) dupes.push(m[2] + '@' + bi);
          seen.add(m[2]);
        }
      });
      check('нет дублей определений функций', dupes.length === 0, dupes.join(', '));

      // рукопашная: свой и враг в одном гексе
      appData.squads = [{name: 'свой', fighters: [{hp: 3, name: 'б1'}], currentMorale: 100, baseMorale: 100}];
      appData.map = appData.map || {};
      appData.map.enemySquads = [{name: 'враг', fighters: [{hp: 3, name: 'в1'}], currentMorale: 100, baseMorale: 100}];
      // enemySquadIds хранит индексы массива enemySquads (как и squadIds — индексы squads)
      appData.map.grid = { '5,5': {type: 'grass', squadIds: [0], enemySquadIds: [0]} };

      const pos = tacticalSquadHexPosition(appData.squads[0]);
      check('положение своего отряда: isEnemy = false', pos && pos.isEnemy === false, JSON.stringify(pos));
      check('положение своего отряда: idx = 0', pos && pos.idx === 0);
      check('положение врага: isEnemy = true',
        (p2 => p2 && p2.isEnemy === true)(tacticalSquadHexPosition(appData.map.enemySquads[0])));

      // своя сторона видит врага
      let contacts = [], err = null;
      try { contacts = tacticalSquadsInSameHex(appData.squads[0]); }
      catch (e) { err = e.message; }
      check('рукопашная: свой отряд видит врага', contacts.length === 1, `${contacts.length}${err ? ' · ' + err : ''}`);
      check('рукопашная: контакт помечен isEnemy', contacts[0] && contacts[0].isEnemy === true,
        JSON.stringify(contacts[0] && {name: contacts[0].squad && contacts[0].squad.name, isEnemy: contacts[0].isEnemy}));
      check('рукопашная: у контакта верный индекс', contacts[0] && contacts[0].idx === 0);

      // ⚡ именно это ломал дубль: вражеский отряд строил выборку по СВОИМ (opponents = enemies)
      const enemyContacts = tacticalSquadsInSameHex(appData.map.enemySquads[0]);
      check('рукопашная: вражеский отряд видит игрока', enemyContacts.length === 1, enemyContacts.length);
      check('рукопашная: вражеский контакт помечен isEnemy = false',
        enemyContacts[0] && enemyContacts[0].isEnemy === false,
        JSON.stringify(enemyContacts[0] && {name: enemyContacts[0].squad && enemyContacts[0].squad.name, isEnemy: enemyContacts[0].isEnemy}));
      check('рукопашная: симметрично — обе стороны видят друг друга',
        contacts.length === 1 && enemyContacts.length === 1);

      // техника в рукопашной не участвует — контактов быть не должно
      appData.squads[0].armor = {front: 3, side: 2, rear: 1};
      check('техника в рукопашной не участвует', tacticalSquadsInSameHex(appData.squads[0]).length === 0);
      delete appData.squads[0].armor;

      return checks;
    });

    for (const c of r) {
      if (c.ok) console.log('PASS ' + c.name);
      else { failures++; console.log('FAIL ' + c.name + (c.extra !== undefined ? ' → ' + c.extra : '')); }
    }
    const pageErrors = errors.filter(e => !/ResizeObserver|favicon|service|offline/i.test(e));
    if (pageErrors.length) { failures++; console.log('FAIL ошибки страницы: ' + pageErrors.slice(0, 3).join(' | ')); }
    else console.log('PASS нет ошибок JS на странице');
    console.log(`\nИтог v13.185 (browser): PASS ${r.filter(c => c.ok).length} · FAIL ${r.filter(c => !c.ok).length}`);
  } catch (e) {
    failures++;
    console.log('CRASH ' + (e && e.message));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  process.exit(failures ? 1 : 0);
})();
