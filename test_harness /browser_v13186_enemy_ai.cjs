'use strict';
// NODE_PATH=<node_modules> LD_LIBRARY_PATH=<chromium libs> node "test_harness /browser_v13186_enemy_ai.cjs"
// ⚡ v13.186 (этап B): проверка в живом приложении — модуль врага загружен,
//   доктрины назначаются, фаза противника реально двигает отряды на карте,
//   СКРЫТЫЙ отряд игрока не притягивает врага (честность), VP и лимит раундов на месте.
const {chromium}=require('playwright-core');const c=require('@sparticuz/chromium');const pk=c.default||c;
const http=require('http'),fs=require('fs'),path=require('path');
const root='/home/user/wargame_apk';
(async()=>{
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]);const f=path.resolve(root,'.'+(u==='/'?'/index.html':u));fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':'application/octet-stream');res.end(d);});});
await new Promise(r=>server.listen(0,'0.0.0.0',r));
const b=await chromium.launch({executablePath:await pk.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader'],headless:true});
const pg=await b.newPage({serviceWorkers:'block'});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
await pg.waitForFunction(()=>typeof runEnemyOperationalPhase==='function');
const r=await pg.evaluate(()=>{
 const out=[];const ck=(n,ok,x)=>out.push({n,ok:!!ok,x});
 ck('модуль загружен', typeof ENEMY_AI==='object' && typeof enemyAiDoctrineFor==='function');
 ck('сортировка доктрин: САУ держит', enemyAiDoctrineFor({name:'САУ 75-мм батарея',type:'sau_battery'})==='hold', enemyAiDoctrineFor({name:'САУ 75-мм батарея'}));
 // трогаем настоящую кампанию: подкладываем врага и наш обнаруженный отряд
 const camp=appData.campaign||(appData.campaign={});
 const saved={opUnits:camp.opUnits,enemyOpUnits:camp.enemyOpUnits,currentTurn:camp.currentTurn};
 camp.opUnits=[{name:'НАШ',col:6,row:6,detected:true,ap:4,maxAp:4,squads:[{fighters:[{hp:2}]}]}];
 camp.enemyOpUnits=[{name:'ВРАГ-танк',col:2,row:6,ap:4,maxAp:4,aiDoctrine:'counterattack',squads:[{fighters:[{hp:2}],currentMorale:100}]}];
 camp.currentTurn=9;
 const rep=runEnemyOperationalPhase();
 ck('фаза вернула отчёт', rep && rep.units===1, JSON.stringify(rep.details));
 ck('враг сдвинулся', camp.enemyOpUnits[0].col>2, camp.enemyOpUnits[0].col);
 ck('доктрина в отчёте', rep.details[0] && rep.details[0].doctrine==='counterattack');
 ck('ОД потрачены', camp.enemyOpUnits[0].ap<4, camp.enemyOpUnits[0].ap);
 // честность: скрытый отряд не притягивает врага
 camp.opUnits=[{name:'СКРЫТ',col:8,row:6,detected:false,ap:4,maxAp:4,squads:[{fighters:[{hp:2}]}]}];
 camp.enemyOpUnits=[{name:'ВРАГ-пехота',col:2,row:6,ap:4,maxAp:4,aiDoctrine:'counterattack',squads:[{fighters:[{hp:2}],currentMorale:100}]}];
 const rep2=runEnemyOperationalPhase();
 ck('скрытый отряд не цель', camp.enemyOpUnits[0].col===2, camp.enemyOpUnits[0].col+':'+JSON.stringify(rep2.details[0]));
 // VP и лимит раундов
 camp.scenario='valencia'; camp.playerFaction='BeVe';
 const vp=campaignObjectiveVpTable();
 ck('VP-таблица строится по объективам сценария', vp && vp.max>0, JSON.stringify({max:vp.max,p:vp.primary.length,a:vp.additional.length}));
 const score=campaignObjectiveVpScore();
 ck('счёт VP читается', score && score.max===vp.max, JSON.stringify({p:score.player,max:score.max}));
 ck('лимит раундов', TACTICAL_BATTLE_ROUND_LIMIT>0, TACTICAL_BATTLE_ROUND_LIMIT);
 ck('очки боя считаются', tacticalBattleVictoryPoints({result:'victory',playerSquads:[],enemySquads:[{isDestroyed:true,fighters:[]}]}).player>=3);
 // вражеская рукопашная
 ck('вражеская рукопашная доступна', typeof resolveTacticalMeleesForEnemySide==='function');
 Object.assign(camp,saved);
 return out;
});
let bad=0;
for(const c of r){if(c.ok)console.log('PASS '+c.n);else{bad++;console.log('FAIL '+c.n+' → '+c.x);}}
const pe=errs.filter(e=>!/ResizeObserver|favicon|service|offline|Firebase/i.test(e));
if(pe.length){bad++;console.log('FAIL ошибки JS: '+pe.slice(0,2).join(' | '));}else console.log('PASS нет ошибок JS');
console.log('\nИТОГ: PASS '+(r.filter(x=>x.ok).length)+' · FAIL '+bad);
await b.close();server.close();process.exit(bad?1:0);})();
