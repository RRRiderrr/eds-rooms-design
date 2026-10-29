/** Actual UI, rendered pixels and storage checks in private test contexts.
 * Never connects to the user's open browser or reads their draft database. */
import './browser-path.mjs';
import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';

const url=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const requested=process.argv.find(arg=>arg.startsWith('--profiles='))?.slice(11).split(',');
const out=path.resolve('test-results/corporate-motifs');await fs.mkdir(out,{recursive:true});
const atlas=JSON.parse(await fs.readFile('public/assets/brand/murals/atlas.json','utf8'));
const atlasRaw=await sharp('public/assets/brand/murals/wall-print-atlas.png').removeAlpha().raw().toBuffer({resolveWithObject:true});
const report={url,startedAt:new Date().toISOString(),profiles:[],errors:[]};
const definitions=[
 {name:'chromium-desktop',engine:chromium,viewport:{width:1440,height:1000},full:true},
 {name:'webkit-desktop',engine:webkit,viewport:{width:1440,height:1000},full:true},
 {name:'chromium-phone',engine:chromium,viewport:{width:390,height:844},isMobile:true,hasTouch:true},
 {name:'chromium-basic',engine:chromium,viewport:{width:1280,height:900},basic:true},
].filter(profile=>!requested||requested.includes(profile.name));
const state=page=>page.evaluate(()=>window.__ROOM_ATELIER__.store.state);
const graphics=config=>config.objects.filter(object=>object.assetId==='corporateMotif'&&object.variant>0);
const savedGraphic=config=>graphics(config).map(object=>({id:object.id,variant:object.variant,position:object.position,wallId:object.wallId,graphic:object.graphic}));
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function drawer(page,open=true){
 const isPhone=await page.evaluate(()=>matchMedia('(pointer:coarse)').matches);if(!isPhone)return;
 const current=await page.locator('.atelier').evaluate(element=>element.classList.contains('drawer-open'));
 if(current!==open)await page.locator('.mobile-dock [data-action=drawer]').click();
}
async function finishes(page){await drawer(page);await page.getByTestId('finishes-tab').click();await page.getByTestId('finish-wall').selectOption('west');}
async function selectGraphic(page,id){
 await finishes(page);await page.locator(`[data-action=motif-select][data-value="${id}"]`).click();await expect(page.getByTestId('graphic-controls')).toBeVisible();
 if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches)){await drawer(page,false);if(await page.getByTestId('inspector-toggle').getAttribute('aria-expanded')==='false')await page.getByTestId('inspector-toggle').click();}
}
async function number(page,testid,value){const input=page.getByTestId(testid);await input.fill(String(value));await input.press('Tab');}
async function coordinate(page,axis,value){const input=page.locator(`#inspector [data-axis=${axis}]`);await input.fill(String(value));await input.press('Tab');}
async function opacity(page,value){const input=page.getByTestId('graphic-opacity');await input.press('Home');for(let i=0;i<value/5;i++)await page.getByTestId('graphic-opacity').press('ArrowRight');await page.getByTestId('graphic-opacity').press('Tab');}
async function color(page,value){await page.getByRole('combobox',{name:'Корпоративний колір мотиву',exact:true}).selectOption(value);}
async function clearSelection(page){const button=page.locator('#inspector [data-action=clear-selection]');if(await button.count())await button.click();await drawer(page,false);await settle(page);}
async function camera(page){
 await page.evaluate(()=>{
  const view=window.__ROOM_ATELIER__.view;view.navigation.setEnabled(false);view.controls.enabled=false;
  view.camera.position.set(1.7,2.5,0);view.controls.target.set(-2.6018175,1.5,0);view.camera.lookAt(view.controls.target);view.cameraSafe.copy(view.camera.position);view.navigation.syncFromCamera();
 });await settle(page);
}
async function project(page,point){return page.evaluate(point=>{const view=window.__ROOM_ATELIER__.view,p=view.camera.position.clone().set(...point).project(view.camera),r=view.renderer.domElement.getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2,inside:p.z>=-1&&p.z<=1&&Math.abs(p.x)<1&&Math.abs(p.y)<1};},point);}
async function image(page,profile,name){const file=path.join(out,`${profile}-${name}.png`);await page.screenshot({path:file});return file;}
async function graphicClip(page){
 const points=await Promise.all([[-.6,-.6],[-.6,.6],[.6,-.6],[.6,.6]].map(([z,y])=>project(page,[-2.6010,1.6+y,z])));
 assert(points.every(point=>point.inside));const x=Math.floor(Math.min(...points.map(point=>point.x)))-12,y=Math.floor(Math.min(...points.map(point=>point.y)))-12;
 return {x,y,width:Math.ceil(Math.max(...points.map(point=>point.x)))+12-x,height:Math.ceil(Math.max(...points.map(point=>point.y)))+12-y};
}
const brandClass=rgb=>{const [r,g,b]=rgb;if(Math.max(r,g,b)<55)return'black';if(b>r+10&&b>=g+5&&r>80)return'lavender';if(Math.max(r,g,b)-Math.min(r,g,b)<30&&r>130)return'white';if(g>b+35&&g>r+10)return'lime';if(b>r+60&&b>g+35)return'blue';return'other';};
async function muralOrientation(page,index){
 const surface=await page.evaluate(()=>{
  const view=window.__ROOM_ATELIER__.view;const bindings=[...view.wallFinishes.bindings.values()];
  const binding=bindings.find(binding=>binding.uniforms.paintMuralA.value>0&&binding.uniforms.paintNormalA.value.x>.9);
  if(!binding)return null;return binding.uniforms.paintBoundsA.value.toArray();
 });assert(surface,'Inspect actual mural shader bounds');
 const [min,max,bottom,top]=surface,aspect=(max-min)/(top-bottom),tile=atlas.tiles.find(tile=>tile.id===`mural-${index}`),rect=tile.pixelRectTopLeft;
 const sample=(u,v)=>{
  let x=u,y=v;if(aspect<16/9)x=(x-.5)*aspect/(16/9)+.5;else y=(y-.5)*(16/9)/aspect+.5;
  const px=Math.min(rect[0]+rect[2]-1,Math.max(rect[0],Math.floor(rect[0]+x*rect[2]))),py=Math.min(rect[1]+rect[3]-1,Math.max(rect[1],Math.floor(rect[1]+(1-y)*rect[3])));
  return brandClass([...atlasRaw.data.subarray((py*atlasRaw.info.width+px)*3,(py*atlasRaw.info.width+px)*3+3)]);
 };
 const points=[];for(const u of [.12,.3,.5,.7,.88])for(const v of [.18,.36,.54,.72,.88]){
  const classes=[sample(u,v),sample(u-.003,v-.003),sample(u+.003,v+.003)];if(!classes.every(value=>value===classes[0])||classes[0]==='other')continue;
  points.push({u,v,expected:classes[0],flipX:sample(1-u,v),flipY:sample(u,1-v),point:[-2.6010,bottom+v*(top-bottom),max-u*(max-min)]});
 }
 const positions=await page.evaluate(points=>{const view=window.__ROOM_ATELIER__.view,r=view.renderer.domElement.getBoundingClientRect();return points.map(item=>{const p=view.camera.position.clone().set(...item.point).project(view.camera);return {...item,x:(p.x+1)*r.width/2,y:(1-p.y)*r.height/2,inside:Math.abs(p.x)<.98&&Math.abs(p.y)<.98};});},points);
 const bytes=await page.locator('#viewport canvas').screenshot(),raw=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});let right=0,flipX=0,flipY=0,count=0;
 for(const p of positions){if(!p.inside)continue;const x=Math.floor(p.x),y=Math.floor(p.y),pixel=[...raw.data.subarray((y*raw.info.width+x)*3,(y*raw.info.width+x)*3+3)],actual=brandClass(pixel);if(actual==='other')continue;count++;if(actual===p.expected)right++;if(actual===p.flipX)flipX++;if(actual===p.flipY)flipY++;}
 assert(count>=12,`Mural ${index} should expose enough solid-color wall samples`);assert(right/count>.75,`Mural ${index} source-to-wall orientation ${right}/${count}`);
 return {index,right,flipX,flipY,count};
}
async function centerPixel(page){
 const p=await project(page,[-2.6010,1.6,0]);assert(p.inside,'Paint centre must be in viewport');
 const bytes=await page.screenshot({clip:{x:Math.floor(p.x)-3,y:Math.floor(p.y)-3,width:7,height:7}}),{data}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
 return [0,1,2].map(channel=>{let sum=0;for(let i=channel;i<data.length;i+=3)sum+=data[i];return sum/(data.length/3);});
}
async function privateDraft(page){return page.evaluate(async()=>{
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('room-atelier-session',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{return await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);});}finally{db.close();}
});}
async function waitDraft(page){const expected=JSON.stringify(savedGraphic(await state(page)));await expect.poll(async()=>{const draft=await privateDraft(page);return draft?JSON.stringify(savedGraphic(draft)):'';},{timeout:15000}).toBe(expected);}
const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));

