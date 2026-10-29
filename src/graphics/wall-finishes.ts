import * as THREE from 'three';
import { getPlacementSurfaces } from '../core/space';
import { ROOM } from '../core/room';
import { getPaintableBounds, getWallPaintRect } from '../core/wall-paint';
import { getMaterial } from '../catalog/catalog';
import type { SceneConfig, SceneObject, WallFinish, WallSurface } from '../core/types';
import type { Architecture } from './architecture';
import atlas from '../../public/assets/brand/murals/atlas.json';

const roomIds:Record<string,string>={'wall-17':'west','wall-26':'east','wall-21':'near','wall-16':'far'};
const stripCapacity=32;
interface FinishBinding { material:THREE.MeshStandardMaterial|THREE.MeshBasicMaterial; uniforms:Record<string,{value:any}>; }
const rect=(id:string)=>atlas.tiles.find(t=>t.id===id)!.uvRectBottomLeft.map(n=>Number(n).toFixed(10)).join(',');
const muralDispatch=atlas.tiles.filter(t=>t.kind==='mural').map(t=>`if(index<${Number(t.index)+.5})return vec4(${rect(t.id)});`).join('');
/** Paint is part of the actual plaster albedo. Openings, surface normals,
 * lightmaps and shadows remain those of the original measured architecture. */
export class WallFinishes {
 private bindings=new Map<THREE.Material,FinishBinding>();
 private texture?:THREE.Texture;private loading?:Promise<void>;
 async load(){return this.loading??=new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}${atlas.texture}`).then(texture=>{
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.flipY=true;
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;this.texture=texture;
 }).catch(e=>console.warn('Corporate wall print unavailable',e));}
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
     config.objects.filter(o=>o.assetId==='brandDoorPanel'&&o.variant>0&&(o.wallId===primaryWall.id||o.wallId===wall.id||o.wallId===outsideAlias)));
   }
  });
  const active=new Set<THREE.Material>();architecture.root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])active.add(m);});
  for(const material of this.bindings.keys())if(!active.has(material))this.bindings.delete(material);
 }
 private bind(material:FinishBinding['material']):FinishBinding{
  const found=this.bindings.get(material);if(found)return found;
  const uniforms:FinishBinding['uniforms']={};
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
   shader.fragmentShader=`varying vec3 vPaintWorld; varying vec3 vPaintNormal;
uniform sampler2D paintMaskAtlas;
uniform int paintStripCount;
uniform vec4 paintStripRect[${stripCapacity}],paintStripStyle[${stripCapacity}];
${['A','B'].map(s=>`uniform vec3 paintColor${s},paintAccent${s},paintNormal${s};uniform vec4 paintBounds${s};uniform float paintEnabled${s},paintTint${s},paintMotif${s},paintMural${s};`).join('\n')}
vec4 corporateTile(float index,bool mural){
 if(mural){${muralDispatch}return vec4(${rect('mural-1')});}
 if(index<1.5)return vec4(${rect('motif-1')});if(index<2.5)return vec4(${rect('motif-2')});return vec4(${rect('motif-3')});
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
}`);
  };
  material.customProgramCacheKey=()=>oldKey+'|corporate-wall-paint-murals-v4';material.needsUpdate=true;
  const binding={material,uniforms};this.bindings.set(material,binding);return binding;
 }
 private update(binding:FinishBinding,finish:WallFinish|undefined,wall:WallSurface,other:WallFinish|undefined,otherWall:WallSurface,strips:SceneObject[]){
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
 }
 dispose(){this.texture?.dispose();this.bindings.clear();}
}
