import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {configureSpace,getPlacementSurfaces,SPACE} from '../src/core/space';
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dequantize} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import {repairMeetingWallAssemblies,repairMeetingWallManifest,MEETING_SOLID_WALL_IDS} from '../src/graphics/meeting-solid-walls';

async function source(file:string){
 await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const doc=await io.read(new URL(`../public/assets/architecture/${file}.glb`,import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));await doc.transform(dequantize());const group=new THREE.Group();
 for(const node of doc.getRoot().listNodes()){
  if(!/^(Wall_\d+_(Clean|Top_Steel_Beam)|Space_ceiling)$/.test(node.getName()))continue;
  const mesh=node.getMesh();if(!mesh)continue;
  for(const primitive of mesh.listPrimitives()){
   const geometry=new THREE.BufferGeometry();for(const [input,output,size]of [['POSITION','position',3],['NORMAL','normal',3],['TEXCOORD_0','uv',2],['TEXCOORD_1','uv1',2]] as const){const accessor=primitive.getAttribute(input);if(accessor)geometry.setAttribute(output,new THREE.Float32BufferAttribute(accessor.getArray()!,size));}
   const index=primitive.getIndices();if(index)geometry.setIndex(Array.from(index.getArray()!));geometry.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
   const material=new THREE.MeshStandardMaterial();material.name=primitive.getMaterial()?.getName()??'';const object=new THREE.Mesh(geometry,material);object.name=node.getName();object.userData={...node.getExtras()};group.add(object);
  }
 }
 return group;
}
function edgeCounts(group:THREE.Object3D){const counts=new Map<string,number>(),point=(v:THREE.Vector3)=>v.toArray().map(n=>Math.round(n*10000)).join(',');group.updateMatrixWorld(true);group.traverse(o=>{
 if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),idx=o.geometry.index;
 for(let i=0;i<(idx?.count??p.count);i+=3){const points=[0,1,2].map(j=>point(new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+j):i+j).applyMatrix4(o.matrixWorld)));for(const [a,b]of [[0,1],[1,2],[2,0]]){const key=[points[a],points[b]].sort().join('|');counts.set(key,(counts.get(key)??0)+1);}}
 });return counts;}
