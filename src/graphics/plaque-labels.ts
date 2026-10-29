import * as THREE from 'three';
import type { SceneObject } from '../core/types';
import {normalizePlaqueLabel} from '../core/plaque-text';
import {layoutPlaqueText} from './plaque-text-layout';
/** Dynamic canvas prints use Three's bottom-origin UV convention. Exported
 * static glTF prints use top-origin UVs, so inheriting UV0 inverts their text.
 * The named label planes are authored in local XY with their front at +Z. */
export function setCanvasPrintUv(geometry:THREE.BufferGeometry):void {
 const position=geometry.getAttribute('position');
 geometry.computeBoundingBox();const bounds=geometry.boundingBox!;
 const width=bounds.max.x-bounds.min.x,height=bounds.max.y-bounds.min.y;
 if(width<=0||height<=0)throw new Error('Label print needs a non-degenerate XY plane');
 const uv=new Float32Array(position.count*2);
 for(let i=0;i<position.count;i++){
  uv[i*2]=(position.getX(i)-bounds.min.x)/width;
  uv[i*2+1]=(position.getY(i)-bounds.min.y)/height;
 }
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}
/** Each plaque owns its print. Editing one name never changes another instance. */
export function applyPlaqueLabel(root:THREE.Object3D,object:SceneObject,underlayColor?:string){
 if(object.assetId!=='doorPlaque')return;
 const underlay=underlayColor?new THREE.Color(underlayColor):undefined;
 const whiteInk=object.variant===1&&!!underlay&&(underlay.r*.2126+underlay.g*.7152+underlay.b*.0722)<.24;
 const ink=whiteInk?'#ffffff':'#171d27';
 root.traverse(node=>{
  if(!(node instanceof THREE.Mesh)||node.name!=='DoorPlaque_Label')return;
  // Production nodes share immutable template geometry. Give only the tiny
  // print plane its own UVs; other instances and static exports stay untouched.
  if(node.userData.sharedGeometry){node.geometry=node.geometry.clone();node.userData.sharedGeometry=false;}
  setCanvasPrintUv(node.geometry);
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=384;
  const c=canvas.getContext('2d')!;c.clearRect(0,0,1024,384);
  const text=normalizePlaqueLabel(object.label??'01');
  c.fillStyle=ink;
  c.textAlign='center';c.textBaseline='middle';
  const layout=layoutPlaqueText(text,944,332,(line,size)=>{c.font=`600 ${size}px Arial`;return c.measureText(line).width;});
  c.font=`600 ${layout.fontSize}px Arial`;
  layout.lines.forEach((line,index)=>c.fillText(line,512,192+(index-(layout.lines.length-1)/2)*layout.lineHeight));
  const texture=new THREE.CanvasTexture(canvas);texture.flipY=true;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const mat=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,side:THREE.FrontSide,toneMapped:false});
  mat.userData.owned=true;mat.userData.ownedPrint=texture;mat.userData.inkColor=ink;mat.userData.printedText=text;mat.userData.printedLines=layout.lines;
  const previous=Array.isArray(node.material)?node.material:[node.material];
  for(const m of previous)if(m.userData.owned){(m.userData.ownedPrint as THREE.Texture|undefined)?.dispose();m.dispose();}
  node.material=mat;node.castShadow=false;node.renderOrder=2;
 });
}
