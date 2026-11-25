'use strict';
// ⚡ v13.134: регрессия «белого экрана/онлайн не подключается» после v13.133.
//    Миграция normalizeAllLegacyMoraleScales вызывала tacticalNormalizeMoraleScale
//    при загрузке страницы; та обращалась к let-переменной currentSquad через
//    typeof-guard (typeof БРОСАЕТ для TDZ), незработавший скрипт обрывался, и все
//    let/const ниже (currentSquad, placementLocked, orderWaypoints, OP_MAP_ROWS,
//    CAMPAIGN_OBJECTIVE_DEFINITIONS…) навсегда оставались в TDZ — каскад
//    «Cannot access 'X' before initialization» / «X is not defined».
//    Тест прогоняет ВСЕ скрипты страницы по порядку (как <script> в браузере)
//    и требует отсутствия TDZ/необъявленных глобалов при загрузке.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(process.env.INDEX_HTML || path.join(ROOT, 'index.html'), 'utf8');

function makeEl(id) {
  return {
    id: id || '', value: '', innerHTML: '', textContent: '', style: {}, disabled: false,
    options: [], className: '', children: [], childNodes: [], dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {},
    insertBefore() {}, remove() {}, focus() {}, blur() {}, click() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    closest() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    matches() { return false; }, contains() { return false; }, cloneNode() { return makeEl('clone'); },
    parentElement: null, parentNode: null, firstChild: null, lastChild: null,
    nextSibling: null, previousSibling: null, sheet: null,
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
const elements = {};
const documentStub = {
  getElementById: (id) => (elements[id] = elements[id] || makeEl(id)),
  querySelector: () => makeEl(''), querySelectorAll: () => [],
  createElement: (tag) => makeEl(tag), createElementNS: (ns, tag) => makeEl(tag),
  addEventListener() {}, removeEventListener() {},
  body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html'), hidden: false, visibilityState: 'visible',
  defaultView: null
};
const sandbox = {
  console, document: documentStub,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'node', onLine: true },
  location: { href: 'http://localhost/', search: '', hash: '' },
  alert() {}, confirm: () => true, prompt: () => null,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
  Image: function () { return makeEl('img'); },
  DOMParser: function () { return { parseFromString: () => makeEl('doc') }; },
  performance: { now: () => Date.now() },
  crypto: { getRandomValues: (a) => a },
  Event: function () {}, CustomEvent: function () {},
  MutationObserver: function () { return { observe() {}, disconnect() {} }; },
  innerWidth: 1280, innerHeight: 800,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  HTMLElement: function () {}, Node: function () {},
  XMLHttpRequest: function () { this.open = () => {}; this.send = () => {}; }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = function () {};
sandbox.removeEventListener = function () {};
sandbox.dispatchEvent = function () {};
documentStub.defaultView = sandbox;
vm.createContext(sandbox);

// Скрипты страницы в порядке документа: внешние (файлы) + inline
const allTags = HTML.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
const scripts = [];
for (const tag of allTags) {
  const openTag = tag.match(/^<script[^>]*>/)[0];
  const srcM = openTag.match(/src="([^"]*)"/);
  if (srcM) {
    const fp = path.join(ROOT, srcM[1]);
    if (!fs.existsSync(fp)) continue;
    scripts.push(fs.readFileSync(fp, 'utf8') + `\n//# sourceURL=${srcM[1]}`);
  } else {
    scripts.push(tag.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
  }
}

const errors = [];
for (let i = 0; i < scripts.length; i++) {
  try {
    if (process.env.LOAD_DEBUG) console.log('run script #' + i + ' (' + scripts[i].length + ' chars)...');
    vm.runInContext(scripts[i], sandbox, { filename: `inline_script_${i}.js` });
  } catch (e) {
    errors.push(`script #${i} EVAL: ${e.name}: ${e.message}`);
  }
}

// Пробы ключевых глобалов: не должны быть в TDZ/не объявлены после загрузки
const probes = ['currentSquad', 'morale', 'placementLocked', 'orderWaypoints',
  'OP_MAP_ROWS', 'CAMPAIGN_OBJECTIVE_DEFINITIONS', 'appData', 'hardMode'];
for (const name of probes) {
  try {
    const t = vm.runInContext(`typeof ${name}`, sandbox);
    errors.push(`probe ${name}: typeof=${t}`);
  } catch (e) {
    errors.push(`probe ${name}: ${e.name}: ${e.message}`);
  }
}

const fatal = errors.filter(e => /Cannot access|is not defined|EVAL/.test(e));
console.log(errors.filter(e => /probe/.test(e)).join('\n'));
if (fatal.length) {
  console.error('FATAL:\n' + fatal.join('\n'));
  console.error('v13.134 page load (TDZ cascade) regression: FAIL');
  process.exit(1);
}
console.log('v13.134 page load (TDZ cascade) regression: PASS');
process.exit(0); // таймеры страницы держали бы event loop
