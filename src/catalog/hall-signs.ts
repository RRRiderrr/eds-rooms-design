import type {SceneObject} from '../core/types';
/** Measured Wall_38_Clean face and five actual clear spans between door holes. */
export function hallSigns():SceneObject[]{
 const faceZ=-5.123511505004883;
 return [
  {id:'HallCorporate',variant:2,x:-15.72,y:1.72,depth:.025},
  {id:'HallTimeline',variant:1,x:-9.19,y:1.65,depth:.035},
  {id:'HallWorldMap',variant:3,x:-3.32,y:1.66,depth:.028},
  {id:'HallSalesPlan',variant:4,x:2.67,y:1.67,depth:.040},
  {id:'HallUkraine',variant:5,x:8.83,y:1.68,depth:.040},
 ].map(s=>({id:s.id,assetId:'edsSignage',variant:s.variant,material:'original',position:[s.x,s.y,faceZ+s.depth/2+.008],rotation:0,wallId:'wall-38'}));
}
