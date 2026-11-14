import {beforeAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {BUILTIN_PRESETS,HALL_PRESETS} from '../src/catalog/presets';
import {createAssetObject,disposeAssetObject} from '../src/catalog/geometry';
import {wallGraphicFor} from '../src/core/wall-graphics';
import {configureSpace} from '../src/core/space';
import {getPaintableBounds} from '../src/core/wall-paint';
import {validateScene} from '../src/core/placement';
import {getPlacementRoom} from '../src/core/space';

describe('Customer brand and room revisions',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));
 it('keeps both standalone and repeated EDS arrows upright, including loaded rotated values',()=>{
  for(const variant of [5,11]){const object={...HALL_PRESETS[0].objects.find(o=>o.assetId==='corporateMotif')!,variant,graphic:{width:1,height:1,angle:.9,opacity:1,layer:0,color:'#0b30c1'}};expect(wallGraphicFor(object).angle).toBe(0);}
  for(const preset of HALL_PRESETS)for(const object of preset.objects.filter(o=>o.assetId==='corporateMotif'&&[5,11].includes(o.variant)))expect(wallGraphicFor(object).angle).toBe(0);
 });
 it('removes textual phrases from all existing printed wall compositions',()=>{for(let i=1;i<=16;i++)expect(readFileSync(new URL(`../public/assets/brand/murals/mural-${i}.svg`,import.meta.url),'utf8')).not.toMatch(/<text\b/i);});
 it('uses the logo-only wall artwork in every furnished legacy meeting preset',()=>{
  const logo=readFileSync(new URL('../public/assets/brand/murals/mural-7.svg',import.meta.url),'utf8');
  expect((logo.match(/<svg\b/g)??[])).toHaveLength(2);
  for(const p of BUILTIN_PRESETS.slice(1,16))expect(Object.values(p.wallFinishes).map(f=>f.mural),p.name).toEqual([7]);
 });
 it('adds complete meeting layouts and consistently specified hall variants',()=>{
  expect(BUILTIN_PRESETS).toHaveLength(22);expect(HALL_PRESETS).toHaveLength(14);
  const meeting=BUILTIN_PRESETS.slice(16),murals=new Set<number>(),types=new Set<string>(),sofaLayouts=new Set<string>(),sofaModels=new Set<number>();let logoCount=0,sofaCount=0;
  for(const p of meeting){
   const m=p.objects.filter(o=>o.regionId==='meeting');m.forEach(o=>types.add(o.assetId));
   expect(m.some(o=>o.assetId==='windowBar'),p.name).toBe(true);
   expect(m.some(o=>o.assetId==='workDesk'),p.name).toBe(true);
   expect(m.some(o=>o.assetId==='board'&&o.variant===1&&o.wallId==='near'),p.name).toBe(true);
   expect(m.some(o=>o.assetId==='rug'),p.name).toBe(false);
   expect(m.length,p.name).toBeGreaterThanOrEqual(8);
   const logo=m.filter(o=>o.assetId==='edsSignage'&&o.variant===6);
   expect(logo.every(o=>o.wallId==='east'),p.name).toBe(true);logoCount+=logo.length;
   const sofa=m.find(o=>o.assetId==='sofa');if(sofa){sofaCount++;sofaModels.add(sofa.variant);sofaLayouts.add(`${sofa.variant}:${sofa.position.join(',')}:${sofa.rotation}`);}
   const finishes=Object.values(p.wallFinishes).filter(f=>!!f.mural);
   expect(finishes,p.name).toHaveLength(1);expect(finishes[0].mural,p.name).not.toBe(7);murals.add(finishes[0].mural!);
  }
  expect(murals.size).toBe(6);expect(types.size).toBeGreaterThanOrEqual(7);
  expect(sofaCount).toBeGreaterThan(0);expect(sofaModels.size).toBeGreaterThanOrEqual(2);expect(sofaLayouts.size).toBeGreaterThanOrEqual(3);
  expect(logoCount).toBeGreaterThan(0);expect(logoCount).toBeLessThan(meeting.length);
  for(const p of HALL_PRESETS.slice(8)){expect(p.objects.filter(o=>o.assetId==='doorPlaque')).toHaveLength(14);expect(p.objects.filter(o=>o.assetId==='doorPlaque').every(o=>o.variant===1)).toBe(true);expect(p.objects.filter(o=>o.assetId==='brandDoorPanel').every(o=>o.variant===3)).toBe(true);expect(p.objects.filter(o=>o.assetId==='botanicalDivider').every(o=>o.variant===7)).toBe(true);}
  for(const p of [...BUILTIN_PRESETS,...HALL_PRESETS])expect(validateScene(p.objects,getPlacementRoom),p.presetId).toEqual([]);
 });
 it('models a 102 cm planter with cabinet, shelves, doors and real foliage',()=>{
  const group=createAssetObject('botanicalDivider',7,'white');const names:string[]=[];group.traverse(o=>names.push(o.name));expect(names).toContain('StoragePlanter_Shelf');expect(names.filter(n=>n==='StoragePlanter_Door')).toHaveLength(4);expect(names).toContain('Planter_pothos_leaves');expect(group.userData.planterRimHeight).toBeCloseTo(1.025);disposeAssetObject(group);
 });
});
