// ==================== КОНСТАНТЫ И ДАННЫЕ ==================== 
// Типы местности
  const TERRAIN_DATA = {
      // Базовые типы (уровень 0)
      grass:        { color: '#4CAF50', baseCost: 2,  icon: '🌿', level: 0, images: ['images/трава.png', 'images/трава1.png', 'images/пшено.png', 'images/воронки в поле.png', 'images/воронки в поле1.png' ]},
      forest:       { color: '#1B5E20', baseCost: 4,  icon: '🌲', level: 0, images: ['images/лес.png', 'images/лес1.png', 'images/лес2.png', 'images/лес обстрелянный.png', 'images/лес обстрелянный1.png'] },
      road:         { color: '#795548', baseCost: 1.5,icon: '🛣️', level: 0, images: ['images/дорога.png', 'images/дорога1.png', 'images/дорога развилка.png'] },
      hill:         { color: '#8D6E63', baseCost: 6,  icon: '⛰️', level: 0, images: ['images/склон1.png', 'images/склон2.png', 'images/склон3.png', 'images/склон4.png', 'images/склон5.png', 'images/склон6.png', 'images/склон7.png', 'images/склон8.png', 'images/склон9.png', 'images/склон10.png', 'images/склон11.png', 'images/склон12.png', 'images/склон13.png', 'images/склон14.png'] },
      water:        { color: '#2980b9', baseCost: 999,icon: '💧', level: 0, image: null },
      swamp_passable:   { color: '#2E7D32', baseCost: 5,  icon: '🌊', level: 0, images: ['images/болото 1.png', 'images/болото 2.png'] },
      swamp_impassable: { color: '#1B5E20', baseCost: 999,icon: '⛔', level: 0, images: ['images/болото непроходимое.png', 'images/болото непроходимое1.png', 'images/болото непроходимое.png2'] },
      bushes:           { color: '#33691E', baseCost: 3,  icon: '🌳', level: 0, images: ['images/кусты.png', 'images/кусты1.png', 'images/кусты2.png' ] },
      rocks:            { color: '#78909C', baseCost: 5,  icon: '🪨', level: 0, images: ['images/камни.png', 'images/камни1.png', 'images/камни2.png'] },
      trenches:         { color: '#A1887F', baseCost: 3,  icon: '🕳️', level: 0, images: ['images/окоп1.png', 'images/окоп2.png', 'images/окоп3.png', 'images/окоп4.png', 'images/окоп5.png', 'images/окоп6.png', 'images/окоп7.png'] },
   };

// Настройки карт сценариев
const SCENARIO_OP_MAP_SETTINGS = {
  valencia: {
    scaleX: 0.61,
    scaleY: 0.62,
    offsetX: -380,
    offsetY: -45
  }
};

// ⚡ v13.031/v13.032: ЗОНЫ РАССТАНОВКИ для онлайн-матча (по фракциям).
//    Формат: ЗАМКНУТЫЙ ПОЛИГОН гексов [[col,row], ...] (граница рисуется
//    между центрами гексов; гекс считается в зоне, если его центр внутри).
//    ⚡ v13.032: точные полигоны сценария «Валенсия» (от игрока):
//      BeVe — 69 гекса (верх/центр карты), A.I.R.F. — 10 гексов (нижний левый угол).
//    Если сценария/фракции нет в списке — зон нет (размещение свободно).
// ⚡ v13.038: ЯВНЫЕ ДОБАВЛЕНИЯ к зонам расстановки (по требованию игрока):
//    BeVe — расширение зоны на гексы 2,7 / 3,7 / 4,7 (их центры лежат НА
//    границе полигона, и ray casting исключал их из зоны).
// ⚡ v13.040: A.I.R.F. — расширение зоны на гексы 0,13 / 1,13 / 2,13 / 4,13
//    (тот же случай — центры на границе полигона).
// ⚡ v13.042 (R27#8): A.I.R.F. — добавлен гекс 3,13.
const SCENARIO_PLACEMENT_ZONE_EXTRA_HEXES = {
  valencia: {
    'BeVe': [[2,7],[3,7],[4,7]],
    'A.I.R.F.': [[0,13],[1,13],[2,13],[3,13],[4,13]]
  }
};

