import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {clonePreset} from '../src/catalog/presets';
import {rearPartitions} from '../src/catalog/rear-partitions';
import {SceneStore} from '../src/core/store';
import {configureSpace} from '../src/core/space';
import {currentDraft} from '../src/draft';
import {hasPreviousRearPartitionLayout} from '../src/core/rear-partition-revision';

describe('Adding the rear planting to an existing design',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));
 const oldDraft=()=>{const config=clonePreset(3);config.objects=config.objects.filter(o=>o.assetId!=='botanicalDivider');config.modified=true;config.regionPresets.hall.modified=true;config.wallFinishes['wall-23']={color:'#a2b8fe',accent:'#0b30c1',motif:2};return config;};
 it('adds a complete screen group with one Undo, retaining all furniture and finishes',()=>{
  const config=oldDraft(),store=new SceneStore(config),objects=structuredClone(store.state.objects),finishes=structuredClone(store.state.wallFinishes);
  expect(store.addRearPartitions()).toEqual({added:2});
  expect(store.state.objects.filter(o=>o.assetId!=='botanicalDivider')).toEqual(objects);
  expect(store.state.wallFinishes).toEqual(finishes);
  expect(store.state.regionPresets.meeting).toEqual(config.regionPresets.meeting);
  expect(store.addRearPartitions()).toEqual({added:0});
  store.undo();expect(store.state.objects).toEqual(objects);expect(store.state.wallFinishes).toEqual(finishes);
  store.redo();expect(store.state.objects.filter(o=>o.assetId==='botanicalDivider')).toHaveLength(2);
 });
 it('does not partially insert a group into occupied space',()=>{
  const config=oldDraft(),position=rearPartitions(0)[0].position;
  config.objects.push({id:'custom-obstruction',assetId:'pouf',variant:1,material:'oat',position:[...position],rotation:0,regionId:'hall'});
  const store=new SceneStore(config),before=structuredClone(store.state);
  expect(store.addRearPartitions().reason).toBeTruthy();expect(store.state).toEqual(before);expect(store.canUndo).toBe(false);
 });
 it('restores only a missing module and preserves the other moved modules',()=>{
  const config=oldDraft();config.objects.push(...rearPartitions(0));
  config.objects.find(o=>o.id==='hall-rear-screen-2')!.position[0]+=.1;
  config.objects.find(o=>o.id==='hall-rear-screen-1')!.variant=0;
  const store=new SceneStore(config),kept=structuredClone(store.state.objects.filter(o=>o.id!=='hall-rear-screen-1'));
  expect(store.addRearPartitions()).toEqual({added:1});expect(store.state.objects.filter(o=>o.id!=='hall-rear-screen-1')).toEqual(kept);
 });
 it('corrects only the old four-module group as one reversible edit, keeping furniture, paint and chosen models',()=>{
  const config=oldDraft(),positions=[[-21.35,-3.9],[-21.85,-2.25],[-21.35,-.6],[-19.95,1.1]];
  positions.forEach(([x,z],i)=>config.objects.push({id:`hall-rear-screen-${i+1}`,assetId:'botanicalDivider',variant:i+1,material:'sage',position:[x,0,z],rotation:Math.PI/2,regionId:'hall'}));
  const store=new SceneStore(config),before=structuredClone(store.state);
  expect(hasPreviousRearPartitionLayout(store.state.objects)).toBe(true);
  expect(store.addRearPartitions()).toEqual({added:0,rearranged:true});
  const screens=store.state.objects.filter(o=>o.assetId==='botanicalDivider');expect(screens).toHaveLength(2);
  expect(screens.map(o=>o.position)).toEqual(rearPartitions(0).map(o=>o.position));
  expect(screens.map(o=>[o.variant,o.material])).toEqual([[1,'sage'],[2,'sage']]);
  expect(store.state.objects.filter(o=>o.assetId!=='botanicalDivider')).toEqual(before.objects.filter(o=>o.assetId!=='botanicalDivider'));
  expect(store.state.wallFinishes).toEqual(before.wallFinishes);expect(store.state.regionPresets.meeting).toEqual(before.regionPresets.meeting);
  store.undo();expect(store.state.objects).toEqual(before.objects);store.redo();expect(store.state.objects.filter(o=>o.assetId==='botanicalDivider')).toHaveLength(2);
 });
 it('never treats a custom moved group or a deliberate deletion as the old prepared arrangement',()=>{
  const config=oldDraft(),positions=[[-21.35,-3.9],[-21.85,-2.25],[-21.35,-.6],[-19.95,1.1]];
  positions.forEach(([x,z],i)=>config.objects.push({id:`hall-rear-screen-${i+1}`,assetId:'botanicalDivider',variant:i+1,material:'sage',position:[x,0,z],rotation:Math.PI/2,regionId:'hall'}));
  const moved=structuredClone(config);moved.objects.find(o=>o.id==='hall-rear-screen-1')!.position[0]+=.3;expect(hasPreviousRearPartitionLayout(moved.objects)).toBe(false);
  config.objects=config.objects.filter(o=>o.id!=='hall-rear-screen-4');expect(hasPreviousRearPartitionLayout(config.objects)).toBe(false);
 });
 it('retains a deliberate screen deletion on draft reload',()=>{
  const store=new SceneStore(clonePreset(3));store.remove('hall-rear-screen-1');
  const reloaded=currentDraft(structuredClone(store.state));
  expect(reloaded.objects.find(o=>o.id==='hall-rear-screen-1')).toBeUndefined();
 });
});
