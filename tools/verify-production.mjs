import './browser-path.mjs';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const out='test-results/review';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.stack));page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto('http://127.0.0.1:4174/?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready);
 const editorResources=requests.filter(url=>/\/assets\/(models|environment|materials)\//.test(url));
 await page.screenshot({path:`${out}/editor-full-space.png`});
 await page.getByTestId('preset-select').selectOption('builtin-1');await page.getByRole('button',{name:'ArchViz',exact:true}).click();
 await page.evaluate(()=>Reflect.get(window.__ROOM_ATELIER__.view,'archvizPromise'));
 await page.locator('[data-property=quality]').selectOption('high');
 await page.waitForFunction(()=>{const v=window.__ROOM_ATELIER__.view;return v.architecture.spaceLightmap?.image.width===4096&&[...Reflect.get(v,'visuals').values()].every(o=>o.templateKey?.endsWith(':high'));},{timeout:90000});
 await page.waitForTimeout(6500);await page.screenshot({path:`${out}/archviz-high.png`});
 await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.camera.position.set(-1.75,1.65,2.1);v.camera.lookAt(0,1,-1.4);v.navigation.syncFromCamera();});await page.waitForTimeout(200);await page.screenshot({path:`${out}/lounge-high.png`});
 const stats=await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view,gl=v.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{...v.getStats(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),passes:Reflect.get(v,'composer').passes.map(p=>p.constructor.name),msaa:Reflect.get(v,'composer').renderTarget1.samples,reflectionSamples:Reflect.get(v,'reflections').beautyRenderTarget.samples,space:v.architecture.space.bounds,protectedArchitecture:v.architecture.root.userData.protected};});
 await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.camera.position.set(1.3,2.6,-1.8);v.camera.lookAt(-.3,4.3,.8);v.navigation.syncFromCamera();});await page.waitForTimeout(200);await page.screenshot({path:`${out}/ceiling-high.png`});
 await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.camera.position.set(-12,1.65,-.5);v.camera.lookAt(-8,1.2,1);v.navigation.syncFromCamera();});await page.waitForTimeout(200);await page.screenshot({path:`${out}/existing-space-high.png`});
 await page.evaluate(()=>{const app=window.__ROOM_ATELIER__;app.select('MainSofa');app.view.focus();});const focused=await page.evaluate(()=>window.__ROOM_ATELIER__.view.camera.position.toArray());if(focused[2]<-3.04||focused[2]>3.04)errors.push('Furniture focus escaped the measured room');
 await fs.writeFile(`${out}/verification.json`,JSON.stringify({checkedAt:new Date().toISOString(),editorLoadsHeavyResources:editorResources,stats,errors},null,2));
 console.log(JSON.stringify({errors,editorHeavyRequests:editorResources.length,renderer:stats.renderer,msaa:stats.msaa,fps:stats.fps}));
 if(errors.length||editorResources.length)process.exitCode=1;
}finally{await browser.close();}
