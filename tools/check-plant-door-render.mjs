/** Production WebGL regression in a fresh browser context; no user draft is modified. */
import './browser-path.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const out='test-results/plant-door-render';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
const context=await browser.newContext({viewport:{width:1440,height:950}});
await context.addInitScript(()=>localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:'archviz',quality:'high',region:'hall'})));
const page=await context.newPage(),errors=[],report={doors:[],plant:[],errors};
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
const capture=async name=>{await page.waitForTimeout(450);await page.locator('#viewport canvas').screenshot({path:`${out}/${name}.png`});};
try{
 await page.goto('http://127.0.0.1:4174/');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading'),null,{timeout:240000});
 await page.getByTestId('region-hall').click();await page.getByTestId('preset-select').selectOption('hall-preset-8');
 await page.waitForFunction(()=>window.__ROOM_ATELIER__.view.visuals.get('hall-rear-screen-1')?.templateKey?.endsWith(':high'),null,{timeout:120000});
 const layout=await page.evaluate(async()=>await(await fetch('assets/architecture/hall-layout.json')).json());
 for(const tier of ['high','medium','high']){
  await page.locator('#quality-select').selectOption(tier);await page.evaluate(async()=>await window.__ROOM_ATELIER__.view.tierRefresh);
  await page.waitForFunction(tier=>window.__ROOM_ATELIER__.view.visuals.get('hall-rear-screen-1')?.templateKey?.endsWith(':'+tier),tier,{timeout:120000});
  const ordinal=report.plant.length===2?'high-again':tier;
  const plant=await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view,visual=v.visuals.get('hall-rear-screen-1');const leaf=visual.root.getObjectByName('Planter_pothos_leaves'),soil=visual.root.getObjectByName('Planter_loose_soil');if(!leaf||!soil)throw Error('planter leaf/soil missing');const get=o=>{const m=Array.isArray(o.material)?o.material[0]:o.material,img=m.map?.image;return {side:m.side,transparent:m.transparent,depthWrite:m.depthWrite,depthTest:m.depthTest,map:!!m.map,image:img&&{width:img.width,height:img.height},textureName:m.map?.name,vertices:o.geometry.attributes.position.count};};v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};v.camera.fov=53;v.camera.updateProjectionMatrix();v.camera.position.set(-19.6,1.65,.9);v.camera.lookAt(-20.6,1.25,.4);v.camera.updateMatrixWorld(true);v.shadowDirty=true;window.__plantAOOriginal=v.ao.render;return {leaf:get(leaf),soil:get(soil),aoEnabled:v.ao.enabled,template:visual.templateKey,gl:v.renderer.getContext().getError()};});
  assert(plant.leaf.map&&plant.soil.map,`Texture missing in ${tier}`);assert(plant.leaf.depthWrite&&plant.leaf.depthTest&&!plant.leaf.transparent);assert(plant.leaf.image.width>=512&&plant.soil.image.width>=512);assert.equal(plant.gl,0);
  await capture(`plant-${ordinal}-ao-on`);
  if(tier==='high'){
   await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.ao.render=()=>{};});await capture(`plant-${ordinal}-ao-off`);await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.ao.render=window.__plantAOOriginal;});
   const [a,b]=await Promise.all(['on','off'].map(n=>sharp(`${out}/plant-${ordinal}-ao-${n}.png`).removeAlpha().raw().toBuffer()));let changed=0;for(let i=0;i<a.length;i+=3)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;plant.aoChangedPixels=changed;assert(changed>100,'AO A/B must exercise real rendered pixels');
  }
  report.plant.push({tier:ordinal,...plant});
  for(const id of ['02','08','09','10','11','13','15']){
   const d=layout.doors.find(x=>x.id==='door-'+id);await page.evaluate(d=>{const v=window.__ROOM_ATELIER__.view;v.camera.position.set(d.position[0]+d.normal[0]*1.7,1.3,d.position[2]+d.normal[2]*1.7);v.camera.lookAt(d.position[0],1.14,d.position[2]);v.camera.updateMatrixWorld(true);v.shadowDirty=true;},d);await capture(`door-${id}-${ordinal}`);
  }
  const details=await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view,result=[];v.architecture.production.children[1].traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(String(m.userData.blenderMaterialName??'').startsWith('03_DOOR_LEAVES'))result.push({mesh:o.name,material:m.name,stable:!!m.userData.stableDoorIrradiance,attribute:!!o.geometry.attributes.stableDoorIrradiance,lightMap:!!m.lightMap});});return result;});
  assert(details.length&&details.every(d=>d.stable&&d.attribute&&!d.lightMap),`door material lost correction: ${JSON.stringify(details)}`);report.doors.push({tier:ordinal,details});console.log('PASS',ordinal,'seven doors + planter');
 }
 assert.deepEqual(errors,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack??String(e);console.error(report.failure);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
