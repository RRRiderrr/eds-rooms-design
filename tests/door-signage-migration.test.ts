import {describe,expect,it} from 'vitest';
import {clonePreset} from '../src/catalog/presets';
import {HALL_LAYOUT} from '../src/core/hall';
import {upgradeDoorSignage} from '../src/core/door-signage';
import {parsePreset,serializePreset} from '../src/core/schema';

describe('Number-free wall paint and legacy stock plaque alignment',()=>{
 it('upgrades the old stock offset once, preserving furniture, labels and source records',()=>{
  const config=clonePreset(6),door=HALL_LAYOUT.doors[0],plaque=config.objects.find(o=>o.id===`hall-${door.id}-plaque`)!,strip=config.objects.find(o=>o.id===`hall-${door.id}-brand`)!;
  const axis=Math.abs(door.normal[0])>.5?2:0;
  plaque.position[axis]=door.plaquePosition[axis];plaque.label='02\nКімната команди';strip.label='02';
  const before=structuredClone(config.objects),result=upgradeDoorSignage(config.objects);
  expect(result.find(o=>o.id===plaque.id)!.position[axis]).toBe(strip.position[axis]);
  expect(result.find(o=>o.id===plaque.id)!.label).toBe(plaque.label);
  expect(result.find(o=>o.id===strip.id)!.label).toBeUndefined();
  expect(result.filter(o=>o.id!==plaque.id&&o.id!==strip.id)).toEqual(before.filter(o=>o.id!==plaque.id&&o.id!==strip.id));
  expect(config.objects).toEqual(before);expect(upgradeDoorSignage(result)).toEqual(result);
  expect(parsePreset(serializePreset(config),{preserveIdentity:true}).config.objects).toEqual(result);
 });
 it('does not undo a deliberate plaque move in an old custom design',()=>{
  const config=clonePreset(6),door=HALL_LAYOUT.doors[0],plaque=config.objects.find(o=>o.id===`hall-${door.id}-plaque`)!,strip=config.objects.find(o=>o.id===`hall-${door.id}-brand`)!;
  const axis=Math.abs(door.normal[0])>.5?2:0;plaque.position[axis]=door.plaquePosition[axis]+.18;strip.label='02';
  const expected=structuredClone(plaque),result=upgradeDoorSignage(config.objects);
  expect(result.find(o=>o.id===plaque.id)).toEqual(expected);
  expect(result.find(o=>o.id===strip.id)!.label).toBeUndefined();
 });
});
