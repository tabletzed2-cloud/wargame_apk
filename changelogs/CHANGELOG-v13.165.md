# v13.165 — маршрут приказа, иконки снабжения, док разведки, рация разведоргану

Шесть замечаний по операционной карте.

**1. Перестал отображаться маршрут движения при отдаче приказа.** Регрессия v13.163:
в `drawOrderRoute` осталась проверка «открыта ли панель приказов» — но панелей две:
классическая `#hardModePanel` и компактное меню `#opCommandMenu`. В компактном меню
первая всегда скрыта, поэтому функция выходила на первой строке: `orderWaypoints` и
`isPlanningRoute` заполнялись, а жёлтого пунктира с номерами гексов не было. Вдобавок
сброс «залипшего» `isPlanningRoute` в начале `handleOpMapClick` тоже смотрел только на
классическую панель и гасил режим набора на первом же клике.

**2. Иконки техники снабжения мелкие.** Плашка колонны на карте была `size*0.52`,
картинка в панели снабжения — 26px, в списке колонн — 22px.

**3. Меню разведки должно открываться кнопкой слева,** как «📡 Связь» и «🚚 Снабжение».

**4. Вместо лупы при выполнении разведприказа — иконка юнита,** который его выполняет.

**5. Юниты не выполняют приказ движения до конца.** Отряд останавливался, а приказ
оставался «активным» и каждый ход упирался в ту же преграду: видимый враг на маршруте,
препятствие, которое «плановый» расчёт (`getOpMoveCost` через `getOpPlannedMoveCost`)
считает проходимым, обход с дистанцией. Снаружи это выглядело как «приказ не выполняется».

**6. Нельзя выдать рацию конкретному разведоргану при штабе.** Разведорганы
(AL-41 Hidalgo, мотоциклист-разведчик, развед. отделение) живут ОТДЕЛЕНИЯМИ внутри
юнита-носителя и в `opUnits` не попадают, поэтому `hasRadio(unit)` для них всегда
возвращал `false`, а `requestSignalIssue` отвергал штаб как получателя.

## Что изменилось

### п.1 — маршрут при отдаче приказа

* `drawOrderRoute` считает открытой панель приказов любого вида:
  `classicOpen` (`#hardModePanel`) **или** `compactOpen`
  (`#opCommandMenu` / `#opQuickActions`: `window.opOperationalUiState.menuOpen` и
  `mapPick === 'route'` либо непустые `orderWaypoints`). Рисование — при
  `isPlanningRoute`, как и раньше: после сворачивания панели пунктир пропадает,
  а данные черновика сохраняются;
* в `handleOpMapClick` добавлен `compactMenuOpen`: пока компактное меню открыто,
  `isPlanningRoute` не сбрасывается, поэтому набор маршрута не рвётся.

### п.2 — иконки техники снабжения

* карта: радиус плашки `size*0.70` с картинкой (было 0.52) и `0.52` без файла
  (было 0.42), плашка поднята выше гекса (`0.72` / `0.56`), картинка занимает
  88 % плашки;
* панель «🚚 Снабжение»: картинка транспорта 42px (было 26px);
* список «Колонны в пути»: 38px (было 22px).

### п.3 — меню разведки в левом доке

* `initOperationalSidePanels` создаёт третью вкладку
  `<button data-op-side-tab="recon" onclick="showReconPanel()">🔍 Разведка</button>`
  и переносит `#reconPanel` в `#opLeftPanelContent` вместе с панелями связи и снабжения;
* `openOperationalSidePanel('recon')` показывает панель разведки и ставит заголовок
  «🔍 Разведка»; `closeOperationalSidePanels` / `toggleOperationalLogPanel` гасят
  все три панели — иначе в доке оставалась бы пустая колонка;
* новый хелпер `window.isOperationalSidePanelOpen(kind)` — панели нужно знать,
  открыта ли уже её вкладка (повторный клик закрывает док);
* `operationalReconTabVisible()`: вкладка видна только при включённом Hard Mode и
  наличии активов/миссий (пересчитывается в `syncDockVisibility` и после
  пересчёта пула);
* `showReconPanel(force)` в `js/recon.js` открывает док; `closeReconPanel()`
  закрывает и панель, и док;
* CSS: колонка вкладок получила `max-height: 92vh` и прокрутку, кнопки чуть ниже
  (100px, на телефоне 88px) — три вкладки не вылезают за экран.

### п.4 — иконка актива вместо лупы

