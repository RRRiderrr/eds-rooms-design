import * as THREE from 'three';
import { assetUrl } from './architecture';
type Face='px'|'nx'|'py'|'ny'|'pz'|'nz';
interface Probe {position:[number,number,number];irradiance:Record<Face,[number,number,number]>;}
export class BakedProbes {
 private probes:Probe[]=[];
 async load(){try{const json=await fetch(assetUrl('assets/architecture/probes.json')).then(r=>r.json());this.probes=json.probes??[];}catch{/* reflection environment remains available */}}
 sample(position:THREE.Vector3):THREE.Vector3[]{
  const faces:Face[]=['px','nx','py','ny','pz','nz'];
  if(!this.probes.length)return faces.map(()=>new THREE.Vector3(.38,.36,.32));
  const near=this.probes.map(p=>({p,d:Math.max(.05,position.distanceTo(new THREE.Vector3(...p.position)))})).sort((a,b)=>a.d-b.d).slice(0,4);
  const total=near.reduce((s,p)=>s+1/(p.d*p.d),0);
  return faces.map(face=>near.reduce((v,{p,d})=>v.addScaledVector(new THREE.Vector3(...p.irradiance[face]),1/(d*d)/total),new THREE.Vector3()));
 }
 /** Corrected architectural surfaces no longer have valid UV1 bake islands.
  * Use the same irradiance field at each world position on every adjoining
  * part. All probes contribute, avoiding nearest-four membership seams. */
 sampleContinuousWall(position:THREE.Vector3,normal:THREE.Vector3):THREE.Vector3 {
  const n=normal.clone().normalize(),faces:Face[]=['px','nx','py','ny','pz','nz'];
  const weights=[Math.max(n.x,0)**2,Math.max(-n.x,0)**2,Math.max(n.y,0)**2,Math.max(-n.y,0)**2,Math.max(n.z,0)**2,Math.max(-n.z,0)**2];
  if(!this.probes.length)return new THREE.Vector3(.38,.36,.32);
  const result=new THREE.Vector3();let total=0;
  for(const probe of this.probes){
   const distanceSquared=position.distanceToSquared(new THREE.Vector3(...probe.position));
   const weight=1/Math.max(.0025,distanceSquared),irradiance=new THREE.Vector3();
   for(let i=0;i<faces.length;i++)irradiance.addScaledVector(new THREE.Vector3(...probe.irradiance[faces[i]]),weights[i]);
   result.addScaledVector(irradiance,weight);total+=weight;
  }
  return result.multiplyScalar(1/total);
 }
 applyContinuousWall(material:THREE.MeshStandardMaterial,mesh:THREE.Mesh){
  mesh.updateWorldMatrix(true,false);
  const positions=mesh.geometry.getAttribute('position'),normals=mesh.geometry.getAttribute('normal');
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),values=new Float32Array(positions.count*3);
  for(let i=0;i<positions.count;i++){
   const position=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
   const normal=new THREE.Vector3().fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
   const value=this.sampleContinuousWall(position,normal);values.set(value.toArray(),i*3);
  }
  mesh.geometry.setAttribute('bakedWallIrradiance',new THREE.BufferAttribute(values,3));
  // Old UV1 lightmaps were baked for disconnected thin skins. Mixing them
  // with fresh caps produced the visible bright/dark rectangles at each join.
  material.lightMap=null;material.lightMapIntensity=0;delete material.userData.bakedFaces;
  material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute vec3 bakedWallIrradiance; varying vec3 vBakedWallIrradiance;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBakedWallIrradiance=bakedWallIrradiance;');
   shader.fragmentShader='varying vec3 vBakedWallIrradiance;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>','#include <lights_fragment_maps>\nirradiance += .35 * vBakedWallIrradiance;');
  };
  material.customProgramCacheKey=()=> 'world-position-baked-wall-irradiance-v1';
  material.userData.continuousWallLighting=true;material.userData.wallIrradianceSamples=positions.count;
  material.userData.wallIrradianceScale=.35;material.needsUpdate=true;
 }
 apply(material:THREE.MeshStandardMaterial,position:THREE.Vector3){
  const values=this.sample(position);
  material.onBeforeCompile=shader=>{
   shader.uniforms.uBakedFaces={value:values};
   shader.fragmentShader='uniform vec3 uBakedFaces[6];\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
    vec3 bn = inverseTransformDirection( geometryNormal, viewMatrix );
    vec3 pw = max(bn, vec3(0.0)); vec3 nw = max(-bn, vec3(0.0));
    irradiance += 0.35 * (uBakedFaces[0]*pw.x*pw.x + uBakedFaces[1]*nw.x*nw.x + uBakedFaces[2]*pw.y*pw.y + uBakedFaces[3]*nw.y*nw.y + uBakedFaces[4]*pw.z*pw.z + uBakedFaces[5]*nw.z*nw.z);
   `);
  };
  material.customProgramCacheKey=()=> 'room-baked-probes-ambient-cube-v1';
  material.userData.bakedFaces=values;
 }
 update(material:THREE.Material,position:THREE.Vector3){const values=material.userData.bakedFaces as THREE.Vector3[]|undefined;if(values){const next=this.sample(position);values.forEach((v,i)=>v.copy(next[i]));}}
}
