// ==================== КОНСТАНТЫ И ДАННЫЕ ==================== 
// Типы местности
  const TERRAIN_DATA = {
      // Базовые типы (уровень 0)
      grass:        { color: '#4CAF50', baseCost: 2,  icon: '🌿', level: 0, images: ['images/трава.png', 'images/трава1.png'] },
      forest:       { color: '#1B5E20', baseCost: 4,  icon: '🌲', level: 0, images: ['images/лес.png', 'images/лес1.png', 'images/лес2.png'] },
      road:         { color: '#795548', baseCost: 1.5,icon: '🛣️', level: 0, images: ['images/дорога.png', 'images/дорога1.png', 'images/дорога развилка.png'] },
      hill:         { color: '#8D6E63', baseCost: 6,  icon: '⛰️', level: 0, images: ['images/склон1.png', 'images/склон2.png', 'images/склон3.png', 'images/склон4.png', 'images/склон5.png', 'images/склон6.png', 'images/склон7.png', 'images/склон8.png', 'images/склон9.png', 'images/склон10.png', 'images/склон11.png', 'images/склон12.png', 'images/склон13.png', 'images/склон14.png'] },
      water:        { color: '#2980b9', baseCost: 999,icon: '💧', level: 0, image: null },
      swamp_passable:   { color: '#2E7D32', baseCost: 5,  icon: '🌊', level: 0, image: ['images/болото 1.png', 'images/болото 2.png'] },
      swamp_impassable: { color: '#1B5E20', baseCost: 999,icon: '⛔', level: 0, image: null },
      bushes:           { color: '#33691E', baseCost: 3,  icon: '🌳', level: 0, images: ['images/кусты.png', 'images/кусты1.png', 'images/кусты2.png' ] },
      rocks:            { color: '#78909C', baseCost: 5,  icon: '🪨', level: 0, images: ['images/камни.png', 'images/камни1.png', 'images/камни2.png'] },
      trenches:         { color: '#A1887F', baseCost: 3,  icon: '🕳️', level: 0, images: ['images/окоп1.png', 'images/окоп2.png', 'images/окоп3.png', 'images/окоп4.png', 'images/окоп5.png', 'images/окоп6.png'] },
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
      { id: "dots", name: "Расчёты ДОТов и ДОТы (стационарные)", template: "ДОТ Bosh", icon: "images/BeVe/ДОТ Bosh.png" },
      { id: "regimental_artillery", name: "Поддержка полковой артиллерии" },
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
      ] }
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
    'at_gun': 2,                // ПТО
    'at_battery': 4,            // батарея ПТО
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
const markerIconMap = {
  'detected': { icon: 'images/marker_detected.png', fallback: '???', width: 30, height: 30 },
  'noise': { icon: 'images/marker_noise.png', fallback: '??', width: 30, height: 30 },
  'artillery': { icon: 'images/marker_artillery.png', fallback: '??', width: 30, height: 30 },
  'fireField': { icon: 'images/BeVe/горящее поле.png', fallback: '??', width: 30, height: 30 },
  'bicyclePark': { icon: 'images/BeVe/велостоянка метка.png', fallback: '??', width: 30, height: 30 },
  'ammoPoint': { icon: 'images/marker_ammo.png', fallback: '??', width: 30, height: 30 },
  'destroyedVehicle': { icon: 'images/marker_destroyed_vehicle.png', fallback: '??', width: 30, height: 30 },
  'destroyedSquadFriendly': { icon: 'images/marker_destroyed_squad_friendly.png', fallback: '??', width: 30, height: 30 },
  'destroyedSquadEnemy': { icon: 'images/marker_destroyed_squad_enemy.png', fallback: '??', width: 30, height: 30 },
  'dot': { icon: 'images/marker_dot.png', fallback: '??', width: 30, height: 30 },
  'trenches': { icon: null, fallback: '🕳️', width: 30, height: 30 },
  'building': { icon: null, fallback: '🏠', width: 30, height: 30 },
  'forest': { icon: null, fallback: '🌲', width: 30, height: 30 },
  'bushes': { icon: null, fallback: '🌳', width: 30, height: 30 },
  'rocks': { icon: null, fallback: '🪨', width: 30, height: 30 }
};

// Функции доступа к данным
function getFactionWeapons(f) { return (appData.factions[f] && appData.factions[f].weapons) ? appData.factions[f].weapons : []; }
function getFactionCrewWeapons(f) { return (appData.factions[f] && appData.factions[f].crewWeapons) ? appData.factions[f].crewWeapons : []; }
function getFactionCards(f) { return (appData.factions[f] && appData.factions[f].cardLibrary) ? appData.factions[f].cardLibrary : []; }
