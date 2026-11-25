'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {ROOT,HTML}=require('./extract');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wargame-build-check-'));
try {
 const files=['index.html','service-worker.js','manifest.json','tools/verify_build.py',
  ...[...HTML.matchAll(/<(?:script[^>]+src|link[^>]+href)="([^"]+)"/g)].map(m=>m[1]).filter(f=>/\.(js|css)$/.test(f))];
 for(const file of files){const target=path.join(temp,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(ROOT,file),target);}
 const run=()=>spawnSync('python3',[path.join(temp,'tools/verify_build.py')],{cwd:os.tmpdir(),encoding:'utf8'});
 let result=run();assert.equal(result.status,0,result.stdout+result.stderr);
 const target=path.join(temp,'js/tactical_ai.js');
 fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace(/BUILD-МАРКЕР: v[\d.]+/,'BUILD-МАРКЕР: stale'));
 result=run();assert.equal(result.status,1);assert.match(result.stdout,/Wrong build marker: js\/tactical_ai.js/);
 console.log('PASS: build verifier checks every executable and returns failure exit status.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
