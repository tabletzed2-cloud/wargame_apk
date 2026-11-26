'use strict';
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const all = process.argv.includes('--all');
const compareKnown = process.argv.includes('--known');
const known = new Set(require('../test_harness/known-failures.json').failures.map(item => item.file));
const selected = [
  'regression_v13202_playtest.cjs', 'regression_v13201_mechanics.cjs', 'regression_review_hardening.cjs', 'regression_service_worker.cjs', 'regression_build_verifier.cjs',
  'regression_vehicle_mobility_sectors.cjs', 'regression_tactical_user_report_fixes.js',
  'regression_arena_playtest_vehicle_fixes.cjs', 'regression_v13115_vehicle_sectors.js',
  'regression_v13116_vehicle_artillery_button.js', 'regression_v13197_vehicle_fire_controls.cjs',
  'regression_v13198_screen_and_vehicle_mg.cjs'
];
const tests = all ? fs.readdirSync(path.join(root,'test_harness')).filter(f => /^regression.*\.(?:js|cjs)$/.test(f)).sort() : selected;
const results=[];
for (const file of tests) {
  const run=spawnSync(process.execPath,[path.join(root,'test_harness',file)],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  const ok=run.status===0;
  results.push({file,ok,status:run.status,error:run.error?.message,output:(run.stdout+run.stderr).slice(-12000)});
  console.log(`${ok?'PASS':compareKnown && known.has(file)?'KNOWN FAIL':'FAIL'} ${file}`);
  if (!ok && !(compareKnown && known.has(file))) console.error((run.stdout+run.stderr).slice(-3000));
}
const failed=results.filter(r => !r.ok).length;
console.log(`${tests.length-failed}/${tests.length} passed (${all?'all legacy regressions':'maintained smoke suite'})`);
if (all) {
  fs.mkdirSync(path.join(root,'node_modules'),{recursive:true});
  fs.writeFileSync(path.join(root,'node_modules','regression-audit.json'),JSON.stringify(results,null,2));
}
const unexpected=results.filter(r => !r.ok && (!compareKnown || !known.has(r.file)));
if (compareKnown) console.log(`${failed} known/current failures, ${unexpected.length} new failures against the recorded baseline`);
process.exitCode=unexpected.length?1:0;
