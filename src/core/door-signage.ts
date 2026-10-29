import {getVariant} from '../catalog/catalog';
import {HALL_LAYOUT,hallWallSurfaces} from './hall';
import type {SceneObject} from './types';

/** Upgrade the previous stock door layout, without resetting furniture or a
 * deliberately moved plaque. Old numbered paint records identify that layout. */
export function upgradeDoorSignage(objects:SceneObject[]):SceneObject[]{
 const byId=new Map(objects.map(o=>[o.id,o])),updates=new Map<string,SceneObject>();
 const walls=hallWallSurfaces();
 for(const door of HALL_LAYOUT.doors){
  const strip=byId.get(`hall-${door.id}-brand`),plaque=byId.get(`hall-${door.id}-plaque`);
  if(!strip||strip.assetId!=='brandDoorPanel'||!/^\d{1,2}$/.test(strip.label??'')||!strip.variant||!plaque?.variant||plaque.assetId!=='doorPlaque')continue;
  const wall=walls.find(w=>w.id===door.wallId);
  if(!wall||plaque.wallId!==wall.id||strip.wallId!==wall.id)continue;
  const axis=wall.axis==='x'?2:0;
  if(Math.abs(plaque.position[axis]-door.plaquePosition[axis])>.001)continue;
  const position=[...plaque.position] as SceneObject['position'];position[axis]=strip.position[axis];
  const normalAxis=wall.axis==='x'?0:2;
  position[normalAxis]=wall.coordinate+wall.normal[normalAxis]*(getVariant('doorPlaque',plaque.variant).dimensions[2]/2+.008);
  updates.set(plaque.id,{...plaque,position});
 }
 return objects.map(object=>{
  if(object.assetId==='brandDoorPanel'&&Object.hasOwn(object,'label')){const {label:_,...paint}=object;return paint;}
  return updates.get(object.id)??object;
 });
}
