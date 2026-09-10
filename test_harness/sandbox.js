// ⚡ dev-инструмент: node-песочница для функций оперативной карты wargame_apk
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sliceFunction, ROOT } = require('./extract');

function makeEl(id) {
    return {
        id: id || '',
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
        disabled: false,
        options: [],
        className: '',
        classList: { add() {}, remove() {}, contains() { return false; } },
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        removeChild() {},
        remove() {},
        focus() {},
        blur() {},
        click() {},
        getContext() {
            const noop = () => {};
            return new Proxy({}, {
                get(t, k) {
                    if (k === 'measureText') return () => ({ width: 10 });
                    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
                    return noop;
                },
                set() { return true; }
            });
        },
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
    };
}

function freshAppData() {
    return {
        squads: [],
        map: null,
        currentTurn: 1,
        currentBattleId: null,
        templates: [],
        factions: {},
        campaign: {
            active: true,
            currentTurn: 1,
            currentTime: 840,
            playerFaction: 'BeVe',
            opUnits: [],
            enemyOpUnits: [],
            opMapGrid: {},
            activeBattles: [],
            selectedOpUnit: null,
            opMapMode: 'view',
            opZoomLevel: 1,
            opCenters: [],
            battalions: { player: { faction: 'BeVe' } },
            opUnitsSignature: null
        }
    };
}

function createSandbox(appData) {
    const logs = [];
    const alerts = [];
    const elements = {};

    const documentStub = {
        getElementById: (id) => {
            if (!elements[id]) elements[id] = makeEl(id);
            return elements[id];
        },
        querySelector: () => makeEl('q'),
        querySelectorAll: () => [],
        createElement: (tag) => makeEl(tag),
        addEventListener: () => {},
        body: makeEl('body')
    };

    const sandbox = {
        console,
        document: documentStub,
        appData,
        logs,
        alerts,
        alert: (m) => { alerts.push(String(m)); },
        // ⚡ v13.038: confirm-строб (тесты переопределяют: s.run('confirm = () => false;'))
        confirm: () => true,
        setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) }),
        log: (m) => { logs.push(String(m)); },
        saveData: () => {},
        redrawOperationalMap: () => {},
        redrawMap: () => {},
        updateUI: () => {},
        updateOpPlaceSelect: () => {},
        cancelOpShooting: () => {},
        updateOrderWaypointsDisplay: () => {},
        showMapCodeModal: () => {},
        exportTerrainMap: () => {},
        pickTargetHex: () => {},
        startTacticalBattle: () => {},
        renderActiveOrders: () => {},
        renderOrderQueue: () => {},
        updateBattalionPanel: () => {},
        showBattalionPanel: () => {},
        getNightModifier: () => 1,
        countAtGuns: () => 1,
        getArmorUnits: (units) => (units || []).filter(u => u && (u.armor || u.type === 'tank_platoon' || u.type === 'btr_platoon' || u.type === 'armored_vehicle_platoon' || u.type === 'sau_battery' || u.type === 'dots')),
        getInfantryUnits: (units) => (units || []).filter(u => u && !u.armor && u.type !== 'tank_platoon' && u.type !== 'btr_platoon' && u.type !== 'armored_vehicle_platoon' && u.type !== 'sau_battery' && u.type !== 'dots' && u.type !== 'regimental_artillery'),
        getFactionCrewWeapons: () => [],
        getOpHexTypes: (col, row) => {
            const c = (appData.campaign.opMapGrid || {})['' + col + ',' + row];
            if (!c) return ['grass'];
            if (Array.isArray(c)) return c;
            return c.types || ['grass'];
        },
        checkVehicleRadioAfterLoss: () => {},
        createEnemyOperationalUnits: () => {},
        applyDamageToOpUnit: (t, d) => {
            let applied = 0, killed = 0;
            (t.squads || []).forEach(sq => (sq.fighters || []).forEach(f => {
                if (applied >= d || f.hp <= 0) return;
                const x = Math.min(f.hp, d - applied);
                f.hp -= x; applied += x;
                if (f.hp <= 0) killed++;
            }));
            return { damage: applied, killed };
        },
        showAtShootResultModal: (r) => { logs.push('[showAtShootResultModal] hits=' + (r.hits) + ' destroyed=' + (r.destroyed)); },
        showShootResultModal: (r) => { logs.push('[showShootResultModal] damage=' + r.damage); },
        showShootNotification: () => {},
        opShootingState: { active: false, shooter: null, weaponType: null, targetHex: null },
        OP_MAP_COLS: 20,
        OP_MAP_ROWS: 15,
        hardMode: { enabled: false, hqUnitId: null }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    // Math — подменяемый (deterministic sequences)
    sandbox.Math = Object.create(Math);
    // ⚡ v13.037: ссылка на контекст на самом объекте песочницы —
    //    setRandom работает и с wrapper'ом, и с «сырой» sandbox
    //    (старые тесты вызывают setRandom(ss.sandbox, seq))
    sandbox.__ctx = null; // заполняется после vm.createContext

    const ctx = vm.createContext(sandbox);
    // ⚠️ rollD6/rollD10 ОБЯЗАТЕЛЬНО внутри контекста — замыкание на
    //    Math из Node-кода ловит Node-Math, а не подменяемый sandbox.Math
    vm.runInContext('function rollD6() { return Math.floor(Math.random() * 6) + 1; }\n' +
                    'function rollD10() { return Math.floor(Math.random() * 10) + 1; }\n' +
                    'var APP_VERSION = "v13.044"; // дубль глобала из index.html (вне извлечения FNS)', ctx);
    // js-модули игры
    for (const f of ['js/weapons.js', 'js/data.js', 'js/cards.js', 'js/templates.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
    }
    // извлечённые из index.html функции (пишет probe в /tmp/wg_part.js)
    if (fs.existsSync('/tmp/wg_part.js')) {
        vm.runInContext(fs.readFileSync('/tmp/wg_part.js', 'utf8'), ctx, { filename: 'wg_part.js' });
    }
    sandbox.__ctx = ctx;
    return {
        sandbox,
        ctx,
        logs,
        alerts,
        elements,
        evalCtx: (expr) => vm.runInContext(expr, ctx),
        run: (code) => vm.runInContext(code, ctx)
    };
}

// ⚡ v13.037: фикс — присваивание Math ДОЛЖНО быть внутри контекста:
//    `sandbox.Math = M` после vm.createContext контекст не видит
//    (Math остаётся встроенным, случайность «утекает» в Node-Math).
function setRandom(wrapper, values) {
    let i = 0;
    const M = Object.create(Math);
    M.random = () => {
        if (i >= values.length) throw new Error('random exhausted');
        return values[i++];
    };
    const vm = require('vm');
    const sandbox = wrapper && wrapper.sandbox ? wrapper.sandbox : wrapper;
    const ctx = (wrapper && wrapper.ctx) || sandbox.__ctx;
    if (ctx) {
        sandbox.__M = M; // хост→sandbox видно из контекста (проверено)
        vm.runInContext('Math = __M;', ctx);
    } else {
        sandbox.Math = M; // без контекста — хотя бы на хосте
    }
    return M;
}

module.exports = { createSandbox, freshAppData, makeEl, setRandom, sliceFunction };