// ⚡ v13.042 (R27#9): ИГРОВОЕ ПОЛЕ сценария — гексы вне области недоступны
//    (нельзя ходить/стрелять/размещать/ставить приказы).
//    «Валенсия» — квадрат (col,row): 0,0 – 12,0 – 12,14 – 0,14
//    (столбцы 0..12, ряды 0..14).
const SCENARIO_PLAYABLE_AREA = {
  valencia: { minCol: 0, maxCol: 12, minRow: 0, maxRow: 14 }
};

function isHexInPlayableArea(scenario, col, row) {
  const area = SCENARIO_PLAYABLE_AREA[scenario];
  if (!area) return true; // сценарий без ограничений
  return col >= area.minCol && col <= area.maxCol && row >= area.minRow && row <= area.maxRow;
}

// ========== ГЛОБАЛЬНЫЕ БОНУСЫ ФРАКЦИЙ (v13.037) ==========
// Показываются при формировании батальона и в лобби онлайн-матча.
// Иконки — заглушки (images/bonuses/): замените своими, пути не меняя.
const FRACTION_GLOBAL_BONUSES = {
  "BeVe": [
    { id: "fire_control", name: "Портативный комплекс управления огнём",
      desc: "+20% к меткости юнитов в радиусе 2 гексов от штаба батальона",
      icon: "images/Портативный комплекс управления огнем.png" },
    { id: "radio_phillips", name: "Радио Phillips",
      desc: "Батальону доступно 3 рации для распределения по юнитам",
      icon: "images/Радио филипс.png" },
    { id: "motor_courier", name: "Мотогонец",
      desc: "Скорость посыльного по дороге — 6 гексов/ход",
      icon: "images/мотогонец.png" }
  ],
  "A.I.R.F.": [
    { id: "siesta", name: "Сиеста",
      desc: "С 14:00 до 15:00 юниты, находящиеся на дистанции >3 гексов от врага, с вероятностью 80% не выполняют полученный приказ",
      icon: "images/сиеста1.png" },
    { id: "chaskeys", name: "Бегуны Часки",
      desc: "Скорость посыльных AIRF независимо от типа местности — 3 гекса/ход",
      icon: "images/Бегун часки.png" }
  ]
};

const SCENARIO_PLACEMENT_ZONES = {  valencia: {
    'BeVe': [[0,0],[0,1],[1,2],[1,3],[2,4],[2,5],[3,6],[2,7],[3,7],[4,7],[4,6],[5,8],[5,7],[6,7],[7,5],[8,8],[8,9],[8,10],[8,11],[9,12],[8,13],[9,13],[10,13],[11,13],[11,12],[11,11],[11,10],[11,9],[11,8],[10,7],[10,6],[9,5],[10,4],[9,3],[9,2],[8,1],[8,0],[7,0],[6,0],[5,0],[4,0],[3,0],[2,0],[1,0]],
    'A.I.R.F.': [[0,10],[1,10],[2,10],[2,11],[3,11],[4,12],[5,12],[4,13],[3,13],[2,13],[1,13],[0,13],[0,12],[0,11]]
  }
};

