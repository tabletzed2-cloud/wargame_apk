// ==================== ОРУЖИЕ И НАГРАДЫ ====================
const BEVE_WEAPONS = [
{ "name": "Винтовка FN model 24/30", "values": [1,1,1,1,1,1], "effectiveRange": 5, "meleeBonus": 1, "icon": "images/BeVe/Fn24.png", "iconSize": "30px"},
{ "name": "Винтовка Geweer M95", "values": [1,1,1,1,1,2], "effectiveRange": 5, "meleeBonus": 1, "icon": "images/BeVe/Geweer m95.png", "iconSize": "30px"},
{ "name": "Автоматическая винтовка Johanson M1941", "values": [0,1,1,2,2,2], "effectiveRange": 5, "meleeBonus": 1, "icon": "images/BeVe/johnson41.png", "iconSize": "30px", "isAutomatic": true},
{ "name": "Пистолет Browning Hi-Power", "values": [0,1,1,2,2,3], "effectiveRange": 2, "meleeBonus": 0, "icon": "images/BeVe/браунинг хай пауэр.png", "iconSize": "30px", "isAutomatic": true},
{ "name": "Ручной пулемет FN model D", "values": [0,1,1,2,2,3], "effectiveRange": 5, "meleeBonus": 0, "icon": "images/BeVe/fn md.png", "iconSize": "45px", "isAutomatic": true},
{ "name": "Ручной пулемет FN model D-exp", "values": [0,2,3,4,5,0], "effectiveRange": 5, "meleeBonus": 0, "icon": "images/BeVe/fn d exp.png", "iconSize": "45px", "isAutomatic": true},
{ "name": "Geweer OIP M.38", "values": [1,1,1,1,1,2], "effectiveRange": 5, "meleeBonus": 0, "sniper": true, "accuracyBonus": 3, "damagePerHit": 3, "icon": "images/BeVe/OIP.png", "iconSize": "45px"}
            ];

const BEVE_CREW_WEAPONS  = [
{ "type": "mg", "name": "Станковый пулемет Schwarzlose M.08/15", "crewSize": 3, "shotRule": "sum_d6", "fullCrewDice": 3, "minCrewDice": 1, "effectiveRange": 5, "icon": "images/Schwarcloze.png" },
{ "type": "mortar", "name": "Минометный расчёт 50мм DBT", "crewSize": 3, "shotRule": "fixed_per_crew", "shotsFull": 3, "shotsReduced2": 2, "shotsReduced1": 1, "effectiveRange": 10, "icon": "https://i.imgur.com/bxlyHe3.png" },
{ "type": "mortar", "name": "Минометный расчёт 82мм", "crewSize": 3, "shotRule": "fixed_per_crew", "shotsFull": 3, "shotsReduced2": 2, "shotsReduced1": 1, "effectiveRange": 15, "icon": "" },
{ "type": "at_gun", "name": "Расчёт ПТО Bohler M37", "crewSize": 3, "shotRule": "fixed_per_crew", "shotsFull": 3, "shotsReduced2": 2, "shotsReduced1": 1, "effectiveRange": 10, "penetration": {"1":58,"2":58,"3":58,"4":54,"5":54,"6":54,"7":51,"8":51,"9":51,"10":47,"11":47,"12":47,"13":43,"14":43,"15":43,"16":41,"17":41,"18":41,"19":39,"20":39,"21":39,"22":36,"23":36,"24":36,"25":36,"26":36,"27":36,"28":36,"29":36,"30":36}, "icon": "https://i.imgur.com/kmSaR2C.png" },
{ "type": "at_gun", "name": "75-мм орудие SAU Brugge", "crewSize": 3, "shotRule": "fixed_per_crew", "shotsFull": 2, "shotsReduced2": 1, "shotsReduced1": 1, "effectiveRange": 15, "penetration": {"1":65,"2":65,"3":65,"4":60,"5":60,"6":60,"7":57,"8":57,"9":57,"10":55,"11":55,"12":55,"13":55,"14":55,"15":55,"16":52,"17":52,"18":52,"19":50,"20":50,"21":50,"22":47,"23":47,"24":47,"25":45,"26":45,"27":45,"28":40,"29":40,"30":40}, "icon": "" },
{ "type": "at_gun", "name": "37-мм Bofors", "crewSize": 2, "shotRule": "fixed_per_crew", "shotsFull": 2, "shotsReduced2": 1, "shotsReduced1": 1, "effectiveRange": 15, "penetration": {"1":50,"2":50,"3":50,"4":45,"5":45,"6":45,"7":43,"8":43,"9":43,"10":42,"11":42,"12":42,"13":40,"14":40,"15":37,"16":35,"17":35,"18":35,"19":33,"20":33,"21":33,"22":33,"23":30,"24":30,"25":30,"26":30,"27":30,"28":30,"29":30,"30":28}, "icon": "" },
{ "type": "mg", "name": "Пулемёт SAU Brugge", "crewSize": 1, "shotRule": "sum_d6", "fullCrewDice": 1, "minCrewDice": 1, "effectiveRange": 5, "icon": "" }
            ];

