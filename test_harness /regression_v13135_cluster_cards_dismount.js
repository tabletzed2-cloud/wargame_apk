'use strict';
// ⚡ v13.135: регрессии пяти правок:
//   1 — штраф за скопление юнитов на оперативном гексе: урон каждого попадания
//       артиллерии/миномёта/САУ × (1 + 0.25 за каждого юнита сверх первого);
//   2 — «Спешиться»/«Сесть на велосипеды» показываются только спешиваемым
//       подразделениям (велосипедисты и т.п.), остальным — не показываются;
//   3 — драфт карт: 2 выбранные бонусные + 1 случайная (бонус или дебафф);
//   4 — «Комиссар» (АИРФ): 3 выбранные + ещё одна случайная; блокировка
//       «Мародёрство»/«Анархисты» сохранена;
//   5 — «Торговый дух» (BeVe): +2 выбранные (всего 4), без случайной карты.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { sliceFunction, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData, setRandom } = require('./sandbox');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (e) { failures.push(name + ': ' + e.message); console.error(`✗ ${name} — ${e.message}`); }
}

// ───────────────────────── П.1: штраф за скопление ─────────────────────────
test('п.1: множитель кластера растёт на 0.25 за юнита сверх первого', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'opClusterDamageMultiplier'));
  s.run(sliceFunction(HTML, 'applyOpClusterDamageMultiplier'));
  assert.equal(s.evalCtx('opClusterDamageMultiplier(1)'), 1);
  assert.equal(s.evalCtx('opClusterDamageMultiplier(2)'), 1.25);
  assert.equal(s.evalCtx('opClusterDamageMultiplier(3)'), 1.5);
  assert.equal(s.evalCtx('opClusterDamageMultiplier(5)'), 2);
  assert.equal(s.evalCtx('opClusterDamageMultiplier(0)'), 1);
  assert.equal(s.evalCtx('opClusterDamageMultiplier(undefined)'), 1);
});

test('п.1: applyOpClusterDamageMultiplier округляет и не режет ненулевой урон', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'opClusterDamageMultiplier'));
  s.run(sliceFunction(HTML, 'applyOpClusterDamageMultiplier'));
  assert.equal(s.evalCtx('applyOpClusterDamageMultiplier(4, 1)'), 4);
  assert.equal(s.evalCtx('applyOpClusterDamageMultiplier(4, 3)'), 6);   // 4 × 1.5
  assert.equal(s.evalCtx('applyOpClusterDamageMultiplier(10, 5)'), 20); // 10 × 2.0
  assert.equal(s.evalCtx('applyOpClusterDamageMultiplier(0, 5)'), 0);
  assert.equal(s.evalCtx('applyOpClusterDamageMultiplier(1, 2)'), 1);   // round(1.25)
});

test('п.1: обстрел площади по куче из 3 юнитов наносит ×1.5 урона каждому попаданию', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'opClusterDamageMultiplier'));
  s.run(sliceFunction(HTML, 'applyOpClusterDamageMultiplier'));
  s.run(sliceFunction(HTML, 'resolveOperationalAreaFire'));
  s.run(`
    function opHexHasTrenches(cell) { return false; }
    function opTrenchReducedDamage(d) { return d; }
    function applyOperationalArtilleryArmorHitsAtHex() {}
    function beginOpShellCapture() { return null; }
    function endOpShellCapture() {}
    function applyOperationalShellShock() {}
    function opVictimHiddenFromPlayer() { return false; }
    function recordOpShellVictim() {}
    function mkVictim(name) {
      return { name: name, col: 2, row: 2, isDestroyed: false, detected: true,
               squads: [{ fighters: [{ hp: 100 }] }] };
    }
    appData.campaign.currentTurn = 1;
    appData.campaign.enemyOpUnits = [mkVictim('взвод А'), mkVictim('взвод Б'), mkVictim('взвод В')];
    appData.campaign.opMapGrid['2,2'] = {
      types: ['grass'], markers: [],
      // owner='player' — бьём по врагам; turn 0 < currentTurn 1 — залп «созрел»
      areaFire: { owner: 'player', turn: 0, rounds: 2, unitName: 'Батарея', turnsLeft: 1 }
    };
  `);
  // Плотность (3 юнита): rounds = max(2, round(2 × 1.3)) = 3.
  // Раунд 1: попадание (0.0), цель №0 (0.0), кость 0.5 → урон 4 → ×1.5 = 6.
  // Раунд 2: попадание (0.0), цель №0 (0.0), кость 0.5 → урон 4 → ×1.5 = 6.
  // Раунд 3: промах (0.7 > 0.5) — без броска кости.
  setRandom(s, [0.0, 0.0, 0.5, 0.0, 0.0, 0.5, 0.7]);
  s.run('resolveOperationalAreaFire();');
  // враги: урон ушёл только по «взводу А» (индекс 0): 100 − 6 − 6 = 88
  assert.equal(s.evalCtx('appData.campaign.enemyOpUnits[0].squads[0].fighters[0].hp'), 88);
  assert.equal(s.evalCtx('appData.campaign.enemyOpUnits[1].squads[0].fighters[0].hp'), 100);
  assert.equal(s.evalCtx('appData.campaign.enemyOpUnits[2].squads[0].fighters[0].hp'), 100);
  assert.ok(s.logs.some(l => /Урон: 12/.test(l)), 'итог залпа в логе: ' + s.logs.join(' | '));
});

