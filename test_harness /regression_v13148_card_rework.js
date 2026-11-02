'use strict';
// ⚡ v13.148: правки карточек бонусов/дебаффов (пп. 1–5).
//   1 — карточки фракций больше не дублируются в разделе «Общие»;
//   2 — новые общие карточки: «Небоевая потеря» (1 боец) и «Адреналин» (рывок +1 гекс, −2 ОД);
//   3 — «Geen Duibreed Terug!» стала кнопкой штаба (+20 духа, 1 раз за бой);
//   4 — «Скоординированный заградительный огонь»: подавление 1,5 ОД вместо 2,5 ОД;
//   5 — «Санитар»: боец-медик в штабе, лечит 1 бойца за фазу игрока и 5 за оперход.
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData, setRandom } = require('./sandbox');

// песочница подхватывает /tmp/wg_part.js от предыдущего блока — стартуем с пустого
fs.writeFileSync('/tmp/wg_part.js', '');

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

// ───────────────────────── п.1: без дублей в «Общих» ─────────────────────────
{
    const s = createSandbox(freshAppData());
    const conflicts = s.evalCtx('cardCatalogOwnerConflicts()');
    ok(Array.isArray(conflicts) && conflicts.length === 0,
        'ни одна карта фракции не дублируется в общем каталоге', JSON.stringify(conflicts));
    const globals = s.evalCtx('GLOBAL_CARDS.map(c => c.name)');
    ok(globals.includes('Небоевая потеря') && globals.includes('Адреналин'),
        'в «Общих» появились «Небоевая потеря» и «Адреналин»', JSON.stringify(globals));
    ok(!globals.includes('Geen Duibreed Terug!') && !globals.includes('Санитар'),
        'карты BeVe «Geen Duibreed Terug!» и «Санитар» в «Общих» отсутствуют');
    ok(s.evalCtx("BEVE_CARDS.some(c => c.name === 'Санитар' && /санитары беве\\.png/.test(c.icon || ''))"),
        '«Санитар» есть в каталоге BeVe с картинкой images/санитары беве.png');
    ok(s.evalCtx("GLOBAL_CARDS.find(c => c.name === 'Небоевая потеря').type") === 'negative',
        '«Небоевая потеря» — дебафф');
    ok(s.evalCtx("GLOBAL_CARDS.find(c => c.name === 'Адреналин').type") === 'bonus',
        '«Адреналин» — бонус');
    ok(fs.existsSync(path.join(ROOT, 'images/Небоевая потеря.png')) &&
       fs.existsSync(path.join(ROOT, 'images/Адреналин.png')),
        'у новых карточек есть сгенерированные картинки');
    // Старые сохранённые копии карт подтягивают новый текст/эффект.
    ok(sliceFunction(HTML, 'syncFactionCatalogs').includes("'Geen Duibreed Terug!', 'Скоординированный заградительный огонь', 'Санитар', 'Небоевая потеря', 'Адреналин'"),
        'старые сейвы получают обновлённые тексты карт');
}

// ───────────────────────── п.4: цена подавления ─────────────────────────
{
    const s = createSandbox(freshAppData());
    for (const n of ['TACTICAL_SUPPRESSIVE_COST', 'TACTICAL_COORDINATED_BARRAGE_COST', 'ADRENALINE_AP_PENALTY', 'MEDIC_OPERATIONAL_HEALS'])
        s.run(sliceConst(HTML, n));
    for (const fn of ['tacticalHasCoordinatedBarrage', 'tacticalSuppressiveFireCost', 'tacticalOdLabel'])
        s.run(sliceFunction(HTML, fn));
    s.run(`function tacticalSquadHasCard(){return false;}`);
    ok(s.evalCtx("tacticalSuppressiveFireCost({name:'Пехотное отделение'})") === 5,
        'обычное подавление — 2,5 ОД');
    ok(s.evalCtx("tacticalSuppressiveFireCost({name:'Пехотное отделение',effects:{coordinatedBarrage:true}})") === 3,
        'со «Скоординированным заградительным огнём» — 1,5 ОД');
    ok(s.evalCtx('tacticalOdLabel(3)') === '1,5 ОД', 'подпись цены — «1,5 ОД»', s.evalCtx('tacticalOdLabel(3)'));
    const supp = sliceFunction(HTML, 'suppressiveFire');
    ok(supp.includes('tacticalSuppressiveFireCost'), 'заградительный огонь берёт цену из tacticalSuppressiveFireCost');
    ok(s.evalCtx('ADRENALINE_AP_PENALTY') === 4 && s.evalCtx('MEDIC_OPERATIONAL_HEALS') === 5,
        'штраф рывка = 2 ОД (4 полу-ОД), санитар лечит 5 бойцов за оперход');
}

