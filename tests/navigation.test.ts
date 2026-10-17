import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {architectureCollisionMeshes,architectureMoveAllowed} from '../src/graphics/navigation';

type Metadata={name:string;category:string};
const asset=(name:string)=>new URL(`../public/assets/architecture/${name}`,import.meta.url);
const roomMetadata=JSON.parse(readFileSync(asset('room.json'),'utf8'));
const spaceMetadata=JSON.parse(readFileSync(asset('scene-space.json'),'utf8'));
let room:THREE.Group,space:THREE.Group;
async function load(name:string,nodes:Metadata[]){
 const data=readFileSync(asset(name)),array=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 const result=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(array,'');
 result.scene.traverse(object=>{const meta=nodes.find(n=>n.name===object.name)||nodes.find(n=>object.name.startsWith(n.name+'_'));object.userData.archCategory=meta?.category??object.parent?.userData.archCategory;});
 result.scene.updateWorldMatrix(true,true);return result.scene;
}
function windowMesh(group:THREE.Group,pattern:RegExp){
 let found:THREE.Mesh|undefined;
 group.traverse(object=>{if(found||!(object instanceof THREE.Mesh))return;const materials=Array.isArray(object.material)?object.material:[object.material];if(object.userData.archCategory==='windows'&&materials.some(m=>pattern.test(m.name)))found=object;});
 expect(found,'Actual exported window primitive is required').toBeDefined();return found!;
}
function verticalSurface(mesh:THREE.Mesh){
 const positions=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index;
 const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],isPane=materials.some(m=>/06_WINDOW_PANES/.test(m.name));
 for(let i=0;i<(indices?.count??positions.count);i+=3){
  const vertices=[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(positions,indices?indices.getX(i+offset):i+offset).applyMatrix4(mesh.matrixWorld));
  const cross=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
  const area=cross.length();if(area<.001||Math.abs(cross.clone().normalize().y)>.05)continue;
  if(isPane&&area<.05)continue;
  const normal=cross.normalize();
  return{point:vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1/3),normal};
 }throw new Error(`No vertical physical surface in ${mesh.name}`);
}
beforeAll(async()=>{[room,space]=await Promise.all([load('room.meshopt.glb',roomMetadata.nodes),load('space.meshopt.glb',spaceMetadata.nodes)]);});

describe('Actual architecture navigation collision',()=>{
 for(const[name,getGroup]of [['lounge',()=>room],['another full-space window',()=>space]] as const){
  it(`blocks ${name} glazing from both sides at walking and raised camera heights`,()=>{
   const group=getGroup(),panes=windowMesh(group,/06_WINDOW_PANES/),{point,normal}=verticalSurface(panes);
   expect(Math.abs(normal.z)).toBeGreaterThan(.9);
   const collisions=architectureCollisionMeshes(group);expect(collisions.some(m=>m.name===panes.name)).toBe(true);
   for(const height of [1.65,2.4]){
    const centre=point.clone();centre.y=height;
    const inside=centre.clone().addScaledVector(normal,.45),outside=centre.clone().addScaledVector(normal,-.45);
    expect(architectureMoveAllowed(collisions,inside,outside),`${name}, y=${height}, forward`).toBe(false);
    expect(architectureMoveAllowed(collisions,outside,inside),`${name}, y=${height}, reverse`).toBe(false);
   }
  });
 }
 it('keeps actual high window frames physical without modifying their materials',()=>{
  const frame=windowMesh(room,/05_WINDOW_FRAMES/),material=frame.material,{point,normal}=verticalSurface(frame);
  const collisions=architectureCollisionMeshes(room);
  expect(architectureMoveAllowed(collisions,point.clone().addScaledVector(normal,.4),point.clone().addScaledVector(normal,-.4))).toBe(false);
  expect(frame.material).toBe(material);expect(collisions.find(m=>m.name===frame.name)?.geometry).toBe(frame.geometry);
 });
 it('follows the actual animated door hinge and preserves its open aperture',()=>{
  const hinge=room.getObjectByName(roomMetadata.door.node)!;expect(hinge).toBeDefined();
  const colliders=architectureCollisionMeshes(room),from=new THREE.Vector3(1.95,1.65,-2.65),to=new THREE.Vector3(1.95,1.65,-3.55);
  hinge.rotation.y=roomMetadata.door.closedAngle;expect(architectureMoveAllowed(colliders,from,to)).toBe(false);
  hinge.rotation.y=roomMetadata.door.openAngle;
  try{
   expect(architectureMoveAllowed(colliders,from,to)).toBe(true);
   expect(architectureMoveAllowed(colliders,new THREE.Vector3(1,1.65,-2.65),new THREE.Vector3(1,1.65,-3.55))).toBe(false);
  }finally{hinge.rotation.y=roomMetadata.door.closedAngle;}
 });
 it('tests actual triangles, leaving gaps in merged window batches and furniture nonblocking',()=>{
  const architecture=new THREE.Group(),batch=new THREE.Group();batch.userData.archCategory='windows';architecture.add(batch);
  const originalMaterial=new THREE.MeshStandardMaterial({transparent:true,opacity:0,side:THREE.FrontSide});
  for(const x of [-2,2]){const pane=new THREE.Mesh(new THREE.PlaneGeometry(1,2),originalMaterial);pane.position.set(x,2,0);pane.userData.archCategory='windows';batch.add(pane);}
  const desk=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());desk.name='Desk_01';desk.position.set(0,1.65,0);desk.userData.archCategory='existingFurniture';architecture.add(desk);
  const colliders=architectureCollisionMeshes(architecture);
  expect(colliders).toHaveLength(2);
  expect(architectureMoveAllowed(colliders,new THREE.Vector3(0,1.65,-1),new THREE.Vector3(0,1.65,1))).toBe(true);
  expect(architectureMoveAllowed(colliders,new THREE.Vector3(-2,2,-1),new THREE.Vector3(-2,2,1))).toBe(false);
  expect(architectureMoveAllowed(colliders,new THREE.Vector3(-2,2,1),new THREE.Vector3(-2,2,-1))).toBe(false);
  expect(originalMaterial.opacity).toBe(0);expect(originalMaterial.side).toBe(THREE.FrontSide);
 });
 it('does not mutate the live camera position or destination during clearance sampling',()=>{
  const from=new THREE.Vector3(.2,1.65,.3),to=new THREE.Vector3(.2,1.65,.5),before=from.clone(),destination=to.clone();
  expect(architectureMoveAllowed([],from,to)).toBe(true);
  expect(from.toArray()).toEqual(before.toArray());expect(to.toArray()).toEqual(destination.toArray());
 });
});
