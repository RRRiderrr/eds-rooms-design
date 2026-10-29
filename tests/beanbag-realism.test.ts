import {describe,it,expect} from 'vitest';
import {Box3,Mesh,Raycaster,Vector3} from 'three';
import {getMaterial,getVariant} from '../src/catalog/catalog';
import {createBeanBagObject} from '../src/catalog/beanbags';

describe('Continuous relaxed beanbag covers',()=>{
 for(const variant of [1,2,3])it(`variant ${variant}: watertight, consistently wound cloth without raised fittings`,()=>{
  const dimensions=getVariant('beanBag',variant).dimensions;
  for(const proxy of [false,true]){
   const object=createBeanBagObject(dimensions,variant,getMaterial('beanBag','eds-blue'),proxy);
   expect(object.children).toHaveLength(1);
   const mesh=object.children[0] as Mesh,geometry=mesh.geometry;
   expect(mesh.name).toContain('continuous_cloth');expect(geometry.userData.raisedPiping).toBe(false);
   const bounds=new Box3().setFromObject(object),size=bounds.getSize(new Vector3());
   dimensions.forEach((value,axis)=>expect(size.getComponent(axis)).toBeCloseTo(value,6));
   expect(bounds.min.y).toBeCloseTo(0,7);
   const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),index=geometry.index!;
   const key=(i:number)=>[position.getX(i),position.getY(i),position.getZ(i)].map(x=>Math.round(x*1e6)).join(',');
   const edgeUse=new Map<string,number>();let volume=0,degenerate=0,flipped=0,contact=0;
   const a=new Vector3(),b=new Vector3(),c=new Vector3(),ab=new Vector3(),ac=new Vector3(),face=new Vector3(),n=new Vector3();
   for(let i=0;i<position.count;i++){
    n.fromBufferAttribute(normal,i);expect(n.length()).toBeCloseTo(1,5);
    if(position.getY(i)<1e-6)contact++;
   }
   for(let i=0;i<index.count;i+=3){
    const ai=index.getX(i),bi=index.getX(i+1),ci=index.getX(i+2);
    a.fromBufferAttribute(position,ai);b.fromBufferAttribute(position,bi);c.fromBufferAttribute(position,ci);
    ab.subVectors(b,a);ac.subVectors(c,a);face.crossVectors(ab,ac);
    if(face.lengthSq()<1e-20)degenerate++;
    n.fromBufferAttribute(normal,ai).add(new Vector3().fromBufferAttribute(normal,bi)).add(new Vector3().fromBufferAttribute(normal,ci));
    if(face.dot(n)<-1e-9)flipped++;
    volume+=a.dot(new Vector3().crossVectors(b,c))/6;
    for(const [x,y]of [[ai,bi],[bi,ci],[ci,ai]]){const keys=[key(x),key(y)].sort(),edge=keys.join('|');edgeUse.set(edge,(edgeUse.get(edge)??0)+1);}
   }
   expect(degenerate).toBe(0);expect(flipped).toBe(0);expect(volume).toBeGreaterThan(dimensions[0]*dimensions[1]*dimensions[2]*.2);
   expect([...edgeUse.values()].every(count=>count===2)).toBe(true);
   expect(contact).toBeGreaterThan(proxy?20:100);
   expect(index.count/3).toBeLessThan(proxy?4200:44000);
   geometry.dispose();(mesh.material as {dispose:()=>void}).dispose();
  }
 });
 it('keeps a usable depressed seat under the smoothly rounded rear support',()=>{
  for(const variant of [2,3]){
   const object=createBeanBagObject(getVariant('beanBag',variant).dimensions,variant,getMaterial('beanBag','eds-lavender'),false);
   object.updateMatrixWorld(true);const ray=new Raycaster(),height=(z:number)=>{ray.set(new Vector3(0,2,z),new Vector3(0,-1,0));return ray.intersectObject(object,true)[0].point.y;};
   expect(height(-.31)-height(.13)).toBeGreaterThan(.20);
   expect(height(.13)).toBeGreaterThan(.18);expect(height(.13)).toBeLessThan(.42);
  }
 });
});