// ───────────────────────── п.2–5: эффекты карт на взвод ─────────────────────────
{
    fs.writeFileSync('/tmp/wg_part.js', [
        sliceFunction(HTML, 'cardMedicPistolName'),
        sliceFunction(HTML, 'squadHasMedicFighter'),
        sliceFunction(HTML, 'addCardMedicToSquad'),
        sliceFunction(HTML, 'applyCardToPlatoon')
    ].join('\n\n'));
    const s = createSandbox(freshAppData());
    s.run(`
      function addAppliedCardName(squad, name){ (squad.appliedCards = squad.appliedCards || []).push(name); }
      function appendCardAddedSquad(){ return false; }
      function assignUniqueCrewKeys(){}
      function handleFighterDeath(squad){ squad.deaths = (squad.deaths || 0) + 1; }
      function updateTacticalBattleRetreatButton(){}
      function getFactionWeapons(){ return [{ name: 'Пистолет FN 1922' }]; }
      function tacticalCurrentCellForSquad(){ return null; }
      function mkSquad(name, fighters){ return { name: name, faction: 'BeVe', fighters: fighters, currentMorale: 60 }; }
      // у штаба двое: дебафф «Небоевая потеря» не должен уносить единственного бойца,
      // иначе отряд перестаёт быть «живым» и остальные проверки теряют смысл.
      var hq = mkSquad('Штаб взвода', [{ name: 'Лейтенант', hp: 3, maxHp: 3, isCommander: true },
                                       { name: 'Связной', hp: 3, maxHp: 3 }]);
      var inf = mkSquad('Пехотное отделение', [{ name: 'Стрелок', hp: 3, maxHp: 3 }, { name: 'Стрелок 2', hp: 3, maxHp: 3 }]);
      var platoon = { name: 'Взвод', squads: [hq, inf] };
      var squads = [hq, inf];
      function card(name){ return { name: name }; }
    `);

    // «Небоевая потеря»: ровно один отряд, ровно один боец.
    s.run(`var before = (hq.fighters.concat(inf.fighters)).filter(f => f.hp > 0).length;
      applyCardToPlatoon(card('Небоевая потеря'), 'BeVe', platoon, squads, [], { initial: true });
      var after = (hq.fighters.concat(inf.fighters)).filter(f => f.hp > 0).length;
      var deadSquads = [hq, inf].filter(sq => sq.fighters.some(f => f.hp <= 0)).length;
      var deadFighters = (hq.fighters.concat(inf.fighters)).filter(f => f.hp <= 0).length;`);
    ok(s.evalCtx('before - after') === 1, '«Небоевая потеря»: выбыл ровно один боец',
        `${s.evalCtx('before')} → ${s.evalCtx('after')}`);
    ok(s.evalCtx('deadSquads') === 1 && s.evalCtx('deadFighters') === 1,
        '«Небоевая потеря»: потерян боец только в одном отряде');
    ok(s.evalCtx('[hq, inf].filter(sq => sq.deaths).length') === 1,
        'смерть бойца обработана через handleFighterDeath');

    // «Адреналин»: эффект у всех отрядов взвода.
    s.run(`applyCardToPlatoon(card('Адреналин'), 'BeVe', platoon, squads, [], { initial: true });`);
    ok(s.evalCtx("squads.every(sq => sq.effects && sq.effects.adrenaline && sq.effects.adrenaline.active)"),
        '«Адреналин» выдан каждому отряду взвода');

    // «Geen Duibreed Terug!»: эффект штаба, без запрета движения и без пассивного духа.
    s.run(`inf.canMove = true; applyCardToPlatoon(card('Geen Duibreed Terug!'), 'BeVe', platoon, squads, [], { initial: true });`);
    ok(s.evalCtx("squads.every(sq => sq.effects && sq.effects.geenDuibreed)"),
        '«Geen Duibreed Terug!» включил способность у всех отрядов взвода');
    ok(s.evalCtx('inf.canMove') !== false, 'карта больше не запрещает движение отрядам');

    // «Скоординированный заградительный огонь»: только эффект дешёвого подавления.
    s.run(`applyCardToPlatoon(card('Скоординированный заградительный огонь'), 'BeVe', platoon, squads, [], { initial: true });`);
    ok(s.evalCtx("squads.every(sq => sq.effects && sq.effects.coordinatedBarrage)"),
        '«Скоординированный заградительный огонь» помечает отряды взвода');

    // «Санитар»: боец-медик с пистолетом в штабе, только один.
    s.run(`applyCardToPlatoon(card('Санитар'), 'BeVe', platoon, squads, [], { initial: true });
      var medic = hq.fighters.find(f => f.isMedic);
      var medicCount = hq.fighters.filter(f => f.isMedic).length;
      applyCardToPlatoon(card('Санитар'), 'BeVe', platoon, squads, [], { initial: true });
      var medicCount2 = hq.fighters.filter(f => f.isMedic).length;`);
    ok(s.evalCtx('!!medic') && s.evalCtx('medic.weapon') === 'Пистолет FN 1922',
        'в штаб добавлен санитар с пистолетом', String(s.evalCtx('medic && medic.weapon')));
    ok(s.evalCtx('medicCount') === 1 && s.evalCtx('medicCount2') === 1,
        'второй санитар не добавляется');
    ok(s.evalCtx('medic.isCommander') !== true, 'санитар не считается командиром');
}