test('п.1: обстрел площади по одиночке — урон без множителя', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'opClusterDamageMultiplier'));
  s.run(sliceFunction(HTML, 'applyOpClusterDamageMultiplier'));
  s.run(sliceFunction(HTML, 'resolveOperationalAreaFire'));
  s.run(`
    function opHexHasTrenches(cell) { return false; }
    function opTrenchReducedDamage(d) { return d; }
    function applyOperationalArtilleryArmorHitsAtHex() {}
    function beginOpShellCapture() { return null; }
    function endOpShellCapture() {}
    function applyOperationalShellShock() {}
    function opVictimHiddenFromPlayer() { return false; }
    function recordOpShellVictim() {}
    appData.campaign.currentTurn = 1;
    appData.campaign.enemyOpUnits = [{ name: 'одиночка', col: 2, row: 2, isDestroyed: false,
      squads: [{ fighters: [{ hp: 100 }] }] }];
    appData.campaign.opMapGrid['2,2'] = {
      types: ['grass'], markers: [],
      areaFire: { owner: 'player', turn: 0, rounds: 2, unitName: 'Батарея', turnsLeft: 1 }
    };
  `);
  // 1 юнит: rounds = 2. Раунд 1: попадание (0.0), выбор жертвы (0.0), кость 0.5 → 4.
  // Раунд 2: промах (0.7).
  setRandom(s, [0.0, 0.0, 0.5, 0.7]);
  s.run('resolveOperationalAreaFire();');
  assert.equal(s.evalCtx('appData.campaign.enemyOpUnits[0].squads[0].fighters[0].hp'), 96);
});

test('п.1: executeMortarSalvo (миномёты/САУ) тоже применяет множитель кластера', () => {
  const mortar = sliceFunction(HTML, 'executeMortarSalvo');
  assert.ok(mortar.includes('applyOpClusterDamageMultiplier'),
    'залп миномёта/САУ использует applyOpClusterDamageMultiplier');
  const area = sliceFunction(HTML, 'resolveOperationalAreaFire');
  assert.ok(area.includes('applyOpClusterDamageMultiplier'),
    'обстрел площади использует applyOpClusterDamageMultiplier');
});

// ───────────────────────── П.2: видимость «Спешиться» ─────────────────────────
test('п.2: unitDismountOptionAllowed — только спешиваемым юнитам', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'unitDismountOptionAllowed'));
  // велосипедист верхом — обе опции по состоянию
  assert.equal(s.evalCtx(`unitDismountOptionAllowed({ mobility: 'bicycle' }, 'dismount')`), true);
  assert.equal(s.evalCtx(`unitDismountOptionAllowed({ mobility: 'bicycle' }, 'remount')`), false);
  // спешенный велосипедист — только «сесть»
  assert.equal(s.evalCtx(`unitDismountOptionAllowed({ mobility: 'bicycle', dismounted: true }, 'dismount')`), false);
  assert.equal(s.evalCtx(`unitDismountOptionAllowed({ mobility: 'bicycle', dismounted: true }, 'remount')`), true);
  // обычная пехота — ничего
  assert.equal(s.evalCtx(`unitDismountOptionAllowed({ mobility: 'foot' }, 'dismount')`), false);
  assert.equal(s.evalCtx(`unitDismountOptionAllowed({ mobility: 'foot' }, 'remount')`), false);
  assert.equal(s.evalCtx(`unitDismountOptionAllowed({}, 'dismount')`), false);
  assert.equal(s.evalCtx(`unitDismountOptionAllowed(null, 'dismount')`), false);
  // v13.137 (п.1): мотоциклы спешиваются наравне с велосипедистами
  //  (переопределяет v13.136 (п.9) «мотоциклы НЕ спешиваются»)
  assert.equal(s.evalCtx(`unitDismountOptionAllowed({ mobility: 'motorcycle' }, 'dismount')`), true);
  assert.equal(s.evalCtx(`unitDismountOptionAllowed({ mobility: 'motorcycle', dismounted: true }, 'remount')`), true);
});

