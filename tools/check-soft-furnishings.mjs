import './browser-path.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';

const url=process.argv.find(v=>v.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const output=path.resolve(import.meta.dirname,'../test-results/soft-furnishings');await mkdir(output,{recursive:true});
const errors=[],requests=[],report={url,startedAt:new Date().toISOString(),errors,fixtures:[],screenshots:[]};
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push({kind:'page',error:e.message}));
 page.on('console',m=>{if(m.type()==='error')errors.push({kind:'console',error:m.text()});});
 page.on('response',r=>{if(r.status()>=400)errors.push({kind:'http',url:r.url(),status:r.status()});if(/\.glb(?:\?|$)/.test(r.url()))requests.push(r.url());});
 await page.goto(url+'?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
 await page.evaluate(async()=>{
  const a=window.__ROOM_ATELIER__,config=structuredClone(a.store.state);config.objects=config.objects.filter(o=>o.regionId==='hall');config.wallFinishes={};
  for(const variant of [1,2,3])config.objects.push({id:'qa-bean-'+variant,assetId:'beanBag',variant,material:variant===2?'eds-blue':'eds-lavender',position:[(variant-2)*1.5,0,-.8],rotation:0,regionId:'meeting'});
  config.objects.push({id:'qa-planter',assetId:'separator',variant:3,material:'sage',position:[0,0,1.9],rotation:0,regionId:'meeting'});
  config.layers.grid=false;config.doorOpen=false;a.store.replace(config);a.select(null);
  a.view.quality.setManual('high');a.setMode('archviz');await a.view.archvizPromise;await a.view.tierRefresh;
  a.view.navigation.setEnabled(false);a.view.keepCameraSafe=()=>{};
 });
 await page.waitForFunction(()=>['qa-bean-1','qa-bean-2','qa-bean-3','qa-planter'].every(id=>window.__ROOM_ATELIER__.view.visuals.get(id)?.templateKey?.endsWith(':high')),null,{timeout:120000});
 const metrics=await page.evaluate(async()=>{
  const a=window.__ROOM_ATELIER__,v=a.view,Vec=v.camera.position.constructor,Box=v.highlight.box.constructor,Ray=v.ray.constructor;
  const manifest=await(await fetch('assets/models/manifest.json')).json(),fixtures=[];
  for(const id of ['qa-bean-1','qa-bean-2','qa-bean-3','qa-planter']){
   const object=a.store.state.objects.find(o=>o.id===id),visual=v.visuals.get(id),root=visual.root,entry=manifest.assets.find(e=>e.assetId===object.assetId&&e.variant===object.variant),box=new Box().setFromObject(root),size=box.getSize(new Vec()),meshes=[];
   root.traverse(o=>{if(!o.isMesh||o.userData.contactShadow)return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),color=o.geometry.getAttribute('color'),m=Array.isArray(o.material)?o.material:[o.material];let minNormal=Infinity,maxNormal=0,colorMin=Infinity,colorMax=-Infinity;for(let i=0;i<n.count;i++){const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));minNormal=Math.min(minNormal,length);maxNormal=Math.max(maxNormal,length);}if(color)for(let i=0;i<color.count;i++)for(const channel of [color.getX(i),color.getY(i),color.getZ(i)]){colorMin=Math.min(colorMin,channel);colorMax=Math.max(colorMax,channel);}meshes.push({name:o.name,vertices:p.count,triangles:(o.geometry.index?.count??p.count)/3,minNormal,maxNormal,color:color?{min:colorMin,max:colorMax}:null,materials:m.map(mat=>({name:mat.name,side:mat.side,vertexColors:mat.vertexColors,normalScale:mat.normalScale?.toArray(),map:!!mat.map,normalMap:!!mat.normalMap,roughness:mat.roughness,materialId:mat.userData.materialId,surface:mat.userData.surface}))});});
   const seatHeights={};if(object.assetId==='beanBag'&&object.variant>1){const ray=new Ray();for(const [key,z]of [['seat',.13],['back',-.31]]){ray.set(new Vec(object.position[0],2,object.position[2]+z),new Vec(0,-1,0));seatHeights[key]=ray.intersectObject(root,true)[0]?.point.y;}}
   fixtures.push({id,assetId:object.assetId,variant:object.variant,templateKey:visual.templateKey,expectedPath:entry.quality.high??entry.production,expectedDimensions:entry.dimensions,size:size.toArray(),floorY:box.min.y,meshes,seatHeights});
  }
  const gl=v.renderer.getContext();gl.finish();return {fixtures,glError:gl.getError(),textureUnits:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),quality:v.quality.settings,mode:a.getMode(),environmentReady:v.environmentReady,stats:v.getStats()};
 });
 Object.assign(report,metrics);
 assert.equal(metrics.mode,'archviz');assert.equal(metrics.quality.level,'high');assert.equal(metrics.environmentReady,true);assert.equal(metrics.glError,0);
 for(const fixture of metrics.fixtures){
  fixture.expectedDimensions.forEach((value,axis)=>assert(Math.abs(fixture.size[axis]-value)<.001,fixture.id+': incorrect production dimensions '+fixture.size));
  assert(Math.abs(fixture.floorY)<.001,fixture.id+': lost floor contact');
  assert(requests.some(r=>r.endsWith('/'+fixture.expectedPath)),fixture.id+': production GLB request not observed: '+fixture.expectedPath);
  for(const mesh of fixture.meshes){assert(mesh.minNormal>.96&&mesh.maxNormal<1.04,fixture.id+': invalid smooth normals '+mesh.minNormal+'/'+mesh.maxNormal);}
  if(fixture.assetId==='beanBag'){
   assert.equal(fixture.meshes.length,1,fixture.id+': raised fittings still present');const mesh=fixture.meshes[0];assert(/continuous_cloth/.test(mesh.name));assert(mesh.triangles>20000);assert(mesh.vertices>10000);
   for(const mat of mesh.materials){assert(mat.map&&mat.normalMap,fixture.id+': fabric maps missing');assert(mat.normalScale.every(s=>Math.abs(s-.055)<.0001),fixture.id+': coarse fabric normal strength');}
   if(fixture.variant>1)assert(fixture.seatHeights.back-fixture.seatHeights.seat>.20,fixture.id+': no proper seat/back support');
  }else{
   const foliage=fixture.meshes.find(m=>/foliage/i.test(m.name));assert(foliage,'Planter foliage missing');assert(foliage.triangles>10000);assert(foliage.color&&foliage.color.max-foliage.color.min>.035,'Leaf vein/edge vertex color variation missing');assert(foliage.materials.every(m=>m.side===2&&m.vertexColors),'Leaves must render correctly on both sides');
   assert(fixture.meshes.some(m=>/soil/i.test(m.name)),'Recessed granular soil missing');assert(fixture.meshes.some(m=>m.materials.some(mat=>mat.materialId==='wood-oak'&&mat.normalMap)),'Production planter oak PBR maps missing');
  }
 }
 await page.addStyleTag({content:'.topbar,.library-panel,.footer,.mobile-dock,.viewport-area>:not(.viewport){display:none!important}.atelier,.workspace,.viewport-area{height:100vh!important;width:100vw!important;max-width:none!important;margin:0!important;padding:0!important}'});
 await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.renderer.setPixelRatio(1);v.composer.setPixelRatio(1);v.resize();v.camera.fov=78;v.camera.position.set(0,2.6,3);v.camera.lookAt(0,.35,.35);v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld();v.shadowDirty=true;});
 await page.waitForTimeout(500);await page.locator('#viewport canvas').screenshot({path:path.join(output,'app-high-overview.png')});report.screenshots.push('app-high-overview.png');
 const panels=[],names=['Груша · м’який чохол','Лаунж зі спинкою','Подушка-крісло','Кашпо · листя та ґрунт'];
 for(const [i,fixture]of metrics.fixtures.entries()){
  await page.evaluate(id=>{const a=window.__ROOM_ATELIER__,v=a.view,object=a.store.state.objects.find(o=>o.id===id),target=v.camera.position.clone().set(object.position[0],object.assetId==='beanBag'?.43:.45,object.position[2]);for(const [key,item]of v.visuals)if(key.startsWith('qa-'))item.root.visible=key===id;
   v.camera.fov=42;const direction=v.camera.position.clone().set(object.assetId==='beanBag'?.9:.8,.75,object.assetId==='beanBag'?1.3:-1.3).normalize().multiplyScalar(object.assetId==='beanBag'?2.05:1.95);v.camera.position.copy(target).add(direction);v.camera.lookAt(target);v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld();v.shadowDirty=true;
  },fixture.id);
  await page.waitForTimeout(350);const png=await page.locator('#viewport canvas').screenshot();const file=fixture.id+'-high.png';await writeFile(path.join(output,file),png);report.screenshots.push(file);
  const {data}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});let visiblePixels=0;for(let p=0;p<data.length;p+=3){const r=data[p],g=data[p+1],b=data[p+2];if(fixture.assetId==='beanBag'?(b>r*1.10&&b>g*1.035&&b>30):(g>r*1.15&&g>b*1.15&&g>35))visiblePixels++;}assert(visiblePixels>5000,fixture.id+': fixture occluded in actual screenshot '+visiblePixels);fixture.visiblePixels=visiblePixels;
  const thumb=await sharp(png).resize(800,572,{fit:'cover'}).toBuffer(),caption=Buffer.from(`<svg width="800" height="48"><rect width="800" height="48" fill="#f0f0ec"/><text x="24" y="31" font-family="Arial,sans-serif" font-size="22" fill="#202a2e">${names[i]} · ArchViz High</text></svg>`);
  panels.push({input:thumb,left:(i%2)*800,top:Math.floor(i/2)*620+48},{input:caption,left:(i%2)*800,top:Math.floor(i/2)*620});
 }
 await sharp({create:{width:1600,height:1240,channels:3,background:'#f0f0ec'}}).composite(panels).png().toFile(path.join(output,'production-contact-sheet.png'));report.screenshots.push('production-contact-sheet.png');
 const lastGl=await page.evaluate(()=>{const gl=window.__ROOM_ATELIER__.view.renderer.getContext();gl.finish();return gl.getError();});assert.equal(lastGl,0,'WebGL error after actual closeup renders');assert.equal(errors.length,0,JSON.stringify(errors));
 report.status='passed';console.log('PASS actual production GLBs: 3 continuous cloth bags, High fabric maps / normal .055, recessed seats, double-sided detailed planter, exact bounds, no browser or GL errors.');
}catch(error){report.status='failed';report.failure=error.stack??String(error);process.exitCode=1;console.error(error);}
finally{report.finishedAt=new Date().toISOString();report.requests=requests;await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
