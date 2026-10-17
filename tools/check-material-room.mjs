import './browser-path.mjs';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),out=path.join(root,'assets-src/previews');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)requests.push({status:r.status(),url:r.url()});});
await page.addInitScript(()=>localStorage.setItem('room-atelier-preferences',JSON.stringify({quality:'medium',mode:'archviz'})));
await page.goto('http://127.0.0.1:5186/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready===true,undefined,{timeout:90000});
const state=await page.evaluate(async()=>{
 const app=window.__ROOM_ATELIER__,view=app.view;
 const {clonePreset}=await import('/src/catalog/presets.ts');app.store.applyPreset(clonePreset(0));
 await view.archvizPromise;await view.tierRefresh;
 const materials=[];view.architecture.production.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){const name=m.userData.blenderMaterialName??m.name;if(/01_WALLS|02_FLOOR|06_WINDOW_PANES|05_WINDOW_FRAMES/.test(name))materials.push({name,source:m.userData.source??null,color:m.color?.getHexString(),texture:!!m.map,normalStrength:m.normalScale?.toArray(),glassEnvironment:!!m.envMap});}});
 return{mode:app.getMode(),preset:app.store.state.presetId,materials,background:view.scene.background?.userData,panoramaPMREM:!!view.architecture.backdropEnvironment};
});
for(const[name,position,target]of[['window',[-1.9,1.68,-2],[0,1.78,3.049]],['door',[1.9,1.68,2.3],[0,1.2,-3.049]]]){
 await page.evaluate(({position,target})=>{const v=window.__ROOM_ATELIER__.view;v.camera.position.set(...position);v.camera.lookAt(...target);v.navigation.syncFromCamera();},{position,target});
 await page.evaluate(()=>new Promise(resolve=>{let frames=0;const tick=()=>++frames>=8?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}));
 await page.screenshot({path:path.join(out,`materials-fab-room-${name}.png`)});
}
const report={...state,errors,failedResponses:requests};await fs.writeFile(path.join(root,'assets-src/materials/room-browser-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({preset:state.preset,panoramaPMREM:state.panoramaPMREM,errors,failedResponses:requests,materialCount:state.materials.length},null,2));await browser.close();
if(errors.length||requests.length||!state.panoramaPMREM)process.exitCode=1;
