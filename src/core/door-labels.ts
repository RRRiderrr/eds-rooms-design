import type {SceneConfig} from './types';

export function defaultDoorPlaqueLabel(doorId:string):string {
 const number=doorId.match(/(?:door-)?(\d{2})$/)?.[1]??doorId;
 return number==='14'?'Вихід':['10','15'].includes(number)?'WC':number;
}

/** Apply the new wayfinding brief to old stock numbers once. Arbitrary custom
 * inscriptions, positions, finishes, and future edits are preserved. */
export function upgradeDoorLabels(config:SceneConfig):SceneConfig {
 if(config.doorLabelRevision===1)return config;
 const objects=config.objects.map(object=>{
  if(object.assetId!=='doorPlaque')return object;
  const number=object.id.match(/^hall-door-(10|14|15)-plaque$/)?.[1];
  if(!number||object.label?.trim()!==number)return object;
  return {...object,label:defaultDoorPlaqueLabel(number)};
 });
 return {...config,doorLabelRevision:1,objects};
}
