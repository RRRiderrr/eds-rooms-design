import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {clonePreset} from '../src/catalog/presets';
import {CORPORATE_MOTIF_DESIGNS} from '../src/catalog/corporate-motifs';
import {getAsset} from '../src/catalog/catalog';
import {parsePreset,serializePreset} from '../src/core/schema';
import {wallAnchor,validatePlacement} from '../src/core/placement';
import {ROOM} from '../src/core/room';
import {configureSpace} from '../src/core/space';
import {SceneStore} from '../src/core/store';
import {currentDraft} from '../src/draft';
import {MAX_GRAPHICS_PER_WALL,isWallGraphicPointVisible,parseWallGraphic,sortedWallGraphics,upgradeWallGraphics,wallGraphicFor,wallGraphicVisibleArea} from '../src/core/wall-graphics';
import type {SceneObject,WallGraphic} from '../src/core/types';

const graphic=(id='motif',wallId='west',along=0,y=1.6,patch:Partial<WallGraphic>={}):SceneObject=>({id,assetId:'corporateMotif',variant:3,material:'eds-blue',...wallAnchor(wallId,along,y,.0004),graphic:{width:1,height:1,angle:0,opacity:1,layer:0,color:'#0b30c1',...patch}});

describe('Independent EDS wall graphics',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));

 it('keeps twelve stable motif variants with independently sized paint metadata',()=>{
  expect(CORPORATE_MOTIF_DESIGNS.map(d=>d.index)).toEqual(Array.from({length:12},(_,i)=>i+1));
  expect(getAsset('corporateMotif').wallLayer).toBe('graphic');
  expect(wallGraphicFor({...graphic(),graphic:undefined,variant:1,material:'eds-lime'})).toEqual({width:3.24,height:.491,angle:0,opacity:1,layer:0,color:'#a0ff3d'});
 });

 it('roundtrips multiple rotated, translucent layers on one wall, preserving other scene content',()=>{
  const base=clonePreset(0),retained=structuredClone(base.objects);
  base.presetId='user-motif-layer-check';base.basePresetId=base.presetId;base.modified=true;
  base.objects.push(graphic('a','west',0,1.6,{angle:.3,opacity:.42,layer:5,color:'#A2B8FE'}),graphic('b','west',.2,1.5,{width:1.4,height:.7,layer:6}));
  const safe=parsePreset(serializePreset(base),{preserveIdentity:true}).config;
  expect(safe.objects.slice(0,retained.length)).toEqual(retained);
  expect(safe.objects.filter(o=>o.assetId==='corporateMotif')).toHaveLength(2);
  expect(safe.objects.find(o=>o.id==='a')!.graphic).toMatchObject({opacity:.42,layer:5,color:'#a2b8fe'});
  expect(safe.objects.find(o=>o.id==='a')!.graphic!.angle).toBeCloseTo(.3,12);
  expect(currentDraft(safe)).toBe(safe);
 });

 it('validates finite dimensions, paint colors, transparency and bounded layer order',()=>{
  const cases=[{width:NaN},{height:0},{width:20.1},{height:Infinity},{angle:Infinity},{angle:1000},{opacity:-.001},{opacity:1.001},{layer:-1},{layer:64},{layer:1.5},{color:'red'},{color:'#123456;display:none'}];
  for(const invalid of cases)expect(()=>parseWallGraphic(invalid)).toThrow();
  expect(parseWallGraphic({width:.05,height:20,opacity:0,angle:Math.PI*4,layer:63,color:'#A0FF3D'})).toEqual({width:.05,height:20,opacity:0,angle:0,layer:63,color:'#a0ff3d'});
  const base=clonePreset(0);base.objects.push({...graphic(),graphic:{...graphic().graphic!,width:NaN}});
  expect(()=>parsePreset(base)).toThrow('Ширина та висота');
 });

 it('allows overlapping motifs and physical artwork without changing physical collision rules',()=>{
  const first=graphic('a'),second=graphic('b');
  const sign:SceneObject={id:'physical',assetId:'art',variant:1,material:'white',...wallAnchor('west',0,1.6,.045)};
  expect(validatePlacement(first,[first,second,sign])).toEqual({valid:true});
  expect(validatePlacement(sign,[first,second,sign])).toEqual({valid:true});
  expect(validatePlacement({...sign,id:'physical-2'},[sign])).toMatchObject({valid:false,collidingId:sign.id});
 });

 it('clips partial edge placements but rejects paint entirely outside the wall or within an opening',()=>{
  const west=ROOM.walls.find(w=>w.id==='west')!,partial=graphic('edge','west',west.max-.1,1.6);
  expect(wallGraphicVisibleArea(partial,west)).toBeCloseTo(.6,8);
  expect(validatePlacement(partial,[partial])).toEqual({valid:true});
  const outside=graphic('outside','west',west.max+1,1.6);
  expect(validatePlacement(outside,[outside])).toMatchObject({valid:false});
  const door=graphic('door','near',ROOM.door.center,1),near=ROOM.walls.find(w=>w.id==='near')!;
  door.graphic!.width=.3;door.graphic!.height=.3;
  expect(wallGraphicVisibleArea(door,near)).toBe(0);
  expect(validatePlacement(door,[door])).toMatchObject({valid:false});
  const header=graphic('header','near',ROOM.door.center,2.1,{width:.7,height:.4});
  expect(wallGraphicVisibleArea(header,near)).toBeCloseTo(.7*(2.3-ROOM.door.height),7);
  expect(validatePlacement(header,[header])).toEqual({valid:true});
 });

 it('uses the same rotated aperture clipping for pick points and visible area',()=>{
  const far=ROOM.walls.find(w=>w.id==='far')!;
  const object=graphic('window','far',0,1.8,{width:2,height:2,angle:Math.PI/4});
  expect(wallGraphicVisibleArea(object,far)).toBeGreaterThan(0);
  expect(wallGraphicVisibleArea(object,far)).toBeLessThan(4);
  expect(isWallGraphicPointVisible(object,far,0,1.8)).toBe(false);
  expect(isWallGraphicPointVisible(object,far,0,2.7)).toBe(true);
  expect(isWallGraphicPointVisible(object,far,1.5,2.7)).toBe(false);
  const duplicateApertures={...far,openings:[{min:ROOM.window.min,max:ROOM.window.max,minY:ROOM.window.sill,maxY:ROOM.window.sill+ROOM.window.height,kind:'window' as const}]};
  expect(wallGraphicVisibleArea(object,duplicateApertures)).toBeCloseTo(wallGraphicVisibleArea(object,far),8);
 });

 it('caps active layers per wall while allowing sixty-four on each independent wall',()=>{
  const west=Array.from({length:MAX_GRAPHICS_PER_WALL},(_,i)=>graphic(`west-${i}`));
  expect(validatePlacement(west[0],west)).toEqual({valid:true});
  expect(validatePlacement(graphic('extra'),west)).toMatchObject({valid:false,reason:'На одній стіні може бути до 64 мотивів'});
  const base=clonePreset(0);base.objects.push(...west,...west.map((o,i)=>({...o,id:`east-${i}`,...wallAnchor('east',0,1.6,.0004)})));
  expect(parsePreset(base).config.objects.filter(o=>o.assetId==='corporateMotif')).toHaveLength(128);
  base.objects.push(graphic('extra'));expect(()=>parsePreset(base)).toThrow('до 64 мотивів');
 });

 it('migrates the original scalar art once with its exact layout, color and opacity',()=>{
  const base=clonePreset(0);base.modified=true;base.wallFinishes={west:{color:'#f0f0f0',motif:1,accent:'#a2b8fe'},east:{color:null,motif:2,accent:'#a0ff3d'},near:{color:null,motif:3,accent:'#0b30c1'}};
  const retained=structuredClone(base.objects),migrated=upgradeWallGraphics(base);
  expect(migrated.objects.slice(0,retained.length)).toEqual(retained);expect(base.wallFinishes.west.motif).toBe(1);
  const first=migrated.objects.find(o=>o.id==='legacy-corporate-motif-west')!;
  expect(first.graphic).toEqual({width:3.24,height:.491,angle:0,opacity:.88,layer:0,color:'#a2b8fe'});
  expect(first.position[1]).toBeCloseTo(2.72+.491/2,8);
  expect(migrated.wallFinishes.west).toEqual({...base.wallFinishes.west,motif:0});
  expect(migrated.objects.find(o=>o.id==='legacy-corporate-motif-east')!.position[1]).toBeCloseTo(1.92,8);
  expect(migrated.objects.find(o=>o.id==='legacy-corporate-motif-near')!.position[1]).toBe(2.5);
  expect(upgradeWallGraphics(migrated)).toBe(migrated);
  const restored=parsePreset(serializePreset(migrated),{preserveIdentity:true}).config;
  expect(restored.objects).toEqual(migrated.objects);
  restored.objects=restored.objects.filter(o=>o.id!==first.id);expect(upgradeWallGraphics(restored).objects.some(o=>o.id===first.id)).toBe(false);
 });

 it('keeps painter order atomic and undoable without moving graphics or touching other walls',()=>{
  const base=clonePreset(0);base.objects.push(graphic('a'),graphic('b','west',.5,1.8,{layer:63}),graphic('c','west',-.2,1.7,{layer:63}),graphic('other','east',0,1.6,{layer:10}));
  const store=new SceneStore(base),before=structuredClone(store.state.objects);
  expect(store.reorderWallGraphic('a','front')).toBe(true);expect(sortedWallGraphics(store.state.objects,'west').map(o=>o.id)).toEqual(['b','c','a']);
  expect(store.state.objects.find(o=>o.id==='a')!.position).toEqual(before.find(o=>o.id==='a')!.position);
  expect(store.state.objects.find(o=>o.id==='other')).toEqual(before.find(o=>o.id==='other'));
  store.undo();expect(store.state.objects).toEqual(before);store.redo();expect(sortedWallGraphics(store.state.objects,'west').map(o=>o.id)).toEqual(['b','c','a']);
  expect(store.reorderWallGraphic('a','back')).toBe(true);expect(sortedWallGraphics(store.state.objects,'west').map(o=>o.id)).toEqual(['a','b','c']);
 });

 it('duplicates a motif along its mounting plane with its edited appearance and one Undo',()=>{
  for(const wallId of ['west','near']) {
   const base=clonePreset(0),source=graphic('source',wallId,-1,1.5,{width:.6,height:.7,angle:.3,opacity:.5,color:'#a0ff3d',layer:2});
   base.objects.push(source);const store=new SceneStore(base),before=structuredClone(store.state.objects),copy=store.duplicate(source.id)!;
   expect(copy.id).not.toBe(source.id);expect(copy.wallId).toBe(wallId);expect(copy.graphic).toEqual({...source.graphic,layer:3});
   const axis=wallId==='west'?0:2;expect(copy.position[axis]).toBe(source.position[axis]);expect(copy.position[axis===0?2:0]).toBe(source.position[axis===0?2:0]+.25);
   expect(validatePlacement(copy,store.state.objects)).toEqual({valid:true});
   store.undo();expect(store.state.objects).toEqual(before);
  }
 });

 it('completes migration only when an unknown surface becomes available, retaining saved flags and history',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'));
  const base=clonePreset(0);base.presetId='user-before-surface-ready';base.basePresetId=base.presetId;base.modified=false;
  base.wallFinishes={'wall-999':{color:'#f0f0f0',motif:2,accent:'#a0ff3d'}};
  const store=new SceneStore(base),before=structuredClone(store.state);
  expect(store.upgradeWallGraphics()).toBe(false);
  try {
   configureSpace({...manifest,walls:[...manifest.walls,{id:'wall-999',axis:'x',coordinate:5,min:-2,max:2,height:3.6,normal:[1,0,0],thickness:.12}]});
   expect(store.upgradeWallGraphics()).toBe(true);
   expect(store.state.modified).toBe(false);expect(store.state.regionPresets).toEqual(before.regionPresets);expect(store.state.updatedAt).toBe(before.updatedAt);
   expect(store.state.objects.filter(o=>o.assetId!=='corporateMotif')).toEqual(before.objects);
   expect(store.state.objects.find(o=>o.id==='legacy-corporate-motif-wall-999')).toMatchObject({variant:2,wallId:'wall-999',graphic:{opacity:.88,color:'#a0ff3d'}});
   expect(store.canUndo).toBe(false);expect(store.upgradeWallGraphics()).toBe(false);
  } finally { configureSpace(manifest); }
 });
});
