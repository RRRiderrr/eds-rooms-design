import {wallAnchor} from '../core/placement';
import {hallWallSurfaces} from '../core/hall';
import {ROOM} from '../core/room';
import type {SceneObject} from '../core/types';

/** Wall_12_Clean was identified by ray-casting the user's current Blender
 * viewport on 2026-10-28. This clear span is above the stair-side approach,
 * away from door14, paint strip and the planted alcove screens. */
export function hallClocks(style=0):SceneObject[]{
 const room={...ROOM,walls:hallWallSurfaces()};
 return [{id:'HallFeatureClock',assetId:'wallClock',variant:style%6+1,material:'original',
  ...wallAnchor('wall-12',-2.2,1.9,.035,room),regionId:'hall'}];
}
