'use strict';
// ⚡ v13.169 — «нельзя назначить транспорт, который не дойдёт до получателя».
//
// Требования playtest:
//   • если выбранное средство снабжения не может добраться до пункта
//     назначения, его нельзя назначить: в поле количества автоматически 0,
//     поле заблокировано;
//   • если получатель стоит на горе (непроходимый для машины гекс), но рядом
//     есть проходимый, транспорт может доставить боеприпасы на этот соседний
//     гекс — и задерживается там на ход.
//
// Проверяем:
//   1) `supplyReachForMobility` — прямой подъезд / разгрузка на соседнем гексе / отказ;
//   2) смешанная колонна едет к самому получателю, если хоть одно средство может;
//   3) панель снабжения: 0 + disabled у непроходимого средства, подсказка 🧗
//      для разгрузки на соседнем гексе, строка «Пункт назначения»;
//   4) `rememberSupplyAsset` не даёт назначить недостижимое средство;
//   5) отправка: отказ без списания склада, непригодные средства выкидываются
//      из колонны, при списании — ровно один раз;
//   6) колонна приезжает на соседний гекс, груз доходит, задержка на ход,
//      потом возврат на склад;
//   7) версия и BUILD-маркеры.
const fs = require('fs');
const path = require('path');
const { sliceFunction, sliceConst, HTML } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');
const ROOT = path.join(__dirname, '..');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
const CURRENT_VERSION = (/var APP_VERSION = '([^']+)'/.exec(HTML) || [])[1] || '';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}
const J = (s, code) => s.evalCtx(`JSON.stringify(${code})`);

const REACH_FNS = [
    'supplyAssetMobilityClass', 'supplyMobilityIsMotorized', 'supplyAssetsMobility', 'supplyMoveCost',
    'supplyDeliveryMobilityClasses', 'supplyDeliveryMoveCost', 'findSupplyRoute', 'supplyRouteCost',
    'supplyReachForMobility', 'supplyReachForAssets', 'supplyDropHexFor', 'supplyOutboundDestination',
    'getOpHexNeighbors', 'operationalHexHasActiveBattle', 'supplyDeliveryDestination', 'supplyStepToward'
];
const GRID = (spec) => {
    let out = 'const g = {}; for (let c = 0; c < 14; c++) for (let r = 0; r < 14; r++) g[c + "," + r] = { types: ["grass"] };';
    Object.entries(spec || {}).forEach(([k, v]) => { out += `g["${k}"] = { types: ["${v}"] };`; });
    return out + 'appData.campaign.opMapGrid = g;';
};
const RING = { '5,5': 'hill', '4,5': 'forest', '6,5': 'forest', '5,4': 'forest', '5,6': 'forest',
               '4,4': 'forest', '6,6': 'forest', '4,6': 'forest', '6,4': 'forest' };

function baseSandbox(units, gridSpec, extra) {
    const ad = freshAppData();
    ad.campaign.opUnits = (typeof units === 'string') ? JSON.parse(units) : units;
    const s = createSandbox(ad);
    s.run(['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_CONVOY_BUDGET', 'SUPPLY_EVAC_POINTS',
           'SUPPLY_AMMO_PER_MAN', 'SUPPLY_GREN_PER_MAN']
        .map(n => sliceConst(HTML, n)).join('\n'));
    REACH_FNS.forEach(fn => { try { s.run(sliceFunction(HTML, fn)); } catch (e) { console.log('  (нет ' + fn + ')'); } });
    s.run(`
      function isHexInPlayableArea() { return true; }
      function getOpHexTypes(col, row) {
        const c = (appData.campaign.opMapGrid || {})[col + ',' + row];
        return c ? c.types : ['grass'];
      }
      function getSupplyDepotHex() { return { col: 0, row: 0 }; }
      function supplyRearPoint() { return { col: 0, row: 11 }; }
      appData.campaign.enemyOpUnits = [];
      ${GRID(gridSpec)}
      ${extra || ''}
    `);
    return s;
}
const UNITS = [
    { name: 'Взвод снабжения', col: 0, row: 0, squads: [] },
    { name: 'Пехотный взвод', col: 5, row: 5, squads: [{ name: 'Отд', fighters: [{ hp: 3 }] }] }
];

