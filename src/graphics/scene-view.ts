import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { StableSSRPass as SSRPass } from './stable-ssr';
import { Architecture, assetUrl } from './architecture';
import { BakedProbes } from './probes';
import { AdaptiveQuality, type QualitySettings } from '../quality';
import { configureSpace,getPlacementRoom,getPlacementSurfaces } from '../core/space';
import type { SceneConfig, SceneObject, AppMode, Vec3 } from '../core/types';
import { getAsset,getVariant,getMaterial } from '../catalog/catalog';
import { createAssetObject,disposeAssetObject } from '../catalog/geometry';
import { MaterialLibrary, type MaterialLease } from '../assets/materials';
import { validatePlacement,snapPosition,snapAngle,wallAnchor,footprint,rectanglesOverlap } from '../core/placement';
import { DirectLighting } from './direct-lighting';
import { FirstPersonNavigation } from './first-person';
import { architectureCollisionMeshes,architectureMoveAllowed } from './navigation';

export interface ViewCallbacks {
 select(id:string|null):void;door():void;change(object:SceneObject):void;begin():void;end():void;
 status(message:string):void;quality(settings:QualitySettings,fps:number):void;launch?(point:Vec3):void;
}
interface Visual {root:THREE.Group;signature:string;leases:MaterialLease[];mode:AppMode;disposed:boolean;templateKey?:string;loadRevision?:number;}
export interface LibraryPlacementFeedback {valid:boolean;reason?:string;surface?:'floor'|'wall'|'support';}
interface LibraryPreview {original:SceneObject;candidate?:SceneObject;root:THREE.Group;outline:THREE.Box3Helper;colors:Map<THREE.MeshStandardMaterial,THREE.Color>;feedback:LibraryPlacementFeedback;}
export class SceneView {
 readonly renderer:THREE.WebGLRenderer;readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(62,1,.08,100);
 readonly architecture=new Architecture();readonly objects=new THREE.Group();readonly grid:THREE.GridHelper;
 readonly quality:AdaptiveQuality;readonly controls:OrbitControls;readonly gizmo:TransformControls;
 readonly navigation:FirstPersonNavigation;
 mode:AppMode='archviz';snap=true;gridStep=.25;angleSnap=true;freePlacement=false;tool:'select'|'move'|'rotate'='select';
 selected:string|null=null;config!:SceneConfig;ready=false;walking=false;
 private visuals=new Map<string,Visual>();private loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);private templates=new Map<string,Promise<THREE.Group>>();
 private library?:MaterialLibrary;private architectureLeases:MaterialLease[]=[];private probes=new BakedProbes();private highlight=new THREE.Box3Helper(new THREE.Box3(),0x2b7566);
 private composer:EffectComposer;private ao:SSAOPass;private aa:SMAAPass;private reflections:SSRPass;private raf=0;private last=0;private resizeObserver:ResizeObserver;
 private ray=new THREE.Raycaster();private ndc=new THREE.Vector2();private pointers=new Map<number,{x:number;y:number}>();
 private dragging?:{id:string;startX:number;startY:number;original:SceneObject;offset:THREE.Vector3;active:boolean;wall?:string;};
 private press?:{id:number;x:number;y:number;time:number;hit:string|null;door:boolean};private suppressClick=false;private internalGizmo=false;private gizmoOriginal?:SceneObject;
 private environmentReady=false;private shadowTexture:THREE.CanvasTexture;private renderCount=0;private cameraSafe=new THREE.Vector3();private archvizPromise?:Promise<void>;
 private tierRefresh:Promise<void>=Promise.resolve();private hdrTargets=false;private activeTextureTier?:string;private materialRevision=0;private modelManifest?:Promise<{assets:{assetId:string;variant:number;production:string;fallback?:string;quality?:Record<string,string>}[]}>;
 private directLighting=new DirectLighting();private shadowLight:THREE.SpotLight;private collisionMeshes:THREE.Mesh[]=[];private spaceBounds={min:new THREE.Vector3(-2.61,0,-3.15),max:new THREE.Vector3(2.61,4.32,3.15)};
 private contextMenu?:HTMLDivElement;private contextStart?:{x:number;y:number};private shadowDirty=true;
 private libraryPreview?:LibraryPreview;
 constructor(readonly host:HTMLElement,private callbacks:ViewCallbacks){
  const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
  if(!gl)throw new Error('WEBGL2_UNAVAILABLE');
  this.renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.info.autoReset=false;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.78;
  this.renderer.setClearColor('#e7e9e4');this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.type=THREE.PCFShadowMap;canvas.setAttribute('aria-label','Тривимірний простір');canvas.tabIndex=0;
  this.host.append(canvas);this.scene.add(this.architecture.root,this.objects);
  this.scene.background=new THREE.Color('#e7e9e4');
  this.grid=new THREE.GridHelper(60,240,0x8aaba0,0xd0d8d1);this.grid.position.y=.014;this.grid.name='Editor_Grid';this.scene.add(this.grid);
  const axes=new THREE.AxesHelper(.5);axes.position.set(-2.8,.02,-3.25);axes.visible=false;this.scene.add(axes);
  const ambient=new THREE.AmbientLight('#ffffff',.8);ambient.name='Editor_Ambient';ambient.visible=false;this.scene.add(ambient);
  this.highlight.visible=false;(this.highlight.material as THREE.LineBasicMaterial).depthTest=false;this.highlight.renderOrder=100;this.scene.add(this.highlight);
  this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.12;this.controls.target.set(0,.9,0);
  this.controls.enablePan=true;this.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  this.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
  this.controls.enabled=false;
  this.navigation=new FirstPersonNavigation(this.camera,canvas,(from,to)=>this.cameraMoveAllowed(from,to));this.navigation.setEnabled(true);
  this.shadowLight=new THREE.SpotLight(0xfff3df,34,10,.99,.68,2);this.shadowLight.position.set(0,3.48,-.1);this.shadowLight.target.position.set(0,0,.2);this.shadowLight.castShadow=true;
  this.shadowLight.shadow.mapSize.set(2048,2048);this.shadowLight.shadow.camera.near=.2;this.shadowLight.shadow.camera.far=9;this.shadowLight.shadow.bias=-.00008;this.shadowLight.shadow.normalBias=.012;this.shadowLight.shadow.radius=3;
  this.shadowLight.name='Room_Dynamic_Direct';this.shadowLight.visible=false;this.directLighting.group.visible=false;this.scene.add(this.directLighting.group);
  this.gizmo=new TransformControls(this.camera,canvas);this.gizmo.setSize(.75);this.scene.add(this.gizmo.getHelper());
  this.gizmo.addEventListener('dragging-changed',(e)=>{this.controls.enabled=this.mode==='editor'&&!e.value;if(e.value){this.callbacks.begin();this.gizmoOriginal=this.selectedObject()?structuredClone(this.selectedObject()!):undefined;}else{this.gizmoOriginal=undefined;this.callbacks.end();}});
  this.gizmo.addEventListener('objectChange',()=>this.onGizmo());
  this.hdrTargets=this.renderer.extensions.has('EXT_color_buffer_float');this.composer=new EffectComposer(this.renderer,new THREE.WebGLRenderTarget(1,1,{type:this.hdrTargets?THREE.HalfFloatType:THREE.UnsignedByteType}));this.composer.addPass(new RenderPass(this.scene,this.camera));
  this.ao=new SSAOPass(this.scene,this.camera,640,480);this.ao.kernelRadius=.25;this.ao.minDistance=.005;this.ao.maxDistance=.25;this.ao.enabled=false;this.composer.addPass(this.ao);
  this.reflections=new SSRPass({renderer:this.renderer,scene:this.scene,camera:this.camera,width:640,height:480,selects:[],groundReflector:null});this.reflections.opacity=.16;this.reflections.maxDistance=2.5;this.reflections.resolutionScale=.5;this.reflections.thickness=.03;this.reflections.blur=true;this.reflections.enabled=false;this.composer.addPass(this.reflections);this.composer.removePass(this.ao);this.composer.addPass(this.ao);
  const renderAo=this.ao.render.bind(this.ao);this.ao.render=(...args:Parameters<SSAOPass['render']>)=>{const hidden:THREE.Object3D[]=[];this.scene.traverseVisible(o=>{if(!(o instanceof THREE.Mesh))return;const mats=Array.isArray(o.material)?o.material:[o.material];if(o.name.startsWith('Factory_View_')||mats.some(m=>m.transparent||m.alphaTest>0)){hidden.push(o);o.visible=false;}});try{renderAo(...args);}finally{hidden.forEach(o=>o.visible=true);}};

  this.aa=new SMAAPass();this.composer.addPass(this.aa);
  const output=new OutputPass();
  // Sub-LSB display dithering prevents contour bands on broad, softly lit walls.
  // Applied after tone mapping/sRGB; stable pixels, no temporal grain or blur.
  output.material.fragmentShader=output.material.fragmentShader.replace(/}\s*$/,`
    float displayDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
    gl_FragColor.rgb += vec3(displayDither / 255.0);
  }`);
  this.composer.addPass(output);
  this.quality=new AdaptiveQuality(s=>this.applyQuality(s));
  this.shadowTexture=this.makeShadowTexture();
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
  canvas.addEventListener('pointerdown',e=>this.pointerDown(e));canvas.addEventListener('pointermove',e=>this.pointerMove(e));
  canvas.addEventListener('pointerup',e=>this.pointerUp(e));canvas.addEventListener('pointercancel',e=>this.pointerUp(e));
  canvas.addEventListener('pointerdown',e=>{this.closeContextMenu();if(e.button===2)this.contextStart={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('contextmenu',e=>this.showContextMenu(e));
  canvas.addEventListener('keydown',e=>{if(e.key==='Escape')this.closeContextMenu();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.callbacks.status('Графічний контекст призупинено. Відновлення…');});
  canvas.addEventListener('webglcontextrestored',()=>this.callbacks.status('Графіку відновлено'));
  this.resetCamera();this.resize();this.last=performance.now();this.raf=requestAnimationFrame(t=>this.frame(t));
 }
 async init(progress:(text:string)=>void){
  await this.architecture.load(this.renderer,progress);this.ready=true;
  if(this.architecture.space){configureSpace(this.architecture.space);this.configureFloorGrid(this.architecture.space.bounds);this.spaceBounds={min:new THREE.Vector3(...this.architecture.space.bounds.min),max:new THREE.Vector3(...this.architecture.space.bounds.max)};if(this.mode==='editor')this.resetCamera();}
  if(this.mode==='archviz')await this.ensureArchViz(progress);
  this.architecture.setMode(this.mode);this.sync(this.config);this.applyQuality(this.quality.settings);this.resize();
 }
 private configureFloorGrid(bounds:{min:[number,number,number];max:[number,number,number]}){
  const positions:number[]=[],colors:number[]=[];const add=(x:number,z:number,x2:number,z2:number,major:boolean)=>{positions.push(x,0,z,x2,0,z2);const c=new THREE.Color(major?'#94aa9c':'#cad8ca');for(let i=0;i<2;i++)colors.push(c.r,c.g,c.b);};
  for(let x=Math.ceil(bounds.min[0]*4)/4;x<=bounds.max[0];x+=.25)add(x,bounds.min[2],x,bounds.max[2],Math.abs(x-Math.round(x))<.01);
  for(let z=Math.ceil(bounds.min[2]*4)/4;z<=bounds.max[2];z+=.25)add(bounds.min[0],z,bounds.max[0],z,Math.abs(z-Math.round(z))<.01);
  this.grid.geometry.dispose();this.grid.geometry=new THREE.BufferGeometry();this.grid.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.grid.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 }
 private ensureArchViz(progress:(text:string)=>void=()=>{}){return this.archvizPromise??=(async()=>{
  await Promise.all([this.architecture.ensureProduction(this.renderer,progress),this.probes.load(),this.directLighting.load(),this.architecture.addWindowBackdrops()]);
  if(this.architecture.environment){this.scene.environment=this.architecture.environment;this.scene.environmentIntensity=.3;}
  await this.architecture.setQuality(this.quality.settings.level);await this.prepareArchitectureMaterials();this.updateCollisionMeshes();this.updateBackdrop();
  const reflectors:THREE.Mesh[]=[];this.architecture.production.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.archCategory==='floor')reflectors.push(o);});this.reflections.selects=reflectors;
  for(const obj of this.config?.objects??[]){const v=this.visuals.get(obj.id);if(v&&v.mode==='archviz')await this.loadProduction(v,obj);}this.environmentReady=true;this.directLighting.group.visible=this.mode==='archviz';this.shadowDirty=true;this.activeTextureTier=this.quality.settings.level;
 })();}
 private async prepareArchitectureMaterials(){
  this.library??=new MaterialLibrary(this.renderer);this.library.configureModelLoader(this.loader);
  const revision=++this.materialRevision,leases:MaterialLease[]=[];const oldLeases=this.architectureLeases;this.architectureLeases=leases;const oldMaterials:THREE.Material[]=[];
  const jobs:Promise<void>[]=[];
  this.architecture.production.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const originals=Array.isArray(o.material)?o.material:[o.material];
   jobs.push((async()=>{const updated:THREE.Material[]=[];
    for(const original of originals){
     if(!(original instanceof THREE.MeshStandardMaterial)){updated.push(original);continue;}
     const name=String(original.userData.blenderMaterialName??original.name);if(original.userData.runtimeMaterial)oldMaterials.push(original);
     if(/05_WINDOW_FRAMES|ELECTRICAL_DETAIL_White_(Housing|Rim|Recess|Conduit)|Data_Insert_Light_Grey/.test(name)){
      const mat=new THREE.MeshStandardMaterial({color:/Data_Insert/.test(name)?'#dedfd9':'#eeeee6',roughness:.52,metalness:.03,lightMap:original.lightMap,lightMapIntensity:original.lightMapIntensity});updated.push(mat);continue;
     }
     if(/06_WINDOW_PANES/.test(name)){
      const mat=new THREE.MeshPhysicalMaterial({color:'#e3ece9',roughness:.055,metalness:0,transmission:.16,thickness:.008,ior:1.5,transparent:true,opacity:.2,envMapIntensity:1.2,depthWrite:false});updated.push(mat);continue;
     }
     if(/07_CEILING|08_CEILING|03_DOOR_LEAVES|04_DOOR_FRAMES|09_LIGHT_BODIES|12_FIXTURES|13_SKIRTING|14_HANDLES|DOOR_HARDWARE|DOOR_LOCK|16_DESK_TOPS|17_DESK_FRAMES|18_DRAWER|19_DESK/.test(name)){
      const lease=await this.library!.acquire('metal-painted',this.quality.settings.level,{metersPerUv:1,normalStrength:.045,anisotropy:this.quality.settings.anisotropy});const mat=lease.material;
      mat.color.copy(original.color);if(/07_CEILING|08_CEILING/.test(name))mat.color.set('#22272a');if(/03_DOOR_LEAVES/.test(name))mat.color.set('#555b60');if(/13_SKIRTING/.test(name))mat.color.set('#777e80');
      if(/14_HANDLES|DOOR_LOCK/.test(name))mat.metalnessMap=null;mat.roughness=/14_HANDLES|DOOR_LOCK/.test(name)?.3:/16_DESK/.test(name)?.58:.76;mat.metalness=/14_HANDLES|DOOR_LOCK/.test(name)?.7:.07;mat.envMapIntensity=/07_CEILING|08_CEILING/.test(name)?.09:.45;
      mat.lightMap=original.lightMap;mat.lightMapIntensity=original.lightMapIntensity;if(o.userData.interactiveDoor||!mat.lightMap)this.probes.apply(mat,o.userData.interactiveDoor?new THREE.Vector3(1.9,1,-2.9):new THREE.Vector3(0,1,0));leases.push(lease);updated.push(mat);continue;
     }
     const role=await this.library!.materialIdForName(name);
     if(!role){const copy=original.clone();if(o.userData.interactiveDoor||!original.lightMap)this.probes.apply(copy,o.userData.interactiveDoor?new THREE.Vector3(1.9,1,-2.9):new THREE.Vector3(0,1,0));updated.push(copy);continue;}
     const lease=await this.library!.acquire(role,this.quality.settings.level,{metersPerUv:1,normalStrength:role==='wall-painted'?.06:role==='floor-commercial-grey'?.12:.23,anisotropy:this.quality.settings.anisotropy});
     lease.material.lightMap=original.lightMap;lease.material.lightMapIntensity=original.lightMapIntensity;
     lease.material.envMapIntensity=role==='metal-painted'?.28:.12;
     if(role==='metal-painted')lease.material.color.copy(original.color);
     if(role==='floor-commercial-grey'){lease.material.color.set('#aeb3b3');lease.material.metalnessMap=null;lease.material.metalness=0;lease.material.envMapIntensity=.09;}
     if(o.userData.interactiveDoor)this.probes.apply(lease.material,new THREE.Vector3(1.9,1,-2.9));
     else if(!original.lightMap)this.probes.apply(lease.material,new THREE.Vector3(0,1,0));
     leases.push(lease);updated.push(lease.material);
    }for(let i=0;i<updated.length;i++){const m=updated[i],source=originals[i];m.side=source.side;m.userData.blenderMaterialName=source.userData.blenderMaterialName??source.name;m.userData.runtimeMaterial=true;if(/07_CEILING/.test(m.userData.blenderMaterialName))m.side=THREE.DoubleSide;}if(revision===this.materialRevision)o.material=Array.isArray(o.material)?updated:updated[0];
   })().catch(e=>console.warn('PBR material fallback',e)));
  });
  await Promise.all(jobs);if(revision===this.materialRevision){oldLeases.forEach(l=>l.release());oldMaterials.forEach(m=>m.dispose());this.architecture.applyGlassReflections();}
 }
 private updateBackdrop(){this.scene.background=this.mode==='archviz'&&this.architecture.backdrop?this.architecture.backdrop:new THREE.Color('#e7e9e4');this.scene.backgroundRotation.y=-Math.PI/2;this.scene.backgroundIntensity=.85;}
 private refreshTextureTier(){this.activeTextureTier=this.quality.settings.level;const refresh=async()=>{await this.architecture.setQuality(this.quality.settings.level);await this.prepareArchitectureMaterials();for(const object of this.config.objects){const v=this.visuals.get(object.id);if(v?.mode==='archviz')await this.loadProduction(v,object);}this.updateBackdrop();};return this.tierRefresh=this.tierRefresh.then(refresh,refresh);}
 sync(config:SceneConfig){
  if(!config)return;this.config=config;this.shadowDirty=true;
  const ids=new Set(config.objects.filter(o=>o.variant>0).map(o=>o.id));
  for(const [id,visual]of this.visuals)if(!ids.has(id)){this.removeVisual(visual);this.visuals.delete(id);}
  for(const obj of config.objects){if(obj.variant===0)continue;const signature=`${obj.assetId}:${obj.variant}:${obj.material}:${this.mode}`;let visual=this.visuals.get(obj.id);
   if(visual?.signature!==signature){if(visual)this.removeVisual(visual);visual=this.createVisual(obj,signature);this.visuals.set(obj.id,visual);}
   visual.root.position.set(...obj.position);visual.root.rotation.y=obj.rotation;
   const category=getAsset(obj.assetId).category;visual.root.visible=(category==='plants'?config.layers.plants:['wallDecor','signage','clocks','boards','acoustic'].includes(category)?config.layers.wallDecor:['accessories','rugs','lighting'].includes(category)?config.layers.decor:config.layers.furniture)||this.mode==='archviz';
   visual.root.traverse(o=>{if(o instanceof THREE.Mesh){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)this.probes.update(m,new THREE.Vector3(...obj.position).add(new THREE.Vector3(0,.65,0)));}});
  }
  this.architecture.setDoor(config.doorOpen);this.grid.visible=this.mode==='editor'&&config.layers.grid;this.architecture.setLayers(config.layers,this.camera);this.updateSelection();
 }
 private createVisual(object:SceneObject,signature:string):Visual{
  const root=createAssetObject(object.assetId,object.variant,object.material,this.mode);root.name=object.id;root.userData.instanceId=object.id;
  root.traverse(child=>child.userData.instanceId=object.id);this.objects.add(root);
  const visual:Visual={root,signature,leases:[],mode:this.mode,disposed:false};
  if(this.mode==='archviz'){

   if(this.environmentReady)void this.loadProduction(visual,object);
  }
  return visual;
 }
 private async loadProduction(visual:Visual,object:SceneObject){
  const revision=(visual.loadRevision??0)+1;visual.loadRevision=revision;const pendingLeases:MaterialLease[]=[];
  const id=`${object.assetId}-${object.variant}`,level=this.quality.settings.level,key=`${id}:${level}`;let promise=this.templates.get(key);this.library??=new MaterialLibrary(this.renderer);this.library.configureModelLoader(this.loader);
  if(!promise){promise=(async()=>{const manifest=await(this.modelManifest??=fetch(assetUrl('assets/models/manifest.json')).then(r=>r.json()));const entry=manifest.assets.find((a:{assetId:string;variant:number})=>a.assetId===object.assetId&&a.variant===object.variant);const path=entry?.quality?.[level]??entry?.production??`assets/models/${id}.glb`;try{return(await this.loader.loadAsync(assetUrl(path))).scene;}catch(e){if(entry?.fallback)return(await this.loader.loadAsync(assetUrl(entry.fallback))).scene;throw e;}})();this.templates.set(key,promise);}
  try{
   const template=await promise;if(visual.disposed||visual.loadRevision!==revision)return;
   const model=template.clone(true);const selected=getMaterial(object.assetId,object.material),defaultFinish=getAsset(object.assetId).materials[0];
   const leases=pendingLeases;const jobs:Promise<void>[]=[];this.library??=new MaterialLibrary(this.renderer);this.library.configureModelLoader(this.loader);
   this.shadowDirty=true;model.traverse(o=>{o.userData.instanceId=object.id;if(!(o instanceof THREE.Mesh))return;o.userData.sharedGeometry=true;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=true;
    const originals=Array.isArray(o.material)?o.material:[o.material];
    jobs.push((async()=>{const mats:THREE.Material[]=[];
     for(const raw of originals){const original=raw as THREE.MeshStandardMaterial;const isFinish=original.userData.colorVariant===defaultFinish.id&&original.userData.surface===defaultFinish.surface;
      const surface=isFinish?selected.surface:original.userData.surface as string|undefined;const effectiveColor=isFinish?selected.color:'#'+original.color.getHexString();
      const role=surface==='fabric'||surface==='rug'?'fabric-woven':surface==='wood'?'wood-oak':surface==='metal'?'metal-painted':undefined;
      let mat:THREE.MeshStandardMaterial;
      if(original.userData.sourcePbr){mat=original.clone();mat.userData.owned=true;if(original.userData.tintable&&isFinish)mat.color.set(effectiveColor);}
      else if(role){const lease=await this.library!.acquire(role,this.quality.settings.level,{color:effectiveColor,metersPerUv:1,anisotropy:this.quality.settings.anisotropy,normalStrength:surface==='fabric'?.14:surface==='wood'?.1:.2});if(visual.disposed){lease.release();return;}leases.push(lease);mat=lease.material;}
      else{mat=original.clone();if(isFinish)mat.color.set(effectiveColor);mat.userData.owned=true;}
      if(mat.alphaTest>0)mat.alphaToCoverage=this.quality.settings.level==='high';mat.envMapIntensity=.5;this.probes.apply(mat,new THREE.Vector3(...object.position).add(new THREE.Vector3(0,.65,0)));mats.push(mat);
     }o.material=Array.isArray(o.material)?mats:mats[0];
    })());
   });await Promise.all(jobs);if(visual.disposed||visual.loadRevision!==revision){leases.forEach(l=>l.release());return;}
   // Swap only when the complete active asset and its materials are ready.
   for(const child of [...visual.root.children]){if(child.userData.contactShadow)continue;visual.root.remove(child);child.traverse(o=>{if(o instanceof THREE.Mesh){if(!o.userData.sharedGeometry)o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.owned)m.dispose();}});}
   visual.leases.forEach(l=>l.release());visual.leases=leases;visual.templateKey=key;visual.root.add(model);this.shadowDirty=true;this.updateSelection();this.trimTemplateCache();
  }catch(e){pendingLeases.forEach(l=>l.release());this.templates.delete(key);console.warn('Generated production mesh retained',key,e);}
 }
 private trimTemplateCache(){if(this.templates.size<=20)return;const active=new Set([...this.visuals.values()].map(v=>v.templateKey));for(const[key,promise]of this.templates){if(this.templates.size<=16)break;if(active.has(key))continue;this.templates.delete(key);void promise.then(root=>root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value instanceof THREE.Texture)value.dispose();m.dispose();}}}));}}
 private removeVisual(visual:Visual){visual.disposed=true;visual.leases.forEach(l=>l.release());this.objects.remove(visual.root);visual.root.traverse(o=>{if(o instanceof THREE.Mesh){if(!o.userData.sharedGeometry)o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.owned)m.dispose();}});}
 private makeShadowTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d')!;const gradient=c.createRadialGradient(32,32,2,32,32,31);gradient.addColorStop(0,'rgba(0,0,0,0.23)');gradient.addColorStop(.55,'rgba(0,0,0,0.10)');gradient.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=gradient;c.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;}
 private addContactShadow(root:THREE.Group,object:SceneObject){const a=getAsset(object.assetId);if(a.placement!=='floor'||a.collision==='accessory'||a.collision==='cover')return;const[w,,d]=getVariant(object.assetId,object.variant).dimensions;const m=new THREE.Mesh(new THREE.PlaneGeometry(w*1.2,d*1.2),new THREE.MeshBasicMaterial({map:this.shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));m.rotation.x=-Math.PI/2;m.position.y=.009;m.userData.contactShadow=true;root.add(m);}
 setMode(mode:AppMode){if(mode!=='editor')this.cancelLibraryPlacement();if(this.mode===mode)return;this.mode=mode;this.updateBackdrop();this.architecture.setMode(mode);if(mode==='archviz'&&this.ready)void this.ensureArchViz(t=>this.callbacks.status(t)).catch(e=>this.callbacks.status(e.message));this.scene.getObjectByName('Editor_Ambient')!.visible=mode==='editor';this.directLighting.group.visible=mode==='archviz'&&this.environmentReady;this.navigation.setEnabled(mode==='archviz');this.controls.enabled=mode==='editor';this.grid.visible=mode==='editor'&&this.config?.layers.grid;this.renderer.toneMappingExposure=mode==='editor'?1:.78;this.controls.maxPolarAngle=mode==='editor'?Math.PI*.44:Math.PI*.94;this.controls.minPolarAngle=mode==='editor'?.25:.08;this.controls.minDistance=mode==='editor'?3:.45;this.controls.maxDistance=mode==='editor'?95:40;this.resetCamera();if(this.config)this.sync(this.config);this.updateSelection();}
 resetCamera(){if(this.mode==='editor'){const span=this.spaceBounds.max.x-this.spaceBounds.min.x;if(span>10){const cx=(this.spaceBounds.min.x+this.spaceBounds.max.x)/2;this.camera.position.set(cx+8,24,-26);this.controls.target.set(cx,.4,0);}else{this.camera.position.set(7.2,9.7,-8);this.controls.target.set(0,.4,0);}}else{this.camera.position.set(1.92,1.65,-2.28);this.controls.target.set(-.3,1.08,.5);}this.cameraSafe.copy(this.camera.position);this.camera.lookAt(this.controls.target);if(this.mode==='editor')this.controls.update();this.navigation?.syncFromCamera();}
 focus(){const object=this.selectedObject();if(!object){this.resetCamera();return;}const p=new THREE.Vector3(...object.position);if(this.mode==='editor'){this.controls.target.copy(p).add(new THREE.Vector3(0,.4,0));this.camera.position.copy(p).add(new THREE.Vector3(4.6,6.5,-5));}else{const d=getVariant(object.assetId,object.variant).dimensions;this.controls.target.copy(p).add(new THREE.Vector3(0,getAsset(object.assetId).placement==='wall'?0:d[1]/2,0));let eye:THREE.Vector3|undefined;for(let i=0;i<12;i++){const angle=i*Math.PI/6,candidate=new THREE.Vector3(p.x+Math.sin(angle)*2.1,1.65,p.z-Math.cos(angle)*2.1);if(!this.cameraAllowed(candidate))continue;const direction=this.controls.target.clone().sub(candidate),distance=direction.length();const ray=new THREE.Raycaster(candidate,direction.normalize(),0,Math.max(.1,distance-.1));if(ray.intersectObjects(this.collisionMeshes,false).some(hit=>hit.object.visible))continue;eye=candidate;break;}if(!eye){this.callbacks.status('Для цього предмета немає вільного ракурсу');return;}this.camera.position.copy(eye);this.keepCameraSafe();}if(this.mode==='editor')this.controls.update();else{this.camera.lookAt(this.controls.target);this.navigation.syncFromCamera();}}
 setSelected(id:string|null){this.selected=id;this.updateSelection();}
 selectedObject(){return this.config?.objects.find(o=>o.id===this.selected);}
 setTool(tool:'select'|'move'|'rotate'){this.tool=tool;this.updateSelection();}
 private updateSelection(){
  const visual=this.selected?this.visuals.get(this.selected):undefined;const object=this.selectedObject();
  if(!visual||!object){this.highlight.visible=false;this.gizmo.detach();return;}
  this.highlight.box.setFromObject(visual.root);this.highlight.visible=this.mode==='editor';
  if(this.mode==='editor'&&this.tool!=='select'&&getAsset(object.assetId).placement==='floor'&&matchMedia('(pointer:fine)').matches){this.gizmo.attach(visual.root);this.gizmo.setMode(this.tool==='rotate'?'rotate':'translate');this.gizmo.showX=this.tool==='move';this.gizmo.showZ=this.tool==='move';this.gizmo.showY=this.tool==='rotate';this.gizmo.setTranslationSnap(this.snap?this.gridStep:null);this.gizmo.setRotationSnap(this.angleSnap?Math.PI/12:null);}
  else this.gizmo.detach();
 }
 private onGizmo(){if(this.internalGizmo||!this.selected||this.mode!=='editor')return;const visual=this.visuals.get(this.selected),object=this.selectedObject();if(!visual||!object)return;
  const candidate={...object,position:visual.root.position.toArray() as Vec3,rotation:visual.root.rotation.y};candidate.position[1]=object.position[1];
  const valid=validatePlacement(candidate,this.config.objects,getPlacementRoom(candidate),{freePlacement:this.freePlacement});
  if(valid.valid)this.callbacks.change(candidate);else{this.callbacks.status(valid.reason??'Неприпустиме положення');this.internalGizmo=true;visual.root.position.set(...object.position);visual.root.rotation.y=object.rotation;this.internalGizmo=false;}this.highlight.box.setFromObject(visual.root);
 }
 beginLibraryPlacement(assetId:string,clientX:number,clientY:number,modifiers:{altKey?:boolean;shiftKey?:boolean}={}):LibraryPlacementFeedback {
  this.cancelLibraryPlacement();this.closeContextMenu();
  const asset=getAsset(assetId),variant=asset.variants.find(v=>v.index>0)!;
  const original:SceneObject={id:`${assetId}-${crypto.randomUUID()}`,assetId,variant:variant.index,material:asset.materials[0].id,position:[0,0,0],rotation:0};
  const root=createAssetObject(assetId,variant.index,original.material,'editor');root.name='Library_Placement_Preview';root.visible=false;root.userData.libraryPreview=true;
  const colors=new Map<THREE.MeshStandardMaterial,THREE.Color>();root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;node.castShadow=false;node.receiveShadow=false;for(const raw of Array.isArray(node.material)?node.material:[node.material]){const material=raw as THREE.MeshStandardMaterial;if(material.color)colors.set(material,material.color.clone());material.transparent=true;material.opacity=.64;material.depthWrite=false;}});
  const outline=new THREE.Box3Helper(new THREE.Box3(),0x2b8064);outline.name='Library_Placement_Outline';outline.visible=false;outline.renderOrder=30;(outline.material as THREE.LineBasicMaterial).depthTest=false;
  this.scene.add(root,outline);this.libraryPreview={original,root,outline,colors,feedback:{valid:false,reason:'Перетягніть предмет у 3D-простір'}};
  this.controls.enabled=false;this.gizmo.detach();this.highlight.visible=false;this.press=undefined;this.pointers.clear();
  return this.updateLibraryPlacement(clientX,clientY,modifiers);
 }
 updateLibraryPlacement(clientX:number,clientY:number,modifiers:{altKey?:boolean;shiftKey?:boolean}={}):LibraryPlacementFeedback {
  const preview=this.libraryPreview;if(!preview)return {valid:false,reason:'Перетягніть картку з бібліотеки'};
  const visible=(object:THREE.Object3D)=>{for(let node:THREE.Object3D|null=object;node;node=node.parent)if(!node.visible)return false;return true;};
  const fail=(reason:string,candidate?:SceneObject,surface?:LibraryPlacementFeedback['surface'])=>{
   preview.candidate=candidate;preview.feedback={valid:false,reason,surface};this.showLibraryPreview(preview);return preview.feedback;
  };
  const canvas=this.renderer.domElement,rect=canvas.getBoundingClientRect();
  if(this.mode!=='editor'||clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom||document.elementFromPoint(clientX,clientY)!==canvas)return fail('Перетягніть предмет у 3D-простір');
  this.camera.updateMatrixWorld();this.ndc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.ndc,this.camera);this.ray.far=Infinity;
  const asset=getAsset(preview.original.assetId),variant=getVariant(asset.id,preview.original.variant),step=modifiers.shiftKey?.05:this.gridStep,snapping=this.snap&&!modifiers.altKey;
  const architectureMeshes:THREE.Mesh[]=[];this.architecture.editor.traverse(node=>{if(node instanceof THREE.Mesh&&visible(node))architectureMeshes.push(node);});
  const floorHit=()=>this.ray.intersectObjects(architectureMeshes.filter(mesh=>mesh.userData.archCategory==='floor'),false)[0];
  let candidate:SceneObject,surface:NonNullable<LibraryPlacementFeedback['surface']>;
  if(asset.placement==='wall'){
   const blockers=architectureMeshes.filter(mesh=>['walls','doors','windows','columns','structure'].includes(String(mesh.userData.archCategory)));
   const hit=this.ray.intersectObjects(blockers,false)[0];
   if(!hit)return fail('Потягніть настінний предмет на видиму стіну');
   const category=String(hit.object.userData.archCategory);
   if(category!=='walls')return fail(category==='windows'?'Вікно має залишатися вільним':category==='doors'?'Двері мають залишатися вільними':'Оберіть поверхню стіни');
   const normal=hit.face?.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
   if(!normal||Math.abs(normal.y)>.25)return fail('Оберіть вертикальну поверхню стіни');
   let node:THREE.Object3D|null=hit.object,sourceId:string|undefined;while(node&&!sourceId){const match=/Wall_(\d+)_Clean/.exec(node.name);if(match)sourceId=`wall-${match[1]}`;node=node.parent;}
   const surfaces=getPlacementSurfaces().filter(w=>{
    const distance=Math.abs((w.axis==='x'?hit.point.x:hit.point.z)-w.coordinate),along=w.axis==='x'?hit.point.z:hit.point.x;
    return distance<.2&&along>=w.min-.02&&along<=w.max+.02&&normal.dot(new THREE.Vector3(...w.normal))>.5;
   }).sort((a,b)=>{
    const score=(w:typeof a)=>Math.abs((w.axis==='x'?hit.point.x:hit.point.z)-w.coordinate)-(w.id===sourceId ? .015 : 0);
    return score(a)-score(b);
   });
   const wall=surfaces[0];if(!wall)return fail('Ця поверхня не підтримує настінне кріплення');
   const along=wall.axis==='x'?hit.point.z:hit.point.x,height=hit.point.y,room=getPlacementRoom({position:hit.point.toArray() as Vec3,wallId:wall.id});
   candidate={...preview.original,...wallAnchor(wall.id,snapping?Math.round(along/step)*step:along,snapping?Math.round(height/step)*step:height,variant.dimensions[2],room)};surface='wall';
  }else if(asset.collision==='accessory'){
   const supportMeshes:THREE.Mesh[]=[];this.objects.traverse(node=>{if(node instanceof THREE.Mesh&&!node.userData.contactShadow&&visible(node)){const object=this.config.objects.find(o=>o.id===node.userData.instanceId);if(object&&['tables','work','storage'].includes(getAsset(object.assetId).category))supportMeshes.push(node);}});
   const hit=this.ray.intersectObjects(supportMeshes,false).find(hit=>{
    const support=this.config.objects.find(o=>o.id===hit.object.userData.instanceId)!;const top=support.position[1]+getVariant(support.assetId,support.variant).dimensions[1];const normal=hit.face?.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    return normal&&normal.y>.6&&Math.abs(hit.point.y-top)<.045;
   });
   if(!hit){const floor=floorHit();if(!floor)return fail('Для аксесуара потрібна стільниця або верх тумби');const p=snapPosition(floor.point.toArray() as Vec3,step,snapping);p[1]=floor.point.y;return fail('Для аксесуара потрібна стільниця або верх тумби',{...preview.original,position:p},'floor');}
   const support=this.config.objects.find(o=>o.id===hit.object.userData.instanceId)!,top=support.position[1]+getVariant(support.assetId,support.variant).dimensions[1],p=snapPosition([hit.point.x,top,hit.point.z],step,snapping);p[1]=top;candidate={...preview.original,position:p};surface='support';
  }else{
   const hit=floorHit();if(!hit)return fail('Оберіть підлогу наявного простору');
   const p=snapPosition(hit.point.toArray() as Vec3,step,snapping);p[1]=hit.point.y;candidate={...preview.original,position:p};surface='floor';
  }
  const result=validatePlacement(candidate,this.config.objects,getPlacementRoom(candidate),{freePlacement:this.freePlacement});preview.candidate=candidate;preview.feedback={...result,surface,reason:result.valid?'Відпустіть, щоб поставити':result.reason};this.showLibraryPreview(preview);return preview.feedback;
 }
 private showLibraryPreview(preview:LibraryPreview){
  const valid=preview.feedback.valid;this.renderer.domElement.dataset.libraryPlacement=valid?'valid':'invalid';
  preview.root.visible=!!preview.candidate;preview.outline.visible=!!preview.candidate;
  if(preview.candidate){preview.root.position.set(...preview.candidate.position);preview.root.rotation.y=preview.candidate.rotation;preview.root.updateMatrixWorld(true);preview.outline.box.setFromObject(preview.root);}
  (preview.outline.material as THREE.LineBasicMaterial).color.set(valid?0x2b8064:0xc24e3d);for(const[material,color]of preview.colors)material.color.copy(color).lerp(new THREE.Color(valid?0x518b68:0xc95c4b),valid?.12:.48);
 }
 getLibraryPlacement(){const preview=this.libraryPreview;return preview?{object:preview.candidate?structuredClone(preview.candidate):undefined,...preview.feedback}:null;}
 finishLibraryPlacement():SceneObject|undefined {const preview=this.libraryPreview,candidate=preview?.feedback.valid&&preview.candidate?structuredClone(preview.candidate):undefined;this.cancelLibraryPlacement();return candidate;}
 cancelLibraryPlacement(){const preview=this.libraryPreview;this.libraryPreview=undefined;if(!preview)return;preview.root.removeFromParent();disposeAssetObject(preview.root);preview.outline.removeFromParent();preview.outline.geometry.dispose();(preview.outline.material as THREE.Material).dispose();delete this.renderer.domElement.dataset.libraryPlacement;this.controls.enabled=this.mode==='editor';this.updateSelection();}
 private pointerRay(e:PointerEvent){const rect=this.renderer.domElement.getBoundingClientRect();if(document.pointerLockElement===this.renderer.domElement)this.ndc.set(0,0);else this.ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.ndc,this.camera);}
 private closeContextMenu(){this.contextMenu?.remove();this.contextMenu=undefined;}
 private showContextMenu(e:MouseEvent){
  e.preventDefault();this.closeContextMenu();if(this.mode!=='editor'||!this.ready)return;
  if(this.contextStart&&Math.hypot(e.clientX-this.contextStart.x,e.clientY-this.contextStart.y)>6)return;
  const rect=this.renderer.domElement.getBoundingClientRect();this.ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.ndc,this.camera);
  const floors:THREE.Mesh[]=[];this.architecture.editor.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.archCategory==='floor')floors.push(o);});
  const hit=this.ray.intersectObjects(floors,false)[0];if(!hit){this.callbacks.status('Оберіть точку на підлозі простору');return;}
  const point=hit.point.toArray() as Vec3;const menu=document.createElement('div');menu.className='viewport-context-menu';menu.setAttribute('role','menu');
  const button=document.createElement('button');button.type='button';button.dataset.testid='launch-archviz-here';button.setAttribute('role','menuitem');button.textContent='Запустити ArchViz тут';
  button.addEventListener('click',()=>{this.closeContextMenu();this.callbacks.launch?.(point);});button.addEventListener('keydown',e=>{if(e.key==='Escape'){this.closeContextMenu();this.renderer.domElement.focus();}});
  menu.append(button);this.host.append(menu);menu.style.left=`${Math.max(8,Math.min(e.clientX-rect.left,rect.width-226))}px`;menu.style.top=`${Math.max(8,Math.min(e.clientY-rect.top,rect.height-54))}px`;this.contextMenu=menu;button.focus();
 }
 async enterAt(point:Vec3){
  await this.ensureArchViz(t=>this.callbacks.status(t));this.updateCollisionMeshes();
  const destination=new THREE.Vector3(point[0],point[1]+1.65,point[2]);
  const directions=[new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)];
  const clearanceRay=new THREE.Raycaster();clearanceRay.far=.18;
  const clear=(p:THREE.Vector3)=>this.cameraAllowed(p)&&directions.every(d=>{clearanceRay.set(p,d);return!clearanceRay.intersectObjects(this.collisionMeshes,false).length;});
  if(!clear(destination)){this.callbacks.status('Точка надто близько до стіни чи дверей. Оберіть вільну точку на підлозі.');return false;}
  const direction=new THREE.Vector3();this.camera.getWorldDirection(direction);direction.y=0;if(direction.lengthSq()<.1)direction.set(0,0,1);direction.normalize();
  this.camera.position.copy(destination);this.camera.lookAt(destination.clone().add(direction));this.controls.target.copy(destination).add(direction);this.cameraSafe.copy(destination);this.navigation.syncFromCamera();this.ray.far=Infinity;
  this.callbacks.status('ArchViz запущено з вибраної точки');return true;
 }
 private pick(e:PointerEvent){this.pointerRay(e);const hits=this.ray.intersectObjects([this.objects,this.architecture.root],true);for(const h of hits){if(!h.object.visible||h.object.userData.contactShadow)continue;let p:THREE.Object3D|null=h.object,visible=true;while(p){if(!p.visible)visible=false;p=p.parent;}if(!visible)continue;const id=h.object.userData.instanceId as string|undefined;if(id)return{id,door:false};if(h.object.userData.interactiveDoor)return{id:null,door:true};return{id:null,door:false};}return{id:null,door:false};}
 private pointerDown(e:PointerEvent){if(e.button!==0)return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.pointers.size>1){if(this.dragging?.active)this.callbacks.end();this.dragging=undefined;this.controls.enabled=true;this.press=undefined;return;}if(this.gizmo.dragging||this.gizmo.axis)return;
  const hit=this.pick(e);this.press={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),hit:hit.id,door:hit.door};
  if(this.mode==='editor'&&hit.id&&hit.id===this.selected){const original=this.selectedObject();if(original){this.pointerRay(e);const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-original.position[1]);const p=this.ray.ray.intersectPlane(plane,new THREE.Vector3());this.dragging={id:hit.id,startX:e.clientX,startY:e.clientY,original:structuredClone(original),offset:p?p.sub(new THREE.Vector3(...original.position)):new THREE.Vector3(),active:false,wall:original.wallId};this.controls.enabled=false;}}
 }
 private pointerMove(e:PointerEvent){if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const drag=this.dragging;if(!drag||this.pointers.size!==1||this.mode!=='editor')return;
  const distance=Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY);if(distance<5&&!drag.active)return;
  if(!drag.active){drag.active=true;this.suppressClick=true;this.callbacks.begin();}
  this.pointerRay(e);const asset=getAsset(drag.original.assetId);let candidate:SceneObject;
  if(asset.placement==='wall'){
   const room=getPlacementRoom(drag.original),wall=room.walls.find(w=>w.id===drag.wall)!;const n=new THREE.Vector3(...wall.normal);const plane=new THREE.Plane(n,-wall.coordinate*(wall.axis==='x'?n.x:n.z));const p=this.ray.ray.intersectPlane(plane,new THREE.Vector3());if(!p)return;
   const along=wall.axis==='x'?p.z:p.x;const height=p.y;const anchored=wallAnchor(wall.id,this.snap?Math.round(along/this.gridStep)*this.gridStep:along,this.snap?Math.round(height/this.gridStep)*this.gridStep:height,getVariant(asset.id,drag.original.variant).dimensions[2],room);candidate={...drag.original,...anchored};
  }else if(asset.collision==='accessory'){
   const supports=this.ray.intersectObject(this.objects,true).filter(hit=>{const id=hit.object.userData.instanceId;if(!id||id===drag.id||hit.object.userData.contactShadow)return false;const support=this.config.objects.find(o=>o.id===id);return support&&['tables','work','storage'].includes(getAsset(support.assetId).category);});
   const hit=supports[0];if(!hit){this.callbacks.status('Для аксесуара потрібна поверхня столу або тумби');return;}
   const support=this.config.objects.find(o=>o.id===hit.object.userData.instanceId)!;const p=snapPosition([hit.point.x,support.position[1]+getVariant(support.assetId,support.variant).dimensions[1],hit.point.z],e.shiftKey?.05:this.gridStep,this.snap&&!e.altKey);p[1]=support.position[1]+getVariant(support.assetId,support.variant).dimensions[1];candidate={...drag.original,position:p};
  }else{
   const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-drag.original.position[1]);const p=this.ray.ray.intersectPlane(plane,new THREE.Vector3());if(!p)return;p.sub(drag.offset);const pos=snapPosition(p.toArray() as Vec3,e.shiftKey?.05:this.gridStep,this.snap&&!e.altKey);pos[1]=drag.original.position[1];candidate={...drag.original,position:pos};
  }
  const result=validatePlacement(candidate,this.config.objects,getPlacementRoom(candidate),{freePlacement:this.freePlacement});(this.highlight.material as THREE.LineBasicMaterial).color.set(result.valid?0x2b7566:0xc95c4b);
  if(result.valid)this.callbacks.change(candidate);else this.callbacks.status(result.reason??'Тут предмет не вміщується');
 }
 private pointerUp(e:PointerEvent){this.pointers.delete(e.pointerId);if(this.dragging?.active){this.callbacks.end();this.dragging=undefined;this.controls.enabled=this.mode==='editor';this.press=undefined;this.suppressClick=false;return;}this.dragging=undefined;this.controls.enabled=this.mode==='editor';
  const p=this.press;this.press=undefined;if(!p||this.suppressClick){this.suppressClick=false;return;}
  if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>7||performance.now()-p.time>650)return;
  if(p.door){this.callbacks.door();return;}this.callbacks.select(p.hit);
 }
 rotateSelected(delta:number){const obj=this.selectedObject();if(!obj||getAsset(obj.assetId).placement==='wall')return;const candidate={...obj,rotation:snapAngle(obj.rotation+delta,15,this.angleSnap)};const v=validatePlacement(candidate,this.config.objects,getPlacementRoom(candidate),{freePlacement:this.freePlacement});if(v.valid)this.callbacks.change(candidate);else this.callbacks.status(v.reason??'Поворот неможливий');}
 moveSelected(dx:number,dz:number){const obj=this.selectedObject();if(!obj)return;let candidate:SceneObject;if(getAsset(obj.assetId).placement==='wall'){const room=getPlacementRoom(obj),wall=room.walls.find(w=>w.id===obj.wallId)!;const along=(wall.axis==='x'?obj.position[2]:obj.position[0])+dx;candidate={...obj,...wallAnchor(wall.id,along,obj.position[1]+dz,getVariant(obj.assetId,obj.variant).dimensions[2],room)};}else candidate={...obj,position:[obj.position[0]+dx,obj.position[1],obj.position[2]+dz]};const v=validatePlacement(candidate,this.config.objects,getPlacementRoom(candidate),{freePlacement:this.freePlacement});if(v.valid)this.callbacks.change(candidate);else this.callbacks.status(v.reason??'Переміщення неможливе');}
 walk(direction:'forward'|'back'|'left'|'right'){
  const look=this.controls.target.clone().sub(this.camera.position);look.y=0;look.normalize();const right=new THREE.Vector3().crossVectors(look,new THREE.Vector3(0,1,0));const step=direction==='forward'?look:direction==='back'?look.negate():direction==='right'?right:right.negate();step.multiplyScalar(.35);const p=this.camera.position.clone().add(step);if(this.cameraMoveAllowed(this.camera.position,p)){this.camera.position.copy(p);this.controls.target.add(step);this.cameraSafe.copy(p);}else this.callbacks.status('Тут стіна, вікно або двері');
 }
 private cameraAllowed(p:THREE.Vector3){const b=this.spaceBounds;return p.x>b.min.x+.12&&p.x<b.max.x-.12&&p.z>b.min.z+.12&&p.z<b.max.z-.12&&p.y>=.22&&p.y<b.max.y-.13;}
 private updateCollisionMeshes(){this.collisionMeshes=architectureCollisionMeshes(this.architecture.production);}
 private cameraMoveAllowed(from:THREE.Vector3,to:THREE.Vector3){return this.cameraAllowed(to)&&architectureMoveAllowed(this.collisionMeshes,from,to);}
 private keepCameraSafe(){if(this.mode!=='archviz')return;this.camera.position.y=THREE.MathUtils.clamp(this.camera.position.y,.22,this.spaceBounds.max.y-.13);this.cameraSafe.copy(this.camera.position);}
 private applyQuality(settings:QualitySettings){this.shadowDirty=true;if(this.environmentReady&&this.activeTextureTier!==settings.level)void this.refreshTextureTier().catch(e=>console.warn('Texture tier fallback',e));this.renderer.setPixelRatio(settings.dpr*settings.scale);this.composer.setPixelRatio(settings.dpr*settings.scale);this.ao.enabled=this.hdrTargets&&settings.ao&&this.mode==='archviz';this.aa.enabled=settings.level!=='low';this.renderer.shadowMap.enabled=settings.shadows;this.shadowLight.castShadow=settings.shadows;const samples=settings.level==='high'?Math.min(4,this.renderer.capabilities.maxSamples):settings.level==='medium'?2:0;for(const target of [this.composer.renderTarget1,this.composer.renderTarget2])if(target.samples!==samples){target.dispose();target.samples=samples;}this.resize();this.callbacks.quality(settings,this.quality.fps);}
 private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);this.composer.setSize(w,h);}
 private frame(now:number){this.raf=requestAnimationFrame(t=>this.frame(t));const dt=Math.min(.06,(now-this.last)/1000);this.last=now;if(this.mode==='archviz'&&this.environmentReady)this.quality.tick(now);if(this.mode==='editor')this.controls.update();else{this.navigation.update(dt);if(this.directLighting.update(this.camera,this.quality.settings)||this.directLighting.needsShadowRender)this.shadowDirty=true;}this.keepCameraSafe();if(this.ready&&this.config){const doorAngle=this.architecture.door?.rotation.y;this.architecture.animate(dt);if(doorAngle!==this.architecture.door?.rotation.y)this.shadowDirty=true;this.architecture.setLayers(this.config.layers,this.camera);}this.ao.enabled=this.hdrTargets&&this.quality.settings.ao&&this.mode==='archviz';
  this.reflections.enabled=this.hdrTargets&&this.mode==='archviz'&&this.quality.settings.level==='high';this.renderer.info.reset();this.renderer.shadowMap.needsUpdate=this.mode==='archviz'&&this.quality.settings.shadows&&this.shadowDirty;if(this.mode==='editor')this.renderer.render(this.scene,this.camera);else{this.composer.render(dt);this.shadowDirty=false;}
  if(++this.renderCount%60===0)this.callbacks.quality(this.quality.settings,this.quality.fps);
 }
 getStats(){return{fps:this.quality.fps,quality:this.quality.settings,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures};}
 dispose(){this.cancelLibraryPlacement();cancelAnimationFrame(this.raf);this.resizeObserver.disconnect();this.controls.dispose();this.gizmo.dispose();this.visuals.forEach(v=>this.removeVisual(v));this.library?.dispose();this.architectureLeases.forEach(l=>l.release());this.shadowTexture.dispose();this.directLighting.dispose();this.renderer.dispose();this.composer.dispose();}
}