// ───────────────────────── п.2: рывок «Адреналина» ─────────────────────────
{
    fs.writeFileSync('/tmp/wg_part.js', [
        sliceFunction(HTML, 'tacticalAdrenalineBattleKey'),
        sliceFunction(HTML, 'tacticalAdrenalineCardActive'),
        sliceFunction(HTML, 'tacticalAdrenalineUsedThisBattle'),
        sliceFunction(HTML, 'tacticalAdrenalineAvailable'),
        sliceFunction(HTML, 'tacticalAdrenalineArm'),
        sliceFunction(HTML, 'tacticalAdrenalineCancel'),
        sliceFunction(HTML, 'tacticalAdrenalineDashClick')
    ].join('\n\n'));
    const s = createSandbox(freshAppData());
    s.run(`
      appData.map = appData.map || {};
      function tacticalMoraleBattleKey(){ return 'battle-42'; }
      function getHexNeighbors(key){ return { '5,5': ['6,5', '5,6'], '6,5': ['5,5'] }[key] || []; }
      function getMovementCost(){ return 1; }
      function mapActionInfo(){}
      function renderActiveCardButtons(){}
      var movedPath = null;
      function tacticalMoveAlongPath(idx, p, key){ movedPath = { idx: idx, free: p.freeStepKey, src: p.freeStepSource, key: key }; return true; }
      var currentSquadIndex = 0;
      var squad = { name: 'Пехотное отделение', hexPos: [5, 5], effects: { adrenaline: { active: true } },
                    fighters: [{ name: 'Стрелок', hp: 3 }] };
      var currentSquad = squad;
      appData.squads = [squad];
    `);
    s.run('tacticalAdrenalineArm();');
    ok(s.evalCtx('!!appData.map.pendingAdrenalineDash'), 'кнопка «Рывок» включает режим выбора гекса');
    s.run('tacticalAdrenalineDashClick("6,5");');
    ok(s.evalCtx('movedPath && movedPath.free') === '6,5' && s.evalCtx('movedPath.src') === 'adrenaline',
        'рывок проходит шаг без затрат ОД', JSON.stringify(s.evalCtx('movedPath')));
    ok(s.evalCtx("squad.adrenalineUsedBattleKey") === 'battle-42',
        'рывок отмечен как использованный в этом бою');
    ok(s.evalCtx('squad.adrenalineApPenaltyPending') === true, 'назначен штраф −2 ОД в следующей фазе');
    ok(s.evalCtx('tacticalAdrenalineAvailable(squad)') === false, 'второй рывок в том же бою недоступен');

    // Непроходимый/не соседний гекс не тратит рывок.
    const strict = createSandbox(freshAppData());
    strict.run(`
      appData.map = appData.map || {};
      function tacticalMoraleBattleKey(){ return 'battle-7'; }
      function getHexNeighbors(){ return ['6,5']; }
      function getMovementCost(){ return Infinity; }
      function mapActionInfo(){}
      function renderActiveCardButtons(){}
      function tacticalMoveAlongPath(){ return true; }
      var currentSquadIndex = 0;
      var squad = { name: 'Пехотное отделение', hexPos: [5, 5], effects: { adrenaline: { active: true } },
                    fighters: [{ name: 'Стрелок', hp: 3 }] };
      var currentSquad = squad;
      appData.squads = [squad];
      tacticalAdrenalineArm();
      tacticalAdrenalineDashClick('6,5');
      var usedAfterBlocked = squad.adrenalineUsedBattleKey || '';
    `);
    ok(strict.evalCtx('usedAfterBlocked') === '', 'непроходимый гекс не расходует рывок');

    // В следующем бою рывок снова доступен.
    const fresh = createSandbox(freshAppData());
    fresh.run(`
      appData.map = appData.map || {};
      function tacticalMoraleBattleKey(){ return 'battle-2'; }
      var currentSquad = { name: 'Пехотное отделение', hexPos: [1, 1], effects: { adrenaline: { active: true } },
                           adrenalineUsedBattleKey: 'battle-1', fighters: [{ hp: 3 }] };
      appData.squads = [currentSquad];
    `);
    ok(fresh.evalCtx('tacticalAdrenalineAvailable(currentSquad)') === true,
        'в новом бою рывок доступен снова');
    ok(fresh.evalCtx("(function(){var sq={name:'Пехотное отделение',fighters:[{hp:3}]};return tacticalAdrenalineAvailable(sq);})()") === false,
        'без карточки «Адреналин» рывка нет');
    ok(sliceFunction(HTML, 'nextTurn').includes('ADRENALINE_AP_PENALTY') &&
       sliceFunction(HTML, 'nextTurn').includes('_tempAPReduction'),
        'штраф −2 ОД применяется на старте следующей фазы игрока');
    ok(HTML.includes("'adrenalineUsedBattleKey', 'adrenalineApPenaltyPending', 'geenDuibreedUsedBattleKey'"),
        'состояние рывка и способности штаба переживает сборку боя');
}