console.log('— 1. достижимость средства: сам гекс / соседний / отказ —');
{
    const s = baseSandbox(UNITS, { '5,5': 'hill' });
    const truck = JSON.parse(J(s, "supplyReachForMobility('vehicle', 0, 0, {col:5,row:5})"));
    ok(truck && truck.adjacent === true, 'грузовик: к горе не подъехать — разгрузка на соседнем гексе', JSON.stringify(truck));
    ok(truck && truck.col === 4 && truck.row === 5, 'выбран именно проходимый соседний гекс (4,5)', JSON.stringify(truck));
    ok(s.evalCtx("supplyMoveCost('vehicle', 4, 5)") === 1, 'этот соседний гекс действительно проходим для грузовика');
    const foot = JSON.parse(J(s, "supplyReachForMobility('foot', 0, 0, {col:5,row:5})"));
    ok(foot && foot.adjacent === false, 'носильщики идут прямо на гекс получателя (гора пешком проходима)', JSON.stringify(foot));
    const half = JSON.parse(J(s, "supplyReachForMobility('halftrack', 0, 0, {col:5,row:5})"));
    ok(half && half.adjacent === false, 'вездеход TG-41 заезжает на холм сам', JSON.stringify(half));
    ok(s.evalCtx("supplyReachForMobility('vehicle', 0, 0, {col:1,row:1})") !== null, 'по траве грузовик доезжает до получателя');
}

console.log('— 2. средства, которым ехать некуда, отсекаются —');
{
    const s = baseSandbox(UNITS, RING);
    ok(s.evalCtx("supplyReachForMobility('vehicle', 0, 0, {col:5,row:5})") === null,
        'получатель в кольце леса: грузовику доехать некуда — null');
    ok(s.evalCtx("supplyReachForMobility('foot', 0, 0, {col:5,row:5})") !== null,
        'носильщики при этом доходят');
    const mixed = JSON.parse(J(s, "supplyReachForAssets([{id:'truck',count:1},{id:'porter',count:2}], 0, 0, {col:5,row:5})"));
    ok(mixed && mixed.adjacent === false, 'смешанная колонна (грузовик + носильщики) едет к самому получателю', JSON.stringify(mixed));
    const truckOnly = JSON.parse(J(s, "supplyReachForAssets([{id:'truck',count:1}], 0, 0, {col:5,row:5})"));
    ok(truckOnly === null, 'один грузовик в этом составе не пройдёт');
    const hillTruck = baseSandbox(UNITS, { '5,5': 'hill' });
    const mixedHill = JSON.parse(J(hillTruck, "supplyReachForAssets([{id:'truck',count:1},{id:'porter',count:1}], 0, 0, {col:5,row:5})"));
    ok(mixedHill && mixedHill.adjacent === false, 'прямой подъезд предпочтительнее разгрузки рядом, если он возможен');
}

