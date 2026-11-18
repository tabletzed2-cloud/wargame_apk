# Состояние проверок

Сформировано раннером `test_harness/run_all.js`: ядро — 60/60 зелёных,
известных устаревших — 63.

## Падающие в ядре (это должно чиниться, а не игнорироваться)

| тест | итог | первый провал |
|---|---|---|
| — | — | — |

## Известные устаревшие (legacy)

| тест | причина |
|---|---|
| probe_r18.js | удалённая константа: if (!m) throw new Error('const not found: ' + name); |
| regression_requested_features.js | удалённая функция: ✗ 8: оперативные юниты остаются доступными для выбора после смены отряда и сброса маршрута — operationalUnitAtPoint is not defined |
| regression_v13061.js | удалённая константа: if (!m) throw new Error('const not found: ' + name); |
| regression_v13062.js | расхождение с текущим кодом: падает |
| regression_v13063.js | удалённая функция: ✗ Отделения сгруппированы по взводу; раскрыт только взвод текущего отряда — deferHiddenTacticalRoster is not defined |
| regression_v13064.js | удалённая функция: ✗ Приказ через роту показывает РЕАЛЬНЫЙ приказ, а не «company_order» — stampCompletedOrderTurns is not defined |
| regression_v13066.js | расхождение с текущим кодом: ✗ R44#1 / п.19: метка остаётся на исходном гексе и снимается при уничтожении — у уничтоженного штаба исходная метка снимается |
| regression_v13067.js | расхождение с текущим кодом: ✗ R45#2: новым людям добавляется боезапас (8 патронов и 2 гранаты на человека) — патроны ротного штаба |
| regression_v13068.js | удалённая функция: ✗ R47: батальонный склад — лимиты и средняя ёмкость — initializeInfantryAmmo is not defined |
| regression_v13069.js | удалённая константа: ✗ R48#1: точка тыла своя у каждой фракции — A.I.R.F. (0,11), BeVe (7,0) — const not found: SUPPLY_SHOT_SPEND |
| regression_v13071.js | номер версии в тексте теста: ✗ v13.071: 4 пункта чек-листа (разместить/двинуть/огонь/ход) — The expression evaluated to a falsy value: |
| regression_v13073.js | номер версии в тексте теста: ✗ v13.073: opNextStepBar скрыт по умолчанию и включается из applyUxPhase — показывается при тексте |
| regression_v13075.js | номер версии в тексте теста: ✗ v13.075: стили чипов и строки определены — контейнер |
| regression_v13076.js | номер версии в тексте теста: ✗ v13.076: .ux-locked существует как предохранитель, стили подсказок v13.077 есть — класс-предохранитель |
| regression_v13077.js | номер версии в тексте теста: ✗ v13.077: засада — сообщение в строке карты + toast (не только лог) — mapInfo обновляется |
| regression_v13078.js | номер версии в тексте теста: ✗ v13.078: FRACTION_GLOBAL_BONUSES — Талреп-якорь у A.I.R.F., Болотоход у BeVe (v13.108: «Горная скрытность» удалена) — A.I.R.F. — Талреп-як |
| regression_v13079.js | удалённая функция: ✗ v13.079: скрытное движение пехоты на холм = Infinity (3 ОД > 2) — OP_STEALTH_HILL_COST is not defined |
| regression_v13080.js | номер версии в тексте теста: ✗ v13.080: APP_VERSION — The input did not match the regular expression /var APP_VERSION = 'v13\.080'/. Input: |
| regression_v13081.js | расхождение с текущим кодом: ✗ APP_VERSION 13.081 The input did not match the regular expression /var APP_VERSION = 'v13\.081'/. Input: |
| regression_v13082.js | расхождение с текущим кодом: ✗ version The input did not match the regular expression /var APP_VERSION = 'v13\.0(8[2-9]/9\d)'/. Input: |
| regression_v13084.js | удалённая функция: ✗ v13.084: contact radius and fire are limited to one shot per turn operationalUnitInTacticalBattle is not defined |
| regression_v13085.js | расхождение с текущим кодом: падает |
| regression_v13089.js | номер версии в тексте теста: ✗ v13.089 (п.4): срок в подтверждении и в панели приказов — без «через сутки» — The input did not match the regular expression /orderStartDe |
| regression_v13092.js | номер версии в тексте теста: ✗ v13.092 (п.1): жест прокрутки двигает карту и отличает клик от протяжки — карта прокручена по X: получили null, ждали 40 |
| regression_v13093_feature_18.js | расхождение с текущим кодом: ✗ 18: after five tactical phases, campaign time is +10 min, with no automatic operational-turn advance — пять фаз по две минуты дают +10 мин |
| regression_v13096.js | удалённая функция: ✗ карточное меню: все бонусы BeVe/belgian и общие, без дубликатов: function not found: getRandomNegativeCardForUnit |
| regression_v13099.js | расхождение с текущим кодом: ✗ п.7: наследование вызывается при гибели бойца (вызовов: 2) |
| regression_v13100.js | расхождение с текущим кодом: ✗ п.1: приказ открывает редактор гекса (openHexEditorForIssuedOrder) |
| regression_v13102.js | расхождение с текущим кодом: падает |
| regression_v13103.js | расхождение с текущим кодом: падает |
| regression_v13106.js | удалённая функция: ReferenceError: operationalUnitInTacticalBattle is not defined |
| regression_v13107_playtest_fixes.js | расхождение с текущим кодом: падает |
| regression_v13108_playtest_fixes.js | расхождение с текущим кодом: падает |
| regression_v13110_requested_fixes.js | расхождение с текущим кодом: ✗ tactical fog and binoculars share terrain LOS, and online map editor controls are gated — only higher intermediate elevations block tactic |
| regression_v13111_requested_fixes.js | расхождение с текущим кодом: ✗ invalid operational anti-tank shots do not spend campaign ammunition — ammo is consumed only after valid armor target and active gun are c |
| regression_v13119_artillery_notice.js | расхождение с текущим кодом: Error: artillery shell notification integration missing: campaign.shellNotices.push({ |
| regression_v13128_requested_fixes.js | расхождение с текущим кодом: ✗ обстрел длится минимум 20 минут: 10 минут пристрелки без расхода, каждый полный интервал тратит единицу — operationalUnitInTacticalBattle  |
| regression_v13129_exact_ammo_morale_artillery.js | удалённая функция: ✗ новые тактические отряды наследуют оперативный дух; ПТО сохраняет дальность 3 — operationalUnitInTacticalBattle is not defined |
| regression_v13131_order_ui_fixes.js | расхождение с текущим кодом: ✗ #3: relayed sub-orders own independent copies of series waypoints — both platoons receive their own sub-order: got 3, expected 2 |
| regression_v13135_cluster_cards_dismount.js | удалённая функция: ✗ п.1: обстрел площади по куче из 3 юнитов наносит ×1.5 урона каждому попаданию — operationalUnitInTacticalBattle is not defined |
| regression_v13136_nine_fixes.js | номер версии в тексте теста: ✗ маркеры версии синхронизированы на v13.138: cards.js должен содержать v13.138 |
| regression_v13137_playtest_fixes.js | номер версии в тексте теста: ✗ маркеры версии синхронизированы на v13.138: cards.js должен содержать v13.138 |
| regression_v13138_playtest_fixes.js | расхождение с текущим кодом: ✗ баг2 setStage: вход на этап связи раскрывает меню САМО (force, без toggle): showCommunicationPanel(true) вызван — меню связи раскрыто авто |
| regression_v13144_playtest_fixes.js | удалённая функция: ReferenceError: TACTICAL_CHAIN_SEARCH_BUDGET is not defined |
| regression_v13147_playtest_fixes.js | расхождение с текущим кодом: ✗ запись боя с «чужим» гексом исправлена |
| regression_v13149_airf_supply_vehicles.js | расхождение с текущим кодом: ✗ по дороге вездеход идёт вдвое быстрее пеших / 1 / 1 |
| regression_v13150_beve_daf_supply.js | удалённая функция: ReferenceError: supplyAssetName is not defined |
| regression_v13152_supply_transit.js | удалённая функция: ReferenceError: initializeInfantryAmmo is not defined |
| regression_v13155_playtest_fixes.js | расхождение с текущим кодом: ✗ маркеры своего шума не рисуются |
| regression_v13156_playtest_fixes.js | расхождение с текущим кодом: ✗ кнопка движения по камням подписана |
| regression_v13157_recon.js | расхождение с текущим кодом: ✗ п.9.4: иконка актива не рисуется как боевой юнит |
| regression_v13158_moto_mortars.js | удалённая функция: ReferenceError: initializeInfantryAmmo is not defined |
| regression_v13159_motorcycle_platoon.js | расхождение с текущим кодом: ✗ лес: 4 ОД за гекс → 1 гекс Infinity |
| regression_v13160_recon_split.js | удалённая функция: ReferenceError: initializeInfantryAmmo is not defined |
| regression_v13161_hidalgo_only_hq.js | удалённая функция: ReferenceError: initializeInfantryAmmo is not defined |
| regression_v13161_riders_only_hq.js | удалённая функция: ReferenceError: initializeInfantryAmmo is not defined |
| regression_v13162_supply_convoy_icon.js | расхождение с текущим кодом: ✗ список средств снабжения использует новый значок |
| regression_v13163_order_selection.js | удалённая функция: ReferenceError: operationalUnitAtPoint is not defined |
| regression_v13164_recon_hq_assets.js | расхождение с текущим кодом: ✗ слитая группа машин активом не считается — только отдельная машина 2 |
| regression_v13168_recon_hidden_drift.js | расхождение с текущим кодом: ✗ в отрисовке есть подпись «где актив» |
| regression_v13169_supply_reach_assignable.js | удалённая функция: ReferenceError: supplyAssetName is not defined |
| regression_v13173_playtest_fixes.js | удалённая функция: ReferenceError: syncInfantryAmmoStrength is not defined |
| sim_online2.js | удалённая функция: if (!m) throw new Error('function not found: ' + name); |
