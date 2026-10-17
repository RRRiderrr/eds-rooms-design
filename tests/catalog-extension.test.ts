import { describe, expect, it } from 'vitest';
import { getVariant } from '../src/catalog/catalog';
import { validatePlacement, wallAnchor } from '../src/core/placement';
import type { SceneObject } from '../src/core/types';
import { Box3, Raycaster, Vector3 } from 'three';
import { createAssetObject, disposeAssetObject } from '../src/catalog/geometry';
import { SceneStore } from '../src/core/store';
import { clonePreset } from '../src/catalog/presets';

describe('Coffee point and media wall placement', () => {
  it('supports both coffee machines on a desk or window bar, including a rotated support', () => {
    for (const variant of [1, 2]) {
      for (const assetId of ['workDesk', 'windowBar']) {
        const support: SceneObject = { id: 'support', assetId, variant: 1, material: 'oak', position: [0, 0, 0], rotation: Math.PI / 2 };
        const machine: SceneObject = { id: 'coffee', assetId: 'coffeeMachine', variant, material: 'steel', position: [0, getVariant(assetId, 1).dimensions[1], 0], rotation: Math.PI / 2 };
        expect(validatePlacement(machine, [support]).valid).toBe(true);
        expect(validatePlacement({ ...machine, position: [0, 0, 0] }, [support]).valid).toBe(false);
        expect(validatePlacement({ ...machine, position: [.5, machine.position[1], 0] }, [support]).valid).toBe(false);
      }
    }
    const littleTable: SceneObject = { id: 'little', assetId: 'sideTable', variant: 3, material: 'oak', position: [0, 0, 0], rotation: 0 };
    const machine: SceneObject = { id: 'coffee', assetId: 'coffeeMachine', variant: 2, material: 'steel', position: [0, .5, 0], rotation: 0 };
    expect(validatePlacement(machine, [littleTable]).valid).toBe(false);
  });

  it('mounts a television on a wall while protecting window openings', () => {
    const television: SceneObject = { id: 'media', assetId: 'television', variant: 2, material: 'graphite', position: [0, 0, 0], rotation: 0 };
    expect(validatePlacement(television, []).valid).toBe(false);
    expect(validatePlacement({ ...television, ...wallAnchor('west', 0, 1.6, .055) }, []).valid).toBe(true);
    expect(validatePlacement({ ...television, ...wallAnchor('far', 0, 1.8, .055) }, []).valid).toBe(false);
  });

  it('keeps the actual rotated book stack within its footprint and supported by both new coffee table tops', () => {
    const books=createAssetObject('accessory',1,'white','archviz'),bounds=new Box3().setFromObject(books),size=bounds.getSize(new Vector3()),catalog=getVariant('accessory',1).dimensions;
    for(const [index,dimension]of size.toArray().entries())expect(dimension).toBeLessThanOrEqual(catalog[index]+.00001);
    for(const variant of [4,5]) {
      const table=createAssetObject('coffeeTable',variant,'oak','archviz'),height=getVariant('coffeeTable',variant).dimensions[1];table.updateMatrixWorld(true);
      for(const x of [bounds.min.x,bounds.max.x])for(const z of [bounds.min.z,bounds.max.z]){
        const hit=new Raycaster(new Vector3(x,height+.1,z),new Vector3(0,-1,0),0,.15).intersectObject(table,true)[0];
        expect(hit,`Actual tabletop ${variant} supports the book stack corner`).toBeTruthy();expect(hit.point.y).toBeCloseTo(height,3);
      }
      disposeAssetObject(table);
    }
    disposeAssetObject(books);
    const store=new SceneStore(clonePreset(1));
    for(const variant of [4,5]) {
      const table=store.state.objects.find(o=>o.id==='CoffeeTable')!;store.upsert({...table,variant,rotation:Math.PI/2});
      const books=store.state.objects.find(o=>o.id==='CoffeeBooks')!;expect(books.variant).toBe(1);expect(books.position[1]).toBe(getVariant('coffeeTable',variant).dimensions[1]);expect(validatePlacement(books,store.state.objects).valid).toBe(true);
    }
  });
});
