import type { RoomDefinition } from './types';
export const ROOM: RoomDefinition = {
  id: 'lounge-room-01', architectureId: 'polycam-current-room-v1', width: 5.203635, depth: 6.097781, height: 4.32,
  bounds: { minX: -2.6018175, maxX: 2.6018175, minZ: -3.0488905, maxZ: 3.0488905 },
  walls: [
    { id: 'west', axis: 'x', coordinate: -2.6018175, normal: [1,0,0], min: -3.0488905, max: 3.0488905 },
    { id: 'east', axis: 'x', coordinate: 2.6018175, normal: [-1,0,0], min: -3.0488905, max: 3.0488905 },
    { id: 'near', axis: 'z', coordinate: -3.0488905, normal: [0,0,1], min: -2.6018175, max: 2.6018175 },
    { id: 'far', axis: 'z', coordinate: 3.0488905, normal: [0,0,-1], min: -2.6018175, max: 2.6018175 },
  ],
  door: { wallId: 'near', center: 1.95138, width: .9, height: 2.045, hinge: [1.501377,0,-3.076390], swing: { minX: 1.35, maxX: 2.5, minZ: -3.04889, maxZ: -1.85 } },
  window: { wallId: 'far', min: -1.87676, max: 1.89736, sill: 1.425, height: 1.06 },
  obstacles: [{ id: 'fixed-column', minX: -2.5827145, maxX: -2.3927145, minZ: 2.81909, maxZ: 3.03909, height: 4.32 }],
};
