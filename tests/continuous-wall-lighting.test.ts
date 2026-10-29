import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {BakedProbes} from '../src/graphics/probes';

describe('Continuous irradiance on repaired architecture',()=>{
 it('samples one smooth world-space field at joins instead of changing with mesh ownership',()=>{
  const probes=new BakedProbes();
  const faces=['px','nx','py','ny','pz','nz'];
  (probes as any).probes=Array.from({length:8},(_,i)=>({position:[i%2?3:-3,1+i%3,Math.floor(i/2)-2],irradiance:Object.fromEntries(faces.map((face,j)=>[face,[.3+i*.04+j*.02,.25+i*.03,.2+j*.03]]))}));
  const sample=(x:number)=>probes.sampleContinuousWall(new THREE.Vector3(x,2,-3.1489),new THREE.Vector3(0,0,-1));
  expect(sample(-.00001).distanceTo(sample(.00001))).toBeLessThan(.00001);
  const a=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial()),b=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial());
  a.position.set(-.5,1.5,-3.1489);b.position.set(.5,1.5,-3.1489);a.rotation.y=b.rotation.y=Math.PI;
  for(const m of [a,b]){m.material.lightMap=new THREE.Texture();probes.applyContinuousWall(m.material,m);expect(m.material.lightMap).toBeNull();expect(m.material.userData.bakedFaces).toBeUndefined();expect(m.geometry.getAttribute('bakedWallIrradiance').count).toBe(m.geometry.getAttribute('position').count);}
  const values=new Map<string,number[]>();for(const mesh of [a,b]){
   const p=mesh.geometry.getAttribute('position'),e=mesh.geometry.getAttribute('bakedWallIrradiance');
   for(let i=0;i<p.count;i++){const world=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld),key=world.toArray().map(n=>n.toFixed(5)).join(',');const value=[e.getX(i),e.getY(i),e.getZ(i)];if(values.has(key))expect(value).toEqual(values.get(key));values.set(key,value);}
  }
  const shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <lights_fragment_maps>',uniforms:{}};
  a.material.onBeforeCompile(shader as any,{} as any);expect(shader.vertexShader).toContain('bakedWallIrradiance');expect(shader.fragmentShader).toContain('irradiance += .35 * vBakedWallIrradiance');
 });
});
