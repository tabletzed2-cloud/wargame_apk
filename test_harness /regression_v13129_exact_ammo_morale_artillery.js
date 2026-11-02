'use strict';
const assert = require('assert');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction, sliceConst, HTML } = require('./extract');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('✓ ' + name); }
  catch (error) { fail++; console.error('✗ ' + name + ' — ' + error.message); }
}

// Exact operational ammunition accounting, including cross-squad stock and the saving ledger.
test('оперативный боекомплект списывается по фактическому числу выстрелов', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceConst(HTML, 'PLATOON_AMMO_RESERVE_RATIO'));
  s.run(sliceConst(HTML, 'PLATOON_AMMO_LOW_RATIO'));
  for (const name of ['operationalAmmoField', 'operationalAmmoSquads', 'unitOperationalAmmoTotalSquads', 'unitOperationalAmmoTotal', 'operationalAmmoShotsAvailable', 'platoonAmmoKindField', 'platoonAmmoReserveInit', 'platoonAmmoReserveAmount', 'platoonAmmoTopUpFromReserve', 'platoonAmmoGrandTotal', 'platoonAmmoLowNotice', 'consumeOperationalAmmo']) {
    s.run(sliceFunction(HTML, name));
  }
  s.run(`
    var unit={squads:[{ammoSmall:3,ammoOrdnance:2},{ammoSmall:4,ammoOrdnance:1}]};
    var available=operationalAmmoShotsAvailable(unit,'small',8);
    var consumed=consumeOperationalAmmo(unit,'small',6);
    var left1=unit.squads[0].ammoSmall+unit.squads[1].ammoSmall;
    var limited=operationalAmmoShotsAvailable(unit,'ordnance',7);
    var consumedLimited=consumeOperationalAmmo(unit,'ordnance',limited);
    var left2=unit.squads[0].ammoOrdnance+unit.squads[1].ammoOrdnance;
  `);
  // ⚡ v13.147 (п.13): к выкладке отделений добавился общий запас взвода
  //    (7 + 4 патрона, 3 + 2 снаряда), поэтому доступно больше выстрелов.
  assert.strictEqual(s.evalCtx('available'), 8);
  assert.strictEqual(s.evalCtx('consumed'), 6);
  assert.strictEqual(s.evalCtx('left1'), 1);
  assert.strictEqual(s.evalCtx('limited'), 5);
  assert.strictEqual(s.evalCtx('consumedLimited'), 5);
  assert.strictEqual(s.evalCtx('left2'), 0);
});

test('карта экономии учитывает ровно оплачиваемые выстрелы по накопительному ledger', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceConst(HTML, 'PLATOON_AMMO_RESERVE_RATIO'));
  s.run(sliceConst(HTML, 'PLATOON_AMMO_LOW_RATIO'));
  for (const name of ['operationalAmmoField', 'operationalAmmoSquads', 'unitOperationalAmmoTotalSquads', 'unitOperationalAmmoTotal', 'platoonAmmoKindField', 'platoonAmmoReserveInit', 'platoonAmmoReserveAmount', 'platoonAmmoTopUpFromReserve', 'platoonAmmoGrandTotal', 'platoonAmmoLowNotice', 'consumeOperationalAmmo']) s.run(sliceFunction(HTML, name));
  s.run(`var unit={squads:[{ammoSmall:12,effects:{calvinistAmmoSaving:true}}]};
    var first=consumeOperationalAmmo(unit,'small',5); var ammo1=unit.squads[0].ammoSmall;
    var second=consumeOperationalAmmo(unit,'small',5); var ammo2=unit.squads[0].ammoSmall;
    var ledger=unit.squads[0].operationalAmmoSavingLedger.small;
    var platoonLeft=unitOperationalAmmoTotal(unit,'small');`);
  assert.strictEqual(s.evalCtx('first'), 5);
  assert.strictEqual(s.evalCtx('ammo1'), 8);
  assert.strictEqual(s.evalCtx('second'), 5);
  // ⚡ v13.147 (п.13): после первого залпа отделение добрало патроны из общего
  //    запаса (8 + 4 = 12), второй залп снова оплачен по ledger.
  assert.strictEqual(s.evalCtx('ammo2'), 8);
  // 18 (12 в отделении + 6 в запасе) − 8 оплаченных выстрелов = 10
  assert.strictEqual(s.evalCtx('platoonLeft'), 10);
  assert.strictEqual(s.evalCtx('ledger.raw'), 10);
  assert.strictEqual(s.evalCtx('ledger.paid'), 8);
  const directAt = sliceFunction(HTML, 'executeOpShootAt');
  assert(directAt.includes('actualShotsFired++') && directAt.includes("consumeOperationalAmmo(shooter, 'ordnance', actualShotsFired)"), 'direct AT fire charges only shells actually launched, including misses');
  const mortar = sliceFunction(HTML, 'executeMortarSalvo');
  assert(mortar.includes('shellsFired++') && mortar.includes("consumeOperationalAmmo(unit, 'ordnance', shellsFired)"), 'mortar/SAU salvos charge only launched shells');
  const area = sliceFunction(HTML, 'resolveOperationalAreaFire');
  assert(area.includes('roundsFired++') && area.includes('ammoKind, roundsFired'), 'area fire charges rounds actually launched');
});

