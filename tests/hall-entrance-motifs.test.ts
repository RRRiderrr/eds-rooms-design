import {describe,expect,it} from 'vitest';
import manifest from '../public/assets/architecture/scene-space.json';
import {HALL_PRESETS} from '../src/catalog/presets';
import {configureSpace,getPlacementRoom,getPlacementSurfaces} from '../src/core/space';
import {validatePlacement} from '../src/core/placement';
import {wallGraphicBounds,wallGraphicFor,wallGraphicVisibleArea} from '../src/core/wall-graphics';

describe('Hall entrance artwork',()=>{
 it('keeps three editable motifs on the hall face, clear of the entrance and plaque, in every hall preset',()=>{
  configureSpace(manifest);const wall=getPlacementSurfaces().find(w=>w.id==='wall-21')!;
  expect(wall.normal).toEqual([0,0,-1]);expect(wall.openings?.some(o=>o.kind==='door')).toBe(true);
  const designs=new Set<string>();
  for(const preset of HALL_PRESETS){
   const objects=preset.objects.filter(o=>o.id.startsWith('hall-entrance-graphic-'));
   expect(objects).toHaveLength(3);designs.add(objects.map(o=>o.variant).join(','));
   const plaque=preset.objects.find(o=>o.id==='hall-door-03-plaque')!;
   for(const object of objects){
    expect(object).toMatchObject({assetId:'corporateMotif',wallId:'wall-21',regionId:'hall'});
    const g=wallGraphicFor(object),room=getPlacementRoom(object),bounds=wallGraphicBounds(object,wall);
    expect(validatePlacement(object,preset.objects,room).valid).toBe(true);
    expect(wallGraphicVisibleArea(object,wall,room)).toBeCloseTo(g.width*g.height,5);
    expect(bounds.maxAlong).toBeLessThan(plaque.position[0]-.18);
   }
  }
  expect(designs.size).toBe(8);
 });
});
