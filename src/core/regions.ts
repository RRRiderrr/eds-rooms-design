import { ROOM } from './room';
import type { DesignRegionId, RegionPresetSelection, SceneObject, WallFinish } from './types';

export const DESIGN_REGIONS: { id: DesignRegionId; label: string }[] = [
  { id: 'hall', label: 'Великий зал' },
  { id: 'meeting', label: 'Переговорна' },
];
export function isDesignRegion(value: unknown): value is DesignRegionId { return value === 'hall' || value === 'meeting'; }
export function wallRegion(wallId: string): DesignRegionId { return /^(west|east|near|far)$/.test(wallId) ? 'meeting' : 'hall'; }
export function isWallId(value: unknown): value is string { return typeof value === 'string' && /^(west|east|near|far|wall-\d+)$/.test(value); }

/** Ownership is semantic: moving furniture does not change which regional preset
 * owns it. Only legacy objects without ownership use the measured room bounds. */
export function objectRegion(object: Pick<SceneObject, 'position' | 'assetId' | 'wallId' | 'regionId'>): DesignRegionId {
  if (isDesignRegion(object.regionId)) return object.regionId;
  if (object.wallId && /^(west|east|near|far)$/.test(object.wallId)) return 'meeting';
  if (['edsSignage','edsTimeline','edsUkraine'].includes(object.assetId)) return 'hall';
  if (object.wallId && /^(west|east|near|far)$/.test(object.wallId)) return 'meeting';
  const [x, , z] = object.position, b = ROOM.bounds;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ ? 'meeting' : 'hall';
}
export function defaultRegionPresets(presetId = 'builtin-0', modified = false): Record<DesignRegionId, RegionPresetSelection> {
  const meeting = /^builtin-\d+$/.test(presetId) ? presetId : 'builtin-0';
  return {
    hall: { presetId: 'hall-preset-0', basePresetId: 'hall-preset-0', modified },
    meeting: { presetId: meeting, basePresetId: meeting, modified },
  };
}
export function regionWallFinishes(finishes: Record<string, WallFinish>, region: DesignRegionId): Record<string, WallFinish> {
  return Object.fromEntries(Object.entries(finishes).filter(([wallId]) => wallRegion(wallId) === region));
}
