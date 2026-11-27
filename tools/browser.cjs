'use strict';
// Portable Linux Chromium carries its supplemental shared libraries. Never
// downloads a browser at test time; npm ci pins the binary and Playwright.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const libs=path.join(root,'node_modules','.chromium-libs');
fs.mkdirSync(libs,{recursive:true});
if (process.platform==='linux') {
  const bin=path.resolve(path.dirname(require.resolve('@sparticuz/chromium')),'..','..','bin','al2023.tar.br');
  const archive=path.join(libs,'al2023.tar');
  fs.writeFileSync(archive,zlib.brotliDecompressSync(fs.readFileSync(bin)));
  const unpack=spawnSync('tar',['-xf',archive,'-C',libs],{stdio:'inherit'});
  if(unpack.status!==0)process.exit(1);
}
for(const file of ['browser_vehicle_mobility_sectors.cjs','browser_persistence_security.cjs','browser_offline_update.cjs','browser_v13201_mechanics.cjs','browser_v13202_playtest.cjs','browser_v13203_playtest.cjs','browser_v13204_detection_ai.cjs','browser_v13205_finite_ammo.cjs','browser_v13206_audit_fixes.cjs','browser_v13207_rout_exit.cjs']) {
  const result=spawnSync(process.execPath,[path.join(root,'test_harness',file)],{cwd:root,stdio:'inherit',timeout:120000,
    env:{...process.env,LD_LIBRARY_PATH:path.join(libs,'lib')+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'')}});
  if(result.status!==0){console.error(result.error||'Browser test failed');process.exit(1);}
}
