'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const pkg=require('@sparticuz/chromium'),portable=pkg.default||pkg;
const root=path.resolve(__dirname,'..');
(async()=>{
 let broken=true,browser;
 const server=http.createServer((req,res)=>{
  const url=decodeURIComponent(req.url.split('?')[0]);
  if(url==='/__probe')return res.setHeader('Content-Type','text/html').end('<!doctype html><title>SW probe</title>');
  if(url==='/js/tactical_ai.js'&&broken)return res.writeHead(503).end('test outage');
  if(url==='/maps/index.json')return res.setHeader('Content-Type','application/json').end('[]');
  const file=path.resolve(root,'.'+(url==='/'?'/index.html':url));
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,data)=>{
   if(err)return res.writeHead(404).end();
   const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
   res.setHeader('Content-Type',type[path.extname(file)]||'application/octet-stream');
   // Do not download hundreds of optional textures/maps in a core-update test.
   // Executable cache list, version verification and lifecycle stay unchanged.
   if(url==='/service-worker.js')data=Buffer.from(data.toString().replace(/const ASSETS = \[[\s\S]*?\];/,'const ASSETS = [];')+'\n// test delivery '+broken);
   res.end(data);
  });
 });
 await new Promise(r=>server.listen(0,'0.0.0.0',r));
 try{
  browser=await chromium.launch({executablePath:await portable.executablePath(),args:portable.args,headless:true});
  const page=await browser.newPage({serviceWorkers:'allow'}),url=`http://127.0.0.1:${server.address().port}`;
  page.on('dialog',d=>d.dismiss());
  await page.goto(url+'/__probe');
  const state=await page.evaluate(async()=>{
   const reg=await navigator.serviceWorker.register('/service-worker.js');
   const worker=reg.installing;
   if(!worker)return reg.active?'activated':'none';
   return await new Promise(resolve=>{
    const check=()=>{if(['redundant','activated'].includes(worker.state))resolve(worker.state);};
    worker.addEventListener('statechange',check);check();
   });
  });
  assert.equal(state,'redundant','incomplete build must not install');
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller),null);
  await page.evaluate(()=>caches.open('other-app-cache').then(c=>c.put('/other',new Response('keep'))));
  broken=false;
  await page.evaluate(async()=>{
   const reg=await navigator.serviceWorker.register('/service-worker.js');
   await reg.update();await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(await page.evaluate(()=>caches.has('other-app-cache')),true);
  const missing=await page.evaluate(async()=>{
   const keys=await caches.keys(),name=keys.find(k=>/^wargame-v/.test(k));
   const cache=await caches.open(name),html=await(await cache.match('/index.html')).text();
   const paths=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
   const missing=[];for(const p of paths)if(!await cache.match('/'+p))missing.push(p);return missing;
  });
  assert.deepEqual(missing,[]);
  await page.context().setOffline(true);
  await page.goto(url+'/index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>typeof tacticalActionAllowed==='function' && typeof renderMapActionPanel==='function' && typeof isOfflineCampaignAIEnabled==='function');
  assert.equal(await page.evaluate(()=>typeof saveData),'function');
  console.log('PASS: real service worker rejects incomplete core, preserves unrelated cache and boots offline.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
