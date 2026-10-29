import {describe,it,expect} from 'vitest';
import {Box3,DoubleSide,Mesh,MeshStandardMaterial,Raycaster,Vector3} from 'three';
import {createPlanter} from '../src/catalog/planter';
import {getMaterial,getVariant} from '../src/catalog/catalog';

const make=(proxy=false)=>createPlanter(getVariant('separator',3).dimensions,getMaterial('separator','oat'),proxy);
function triangles(root:ReturnType<typeof make>){return root.children.reduce((count,node)=>count+((node as Mesh).geometry.index?.count??(node as Mesh).geometry.getAttribute('position').count)/3,0);}
describe('Realistic planter construction',()=>{
 it('retains exact catalog footprint and floor contact without extending existing layouts',()=>{
  for(const proxy of [false,true]){
   const root=make(proxy),bounds=new Box3().setFromObject(root),size=bounds.getSize(new Vector3());
   getVariant('separator',3).dimensions.forEach((value,axis)=>expect(size.getComponent(axis)).toBeCloseTo(value,5));expect(bounds.min.y).toBeCloseTo(0,7);
  }
 });
 it('has an actual open vessel with recessed soil and four supporting feet',()=>{
  const root=make(),shell=root.getObjectByName('Planter_oiled_oak') as Mesh,soil=root.getObjectByName('Planter_loose_soil') as Mesh,feet=root.getObjectByName('Planter_recessed_feet') as Mesh;
  root.updateMatrixWorld(true);const shellBounds=new Box3().setFromObject(shell),soilBounds=new Box3().setFromObject(soil);
  expect(shellBounds.max.y-soilBounds.max.y).toBeGreaterThan(.022);expect(shellBounds.max.y-soilBounds.min.y).toBeLessThan(.035);
  const ray=new Raycaster(new Vector3(0,1,0),new Vector3(0,-1,0));expect(ray.intersectObject(shell).length).toBe(0);expect(ray.intersectObject(soil).length).toBeGreaterThan(0);
  expect(new Box3().setFromObject(feet).min.y).toBeCloseTo(0,7);expect(new Box3().setFromObject(feet).max.y).toBeGreaterThan(shellBounds.min.y);
 });
 it('uses smoothly curved double-sided leaf blades with connected stems and real fine veins',()=>{
  const root=make(),leaves=root.getObjectByName('Planter_foliage') as Mesh,stems=root.getObjectByName('Planter_petioles') as Mesh,ribs=root.getObjectByName('Planter_leaf_veins') as Mesh;
  expect((leaves.material as MeshStandardMaterial).side).toBe(DoubleSide);expect(leaves.geometry.getAttribute('position').count).toBeGreaterThan(40*22*8*6);
  expect(stems.geometry.getAttribute('position').count).toBeGreaterThan(10000);expect(ribs.geometry.getAttribute('position').count).toBeGreaterThan(50000);
  expect(new Box3().setFromObject(stems).min.y).toBeLessThan(new Box3().setFromObject(root.getObjectByName('Planter_loose_soil')!).max.y);
  const colors=leaves.geometry.getAttribute('color');expect(colors).toBeDefined();expect(new Set(Array.from(colors.array).map(value=>value.toFixed(3))).size).toBeGreaterThan(100);
  for(const node of root.children as Mesh[]){for(const name of ['position','normal','uv']){const attribute=node.geometry.getAttribute(name);expect(attribute).toBeDefined();expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);}}
 });
 it('keeps foliage natural under user color changes and limits the editor proxy to a fraction of production detail',()=>{
  const root=make(),proxy=make(true),paint=root.getObjectByName('Planter_matte_accent') as Mesh,leaf=root.getObjectByName('Planter_foliage') as Mesh,oak=root.getObjectByName('Planter_oiled_oak') as Mesh;
  expect((paint.material as MeshStandardMaterial).userData.tintable).toBe(true);expect((paint.material as MeshStandardMaterial).userData.colorVariant).toBe('oat');expect((paint.material as MeshStandardMaterial).userData.sourcePbr).toBe(true);
  expect((leaf.material as MeshStandardMaterial).userData.sourcePbr).toBe(true);expect((leaf.material as MeshStandardMaterial).userData.tintable).toBe(false);
  expect((oak.material as MeshStandardMaterial).userData.surface).toBe('wood');expect((oak.material as MeshStandardMaterial).userData.sourcePbr).toBe(false);
  expect(triangles(proxy)).toBeGreaterThan(5000);expect(triangles(proxy)).toBeLessThan(triangles(root)*.2);expect(triangles(root)).toBeLessThan(65000);
 });
});
