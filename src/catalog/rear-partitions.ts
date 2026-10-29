import type { SceneObject } from '../core/types';

/** Two collinear planted modules screen the entry/team-room alcove, leaving
 * stairs 14 entirely on the open hall side. The diagonal has a generous
 * bypass at either end; it is not a corridor or an enclosure. Source desks
 * and lounge furniture retain their measured positions. */
const halfStep = Math.SQRT1_2;
export const REAR_PARTITION_PLACEMENTS = [
  [-20.6 - halfStep, -.25 - halfStep],
  [-20.6 + halfStep, -.25 + halfStep],
] as const;

export const REAR_PARTITION_ROTATION = -Math.PI / 4;

/** Centre paths with 1.1 m measured free width, used by navigation QA.
 * The stairs route is direct; entry/team-room routes go round the free end. */
export const REAR_PARTITION_ROUTES = [
  { doorId: 'door-14', points: [[-19, -1.6], [-22.7, -3.85]] },
  { doorId: 'door-15', points: [[-19, -1.6], [-22.3, -2.6], [-22.75, -2], [-22.75, -.35], [-24.85, .35]] },
  { doorId: 'door-02', points: [[-19, -1.6], [-22.3, -2.6], [-22.75, -2], [-22.75, .95], [-21.55, .95]] },
] as const;

const finishes = ['oak', 'walnut', 'graphite', 'terracotta', 'white', 'sage'] as const;

export function rearPartitions(style: number): SceneObject[] {
  return REAR_PARTITION_PLACEMENTS.map(([x, z], index) => ({
    id: `hall-rear-screen-${index + 1}`,
    assetId: 'botanicalDivider',
    variant: ((style + index) % 6) + 1,
    material: finishes[(style + index) % finishes.length],
    position: [x, 0, z],
    rotation: REAR_PARTITION_ROTATION,
    regionId: 'hall',
  }));
}
