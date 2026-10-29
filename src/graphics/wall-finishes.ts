import * as THREE from 'three';
import { getPlacementSurfaces } from '../core/space';
import { ROOM } from '../core/room';
import { getPaintableBounds, getWallPaintRect } from '../core/wall-paint';
import { getMaterial } from '../catalog/catalog';
import type { SceneConfig, SceneObject, WallFinish, WallSurface } from '../core/types';
import type { Architecture } from './architecture';
import {wallGraphicFor,sortedWallGraphics,MAX_GRAPHICS_PER_WALL} from '../core/wall-graphics';
import atlas from '../../public/assets/brand/murals/atlas.json';
import {renderPortableWallPaint,type PortableWallPaintFace} from './portable-wall-paint';

const roomIds:Record<string,string>={'wall-17':'west','wall-26':'east','wall-21':'near','wall-16':'far'};
const stripCapacity=32;
// A closed wall can carry independently ordered ink on both faces.
const graphicCapacity=MAX_GRAPHICS_PER_WALL*2;
interface FinishBinding { material:THREE.MeshStandardMaterial|THREE.MeshBasicMaterial; uniforms:Record<string,{value:any}>; graphics:THREE.DataTexture; graphicSignature?:string; portableSignature?:string; portableTexture?:THREE.CanvasTexture; paintInput?:{faces:PortableWallPaintFace[];strips:SceneObject[];graphics:SceneObject[]}; }
const rect=(id:string)=>atlas.tiles.find(t=>t.id===id)!.uvRectBottomLeft.map(n=>Number(n).toFixed(10)).join(',');
const muralDispatch=atlas.tiles.filter(t=>t.kind==='mural').map(t=>`if(index<${Number(t.index)+.5})return vec4(${rect(t.id)});`).join('');
const motifDispatch=atlas.tiles.filter(t=>t.kind==='motif').map(t=>`if(index<${Number(t.index)+.5})return vec4(${rect(t.id)});`).join('');
/** Paint is part of the actual plaster albedo. Openings, surface normals,
 * lightmaps and shadows remain those of the original measured architecture. */