const BEVE_AWARDS = [
  { "id": "wound", "name": "Нашивка за ранение", "icon": "images/шеврон беве за ранение.png", "iconWidth": "40px", "iconHeight": "40px", "bonus": "Один раз за бой восстановить 1 HP", "criteria": "Боец с 1 HP в конце боя, отряд не бежал" },
  { "id": "colonial", "name": "Медаль за колониальную службу", "icon": "images/Знак колониальной службы.png", "iconWidth": "40px", "iconHeight": "60px", "bonus": "+1 к духу в жарком климате", "criteria": "Выдаётся игроком перед боем" },
  { "id": "valor", "name": "Орден Доблести Бенилюкса", "icon": "images/знаг заслуг бенелюкс.png", "iconWidth": "40px", "iconHeight": "50px", "bonus": "+1 доп. попадание при стрельбе", "criteria": "Отряд уничтожил/обратил в бегство 5 отрядов" },
  { "id": "melee", "name": "Медаль за Ближний бой", "icon": "images/знак за ближний бой Беве.png", "iconWidth": "35px", "iconHeight": "75px", "bonus": "+1 в рукопашной", "criteria": "Отряд отразил 3 рукопашные/гранатные атаки" },
  { "id": "leopold", "name": "Медаль Леопольда", "icon": "images/медаль леопольда.png", "iconWidth": "35px", "iconHeight": "75px", "bonus": "+1 к укрытию в обороне для отряда", "criteria": "Все выжившие имеют 1 HP, отряд не отступил, бой выигран" }
];
  
const AIRF_WEAPONS = [
{ "name": "Винтовка Vz.24", "values": [1,1,1,1,1,1], "effectiveRange": 5, "meleeBonus": 1, "icon": "images/Vz.24.png", "iconSize": "40px"},
{ "name": "Пистолет Star M1914", "values": [0,1,1,2,2,3], "effectiveRange": 2, "meleeBonus": 0, "icon": "images/пистолет Star.png", "iconSize": "30px", "isAutomatic": true},
{ "name": "ПП Star Si-35", "values": [0,1,1,2,2,3], "effectiveRange": 3, "meleeBonus": 1, "icon": "images/Star Si-35.png", "iconSize": "30px", "isAutomatic": true},
{ "name": "АВС-36", "values": [1,1,2,2,3,3], "effectiveRange": 6, "meleeBonus": 1, "icon": "", "iconSize": "30px", "isAutomatic": true},
{ "name": "ППД-40", "values": [0,2,2,3,4,4], "effectiveRange": 3, "meleeBonus": 0, "icon": "", "iconSize": "30px", "isAutomatic": true},
{ "name": "ДП-27", "values": [0,1,2,3,4,4], "effectiveRange": 5, "meleeBonus": 0, "icon": "", "iconSize": "30px", "isAutomatic": true},
{ "name": "Ручной пулемет Zb.26", "values": [0,1,1,2,2,3], "effectiveRange": 5, "meleeBonus": 0, "icon": "images/Zb.26.png", "iconSize": "60px", "isAutomatic": true},
{ "name": "РОКС-3", "values": [0,0,0,0,0,0], "effectiveRange": 1, "meleeBonus": 0, "flamethrower": true, "maxShots": 3, "icon": "images/РОКС-3.png", "iconSize": "30px"}
            ];

