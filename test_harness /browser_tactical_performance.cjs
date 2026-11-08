'use strict';
// NODE_PATH=<modules containing playwright-core and @sparticuz/chromium> node this-file
// Real Chromium, visible tactical map: CPU x4, painted frames, selection, save and routes.
const {chromium} = require('playwright-core');
const chromiumPackage = require('@sparticuz/chromium');
const portable = chromiumPackage.default || chromiumPackage;
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(process.env.WARGAME_ROOT || path.join(__dirname, '..'));
(async () => {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json'};
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath: await portable.executablePath(), args: portable.args, headless:true});
    const page = await browser.newPage({viewport:{width:420,height:850}, serviceWorkers:'block'});
    page.on('dialog', d => d.dismiss());
    const failed={};page.on('response',r=>{if(r.status()>=400)failed[r.url()]=(failed[r.url()]||0)+1;});
    const requests={};page.on('request',r=>{requests[r.resourceType()]=(requests[r.resourceType()]||0)+1;});
    if(process.env.TRACE_ASYNC)await page.addInitScript(()=>{
      window.__perfAsync=[];window.__perfAsyncTotals={};
      const wrap=(fn,kind,stack)=>function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{const ms=performance.now()-t;const k=kind+stack;const total=window.__perfAsyncTotals[k]||(window.__perfAsyncTotals[k]={kind,stack,calls:0,ms:0});total.calls++;total.ms+=ms;if(ms>30)window.__perfAsync.push({kind,name:fn.name,ms,at:t,stack});}};
      for(const kind of ['setTimeout','setInterval']){const original=window[kind];window[kind]=function(fn,...args){return original(typeof fn==='function'?wrap(fn,kind,new Error().stack):fn,...args);};}
      const Observer=MutationObserver;window.MutationObserver=class extends Observer{constructor(fn){super(wrap(fn,'mutation',new Error().stack));}};
    });
    await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil:'load'});
    await page.waitForFunction(() => typeof openHexEditorForBattle === 'function');
    const session=await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    if(process.env.TRACE_FILE)await session.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing',transferMode:'ReturnAsStream'});
    if(process.env.CPU_PROFILE){await session.send('Profiler.enable');await session.send('Profiler.start');}
    const results=await page.evaluate(async()=>{
      ONLINE.started=false;ONLINE.docRef=null;
      if(!location.search.includes('hiddenFixture')) {
        document.getElementById('mainMenu').style.display='none';
        document.getElementById('battleApp').style.display='block';
        document.querySelectorAll('.tabcontent').forEach(el=>el.style.display='none');
        document.getElementById('mapTab').style.display='block';
      }
      const results=[];
      const timings={};
      // Independent reference: original unoptimized visibility union.
      const referenceVisibility=()=>{
        const visible=new Set(),grid=appData.map.grid;
        for(const key of Object.keys(grid))for(const id of grid[key].squadIds || []){
          const squad=appData.squads[id];if(!squad || squad.hidden || squad.isDestroyed || squad.isRetreated)continue;
          const [col,row]=key.split(',').map(Number);
          let range=Math.max(1,Number(squad.visionRange)||6);
          if(isNightTime() && !tacticalIlluminationActive())range=Math.max(1,Math.floor(range/2));
          for(let r=Math.max(0,row-range);r<=Math.min(19,row+range);r++)for(let c=Math.max(0,col-range);c<=Math.min(19,col+range);c++){
            if(hexGridDistance(col,row,c,r)>range)continue;
            if(tacticalHasLineOfSight({col,row},{col:c,row:r}))visible.add(`${c},${r}`);
          }
        }
        for(const item of appData.map.reconRevealedHexes || [])if(item && Number(item.expiresTurn)>=Number(currentTurn) && grid[String(item.key)])visible.add(String(item.key));
        return [...visible].sort().join(';');
      };
      for(const name of ['tacticalMoveAlongPath','pushTacticalUndoSnapshot','tacticalAutoEngageMelee','tacticalCheckMaraudingOnEntry','tacticalMaybeTriggerFireField','tacticalMarkTacticalHexOccupied','spendAP','buildTacticalVisibleHexes','tacticalHasLineOfSight','calculateReachableHexes','updateTacticalEncirclementIfChanged','syncLiveMapSupplyPoints','saveData','updateUI','redrawMap']) {
        const fn=window[name];if(typeof fn!=='function')continue;
        window[name]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{const item=timings[name]||(timings[name]={calls:0,ms:0});item.calls++;item.ms+=performance.now()-t;}};
      }
      const sample=async(fn,n=5)=>{const times=[];for(let i=0;i<n;i++){const t=performance.now();fn(i);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));times.push(performance.now()-t);}return times;};
      for(const count of [20,40,80]) {
        const template=JSON.parse(JSON.stringify(SQUAD_TEMPLATES.find(s=>s.fighters && s.fighters.length>=7 && !s.armor)));
        appData.squads=Array.from({length:count},(_,i)=>({...JSON.parse(JSON.stringify(template)),name:'Performance squad '+i,opUnitName:'Performance unit',hexPos:[4+i%5,4+Math.floor(i/5)],hidden:false}));
        const grid={};for(let r=0;r<20;r++)for(let c=0;c<20;c++)grid[`${c},${r}`]={type:(c===12 && r%3===0)?'forest':'grass',squadIds:[],enemySquadIds:[],markers:[],level:0};
        appData.squads.forEach((s,i)=>grid[s.hexPos.join(',')].squadIds.push(i));
        const enemy=JSON.parse(JSON.stringify(template));enemy.name='enemy';enemy.hexPos=[18,18];enemy.detected=true;grid['18,18'].enemySquadIds=[0];
        appData.map={grid,enemySquads:[enemy],mode:'move',mapSize:20,baseHexSize:25,zoomLevel:1,centers:[],reachableHexes:[],hexKey:'6,9'};
        const b={id:777,hexKey:'6,9',currentTurn:1,windowStartTurn:1,tacticalPhasesCompleted:0,cardsChosen:true,placement:{phase:'done',attackerSide:'player'},playerSquads:appData.squads,enemySquads:[enemy],tacticalMap:appData.map};
        appData.campaign.active=true;appData.campaign.online=null;appData.campaign.activeBattles=[b];appData.currentBattleId=b.id;
        appData.campaign.opUnits=[{name:'Performance unit',type:'infantry_platoon',col:6,row:9,squads:appData.squads}];appData.campaign.enemyOpUnits=[];
        currentTurn=1;appData.currentTurn=1;TACTICAL_MAP_SIZE=20;actionPoints={};
        appData.squads.forEach((_,i)=>ensureAP(i));
        currentSquadIndex=0;currentSquad=appData.squads[0];
        for(let variant=0;variant<3;variant++) {
          appData.squads[0].visionRange=variant+3;appData.squads[1].hidden=variant===1;
          grid['6,6'].type=variant===2?'forest':'grass';grid['7,7'].level=variant;
          appData.map.reconRevealedHexes=[{key:'19,0',expiresTurn:1}];
          if([...buildTacticalVisibleHexes()].sort().join(';')!==referenceVisibility())throw new Error('optimized visibility differs from reference');
        }
        redrawMap();await new Promise(resolve=>setTimeout(resolve,100));
        for(const key of Object.keys(timings))delete timings[key];
        const redraw=await sample(()=>redrawMap());
        const select=await sample(i=>mapSelectSquadOnMap(i,appData.squads[i].hexPos.join(',')));
        const save=await sample(()=>saveData(),3);
        const ui=await sample(()=>updateUI(),3);
        const snapshot=JSON.parse(JSON.stringify(timings));
        // Real animated two-hex movement, not just calling the renderer.
        const oldKey=appData.squads[0].hexPos.join(',');
        const target=getHexNeighbors(oldKey).find(key=>grid[key] && Number.isFinite(getMovementCost(appData.squads[0],oldKey,key,false,getAP(0))));
        if(!target)throw new Error('no legal benchmark move');
        let staleWarnings=0;const warn=console.warn;console.warn=(...args)=>{if(String(args[0]).includes('зависший лок'))staleWarnings++;warn(...args);};
        const startMove=performance.now();
        const last=getHexNeighbors(target).find(key=>key!==oldKey && grid[key] && Number.isFinite(getMovementCost(appData.squads[0],target,key,false,getAP(0))));
        if(!last)throw new Error('no second legal benchmark step');
        if(!tacticalMoveAlongPath(0,[target,last],last))throw new Error('movement rejected');
        while(__tacticalMovement && performance.now()-startMove<5000)await new Promise(resolve=>setTimeout(resolve,20));
        const movementMs=performance.now()-startMove;
        console.warn=warn;
        if(__tacticalMovement || appData.squads[0].hexPos.join(',')!==last || staleWarnings)throw new Error('movement stuck or failed');
        results.push({count,cpuThrottle:4,redraw,select,save,ui,movementMs,asyncTasks:(window.__perfAsync || []).filter(x=>x.at>=startMove),staleWarnings,visibilityEquivalent:true,functions:snapshot,movementFunctions:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,{calls:v.calls-(snapshot[k]?.calls || 0),ms:v.ms-(snapshot[k]?.ms || 0)}]))});
      }
      results[0].asyncTotals=Object.values(window.__perfAsyncTotals || {}).sort((a,b)=>b.ms-a.ms).slice(0,12);return results;
    });
    for(const scenario of results){
      assert(scenario.visibilityEquivalent,'visibility reference must match');
      assert.equal(scenario.staleWarnings,0,'no stale movement lock');
      assert(scenario.movementMs<1500,`route freeze with ${scenario.count} squads: ${scenario.movementMs}ms`);
      assert(Math.max(...scenario.redraw,...scenario.select)<1500,`painted-frame freeze with ${scenario.count} squads`);
    }
    if(process.env.CPU_PROFILE){const {profile}=await session.send('Profiler.stop');fs.writeFileSync(process.env.CPU_PROFILE,JSON.stringify(profile));}
    if(process.env.TRACE_FILE){const complete=new Promise(resolve=>session.once('Tracing.tracingComplete',resolve));await session.send('Tracing.end');const {stream}=await complete;let text='';for(;;){const data=await session.send('IO.read',{handle:stream});text+=data.data;if(data.eof)break;}await session.send('IO.close',{handle:stream});fs.writeFileSync(process.env.TRACE_FILE,text);}
    if(process.env.REQUEST_STATS)console.error(JSON.stringify({failed,requests}));
    console.log(JSON.stringify(results,null,2));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
