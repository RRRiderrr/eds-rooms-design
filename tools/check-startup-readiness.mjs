/** Isolated cold browser profiles; never reads or changes the user's draft. */
import './browser-path.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const baseline=process.argv.includes('--baseline');
const requested=process.argv.find(a=>a.startsWith('--profiles='))?.slice(11).split(',');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)??path.join('test-results/startup-readiness',baseline?'baseline':'final'));await mkdir(output,{recursive:true});
const report={url,baseline,startedAt:new Date().toISOString(),profiles:[],errors:[]};
const definitions=[{name:'desktop-high',quality:'high',viewport:{width:1440,height:1000}},{name:'desktop-auto',quality:'auto',viewport:{width:1440,height:1000}},{name:'phone-basic',quality:'high',basic:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true},{name:'editor',quality:'high',mode:'editor',viewport:{width:1280,height:850}}].filter(p=>!requested||requested.includes(p.name));
const resources3d=url=>/\/(models|proxies|architecture|materials|environment|decoders)\//.test(url)&&!url.endsWith('/manifest.json');
for(const profile of definitions){let browser;const entry={name:profile.name,errors:[],requests:[],orientations:[]};report.profiles.push(entry);const active=new Set();
 try{
  browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11','--disable-gpu-shader-disk-cache']:['--disable-gpu-shader-disk-cache']});
  const page=await browser.newPage({viewport:profile.viewport,isMobile:!!profile.isMobile,hasTouch:!!profile.hasTouch,deviceScaleFactor:1});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await page.addInitScript(({quality,mode,basic})=>{
   localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:mode??'archviz',quality,region:'meeting'}));
   if(basic){const original=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_color_buffer_float'?null:original.call(this,name);};}
   window.__startupProbe={frames:[],longTasks:[],progress:[],readyAt:null,atReady:null};
   const p=window.__startupProbe;let last=performance.now(),lastProgress='';
   new PerformanceObserver(list=>p.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
   const frame=now=>{const app=window.__ROOM_ATELIER__,v=app?.view,bar=document.querySelector('[role="progressbar"],progress'),panel=document.querySelector('.loading-panel'),state={t:now,dt:now-last,programs:v?.renderer.info.programs?.length??0,textures:v?.renderer.info.memory.textures??0,quality:v?.quality.settings.level??null,scale:v?.quality.settings.scale??null};last=now;
    p.frames.push(state);const progress={percent:bar?(bar.getAttribute('aria-valuenow')??bar.value):null,label:panel?.textContent?.replace(/\s+/g,' ').trim(),visible:!!panel&&getComputedStyle(panel).display!=='none'&&!panel.hidden,t:now};const signature=JSON.stringify([progress.percent,progress.label,progress.visible]);if(signature!==lastProgress){p.progress.push(progress);lastProgress=signature;}
    if(app?.ready&&p.readyAt===null){p.readyAt=now;p.atReady=state;}requestAnimationFrame(frame);
   };requestAnimationFrame(frame);
  },profile);
  page.on('pageerror',e=>entry.errors.push({kind:'page',message:e.message}));page.on('console',m=>{if(m.type()==='error')entry.errors.push({kind:'console',message:m.text()});});
  page.on('request',request=>{active.add(request);entry.requests.push({url:request.url(),start:Date.now(),resourceType:request.resourceType()});});page.on('requestfinished',r=>active.delete(r));page.on('requestfailed',r=>{active.delete(r);entry.errors.push({kind:'network',url:r.url(),error:r.failure()?.errorText});});page.on('response',r=>{if(r.status()>=400)entry.errors.push({kind:'http',url:r.url(),status:r.status()});});
  const navigationStarted=Date.now();await page.goto(url+(profile.mode==='editor'?'?mode=editor':''));entry.build=await page.evaluate(()=>[...document.scripts].map(s=>s.src).find(s=>/assets\/index-/.test(s))??null);const loadingCapture=baseline?Promise.resolve():page.waitForFunction(()=>{const panel=document.querySelector('.loading-panel'),bar=document.querySelector('[role=progressbar],progress');return panel&&bar&&/Компіляція шейдерів|Підготовка графіки/i.test(panel.textContent??'')&&!panel.hidden;},null,{timeout:120000}).then(async()=>{await page.screenshot({path:path.join(output,profile.name+'-loading.png')});entry.loadingScreenshot=profile.name+'-loading.png';}).catch(e=>{entry.loadingCaptureError=e.message;});await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:240000});
  entry.readyEpoch=Date.now();await loadingCapture;entry.loadDurationMs=entry.readyEpoch-navigationStarted;entry.active3dRequestsAtReady=[...active].map(r=>r.url()).filter(resources3d);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  entry.atReady=await page.evaluate(()=>({probe:window.__startupProbe.atReady,appReady:window.__ROOM_ATELIER__.ready,mode:window.__ROOM_ATELIER__.getMode(),quality:window.__ROOM_ATELIER__.view.quality.settings.level,manual:window.__ROOM_ATELIER__.view.quality.manual,hdrTargets:window.__ROOM_ATELIER__.view.hdrTargets,programs:window.__ROOM_ATELIER__.view.renderer.info.programs.length,textures:window.__ROOM_ATELIER__.view.renderer.info.memory.textures}));
  if(profile.mode!=='editor'){
   await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};});
   for(let i=0;i<12;i++){
    const sample=await page.evaluate(async i=>{
     const v=window.__ROOM_ATELIER__.view,start=performance.now(),before=v.renderer.info.programs.length;let eye=[0,1.65,0],yaw=i*Math.PI/4;
     if(i>=8){eye=[i<10?-8:8,1.65,0];yaw=(i%2)*Math.PI;}
     v.camera.position.set(...eye);v.camera.lookAt(eye[0]+Math.sin(yaw)*3,1.65,eye[2]+Math.cos(yaw)*3);v.camera.updateMatrixWorld(true);
     for(let f=0;f<24;f++)await new Promise(resolve=>requestAnimationFrame(resolve));
     const frames=window.__startupProbe.frames.filter(f=>f.t>=start);return {i,start,duration:performance.now()-start,before,after:v.renderer.info.programs.length,maxFrameMs:Math.max(...frames.map(f=>f.dt)),quality:v.quality.settings.level,textures:v.renderer.info.memory.textures};
    },i);entry.orientations.push(sample);
   }
   await page.waitForTimeout(1800);
  }else await page.waitForTimeout(500);
  entry.metrics=await page.evaluate(()=>{const p=window.__startupProbe,frames=p.frames.filter(f=>p.readyAt!==null&&f.t>=p.readyAt),ordered=frames.map(f=>f.dt).sort((a,b)=>a-b);return {readyAt:p.readyAt,frames:frames.length,maxFrameMs:Math.max(...ordered),p95FrameMs:ordered[Math.floor(ordered.length*.95)]??0,longTasks:p.longTasks.filter(t=>t.start>=p.readyAt),progress:p.progress,programsAtReady:p.atReady?.programs,maxPrograms:Math.max(...frames.map(f=>f.programs)),textureCountAtReady:p.atReady?.textures,maxTextures:Math.max(...frames.map(f=>f.textures)),qualityLevels:[...new Set(frames.map(f=>f.quality))],finalQuality:window.__ROOM_ATELIER__.view.quality.settings.level,glError:window.__ROOM_ATELIER__.view.renderer.getContext().getError()};});
  entry.requestsAfterReady=entry.requests.filter(r=>r.start>=entry.readyEpoch&&resources3d(r.url));
  entry.programGrowth=entry.metrics.maxPrograms-entry.metrics.programsAtReady;entry.firstLookProgramGrowth=entry.metrics.maxPrograms-entry.atReady.programs;
  await page.screenshot({path:path.join(output,profile.name+'-ready.png')});
  if(!baseline){
   const progress=entry.metrics.progress.filter(p=>p.percent!==null).map(p=>Number(p.percent));assert(progress.length>3,'Need factual determinate loading progress');assert(progress.every(p=>Number.isFinite(p)&&p>=0&&p<=100));assert(progress.every((p,i)=>i===0||p>=progress[i-1]),'Progress regressed');assert.equal(Math.max(...progress),100,'Never reached100');
   assert(entry.metrics.progress.some(p=>/Компіляція шейдерів|Підготовка графіки/i.test(p.label??'')),'Missing shader preparation stage');
   assert.equal(entry.active3dRequestsAtReady.length,0,'3D requests remain atready');assert.equal(entry.requestsAfterReady.length,0,'Late3Dresource requests');assert(entry.programGrowth<=0,'Firstlook creates new shader programs: '+entry.programGrowth);assert(entry.metrics.maxTextures<=entry.metrics.textureCountAtReady,'Firstlook allocates additional GPU textures');assert.equal(entry.metrics.glError,0);assert.equal(entry.atReady.mode,profile.mode??'archviz');assert.equal(entry.atReady.manual,profile.quality);assert.deepEqual(entry.errors,[]);
  }
  entry.status='passed';console.log(JSON.stringify({profile:profile.name,baseline,readyMs:entry.loadDurationMs,programGrowth:entry.programGrowth,lateRequests:entry.requestsAfterReady.length,maxFrameMs:entry.metrics.maxFrameMs,qualityLevels:entry.metrics.qualityLevels,firstLookProgramGrowth:entry.firstLookProgramGrowth,errors:entry.errors.length}));
 }catch(error){entry.status='failed';entry.failure=error.stack??String(error);report.errors.push({name:profile.name,error:entry.failure});console.error(entry.failure);}finally{await browser?.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
}
report.finishedAt=new Date().toISOString();report.status=report.errors.length?'failed':'passed';await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