const AIRF_CREW_WEAPONS  = [
 { "type": "mg", "name": "Станковый пулемет Hotchkiss Mle 1914", "crewSize": 3, "shotRule": "sum_d6", "fullCrewDice": 3, "minCrewDice": 1, "effectiveRange": 6, "icon": "images/Hotchkis.png" },
 { "type": "mg", "name": "Танковый пулемет Hotchkiss Mle 1914", "crewSize": 1, "shotRule": "sum_d6", "fullCrewDice": 1, "minCrewDice": 1, "effectiveRange": 5, "icon": "" },
 { "type": "at_gun", "name": "45-мм 53К танковая", "crewSize": 2, "shotRule": "fixed_per_crew", "shotsFull": 2, "shotsReduced2": 1, "shotsReduced1": 1, "effectiveRange": 15, "penetration": {"1":60,"2":60,"3":60,"4":55,"5":55,"6":50,"7":50,"8":45,"9":45,"10":42,"11":42,"12":42,"13":40,"14":40,"15":40,"16":40,"17":40,"18":35,"19":33,"20":33,"21":33,"22":33,"23":30,"24":30,"25":30,"26":30,"27":30,"28":30,"29":30,"30":28}, "icon": "" },
 { "type": "mortar", "name": "Бутылкомет Цукермана", "crewSize": 2, "shotRule": "fixed_per_crew", "shotsFull": 3, "shotsReduced2": 2, "shotsReduced1": 1, "effectiveRange": 3, "splashDamageDice": 3, "isMolotov": true, "icon": "" },
 { "type": "mortar", "name": "Минометный расчёт 82мм", "crewSize": 3, "shotRule": "fixed_per_crew", "shotsFull": 3, "shotsReduced2": 2, "shotsReduced1": 1, "effectiveRange": 15, "icon": "" },
 { "type": "mortar", "name": "Ампуломёт АМ-1", "crewSize": 3, "shotRule": "fixed_per_crew", "shotsFull": 3, "shotsReduced2": 2, "shotsReduced1": 1, "effectiveRange": 8, "splashDamageDice": 1, "isAmpulomet": true, "damageType": "d4", "icon": "" }
            ];

  const AIRF_AWARDS = [
{ "id": "wound_airf", "name": "Нашивка за ранение", "icon": "images/Нашивка за ранение АИРФ.png", "iconWidth": "60px", "iconHeight": "40px", "bonus": "Один раз за бой восстановить 1 HP", "criteria": "Боец с 1 HP в конце боя, отряд не бежал" },
{ "id": "red_sun", "name": "Орден Красное Солнце Анд", "icon": "images/орден солнца.png", "iconWidth": "45px", "iconHeight": "45px",  "bonus": "+1 к укрытию на открытой местности", "criteria": "Вручается командиру взвода если потери взвода после боя составили меньше 50% личного состава" },
{ "id": "mountain", "name": "Знак «Горный Турист»", "icon": "images/горный туризм.png", "iconWidth": "40px", "iconHeight": "45px", "bonus": "Рывок на 1 гекс в гористой и холмистой местности, 1 раз за бой", "criteria": "Выдается в начале игры одному солдату на выбор" },
{ "id": "dagger", "name": "Знак «Кинжал Республики»", "icon": "images/Клинок риспублики.png", "iconWidth": "40px", "iconHeight": "50px", "bonus": "Может перебросить провал на обнаружение", "criteria": "Выдается всем выжившим бойцам отряда, подобравшихся незамеченными к противнику на дистанцию рывка в рукопашную атаку 2-3 гекса" },
{ "id": "sapper", "name": "Медаль «За Сапёрную Доблесть»", "icon": "images/саперная доблесть.png", "iconWidth": "40px", "iconHeight": "55px", "bonus": "При провале подрыва не погибает а получает только 1 ед. урона", "criteria": "Получает сапер, который успешно подорвал бронетехнику или ДОТ при этом выжил" },
{ "id": "interbrigade", "name": "Знак «Интербригада»", "icon": "images/знак интербригады.png", "iconWidth": "50px", "iconHeight": "50px", "bonus": "+1 к меткости", "criteria": "Выдавался иностранцам добровольцам участвовавшим в конфликтах на стороне Коминтерна." },
{ "id": "loyalty", "name": "Орден «За верность Республике»", "icon": "images/Орден преданности республике.png", "iconWidth": "40px", "iconHeight": "50px", "bonus": "+1 к боевому духу всех отрядов во взводе", "criteria": "Выдается командиру взвода если ни один его отряд не бежал с поля боя. +1 к боевому духу отряда" }
          ];  
