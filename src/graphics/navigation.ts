import * as THREE from 'three';

const physicalCategories=new Set(['walls','ceiling','doors','windows','structure','columns']);
// Collision uses both triangle sides independently of a pane's visual opacity or sidedness.
const collisionMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});

/** Derive collision-only proxies from actual exported architecture triangles.
 * Never use a merged Space_windows/Space_structure batch's enclosing AABB: it
 * would close real passages between separate windows/columns. Furniture is absent.
 * Geometry is shared, never edited, and moving doors retain their live transforms. */
export function architectureCollisionMeshes(root:THREE.Object3D):THREE.Mesh[]{
 const meshes:THREE.Mesh[]=[];
 root.updateWorldMatrix(true,true);
 root.traverse(source=>{
  if(!(source instanceof THREE.Mesh))return;
  const category=String(source.userData.archCategory??'');
  if(!physicalCategories.has(category)&&!/^Wall_\d+_Clean|Ceiling_Corrugated_Deck|CLOSED_Leaf/.test(source.name))return;
  const proxy=source.clone(false);proxy.parent=null;proxy.material=collisionMaterial;proxy.matrixAutoUpdate=false;
  proxy.matrix.copy(source.matrixWorld);proxy.matrixWorld.copy(source.matrixWorld);
  const raycast=proxy.raycast;
  proxy.raycast=(raycaster,intersections)=>{
   // Physics is architectural: transparent/invisible glass materials do not create an aperture.
   // Reading the live matrix on each query also follows the animated hinge without a rebuild.
   source.updateWorldMatrix(true,false);proxy.matrix.copy(source.matrixWorld);proxy.matrixWorld.copy(source.matrixWorld);
   raycast.call(proxy,raycaster,intersections);
  };
  proxy.visible=true;proxy.userData={navigationCollider:true,sourceName:source.name,archCategory:category};meshes.push(proxy);
 });
 return meshes;
}

/** Swept camera clearance, sampled around the movement axis, at any camera height.
 * The centre ray prevents tunnelling through thin glass during fast movement;
 * the surrounding rays retain head clearance near frames and wall/door edges. */
export function architectureMoveAllowed(meshes:THREE.Mesh[],from:THREE.Vector3,to:THREE.Vector3,radius=.12):boolean{
 const direction=to.clone().sub(from),distance=direction.length();if(distance<1e-8)return true;
 direction.multiplyScalar(1/distance);
 const reference=Math.abs(direction.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
 const u=new THREE.Vector3().crossVectors(direction,reference).normalize(),v=new THREE.Vector3().crossVectors(direction,u).normalize();
 // Raycaster retains constructor vectors: never alias the live camera position.
 const ray=new THREE.Raycaster(from.clone(),direction.clone(),0,distance+radius);
 if(ray.intersectObjects(meshes,false).length)return false;
 for(let i=0;i<8;i++){
  const angle=i*Math.PI/4,origin=from.clone().addScaledVector(u,Math.cos(angle)*radius).addScaledVector(v,Math.sin(angle)*radius);
  ray.set(origin,direction);if(ray.intersectObjects(meshes,false).length)return false;
 }
 return true;
}
