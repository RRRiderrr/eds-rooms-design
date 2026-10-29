import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, Mesh } from 'three';
import { BUILTIN_PRESETS } from '../src/catalog/presets';
import { getVariant } from '../src/catalog/catalog';
import { createAssetObject, disposeAssetObject } from '../src/catalog/geometry';
import { ROOM } from '../src/core/room';
import { configureSpace, getPlacementRoom } from '../src/core/space';
import { validatePlacement, validateScene } from '../src/core/placement';
import type { SceneObject } from '../src/core/types';

const toward=(object:SceneObject,target:SceneObject)=>{
  const dx=target.position[0]-object.position[0],dz=target.position[2]-object.position[2],distance=Math.hypot(dx,dz);
  return (Math.sin(object.rotation)*dx+Math.cos(object.rotation)*dz)/distance;
};
describe('Finished room layout ergonomics',()=>{
  beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));

  it('validates all sixteen layouts against the measured room and keeps the two approved corporate signs',()=>{
    for(const config of BUILTIN_PRESETS){
      expect(validateScene(config.objects,getPlacementRoom),config.presetId).toEqual([]);
      const signs=config.objects.filter(o=>['edsTimeline','edsUkraine'].includes(o.assetId)&&o.wallId==='wall-38');expect(signs).toHaveLength(2);expect(signs.map(o=>o.assetId).sort()).toEqual(['edsTimeline','edsUkraine']);
    }
  });

  it('faces work chairs, bar stools, storage fronts and laptop screens toward their users or surfaces',()=>{
    for(const config of BUILTIN_PRESETS){
      const desk=config.objects.find(o=>o.id==='WorkDesk'),chair=config.objects.find(o=>o.id==='WorkChair');
      if(desk&&chair)expect(toward(chair,desk),config.presetId).toBeGreaterThan(.99);
      const bar=config.objects.find(o=>o.assetId==='windowBar');
      if(bar)for(const stool of config.objects.filter(o=>o.assetId==='barStool')){
        expect(Math.cos(stool.rotation),config.presetId).toBeGreaterThan(.99);
        const front=bar.position[2]-getVariant(bar.assetId,bar.variant).dimensions[2]/2,seatFront=stool.position[2]+getVariant(stool.assetId,stool.variant).dimensions[2]/2;
        expect(front-seatFront).toBeGreaterThan(.15);expect(front-seatFront).toBeLessThan(.4);
      }
      for(const storage of config.objects.filter(o=>o.assetId==='storage'&&o.position[2]>2.6))expect(Math.cos(storage.rotation)).toBeLessThan(-.99);
      for(const laptop of config.objects.filter(o=>o.assetId==='accessory'&&o.variant===2)){
        const seats=config.objects.filter(o=>o.assetId==='chair'||o.assetId==='barStool').sort((a,b)=>Math.hypot(a.position[0]-laptop.position[0],a.position[2]-laptop.position[2])-Math.hypot(b.position[0]-laptop.position[0],b.position[2]-laptop.position[2]));
        expect(toward(laptop,seats[0]),config.presetId).toBeGreaterThan(.99);
      }
    }
  });

  it('places true 85-inch media screens directly opposite the primary sofa at a useful distance',()=>{
    for(const index of [3,6,9,13]){
      const config=BUILTIN_PRESETS[index],tv=config.objects.find(o=>o.assetId==='television')!,sofa=config.objects.find(o=>o.id==='MainSofa')!;
      expect(tv.variant).toBe(3);expect(getVariant(tv.assetId,tv.variant).dimensions).toEqual([1.9,1.1,.065]);expect(tv.position[1]).toBe(1.45);
      expect(toward(sofa,tv),config.presetId).toBeGreaterThan(.995);expect(toward(tv,sofa),config.presetId).toBeGreaterThan(.995);
      const distance=Math.hypot(sofa.position[0]-tv.position[0],sofa.position[2]-tv.position[2]);expect(distance).toBeGreaterThan(3.1);expect(distance).toBeLessThan(4.1);
    }
    const sofa=BUILTIN_PRESETS[13].objects.find(o=>o.id==='MainSofa')!,[w,,d]=getVariant(sofa.assetId,sofa.variant).dimensions;
    const minZ=sofa.position[2]-(Math.abs(Math.sin(sofa.rotation))*w+Math.abs(Math.cos(sofa.rotation))*d)/2,openTip=ROOM.door.hinge[2]+ROOM.door.width;
    expect(minZ-openTip).toBeGreaterThan(.8);
  });

  it('keeps preset 6 as a connected lounge with a separate usable window workstation',()=>{
    const config=BUILTIN_PRESETS[6],sofa=config.objects.find(o=>o.id==='MainSofa')!,coffee=config.objects.find(o=>o.id==='CoffeeTable')!,chair=config.objects.find(o=>o.id==='WorkChair')!;
    const sofaFront=sofa.position[2]-getVariant(sofa.assetId,sofa.variant).dimensions[2]/2,coffeeBack=coffee.position[2]+getVariant(coffee.assetId,coffee.variant).dimensions[2]/2;
    expect(sofaFront-coffeeBack).toBeGreaterThan(.35);expect(sofaFront-coffeeBack).toBeLessThan(.55);
    expect(validatePlacement({...chair,position:[chair.position[0],0,chair.position[2]-.35]},config.objects,getPlacementRoom(chair)).valid).toBe(true);
    const lounge=config.objects.find(o=>o.id==='LoungeChair')!,plant=config.objects.find(o=>o.id==='PlantC')!,[w,,d]=getVariant(lounge.assetId,lounge.variant).dimensions;
    const chairEdge=lounge.position[0]+(Math.abs(Math.cos(lounge.rotation))*w+Math.abs(Math.sin(lounge.rotation))*d)/2,plantEdge=plant.position[0]-getVariant(plant.assetId,plant.variant).dimensions[0]/2;
    expect(plantEdge-chairEdge).toBeGreaterThan(.8);
  });

  it('mounts only the floating bar against the far wall, without weakening normal furniture bounds',()=>{
    const z=ROOM.bounds.maxZ-.55/2+.003;
    const mounted:SceneObject={id:'mounted-bar',assetId:'windowBar',variant:2,material:'oak',position:[0,0,z],rotation:0};
    expect(validatePlacement(mounted,[],ROOM).valid).toBe(true);
    const model=createAssetObject('windowBar',2,'oak','archviz');model.position.set(...mounted.position);model.updateMatrixWorld(true);const bracketBounds=new Box3();
    model.traverse(node=>{if(node instanceof Mesh&&(Array.isArray(node.material)?node.material:[node.material]).some(material=>material.userData.surface==='metal'))bracketBounds.union(new Box3().setFromObject(node));});
    expect(bracketBounds.max.z).toBeCloseTo(ROOM.bounds.maxZ,5);disposeAssetObject(model);
    expect(validatePlacement({...mounted,position:[0,0,z+.006]},[],ROOM).valid).toBe(false);
    expect(validatePlacement({...mounted,rotation:Math.PI},[],ROOM).valid).toBe(false);
    expect(validatePlacement({...mounted,rotation:Math.PI/2,position:[ROOM.bounds.maxX-.55/2+.003,0,0]},[],ROOM).valid).toBe(false);
    expect(validatePlacement({...mounted,variant:1},[],ROOM).valid).toBe(false);
    expect(validatePlacement({...mounted,assetId:'sofa',variant:1,material:'oat',position:[0,0,ROOM.bounds.maxZ-.84/2+.003]},[],ROOM).valid).toBe(false);
    for(const config of BUILTIN_PRESETS){const bar=config.objects.find(o=>o.assetId==='windowBar'&&o.variant===2);if(bar)expect(bar.position[2]).toBeCloseTo(z,8);}
  });
});
