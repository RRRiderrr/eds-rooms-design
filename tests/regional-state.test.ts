import {defaultDoorPlaqueLabel} from '../src/core/door-labels';
import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ASSETS,getVariant} from '../src/catalog/catalog';
import {BUILTIN_PRESETS,HALL_PRESETS,clonePreset} from '../src/catalog/presets';
import {HALL_LAYOUT,isInHallFloor,originalHallTables} from '../src/core/hall';
import {objectRegion} from '../src/core/regions';
import {parsePreset,serializePreset} from '../src/core/schema';
import {SceneStore} from '../src/core/store';
import {configureSpace,getPlacementRoom,getPlacementSurfaces,SPACE} from '../src/core/space';
import {findAccessorySupport,validatePlacement,validateScene,wallAnchor} from '../src/core/placement';
import {currentDraft} from '../src/draft';
import type {DesignRegionId,SceneConfig,SceneObject} from '../src/core/types';

const regional=(s:SceneConfig,region:DesignRegionId)=>s.objects.filter(o=>objectRegion(o)===region);
function legacy(version:0|1=1){
 const source=clonePreset(6),value:Record<string,unknown>={...source,schemaVersion:version,presetId:'user-legacy',basePresetId:'user-legacy',modified:true};
 delete value.regionPresets;delete value.wallFinishes;
 value.objects=source.objects.filter(o=>objectRegion(o)==='meeting'||['edsTimeline','edsUkraine'].includes(o.assetId)&&o.wallId==='wall-38').map(({regionId,label,...o})=>o);
 return value;
}

