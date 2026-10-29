/** Production Editor -> first ArchViz load; isolated storage, no user's draft. */
import './browser-path.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.argv.find(v=>v.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const out=path.resolve('test-results/startup-transition');await mkdir(out,{recursive:true});
const report={url:base,startedAt:new Date().toISOString(),profiles:[],errors:[]};
const content=page=>page.evaluate(()=>{const s=window.__ROOM_ATELIER__.store.state;return JSON.stringify({objects:s.objects,wallFinishes:s.wallFinishes,regionPresets:s.regionPresets,layers:s.layers,doorOpen:s.doorOpen});});
let browser;
try{
 browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
 for(const [name,options]of [['desktop-high',{viewport:{width:1440,height:1000},deviceScaleFactor:1}],['phone-high',{viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}]]){
  const profile={name,checks:[],errors:[],requests:[]};report.profiles.push(profile);const context=await browser.newContext(options);
  try{
   await context.addInitScript(()=>{
    localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:'editor',quality:'high',region:'meeting'}));
    window.transitionTrace=[];window.transitionZeroSeen=false;
    let signature='';new MutationObserver(records=>{
     if(records.some(r=>r.type==='attributes'&&r.attributeName==='aria-valuenow'&&r.oldValue==='0'))window.transitionZeroSeen=true;
     const panel=document.getElementById('loading'),bar=document.getElementById('loading-progress'),entry={at:performance.now(),visible:!!panel,percent:bar?Number(bar.getAttribute('aria-valuenow')):null,stage:document.getElementById('loading-text')?.textContent??'',ready:window.__ROOM_ATELIER__?.ready??false};
     const next=JSON.stringify({...entry,at:0});if(next!==signature){signature=next;window.transitionTrace.push(entry);}
    }).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-valuenow'],attributeOldValue:true});
   });
   const page=await context.newPage();page.on('pageerror',e=>profile.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')profile.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)profile.errors.push(r.status()+' '+r.url());if(/\.glb(?:\?|$)/.test(r.url()))profile.requests.push(r.url());});
   await page.goto(base+'?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.getElementById('loading'),null,{timeout:180000});
   profile.editor=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,v=a.view;return {mode:a.getMode(),preparing:v.startupPreparing,environmentReady:v.environmentReady,quality:v.quality.settings.level,manual:v.quality.manual,loading:!!document.getElementById('loading'),busy:document.querySelector('.atelier').getAttribute('aria-busy'),diagnostics:structuredClone(v.startupDiagnostics)};});
   assert.equal(profile.editor.mode,'editor');assert.equal(profile.editor.preparing,false);assert.equal(profile.editor.environmentReady,false);assert.equal(profile.editor.quality,'high');assert.equal(profile.editor.busy,'false');assert(!profile.requests.some(url=>url.endsWith('/room.meshopt.glb')));
   const before=await content(page);await page.evaluate(()=>{window.transitionTrace=[];window.transitionZeroSeen=false;});
   let release;const gate=new Promise(resolve=>release=resolve);let requestedResolve;const requested=new Promise(resolve=>requestedResolve=resolve);
   await page.route('**/assets/architecture/room.meshopt.glb',async route=>{requestedResolve();await gate;await route.continue();});
   await page.locator('.mode-switch [data-action="archviz"]').click();await requested;
   profile.pending=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,v=a.view;return {ready:a.ready,mode:a.getMode(),preparing:v.startupPreparing,percent:Number(document.getElementById('loading-progress').getAttribute('aria-valuenow')),busy:document.querySelector('.atelier').getAttribute('aria-busy'),inert:[...document.querySelectorAll('.topbar,.library-panel,.viewport,.viewport-header,.viewport-bottom,.editor-toolbar,.mobile-dock,#inspector')].map(e=>({className:e.className,inert:e.inert})),navigation:v.navigation.enabled,controls:v.controls.enabled};});
   assert.equal(profile.pending.ready,false);assert.equal(profile.pending.preparing,true);assert.equal(profile.pending.mode,'archviz');assert(profile.pending.percent<=25);assert.equal(profile.pending.busy,'true');assert(profile.pending.inert.every(e=>e.inert));assert.equal(profile.pending.controls,false);assert.equal(profile.pending.navigation,false);
   const editor=await page.locator('.mode-switch [data-action="editor"]').boundingBox();await page.mouse.click(editor.x+editor.width/2,editor.y+editor.height/2);
   const save=await page.locator('.top-actions [data-action="save"]').boundingBox();await page.mouse.click(save.x+save.width/2,save.y+save.height/2);await page.keyboard.press('Delete');await page.keyboard.press('Control+z');
   assert.equal(await content(page),before);assert.equal(await page.evaluate(()=>window.__ROOM_ATELIER__.getMode()),'archviz');assert.equal(await page.locator('dialog[open]').count(),0);
   await page.screenshot({path:path.join(out,name+'-loading-controls-inert.png')});release();
   await page.waitForFunction(()=>document.getElementById('loading-text')?.textContent.includes('Компіляція шейдерів'),null,{timeout:180000});
   await page.screenshot({path:path.join(out,name+'-shader-compilation.png')});
   const barBox=await page.locator('#loading-progress').boundingBox();profile.barBox=barBox;assert(barBox&&barBox.width<=options.viewport.width-20);
   await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.getElementById('loading'),null,{timeout:240000});
   profile.ready=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,v=a.view;return {mode:a.getMode(),preparing:v.startupPreparing,environmentReady:v.environmentReady,quality:v.quality.settings.level,manual:v.quality.manual,busy:document.querySelector('.atelier').getAttribute('aria-busy'),inert:[...document.querySelectorAll('.topbar,.library-panel,.viewport')].some(e=>e.inert),diagnostics:structuredClone(v.startupDiagnostics),programs:v.renderer.info.programs.length,prefs:JSON.parse(localStorage.getItem('room-atelier-preferences')),objects:a.store.state.objects.filter(o=>o.variant>0).map(o=>({id:o.id,asset:o.assetId,template:v.visuals.get(o.id)?.templateKey})),glError:v.renderer.getContext().getError(),zeroSeen:window.transitionZeroSeen,trace:window.transitionTrace};});
   assert.equal(profile.ready.mode,'archviz');assert.equal(profile.ready.preparing,false);assert.equal(profile.ready.environmentReady,true);assert.equal(profile.ready.quality,'high');assert.equal(profile.ready.manual,'high');assert.equal(profile.ready.busy,'false');assert.equal(profile.ready.inert,false);assert.equal(profile.ready.prefs.mode,'archviz');assert.equal(profile.ready.prefs.quality,'high');assert.equal(profile.ready.glError,0);assert.equal(profile.ready.zeroSeen,true);
   assert(profile.ready.objects.every(o=>o.asset==='brandDoorPanel'?o.template==='wall-paint':o.template?.endsWith(':high')),'Production asset still unresolved when loader closes');
   assert.equal(await content(page),before);assert.equal(profile.ready.diagnostics.programsAtReady,profile.ready.programs);assert(profile.ready.diagnostics.completedAt>profile.editor.diagnostics.completedAt);
   const percentages=profile.ready.trace.filter(x=>x.visible&&x.percent!==null).map(x=>x.percent);assert(percentages.length>10);for(let i=1;i<percentages.length;i++)assert(percentages[i]>=percentages[i-1]);assert.equal(percentages.at(-1),100);
   profile.checks.push('Lightweight Editor startup remains Editor/High; first ArchViz shows a new determinate loader starting from0.');
   profile.checks.push('Actual mouse/keyboard attempts cannot change mode, open save or mutate configuration while all control regions are inert.');
   profile.checks.push('Shader-stage screen renders and fits desktop/phone; progress is monotone to100; all production models, GPU warmup and selected High quality finish before loader removal.');
   profile.checks.push('Mode/quality preferences and all furniture transforms, finishes, regional selections, layers and door state survive transition.');
   await page.screenshot({path:path.join(out,name+'-archviz-ready.png')});assert.deepEqual(profile.errors,[]);profile.status='passed';console.log('PASS',name,profile.checks.length,'actual first ArchViz transition checks');
  }catch(error){profile.status='failed';profile.failure=error.stack??String(error);report.errors.push({profile:name,error:profile.failure});console.error(profile.failure);}finally{await context.close();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 }
}finally{await browser?.close();report.finishedAt=new Date().toISOString();report.status=report.errors.length?'failed':'passed';await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}if(report.errors.length)process.exitCode=1;
