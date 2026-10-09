// ⚡ BUILD-МАРКЕР: v13.081 — синхронизируется с APP_VERSION (см. index.html, самопроверка сборки)
// v13.077: разблокировка интерфейса (F3) — инвалидация offline-кэша кода.
// v13.065: invalidate offline code cache after the melee/cards/map-template fixes.
// v13.064: invalidate offline code cache after the orders-list rework.
// v13.063: invalidate offline code cache after the interface rework (orders panel, battle tab).
// v13.062: invalidate offline code cache after field-rule corrections.
// ⚡ v13.024: имя кэша обязательно обновлять с каждой версией —
//    иначе старый (устаревший) кэш продолжает отдавать старые js/data.js
// v13.066: invalidate offline code cache after the ammo-point, DOT-only
//    fortification and campaign mini-map fixes.
// ⚡ v13.061: cache update for retreat, turn-order and initial fortification fixes.
// v13.072: invalidate offline code cache after the reliable-update (cache: 'reload'
//    precache + build-marker verification) and build self-check fixes.
const CACHE_NAME = 'wargame-v13.081';

const ASSETS = [
    './images/AIRF/штаб развед взвода АИРФ №1.png',
      // ====== КОРНЕВЫЕ ФАЙЛЫ ======
    './',
    './index.html',
    './css/style.css',
    './js/data.js',
    './js/weapons.js',
    './js/cards.js',
    './js/templates.js',
    './js/hexmaps.js',
    './js/online_battles.js',
    './js/map_actions.js',
    './js/placement.js',
    './manifest.json',

    // ====== ОБЩИЕ ИЗОБРАЖЕНИЯ (images/) ======
    './images/Hotchkis.png',
    './images/Star Si-35.png',
    './images/Vz.24.png',
    './images/Zb.26.png',
    './images/commisar AIRF.png',
    './images/Аварийный тормоз.png',
    './images/Скоординированный заградительный огонь.png',
    './images/Залп отчаяния.png',
    './images/Ампуломет.png',
    './images/Бельгийское упрямтсво.png',
    './images/Бутылкомет.png',
    './images/Бюрократия.png',
    './images/Велоблиц.png',
    './images/Горное пончо.png',
    './images/Горные охотники.png',
    './images/Дисковый магазин к FN model D.png',
    './images/Длинное дыхание.png',
    './images/За республику.png',
    './images/Знак колониальной службы.png',
    './images/ИПП БеВе.png',
    './images/ИПП аирф.png',
    './images/Кальвинистская сдержанность.png',
    './images/Кальвинистская эффективность.png',
    './images/Клинок риспублики.png',
    './images/Марадерство.png',
    './images/Нашивка за ранение АИРФ.png',
    './images/Нестабильные гранаты.png',
    './images/Но пасаран.png',
    './images/Орден преданности республике.png',
    './images/Плохой порох.png',
    './images/РОКС-3.png',
    './images/Снайперская винтовка.jpg',
    './images/Снайперская винтовка.png',
    './images/Торговый дух.png',
    './images/Усиленный паек Беве.png',
    './images/Фламандская фурия.png',
    './images/Хрупкая оптика.png',
    './images/Хуэлга.png',
    './images/Шахтерский динамит.png',
    './images/Языковой барьер.png',
    './images/анархисты.png',
    './images/бат аирф.png',
    './images/болото 1.png',
    './images/болото 2.png',
    './images/воронки в поле.png',
    './images/воронки в поле1.png',
    './images/бтр1.jpg',
    './images/бтр2.jpg',
    './images/бтр3.jpg',
    './images/бутылки с зажигательной смесью.png',
    './images/велосипедная стоянка.png',
    './images/горный туризм.png',
    './images/дорога развилка.png',
    './images/дорога.png',
    './images/дорога1.png',
    './images/дымы.png',
    './images/знаг заслуг бенелюкс.png',
    './images/знак за ближний бой Беве.png',
    './images/знак интербригады.png',
    './images/интербригада.png',
    './images/кальвинистская бережливость.png',
    './images/камни.png',
    './images/камни1.png',
    './images/камни2.png',
    './images/кумулятивная граната.png',
    './images/кусты.png',
    './images/кусты1.png',
    './images/кусты2.png',
    './images/лес.png',
    './images/лес1.png',
    './images/лес2.png',
    './images/медаль леопольда.png',
    './images/мин аирф 82.png',
    './images/ни шагу назад бельгийцы.png',
    './images/ночь.png',
    './images/огненное поле аирф.png',
    './images/окоп1.png',
    './images/окоп2.png',
    './images/окоп3.png',
    './images/окоп4.png',
    './images/окоп5.png',
    './images/окоп6.png',
    './images/орден солнца.png',
    './images/оружие солидарности.png',
    './images/ослепляющая граната.png',
    './images/паек аирф.png',
    './images/пистолет Star.png',
    './images/пто2.jpg',
    './images/пуль1.jpg',
    './images/развед аирф.png',
    './images/рота аирф 1.png',
    './images/рота аирф 2.png',
    './images/рота аирф 3.png',
    './images/санитары беве.png',
    './images/сапер1.jpg',
    './images/сапер2.jpg',
    './images/сапер3.jpg',
    './images/саперная доблесть.png',
    './images/склон1.png',
    './images/склон2.png',
    './images/склон3.png',
    './images/склон4.png',
    './images/склон5.png',
    './images/склон6.png',
    './images/склон7.png',
    './images/склон8.png',
    './images/склон9.png',
    './images/склон10.png',
    './images/склон11.png',
    './images/склон12.png',
    './images/склон13.png',
    './images/склон14.png',
    './images/собачья упряжка.jpg',
    './images/стрел 1.jpg',
    './images/стрел 2.jpg',
    './images/стрелковый взвод аирф №1.png',
    './images/стрелковый взвод аирф №2.png',
    './images/стрелковый взвод аирф №4.png',
    './images/стрелковый взвод аирф №5.png',
    './images/стрелковый взвод аирф №7.png',
    './images/стрелковый взвод аирф №8.png',
    './images/талреп-якорь.png',
    './images/термитный заряд.png',
    './images/трава.png',
    './images/трава1.png',
    './images/устаревшие патроны.png',
    './images/фосфорная граната аирф.png',
    './images/шеврон беве за ранение.png',
    './images/штаб1 саперский.png',
    './images/штаб1.jpg',
    './images/штурм 1.jpg',
    './images/штурм 2.jpg',
    './images/штурмовой взвод аирф №3.png',
    './images/штурмовой взвод аирф №6.png',
    './images/штурмовой взвод аирф №9.png',

    // ====== AIRF (images/AIRF/) ======
    './images/AIRF/AIRF.png',
    './images/AIRF/БТР аирф Llanero группа из 2.png',
    './images/AIRF/БТР аирф Llanero группа из 3.png',
    './images/AIRF/БТР аирф Llanero группа из 4.png',
    './images/AIRF/БТР аирф Llanero группа из 5.png',
    './images/AIRF/бтр4.png',
    './images/AIRF/бтр5.png',
    './images/AIRF/лт аирф CL39 группа из 2.png',
    './images/AIRF/лт аирф CL39 группа из 3.png',
    './images/AIRF/лт аирф CL39 группа из 4.png',
    './images/AIRF/лт аирф CL39 группа из 5.png',
    './images/AIRF/лт аирф CL39 №1.png',
    './images/AIRF/лт аирф CL39 №2.png',
    './images/AIRF/лт аирф CL39 №3.png',
    './images/AIRF/лт аирф CL39 №4.png',
    './images/AIRF/лт аирф CL39 №5.png',
    './images/AIRF/развед аирф 1.png',
    './images/AIRF/развед аирф 2.png',
    './images/AIRF/рота аирф 1.png',
    './images/AIRF/рота аирф 2.png',
    './images/AIRF/рота аирф 3.png',

    // ====== BeVe (images/BeVe/) ======
    './images/BeVe/BeVe.png',
    './images/BeVe/Belgian Beve.png',
    './images/BeVe/Fn24.png',
    './images/BeVe/Geweer m95.png',
    './images/BeVe/Landsverk 183 группа из 2.png',
    './images/BeVe/Landsverk 183 группа из 3.png',
    './images/BeVe/OIP.png',
    './images/BeVe/Schwarcloze.png',
    './images/BeVe/fn d exp.png',
    './images/BeVe/fn md.png',
    './images/BeVe/johnson41.png',
    './images/BeVe/БА Landsverk 183 №1.jpg',
    './images/BeVe/БА Landsverk 183 №2.jpg',
    './images/BeVe/БА Landsverk 183 №3.jpg',
    './images/BeVe/ДОТ Bosh.png',
    './images/BeVe/САУ Brugge группа из 2.png',
    './images/BeVe/САУ Brugge группа из 3.png',
    './images/BeVe/САУ Brugge №1.jpg',
    './images/BeVe/САУ Brugge №2.jpg',
    './images/BeVe/САУ Brugge №3.jpg',
    './images/BeVe/браунинг хай пауэр.png',
    './images/BeVe/велостоянка метка.png',
    './images/BeVe/влосипедисты 1.png',
    './images/BeVe/влосипедисты 2.png',
    './images/BeVe/влосипедисты 3.png',
    './images/BeVe/влосипедисты 4.png',
    './images/BeVe/влосипедисты 5.png',
    './images/BeVe/влосипедисты 6.png',
    './images/BeVe/влосипедисты 7.png',
    './images/BeVe/влосипедисты 8.png',
    './images/BeVe/влосипедисты 9.png',
    './images/BeVe/влосипедисты 10.png',
    './images/BeVe/влосипедисты 11.png',
    './images/BeVe/влосипедисты 12.png',
    './images/BeVe/влосипедисты поддержка 1.png',
    './images/BeVe/влосипедисты поддержка 2.png',
    './images/BeVe/влосипедисты поддержка 3.png',
    './images/BeVe/горящее поле.png',
    './images/BeVe/мина 82 1.jpg',
    './images/BeVe/мина 82 2.jpg',
    './images/BeVe/мина 82 3.jpg',
    './images/BeVe/мотоцикл беве 1.jpg',
    './images/BeVe/мотоцикл беве 2.jpg',
    './images/BeVe/мотоцикл беве 3.jpg',
    './images/BeVe/отделение бе1 бельг.jpg',
    './images/BeVe/отделение бе1.jpg',
    './images/BeVe/отделение бе2 бельг.jpg',
    './images/BeVe/отделение бе2.jpg',
    './images/BeVe/отделение бе3 бельг.jpg',
    './images/BeVe/отделение бе3.jpg',
    './images/BeVe/отделение бе4 бельг.jpg',
    './images/BeVe/отделение бе4.jpg',
    './images/BeVe/отделение бе5 бельг.jpg',
    './images/BeVe/отделение бе5.jpg',
    './images/BeVe/отделение бе6 бельг.jpg',
    './images/BeVe/отделение бе6.jpg',
    './images/BeVe/отделение бе7 бельг.jpg',
    './images/BeVe/отделение бе7.jpg',
    './images/BeVe/отделение бе8 бельг.jpg',
    './images/BeVe/отделение бе8.jpg',
    './images/BeVe/отделение бе9 бельг.jpg',
    './images/BeVe/отделение бе9.jpg',
    './images/BeVe/отделение под1 бель.jpg',
    './images/BeVe/отделение под1.jpg',
    './images/BeVe/отделение под2 бель.jpg',
    './images/BeVe/отделение под2.jpg',
    './images/BeVe/отделение под3 бель.jpg',
    './images/BeVe/отделение под3.jpg',
    './images/BeVe/отделение пуль1.jpg',
    './images/BeVe/отделение пуль2.jpg',
    './images/BeVe/отделение пуль3.jpg',
    './images/BeVe/отделение пуль4.jpg',
    './images/BeVe/отделение пуль5.jpg',
    './images/BeVe/отделение пуль6.jpg',
    './images/BeVe/пто.jpg',
    './images/BeVe/пто2.jpg',
    './images/BeVe/снайпер Беве 1.png',
    './images/BeVe/снайпер беве 1.jpg',
    './images/BeVe/снайпер беве 2.jpg',
    './images/BeVe/снайпер беве 3.jpg',
    './images/BeVe/штаб батальона BeVe.jpg',
    './images/BeVe/штаб бел вззод 2.jpg',
    './images/BeVe/штаб бел вззод 3.jpg',
    './images/BeVe/штаб бел.jpg',
    './images/BeVe/штаб гол взв 2.jpg',
    './images/BeVe/штаб гол взв 3.jpg',
    './images/BeVe/штаб гол.jpg',
    './images/BeVe/штаб мин.jpg',
    './images/BeVe/штаб мин2.jpg',
    './images/BeVe/штаб мин3.jpg',
    './images/BeVe/штаб мин4.jpg',
    './images/BeVe/штаб мин5.jpg',
    './images/BeVe/штаб мин6.jpg',
    './images/BeVe/штаб роты  BeVe гол.jpg',
    './images/BeVe/штаб роты BeVe бел.jpg',
    './images/BeVe/штаб роты BeVe сам.jpg',
    './images/BeVe/штаб самокат вззод 1.jpg',
    './images/BeVe/штаб самокат вззод 2.jpg',
    './images/BeVe/штаб самокат вззод 3.jpg',


    // ====== v13.050: новые иконки/текстуры/метки (файлы пользователя) ======
    './images/AIRF/Стрелковое отделение №10.png',
    './images/AIRF/Стрелковое отделение №11.png',
    './images/AIRF/Стрелковое отделение №12.png',
    './images/AIRF/Стрелковое отделение №13.png',
    './images/AIRF/Стрелковое отделение №14.png',
    './images/AIRF/Стрелковое отделение №15.png',
    './images/AIRF/Стрелковое отделение №16.png',
    './images/AIRF/Стрелковое отделение №17.png',
    './images/AIRF/Стрелковое отделение №18.png',
    './images/AIRF/Стрелковое отделение №19.png',
    './images/AIRF/Стрелковое отделение №20.png',
    './images/AIRF/Стрелковое отделение №21.png',
    './images/AIRF/Стрелковое отделение №22.png',
    './images/AIRF/Стрелковое отделение №23.png',
    './images/AIRF/Стрелковое отделение №24.png',
    './images/AIRF/Стрелковое отделение №3.png',
    './images/AIRF/Стрелковое отделение №4.png',
    './images/AIRF/Стрелковое отделение №5.png',
    './images/AIRF/Стрелковое отделение №6.png',
    './images/AIRF/Стрелковое отделение №7.png',
    './images/AIRF/Стрелковое отделение №8.png',
    './images/AIRF/Стрелковое отделение №9.png',
    './images/AIRF/Штурмовое отделение №10.png',
    './images/AIRF/Штурмовое отделение №11.png',
    './images/AIRF/Штурмовое отделение №12.png',
    './images/AIRF/Штурмовое отделение №3.png',
    './images/AIRF/Штурмовое отделение №4.png',
    './images/AIRF/Штурмовое отделение №5.png',
    './images/AIRF/Штурмовое отделение №6.png',
    './images/AIRF/Штурмовое отделение №7.png',
    './images/AIRF/Штурмовое отделение №8.png',
    './images/AIRF/Штурмовое отделение №9.png',
    './images/AIRF/пулеметное отделение АИРФ2.png',
    './images/AIRF/пулеметное отделение АИРФ3.png',
    './images/AIRF/пулеметное отделение АИРФ4.png',
    './images/AIRF/пулеметное отделение АИРФ5.png',
    './images/AIRF/пулеметное отделение АИРФ6.png',
    './images/AIRF/пулеметное отделение АИРФ7.png',
    './images/AIRF/пулеметное отделение АИРФ8.png',
    './images/AIRF/пулеметное отделение АИРФ9.png',
    './images/BeVe/ДОТ Van Hees.png',
    './images/Бегун часки.png',
    './images/Портативный комплекс управления огнем.png',
    './images/Радио филипс.png',
    './images/болото непроходимое.png',
    './images/болото непроходимое1.png',
    './images/болото непроходимое2.png',
    './images/валуны.png',
    './images/лес обстрелянный.png',
    './images/лес обстрелянный1.png',
    './images/лес поваленный.png',
    './images/мотогонец.png',
    './images/окоп оп.png',
    './images/окоп7.png',
    './images/подбитый танк аирф.png',
    './images/полевой телефон.png',
    './images/пшено.png',
    './images/рация.png',
    './images/сиеста1.png',

    // ====== КАРТЫ ======
    './maps/Валенсия.png',
    './maps/valencia_terrain.json',
    './maps/index.json',
    './maps/высота_142.json',
    './maps/Высота 63.json',
    // карты полей боя для гексов оперативной карты: список берётся из
    // индекса (node tools/build_hex_map_index.js) — см. precacheHexMaps()
    './maps/Карты Валенсия/index.json',
];