* `reconAssetImage(src)` — кэш картинок активов с перерисовкой карты после загрузки;
* `drawReconMissionOverlay` рисует файл иконки актива (`reconMissionIcon`) в плашке
  на текущем гексе, обрезая картинку по кругу; эмодзи 🔍 остался только запасным
  вариантом, пока файл не загрузился.

### п.5 — приказ движения доводится до конца

* `executeMoveOrder` ведёт счётчик `order.stallTurns`: ход, в котором отряд не
  сделал ни шага (и ОД при этом были), считается «стоячим». Первый такой ход —
  запись «движение не продвинулось, повтор в следующем ходу»; **второй подряд**
  завершает приказ на достигнутом рубеже (`order.stalledAt`) с записью
  «не может продвинуться к (X,Y)». «Вечно активных» приказов движения больше нет;
* при постановке приказа запоминается исходная конечная точка (`requestedEnd`):
  если она недостижима и `buildOrderRoute` подменяет её ближайшим подходом, в
  журнал пишется «точка (X,Y) недостижима — идём к ближайшему подходу (X,Y)»;
* нормальный марш по-прежнему продолжается между ходами: ОД кончились — приказ
  ждёт следующего хода (это поведение не изменилось).

### п.6 — рация конкретному разведоргану при штабе

* в `hardMode.signalPlatoon.radios.reconOrgans[]` хранятся адресные назначения
  `{ id, unitId, squadName, assetKey, status, isReconOrgan, issuedTurn }`;
* `ensureSignalEquipmentProfile` вычитает их из полевого запаса
  (`radios.available`) — «бесплатных» раций нет;
* `requestSignalIssueToReconOrgan(unitId, squadIndexOrName)` /
  `returnReconOrganRadio(...)`: выдача и отзыв, отделение помечается `hasRadio`;
* `signalSquadRadioEntry(unit, squadName)` / `hasSquadRadio(unit, squadName)` —
  проверка рации у конкретного отделения; `ensureReconOrganRadios()` снимает
  назначения у выбывших отделений;
* панель «📡 Связь»: новый блок «📻 Рации разведорганам при штабе» — строка на
  каждый разведорган с кнопкой «📻 Выдать рацию» / «Отозвать» (в `onclick`
  передаются индексы юнита и отделения, поэтому кавычки в названиях не ломают
  разметку);
* `js/recon.js`: `reconOrganHasRadio(mission)` учитывается в `getReconReportDelay`
  (`assetRadio = reconUnitHasRadio(assetUnit) || reconOrganHasRadio(mission)`), поэтому
  доклад по рации приходит без задержки, если рация есть и у разведоргана, и у штаба.

## Файлы

* `index.html` — `drawOrderRoute`, `handleOpMapClick`, `drawSupplyDeliveriesOnMap`,
  `supplyAssetIconHtml`, `renderSupplyPanel`,
  `initOperationalSidePanels`, `openOperationalSidePanel`, `closeOperationalSidePanels`,
  `toggleOperationalLogPanel`, `operationalReconTabVisible`,
  `requestSignalIssueToReconOrgan`, `returnReconOrganRadio`, `hasSquadRadio`,
  `renderCommunicationPanel`, контейнер `#reconRadiosList`, `APP_VERSION`;
* `js/recon.js` — `showReconPanel`, `closeReconPanel`, `reconAssetImage`,
  `drawReconMissionOverlay`, `reconOrganHasRadio`, `getReconReportDelay`;
* `css/operational_ui.css` — колонка вкладок дока;
* `service-worker.js`, `manifest.json`, `js/*.js` — BUILD-маркеры и кэш;
* `docs/RULES.md` — §6 (приказ движения), §7.5 (док разведки, иконка актива,
  рация разведоргану), журнал версий;
* `test_harness /regression_v13165_orders_recon_radio.js` — 58 проверок;
  `regression_v13163_order_selection.js`, `regression_v13152_supply_transit.js`
  обновлены под новые правила.

## Проверки

* `node regression_v13165_orders_recon_radio.js` — PASS 58 · FAIL 0;
* `regression_v13164` 44/0, `v13163` 55/0, `v13162` 34/0, `v13161` 37/0 и 28/0,
  `v13160` 75/0, `v13157_recon` 101/0, `v13157_carryover` 44/0,
  `v13156` 96/0, `v13152` 65/0, `v13151` 44/0, `v13153` 56/0;
* `node checkhtml.js` — blocks 8, bad 0;
* `python3 "tools /verify_build.py"` — PASS.
