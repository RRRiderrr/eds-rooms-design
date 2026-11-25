import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {MaterialVariant, Vec3} from '../core/types';
import {createPlanter} from './planter';
import {createPothosFoliage} from './pothos';
import {editorPlanterTexture} from './planter-textures';

/** Low storage dividers: distinct cabinet fronts and restrained planter finishes. */
export function createStorageBotanical(index:number,dimensions:Vec3,selected:MaterialVariant,proxy:boolean):THREE.Group {
 const [w,,d]=dimensions, group=new THREE.Group();
 group.name=`botanicalDivider:${index}:${proxy?'editor':'archviz'}`;
 group.userData={assetId:'botanicalDivider',variant:index,mode:proxy?'editor':'archviz',dimensions,placement:'floor',storageCabinet:true,planterRimHeight:1.025};
 // The compact cabinet shares the balanced flush-front style of variant 8.
 const style=(index-8)%6;
 const body=new THREE.MeshStandardMaterial({color:selected.color,roughness:.8});
 body.userData={owned:true,sourcePbr:true,preserveOriginal:true,surface:selected.surface,colorVariant:selected.id,tintable:true};
 const dark=new THREE.MeshStandardMaterial({color:'#333b38',roughness:.9});dark.userData={owned:true,sourcePbr:true,preserveOriginal:true,surface:'plastic'};
 const wood=new THREE.MeshStandardMaterial({color:style%2?'#b99a77':'#b9a48b',roughness:.82});wood.userData={owned:true,sourcePbr:true,preserveOriginal:true,surface:'plastic'};
 const panel=(name:string,size:Vec3,pos:Vec3,mat:THREE.Material=body,r=.003)=>{
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(...size,proxy?1:3,r),mat);mesh.name=name;mesh.position.set(...pos);mesh.castShadow=!proxy;mesh.receiveShadow=true;group.add(mesh);
 };
 // Recessed plinth plus a real cabinet shell and shelf provide usable storage.
 panel('StoragePlanter_Plinth',[w-.10,.055,d-.08],[0,.0275,0],dark);
 panel('StoragePlanter_Bottom',[w,.025,d],[0,.0675,0]);
 panel('StoragePlanter_Top',[w,.025,d],[0,.6575,0]);
 for(const side of [-1,1])panel('StoragePlanter_Side',[.025,.565,d],[side*(w/2-.0125),.3625,0]);
 panel('StoragePlanter_Back',[w-.05,.565,.016],[0,.3625,-d/2+.008]);
 panel('StoragePlanter_Shelf',[w-.05,.018,d-.04],[0,.36,0]);
 if(style===1||style===4){
  // Vertical timber battens over cabinet doors: a distinctly warmer elevation.
  for(let i=0;i<4;i++)panel('StoragePlanter_Door',[w/4-.008,.56,.017],[-w/2+(i+.5)*w/4,.362,d/2-.008]);
  const slatCount=style===4?18:32,slatWidth=style===4?.56:1;
  for(let i=0;i<slatCount;i++)panel('StoragePlanter_Batten',[.033,.55,.008],[-w*slatWidth/2+.035+i*(w*slatWidth-.07)/(slatCount-1),.362,d/2+.004],wood,.002);
 }else if(style===2||style===5){
  // An open shelf breaks up the closed fronts and remains usable storage.
  panel('StoragePlanter_Divider',[.018,.565,d-.025],[w*.24,.362,0]);
  for(let i=0;i<3;i++)panel('StoragePlanter_Door',[w*.245-.007,.56,.018],[-w/2+(i+.5)*w*.245,.362,d/2-.009],style===5&&i===1?dark:body);
  panel('StoragePlanter_OpenShelf',[w*.24,.018,d-.025],[w*.37,.37,0],wood);
  panel('StoragePlanter_AccentRail',[w,.018,.012],[0,.645,d/2+.006],wood,.002);
 }else if(style===3){
  // A pair of wide, stacked drawer banks lends the light unit a horizontal rhythm.
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){
   const x=(i-.5)*w*.5,y=.225+j*.275;
   panel('StoragePlanter_Drawer',[w*.5-.009,.267,.018],[x,y,d/2-.009]);
   panel('StoragePlanter_Pull',[.14,.006,.003],[x,y+.085,d/2+.002],dark,.001);
  }
 }else{
  // Flush push-to-open doors and an inset horizontal pull.
  for(let i=0;i<4;i++){
   const x=-w/2+(i+.5)*w/4;
   panel('StoragePlanter_Door',[w/4-.006,.56,.018],[x,.362,d/2-.009]);
   panel('StoragePlanter_Pull',[.105,.006,.003],[x,.59,d/2+.002],dark,.001);
  }
 }
 const planter=createPlanter([w,.9,d],selected,proxy,{foliage:false});planter.position.y=.67;
 const colors=['#a9b4aa','#d9d1bf','#3d4a43','#babcb4','#7c8980','#c2b4a3'];
 planter.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
  if(o.name==='Planter_loose_soil'){
   o.geometry.deleteAttribute('color');const uv=o.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)*w/d);
   const mat=o.material as THREE.MeshStandardMaterial;mat.vertexColors=false;mat.color.set('#ffffff');if(proxy)mat.map=editorPlanterTexture('soil')??null;
  }
  for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat.name==='Planter_oiled_oak'||mat.name==='Planter_matte_accent'){
   (mat as THREE.MeshStandardMaterial).color.set(colors[style]);mat.userData={...mat.userData,sourcePbr:true,preserveOriginal:true,surface:'plastic'};
  }
 });group.add(planter);
 const foliage=createPothosFoliage(w,d,.67+.029+.9*.395-.028,proxy);
 // Keep the natural leaf spread proportionate on the shorter cabinet.
 if(index===14)foliage.scale.x=.9;
 if(proxy){const leaf=foliage.getObjectByName('Planter_pothos_leaves') as THREE.Mesh;(leaf.material as THREE.MeshStandardMaterial).map=editorPlanterTexture('pothos-leaf')??null;}
 group.add(foliage);return group;
}
