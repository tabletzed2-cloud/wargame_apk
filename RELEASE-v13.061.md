# Выпуск v13.061 — реестр изменений

**Дата:** 2026-10-04
**Версия приложения:** `v13.061`
**Кэш service worker:** `wargame-v13.061`

## Исправления

1. **Стартовая зона расстановки.** Подсветка остаётся видимой в онлайн-фазе `placing` даже при сохранённых позициях; в локальном режиме подсвечивается настроенная зона при активном размещении. Авторасстановка не подставляет позиции в онлайне до решения игрока.
2. **Окопы и начальные укрепления.** Поддерживается последовательная настройка пяти выбранных оперативных гексов. На тактической карте одного оперативного гекса суммарно не более восьми клеток окопов; повторные щелчки меняют текстуру без повторного расхода очков, поворот сохраняется и переносится на карту боя. Размещение ДОТов, окопов и их вращение сохраняются в overlay.
3. **Действия противника.** Для вражеского приказа окапывания/подготовки игроку не выдаётся локальный бюджет и не показывается подтверждение редактора. Онлайн-обмен передаёт сделанные правки, но не чужие неиспользованные бюджеты.
4. **82-мм миномёты.** Дальность ограничена пятью гексами в операционном приказе, ручной/автоматической стрельбе и выборе цели тактического действия. Дальность 50-мм записи оставлена прежней; прочая средняя артиллерия не урезана.
5. **Совместимость существующих правил.** Сохранены требования по отступлению и завершению боя только после нейтрализации всех противников; пяти выбранным оперативным гексам соответствует последовательная подготовка тактических карт; очередность attacker → defender синхронизируется и в локальных, и в онлайн-боях. Также сохранено правило maxAP для подсветки достижимости при проверке/списании движения по текущим ОД.

## Проверки

- `node test_harness/checkhtml.js` — **PASS** (4 блока, 0 ошибок).
- `node --check` для игровых JS-модулей, service worker и регрессионных сценариев — **PASS**.
- `regression_v13057.js` — **17/17**; `regression_v13058.js` — **22/22**; `regression_v13059.js` — **16/16**; `regression_v13061.js` — **12/12**.
- `probe_r18.js` — **488 PASS / 0 FAIL**.
- `sim_online2.js` — **37 PASS / 0 FAIL**.
- `t_standalone.js` — **PASS** (автономная карта боя).

## Пофайловый реестр

### Код приложения, данные, конфигурация и тесты

| Файл | Изменение |
|---|---|
| `index.html` | Восстановлена подсветка зоны, блок авторасстановки онлайн, сохранение вращения, лимит дальности миномётов; объединены правила тактического хода/отступления, начальных укреплений и экран версии. |
| `js/hexmaps.js` | Пять начальных оперативных гексов, окопы/ДОТы, лимит 8, смена текстуры и поворот; side-aware выдача бюджетов, синхронизация overlay без передачи неиспользованных бюджетов соперника. |
| `js/map_actions.js` | Выбор целей и тактическая атака 82-мм миномёта ограничены пятью гексами; сохранены проверки скрытых/уничтоженных целей и отступления. |
| `js/online_battles.js` | Состояние отступления и активная сторона тактической фазы синхронизируются; сохранено размещение до начала боя. |
| `js/placement.js` | Правила начального размещения, зоны атакующего/обороняющегося и онлайн-готовности; версия обновлена. |
| `js/weapons.js` | Дальность 82-мм расчётов — 5; запись 50-мм не изменялась. Исправлены ссылки двух отсутствующих иллюстраций; изображения не подменяются битым URL. |
| `js/data.js` | Текстуры местности ссылаются только на существующие файлы; сценарные данные сохранены. |
| `js/cards.js` | Сохранены обновления карточек поддержки/движения/стрельбы и их эффекты. |
| `js/templates.js` | Сохранены актуальные шаблоны отрядов и ссылки на изображения. |
| `css/style.css` | Сохранены стили карт/мобильного интерфейса; обновлён маркер выпуска. |
| `service-worker.js` | Кэш переведён на `wargame-v13.061`; игровые модули и индексы остаются в precache. |
| `VERSION` | Единая версия приложения `v13.061`. |
| `.gitignore` | Правило для патч-файлов сохранено; маркер выпуска обновлён. |
| `README-ONLINE.md` | Инструкция Firebase актуализирована под уже работающие онлайн-синхронизацию, туман войны и тактические фазы. |
| `tools/build_hex_map_index.js` | Генератор индекса записывает `_version: v13.061`. |
| `test_harness/checkhtml.js` | Проверка синтаксиса inline-блоков HTML. |
| `test_harness/extract.js` | Утилита извлечения функций для изолированных регрессий. |
| `test_harness/sandbox.js` | Тестовая среда поддерживает текущий UI ходов и общие проверки доступности действий. |
| `test_harness/regression_v13057.js` | Регрессии кампании, карт гексов, восстановления боя и версии. |
| `test_harness/regression_v13058.js` | Регрессии физических связистов и ручной прокладки кабеля. |
| `test_harness/regression_v13059.js` | Регрессии maxAP, «Велоблица», окопов, скрытых целей и потерь онлайн. |
| `test_harness/regression_v13061.js` | Новые тесты подсветки, текстур/вращения окопов, лимитов, вражеских приказов и дальности 82-мм миномётов. |
| `test_harness/probe_r18.js` | Сквозной набор: актуализированы helpers фазы хода и проверки service worker. |
| `test_harness/sim_online2.js` | E2E двух устройств: синхронизация ходов, туман, урон и карты гексов. |
| `test_harness/t_standalone.js` | Проверка автономного тактического боя и UI. |
| `RELEASE-v13.059.md` | Предыдущий реестр сохранён как исторический документ, без переписывания. |

