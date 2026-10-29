import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {BUILTIN_PRESETS,HALL_PRESETS,clonePreset} from '../src/catalog/presets';
import {getAsset,DOOR_PAINT_COLORS,CORPORATE_COLORS} from '../src/catalog/catalog';
import {defaultDoorPlaqueLabel,upgradeDoorLabels} from '../src/core/door-labels';
import {parsePreset,serializePreset} from '../src/core/schema';
import {createWallSelection,disposeWallSelection} from '../src/graphics/wall-selection';
import {ROOM} from '../src/core/room';

describe('Customer wayfinding and editor wall selection',()=>{
 it('uses exit and WC text consistently in every prepared layout while preserving the other numbers',()=>{
  for(const preset of [...BUILTIN_PRESETS,...HALL_PRESETS])for(const plaque of preset.objects.filter(o=>o.assetId==='doorPlaque')){
   expect(plaque.label).toBe(defaultDoorPlaqueLabel(plaque.id.match(/door-\d+/)![0]));
  }
  expect(defaultDoorPlaqueLabel('door-14')).toBe('Вихід');expect(defaultDoorPlaqueLabel('door-15')).toBe('WC');expect(defaultDoorPlaqueLabel('door-10')).toBe('WC');expect(defaultDoorPlaqueLabel('door-08')).toBe('08');
 });
 it('upgrades only old stock inscriptions once and retains later multiline edits, positions and furniture',()=>{
  const config=clonePreset('hall-preset-3');delete config.doorLabelRevision;
  const exit=config.objects.find(o=>o.id==='hall-door-14-plaque')!,wc=config.objects.find(o=>o.id==='hall-door-15-plaque')!;
  exit.label='14';wc.label='Замовлений\nтекст';const before=structuredClone(config),next=upgradeDoorLabels(config);
  expect(config).toEqual(before);expect(next.objects.find(o=>o.id===exit.id)!.label).toBe('Вихід');expect(next.objects.find(o=>o.id===wc.id)!.label).toBe(wc.label);
  expect(next.objects.filter(o=>o.id!==exit.id)).toEqual(before.objects.filter(o=>o.id!==exit.id));
  next.objects.find(o=>o.id===exit.id)!.label='Свій\n\nВихід';expect(upgradeDoorLabels(next)).toBe(next);
  expect(parsePreset(serializePreset(next),{preserveIdentity:true}).config.objects).toEqual(next.objects);
 });
 it('gives door paint a separate pale pigment palette while preserving exact corporate print colors',()=>{
  expect(CORPORATE_COLORS.map(c=>c.color)).toContain('#0B30C1');
  expect(getAsset('brandDoorPanel').materials.map(m=>m.color)).toEqual(DOOR_PAINT_COLORS.map(c=>c.color));
  for(const paint of DOOR_PAINT_COLORS){const c=new THREE.Color(paint.color);const hsl={h:0,s:0,l:0};c.getHSL(hsl,THREE.SRGBColorSpace);expect(hsl.l).toBeGreaterThan(.65);expect(hsl.s).toBeLessThan(.5);}
 });
 it('draws an editor-only surface tint and frame with real open window and door apertures',()=>{
  for(const wall of ROOM.walls){
   const overlay=createWallSelection(wall),meshes:THREE.Mesh[]=[];overlay.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});overlay.updateMatrixWorld(true);
   expect(meshes.map(m=>m.name)).toEqual(['WallSelection_Tint','WallSelection_Frame']);
   const fill=meshes[0],normal=new THREE.Vector3(...wall.normal),along=(wall.min+wall.max)/2;
   const rayAt=(p:number,y:number)=>{const point=new THREE.Vector3(wall.axis==='x'?wall.coordinate:p,y,wall.axis==='z'?wall.coordinate:p);return new THREE.Raycaster(point.addScaledVector(normal,.2),normal.clone().negate()).intersectObject(fill);};
   expect(rayAt(along,.5).length).toBeGreaterThan(0);
   if(wall.id==='far')expect(rayAt((ROOM.window.min+ROOM.window.max)/2,ROOM.window.sill+.3)).toHaveLength(0);
   if(wall.id==='near')expect(rayAt(ROOM.door.center,1)).toHaveLength(0);
   expect((meshes[1].material as THREE.MeshBasicMaterial).depthTest).toBe(false);
   expect(meshes.every(m=>m.userData.editorOnly&&m.renderOrder===101&&!m.castShadow)).toBe(true);disposeWallSelection(overlay);
  }
 });
});
