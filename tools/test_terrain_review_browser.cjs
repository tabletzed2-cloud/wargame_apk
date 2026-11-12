'use strict';
const {chromium}=require('playwright-core');const pkg=require('@sparticuz/chromium');const portable=pkg.default||pkg;const assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:await portable.executablePath(),args:portable.args,headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:8001/',{waitUntil:'load'});
 for(const id of ['road','water','swamp_passable','swamp_impassable']){
  const checkbox=page.locator(`[data-layer="${id}"]`);await checkbox.uncheck();assert.equal(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).display),'none');await checkbox.check();assert.notEqual(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).display),'none');
 }
 const svg=page.locator('svg');await svg.scrollIntoViewIfNeeded();const box=await svg.boundingBox();
 await svg.click({position:{x:box.width*.5,y:box.height*.5}});
 assert.match(await page.locator('#movement-summary').textContent(),/гексе \d+,\d+/);
 assert.equal(await page.locator('#movement-results>div').count(),6);
 assert.equal(await page.locator('#movement-rays line').count(),6);
 for(const profile of ['wheeled','tracked','amphibious','daf']){await page.locator('#movement-profile').selectOption(profile);assert.equal(await page.locator('#movement-results>div').count(),6);}
 await page.locator('#movement-anchor').check();assert.equal(await page.locator('#movement-results>div').count(),6);
 await page.locator('#movement-profile').selectOption('foot');
 const move=page.locator('#movement-results button').first();assert.ok(await move.count());const before=await page.locator('#movement-summary').textContent();await move.click();assert.notEqual(await page.locator('#movement-summary').textContent(),before,'simulated movement preserves landing for next transition');
 await page.locator('#movement-clear').click();assert.equal(await page.locator('#movement-rays line').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: Chromium layer toggles, actual map click, six transitions, amphibious/DAF profiles, anchor, actual simulated move, reset, no page errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
