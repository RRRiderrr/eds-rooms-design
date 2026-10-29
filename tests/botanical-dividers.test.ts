import {describe,it,expect} from 'vitest';
import {Box3,DoubleSide,Mesh,MeshStandardMaterial,Raycaster,Vector3} from 'three';
import type {MaterialVariant,Vec3} from '../src/core/types';
import {createBotanicalDivider} from '../src/catalog/botanical-dividers';
const dimensions:Vec3=[2,2.3,.48],finish:MaterialVariant={id:'natural-oak',label:'Р”СѓР±',surface:'wood',color:'#997850'};
const make=(variant:number,proxy=false)=>createBotanicalDivider(dimensions,variant,finish,proxy);
function triangles(root:ReturnType<typeof make>){return root.children.reduce((count,node)=>count+((node as Mesh).geometry.index?.count??(node as Mesh).geometry.getAttribute('position').count)/3,0);}
describe('Botanical privacy dividers',()=>{
 it('all six retain exact floor footprint and height in production and editor modes',()=>{
  for(let variant=1;variant<=6;variant++)for(const proxy of [false,true]){const root=make(variant,proxy),bounds=new Box3().setFromObject(root),size=bounds.getSize(new Vector3());dimensions.forEach((value,axis)=>expect(size.getComponent(axis)).toBeCloseTo(value,5));expect(bounds.min.y).toBeCloseTo(0,7);expect(root.userData.variant).toBe(variant);}
 });
 it('keeps real openings in planting shelves, grids and trellises in both production and editor modes',()=>{
  for(let variant=2;variant<=5;variant++)for(const proxy of [false,true]){
   const root=make(variant,proxy);root.updateMatrixWorld(true);
   expect(root.getObjectByName('Botanical_opaque_privacy_core')).toBeUndefined();expect(root.getObjectByName('Botanical_felt_screen')).toBeUndefined();
   let gaps=0;
   // Sample the planted rectangle from both sides: foliage may screen the view,
   // but no invisible continuous panel may close the spaces between the leaves.
   for(let i=0;i<17;i++)for(let j=0;j<17;j++){
    const x=-.88+i*.11,y=.42+j*.11;
    if([-1,1].every(face=>!new Raycaster(new Vector3(x,y,face),new Vector3(0,0,-face)).intersectObject(root,true).length))gaps++;
   }
   expect(gaps,`v${variant} ${proxy?'editor':'production'} open planting gaps`).toBeGreaterThan(15);
  }
 },15000);
 it('limits solid surfaces to the felt screen and actual separated acoustic panels',()=>{
  for(const proxy of [false,true]){
   const felt=make(1,proxy),acoustic=make(6,proxy);felt.updateMatrixWorld(true);acoustic.updateMatrixWorld(true);
   const panel=felt.getObjectByName('Botanical_felt_screen') as Mesh;expect((panel.material as MeshStandardMaterial).transparent).toBe(false);
   const acousticStructure=acoustic.children.filter(node=>((node as Mesh).material as MeshStandardMaterial).userData.surface!=='leaf');
   for(const face of [-1,1]){
    const ray=new Raycaster(new Vector3(0,2.17,face),new Vector3(0,0,-face));expect(ray.intersectObject(felt,true).length).toBeGreaterThan(0);
    expect(ray.intersectObjects(acousticStructure,true)).toHaveLength(0);
    expect(new Raycaster(new Vector3(-.7,2.17,face),new Vector3(0,0,-face)).intersectObjects(acousticStructure,true).length).toBeGreaterThan(0);
   }
   expect(acoustic.getObjectByName('Botanical_opaque_privacy_core')).toBeUndefined();expect(acoustic.getObjectByName('Botanical_felt_screen')).toBeUndefined();
  }
 });
 it('curved foliage is two sided, connected to stems, naturally shaded and protected from finish substitution',()=>{
  for(let variant=1;variant<=6;variant++){
   const root=make(variant),leaves=root.getObjectByName('Botanical_living_foliage') as Mesh,stems=root.getObjectByName('Botanical_connected_stems') as Mesh;
   expect((leaves.material as MeshStandardMaterial).side).toBe(DoubleSide);expect((leaves.material as MeshStandardMaterial).userData).toMatchObject({sourcePbr:true,preserveOriginal:true,tintable:false,surface:'leaf'});
   expect(leaves.geometry.getAttribute('position').count).toBeGreaterThan(10000);expect(stems.geometry.getAttribute('position').count).toBeGreaterThan(2000);
   expect(new Set(Array.from(leaves.geometry.getAttribute('color').array).map(value=>value.toFixed(3))).size).toBeGreaterThan(100);
   for(const node of root.children as Mesh[])for(const name of ['position','normal','uv']){const a=node.geometry.getAttribute(name);expect(a).toBeDefined();expect(Array.from(a.array).every(Number.isFinite)).toBe(true);if(name==='normal'){let min=Infinity,max=0;for(let i=0;i<a.count;i++){const length=Math.hypot(a.getX(i),a.getY(i),a.getZ(i));min=Math.min(min,length);max=Math.max(max,length);}expect(min).toBeGreaterThan(.999);expect(max).toBeLessThan(1.001);}}
  }
 });
 it('has six distinct architectures and lightweight editor proxies',()=>{
  const signatures=new Set<string>();for(let variant=1;variant<=6;variant++){
   const root=make(variant),proxy=make(variant,true),production=triangles(root),editor=triangles(proxy);signatures.add(root.children.map(node=>(node as Mesh).geometry.getAttribute('position').count).join(','));
   expect(production).toBeGreaterThan(10000);expect(production).toBeLessThan(100000);expect(editor).toBeLessThan(12000);expect(editor).toBeLessThan(production*.3);
   const frame=root.getObjectByName('Botanical_frame_finish') as Mesh;expect((frame.material as MeshStandardMaterial).userData).toMatchObject({surface:'wood',sourcePbr:false,tintable:true,colorVariant:'natural-oak'});
  }expect(signatures.size).toBe(6);
 });
});
