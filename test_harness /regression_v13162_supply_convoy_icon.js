'use strict';
// ⚡ v13.162: колонна снабжения на операционной карте едет с иконкой СВОЕГО
//   автомобиля/грузовика (файлы игрока из images/), а не с общим эмодзи.
const fs = require('fs');
const path = require('path');
const { createSandbox, freshAppData } = require('./sandbox');
const { sliceFunction: extractFn, sliceConst: extractConst, HTML } = require('./extract');
const ROOT = path.join(__dirname, '..');

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fails.push(name + (extra !== undefined ? ' → ' + extra : '')); console.log('  ✗ ' + name, extra === undefined ? '' : extra); }
}

const FNS = [
    'supplyConvoyIcon', 'supplyConvoyFaction', 'supplyConvoyVehicleSrc', 'supplyConvoyImage',
    'supplyAssetIconHtml', 'drawSupplyDeliveriesOnMap', 'supplyAssetsLabel', 'opHexCenter'
];
const CONSTS = ['SUPPLY_VEHICLE_ART', 'SUPPLY_VEHICLE_ART_ORDER', 'SUPPLY_ASSET_TYPES', 'loadedSupplyConvoyIcons'];
const parts = CONSTS.map(c => { try { return extractConst(HTML, c); } catch (e) { return ''; } });
FNS.forEach(f => { try { parts.push(extractFn(HTML, f)); } catch (e) {} });
fs.writeFileSync('/tmp/wg_part.js', parts.join('\n\n'));

const TRADO = 'images/BeVe/DAF Trado.png';
const VICUNA = 'images/BeVe/Лёгкий грузовик CLg-37 «Викунья» (Vicuña).png';
const MCV = 'images/BeVe/DAF MC-V.png';

function makeSandbox(playerFaction, imgComplete) {
    const ad = freshAppData();
    ad.campaign.playerFaction = playerFaction;
    ad.campaign.supply = { deliveries: [] };
    const s = createSandbox(ad);
    // подменяем Image: файл «загружен», чтобы проверить drawImage
    s.run(`
        globalThis.__drawn = [];
        globalThis.Image = function () {
            this.complete = ${imgComplete ? 'true' : 'false'};
            this.naturalWidth = ${imgComplete ? '64' : '0'};
            this.naturalHeight = ${imgComplete ? '32' : '0'};
            this.onload = null;
        };
        Object.defineProperty(Image.prototype, 'src', {
            set(v) { this._src = v; },
            get() { return this._src; }
        });
    `);
    return { s, ad };
}

function makeCtx() {
    const calls = [];
    const push = name => (...args) => calls.push({ name, args });
    const ctx = {
        calls,
        save: push('save'), restore: push('restore'), beginPath: push('beginPath'),
        arc: push('arc'), moveTo: push('moveTo'), lineTo: push('lineTo'), closePath: push('closePath'),
        fill: push('fill'), stroke: push('stroke'), setLineDash: push('setLineDash'),
        drawImage: push('drawImage'), fillText: push('fillText'),
        fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: ''
    };
    return ctx;
}

console.log('== v13.162: иконка транспорта колонны снабжения ==');

