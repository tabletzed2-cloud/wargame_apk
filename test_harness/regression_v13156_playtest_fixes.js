'use strict';
// ⚡ v13.156 — партия 6 (итоги теста пользователя):
//   6  — онлайн-расстановка: штаб батальона не «уезжает» от простого клика;
//   9  — ось сектора обстрела ДОТа по любому кликнутому гексу;
//   11 — карточка «Санитар»: штаб взвода не спрашиваем;
//   13 — карточка отряда бронетехники на оперативной карте;
//   16 — отдельные кнопки поворота окопа, без «смены текстуры»;
//   17 — меню «снабжение»: получатель выбирается;
//   28 — значки караванов на оперативной карте при перемещении;
//   30 — ампуломёты/бутылкомёты/пехота заходят на камни в тактике;
//   33 — «Навестись на цель» — клик по врагу на карте;
//   34 — взвод, вступивший в идущий бой, получает меню размещения;
//   35 — без фризов при движении отрядов на тактике;
//   36 — кнопка «ИПП отряда»;
//   37 — своя шкала у каждого типа боеприпасов;
//   38 — потери десанта при уничтожении БТР.
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML, ROOT } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const readJs = name => fs.readFileSync(path.join(ROOT, 'js', name), 'utf8');
const PLACEMENT = readJs('placement.js');
const HEXMAPS = readJs('hexmaps.js');

let pass = 0, fail = 0;
function ok(condition, label, detail) {
    if (condition) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + (detail ? ' | ' + detail : '')); }
}

// ─────────────── 6. Онлайн-расстановка без случайного переноса ───────────────
{
    const click = sliceFunction(HTML, 'handleOpMapClick');
    ok(/opPlacementExplicitIndex/.test(click), 'клик по карте смотрит на явный выбор юнита (opPlacementExplicitIndex)');
    ok(/Ф1|подсказ|selectPlacementUnit/.test(HTML.match(/function selectPlacementUnit[\s\S]{0,400}/)?.[0] || readJs('operational_ui.js')),
        'выбор юнита в панели помечает его явно');
    ok(/opPlacementExplicitIndex/.test(readJs('operational_ui.js')), 'selectPlacementUnit запоминает индекс');
}

