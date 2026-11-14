import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {FrontSide,Mesh,MeshStandardMaterial,Vector3} from 'three';
import {createAssetObject,disposeAssetObject} from '../src/catalog/geometry';

/** Original models are independent of the new storage-planter planting. */
const previousGeometry:[string,number,string,string][]=[
 ['separator',3,'oat','a7b514328034d049624fdae8c36aebe9c7e27b43acd43ee4148e15fc95a677f2'],
 ['botanicalDivider',1,'oak','3b20ded41888bea07b9ec3109c43eece1a3e3adb7b35895fee373557b5e06ec7'],
 ['botanicalDivider',2,'oak','2996b517238d6c621af12db077be07fa25b9369b51eac0b00463da381b44f16a'],
 ['botanicalDivider',3,'oak','025fb1ede6ecc2426abf8154bdace5ce5e00eb9680e9929b71a626a49be05c3f'],
 ['botanicalDivider',4,'oak','828f9341b579c0bb3473d781f3772483a61e028a9226c674b91f4c684f2f94a0'],
 ['botanicalDivider',5,'oak','b191c36ad3f97c54cc6535df6bfad193152f92dcae7e100778f6fb6c860d842c'],
 ['botanicalDivider',6,'oak','628891944766b2cc8bac32de77c6ac2171d4aa9a64b45bd685a1e7d2167d6a6d'],
];
describe('Storage planter',()=>{
 it('maps soil with the same texture scale in both physical directions',()=>{
  for(const mode of ['archviz','editor'] as const){
   const root=createAssetObject('botanicalDivider',7,'white',mode),soil=root.getObjectByName('Planter_loose_soil') as Mesh;
   expect(soil).toBeDefined();const p=soil.geometry.getAttribute('position'),uv=soil.geometry.getAttribute('uv');
   const extent=(get:(i:number)=>number)=>{let min=Infinity,max=-Infinity;for(let i=0;i<p.count;i++){const x=get(i);min=Math.min(min,x);max=Math.max(max,x);}return max-min;};
   const xMeters=extent(i=>p.getX(i)),zMeters=extent(i=>p.getZ(i)),u=extent(i=>uv.getX(i)),v=extent(i=>uv.getY(i));
   expect(xMeters).toBeGreaterThan(1);expect(zMeters).toBeGreaterThan(.2);
   expect(Math.abs((u/xMeters)/(v/zMeters)-1)).toBeLessThan(.1);disposeAssetObject(root);
  }
 });
 it('forms individual spreading and curved leaves on curved stems in both render modes',()=>{
  for(const mode of ['archviz','editor'] as const){
   const root=createAssetObject('botanicalDivider',7,'white',mode);
   const foliage=root.getObjectByName('Planter_pothos_leaves') as Mesh,stems=root.getObjectByName('Planter_pothos_stems') as Mesh;
   expect(foliage).toBeDefined();expect(stems).toBeDefined();
   const material=foliage.material as MeshStandardMaterial;expect(material.side).toBe(FrontSide);expect(material.transparent).toBe(false);expect(material.depthTest).toBe(true);expect(material.depthWrite).toBe(true);
   // SSAO overrides visible materials with a FrontSide-only depth material.
   // Every blade must therefore have real reversed faces, not only DoubleSide.
   const ranges=foliage.userData.vertexRanges as [number,number][],position=foliage.geometry.getAttribute('position'),normal=foliage.geometry.getAttribute('normal');expect(ranges.length%2).toBe(0);
   for(let leaf=0;leaf<ranges.length/2;leaf++){
    const [front,count]=ranges[leaf],[back,backCount]=ranges[leaf+ranges.length/2];expect(backCount).toBe(count);
    for(let i=0;i<count;i+=Math.max(3,Math.floor(count/24/3)*3))for(const [a,b] of [[0,0],[1,2],[2,1]]){
     const p=new Vector3().fromBufferAttribute(position,front+i+a),q=new Vector3().fromBufferAttribute(position,back+i+b);
     const n=new Vector3().fromBufferAttribute(normal,front+i+a),m=new Vector3().fromBufferAttribute(normal,back+i+b);
     expect(p.distanceTo(q)).toBeLessThan(1e-6);expect(n.clone().add(m).length()).toBeLessThan(1e-5);
    }
   }
   function directions(mesh:Mesh,radialKey:'widthSegments'|'radialSegments'){
    const position=mesh.geometry.getAttribute('position'),lengthSegments=mesh.userData.lengthSegments,span=mesh.userData[radialKey]*6;
    const ranges=mesh.userData.vertexRanges as [number,number][];expect(ranges.length).toBeGreaterThanOrEqual(40);
    return ranges.map(([start,count])=>{
     expect(count).toBe(lengthSegments*span);
     const center=(segment:number)=>{const p=new Vector3();for(let i=start+segment*span;i<start+(segment+1)*span;i++)p.add(new Vector3().fromBufferAttribute(position,i));return p.multiplyScalar(1/span);};
     const first=center(0),middle=center(Math.floor(lengthSegments/2)),last=center(lengthSegments-1),direction=last.clone().sub(first);
     const straightMid=first.clone().add(last).multiplyScalar(.5);
     return {direction,curvature:middle.distanceTo(straightMid)};
    });
   }
   const leaves=directions(foliage,'widthSegments'),petioles=directions(stems,'radialSegments');
   const horizontal=leaves.filter(({direction:d})=>Math.hypot(d.x,d.z)>Math.abs(d.y)*1.5).length;
   expect(horizontal).toBeGreaterThan(leaves.length*.5);
   for(const axis of ['x','z'] as const){expect(leaves.some(({direction:d})=>d[axis]>.05)).toBe(true);expect(leaves.some(({direction:d})=>d[axis]<-.05)).toBe(true);}
   expect(leaves.filter(({curvature})=>curvature>.003).length).toBeGreaterThan(leaves.length*.5);
   expect(petioles.filter(({curvature})=>curvature>.001).length).toBeGreaterThan(petioles.length*.5);
   disposeAssetObject(root);
  }
 });
 it('does not alter the existing six screens or standalone planter geometry',()=>{
  for(const [asset,variant,material,expected] of previousGeometry){
   const root=createAssetObject(asset,variant,material),hash=createHash('sha256');
   root.traverse(object=>{if(!(object instanceof Mesh))return;hash.update(object.name);for(const name of ['position','normal','uv']){const attribute=object.geometry.getAttribute(name);if(attribute){const a=attribute.array;hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}}});
   expect(hash.digest('hex'),`${asset} ${variant}`).toBe(expected);disposeAssetObject(root);
  }
 });
});
