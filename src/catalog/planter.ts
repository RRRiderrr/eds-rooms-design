import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {MaterialVariant,Vec3} from '../core/types';

/** An original, botanically modelled trough. All dimensions are in metres. */
export function createPlanter(dimensions:Vec3,selected:MaterialVariant,proxy=false):THREE.Group {
 const [w,h,d]=dimensions,group=new THREE.Group(),foliage=new THREE.Group();
 group.name=`separator:3:${proxy?'editor':'archviz'}`;
 group.userData={assetId:'separator',variant:3,mode:proxy?'editor':'archviz',dimensions,placement:'floor',originalAuthoring:true};
 const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
 function material(name:string,color:string,surface:string,roughness:number,tintable=false,vertexColors=false){
  const mat=new THREE.MeshStandardMaterial({name,color,roughness,metalness:0,vertexColors});
  mat.userData={owned:true,sourcePbr:true,preserveOriginal:true,surface,colorVariant:tintable?selected.id:name,color,tintable};return mat;
 }
 const oak=material('Planter_oiled_oak','#9b7353','wood',.7),accent=material('Planter_matte_accent',selected.color,selected.surface,.77,true);
 accent.polygonOffset=true;accent.polygonOffsetFactor=-1;accent.polygonOffsetUnits=-1;
 // The production loader supplies the existing Quixel oak maps to the shell;
 // foliage and matte paint retain their authored shading and never become cloth.
 oak.userData.sourcePbr=false;oak.userData.preserveOriginal=false;
 const lining=material('Planter_inner_liner','#302d26','plastic',.91),feet=material('Planter_recessed_feet','#242824','plastic',.85);
 const soil=material('Planter_loose_soil','#ffffff','ceramic',1,false,true);
 const leaves=material('Planter_foliage','#ffffff','leaf',.73,false,true);leaves.side=THREE.DoubleSide;
 const stems=material('Planter_petioles','#4b6738','leaf',.81),ribs=material('Planter_leaf_veins','#476b38','leaf',.78);
 function add(g:THREE.BufferGeometry,mat:THREE.Material,owner=group){
  if(owner===foliage){const mesh=new THREE.Mesh(g,mat);foliage.add(mesh);return;}
  if(g.index)g=g.toNonIndexed();const list=batches.get(mat)??[];list.push(g);batches.set(mat,list);
 }
 function roundedRect(width:number,depth:number,radius:number){
  const x=-width/2,z=-depth/2,s=new THREE.Shape();
  s.moveTo(x+radius,z);s.lineTo(x+width-radius,z);s.quadraticCurveTo(x+width,z,x+width,z+radius);s.lineTo(x+width,z+depth-radius);s.quadraticCurveTo(x+width,z+depth,x+width-radius,z+depth);s.lineTo(x+radius,z+depth);s.quadraticCurveTo(x,z+depth,x,z+depth-radius);s.lineTo(x,z+radius);s.quadraticCurveTo(x,z,x+radius,z);s.closePath();return s;
 }
 const footH=.032,vesselH=h*.395,base=footH-.003,bevel=proxy?.0015:.004,thickness=.021;
 // A continuous hollow shell: four walls, a rounded lip, inner walls and a
 // bottom. There is no opaque box or flat foliage card covering the opening.
 const shell=roundedRect(w-2*bevel,d-2*bevel,.014),hole=roundedRect(w-2*thickness,d-2*thickness,.009);
 shell.holes.push(new THREE.Path(hole.getPoints(proxy?3:10)));
 const outer=new THREE.ExtrudeGeometry(shell,{depth:vesselH-2*bevel,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:proxy?1:4,curveSegments:proxy?3:10,steps:1});
 outer.rotateX(-Math.PI/2);outer.translate(0,base+bevel,0);
 // Oak UVs follow the long grain. Leaves keep their own continuous blade UVs.
 const p=outer.getAttribute('position'),n=outer.getAttribute('normal'),uv=outer.getAttribute('uv');
 for(let i=0;i<p.count;i++)uv.setXY(i,Math.abs(n.getY(i))>.8?p.getX(i):p.getY(i),Math.abs(n.getY(i))>.8?p.getZ(i):Math.abs(n.getZ(i))>.7?p.getX(i):p.getZ(i));
 add(outer,oak);
 const bottom=new RoundedBoxGeometry(w-.025,.022,d-.025,proxy?1:4,.004);bottom.translate(0,base+.011,0);add(bottom,lining);
 const inner=new THREE.ExtrudeGeometry(roundedRect(w-2*thickness-.004,d-2*thickness-.004,.008),{depth:.005,bevelEnabled:false,curveSegments:proxy?3:8});inner.rotateX(-Math.PI/2);inner.translate(0,base+vesselH-.047,0);add(inner,lining);
 for(const z of [-1,1]){
  const panel=new THREE.PlaneGeometry(w-.065,vesselH*.15);if(z<0)panel.rotateY(Math.PI);panel.translate(0,base+vesselH*.27,z*d/2);add(panel,accent);
 }
 for(const x of [-w*.405,w*.405])for(const z of [-d*.31,d*.31]){
  const foot=new THREE.CylinderGeometry(.019,.022,footH,proxy?8:24);foot.translate(x,footH/2,z);add(foot,feet);
 }
 // Deterministic granular soil is recessed below the real lip, not at its top.
 const soilY=base+vesselH-.028,ground=new THREE.PlaneGeometry(w-2*thickness-.009,d-2*thickness-.009,proxy?12:54,proxy?3:12);ground.rotateX(-Math.PI/2);
 const gp=ground.getAttribute('position'),gc:number[]=[];
 for(let i=0;i<gp.count;i++){const grain=(Math.sin(i*91.713+gp.getX(i)*174.13+gp.getZ(i)*237.17)*43758.5453)%1;const variation=Math.abs(grain);gp.setY(i,soilY+.00045*(variation-.5));const c=new THREE.Color().setRGB(.025+.021*variation,.017+.013*variation,.009+.008*variation);gc.push(c.r,c.g,c.b);}
 ground.setAttribute('color',new THREE.Float32BufferAttribute(gc,3));ground.computeVertexNormals();add(ground,soil);
 let seed=73421;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const clumps=7,leafCount=proxy?4:8,along=proxy?14:22,across=proxy?6:10;
 const dark=new THREE.Color('#214b2b'),light=new THREE.Color('#527745');
 function tube(curve:THREE.Curve<THREE.Vector3>,radius:number,segments:number,mat:THREE.Material){add(new THREE.TubeGeometry(curve,segments,radius,proxy?4:5,false),mat,foliage);}
 for(let clump=0;clump<clumps;clump++){
  const offsets=[-.41,-.335,-.14,-.035,.15,.28,.405];
  const root=new THREE.Vector3(w*offsets[clump]+(rand()-.5)*.036,soilY-.009,Math.sin(clump*2.7)*d*.16);
  for(let leaf=0;leaf<leafCount;leaf++){
   const azimuth=leaf*Math.PI*2/leafCount+clump*1.93+(rand()-.5)*.8,reach=.09+rand()*.13;
   const out=new THREE.Vector3(Math.sin(azimuth),0,Math.cos(azimuth)),side=new THREE.Vector3(Math.cos(azimuth),0,-Math.sin(azimuth));
   const petioleHeight=.035+rand()*.07,tipHeight=leaf===0?h*(.88+rand()*.11):soilY+.16+rand()*(h-soilY-.16),length=tipHeight-soilY-petioleHeight,width=.10+rand()*.064;
   const bladeStart=root.clone().addScaledVector(out,.016).add(new THREE.Vector3(0,petioleHeight,0));
   const bladeEnd=root.clone().addScaledVector(out,reach).add(new THREE.Vector3(0,tipHeight-soilY,0));
   const blade=new THREE.CubicBezierCurve3(bladeStart,bladeStart.clone().add(new THREE.Vector3(0,length*.55,0)),bladeEnd.clone().addScaledVector(out,-reach*.18).add(new THREE.Vector3(0,length*.17,0)),bladeEnd);
   const petiole=new THREE.QuadraticBezierCurve3(root,root.clone().add(new THREE.Vector3(0,petioleHeight*.72,0)),bladeStart);tube(petiole,proxy?.0021:.0018,proxy?5:12,stems);
   const positions:number[]=[],uvs:number[]=[],colors:number[]=[],indices:number[]=[],tone=.86+rand()*.26,camber=.008+rand()*.008,twist=(rand()-.5)*.7;
   function bladePoint(t:number,u:number){const c=blade.getPoint(t),profile=Math.pow(Math.sin(Math.PI*t),.83)*(1-.12*t),half=width*.5*profile;const rotated=side.clone().applyAxisAngle(out,twist*t);return c.addScaledVector(rotated,half*u).addScaledVector(out,-camber*u*u*profile+.0014*Math.sin(t*19+clump)*u*u*profile);}
   for(let j=0;j<=along;j++)for(let k=0;k<=across;k++){
    const t=j/along,u=k/across*2-1,pos=bladePoint(t,u);positions.push(...pos.toArray());uvs.push(k/across,t);
    const vein=Math.exp(-Math.abs(u)*14),edge=Math.pow(Math.abs(u),3),mottle=.06*Math.sin(t*43+u*7+clump);
    const color=dark.clone().lerp(light,Math.min(.83,.27+.24*vein+.10*edge+mottle)).multiplyScalar(tone);colors.push(color.r,color.g,color.b);
    if(j<along&&k<across){const a=j*(across+1)+k,b=a+across+1;indices.push(a,b,a+1,b,b+1,a+1);}
   }
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();add(geometry,leaves,foliage);
   // The midrib follows the leaf, never floats across empty space like a seam.
   const ribPoints=Array.from({length:proxy?6:15},(_,i)=>bladePoint(.025+i/(proxy?5:14)*.945,0).addScaledVector(out,.0007));
   tube(new THREE.CatmullRomCurve3(ribPoints),proxy?.0005:.0004,proxy?6:20,ribs);
   if(!proxy)for(let vein=1;vein<=4;vein++)for(const direction of [-1,1]){
    const t=.13+vein*.15,points=Array.from({length:5},(_,i)=>bladePoint(t+i/4*.085,direction*i/4*.89).addScaledVector(out,.0006));
    tube(new THREE.CatmullRomCurve3(points),.00012,3,ribs);
   }
  }
 }
 // Preserve the original catalog collision footprint. Only foliage is fitted;
 // the exact vessel width/depth and its floor contact are never rescaled.
 foliage.updateMatrixWorld(true);const fb=new THREE.Box3().setFromObject(foliage),fs=fb.getSize(new THREE.Vector3()),fc=fb.getCenter(new THREE.Vector3());
 const fitX=Math.min(1,(w-.016)/fs.x),fitZ=Math.min(1,(d-.016)/fs.z),fitY=(h-soilY)/(fb.max.y-soilY);
 for(const mesh of foliage.children as THREE.Mesh[]){mesh.geometry.translate(-fc.x,0,-fc.z);mesh.geometry.scale(fitX,fitY,fitZ);mesh.geometry.translate(0,soilY*(1-fitY),0);mesh.geometry.computeVertexNormals();add(mesh.geometry,mesh.material as THREE.Material);}
 for(const [mat,list]of batches){const merged=mergeGeometries(list,false);for(const g of list)g.dispose();if(!merged)throw new Error('Planter geometry merge failed');merged.computeBoundingBox();merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,mat);mesh.name=mat.name;mesh.userData={assetId:'separator',surface:mat.userData.surface};mesh.castShadow=!proxy;mesh.receiveShadow=!proxy;group.add(mesh);}
 return group;
}
