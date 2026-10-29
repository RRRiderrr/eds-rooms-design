/** Production-browser regression: remove grazing-angle wall shadow acne while
 * retaining moving furniture shadows. References alter only a fresh QA page. */
import './browser-path.mjs';
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const url=process.argv.find(s=>s.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const requested=(process.argv.find(s=>s.startsWith('--browsers='))?.slice(11)??'chromium,webkit').split(',');
const tiers=(process.argv.find(s=>s.startsWith('--tiers='))?.slice(8)??'high,medium').split(',');
const output=path.resolve(import.meta.dirname,'../test-results/wall-shadows');await mkdir(output,{recursive:true});
const report={url,startedAt:new Date().toISOString(),status:'running',profiles:[],errors:[]};
const walls=[
 {id:'near',axis:'z',coordinate:-3.04889054,normal:[0,0,1],along:.137,y:1.557},
 {id:'hall23',axis:'z',coordinate:1.70492439,normal:[0,0,-1],along:-23.3,y:1.25},
 {id:'hall13',axis:'x',coordinate:23.74938519,normal:[-1,0,0],along:.30,y:1.45},
];
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(180);}
async function capture(page,file){await settle(page);const png=await page.locator('#viewport canvas').screenshot();await writeFile(path.join(output,file),png);return png;}
async function raw(png){return sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});}
async function rowMetric(png){
 const {data,info}=await raw(png),rows=[];let minimum=255,maximum=0;
 const left=Math.round(info.width/6),right=info.width-left,top=Math.round(info.height/6),bottom=info.height-top;
 for(let y=top;y<bottom;y++){let sum=0;for(let x=left;x<right;x++){const i=(y*info.width+x)*3,luminance=(data[i]+data[i+1]+data[i+2])/3;sum+=luminance;minimum=Math.min(minimum,luminance);maximum=Math.max(maximum,luminance);}rows.push(sum/(right-left));}
 let second=0,first=0;for(let i=1;i<rows.length-1;i++){second+=(rows[i-1]-2*rows[i]+rows[i+1])**2;first+=(rows[i+1]-rows[i])**2;}
 assert(maximum-minimum>2,'Blank canvas must not be accepted as clean wall');
 return {rowLaplacianRms:Math.sqrt(second/(rows.length-2)),rowGradientRms:Math.sqrt(first/(rows.length-2)),luminanceRange:[minimum,maximum],roi:{left,right,top,bottom},rows};
}
async function shadowDifference(on,off,floorFrom){
 const a=await raw(on),b=await raw(off);assert.equal(a.info.width,b.info.width);const {width,height}=a.info;
 let total=0,weight=0,xsum=0,ysum=0,maxDarkening=0;const mask=Buffer.alloc(width*height*3);
 // Positive darkening isolates a rendered direct shadow from unchanged material,
 // object visibility, reflection and screen-space ambient occlusion.
 for(let y=floorFrom;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*3,d=((b.data[i]-a.data[i])+(b.data[i+1]-a.data[i+1])+(b.data[i+2]-a.data[i+2]))/3;
  maxDarkening=Math.max(maxDarkening,d);if(d>2.5){total++;weight+=d;xsum+=x*d;ysum+=y*d;mask[i]=Math.min(255,d*12);mask[i+1]=Math.min(255,d*5);}
 }
 return {floorRoi:{top:floorFrom,bottom:height,left:0,right:width},pixels:total,meanDarkening:weight/Math.max(1,total),maxDarkening,centroid:{x:xsum/Math.max(1,weight),y:ysum/Math.max(1,weight)},mask:await sharp(mask,{raw:{width,height,channels:3}}).png().toBuffer()};
}
async function lights(page){return page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view,result=[];v.directLighting.group.traverse(o=>{if(o.isLight&&o.castShadow)result.push({name:o.name,size:o.shadow.mapSize.toArray(),normalBias:o.shadow.normalBias,bias:o.shadow.bias,radius:o.shadow.radius,near:o.shadow.camera.near,far:o.shadow.camera.far});});return {lights:result,shadowsEnabled:v.renderer.shadowMap.enabled,level:v.quality.settings.level};});}
function assertCalibrated(actual,tier){assert.equal(actual.level,tier);assert.equal(actual.shadowsEnabled,true);assert.equal(actual.lights.length,tier==='high'?6:2);for(const lamp of actual.lights){assert.deepEqual(lamp.size,[2048,2048]);assert.equal(lamp.normalBias,.012);assert.equal(lamp.bias,-.0001);assert.equal(lamp.radius,1.5);assert.equal(lamp.near,.3);}}
async function paintedMaterials(page){return page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view,result=[];v.architecture.production.traverse(o=>{if(!o.isMesh||o.userData.archCategory!=='walls')return;for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat.userData.materialId==='wall-painted')result.push({name:o.name,uvCount:o.geometry.getAttribute('uv')?.count,map:!!mat.map,normal:!!mat.normalMap,roughness:!!mat.roughnessMap,lightmap:!!mat.lightMap,normalScale:mat.normalScale?.toArray(),repeat:mat.map?.repeat.toArray(),width:mat.map?.image?.width,height:mat.map?.image?.height});});return result;});}
async function settings(page,kind){await page.evaluate(kind=>{
 const v=window.__ROOM_ATELIER__.view;
 v.directLighting.group.traverse(o=>{if(!o.isLight||!o.shadow)return;const s=o.shadow;
  Object.assign(s,kind==='baseline'?{normalBias:.009,bias:-.00003,radius:3}:{normalBias:.012,bias:-.0001,radius:1.5});
  s.camera.near=kind==='baseline'?.15:.3;s.camera.updateProjectionMatrix();
  const size=kind==='baseline'&&!o.name.startsWith('Room_')?1024:2048;
  if(s.mapSize.x!==size){s.map?.dispose();s.map=null;s.mapSize.set(size,size);}s.needsUpdate=true;
 });v.shadowDirty=true;v.renderer.shadowMap.needsUpdate=true;
},kind);}
const panels=[];
try{
 for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]].filter(([name])=>requested.includes(name))){
  const browser=await engine.launch({headless:true,args:engineName==='chromium'&&process.platform==='win32'?['--use-angle=d3d11']:[]});
  try{
   for(const tier of tiers){
    const context=await browser.newContext({viewport:{width:1200,height:900},deviceScaleFactor:1});const page=await context.newPage();
    const profile={browser:engineName,tier,walls:[],errors:[]};report.profiles.push(profile);
    page.on('pageerror',e=>profile.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')profile.errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)profile.errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(url+(url.includes('?')?'&':'?')+'mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
    await page.evaluate(async tier=>{const a=window.__ROOM_ATELIER__,config=structuredClone(a.store.state);config.objects=[];config.wallFinishes={};config.layers.grid=false;config.doorOpen=false;a.store.replace(config);a.select(null);a.view.quality.setManual(tier);a.setMode('archviz');await a.view.archvizPromise;await a.view.tierRefresh;a.view.navigation.setEnabled(false);a.view.keepCameraSafe=()=>{};},tier);
    // Windows WebKit's resize/compositor path can capture a clear-only canvas
    // after forcing the UI shell to full viewport. Retain the ordinary UI layout
    // there, and screenshot its actual canvas without altering render passes.
    if(engineName==='chromium')await page.addStyleTag({content:'.topbar,.library-panel,.footer,.mobile-dock,.viewport-area>:not(.viewport){display:none!important}.atelier,.workspace,.viewport-area{height:100vh!important;width:100vw!important;max-width:none!important;margin:0!important;padding:0!important}'});
    await settle(page);profile.actual=await lights(page);
    assertCalibrated(profile.actual,tier);profile.qualityCycle=[];
    for(const next of [tier==='high'?'medium':'high',tier]){
     await page.evaluate(async next=>{const v=window.__ROOM_ATELIER__.view;v.quality.setManual(next);await v.tierRefresh;},next);await settle(page);
     const actual=await lights(page),materials=await paintedMaterials(page);assertCalibrated(actual,next);assert(materials.length>20,'Painted wall materials missing after tier refresh');for(const mat of materials){assert(mat.map&&mat.normal&&mat.roughness&&mat.lightmap,`${mat.name}: PBR maps lost after tier change`);assert(mat.uvCount>0);assert(mat.normalScale.every(s=>Math.abs(s-.06)<.00001));}
     profile.qualityCycle.push({level:next,lights:actual.lights,paintedWallMaterials:materials});
    }
    for(const wall of walls)for(const distance of [.4,1.8]){
     await page.evaluate(({wall,distance})=>{const v=window.__ROOM_ATELIER__.view,Vec=v.camera.position.constructor,target=new Vec(wall.axis==='x'?wall.coordinate:wall.along,wall.y,wall.axis==='z'?wall.coordinate:wall.along);v.camera.fov=62;v.camera.position.copy(target).addScaledVector(new Vec(...wall.normal),distance);v.camera.lookAt(target);v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld(true);v.scene.updateMatrixWorld(true);v.shadowDirty=true;},{wall,distance});
     const id=`${engineName}-${tier}-${wall.id}-${distance===.4?'close':'wide'}`,entry={wall:wall.id,distance};profile.walls.push(entry);
     for(const kind of ['baseline','fixed']){await settings(page,kind);const file=`${id}-${kind}.png`,png=await capture(page,file);entry[kind]={file,...await rowMetric(png)};
      const thumb=await sharp(png).resize(400,300).toBuffer(),caption=Buffer.from(`<svg width="400" height="34"><rect width="400" height="34" fill="#f4f3ef"/><text x="10" y="22" font-family="Arial" font-size="14">${id} · ${kind}</text></svg>`);const row=panels.length/4;panels.push({input:caption,left:kind==='baseline'?0:400,top:Math.floor(row)*334},{input:thumb,left:kind==='baseline'?0:400,top:Math.floor(row)*334+34});
     }
     entry.reduction=1-entry.fixed.rowLaplacianRms/entry.baseline.rowLaplacianRms;
     // Compare every affected wall orientation. A reference that was already
     // clean at this tier must remain below the absolute banding threshold.
     assert(entry.fixed.rowLaplacianRms<.13,`${id}: residual coherent bands ${entry.fixed.rowLaplacianRms}`);
     if(entry.baseline.rowLaplacianRms>.11)assert(entry.reduction>.60,`${id}: old horizontal bands not substantially reduced (${entry.reduction})`);
     console.log(`PASS ${id}: row Laplacian ${entry.baseline.rowLaplacianRms.toFixed(4)} → ${entry.fixed.rowLaplacianRms.toFixed(4)}`);
    }
    await settings(page,'fixed');
    await page.evaluate(async()=>{const a=window.__ROOM_ATELIER__,config=structuredClone(a.store.state);config.objects=[{id:'qa-moving-table',assetId:'hallDesk',variant:2,material:'original',position:[-.5,0,-.25],rotation:0,regionId:'meeting'}];a.store.replace(config);await a.view.tierRefresh;});
    await page.waitForFunction(tier=>window.__ROOM_ATELIER__.view.visuals.get('qa-moving-table')?.templateKey?.endsWith(':'+tier),tier,{timeout:120000});
    await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.camera.fov=60;v.camera.position.set(0,2.6,2.45);v.camera.lookAt(0,0,-.4);v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld();v.scene.updateMatrixWorld(true);v.shadowDirty=true;});
    const positions=[];
    for(const [i,x]of [-.5,.65].entries()){
     const world=await page.evaluate(x=>{const a=window.__ROOM_ATELIER__,v=a.view,root=v.visuals.get('qa-moving-table').root;root.position.x=x;root.updateMatrixWorld(true);const world=root.position.clone().set(x,0,-.25),p=world.clone().project(v.camera),front=world.clone().set(x,0,.15).project(v.camera);v.shadowDirty=true;return {world:world.toArray(),projected:{x:(p.x*.5+.5)*v.renderer.domElement.width,y:(-.5*p.y+.5)*v.renderer.domElement.height},floorFrom:Math.ceil((-.5*front.y+.5)*v.renderer.domElement.height)+6};},x);
     const prefix=`${engineName}-${tier}-moving-shadow-${i+1}`;
     for(const enabled of [false,true]){await page.evaluate(enabled=>{const v=window.__ROOM_ATELIER__.view;v.visuals.get('qa-moving-table').root.traverse(o=>{if(o.isMesh&&!o.userData.contactShadow)o.castShadow=enabled;});v.shadowDirty=true;v.renderer.shadowMap.needsUpdate=true;},enabled);const png=await capture(page,prefix+(enabled?'-on.png':'-reference.png'));world[enabled?'on':'off']=png;}
     // Only count floor pixels below the projected nearest table footprint.
     // This excludes the tabletop, cabinet and leg self-shadow from evidence.
     const diff=await shadowDifference(world.on,world.off,world.floorFrom);await writeFile(path.join(output,prefix+'-difference.png'),diff.mask);delete diff.mask;delete world.on;delete world.off;
     assert(diff.pixels>120,`${prefix}: direct furniture shadow absent (${diff.pixels}px)`);assert(diff.maxDarkening>5,`${prefix}: shadow too faint`);
     positions.push({...world,...diff});
    }
    const delta=positions[1].centroid.x-positions[0].centroid.x,expected=positions[1].projected.x-positions[0].projected.x;
    assert(delta*expected>0,`${engineName}-${tier}: furniture shadow did not follow moved table`);assert(Math.abs(delta)>30,`${engineName}-${tier}: shadow position did not change sufficiently`);
    profile.movingShadow={fixture:'Actual hallDesk:2 production GLB',positions,pixelCentroidMovement:delta,projectedObjectMovement:expected};
    profile.final=await lights(page);profile.glError=await page.evaluate(()=>{const gl=window.__ROOM_ATELIER__.view.renderer.getContext();gl.finish();return gl.getError();});
    assert.equal(profile.glError,0);assert.equal(profile.errors.length,0,JSON.stringify(profile.errors));console.log(`PASS ${engineName}-${tier}: moving production table shadow Δx ${delta.toFixed(1)}px, no GL/browser errors`);await context.close();
   }
  }finally{await browser.close();}
 }
 if(panels.length)await sharp({create:{width:800,height:Math.ceil(panels.length/4)*334,channels:3,background:'#f4f3ef'}}).composite(panels).png().toFile(path.join(output,'wall-comparison.png'));
 if(requested.includes('chromium')&&tiers.includes('high')){
  const proof=[];for(const [i,[kind,title]]of [['baseline','До'],['fixed','Після']].entries()){
   const png=await sharp(path.join(output,`chromium-high-hall23-wide-${kind}.png`)).resize(600,450).toBuffer();
   proof.push({input:png,left:i*600,top:42},{input:Buffer.from(`<svg width="600" height="42"><rect width="600" height="42" fill="#f4f3ef"/><text x="22" y="29" font-family="Arial" font-size="22" fill="#202a2e">${title}</text></svg>`),left:i*600,top:0});
  }await sharp({create:{width:1200,height:492,channels:3,background:'#f4f3ef'}}).composite(proof).png().toFile(path.join(output,'wall-proof.png'));
 }
 report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack??String(error);process.exitCode=1;console.error(error);}
finally{report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
