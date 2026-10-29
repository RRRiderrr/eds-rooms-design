/** Actual browser regression for the customer's plaque orientation, painted
 * door strips and full-wall EDS murals. Uses the app's existing QA hook only. */
import './browser-path.mjs';
import { chromium, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createServer } from 'vite';
import path from 'node:path';

const url=process.argv.find(v=>v.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const requested=(process.argv.find(v=>v.startsWith('--browsers='))?.slice(11)??'chromium,webkit').split(',');
const out=new URL('../test-results/wall-customer-fixes/',import.meta.url);
await mkdir(out,{recursive:true});
const layout=JSON.parse(await readFile(new URL('../public/assets/architecture/hall-layout.json',import.meta.url),'utf8'));
const measured=JSON.parse(await readFile(new URL('../assets-src/main-hall/paintable-surfaces.json',import.meta.url),'utf8'));
const report={url,startedAt:new Date().toISOString(),checks:[],errors:[],screenshots:[],profiles:[]};
function check(name,details={}){report.checks.push({name,...details});console.log('PASS',name);}
const vite=await createServer({root:path.resolve(import.meta.dirname,'..'),server:{middlewareMode:true},appType:'custom'});
let sourcePresets,dimensions;
try{
 const {BUILTIN_PRESETS,HALL_PRESETS}=await vite.ssrLoadModule('/src/catalog/presets.ts');
 const {getVariant}=await vite.ssrLoadModule('/src/catalog/catalog.ts');
 sourcePresets={hall:HALL_PRESETS,meeting:BUILTIN_PRESETS};
 dimensions=Object.fromEntries(['doorPlaque','brandDoorPanel'].map(id=>[id,Object.fromEntries([1,2,3].map(index=>[index,getVariant(id,index).dimensions]))]));
}finally{await vite.close();}
function assertDoorPairs(config,context){
 const pairs=[];
 for(const door of layout.doors){
  const plaque=config.objects.find(o=>o.id===`hall-${door.id}-plaque`),strip=config.objects.find(o=>o.id===`hall-${door.id}-brand`);
  assert(plaque?.variant>0&&strip?.variant>0,`${context}: ${door.id} plaque or paint absent`);
  const wall=layout.hallWalls.find(w=>w.id===strip.wallId),axis=wall.axis==='x'?2:0;
  assert.equal(plaque.wallId,strip.wallId,`${context}: ${door.id} must share its wall`);
  assert(Math.abs(plaque.position[axis]-strip.position[axis])<1e-6,`${context}: ${door.id} plaque must be centred on its painted strip`);
  assert(dimensions.doorPlaque[plaque.variant][0]<=dimensions.brandDoorPanel[strip.variant][0]+1e-6,`${context}: ${door.id} plaque extends beyond paint`);
  assert.equal(plaque.label?.split('\n')[0],door.id.slice(-2),`${context}: ${door.id} plaque number missing`);
  assert.equal(strip.label,undefined,`${context}: ${door.id} duplicate strip number`);
  const bounds=measured.hall[strip.wallId],halfHeight=dimensions.doorPlaque[plaque.variant][1]/2;
  assert(plaque.position[1]-halfHeight>=bounds.minY&&plaque.position[1]+halfHeight<=bounds.maxY,`${context}: ${door.id} plaque lies outside painted plaster`);
  pairs.push({doorId:door.id,wallId:wall.id,plaqueVariant:plaque.variant,stripVariant:strip.variant,along:strip.position[axis],plaqueNumber:plaque.label.split('\n')[0]});
 }
 assert.equal(config.objects.filter(o=>o.assetId==='doorPlaque'&&o.variant>0).length,14,`${context}: unexpected plaque count`);
 assert.equal(config.objects.filter(o=>o.assetId==='brandDoorPanel'&&o.variant>0).length,14,`${context}: unexpected strip count`);
 return pairs;
}
report.sourcePairs=[];
for(const region of ['hall','meeting'])for(const preset of sourcePresets[region])report.sourcePairs.push({region,presetId:preset.presetId,pairs:assertDoorPairs(preset,`source ${preset.presetId}`)});
check('All 112 hall-preset door pairs and 224 meeting-default pairs place numbered plaques on unnumbered paint', {presets:report.sourcePairs.length,doorPairs:report.sourcePairs.reduce((sum,p)=>sum+p.pairs.length,0)});
async function screenshot(page,name){const p=fileURLToPath(new URL(name,out));await page.screenshot({path:p});report.screenshots.push(name);}
async function frame(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function image(page){await frame(page);return sharp(await page.locator('#viewport canvas').screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});}
function difference(a,b,rect){
 const width=a.info.width,height=a.info.height;
 const left=Math.max(0,Math.floor(rect.left)),right=Math.min(width,Math.ceil(rect.right));
 const top=Math.max(0,Math.floor(rect.top)),bottom=Math.min(height,Math.ceil(rect.bottom));
 let changed=0,total=0,sum=0,upperChanged=0,upperTotal=0,lowerChanged=0,lowerTotal=0;
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const i=(y*width+x)*3,d=(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]))/3;
  total++;sum+=d;const c=d>18;if(c)changed++;
  if(y<(top+bottom)/2){upperTotal++;if(c)upperChanged++;}else{lowerTotal++;if(c)lowerChanged++;}
 }
 assert(total>0,'The projected test area must be visible');
 return {pixels:total,meanAbsoluteDifference:sum/total,changedFraction:changed/total,upperChangedFraction:upperChanged/Math.max(1,upperTotal),lowerChangedFraction:lowerChanged/Math.max(1,lowerTotal)};
}
async function positionCamera(page,{axis,coordinate,normal,along=0,y=1.8,distance=2.2,fov=58}){
 await page.evaluate(options=>{
  const v=window.__ROOM_ATELIER__.view,{axis,coordinate,normal,along,y,distance,fov}=options;
  const target=v.camera.position.clone().set(axis==='x'?coordinate:along,y,axis==='z'?coordinate:along);
  v.camera.fov=fov;v.camera.updateProjectionMatrix();v.camera.position.copy(target).addScaledVector(v.camera.position.clone().set(...normal),distance);
  v.camera.lookAt(target);v.controls.target.copy(target);v.navigation.syncFromCamera();v.cameraSafe.copy(v.camera.position);v.camera.updateMatrixWorld(true);v.scene.updateMatrixWorld(true);
 },{axis,coordinate,normal,along,y,distance,fov});
 await frame(page);
}
async function projected(page,points){return page.evaluate(points=>{
 const v=window.__ROOM_ATELIER__.view,c=v.renderer.domElement;v.camera.updateMatrixWorld(true);
 return points.map(p=>{const q=v.camera.position.clone().set(...p).project(v.camera);return {x:(q.x*.5+.5)*c.clientWidth,y:(-.5*q.y+.5)*c.clientHeight,z:q.z};});
},points);}
function square(point,radius=6){return{left:point.x-radius,right:point.x+radius+1,top:point.y-radius,bottom:point.y+radius+1};}

