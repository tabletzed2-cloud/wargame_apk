'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createSandbox, freshAppData } = require('./sandbox');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

const supplyIconExpected = (name, faction) => {
    // ⚡ v13.157: иконки техники снабжения (те же пути, что в js/templates.js)
    if (/DAF Trado/i.test(name)) return 'images/BeVe/DAF Trado.png';
    if (/DAF MC-V/i.test(name)) return 'images/BeVe/DAF MC-V.png';
    if (/Викунья/i.test(name)) return 'images/BeVe/Лёгкий грузовик CLg-37 «Викунья» (Vicuña).png';
    return faction === 'A.I.R.F.'
        ? 'images/AIRF/Взвод снабжения АИРФ №1.png'
        : 'images/BeVe/Взвод снабжения BeVe №1.png';
};


let n = 0, f = [];
function test(name, fn) {
  try { fn(); n++; console.log('✓', name); }
  catch (e) { f.push(name + ': ' + e.message); console.log('✗', name, e.message); }
}

test('v13.083: версия и кэш', () => {
  // ⚡ правило проекта: тест не фиксирует номер релиза, а проверяет согласованность
  //    APP_VERSION ↔ CACHE_NAME ↔ BUILD-МАРКЕР (см. v13.156, v13.099, v13.084)
  const ver = (HTML.match(/var APP_VERSION = '(v[0-9.]+)'/) || [])[1];
  assert.ok(ver, 'APP_VERSION объявлен');
  assert.match(SW, new RegExp("const CACHE_NAME = 'wargame-" + ver.replace(/\./g, '\\.') + "'"));
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
    // ⚡ v13.157: у техники снабжения свои иконки, пешие отделения (штаб,
    //    носильщики, мулы, повозки, охрана) остаются с общим значком взвода.
    assert.equal(tmpl.icon, supplyIconExpected(sq.templateName, 'BeVe'), `иконка шаблона ${sq.templateName}`);
  });

  airfPlatoon.squads.forEach(sq => {
    const tmpl = templates.find(t => t.name === sq.templateName && t.faction === 'A.I.R.F.');
    assert.ok(tmpl, `шаблон A.I.R.F. ${sq.templateName}`);
    // ⚡ v13.157: у «Викуньи» своя иконка, остальные — общий значок А.И.Р.Ф.
    assert.equal(tmpl.icon, supplyIconExpected(sq.templateName, 'A.I.R.F.'), `иконка шаблона ${sq.templateName}`);
  });
});

console.log(n + ' passed, ' + f.length + ' failed');
if (f.length) process.exit(1);
