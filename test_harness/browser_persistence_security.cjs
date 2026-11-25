'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const pkg=require('@sparticuz/chromium'),portable=pkg.default||pkg;
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const url=decodeURIComponent(req.url.split('?')[0]);
  const file=path.resolve(root,'.'+(url==='/'?'/index.html':url));
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,data)=>{
   if(err)return res.writeHead(404).end();
   const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
   res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);
  });
 });
 await new Promise(r=>server.listen(0,'0.0.0.0',r));let browser;
 try{
  browser=await chromium.launch({executablePath:await portable.executablePath(),args:portable.args,headless:true});
  const page=await browser.newPage({serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  const url=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(url,{waitUntil:'load'});
  const check=await page.evaluate(()=>{
   window.__injected=0;
   const attack='<img src=x onerror="window.__injected=1">';
   log(attack);log('<b>Allowed formatting</b>');
   appData.templates=[{name:attack,faction:attack,fighters:[],baseMorale:100}];
   renderTemplates();
   const logElement=document.getElementById('log');
   return {img:logElement.querySelectorAll('img').length,
    bold:logElement.querySelector('b')?.textContent,
    templateImg:document.getElementById('templatesList').querySelectorAll('img').length};
  });
  assert.deepEqual(check,{img:0,bold:'Allowed formatting',templateImg:0});
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>window.__injected),0);
  await page.evaluate(()=>{
   window.__wargameResetting=true;
   localStorage.setItem(STORAGE_KEY,'{corrupted-save');
  });
  await page.reload({waitUntil:'load'});
  assert.equal(await page.evaluate(()=>window.__wargameRecoveryPending),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem(STORAGE_KEY)),'{corrupted-save');
  assert.equal(await page.evaluate(()=>saveData()),false);
  assert.ok(await page.locator('#persistenceFailure').isVisible());
  // Recover through the actual file-input API. Imported Hard Mode survives the
  // pagehide hooks and is restored by the normal load/migration path.
  const imported=await page.evaluate(()=>{
   const data=getDefaultData();data.hardMode={enabled:true,hqUnitId:null};return data;
  });
  await page.evaluate(()=>{
   const input=document.createElement('input');input.type='file';input.id='testImport';input.onchange=importAllData;document.body.appendChild(input);
  });
  await Promise.all([
   page.waitForNavigation({waitUntil:'load'}),
   page.locator('#testImport').setInputFiles({name:'recovered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))})
  ]);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(STORAGE_KEY)).hardMode.enabled),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem(STORAGE_KEY+'.before-import')),'{corrupted-save');
  assert.equal(await page.evaluate(()=>!!window.__wargameRecoveryPending),false);
  assert.equal(await page.evaluate(()=>hardMode.enabled),true);
  assert.deepEqual(errors,[],'no runtime errors during recovery/import');
  console.log('PASS: real DOM injection guards, corrupt-save preservation, file import and reload recovery.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