### Индексы и данные карт

- `maps/index.json` и `maps/Карты Валенсия/index.json` обновлены на `v13.061`; индекс тактических карт содержит 148 уникальных оперативных гексов (дубликат `6.7` остаётся обработан генератором по прежнему правилу).
- `maps/valencia_terrain.json`, `maps/Высота 63.json`, `maps/высота 63.txt` и карты в `maps/Карты Валенсия/` получили только маркер версии `v13.061`; данные клеток карт не менялись.
- `maps/Карты Валенсия/КАК_ДОБАВИТЬ_КАРТЫ.txt` актуализирован по версии комплекта.

### Графические файлы

- Изображения с маркером релиза получили PNG `tEXt`-метку `Version=v13.061`; сжатые пиксельные данные не менялись.
- `images/` содержит иллюстрации отрядов, карты местности, интерфейсные пиктограммы и изображения карточек/поддержки; полный список с путями ниже.

## Полный список файлов

- `.gitignore` — Repository ignore rule retained; release marker.
- `css/style.css` — Mobile/map styles; release marker.
- `images/AIRF/пулеметное отделение АИРФ2.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/пулеметное отделение АИРФ3.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/пулеметное отделение АИРФ4.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/пулеметное отделение АИРФ5.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/пулеметное отделение АИРФ6.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/пулеметное отделение АИРФ7.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/пулеметное отделение АИРФ8.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/пулеметное отделение АИРФ9.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/саперное отделение №3 аирф.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №10.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №11.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №12.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №13.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №14.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №15.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №16.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №17.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №18.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №19.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №20.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №21.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №22.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №23.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №24.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №3.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №4.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №5.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №6.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №7.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №8.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Стрелковое отделение №9.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/штаб развед взвода АИРФ №1.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №10.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №11.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №12.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №3.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №4.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №5.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №6.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №7.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №8.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/AIRF/Штурмовое отделение №9.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/BeVe/ДОТ Van Hees.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/Бегун часки.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/болото непроходимое.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/болото непроходимое1.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/болото непроходимое2.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/валуны оп1.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/валуны.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/велостоянка метка.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/воронки в поле.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/воронки в поле1.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/Залп отчаяния.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/лес обстрелянный.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/лес обстрелянный1.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/лес поваленный.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/мотогонец.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/окоп оп.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/окоп7.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/подбитый танк аирф.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/Портативный комплекс управления огнем.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/пшено.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/Радио филипс.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/сиеста1.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `images/Скоординированный заградительный огонь.png` — PNG release metadata updated to v13.061; pixel data unchanged.
- `index.html` — Placement, fortification editing, tactical/operational mortar range and turn/retreat logic; app version display.
- `js/cards.js` — Current card definitions and effects retained.
- `js/data.js` — Terrain references validated; release marker.
- `js/hexmaps.js` — Five-hex setup, trench cap, texture cycling, rotation and side-specific prompt/budget behavior.
- `js/map_actions.js` — Tactical target-selection/attack range and battlefield action rules.
- `js/online_battles.js` — Online tactical state, turn ownership and retreat synchronization.
- `js/placement.js` — Pre-battle placement and attacker/defender rules; release marker.
- `js/templates.js` — Squad templates and image references retained.
- `js/weapons.js` — 82-mm range 5; 50-mm range preserved; missing icon paths corrected.
- `maps/index.json` — Map/index data preserved; current release marker is v13.061.
- `maps/valencia_terrain.json` — Map/index data preserved; current release marker is v13.061.
- `maps/Высота 63.json` — Map/index data preserved; current release marker is v13.061.
- `maps/высота 63.txt` — Map documentation/export version marker updated to v13.061; terrain content preserved.
- `maps/Карты Валенсия/0.0 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.1 холм.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.10 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.11 дорога, поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.12 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.13 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.2 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.3 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.4 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.5 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.6 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.7 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.8 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/0.9 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.0 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.1 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.10 поле, лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.11 дорога, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.12 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.13 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.2 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.3 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.4 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.5 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.6 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.7 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.8 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/1.9 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/10.11 лес, болото.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/10.12 лес, гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/10.13 лес, гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/10.4 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/10.5 болото, вода, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/10.6 поле, дорога, болото, лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/10.7 лес, дорога, поле, болото.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/10.8  дорога, болото,поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/11.11 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/11.12 лес, гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/11.13 лес, гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/11.7  болото.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/11.8 перекресток.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/11.9 болото.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.0 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.1 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.10 дорога, поле. лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.11 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.12 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.13 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.2 лес поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.3 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.4 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.5 горы, кусты.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.6 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.7 горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.8 поле, горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/2.9 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.0 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.1 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.10 дорога, поле, лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.11 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.12 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.13 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.2 гора лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.3 горы, траншеи.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.4 лес, горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.5 горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.6 горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.7 горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.8 поле, горы, кусты.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/3.9 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.0 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.1 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.10 дорога, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.11 поле, гора, кусты.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.12 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.13 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.2 лес, гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.3 горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.4 горы, лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.5 горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.6 горы, кусты.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.7 горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.8 горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/4.9 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.0 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.1 гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.10 дорога, поле, лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.11 гора, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.12 горы, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.13 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.2 гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.3 гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.4 гора, лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.5 горы, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.6 горы.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.7 горы, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.8 горы, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/5.9 дорога, лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.0 гора,поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.1 гора дорога.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.10 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.12 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.13 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.2 гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.3 гора, кусты.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.4 горы, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.5 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.6 горы, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.7 поле, кусты.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.7 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.8 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/6.9 дорога, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.0 дорога, поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.1 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.10 болото, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.12 поле, лес, болото.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.13 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.2 гора дорога.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.3 гора, дорога.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.4 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.5 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.6 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.7 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.8 лес, поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/7.9 дорога, поле, лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.0 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.1 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.10 холм-болото.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.11 лес, поле, болото, холм.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.12 лес, болото.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.13 лес, гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.2 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.3 дорога, поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.4 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.5 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.6 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.7 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.8 лес-дорога.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/8.9 дорога, горя, болото.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.12 лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.13 лес, гора.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.2 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.3 поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.4 поле-дорога.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.5 поле-дорога.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.6 поле, рожь.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.7 поле, лес.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.8 дорога, болото,поле.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/9.9 болото.json` — Map data preserved; only `_version` marker bumped to v13.061.
- `maps/Карты Валенсия/index.json` — Map/index data preserved; current release marker is v13.061.
- `maps/Карты Валенсия/КАК_ДОБАВИТЬ_КАРТЫ.txt` — Map documentation/export version marker updated to v13.061; terrain content preserved.
- `README-ONLINE.md` — Firebase/online setup guide updated for current online features.
- `RELEASE-v13.059.md` — Historical release registry, retained unchanged.
- `service-worker.js` — Cache bumped to wargame-v13.061.
- `test_harness/checkhtml.js` — Current-release regression/test harness; see verification summary above.
- `test_harness/extract.js` — Current-release regression/test harness; see verification summary above.
- `test_harness/probe_r18.js` — Current-release regression/test harness; see verification summary above.
- `test_harness/regression_v13057.js` — Current-release regression/test harness; see verification summary above.
- `test_harness/regression_v13058.js` — Current-release regression/test harness; see verification summary above.
- `test_harness/regression_v13059.js` — Current-release regression/test harness; see verification summary above.
- `test_harness/regression_v13061.js` — Current-release regression/test harness; see verification summary above.
- `test_harness/sandbox.js` — Current-release regression/test harness; see verification summary above.
- `test_harness/sim_online2.js` — Current-release regression/test harness; see verification summary above.
- `test_harness/t_standalone.js` — Current-release regression/test harness; see verification summary above.
- `tools/build_hex_map_index.js` — Map-index generator stamps v13.061.
- `VERSION` — Canonical release version: v13.061.
