import { parsePreset } from './schema';
import type { SceneConfig } from './types';
const DB='polycam-archviz-designs';const STORE='presets';
let connection:Promise<IDBDatabase>|undefined;
function db():Promise<IDBDatabase> {return connection??=new Promise((resolve,reject)=>{if(!globalThis.indexedDB){reject(new Error('IndexedDB недоступна. Для збереження експортуйте файл.'));return;}const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{request.result.createObjectStore(STORE,{keyPath:'presetId'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>{connection=undefined;reject(request.error??new Error('Не вдалося відкрити локальне сховище'));};request.onblocked=()=>reject(new Error('Закрийте стару вкладку проєкту для оновлення сховища'));});}
async function run<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(STORE,mode);const request=action(tx.objectStore(STORE));let value:T;request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error??request.error);tx.onabort=()=>reject(tx.error??new Error('Локальне збереження скасовано'));});}
export async function savePreset(config:SceneConfig,name=config.name,updateId?:string):Promise<SceneConfig> {
 if(updateId&&/^(builtin-|hall-preset-)/.test(updateId))throw new Error('Вбудовані пресети доступні лише для читання');
 const now=new Date().toISOString();const previous=updateId?await getPreset(updateId):undefined;
 const presetId=updateId??`user-${crypto.randomUUID()}`;
 const selection={presetId,basePresetId:presetId,modified:false};
 const value=parsePreset({...config,presetId,basePresetId:presetId,name:name.trim().slice(0,120)||'Мій дизайн',createdAt:previous?.createdAt??now,updatedAt:now,modified:false,regionPresets:{hall:{...selection},meeting:{...selection}}},{preserveIdentity:true}).config;
 value.modified=false;await run('readwrite',s=>s.put(value));return value;
}
export async function listPresets():Promise<SceneConfig[]> {const values=await run<unknown[]>('readonly',s=>s.getAll());return values.flatMap(v=>{try{return [{...parsePreset(v,{preserveIdentity:true}).config,modified:false}];}catch{return [];}}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
export async function getPreset(id:string):Promise<SceneConfig|undefined> {const value=await run<unknown>('readonly',s=>s.get(id));return value?{...parsePreset(value,{preserveIdentity:true}).config,modified:false}:undefined;}
export async function deletePreset(id:string):Promise<void> {if(/^(builtin-|hall-preset-)/.test(id))throw new Error('Вбудований пресет не можна видалити');await run('readwrite',s=>s.delete(id));}
export async function clearUserPresets():Promise<void> {await run('readwrite',s=>s.clear());}
