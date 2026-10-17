import './styles.css';
import { AppUI, type LibraryDragPhase, type LibraryPointer } from './ui';
import { SceneView } from './graphics/scene-view';
import { SceneStore } from './core/store';
import { getAsset,getVariant,ASSETS } from './catalog/catalog';
import { BUILTIN_PRESETS,clonePreset } from './catalog/presets';
import { validatePlacement,wallAnchor,snapPosition,snapAngle } from './core/placement';
import { ROOM } from './core/room';
import { getPlacementRoom,getPlacementSurfaces } from './core/space';
import { listPresets,savePreset } from './core/storage';
import { parsePreset,serializePreset,MAX_PRESET_BYTES } from './core/schema';
import { readDraft,writeDraft } from './draft';
import type { SceneObject,SceneConfig,AppMode,Vec3,LayerVisibility } from './core/types';

interface AppHook {store:SceneStore;view:SceneView;getMode:()=>AppMode;setMode:(mode:AppMode)=>void;select:(id:string|null)=>void;addAsset:(id:string)=>void;readonly ready:boolean;}
declare global {interface Window {__ROOM_ATELIER__?:AppHook;}}
const app=document.getElementById('app')!;
let view:SceneView;let ui:AppUI;let selected:string|null=null;let mode:AppMode='archviz';let ready=false;let customs:SceneConfig[]=[];let draftTimer=0;
const prefs=(()=>{try{return JSON.parse(localStorage.getItem('room-atelier-preferences')??'{}');}catch{return{};}})();
if(prefs.mode==='editor'||new URLSearchParams(location.search).get('mode')==='editor')mode='editor';
const initial=await readDraft()??clonePreset(1);
initial.objects=initial.objects.filter(o=>!(o.id==='RoomSign'&&o.wallId==='far'));
if(!initial.modified&&initial.presetId.startsWith('builtin-'))initial.name=clonePreset(initial.presetId).name;
const store=new SceneStore(initial);
const persistPrefs=()=>localStorage.setItem('room-atelier-preferences',JSON.stringify({mode,snap:view?.snap,gridStep:view?.gridStep,angleSnap:view?.angleSnap,quality:view?.quality.manual}));
const notify=(message:string)=>ui.toast(message);
const selectedObject=()=>store.state.objects.find(o=>o.id===selected);
function select(id:string|null){selected=id;view?.setSelected(id);ui.render(store.state,selected,store.canUndo,store.canRedo);syncControls();}
function syncControls(){if(!view)return;ui.setControl('snap',view.snap);ui.setTool(view.tool);const f=app.querySelector<HTMLInputElement>('[data-testid=free-placement]');if(f)f.checked=view.freePlacement;const a=app.querySelector<HTMLInputElement>('[data-property=angleSnap]');if(a)a.checked=view.angleSnap;}
function setMode(next:AppMode){if(!view)return;mode=next;view.setMode(mode);ui.setMode(mode);ui.render(store.state,selected,store.canUndo,store.canRedo);syncControls();persistPrefs();}
function commit(candidate:SceneObject,record=true){const result=validatePlacement(candidate,store.state.objects,getPlacementRoom(candidate),{freePlacement:view.freePlacement});if(!result.valid){notify(result.reason??'Тут предмет не вміщується');return false;}store.upsert(candidate,record);return true;}
function findPlace(object:SceneObject,keep=false):SceneObject|undefined{
 const asset=getAsset(object.assetId);if(validatePlacement(object,store.state.objects,getPlacementRoom(object),{freePlacement:view?.freePlacement}).valid)return object;
 if(asset.placement==='wall'){
  const room=getPlacementRoom(object);for(const wall of [room.walls.find(w=>w.id===object.wallId),...room.walls].filter(Boolean))for(const y of [object.position[1],1.45,1.85,2.5])for(let p=wall!.min+.3;p<wall!.max-.3;p+=.25){const candidate={...object,...wallAnchor(wall!.id,p,y,getVariant(object.assetId,object.variant).dimensions[2],room)};if(validatePlacement(candidate,store.state.objects,getPlacementRoom(candidate)).valid)return candidate;}
  return;
 }
 const max=keep?9:29,step=keep?.1:.2;
 for(let ring=1;ring<=max;ring++)for(let angle=0;angle<24;angle++){const a=angle/24*Math.PI*2,candidate={...object,position:[object.position[0]+Math.cos(a)*ring*step,object.position[1],object.position[2]+Math.sin(a)*ring*step] as Vec3};if(validatePlacement(candidate,store.state.objects,getPlacementRoom(candidate)).valid)return candidate;}
 return;
}
function addAsset(id:string){
 if(mode!=='editor')setMode('editor');const asset=getAsset(id),variant=asset.variants[1];let object:SceneObject={id:`${id}-${crypto.randomUUID()}`,assetId:id,variant:variant.index,material:asset.materials[0].id,position:[0,0,0],rotation:0};
 if(asset.placement==='wall')object={...object,...wallAnchor('east',0,asset.mountHeight??1.6,variant.dimensions[2])};
 else if(asset.collision==='accessory'){
  const support=store.state.objects.find(o=>o.variant>0&&['tables','work','storage'].includes(getAsset(o.assetId).category));if(!support){notify('Спочатку додайте стіл або тумбу — аксесуару потрібна опора.');return;}object.position=[support.position[0],support.position[1]+getVariant(support.assetId,support.variant).dimensions[1],support.position[2]];
 }else if(id==='windowBar')object.position=[0,0,ROOM.bounds.maxZ-variant.dimensions[2]/2-.035];
 const placed=findPlace(object);if(!placed){notify('Не вдалося знайти вільне місце. Звільніть ділянку або ввімкніть вільне розміщення.');return;}
 store.upsert(placed);select(placed.id);notify(`${asset.label} додано. Потягніть вибраний предмет для переміщення.`);
}
function libraryDrag(phase:LibraryDragPhase,assetId:string,pointer:LibraryPointer){
 if(!ready||!view)return false;
 if(phase==='cancel'){view.cancelLibraryPlacement();ui.render(store.state,selected,store.canUndo,store.canRedo);syncControls();return;}
 if(phase==='start'){if(mode!=='editor')setMode('editor');selected=null;view.setSelected(null);return view.beginLibraryPlacement(assetId,pointer.clientX,pointer.clientY,pointer);}
 const feedback=view.updateLibraryPlacement(pointer.clientX,pointer.clientY,pointer);
 if(phase==='move')return feedback;
 const candidate=view.finishLibraryPlacement();
 if(candidate&&commit(candidate)){select(candidate.id);notify(`${getAsset(assetId).label} розміщено. Змініть варіант або матеріал у властивостях.`);}
 else{ui.render(store.state,selected,store.canUndo,store.canRedo);syncControls();if(!feedback.valid)notify(feedback.reason??'Тут предмет не вміщується. Додавання скасовано.');}
 return feedback;
}
async function refreshCustoms(){try{customs=await listPresets();customs.forEach(config=>store.registerBaseline(config));ui.setCustom(customs);}catch(e){console.warn('IndexedDB preset storage',e);}}
async function downloadPreset(){const data=serializePreset(store.state),filename=(store.state.name.replace(/[^\p{L}\p{N} _-]/gu,'').trim()||'room-design')+'.archpreset.json',file=new File([data],filename,{type:'application/json'});
 if(matchMedia('(pointer:coarse)').matches&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:store.state.name});return;}catch(e){if((e as Error).name==='AbortError')return;}}
 const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);notify('Пресет експортовано — лише конфігурацію, без важких моделей.');
}
async function importFile(file:File){try{if(file.size>MAX_PRESET_BYTES)throw new Error('Файл завеликий для пресета.');const result=parsePreset(await file.text());store.applyPreset(result.config);select(null);ui.closeDialog();notify(result.warnings.length?result.warnings.join(' · '):'Дизайн імпортовано. Можна редагувати та зберегти власну копію.');}catch(e){notify((e as Error).message);}}
async function action(action:string,value?:string){
 try{
 if(action==='archviz'||action==='editor'){setMode(action);return;}
 if(action==='preset'||action==='gallery-preset'){const preset=BUILTIN_PRESETS.find(p=>p.presetId===value)??customs.find(p=>p.presetId===value);if(preset){store.applyPreset(preset);select(null);view.resetCamera();}if(action==='gallery-preset')ui.closeDialog();return;}
 if(action==='object'){select(value!);return;}if(action==='clear-selection'){select(null);return;}if(action==='none'){if(selectedObject())commit({...selectedObject()!,variant:0});return;}
 if(action==='add'){addAsset(value!);return;}if(action==='edit-selected'){setMode('editor');view.focus();return;}
 if(action==='save'){ui.showSave();return;}if(action==='save-confirm'){const options=ui.saveValues(),config=await savePreset(store.state,options.name,options.update?store.state.presetId:undefined);clearTimeout(draftTimer);await writeDraft(config);store.markSaved(config);ui.closeDialog();await refreshCustoms();notify('Власний дизайн збережено на цьому пристрої.');return;}
 if(action==='export'){await downloadPreset();return;}if(action==='import'){ui.requestImport();return;}
 if(action==='undo'){store.undo();return;}if(action==='redo'){store.redo();return;}if(action==='reset'){store.resetToPreset();select(null);return;}
 if(action==='delete'){if(selected){store.remove(selected);select(null);}return;}
 if(action==='duplicate'){const source=selectedObject();if(!source)return;const candidate={...structuredClone(source),id:`${source.assetId}-${crypto.randomUUID()}`,position:[source.position[0]+.25,source.position[1],source.position[2]+.25] as Vec3};const placed=findPlace(candidate);if(!placed){notify('Немає вільного місця для копії.');return;}store.upsert(placed);select(placed.id);return;}
 if(action==='grid'){store.setLayers({grid:!store.state.layers.grid});return;}if(action==='snap'){view.snap=!view.snap;syncControls();persistPrefs();return;}
 if(action==='door'){store.setDoor(!store.state.doorOpen);notify(store.state.doorOpen?'Двері відчиняються':'Двері зачиняються');return;}
 if(action==='focus'){view.focus();return;}if(action==='camera-reset'){view.resetCamera();return;}
 if(['select','move','rotate'].includes(action)){view.setTool(action as 'select'|'move'|'rotate');ui.setTool(action);return;}
 if(action==='rotate-left'||action==='rotate-right'){view.rotateSelected((action==='rotate-left'?-1:1)*Math.PI/12);return;}
 if(action.startsWith('nudge-')){const step=view.snap?view.gridStep:.05;view.moveSelected(action==='nudge-left'?-step:action==='nudge-right'?step:0,action==='nudge-up'?-step:action==='nudge-down'?step:0);return;}
 if(action.startsWith('walk-')){view.walk(action.slice(5) as 'forward'|'back'|'left'|'right');return;}
 if(action==='material'){property('material',value!);return;}
 }catch(e){console.error(e);notify((e as Error).message||'Не вдалося виконати дію.');}
}
function property(key:string,value:string){
 if(key==='quality'){view.quality.setManual(value as 'auto'|'low'|'medium'|'high');persistPrefs();return;}
 if(key==='gridStep'){view.gridStep=Number(value);view.setTool(view.tool);persistPrefs();return;}
 if(key==='angleSnap'){view.angleSnap=value==='true';view.setTool(view.tool);persistPrefs();return;}
 if(key==='freePlacement'){view.freePlacement=value==='true';notify(view.freePlacement?'Вільне розміщення: перевірку перетинів вимкнено.':'Звичайний режим: захист від перетинів увімкнено.');return;}
 if(key.startsWith('layer:')){store.setLayers({[key.slice(6)]:value==='true'} as Partial<LayerVisibility>);return;}
 const obj=selectedObject();if(!obj)return;
 if(key==='variant'){
  const candidate={...obj,variant:Number(value)};const placed=findPlace(candidate,true);if(placed)commit(placed);else{notify('Цей варіант тут не вміщується. Звільніть трохи простору.');ui.render(store.state,selected,store.canUndo,store.canRedo);}return;
 }
 if(key==='material'){commit({...obj,material:value});return;}
 if(key==='rotation'){const angle=Number(value)*Math.PI/180;if(Number.isFinite(angle))commit({...obj,rotation:snapAngle(angle,15,view.angleSnap)});return;}
 if(key==='wall'){
  const dims=getVariant(obj.assetId,obj.variant).dimensions;const wall=getPlacementSurfaces().find(w=>w.id===value);if(!wall)return;const room=getPlacementRoom({...obj,wallId:value});const anchored=wallAnchor(value,Math.max(wall.min+dims[0]/2,Math.min(wall.max-dims[0]/2,0)),obj.position[1],dims[2],room);const candidate=findPlace({...obj,...anchored},true);if(candidate)commit(candidate);else notify('На цій стіні недостатньо вільного місця.');return;
 }
 if(key.startsWith('position-')){const axis=key.slice(-1);const index=axis==='x'?0:axis==='y'?1:2;const number=Number(value);if(!Number.isFinite(number))return;const p=[...obj.position] as Vec3;p[index]=number;
  let candidate={...obj,position:p};if(getAsset(obj.assetId).placement==='wall'){const room=getPlacementRoom(obj),wall=room.walls.find(w=>w.id===obj.wallId)!;candidate={...obj,...wallAnchor(wall.id,wall.axis==='x'?p[2]:p[0],p[1],getVariant(obj.assetId,obj.variant).dimensions[2],room)};}else if(view.snap){const snapped=snapPosition(candidate.position,view.gridStep,true);snapped[1]=obj.position[1];candidate.position=snapped;}
  if(!commit(candidate))ui.render(store.state,selected,store.canUndo,store.canRedo);
 }
}
ui=new AppUI(app,{action:(a,v)=>void action(a,v),property,importFile:f=>void importFile(f),libraryDrag});
try{
 view=new SceneView(ui.canvasHost,{select,door:()=>void action('door'),change:o=>commit(o,false),begin:()=>store.beginTransaction(),end:()=>store.endTransaction(),status:notify,quality:(s,fps)=>ui.quality(s.level,fps,s.scale),launch:point=>{setMode('archviz');void view.enterAt(point).catch(e=>notify(e.message));}});
 view.snap=prefs.snap??true;view.gridStep=prefs.gridStep??.25;view.angleSnap=prefs.angleSnap??true;
 if(prefs.quality&&prefs.quality!=='auto')view.quality.setManual(prefs.quality);
 const qualityControl=app.querySelector<HTMLSelectElement>('[data-property=quality]');if(qualityControl)qualityControl.value=prefs.quality??'auto';
 if(mode==='editor'){view.setMode('editor');ui.setMode('editor');}
 store.subscribe(snapshot=>{view.sync(snapshot.config);ui.render(snapshot.config,selected,snapshot.canUndo,snapshot.canRedo);syncControls();clearTimeout(draftTimer);draftTimer=window.setTimeout(()=>void writeDraft(snapshot.config),400);});
 window.__ROOM_ATELIER__={store,view,getMode:()=>mode,setMode,select,addAsset,get ready(){return ready;}};
 await refreshCustoms();await view.init(text=>ui.progress(text));if(view.architecture.space){const b=view.architecture.space.bounds;ui.setSpaceMetrics(b.max[0]-b.min[0],b.max[2]-b.min[2],view.architecture.space.floorAreaSquareMeters);}ui.loaded();ready=true;ui.toast('Простір готовий. Оберіть дизайн або перейдіть в Editor.');
}catch(e){console.error('Room Atelier initialization',e);ui.fallback((e as Error).message==='WEBGL2_UNAVAILABLE'?'На цьому пристрої недоступний WebGL 2.':`3D-сцена недоступна: ${(e as Error).message}`);}
document.addEventListener('keydown',e=>{if(!view)return;if((e.target as HTMLElement).matches('input,select,textarea')||app.querySelector('dialog[open]'))return;const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;if(mod&&key==='z'){e.preventDefault();e.shiftKey?store.redo():store.undo();return;}if(mod&&key==='y'){e.preventDefault();store.redo();return;}if(mod&&key==='s'){e.preventDefault();void action('save');return;}if(mode!=='editor')return;if(mod&&key==='d'){e.preventDefault();void action('duplicate');return;}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();void action('delete');}if(key==='v')void action('select');if(key==='g')void action('move');if(key==='r')void action('rotate');if(key==='f')view.focus();if(e.key==='Escape')select(null);if(e.key==='ArrowUp'){e.preventDefault();view.moveSelected(0,-(e.shiftKey?.05:view.gridStep));}if(e.key==='ArrowDown'){e.preventDefault();view.moveSelected(0,e.shiftKey?.05:view.gridStep);}if(e.key==='ArrowLeft'){e.preventDefault();view.moveSelected(-(e.shiftKey?.05:view.gridStep),0);}if(e.key==='ArrowRight'){e.preventDefault();view.moveSelected(e.shiftKey?.05:view.gridStep,0);}});
window.addEventListener('pagehide',()=>{if(view)void writeDraft(store.state);});
document.addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault();},{passive:false});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['+','-','=','0'].includes(e.key))e.preventDefault();});
for(const event of ['gesturestart','gesturechange'])document.addEventListener(event,e=>e.preventDefault(),{passive:false});