console.log('— 3. панель снабжения: 0 и блокировка у непроходимого средства —');
{
    function panelSandbox(gridSpec) {
        const ad = freshAppData();
        ad.campaign.opUnits = [
            { name: 'Взвод снабжения', col: 0, row: 0, squads: [] },
            { name: 'Пехотный взвод', col: 5, row: 5, squads: [{ name: 'Отд', fighters: [{ hp: 3 }] }] }
        ];
        const s = createSandbox(ad);
        s.run(['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_CONVOY_BUDGET', 'SUPPLY_EVAC_POINTS']
            .map(n => sliceConst(HTML, n)).join('\n'));
        ['supplyAssetMobilityClass', 'supplyMobilityIsMotorized', 'supplyAssetsMobility', 'supplyMoveCost',
         'supplyDeliveryMobilityClasses', 'supplyDeliveryMoveCost', 'findSupplyRoute', 'supplyRouteCost',
         'supplyReachForMobility', 'supplyReachForAssets', 'supplyDropHexFor', 'supplyOutboundDestination',
         'getOpHexNeighbors', 'operationalHexHasActiveBattle', 'renderSupplyPanel',
         'supplyPanelDestinationInfo', 'supplyPanelReachFor', 'supplyPanelGetSelection', 'rememberSupplyAsset',
         'supplyPanelGetPicks', 'supplyDeliveryDestination'].forEach(fn => {
            try { s.run(sliceFunction(HTML, fn)); } catch (e) { console.log('  (нет ' + fn + ')'); }
        });
        s.run(`
          function isHexInPlayableArea() { return true; }
          function getOpHexTypes(col, row) { const c = (appData.campaign.opMapGrid || {})[col + ',' + row]; return c ? c.types : ['grass']; }
          ${GRID(gridSpec)}
          appData.campaign.enemyOpUnits = [];
          appData.campaign.supply = {
            stock: { ammoSmall: 200, grenades: 20, ammoOrdnance: 0 },
            max: { ammoSmall: 1200, grenades: 300, ammoOrdnance: 80 },
            assets: { porter: { total: 4, available: 4 }, truck: { total: 1, available: 1 },
                      mule: { total: 2, available: 2 } },
            deliveries: []
          };
          function ensureSupplyState() { return appData.campaign.supply; }
          function getSupplyDepotHex() { return { col: 0, row: 0 }; }
          function supplyRearPoint() { return { col: 0, row: 11 }; }
          function getSupplyUnit() { return appData.campaign.opUnits[0]; }
          function supplyAssetIds() { return SUPPLY_ORDER.filter(id => SUPPLY_ASSET_TYPES[id]); }
          function syncSupplyDepotStatus() {}
          function syncSupplyAssetsFromPlatoon() {}
          function syncSupplyRearConnection() { return null; }
          function supplyDepotCaptured() { return false; }
          function supplyBarHtml() { return 'BAR'; }
          function supplyAssetIconHtml(id) { return (SUPPLY_ASSET_TYPES[id] || {}).icon || ''; }
          function supplyUnitList() { return [{ unit: appData.campaign.opUnits[1], idx: 1 }]; }
          function unitAmmoStatus() { return { ammoSmall: { cur: 0, max: 100 }, grenades: { cur: 0, max: 10 }, ammoOrdnance: { cur: 0, max: 0 } }; }
          function supplyUnitAmmoDeficits() { return { ammoSmall: 100, grenades: 10, ammoOrdnance: 0 }; }
          function supplyUnitNeedsAmmo() { return true; }
          function supplyUnitExists(idx) { return !!appData.campaign.opUnits[idx]; }
          function supplyUnitHasIncompleteAmmo() { return true; }
          function unitHasBureaucracy() { return false; }
          function supplyEtaLabel() { return 'ETA'; }
          function supplyAssetsLabel(a) { return (a || []).map(x => x.id).join(','); }
          function supplyConvoyVehicleSrc() { return null; }
          var supplyPanelSelection = 1;
          var supplyPanelAssetPicks = {};
          function supplyPanelState() { return null; }
        `);
        s.run('renderSupplyPanel();');
        return s;
    }

    // получатель на горе: грузовик может, но с разгрузкой на соседнем гексе
    const hill = panelSandbox({ '5,5': 'hill' });
    const hillHtml = hill.evalCtx("String(document.getElementById('supplyPanel').innerHTML)");
    ok(/Пункт назначения:/.test(hillHtml), 'в панели видно, для какого пункта идёт проверка транспорта');
    ok(/id="supply_asset_truck"[^>]*disabled/.test(hillHtml) === false,
        'грузовик на горе не заблокирован — он довезёт до соседнего гекса');
    ok(/🧗 к гексу получателя не подъехать — разгрузка на соседнем \(4,5\), колонна задержится там на ход/.test(hillHtml),
        'рядом с грузовиком подписано, куда будет разгрузка и про задержку');
    ok(/🧗 🚚 разгрузка на соседнем \(4,5\), \+1 ход/.test(hillHtml),
        'у получателя помечено, что грузовик сгрузит рядом и задержится на ход');

    // кольцо леса: грузовику не добраться вообще
    const ring = panelSandbox(RING);
    const ringHtml = ring.evalCtx("String(document.getElementById('supplyPanel').innerHTML)");
    ok(/id="supply_asset_truck"[^>]*value="0"[^>]*disabled|id="supply_asset_truck"[^>]*disabled/.test(ringHtml),
        'непроходимый грузовик заблокирован в панели');
    ok(/id="supply_asset_truck"[^>]*value="0"/.test(ringHtml), 'в поле количества у него автоматически 0');
    ok(/⛔ не дойдёт до «Пехотный взвод» \(5,5\) — недоступно для назначения/.test(ringHtml),
        'и объяснено, почему назначить нельзя');
    ok(/id="supply_asset_porter"[^>]*disabled/.test(ringHtml) === false, 'носильщики при этом доступны');
    ok(/id="supply_asset_mule"[^>]*disabled/.test(ringHtml) === false, 'мул тоже доступен');
}

