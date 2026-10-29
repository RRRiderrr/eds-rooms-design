import {defaultDoorPlaqueLabel} from '../src/core/door-labels';
import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {getPaintableBounds,getWallPaintRect} from '../src/core/wall-paint';
import {BUILTIN_PRESETS,HALL_PRESETS} from '../src/catalog/presets';
import {HALL_LAYOUT,hallWallSurfaces} from '../src/core/hall';
import {getAsset,getVariant} from '../src/catalog/catalog';
import {createAssetObject,disposeAssetObject} from '../src/catalog/geometry';
import type {SceneObject} from '../src/core/types';
import {SceneView} from '../src/graphics/scene-view';
import {configureSpace} from '../src/core/space';

describe('Wall paint strips use measured plaster, without freestanding fittings',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));
 it('clips every saved hall strip above skirting and below the actual steel beam',()=>{
  const walls=hallWallSurfaces();
  for(const preset of HALL_PRESETS)for(const object of preset.objects.filter(o=>o.assetId==='brandDoorPanel')){
   const wall=walls.find(w=>w.id===object.wallId)!;
   const rect=getWallPaintRect(object,wall),bounds=getPaintableBounds(wall.id)!;
   expect(rect.minY).toBeGreaterThanOrEqual(bounds.minY);
   expect(rect.maxY).toBeLessThanOrEqual(bounds.maxY);
   expect(rect.maxY).toBeCloseTo(bounds.maxY,5);
   expect(rect.minAlong).toBeGreaterThanOrEqual(wall.min);
   expect(rect.maxAlong).toBeLessThanOrEqual(wall.max);
   expect(rect.maxAlong-rect.minAlong).toBeCloseTo(getVariant(object.assetId,object.variant).dimensions[0],5);
   expect(rect.minY).toBeLessThan(1.55);expect(rect.maxY).toBeGreaterThan(1.55);
   for(const opening of wall.openings??[])expect(rect.maxAlong<=opening.min||rect.minAlong>=opening.max).toBe(true);
  }
 });
 it('places every door plaque on its painted strip in all hall and meeting presets, with numbers only on plaques',()=>{
  const walls=hallWallSurfaces();let hallPairs=0,meetingPairs=0;
  for(const [region,presets]of [['hall',HALL_PRESETS],['meeting',BUILTIN_PRESETS]] as const)for(const preset of presets){
   const plaques=preset.objects.filter(o=>o.assetId==='doorPlaque'&&o.variant>0);
   const strips=preset.objects.filter(o=>o.assetId==='brandDoorPanel'&&o.variant>0);
   expect(plaques,`${region} ${preset.presetId}: plaque count`).toHaveLength(14);
   expect(strips,`${region} ${preset.presetId}: strip count`).toHaveLength(14);
   for(const door of HALL_LAYOUT.doors){
    const plaque=plaques.find(o=>o.id===`hall-${door.id}-plaque`)!,strip=strips.find(o=>o.id===`hall-${door.id}-brand`)!;
    expect(plaque,`${preset.presetId}: ${door.id} plaque`).toBeDefined();expect(strip,`${preset.presetId}: ${door.id} paint`).toBeDefined();
    const wall=walls.find(w=>w.id===strip.wallId)!,alongIndex=wall.axis==='x'?2:0,rect=getWallPaintRect(strip,wall),[width,height]=getVariant(plaque.assetId,plaque.variant).dimensions;
    expect(plaque.wallId).toBe(strip.wallId);expect(plaque.rotation).toBeCloseTo(strip.rotation,6);
    expect(plaque.position[alongIndex]).toBeCloseTo(strip.position[alongIndex],6);
    expect(plaque.position[alongIndex]-width/2).toBeGreaterThanOrEqual(rect.minAlong-1e-6);
    expect(plaque.position[alongIndex]+width/2).toBeLessThanOrEqual(rect.maxAlong+1e-6);
    expect(plaque.position[1]-height/2).toBeGreaterThanOrEqual(rect.minY);
    expect(plaque.position[1]+height/2).toBeLessThanOrEqual(rect.maxY);
    expect(plaque.label).toBe(defaultDoorPlaqueLabel(door.id));
    expect(strip.label).toBeUndefined();
    region==='hall'?hallPairs++:meetingPairs++;
   }
  }
  expect(hallPairs).toBe(112);expect(meetingPairs).toBe(224);
 });
 it('supports measured meeting aliases, their source IDs and the lower hall steel band',()=>{
  expect(getPaintableBounds('west')!.maxY).toBeCloseTo(3.6,5);
  expect(getPaintableBounds('east')!.maxY).toBeCloseTo(3.6,5);
  expect(getPaintableBounds('wall-17')!.maxY).toBe(3);
  expect(getPaintableBounds('wall-26')!.maxY).toBe(3);
  expect(getPaintableBounds('far')).toEqual(getPaintableBounds('wall-16'));
  expect(getPaintableBounds('wall-23')!.maxY).toBeCloseTo(2.65,5);
  expect(getPaintableBounds('wall-21')!.maxY).toBeCloseTo(3,5);
  expect(getPaintableBounds('unknown-future-wall')).toBeUndefined();
 });
 it('clips a moved strip at both horizontal ends instead of covering an adjacent wall',()=>{
  const wall=hallWallSurfaces()[0],source=HALL_PRESETS[0].objects.find(o=>o.assetId==='brandDoorPanel')!;
  for(const end of [wall.min,wall.max]){
   const moved:SceneObject={...source,wallId:wall.id,position:[...source.position]};moved.position[wall.axis==='x'?2:0]=end;
   const before=JSON.stringify(moved),rect=getWallPaintRect(moved,wall);
   expect(rect.minAlong).toBeGreaterThanOrEqual(wall.min);expect(rect.maxAlong).toBeLessThanOrEqual(wall.max);
   expect(rect.maxAlong-rect.minAlong).toBeCloseTo(getVariant(moved.assetId,moved.variant).dimensions[0]/2,5);
   expect(JSON.stringify(moved)).toBe(before);
  }
 });
 it('authors flat, front-facing catalogue paint swatches without dark edge profiles or shadows',()=>{
  for(const mode of ['editor','archviz'] as const)for(let variant=1;variant<=3;variant++){
   const asset=getAsset('brandDoorPanel'),object=createAssetObject(asset.id,variant,asset.materials[0].id,mode);
   const meshes:THREE.Mesh[]=[];object.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
   expect(meshes.map(m=>m.name)).toEqual(['BrandDoorPanel_PaintSwatch']);
   expect(object.getObjectByName('BrandDoorPanel_Label')).toBeUndefined();
   const swatch=object.getObjectByName('BrandDoorPanel_PaintSwatch') as THREE.Mesh;
   swatch.geometry.computeBoundingBox();const box=swatch.geometry.boundingBox!;
   expect(box.max.z-box.min.z).toBe(0);expect(swatch.castShadow).toBe(false);expect(swatch.receiveShadow).toBe(false);
   expect(swatch.geometry.getAttribute('position').count).toBe(4);
   expect(HALL_LAYOUT.doors).toHaveLength(14);
   disposeAssetObject(object);
  }
 });
 it('keeps all 14 actual runtime strips selectable on their wall surface without duplicate number meshes',async()=>{
  // These methods own only a semantic item and Three objects; no canvas/app
  // constructor is needed to test real world transforms and ray selection.
  const view=Object.create(SceneView.prototype) as {
   createWallPaintProxy(object:SceneObject):THREE.Group;
   updateWallPaintProxy(root:THREE.Group,object:SceneObject):void;
   loadProduction(visual:{templateKey?:string},object:SceneObject):Promise<void>;
  };
  for(const saved of HALL_PRESETS[0].objects.filter(o=>o.assetId==='brandDoorPanel')){
   // Old saved drafts may still contain the former strip number. It must not
   // reintroduce a print when the editable semantic object is rendered.
   const object={...saved,label:'99'};
   const wall=hallWallSurfaces().find(w=>w.id===object.wallId)!,root=view.createWallPaintProxy(object);
   root.position.set(...object.position);root.rotation.y=object.rotation;view.updateWallPaintProxy(root,object);root.updateMatrixWorld(true);
   const hit=root.getObjectByName('BrandDoorPanel_PaintHit') as THREE.Mesh;
   expect(root.getObjectByName('BrandDoorPanel_Label')).toBeUndefined();
   expect(root.children.filter(o=>o instanceof THREE.Mesh)).toHaveLength(1);
   const material=hit.material as THREE.MeshBasicMaterial;
   expect(material.colorWrite).toBe(false);expect(material.depthWrite).toBe(false);expect(material.opacity).toBe(0);
   expect(hit.castShadow).toBe(false);
   const center=hit.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(...wall.normal);
   expect((wall.axis==='x'?center.x:center.z)-wall.coordinate).toBeCloseTo((wall.axis==='x'?normal.x:normal.z)*.00025,6);
   const ray=new THREE.Raycaster(center.clone().addScaledVector(normal,.5),normal.clone().negate());
   expect(ray.intersectObject(hit)).not.toHaveLength(0);
   const bounds=new THREE.Box3().setFromObject(hit),allowed=getPaintableBounds(wall.id)!;
   expect(bounds.min.y).toBeGreaterThanOrEqual(allowed.minY-1e-6);expect(bounds.max.y).toBeLessThanOrEqual(allowed.maxY+1e-6);
   const visual:{templateKey?:string}={};await view.loadProduction(visual,object);expect(visual.templateKey).toBe('wall-paint');
   disposeAssetObject(root);
  }
 });
});
