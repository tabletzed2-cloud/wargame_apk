'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createSandbox, freshAppData } = require('./sandbox');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

let n = 0, f = [];
function test(name, fn) {
  try { fn(); n++; console.log('✓', name); }
  catch (e) { f.push(name + ': ' + e.message); console.log('✗', name, e.message); }
}

test('v13.083: версия и кэш', () => {
  assert.match(HTML, /var APP_VERSION = 'v13\.083'/);
  assert.match(SW, /const CACHE_NAME = 'wargame-v13\.083'/);
  assert.ok(fs.existsSync(path.join(ROOT, 'images/AIRF/Взвод снабжения АИРФ №1.png')), 'файл иконки АИРФ существует');
  assert.ok(fs.existsSync(path.join(ROOT, 'images/BeVe/Взвод снабжения BeVe №1.png')), 'файл иконки BeVe существует');
  assert.ok(SW.includes('./images/AIRF/Взвод снабжения АИРФ №1.png'), 'иконка АИРФ в кэше SW');
  assert.ok(SW.includes('./images/BeVe/Взвод снабжения BeVe №1.png'), 'иконка BeVe в кэше SW');
});

test('v13.083: иконки взводов снабжения в BATTALION_PRESETS и SQUAD_TEMPLATES', () => {
  const s = createSandbox(freshAppData());
  const presets = s.evalCtx('BATTALION_PRESETS');
  const templates = s.evalCtx('SQUAD_TEMPLATES');

  const bevePlatoon = presets['BeVe'].standard.find(u => u.name === 'Взвод снабжения');
  const airfPlatoon = presets['A.I.R.F.'].standard.find(u => u.name === 'Взвод снабжения');
  assert.equal(bevePlatoon.icon, 'images/BeVe/Взвод снабжения BeVe №1.png');
  assert.equal(airfPlatoon.icon, 'images/AIRF/Взвод снабжения АИРФ №1.png');

  bevePlatoon.squads.forEach(sq => {
    const tmpl = templates.find(t => t.name === sq.templateName && t.faction === 'BeVe');
    assert.ok(tmpl, `шаблон BeVe ${sq.templateName}`);
    assert.equal(tmpl.icon, 'images/BeVe/Взвод снабжения BeVe №1.png', `иконка шаблона ${sq.templateName}`);
  });

  airfPlatoon.squads.forEach(sq => {
    const tmpl = templates.find(t => t.name === sq.templateName && t.faction === 'A.I.R.F.');
    assert.ok(tmpl, `шаблон A.I.R.F. ${sq.templateName}`);
    assert.equal(tmpl.icon, 'images/AIRF/Взвод снабжения АИРФ №1.png', `иконка шаблона ${sq.templateName}`);
  });
});

console.log(n + ' passed, ' + f.length + ' failed');
if (f.length) process.exit(1);
