import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {applyStableDoorIrradiance} from '../src/graphics/door-lighting';

describe('Door indirect-light noise correction',()=>{
 it('averages the original atlas independently for each face without changing the atlas or shadow flags',()=>{
  const pixels=new Float32Array(8*4*4);
  for(let y=0;y<4;y++)for(let x=0;x<8;x++){const i=(y*8+x)*4,base=x<4?.2:.8;pixels.set([base+(x%2)*.04,base,base,1],i);}
  const before=pixels.slice(),atlas=new THREE.DataTexture(pixels,8,4,THREE.RGBAFormat,THREE.FloatType);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0,2,0,0,3,0,0,3,1,0,2,1,0],3));
  geometry.setAttribute('uv1',new THREE.Float32BufferAttribute([.02,.02,.45,.02,.45,.98,.02,.98,.55,.02,.98,.02,.98,.98,.55,.98],2));
  geometry.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);
  const mat=new THREE.MeshStandardMaterial({lightMap:atlas});const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;
  expect(applyStableDoorIrradiance(mat,mesh,atlas)).toBe(true);
  const a=geometry.getAttribute('stableDoorIrradiance');
  expect(a.count).toBe(8);for(let i=1;i<4;i++)expect(a.getX(i)).toBeCloseTo(a.getX(0));
  for(let i=5;i<8;i++)expect(a.getX(i)).toBeCloseTo(a.getX(4));
  expect(a.getX(4)).toBeGreaterThan(a.getX(0)+.5);expect(mat.lightMap).toBeNull();
  expect(mesh.castShadow&&mesh.receiveShadow).toBe(true);expect(pixels).toEqual(before);
  geometry.dispose();mat.dispose();atlas.dispose();
 });
});