export class WallFinishes {
 private bindings=new Map<THREE.Material,FinishBinding>();
 private portable=false;private maxTextureSize=4096;
 get backend(){return this.portable?'rgba-paint':'layer-table';}
 configure(renderer:THREE.WebGLRenderer){
  // A desktop-sized viewport says nothing about a phone's shader compiler.
  // Keep the same albedo on touch GPUs without the large layered paint shader.
  this.portable=(typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches)||renderer.capabilities.maxFragmentUniforms<512;
  this.maxTextureSize=Math.min(4096,renderer.capabilities.maxTextureSize);
 }
 private texture?:THREE.Texture;private loading?:Promise<void>;
 private masks=new Map<number,{width:number;height:number;alpha:Uint8Array}>();
 async load(){return this.loading??=new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}${atlas.texture}`).then(texture=>{
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.flipY=true;
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;this.texture=texture;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
  for(const tile of atlas.tiles.filter(t=>t.kind==='motif')){
   const [x,y,width,height]=tile.pixelRectTopLeft;canvas.width=width;canvas.height=height;
   ctx.clearRect(0,0,width,height);ctx.drawImage(texture.image,x,y,width,height,0,0,width,height);
   const rgba=ctx.getImageData(0,0,width,height).data,alpha=new Uint8Array(width*height);
   for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];this.masks.set(tile.index,{width,height,alpha});
  }
 }).catch(e=>console.warn('Corporate wall print unavailable',e));}
 graphicHit(variant:number,u:number,v:number):boolean{
  const mask=this.masks.get(variant);if(!mask)return true;
  const x=Math.min(mask.width-1,Math.max(0,Math.floor(u*mask.width))),y=Math.min(mask.height-1,Math.max(0,Math.floor((1-v)*mask.height)));
  return mask.alpha[y*mask.width+x]>8;
 }
 apply(architecture:Architecture,config:SceneConfig){
  architecture.root.updateMatrixWorld(true);
  const surfaces=getPlacementSurfaces();
  architecture.root.traverse(object=>{
   if(!(object instanceof THREE.Mesh)||object.userData.archCategory!=='walls')return;
   const meta=architecture.getMetadata(object);if(!meta?.wallId)return;
   const alias=roomIds[meta.wallId],wall=surfaces.find(w=>w.id===meta.wallId)??ROOM.walls.find(w=>w.id===alias);
   if(!wall)return;
   for(const raw of Array.isArray(object.material)?object.material:[object.material]){
    if(!(raw instanceof THREE.MeshStandardMaterial||raw instanceof THREE.MeshBasicMaterial))continue;
    // A wall collection can also contain steel caps, skirting or fixtures.
    const sourceName=String(raw.userData.blenderMaterialName??raw.name);
    if(!/^01_WALLS|^15_WALLS/.test(sourceName))continue;
    const binding=this.bind(raw),primaryWall=alias?ROOM.walls.find(w=>w.id===alias)!:wall;
    // The solid wall keeps both source IDs. Its retained exterior face belongs
    // to 2/19; an existing finish on the opposite skin 17/26 remains applicable
    // there until the user explicitly chooses a finish for that exterior ID.
    const outsideAlias=object.userData.solidAssemblyPart?({'wall-2':'wall-17','wall-19':'wall-26'} as Record<string,string>)[meta.wallId]:undefined;
    const finish=config.wallFinishes?.[alias??meta.wallId]??(outsideAlias?config.wallFinishes?.[outsideAlias]:undefined);
    this.update(binding,finish,primaryWall,alias?config.wallFinishes?.[meta.wallId]:undefined,wall,
     config.objects.filter(o=>o.assetId==='brandDoorPanel'&&o.variant>0&&(o.wallId===primaryWall.id||o.wallId===wall.id||o.wallId===outsideAlias)),
     config.layers.wallDecor||!architecture.editor.visible?sortedWallGraphics(config.objects).filter(o=>o.wallId===primaryWall.id||o.wallId===wall.id||o.wallId===outsideAlias):[]);
   }
  });
  const active=new Set<THREE.Material>();architecture.root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])active.add(m);});
  for(const [material,binding] of this.bindings)if(!active.has(material)){binding.graphics.dispose();binding.portableTexture?.dispose();this.bindings.delete(material);}
 }
 private bind(material:FinishBinding['material']):FinishBinding{
  const found=this.bindings.get(material);if(found)return found;
  // Plaster is dielectric. Removing its unused metal map also reserves the one
  // metadata sampler without exceeding WebGL2's minimum fragment texture budget.
  if(material instanceof THREE.MeshStandardMaterial){material.metalness=0;material.metalnessMap=null;}
  const uniforms:FinishBinding['uniforms']={};
  const graphics=new THREE.DataTexture(new Float32Array(4*4*graphicCapacity),4,graphicCapacity,THREE.RGBAFormat,THREE.FloatType);
  graphics.minFilter=graphics.magFilter=THREE.NearestFilter;graphics.generateMipmaps=false;graphics.needsUpdate=true;
  uniforms.paintGraphics={value:graphics};uniforms.paintGraphicCount={value:0};
  uniforms.paintPortable={value:null};uniforms.paintPortableEnabled={value:0};
  for(const suffix of ['A','B']){
   for(const name of ['Color','Accent','Normal'])uniforms[`paint${name}${suffix}`]={value:new THREE.Vector3()};
   for(const name of ['Enabled','Tint','Motif','Mural'])uniforms[`paint${name}${suffix}`]={value:0};
   uniforms[`paintBounds${suffix}`]={value:new THREE.Vector4()};
  }
  uniforms.paintMaskAtlas={value:this.texture??null};uniforms.paintStripCount={value:0};
  uniforms.paintStripRect={value:Array.from({length:stripCapacity},()=>new THREE.Vector4())};
  uniforms.paintStripStyle={value:Array.from({length:stripCapacity},()=>new THREE.Vector4())};
  const previous=material.onBeforeCompile.bind(material),oldKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
   previous(shader,renderer);Object.assign(shader.uniforms,uniforms);
   shader.vertexShader='varying vec3 vPaintWorld; varying vec3 vPaintNormal;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPaintWorld=(modelMatrix*vec4(transformed,1.0)).xyz; vPaintNormal=normalize(mat3(modelMatrix)*normal);');
   if(this.portable){
    shader.fragmentShader=`varying vec3 vPaintWorld; varying vec3 vPaintNormal;
uniform sampler2D paintPortable;uniform float paintPortableEnabled;
uniform vec3 paintNormalA,paintNormalB;uniform vec4 paintBoundsA,paintBoundsB;
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nif(paintPortableEnabled>.5){'+['A','B'].map((s,index)=>`{
 float along=abs(paintNormal${s}.x)>.5?vPaintWorld.z:vPaintWorld.x;
 vec2 uv=vec2((along-paintBounds${s}.x)/max(.01,paintBounds${s}.y-paintBounds${s}.x),(vPaintWorld.y-paintBounds${s}.z)/max(.01,paintBounds${s}.w-paintBounds${s}.z));
 float coverage=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0)*smoothstep(.65,.95,dot(normalize(vPaintNormal),paintNormal${s}))${index===1?'*(1.0-step(.999,dot(paintNormalA,paintNormalB)))':''};
 vec4 ink=texture2D(paintPortable,vec2(clamp(uv.x,0.0,1.0),${index===0?'.5+':''}.5*clamp(uv.y,.001,.999)));
 diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,ink.a*coverage);
}`).join('\n')+'}');
    return;
   }
   shader.fragmentShader=`varying vec3 vPaintWorld; varying vec3 vPaintNormal;