// ⚡ v13.050: файлы, без которых приложение не работает. Только они кэшируются
//    «строго» (cache.addAll) — если хоть одного нет, установка новой версии
//    прерывается. Всё остальное (картинки, карты) кэшируется «мягко»: одна
//    пропавшая/переименованная картинка больше НЕ блокирует обновление
//    приложения (раньше любой 404 в списке ASSETS срывал установку всего
//    сервис-воркера, и устройства оставались на старой версии).
const CORE_ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/data.js',
    './js/weapons.js',
    './js/cards.js',
    './js/templates.js',
    './js/hexmaps.js',
    './js/online_battles.js',
    './js/map_actions.js',
    './js/placement.js',
];

const HEX_MAP_INDEX = './maps/Карты Валенсия/index.json';

// ⚡ v13.070: надёжная предзагрузка ядра — файлы скачиваются В ОБХОД HTTP-кэша
//    браузера (cache: 'reload') и проверяются маркером сборки. Раньше cache.add()
//    мог взять js-модуль из «тёплого» HTTP-кэша (GitHub Pages отдаёт файлы с
//    max-age=600) — в кэш новой версии попадали СТАРЫЕ файлы: игрок видел новый
//    номер версии, а игра работала по старому коду (см. CHANGELOG-v13.070.md).
const CACHE_VERSION = CACHE_NAME.replace(/^wargame-/, '');
const BUILD_MARKER = '⚡ BUILD-МАРКЕР: ' + CACHE_VERSION;
// Файлы, по которым проверяется версия кэша (маркер в модулях ядра + версия в index.html)
const MARKED_ASSETS = [
    { url: './index.html', needle: "var APP_VERSION = '" + CACHE_VERSION + "';" },
    { url: './js/data.js', needle: BUILD_MARKER },
    { url: './js/hexmaps.js', needle: BUILD_MARKER },
    { url: './js/templates.js', needle: BUILD_MARKER },
];
// Предзагрузка ядра в обход HTTP-кэша браузера
function precacheCore(cache) {
    return CORE_ASSETS.reduce((chain, url) =>
        chain.then(() => cache.add(new Request(url, { cache: 'reload' }))), Promise.resolve());
}
// Если в кэш всё же попал файл другой версии — установка отменяется
function verifyCachedBuild(cache) {
    return Promise.all(MARKED_ASSETS.map(item =>
        cache.match(item.url).then((res) => res ? res.text() : '').then((text) => {
            if (text.indexOf(item.needle) < 0) throw new Error('[SW] в кэш попал файл другой версии: ' + item.url);
            return true;
        })
    ));
}

