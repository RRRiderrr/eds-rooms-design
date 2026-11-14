import * as THREE from 'three';

/** Average indirect irradiance separately over each connected planar door face.
 * The original baked atlas remains the source of light, while per-texel Monte
 * Carlo noise no longer becomes large irregular patches on flat door panels.
 * Actual dynamic lighting, contact and shadow maps are left untouched. */
export function applyStableDoorIrradiance(material:THREE.MeshStandardMaterial,mesh:THREE.Mesh,atlas:THREE.Texture):boolean {
 const image=atlas.image as {data?:ArrayLike<number>;width?:number;height?:number}|undefined;
 const data=image?.data,width=image?.width??0,height=image?.height??0;
 const geometry=mesh.geometry,uv=geometry.getAttribute('uv1'),position=geometry.getAttribute('position'),index=geometry.getIndex();
 if(!data||!width||!height||!uv||!position||!index||uv.count!==position.count)return false;
 const pixels=data;
 const count=position.count,parent=Int32Array.from({length:count},(_,i)=>i);
 function root(i:number):number{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
 function join(a:number,b:number){a=root(a);b=root(b);if(a!==b)parent[b]=a;}
 for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);join(a,b);join(b,c);}
 const half=atlas.type===THREE.HalfFloatType,channels=pixels.length/(width*height),acc=new Map<number,{sum:THREE.Vector3;count:number}>();
 function sample(u:number,v:number){
  const x=THREE.MathUtils.clamp(Math.floor(u*width),0,width-1),y=THREE.MathUtils.clamp(Math.floor(v*height),0,height-1),i=(y*width+x)*channels;
  const read=(n:number)=>half?THREE.DataUtils.fromHalfFloat(pixels[i+n]):Number(pixels[i+n]);
  return new THREE.Vector3(read(0),read(1),read(2));
 }
 // Sample strictly inside each UV triangle to avoid neighbouring atlas islands.
 for(let i=0;i<index.count;i+=3){
  const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),key=root(a),entry=acc.get(key)??{sum:new THREE.Vector3(),count:0};
  for(let j=1;j<=5;j++)for(let k=1;k<=6-j;k++){
   const wa=j/7,wb=k/7,wc=1-wa-wb;
   entry.sum.add(sample(uv.getX(a)*wa+uv.getX(b)*wb+uv.getX(c)*wc,uv.getY(a)*wa+uv.getY(b)*wb+uv.getY(c)*wc));entry.count++;
  }
  acc.set(key,entry);
 }
 const values=new Float32Array(count*3);
 for(let i=0;i<count;i++){const entry=acc.get(root(i));if(entry?.count)values.set(entry.sum.toArray().map(v=>v/entry.count),i*3);}
 geometry.setAttribute('stableDoorIrradiance',new THREE.BufferAttribute(values,3));
 material.lightMap=null;material.lightMapIntensity=0;
 material.onBeforeCompile=shader=>{
  shader.vertexShader='attribute vec3 stableDoorIrradiance; varying vec3 vStableDoorIrradiance;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStableDoorIrradiance=stableDoorIrradiance;');
  shader.fragmentShader='varying vec3 vStableDoorIrradiance;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>','#include <lights_fragment_maps>\nirradiance += vStableDoorIrradiance;');
 };
 material.customProgramCacheKey=()=> 'door-face-averaged-irradiance-v1';
 material.userData.stableDoorIrradiance=true;material.needsUpdate=true;return true;
}
