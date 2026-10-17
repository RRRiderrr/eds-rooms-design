import { ASSETS, getAsset } from '../catalog/catalog';
import { DEFAULT_LAYERS, PROJECT_ID, type SceneConfig, type SceneObject } from './types';
export const MAX_PRESET_BYTES=512_000;
function record(value:unknown):value is Record<string,unknown> {return !!value&&typeof value==='object'&&!Array.isArray(value);}
function text(value:unknown,fallback:string,max=120):string {return typeof value==='string'?value.slice(0,max):fallback;}
function finite(value:unknown):value is number {return typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<1000;}
export interface ImportResult { config:SceneConfig; warnings:string[]; }
export function migratePreset(input:unknown):unknown {
 if(!record(input))throw new Error('Файл не містить конфігурації');
 if(input.schemaVersion===0) return {...input,schemaVersion:1,roomId:input.roomId??'lounge-room-01',basePresetId:input.basePresetId??'builtin-0',modified:true,doorOpen:input.doorOpen===true,layers:{...DEFAULT_LAYERS,...(record(input.layers)?input.layers:{})},objects:Array.isArray(input.objects)?input.objects.map(o=>record(o)?{...o,variant:o.variant??1,material:o.material??'oat'}:o):[]};
 return input;
}
export function parsePreset(input:string|unknown):ImportResult {
 if(typeof input==='string') {if(new TextEncoder().encode(input).length>MAX_PRESET_BYTES)throw new Error('Файл пресета завеликий');try{input=JSON.parse(input);}catch{throw new Error('Файл містить некоректний JSON');}}
 const data=migratePreset(input);if(!record(data)||data.schemaVersion!==1)throw new Error('Ця версія схеми пресета поки не підтримується');
 if(data.projectId!==PROJECT_ID)throw new Error('Цей пресет належить іншому проєкту');
 if(data.roomId!=='lounge-room-01')throw new Error('Цей пресет призначений для іншого простору');
 if(!Array.isArray(data.objects)||data.objects.length>250)throw new Error('Некоректний список предметів');
 const ids=new Set<string>(),warnings:string[]=[];const objects:SceneObject[]=[];
 for(const entry of data.objects) {
  if(!record(entry))throw new Error('Некоректний предмет');
  const asset=ASSETS.find(a=>a.id===entry.assetId);if(!asset){warnings.push(`Пропущено недоступний об’єкт: ${text(entry.assetId,'unknown')}`);continue;}
  const id=text(entry.id,'',80);if(!id||!/^[A-Za-z0-9_-]+$/.test(id)||ids.has(id))throw new Error('ID предметів мають бути унікальними');ids.add(id);
  if(!Array.isArray(entry.position)||entry.position.length!==3||!entry.position.every(finite)||!finite(entry.rotation))throw new Error('Некоректні координати предмета');
  let variant=typeof entry.variant==='number'&&Number.isInteger(entry.variant)?entry.variant:0;
  if(!asset.variants.some(v=>v.index===variant)){warnings.push(`Варіант ${asset.id}:${variant} недоступний; вибрано 0 / Немає`);variant=0;}
  const material=asset.materials.find(m=>m.id===entry.material)?.id??asset.materials[0].id;
  const wallValue=text(entry.wallId,''),wallId=['west','east','near','far'].includes(wallValue)||/^wall-\d+$/.test(wallValue)?wallValue:undefined;
  if(asset.placement==='wall'&&!wallId&&variant>0) {warnings.push(`${asset.label}: немає кріплення до стіни; вибрано 0 / Немає`);variant=0;}
  objects.push({id,assetId:asset.id,variant,material,position:entry.position as [number,number,number],rotation:entry.rotation,...(wallId?{wallId}:{})});
 }
 const now=new Date().toISOString(),layers={...DEFAULT_LAYERS};if(record(data.layers))for(const key of Object.keys(layers) as (keyof typeof layers)[])if(typeof data.layers[key]==='boolean')layers[key]=data.layers[key] as boolean;
 const safeDate=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():now;
 const suppliedId=text(data.presetId,'imported');
 const config:SceneConfig={schemaVersion:1,projectId:PROJECT_ID,roomId:'lounge-room-01',presetId:suppliedId.startsWith('builtin-')?`imported-${crypto.randomUUID()}`:suppliedId,name:text(data.name,'Імпортований дизайн'),createdAt:safeDate(data.createdAt),updatedAt:safeDate(data.updatedAt),basePresetId:text(data.basePresetId,'builtin-0'),modified:true,objects,doorOpen:data.doorOpen===true,layers};
 return {config,warnings};
}
export function serializePreset(config:SceneConfig):string {const safe=parsePreset(config).config;return JSON.stringify(safe,null,2);}
export const exportPreset=serializePreset;
export const importPreset=parsePreset;
export function validateAssetId(id:string):boolean {try{return !!getAsset(id);}catch{return false;}}
