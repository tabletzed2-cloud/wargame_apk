// ⚡ v13.073: починка структуры страницы + посадка в БТР в обеих фазах +
//    скрытность для всех + «штурм»=огонь на ходу + БТР без десанта не стреляет +
//    «Талреп-якорь» для АИРФ.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { HTML, ROOT } = require('./extract');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('✗', name, '—', e.message); }
}

// ─── 1. структура страницы ───
test('v13.073: быстрый старт обёрнут в <script>', () => {
  assert.ok(HTML.includes('<script>\n// ⚡ v13.071: БЫСТРЫЙ СТАРТ'), 'голый JS больше не виден');
});
test('v13.073: ровно один </html> и один </body> в конце', () => {
  assert.equal((HTML.match(/<\/html>/g) || []).length, 1, 'один </html>');
  assert.equal((HTML.match(/<\/body>/g) || []).length, 1, 'один </body>');
});
test('v13.073: roster-экран один и стоит до </body>', () => {
  assert.equal((HTML.match(/id="battalionRosterScreen"/g) || []).length, 1, 'один roster');
  assert.ok(HTML.indexOf('battalionRosterScreen') < HTML.indexOf('</body>'), 'roster до </body>');
});
test('v13.073: все inline-блоки сбалансированы', () => {
  // JS-комментарий «…в ОТДЕЛЬНОМ <script>-блоке выше» не считается тегом
  const noComments = HTML.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const opens = (noComments.match(/<script(\s|>)/g) || []).length;
  const closes = (noComments.match(/<\/script>/g) || []).length;
  assert.equal(opens, closes, `открытий ${opens} == закрытий ${closes}`);
});

// ─── 2. БТР-панель в обеих фазах ───
test('v13.073: слот opBtrSlot и перенос btrPanel', () => {
  assert.ok(/id="opBtrSlot"/.test(HTML), 'слот в разметке');
  assert.ok(/moveIntoSlot\('btrPanel', 'opBtrSlot'\)/.test(HTML), 'перенос в applyUxPhase');
});
test('v13.073: кнопки посадки/высадки БТР на месте', () => {
  assert.ok(/id="btrEmbarkBtn"/.test(HTML));
  assert.ok(/id="btrDisembarkBtn"/.test(HTML));
  assert.ok(/function showBtrEmbarkDialog\(/.test(HTML));
});

// ─── 3. строка «Следующий шаг» скрыта до заполнения ───
test('v13.073: opNextStepBar скрыт по умолчанию и включается из applyUxPhase', () => {
  assert.ok(/id="opNextStepBar" style="display:none/.test(HTML), 'по умолчанию скрыт');
  assert.ok(/stepBar\.style\.display = next \? 'flex' : 'none'/.test(HTML), 'показывается при тексте');
});

// ─── 4. скрытное движение — всем ───
test('v13.073: галочка «скрытно» доступна всем подвижным отрядам', () => {
  assert.ok(/const allowed = type === 'move' && !!unit && !isStaticOpUnit\(unit\);/.test(HTML), 'условие обновлено');
  assert.ok(/u\.stealthMove = !!stealthOrder;/.test(HTML), 'техника тоже ходит скрытно');
  assert.ok(/доступно всем отрядам/.test(HTML), 'подпись обновлена');
});

// ─── 5. БТР без десанта не стреляет ───
test('v13.073: canUnitShoot запрещает огонь БТР без десанта', () => {
  const i = HTML.indexOf('function canUnitShoot');
  const chunk = HTML.slice(i, i + 900);
  assert.ok(chunk.includes('isBtrTransport'), 'флаг БТР');
  assert.ok(/if \(isBtrTransport && !unit\.embarkedUnit && unit\.embarkedSquadIndex == null\) return false;/.test(chunk), 'запрет огня');
});

// ─── 6. огонь на ходу: штурм / десант + штраф ───
test('v13.073: opMovingFireAllowed — штурм для брони, десант для БТР', () => {
  assert.ok(/function opMovingFireAllowed\(unit\)/.test(HTML));
  const i = HTML.indexOf('function opMovingFireAllowed');
  const chunk = HTML.slice(i, i + 800);
  assert.ok(chunk.includes("o.behavior === 'assault'"), 'штурм-гейт');
  assert.ok(chunk.includes('embarkedUnit'), 'десант-гейт');
  assert.ok(/if \(!opMovingFireAllowed\(unit\)\) return;/.test(HTML), 'автоогонь на ходу ограничен');
});
test('v13.073: ручной обстрел после движения ограничен и оштрафован', () => {
  assert.ok(/shooter\.movedThisTurn && !opMovingFireAllowed\(shooter\)/.test(HTML), 'гейт в executeOpShootAt');
  assert.ok(/hitChance = hitChance \* opMovingFirePenalty\(shooter\)/.test(HTML), 'штраф ×0.35');
  assert.ok(/function opMovingFirePenalty/.test(HTML), 'функция штрафа');
});

// ─── 7. Талреп-якорь ───
test('v13.073: якорь открывает холмы технике (цена — весь ход)', () => {
  const i = HTML.indexOf('function getOpMoveCost');
  const chunk = HTML.slice(i, i + 1200);
  assert.ok(/if \(terrain === 'hill' && unit\.winch\) return Math\.max\(3, unit\.maxAp \|\| 4\);/.test(chunk), 'холм проходим с якорем');
});
test('v13.073: кнопка якоря для АИРФ в развёртывании', () => {
  assert.ok(/id="winchBtn"/.test(HTML), 'кнопка в разметке');
  assert.ok(/function grantWinchToSelected\(/.test(HTML), 'функция выдачи');
  assert.ok(/pf === 'A\.I\.R\.F\.'/.test(HTML), 'только АИРФ');
  assert.ok(/phase === 'deploy' && pf === 'A\.I\.R\.F\.'/.test(HTML), 'только в развёртывании');
});
test('v13.073: значок 🏔️ в списке отрядов', () => {
  assert.ok(/\$\{unit\.winch \? ' 🏔️' : ''\}/.test(HTML), 'бейдж в roster');
});

// ─── 8. ключевые id сохранены ───
['opEndTurnBtn','uxMoreBtn','opPhaseDeploy','opPhaseBattle','opPhaseRare','toastContainer',
 'orderStealthMove','assaultIgnoreArmor','opPlaceSelect'].forEach((id) => {
  test('v13.073: id ' + id + ' сохранён', () => {
    assert.ok(new RegExp('id="' + id + '"').test(HTML));
  });
});

console.log(`\nИтог v13.073: PASS ${passed} · FAIL ${failures.length}`);
if (failures.length) { console.log(failures.map(f => ' - ' + f).join('\n')); process.exit(1); }
