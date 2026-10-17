import './browser-path.mjs';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.stack));
await page.goto('http://127.0.0.1:4174/');
await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,{timeout:90000});
await page.locator('[data-property=quality]').selectOption('high');
await page.waitForTimeout(1200);
await fs.mkdir('test-results/diagnosis',{recursive:true});

const report=await page.evaluate(()=>{
 const v=window.__ROOM_ATELIER__.view,out=[];
 v.architecture.production.traverse(o=>{if(o.isMesh&&/Ceiling|Floor/.test(o.name))out.push({name:o.name,category:o.userData.archCategory,materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>({name:m.name,source:m.userData.blenderMaterialName,side:m.side,lightmap:!!m.lightMap,uvChannel:m.lightMap?.channel,color:m.color.getHexString()}))});});
 const gl=v.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 return{meshes:out,stats:v.getStats(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
});
await fs.writeFile('test-results/diagnosis/report.json',JSON.stringify({...report,errors},null,2));await page.screenshot({path:'test-results/diagnosis/high.png'});
await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.composer.removePass(v.reflections);});await page.waitForTimeout(500);await page.screenshot({path:'test-results/diagnosis/no-ssr.png'});
await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.composer.removePass(v.ao);});await page.waitForTimeout(500);await page.screenshot({path:'test-results/diagnosis/no-ao-ssr.png'});
await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.renderer.shadowMap.enabled=false;});await page.waitForTimeout(500);await page.screenshot({path:'test-results/diagnosis/no-shadows-ao-ssr.png'});
await fs.writeFile('test-results/diagnosis/report.json',JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({errors:errors.slice(0,2),renderer:report.renderer,stats:report.stats}));
await browser.close();
