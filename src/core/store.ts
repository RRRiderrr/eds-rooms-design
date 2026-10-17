import { clonePreset } from '../catalog/presets';
import { getAsset,getVariant } from '../catalog/catalog';
import {findAccessorySupport} from './placement';
import type { LayerVisibility, SceneConfig, SceneObject, SceneStoreSnapshot } from './types';
type Listener=(snapshot:SceneStoreSnapshot)=>void;
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export class SceneStore {
 private current:SceneConfig;private undoStack:SceneConfig[]=[];private redoStack:SceneConfig[]=[];private listeners=new Set<Listener>();private batchStart:SceneConfig|null=null;private baselines=new Map<string,SceneConfig>();
 constructor(initial:SceneConfig=clonePreset(1)){this.current=copy(initial);this.registerBaseline(initial);}
 registerBaseline(config:SceneConfig):void {this.baselines.set(config.presetId,config.presetId.startsWith('builtin-')?clonePreset(config.presetId):copy(config));}
 get state():SceneConfig {return this.current;}
 get config():SceneConfig {return this.current;}
 get canUndo():boolean{return this.undoStack.length>0;}
 get canRedo():boolean{return this.redoStack.length>0;}
 get snapshot():SceneStoreSnapshot {return {config:this.current,canUndo:this.canUndo,canRedo:this.canRedo};}
 subscribe(listener:Listener):()=>void {this.listeners.add(listener);listener(this.snapshot);return()=>this.listeners.delete(listener);}
 private notify():void {for(const l of this.listeners)l(this.snapshot);}
 private change(update:(config:SceneConfig)=>void,record=true):void {if(record&&!this.batchStart){this.undoStack.push(copy(this.current));if(this.undoStack.length>80)this.undoStack.shift();this.redoStack=[];}this.current=copy(this.current);update(this.current);this.current.modified=true;this.current.updatedAt=new Date().toISOString();this.notify();}
 beginTransaction():void {if(!this.batchStart)this.batchStart=copy(this.current);}
 endTransaction():void {if(!this.batchStart)return;if(JSON.stringify(this.batchStart.objects)!==JSON.stringify(this.current.objects)){this.undoStack.push(this.batchStart);this.redoStack=[];}this.batchStart=null;this.notify();}
 cancelTransaction():void {if(this.batchStart){this.current=this.batchStart;this.batchStart=null;this.notify();}}
 applyPreset(preset:SceneConfig|string|number):void {const target=clonePreset(preset);this.undoStack.push(copy(this.current));this.redoStack=[];this.current=target;this.baselines.set(target.presetId,copy(target));this.notify();}
 resetToPreset():void {const baseline=this.baselines.get(this.current.basePresetId)??this.baselines.get(this.current.presetId);this.applyPreset(baseline??this.current.basePresetId);}
 replace(config:SceneConfig):void {this.applyPreset(config);}
 upsert(object:SceneObject,record=true):void {
  getAsset(object.assetId);const previous=this.current.objects.find(o=>o.id===object.id);
  const supported=previous?this.current.objects.filter(o=>o.variant>0&&getAsset(o.assetId).collision==='accessory'&&findAccessorySupport(o,this.current.objects)?.id===object.id):[];
  this.change(s=>{const i=s.objects.findIndex(o=>o.id===object.id);if(i<0)s.objects.push(copy(object));else s.objects[i]=copy(object);
   if(previous)for(const original of supported){const child=s.objects.find(o=>o.id===original.id)!;if(object.variant===0){child.variant=0;continue;}const angle=object.rotation-previous.rotation,c=Math.cos(angle),sn=Math.sin(angle),dx=original.position[0]-previous.position[0],dz=original.position[2]-previous.position[2];child.position=[object.position[0]+dx*c+dz*sn,object.position[1]+getVariant(object.assetId,object.variant).dimensions[1],object.position[2]-dx*sn+dz*c];child.rotation=original.rotation+angle;if(!findAccessorySupport(child,s.objects))child.variant=0;}
  },record);
 }
 updateObject(id:string,patch:Partial<SceneObject>,record=true):void {const obj=this.current.objects.find(o=>o.id===id);if(obj)this.upsert({...obj,...patch,id:obj.id},record);}
 remove(id:string):void {const supported=new Set(this.current.objects.filter(o=>o.variant>0&&getAsset(o.assetId).collision==='accessory'&&findAccessorySupport(o,this.current.objects)?.id===id).map(o=>o.id));this.change(s=>{s.objects=s.objects.filter(o=>o.id!==id).map(o=>supported.has(o.id)?{...o,variant:0}:o);});}
 duplicate(id:string):SceneObject|undefined {const source=this.current.objects.find(o=>o.id===id);if(!source)return;const object={...copy(source),id:`${source.assetId}-${crypto.randomUUID()}`,position:[source.position[0]+.25,source.position[1],source.position[2]+.25] as [number,number,number]};this.upsert(object);return object;}
 setDoor(open:boolean):void {this.change(s=>{s.doorOpen=open;});}
 setLayers(patch:Partial<LayerVisibility>):void {this.change(s=>{s.layers={...s.layers,...patch};},false);}
 markSaved(config:SceneConfig):void {this.current={...copy(config),basePresetId:config.presetId,modified:false};this.baselines.set(config.presetId,copy(this.current));this.notify();}
 undo():void {const previous=this.undoStack.pop();if(previous){this.redoStack.push(copy(this.current));this.current=previous;this.notify();}}
 redo():void {const next=this.redoStack.pop();if(next){this.undoStack.push(copy(this.current));this.current=next;this.notify();}}
}
