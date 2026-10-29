import './browser-path.mjs';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const report={started:new Date().toISOString(),errors:[],console:[],samples:[],responses:[],failures:[]};
const pending=new Map();
const out=new URL('../test-results/independent-load-audit/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 // Independent test context ignores Vite HMR; root may keep editing source.
 await page.routeWebSocket('**',socket=>socket.close());
 page.on('worker',worker=>{console.log('WORKER',worker.url());worker.on('close',()=>console.log('WORKER_CLOSED',worker.url()));});
 page.on('pageerror',e=>{report.errors.push(e.stack??e.message);console.log('PAGEERROR',e.message);});
 page.on('console',m=>{if(['error','warning'].includes(m.type())){report.console.push({type:m.type(),text:m.text()});console.log('CONSOLE',m.type(),m.text().slice(0,450));}});
 page.on('request',r=>pending.set(r.url(),Date.now()));
 page.on('requestfinished',r=>pending.delete(r.url()));
 page.on('requestfailed',r=>{pending.delete(r.url());report.failures.push({url:r.url(),failure:r.failure()});});
 page.on('response',r=>{if(r.status()>=400)report.responses.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:4174/?mode=editor');
 await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,{timeout:60000});
 await page.evaluate(()=>{
  const v=window.__ROOM_ATELIER__.view;
  window.__audit=[];
  const wrap=(o,key)=>{const original=o?.[key];if(typeof original!=='function')return;o[key]=function(...args){const start=performance.now();window.__audit.push({method:key,event:'start',args:args.filter(a=>['string','number'].includes(typeof a)),time:start});try{const result=original.apply(this,args);if(result?.then)return result.then(value=>{window.__audit.push({method:key,event:'end',ms:performance.now()-start});return value;},error=>{window.__audit.push({method:key,event:'error',error:String(error),ms:performance.now()-start});throw error;});window.__audit.push({method:key,event:'end',ms:performance.now()-start});return result;}catch(error){window.__audit.push({method:key,event:'error',error:String(error)});throw error;}};};
  for(const [object,keys]of [[v,['ensureArchViz','prepareArchitectureMaterials','loadProduction','refreshTextureTier']],[v.architecture,['ensureProduction','setQuality','loadProduction','loadPanorama','addWindowBackdrops']],[v.probes,['load']],[v.directLighting,['load']]])for(const key of keys)wrap(object,key);
  v.quality.setManual('medium');window.__ROOM_ATELIER__.setMode('archviz');
 });
 for(let i=0;i<24;i++){
  await page.waitForTimeout(4000);
  const sample=await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;return{ready:v.ready,environmentReady:v.environmentReady,mode:v.mode,prodChildren:v.architecture.production.children.length,lightmap:!!v.architecture.lightmap,spaceLightmap:!!v.architecture.spaceLightmap,backdrop:!!v.architecture.backdrop,models:v.templates.size,visuals:v.visuals.size,audit:window.__audit.slice(-8),memory:v.renderer.info.memory,render:v.renderer.info.render,toast:document.querySelector('#scene-status')?.textContent};});
  sample.pending=[...pending.entries()].map(([url,start])=>({url,ms:Date.now()-start}));report.samples.push(sample);console.log('SAMPLE',i,JSON.stringify(sample));
  if(sample.environmentReady)break;
 }
 report.audit=await page.evaluate(()=>window.__audit);
 await page.screenshot({path:new URL('archviz.png',out).pathname.replace(/^\/(\w:)/,'$1')});
}finally{await browser.close();report.finished=new Date().toISOString();await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));}
