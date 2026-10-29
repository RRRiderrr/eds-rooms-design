import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ASSETS,getVariant} from '../src/catalog/catalog';
import {BUILTIN_PRESETS,HALL_PRESETS,clonePreset} from '../src/catalog/presets';
import {HALL_LAYOUT,originalHallTables} from '../src/core/hall';
import {validatePlacement} from '../src/core/placement';
import {configureSpace,getPlacementRoom} from '../src/core/space';
import {SceneStore} from '../src/core/store';
import {currentDraft} from '../src/draft';

describe('Optional sculptural EDS accents in hall designs',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));

 it('adds the existing 75 mm deep logo in four selected halls without replacing approved signs',()=>{
  const included:string[]=[],positions=new Set<string>();
  for(const preset of HALL_PRESETS){
   const logos=preset.objects.filter(o=>o.assetId==='edsSignage');
   if(logos.length){
    included.push(preset.presetId);expect(logos).toHaveLength(1);
    const logo=logos[0];expect(logo).toMatchObject({id:'HallVolumeLogo',assetId:'edsSignage',variant:6,material:'original',wallId:'wall-38',regionId:'hall'});
    expect(validatePlacement(logo,preset.objects,getPlacementRoom(logo))).toEqual({valid:true});
    positions.add(JSON.stringify(logo.position));
    const wall=getPlacementRoom(logo).walls.find(w=>w.id===logo.wallId)!,[width,height,depth]=getVariant(logo.assetId,logo.variant).dimensions;
    expect(depth).toBe(.075);expect(logo.position[1]+height/2).toBeLessThan(3);
    for(const opening of wall.openings??[])expect(logo.position[0]+width/2<=opening.min||logo.position[0]-width/2>=opening.max).toBe(true);
   }
   expect(preset.objects.filter(o=>o.assetId==='edsTimeline')).toHaveLength(1);
   expect(preset.objects.filter(o=>o.assetId==='edsUkraine')).toHaveLength(1);
   expect(preset.objects.filter(o=>o.assetId==='hallDesk')).toEqual(originalHallTables());
   expect(preset.objects.filter(o=>o.assetId==='doorPlaque')).toHaveLength(HALL_LAYOUT.doors.length);
  }
  expect(included).toEqual(['hall-preset-1','hall-preset-4','hall-preset-6','hall-preset-7']);
  expect(positions.size).toBe(4);
  expect(BUILTIN_PRESETS.every(p=>p.objects.every(o=>o.id!=='HallVolumeLogo'))).toBe(true);
 });

 it('keeps a deliberate logo removal and all existing content in a modified saved draft',()=>{
  const store=new SceneStore(clonePreset('hall-preset-1'));
  store.remove('HallVolumeLogo');const before=structuredClone(store.state),restored=currentDraft(structuredClone(before));
  expect(restored.objects.some(o=>o.id==='HallVolumeLogo')).toBe(false);
  expect(restored.objects).toEqual(before.objects);expect(restored.wallFinishes).toEqual(before.wallFinishes);
  expect(restored.regionPresets).toEqual(before.regionPresets);
 });

 it('describes the library without photo-origin wording in any visible catalogue text',()=>{
  const visible=ASSETS.flatMap(a=>[a.label,a.description,...a.variants.map(v=>v.label),...a.materials.map(m=>m.label)]);
  for(const label of visible)expect(label).not.toMatch(/фотограф|(?:^|[\s·])фото(?:[\s,.]|$)/i);
 });
});
