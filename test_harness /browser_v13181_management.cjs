'use strict';
// NODE_PATH=<modules containing playwright-core and @sparticuz/chromium> node this-file
// Real Chromium: production deployment, combat, phase authority, runners and order delivery.
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
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil:'load'});
    await page.waitForFunction(() => typeof openHexEditorForBattle === 'function');
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const checks = await page.evaluate(() => {
      let n=0;const check=(ok,text)=>{if(!ok)throw new Error(text);n++;};
      setCampaignTutorialEnabled(false);
      ONLINE.started=false;ONLINE.docRef=null;ONLINE.match=null;
      const c=appData.campaign;c.online=false;c.active=true;c.activeBattles=[];c.playerFaction='BeVe';c.scenario=null;c.currentTurn=1;c.currentTime=480;
      c.opMapGrid={};for(let r=0;r<15;r++)for(let col=0;col<20;col++)c.opMapGrid[col+','+r]={types:['grass']};
      const squad=(name,ammo=150,alive=10)=>({name,faction:'BeVe',fighters:Array.from({length:alive},(_,i)=>({name:'f'+i,hp:3,maxHp:3,weapon:'Винтовка FN model 24/30'})),ammoSmall:ammo,grenades:alive*2,ammoOrdnance:0});
      const supply={name:'Взвод снабжения',type:'supply_platoon',col:2,row:2,squads:Array.from({length:6},(_,i)=>squad('Конная повозка №'+i,0,1))};
      const recipient={name:'1-й взвод',type:'infantry_platoon',col:3,row:2,squads:[squad('Стрелки',120)]};
      c.opUnits=[supply,recipient];c.enemyOpUnits=[];c.supply={};
      let st=ensureSupplyState();st.automatic=true;
      check(runAutomaticSupply()===0,'80 percent exactly does not trigger automation');
      recipient.squads[0].ammoSmall=119;
      check(runAutomaticSupply()===1,'below 80 percent dispatches real caravan');
      check(st.deliveries.length===1 && st.deliveries[0].targetUnitId===1 && st.stock.ammoSmall===1169,'dispatch deducts actual stock and targets unit');
      check(runAutomaticSupply()===0 && st.deliveries.length===1,'pending cargo prevents duplicate automatic caravans');
      check(st.assets.cart.available===5,'real transport pool reserves one cart');
      st.deliveries=[];st.stock={...st.max};recipient.squads[0].ammoSmall=150;recipient.squads[0].grenades=15;
      check(runAutomaticSupply()===1 && st.deliveries[0].cargo.grenades===5,'grenade shortage triggers independently from cartridges');
      st.deliveries=[];recipient.squads[0].grenades=20;st.stock.ammoSmall=0;
      check(runAutomaticSupply()===1 && st.deliveries[0].kind==='rear','empty warehouse creates rear replenishment trip');
      check(runAutomaticSupply()===0 && st.deliveries.filter(d=>d.kind==='rear').length===1,'only one automatic rear trip stays in flight');
      st.automatic=false;recipient.squads[0].ammoSmall=119;st.stock.ammoSmall=1200;
      check(runAutomaticSupply()===0,'disabled automation never sends');
      check(sendSupplyDelivery(1,[{id:'cart',count:1}],'unit'),'manual caravan remains available with automation disabled');
      renderSupplyPanel();check(!!document.getElementById('automaticSupplyToggle'),'panel exposes persistent automation button');
      check(JSON.parse(JSON.stringify(c)).supply.automatic===false,'automation switch is campaign-save state');
      st.deliveries=[];st.stock={...st.max};st.automatic=true;recipient.squads[0].ammoSmall=119;
      advanceSupplyDeliveries();check(st.stock.ammoSmall<st.max.ammoSmall,'idle delivery phase starts automatic supply without existing caravans');
      st.automatic=false;for(let turn=0;turn<30 && st.deliveries.length;turn++)advanceSupplyDeliveries();
      check(recipient.squads[0].ammoSmall===150 && !st.deliveries.length && st.assets.cart.available===6,'real outbound and return phases replenish ammunition and release transport');
      st.stock.ammoSmall=0;st.automatic=true;runAutomaticSupply();st.automatic=false;
      for(let turn=0;turn<40 && st.deliveries.length;turn++)advanceSupplyDeliveries();
      check(st.stock.ammoSmall>0 && !st.deliveries.length && st.assets.cart.available===6,'rear convoy really returns stock and transport');
      // Merge donor index 0 into receiver index 1, preserving all other references.
      const donor={name:'Donor',faction:'BeVe',type:'infantry_platoon',col:4,row:4,ap:1,squads:[squad('Штаб взвода',0,0),squad('Стрелки',30,2)],ammoReserve:{small:10,ordnance:0}};
      const receiver={name:'Receiver',faction:'BeVe',type:'infantry_platoon',col:4,row:4,ap:4,squads:[squad('Штаб взвода',15,1),squad('Стрелки',60,4)],ammoReserve:{small:20,ordnance:1}};
      const other={name:'Other',type:'infantry_platoon',col:5,row:4,squads:[squad('Штаб взвода')]};
      c.opUnits=[donor,receiver,other];c.supply.deliveries=[{kind:'unit',targetUnitId:0,status:'outbound',assets:[],cargo:{ammoSmall:2}}];
      hardMode.orders=[{id:900,type:'move',toUnitId:0,status:'active'},{id:901,type:'move',toUnitId:2,status:'active'}];hardMode.pendingOrders=[];hardMode.messengerQueue=[];
      hardMode.signalPlatoon.radios.assigned=[{unitId:2,isHQ:true}];hardMode.signalPlatoon.phones.assigned=[];
      check(!platoonMergeReason(receiver,donor),'battered platoon without HQ can merge into living HQ');
      const beforeAmmo=c.opUnits.flatMap(u=>u.squads).reduce((sum,s)=>sum+s.ammoSmall,0);
      check(mergeOperationalPlatoons(1,0,true),'confirmed merge succeeds');
      check(c.opUnits.length===2 && c.opUnits[0]===receiver && !c.opUnits.includes(donor),'donor disappears and recipient remains');
      check(receiver.squads.length===4 && new Set(receiver.squads.map(s=>s.name)).size===4,'all squads transferred with unique names');
      check(c.opUnits.flatMap(u=>u.squads).reduce((sum,s)=>sum+s.ammoSmall,0)===beforeAmmo && receiver.ammoReserve.small===30,'merge neither loses nor manufactures ammunition');
      check(receiver.ap===1,'merge cannot create additional movement AP');
      check(hardMode.orders.find(o=>o.id===901).toUnitId===1 && hardMode.signalPlatoon.radios.assigned[0].unitId===1,'unrelated orders and radio indices shift correctly');
      check(c.supply.deliveries[0].targetUnitId===0,'in-flight supply follows merged recipient');
      check(!platoonMergeReason(receiver,other).includes('разных'),'validation remains callable');
      other.col=6;check(!!platoonMergeReason(receiver,other),'different-hex merge is refused');other.col=4;other.row=4;
      c.activeBattles=[{hexKey:'4,4',playerUnitNames:['Receiver']}];check(!!platoonMergeReason(receiver,other),'merge during tactical combat refused');c.activeBattles=[];
      // Read-only ETA uses production movement/delivery estimators.
      hardMode.orders=[];hardMode.pendingOrders=[];hardMode.messengerQueue=[];hardMode.messengers.battalion={available:2,active:[]};
      const hq={name:'Штаб батальона',type:'battalion_hq',col:0,row:0,squads:[squad('Штаб батальона')]};
      const moving={name:'Mover',type:'infantry_platoon',mobility:'foot',col:2,row:2,ap:4,maxAp:4,squads:[squad('Стрелки')]};
      c.opUnits=[hq,moving];hardMode.signalPlatoon.radios.assigned=[{unitId:1,isHQ:true},{unitId:0,isHQ:true}];
      const snapshot=JSON.stringify({orders:hardMode.orders,pool:hardMode.messengers});
      const estimate=previewOperationalArrival(moving,{waypoints:[{col:4,row:2}]},hq);
      check(Number.isFinite(estimate.arrival) && estimate.message.includes('прибытие'),'ETA includes clock time before creating order');
      check(JSON.stringify({orders:hardMode.orders,pool:hardMode.messengers})===snapshot,'ETA allocates no messenger and creates no order');
      const scheduled=previewOperationalArrival(moving,{waypoints:[{col:4,row:2}],startTimeMin:600},hq);
      check(scheduled.arrival>=600,'draft ETA respects scheduled start time');
      const ordinary=previewOperationalArrival(moving,{waypoints:[{col:10,row:2}]},hq);
      const stealth=previewOperationalArrival(moving,{waypoints:[{col:10,row:2}],stealth:true},hq);
      check(stealth.arrival>ordinary.arrival,'draft ETA includes slower stealth movement');
      hardMode.signalPlatoon.radios.assigned=[];
      const company={name:'Штаб роты',type:'company_hq',col:1,row:2,squads:[squad('Штаб роты')]};
      hardMode.enabled=true;c.opUnits.push(company);hardMode.messengers.companies[2]={available:2,active:[]};
      const relayed=previewOperationalArrival(moving,{waypoints:[{col:4,row:2}]},hq);
      check(relayed.delivery===(checkCommunication(hq,company)==='messenger'?previewCourierTurns(hq,company):0)+(checkCommunication(company,moving)==='messenger'?previewCourierTurns(company,moving):0) && Number.isFinite(relayed.arrival),'ETA includes company relay channels and courier legs');
      c.opUnits.pop();
      hardMode.orders=[{id:902,type:'move',toUnitId:1,status:'delivering'}];
      check(previewOperationalArrival(moving,{waypoints:[{col:4,row:2}]},hq).message.includes('предыдущий'),'earlier undelivered movement order makes completion unknown');hardMode.orders=[];
      hardMode.messengers.battalion.available=0;
      check(previewOperationalArrival(moving,{waypoints:[{col:4,row:2}]},hq).message.includes('неизвестен'),'no free courier gives honest unknown ETA');
      return n;
    });
    await page.evaluate(()=>{
      document.getElementById('mainMenu').style.display='none';
      document.getElementById('campaignApp').style.display='block';
      document.getElementById('campaignMapScreen').style.display='block';
      appData.campaign.selectedOpUnit=appData.campaign.opUnits[1];
      hardMode.messengers.battalion.available=2;
      showSupplyPanel(true);
    });
    await page.evaluate(()=>{const modal=document.getElementById('campaignTutorialModal');if(modal)modal.remove();});
    const target=page.locator('#supplyPanel input[name="supplyTarget"][value="1"]');
    await target.scrollIntoViewIfNeeded();
    const geometry=await target.evaluate(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,hit:document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)?.outerHTML.slice(0,150),uncovered:document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)===el};});

    assert.ok(geometry.left>=44 && geometry.right<=420-44 && geometry.uncovered,'mobile target radio stays between rails, uncovered');
    await target.click();
    assert.equal(await page.evaluate(()=>supplyPanelGetSelection()),1,'real mobile click selects supply recipient');
    await page.evaluate(()=>{closeOperationalSidePanels();appData.campaign.opSetupStage='orders';placementLocked=true;opOpenCommandMenu();});
    await page.locator('#opCommandMenu [data-category="move"]').click();
    await page.evaluate(()=>{opOperationalUiState.draft.waypoints=[{col:4,row:2}];});
    // A normal form change rerenders the same production draft, before submit.
    await page.locator('#opCommandMenu [data-draft-field="moveMode"]').selectOption('stealth');
    assert.match(await page.locator('.op-arrival-preview').textContent(),/Ожидаемое прибытие/,'order form displays pre-submit ETA');
    assert.equal(await page.evaluate(()=>hardMode.orders.length),0,'opening and editing order form issues no order');
    console.log('PASS: v13.181 management checks: '+(checks+4));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
