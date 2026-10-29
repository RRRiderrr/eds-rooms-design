import {upgradeDoorLabels} from './core/door-labels';
import {upgradeHallDecor} from './core/hall-decor';
import { parsePreset } from './core/schema';
import { clonePreset,BUILTIN_PRESETS,HALL_PRESETS } from './catalog/presets';
import {objectRegion,regionWallFinishes,wallRegion} from './core/regions';
import type { DesignRegionId,SceneConfig } from './core/types';
let connection:Promise<IDBDatabase>|undefined;
function database(){return connection??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('room-atelier-session',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
/** Updates built-in designs after a site release while preserving user edits.
 * Old immutable drafts otherwise silently hid newly added TVs and layout fixes. */
export function currentDraft(config:SceneConfig):SceneConfig {
 const safe=upgradeDoorLabels(upgradeHallDecor(config.schemaVersion===2?config:parsePreset(config,{preserveIdentity:true}).config));
 if(safe.modified||![...BUILTIN_PRESETS,...HALL_PRESETS].some(p=>p.presetId===safe.presetId))return safe;
 const fresh=structuredClone(safe);
 for(const region of ['hall','meeting'] as DesignRegionId[]){
  const selected=safe.regionPresets[region];
  if(selected.modified||![...BUILTIN_PRESETS,...HALL_PRESETS].some(p=>p.presetId===selected.presetId))continue;
  const source=clonePreset(selected.presetId);
  fresh.objects=[...fresh.objects.filter(o=>objectRegion(o)!==region),...source.objects.filter(o=>objectRegion(o)===region)];
  fresh.wallFinishes={...Object.fromEntries(Object.entries(fresh.wallFinishes).filter(([id])=>wallRegion(id)!==region)),...regionWallFinishes(source.wallFinishes,region)};
 }
 return fresh;
}
export async function readDraft():Promise<SceneConfig|undefined>{try{const db=await database();const raw=await new Promise<unknown>((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(!raw)return;return currentDraft(parsePreset(raw,{preserveIdentity:true}).config);}catch{return;}}
export async function writeDraft(config:SceneConfig){try{const value=parsePreset(config,{preserveIdentity:true}).config;const db=await database();await new Promise<void>((resolve,reject)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(structuredClone(value),'latest');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}catch{/* Explicit Save/Export reports storage failures; a private browsing draft must never break editing. */}}
