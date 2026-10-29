import {normalizePlaqueLabel} from './core/plaque-text';
import './styles.css';
import { AppUI, type LibraryDragPhase, type LibraryPointer } from './ui';
import { SceneView } from './graphics/scene-view';
import { SceneStore } from './core/store';
import { getAsset,getVariant,ASSETS } from './catalog/catalog';
import { BUILTIN_PRESETS,HALL_PRESETS,clonePreset } from './catalog/presets';
import { validatePlacement,wallAnchor,snapPosition,snapAngle } from './core/placement';
import { ROOM } from './core/room';
import { getPlacementRoom,getPlacementSurfaces } from './core/space';
import { listPresets,savePreset } from './core/storage';
import { parsePreset,serializePreset,MAX_PRESET_BYTES } from './core/schema';
import { readDraft,writeDraft } from './draft';
import type { SceneObject,SceneConfig,AppMode,Vec3,LayerVisibility,WallFinish } from './core/types';
import {wallGraphicFor,parseWallGraphic,sortedWallGraphics,MAX_GRAPHICS_PER_WALL} from './core/wall-graphics';
import {getPaintableBounds} from './core/wall-paint';
import {wallRegion} from './core/regions';

interface AppHook {store:SceneStore;view:SceneView;getMode:()=>AppMode;setMode:(mode:AppMode)=>void;select:(id:string|null)=>void;addAsset:(id:string)=>void;readonly ready:boolean;}
declare global {interface Window {__ROOM_ATELIER__?:AppHook;}}
const app=document.getElementById('app')!;
let view:SceneView;let ui:AppUI;let selected:string|null=null;let mode:AppMode='archviz';let ready=false;let customs:SceneConfig[]=[];let draftTimer=0;let activeRegion:'hall'|'meeting'='meeting';
const prefs=(()=>{try{return JSON.parse(localStorage.getItem('room-atelier-preferences')??'{}');}catch{return{};}})();
if(prefs.mode==='editor'||new URLSearchParams(location.search).get('mode')==='editor')mode='editor';
const initial=await readDraft()??clonePreset(1);
initial.objects=initial.objects.filter(o=>!(o.id==='RoomSign'&&o.wallId==='far'));
if(!initial.modified&&initial.presetId.startsWith('builtin-'))initial.name=clonePreset(initial.presetId).name;
const store=new SceneStore(initial);
const persistPrefs=()=>localStorage.setItem('room-atelier-preferences',JSON.stringify({mode,snap:view?.snap,gridStep:view?.gridStep,angleSnap:view?.angleSnap,quality:view?.quality.manual,region:activeRegion}));
const notify=(message:string)=>ui.toast(message);
const discreteEdit=(edit:()=>void)=>{store.beginTransaction();try{edit();}finally{store.endTransaction();}};
const selectedObject=()=>store.state.objects.find(o=>o.id===selected);
function select(id:string|null){selected=id;if(id===null)view?.setSelectedWall(null);const obj=store.state.objects.find(o=>o.id===id);if(obj?.regionId&&obj.regionId!==activeRegion)setRegion(obj.regionId,false);if(obj?.assetId==='corporateMotif')view?.setPaintSelection(false);view?.setSelected(id);ui.render(store.state,selected,store.canUndo,store.canRedo);if(obj?.assetId==='corporateMotif')ui.selectMotif(obj.id);syncControls();}
function setRegion(region:'hall'|'meeting',focus=true){activeRegion=region;ui.setRegion(region);if(view){view.activeRegion=region;if(focus)view.focusRegion(region);}persistPrefs();}
function syncControls(){if(!view)return;ui.setControl('snap',view.snap);ui.setTool(view.tool);const f=app.querySelector<HTMLInputElement>('[data-testid=free-placement]');if(f)f.checked=view.freePlacement;const a=app.querySelector<HTMLInputElement>('[data-property=angleSnap]');if(a)a.checked=view.angleSnap;}
function setMode(next:AppMode){if(!view)return;mode=next;view.setMode(mode);ui.setMode(mode);ui.render(store.state,selected,store.canUndo,store.canRedo);syncControls();persistPrefs();}
function commit(candidate:SceneObject,record=true){candidate={...candidate,regionId:candidate.regionId??(candidate.wallId?(/^(west|east|near|far)$/.test(candidate.wallId)?'meeting':'hall'):(candidate.position[0]>=ROOM.bounds.minX&&candidate.position[0]<=ROOM.bounds.maxX&&candidate.position[2]>=ROOM.bounds.minZ&&candidate.position[2]<=ROOM.bounds.maxZ?'meeting':'hall'))};const result=validatePlacement(candidate,store.state.objects,getPlacementRoom(candidate),{freePlacement:view.freePlacement});if(!result.valid){notify(result.reason??'Тут предмет не вміщується');return false;}store.upsert(candidate,record);return true;}
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
 if(id==='corporateMotif'){addCorporateMotif(1);return;}
 if(mode!=='editor')setMode('editor');const asset=getAsset(id),variant=asset.variants[1];let object:SceneObject={id:`${id}-${crypto.randomUUID()}`,assetId:id,variant:variant.index,material:asset.materials[0].id,position:activeRegion==='hall'?[-14,0,0]:[0,0,0],rotation:0,regionId:activeRegion,...(id==='doorPlaque'?{label:'01'}:{})};
 if(asset.placement==='wall'){const wall=getPlacementSurfaces().find(w=>activeRegion==='meeting'?w.id==='east':w.id.startsWith('wall-')&&w.max-w.min>variant.dimensions[0]+.2);if(!wall)return;const along=(wall.min+wall.max)/2;object={...object,...wallAnchor(wall.id,along,asset.mountHeight??1.6,variant.dimensions[2],getPlacementRoom({...object,wallId:wall.id}))};}
 else if(asset.collision==='accessory'){
  const support=store.state.objects.find(o=>o.regionId===activeRegion&&o.variant>0&&['tables','work','storage'].includes(getAsset(o.assetId).category));if(!support){notify('Спочатку додайте стіл або тумбу — аксесуару потрібна опора.');return;}object.position=[support.position[0],support.position[1]+getVariant(support.assetId,support.variant).dimensions[1],support.position[2]];
 }else if(id==='windowBar'&&activeRegion==='meeting')object.position=[0,0,ROOM.bounds.maxZ-variant.dimensions[2]/2-.035];
 const placed=findPlace(object);if(!placed){notify('Не вдалося знайти вільне місце. Звільніть ділянку або ввімкніть вільне розміщення.');return;}
 store.upsert(placed);select(placed.id);notify(`${asset.label} додано. Потягніть вибраний предмет для переміщення.`);
}
function addCorporateMotif(variant:number,source?:SceneObject){
 if(mode!=='editor')setMode('editor');
 const wallId=source?.wallId??ui.getSelectedWall(),wall=getPlacementSurfaces().find(w=>w.id===wallId);if(!wall)return;
 const existing=sortedWallGraphics(store.state.objects,wallId);if(existing.length>=MAX_GRAPHICS_PER_WALL){notify(`На одній стіні може бути до ${MAX_GRAPHICS_PER_WALL} мотивів.`);return;}
 const asset=getAsset('corporateMotif'),design=getVariant(asset.id,variant),bounds=getPaintableBounds(wall.id)??{minY:.07,maxY:wall.height??3.6};
 const room=getPlacementRoom({position:[0,0,0],wallId:wall.id}),step=existing.length?((existing.length-1)%5+1)*.18:0;
 let object:SceneObject={...(source?structuredClone(source):{}),id:`corporateMotif-${crypto.randomUUID()}`,assetId:asset.id,variant,material:source?.material??asset.materials[0].id,position:[0,0,0],rotation:0,wallId:wall.id,regionId:wallRegion(wall.id)};
 object.graphic={...wallGraphicFor(object),...(source?wallGraphicFor(source):{}),layer:Math.min(63,Math.max(-1,...existing.map(o=>wallGraphicFor(o).layer))+1)};
 const along=(source?source.position[wall.axis==='x'?2:0]:(wall.min+wall.max)/2)+step;
 const height=source?source.position[1]+.12:Math.max(bounds.minY+.2,Math.min(bounds.maxY-.2,1.8));
 const candidates=[[along,height],[along-step,height],...Array.from({length:Math.ceil((wall.max-wall.min)/.3)},(_,i)=>[wall.min+.15+i*.3,Math.min(bounds.maxY-.15,1.45)])];
 for(const [at,y]of candidates){const candidate={...object,...wallAnchor(wall.id,at,y,design.dimensions[2],room)};if(!validatePlacement(candidate,store.state.objects,room).valid)continue;if(commit(candidate)){setRegion(wallRegion(wall.id),false);select(candidate.id);notify(source?'Копію мотиву додано окремим шаром.':'Мотив додано. Потягніть його на стіні або змініть властивості.');}return;}
 notify('Оберіть ділянку стіни з видимою поверхнею для мотиву.');
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
 if(!ready)return;
 try{
 if(action==='archviz'||action==='editor'){setMode(action);return;}
 if(action==='preset'||action==='gallery-preset'){const preset=[...BUILTIN_PRESETS,...HALL_PRESETS,...customs].find(p=>p.presetId===value);if(preset){store.applyRegionPreset(activeRegion,preset);select(null);view.focusRegion(activeRegion);}if(action==='gallery-preset')ui.closeDialog();return;}
 if(action==='region'){setRegion(value as 'hall'|'meeting');select(null);return;}
 if(action==='region-focus'){view.focusRegion(activeRegion);return;}
 if(action==='rear-partitions'){const result=store.addRearPartitions();if(result.reason)notify(`Звільніть місце біля задніх дверей: ${result.reason}`);else if(result.rearranged){select(null);notify('Залишено дві перегородки в один ряд. Проходи до входу, кімнати команди та сходів відкриті.');}else if(result.added){select(null);notify(`Додано ${result.added} зелені перегородки. Ваші меблі та оздоблення збережено.`);}return;}
 if(action==='paint-mode'){if(value==='true'){setMode('editor');select(null);}view.setPaintSelection(value==='true');if(value==='true')view.setSelectedWall(ui.getSelectedWall());return;}
 if(action==='motif-add'){addCorporateMotif(Number(value));return;}
 if(action==='motif-select'){select(value!);return;}
 if(action==='motif-front'||action==='motif-back'){const id=value??selected;if(id){store.reorderWallGraphic(id,action==='motif-front'?'front':'back');select(id);}return;}
 if(action==='motif-duplicate'){const source=store.state.objects.find(o=>o.id===(value??selected));if(source?.assetId==='corporateMotif')addCorporateMotif(source.variant,source);return;}
 if(action==='motif-delete'){const id=value??selected;if(id){store.remove(id);if(selected===id)select(null);else ui.render(store.state,selected,store.canUndo,store.canRedo);}return;}
 if(action==='wall-color'||action==='wall-motif'||action==='wall-mural'){property(action,value!);return;}
 if(action==='wall-focus'){view.focusWall(ui.getSelectedWall());return;}
 if(action==='wall-clear'){store.clearWallFinish(ui.getSelectedWall());return;}
 if(action==='object'){select(value!);return;}if(action==='clear-selection'){select(null);return;}if(action==='none'){if(selectedObject())commit({...selectedObject()!,variant:0});return;}
 if(action==='add'){addAsset(value!);return;}if(action==='edit-selected'){setMode('editor');view.focus();return;}
 if(action==='save'){ui.showSave();return;}if(action==='save-confirm'){const options=ui.saveValues(),config=await savePreset(store.state,options.name,options.update?store.state.presetId:undefined);clearTimeout(draftTimer);await writeDraft(config);store.markSaved(config);ui.closeDialog();await refreshCustoms();notify('Власний дизайн збережено на цьому пристрої.');return;}
 if(action==='export'){await downloadPreset();return;}if(action==='import'){ui.requestImport();return;}
 if(action==='undo'){store.undo();return;}if(action==='redo'){store.redo();return;}if(action==='reset'){store.resetRegionToPreset(activeRegion);select(null);return;}
 if(action==='delete'){if(selected){store.remove(selected);select(null);}return;}
 if(action==='duplicate'){const source=selectedObject();if(!source)return;if(source.assetId==='corporateMotif'){addCorporateMotif(source.variant,source);return;}const candidate={...structuredClone(source),id:`${source.assetId}-${crypto.randomUUID()}`,position:[source.position[0]+.25,source.position[1],source.position[2]+.25] as Vec3};const placed=findPlace(candidate);if(!placed){notify('Немає вільного місця для копії.');return;}store.upsert(placed);select(placed.id);return;}
 if(action==='grid'){store.setLayers({grid:!store.state.layers.grid});return;}if(action==='snap'){view.snap=!view.snap;syncControls();persistPrefs();return;}
 if(action==='door'){store.setDoor(!store.state.doorOpen);notify(store.state.doorOpen?'Двері відчиняються':'Двері зачиняються');return;}
 if(action==='focus'){view.focus();return;}if(action==='camera-reset'){view.resetCamera();return;}
 if(['select','move','rotate'].includes(action)){view.setTool(action as 'select'|'move'|'rotate');ui.setTool(action);return;}
 if(action==='rotate-left'||action==='rotate-right'){discreteEdit(()=>view.rotateSelected((action==='rotate-left'?-1:1)*Math.PI/12));return;}
 if(action.startsWith('nudge-')){const step=view.snap?view.gridStep:.05;discreteEdit(()=>view.moveSelected(action==='nudge-left'?-step:action==='nudge-right'?step:0,action==='nudge-up'?-step:action==='nudge-down'?step:0));return;}
 if(action.startsWith('walk-')){view.walk(action.slice(5) as 'forward'|'back'|'left'|'right');return;}
 if(action==='material'){property('material',value!);return;}
 }catch(e){console.error(e);notify((e as Error).message||'Не вдалося виконати дію.');}
}
function property(key:string,value:string){
 if(!ready)return;
 if(key==='finish-wall'){select(null);ui.setWall(value);view.setPaintSelection(true);view.setSelectedWall(value);return;}
 if(key==='wall-motif'){if(Number(value)>0)addCorporateMotif(Number(value));return;}
 if(key==='wall-color'||key==='wall-accent'||key==='wall-mural'){const patch=key==='wall-color'?{color:value}:key==='wall-accent'?{accent:value}:{mural:Number(value) as NonNullable<WallFinish['mural']>};const wallId=ui.getSelectedWall();select(null);view.setPaintSelection(true);view.setSelectedWall(wallId);store.setWallFinish(wallId,patch);return;}
 if(key==='quality'){view.quality.setManual(value as 'auto'|'low'|'medium'|'high');persistPrefs();return;}
 if(key==='gridStep'){view.gridStep=Number(value);view.setTool(view.tool);persistPrefs();return;}
 if(key==='angleSnap'){view.angleSnap=value==='true';view.setTool(view.tool);persistPrefs();return;}
 if(key==='freePlacement'){view.freePlacement=value==='true';notify(view.freePlacement?'Вільне розміщення: перевірку перетинів вимкнено.':'Звичайний режим: захист від перетинів увімкнено.');return;}
 if(key.startsWith('layer:')){store.setLayers({[key.slice(6)]:value==='true'} as Partial<LayerVisibility>);return;}
 const obj=selectedObject();if(!obj)return;
 if(key.startsWith('graphic-')&&obj.assetId==='corporateMotif'){
  const field=key.slice(8),raw=field==='color'?value:Number(value),converted=field==='angle'?Number(raw)*Math.PI/180:field==='opacity'?Number(raw)/100:raw;
  try{const graphic=parseWallGraphic({...wallGraphicFor(obj),[field]:converted});if(!commit({...obj,graphic}))ui.render(store.state,selected,store.canUndo,store.canRedo);}catch(e){notify((e as Error).message);ui.render(store.state,selected,store.canUndo,store.canRedo);}return;
 }
 if(key==='variant'){
  const candidate={...obj,variant:Number(value)};const placed=findPlace(candidate,true);if(placed)commit(placed);else{notify('Цей варіант тут не вміщується. Звільніть трохи простору.');ui.render(store.state,selected,store.canUndo,store.canRedo);}return;
 }
 if(key==='label'){store.upsert({...obj,label:normalizePlaqueLabel(value)});return;}
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
ui=new AppUI(app,{action:(a,v)=>void action(a,v),property,importFile:f=>void importFile(f),libraryDrag});ui.showLoading();
try{
 view=new SceneView(ui.canvasHost,{select,selectWall:id=>{selected=null;view.setSelected(null);const region=/^(west|east|near|far)$/.test(id)?'meeting':'hall';if(region!==activeRegion)setRegion(region,false);ui.setWall(id);view.setSelectedWall(id);ui.render(store.state,null,store.canUndo,store.canRedo);},door:()=>void action('door'),change:o=>commit(o,false),begin:()=>store.beginTransaction(),end:()=>store.endTransaction(),status:notify,quality:(s,fps)=>ui.quality(s.level,fps,s.scale),spaceReady:()=>{store.upgradeWallGraphics();},progress:(text,percent)=>ui.progress(text,percent),preparing:busy=>{ready=!busy;if(busy)ui.showLoading();else{ui.loaded();syncControls();persistPrefs();}},launch:point=>{setMode('archviz');void view.enterAt(point).catch(e=>notify(e.message));}});
 view.snap=prefs.snap??true;view.gridStep=prefs.gridStep??.25;view.angleSnap=prefs.angleSnap??true;
 if(prefs.quality&&prefs.quality!=='auto')view.quality.setManual(prefs.quality);
 const qualityControl=app.querySelector<HTMLSelectElement>('[data-property=quality]');if(qualityControl)qualityControl.value=prefs.quality??'auto';
 if(mode==='editor'){view.setMode('editor');ui.setMode('editor');}
 store.subscribe(snapshot=>{view.sync(snapshot.config);ui.render(snapshot.config,selected,snapshot.canUndo,snapshot.canRedo);syncControls();clearTimeout(draftTimer);draftTimer=window.setTimeout(()=>void writeDraft(snapshot.config),400);});
 window.__ROOM_ATELIER__={store,view,getMode:()=>mode,setMode,select,addAsset,get ready(){return ready;}};
 await refreshCustoms();setRegion(prefs.region==='hall'?'hall':'meeting',false);await view.init((text,percent)=>ui.progress(text,percent));if(view.architecture.space){const b=view.architecture.space.bounds;ui.setSpaceMetrics(b.max[0]-b.min[0],b.max[2]-b.min[2],view.architecture.space.floorAreaSquareMeters);}ui.loaded();ready=true;setRegion(prefs.region==='hall'?'hall':'meeting',false);ui.toast('Простір готовий. Оберіть дизайн або перейдіть в Editor.');
}catch(e){console.error('Room Atelier initialization',e);ui.fallback((e as Error).message==='WEBGL2_UNAVAILABLE'?'На цьому пристрої недоступний WebGL 2.':`3D-сцена недоступна: ${(e as Error).message}`);}
document.addEventListener('keydown',e=>{if(!view||!ready)return;if((e.target as HTMLElement).matches('input,select,textarea')||app.querySelector('dialog[open]'))return;const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;if(mod&&key==='z'){e.preventDefault();e.shiftKey?store.redo():store.undo();return;}if(mod&&key==='y'){e.preventDefault();store.redo();return;}if(mod&&key==='s'){e.preventDefault();void action('save');return;}if(mode!=='editor')return;if(mod&&key==='d'){e.preventDefault();void action('duplicate');return;}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();void action('delete');}if(key==='v')void action('select');if(key==='g')void action('move');if(key==='r')void action('rotate');if(key==='f')view.focus();if(e.key==='Escape')select(null);if(e.key==='ArrowUp'){e.preventDefault();discreteEdit(()=>view.moveSelected(0,-(e.shiftKey?.05:view.gridStep)));}if(e.key==='ArrowDown'){e.preventDefault();discreteEdit(()=>view.moveSelected(0,e.shiftKey?.05:view.gridStep));}if(e.key==='ArrowLeft'){e.preventDefault();discreteEdit(()=>view.moveSelected(-(e.shiftKey?.05:view.gridStep),0));}if(e.key==='ArrowRight'){e.preventDefault();discreteEdit(()=>view.moveSelected(e.shiftKey?.05:view.gridStep,0));}});
window.addEventListener('pagehide',()=>{if(view)void writeDraft(store.state);});
document.addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault();},{passive:false});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['+','-','=','0'].includes(e.key))e.preventDefault();});
for(const event of ['gesturestart','gesturechange'])document.addEventListener(event,e=>e.preventDefault(),{passive:false});
