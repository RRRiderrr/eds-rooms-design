import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBeanBagObject} from './beanbags';
import type {MaterialVariant,Vec3} from '../core/types';

/** Original, metre-scale furniture and EDS door fittings. Wall fronts are local +Z. */
export function createCorporateObject(assetId:string,variant:number,dimensions:Vec3,selected:MaterialVariant,proxy:boolean):THREE.Group {
 if(assetId==='beanBag')return createBeanBagObject(dimensions,variant,selected,proxy);
 const [w,h,d]=dimensions,group=new THREE.Group(),batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
 group.userData={assetId,variant,mode:proxy?'editor':'archviz',dimensions,placement:assetId==='beanBag'?'floor':'wall'};
 const material=(name:string,color:string,roughness:number,metalness=0,fixed=false)=>{
  const mat=new THREE.MeshStandardMaterial({name,color,roughness,metalness});
  mat.userData={owned:true,surface:fixed?(metalness>.2?'metal':'plastic'):selected.surface,colorVariant:fixed?name:selected.id,color,sourcePbr:fixed,preserveOriginal:fixed};return mat;
 };
 const finish=material('EDS selected finish',selected.color,assetId==='beanBag'?.94:.5);
 const dark=material('Graphite edge profile','#252c31',.46,.55,true),steel=material('Satin stainless standoff','#a8b1b4',.25,.86,true);
 const add=(geometry:THREE.BufferGeometry,mat:THREE.Material,x=0,y=0,z=0,rx=0,ry=0,rz=0,preserveUv=false)=>{
  geometry.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x,y,z);
  if(geometry.index){const indexed=geometry;geometry=geometry.toNonIndexed();indexed.dispose();}
  if(!preserveUv){const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=new Float32Array(p.count*2);for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));uv[2*i]=ny>=nx&&ny>=nz?p.getX(i):nx>=nz?p.getZ(i):p.getX(i);uv[2*i+1]=ny>=nx&&ny>=nz?p.getZ(i):p.getY(i);}geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));}
  geometry.deleteAttribute('uv1');geometry.clearGroups();const list=batches.get(mat)??[];list.push(geometry);batches.set(mat,list);
 };
 const box=(bw:number,bh:number,bd:number,x:number,y:number,z:number,mat=finish,r=.003)=>add(proxy||r===0?new THREE.BoxGeometry(bw,bh,bd):new RoundedBoxGeometry(bw,bh,bd,3,Math.min(r,bw/3,bh/3,bd/3)),mat,x,y,z);
 const cylinder=(r:number,length:number,x:number,y:number,z:number,mat=steel)=>add(new THREE.CylinderGeometry(r,r,length,proxy?8:32),mat,x,y,z,Math.PI/2);
 // Keep label planes independent: the runtime replaces their material from
 // inert SceneObject.label, in both Editor and ArchViz, without touching bodies.
 const label=(name:string,width:number,height:number,y:number,z:number,uri:string)=>{
  const mat=new THREE.MeshBasicMaterial({name,color:'#ffffff',transparent:true,opacity:1,depthWrite:false,side:THREE.DoubleSide});
  mat.userData={owned:true,surface:'print',sourcePbr:true,preserveOriginal:true,printUri:uri,printSource:'EDS source SVG outlined wordmark + Ukrainian room label; user-authorised corporate identity',dynamicLabel:true};
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);mesh.name=name;mesh.position.set(0,y,z);mesh.renderOrder=2;mesh.userData={dynamicLabel:true,assetId};group.add(mesh);
 };
 if(assetId==='doorPlaque'){
  if(variant===1){
   const acrylic=proxy?material('PMMA editor body','#c5d9dd',.7,0,true):new THREE.MeshPhysicalMaterial({name:'PMMA 4 mm',color:'#f3fbfa',roughness:.055,transparent:true,opacity:.22,depthWrite:false,clearcoat:1,clearcoatRoughness:.05,ior:1.49,thickness:.004,side:THREE.DoubleSide});
   acrylic.userData={owned:true,surface:'glass',sourcePbr:true,preserveOriginal:true};
   // Wall-side z=-17mm, stand-off projection25mm, sheet4mm, front caps5mm.
   box(w,h,.004,0,0,.0105,acrylic,.0015);
   for(const x of [-w/2+.014,w/2-.014])for(const y of [-h/2+.014,h/2-.014]){
    cylinder(.0055,.025,x,y,-.0045);cylinder(.007,.0045,x,y,.01475);
    if(!proxy){cylinder(.0039,.0004,x,y,.0168,steel);box(.006,.0006,.0002,x,y,.0169,dark,0);}
   }
   box(.052,.0015,.0002,0,-.052,.0126,finish,.0002);
   label('DoorPlaque_Label',.158,.065,0,.0127,'assets/brand/door-plaque-label.png');
  }else if(variant===2){
   const aluminium=material('Matte anodised aluminium','#c0c6c8',.45,.78,true);
   box(w-.004,h-.004,.008,0,0,-.002,dark,.002);box(w,h,.004,0,0,.004,aluminium,.0015);
   box(.006,h-.012,.0005,-w/2+.008,0,.00625,finish,.0002);
   label('DoorPlaque_Label',.19,.065,0,.0066,'assets/brand/door-plaque-label.png');
  }else{
   box(w,h,d,0,0,0,dark,.003);box(w-.009,h-.009,.003,0,0,.007,finish,.0015);
   const inset=material('Frosted label insert','#f0f0f0',.63,0,true);box(w-.028,h-.024,.001,0,0,.009,inset,.001);
   label('DoorPlaque_Label',.195,.075,0,.0097,'assets/brand/door-plaque-label.png');
  }
 }else if(assetId==='brandDoorPanel'){
  // Standalone catalogue/drag preview swatch only. In the room the color is
  // applied to the original wall's albedo, with no separate panel or profiles.
  finish.roughness=.94;
  const swatch=new THREE.Mesh(new THREE.PlaneGeometry(w,h),finish);
  swatch.name='BrandDoorPanel_PaintSwatch';swatch.castShadow=false;swatch.receiveShadow=false;
  group.add(swatch);
 }else throw new Error(`Unsupported corporate asset ${assetId}`);
 for(const [mat,list]of batches){const merged=mergeGeometries(list,false);for(const geometry of list)geometry.dispose();if(!merged)throw new Error('Corporate geometry merge failed');const mesh=new THREE.Mesh(merged,mat);mesh.name=`${assetId}_${mat.name}`;mesh.castShadow=!proxy;mesh.receiveShadow=!proxy;group.add(mesh);}
 group.traverse(o=>{if(o instanceof THREE.Mesh){o.userData.assetId=assetId;o.frustumCulled=true;}});
 // Materials created for unused fittings must never linger in repeated previews.
 const used=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>used.add(m));});
 for(const mat of [finish,dark,steel])if(!used.has(mat))mat.dispose();
 return group;
}
