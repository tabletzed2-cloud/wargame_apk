'use strict';
const fs=require('node:fs'), path=require('node:path'), {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
let failed=false;
const commands=[['node',['test_harness/checkhtml.js']],['python3',['tools/verify_build.py']]];
for (const file of ['service-worker.js',...fs.readdirSync(path.join(root,'js')).filter(f => f.endsWith('.js')).map(f => 'js/'+f)]) commands.push([process.execPath,['--check',file]]);
for(const [cmd,args] of commands){const result=spawnSync(cmd,args,{cwd:root,stdio:'inherit'});if(result.status!==0) failed=true;}
process.exitCode=failed?1:0;
