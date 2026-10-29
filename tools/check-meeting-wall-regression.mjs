import './browser-path.mjs';
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const url=process.argv.find(v=>v.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const wanted=(process.argv.find(v=>v.startsWith('--browsers='))?.slice(11)??'chromium,webkit').split(',');
const output=path.resolve('test-results/meeting-solid-walls-regression/final');await mkdir(output,{recursive:true});
const report={url,startedAt:new Date().toISOString(),profiles:[],errors:[]};
const cameras=[['west-corner',[-4.5,1.65,-4.5],[-3.1,3.1,-3.05]],['east-corner',[4.5,1.65,-4.5],[3.1,3.1,-3.05]],['west-hall-side',[-6,1.65,0],[-3,2.6,0]],['east-hall-side',[6,1.65,0],[3,2.6,0]],['entrance',[0,1.65,-4.95],[0,2.3,-3.1489]]];
async function camera(page,eye,target,mode){await page.evaluate(({eye,target,mode})=>{const a=window.__ROOM_ATELIER__,v=a.view;a.setMode(mode);v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};v.controls.enableDamping=false;v.controls.minDistance=.1;v.controls.minPolarAngle=0;v.controls.maxPolarAngle=Math.PI;v.camera.fov=mode==='archviz'&&eye[0]===0?112:62;v.camera.updateProjectionMatrix();v.camera.position.set(...eye);v.controls.target.set(...target);v.camera.lookAt(v.controls.target);if(mode==='editor')v.controls.update();v.camera.updateMatrixWorld(true);v.shadowDirty=true;},{eye,target,mode});await page.waitForTimeout(120);}
async function screenshot(page,name){await page.screenshot({path:path.join(output,name+'.png')});}
const audit=page=>page.evaluate(()=>{
 const v=window.__ROOM_ATELIER__.view,root=v.mode==='editor'?v.architecture.editor:v.architecture.production,Vec=v.camera.position.constructor,Ray=v.ray.constructor,assemblies=[],lighting=new Map();let seamComparisons=0,maxSeamError=0;
 root.updateMatrixWorld(true);const visible=o=>{for(let n=o;n;n=n.parent)if(!n.visible)return false;return true;};
 for(const side of ['west','east','near']){
  const group=root.getObjectByName('Meeting_Solid_'+side),parts=[],edges=new Map();if(!group)throw Error('Missing solid '+side);
  group.traverse(o=>{
   if(!o.isMesh&&!o.userData.solidWallOutline)return;
   if(!o.isMesh){parts.push({name:o.name,outline:true,visible:visible(o)});return;}
   const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),uv=o.geometry.getAttribute('uv'),e=o.geometry.getAttribute('bakedWallIrradiance'),index=o.geometry.index;
   let minUv=Infinity,maxUv=0,maxEdge=0;
   for(let i=0;i<(index?.count??p.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),points=ids.map(id=>new Vec().fromBufferAttribute(p,id).applyMatrix4(o.matrixWorld));
    const keys=points.map(p=>p.toArray().map(n=>Math.round(n*10000)).join(','));for(const [a,b]of [[0,1],[1,2],[2,0]]){const key=[keys[a],keys[b]].sort().join('|');edges.set(key,(edges.get(key)??0)+1);const world=points[a].distanceTo(points[b]),tex=Math.hypot(uv.getX(ids[a])-uv.getX(ids[b]),uv.getY(ids[a])-uv.getY(ids[b]));if(world>.001&&tex>.001){minUv=Math.min(minUv,world/tex);maxUv=Math.max(maxUv,world/tex);}maxEdge=Math.max(maxEdge,world);}
   }
   if(e)for(let i=0;i<p.count;i++){
    const pos=new Vec().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld),normal=new Vec().fromBufferAttribute(n,i),key=[...pos.toArray(),...normal.toArray()].map(x=>x.toFixed(5)).join(','),value=[e.getX(i),e.getY(i),e.getZ(i)],previous=lighting.get(key);
    if(previous&&previous.mesh!==o.uuid){seamComparisons++;maxSeamError=Math.max(maxSeamError,...value.map((x,j)=>Math.abs(x-previous.value[j])));}else lighting.set(key,{mesh:o.uuid,value});
   }
   parts.push({name:o.name,visible:visible(o),role:o.userData.wallSurfaceRole,category:o.userData.archCategory,samples:e?.count??0,vertices:p.count,minUv,maxUv,maxEdge,materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>({id:m.userData.materialId,lightMap:!!m.lightMap,continuous:!!m.userData.continuousWallLighting,map:!!m.map,normalMap:!!m.normalMap,roughnessMap:!!m.roughnessMap,normalScale:m.normalScale?.toArray()}))});
  });
  const f=group.userData.cutawayFace,axis=f.axis==='x'?0:2,expected=(v.camera.position.getComponent(axis)-f.coordinate)*f.normal[axis]>=-.001;
  assemblies.push({side,groupVisible:visible(group),expected,face:f,total:parts.length,visible:parts.filter(p=>p.visible).length,parts,edges:edges.size,badEdges:[...edges].filter(([,n])=>n!==2).slice(0,5)});
 }
 const meshes=[];root.traverse(o=>{if(o.isMesh&&o.userData.solidAssemblyPart)meshes.push(o);});
 const ray=(origin,direction)=>new Ray(new Vec(...origin),new Vec(...direction),0,5).intersectObjects(meshes,false)[0];
 const bands=[];for(const [x,d]of [[-4,1],[4,-1]])for(const z of [-2,0,2])for(const y of [2.8,3.2,4.1]){const h=ray([x,y,z],[d,0,0]);bands.push({x,z,y,point:h?.point.toArray(),role:h?.object.userData.wallSurfaceRole});}
 for(const x of [-3.05,0,3.05])for(const y of [2.8,3.2]){const h=ray([x,y,-4.5],[0,0,1]);bands.push({front:true,x,y,point:h?.point.toArray(),role:h?.object.userData.wallSurfaceRole});}
 const protrudingOldBeams=[];for(const x of [-3.05,-2.8,0,2.8,3.05])for(const y of [3.2,3.8,4.1]){const hits=new Ray(new Vec(x,y,-4.5),new Vec(0,0,1),0,2).intersectObject(root,true).filter(h=>h.object.isMesh);const hit=hits.find(h=>{const m=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;return /08_CEILING_STEEL/.test(m.userData.blenderMaterialName??m.name)&&h.point.z> -3.18&&h.point.z< -3.1495;});if(hit&&!hit.object.userData.solidAssemblyPart)protrudingOldBeams.push({x,y,name:hit.object.name,z:hit.point.z});}const oldOverlays=[];root.traverse(o=>{if(/_Levelled$/.test(o.name))oldOverlays.push(o.name);});
 const moves=v.mode==='archviz'?[-2.9,3].map(x=>v.cameraMoveAllowed(new Vec(0,1.65,0),new Vec(x,1.65,0))):null;
 return {mode:v.mode,assemblies,bands,oldOverlays,protrudingOldBeams,seamComparisons,maxSeamError,moves,removedBeams:root.children.map(g=>g.userData.removedMeetingWallBeamTriangles??0).reduce((a,b)=>a+b,0),glError:v.renderer.getContext().getError()};
});
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]].filter(([name])=>wanted.includes(name))){let browser;const p={name,checks:[],orbits:[],errors:[]};report.profiles.push(p);
 try{
  browser=await engine.launch({headless:true,args:name==='chromium'&&process.platform==='win32'?['--use-angle=d3d11']:[]});const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>p.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')p.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)p.errors.push(r.status()+' '+r.url());});
  await page.goto(url+'?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
  await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,c=structuredClone(a.store.state);c.objects=[];c.wallFinishes={};c.layers.walls=true;c.layers.ceiling=false;c.layers.autoWalls=true;c.layers.grid=true;a.store.replace(c);});
  for(let i=0;i<8;i++){
   await camera(page,[Math.cos(i*Math.PI/4)*10,8,Math.sin(i*Math.PI/4)*10],[0,1.8,0],'editor');const data=await audit(page);
   for(const a of data.assemblies){assert.equal(a.visible,a.expected?a.total:0,'Partial cutaway '+a.side+' orbit'+i);assert.equal(a.badEdges.length,0);}
   p.orbits.push({i,assemblies:data.assemblies.map(({side,total,visible,expected})=>({side,total,visible,expected}))});
   if([0,1,4,5].includes(i))await screenshot(page,name+'-editor-orbit-'+i);
  }
  await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,c=structuredClone(a.store.state);c.layers.autoWalls=false;a.store.replace(c);});const full=await audit(page);for(const a of full.assemblies)assert.equal(a.visible,a.total);await screenshot(page,name+'-editor-solid-all');
  p.checks.push('Eight actual editor orbit positions atomically hide whole near walls, caps, upper bands and outlines; disabling cutaway restores all surfaces.');
  await page.evaluate(async()=>{const a=window.__ROOM_ATELIER__,v=a.view;a.setMode('archviz');v.quality.setManual('high');await v.archvizPromise;await v.tierRefresh;v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};});
  await camera(page,[6,1.65,0],[3,2.6,0],'archviz');p.high=await audit(page);assert.equal(p.high.glError,0);assert.deepEqual(p.high.moves,[false,false]);assert.equal(p.high.oldOverlays.length,0);assert(p.high.removedBeams>0,'Obsolete merged ceiling beam triangles remain');assert.deepEqual(p.high.protrudingOldBeams,[],'Old quantized beam projects in front of repaired corner');
  for(const b of p.high.bands){assert(b.point,'Missing wall at'+JSON.stringify(b));assert.equal(b.role,b.y<3?'plaster':'upper-band');}
  for(const x of [-3.05,0,3.05]){const values=p.high.bands.filter(b=>b.front&&b.x===x);assert(Math.abs(values[0].point[2]-values[1].point[2])<.0001,'Front band projects beyond plaster');}
  for(const side of ['west','east']){const values=p.high.bands.filter(b=>!b.front&&(side==='west'?b.x<0:b.x>0));assert(Math.max(...values.map(b=>b.point[0]))-Math.min(...values.map(b=>b.point[0]))<.0001,'Side wall changes plane at top');}
  for(const a of p.high.assemblies){assert.equal(a.badEdges.length,0);for(const part of a.parts.filter(p=>!p.outline)){assert.equal(part.samples,part.vertices);assert(Math.abs(part.minUv-1)<.001&&Math.abs(part.maxUv-1)<.001);for(const m of part.materials){assert(!m.lightMap&&m.continuous&&(part.role==='upper-band'||m.map)&&m.normalMap&&m.roughnessMap,'PBR or coherent irradiance missing '+part.name);assert.equal(m.id,part.role==='plaster'?'wall-painted':'metal-painted');}}}
  assert(p.high.seamComparisons>100);assert(p.high.maxSeamError<1e-6);
  p.checks.push('Actual production shells stay closed through4.32m, with a flush3m plaster/dark split on both hall sides and front corners; original overhangs removed.');
  p.checks.push('All repaired surfaces keep real Quixel map/normal textures at1m UV scale and one continuous world-space irradiance field; shared mesh-boundary samples agree.');
  for(const [label,eye,target]of cameras){await camera(page,eye,target,'archviz');await screenshot(page,name+'-'+label);}
  await page.evaluate(async()=>{const v=window.__ROOM_ATELIER__.view;v.quality.setManual('medium');await v.tierRefresh;v.quality.setManual('high');await v.tierRefresh;});const refreshed=await audit(page);assert.equal(refreshed.glError,0);assert(refreshed.maxSeamError<1e-6);for(const a of refreshed.assemblies)for(const part of a.parts.filter(p=>!p.outline))assert(part.materials.every(m=>m.continuous&&!m.lightMap));
  p.checks.push('Medium→High material refresh preserves continuous irradiance, textures and stable lighting.');assert.deepEqual(p.errors,[]);p.status='passed';console.log('PASS',name,p.checks.length,'wall regression checks');
 }catch(e){p.status='failed';p.failure=e.stack??String(e);report.errors.push({name,error:p.failure});console.error(p.failure);}finally{await browser?.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
}
report.status=report.errors.length?'failed':'passed';report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
