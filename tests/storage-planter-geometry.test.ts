import {describe,expect,it} from 'vitest';
import {Box3,FrontSide,Mesh,MeshStandardMaterial,Vector3} from 'three';
import {createAssetObject,disposeAssetObject} from '../src/catalog/geometry';

/** Original models are independent of the new storage-planter planting. */
const previousGeometry:[string,number,string,number,number,number[],number[]][]=[
 ['separator',3,'oat',8,181668,[-7027.973,103214.530,91.632],[47542.796,103214.530,7171.209]],
 ['botanicalDivider',1,'oak',9,145116,[-1249.369,83498.205,310.752],[76936.416,83498.205,25402.640]],
 ['botanicalDivider',2,'oak',7,209988,[3509.287,253707.000,9.160],[102556.747,253707.000,28021.062]],
 ['botanicalDivider',3,'oak',6,134640,[1091.939,143067.039,328.066],[62652.588,143067.039,18445.307]],
 ['botanicalDivider',4,'oak',7,281520,[1400.081,295239.246,964.377],[126346.822,295239.246,45141.758]],
 ['botanicalDivider',5,'oak',8,168768,[-2897.238,206407.791,79.048],[91473.760,206407.791,21568.104]],
 ['botanicalDivider',6,'oak',7,123048,[-9185.198,140744.923,-309.551],[61228.653,140744.923,16787.128]],
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
  for(const [asset,variant,material,meshCount,vertexCount,expectedSums,expectedAbsSums] of previousGeometry){
   const root=createAssetObject(asset,variant,material),sums=[0,0,0],absoluteSums=[0,0,0];let meshes=0,vertices=0;
   root.traverse(object=>{if(!(object instanceof Mesh))return;meshes++;const p=object.geometry.getAttribute('position');vertices+=p.count;
    for(const name of ['normal','uv'])expect(object.geometry.getAttribute(name).count,`${asset} ${variant} ${name}`).toBe(p.count);
    for(let i=0;i<p.count;i++)for(let axis=0;axis<3;axis++){const n=p.getComponent(i,axis);sums[axis]+=n;absoluteSums[axis]+=Math.abs(n);}
   });
   expect(meshes,`${asset} ${variant} meshes`).toBe(meshCount);expect(vertices,`${asset} ${variant} vertices`).toBe(vertexCount);
   const size=new Box3().setFromObject(root).getSize(new Vector3()),dimensions=asset==='separator'?[1.1,.9,.3]:[2,2.3,.48];
   for(let axis=0;axis<3;axis++){
    expect(size.getComponent(axis),`${asset} ${variant} bounds`).toBeCloseTo(dimensions[axis],4);
    // Aggregate vertex moments retain strong shape sensitivity without relying
    // on bit-identical transcendental functions across Windows and Linux.
    expect(Math.abs(sums[axis]-expectedSums[axis]),`${asset} ${variant} centroid`).toBeLessThan(.25);
    expect(Math.abs(absoluteSums[axis]-expectedAbsSums[axis]),`${asset} ${variant} distribution`).toBeLessThan(.25);
   }
   disposeAssetObject(root);
  }
 },20_000);
});
