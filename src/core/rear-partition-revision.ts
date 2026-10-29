import type { SceneObject } from './types';

const previousPositions = [[-21.35,-3.90],[-21.85,-2.25],[-21.35,-.60],[-19.95,1.10]] as const;

/** Recognise only the previous prepared four-module arrangement. A user-moved
 * screen, an intentional deletion or another planting group is never migrated
 * silently; this is used by an explicit reversible correction action. */
export function hasPreviousRearPartitionLayout(objects:readonly SceneObject[]):boolean {
 return previousPositions.every(([x,z],index)=>{
  const object=objects.find(o=>o.id===`hall-rear-screen-${index+1}`);
  return object?.assetId==='botanicalDivider'&&object.variant>0&&
   Math.abs(object.position[0]-x)<.001&&Math.abs(object.position[1])<.001&&
   Math.abs(object.position[2]-z)<.001&&Math.abs(Math.sin(object.rotation-Math.PI/2))<.001&&
   Math.cos(object.rotation-Math.PI/2)>.999;
 });
}