// ========== СТРУКТУРА БАТАЛЬОНОВ ==========
const BATTALION_PRESETS = {
  "BeVe": {
    standard: [
      { type: "hq", name: "Штаб батальона", templateName: "Штаб Батальона", icon: "images/BeVe/штаб батальона BeVe.jpg" }, // используем шаблон штаба, можно потом расширить
      { type: "mortar_battery", name: "Батарея 82-мм миномётов", icon: "images/BeVe/мина 82 1.jpg", templates: [
          { name: "Миномет 82-мм №1", templateName: "Минометный расчёт 82-мм №1" },
          { name: "Миномет 82-мм №2", templateName: "Минометный расчёт 82-мм №2" },
          { name: "Миномет 82-мм №3", templateName: "Минометный расчёт 82-мм №3" }
      ]},
      { type: "at_battery", name: "Батарея 47-мм ПТО", templates: [
          { name: "Расчёт ПТО №1", templateName: "Противотанковый расчёт №1", icon: "images/BeVe/пто.jpg" },
          { name: "Расчёт ПТО №2", templateName: "Противотанковый расчёт №2", icon: "images/BeVe/пто2.jpg" }
      ]},
      { type: "infantry_company", name: "1-я пехотная рота", icon: "images/BeVe/штаб роты BeVe бел.jpg", platoons: [
           { name: "1-й взвод (бельг.)", icon: "images/BeVe/штаб бел.jpg", squads: [
              { name: "Пехотное отделение №1 Бельгийцы", templateName: "Пехотное отделение №1 Бельгийцы" },
              { name: "Пехотное отделение №2 Бельгийцы", templateName: "Пехотное отделение №2 Бельгийцы" },
              { name: "Пехотное отделение №3 Бельгийцы", templateName: "Пехотное отделение №3 Бельгийцы" },
              { name: "Отделение поддержки №1 Бельгийцы", templateName: "Отделение поддержки №1 Бельгийцы" },
              { name: "Миномётный расчёт №1", templateName: "Минометный расчёт 50-мм №1" },
              { name: "Штаб взвода №1 Бельгийцы", templateName: "Штаб взвода №1 Бельгийцы" },
              { name: "Пулемётный расчёт №1", templateName: "Пулеметный расчёт №1" }
            ]
          },
         { name: "2-й взвод (бельг.)", icon: "images/BeVe/штаб бел вззод 2.jpg", squads: [
              { name: "Пехотное отделение №4 Бельгийцы", templateName: "Пехотное отделение №4 Бельгийцы" },
              { name: "Пехотное отделение №5 Бельгийцы", templateName: "Пехотное отделение №5 Бельгийцы" },
              { name: "Пехотное отделение №6 Бельгийцы", templateName: "Пехотное отделение №6 Бельгийцы" },
              { name: "Отделение поддержки №2 Бельгийцы", templateName: "Отделение поддержки №2 Бельгийцы" },
              { name: "Миномётный расчёт №2", templateName: "Минометный расчёт 50-мм №2" },
              { name: "Штаб взвода №2 Бельгийцы", templateName: "Штаб взвода №2 Бельгийцы" },
              { name: "Пулемётный расчёт №2", templateName: "Пулеметный расчёт №2" }
            ]
          },
         { name: "3-й взвод (бельг.)", icon: "images/BeVe/штаб бел вззод 3.jpg", squads: [
              { name: "Пехотное отделение №7 Бельгийцы", templateName: "Пехотное отделение №7 Бельгийцы" },
              { name: "Пехотное отделение №8 Бельгийцы", templateName: "Пехотное отделение №8 Бельгийцы" },
              { name: "Пехотное отделение №9 Бельгийцы", templateName: "Пехотное отделение №9 Бельгийцы" },
              { name: "Отделение поддержки №3 Бельгийцы", templateName: "Отделение поддержки №3 Бельгийцы" },
              { name: "Миномётный расчёт №3", templateName: "Минометный расчёт 50-мм №3" },
              { name: "Штаб взвода №3 Бельгийцы", templateName: "Штаб взвода №3 Бельгийцы" },
              { name: "Пулемётный расчёт №3", templateName: "Пулеметный расчёт №3" }
            ]
          },
      ], 
       hq: { name: "Штаб роты (бельг.)", icon: "images/BeVe/штаб роты BeVe бел.jpg", templateName: "Штаб роты №1 Бельгийцы" } 
      },
      // вторая пехотная рота
            { type: "infantry_company", name: "2-я пехотная рота", icon: "images/BeVe/штаб роты  BeVe гол.jpg", platoons: [
           { name: "1-й взвод (гол.)", icon: "images/BeVe/штаб гол.jpg", squads: [
              { name: "Пехотное отделение №1 Голландцы", templateName: "Пехотное отделение №1 Голландцы" },
              { name: "Пехотное отделение №2 Голландцы", templateName: "Пехотное отделение №2 Голландцы" },
              { name: "Пехотное отделение №3 Голландцы", templateName: "Пехотное отделение №3 Голландцы" },
              { name: "Отделение поддержки №1 Голландцы", templateName: "Отделение поддержки №1 Голландцы" },
              { name: "Миномётный расчёт №4", templateName: "Минометный расчёт 50-мм №4" },
              { name: "Штаб взвода №1 Голландцы", templateName: "Штаб взвода №4 Голландцы" },
              { name: "Пулемётный расчёт №4", templateName: "Пулеметный расчёт №4" }
            ]
          },
         { name: "2-й взвод (гол.)", icon: "images/BeVe/штаб гол взв 2.jpg", squads: [
              { name: "Пехотное отделение №4 Голландцы", templateName: "Пехотное отделение №4 Голландцы" },
              { name: "Пехотное отделение №5 Голландцы", templateName: "Пехотное отделение №5 Голландцы" },
              { name: "Пехотное отделение №6 Голландцы", templateName: "Пехотное отделение №6 Голландцы" },
              { name: "Отделение поддержки №2 Голландцы", templateName: "Отделение поддержки №2 Голландцы" },
              { name: "Миномётный расчёт №5", templateName: "Минометный расчёт 50-мм №5" },
              { name: "Штаб взвода №2 Голландцы", templateName: "Штаб взвода №5 Голландцы" },
              { name: "Пулемётный расчёт №5", templateName: "Пулеметный расчёт №2" }
            ]
          },
         { name: "3-й взвод (гол.)", icon: "images/BeVe/штаб гол взв 3.jpg", squads: [
              { name: "Пехотное отделение №7 Голландцы", templateName: "Пехотное отделение №7 Голландцы" },
              { name: "Пехотное отделение №8 Голландцы", templateName: "Пехотное отделение №8 Голландцы" },
              { name: "Пехотное отделение №9 Голландцы", templateName: "Пехотное отделение №9 Голландцы" },
              { name: "Отделение поддержки №3 Голландцы", templateName: "Отделение поддержки №3 Голландцы" },
              { name: "Миномётный расчёт №6", templateName: "Минометный расчёт 50-мм №6" },
              { name: "Штаб взвода №3 Голландцы", templateName: "Штаб взвода №6 Голландцы" },
              { name: "Пулемётный расчёт №6", templateName: "Пулеметный расчёт №3" }
            ]
          },
      ], 
       hq: { name: "Штаб роты №2 (гол.)", icon: "images/BeVe/штаб роты  BeVe гол.jpg", templateName: "Штаб роты №2 Голландцы" } 
      },
         // третья самокатная рота
            { type: "infantry_company", name: "3-я самокатная рота", icon: "images/BeVe/штаб роты BeVe сам.jpg", "mobilityType": "bicycle", platoons: [
           { name: "1-й самокатный взвод", icon: "images/BeVe/штаб самокат вззод 1.jpg", "mobilityType": "bicycle", squads: [
              { name: "Самокатное отделение №1", templateName: "Самокатное отделение №1" },
              { name: "Самокатное отделение №2", templateName: "Самокатное отделение №2" },
              { name: "Самокатное отделение №3", templateName: "Самокатное отделение №3" },
              { name: "Отделение поддержки №1 Самокатное", templateName: "Отделение поддержки №1 Самокатное" },
              { name: "Штаб взвода №1 Самокатный", templateName: "Штаб взвода №7 Самокатный" },
              { name: "Мотоциклетный Пулеметный расчёт №1", templateName: "Мотоциклетный Пулеметный расчёт №1" }
            ]
          },
         { name: "2-й самокатный взвод", icon: "images/BeVe/штаб самокат вззод 2.jpg", "mobilityType": "bicycle", squads: [
              { name: "Самокатное отделение №4", templateName: "Самокатное отделение №4" },
              { name: "Самокатное отделение №5", templateName: "Самокатное отделение №5" },
              { name: "Самокатное отделение №6", templateName: "Самокатное отделение №6" },
              { name: "Отделение поддержки №2 Самокатное", templateName: "Отделение поддержки №2 Самокатное" },
              { name: "Штаб взвода №2 Самокатный", templateName: "Штаб взвода №8 Самокатный" },
              { name: "Мотоциклетный Пулеметный расчёт №2", templateName: "Мотоциклетный Пулеметный расчёт №2" }
            ]
          },
         { name: "3-й самокатный взвод", icon: "images/BeVe/штаб самокат вззод 3.jpg", "mobilityType": "bicycle", squads: [
              { name: "Самокатное отделение №7", templateName: "Самокатное отделение №7" },
              { name: "Самокатное отделение №8", templateName: "Самокатное отделение №8" },
              { name: "Самокатное отделение №9", templateName: "Самокатное отделение №9" },
              { name: "Отделение поддержки №3 Самокатное", templateName: "Отделение поддержки №3 Самокатное" },
              { name: "Штаб взвода №3 Самокатный", templateName: "Штаб взвода №9 Самокатный" },
              { name: "Мотоциклетный Пулеметный расчёт №3", templateName: "Мотоциклетный Пулеметный расчёт №3" }
            ]
          }
                      ],
               hq: { name: "Штаб роты №3 (самокат.)", icon: "images/BeVe/штаб роты BeVe сам.jpg", templateName: "Штаб роты №3 Самокатной" } 
      }
    ],
        supportOptions: [
      // ⚡ v13.026: опция ДОТов даёт ДВА стационарных ДОТа:
      //    «ДОТ Bosh» (1 ПТО + 2 пулемёта) и «ДОТ Van Hees» (1 ПТО + 1 пулемёт,
      //    обслуга 7 человек)
      { id: "dots", name: "Расчёты ДОТов и ДОТы (стационарные)", templates: [
        { name: "ДОТ Bosh", templateName: "ДОТ Bosh", icon: "images/BeVe/ДОТ Bosh.png" },
        // ⚡ v13.030: свой файл иконки (если в репозитории его нет — на карте
        //    автоматически подставляется иконка «ДОТ Bosh.png»)
        { name: "ДОТ Van Hees", templateName: "ДОТ Van Hees", icon: "images/BeVe/ДОТ Van Hees.png" }
      ] },
      // ⚡ v13.028: у BeVe (как и у AIRF с v13.025) НЕТ полковых пушек
      //    как юнитов — артиллерийская поддержка = приказ штаба «Арт. обстрел»
      { id: "artillery_support", name: "Поддержка полковой артиллерии (приказ штаба «Арт. обстрел»)", orderOnly: true },
      { id: "sau_battery", name: "Батарея САУ (3 САУ)", templates: [
        { name: "САУ Brugge №1", templateName: "САУ Brugge №1", icon: "images/BeVe/САУ Brugge №1.jpg"},
        { name: "САУ Brugge №2", templateName: "САУ Brugge №2", icon: "images/BeVe/САУ Brugge №2.jpg"},
        { name: "САУ Brugge №3", templateName: "САУ Brugge №3", icon: "images/BeVe/САУ Brugge №3.jpg"}
      ]},
      { id: "armored_vehicle_platoon", name: "Взвод бронеавтомобилей", templates: [
        { name: "Бронеавтомобиль Landsverk 183 №1", templateName: "Бронеавтомобиль Landsverk 183 №1", icon: "images/BeVe/БА Landsverk 183 №1.jpg"},
        { name: "Бронеавтомобиль Landsverk 183 №2", templateName: "Бронеавтомобиль Landsverk 183 №2", icon: "images/BeVe/БА Landsverk 183 №2.jpg"},
        { name: "Бронеавтомобиль Landsverk 183 №3", templateName: "Бронеавтомобиль Landsverk 183 №3", icon: "images/BeVe/БА Landsverk 183 №3.jpg"}
      ]} 
          
    ]
  },
  "A.I.R.F.": {
    standard: [
     { type: "hq", name: "Штаб Батальона", templateName: "Штаб Батальона", icon: "images/бат аирф.png" }, 
      { type: "mortar_battery", name: "Батарея 82-мм миномётов", icon: "images/мин аирф 82.png", templates: [
          { name: "Миномет 82-мм №1", templateName: "Минометный расчёт 82-мм №1" },
          { name: "Миномет 82-мм №2", templateName: "Минометный расчёт 82-мм №2" },
          { name: "Миномет 82-мм №3", templateName: "Минометный расчёт 82-мм №3" }
      ]},
      { type: "hq", name: "1-й Саперный взвод", icon: "images/штаб1 саперский.png", squads: [
              { name: "Саперное отделение №1", templateName: "Саперное отделение №1" },
              { name: "Саперное отделение №2", templateName: "Саперное отделение №2" },
              { name: "Саперное отделение №3", templateName: "Саперное отделение №3" },
              { name: "Штаб саперного взвода", templateName: "Штаб саперного взвода" }
             ]
          },{ type: "hq", name: "Развед. взвод", icon: "images/развед аирф.png", squads: [
              { name: "Развед. отделение №1", templateName: "Развед. отделение №1" },
              { name: "Развед. отделение №2", templateName: "Развед. отделение №2" },
              { name: "Штаб развед. взвода", templateName: "Штаб развед. взвода" }
             ]
          },
      { type: "infantry_company", name: "1-я стрелковая рота", icon: "images/AIRF/рота аирф 1.png", platoons: [
            { name: "1-й стрелковый взвод", icon: "images/стрелковый взвод аирф №1.png", squads: [
              { name: "Стрелковое отделение №1", templateName: "Стрелковое отделение №1" },
              { name: "Стрелковое отделение №2", templateName: "Стрелковое отделение №2" },
              { name: "Стрелковое отделение №3", templateName: "Стрелковое отделение №3" },
              { name: "Стрелковое отделение №4", templateName: "Стрелковое отделение №4" },
              { name: "Штаб взвода №1", templateName: "Штаб взвода №1" },
              { name: "Пулемётный расчёт №1", templateName: "Пулеметный расчёт №1" }
            ]
          },
          { name: "2-й стрелковый взвод", icon: "images/стрелковый взвод аирф №2.png", squads: [
              { name: "Стрелковое отделение №5", templateName: "Стрелковое отделение №5" },
              { name: "Стрелковое отделение №6", templateName: "Стрелковое отделение №6" },
              { name: "Стрелковое отделение №7", templateName: "Стрелковое отделение №7" },
              { name: "Стрелковое отделение №8", templateName: "Стрелковое отделение №8" },
              { name: "Штаб взвода №2", templateName: "Штаб взвода №2" },
              { name: "Пулемётный расчёт №2", templateName: "Пулеметный расчёт №2" }
            ]
          },
         { name: "3-й штурмовой взвод", icon: "images/штурмовой взвод аирф №3.png", squads: [
              { name: "Штурмовое отделение №1", templateName: "Штурмовое отделение №1" },
              { name: "Штурмовое отделение №2", templateName: "Штурмовое отделение №2" },
              { name: "Штурмовое отделение №3", templateName: "Штурмовое отделение №3" },
              { name: "Штурмовое отделение №4", templateName: "Штурмовое отделение №4" },
              { name: "Штаб взвода №3", templateName: "Штаб взвода №3" },
              { name: "Пулемётный расчёт №3", templateName: "Пулеметный расчёт №3" }
            ]
          },
      ], 
       hq: { name: "Штаб роты №1", templateName: "Штаб роты №1", icon: "images/AIRF/рота аирф 1.png" } 
      },
      // вторая стрелковая рота
                  { type: "infantry_company", name: "2-я стрелковая рота", icon: "images/AIRF/рота аирф 2.png", platoons: [
            { name: "4-й стрелковый взвод", icon: "images/стрелковый взвод аирф №4.png", squads: [
              { name: "Стрелковое отделение №9", templateName: "Стрелковое отделение №9" },
              { name: "Стрелковое отделение №10", templateName: "Стрелковое отделение №10" },
              { name: "Стрелковое отделение №11", templateName: "Стрелковое отделение №11" },
              { name: "Стрелковое отделение №12", templateName: "Стрелковое отделение №12" },
              { name: "Штаб взвода №4", templateName: "Штаб взвода №4" },
              { name: "Пулемётный расчёт №4", templateName: "Пулеметный расчёт №4" }
            ]
          },
          { name: "5-й стрелковый взвод", icon: "images/стрелковый взвод аирф №5.png", squads: [
              { name: "Стрелковое отделение №13", templateName: "Стрелковое отделение №13" },
              { name: "Стрелковое отделение №14", templateName: "Стрелковое отделение №14" },
              { name: "Стрелковое отделение №15", templateName: "Стрелковое отделение №15" },
              { name: "Стрелковое отделение №16", templateName: "Стрелковое отделение №16" },
              { name: "Штаб взвода №5", templateName: "Штаб взвода №5" },
              { name: "Пулемётный расчёт №5", templateName: "Пулеметный расчёт №5" }
            ]
          },
         { name: "6-й штурмовой взвод", icon: "images/штурмовой взвод аирф №6.png", squads: [
              { name: "Штурмовое отделение №5", templateName: "Штурмовое отделение №5" },
              { name: "Штурмовое отделение №6", templateName: "Штурмовое отделение №6" },
              { name: "Штурмовое отделение №7", templateName: "Штурмовое отделение №7" },
              { name: "Штурмовое отделение №8", templateName: "Штурмовое отделение №8" },
              { name: "Штаб взвода №6", templateName: "Штаб взвода №6" },
              { name: "Пулемётный расчёт №6", templateName: "Пулеметный расчёт №6" }
            ]
          },
      ], 
       hq: { name: "Штаб роты №2", templateName: "Штаб роты №2", icon: "images/AIRF/рота аирф 2.png" } 
      },
              //третья стрелковая рота
                  { type: "infantry_company", name: "3-я стрелковая рота", icon: "images/AIRF/рота аирф 3.png", platoons: [
            { name: "7-й стрелковый взвод", icon: "images/стрелковый взвод аирф №7.png", squads: [
              { name: "Стрелковое отделение №17", templateName: "Стрелковое отделение №17" },
              { name: "Стрелковое отделение №18", templateName: "Стрелковое отделение №18" },
              { name: "Стрелковое отделение №19", templateName: "Стрелковое отделение №19" },
              { name: "Стрелковое отделение №20", templateName: "Стрелковое отделение №20" },
              { name: "Штаб взвода №7", templateName: "Штаб взвода №7" },
              { name: "Пулемётный расчёт №7", templateName: "Пулеметный расчёт №7" }
            ]
          },
          { name: "8-й стрелковый взвод", icon: "images/стрелковый взвод аирф №8.png", squads: [
              { name: "Стрелковое отделение №21", templateName: "Стрелковое отделение №21" },
              { name: "Стрелковое отделение №22", templateName: "Стрелковое отделение №22" },
              { name: "Стрелковое отделение №23", templateName: "Стрелковое отделение №23" },
              { name: "Стрелковое отделение №24", templateName: "Стрелковое отделение №24" },
              { name: "Штаб взвода №8", templateName: "Штаб взвода №8" },
              { name: "Пулемётный расчёт №8", templateName: "Пулеметный расчёт №8" }
            ]
          },
         { name: "9-й штурмовой взвод", icon: "images/штурмовой взвод аирф №9.png", squads: [
              { name: "Штурмовое отделение №9", templateName: "Штурмовое отделение №9" },
              { name: "Штурмовое отделение №10", templateName: "Штурмовое отделение №10" },
              { name: "Штурмовое отделение №11", templateName: "Штурмовое отделение №11" },
              { name: "Штурмовое отделение №12", templateName: "Штурмовое отделение №12" },
              { name: "Штаб взвода №9", templateName: "Штаб взвода №9" },
              { name: "Пулемётный расчёт №9", templateName: "Пулеметный расчёт №9" }
            ]
          },
      ], 
       hq: { name: "Штаб роты №3", templateName: "Штаб роты №3", icon: "images/AIRF/рота аирф 3.png" } 
      }
    ],
    supportOptions: [
      { id: "btr_platoon", name: "Взвод БТР (5 Llanero)", templates: [
        { name: "БТР Llanero №1", templateName: "БТР Llanero №1", icon: "images/бтр1.jpg"},
        { name: "БТР Llanero №2", templateName: "БТР Llanero №2", icon: "images/бтр2.jpg"},
        { name: "БТР Llanero №3", templateName: "БТР Llanero №3", icon: "images/бтр3.jpg"},
        { name: "БТР Llanero №4", templateName: "БТР Llanero №4", icon: "images/AIRF/бтр4.png"},
        { name: "БТР Llanero №5", templateName: "БТР Llanero №5", icon: "images/AIRF/бтр5.png"}
      ] },
      { id: "tank_platoon", name: "Взвод Легких танков CL/39 (5 Легких танков CL/39)", templates: [
        { name: "Легкий танк CL/39 №1", templateName: "Легкий танк CL/39 №1", icon: "images/AIRF/лт аирф CL39 №1.png"},
        { name: "Легкий танк CL/39 №2", templateName: "Легкий танк CL/39 №2", icon: "images/AIRF/лт аирф CL39 №2.png"},
        { name: "Легкий танк CL/39 №3", templateName: "Легкий танк CL/39 №3", icon: "images/AIRF/лт аирф CL39 №3.png"},
        { name: "Легкий танк CL/39 №4", templateName: "Легкий танк CL/39 №4", icon: "images/AIRF/лт аирф CL39 №4.png"},
        { name: "Легкий танк CL/39 №5", templateName: "Легкий танк CL/39 №5", icon: "images/AIRF/лт аирф CL39 №5.png"}
      ] },
      // ⚡ v13.025: у AIRF НЕТ полковых пушек как юнитов — артиллерийская
      //    поддержка реализуется приказом штаба батальона «💣 Арт. обстрел»
      //    (4 обстрела за кампанию, начинается в следующем ходу).
      { id: "artillery_support", name: "Поддержка полковой артиллерии (приказ штаба «Арт. обстрел»)", orderOnly: true }
    ]
  }
};