// Legacy morale saves migrate to 0–100; operational morale initializes tactical units,
// and percentage-style modifiers retain their old relative strength.
test('тактическая мораль мигрирует на общую шкалу 0–100', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceConst(HTML, 'ARMOR_TACTICAL_MORALE'));
  for (const name of ['tacticalNormalizeMoraleScale', 'tacticalMoraleScale', 'tacticalMoraleCurrent', 'tacticalMoraleDeltaPercent', 'tacticalIsSniperOrMortarSquad', 'isArmoredTacticalSquad']) s.run(sliceFunction(HTML, name));
  s.run(`var currentSquad=null, morale=0;`);
  s.run(`var infantry={name:'Пехота',fighters:Array.from({length:18},()=>({hp:3})),currentMorale:9,baseMorale:18};
    var migrated=tacticalMoraleCurrent(infantry); var convertedBonus=tacticalMoraleDeltaPercent(infantry,1);
    var armor={name:'Танк',armor:{front:20},isVehicle:true,fighters:[{hp:3}],currentMorale:7,baseMorale:14};
    var armorMorale=tacticalMoraleCurrent(armor);`);
  assert.strictEqual(s.evalCtx('migrated'), 50);
  assert(Math.abs(s.evalCtx('convertedBonus') - 100 / 18) < 1e-9);
  assert.strictEqual(s.evalCtx('armorMorale'), 50);
  assert.strictEqual(s.evalCtx('infantry.tacticalMoraleScaleVersion'), 1);
  assert.strictEqual(s.evalCtx('infantry.tacticalMoraleMax'), 100);
});

test('новые тактические отряды наследуют оперативный дух; ПТО сохраняет дальность 3', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceConst(HTML, 'ARMOR_TACTICAL_MORALE'));
  s.run(`var appData={campaign:{opUnits:[{name:'Пехотный взвод',operationalMorale:63}],enemyOpUnits:[]}};
    var currentSquad=null, morale=0;
    function tacticalMarkStartingMoraleCasualties(){};`);
  for (const name of ['tacticalFindOperationalMoraleOwner', 'tacticalNormalizeMoraleScale', 'tacticalMoraleScale', 'tacticalMoraleCurrent', 'tacticalMoraleDeltaPercent', 'tacticalIsSniperOrMortarSquad', 'isArmoredTacticalSquad', 'tacticalInitializeSquadMorale']) s.run(sliceFunction(HTML, name));
  s.run(`var squad={name:'Пехотное отделение',opUnitName:'Пехотный взвод',fighters:[{hp:3},{hp:3}],currentMorale:2,baseMorale:2};
    tacticalInitializeSquadMorale(squad,'battle-1');`);
  assert.strictEqual(s.evalCtx('squad.currentMorale'), 63);
  assert.strictEqual(s.evalCtx('squad.baseMorale'), 100);
  assert.strictEqual(s.evalCtx('squad.tacticalMoraleScaleVersion'), 1);
  const opShootAt = sliceFunction(HTML, 'executeOpShootAt');
  assert(opShootAt.includes('Number(distance) > 3'), 'direct fire has a strict >3 range guard');
  assert(opShootAt.includes('executeMortarSalvo(shooter, targets, Number(distance)'), 'long-range SAU armor fire routes to an artillery salvo');
  assert(opShootAt.includes('Number(distance) > 10'), 'long-range SAU artillery remains capped at 10 hexes');
  const route = createSandbox(freshAppData());
  route.run(sliceFunction(HTML, 'executeOpShootAt'));
  route.run(`var routedSalvo=null; var opShootingState={shooter:{name:'САУ',isInBattle:false},targets:[]};
    function requireOperationalAmmo(){return true;} function isArmoredUnit(target){return !!target.armor;}
    function executeMortarSalvo(unit,targets,distance,rounds,die){routedSalvo={unit,targets,distance,rounds,die};}
    function cancelOpShooting(){} function log(){};`);
  route.run(`var farArmor={name:'Танк',armor:{front:20}}; executeOpShootAt([farArmor],4);`);
  assert(route.evalCtx("routedSalvo && routedSalvo.distance===4 && routedSalvo.rounds===7 && routedSalvo.die==='1d10'"), 'distance-four SAU fire actually routes through the artillery-salvo path');
  assert(HTML.includes("executeMortarSalvo(shooter, targetUnits, distance, 7 * Math.max(1, vehicles), '1d10')"), 'manual target selection uses the same long-range artillery route');
});

