import {describe,expect,it} from 'vitest';
import {Box3,Group,Mesh,MeshStandardMaterial,Raycaster,Vector3} from 'three';
import {createWallClock,WALL_CLOCK_DIMENSIONS,WALL_CLOCK_VARIANTS} from '../src/catalog/wall-clocks';

describe('Frameless applied wall clocks',()=>{
 it('retains a precise 1.25m installation template without a faceplate or enclosure',()=>{
  for(const variant of WALL_CLOCK_VARIANTS)for(const proxy of [false,true]){
   const clock=createWallClock(variant.index,proxy),bounds=new Box3().setFromObject(clock),size=bounds.getSize(new Vector3());
   size.toArray().forEach((v,i)=>expect(v).toBeCloseTo(WALL_CLOCK_DIMENSIONS[i],5));
   expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0,6);expect(bounds.getCenter(new Vector3()).y).toBeCloseTo(0,6);
   expect(bounds.min.z).toBeCloseTo(0,6);expect(clock.userData).toMatchObject({frameless:true,dialSupport:'actual-wall'});
   let openings=0,samples=0;clock.updateMatrixWorld(true);
   for(let x=0;x<21;x++)for(let y=0;y<21;y++){
    const ray=new Raycaster(new Vector3(-.61+x*.061,-.61+y*.061,.5),new Vector3(0,0,-1),0,1);
    samples++;if(!ray.intersectObject(clock,true).length)openings++;
   }
   expect(openings/samples).toBeGreaterThan(.8);
   // The only central disk is the small mechanism, never a clock-sized body.
   const hub=clock.getObjectByName('Clock_small_central_mechanism')!;
   expect(new Box3().setFromObject(hub).getSize(new Vector3()).x).toBeLessThan(.04);
  }
 });
 it('exports separate centred hand pivots for real local-time updates',()=>{
  for(let variant=1;variant<=6;variant++){
   const clock=createWallClock(variant);
   for(const kind of ['hour','minute']){
    const pivot=clock.getObjectByName(`Clock_hand_${kind}`) as Group;
    expect(pivot).toBeInstanceOf(Group);expect(pivot.userData).toMatchObject({clockHand:kind,rotationAxis:'z',zeroDirection:'+Y'});
    expect(pivot.position.x).toBe(0);expect(pivot.position.y).toBe(0);expect(pivot.children).toHaveLength(1);
    const blade=pivot.children[0] as Mesh;blade.geometry.computeBoundingBox();
    expect(blade.geometry.boundingBox!.max.y).toBeGreaterThan(.3);expect(blade.geometry.boundingBox!.min.y).toBeLessThan(0);
   }
   expect(!!clock.getObjectByName('Clock_hand_second')).toBe([2,3,6].includes(variant));
  }
 });
 it('has six distinct dial constructions, finite smooth geometry and protected corporate finishes',()=>{
  const signatures=new Set<string>();
  for(let variant=1;variant<=6;variant++){
   const clock=createWallClock(variant),counts:number[]=[];
   clock.traverse(object=>{
    if(!(object instanceof Mesh))return;
    const p=object.geometry.getAttribute('position'),n=object.geometry.getAttribute('normal');counts.push(p.count);
    expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
    for(let i=0;i<n.count;i++)expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,5);
    const m=object.material as MeshStandardMaterial;expect(m.userData).toMatchObject({preserveOriginal:true,sourcePbr:true,tintable:false});
   });
   signatures.add(counts.join(','));
  }
  expect(signatures.size).toBe(6);
 });
});
