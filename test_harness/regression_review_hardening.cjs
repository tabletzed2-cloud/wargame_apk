'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {HTML, ROOT, sliceFunction, declarations} = require('./extract');
const {createSandbox, freshAppData} = require('./sandbox');
function context(names, extra = {}, source = HTML) {
  const ctx = vm.createContext({console, ...extra});
  for (const name of names) vm.runInContext(sliceFunction(source, name), ctx);
  return ctx;
}
(async () => {
  // An import is persisted as supplied, never snapshotted over by live globals.
  const store = new Map([['save','old-save']]);
  let reloaded = 0, warned = 0, failed = false;
  const ctx = context(['safeLocalStorage','persistAppData','validateImportedData','installImportedData','saveData'], {
    console:{log(){},warn(){},error(){}}, STORAGE_KEY:'save',
    window:{localStorage:{getItem:k => store.get(k) ?? null, setItem(k,v){if (failed) throw Error('QuotaExceededError');store.set(k,v);}}},
    document:{getElementById:() => null}, showPersistenceFailure(){warned++;},
    location:{reload(){reloaded++;}}, appData:{currentBattleId:null}, hardMode:{enabled:false},
    rememberUiScreen(){}, saveInitialCampaignCardDraft(){}
  });
  const imported = {factions:{},templates:[],squads:[],hardMode:{enabled:true},campaign:{activeBattles:[]}};
  ctx.imported = imported;
  vm.runInContext('installImportedData(imported)',ctx);
  assert.equal(JSON.parse(store.get('save')).hardMode.enabled,true);
  assert.equal(store.get('save.before-import'),'old-save');
  assert.equal(reloaded,1);
  assert.equal(ctx.window.__wargameResetting,true,'unload cannot replace imported data');
  ctx.window.__wargameResetting = false;
  failed = true;
  assert.equal(vm.runInContext('saveData()',ctx),false,'quota failure is not success');
  assert.equal(warned,1);
  assert.equal(JSON.parse(store.get('save')).hardMode.enabled,true,'previous save survives quota failure');
  assert.throws(() => vm.runInContext('installImportedData({campaign:{}})',ctx),/Ожидается/);
  assert.throws(() => ctx.validateImportedData({...imported, campaign:{activeBattles:'bad'}}),/activeBattles/);
  assert.throws(() => ctx.validateImportedData(JSON.parse('{"factions":{},"templates":[],"squads":[],"__proto__":{}}')),/ключ/);
  ctx.window.__wargameRecoveryPending = true;
  assert.equal(vm.runInContext('saveData()',ctx),false,'recovery blocks autosave');

  const safe = context(['escapeCardHtml','safeLogHtml','safeImageUrl']);
  assert.equal(safe.safeLogHtml('<img src=x onerror="evil()"><b>ok</b>'), '&lt;img src=x onerror=&quot;evil()&quot;&gt;<b>ok</b>');
  assert.equal(safe.safeLogHtml('<b onclick="evil()">x</b>'), '&lt;b onclick=&quot;evil()&quot;&gt;x</b>');
  assert.equal(safe.safeImageUrl('javascript:evil()'),'');
  assert.equal(safe.safeImageUrl('data:image/svg+xml,evil'),'');
  assert.equal(safe.safeImageUrl('images/icon.png'),'images/icon.png');

  // Transactions are serialized by this test store. Each callback reads the
  // CURRENT record, not a captured snapshot; stale turn proposals do nothing.
  const records = new Map(); let queue = Promise.resolve();
  const db = {runTransaction(callback) {
    const result = queue.then(() => callback({
      async get(ref){return {exists:records.has(ref),data:() => structuredClone(records.get(ref))};},
      set(ref,value){records.set(ref,structuredClone(value));},
      update(ref,patch){
        const value = records.get(ref);
        for (const [key,v] of Object.entries(patch)) {
          const parts = key.split('.');let target=value;
          for (const p of parts.slice(0,-1)) target=target[p];
          target[parts.at(-1)]=v;
        }
      }
    }));
    queue=result.catch(() => {});return result;
  }};
  const online = context(['onlineCreateRoomRecord','onlineJoinRoomRecord','onlineAdvanceTurnRecord']);
  await online.onlineCreateRoomRecord(db,'room',{status:'lobby',players:{p1:{id:'host'},p2:null}});
  await assert.rejects(online.onlineCreateRoomRecord(db,'room',{}),/ROOM_EXISTS/);
  const joins=await Promise.allSettled(['alice','bob'].map(id => online.onlineJoinRoomRecord(db,'room',id)));
  assert.equal(joins.filter(r => r.status==='fulfilled').length,1,'only one p2 slot');
  assert.equal(await online.onlineJoinRoomRecord(db,'room','host'),'p1','host reconnect keeps role');
  records.set('turn',{status:'playing',turn:3,time:1435,players:{p1:{turnDone:true},p2:{turnDone:true}}});
  const advances=await Promise.all([online.onlineAdvanceTurnRecord(db,'turn',3), online.onlineAdvanceTurnRecord(db,'turn',3)]);
  assert.equal(advances.filter(Boolean).length,1);
  assert.equal(records.get('turn').turn,4);
  records.get('turn').players.p1.turnDone=true;
  assert.equal(await online.onlineAdvanceTurnRecord(db,'turn',3),false);
  assert.equal(records.get('turn').players.p1.turnDone,true,'late write does not reset next turn readiness');

  const source=fs.readFileSync(path.join(ROOT,'js/map_actions.js'),'utf8');
  const map={mode:'move',reachableHexes:['stale'],reachableCosts:{stale:1}};
  let notice='';
  const select=context(['mapSelectSquadOnMap'],{appData:{map,squads:[{}]},console:{error(){}},
    recalcReachable(){throw Error('route failure');},mapActionsOnSelect(){},mapActionInfo(text){notice=text;},redrawMap(){}},source);
  assert.equal(select.mapSelectSquadOnMap(0,'1,2'),false);
  assert.equal(map.reachableHexes.length,0);
  assert.equal(Object.keys(map.reachableCosts).length,0);
  assert.match(notice,/Не удалось/);

  assert.equal(sliceFunction('function sample(){ return "}"; /* } */ }','sample'), 'function sample(){ return "}"; /* } */ }');
  assert.throws(() => sliceFunction('function f(){} function f(){}','f'),/found 2/);
  for (const [name, list] of declarations(HTML)) {
    assert.ok(list.filter(d => d.node.type==='FunctionDeclaration').length<=1, 'duplicate global '+name);
  }
  const strict=createSandbox(freshAppData(),{strictDOM:true,strictRules:true,elementIds:['known']});
  assert.equal(strict.evalCtx('document.getElementById("missing")'),null);
  assert.throws(() => strict.run('setTimeout(() => {throw Error("timer failure")},0)'),/timer failure/);
  assert.throws(() => strict.run('tacticalActionAllowed()'),/explicit stub/);
  assert.equal(strict.evalCtx('APP_VERSION'), /var APP_VERSION = '([^']+)'/.exec(HTML)[1]);
  console.log('PASS: persistence/import, safe messages, room/turn transactions, route errors, parser and strict sandbox.');
})().catch(error => {console.error(error);process.exitCode=1;});
