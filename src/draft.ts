import { parsePreset } from './core/schema';
import { clonePreset,BUILTIN_PRESETS } from './catalog/presets';
import type { SceneConfig } from './core/types';
let connection:Promise<IDBDatabase>|undefined;
function database(){return connection??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('room-atelier-session',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
/** Updates built-in designs after a site release while preserving user edits.
 * Old immutable drafts otherwise silently hid newly added TVs and layout fixes. */
export function currentDraft(config:SceneConfig):SceneConfig {
 if(config.modified||!BUILTIN_PRESETS.some(p=>p.presetId===config.presetId))return config;
 const fresh=clonePreset(config.presetId);fresh.layers={...config.layers};fresh.doorOpen=config.doorOpen;return fresh;
}
export async function readDraft():Promise<SceneConfig|undefined>{try{const db=await database();const raw=await new Promise<SceneConfig|undefined>((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(!raw)return;const config=parsePreset(raw).config;config.presetId=raw.presetId;config.modified=raw.modified;return currentDraft(config);}catch{return;}}
export async function writeDraft(config:SceneConfig){try{const db=await database();await new Promise<void>((resolve,reject)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(structuredClone(config),'latest');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}catch{/* Explicit Save/Export reports storage failures; a private browsing draft must never break editing. */}}
