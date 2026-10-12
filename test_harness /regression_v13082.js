'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MA = fs.readFileSync(path.join(ROOT, 'js/map_actions.js'), 'utf8');
const OB = fs.readFileSync(path.join(ROOT, 'js/online_battles.js'), 'utf8');
let n=0,f=[];
function test(name, fn){ try{fn();n++;console.log('✓',name);}catch(e){f.push(name);console.log('✗',name,e.message);} }
// ⚡ v13.090: проверяем формат версии, а не конкретный номер сборки
test('version', ()=>assert.match(HTML,/var APP_VERSION = 'v13\.0(8[2-9]|9\d)'/));
test('no AT cards', ()=>assert.match(HTML,/function isCardSelectableOpUnit/));
test('cards wait own place', ()=>assert.match(HTML,/не дожидаясь противника/));
test('btr link', ()=>assert.match(HTML,/linkBtrPassengers/));
test('melee resolver', ()=>assert.match(HTML,/function meleeAttack\(fromResolver\)/));
test('pto auto', ()=>assert.match(HTML,/hitTarget = tacMoved/));
test('stealth pace', ()=>assert.match(HTML,/function setTacticalMovePace/));
test('turn text', ()=>assert.match(HTML,/СЕЙЧАС ВАШ ХОД/));
test('fog', ()=>assert.match(HTML,/!enemy\.detected && !enemy\.isDestroyed/));
test('clock', ()=>assert.match(HTML,/advanceTacticalClock\(2\)/));
test('campaign btn', ()=>assert.match(HTML,/btnReturnToCampaign/));
test('multi hex', ()=>assert.match(MA,/pendingTargetHex/));
test('opp finish', ()=>assert.match(OB,/Нажмите «✅ Завершить бой»/));
console.log(n+' passed, '+f.length+' failed');
if(f.length) process.exit(1);
