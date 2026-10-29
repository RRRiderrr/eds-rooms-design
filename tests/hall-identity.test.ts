import {defaultDoorPlaqueLabel} from '../src/core/door-labels';
import {beforeAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Object3D} from 'three';
import {ASSETS} from '../src/catalog/catalog';
import {HALL_PRESETS,BUILTIN_PRESETS,clonePreset} from '../src/catalog/presets';
import {upgradeHallDecor} from '../src/core/hall-decor';
import {parsePreset,serializePreset} from '../src/core/schema';
import {configureSpace,getPlacementRoom} from '../src/core/space';
import {validateScene} from '../src/core/placement';
import {objectRegion} from '../src/core/regions';
import {updateWallClockHands,wallClockAngles} from '../src/graphics/wall-clock-time';

describe('EDS hall identity revision',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));
 it('uses two distinct corporate sign families and an applied wall12 clock in every prepared hall',()=>{
  const variants={edsTimeline:new Set<number>(),edsUkraine:new Set<number>(),wallClock:new Set<number>()};
  for(const config of [...HALL_PRESETS,...BUILTIN_PRESETS]){
   const hall=config.objects.filter(o=>objectRegion(o)==='hall'),signs=hall.filter(o=>['edsTimeline','edsUkraine','edsSignage','sign'].includes(o.assetId));
   expect(signs.map(o=>o.assetId).sort()).toEqual(['edsTimeline','edsUkraine']);
   const clocks=hall.filter(o=>o.assetId==='wallClock');expect(clocks).toHaveLength(1);expect(clocks[0].wallId).toBe('wall-12');
   for(const o of [...signs,...clocks])variants[o.assetId as keyof typeof variants].add(o.variant);
   expect(hall.filter(o=>o.assetId==='doorPlaque').every(o=>o.label===defaultDoorPlaqueLabel(o.id.match(/door-\d+/)![0]))).toBe(true);
   expect(validateScene(config.objects,getPlacementRoom),config.presetId).toEqual([]);
  }
  expect(variants.edsTimeline.size).toBe(8);expect(variants.edsUkraine.size).toBe(8);expect(variants.wallClock.size).toBe(6);
  expect(ASSETS.find(a=>a.id==='edsSignage')!.variants.filter(v=>v.index)).toHaveLength(6);
 });
 it('upgrades only hall decor once, preserving moved approved signs, all furniture, paint and meeting items',()=>{
  const old=clonePreset('hall-preset-2');delete old.hallDecorRevision;
  old.objects=old.objects.filter(o=>!['edsTimeline','edsUkraine','wallClock'].includes(o.assetId));
  const z=-5.123511505004883;
  [1,2,3,4,5].forEach((variant,index)=>old.objects.push({id:['HallTimeline','HallCorporate','HallWorldMap','HallSalesPlan','HallUkraine'][index],assetId:'edsSignage',variant,material:'original',position:[[-9.19,-15.72,-3.32,2.67,8.83][index],1.7,z+.028],rotation:0,wallId:'wall-38',regionId:'hall'}));
  old.objects.find(o=>o.id==='HallTimeline')!.position[0]+=.15;old.wallFinishes['wall-12']={color:'#a2b8fe',motif:0,accent:'#0b30c1'};
  const before=structuredClone(old),next=upgradeHallDecor(old);
  expect(old).toEqual(before);expect(next.objects.filter(o=>!['edsTimeline','edsUkraine','wallClock','doorPlaque'].includes(o.assetId))).toEqual(before.objects.filter(o=>!['edsSignage','doorPlaque'].includes(o.assetId)));
  expect(next.objects.find(o=>o.id==='HallTimeline')!.position).toEqual(before.objects.find(o=>o.id==='HallTimeline')!.position);
  expect(next.wallFinishes).toEqual(before.wallFinishes);expect(next.regionPresets).toEqual(before.regionPresets);expect(next.hallDecorRevision).toBe(1);
  next.objects.find(o=>o.assetId==='doorPlaque')!.label='Довільний\n\nтекст';next.objects=next.objects.filter(o=>o.assetId!=='edsTimeline');
  expect(upgradeHallDecor(next)).toBe(next);expect(parsePreset(serializePreset(next),{preserveIdentity:true}).config.objects).toEqual(next.objects);
 });
 it('rotates independent hands to actual local time without moving the wall-mounted object',()=>{
  const date=new Date(2026,9,28,3,30,30),angles=wallClockAngles(date),root=new Object3D();root.position.set(2,3,4);
  for(const kind of ['hour','minute','second']){const pivot=new Object3D();pivot.userData.clockHand=kind;root.add(pivot);}
  updateWallClockHands(root,date);expect(root.position.toArray()).toEqual([2,3,4]);
  expect(root.children[0].rotation.z).toBeCloseTo(-(3+30.5/60)*Math.PI/6);expect(root.children[1].rotation.z).toBe(angles.minute);expect(root.children[2].rotation.z).toBeCloseTo(-Math.PI);
 });
});