test('бонус духа карты «Geen Duibreed» одинаков в UI и боевых проверках', () => {
  const s = createSandbox(freshAppData());
  // ⚡ v13.144 (п.11): бонусы карточек духа считаются в cardMoraleTotalForSquad — тянем и её.
  for (const fn of ['tacticalNormalizeMoraleScale','tacticalMoraleScale','tacticalMoraleCurrent','tacticalMoraleDeltaPercent','cardMoraleTotalForSquad','getEffectiveMorale']) s.run(sliceFunction(HTML, fn));
  s.run(`var currentSquad={name:'Отряд',currentMorale:50,baseMorale:100,tacticalMoraleScaleVersion:1,tacticalMoraleLegacyScale:10,
      effects:{geenDuibreed:true},fighters:[{isCommander:true,hp:3}]};
    var morale=50; appData.squads=[currentSquad]; function getScopedActiveModifiersForSquad(){return [];}`);
  assert.strictEqual(s.evalCtx('getEffectiveMorale()'), 70, 'commander effect adds +2 legacy morale points on a 10-point scale');
  s.run(`appData.squads.push({fighters:[{awards:['loyalty']}]});`);
  assert.strictEqual(s.evalCtx('getEffectiveMorale()'), 70, 'Geen Duibreed replaces the loyalty bonus with its +2 legacy-point effect');
});

test('мораль взвода после тактического боя считается по исходной численности отделений', () => {
  const sync = sliceFunction(HTML, 'syncBattleLossesToCampaign');
  assert(sync.includes('tacticalMoraleCurrent(sq) * moraleWeight(sq)'), 'player platoon morale is weighted from tactical squads');
  assert(sync.includes('ownedBattleSquads'), 'morale synchronization is scoped to the matching platoon');
  assert(sync.includes("changeOperationalMorale(unit, mergedMorale - getOperationalMorale(unit), 'итог тактического боя')"), 'the weighted result is written to operational morale');
  assert(sync.includes('ownedEnemySquads'), 'enemy tactical platoons also synchronize morale');
});

