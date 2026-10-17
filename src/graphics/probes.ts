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