console.log('— 4. назначить недостижимое средство нельзя даже вручную —');
{
    const ring = baseSandbox(UNITS, RING);
    ['supplyPanelDestinationInfo', 'supplyPanelReachFor', 'supplyPanelGetSelection',
     'rememberSupplyAsset', 'supplyPanelGetPicks'].forEach(fn => {
        try { ring.run(sliceFunction(HTML, fn)); } catch (e) {}
    });
    ring.run('function ensureSupplyState() { return appData.campaign.supply; }');
    ring.run(`
      appData.campaign.supply = { stock: {}, max: {}, assets: {}, deliveries: [] };
      var supplyPanelSelection = 1;
      var supplyPanelAssetPicks = {};
      function supplyPanelState() { return null; }
    `);
    ring.run("rememberSupplyAsset('truck', 5);");
    ok(J(ring, 'supplyPanelGetPicks()') === '{}', 'недостижимый грузовик не попадает в выбор', J(ring, 'supplyPanelGetPicks()'));
    ring.run("rememberSupplyAsset('porter', 3);");
    ok(J(ring, "supplyPanelGetPicks().porter") === '3', 'достижимые носильщики назначаются как обычно');
}

console.log('— 5. отправка: отказ без списания, лишнее выкидывается —');
{
    function sendSandbox(gridSpec, picks) {
        const ad = freshAppData();
        ad.campaign.opUnits = [
            { name: 'Взвод снабжения', col: 0, row: 0, squads: [] },
            { name: 'Пехотный взвод', col: 5, row: 5, squads: [{ name: 'Отд', fighters: [{ hp: 3 }], ammoSmall: 0, grenades: 0 }] }
        ];
        const s = createSandbox(ad);
        s.run(['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_CONVOY_BUDGET', 'SUPPLY_EVAC_POINTS', 'SUPPLY_DEPOT_MAX',
               'SUPPLY_AMMO_PER_MAN', 'SUPPLY_GREN_PER_MAN']
            .map(n => sliceConst(HTML, n)).join('\n'));
        ['supplyAssetIds', 'supplyAssetMobilityClass', 'supplyMobilityIsMotorized', 'supplyAssetsMobility',
         'supplyMoveCost', 'supplyDeliveryMobilityClasses', 'supplyDeliveryMoveCost', 'findSupplyRoute',
         'supplyRouteCost', 'supplyReachForMobility', 'supplyReachForAssets', 'supplyDropHexFor',
         'supplyOutboundDestination', 'getOpHexNeighbors', 'operationalHexHasActiveBattle',
         'sendSupplyDelivery', 'supplyCargoOf', 'supplyUnitAmmoDeficits', 'unitAmmoStatus',
         'supplyOrdnanceFull', 'supplyPendingCargoForUnit', 'supplyRearPoint'].forEach(fn => {
            try { s.run(sliceFunction(HTML, fn)); } catch (e) { console.log('  (нет ' + fn + ')'); }
        });
        s.run(`
          function isHexInPlayableArea() { return true; }
          function getOpHexTypes(col, row) { const c = (appData.campaign.opMapGrid || {})[col + ',' + row]; return c ? c.types : ['grass']; }
          ${GRID(gridSpec)}
          appData.campaign.enemyOpUnits = [];
          appData.campaign.supply = { stock: { ammoSmall: 200, grenades: 20, ammoOrdnance: 0 },
            max: { ammoSmall: 1200, grenades: 300, ammoOrdnance: 80 },
            assets: { porter: { total: 4, available: 4 }, truck: { total: 1, available: 1 },
                      mule: { total: 2, available: 2 } }, deliveries: [] };
          function ensureSupplyState() { return appData.campaign.supply; }
          function syncSupplyDepotStatus() {}
          function syncSupplyAssetsFromPlatoon() {}
          function supplyDepotCaptured() { return false; }
          function getSupplyDepotHex() { return { col: 0, row: 0 }; }
          function supplyRearConnectionIsLost() { return false; }
          function supplyRearRouteBlocked() { return false; }
          function unitHasBureaucracy() { return false; }
          function saveData() {}
          function redrawOperationalMap() {}
          function renderSupplyPanel() {}
          function supplyAssetsLabel(a) { return (a || []).map(x => x.id + '×' + x.count).join(', '); }
          function supplyConvoyVehicleSrc() { return null; }
          function supplyUnitHasIncompleteAmmo() { return true; }
        `);
        return s;
    }
    // кольцо леса + только грузовик → отказ, ничего не списано
    const ring = sendSandbox(RING);
    const sentRing = ring.run("sendSupplyDelivery(1, [{ id: 'truck', count: 1 }], 'unit')");
    ok(sentRing === false, 'отправка одного грузовика к недостижимому получателю отклонена');
    ok(ring.alerts.some(a => /не сможет добраться до пункта назначения/.test(a)), 'игроку объяснили причину отказа',
        ring.alerts.join(' | '));
    ok(J(ring, 'appData.campaign.supply.stock.ammoSmall') === '200', 'склад не списан при отказе',
        J(ring, 'appData.campaign.supply.stock.ammoSmall'));
    ok(J(ring, "appData.campaign.supply.assets.truck.available") === '1', 'транспорт не списан при отказе');
    ok(J(ring, 'appData.campaign.supply.deliveries.length') === '0', 'колонна не создана');

    // смешанный набор: грузовик выкидывается, носильщики едут
    const mixed = sendSandbox(RING);
    const sentMixed = mixed.run("sendSupplyDelivery(1, [{ id: 'truck', count: 1 }, { id: 'porter', count: 2 }], 'unit')");
    ok(sentMixed === true, 'смешанный набор отправлен (грузовик отброшен)');
    const delivery = JSON.parse(J(mixed, 'appData.campaign.supply.deliveries[0]'));
    ok(delivery.assets.length === 1 && delivery.assets[0].id === 'porter',
        'в колонне остались только носильщики', JSON.stringify(delivery.assets));
    ok(/не сможет добраться до пункта назначения — исключены из колонны/.test(mixed.logs.join('\n')),
        'об исключении сказано в журнале');

    // гора: грузовик едет, но с разгрузкой на соседнем гексе и задержкой
    const hill = sendSandbox({ '5,5': 'hill' });
    const sentHill = hill.run("sendSupplyDelivery(1, [{ id: 'truck', count: 1 }], 'unit')");
    ok(sentHill === true, 'грузовик к получателю на горе отправлен');
    const hd = JSON.parse(J(hill, 'appData.campaign.supply.deliveries[0]'));
    ok(hd.dropAdjacent === true, 'в колонне отмечено, что подъезд только к соседнему гексу', JSON.stringify(hd.dropHex));
    ok(hd.dropHex && hd.dropHex.col === 4 && hd.dropHex.row === 5, 'точка разгрузки — проходимый соседний гекс (4,5)');
    ok(hd.holdTurns === 1, 'запланирована задержка на один ход');
    const hillCargo = Number(hd.cargo.ammoSmall) || 0;
    ok(hillCargo > 0 && J(hill, 'appData.campaign.supply.stock.ammoSmall') === String(200 - hillCargo),
        'склад списан ровно на загруженный груз (200 → ' + (200 - hillCargo) + ')',
        J(hill, 'appData.campaign.supply.stock.ammoSmall'));
    ok(J(hill, 'appData.campaign.supply.assets.truck.available') === '0', 'грузовик занят колонной');
    ok(/🧗 К гексу получателя транспорту не подъехать — разгрузка на соседнем \(4,5\)/.test(hill.logs.join('\n')),
        'в журнале отправки написано про разгрузку рядом');
}