for(const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>requested.includes(name))){
 let browser;
 const errors=[],profile={name,labels:[],paintSurfaces:[],murals:[]};
 try{
  browser=await engine.launch({headless:true,args:engine===chromium&&process.platform==='win32'?['--use-angle=d3d11']:[]});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.goto(url+(url.includes('?')?'&':'?')+'mode=editor');
  await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
  profile.presetPairs=[];
  for(const region of ['hall','meeting'])for(let index=0;index<sourcePresets[region].length;index++){
   const config=await page.evaluate(({region,index})=>{const a=window.__ROOM_ATELIER__;a.store.applyRegionPreset(region,index);return a.store.state;},{region,index});
   profile.presetPairs.push({region,presetId:sourcePresets[region][index].presetId,pairs:assertDoorPairs(config,`${name} ${region} ${index}`)});
  }
  check(`${name}: all 24 actual preset selections retain centred numbered plaques on unnumbered painted strips`,{pairs:profile.presetPairs.reduce((sum,p)=>sum+p.pairs.length,0)});
  await page.getByTestId('region-hall').click();await page.getByTestId('preset-select').selectOption('hall-preset-0');
  await page.getByTestId('region-meeting').click();await page.getByTestId('preset-select').selectOption('builtin-0');
  await page.getByRole('button',{name:'ArchViz',exact:true}).click();
  await page.evaluate(async()=>{const v=window.__ROOM_ATELIER__.view;v.quality.setManual('high');await v.archvizPromise;await v.tierRefresh;});
  await page.waitForFunction(()=>{
   const a=window.__ROOM_ATELIER__,vs=a.view.visuals;
   return a.view.environmentReady&&a.store.state.objects.filter(o=>o.assetId==='doorPlaque'&&o.variant>0).every(o=>vs.get(o.id)?.templateKey?.endsWith(':high'));
  },null,{timeout:120000});
  await page.waitForTimeout(600);

  const actual=await page.evaluate(doors=>{
   const a=window.__ROOM_ATELIER__,v=a.view;v.scene.updateMatrixWorld(true);const results=[];
   for(const object of a.store.state.objects.filter(o=>['doorPlaque','brandDoorPanel'].includes(o.assetId)&&o.variant>0)){
    const visual=v.visuals.get(object.id),root=visual.root,door=doors.find(d=>object.id.includes(d.id));
    const expected=v.camera.position.clone().set(...door.normal),meshes=[];
    root.traverse(mesh=>{
     if(!mesh.isMesh)return;
     mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
     const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
     const entry={name:mesh.name,visible:mesh.visible,castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,colorWrite:material.colorWrite,opacity:material.opacity,localThickness:b.max.z-b.min.z};
     if(material.userData.ownedPrint){
      const p=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');let maxError=0;
      for(let i=0;i<p.count;i++)maxError=Math.max(maxError,Math.abs(uv.getX(i)-(p.getX(i)-b.min.x)/(b.max.x-b.min.x)),Math.abs(uv.getY(i)-(p.getY(i)-b.min.y)/(b.max.y-b.min.y)));
      const n=mesh.geometry.getAttribute('normal'),worldNormal=v.camera.position.clone().set(n.getX(0),n.getY(0),n.getZ(0)).transformDirection(mesh.matrixWorld);
      const print=material.map?.image,context=print?.getContext?.('2d');
      const ink=(x,y,w,h)=>{
       if(!context)return undefined;const rgba=context.getImageData(x,y,w,h).data;let visible=0,white=0,dark=0;
       for(let i=0;i<rgba.length;i+=4)if(rgba[i+3]>=128){visible++;if(Math.min(rgba[i],rgba[i+1],rgba[i+2])>=230)white++;if(Math.max(rgba[i],rgba[i+1],rgba[i+2])<=90)dark++;}
       return {visible,whiteFraction:white/Math.max(1,visible),darkFraction:dark/Math.max(1,visible)};
      };
      Object.assign(entry,{canvasPrint:material.map?.isCanvasTexture===true,flipY:material.map?.flipY,uvError:maxError,frontFacing:worldNormal.dot(expected),text:object.label,inkColor:material.userData.inkColor,wordmarkInk:ink(422,20,180,56),textInk:ink(0,90,1024,240)});
     }
     meshes.push(entry);
    });
    results.push({id:object.id,assetId:object.assetId,variant:object.variant,material:object.material,wallPaint:root.userData.wallPaint===true,templateKey:visual.templateKey,position:root.position.toArray(),meshes});
   }
   return results;
  },layout.doors);
  assert.equal(actual.filter(o=>o.assetId==='doorPlaque').length,14);
  assert.equal(actual.filter(o=>o.assetId==='brandDoorPanel').length,14);
  for(const object of actual){
   const prints=object.meshes.filter(m=>m.canvasPrint);
   if(object.assetId==='doorPlaque'){
    assert.equal(prints.length,1,`${object.id}: plaque must contain its single live print`);
    for(const p of prints){assert(p.flipY&&p.uvError<.00001&&p.frontFacing>.999,`${object.id}: mirrored, inverted or backward print`);}
    const strip=actual.find(o=>o.id===object.id.replace(/-plaque$/,'-brand'));
    if(object.variant===1&&['eds-black','eds-blue'].includes(strip.material)){
     assert.equal(prints[0].inkColor,'#ffffff',`${object.id}: transparent plaque on dark paint needs white ink`);
     assert(prints[0].wordmarkInk?.visible>100&&prints[0].wordmarkInk.whiteFraction>.95,`${object.id}: actual EDS wordmark pixels must use readable white ink`);
     assert(prints[0].textInk?.visible>100&&prints[0].textInk.whiteFraction>.95,`${object.id}: actual number and room-name pixels must use readable white ink`);
    }
   }
   if(object.assetId==='brandDoorPanel'){
    assert(object.wallPaint&&object.templateKey==='wall-paint',`${object.id}: must use real wall paint`);
    assert.equal(prints.length,0,`${object.id}: number must appear only on the plaque`);
    assert.equal(object.meshes.length,1,`${object.id}: paint must have only its invisible selection proxy`);
    assert(object.meshes.every(m=>m.name==='BrandDoorPanel_PaintHit'),`${object.id}: physical frame/body/number remained`);
    const hit=object.meshes.find(m=>m.name==='BrandDoorPanel_PaintHit');assert(hit&&!hit.colorWrite&&hit.opacity===0&&hit.localThickness===0&&!hit.castShadow&&!hit.receiveShadow,`${object.id}: paint selection proxy must be invisible and flat`);
   }
  }
  profile.labels=actual;check(`${name}: 14 plaques have upright, unmirrored front-facing UVs; all 14 painted strips have no numbers, body or frame`);
  check(`${name}: transparent plaques on blue/graphite paint render white room text and the actual white EDS wordmark`);
  const darkStrip=await page.evaluate(()=>window.__ROOM_ATELIER__.store.state.objects.find(o=>o.id==='hall-door-05-brand'));
  for(const [material,expectedInk]of [['eds-lime','#171d27'],['eds-black','#ffffff']]){
   await page.evaluate(({strip,material})=>window.__ROOM_ATELIER__.store.upsert({...strip,material}),{strip:darkStrip,material});
   await page.waitForFunction(expected=>{
    const visual=window.__ROOM_ATELIER__.view.visuals.get('hall-door-05-plaque');
    return visual?.templateKey?.endsWith(':high')&&visual.root.getObjectByName('DoorPlaque_Label')?.material?.userData.inkColor===expected;
   },expectedInk,{timeout:30000});
  }
  await page.evaluate(strip=>window.__ROOM_ATELIER__.store.upsert(strip),darkStrip);
  check(`${name}: changing underpaint between lime and graphite automatically updates transparent plaque ink`);

  const bindingData=await page.evaluate(()=>[...window.__ROOM_ATELIER__.view.wallFinishes.bindings.values()].map(({material,uniforms:u})=>({
   material:material.userData.blenderMaterialName??material.name,
   sides:['A','B'].map(s=>({suffix:s,normal:u[`paintNormal${s}`]?.value.toArray(),bounds:u[`paintBounds${s}`]?.value.toArray(),mural:u[`paintMural${s}`]?.value,enabled:u[`paintEnabled${s}`]?.value})),
   count:u.paintStripCount?.value??0,rects:(u.paintStripRect?.value??[]).map(rect=>rect.toArray()),styles:(u.paintStripStyle?.value??[]).map(style=>style.toArray())
  })));
  const rects=bindingData.flatMap(b=>b.rects.slice(0,b.count).map((rect,i)=>({rect,side:Math.sign(b.styles[i]?.[3]??1),sides:b.sides})));
  assert(rects.length>=14,`${name}: painted shader rectangles missing`);
  for(const binding of bindingData){assert(binding.count<=16,'Paint rectangle uniform budget exceeded');for(const side of binding.sides)if(side.bounds){assert(side.bounds[3]>side.bounds[2], 'Paint height uniform range is invalid');}}
  profile.paintSurfaces=bindingData;check(`${name}: actual GPU paint uniforms include measured Y bounds and bounded strip arrays`,{rectangles:rects.length});

  for(const doorId of ['door-02','door-03','door-04','door-05','door-11','door-13','door-14','door-15']){
   const door=layout.doors.find(d=>d.id===doorId),wall=layout.hallWalls.find(w=>w.id===door.wallId),plaque=actual.find(o=>o.id===`hall-${doorId}-plaque`),along=plaque.position[wall.axis==='x'?2:0];
   await positionCamera(page,{...wall,along,y:1.7,distance:doorId==='door-03'?1.5:2.4,fov:doorId==='door-03'?88:68});
   await screenshot(page,`${name}-${doorId}-wall-paint.png`);
  }
  const close=layout.doors.find(d=>d.id==='door-04'),closeWall=layout.hallWalls.find(w=>w.id===close.wallId);
  const closePlaque=actual.find(o=>o.id==='hall-door-04-plaque');
  await positionCamera(page,{...closeWall,along:closePlaque.position[0],y:1.55,distance:.58,fov:34});
  await screenshot(page,`${name}-plaque-readable-closeup.png`);
  const darkPlaque=actual.find(o=>o.id==='hall-door-05-plaque');
  await positionCamera(page,{...closeWall,along:darkPlaque.position[0],y:1.55,distance:.58,fov:34});
  await screenshot(page,`${name}-plaque-on-graphite-closeup.png`);
  const blueDoor=layout.doors.find(d=>d.id==='door-02'),blueWall=layout.hallWalls.find(w=>w.id===blueDoor.wallId),bluePlaque=actual.find(o=>o.id==='hall-door-02-plaque');
  await positionCamera(page,{...blueWall,along:bluePlaque.position[0],y:1.55,distance:.58,fov:34});
  await screenshot(page,`${name}-plaque-on-blue-closeup.png`);

  const panel=await page.evaluate(()=>window.__ROOM_ATELIER__.store.state.objects.find(o=>o.id==='hall-door-04-brand'));
  await page.evaluate(panel=>window.__ROOM_ATELIER__.store.upsert({...panel,variant:1,material:'eds-lime'}),panel);
  await positionCamera(page,{...closeWall,along:panel.position[0],y:2.45,distance:1.4,fov:70});
  const bounds=measured.hall[close.wallId];
  const point=(y)=>[panel.position[0],y,closeWall.coordinate+closeWall.normal[2]*.012];
  const patches=await projected(page,[point(bounds.maxY+.12),point(bounds.maxY-.25)]);
  const painted=await image(page);
  await page.evaluate(panel=>window.__ROOM_ATELIER__.store.upsert({...panel,variant:0}),panel);
  const unpainted=await image(page),steelDifference=difference(painted,unpainted,square(patches[0],5)),plasterDifference=difference(painted,unpainted,square(patches[1],5));
  assert(steelDifference.meanAbsoluteDifference<5,`${name}: paint changed black steel pixels (${steelDifference.meanAbsoluteDifference})`);
  assert(plasterDifference.meanAbsoluteDifference>8,`${name}: actual plaster paint pixels did not change (${plasterDifference.meanAbsoluteDifference})`);
  profile.steelPixelProof={steelDifference,plasterDifference};
  await page.evaluate(panel=>window.__ROOM_ATELIER__.store.upsert(panel),panel);
  check(`${name}: rendered paint changes plaster while preserving black upper steel pixels`,profile.steelPixelProof);

  // The empty meeting preset makes wall coverage measurable without moving any
  // existing furniture in the user's design. This is an isolated browser context.
  for(const [index,wallId] of [[1,'west'],[2,'east'],[3,'west']]){
   const wall=layout.meetingRoom.walls.find(w=>w.id===wallId),limit=measured.meeting[wallId];
   await page.evaluate(id=>window.__ROOM_ATELIER__.store.setWallFinish(id,{color:null,motif:0,accent:'#0b30c1',mural:0}),wallId);
   await positionCamera(page,{...wall,along:(wall.min+wall.max)/2,y:(limit.minY+limit.maxY)/2,distance:4.55,fov:58});
   const blank=await image(page);
   await page.evaluate(({id,mural})=>window.__ROOM_ATELIER__.store.setWallFinish(id,{color:null,motif:0,accent:'#0b30c1',mural}),{id:wallId,mural:index});
   const decorated=await image(page);
   const worldPoint=(along,y)=>[wall.axis==='x'?wall.coordinate:along,y,wall.axis==='z'?wall.coordinate:along];
   const p=await projected(page,[worldPoint(wall.min,limit.minY),worldPoint(wall.max,limit.maxY)]);
   const rect={left:Math.min(p[0].x,p[1].x)+5,right:Math.max(p[0].x,p[1].x)-5,top:Math.min(p[0].y,p[1].y)+5,bottom:Math.max(p[0].y,p[1].y)-5};
   const coverage=difference(blank,decorated,rect);
   assert(coverage.changedFraction>.18&&coverage.upperChangedFraction>.12&&coverage.lowerChangedFraction>.12,`${name} mural${index}: design must cover both upper and lower wall, not a small sticker: ${JSON.stringify(coverage)}`);
   await screenshot(page,`${name}-meeting-${wallId}-mural-${index}.png`);
   profile.murals.push({wallId,index,...coverage});
  }
  check(`${name}: three EDS mural designs visibly cover the full meeting wall in High`,{murals:profile.murals});

  if(name==='chromium'){
   await page.evaluate(()=>window.__ROOM_ATELIER__.store.applyRegionPreset('meeting',7));
   await page.waitForFunction(()=>{
    const a=window.__ROOM_ATELIER__;
    return a.store.state.objects.filter(o=>o.regionId==='meeting'&&o.variant>0).every(o=>a.view.visuals.get(o.id)?.templateKey?.endsWith(':high'));
   },null,{timeout:120000});
   await page.evaluate(()=>{
    const v=window.__ROOM_ATELIER__.view;v.camera.fov=66;v.camera.updateProjectionMatrix();
    v.camera.position.set(1.95,2.15,-.65);v.controls.target.set(-2.6018175,1.5,.05);v.camera.lookAt(v.controls.target);
    v.navigation.syncFromCamera();v.cameraSafe.copy(v.camera.position);v.camera.updateMatrixWorld(true);v.scene.updateMatrixWorld(true);
   });
   await frame(page);await screenshot(page,'final-proof.png');profile.furnishedProof={presetId:'builtin-7',screenshot:'final-proof.png',quality:'high'};
  }

  profile.graphics=await page.evaluate(()=>{
   const v=window.__ROOM_ATELIER__.view,gl=v.renderer.getContext(),types=new Set([gl.SAMPLER_2D,gl.SAMPLER_CUBE,gl.SAMPLER_3D,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_2D_ARRAY,gl.SAMPLER_2D_ARRAY_SHADOW,gl.SAMPLER_CUBE_SHADOW,gl.INT_SAMPLER_2D,gl.UNSIGNED_INT_SAMPLER_2D]);
   return {maxTextureUnits:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),glError:gl.getError(),stats:v.getStats(),programs:v.renderer.info.programs.map(p=>{
    const uniforms=[];for(let i=0;i<gl.getProgramParameter(p.program,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(p.program,i);if(types.has(u.type))uniforms.push({name:u.name,size:u.size});}
    return {name:p.name,linked:gl.getProgramParameter(p.program,gl.LINK_STATUS),samplers:uniforms.reduce((sum,u)=>sum+u.size,0),uniforms};
   })};
  });
  assert.equal(profile.graphics.stats.quality.level,'high');assert.equal(profile.graphics.glError,0);
  for(const program of profile.graphics.programs){assert(program.linked,`${name}: shader failed linking`);assert(program.samplers<=profile.graphics.maxTextureUnits,`${name}: shader exceeds texture unit budget`);}
  assert.equal(errors.length,0,errors.join('\n'));
  check(`${name}: High links and renders without browser/WebGL errors within actual texture-unit budget`,{textureUnits:profile.graphics.maxTextureUnits,maxActiveSamplers:Math.max(...profile.graphics.programs.map(p=>p.samplers))});
 }catch(error){errors.push(error.stack??String(error));console.error('FAIL',name,error.message);}
 finally{profile.errors=errors;report.profiles.push(profile);report.errors.push(...errors.map(error=>({profile:name,error})));await browser?.close();}
}
report.finishedAt=new Date().toISOString();report.status=report.errors.length?'failed':'passed';
if(report.status==='passed'&&requested.includes('chromium')){
 const files=['chromium-plaque-on-blue-closeup.png','chromium-plaque-on-graphite-closeup.png'];
 const crops=await Promise.all(files.map(file=>sharp(fileURLToPath(new URL(file,out))).extract({left:550,top:180,width:640,height:650}).png().toBuffer()));
 const heading=Buffer.from('<svg width="1280" height="52" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="52" fill="#f6f7f1"/><g font-family="Arial" font-size="22" fill="#152b27"><text x="28" y="34">Синя фарба · прозорий PMMA</text><text x="668" y="34">Графітова фарба · прозорий PMMA</text></g></svg>');
 await sharp({create:{width:1280,height:702,channels:3,background:'#f6f7f1'}}).composite([{input:heading,left:0,top:0},...crops.map((input,index)=>({input,left:index*640,top:52}))]).png().toFile(fileURLToPath(new URL('door-plaque-proof.png',out)));
 report.screenshots.push('door-plaque-proof.png');
}
await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
if(report.errors.length)process.exitCode=1;
