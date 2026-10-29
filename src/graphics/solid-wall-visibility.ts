import type {Vector3,Object3D} from 'three';
import {ROOM} from '../core/room';

/** A thick wall is a single occluder: cut away its outside, inside, caps and
 * outlines together. Per-face culling leaves the opposite skin floating. */
export function solidWallCutawayVisible(assembly:Object3D,camera:Vector3):boolean {
 const face=assembly.userData.cutawayFace??(assembly.name==='Meeting_Solid_west'
  ?{axis:'x',coordinate:ROOM.bounds.minX,normal:[1,0,0]}
  :assembly.name==='Meeting_Solid_east'?{axis:'x',coordinate:ROOM.bounds.maxX,normal:[-1,0,0]}:undefined);
 if(!face)return true;
 const axis=face.axis==='x'?0:2;
 return (camera.getComponent(axis)-face.coordinate)*face.normal[axis]>=-.001;
}

export function isSolidWallPart(object:Object3D):boolean {
 for(let node:Object3D|null=object;node;node=node.parent)if(node.userData.solidWallAssembly)return true;
 return false;
}