let room:THREE.Group,space:THREE.Group,report:ReturnType<typeof repairMeetingWallAssemblies>;
beforeAll(async()=>{[room,space]=await Promise.all([source('room'),source('space')]);report=repairMeetingWallAssemblies(room,space);room.updateMatrixWorld(true);},20000);
describe('Real measured meeting walls become continuous thick solids',()=>{
 it('closes both original cavities with no internal faces, holes or nonmanifold edges',()=>{
  expect(report.assemblies).toHaveLength(3);
  for(const name of ['west','east','near']){const assembly=room.getObjectByName(`Meeting_Solid_${name}`)!;expect(assembly).toBeDefined();const edges=edgeCounts(assembly);expect(edges.size).toBeGreaterThan(30);expect([...edges.entries()].filter(([,count])=>count!==2)).toEqual([]);}
  const west=report.assemblies.find(a=>a.name.endsWith('west'))!,east=report.assemblies.find(a=>a.name.endsWith('east'))!;
  expect(west.volume).toBeGreaterThan(13);expect(east.volume).toBeGreaterThan(16);
 });
 it('retains exact exposed inner/outer wall planes, while eliminating the opposing thin skins',()=>{
  room.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.solidAssemblyPart)(o.material as THREE.Material).side=THREE.DoubleSide;});
  const ray=(x:number,direction:number)=>new THREE.Raycaster(new THREE.Vector3(x,1.5,0),new THREE.Vector3(direction,0,0),0,10).intersectObject(room,true).filter(hit=>(hit.object as THREE.Mesh).userData.solidAssemblyPart).map(hit=>hit.point.x);
  for(const [x,d,expected]of [[0,-1,-2.6018],[0,1,2.6018],[-4,1,-3.299],[4,-1,3.4173]])expect(ray(x,d)[0]).toBeCloseTo(expected,4);
  // A point within the former gap is now inside the closed solid: the next
  // ray exit is the actual external boundary, with no former interior face.
  expect(ray(-2.9,-1)[0]).toBeCloseTo(-3.299,4);expect(ray(3.0,1)[0]).toBeCloseTo(3.4173,4);
 });
 it('preserves semantic wall IDs, metre UVs and the original near-door aperture',()=>{
  expect(space.userData.removedMeetingWallBeamTriangles).toBeGreaterThan(0);
  for(const id of Object.values(MEETING_SOLID_WALL_IDS).flat()){const found:THREE.Mesh[]=[];room.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.wallId===id)found.push(o);});expect(found.length,`${id}: surface remains paintable`).toBeGreaterThan(0);for(const part of found){expect(part.geometry.getAttribute('uv').count).toBe(part.geometry.getAttribute('position').count);expect(part.geometry.getAttribute('uv1').count).toBe(part.geometry.getAttribute('position').count);}}
  const near=room.getObjectByName('Meeting_Solid_near')!;expect(near).toBeDefined();const opening=new THREE.Raycaster(new THREE.Vector3(1.95,1,-4),new THREE.Vector3(0,0,1),0,2).intersectObject(near);expect(opening).toHaveLength(0);
 });
 it('continues the flush 3m material band around both hall-facing sides and all front corners',()=>{
  const ray=(origin:number[],direction:number[])=>new THREE.Raycaster(new THREE.Vector3(...origin as [number,number,number]),new THREE.Vector3(...direction as [number,number,number]),0,4).intersectObject(room,true).find(h=>h.object.userData.solidAssemblyPart);
  for(const [x,d]of [[-4,1],[4,-1]])for(const z of [-2,0,2]){
   const low=ray([x,2.8,z],[d,0,0])!,high=ray([x,3.2,z],[d,0,0])!,top=ray([x,4.1,z],[d,0,0])!;
   expect(low).toBeDefined();expect(high).toBeDefined();expect(top).toBeDefined();
   expect(low.object.userData.wallSurfaceRole).toBe('plaster');expect(high.object.userData.wallSurfaceRole).toBe('upper-band');
   expect(high.point.x).toBeCloseTo(low.point.x,5);expect(top.point.x).toBeCloseTo(low.point.x,5);
  }
  for(const x of [-3.05,0,3.05]){
   const low=ray([x,2.8,-4.5],[0,0,1])!,high=ray([x,3.2,-4.5],[0,0,1])!;
   expect(low.object.userData.wallSurfaceRole).toBe('plaster');expect(high.object.userData.wallSurfaceRole).toBe('upper-band');expect(low.point.z).toBeCloseTo(high.point.z,5);
  }
  room.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.solidAssemblyPart){expect(o.userData.forceNoBake).toBe(true);expect(o.userData.continuousWallLighting).toBe(true);const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),uv=o.geometry.getAttribute('uv');for(let i=0;i<p.count;i++){if(Math.abs(n.getY(i))<.5){expect(uv.getY(i)).toBeCloseTo(p.getY(i),5);expect(uv.getX(i)).toBeCloseTo(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i),5);}}}});
  expect(room.getObjectByName('Wall_5_Top_Steel_Beam_Levelled')).toBeUndefined();expect(room.getObjectByName('Wall_28_Top_Steel_Beam_Levelled')).toBeUndefined();
 });
 it('keeps wall mounting on exposed faces and makes the newly filled volumes non-walkable',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf-8'));
  repairMeetingWallManifest(manifest,report);configureSpace(manifest);
  const surfaces=getPlacementSurfaces();
  for(const id of ['west','east'])expect(surfaces.find(w=>w.id===id)!.coordinate).toBeCloseTo(id==='west'?-2.6018175:2.6018175,6);
  for(const id of ['wall-2','wall-17']){const wall=surfaces.find(w=>w.id===id)!;expect(wall.coordinate).toBeCloseTo(-3.299,4);expect(wall.normal.map(n=>n||0)).toEqual([-1,0,0]);}
  for(const id of ['wall-19','wall-26']){const wall=surfaces.find(w=>w.id===id)!;expect(wall.coordinate).toBeCloseTo(3.4173,4);expect(wall.normal.map(n=>n||0)).toEqual([1,0,0]);}
  for(const x of [-2.9,3])expect(SPACE.obstacles.some(o=>o.minX<x&&o.maxX>x&&o.minZ<0&&o.maxZ>0)).toBe(true);
  repairMeetingWallManifest(manifest,report);expect(manifest.navigation.obstacles.filter((o:{id:string})=>o.id.startsWith('meeting-solid-fill'))).toHaveLength(4);
 });

 it('also produces closed solids from the actual quantized production files',async()=>{
  const [productionRoom,productionSpace]=await Promise.all([source('room.meshopt'),source('space.meshopt')]);
  const actual=repairMeetingWallAssemblies(productionRoom,productionSpace);expect(actual.assemblies).toHaveLength(3);
  for(const name of ['west','east','near'])expect([...edgeCounts(productionRoom.getObjectByName(`Meeting_Solid_${name}`)!).values()].filter(count=>count!==2)).toEqual([]);
 },20000);

 it('assigns one inward cutaway plane to each complete thick wall, including all caps and outlines',()=>{
  for(const [name,axis,coordinate,normal]of [['west','x',-2.6018,[1,0,0]],['east','x',2.6018,[-1,0,0]],['near','z',-3.0489,[0,0,1]]] as const){
   const group=room.getObjectByName(`Meeting_Solid_${name}`)!;
   expect(group.userData.cutawayFace).toEqual({axis,coordinate,normal:[...normal]});
   expect(group.children.every(o=>o.userData.solidWallAssemblyId===group.name)).toBe(true);
  }
 });
});
