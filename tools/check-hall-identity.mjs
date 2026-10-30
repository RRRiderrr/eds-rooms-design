import './browser-path.mjs';
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const url=process.argv.find(value=>value.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const output=path.resolve(import.meta.dirname,'../test-results/hall-identity');
await mkdir(output,{recursive:true});
const report={url,startedAt:new Date().toISOString(),profiles:[],errors:[]};
const state=page=>page.evaluate(()=>structuredClone(window.__ROOM_ATELIER__.store.state));
const ready=page=>page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
const identityIds=['edsTimeline','edsUkraine','wallClock'];
const stockPlaqueLabel=id=>{const number=id.match(/^hall-door-(\d+)-plaque$/)?.[1];return number==='14'?'Вихід':['10','15'].includes(number)?'WC':number;};
const metricSystems=['insert-cards','magnetic-digits','e-ink','insert-cards','e-ink','insert-cards','magnetic-digits','e-ink'];
const shipmentValues=['186','124','58','24','37'];
const loaded=page=>page.waitForFunction(()=>{
 const a=window.__ROOM_ATELIER__,objects=a.store.state.objects.filter(o=>o.variant>0&&['edsTimeline','edsUkraine','wallClock','doorPlaque'].includes(o.assetId));
 return objects.filter(o=>['edsTimeline','edsUkraine','wallClock'].includes(o.assetId)).length===3&&objects.every(o=>a.view.visuals.get(o.id)?.templateKey?.endsWith(':high'));
},null,{timeout:120000});
const content=s=>({objects:s.objects,wallFinishes:s.wallFinishes,doorOpen:s.doorOpen,regionPresets:s.regionPresets});
const saveDraft=page=>page.waitForTimeout(750);

async function captureObject(page,objectId,file){
 await page.evaluate(id=>{
  const a=window.__ROOM_ATELIER__,v=a.view,o=a.store.state.objects.find(item=>item.id===id),Vec=v.camera.position.constructor;
  const dims=o.assetId==='edsTimeline'?[1.68,1.82,.035]:o.assetId==='edsUkraine'?[3.2,1.32,.04]:[1.25,1.25,.035];
  const centre=new Vec(...o.position),normal=new Vec(Math.sin(o.rotation),0,Math.cos(o.rotation));
  v.camera.fov=48;v.camera.updateProjectionMatrix();
  const distance=Math.max(dims[1]/(2*Math.tan(24*Math.PI/180)),dims[0]/(2*Math.tan(24*Math.PI/180)*v.camera.aspect))*1.27;
  v.camera.position.copy(centre).addScaledVector(normal,distance);v.camera.lookAt(centre);v.camera.updateMatrixWorld();v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};v.shadowDirty=true;
 },objectId);
 await page.waitForTimeout(350);await page.screenshot({path:path.join(output,file)});
}

async function captureMetricDetail(page,objectId,moduleIndex,file){
 await page.evaluate(({objectId,moduleIndex})=>{
  const a=window.__ROOM_ATELIER__,v=a.view,visual=v.visuals.get(objectId),Vec=v.camera.position.constructor;let root;
  visual.root.traverse(node=>{if(!root&&Array.isArray(node.userData.replaceableMetrics))root=node;});if(!root)throw new Error('Exported metric module metadata absent');
  const module=root.userData.replaceableMetrics[moduleIndex],centre=new Vec(module.x+module.width/2,module.y+module.height*.45,.0188).applyMatrix4(root.matrixWorld),normal=new Vec(0,0,1).transformDirection(root.matrixWorld);
  const distance=Math.max(module.height*3,module.width*1.45/v.camera.aspect)/(2*Math.tan(24*Math.PI/180));
  v.camera.fov=48;v.camera.updateProjectionMatrix();v.camera.position.copy(centre).addScaledVector(normal,distance);v.camera.lookAt(centre);v.camera.updateMatrixWorld();v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};v.shadowDirty=true;
 },{objectId,moduleIndex});
 await page.waitForTimeout(350);await page.screenshot({path:path.join(output,file)});
}