// ⚡ v13.052 (R37#4): не более PRECACHE_PARALLEL одновременных запросов —
//    раньше все ~300 файлов (иконки + 149 карт гексов) запрашивались разом,
//    и на телефоне первые минуты после обновления игра «тормозила» из-за этого.
const PRECACHE_PARALLEL = 6;
function precacheSoft(cache, urls) {
  const queue = urls.slice();
  const worker = () => {
    const url = queue.shift();
    if (url === undefined) return Promise.resolve(null);
    return cache.add(url).catch((err) => {
      console.warn('[SW] не удалось закэшировать (пропущено):', url, err && err.message);
      return null;
    }).then(worker);
  };
  const workers = [];
  for (let i = 0; i < Math.min(PRECACHE_PARALLEL, queue.length); i++) workers.push(worker());
  return Promise.all(workers);
}

// Карты гексов оперативной карты — по индексу maps/Карты Валенсия/index.json
function precacheHexMaps(cache) {
  return fetch(HEX_MAP_INDEX, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => {
      const urls = (Array.isArray(list) ? list : [])
        .map((item) => item && item.file)
        .filter(Boolean)
        .map((file) => './' + String(file).replace(/^\.?\//, ''));
      return precacheSoft(cache, urls);
    })
    .catch((err) => {
      console.warn('[SW] индекс карт гексов недоступен:', err && err.message);
      return null;
    });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    // ⚡ v13.070: неполный/смешанный кэш этой же версии удаляем сразу —
    //    пересобираем его с нуля в обход HTTP-кэша браузера
    caches.delete(CACHE_NAME)
      .then(() => caches.open(CACHE_NAME))
      .then((cache) => {
        const core = new Set(CORE_ASSETS);
        const soft = ASSETS.filter((u) => !core.has(u));
        return precacheCore(cache)
          .then(() => verifyCachedBuild(cache))
          .then(() => precacheSoft(cache, soft))
          .then(() => precacheHexMaps(cache));
      })
      .then(() => {
        // ⚡ v13.024: новый SW перехватывает управление сразу,
        //    не дожидаясь закрытия всех вкладок (иначе старые файлы
        //    продолжали отдаваться старым SW)
        if ('skipWaiting' in self) self.skipWaiting();
      })
      .catch((err) => {
        // ⚡ v13.070: версию со «чужими» файлами не активируем — иначе игрок
        //    получит новый номер версии со старым кодом. Кэш убираем, чтобы
        //    браузер повторил установку при следующей проверке обновления.
        console.error('[SW] установка отменена:', err && err.message);
        return caches.delete(CACHE_NAME).then(() => { throw err; });
      })
  );
});

// ⚡ v13.057: ручная кнопка может запросить активацию уже скачанного SW.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING' && 'skipWaiting' in self) {
    self.skipWaiting();
  }
});

// ⚡ v13.024: при активации удаляем ВСЕ старые кэши.
//    Критично: caches.match() ищет по ВСЕМ кэшам, поэтому без этой
//    очистки даже с новым именем кэша отдавались бы старые файлы
//    из старого кэша (корневая причина «старого» data.js на устройствах).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => {
      if ('clients' in self) return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    // ⚡ v13.024: ищем ответ ТОЛЬКО в текущем кэше (caches.open(CACHE_NAME)),
    //    а не во всех кэшах (caches.match)
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // обновляем кэш свежей версией из сети (если доступна)
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    )
  );
});