for(const definition of definitions){
 const entry={name:definition.name,checks:[],errors:[]};report.profiles.push(entry);let browser;
 const pass=(name,details={})=>{entry.checks.push({name,...details});console.log('PASS',entry.name,name);};
 try{
  browser=await definition.engine.launch({headless:true,args:definition.engine===chromium&&process.platform==='win32'?['--use-angle=d3d11']:[]});
  const context=await browser.newContext({viewport:definition.viewport,isMobile:!!definition.isMobile,hasTouch:!!definition.hasTouch,deviceScaleFactor:1,acceptDownloads:true});
  await context.addInitScript(({basic})=>{
   localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:'editor',quality:'high',region:'meeting',snap:false}));
   if(basic){const original=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_color_buffer_float'?null:original.call(this,name);};}
   try{Object.defineProperty(navigator,'canShare',{value:()=>false});}catch{}
  },{basic:!!definition.basic});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>entry.errors.push('page: '+error.message));page.on('console',message=>{if(message.type()==='error')entry.errors.push('console: '+message.text());});page.on('response',response=>{if(response.status()>=400)entry.errors.push(`${response.status()} ${response.url()}`);});
  await page.goto(url+'?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading'),null,{timeout:180000});
  entry.build=await page.locator('script[src]').evaluateAll(scripts=>scripts.map(script=>script.getAttribute('src')));
  await drawer(page);await page.getByTestId('region-meeting').click();await page.getByTestId('preset-select').selectOption('builtin-0');await finishes(page);
  await page.getByTestId('motif-add-4').click();let items=graphics(await state(page));assert.equal(items.length,1,'Clean preset should receive one instance');const a=items[0].id;
  await selectGraphic(page,a);await number(page,'graphic-width',1.35);await number(page,'graphic-height',1.05);await number(page,'graphic-angle',30);await opacity(page,65);await color(page,'#A2B8FE');await coordinate(page,'z',-.35);await coordinate(page,'y',1.45);
  let modified=graphics(await state(page)).find(object=>object.id===a);assert(Math.abs(modified.graphic.width-1.35)<1e-8);assert(Math.abs(modified.graphic.height-1.05)<1e-8);assert(Math.abs(modified.graphic.angle-Math.PI/6)<1e-8);assert.equal(modified.graphic.opacity,.65);assert.equal(modified.graphic.color,'#a2b8fe');assert.equal(modified.position[2],-.35);assert.equal(modified.position[1],1.45);
  pass('Per-instance width, height, wall angle, opacity, color and position controls persist exact values');
  await number(page,'graphic-width',1.2);await number(page,'graphic-height',1.2);await number(page,'graphic-angle',0);await opacity(page,100);await color(page,'#0B30C1');await coordinate(page,'z',0);await coordinate(page,'y',1.6);await camera(page);
  const selected=await page.evaluate(()=>{const view=window.__ROOM_ATELIER__.view,outline=view.scene.getObjectByName('CorporateMotif_Selection');return {id:view.selected,visible:outline?.visible,parts:outline?.children.length,wallOverlay:view.scene.getObjectByName('Editor_WallSelection')?.visible??false};});
  assert.equal(selected.id,a);assert.equal(selected.visible,true);assert.equal(selected.parts,5);assert.equal(selected.wallOverlay,false);await drawer(page,false);
  if(definition.isMobile&&await page.getByTestId('inspector-toggle').getAttribute('aria-expanded')==='true')await page.getByTestId('inspector-toggle').click();
  const clip=await graphicClip(page),selectedBytes=await page.screenshot({clip});await image(page,entry.name,'selected-instance');await clearSelection(page);const cleanBytes=await page.screenshot({clip});
  const [s1,s2]=await Promise.all([sharp(selectedBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sharp(cleanBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true})]);assert.equal(s1.info.width,s2.info.width);let changed=0;for(let i=0;i<s1.data.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(s1.data[i+c]-s2.data[i+c])))>25)changed++;assert(changed>80,'Individual selection must change actual canvas pixels');
  const pick=await project(page,[-2.6010,1.6,0]);await page.mouse.click(pick.x,pick.y);await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__.view.selected)).toBe(a);
  pass('Actual paint hit selects one instance; five-part outline is visible and whole-wall overlay stays hidden',{changedPixels:changed});
  await finishes(page);await page.getByTestId('motif-add-4').click();items=graphics(await state(page));assert.equal(items.length,2);const b=items.find(object=>object.id!==a).id;assert.notEqual(a,b);
  await selectGraphic(page,b);await number(page,'graphic-width',1.2);await number(page,'graphic-height',1.2);await coordinate(page,'z',0);await coordinate(page,'y',1.6);await color(page,'#A0FF3D');await opacity(page,100);await clearSelection(page);await camera(page);
  const topLime=await centerPixel(page);assert(topLime[1]>topLime[2]+25,'The last opaque motif must be visibly lime at overlap centre');
  await selectGraphic(page,a);await page.getByTestId('motif-front').click();await clearSelection(page);const topBlue=await centerPixel(page);assert(topBlue[2]>topBlue[1]+25,'Bringing blue to front must change the actual overlap colour');assert(distance(topLime,topBlue)>60);
  await selectGraphic(page,a);await page.getByTestId('motif-back').click();await clearSelection(page);const limeAgain=await centerPixel(page);assert(distance(topLime,limeAgain)<8,'Moving blue back should restore the same lime pixels');
  await selectGraphic(page,b);await opacity(page,50);await clearSelection(page);const mixed=await centerPixel(page);assert(distance(mixed,topLime)>15&&distance(mixed,topBlue)>15,'Partial opacity must composite both layers');await image(page,entry.name,'layer-composite');
  pass('Same variant can be added twice; opaque front/back order and alpha layering alter real rendered pixels',{a,b,topLime,topBlue,limeAgain,mixed});
  if(definition.full){
   await selectGraphic(page,b);const before=graphics(await state(page)).length;await page.getByTestId('duplicate').click();assert.equal(graphics(await state(page)).length,before+1);await page.getByTestId('undo').click();assert.equal(graphics(await state(page)).length,before);await page.getByTestId('redo').click();assert.equal(graphics(await state(page)).length,before+1);await page.getByTestId('delete').click();assert.equal(graphics(await state(page)).length,before);await page.getByTestId('undo').click();assert.equal(graphics(await state(page)).length,before+1);await page.getByTestId('redo').click();assert.equal(graphics(await state(page)).length,before);
   pass('Duplicate/delete and Undo/Redo act on independent motif objects');
   await page.locator('[data-action=save]:visible').first().click();await page.getByTestId('save-name').fill('QA — незалежні мотиви EDS');await page.getByTestId('save-confirm').click();await page.waitForFunction(()=>window.__ROOM_ATELIER__.store.state.presetId.startsWith('user-'));
   const expected=savedGraphic(await state(page)),downloadPromise=page.waitForEvent('download');await page.getByTestId('export').click();const download=await downloadPromise,portable=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.deepEqual(savedGraphic(portable),expected);
   await waitDraft(page);await page.reload();await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading'),null,{timeout:180000});assert.deepEqual(savedGraphic(await state(page)),expected);
   await page.getByTestId('import-input').setInputFiles({name:'motifs.archpreset.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(portable))});await settle(page);assert.deepEqual(savedGraphic(await state(page)),expected);
   pass('Actual save, reload, downloaded export and file-input import preserve IDs and every graphic field');
  }
  // Keep these real independent graphics active during the most demanding
  // production shader path; nothing in the user draft is involved.
  await drawer(page,false);await page.locator('.mode-switch [data-action=archviz]').click();await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&window.__ROOM_ATELIER__.view.environmentReady&&!document.querySelector('#loading'),null,{timeout:180000});await camera(page);
  const gpu=await page.evaluate(()=>{
   const view=window.__ROOM_ATELIER__.view,gl=view.renderer.getContext(),samplers=[];
   for(const wrapper of view.renderer.info.programs??[]){const program=wrapper.program;let count=0,paint=false;for(let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++){const uniform=gl.getActiveUniform(program,i);if(/paintMaskAtlas/.test(uniform.name))paint=true;if([gl.SAMPLER_2D,gl.SAMPLER_CUBE,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_2D_ARRAY,gl.SAMPLER_2D_ARRAY_SHADOW].includes(uniform.type))count+=uniform.size;}if(paint)samplers.push({count,linked:gl.getProgramParameter(program,gl.LINK_STATUS)});}
   let shadows=0;view.directLighting.group.traverse(object=>{if(object.isLight&&object.castShadow)shadows++;});return {samplers,shadows,hdrTargets:view.hdrTargets,error:gl.getError(),quality:view.quality.settings.level};
  });assert.equal(gpu.quality,'high');assert.equal(gpu.shadows,6);assert(gpu.samplers.length>0);assert(gpu.samplers.every(program=>program.linked&&program.count<=16),'Paint plus six shadows must fit sixteen fragment samplers');assert.equal(gpu.error,0);if(definition.basic)assert.equal(gpu.hdrTargets,false);await image(page,entry.name,'high-production');
  pass('Real High shaders link with six shadow casters and at most sixteen samplers; basic fallback remains usable',gpu);
  if(definition.full){
   await page.locator('.mode-switch [data-action=editor]').click();await finishes(page);await page.getByTestId('preset-select').selectOption('builtin-0');await finishes(page);await camera(page);
   const signatures=[],orientation=[];for(let index=1;index<=16;index++){
    const card=page.locator(`[data-action=wall-mural][data-value="${index}"]`);await card.click();await card.locator('img').evaluate(img=>img.decode());assert.equal((await state(page)).wallFinishes.west.mural,index);await page.getByTestId('scene-tab').click();await settle(page);const bytes=await page.locator('#viewport canvas').screenshot();signatures.push(createHash('sha256').update(bytes).digest('hex'));orientation.push(await muralOrientation(page,index));if([9,11,14,16].includes(index))await image(page,entry.name,`mural-${index}`);await finishes(page);
   }assert.equal(new Set(signatures).size,16);assert(orientation.reduce((sum,item)=>sum+item.right,0)>orientation.reduce((sum,item)=>sum+item.flipX,0)+30);assert(orientation.reduce((sum,item)=>sum+item.right,0)>orientation.reduce((sum,item)=>sum+item.flipY,0)+30);pass('All sixteen real mural cards load valid previews, distinct wall frames and correctly oriented source pixels',{signatures,orientation});
  }
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert(layout.scrollWidth<=layout.width);assert.deepEqual(entry.errors,[]);entry.status='passed';
 }catch(error){entry.status='failed';entry.failure=error.stack??String(error);report.errors.push({profile:entry.name,error:entry.failure});console.error('FAIL',entry.name,entry.failure);}finally{await browser?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
}
report.finishedAt=new Date().toISOString();report.status=report.errors.length?'failed':'passed';await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