// ───────────── 1. выбор иконки по составу колонны ─────────────
{
    const { s } = makeSandbox('BeVe', true);
    const src = expr => s.evalCtx(expr);
    ok(src(`supplyConvoyVehicleSrc({ assets: [{ id: 'truck', count: 1 }], faction: 'BeVe' })`) === TRADO,
        'BeVe: грузовик — иконка DAF Trado', src(`supplyConvoyVehicleSrc({ assets: [{ id: 'truck', count: 1 }], faction: 'BeVe' })`));
    ok(src(`supplyConvoyVehicleSrc({ assets: [{ id: 'truck', count: 2 }], faction: 'A.I.R.F.' })`) === VICUNA,
        'A.I.R.F.: грузовик — иконка «Викуньи»', src(`supplyConvoyVehicleSrc({ assets: [{ id: 'truck', count: 2 }], faction: 'A.I.R.F.' })`));
    ok(src(`supplyConvoyVehicleSrc({ assets: [{ id: 'car', count: 1 }], faction: 'BeVe' })`) === MCV,
        'BeVe: автомобиль — иконка DAF MC-V', src(`supplyConvoyVehicleSrc({ assets: [{ id: 'car', count: 1 }], faction: 'BeVe' })`));
    ok(src(`supplyConvoyVehicleSrc({ assets: [{ id: 'truck', count: 1 }, { id: 'porter', count: 3 }], faction: 'BeVe' })`) === TRADO,
        'грузовик с носильщиками — всё равно иконка грузовика');
    ok(src(`supplyConvoyVehicleSrc({ assets: [{ id: 'porter', count: 3 }, { id: 'llama', count: 1 }], faction: 'BeVe' })`) === null,
        'пешая колонна — без картинки (остаётся эмодзи)');
    ok(src(`supplyConvoyVehicleSrc({ assets: [{ id: 'tg41', count: 1 }], faction: 'A.I.R.F.' })`) === null,
        'TG-41 без своего файла — эмодзи');
    ok(src(`supplyConvoyVehicleSrc(null)`) === null, 'без доставки — null');
    // фракция по умолчанию — из кампании
    ok(src(`supplyConvoyVehicleSrc({ assets: [{ id: 'truck', count: 1 }] })`) === TRADO,
        'фракция берётся из кампании, если в доставке не записана');
    // зафиксированная иконка важнее пересчёта
    ok(src(`supplyConvoyVehicleSrc({ assets: [{ id: 'truck', count: 1 }], faction: 'BeVe', iconSrc: '${MCV}' })`) === MCV,
        'сохранённая в доставке иконка приоритетна');
    ok(src(`supplyConvoyFaction({ faction: 'A.I.R.F.' })`) === 'A.I.R.F.', 'supplyConvoyFaction читает поле доставки');
    const arts = JSON.parse(src('JSON.stringify(SUPPLY_VEHICLE_ART)'));
    ok(Object.keys(arts).includes('truck') && Object.keys(arts).includes('car'),
        'в таблице иконок есть грузовик и автомобиль', Object.keys(arts).join(', '));
    ok([TRADO, VICUNA, MCV].every(p => fs.existsSync(path.join(ROOT, p))),
        'все файлы иконок реально существуют в images/');
}

// ───────────── 2. отрисовка на карте ─────────────
{
    const { s, ad } = makeSandbox('BeVe', true);
    ad.campaign.supply = {
        deliveries: [
            { id: 'd1', kind: 'unit', targetUnitId: 0, assets: [{ id: 'truck', count: 2 }], cargo: {},
              mobility: 'vehicle', faction: 'BeVe', col: 4, row: 5, status: 'outbound' },
            { id: 'd2', kind: 'unit', targetUnitId: 0, assets: [{ id: 'porter', count: 2 }], cargo: {},
              mobility: 'foot', faction: 'BeVe', col: 3, row: 5, status: 'outbound' }
        ]
    };
    ad.campaign.opUnits = [{ name: '1-й взвод', col: 6, row: 5 }];
    const REC_CTX = `globalThis.__rec = {
        calls: [],
        save() {}, restore() {}, beginPath() {}, arc() {}, moveTo() {}, lineTo() {},
        fill() {}, stroke() {}, setLineDash() {},
        fillText(t) { this.calls.push(String(t)); },
        drawImage(img, x, y, w, h) { this.calls.push({ src: img && img.src, x, y, w, h }); },
        fillStyle: "", strokeStyle: "", lineWidth: 0, font: "", textAlign: "", textBaseline: ""
    };`;
    const drawWith = deliveriesJs => {
        s.run(REC_CTX);
        s.run(`drawSupplyDeliveriesOnMap(__rec, ${deliveriesJs}, 30);`);
        return JSON.parse(s.evalCtx('JSON.stringify(__rec.calls)'));
    };

    const calls = drawWith(`[
        { id: 'd1', kind: 'unit', targetUnitId: 0, assets: [{ id: 'truck', count: 2 }], cargo: {},
          mobility: 'vehicle', faction: 'BeVe', col: 4, row: 5, status: 'outbound' },
        { id: 'd2', kind: 'unit', targetUnitId: 0, assets: [{ id: 'porter', count: 2 }], cargo: {},
          mobility: 'foot', faction: 'BeVe', col: 3, row: 5, status: 'outbound' }
    ]`);
    const images = calls.filter(c => c && c.src);
    ok(images.length === 1, 'на карте нарисована ровно одна картинка (грузовик)', images.length);
    ok(images[0] && decodeURIComponent(images[0].src) === decodeURIComponent(TRADO),
        'это иконка DAF Trado', images[0] && images[0].src);
    ok(images[0] && images[0].w > 0 && images[0].h > 0, 'картинка вписана в плашку с размером',
        images[0] && `${images[0].w.toFixed(1)}x${images[0].h.toFixed(1)}`);
    ok(images[0] && Math.abs(images[0].w / images[0].h - 2) < 0.01,
        'пропорции файла сохранены (64×32 → 2:1)', images[0] && (images[0].w / images[0].h).toFixed(2));
    const texts = calls.filter(c => typeof c === 'string');
    ok(texts.some(t => /➡/.test(t)) && texts.some(t => /4,5/.test(t)),
        'направление и гекс по-прежнему подписаны', texts.join(' | '));
    ok(texts.some(t => t === '🎒'), 'у пешей колонны остался эмодзи-значок', texts.join(' | '));

    // пешая колонна в одиночку — только эмодзи
    const footCalls = drawWith(`[{ id: 'd3', assets: [{ id: 'porter', count: 1 }], mobility: 'foot', col: 2, row: 2, status: 'returning' }]`);
    ok(!footCalls.some(c => c && c.src), 'пешая колонна картинку не рисует');
    ok(footCalls.some(t => t === '🎒'), 'и показывает 🎒', footCalls.join(' | '));
}