test('п.2: updateOrderTypeDismountOptions прячет опции и сбрасывает выбранную', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'unitDismountOptionAllowed'));
  s.run(sliceFunction(HTML, 'updateOrderTypeDismountOptions'));
  s.run(`
    var sel = document.getElementById('orderType');
    sel.options = [
      { value: 'move', hidden: false, disabled: false },
      { value: 'dismount', hidden: false, disabled: false },
      { value: 'remount', hidden: false, disabled: false }
    ];
    sel.value = 'dismount';
  `);
  // пехота: обе опции скрыты; выбранная «dismount» сброшена
  s.run(`updateOrderTypeDismountOptions({ mobility: 'foot' });`);
  assert.equal(s.evalCtx(`document.getElementById('orderType').options[1].hidden`), true);
  assert.equal(s.evalCtx(`document.getElementById('orderType').options[2].hidden`), true);
  assert.equal(s.evalCtx(`document.getElementById('orderType').value`), '-1');
  // велосипедист верхом: «Спешиться» видна, «Сесть» — нет
  s.run(`
    var sel2 = document.getElementById('orderType');
    sel2.value = 'move';
    updateOrderTypeDismountOptions({ mobility: 'bicycle' });
  `);
  assert.equal(s.evalCtx(`document.getElementById('orderType').options[1].hidden`), false);
  assert.equal(s.evalCtx(`document.getElementById('orderType').options[2].hidden`), true);
});

test('п.2: композер спецприказов скрывает опции спешивания (operational_ui.js)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'operational_ui.js'), 'utf8');
  assert.ok(src.includes('visibleActions'), 'фильтр visibleActions есть');
  assert.ok(/value !== 'dismount' && value !== 'remount'\) \|\| canIssueSpecial\(unit, value\)/.test(src),
    'dismount/remount фильтруются по canIssueSpecial');
  assert.ok(!/actions\.map\(\(\[value, label\]\)/.test(src.replace(/visibleActions\.map/g, 'X.map')),
    'старый рендер без фильтра заменён');
});

test('п.2: на тактической карте кнопка — велосипедистам и мотоциклам (v13.137 п.1)', () => {
  assert.ok(/isBicycleTacticalSquad\(squad\) \|\| \(typeof isMotorcycleTacticalSquad === 'function' && isMotorcycleTacticalSquad\(squad\)\)/.test(HTML) ||
    /isBicycleTacticalSquad\(squad\) \|\| \(typeof isMotorcycleTacticalSquad === 'function' && isMotorcycleTacticalSquad\(squad\)\)/.test(fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8')),
    'map-панель: спешивание велосипедистам и мотоциклам');
  assert.ok(/\(currentSquad\.mobilityType === 'bicycle' \|\| currentSquad\.mobilityType === 'motorcycle'\) && !currentSquad\.dismounted/.test(HTML),
    'панель движения: спешивание велосипедистам и мотоциклам');
});

// ───────────────────────── П.3–5: карточный драфт ─────────────────────────
test('п.3: cardDraftBonusLimit — базово 2, Комиссар 3, Торговый дух 4', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'cardDraftBonusLimit'));
  assert.equal(s.evalCtx(`cardDraftBonusLimit([])`), 2);
  assert.equal(s.evalCtx(`cardDraftBonusLimit(['Ветераны'])`), 2);
  assert.equal(s.evalCtx(`cardDraftBonusLimit(['Комиссар'])`), 3);
  assert.equal(s.evalCtx(`cardDraftBonusLimit(['Торговый дух'])`), 4);
  assert.equal(s.evalCtx(`cardDraftBonusLimit(new Set(['Комиссар']))`), 3);
});

test('п.3–5: bonusCardSelectionLimit читает имена из обёрток { card }', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'cardDraftBonusLimit'));
  s.run(sliceFunction(HTML, 'hasCardNamed'));
  s.run(sliceFunction(HTML, 'bonusCardSelectionLimit'));
  assert.equal(s.evalCtx(`bonusCardSelectionLimit([{ card: { name: 'a' } }, { card: { name: 'b' } }])`), 2);
  assert.equal(s.evalCtx(`bonusCardSelectionLimit([{ card: { name: 'Комиссар' } }])`), 3);
  assert.equal(s.evalCtx(`bonusCardSelectionLimit([{ card: { name: 'Торговый дух' } }])`), 4);
  assert.equal(s.evalCtx(`bonusCardSelectionLimit([{ name: 'Торговый дух' }])`), 4);
});

