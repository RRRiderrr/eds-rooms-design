export type Vec3 = [number, number, number];
export type AppMode = 'editor' | 'archviz';
export type PlacementType = 'floor' | 'wall';
export type Category = 'seating' | 'tables' | 'chairs' | 'work' | 'storage' | 'lighting' | 'plants' | 'acoustic' | 'wallDecor' | 'signage' | 'clocks' | 'boards' | 'accessories' | 'rugs' | 'separators';
export interface AssetVariant { index: number; label: string; dimensions: Vec3; model: string; supportPolygon?: [number,number][]; }
export interface MaterialVariant { id: string; label: string; color: string; surface: 'fabric' | 'wood' | 'metal' | 'plastic' | 'stone' | 'ceramic' | 'leaf' | 'rug'; }
export interface AssetDefinition {
  id: string; label: string; category: Category; placement: PlacementType;
  variants: AssetVariant[]; materials: MaterialVariant[];
  collision: 'solid' | 'cover' | 'accessory' | 'wall';
  mountHeight?: number; description: string;
  wallClearance?: number;
  wallTopClearance?: number;
  wallLayer?: 'background' | 'graphic';
  productionRef: string; proxyRef: string;
}
export type DesignRegionId = 'hall' | 'meeting';
export interface RegionPresetSelection { presetId: string; basePresetId: string; modified: boolean; }
export interface WallFinish { color: string | null; motif: 0 | 1 | 2 | 3; accent: string; mural?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16; }
/** Independent wall paint graphic. Angle rotates within the wall plane in radians. */
export interface WallGraphic { width: number; height: number; angle: number; opacity: number; layer: number; color: string; }
export interface SceneObject { id: string; assetId: string; variant: number; material: string; position: Vec3; rotation: number; wallId?: string; regionId?: DesignRegionId; label?: string; graphic?: WallGraphic; }
export interface LayerVisibility { ceiling: boolean; walls: boolean; doors: boolean; windows: boolean; structure: boolean; furniture: boolean; decor: boolean; plants: boolean; wallDecor: boolean; grid: boolean; autoWalls: boolean; }
export interface SceneConfig {
  schemaVersion: 2; projectId: 'polycam-lounge-room'; roomId: string; presetId: string; name: string;
  createdAt: string; updatedAt: string; basePresetId: string; modified: boolean;
  objects: SceneObject[]; doorOpen: boolean; layers: LayerVisibility;
  regionPresets: Record<DesignRegionId, RegionPresetSelection>;
  wallFinishes: Record<string, WallFinish>;
  hallDecorRevision?:1;
  doorLabelRevision?:1;
}
export interface WallSurface { id: string; axis: 'x' | 'z'; coordinate: number; normal: Vec3; min: number; max: number; label?: string; height?: number; openings?: { min: number; max: number; minY: number; maxY: number; kind: 'door' | 'window' }[]; }
export interface RoomDefinition {
  id: string; architectureId: string; width: number; depth: number; height: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  walls: WallSurface[];
  door: { wallId: string; center: number; width: number; height: number; hinge: Vec3; swing: { minX: number; maxX: number; minZ: number; maxZ: number } };
  window: { wallId: string; min: number; max: number; sill: number; height: number };
  obstacles: { id: string; minX: number; maxX: number; minZ: number; maxZ: number; height: number; kind?: 'wall' | 'column' | 'structure' }[];
}
export interface PlacementResult { valid: boolean; reason?: string; collidingId?: string; }
export interface SceneStoreSnapshot { config: SceneConfig; canUndo: boolean; canRedo: boolean; }
export const DEFAULT_LAYERS: LayerVisibility = { ceiling: false, walls: true, doors: true, windows: true, structure: true, furniture: true, decor: true, plants: true, wallDecor: true, grid: true, autoWalls: true };
export const PROJECT_ID = 'polycam-lounge-room' as const;
export const SCHEMA_VERSION = 2 as const;
export const MAX_SCENE_OBJECTS = 1000;
export const DEFAULT_WALL_FINISH: WallFinish = { color: null, motif: 0, accent: '#a0ff3d' };