// ───────────────────────── п.3: кнопка штаба ─────────────────────────
{
    fs.writeFileSync('/tmp/wg_part.js', [
        sliceFunction(HTML, 'tacticalNormalizeMoraleScale'),
        sliceFunction(HTML, 'tacticalMoraleScale'),
        sliceFunction(HTML, 'tacticalMoraleCurrent'),
        sliceFunction(HTML, 'tacticalAdrenalineBattleKey'),
        sliceFunction(HTML, 'tacticalGeenDuibreedStatus'),
        sliceFunction(HTML, 'tacticalGeenDuibreedUse')
    ].join('\n\n'));
    const s = createSandbox(freshAppData());
    s.run(`
      function tacticalMoraleBattleKey(){ return 'b-1'; }
      function mapActionInfo(){}
      function renderActiveCardButtons(){}
      var currentSquad, currentSquadIndex = 0, morale = 0;
      var hq = { name: 'Штаб взвода', currentMorale: 30, baseMorale: 100, tacticalMoraleScaleVersion: 1,
                 effects: { geenDuibreed: true }, fighters: [{ isCommander: true, hp: 3 }] };
      var inf = { name: 'Пехотное отделение', currentMorale: 95, baseMorale: 100, tacticalMoraleScaleVersion: 1,
                  fighters: [{ hp: 3 }] };
      var dead = { name: 'Разбитое отделение', currentMorale: 10, baseMorale: 100, tacticalMoraleScaleVersion: 1,
                   isDestroyed: true, fighters: [{ hp: 0 }] };
      appData.squads = [hq, inf, dead];
      currentSquad = inf;
    `);
    ok(s.evalCtx('tacticalGeenDuibreedStatus(inf).ok') === false,
        'не-штабу способность недоступна');
    s.run('currentSquad = hq;');
    ok(s.evalCtx('tacticalGeenDuibreedStatus(hq).ok') === true, 'у штаба с живым командиром кнопка активна');
    s.run('tacticalGeenDuibreedUse();');
    ok(s.evalCtx('hq.currentMorale') === 50, '+20 духа штабу', String(s.evalCtx('hq.currentMorale')));
    ok(s.evalCtx('inf.currentMorale') === 100, '+20 духа остальным, но не выше шкалы', String(s.evalCtx('inf.currentMorale')));
    ok(s.evalCtx('dead.currentMorale') === 10, 'уничтоженный отряд дух не получает');
    ok(s.evalCtx('tacticalGeenDuibreedStatus(hq).ok') === false, 'второй раз за бой недоступно');
    s.run(`hq.geenDuibreedUsedBattleKey = ''; hq.fighters[0].hp = 0;`);
    ok(s.evalCtx('tacticalGeenDuibreedStatus(hq).ok') === false, 'без живого командира кнопки нет');
    const moraleSrc = sliceFunction(HTML, 'getEffectiveMorale');
    ok(!/geenDuibreed\s*(\?|&&|\+|:)/.test(moraleSrc) && !moraleSrc.includes('geenDuibreed ?'),
        'пассивный +дух «Geen Duibreed» из расчёта духа убран');
}

