import './browser-path.mjs';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Review the shipped static build and its actual production models, not an
// isolated procedural demo. The browser context is separate from the user's.
const out='test-results/furniture-review';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto('http://127.0.0.1:4174/?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready);
 await page.locator('[data-property=quality]').selectOption('high');await page.evaluate(()=>window.__ROOM_ATELIER__.setMode('archviz'));
 await page.evaluate(()=>Reflect.get(window.__ROOM_ATELIER__.view,'archvizPromise'));
 const settle=()=>page.waitForFunction(()=>{const v=window.__ROOM_ATELIER__.view;return [...Reflect.get(v,'visuals').values()].every(o=>o.templateKey?.endsWith(':high'));},undefined,{timeout:90000});
 const shots=[],televisions=[];
 for(const index of [3,6,9,13]){
  await page.evaluate(index=>window.__ROOM_ATELIER__.store.applyPreset(index),index);await settle();
  const television=await page.evaluate(()=>{
   const a=window.__ROOM_ATELIER__,objects=a.store.state.objects,tv=objects.find(o=>o.assetId==='television'),sofa=objects.find(o=>o.id==='MainSofa');
   if(!tv||tv.variant!==3)throw new Error('85-inch television missing from the actual preset');
   const view=a.view;view.camera.position.set(sofa.position[0],1.50,sofa.position[2]);view.camera.lookAt(...tv.position);view.navigation.syncFromCamera();
   const root=Reflect.get(view,'visuals').get(tv.id).root,bounds=Reflect.get(view,'highlight').box.clone().setFromObject(root),size=bounds.getSize(view.camera.position.clone()).toArray();
   if(Math.abs(Math.max(size[0],size[2])-1.90)>.01||Math.abs(size[1]-1.10)>.01)throw new Error('Actual TV model dimensions differ from the 85-inch catalog');
   return {preset:a.store.state.presetId,tv,sofa,model:root.name,actualWorldDimensions:size,hasProduction:!!root};
  });
  await page.waitForTimeout(200);const file=`preset-${index}-85in-tv.png`;await page.screenshot({path:`${out}/${file}`});shots.push(file);televisions.push(television);
 }
 await page.evaluate(()=>{const a=window.__ROOM_ATELIER__;a.store.applyPreset(1);a.view.resetCamera();});await settle();await page.waitForTimeout(200);
 await page.screenshot({path:`${out}/matte-floor-lounge.png`});shots.push('matte-floor-lounge.png');
 const floors=await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view,result=[];v.architecture.production.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.materialId==='floor-commercial-grey')result.push({mesh:o.name,metalness:m.metalness,normal:m.normalScale?.toArray(),roughnessMap:!!m.roughnessMap,baseColorMap:!!m.map});});return result;});
 if(!floors.length||floors.some(m=>m.metalness!==0||!m.roughnessMap||!m.baseColorMap))throw new Error('Actual floor material mapping is incomplete');
 await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.camera.position.set(-12,1.65,-.5);v.camera.lookAt(-8,1.2,1);v.navigation.syncFromCamera();});await page.waitForTimeout(150);await page.screenshot({path:`${out}/matte-floor-full-space.png`});shots.push('matte-floor-full-space.png');
 const manifest=JSON.parse(await fs.readFile('public/assets/materials/manifest.json','utf8')),floor=manifest.materials.find(m=>m.id==='floor-commercial-grey');
 const cache=JSON.parse(await fs.readFile('assets-src/materials/material-cache.json','utf8'));
 const orm=await sharp(path.join(cache.resourceRoot,'floor-commercial-grey/processed/high/orm.png')).stats();
 const roughness={min:orm.channels[1].min/255,max:orm.channels[1].max/255,mean:orm.channels[1].mean/255,metalMax:orm.channels[2].max};
 if(floor.roughness<.85||roughness.mean<.85||roughness.min<.8||roughness.metalMax!==0)throw new Error('Matte floor ORM calibration regressed');
 await fs.writeFile(`${out}/review.json`,JSON.stringify({checkedAt:new Date().toISOString(),floor:{source:floor.sourceId,roughness,floors},televisions,shots,errors},null,2));
 console.log(JSON.stringify({televisions:televisions.length,floorRoughness:roughness,shots:shots.length,errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
