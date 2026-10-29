import './browser-path.mjs';
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const url=process.argv.find(v=>v.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const output=path.resolve(import.meta.dirname,'../test-results/botanical-partitions');
await mkdir(output,{recursive:true});
const layoutCheck=JSON.parse(await readFile(path.resolve(import.meta.dirname,'../test-results/rear-partitions-layout/report.json'),'utf8'));
const report={url,startedAt:new Date().toISOString(),profiles:[],errors:[]};
const state=page=>page.evaluate(()=>structuredClone(window.__ROOM_ATELIER__.store.state));
const ready=page=>page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
const loaded=page=>page.waitForFunction(()=>{const a=window.__ROOM_ATELIER__,objects=a.store.state.objects.filter(o=>o.assetId==='botanicalDivider'&&o.variant>0);return objects.length>0&&objects.every(o=>a.view.visuals.get(o.id)?.templateKey?.endsWith(':high'));},null,{timeout:120000});
const content=s=>({objects:s.objects,wallFinishes:s.wallFinishes,doorOpen:s.doorOpen});

for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
 const profile={name,checks:[],presets:[],screenshots:[],requests:[],errors:[]};report.profiles.push(profile);let browser;
 try{
  browser=await engine.launch({headless:true,args:engine===chromium&&process.platform==='win32'?['--use-angle=d3d11']:[]});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>profile.errors.push({kind:'page',error:e.message}));
  page.on('console',m=>{if(m.type()==='error')profile.errors.push({kind:'console',error:m.text()});});
  page.on('response',r=>{if(r.status()>=400)profile.errors.push({kind:'http',url:r.url(),status:r.status()});if(/\.glb(?:\?|$)/.test(r.url()))profile.requests.push(r.url());});
  await page.goto(url+'?mode=editor');await ready(page);await page.getByTestId('region-hall').click();
  await page.getByRole('combobox',{name:'Якість графіки'}).selectOption('high');await page.getByRole('button',{name:'ArchViz',exact:true}).click();
  await page.evaluate(async()=>{const v=window.__ROOM_ATELIER__.view;await v.archvizPromise;await v.tierRefresh;v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};});
  for(let index=0;index<8;index++){
   await page.getByTestId('preset-select').selectOption('hall-preset-'+index);await loaded(page);
   const metrics=await page.evaluate(async()=>{
    const a=window.__ROOM_ATELIER__,v=a.view,Vec=v.camera.position.constructor,Box=v.highlight.box.constructor,Ray=v.ray.constructor;
    const manifest=await(await fetch('assets/models/manifest.json')).json(),layout=await(await fetch('assets/architecture/hall-layout.json')).json(),screens=[],allMeshes=[];
    for(const object of a.store.state.objects.filter(o=>o.assetId==='botanicalDivider'&&o.variant>0)){
     const visual=v.visuals.get(object.id),entry=manifest.assets.find(e=>e.assetId===object.assetId&&e.variant===object.variant),meshes=[],physical=[],structure=[],bounds=new Box();visual.root.updateMatrixWorld(true);
     visual.root.traverse(mesh=>{
      if(!mesh.isMesh||mesh.userData.contactShadow)return;bounds.union(new Box().setFromObject(mesh));physical.push(mesh);allMeshes.push(mesh);
      const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal'),color=mesh.geometry.getAttribute('color');
      let normalMin=Infinity,normalMax=0,colorMin=Infinity,colorMax=-Infinity;for(let i=0;i<n.count;i++){const len=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));normalMin=Math.min(normalMin,len);normalMax=Math.max(normalMax,len);}if(color)for(let i=0;i<color.count;i++)for(const c of [color.getX(i),color.getY(i),color.getZ(i)]){colorMin=Math.min(colorMin,c);colorMax=Math.max(colorMax,c);}
      const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(mat=>({name:mat.name,preserveOriginal:mat.userData.preserveOriginal,side:mat.side,vertexColors:mat.vertexColors,color:mat.color?.toArray(),transparent:mat.transparent,opacity:mat.opacity,map:!!mat.map,normalMap:!!mat.normalMap}));
      if(!materials.every(m=>/foliage|stems|midribs|petals|pollen/.test(m.name)))structure.push(mesh);
      meshes.push({name:mesh.name,triangles:(mesh.geometry.index?.count??p.count)/3,normalMin,normalMax,color:color?{min:colorMin,max:colorMax}:null,materials});
     });
     // Bidirectional real-triangle rays above the planter distinguish open
     // shelving/trellises from a hidden opaque full-height backing.
     const holes={tested:0,clear:0,structureClear:0,frontClear:0,backClear:0};
     for(const face of [-1,1])for(let x=0;x<31;x++)for(let y=0;y<27;y++){
      const xx=-.88+x/30*1.76,yy=.48+y/26*1.66,origin=new Vec(xx,yy,face*.8).applyMatrix4(visual.root.matrixWorld),end=new Vec(xx,yy,-face*.8).applyMatrix4(visual.root.matrixWorld),delta=end.clone().sub(origin),ray=new Ray(origin,delta.clone().normalize(),0,delta.length());
      const clear=!ray.intersectObjects(physical,false).length;holes.tested++;if(clear){holes.clear++;if(face===1)holes.frontClear++;else holes.backClear++;}if(!ray.intersectObjects(structure,false).length)holes.structureClear++;
     }
     screens.push({id:object.id,variant:object.variant,material:object.material,position:object.position,rotation:object.rotation,templateKey:visual.templateKey,expectedPath:entry.quality.high??entry.production,size:bounds.getSize(new Vec()).toArray(),floorY:bounds.min.y,holes,meshes});
    }
    const stair=layout.doors.find(d=>d.id==='door-14'),stairsView={tested:0,blocked:[]};
    for(const eye of [[-19,1.65,-3.85],[-20,1.65,-3.85]])for(let i=0;i<21;i++)for(let j=0;j<7;j++){
     const target=new Vec(...stair.position);target.y=.12+j/6*1.9;target.z+=i/20-.5;const origin=new Vec(...eye),delta=target.clone().sub(origin),ray=new Ray(origin,delta.clone().normalize(),0,delta.length());stairsView.tested++;if(ray.intersectObjects(allMeshes,false).length)stairsView.blocked.push({eye,target:target.toArray()});
    }
    const gl=v.renderer.getContext();gl.finish();return {presetId:a.store.state.regionPresets.hall.presetId,screens,stairsView,quality:v.quality.settings.level,glError:gl.getError()};
   });
   assert.equal(metrics.screens.length,2);assert.equal(new Set(metrics.screens.map(s=>s.variant)).size,2);assert.equal(metrics.quality,'high');assert.equal(metrics.glError,0);
   const [first,second]=metrics.screens,dx=second.position[0]-first.position[0],dz=second.position[2]-first.position[2];assert.equal(first.rotation,second.rotation);assert(Math.abs(dx*Math.sin(first.rotation)+dz*Math.cos(first.rotation))<.001,'Screens must form one straight row');assert(Math.abs(Math.hypot(dx,dz)-2)<.001,'Screens must be adjacent');
   assert.equal(metrics.stairsView.blocked.length,0,`${name} ${metrics.presetId} stair view blocked: ${JSON.stringify(metrics.stairsView.blocked.slice(0,3))}`);
   for(const screen of metrics.screens){
    assert(screen.templateKey.startsWith('botanicalDivider-'));assert(profile.requests.some(r=>r.endsWith('/'+screen.expectedPath)),'Production GLB request not observed: '+screen.expectedPath);
    const c=Math.abs(Math.cos(screen.rotation)),s=Math.abs(Math.sin(screen.rotation));[2*c+.48*s,2.3,2*s+.48*c].forEach((size,axis)=>assert(Math.abs(screen.size[axis]-size)<.001,screen.id+' production bounds '+screen.size));assert(Math.abs(screen.floorY)<.001);
    assert(screen.meshes.length>3);assert(screen.meshes.reduce((n,m)=>n+m.triangles,0)>10000);
    assert(!screen.meshes.some(m=>m.materials.some(mat=>mat.name==='Botanical_opaque_privacy_core')),'Obsolete common opaque wall in production GLB');
    if([2,3,4,5].includes(screen.variant)){assert(screen.holes.frontClear>0&&screen.holes.backClear>0,`Open variant ${screen.variant} has no actual holes: ${JSON.stringify(screen.holes)}`);assert(screen.holes.structureClear/screen.holes.tested>.25,`Open variant ${screen.variant} structure has a solid backing`);}
    for(const mesh of screen.meshes){assert(mesh.normalMin>.95&&mesh.normalMax<1.05,screen.id+' non-unit normals');for(const mat of mesh.materials)if(mat.name==='Botanical_living_foliage')assert(mat.side===2&&mat.vertexColors&&mat.preserveOriginal&&mesh.color&&mesh.color.max-mesh.color.min>.04);}
   }
   profile.presets.push(metrics);console.log('PASS',name,metrics.presetId,'two inline production screens; stairs clear; actual GLB openings');
   if([0,2,4].includes(index)){
    await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view;v.camera.position.set(-17.6,1.72,-2.4);v.camera.fov=74;v.camera.lookAt(-22.15,1.1,-.5);v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld();v.shadowDirty=true;});await page.waitForTimeout(700);
    const file=`${name}-hall-${index}-front.png`;await page.screenshot({path:path.join(output,file)});profile.screenshots.push(file);
   }
  }
  assert.deepEqual([...new Set(profile.presets.flatMap(p=>p.screens.map(s=>s.variant)))].sort(),[1,2,3,4,5,6]);
  profile.checks.push('All 8 actual UI hall selections load exactly 2 inline production GLBs; all 6 designs; exact floor bounds, protected foliage, bidirectional real openings in variants 2–5, no common opaque wall, and clear stair-door view.');

  await page.getByTestId('preset-select').selectOption('hall-preset-0');await loaded(page);
  const pathEntry=layoutCheck.entries.find(e=>e.presetId==='hall-preset-0');assert(pathEntry?.paths?.length===3,'Run current two-screen layout checker first');
  const navigation=await page.evaluate(paths=>{
   const a=window.__ROOM_ATELIER__,v=a.view,Vec=v.camera.position.constructor,allowed=(from,to)=>v.cameraMoveAllowed(new Vec(...from),new Vec(...to));
   const object=structuredClone(a.store.state.objects.find(o=>o.id==='hall-rear-screen-1')),p=object.position,oldA=[p[0]+1,1.65,p[2]],oldB=[p[0]-1,1.65,p[2]],failures=[];
   const blocked=allowed(oldA,oldB);
   for(const path of paths)for(let i=1;i<path.points.length;i++){
    const aa=[path.points[i-1][0],1.65,path.points[i-1][1]],bb=[path.points[i][0],1.65,path.points[i][1]],n=Math.max(1,Math.ceil(Math.hypot(bb[0]-aa[0],bb[2]-aa[2])/.12));
    for(let j=1;j<=n;j++){const from=aa.map((x,k)=>x+(bb[k]-x)*(j-1)/n),to=aa.map((x,k)=>x+(bb[k]-x)*j/n);if(!allowed(from,to))failures.push({door:path.door,from,to});}
   }
   const stairsDirect=allowed([-19,1.65,-3.85],[-22.7,1.65,-3.85]);a.store.updateObject(object.id,{position:[-16,0,-3.9]});
   const movedOldAllowed=allowed(oldA,oldB),movedNewBlocked=allowed([-15,1.65,-3.9],[-17,1.65,-3.9]);a.store.remove(object.id);const removedAllowed=allowed([-15,1.65,-3.9],[-17,1.65,-3.9]);a.store.upsert(object);
   return {blocked,failures,stairsDirect,movedOldAllowed,movedNewBlocked,removedAllowed,paths};
  },pathEntry.paths);
  assert.equal(navigation.blocked,false);assert.deepEqual(navigation.failures,[]);assert.equal(navigation.stairsDirect,true);assert.equal(navigation.movedOldAllowed,true);assert.equal(navigation.movedNewBlocked,false);assert.equal(navigation.removedAllowed,true);profile.navigation=navigation;
  profile.checks.push('Actual SceneView cameraMoveAllowed: direct stair approach and all 3 walking routes clear; moved/deleted screen collisions update immediately.');

  await page.getByRole('button',{name:'Editor',exact:true}).click();await page.evaluate(()=>window.__ROOM_ATELIER__.select('hall-rear-screen-1'));
  const originalScreen=(await state(page)).objects.find(o=>o.id==='hall-rear-screen-1');await page.getByTestId('variant-select').selectOption('6');await page.getByRole('button',{name:'ArchViz',exact:true}).click();await loaded(page);
  const protectedColors=await page.evaluate(()=>{const result={};window.__ROOM_ATELIER__.view.visuals.get('hall-rear-screen-1').root.traverse(o=>{if(o.isMesh&&['Botanical_living_foliage','Botanical_recessed_soil'].includes(o.material.name))result[o.material.name]=o.material.color.toArray();});return result;});
  await page.getByRole('button',{name:'Editor',exact:true}).click();await page.getByTestId('material-select').selectOption('terracotta');await page.getByRole('button',{name:'ArchViz',exact:true}).click();await loaded(page);
  const changed=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,colors={};a.view.visuals.get('hall-rear-screen-1').root.traverse(o=>{if(o.isMesh&&['Botanical_living_foliage','Botanical_recessed_soil'].includes(o.material.name))colors[o.material.name]=o.material.color.toArray();});return {object:a.store.state.objects.find(o=>o.id==='hall-rear-screen-1'),colors};});
  assert.equal(changed.object.variant,6);assert.equal(changed.object.material,'terracotta');assert.deepEqual(changed.object.position,originalScreen.position);assert.equal(changed.object.rotation,originalScreen.rotation);assert.deepEqual(changed.colors,protectedColors);assert.equal(Object.keys(protectedColors).length,2);profile.checks.push('Actual inspector model/finish controls preserve transform and natural foliage/soil colours.');

  // Both old empty drafts and the previous incorrect four-screen arrangement
  // are corrected explicitly through the visible UI, without resetting a preset.
  await page.getByRole('button',{name:'Editor',exact:true}).click();await page.getByTestId('preset-select').selectOption('hall-preset-3');
  await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,legacy=structuredClone(a.store.state);legacy.objects=legacy.objects.filter(o=>o.assetId!=='botanicalDivider');legacy.modified=true;legacy.regionPresets.hall.modified=true;legacy.wallFinishes.east={color:'#dee4d7',motif:0,accent:'#0B30C1',mural:0};a.store.replace(legacy);a.select(null);});
  const legacyEmpty=content(await state(page));await page.getByTestId('rear-partitions').click();assert.equal((await state(page)).objects.filter(o=>o.assetId==='botanicalDivider').length,2);
  await page.getByTestId('undo').click();assert.deepEqual(content(await state(page)),legacyEmpty);await page.getByTestId('redo').click();
  await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,legacy=structuredClone(a.store.state),base=legacy.objects.find(o=>o.id==='hall-rear-screen-1');legacy.objects=legacy.objects.filter(o=>o.assetId!=='botanicalDivider');[[-21.35,-3.9],[-21.85,-2.25],[-21.35,-.6],[-19.95,1.1]].forEach(([x,z],index)=>legacy.objects.push({...base,id:`hall-rear-screen-${index+1}`,variant:(3+index)%6+1,material:['sage','terracotta','oak','graphite'][index],position:[x,0,z],rotation:Math.PI/2}));a.store.replace(legacy);a.select(null);});
  const legacyFour=content(await state(page));await page.getByTestId('rear-partitions').click();let updated=await state(page);const corrected=updated.objects.filter(o=>o.assetId==='botanicalDivider');assert.equal(corrected.length,2);assert.deepEqual(updated.objects.filter(o=>o.assetId!=='botanicalDivider'),legacyEmpty.objects);assert.deepEqual(updated.wallFinishes,legacyFour.wallFinishes);
  for(const object of corrected){const before=legacyFour.objects.find(o=>o.id===object.id);assert.equal(object.variant,before.variant);assert.equal(object.material,before.material);}
  await page.getByTestId('undo').click();assert.deepEqual(content(await state(page)),legacyFour);await page.getByTestId('redo').click();updated=await state(page);assert.equal(updated.objects.filter(o=>o.assetId==='botanicalDivider').length,2);
  await page.evaluate(()=>window.__ROOM_ATELIER__.select('hall-rear-screen-1'));await page.getByTestId('delete').click();await page.waitForTimeout(950);await page.reload();await ready(page);
  const reloaded=await state(page);assert.equal(reloaded.objects.filter(o=>o.assetId==='botanicalDivider').length,1);assert(!reloaded.objects.some(o=>o.id==='hall-rear-screen-1'));assert.deepEqual(reloaded.objects.filter(o=>o.assetId!=='botanicalDivider'),legacyEmpty.objects);assert.deepEqual(reloaded.wallFinishes,legacyFour.wallFinishes);
  profile.checks.push('Visible UI: old empty draft adds 2; obsolete stock 4 changes to 2 inline; variants, finishes and all other objects preserved; one Undo/Redo; deliberate deletion persists after reload.');

  await page.getByRole('button',{name:'Editor',exact:true}).click();await page.getByTestId('library-tab').click();await page.getByRole('button',{name:'Перегородки',exact:true}).click();
  await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,config=structuredClone(a.store.state);config.objects=[];a.store.replace(config);a.select(null);const v=a.view;v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};v.camera.position.set(-13,7,-6);v.controls.target.set(-16,.4,-1.5);v.controls.update();v.camera.updateMatrixWorld();});
  const card=page.getByTestId('add-botanicalDivider');await card.scrollIntoViewIfNeeded();const box=await card.boundingBox();assert(box);
  const target=await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view,p=v.camera.position.clone().set(-16,0,-1.5).project(v.camera),r=v.renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:22});const feedback=await page.evaluate(()=>window.__ROOM_ATELIER__.view.getLibraryPlacement());assert(feedback?.valid,JSON.stringify(feedback));await page.mouse.up();
  const dragged=(await state(page)).objects;assert.equal(dragged.length,1);assert.equal(dragged[0].assetId,'botanicalDivider');assert(Math.hypot(dragged[0].position[0]+16,dragged[0].position[2]+1.5)<.4);await page.getByTestId('undo').click();assert.equal((await state(page)).objects.length,0);profile.drag={feedback,object:dragged[0]};profile.checks.push('Actual catalogue mouse drag/drop at chosen floor position and single Undo.');
  const glError=await page.evaluate(()=>{const gl=window.__ROOM_ATELIER__.view.renderer.getContext();gl.finish();return gl.getError();});assert.equal(glError,0);assert.equal(profile.errors.length,0,JSON.stringify(profile.errors));profile.status='passed';
 }catch(error){profile.status='failed';profile.failure=error.stack??String(error);report.errors.push({name,error:profile.failure});console.error(name,error);}
 finally{await browser?.close();await writeFile(path.join(output,`${name}-report.json`),JSON.stringify(profile,null,2));}
}
report.status=report.errors.length?'failed':'passed';report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;else console.log('PASS Chromium + WebKit: 2 inline botanical screens, open production geometry, clear stairs, live access routes, editor controls, drag/drop and reversible preserved-draft correction.');