console.log('— 6. колонна: разгрузка на соседнем гексе, задержка на ход, возврат —');
{
    const ad = freshAppData();
    ad.campaign.opUnits = [
        { name: 'Взвод снабжения', col: 0, row: 0, squads: [] },
        { name: 'Пехотный взвод', col: 5, row: 5, squads: [{ name: 'Отд', fighters: [{ hp: 3 }], ammoSmall: 0, grenades: 0 }] }
    ];
    const s = createSandbox(ad);
    s.run(['SUPPLY_ASSET_TYPES', 'SUPPLY_ORDER', 'SUPPLY_CONVOY_BUDGET', 'SUPPLY_EVAC_POINTS']
        .map(n => sliceConst(HTML, n)).join('\n'));
    ['supplyAssetMobilityClass', 'supplyMobilityIsMotorized', 'supplyAssetsMobility', 'supplyMoveCost',
     'supplyDeliveryMobilityClasses', 'supplyDeliveryMoveCost', 'findSupplyRoute', 'supplyRouteCost',
     'supplyReachForMobility', 'supplyReachForAssets', 'supplyDropHexFor', 'supplyOutboundDestination',
     'getOpHexNeighbors', 'operationalHexHasActiveBattle', 'supplyDeliveryDestination',
     'supplyStepToward', 'advanceSupplyDeliveries']
        .forEach(fn => { try { s.run(sliceFunction(HTML, fn)); } catch (e) { console.log('  (нет ' + fn + ')'); } });
    s.run(`
      function isHexInPlayableArea() { return true; }
      function getOpHexTypes(col, row) { const c = (appData.campaign.opMapGrid || {})[col + ',' + row]; return c ? c.types : ['grass']; }
      ${GRID({ '5,5': 'hill' })}
      appData.campaign.enemyOpUnits = [];
      appData.campaign.supply = {
        stock: { ammoSmall: 0, grenades: 0, ammoOrdnance: 0 },
        max: { ammoSmall: 1200, grenades: 300, ammoOrdnance: 80 },
        deliveries: [{ id: 'd1', kind: 'unit', targetUnitId: 1, assets: [{ id: 'truck', count: 1 }],
          cargo: { ammoSmall: 100, grenades: 10, ammoOrdnance: 0 }, mobility: 'vehicle',
          col: 0, row: 0, status: 'outbound', delayTurns: 0,
          dropHex: { col: 4, row: 5 }, dropAdjacent: true, holdTurns: 1 }]
      };
      function ensureSupplyState() { return appData.campaign.supply; }
      function getSupplyDepotHex() { return { col: 0, row: 0 }; }
      function supplyRearPoint() { return { col: 0, row: 11 }; }
      function syncSupplyDepotStatus() {}
      function syncSupplyAssetsFromPlatoon() {}
      function supplyDepotCaptured() { return false; }
      function supplyRearConnectionIsLost() { return false; }
      function supplyRecipientIsCutOff() { return false; }
      function supplyAmbushCheck() { return null; }
      function notifySupplyDelivery() { return false; }
      function supplyAnimationSnapshot() { return null; }
      function supplyAssetsLabel(a) { return (a || []).map(x => x.id).join(','); }
      function supplyBattleAtHex() { return null; }
      function saveData() {}
      function redrawOperationalMap() {}
      function renderSupplyPanel() {}
      function supplyDistributeCargo(unit, cargo) {
        unit.__got = (unit.__got || 0) + (Number(cargo.ammoSmall) || 0);
        return { ammoSmall: 0, grenades: 0, ammoOrdnance: 0 };
      }
      appData.campaign.currentTurn = 1;
    `);
    const trace = [];
    for (let turn = 1; turn <= 6; turn++) {
        s.run(`appData.campaign.currentTurn = ${turn}; advanceSupplyDeliveries();`);
        const d = JSON.parse(J(s, '(appData.campaign.supply.deliveries || [])[0] || null'));
        trace.push(d ? `${d.status}@${d.col},${d.row}:hold=${Number(d.holdTurns) || 0}` : 'done');
    }
    ok(/returning@4,5:hold=1/.test(trace[1]), 'на соседнем гексе груз сгружен, статус — возврат с задержкой', trace.join(' → '));
    ok(/returning@4,5:hold=0/.test(trace[2]), 'следующий ход колонна стоит — это и есть задержка на разгрузку', trace.join(' → '));
    ok(/returning@[0-9]+,[0-9]+:hold=0/.test(trace[3]) && !/@4,5/.test(trace[3]),
        'после задержки колонна пошла обратно', trace.join(' → '));
    ok(trace[trace.length - 1] === 'done' || /done/.test(trace.join(',')), 'колонна вернулась на склад', trace.join(' → '));
    ok(s.evalCtx('appData.campaign.opUnits[1].__got') === 100, 'получатель получил груз, стоя на горе',
        String(s.evalCtx('appData.campaign.opUnits[1].__got')));
    const logs = s.logs.join('\n');
    ok(/задержалась на \(4,5\)/.test(logs), 'в журнале сказано про задержку рядом с получателем');
    ok(/вернулась на склад/.test(logs), 'и про возврат колонны');
    ok((s.evalCtx('appData.campaign.supply.stock.ammoSmall')) === 0, 'остаток груза (0) вернулся на склад без потерь');
}

console.log('— 7. версия и сборка —');
{
    ok(/^v\d+\.\d+$/.test(CURRENT_VERSION), 'APP_VERSION в формате vNN.NNN', CURRENT_VERSION);
    ok(SW.indexOf('wargame-' + CURRENT_VERSION) >= 0, 'CACHE_NAME совпадает с APP_VERSION');
    ok(MANIFEST.indexOf(CURRENT_VERSION) >= 0, 'manifest.short_name совпадает с APP_VERSION');
    ok(/supplyReachForMobility/.test(HTML) && /supplyPanelReachFor/.test(HTML),
        'логика достижимости есть и в движке, и в панели');
    ok(/Средства, которые туда не дойдут, недоступны для назначения/.test(HTML),
        'в панели есть пояснение для игрока');
}

console.log('');
if (fails.length) {
    console.log('Итог v13.169 (назначение только достижимого транспорта): PASS ' + pass + ' · FAIL ' + fails.length);
    fails.forEach(f => console.log('   ✗ ' + f));
    process.exit(1);
} else {
    console.log('Итог v13.169 (недостижимый транспорт не назначается; доставка на соседний гекс с задержкой на ход): PASS ' + pass + ' · FAIL 0');
}
