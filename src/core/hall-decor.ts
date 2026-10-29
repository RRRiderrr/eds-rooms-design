import {defaultDoorPlaqueLabel} from './door-labels';
import {hallSigns} from '../catalog/hall-signs';
import {hallClocks} from '../catalog/hall-clocks';
import {getAsset} from '../catalog/catalog';
import {objectRegion} from './regions';
import type {SceneConfig,SceneObject} from './types';

/** One-time customer revision of stored designs, scoped to hall signage only.
 * The marker is exported, so subsequent edits, custom multiline plaque text
 * and deliberate deletions survive reload/import without being re-created. */
export function upgradeHallDecor(config:SceneConfig):SceneConfig {
 if(config.hallDecorRevision===1)return config;
 const style=Number(config.regionPresets.hall.presetId.match(/^hall-preset-(\d+)$/)?.[1]??0)%8;
 const legacyHall=config.objects.some(o=>objectRegion(o)==='hall'&&['edsSignage','doorPlaque','brandDoorPanel'].includes(o.assetId));
 if(!legacyHall)return {...config,hallDecorRevision:1};
 const retained:SceneObject[]=config.objects.filter(o=>{
  if(objectRegion(o)!=='hall')return true;
  return getAsset(o.assetId).category!=='signage'||['doorPlaque','brandDoorPanel'].includes(o.assetId);
 }).map(o=>{
  if(o.assetId!=='doorPlaque'||objectRegion(o)!=='hall')return o;
  const number=o.id.match(/^hall-door-(\d+)-plaque$/)?.[1]??o.label?.match(/\d+/)?.[0]??'';
  return {...o,label:defaultDoorPlaqueLabel(number)};
 });
 const signs=hallSigns(style).map(sign=>{
  const previous=config.objects.find(o=>o.id===sign.id&&objectRegion(o)==='hall');
  // Both approved designs retain their original physical size. Preserve a
  // user's existing anchoring while applying the new corporate composition.
  return previous?{...sign,wallId:previous.wallId,position:[...previous.position] as SceneObject['position'],rotation:previous.rotation}:sign;
 });
 const hasFeatureClock=retained.some(o=>o.id==='HallFeatureClock');
 return {...config,hallDecorRevision:1,objects:[...retained,...signs,...(hasFeatureClock?[]:hallClocks(style))]};
}