for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
 const profile={name,checks:[],presets:[],screenshots:[],requests:[],errors:[]};report.profiles.push(profile);let browser;
 try{
  browser=await engine.launch({headless:true,args:engine===chromium&&process.platform==='win32'?['--use-angle=d3d11']:[]});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
  page.on('pageerror',error=>profile.errors.push({kind:'page',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')profile.errors.push({kind:'console',message:message.text()});});
  page.on('response',response=>{if(response.status()>=400)profile.errors.push({kind:'http',url:response.url(),status:response.status()});if(/\.glb(?:\?|$)/.test(response.url()))profile.requests.push(response.url());});
  await page.goto(url+'?mode=editor');await ready(page);await page.getByTestId('region-hall').click();
  await page.getByRole('combobox',{name:'Якість графіки'}).selectOption('high');await page.getByRole('button',{name:'ArchViz',exact:true}).click();
  await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading')&&window.__ROOM_ATELIER__.getMode()==='archviz',null,{timeout:180000});await page.evaluate(async()=>{const v=window.__ROOM_ATELIER__.view;await v.tierRefresh;v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};});
  for(let index=0;index<8;index++){
   await page.getByTestId('preset-select').selectOption('hall-preset-'+index);await loaded(page);
   const metrics=await page.evaluate(async()=>{
    const a=window.__ROOM_ATELIER__,v=a.view,Vec=v.camera.position.constructor,Box=v.highlight.box.constructor,Ray=v.ray.constructor;
    const manifest=await(await fetch(new URL('assets/models/manifest.json',location.href))).json(),objects=[],plaques=[];
    for(const o of a.store.state.objects.filter(o=>o.variant>0&&['edsTimeline','edsUkraine','wallClock'].includes(o.assetId))){
     const visual=v.visuals.get(o.id),entry=manifest.assets.find(item=>item.assetId===o.assetId&&item.variant===o.variant),bounds=new Box(),meshes=[],hands=[];let metricRoot=null;visual.root.updateMatrixWorld(true);
     visual.root.traverse(mesh=>{
      if(Array.isArray(mesh.userData.replaceableMetrics)&&!metricRoot)metricRoot=mesh;
      if(mesh.userData.clockHand)hands.push({kind:mesh.userData.clockHand,rotation:mesh.rotation.z});
      if(!mesh.isMesh||mesh.userData.contactShadow)return;bounds.union(new Box().setFromObject(mesh));
      const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');let normalMin=Infinity,normalMax=0,finite=true;
      for(let i=0;i<n.count;i++){const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));normalMin=Math.min(normalMin,length);normalMax=Math.max(normalMax,length);if(!Number.isFinite(length))finite=false;}
      const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(mat=>({name:mat.name,color:mat.color?.getHexString(),preserveOriginal:mat.userData.preserveOriginal,sourcePbr:mat.userData.sourcePbr,artworkRole:mat.userData.artworkRole,corporateColor:mat.userData.corporateColor,emissive:mat.emissive?.getHex(),opacity:mat.opacity,transparent:mat.transparent}));
      meshes.push({name:mesh.name,triangles:(mesh.geometry.index?.count??p.count)/3,normalMin,normalMax,finite,materials});
     });
     const proxy=(await v.loader.loadAsync(new URL(entry.proxy,location.href).href)).scene,proxyBounds=new Box().setFromObject(proxy);let proxyTriangles=0;proxy.traverse(mesh=>{if(mesh.isMesh)proxyTriangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;});
     let clockOpen=null;
     if(o.assetId==='wallClock'){
      const physical=[];visual.root.traverse(mesh=>{if(mesh.isMesh&&!mesh.userData.contactShadow)physical.push(mesh);});let clear=0,tested=0;
      for(let i=0;i<15;i++)for(let j=0;j<15;j++){
       const x=-.57+i/14*1.14,y=-.57+j/14*1.14;if(Math.hypot(x,y)<.06)continue;
       const origin=new Vec(x,y,.3).applyMatrix4(visual.root.matrixWorld),end=new Vec(x,y,-.3).applyMatrix4(visual.root.matrixWorld),delta=end.clone().sub(origin),ray=new Ray(origin,delta.clone().normalize(),0,delta.length());tested++;if(!ray.intersectObjects(physical,false).length)clear++;
      }clockOpen={clear,tested,ratio:clear/tested};
     }
     let replaceableMetrics=null;
     if(o.assetId==='edsUkraine'){
      if(!metricRoot)throw new Error('Production GLB lost physical KPI metadata');
      // Decode connected pieces from actual Meshopt-loaded triangles, not source
      // descriptions. Coincident normal/UV splits are welded only for this audit.
      function components(mesh){
       const p=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index,parents=[],coordinates=[],keys=new Map(),vertexIds=[],relative=metricRoot.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
       const find=i=>parents[i]===i?i:(parents[i]=find(parents[i]));const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parents[b]=a;};
       for(let i=0;i<p.count;i++){const xyz=new Vec(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(relative).toArray(),key=xyz.map(n=>Math.round(n*1e5)).join(',');let id=keys.get(key);if(id===undefined){id=parents.length;parents.push(id);coordinates.push(xyz);keys.set(key,id);}vertexIds.push(id);}
       const triangles=indices?indices.count:p.count;for(let i=0;i<triangles;i+=3){const ids=[0,1,2].map(k=>vertexIds[indices?indices.getX(i+k):i+k]);join(ids[0],ids[1]);join(ids[0],ids[2]);}
       const result=new Map();for(let i=0;i<parents.length;i++){const id=find(i),part=result.get(id)??{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],vertices:0,triangles:0};part.vertices++;coordinates[i].forEach((n,a)=>{part.min[a]=Math.min(part.min[a],n);part.max[a]=Math.max(part.max[a],n);});result.set(id,part);}
       for(let i=0;i<triangles;i+=3)result.get(find(vertexIds[indices?indices.getX(i):i])).triangles++;
       return [...result.values()];
      }
      const hardware=[];metricRoot.traverse(mesh=>{if(!mesh.isMesh)return;const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const mat of materials){if(String(mat.userData.artworkRole).startsWith('replaceable-'))hardware.push({role:mat.userData.artworkRole,color:mat.userData.corporateColor,emissive:mat.emissive?.getHex(),parts:components(mesh)});}});
      replaceableMetrics={system:metricRoot.userData.shipmentDisplaySystem,modules:structuredClone(metricRoot.userData.replaceableMetrics),hardware};
     }
     objects.push({object:structuredClone(o),templateKey:visual.templateKey,path:entry.quality?.high??entry.production,proxyPath:entry.proxy,dimensions:entry.dimensions,size:bounds.getSize(new Vec()).toArray(),proxySize:proxyBounds.getSize(new Vec()).toArray(),triangles:meshes.reduce((n,m)=>n+m.triangles,0),proxyTriangles,meshes,hands,clockOpen,replaceableMetrics});
    }
    for(const o of a.store.state.objects.filter(o=>o.assetId==='doorPlaque'&&o.regionId==='hall'&&o.variant>0)){
     const visual=v.visuals.get(o.id),label=visual.root.getObjectByName('DoorPlaque_Label'),mat=label?.material;
     plaques.push({id:o.id,label:o.label,templateKey:visual.templateKey,printedText:mat?.userData.printedText,printedLines:mat?.userData.printedLines,inkColor:mat?.userData.inkColor});
    }
    const hall=a.store.state.objects.filter(o=>o.regionId==='hall'&&o.variant>0),gl=v.renderer.getContext();gl.finish();
    return {presetId:a.store.state.regionPresets.hall.presetId,revision:a.store.state.hallDecorRevision,objects,plaques,otherHallSigns:hall.filter(o=>['edsSignage','sign','clock'].includes(o.assetId)&&!(o.assetId==='edsSignage'&&o.variant===6)),glError:gl.getError()};
   });
   assert.equal(metrics.revision,1);assert.equal(metrics.objects.length,3);assert.equal(metrics.otherHallSigns.length,0);assert.equal(metrics.plaques.length,14);assert.equal(metrics.glError,0);
   assert.deepEqual(metrics.objects.filter(o=>['edsTimeline','edsUkraine'].includes(o.object.assetId)).map(o=>o.object.assetId).sort(),['edsTimeline','edsUkraine']);
   for(const plaque of metrics.plaques){assert.equal(plaque.label,stockPlaqueLabel(plaque.id),JSON.stringify(plaque));assert.equal(plaque.printedText,plaque.label);assert.deepEqual(plaque.printedLines,[plaque.label]);assert(plaque.templateKey.endsWith(':high'));}
   for(const item of metrics.objects){
    assert(item.templateKey.startsWith(item.object.assetId+'-')&&item.templateKey.endsWith(':high'));assert(profile.requests.some(request=>request.endsWith('/'+item.path)),'Production GLB not requested: '+item.path);assert(profile.requests.some(request=>request.endsWith('/'+item.proxyPath)),'Proxy GLB not requested: '+item.proxyPath);
    const [w,h,d]=item.dimensions,c=Math.abs(Math.cos(item.object.rotation)),s=Math.abs(Math.sin(item.object.rotation));[w*c+d*s,h,w*s+d*c].forEach((value,axis)=>assert(Math.abs(item.size[axis]-value)<.002,'Incorrect production bounds: '+JSON.stringify(item)));[w,h,d].forEach((value,axis)=>assert(Math.abs(item.proxySize[axis]-value)<.002,'Incorrect proxy bounds: '+JSON.stringify(item)));
    assert(item.triangles>200);assert(item.proxyTriangles>0);assert(item.proxyTriangles<item.triangles,'Proxy should use less geometry');
    for(const mesh of item.meshes){assert(mesh.finite&&mesh.normalMin>.95&&mesh.normalMax<1.05,'Invalid normals');for(const mat of mesh.materials)assert(mat.preserveOriginal&&mat.sourcePbr,'Artwork or clock material lost protection: '+mat.name);}
    if(item.object.assetId==='edsUkraine'){
     const physical=item.replaceableMetrics,system=metricSystems[item.object.variant-1],role=name=>physical.hardware.filter(h=>h.role===name),parts=name=>role(name).flatMap(h=>h.parts);
     assert.equal(physical.system,system);assert.equal(physical.modules.length,5);assert.deepEqual(physical.modules.map(m=>m.value),shipmentValues);
     assert.equal(physical.modules.reduce((n,m)=>n+m.digits.length,0),12);for(const module of physical.modules){assert.equal(module.system,system);assert.equal(module.digits.map(d=>d.value).join(''),module.value);}
     const digits=system==='magnetic-digits'?parts('replaceable-magnetic-digit'):role('replaceable-print').filter(h=>h.color==='#000000').flatMap(h=>h.parts);
     assert.equal(digits.length,12,'Actual decoded geometry must contain 12 independent numeral pieces');
     const cells=physical.modules.flatMap(m=>m.digits);for(const cell of cells){const matches=digits.filter(p=>p.min[0]>=cell.x-.0001&&p.max[0]<=cell.x+cell.width+.0001&&p.min[1]>=cell.y-.0001&&p.max[1]<=cell.y+cell.height+.0001);assert.equal(matches.length,1,'A visible numeral must fit inside every independent digit cell: '+JSON.stringify({variant:item.object.variant,cell,matches}));}
     if(system==='insert-cards'){
      const cards=parts('replaceable-card');assert.equal(cards.length,12);assert(cards.every(p=>p.vertices===8&&p.triangles===12&&p.max[2]-p.min[2]>.002),'Every PVC insert must be a real closed2.2mm card');assert(parts('replaceable-rail').length>0,'Cards need retaining rails');
      const maxCard=Math.max(...cards.map(p=>p.max[2]));assert(digits.every(p=>p.min[2]>maxCard+.0001),'Digits must sit on the front of their actual PVC cards');assert(parts('replaceable-rail').some(p=>p.max[2]>maxCard),'Rail lips must retain the fronts of the inserts');
     }else if(system==='magnetic-digits'){
      assert(parts('replaceable-steel').length>=5);assert(digits.every(p=>Math.abs((p.max[2]-p.min[2])-.0017)<.0001),'Magnetic digits must have actual flat1.7mm thickness');assert.equal(parts('replaceable-card').length,0);
     }else{
      const screens=parts('replaceable-screen'),frames=parts('replaceable-frame');assert.equal(screens.length,5);assert.equal(frames.length,5);assert(role('replaceable-screen').every(h=>h.emissive===0),'E-ink screens must not emit light');
      screens.forEach(screen=>{const frame=frames.find(p=>p.min[0]<screen.min[0]-.004&&p.max[0]>screen.max[0]+.004&&p.min[1]<screen.min[1]-.003&&p.max[1]>screen.max[1]+.003);assert(frame,'Each e-ink screen requires a visible physical perimeter bezel');});assert(digits.every(p=>p.min[2]>Math.max(...screens.map(s=>s.max[2]))+.0001),'All real e-ink glyph faces must be in front of their screens');
     }
    }
    if(item.object.assetId==='wallClock'){assert.equal(item.object.wallId,'wall-12');assert(item.object.variant>=1&&item.object.variant<=6);assert.deepEqual(item.hands.map(hand=>hand.kind).filter(kind=>['hour','minute'].includes(kind)).sort(),['hour','minute']);assert(item.clockOpen.ratio>.65,'Clock has an unwanted backing disk');}
   }
   profile.presets.push(metrics);console.log('PASS',name,metrics.presetId,'two approved corporate signs, frameless clock on wall12, fourteen stock numeric/WC/exit plaques and five physically replaceable KPI modules');
   if([0,2].includes(index)){const object=metrics.objects.find(o=>o.object.assetId==='edsUkraine'),file=`${name}-metric-${index===0?'pvc-inserts':'e-ink'}-close.png`;await captureMetricDetail(page,object.object.id,2,file);profile.screenshots.push(file);}
   if([0,3,6].includes(index))for(const object of metrics.objects){const file=`${name}-hall-${index}-${object.object.assetId}.png`;await captureObject(page,object.object.id,file);profile.screenshots.push(file);}
  }
  for(const assetId of ['edsTimeline','edsUkraine'])assert.deepEqual([...new Set(profile.presets.flatMap(p=>p.objects.filter(o=>o.object.assetId===assetId).map(o=>o.object.variant)))].sort(),[1,2,3,4,5,6,7,8]);
  assert.deepEqual([...new Set(profile.presets.flatMap(p=>p.objects.filter(o=>o.object.assetId==='wallClock').map(o=>o.object.variant)))].sort(),[1,2,3,4,5,6]);
  profile.checks.push('All8 actual UI hall presets load only the two approved corporate sign families, all16 designs and six frameless clocks; source/proxy GLB paths, measured bounds, unit normals, protected palette and fourteen stock number/WC/exit prints verified. Actual decoded GLB triangles additionally prove5 replaceable KPI modules and12 independent numerals, PVC cards/rails, magnetic thickness or non-emissive e-ink screen/bezel layering in every design.');

  profile.thumbnails=await page.evaluate(async()=>{const results=[];for(const [assetId,count]of [['edsTimeline',8],['edsUkraine',8],['wallClock',6]])for(let variant=1;variant<=count;variant++){const file=`assets/thumbnails/${assetId}-${variant}.webp`,response=await fetch(new URL(file,location.href));if(!response.ok)throw new Error(file+' HTTP'+response.status);const image=await createImageBitmap(await response.blob());results.push({assetId,variant,width:image.width,height:image.height});image.close();}return results;});assert.equal(profile.thumbnails.length,22);assert(profile.thumbnails.every(image=>image.width>100&&image.height>100));profile.checks.push('All22 new actual-model catalogue previews return200 and decode as real images.');

  await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,clock=a.store.state.objects.find(o=>o.assetId==='wallClock');a.select(clock.id);});await page.getByTestId('focus').click();
  profile.clockFocus=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,v=a.view,o=a.store.state.objects.find(o=>o.assetId==='wallClock'),Vec=v.camera.position.constructor,Ray=v.ray.constructor,target=new Vec(...o.position),delta=target.clone().sub(v.camera.position),normal=new Vec(Math.sin(o.rotation),0,Math.cos(o.rotation)),ray=new Ray(v.camera.position,delta.clone().normalize(),0,delta.length()-.08);return {position:v.camera.position.toArray(),target:target.toArray(),frontDot:v.camera.position.clone().sub(target).normalize().dot(normal),occluders:ray.intersectObjects(v.collisionMeshes,false).filter(hit=>hit.object.visible).map(hit=>({name:hit.object.name,distance:hit.distance}))};});assert(profile.clockFocus.frontDot>.98,'Clock focus should face the applied numerals');assert.deepEqual(profile.clockFocus.occluders,[],'Clock focus is hidden behind architectural door/wall geometry');profile.checks.push('Actual UI Focus faces the frameless clock from its broad front, with no architectural obstruction.');

  // The hands must be live, rather than merely authored at a decorative time.
  const handAngles=()=>page.evaluate(()=>{const a=window.__ROOM_ATELIER__,o=a.store.state.objects.find(o=>o.assetId==='wallClock'),hands=[];a.view.visuals.get(o.id).root.traverse(node=>{if(node.userData.clockHand)hands.push({kind:node.userData.clockHand,angle:node.rotation.z});});return {clock:o.id,hands,now:Date.now()};});
  const firstHands=await handAngles();await page.waitForTimeout(1450);const laterHands=await handAngles();
  assert(laterHands.hands.some(hand=>Math.abs(hand.angle-firstHands.hands.find(before=>before.kind===hand.kind).angle)>1e-7),'Clock hands are not advancing');profile.clockTick={before:firstHands,after:laterHands};profile.checks.push('Production clock hand rotations advance with real device time.');

  // Original photo designs remain selectable in the library, and a new
  // sign/clock variant change stays on the same installation point.
  await page.getByRole('button',{name:'Editor',exact:true}).click();await page.getByTestId('library-tab').click();await page.getByRole('button',{name:'Вивіски',exact:true}).click();for(const assetId of ['edsSignage','edsTimeline','edsUkraine'])assert(await page.getByTestId('add-'+assetId).isVisible());
  for(const assetId of ['edsTimeline','edsUkraine','wallClock']){
   const object=(await state(page)).objects.find(o=>o.assetId===assetId);await page.evaluate(id=>window.__ROOM_ATELIER__.select(id),object.id);const variant=object.variant===4?5:4;await page.getByTestId('variant-select').selectOption(String(variant));const changed=(await state(page)).objects.find(o=>o.id===object.id);assert.equal(changed.variant,variant);assert.deepEqual(changed.position,object.position);assert.equal(changed.rotation,object.rotation);await page.getByTestId('undo').click();assert.deepEqual((await state(page)).objects.find(o=>o.id===object.id),object);
  }profile.checks.push('Original photo signs remain in the library; actual inspector changes a corporate sign and clock model in place, with oneUndo restoring each.');

  // Exercise the textarea, real export, Undo/Redo and the actual IndexedDB draft.
  await page.getByRole('button',{name:'Editor',exact:true}).click();await page.evaluate(()=>window.__ROOM_ATELIER__.select('hall-door-02-plaque'));
  const textarea=page.getByTestId('plaque-label');assert.equal(await textarea.evaluate(el=>el.tagName),'TEXTAREA');assert.equal(await textarea.getAttribute('maxlength'),'500');
  const beforeEdit=content(await state(page)),text='02\nКімната команди\n\nЗапис за попередньою домовленістю\nПонеділок — п’ятниця\n09:00–18:00\nДодаткова інформація: '+ 'Український текст і довільні символи <>&. '.repeat(5);
  assert(text.length>120&&text.length<500);await textarea.fill(text);await textarea.press('Tab');let edited=await state(page);assert.equal(edited.objects.find(o=>o.id==='hall-door-02-plaque').label,text);
  await page.getByTestId('undo').click();assert.deepEqual(content(await state(page)),beforeEdit);await page.getByTestId('redo').click();assert.equal((await state(page)).objects.find(o=>o.id==='hall-door-02-plaque').label,text);
  const downloadPromise=page.waitForEvent('download');await page.getByTestId('export').click();const download=await downloadPromise,exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.objects.find(o=>o.id==='hall-door-02-plaque').label,text);assert.equal(exported.hallDecorRevision,1);
  await page.getByTestId('import-input').setInputFiles({name:'multiline-roundtrip.archpreset.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await page.waitForFunction(()=>window.__ROOM_ATELIER__.store.state.presetId.startsWith('imported-'));assert.equal((await state(page)).objects.find(o=>o.id==='hall-door-02-plaque').label,text);assert.deepEqual((await state(page)).objects,exported.objects);const beforeReload=content(await state(page));await saveDraft(page);await page.reload();await ready(page);assert.deepEqual(content(await state(page)),beforeReload);await page.getByRole('button',{name:'Editor',exact:true}).click();await page.evaluate(()=>window.__ROOM_ATELIER__.select('hall-door-02-plaque'));assert.equal(await page.getByTestId('plaque-label').inputValue(),text);
  profile.checks.push('Actual textarea preserves more than120 characters and explicit blank paragraphs; UI commit, oneUndo/Redo, downloaded JSON, actual file-input import and IndexedDB reload preserve all furniture and finishes.');

  // Seed a pre-revision modified draft without touching the user's browser.
  const legacy=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,old=structuredClone(a.store.state);delete old.hallDecorRevision;old.modified=true;old.regionPresets.hall.modified=true;old.wallFinishes['wall-23']={color:'#a2b8fe',motif:2,accent:'#0b30c1'};old.objects=old.objects.filter(o=>!['edsTimeline','edsUkraine','wallClock'].includes(o.assetId)&&o.id!=='legacy-corporate-motif-wall-23');const previous=[['HallCorporate',2,-15.72,1.72,-5.103011505004883],['HallTimeline',1,-9.19,1.65,-5.098011505004883],['HallWorldMap',3,-3.32,1.66,-5.101511505004883],['HallSalesPlan',4,2.67,1.67,-5.095511505004883],['HallUkraine',5,8.83,1.68,-5.095511505004883]];for(const [id,variant,x,y,z]of previous)old.objects.push({id,assetId:'edsSignage',variant,material:'original',position:[x,y,z],rotation:0,wallId:'wall-38',regionId:'hall'});return old;});
  await page.evaluate(async old=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('room-atelier-session',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(old,'latest');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},legacy);
  await page.reload();await ready(page);const migrated=await state(page);assert.equal(migrated.hallDecorRevision,1);assert.equal(migrated.objects.filter(o=>['edsTimeline','edsUkraine'].includes(o.assetId)&&o.regionId==='hall').length,2);assert.equal(migrated.objects.filter(o=>o.assetId==='wallClock'&&o.regionId==='hall').length,1);assert(!migrated.objects.some(o=>o.assetId==='edsSignage'&&o.variant!==6&&o.regionId==='hall'));
  const unaffected=objects=>objects.filter(o=>!['edsTimeline','edsUkraine','wallClock','edsSignage','doorPlaque'].includes(o.assetId)&&o.id!=='legacy-corporate-motif-wall-23');assert.deepEqual(unaffected(migrated.objects),unaffected(legacy.objects));const expectedFinishes=structuredClone(legacy.wallFinishes);expectedFinishes['wall-23'].motif=0;assert.deepEqual(migrated.wallFinishes,expectedFinishes);assert.equal(migrated.objects.find(o=>o.id==='legacy-corporate-motif-wall-23')?.variant,2);assert.equal(migrated.objects.find(o=>o.id==='hall-door-02-plaque').label,'02','The one-time customer revision must start with plain numbers');assert(migrated.objects.filter(o=>o.assetId==='doorPlaque'&&o.regionId==='hall').every(o=>o.label===stockPlaqueLabel(o.id)));
  await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,id=a.store.state.objects.find(o=>o.assetId==='edsTimeline'&&o.regionId==='hall').id;a.store.remove(id);});await saveDraft(page);await page.reload();await ready(page);assert.equal((await state(page)).objects.filter(o=>o.assetId==='edsTimeline'&&o.regionId==='hall').length,0,'A deleted sign was silently resurrected');
  profile.checks.push('A pre-revision modified IndexedDB draft receives only approved hall signs/clock once; floor items and wall finishes survive, plaques start with stock numbers/WC/exit labels; deliberate deletion remains after another reload.');

  const glError=await page.evaluate(()=>{const gl=window.__ROOM_ATELIER__.view.renderer.getContext();gl.finish();return gl.getError();});assert.equal(glError,0);assert.deepEqual(profile.errors,[]);profile.status='passed';
 }catch(error){profile.status='failed';profile.failure=error.stack??String(error);report.errors.push({name,error:profile.failure});console.error(name,error);}
 finally{await browser?.close();await writeFile(path.join(output,`${name}-report.json`),JSON.stringify(profile,null,2));}
}
report.status=report.errors.length?'failed':'passed';report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;else console.log('PASS Chromium + WebKit hall identity, 16 corporate signs, frameless live clocks, numeric/WC/exit and multiline plaques; replaceable physical KPI modules, UI Undo/export/reload and preserved one-time draft revision.');
