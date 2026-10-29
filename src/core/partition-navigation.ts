import { getVariant } from '../catalog/catalog';
import type { SceneObject } from './types';

interface Point3 { readonly x:number;readonly y:number;readonly z:number; }
type Point2=readonly[number,number];

/** Eye/head clearance matches the narrow architectural clearances without
 * treating the other movable furniture as a first-person barrier. */
export const PARTITION_CAMERA_RADIUS=.18;

function interval(a:number,b:number,min:number,max:number):[number,number]|undefined {
 const delta=b-a;
 if(Math.abs(delta)<1e-12)return a>=min&&a<=max?[0,1]:undefined;
 const first=(min-a)/delta,last=(max-a)/delta;
 const start=Math.max(0,Math.min(first,last)),end=Math.min(1,Math.max(first,last));
 return start<=end?[start,end]:undefined;
}
function pointSegmentDistanceSquared(p:Point2,a:Point2,b:Point2):number {
 const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
 const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length)):0;
 return(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dz)**2;
}
function pointBoxDistanceSquared(p:Point2,hx:number,hz:number):number {
 return Math.max(0,Math.abs(p[0])-hx)**2+Math.max(0,Math.abs(p[1])-hz)**2;
}
/** Exact horizontal swept-disc clearance, including rounded box corners. An
 * expanded AABB alone would incorrectly close usable diagonal access routes. */
function segmentBoxDistanceSquared(a:Point2,b:Point2,hx:number,hz:number):number {
 const x=interval(a[0],b[0],-hx,hx),z=interval(a[1],b[1],-hz,hz);
 if(x&&z&&Math.max(x[0],z[0])<=Math.min(x[1],z[1]))return 0;
 let distance=Math.min(pointBoxDistanceSquared(a,hx,hz),pointBoxDistanceSquared(b,hx,hz));
 for(const x of [-hx,hx])for(const z of [-hz,hz])distance=Math.min(distance,pointSegmentDistanceSquared([x,z],a,b));
 return distance;
}

/** Continuous collision for purpose-built, floor-standing privacy partitions.
 * The current config is the authority: moving, rotating, hiding (variant 0), or
 * deleting a screen changes navigation immediately, without cached mesh bounds.
 * Clip the sweep to its occupied height before checking the rotated footprint,
 * so flying over the screen remains possible and fast/reverse moves cannot tunnel.
 */
export function partitionMoveAllowed(objects:readonly SceneObject[],from:Point3,to:Point3,radius=PARTITION_CAMERA_RADIUS):boolean {
 for(const object of objects){
  if(object.assetId!=='botanicalDivider'||object.variant===0)continue;
  const[width,height,depth]=getVariant(object.assetId,object.variant).dimensions;
  const vertical=interval(from.y,to.y,object.position[1]-radius,object.position[1]+height+radius);
  if(!vertical)continue;
  const c=Math.cos(object.rotation),s=Math.sin(object.rotation);
  const local=(t:number):Point2=>{
   const dx=from.x+(to.x-from.x)*t-object.position[0],dz=from.z+(to.z-from.z)*t-object.position[2];
   return[dx*c-dz*s,dx*s+dz*c];
  };
  if(segmentBoxDistanceSquared(local(vertical[0]),local(vertical[1]),width/2,depth/2)<=radius*radius+1e-12)return false;
 }
 return true;
}

/** Used for camera focus and “Запустити ArchViz тут” destinations as well as
 * ordinary movement, preventing a teleport from placing the eye inside a screen. */
export function partitionPointAllowed(objects:readonly SceneObject[],point:Point3,radius=PARTITION_CAMERA_RADIUS):boolean {
 return partitionMoveAllowed(objects,point,point,radius);
}
