import './browser-path.mjs';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const out=process.env.WALL_REVIEW_OUT??'test-results/wall-review';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4174/');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready);await page.getByTestId('preset-select').selectOption('builtin-0');await page.locator('[data-property=quality]').selectOption('high');
 await page.waitForFunction(()=>window.__ROOM_ATELIER__.view.architecture.spaceLightmap?.image.width===4096);await page.waitForTimeout(1200);
 const metadata=await page.evaluate(()=>{
  const v=window.__ROOM_ATELIER__.view;cancelAnimationFrame(Reflect.get(v,'raf'));v.camera.position.set(1.9,1.65,0);v.camera.lookAt(2.6,1.65,0);v.navigation.syncFromCamera();v.scene.updateMatrixWorld(true);v.camera.updateMatrixWorld(true);
  const materials=[];v.architecture.production.traverse(o=>{if(o.isMesh)for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(String(mat.userData.blenderMaterialName).startsWith('01_WALLS')){mat.userData.wallReview={map:mat.map,normalMap:mat.normalMap,roughnessMap:mat.roughnessMap,metalnessMap:mat.metalnessMap,lightMap:mat.lightMap,aoMap:mat.aoMap};materials.push({name:o.name,material:mat.userData.blenderMaterialName,uv0:o.geometry.getAttribute('uv')?.count,uv1:o.geometry.getAttribute('uv1')?.count,map:{name:mat.map?.name,channel:mat.map?.channel,repeat:mat.map?.repeat.toArray(),minFilter:mat.map?.minFilter},normal:mat.normalScale?.toArray()});}}});return materials;
 });
 for(const mode of ['full','no-normal','no-lightmap','no-surface-maps','no-post']){
  await page.evaluate(mode=>{const v=window.__ROOM_ATELIER__.view;v.architecture.production.traverse(o=>{if(o.isMesh)for(const mat of Array.isArray(o.material)?o.material:[o.material]){const saved=mat.userData.wallReview;if(!saved)continue;Object.assign(mat,saved);if(mode==='no-normal')mat.normalMap=null;if(mode==='no-lightmap')mat.lightMap=null;if(mode==='no-surface-maps'){mat.map=null;mat.normalMap=null;mat.roughnessMap=null;mat.metalnessMap=null;mat.aoMap=null;}mat.needsUpdate=true;}});v.renderer.shadowMap.needsUpdate=true;if(mode==='no-post')v.renderer.render(v.scene,v.camera);else Reflect.get(v,'composer').render();},mode);
  await page.screenshot({path:`${out}/${mode}.png`});
 }
 await fs.writeFile(`${out}/report.json`,JSON.stringify({metadata,errors},null,2));console.log(JSON.stringify({materials:metadata.length,errors}));
}finally{await browser.close();}