// ───────────────────────── п.5: санитар ─────────────────────────
{
    fs.writeFileSync('/tmp/wg_part.js', [
        sliceConst(HTML, 'MEDIC_OPERATIONAL_HEALS'),
        sliceFunction(HTML, 'squadHasMedicFighter'),
        sliceFunction(HTML, 'tacticalMedicHealPhase'),
        sliceFunction(HTML, 'operationalMedicHeal')
    ].join('\n\n'));
    const s = createSandbox(freshAppData());
    s.run(`
      function mkFighter(name, hp, maxHp, extra){ return Object.assign({ name: name, hp: hp, maxHp: maxHp }, extra || {}); }
      var hq = { name: 'Штаб взвода', opUnitName: 'Взвод', fighters: [
        mkFighter('Лейтенант', 3, 3, { isCommander: true }),
        mkFighter('Санитар', 3, 3, { isMedic: true }),
        mkFighter('Раненый 1', 1, 3),
        mkFighter('Раненый 2', 2, 3),
        mkFighter('Убитый', 0, 3)
      ] };
      var inf = { name: 'Пехотное отделение', opUnitName: 'Взвод', fighters: [
        mkFighter('Целый', 3, 3), mkFighter('Раненый 3', 1, 3)
      ] };
      appData.squads = [hq, inf];
      Math.random = function(){ return 0; }; // детерминированный выбор раненого
    `);
    s.run('var healedPhase = tacticalMedicHealPhase();');
    ok(s.evalCtx('healedPhase') === 1, 'за фазу игрока санитар лечит одного бойца', String(s.evalCtx('healedPhase')));
    ok(s.evalCtx("hq.fighters.find(f => f.name === 'Раненый 1').hp") === 3,
        'вылеченный боец восстановлен до максимума');
    ok(s.evalCtx("hq.fighters.find(f => f.name === 'Убитый').hp") === 0, 'убитого санитар не оживляет');
    ok(s.evalCtx("hq.fighters.find(f => f.name === 'Раненый 2').hp") === 2 &&
       s.evalCtx("inf.fighters.find(f => f.name === 'Раненый 3').hp") === 1,
        'за одну фазу вылечен только один боец на взвод (остальные ждут)');
    s.run('var healedPhase2 = tacticalMedicHealPhase();');
    ok(s.evalCtx('healedPhase2') === 1, 'в следующую фазу — снова один боец');

    // Вне боя: до 5 раненых за оперативный ход.
    const op = createSandbox(freshAppData());
    op.run(`
      function mkFighter(name, hp, maxHp, extra){ return Object.assign({ name: name, hp: hp, maxHp: maxHp }, extra || {}); }
      var wounded = [];
      for (var i = 0; i < 9; i++) wounded.push(mkFighter('Раненый ' + i, 1, 3));
      appData.campaign.opUnits = [
        { name: 'Взвод', squads: [{ name: 'Штаб взвода', fighters: [mkFighter('Санитар', 3, 3, { isMedic: true })].concat(wounded) }] },
        { name: 'Взвод в бою', isInBattle: true, squads: [{ name: 'Штаб взвода', fighters: [
            mkFighter('Санитар', 3, 3, { isMedic: true }), mkFighter('Раненый в бою', 1, 3)] }] },
        { name: 'Без санитара', squads: [{ name: 'Пехотное отделение', fighters: [mkFighter('Раненый', 1, 3)] }] }
      ];
      var healedOp = operationalMedicHeal();
      var stillWounded = wounded.filter(f => f.hp < f.maxHp).length;
      var inBattleHp = appData.campaign.opUnits[1].squads[0].fighters[1].hp;
      var noMedicHp = appData.campaign.opUnits[2].squads[0].fighters[0].hp;
    `);
    ok(op.evalCtx('healedOp') === 5, 'вне боя санитар лечит 5 бойцов за оперход', String(op.evalCtx('healedOp')));
    ok(op.evalCtx('stillWounded') === 4, 'остальные раненые ждут следующего оперхода');
    ok(op.evalCtx('inBattleHp') === 1, 'в бою действует фазовое правило — оперход не лечит');
    ok(op.evalCtx('noMedicHp') === 1, 'без санитара взвод не лечится');
    ok(sliceFunction(HTML, 'endOperationalTurn').includes('operationalMedicHeal'),
        'лечение вне боя вызывается на завершении оперхода');
    ok(sliceFunction(HTML, 'nextTurn').includes('tacticalMedicHealPhase'),
        'лечение в тактике вызывается на старте фазы игрока');
}

// не оставляем свой срез следующему тесту в общем /tmp/wg_part.js
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

console.log(`Итог v13.148: PASS ${pass} · FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