// Требования к БТР
const BTR_REQUIREMENTS = {
    'infantry_platoon': 5,      // стрелковый взвод
    'bicycle_platoon': 5,       // самокатный взвод
    'motorcycle_platoon': 3,    // мотоциклетный взвод
    'engineer_platoon': 4,      // саперный взвод
    'recon_platoon': 3,         // разведвзвод
    'company_hq': 2,            // штаб роты
    'battalion_hq': 3,          // штаб батальона
    'mortar_battery': 3,        // минометная батарея
    'at_gun': 1,                // ПТО
    'at_battery': 3,            // батарея ПТО
    'hq': 3,                    // штаб (общий)
    'default': 4                // по умолчанию
};
// Иконки групп техники
const GROUP_ICONS = {
    // БТР
    'btr_2': 'images/AIRF/БТР аирф Llanero группа из 2.png',
    'btr_3': 'images/AIRF/БТР аирф Llanero группа из 3.png',
    'btr_4': 'images/AIRF/БТР аирф Llanero группа из 4.png',
    'btr_5': 'images/AIRF/БТР аирф Llanero группа из 5.png',
    // Танки
    'tank_2': 'images/AIRF/лт аирф CL39 группа из 2.png',
    'tank_3': 'images/AIRF/лт аирф CL39 группа из 3.png',
    'tank_4': 'images/AIRF/лт аирф CL39 группа из 4.png',
    'tank_5': 'images/AIRF/лт аирф CL39 группа из 5.png',
    // САУ
    'sau_2': 'images/BeVe/САУ Brugge группа из 2.png',
    'sau_3': 'images/BeVe/САУ Brugge группа из 3.png',
    'sau_4': 'images/groups/sau_4.png',
    'sau_5': 'images/groups/sau_5.png',
    // Бронеавтомобили
    'ba_2': 'images/BeVe/Landsverk 183 группа из 2.png',
    'ba_3': 'images/BeVe/Landsverk 183 группа из 3.png',
    'ba_4': 'images/groups/ba_4.png',
    'ba_5': 'images/groups/ba_5.png',
    // Универсальная иконка (если нет специальной)
    'default_2': 'images/groups/default_2.png',
    'default_3': 'images/groups/default_3.png',
    'default_4': 'images/groups/default_4.png',
    'default_5': 'images/groups/default_5.png',
};
// Иконки меток
// ⚡ v13.030: сгенерированные иконки удалены (по запросу) — метки рисуются
//    эмодзи-fallback'ами (как окопы/здания/лес); если появится свой PNG —
//    достаточно заполнить поле icon у нужной метки.
const markerIconMap = {
  'detected':               { icon: 'images/markers/detected.png',              fallback: '👁️', width: 30, height: 30 },
  'noise':                  { icon: 'images/markers/noise.png',                 fallback: '🔊', width: 30, height: 30 },
  'artillery':              { icon: 'images/markers/artillery.png',             fallback: '💥', width: 30, height: 30 },
  'fireField':              { icon: 'images/BeVe/горящее поле.png',             fallback: '🔥', width: 30, height: 30 },
  'bicyclePark':            { icon: 'images/BeVe/велостоянка метка.png',        fallback: '🚲', width: 30, height: 30 },
  'ammoPoint':              { icon: 'images/markers/ammoPoint.png',             fallback: '📦', width: 30, height: 30 },
  'destroyedVehicle':       { icon: 'images/подбитый танк аирф.png',            fallback: '🔥', width: 30, height: 30 },
  'destroyedSquadFriendly': { icon: 'images/markers/destroyedSquadFriendly.png',fallback: '💀', width: 30, height: 30 },
  'destroyedSquadEnemy':    { icon: 'images/markers/destroyedSquadEnemy.png',   fallback: '☠️', width: 30, height: 30 },
  'dot':                    { icon: 'images/markers/dot.png',                   fallback: '🏰', width: 30, height: 30 },
  'trenches':               { icon: 'images/окоп оп.png',                       fallback: '🕳️', width: 30, height: 30 },
  'building':               { icon: 'images/markers/building.png',              fallback: '🏠', width: 30, height: 30 },
  'forest':                 { icon: 'images/markers/forest.png',                fallback: '🌲', width: 30, height: 30 },
  'bushes':                 { icon: 'images/markers/bushes.png',                fallback: '🌳', width: 30, height: 30 },
  'rocks':                  { icon: 'images/валуны.png',                        fallback: '🪨', width: 30, height: 30 },
  'crater':                 { icon: 'images/markers/crater.png',                fallback: '💥', width: 30, height: 30 }
};

// Функции доступа к данным
function getFactionWeapons(f) { return (appData.factions[f] && appData.factions[f].weapons) ? appData.factions[f].weapons : []; }
function getFactionCrewWeapons(f) { return (appData.factions[f] && appData.factions[f].crewWeapons) ? appData.factions[f].crewWeapons : []; }
function getFactionCards(f) { return (appData.factions[f] && appData.factions[f].cardLibrary) ? appData.factions[f].cardLibrary : []; }