describe('Independent hall and meeting designs / schema v2',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));
 it('preserves the measured source desks, all14 door labels, two approved corporate signs and bean bags in every hall preset',()=>{
  expect(HALL_PRESETS).toHaveLength(8);
  for(const preset of HALL_PRESETS){
   expect(new Set(preset.objects.map(o=>o.id)).size,preset.presetId).toBe(preset.objects.length);
   expect(preset.objects.filter(o=>o.assetId==='hallDesk'),preset.presetId).toEqual(originalHallTables());
   const signs=preset.objects.filter(o=>['edsTimeline','edsUkraine'].includes(o.assetId)&&o.wallId==='wall-38');
   expect(signs.map(o=>o.assetId).sort()).toEqual(['edsTimeline','edsUkraine']);
   expect(preset.objects.filter(o=>o.assetId==='doorPlaque')).toHaveLength(14);
   expect(preset.objects.filter(o=>o.assetId==='brandDoorPanel')).toHaveLength(14);
   expect(preset.objects.some(o=>o.assetId==='beanBag'&&o.variant>0)).toBe(true);
   expect(preset.objects.every(o=>o.regionId==='hall')).toBe(true);
   for(const door of HALL_LAYOUT.doors){
    const plaque=preset.objects.find(o=>o.id===`hall-${door.id}-plaque`)!;
    expect(plaque.wallId).toBe(door.wallId);expect(plaque.position[1]).toBe(1.55);
    expect(plaque.label).toBe(defaultDoorPlaqueLabel(door.id));
   }
  }
  expect(HALL_PRESETS[0].objects.find(o=>o.id==='hall-door-03-plaque')?.label).toBe('03');
 });
 it('validates every hall/meeting combination against actual walls, columns, doors and other furniture',()=>{
  const issues=[];
  for(const hall of HALL_PRESETS)for(const meeting of BUILTIN_PRESETS){
   const objects=[...hall.objects,...regional(meeting,'meeting')];
   issues.push(...validateScene(objects,getPlacementRoom).map(i=>({hall:hall.presetId,meeting:meeting.presetId,...i})));
  }
  expect(issues).toEqual([]);
 });
 it('places every hall furniture footprint on the actual connected hall floor rather than the rectangular building envelope',()=>{
  expect(isInHallFloor([0,0])).toBe(false);
  expect(isInHallFloor([-16,0])).toBe(true);
  for(const preset of HALL_PRESETS)for(const object of preset.objects){
   const asset=ASSETS.find(a=>a.id===object.assetId)!;
   if(asset.placement==='wall'||!object.variant)continue;
   const [w,,d]=getVariant(object.assetId,object.variant).dimensions,c=Math.cos(object.rotation),s=Math.sin(object.rotation);
   for(const [dx,dz]of [[-w/2,-d/2],[-w/2,d/2],[w/2,-d/2],[w/2,d/2]]){
    expect(isInHallFloor([object.position[0]+dx*c+dz*s,object.position[2]-dx*s+dz*c]),`${preset.presetId}: ${object.id}`).toBe(true);
   }
  }
 });
 it('keeps user edits in the other region when either preset changes, with a single reversible history entry',()=>{
  const store=new SceneStore(clonePreset(1));
  store.updateObject('MainSofa',{material:'clay'});
  store.setWallFinish('near',{color:'#A2B8FE',motif:2,accent:'#0B30C1'});
  store.setDoor(true);store.setLayers({ceiling:true});
  const meeting=structuredClone(regional(store.state,'meeting')),selection=structuredClone(store.state.regionPresets.meeting);
  store.applyRegionPreset('hall',4);
  expect(regional(store.state,'meeting')).toEqual(meeting);
  expect(store.state.regionPresets.meeting).toEqual(selection);
  expect(store.state.wallFinishes.near).toEqual({color:'#a2b8fe',motif:2,accent:'#0b30c1'});
  expect(store.state.doorOpen).toBe(true);expect(store.state.layers.ceiling).toBe(true);
  const hall=structuredClone(regional(store.state,'hall'));
  store.applyRegionPreset('meeting',6);
  expect(regional(store.state,'hall')).toEqual(hall);
  expect(store.state.regionPresets.hall.presetId).toBe('hall-preset-4');
  expect(store.state.regionPresets.meeting.presetId).toBe('builtin-6');
  expect(store.state.doorOpen).toBe(false);
  store.undo();expect(regional(store.state,'meeting')).toEqual(meeting);expect(regional(store.state,'hall')).toEqual(hall);
  expect(store.state.regionPresets.meeting).toEqual(selection);
  store.redo();expect(store.state.regionPresets.meeting.presetId).toBe('builtin-6');
 });
 it('does not restore original hall tables when only the meeting selection is changed or reset',()=>{
  const store=new SceneStore(clonePreset(1)),source=originalHallTables()[0];
  store.updateObject(source.id,{position:[source.position[0]-.1,0,source.position[2]]});
  const edited=structuredClone(store.state.objects.find(o=>o.id===source.id));
  store.applyRegionPreset('meeting',9);store.remove('MainSofa');store.resetRegionToPreset('meeting');
  expect(store.state.objects.find(o=>o.id===source.id)).toEqual(edited);
  store.resetRegionToPreset('hall');expect(store.state.objects.find(o=>o.id===source.id)).toEqual(source);
 });
 it('resolves legacy objects by actual measured location and keeps explicit ownership after movement',()=>{
  const chair:SceneObject={id:'legacy-hall-chair',assetId:'chair',variant:1,material:'blue',position:[-16,0,0],rotation:0};
  expect(objectRegion(chair)).toBe('hall');expect(objectRegion({...chair,position:[0,0,0]})).toBe('meeting');
  expect(objectRegion({...chair,position:[0,0,0],regionId:'hall'})).toBe('hall');
  const store=new SceneStore(clonePreset(0));store.upsert(chair);store.updateObject(chair.id,{position:[-15,0,1]});
  expect(store.state.objects.find(o=>o.id===chair.id)?.regionId).toBe('hall');
 });
 it('migrates v0/v1 custom exports without losing existing IDs, transforms, layer state or door state',()=>{
  for(const version of [0,1] as const){
   const old=legacy(version);old.doorOpen=true;old.layers={...clonePreset(0).layers,ceiling:true};
   const originals=structuredClone(old.objects) as SceneObject[];
   const config=parsePreset(old,{preserveIdentity:true}).config;
   expect(config.schemaVersion).toBe(2);expect(config.presetId).toBe('user-legacy');
   for(const object of originals)expect(config.objects.find(o=>o.id===object.id)).toMatchObject(object);
   expect(config.objects.filter(o=>o.assetId==='hallDesk')).toEqual(originalHallTables());
   expect(config.layers.ceiling).toBe(true);expect(config.doorOpen).toBe(true);
   expect(config.regionPresets.meeting.presetId).toBe('user-legacy');
   expect(parsePreset(serializePreset(config),{preserveIdentity:true}).config.objects).toEqual(config.objects);
  }
 });
 it('does not resurrect a source table deliberately removed from a version2 user design',()=>{
  const source=originalHallTables()[0],store=new SceneStore(clonePreset(0));store.remove(source.id);
  const exported=parsePreset(serializePreset(store.state)).config;
  expect(exported.objects.some(o=>o.id===source.id)).toBe(false);
 });
 it('migrates deliberate hall furniture as custom and preserves it in reloaded drafts',()=>{
  const old=legacy(),chair:SceneObject={id:'legacy-outside-chair',assetId:'chair',variant:1,material:'blue',position:[-16,0,0],rotation:.37};
  (old.objects as unknown[]).push(chair);
  const migrated=parsePreset(old,{preserveIdentity:true}).config;
  expect(migrated.objects.find(o=>o.id===chair.id)).toMatchObject({...chair,regionId:'hall'});
  expect(migrated.regionPresets.hall.modified).toBe(true);
  expect(currentDraft(migrated)).toBe(migrated);
 });
 it('roundtrips both regional selections, labels, absent objects and per-surface finishes through portable JSON',()=>{
  const store=new SceneStore(clonePreset(3));store.applyRegionPreset('hall',5);
  store.setWallFinish('west',{color:'#F0F0F0',motif:0});store.setWallFinish('wall-21',{color:'#0B30C1',motif:3,accent:'#A0FF3D'});
  store.updateObject('MainSofa',{variant:0});store.updateObject('hall-door-04-plaque',{label:'04\nПроєктний кабінет'});
  const restored=parsePreset(serializePreset(store.state)).config;
  expect(restored.regionPresets).toEqual(store.state.regionPresets);expect(restored.wallFinishes).toEqual(store.state.wallFinishes);
  expect(restored.objects).toEqual(store.state.objects);expect(restored.objects.find(o=>o.id==='MainSofa')?.variant).toBe(0);
 });
 it('limits finish changes and resets to their own wall face and supports Undo/Redo including transactions',()=>{
  const store=new SceneStore(clonePreset(1));
  expect(Object.keys(store.state.wallFinishes).length).toBeGreaterThan(0);
  store.setWallFinish('near',{color:'#f0f0f0',motif:1});store.setWallFinish('wall-21',{color:'#0b30c1',motif:2});
  store.clearWallFinish('near');expect(store.state.wallFinishes.near).toBeUndefined();expect(store.state.wallFinishes['wall-21'].motif).toBe(2);
  store.undo();expect(store.state.wallFinishes.near.motif).toBe(1);store.redo();expect(store.state.wallFinishes.near).toBeUndefined();
  store.resetWallFinishes('hall');expect(store.state.wallFinishes).toEqual(clonePreset(1).wallFinishes);store.undo();expect(store.state.wallFinishes['wall-21'].motif).toBe(2);
  store.beginTransaction();store.setWallFinish('near',{motif:3});store.setWallFinish('wall-21',{motif:0});store.endTransaction();
  store.undo();expect(store.state.wallFinishes.near).toBeUndefined();expect(store.state.wallFinishes['wall-21'].motif).toBe(2);
 });
 it('keeps a saved whole-scene custom preset available as independent regional reset baselines',()=>{
  const store=new SceneStore(clonePreset(6));store.applyRegionPreset('hall',3);
  const saved={...structuredClone(store.state),presetId:'user-two-regions',basePresetId:'user-two-regions',modified:false};
  store.markSaved(saved);
  const meeting=structuredClone(regional(store.state,'meeting'));
  store.applyRegionPreset('hall',7);store.remove('MainSofa');store.resetRegionToPreset('meeting');
  expect(regional(store.state,'meeting')).toEqual(meeting);expect(store.state.regionPresets.hall.presetId).toBe('hall-preset-7');
 });
 it('keeps an old ID in its moved region without allowing a new regional preset to delete or duplicate it',()=>{
  const store=new SceneStore(clonePreset(1));store.updateObject('MainSofa',{regionId:'hall',position:[-16,0,0]});
  store.applyRegionPreset('meeting',3);
  const old=store.state.objects.find(o=>o.id==='MainSofa')!;
  expect(old.regionId).toBe('hall');expect(old.position).toEqual([-16,0,0]);
  expect(store.state.objects.some(o=>o.id==='meeting-MainSofa'&&o.regionId==='meeting')).toBe(true);
  expect(new Set(store.state.objects.map(o=>o.id)).size).toBe(store.state.objects.length);
 });
 it('rejects malformed wall finishes and non-wall keys without evaluating imported text',()=>{
  const config=clonePreset(1);
  for(const finish of [{color:'javascript:alert(1)',motif:0,accent:'#000000'},{color:null,motif:4,accent:'#000000'},{color:'#ffffff',motif:1,accent:'red'}])expect(()=>parsePreset({...config,wallFinishes:{near:finish}})).toThrow();
  expect(()=>parsePreset({...config,wallFinishes:{constructor:{color:null,motif:0,accent:'#ffffff'}}})).toThrow();
  expect(()=>new SceneStore(config).setWallFinish('../walls',{color:'#ffffff'})).toThrow();
 });
 it('replaces only known source furniture ghost obstacles while retaining actual structural collision',()=>{
  expect(SPACE.obstacles.some(o=>/^((East_)?Desk_\d+)/.test(o.id))).toBe(false);
  expect(SPACE.obstacles.some(o=>o.kind==='column')).toBe(true);
  const table=originalHallTables()[0],pouf:SceneObject={id:'new-at-old-table',assetId:'pouf',variant:1,material:'oat',position:[...table.position],rotation:0,regionId:'hall'};
  expect(validatePlacement(pouf,[],getPlacementRoom(pouf)).valid).toBe(true);
  expect(validatePlacement(pouf,[table],getPlacementRoom(pouf)).valid).toBe(false);
 });
 it('mounts full-height corporate strips on the hall-facing surface without weakening ordinary art or door opening limits',()=>{
  const source=HALL_PRESETS[0],panel=source.objects.find(o=>o.id==='hall-door-03-brand')!;
  expect(panel.position[2]).toBeLessThan(-3.14889);expect(panel.rotation).toBeCloseTo(Math.PI);
  expect(validatePlacement(panel,source.objects,getPlacementRoom(panel)).valid).toBe(true);
  const wall=getPlacementRoom(panel).walls.find(w=>w.id===panel.wallId)!,door=wall.openings!.find(o=>o.kind==='door')!;
  const bad={...panel,...wallAnchor(wall.id,(door.min+door.max)/2,panel.position[1],getVariant(panel.assetId,panel.variant).dimensions[2],getPlacementRoom(panel))};
  expect(validatePlacement(bad,[],getPlacementRoom(bad)).valid).toBe(false);
  const art:SceneObject={id:'low-art',assetId:'art',variant:1,material:'white',...wallAnchor('west',0,.3,getVariant('art',1).dimensions[2]),regionId:'meeting'};
  expect(validatePlacement(art,[],getPlacementRoom(art)).valid).toBe(false);
 });
 it('keeps all four shared meeting wall aliases inside and real wall-N surfaces outside the same actual wall',()=>{
  for(const source of HALL_LAYOUT.meetingRoom.walls){
   const surfaces=getPlacementSurfaces(),inside=surfaces.find(w=>w.id===source.id)!,outside=surfaces.find(w=>w.id===source.sourceWallId)!;
   expect(inside.normal[0]*outside.normal[0]+inside.normal[2]*outside.normal[2]).toBe(-1);
   const measured=JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8')).walls.find((w:{id:string})=>w.id===source.sourceWallId);
   expect(Math.abs(outside.coordinate-inside.coordinate)).toBeCloseTo(measured.thickness,4);
  }
  const windowWall=getPlacementSurfaces().find(w=>w.id==='wall-16')!;
  expect(windowWall.openings).toEqual([{min:HALL_LAYOUT.meetingRoom.window.min,max:HALL_LAYOUT.meetingRoom.window.max,minY:HALL_LAYOUT.meetingRoom.window.sill,maxY:HALL_LAYOUT.meetingRoom.window.sill+HALL_LAYOUT.meetingRoom.window.height,kind:'window'}]);
 });
 it('uses real markerboard variant1 in furnished meeting presets and keeps cork variant3 available in the catalog',()=>{
  expect(getVariant('board',1).model).toBe('board-white');expect(getVariant('board',3).model).toBe('board-pin');
  expect(ASSETS.find(a=>a.id==='board')?.variants.some(v=>v.index===3)).toBe(true);
  for(const preset of BUILTIN_PRESETS.slice(1)){
   expect(regional(preset,'meeting').some(o=>o.assetId==='board'&&o.variant===3)).toBe(false);
   expect(regional(preset,'meeting').some(o=>o.assetId==='board'&&o.variant===1),preset.presetId).toBe(true);
  }
  for(const index of [3,6,9,13])expect(regional(BUILTIN_PRESETS[index],'meeting').some(o=>o.assetId==='television'&&o.variant===3)).toBe(true);
 });
 it('rejects accessories above the actual L-shaped source desk cutout including a rotated edge crossing the notch',()=>{
  const table=originalHallTables()[0],top= getVariant('hallDesk',1).dimensions[1];
  expect(getVariant('hallDesk',1).supportPolygon).toHaveLength(6);
  const at=(x:number,z:number,rotation=0):SceneObject=>({id:'desk-laptop',assetId:'accessory',variant:2,material:'white',position:[table.position[0]+x,top,table.position[2]+z],rotation,regionId:'hall'});
  expect(findAccessorySupport(at(-.4,-.4),[table])?.id).toBe(table.id);
  expect(findAccessorySupport(at(.4,.4),[table])?.id).toBe(table.id);
  expect(findAccessorySupport(at(.4,-.4),[table])).toBeUndefined();
  const crossing=at(-.05,.03,-Math.PI/4);
  expect(findAccessorySupport(crossing,[table])).toBeUndefined();
  const moved={...table,position:[-16,0,.3] as [number,number,number],rotation:Math.PI/2};
  const valid={...at(-.4,-.4),position:[moved.position[0]-.4,top,moved.position[2]+.4] as [number,number,number],rotation:moved.rotation};
  expect(findAccessorySupport(valid,[moved])?.id).toBe(moved.id);
 });
});
