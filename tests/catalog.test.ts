import { beforeAll, describe, expect, it } from 'vitest';
import {readFileSync} from 'node:fs';
import {configureSpace,getPlacementRoom} from '../src/core/space';
import { ASSETS, getVariant } from '../src/catalog/catalog';
import { BUILTIN_PRESETS, clonePreset } from '../src/catalog/presets';
import { validateScene, snapAngle, snapPosition, validatePlacement, wallAnchor } from '../src/core/placement';
import { parsePreset, serializePreset } from '../src/core/schema';
import { SceneStore } from '../src/core/store';
import { createAssetObject, disposeAssetObject } from '../src/catalog/geometry';
import { Box3, Vector3, Mesh } from 'three';
describe('Semantic catalog and room presets',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));
 it('has absent variant0 for every asset and16 complete immutable presets',()=>{expect(BUILTIN_PRESETS.length).toBeGreaterThanOrEqual(16);expect(BUILTIN_PRESETS[0].objects.filter(o=>o.assetId!=='edsSignage')).toHaveLength(0);for(const p of BUILTIN_PRESETS){const signs=p.objects.filter(o=>o.assetId==='edsSignage'&&o.wallId==='wall-38');expect(signs.map(o=>o.variant).sort()).toEqual([1,2,3,4,5]);}for(const a of ASSETS)expect(a.variants[0].index).toBe(0);expect(Object.isFrozen(BUILTIN_PRESETS[1])).toBe(true);});
 it('all presets obey measured bounds, swing, window, walls and mutual collisions',()=>{const issues=BUILTIN_PRESETS.flatMap(p=>validateScene(p.objects,getPlacementRoom).map(i=>({preset:p.presetId,...i})));expect(issues).toEqual([]);});
 it('roundtrips portable configuration, migrates v0 and rejects executable/foreign/malformed input',()=>{const p=clonePreset(1),r=parsePreset(serializePreset(p));expect(r.config.objects).toEqual(p.objects);expect(parsePreset({...p,schemaVersion:0}).config.schemaVersion).toBe(1);expect(()=>parsePreset({...p,projectId:'foreign'})).toThrow();expect(()=>parsePreset({...p,schemaVersion:99})).toThrow();expect(()=>parsePreset({...p,objects:[{...p.objects[0],position:[NaN,0,0]}]})).toThrow();expect(()=>parsePreset('()=>alert(1)')).toThrow();});
 it('unknown model versions safely become absent and unknown assets are skipped',()=>{const p=clonePreset(1);p.objects[0].variant=999;const r=parsePreset(p);expect(r.config.objects[0].variant).toBe(0);expect(r.warnings.length).toBeGreaterThan(0);});
 it('snaps metres and angles and permits smooth placement when disabled',()=>{expect(snapPosition([.27,0,-.13],.25)).toEqual([.25,0,-.25]);expect(snapPosition([.27,0,-.13],.25,false)).toEqual([.27,0,-.13]);expect(snapAngle(.27,15)).toBeCloseTo(Math.PI/12);});
 it('store undo/redo restores configuration without mutating builtins',()=>{const s=new SceneStore(clonePreset(1));const original=JSON.stringify(s.state.objects);s.remove('MainSofa');expect(s.state.modified).toBe(true);s.undo();expect(JSON.stringify(s.state.objects)).toBe(original);s.redo();expect(s.state.objects.some(o=>o.id==='MainSofa')).toBe(false);s.resetToPreset();expect(JSON.stringify(s.state.objects)).toBe(original);expect(BUILTIN_PRESETS[1].objects.some(o=>o.id==='MainSofa')).toBe(true);});
 it('all geometry has real surface normals/UVs, a visible curated finish and recognisable dimensions',()=>{for(const asset of ASSETS)for(const variant of asset.variants.filter(v=>v.index)){for(const mode of ['editor','archviz'] as const){const g=createAssetObject(asset.id,variant.index,asset.materials[0].id,mode);const size=new Box3().setFromObject(g).getSize(new Vector3());expect(size.x,asset.id).toBeGreaterThan(.05);expect(size.y,asset.id).toBeGreaterThan(.005);expect(size.z,asset.id).toBeGreaterThan(asset.placement==='wall'?.005:.01);expect(size.x,asset.id).toBeLessThan(variant.dimensions[0]+.1);expect(size.y,asset.id).toBeLessThan(variant.dimensions[1]+.1);expect(size.z,asset.id).toBeLessThan(variant.dimensions[2]+.1);let visibleFinish=false;g.traverse(o=>{if(o instanceof Mesh){const n=o.geometry.getAttribute('normal'),uv=o.geometry.getAttribute('uv');expect(n.count).toBeGreaterThan(0);expect(uv.count).toBe(n.count);for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat.userData.colorVariant===asset.materials[0].id&&mat.userData.surface===asset.materials[0].surface||asset.id==='edsSignage'&&mat.userData.preserveOriginal)visibleFinish=true;}});expect(visibleFinish,`${asset.id}:${variant.index} must visibly use its selected material`).toBe(true);disposeAssetObject(g);}}});
 it('requires wall mounting, floor support and preserves the door swing',()=>{
  const floor={id:'candidate',assetId:'sofa',variant:1,material:'oat',position:[1.8,0,-2.5] as [number,number,number],rotation:0};
  expect(validatePlacement(floor,[]).valid).toBe(false);expect(validatePlacement(floor,[],undefined,{freePlacement:true}).valid).toBe(true);
  const art={id:'wall-candidate',assetId:'art',variant:1,material:'white',position:[0,0,0] as [number,number,number],rotation:0};expect(validatePlacement(art,[]).valid).toBe(false);
  const anchored={...art,...wallAnchor('west',0,1.6,.045)};expect(validatePlacement(anchored,[]).valid).toBe(true);
  const window={...art,...wallAnchor('far',0,1.8,.045)};expect(validatePlacement(window,[]).valid).toBe(false);
 });
 it('keeps the saved user preset as its own reset baseline',()=>{const s=new SceneStore(clonePreset(2));const saved={...clonePreset(2),presetId:'user-unit-test',basePresetId:'user-unit-test',name:'Р›РѕРєР°Р»СЊРЅРёР№ РґРёР·Р°Р№РЅ',modified:false};s.markSaved(saved);s.remove('MainSofa');s.resetToPreset();expect(s.state.presetId).toBe('user-unit-test');expect(s.state.objects.some(o=>o.id==='MainSofa')).toBe(true);});
 it('fits accessories to rotated support surfaces at the actual top height',()=>{
  const table={id:'support',assetId:'meetingTable',variant:3,material:'oak',position:[0,0,0] as [number,number,number],rotation:Math.PI/2};
  const vase={id:'vase',assetId:'accessory',variant:3,material:'white',position:[0,.74,.4] as [number,number,number],rotation:0};
  expect(validatePlacement(vase,[table]).valid).toBe(true);
  expect(validatePlacement({...vase,position:[.32,.74,0]},[table]).valid).toBe(false);
  expect(validatePlacement({...vase,position:[0,.9,.4]},[table]).valid).toBe(false);
  expect(validatePlacement({...vase,id:'second'},[table,vase]).valid).toBe(false);
 });
 it('moves supported accessories with their table and restores the whole group on undo',()=>{
  const store=new SceneStore(clonePreset(1)),table=store.state.objects.find(o=>o.id==='CoffeeTable')!,books=store.state.objects.find(o=>o.id==='CoffeeBooks')!;
  store.upsert({...table,position:[table.position[0]-.25,0,table.position[2]],rotation:Math.PI/2});
  const moved=store.state.objects.find(o=>o.id==='CoffeeBooks')!;expect(moved.position[0]).toBeCloseTo(books.position[0]-.25);expect(moved.rotation).toBeCloseTo(Math.PI/2);expect(validatePlacement(moved,store.state.objects).valid).toBe(true);
  store.remove(table.id);expect(store.state.objects.find(o=>o.id===books.id)!.variant).toBe(0);store.undo();expect(store.state.objects.find(o=>o.id===books.id)!.variant).toBeGreaterThan(0);store.undo();expect(store.state.objects.find(o=>o.id===books.id)).toEqual(books);
 });
 it('reset after a modified draft reload uses the original read-only builtin',()=>{const draft=clonePreset(1);draft.objects=draft.objects.filter(o=>o.id!=='MainSofa');draft.modified=true;const store=new SceneStore(draft);store.resetToPreset();expect(store.state.objects).toEqual(BUILTIN_PRESETS[1].objects);});
 it('reset after reloading a modified user draft restores its saved IndexedDB baseline',()=>{const saved={...clonePreset(4),presetId:'user-saved',basePresetId:'user-saved'};const draft=structuredClone(saved);draft.objects=[];draft.modified=true;const store=new SceneStore(draft);store.registerBaseline(saved);store.resetToPreset();expect(store.state.objects).toEqual(saved.objects);});
});