// ───────────── 3. кэш картинки и перерисовка после загрузки ─────────────
{
    const { s } = makeSandbox('BeVe', false);
    const first = s.evalCtx(`supplyConvoyImage('${TRADO}')`);
    ok(first === null, 'пока файл не загружен — картинка не рисуется (эмодзи)');
    ok(s.evalCtx(`!!loadedSupplyConvoyIcons['${TRADO}']`), 'изображение положено в кэш');
    const again = s.evalCtx(`supplyConvoyImage('${TRADO}')`);
    ok(s.evalCtx(`Object.keys(loadedSupplyConvoyIcons).length`) === 1, 'повторный вызов не создаёт второй Image');
    ok(again === null, 'и всё ещё ждёт загрузки');
    ok(/img\.onload = \(\) => \{ try \{ redrawOperationalMap\(\); \} catch \(e\) \{\} \}/.test(HTML),
        'после загрузки файла карта перерисовывается');
    ok(s.evalCtx(`supplyConvoyImage(null)`) === null, 'без пути картинка не запрашивается');
}

// ───────────── 4. новые колонны сохраняют фракцию и иконку ─────────────
{
    ok(/faction: \(appData\.campaign && appData\.campaign\.playerFaction\) \|\| 'BeVe',/.test(HTML),
        'при отправке колонны записывается фракция');
    ok(/delivery\.iconSrc = supplyConvoyVehicleSrc\(delivery\)/.test(HTML),
        'при отправке колонны фиксируется иконка транспорта');
    ok(/const vehicleSrc = \(typeof supplyConvoyVehicleSrc === 'function'\) \? supplyConvoyVehicleSrc\(delivery\) : null;/.test(HTML),
        'отрисовка карты берёт иконку из доставки');
}

// ───────────── 5. значок в панели снабжения ─────────────
{
    const { s } = makeSandbox('A.I.R.F.', true);
    const html = s.evalCtx(`supplyAssetIconHtml('truck')`);
    ok(/<img/.test(html) && decodeURIComponent(html).includes(VICUNA),
        'в панели у грузовика A.I.R.F. — картинка «Викуньи»', html);
    const carHtml = s.evalCtx(`supplyAssetIconHtml('car')`);
    ok(/<img/.test(carHtml) && carHtml.includes('DAF MC-V'), 'у автомобиля в панели — картинка DAF MC-V', carHtml);
    const porterHtml = s.evalCtx(`supplyAssetIconHtml('porter')`);
    ok(!/<img/.test(porterHtml) && /🎒/.test(porterHtml), 'у носильщика остаётся эмодзи', porterHtml);
    ok(/\$\{supplyAssetIconHtml\(id\)\}\$\{t\.name\}/.test(HTML), 'список средств снабжения использует новый значок');
    ok(/const convoySrc = \(typeof supplyConvoyVehicleSrc === 'function'\)/.test(HTML),
        'в списке «Колонны в пути» тоже показывается иконка транспорта');
}

// Не оставляем за собой общий /tmp/wg_part.js: его подгружает каждая следующая
// песочница (sandbox.js), и объявленные здесь const могли конфликтовать с
// переменными других тестов.
try { fs.unlinkSync('/tmp/wg_part.js'); } catch (e) {}

console.log(`\nИтог v13.162 (иконка транспорта снабжения): PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
