import type {SceneObject} from '../core/types';
/** Two approved sign types only. Each hall style uses a different corporate
 * design and a measured clear span between actual wall38 door openings. */
export function hallSigns(style=0):SceneObject[]{
 const faceZ=-5.123511505004883;
 const anchors=[[-9.19,8.83],[-15.72,-3.32],[2.67,8.83],[-9.19,-15.72],[8.83,2.67],[-3.32,8.83],[2.67,-3.32],[-15.72,2.67]][((style%8)+8)%8];
 return [
  {id:'HallTimeline',assetId:'edsTimeline',variant:style%8+1,x:anchors[0],y:1.65,depth:.035},
  {id:'HallUkraine',assetId:'edsUkraine',variant:style%8+1,x:anchors[1],y:1.68,depth:.04},
 ].map(s=>({id:s.id,assetId:s.assetId,variant:s.variant,material:'original',position:[s.x,s.y,faceZ+s.depth/2+.008],rotation:0,wallId:'wall-38',regionId:'hall'}));
}
