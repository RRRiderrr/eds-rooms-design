import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { TextureQuality } from '../assets/materials';
import type { LayerVisibility, AppMode } from '../core/types';
export const assetUrl=(path:string)=>new URL(import.meta.env.BASE_URL+path.replace(/^\.\//,'').replace(/^\//,''),document.baseURI).href;
export interface NodeMetadata {name:string;category:string;wallId?:string;lightmapped?:boolean;}
export interface ArchitectureManifest {
 id:string;dimensions:{width:number;depth:number;height:number};nodes:NodeMetadata[];
 door:{node:string;hinge:[number,number,number];closedAngle:number;openAngle:number;width:number;height:number;leafNames:string[];frameNames:string[]};
 walls:{id:string;axis:'x'|'z';coordinate:number;normal:[number,number,number]}[];
 lightmap?:unknown;
}
export interface SpaceManifest {schemaVersion:1;floorAreaSquareMeters?:number;lighting?:{qualities?:Record<TextureQuality,string>};bounds:{min:[number,number,number];max:[number,number,number]};nodes:NodeMetadata[];walls:ArchitectureManifest['walls'];}
interface PanoramaManifest {projection:'equirectangular';qualities:Record<TextureQuality,{hdr:string;fallback:string}>;}
export class Architecture {
  root=new THREE.Group();editor=new THREE.Group();production=new THREE.Group();manifest!:ArchitectureManifest;
  door?:THREE.Object3D;editorDoor?:THREE.Object3D;lightmap?:THREE.Texture;environment?:THREE.Texture;
  space?:SpaceManifest;spaceLightmap?:THREE.Texture;backdrop?:THREE.Texture;backdropEnvironment?:THREE.Texture;
  private roomGroup?:THREE.Group;private spaceGroup?:THREE.Group;private quality:TextureQuality='medium';private tierRevision=0;private loadedTier?:TextureQuality;private maxTextureSize=4096;
  private panoramaManifest?:Promise<PanoramaManifest>;
  private renderer?:THREE.WebGLRenderer;private backdropReflectionTarget?:THREE.WebGLRenderTarget;
  private categories=new Map<THREE.Object3D,NodeMetadata>();private doorTarget=0;private mode:AppMode='archviz';private productionPromise?:Promise<void>;
  async load(renderer:THREE.WebGLRenderer,progress:(text:string)=>void) {
    this.renderer=renderer;this.maxTextureSize=renderer.capabilities.maxTextureSize;this.root.name='Architecture_Protected';this.root.userData.protected=true;
    this.manifest=await fetch(assetUrl('assets/architecture/room.json')).then(r=>{if(!r.ok)throw new Error('Не знайдено експорт простору Blender');return r.json();});
    this.space=await fetch(assetUrl('assets/architecture/scene-space.json')).then(r=>r.json());
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    progress('Завантажуємо справжню архітектуру');
    const [editor,space]=await Promise.all([loader.loadAsync(assetUrl('assets/architecture/room-editor.meshopt.glb')),loader.loadAsync(assetUrl('assets/architecture/space-editor.meshopt.glb'))]);
    this.editor.add(editor.scene,space.scene);this.root.add(this.production,this.editor);
    this.decorate(editor.scene);this.decorate(space.scene,this.space!.nodes);
    this.editorDoor=this.editor.getObjectByName(this.manifest.door.node);
    this.editorDoor?.traverse(o=>{o.userData.interactiveDoor=true;});
    this.setMode(this.mode);
  }
  private decorate(group:THREE.Group,nodes=this.manifest.nodes){
      group.traverse(o=>{
        o.userData.protected=true;
        const meta=nodes.find(n=>n.name===o.name)||nodes.find(n=>o.name.startsWith(n.name+'_'));
        const inherited=meta??(o.parent?this.categories.get(o.parent):undefined);if(inherited){this.categories.set(o,inherited);o.userData.archCategory=inherited.category;}
        if(o instanceof THREE.Mesh){o.frustumCulled=true;o.receiveShadow=true;o.castShadow=inherited?['walls','doors','structure','columns','existingFurniture'].includes(inherited.category):false;
          if(this.editor===group||group.parent===this.editor){const mats=Array.isArray(o.material)?o.material:[o.material];o.material=mats.map(m=>{const name=m.name;const color=/06_WINDOW_PANES/.test(name)?'#8fb6bd':/03_DOOR|04_DOOR/.test(name)?'#78958c':/02_FLOOR/.test(name)?'#edf1e9':/01_WALLS|15_WALLS/.test(name)?'#c5d2c7':/05_WINDOW/.test(name)?'#f8faf3':/08_CEILING|12_FIXTURES|17_DESK/.test(name)?'#617d7d':/16_DESK/.test(name)?'#dcd7c4':'#9cafaa';return new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide});});if(o.material.length===1)o.material=o.material[0];
           if(['walls','doors','floor','structure','existingFurniture','windows'].includes(inherited?.category??'')){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,30),new THREE.LineBasicMaterial({color:'#839a8e',transparent:true,opacity:.42}));edges.name='Editor_Architectural_Edges';edges.userData.protected=true;edges.raycast=()=>{};o.add(edges);}
          }
          else {const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(m instanceof THREE.MeshStandardMaterial){m.envMapIntensity=.25;m.roughness=Math.max(.18,m.roughness);}}}
        }
      });
  }
  ensureProduction(renderer:THREE.WebGLRenderer,progress:(text:string)=>void){return this.productionPromise??=this.loadProduction(renderer,progress);}
  private async loadProduction(renderer:THREE.WebGLRenderer,progress:(text:string)=>void){
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [arch,space]=await Promise.all([loader.loadAsync(assetUrl('assets/architecture/room.meshopt.glb')),loader.loadAsync(assetUrl('assets/architecture/space.meshopt.glb'))]);this.roomGroup=arch.scene;this.spaceGroup=space.scene;this.production.add(arch.scene,space.scene);this.decorate(arch.scene);this.decorate(space.scene,this.space!.nodes);
    this.door=this.production.getObjectByName(this.manifest.door.node);
    for(const d of [this.door,this.editorDoor])d?.traverse(o=>{o.userData.interactiveDoor=true;});
    progress('Підключаємо розраховане освітлення');
    const hdr=new HDRLoader();
    try{
      this.lightmap=await hdr.loadAsync(assetUrl('assets/architecture/lightmap.hdr'));
      this.lightmap.flipY=false;this.lightmap.channel=1;this.lightmap.colorSpace=THREE.LinearSRGBColorSpace;
      arch.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const meta=this.categories.get(o);if(!meta?.lightmapped)return;
        const mats=Array.isArray(o.material)?o.material:[o.material];
        for(let i=0;i<mats.length;i++){const mat=mats[i].clone();if(mat instanceof THREE.MeshStandardMaterial){mat.lightMap=this.lightmap!;mat.lightMapIntensity=1;mat.envMapIntensity=.12;}mats[i]=mat;}
        o.material=Array.isArray(o.material)?mats:mats[0];
      });
    }catch(e){console.warn('Baked lightmap load failed',e);throw new Error('Не вдалося завантажити розраховане освітлення. Перевірте assets/architecture/lightmap.hdr.');}
    try{if(!renderer.extensions.has('EXT_color_buffer_float'))throw new Error('HDR reflection target unavailable');const texture=await hdr.loadAsync(assetUrl('assets/architecture/environment.hdr'));texture.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(renderer);this.environment=pmrem.fromEquirectangular(texture).texture;texture.dispose();pmrem.dispose();}catch{this.environment=undefined;}
    await this.setQuality(this.quality);this.setMode(this.mode);
  }
  async setQuality(quality:TextureQuality){
    this.quality=quality;if(!this.spaceGroup||this.loadedTier===quality)return;const revision=++this.tierRevision;
    const hdr=new HDRLoader();const tier=quality==='high'&&this.maxTextureSize<4096?'medium':quality;const path=this.space?.lighting?.qualities?.[tier];
    const [atlas,backdrop]=await Promise.all([path?hdr.loadAsync(assetUrl(path)):Promise.resolve(undefined),this.loadPanorama(tier)]);
    if(revision!==this.tierRevision){atlas?.dispose();backdrop?.dispose();return;}
    if(atlas){atlas.flipY=false;atlas.channel=1;atlas.colorSpace=THREE.LinearSRGBColorSpace;const old=this.spaceLightmap;this.spaceLightmap=atlas;this.spaceGroup.traverse(o=>{if(!(o instanceof THREE.Mesh)||!this.categories.get(o)?.lightmapped)return;for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat instanceof THREE.MeshStandardMaterial){mat.lightMap=atlas;mat.lightMapIntensity=1;mat.needsUpdate=true;}});old?.dispose();}
    this.loadedTier=quality;if(backdrop){backdrop.mapping=THREE.EquirectangularReflectionMapping;const old=this.backdrop;this.backdrop=backdrop;this.prepareGlassEnvironment();old?.dispose();}
  }
  private prepareGlassEnvironment(){
    const renderer=this.renderer;if(!renderer||!this.backdrop)return;
    let target:THREE.WebGLRenderTarget|undefined;
    if(renderer.extensions.has('EXT_color_buffer_float')){
      const pmrem=new THREE.PMREMGenerator(renderer);
      try{target=pmrem.fromEquirectangular(this.backdrop);}
      catch(error){console.warn('Factory glass reflection target unavailable',error);}
      finally{pmrem.dispose();}
    }
    const previous=this.backdropReflectionTarget;this.backdropReflectionTarget=target;this.backdropEnvironment=target?.texture;
    this.applyGlassReflections();previous?.dispose();
  }
  /** Call after a material-tier refresh; only window panes receive the hall PMREM.
   * Indoor furniture/probes and the baked room environment are deliberately separate. */
  applyGlassReflections(){
    const environment=this.backdropEnvironment??this.environment;
    this.production.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        const name=String(material.userData.blenderMaterialName??material.name);
        if(!/^06_WINDOW_PANES/.test(name)||!(material instanceof THREE.MeshStandardMaterial))continue;
        material.envMap=environment??null;material.envMapIntensity=this.backdropEnvironment?.9:.4;
        material.envMapRotation.y=-Math.PI/2;material.roughness=.065;material.metalness=0;
        if(material instanceof THREE.MeshPhysicalMaterial){material.ior=1.5;material.reflectivity=.5;material.thickness=.006;}
        material.needsUpdate=true;
      }
    });
  }
  private async loadPanorama(quality:TextureQuality):Promise<THREE.Texture|undefined>{
    try{
      const manifest=await(this.panoramaManifest??=fetch(assetUrl('assets/environment/factory-panorama.json')).then(r=>{if(!r.ok)throw new Error('Factory panorama manifest unavailable');return r.json();}));
      const tier=manifest.qualities[quality];
      // RGBE stores a linearised generated LDR image; room GI remains independently baked.
      let texture:THREE.Texture;
      try{texture=await new HDRLoader().loadAsync(assetUrl(tier.hdr));texture.colorSpace=THREE.LinearSRGBColorSpace;}
      catch{texture=await new THREE.TextureLoader().loadAsync(assetUrl(tier.fallback));texture.colorSpace=THREE.SRGBColorSpace;}
      texture.mapping=THREE.EquirectangularReflectionMapping;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
      texture.userData={...texture.userData,environmentId:'factory-panorama-generated-v1',projection:manifest.projection,sourceRadiometry:'generated LDR, not measured HDR'};
      return texture;
    }catch(error){console.warn('Factory 360 background unavailable',error);return undefined;}
  }
  async addWindowBackdrops(){
    // Keep the existing public hook compatible. A full-sphere Scene.background now
    // supplies the hall through every window; perspective planes would occlude it.
    for(const object of [...this.production.children])if(object.name.startsWith('Factory_View_')){this.production.remove(object);if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}}
  }
  getMetadata(object:THREE.Object3D){return this.categories.get(object);}
  setDoor(open:boolean){this.doorTarget=this.manifest?(open?this.manifest.door.openAngle:this.manifest.door.closedAngle):0;}
  animate(dt:number){for(const door of [this.door,this.editorDoor])if(door)door.rotation.y=THREE.MathUtils.damp(door.rotation.y,this.doorTarget,8,dt);}
  setMode(mode:AppMode){this.mode=mode;this.production.visible=mode==='archviz';this.editor.visible=mode==='editor';}
  setLayers(layers:LayerVisibility,camera:THREE.Camera){
    const editor=this.mode==='editor';
    const group=editor?this.editor:this.production;
    group.traverse(o=>{
      const meta=this.categories.get(o);if(!meta)return;
      const category=meta.category.toLowerCase();let visible=true;
      if(category.includes('ceiling')||category.includes('hvac')||category.includes('lighting'))visible=!editor||layers.ceiling;
      else if(category.includes('door'))visible=!editor||layers.doors;
      else if(category.includes('window'))visible=!editor||layers.windows;
      else if(category.includes('column')||category.includes('structure'))visible=!editor||layers.structure;
      else if(category.includes('wall')||category.includes('skirting')){
        visible=!editor||layers.walls;
        if(editor&&layers.autoWalls&&visible&&meta.wallId){const wall=[...this.manifest.walls,...(this.space?.walls??[])].find(w=>w.id===meta.wallId);if(wall){const v=wall.axis==='x'?camera.position.x-wall.coordinate:camera.position.z-wall.coordinate;const normal=wall.axis==='x'?wall.normal[0]:wall.normal[2];if(v*normal<0)visible=false;}}
      }
      o.visible=visible;
    });
  }
}