test('артиллерия отдельно проверяет каждую машину в гексе попадания с шансом повреждения 5%', () => {
  const s = createSandbox(freshAppData());
  s.run(sliceConst(HTML, 'OP_ARTILLERY_ARMOR_DAMAGE_CHANCE'));
  s.run(sliceConst(HTML, 'OP_ARTILLERY_ARMOR_PENETRATION_MM'));
  s.run(`var hits=[]; function isArmoredUnit(x){return !!(x && (x.isArmored || x.isGroup || x.type==='tank'));}
    function processVehicleHit(target,location,penetration,armor,source){hits.push({target,location,penetration,armor,source});return {result:'damaged',message:'повреждение'};}
    function log(){} function isStaticOpUnit(){return false;}`);
  s.run(sliceFunction(HTML, 'applyOperationalArtilleryArmorHit'));
  s.run(sliceFunction(HTML, 'applyOperationalArtilleryArmorHitsAtHex'));
  s.run(`Math.random=()=>0.01;
    var group={name:'танковый взвод',isGroup:true,type:'tank',col:2,row:3,vehicleList:[
      {name:'машина 1',armor:{front:40}}, {name:'машина 2',armor:{front:50}}
    ]};
    var platoon={name:'взвод техники',isArmored:true,col:2,row:3,squads:[
      {name:'машина 3',armor:{front:25},fighters:[{hp:3}]}, {name:'пехота',fighters:[{hp:3}]}
    ]};
    appData.campaign.opUnits=[group,platoon]; appData.campaign.enemyOpUnits=[];
    var checks=applyOperationalArtilleryArmorHitsAtHex(2,3,'тест');`);
  assert.strictEqual(s.evalCtx('checks'), 3, 'all vehicles on the impacted hex are checked, including every vehicle in a group');
  assert.strictEqual(s.evalCtx('hits.length'), 3, 'a successful 5% check damages each test vehicle');
  assert(s.evalCtx('hits.every(hit=>hit.penetration>hit.armor)'), 'successful damage checks penetrate the selected location');
  assert(s.evalCtx("hits.every(hit=>hit.source==='тест' && hit.location!=='ricochet')"), 'successful check cannot resolve as a ricochet');

  const tactical = createSandbox(freshAppData());
  tactical.run(sliceConst(HTML, 'OP_ARTILLERY_ARMOR_DAMAGE_CHANCE'));
  tactical.run(`var TACTICAL_ARTY_HIT_THRESHOLD=7;
    var armored1={name:'Танк 1',isVehicle:true,fighters:[{hp:3}]};
    var armored2={name:'Танк 2',isVehicle:true,fighters:[{hp:3}]};
    var infantry={name:'Пехота',fighters:[{hp:3}]};
    var vehicleChecks=[], damagePoints=0; appData.map={grid:{'0,0':{}}};
    function tacticalArtilleryScatterHex(){return '0,0';}
    function tacticalArtilleryHexOccupants(){return [{squad:armored1,side:'enemy'},{squad:armored2,side:'enemy'},{squad:infantry,side:'enemy'}];}
    function tacticalArtilleryHexHasTrenches(){return false;}
    function tacticalIsDotSquad(){return false;}
    function isArmoredTacticalSquad(squad){return !!squad.isVehicle;}
    function tacticalArtilleryApplyDamage(entry,points,result){damagePoints+=points;result.damage+=points;return points;}
    function applyVehicleHitToEnemy(squad,location,penetration){vehicleChecks.push({squad,location,penetration});}
    function rollD10(){return 10;} function rollD6(){return 6;} function log(){}
    function markTacticalSuppressed(){} function tacticalChangeMorale(){} Math.random=()=>0.01;`);
  tactical.run(sliceFunction(HTML, 'tacticalArtilleryResolveCall'));
  tactical.run(`tacticalArtilleryResolveCall({targetHex:'0,0',shells:1,isSau:true,batteryName:'САУ'},{});`);
  assert.strictEqual(tactical.evalCtx('vehicleChecks.length'), 2, 'one shell independently checks every armored vehicle in its impact hex');
  assert(tactical.evalCtx('vehicleChecks.every(hit=>hit.location>=2 && hit.location<=6 && hit.penetration===999)'), 'each successful tactical check applies a non-ricochet damage result');
  assert.strictEqual(tactical.evalCtx('damagePoints'), 30, 'ordinary shell damage remains independent of vehicle checks');
  tactical.run(`vehicleChecks=[]; tacticalArtilleryResolveCall({targetHex:'0,0',shells:1,isSau:false,batteryName:'миномёт'},{});`);
  assert.strictEqual(tactical.evalCtx('vehicleChecks.length'), 0, 'mortar shell never checks or damages armored vehicles');
  assert(HTML.includes('applyOperationalArtilleryArmorHitsAtHex(c, r'), 'coordinate artillery checks every vehicle at the hit hex');
  assert(HTML.includes('if (!mortarNoArmor) applyOperationalArtilleryArmorHitsAtHex'), 'operational mortar fire continues excluding armor');
});

test('справка отражает дальность ПТО, 5%-ный артиллерийский эффект, точный боезапас и мораль 0–100', () => {
  const fs = require('fs'); const path = require('path');
  const rules = fs.readFileSync(path.join(require('./extract').ROOT, 'rules.html'), 'utf8');
  assert(!/не подтвержд|не реализован|не проверен|не найден/i.test(rules), 'inactive/uncertain-rule annotations were removed');
  assert(rules.includes('не более 3 гексов включительно'), 'PTO maximum is stated as inclusive three hexes');
  assert(rules.includes('каждая машина в этом гексе отдельно проходит проверку 5%'), 'artillery damage is documented as an independent 5% check for every vehicle in the hit hex');
  assert(rules.includes('по фактическому числу выстрелов'), 'ammunition is documented as exact shot accounting');
  assert(rules.includes('общую шкалу <b>0–100</b>'), 'operational and tactical morale share the same scale');
  assert(!rules.includes('4–5 — 8%'), 'out-of-range direct PTO chances are absent');
  const online = fs.readFileSync(path.join(require('./extract').ROOT, 'js/online_battles.js'), 'utf8');
  assert(online.includes('tacticalMoraleLegacyScale') && online.includes('tacticalMoraleScaleVersion'), 'online snapshots preserve the normalized morale scale');
  assert(online.includes('pendingMoraleDelta'), 'online morale penalties are converted to the same tactical scale');
});

console.log(`Итог exact-ammo/morale/artillery: PASS ${pass} · FAIL ${fail}`);
if (fail) process.exit(1);
