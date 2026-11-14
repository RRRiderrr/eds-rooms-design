import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Individually modelled, spreading epipremnum foliage for the cabinet planter. */
export function createPothosFoliage(width:number,depth:number,soilY:number,proxy=false):THREE.Group {
 const group=new THREE.Group();group.name='StoragePlanter_SpreadingFoliage';
 let seed=472819;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const stemGeometries:THREE.BufferGeometry[]=[],leafGeometries:THREE.BufferGeometry[]=[],leafBacks:THREE.BufferGeometry[]=[];
 const stemSegments=12,radialSegments=5,lengthSegments=proxy?7:12,widthSegments=proxy?4:6;
 // Physical front/back faces also appear in SSAO's FrontSide override pass.
 // A DoubleSide-only material vanishes from its depth buffer on the back side.
 const green=new THREE.MeshStandardMaterial({name:'Planter_pothos_leaf_material',color:'#ffffff',vertexColors:true,roughness:.72,side:THREE.FrontSide,transparent:false,depthWrite:true,depthTest:true});
 const stems=new THREE.MeshStandardMaterial({name:'Planter_pothos_stem_material',color:'#526c34',roughness:.91});
 for(const m of [green,stems])m.userData={owned:true,sourcePbr:true,preserveOriginal:true,surface:'leaf'};
 function stem(curve:THREE.Curve<THREE.Vector3>,radius:number){const g=new THREE.TubeGeometry(curve,stemSegments,radius,radialSegments,false);stemGeometries.push(g.index?g.toNonIndexed():g);}
 function blade(start:THREE.Vector3,direction:THREE.Vector3,length:number,leafWidth:number,curveAmount:number){
  const out=direction.clone().normalize(),horizontal=new THREE.Vector3(out.x,0,out.z).normalize();
  if(horizontal.lengthSq()<.001)horizontal.set(1,0,0);
  const across=new THREE.Vector3(-horizontal.z,0,horizontal.x),tilt=(rand()-.5)*1.8,twist=(rand()-.5)*.7;
  const up=new THREE.Vector3(0,1,0),positions:number[]=[],colors:number[]=[],uvs:number[]=[],indices:number[]=[];
  const dark=new THREE.Color('#315c20'),mid=new THREE.Color('#69933d'),pale=new THREE.Color('#b0bf75');
  const tone=.8+rand()*.42,variegated=rand()<.58,phase=rand()*6.28;
  for(let j=0;j<=lengthSegments;j++)for(let k=0;k<=widthSegments;k++){
   const t=j/lengthSegments,u=k/widthSegments*2-1;
   // Broad ovate blade, narrower at the petiole and with a pointed tip.
   const shape=Math.pow(Math.sin(Math.PI*t),.70)*(1.12-.32*t),half=leafWidth*.5*shape;
   const side=across.clone().applyAxisAngle(out,tilt+twist*t),pos=start.clone().addScaledVector(out,length*t).addScaledVector(up,curveAmount*Math.sin(Math.PI*t)-.025*t*t);
   pos.addScaledVector(side,half*u).addScaledVector(up,-.015*u*u*shape);
   positions.push(pos.x,pos.y,pos.z);uvs.push(k/widthSegments,t);
   const vein=Math.exp(-Math.abs(u)*13),mottle=(Math.sin(t*19+u*5+phase)*Math.sin(t*31-u*9+phase)+1)*.5;
   const mix=.32+.20*vein+.13*mottle,colour=dark.clone().lerp(mid,mix);
   if(variegated)colour.lerp(pale,Math.max(0,mottle-.48)*.35*(1-Math.abs(u)*.45));
   colour.multiplyScalar(tone);colors.push(colour.r,colour.g,colour.b);
   if(j<lengthSegments&&k<widthSegments){const a=j*(widthSegments+1)+k,b=a+widthSegments+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
  const front=g.toNonIndexed(),back=front.clone();
  // Reverse each triangle and its interpolated normal, retaining UVs/colors.
  for(const attr of Object.values(back.attributes)){const a=attr as THREE.BufferAttribute;for(let i=0;i<a.count;i+=3)for(let k=0;k<a.itemSize;k++){const x=(i+1)*a.itemSize+k,y=(i+2)*a.itemSize+k,t=a.array[x];a.array[x]=a.array[y];a.array[y]=t;}}
  const normal=back.getAttribute('normal') as THREE.BufferAttribute;for(let i=0;i<normal.count;i++)normal.setXYZ(i,-normal.getX(i),-normal.getY(i),-normal.getZ(i));
  leafGeometries.push(front);leafBacks.push(back);g.dispose();
 }
 const roots=7;
 for(let rootIndex=0;rootIndex<roots;rootIndex++){
  const rootX=width*(-.40+rootIndex*.8/(roots-1))+(rand()-.5)*.04;
  for(let vine=0;vine<3;vine++){
   const root=new THREE.Vector3(rootX,soilY-.018,(rand()-.5)*depth*.19);
   const azimuth=vine*2.1+rootIndex*1.72+(rand()-.5)*.7;
   const reach=.10+rand()*.15,dx=Math.cos(azimuth)*reach,dz=Math.sin(azimuth)*reach*.55,height=.30+rand()*.22;
   const end=root.clone().add(new THREE.Vector3(dx,height,dz));
   const curve=new THREE.CubicBezierCurve3(root,root.clone().add(new THREE.Vector3(-dx*.24,height*.45,-dz*.4)),end.clone().add(new THREE.Vector3(-dx*.34,-height*.23,-dz*.3)),end);
   stem(curve,.0028+rand()*.0013);
   for(let leaf=0;leaf<5;leaf++){
    const t=.23+leaf*.18+(rand()-.5)*.07,node=curve.getPoint(t);
    const angle=azimuth+(leaf%2?1:-1)*(1.05+rand()*.65)+(rand()-.5)*.3;
    const out=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const length=.19+rand()*.11,leafWidth=.105+rand()*.075,petiole=.035+rand()*.055;
    const lift=(rand()-.48)*.32-(leaf===0?.19:0),dir=new THREE.Vector3(out.x,lift,out.z).normalize();
    const start=node.clone().addScaledVector(out,petiole).add(new THREE.Vector3(0,(rand()-.35)*.035,0));
    stem(new THREE.QuadraticBezierCurve3(node,node.clone().lerp(start,.53).add(new THREE.Vector3(0,.017,0)),start),.0015+rand()*.0005);
    blade(start,dir,length,leafWidth,.018+rand()*.025);
   }
  }
 }
 function merged(name:string,geometries:THREE.BufferGeometry[],material:THREE.Material,meta:Record<string,unknown>){
  let vertex=0;const vertexRanges=geometries.map(g=>{const count=g.getAttribute('position').count,range=[vertex,count];vertex+=count;return range;});
  const geometry=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();if(!geometry)throw new Error('Could not merge planter foliage');
  geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=!proxy;mesh.receiveShadow=!proxy;mesh.userData={vertexRanges,...meta};group.add(mesh);
 }
 merged('Planter_pothos_stems',stemGeometries,stems,{lengthSegments:stemSegments,radialSegments});
 merged('Planter_pothos_leaves',[...leafGeometries,...leafBacks],green,{lengthSegments,widthSegments});
 return group;
}
