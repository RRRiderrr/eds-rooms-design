import { beforeAll,describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { configureSpace,getPlacementRoom,getPlacementSurfaces,SPACE } from '../src/core/space';
import { ROOM } from '../src/core/room';
import { validatePlacement,wallAnchor } from '../src/core/placement';
import { clonePreset } from '../src/catalog/presets';
import { parsePreset } from '../src/core/schema';
import type { SceneObject } from '../src/core/types';
describe('Existing full-building placement adapter',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));
 it('allows measured floor areas outside the central lounge without changing its preset bounds',()=>{const item:SceneObject={id:'outside',assetId:'pouf',variant:1,material:'oat',position:[10,0,-3.6],rotation:0};expect(getPlacementRoom(item)).toBe(SPACE);expect(validatePlacement(item,[],getPlacementRoom(item)).valid).toBe(true);expect(getPlacementRoom({...item,position:[0,0,0]})).toBe(ROOM);expect(ROOM.width).toBe(5.203635);});
 it('rejects furniture crossing an actual wall segment',()=>{const item:SceneObject={id:'crosses-wall',assetId:'chair',variant:1,material:'oat',position:[3.36731,0,0],rotation:0};const result=validatePlacement(item,[],getPlacementRoom(item));expect(result.valid).toBe(false);expect(result.collidingId).toContain('wall-19');});
 it('preserves the actual door hole in wall0 rather than using the full wall bounding box',()=>{const item:SceneObject={id:'in-door-gap',assetId:'sideTable',variant:1,material:'oak',position:[-23.705497436,0,-3.85634954],rotation:0};expect(validatePlacement(item,[],getPlacementRoom(item)).valid).toBe(true);expect(validatePlacement({...item,position:[item.position[0],0,-2.5]},[],SPACE).valid).toBe(false);});
 it('supports38 real wall faces plus4 aliases and protects their real door apertures',()=>{expect(getPlacementSurfaces()).toHaveLength(42);const mount:SceneObject={id:'real-wall-art',assetId:'art',variant:1,material:'white',...wallAnchor('wall-0',-3.85634954,1.5,.045,SPACE)};expect(getPlacementRoom(mount)).toBe(SPACE);expect(validatePlacement(mount,[],SPACE).valid).toBe(false);expect(validatePlacement({...mount,...wallAnchor('wall-0',-2.1,1.5,.045,SPACE)},[],SPACE).valid).toBe(true);});
 it('imports real wall IDs as inert identifiers and rejects unknown wall mounting through placement',()=>{const config=clonePreset(1),art=config.objects.find(o=>o.id==='Artwork')!;art.wallId='wall-999';const imported=parsePreset(config).config.objects.find(o=>o.id==='Artwork')!;expect(imported.wallId).toBe('wall-999');expect(validatePlacement(imported,[],getPlacementRoom(imported)).valid).toBe(false);});
});