uniform sampler2D paintMaskAtlas;
uniform sampler2D paintGraphics;
uniform int paintGraphicCount;
uniform int paintStripCount;
uniform vec4 paintStripRect[${stripCapacity}],paintStripStyle[${stripCapacity}];
${['A','B'].map(s=>`uniform vec3 paintColor${s},paintAccent${s},paintNormal${s};uniform vec4 paintBounds${s};uniform float paintEnabled${s},paintTint${s},paintMotif${s},paintMural${s};`).join('\n')}
vec4 corporateTile(float index,bool mural){
 if(mural){${muralDispatch}return vec4(${rect('mural-1')});}
 ${motifDispatch}return vec4(${rect('motif-1')});
}
vec4 corporateSample(vec2 uv,float index,bool mural){
 vec4 tile=corporateTile(index,mural);
 return textureGrad(paintMaskAtlas,tile.xy+clamp(uv,vec2(.0005),vec2(.9995))*tile.zw,dFdx(uv)*tile.zw,dFdy(uv)*tile.zw);
}
float corporateMask(vec2 uv,float motif){return corporateSample(uv,motif,false).a*step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);}
float paintInside(vec4 bounds,float along){return step(bounds.x,along)*step(along,bounds.y)*step(bounds.z,vPaintWorld.y)*step(vPaintWorld.y,bounds.w);}
`+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n'+['A','B'].map(s=>`{
float sideMask=smoothstep(.65,.95,dot(normalize(vPaintNormal),paintNormal${s}))*paintEnabled${s};
float along=abs(paintNormal${s}.x)>.5?vPaintWorld.z:vPaintWorld.x;
float within=paintInside(paintBounds${s},along);
// Positive U is the observer's right on every wall face; positive V is up.
float direction=abs(paintNormal${s}.x)>.5?-paintNormal${s}.x:paintNormal${s}.z;
float u=(along-paintBounds${s}.x)/max(.01,paintBounds${s}.y-paintBounds${s}.x);if(direction<0.0)u=1.0-u;
diffuseColor.rgb=mix(diffuseColor.rgb,paintColor${s},sideMask*within*paintTint${s});
if(paintMural${s}>.5){
 vec2 fullUv=vec2(u,(vPaintWorld.y-paintBounds${s}.z)/max(.01,paintBounds${s}.w-paintBounds${s}.z));
 // Cover the light wall without stretching the supplied logo paths.
 float wallAspect=(paintBounds${s}.y-paintBounds${s}.x)/(paintBounds${s}.w-paintBounds${s}.z);
 if(wallAspect<1.777777778)fullUv.x=(fullUv.x-.5)*wallAspect/1.777777778+.5;
 else fullUv.y=(fullUv.y-.5)*1.777777778/wallAspect+.5;
 diffuseColor.rgb=mix(diffuseColor.rgb,corporateSample(fullUv,paintMural${s},true).rgb,sideMask*within);
}
float motifWidth=paintMotif${s}<1.5?min(3.24,paintBounds${s}.y-paintBounds${s}.x-.4):paintMotif${s}<2.5?2.4:1.0;
float motifHeight=paintMotif${s}<1.5?.491:paintMotif${s}<2.5?2.4:1.0;
float motifBottom=paintMotif${s}<1.5?min(2.72,paintBounds${s}.w-.55):paintMotif${s}<2.5?.72:2.0;
vec2 motifUv=vec2((u-.5)*(paintBounds${s}.y-paintBounds${s}.x)/motifWidth+.5,(vPaintWorld.y-motifBottom)/motifHeight);
float motifAlpha=paintMotif${s}>.5?corporateMask(motifUv,paintMotif${s}):0.0;
diffuseColor.rgb=mix(diffuseColor.rgb,paintAccent${s},sideMask*within*motifAlpha*.88);
}`).join('\n')+`
for(int i=0;i<${stripCapacity};i++){
 if(i>=paintStripCount)break;
 vec4 area=paintStripRect[i],style=paintStripStyle[i];
 float along=abs(paintNormalA.x)>.5?vPaintWorld.z:vPaintWorld.x;
 float sideMask=smoothstep(.65,.95,dot(normalize(vPaintNormal),paintNormalA)*sign(style.w));
 float coverage=paintInside(area,along)*sideMask;
 vec2 stripUv=vec2((along-area.x)/max(.01,area.y-area.x),(vPaintWorld.y-area.z)/max(.01,area.w-area.z));
 float direction=abs(paintNormalA.x)>.5?-paintNormalA.x:paintNormalA.z;
 if(direction*sign(style.w)<0.0)stripUv.x=1.0-stripUv.x;
 // The chamfer is a painted cut in the silhouette, not raised geometry.
 if(abs(style.w)>1.5&&abs(style.w)<2.5)coverage*=step(stripUv.y,1.0-max(0.0,stripUv.x-.58)*.075);
 vec3 stripColor=style.rgb;
 if(abs(style.w)>2.5){float motif=corporateMask(vec2(stripUv.x,stripUv.y*8.0),3.0);stripColor=mix(stripColor,stripColor*.62,motif*.55);}
 diffuseColor.rgb=mix(diffuseColor.rgb,stripColor,coverage);
}
for(int i=0;i<${graphicCapacity};i++){
 if(i>=paintGraphicCount)break;
 vec4 rect=texelFetch(paintGraphics,ivec2(0,i),0),style=texelFetch(paintGraphics,ivec2(1,i),0);
 vec4 ink=texelFetch(paintGraphics,ivec2(2,i),0),clip=texelFetch(paintGraphics,ivec2(3,i),0);
 float along=abs(paintNormalA.x)>.5?vPaintWorld.z:vPaintWorld.x;
 float direction=(abs(paintNormalA.x)>.5?-paintNormalA.x:paintNormalA.z)*style.w;
 vec2 delta=vec2((along-rect.x)*direction,vPaintWorld.y-rect.y);
 vec2 local=vec2(style.x*delta.x+style.y*delta.y,-style.y*delta.x+style.x*delta.y)*rect.zw+vec2(.5);
 float facing=smoothstep(.65,.95,dot(normalize(vPaintNormal),paintNormalA)*style.w);
 float alpha=corporateMask(local,style.z)*ink.a*facing*paintInside(clip,along);
 diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,alpha);
}`);
  };
  material.customProgramCacheKey=()=>oldKey+'|corporate-wall-paint-v6-'+this.backend;material.needsUpdate=true;
  const binding={material,uniforms,graphics};this.bindings.set(material,binding);return binding;
 }
 private update(binding:FinishBinding,finish:WallFinish|undefined,wall:WallSurface,other:WallFinish|undefined,otherWall:WallSurface,strips:SceneObject[],graphics:SceneObject[]){
  const u=binding.uniforms,color=new THREE.Color();
  for(const [suffix,value,surface]of [['A',finish,wall],['B',other,otherWall]] as const){
   const bounds=getPaintableBounds(surface.id)??{minY:.07,maxY:surface.height??3.6};
   u[`paintEnabled${suffix}`].value=value?1:0;u[`paintTint${suffix}`].value=value?.color?1:0;
   color.set(value?.color??'#ffffff');u[`paintColor${suffix}`].value.set(color.r,color.g,color.b);
   color.set(value?.accent??'#0b30c1');u[`paintAccent${suffix}`].value.set(color.r,color.g,color.b);
   u[`paintMotif${suffix}`].value=this.texture?(value?.motif??0):0;u[`paintMural${suffix}`].value=this.texture?(value?.mural??0):0;
   u[`paintNormal${suffix}`].value.set(...surface.normal);u[`paintBounds${suffix}`].value.set(surface.min,surface.max,bounds.minY,bounds.maxY);
  }
  let count=0;
  for(const object of strips){
   if(count===stripCapacity)break;
   const surface=object.wallId===wall.id?wall:otherWall,area=getWallPaintRect(object,surface);
   if(area.maxAlong<=area.minAlong||area.maxY<=area.minY)continue;
   const sign=surface.normal[0]*wall.normal[0]+surface.normal[2]*wall.normal[2]>0?1:-1;
   color.set(getMaterial('brandDoorPanel',object.material).color);
   u.paintStripRect.value[count].set(area.minAlong,area.maxAlong,area.minY,area.maxY);
   u.paintStripStyle.value[count].set(color.r,color.g,color.b,sign*object.variant);count++;
  }
  u.paintStripCount.value=count;u.paintMaskAtlas.value=this.texture??null;
  const signature=JSON.stringify(graphics);
  if(binding.graphicSignature!==signature){
   binding.graphicSignature=signature;const data=binding.graphics.image.data as Float32Array;data.fill(0);let index=0;
   for(const object of graphics){
    if(index>=graphicCapacity)break;
    const surface=getPlacementSurfaces().find(w=>w.id===object.wallId);if(!surface)continue;
    const g=wallGraphicFor(object),bounds=getPaintableBounds(surface.id)??{minY:.07,maxY:surface.height??3.6};
    const sign=surface.normal[0]*wall.normal[0]+surface.normal[2]*wall.normal[2]>0?1:-1;
    color.set(g.color);const at=index*16;
    data.set([object.position[surface.axis==='x'?2:0],object.position[1],1/g.width,1/g.height,Math.cos(g.angle),Math.sin(g.angle),object.variant,sign,color.r,color.g,color.b,g.opacity,surface.min,surface.max,bounds.minY,bounds.maxY],at);index++;
   }
   u.paintGraphicCount.value=this.texture?index:0;binding.graphics.needsUpdate=true;
  }
  binding.paintInput={faces:[{finish,wall},{finish:other,wall:otherWall}],strips,graphics};
  if(this.portable)this.updatePortable(binding);
 }
 private updatePortable(binding:FinishBinding){
  if(!this.texture||!binding.paintInput)return;
  const signature=JSON.stringify(binding.paintInput);if(binding.portableSignature===signature)return;
  binding.portableSignature=signature;const {faces,strips,graphics}=binding.paintInput;
  const canvas=renderPortableWallPaint(this.texture.image as CanvasImageSource,faces,strips,graphics,this.maxTextureSize);
  binding.portableTexture?.dispose();binding.portableTexture=undefined;
  if(canvas){const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;binding.portableTexture=texture;}
  binding.uniforms.paintPortable.value=binding.portableTexture??null;binding.uniforms.paintPortableEnabled.value=canvas?1:0;
 }
 /** Validate the actual linked wall programs under the loader, not just the
  * viewport/UA. A driver rejecting the desktop paint shader gets the same paint
  * through an ordinary RGBA8 texture before the first interactive frame. */
 recoverUnsupportedPrograms(renderer:THREE.WebGLRenderer){
  if(this.portable)return false;const gl=renderer.getContext();
  const failed=renderer.info.programs?.some(program=>{
   const p=program as unknown as {program:WebGLProgram;fragmentShader:WebGLShader};
   return gl.getShaderSource(p.fragmentShader)?.includes('uniform sampler2D paintGraphics')&&!gl.getProgramParameter(p.program,gl.LINK_STATUS);
  });
  if(!failed)return false;
  this.portable=true;for(const binding of this.bindings.values()){this.updatePortable(binding);binding.material.needsUpdate=true;}
  return true;
 }
 dispose(){this.texture?.dispose();for(const binding of this.bindings.values()){binding.graphics.dispose();binding.portableTexture?.dispose();}this.bindings.clear();this.masks.clear();}
}
