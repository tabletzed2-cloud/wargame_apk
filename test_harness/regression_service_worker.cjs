'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {ROOT, HTML} = require('./extract');
const source = fs.readFileSync(path.join(ROOT,'service-worker.js'),'utf8');
const currentCache = /CACHE_NAME = '([^']+)'/.exec(source)[1];
const currentVersion = /var APP_VERSION = '([^']+)'/.exec(HTML)[1];
async function simulate({missing, stale} = {}) {
  const handlers={}, deleted=[], contents=new Map(); let activated=false;
  const ctx=vm.createContext({console:{warn(){},error(){}},
    Request:class {constructor(url){this.url=url;}},
    fetch:async () => ({ok:true,json:async () => []}),
    self:{addEventListener(type,handler){handlers[type]=handler;},skipWaiting(){activated=true;},clients:{claim(){}}},
    caches:{
      delete:async name => {deleted.push(name);return true;},
      keys:async () => ['other-app-cache','wargame-v0.1','wargame-apk-v0.1',currentCache],
      open:async () => ({
        async add(request){
          const url=typeof request==='string'?request:request.url;
          if (url===missing) throw Error('network failure');
          const file=path.join(ROOT,url==='./'?'index.html':url);
          let text=fs.existsSync(file)&&fs.statSync(file).isFile()?fs.readFileSync(file,'utf8'):'';
          if (url===stale) text=text.replaceAll(currentVersion,'v0.0');
          contents.set(url,text);
        },
        async match(url){return contents.has(url)?{text:async () => contents.get(url)}:undefined;}
      })
    }
  });
  vm.runInContext(source,ctx);
  let promise;
  handlers.install({waitUntil(p){promise=p;}});
  if (missing || stale) {
    await assert.rejects(promise);
    assert.equal(activated,false,'failed build must not activate');
  } else {
    await promise;
    assert.equal(activated,true);
    for (const m of HTML.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.ok(contents.has('./'+m[1]),m[1]+' cached');
    handlers.activate({waitUntil(p){promise=p;}});await promise;
    assert.ok(!deleted.includes('other-app-cache'),'unrelated app cache survives');
    assert.ok(deleted.includes('wargame-v0.1'));
    assert.ok(!deleted.slice(1).includes(currentCache),'current cache survives activation');
  }
}
(async () => {
  await simulate();
  await simulate({missing:'./js/tactical_ai.js'});
  await simulate({missing:'./js/operational_management.js'});
  await simulate({stale:'./js/map_actions.js'});
  console.log('PASS: complete SW installation, failed downloads, stale modules and cache namespace isolation.');
})().catch(error => {console.error(error);process.exitCode=1;});