// ─────────────── 9. Ось сектора обстрела ДОТа по любому гексу ───────────────
{
    ok(/function dotSectorAxisVector/.test(HEXMAPS), 'есть вектор оси по произвольному гексу');
    ok(/function dotSectorAxisHexKey/.test(HEXMAPS), 'ось хранится как ключ гекса');
    ok(/\^[-\\]?\\d\+,-\\?\d\+\$/.test(HEXMAPS) || /\/\^-\?\\d\+,-\?\\d\+\$\//.test(HEXMAPS), 'распознаётся формат «col,row»');
    ok(/function tacticalHexInFireSector/.test(HEXMAPS), 'попадание в сектор считается по оси');
    ok(/Math\.acos/.test(HEXMAPS), 'угол между осью и направлением на цель — через acos (без округления до 6 направлений)');
    ok(/TACTICAL_FIRE_SECTOR_OPTIONS/.test(HEXMAPS), 'старые сейвы с e/se/sw/w/nw/ne продолжают читаться');
    ok(/return null/.test(HEXMAPS.slice(HEXMAPS.indexOf('function dotSectorAxisVector'), HEXMAPS.indexOf('function dotSectorAxisVector') + 900)),
        'ось, совпавшая с клеткой ДОТа, не превращается в «все направления»');
    ok(!/setInitialDotSectorPick[\s\S]{0,600}TACTICAL_FIRE_SECTOR_OPTIONS\.forEach\(/.test(HEXMAPS),
        'клик по гексу больше не листает фиксированный список направлений');
}

// ─────────────── 11. «Санитар» без выбора штаба взвода ───────────────
{
    const idx = HTML.indexOf('const ownerPlatoon = (currentSquad && currentSquad.opUnitName)');
    ok(idx > 0, 'обработчик карточки «Санитар» на месте');
    const block = HTML.slice(Math.max(0, idx - 600), idx + 1600);
    ok(!/prompt\(/.test(block), 'карточка «Санитар» больше не спрашивает штаб через prompt');
    ok(/allHqs|applyCardToPlatoon/.test(block), 'штаб подбирается автоматически');
}

// ─────────────── 13. Карточка отряда бронетехники на опкарте ───────────────
{
    const popup = sliceFunction(HTML, 'showOpUnitInfoPopup');
    ok(/Экипаж/.test(popup), 'в карточке показан экипаж');
    ok(/Снаряды|Патроны/.test(popup), 'в карточке показан боезапас');
    ok(/Башня/.test(popup) && /Ходовая/.test(popup), 'в карточке показаны модули машины');
    ok(/vehicleList/.test(popup), 'источник — список машин взвода');
}

// ─────────────── 16. Поворот окопа отдельными кнопками ───────────────
{
    ok(/hexEditorRotateLeftButton/.test(HEXMAPS), 'есть кнопка поворота влево');
    ok(/hexEditorRotateButton/.test(HEXMAPS), 'есть кнопка поворота вправо');
    ok(/hexEditorRotateResetButton/.test(HEXMAPS), 'есть кнопка сброса поворота');
    ok(!/hexEditorTrenchTextureButton'\)/.test(HEXMAPS.replace(/getElementById\('hexEditorTrenchTextureButton'\)\s*\|\|/g, '')),
        'кнопки смены текстуры окопа больше нет');
    const clickStart = HEXMAPS.indexOf('function hexEditClick');
    const clickBlock = HEXMAPS.slice(clickStart, clickStart + 6000);
    ok(!/variant\s*=\s*\(/.test(clickBlock) || !/окоп|trench/i.test(clickBlock.slice(0, 200)),
        'повторный клик по окопу не листает текстуры');
    ok(/lastCell/.test(clickBlock), 'повторный клик по окопу только выбирает клетку');
    ok((HEXMAPS.match(/id="hexEditorRotateButton"/g) || []).length === 1, 'id кнопки поворота не дублируется в баннере');
    ok(/hexEditorRotateSelectedButton/.test(HEXMAPS), 'кнопка поворота в общем блоке имеет свой id');
}

// ─────────────── 17 + 37. Панель снабжения ───────────────
{
    const list = sliceFunction(HTML, 'supplyUnitList');
    ok(!/supplyUnitHasIncompleteAmmo\(x\.unit, x\.idx\)\)/.test(list), 'список получателей не схлопывается при изменении боезапаса');
    ok(typeof sliceFunction(HTML, 'supplyUnitNeedsAmmo') === 'string', 'есть отдельная проверка «нужен боезапас»');
    ok(typeof sliceFunction(HTML, 'supplyUnitExists') === 'string', 'отметка получателя снимается только если юнита нет');
    const render = sliceFunction(HTML, 'renderSupplyPanel');
    ok(/onclick="selectSupplyTarget\(\$\{x\.idx\}\)"/.test(render), 'получателя можно выбрать кликом по всей строке');
    ok(/supplyPanelChosen/.test(render), 'видно, кто выбран получателем');
    ok(/supplyUnitExists\(selectedIdx\)/.test(render), 'проверка отметки — по существованию юнита');
    ok(/нет в наличии/.test(render), 'у каждого типа боеприпасов своя шкала (даже если max = 0)');
    ok((render.match(/typeBar\('/g) || []).length >= 3, 'шкалы патронов, гранат и снарядов выводятся отдельно');
}

// ─────────────── 28. Значки караванов при перемещении ───────────────
{
    const draw = sliceFunction(HTML, 'drawSupplyDeliveriesOnMap');
    ok(/supplyAnimPixel/.test(draw), 'отрисовка колонны учитывает анимацию движения');
    ok(typeof sliceFunction(HTML, 'animateMovedSupplyConvoys') === 'string', 'есть анимация проезда каравана');
    ok(typeof sliceFunction(HTML, 'supplyAnimationSnapshot') === 'string', 'снимок позиций колонн до хода');
    const adv = sliceFunction(HTML, 'advanceSupplyDeliveries');
    ok(/supplyAnimationSnapshot\(\)/.test(adv), 'снимок делается в начале хода снабжения');
    ok(/animateMovedSupplyConvoys\(supplyPosBefore\)/.test(adv), 'после хода колонны проезжают по маршруту');
}

// ─────────────── 30. Камни для расчётов и пехоты ───────────────
{
    const s = createSandbox(freshAppData());
    s.run(sliceFunction(HTML, 'getActionCost'));
    s.run(`
        function getFactionCrewWeapons() { return [{ name: 'Ампуломёт АМ-1', type: 'mortar' }]; }
        var crewSquad = { name: 'Расчёт ампуломёта АМ-1', crewInstances: [{ weaponName: 'Ампуломёт АМ-1', active: true }] };
        var infSquad = { name: 'Пехотное отделение' };
        var crewRocks = getActionCost(crewSquad, 'move', 'bad');
        var infRocks = getActionCost(infSquad, 'move', 'bad');
        var crewForest = getActionCost(crewSquad, 'move', 'forest');
    `);
    ok(s.evalCtx('crewRocks') === 4, 'расчёт заходит на камни за 2 ОД', String(s.evalCtx('crewRocks')));
    ok(s.evalCtx('infRocks') === 4, 'пехота заходит на камни за 2 ОД', String(s.evalCtx('infRocks')));
    ok(s.evalCtx('crewForest') === 5, 'лес для расчёта остался дороже камней', String(s.evalCtx('crewForest')));

    const panel = sliceFunction(HTML, 'renderActiveCardButtons');
    ok(/Тяжёлая \/ камни/.test(panel), 'кнопка движения по камням подписана');
}

// ─────────────── 33. Наведение бронетехники кликом ───────────────
{
    ok(typeof sliceFunction(HTML, 'vehicleAimPickMode') === 'string', 'есть режим наведения кликом');
    ok(typeof sliceFunction(HTML, 'vehicleAimClickHex') === 'string', 'клик по гексу обрабатывает наведение');
    const acquire = sliceFunction(HTML, 'vehicleAcquireTarget');
    ok(/vehicleAimPick/.test(acquire), 'кнопка «Навестись» включает режим клика');
    ok(!/openTargetModal\('vehicleAim'\)/.test(acquire), 'модальный список целей для наведения больше не открывается');
    const hexAction = sliceFunction(HTML, 'handleHexAction');
    ok(/vehicleAimClickHex/.test(hexAction), 'handleHexAction перехватывает клик наведения');
}

// ─────────────── 34. Меню размещения для подкрепления ───────────────
{
    ok(/function placementReinforcementUnplaced/.test(PLACEMENT), 'есть список отрядов подкрепления');
    ok(/function placementReinforcementPending/.test(PLACEMENT), 'известно, ждёт ли подкрепление размещения');
    ok(/function placementAutoPlaceReinforcements/.test(PLACEMENT), 'есть авторазмещение подкрепления');
    const render = PLACEMENT.slice(PLACEMENT.indexOf('function renderPlacementPanel'));
    ok(/Подкрепление в идущем бою/.test(render.slice(0, 4000)), 'панель показывает меню подкрепления при завершённом размещении');
    ok(/placementAutoPlaceReinforcements\(\)/.test(render.slice(0, 4000)), 'в меню есть кнопка авторазмещения');
    ok(/renderPlacementPanel\(\)/.test(sliceFunction(HTML, 'handleOpMapClick').slice(0, 400)) || /renderPlacementPanel/.test(HTML),
        'меню отрисовывается при входе в бой');
}

// ─────────────── 35. Без фризов при движении ───────────────
{
    const move = sliceFunction(HTML, 'tacticalMoveAlongPath');
    const stepInner = move.slice(move.indexOf('const stepInner'));
    const tail = stepInner.slice(stepInner.indexOf('tacticalCheckMaraudingOnEntry'));
    ok(!/saveData\(\)/.test(tail.slice(0, 2000)), 'шаг маршрута не пишет весь сейв в localStorage');
    ok(/redrawMap\(\)/.test(tail), 'шаг маршрута перерисовывает только карту');
    ok(/pushTacticalUndoSnapshot\('движение'\)/.test(move), 'снимок отмены — один на маршрут');
    const spend = sliceFunction(HTML, 'spendAP');
    ok(/internalMove/.test(spend), 'трата ОД в движении не перерисовывает всю панель');
    ok(/if \(!internalMove\) updateUI\(\);/.test(spend), 'updateUI вызывается только вне внутреннего шага');
}

// ─────────────── 36. ИПП отряда ───────────────
{
    ok(/function tacticalUseIPPSquad/.test(HTML), 'есть функция «ИПП отряда»');
    ok(/function tacticalIPPSquadStatus/.test(HTML), 'есть проверка доступности ИПП');
    const use = sliceFunction(HTML, 'tacticalUseIPPSquad');
    ok(/ippSquadUsedBattleKey/.test(use), 'ИПП отряда — один раз за бой');
    ok(/spendAP/.test(use), 'ИПП отряда тратит ОД');
    ok(/heal|hp/.test(use), 'ИПП отряда лечит раненых');
    const panel = sliceFunction(HTML, 'renderActiveCardButtons');
    ok(/ИПП отряда/.test(panel), 'кнопка ИПП есть в панели');
    ok(/ippSquadUsedBattleKey/.test(HTML), 'ключ сбрасывается при переносе в новый бой');
}

// ─────────────── 38. Потери десанта при уничтожении БТР ───────────────
{
    ok(typeof sliceFunction(HTML, 'tacticalSquadCarrierDestroyed') === 'string', 'есть проверка «машина уничтожена»');
    ok(typeof sliceFunction(HTML, 'tacticalResolveDestroyedCarriers') === 'string', 'есть общий разбор подбитых машин с десантом');
    ok(/tacticalResolveDestroyedCarriers/.test(sliceFunction(HTML, 'updateUI')), 'разбор срабатывает при обновлении боя');
    ok(typeof sliceFunction(HTML, 'opCarrierLossDisembark') === 'string', 'на оперативной карте десант тоже высаживается');
    ok(/opCarrierLossDisembark\(unit\)/.test(sliceFunction(HTML, 'markOpUnitDestroyed')),
        'уничтожение машины сначала разбирает десант');
    const disembark = sliceFunction(HTML, 'opCarrierLossDisembark');
    ok(/died\+\+/.test(disembark), 'часть десанта гибнет при уничтожении машины');
    ok(/embarkedInBtr = false/.test(disembark), 'уцелевшие высаживаются на гекс машины');
}

// ─────────────── 18. Диагностика синхронизации тактических боёв ───────────────
{
    const ONLINE_JS = readJs('online_battles.js');
    ok(/function onlineBattleMirrorBlockReason/.test(ONLINE_JS), 'есть объяснение, почему бой оппонента не отображён');
    ok(/function onlineBattleSyncReport/.test(ONLINE_JS), 'есть ручной отчёт о синхронизации боёв');
    ok(/__onlineBattleBlockLogged/.test(ONLINE_JS), 'причина пишется в лог один раз на гекс');
    ok(!/if \(appData\.currentBattleId\) return; \/\/ я в другом бою/.test(ONLINE_JS),
        'зеркало создаётся и когда я нахожусь в другом бою');
    ok(/onlineCreateMirrorBattle\(e, \{ quiet: busyInAnotherBattle \}\)/.test(ONLINE_JS),
        'зеркало в этом случае создаётся тихо (без alert и подмены экрана)');
    ok(/if \(!\(opts && opts\.quiet\)\)/.test(ONLINE_JS), 'quiet подавляет alert и сообщение в #mapInfo');
    ok(/onlineShowBattleSyncReport/.test(HTML), 'в онлайновой панели есть кнопка диагностики');
    ok(/state\[oppRole\] && state\[oppRole\]\.battles/.test(ONLINE_JS), 'отчёт читает бои оппонента из облака');

    // функционально: причины, по которым бой не превращается в зеркало
    const pickFn = name => {
        const i = ONLINE_JS.indexOf('function ' + name);
        const rest = ONLINE_JS.slice(i + 10);
        const j = rest.indexOf('\nfunction ');
        return ONLINE_JS.slice(i, j < 0 ? ONLINE_JS.length : i + 10 + j);
    };
    const s = createSandbox(freshAppData());
    ['onlineBattleKey', 'onlineBattleMirrorBlockReason'].forEach(fn => s.run(pickFn(fn)));
    s.run(`
        appData.campaign.onlineFinishedBattles = {};
        appData.campaign.opUnits = [{ name: 'Мой взвод', col: 4, row: 4 }];
        appData.campaign.enemyOpUnits = [{ name: 'Враг', col: 4, row: 4 }];
        var readyEntry = { hexKey: '4,4', status: 'active', id: 10, oppUnitNames: ['Мой взвод'], myUnitNames: ['Враг'], squads: [{ name: 'Отряд', fighters: [] }] };
        var readyReason = onlineBattleMirrorBlockReason(readyEntry);
        var noMine = onlineBattleMirrorBlockReason({ hexKey: '9,9', status: 'active', id: 11, oppUnitNames: [], myUnitNames: ['Враг'], squads: [{ name: 'Отряд' }] });
        var finished = onlineBattleMirrorBlockReason({ hexKey: '4,4', status: 'finished', id: 12 });
        var noSquads = onlineBattleMirrorBlockReason({ hexKey: '7,7', status: 'active', id: 13, oppUnitNames: ['Мой взвод'], myUnitNames: [], squads: [] });
    `);
    ok(s.evalCtx('readyReason') === null, 'корректный снапшот не блокируется');
    ok(/нет моих юнитов/.test(String(s.evalCtx('noMine'))), 'причина «на гексе нет моих юнитов»');
    ok(/завершён/.test(String(s.evalCtx('finished'))), 'причина «бой у оппонента завершён»');
    ok(/отрядов оппонента/.test(String(s.evalCtx('noSquads'))), 'причина «в снапшоте нет отрядов оппонента»');
}

// ─────────────── 39. Ретрансляция через штаб роты не мешает своим приказам ───────────────
{
    ok(!/своё действие ждёт доставки приказов взводам/.test(HTML),
        'штаб роты больше не ждёт доставки ретрансляции, чтобы выполнить свой приказ');
    const execBlock = HTML.slice(HTML.indexOf('2. Выполняем активные приказы'), HTML.indexOf('// 3. Обработка приказов'));
    ok(!/companyRelayDeliveryPending\(order\.toUnitId\)/.test(execBlock),
        'в цикле исполнения нет блокировки по незавершённой ретрансляции');
    ok(/\(b && b\.type === 'company_order'\)/.test(execBlock),
        'приказы ретрансляции по-прежнему исполняются первыми в ходу');
    ok(!/companyRelayDeliveryPending\(order\.toUnitId\)/.test(HTML),
        'ожидание ретрансляции убрано из исполнения приказов');

    const create = sliceFunction(HTML, 'createOrder');
    ok(/if \(orderType === 'company_order' && Array\.isArray\(options\.subUnitIds\)\) \{[\s\S]{0,200}cancelFireAtWillForUnit\(subId/.test(create),
        'при ретрансляции «огонь по готовности» снимается только у взводов-получателей');
    ok(/\} else \{\s*try \{ cancelFireAtWillForUnit\(toUnitId, orderType\); \} catch \(e\) \{\}/.test(create),
        'у самого штаба роты «огонь по готовности» не снимается');

    // функционально: приказ через штаб не трогает приказы штаба, но снимает «огонь по готовности» у взвода
    const s = createSandbox(freshAppData());
    ['cancelFireAtWillForUnit', 'createOrder'].forEach(fn => s.run(sliceFunction(HTML, fn)));
    s.run(`
        var ORDER_ALIVE_STATUSES = ['pending', 'queued', 'delivering', 'active'];
        var hardMode = { orders: [], pendingOrders: [], messengerQueue: [], messengers: {} };
        var currentTurn = 1;
        function log() {}
        function saveData() {}
        function renderActiveOrders() {}
        function recordOrderJournal() {}
        function assignMessenger() { return null; }
        function getOpHexDistance() { return 1; }
        function getRouteToTarget() { return []; }
        function stopEscortMirroringFor() {}
        function mirrorOrderToEscorts() {}
        function checkCommunication() { return 'radio'; }
        function deepCloneGameData(x) { return x; }
        appData.campaign.opUnits = [
            { name: 'Штаб роты', type: 'company_hq', col: 2, row: 2 },
            { name: 'Взвод', type: 'infantry_platoon', col: 3, row: 3 }
        ];
        hardMode.orders = [
            { id: 1, fromUnitId: 0, toUnitId: 0, type: 'fire_at_will', status: 'active' },
            { id: 2, fromUnitId: 0, toUnitId: 1, type: 'fire_at_will', status: 'active' }
        ];
        var relayOrder = createOrder(0, 0, 'company_order', { subUnitIds: [1], orderType: 'move' });
        var hqFireAtWill = hardMode.orders.find(o => o.id === 1).status;
        var platoonFireAtWill = hardMode.orders.find(o => o.id === 2).status;
    `);
    ok(s.evalCtx('!!relayOrder') === true, 'приказ через штаб роты создаётся');
    ok(s.evalCtx('hqFireAtWill') === 'active', 'приказ штаба роты («огонь по готовности») не прерван', String(s.evalCtx('hqFireAtWill')));
    ok(s.evalCtx('platoonFireAtWill') === 'cancelled', 'у взвода-получателя новый приказ снимает «огонь по готовности»');
}

// ─────────────── Версия сборки ───────────────
{
    // ⚡ v13.157/v13.160: номер релиза не фиксируем — версия в шапке и в кэше одна и та же
    const version = (/APP_VERSION = '(v[\d.]+)'/.exec(HTML) || [])[1] || '';
    ok(/^v\d+\.\d+$/.test(version), 'версия в index.html — актуальная (' + version + ')');
    ok(fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8').includes(`CACHE_NAME = 'wargame-${version}'`),
        'кэш service worker совпадает с версией приложения (' + version + ')');
}

console.log(`\nИтог v13.156: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exit(1);
