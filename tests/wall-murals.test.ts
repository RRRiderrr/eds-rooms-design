import {describe,expect,it} from 'vitest';
import {BUILTIN_PRESETS,clonePreset} from '../src/catalog/presets';
import {parsePreset,parseWallFinish,serializePreset} from '../src/core/schema';
import {SceneStore} from '../src/core/store';
import {currentDraft} from '../src/draft';
import {getAsset} from '../src/catalog/catalog';
import {ROOM} from '../src/core/room';
import {validatePlacement} from '../src/core/placement';
import {getPaintableBounds} from '../src/core/wall-paint';
import {WALL_MURAL_DESIGNS} from '../src/core/wall-murals';
import atlas from '../public/assets/brand/murals/atlas.json';
import {readFileSync} from 'node:fs';

describe('Full-wall EDS painting state',()=>{
 it('keeps old custom finishes unchanged and validates an explicitly supplied mural',()=>{
  const old={color:'#a2b8fe',motif:2 as const,accent:'#0b30c1'};
  expect(parseWallFinish(old)).toEqual(old);
  expect(Object.hasOwn(parseWallFinish(old),'mural')).toBe(false);
  for(const mural of [0,...WALL_MURAL_DESIGNS.map(d=>d.index)])expect(parseWallFinish({...old,mural})).toEqual({...old,mural});
  for(const mural of [-1,9,1.5,'1',null,NaN,Infinity,{},[]])expect(()=>parseWallFinish({...old,mural})).toThrow('Невідома повностінна композиція');
 });

 it('roundtrips editable murals in custom export and draft without replacing any furniture',()=>{
  const store=new SceneStore(clonePreset(5));
  store.setWallFinish('east',{color:'#A2B8FE',mural:8,motif:0});
  store.setWallFinish('wall-21',{color:'#F0F0F0',mural:1,motif:0});
  store.updateObject('MainSofa',{material:'sage'});
  const restored=parsePreset(serializePreset(store.state),{preserveIdentity:true}).config;
  expect(restored.objects).toEqual(store.state.objects);
  expect(restored.wallFinishes).toEqual(store.state.wallFinishes);
  expect(currentDraft(restored)).toBe(restored);
  expect(restored.wallFinishes.east.mural).toBe(8);
  expect(restored.wallFinishes['wall-21'].mural).toBe(1);
 });

 it('supports selecting, clearing and undoing a composition without changing the other region',()=>{
  const store=new SceneStore(clonePreset(0));
  store.setWallFinish('wall-21',{mural:2});
  const hall=structuredClone(store.state.wallFinishes['wall-21']);
  store.setWallFinish('west',{mural:1,motif:0});
  store.setWallFinish('west',{mural:0});
  expect(store.state.wallFinishes.west.mural).toBe(0);
  store.undo();expect(store.state.wallFinishes.west.mural).toBe(1);
  store.undo();expect(store.state.wallFinishes.west).toBeUndefined();
  store.redo();expect(store.state.wallFinishes.west.mural).toBe(1);
  expect(store.state.wallFinishes['wall-21']).toEqual(hall);
  store.applyRegionPreset('meeting',3);
  expect(store.state.wallFinishes['wall-21']).toEqual(hall);
 });

 it('does not add new artwork to an older saved custom wall finish',()=>{
  const custom=clonePreset(2);
  custom.presetId='user-before-murals';custom.basePresetId=custom.presetId;
  custom.modified=false;
  custom.wallFinishes={west:{color:'#f0f0f0',motif:3,accent:'#a2b8fe'}};
  const restored=parsePreset(serializePreset(custom),{preserveIdentity:true}).config;
  expect(currentDraft(restored).wallFinishes).toEqual(custom.wallFinishes);
  expect(Object.hasOwn(restored.wallFinishes.west,'mural')).toBe(false);
 });

 it('gives each furnished meeting preset one full-wall composition on an uninterrupted side wall',()=>{
  const seen=new Set<number>();
  expect(BUILTIN_PRESETS[0].wallFinishes).toEqual({});
  for(const preset of BUILTIN_PRESETS.slice(1)){
   const entries=Object.entries(preset.wallFinishes).filter(([,f])=>f.mural);
   expect(entries,preset.name).toHaveLength(1);
   const [id,finish]=entries[0];
   expect(['west','east']).toContain(id);
   expect(WALL_MURAL_DESIGNS.map(d=>d.index)).toContain(finish.mural);
   expect(finish.motif).toBe(0);
   seen.add(finish.mural!);
   expect(parsePreset(serializePreset(preset),{preserveIdentity:true}).config.wallFinishes).toEqual(preset.wallFinishes);
  }
  expect([...seen].sort()).toEqual([1,2,3,4,5,6,7,8]);
 });

 it('packs eight different corporate vector compositions and three masks into the existing single 4096 atlas with safe gutters',()=>{
  expect(atlas.width).toBe(4096);expect(atlas.height).toBe(4096);
  const murals=atlas.tiles.filter(t=>t.kind==='mural'),masks=atlas.tiles.filter(t=>t.kind==='mask');
  expect(murals).toHaveLength(8);expect(masks).toHaveLength(3);
  const sources=new Set<string>(),g=atlas.gutterPixels;
  for(const design of WALL_MURAL_DESIGNS){
   const tile=murals.find(t=>t.index===design.index)!;expect(tile).toBeDefined();
   const [x,y,w,h]=tile.pixelRectTopLeft;
   expect(x-g).toBeGreaterThanOrEqual(0);expect(y-g).toBeGreaterThanOrEqual(0);
   expect(x+w+g).toBeLessThanOrEqual(atlas.width);expect(y+h+g).toBeLessThanOrEqual(atlas.height);
   expect(w/h).toBeCloseTo(16/9,8);
   expect(tile.uvRectBottomLeft).toEqual([x/atlas.width,(atlas.height-y-h)/atlas.height,w/atlas.width,h/atlas.height]);
   for(const other of atlas.tiles.filter(t=>t!==tile)){
    const [a,b,c,d]=other.pixelRectTopLeft,pad=other.kind==='mural'?g:0;
    expect(x+w+g<=a-pad||x-g>=a+c+pad||y+h+g<=b-pad||y-g>=b+d+pad,`${tile.id} overlaps ${other.id}`).toBe(true);
   }
   const source=readFileSync(new URL(`../public/${tile.sourceSvg}`,import.meta.url),'utf8');
   expect(source).toContain('viewBox="0 0 4096 2304"');
   expect(source).toContain('fill="#');
   // Each uses the exact source wordmark SVG viewBox, not an approximate font.
   const wordmark=readFileSync(new URL('../public/assets/brand/eds-wordmark-original.svg',import.meta.url),'utf8');
   expect(source).toContain(wordmark.match(/viewBox="([^"]+)"/)![0]);
   sources.add(source);
  }
  expect(sources.size).toBe(8);
 });

 it('reserves every statement wall for the complete logo and keeps moved mounted items valid',()=>{
  for(const preset of BUILTIN_PRESETS.slice(1)){
   const statement=Object.entries(preset.wallFinishes).find(([,f])=>f.mural)![0];
   const mounted=preset.objects.filter(o=>o.regionId==='meeting'&&getAsset(o.assetId).placement==='wall'&&o.variant>0);
   expect(mounted.filter(o=>o.wallId===statement),preset.name).toEqual([]);
   const measured={...ROOM,walls:ROOM.walls.map(w=>({...w,height:Math.min(w.height??ROOM.height,getPaintableBounds(w.id)?.maxY??ROOM.height)}))};
   for(const object of mounted)expect(validatePlacement(object,preset.objects,measured),`${preset.name}: ${object.id}`).toEqual({valid:true});
   expect(mounted.some(o=>o.assetId==='board'&&o.variant===1),preset.name).toBe(true);
  }
 });
});