test('п.3: случайная карта выдаётся при полном лимите (2 выбранные)', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'cardDraftBonusLimit'));
  s.run(sliceFunction(HTML, 'hasCardNamed'));
  s.run(sliceFunction(HTML, 'bonusCardSelectionLimit'));
  s.run(sliceFunction(HTML, 'cardSelectionNeedsDebuff'));
  // база: 2 бонуса → случайная; 1 бонус → без случайной
  assert.equal(s.evalCtx(`cardSelectionNeedsDebuff(2, [{ card: { name: 'a' } }, { card: { name: 'b' } }])`), true);
  assert.equal(s.evalCtx(`cardSelectionNeedsDebuff(1, [{ card: { name: 'a' } }])`), false);
  assert.equal(s.evalCtx(`cardSelectionNeedsDebuff(0, [])`), false);
});

test('п.4: «Комиссар» — случайная только после 3-й выбранной', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'cardDraftBonusLimit'));
  s.run(sliceFunction(HTML, 'hasCardNamed'));
  s.run(sliceFunction(HTML, 'bonusCardSelectionLimit'));
  s.run(sliceFunction(HTML, 'cardSelectionNeedsDebuff'));
  const hand = `[{ card: { name: 'Комиссар' } }, { card: { name: 'a' } }, { card: { name: 'b' } }]`;
  assert.equal(s.evalCtx(`cardSelectionNeedsDebuff(3, ${hand})`), true);
  assert.equal(s.evalCtx(`cardSelectionNeedsDebuff(2, ${hand})`), false);
});

test('п.5: «Торговый дух» — 4 выбора, случайная карта отменена', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceFunction(HTML, 'cardDraftBonusLimit'));
  s.run(sliceFunction(HTML, 'hasCardNamed'));
  s.run(sliceFunction(HTML, 'bonusCardSelectionLimit'));
  s.run(sliceFunction(HTML, 'cardSelectionNeedsDebuff'));
  const hand = `[{ card: { name: 'Торговый дух' } }, { card: { name: 'a' } }, { card: { name: 'b' } }, { card: { name: 'c' } }]`;
  assert.equal(s.evalCtx(`cardSelectionNeedsDebuff(4, ${hand})`), false);
  assert.equal(s.evalCtx(`bonusCardSelectionLimit(${hand})`), 4);
});

test('п.3–5: все три пути драфта используют общий триггер случайной карты', () => {
  // начальная раздача (commitInitialCampaignCardAssignments), боевой драфт
  // кампании (activateSelectedCampaignCards) и одиночный бой (activateSelectedCards)
  // sliceFunction не матчит `async function` — срезаем по копии без async.
  const HTML_SYNC = HTML.replace(/async function /g, 'function ');
  for (const fn of ['commitInitialCampaignCardAssignments', 'activateSelectedCampaignCards', 'activateSelectedCards']) {
    const body = sliceFunction(HTML_SYNC, fn);
    assert.ok(body.includes('cardSelectionNeedsDebuff('), `${fn} использует cardSelectionNeedsDebuff`);
    assert.ok(body.includes('cardDraftBonusLimit('), `${fn} использует cardDraftBonusLimit`);
    assert.ok(!/bonusCount >= 3 && !hasTradeSpirit/.test(body), `${fn}: старый триггер удалён`);
  }
});

test('п.4: блокировка «Мародёрство»/«Анархисты» сохранена', () => {
  assert.ok(HTML.includes('Мародёрство') && HTML.includes('Анархисты'), 'карты упоминаются');
  assert.ok(/Мародёрство[^<]{0,80}Анархисты[^<]{0,40}не разыгрываются|Анархисты[^<]{0,80}не разыгрываются/.test(HTML),
    'правило блокировки в текстах сохранено');
});

test('тексты правил обновлены под новую схему драфта', () => {
  assert.ok(HTML.includes('до 2 выбранных бонусных карточек') || HTML.includes('до 2 бонусных карт'),
    'тексты говорят о 2 выбранных');
  assert.ok(HTML.includes('Торговый дух') && /«Торговый дух»[^<]{0,120}без случайной/.test(HTML),
    '«Торговый дух» — без случайной');
  assert.ok(!HTML.includes('третья добавляет случайную четвёртую'),
    'старый текст про «третью добавляет четвёртую» удалён');
  assert.ok(!HTML.includes('Лимит бонусных карт: 3'), 'старый лимит 3 удалён');
});

test('APP_VERSION поднят до v13.137', () => {
  const m = /var APP_VERSION = '([^']+)'/.exec(HTML);
  assert.ok(m, 'APP_VERSION найден');
  assert.equal(m[1], 'v13.137');
});

// ───────────────────────── итог ─────────────────────────
console.log(`\nИтог: ${passed} OK, ${failures.length} FAIL`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
