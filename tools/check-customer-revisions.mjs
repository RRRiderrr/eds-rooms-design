/** Browser smoke check in an isolated profile: no saved user designs are touched. */
import './browser-path.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve('test-results/customer-revisions');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
const context=await browser.newContext({viewport:{width:1440,height:950}});
await context.addInitScript(()=>localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:'archviz',quality:'medium',region:'hall'})));
const page=await context.newPage(), errors=[], report={hall:[],meeting:[],errors};
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
try {
 await page.goto('http://127.0.0.1:4174/',{timeout:120000});
 await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading'),null,{timeout:240000});
 await page.getByTestId('region-hall').click();
 for(let i=8;i<14;i++){
  await page.getByTestId('preset-select').selectOption(`hall-preset-${i}`);
  await page.waitForFunction(i=>window.__ROOM_ATELIER__.store.state.regionPresets.hall.presetId===`hall-preset-${i}`,i);
  await page.waitForFunction(()=>{const a=window.__ROOM_ATELIER__,o=a.store.state.objects.find(x=>x.id==='hall-rear-screen-1');return o&&!!a.view.visuals.get(o.id)?.templateKey;},null,{timeout:90000});
  const info=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,objects=a.store.state.objects.filter(x=>x.regionId==='hall'),partition=objects.find(x=>x.id==='hall-rear-screen-1');return {partition,plaques:objects.filter(x=>x.assetId==='doorPlaque').map(x=>x.variant),bands:objects.filter(x=>x.assetId==='brandDoorPanel').map(x=>x.variant),template:a.view.visuals.get(partition.id).templateKey,gl:a.view.renderer.getContext().getError()};});
  assert.equal(info.partition.variant,7);assert.equal(info.plaques.length,14);assert(info.plaques.every(v=>v===1));assert.equal(info.bands.length,14);assert(info.bands.every(v=>v===3));assert.equal(info.gl,0);
  report.hall.push({preset:i,position:info.partition.position,rotation:info.partition.rotation,template:info.template});
  if(i===8){
   for(const [name,position] of [['front',[-16.6,1.75,.25]],['angle',[-18.2,1.65,2.2]]]){
    await page.evaluate(position=>{const v=window.__ROOM_ATELIER__.view;v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};v.camera.fov=62;v.camera.updateProjectionMatrix();v.camera.position.set(...position);v.camera.lookAt(-20.6,1.12,.4);v.camera.updateMatrixWorld(true);v.shadowDirty=true;},position);
    await page.waitForTimeout(700);await page.locator('#viewport canvas').screenshot({path:path.join(out,`hall-planter-${name}.png`)});
   }
  }
  console.log('PASS hall-preset-'+i);
 }
 const optionStyle=await page.locator('#preset-select option[value="hall-preset-8"]').getAttribute('style');assert(optionStyle?.includes('color'));
 await page.getByTestId('preset-select').selectOption('hall-preset-8');
 const arrowId=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,arrow=a.store.state.objects.find(o=>o.assetId==='corporateMotif'&&(o.variant===5||o.variant===11));if(!arrow)return null;a.setMode('editor');a.select(arrow.id);return arrow.id;});
 assert(arrowId,'A preset arrow should be present');assert(await page.getByTestId('graphic-angle').isDisabled(),'Arrow rotation must be disabled in the editor');
 await page.evaluate(()=>window.__ROOM_ATELIER__.setMode('archviz'));
 await page.getByTestId('region-meeting').click();const muralVariants=new Set(),sofaModels=new Set(),sofaLayouts=new Set();let logoPresets=0;
 for(let i=16;i<22;i++){
  await page.getByTestId('preset-select').selectOption(`builtin-${i}`);
  await page.waitForFunction(i=>window.__ROOM_ATELIER__.store.state.regionPresets.meeting.presetId===`builtin-${i}`,i);
  await page.waitForFunction(()=>[...window.__ROOM_ATELIER__.view.visuals.values()].every(v=>v.mode!=='archviz'||!!v.templateKey),null,{timeout:90000});
  const info=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,o=a.store.state.objects.filter(x=>x.regionId==='meeting');return {assets:o.map(x=>x.assetId),board:o.find(x=>x.assetId==='board'&&x.variant===1),sofa:o.find(x=>x.assetId==='sofa'),logo:o.filter(x=>x.assetId==='edsSignage'&&x.variant===6),finishes:Object.entries(a.store.state.wallFinishes).filter(([,f])=>f.mural).map(([wall,f])=>({wall,mural:f.mural})),gl:a.view.renderer.getContext().getError()};});
  assert(info.assets.includes('windowBar'));assert(info.assets.includes('workDesk'));assert(!info.assets.includes('rug'));assert.equal(info.board?.wallId,'near');assert(info.assets.length>=8);assert(info.logo.every(o=>o.wallId==='east'));if(info.logo.length)logoPresets++;
  const mural=info.finishes.filter(f=>['east','west'].includes(f.wall));assert.equal(mural.length,1);assert.notEqual(mural[0].mural,7);muralVariants.add(mural[0].mural);assert.equal(info.gl,0);
  if(info.sofa){sofaModels.add(info.sofa.variant);sofaLayouts.add(JSON.stringify([info.sofa.variant,info.sofa.position,info.sofa.rotation]));}
  report.meeting.push({preset:i,assets:info.assets,sofa:info.sofa,logo:info.logo,composition:mural[0]});
  // The private browser profile deliberately looks toward the painted wall;
  // retain one extra view toward the room's center for furniture placement.
  for(const view of ['wall','room']){
   await page.evaluate(({wall,view})=>{const v=window.__ROOM_ATELIER__.view,side=wall==='west'?1:-1;v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};v.camera.fov=68;v.camera.updateProjectionMatrix();v.camera.position.set(side*1.65,1.7,-2.35);v.camera.lookAt(view==='wall'?-side*2.5:0,view==='wall'?1.5:1.05,view==='wall'?.3:.7);v.camera.updateMatrixWorld(true);v.shadowDirty=true;},{wall:mural[0].wall,view});
   await page.waitForTimeout(600);await page.locator('#viewport canvas').screenshot({path:path.join(out,`meeting-${i}-${view}.png`)});
  }
  if(info.logo.length){
   await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.camera.position.set(-1.4,1.7,-1.3);v.camera.lookAt(2.6,2,.7);v.camera.updateMatrixWorld(true);v.shadowDirty=true;});
   await page.waitForTimeout(600);await page.locator('#viewport canvas').screenshot({path:path.join(out,`meeting-${i}-logo.png`)});
  }
  console.log('PASS builtin-'+i);
 }
 assert.equal(muralVariants.size,6);assert(sofaModels.size>=2&&sofaLayouts.size>=3,'Expected several different sofas or positions');assert(logoPresets>0&&logoPresets<6);assert.deepEqual(errors,[]);report.status='passed';
} catch(e){report.status='failed';report.failure=e.stack??String(e);console.error(report.failure);process.exitCode=1;}
finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
