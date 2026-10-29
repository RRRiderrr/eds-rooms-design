import { getMaterial } from '../catalog/catalog';
import { CORPORATE_MOTIF_DESIGNS } from '../catalog/corporate-motifs';
import { hallWallSurfaces } from './hall';
import { ROOM } from './room';
import { wallRegion } from './regions';
import { getPlacementSurfaces } from './space';
import { getPaintableBounds } from './wall-paint';
import type { RoomDefinition, SceneConfig, SceneObject, WallGraphic, WallSurface } from './types';
import { MAX_SCENE_OBJECTS } from './types';

export const MAX_GRAPHICS_PER_WALL = 64;
type Point = [number, number];
type Rect = { minAlong: number; maxAlong: number; minY: number; maxY: number };
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const defaultGraphic: WallGraphic = { width: 1, height: 1, angle: 0, opacity: 1, layer: 0, color: '#0b30c1' };

export function parseWallGraphic(input: unknown, defaults: WallGraphic = defaultGraphic): WallGraphic {
 if (!isRecord(input)) throw new Error('Некоректні параметри корпоративного мотиву');
 const value = { ...defaults, ...input };
 if (![value.width, value.height].every(v => typeof v === 'number' && Number.isFinite(v) && v >= .05 && v <= 20)) throw new Error('Ширина та висота мотиву мають бути від 0,05 до 20 м');
 if (typeof value.angle !== 'number' || !Number.isFinite(value.angle) || Math.abs(value.angle) >= 1000) throw new Error('Некоректний кут мотиву');
 if (typeof value.opacity !== 'number' || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1) throw new Error('Прозорість мотиву має бути від 0 до 100%');
 if (typeof value.layer !== 'number' || !Number.isInteger(value.layer) || value.layer < 0 || value.layer >= MAX_GRAPHICS_PER_WALL) throw new Error('Некоректний порядок накладання мотиву');
 if (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color)) throw new Error('Колір мотиву має бути у форматі #RRGGBB');
 // Canonical angles make repeated export/import stable without rejecting turns.
 const angle = value.angle >= -Math.PI && value.angle < Math.PI ? value.angle : ((value.angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
 return { width: value.width as number, height: value.height as number, angle: Math.abs(angle) < 1e-12 ? 0 : angle, opacity: value.opacity, layer: value.layer, color: value.color.toLowerCase() };
}

export function wallGraphicFor(object: SceneObject): WallGraphic {
 const design = CORPORATE_MOTIF_DESIGNS.find(d => d.index === object.variant) ?? CORPORATE_MOTIF_DESIGNS[0];
 const defaults = { ...defaultGraphic, width: design.width, height: design.height, color: getMaterial('corporateMotif', object.material).color.toLowerCase() };
 return parseWallGraphic(object.graphic ?? {}, defaults);
}

/** Viewer-space positive U maps to these wall coordinates on each normal. */
export function wallGraphicDirection(wall: WallSurface): number { return wall.axis === 'x' ? -wall.normal[0] : wall.normal[2]; }

export function wallGraphicCorners(object: SceneObject, wall: WallSurface): Point[] {
 const graphic = wallGraphicFor(object), c = Math.cos(graphic.angle), s = Math.sin(graphic.angle), direction = wallGraphicDirection(wall);
 const along = object.position[wall.axis === 'x' ? 2 : 0], height = object.position[1];
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => {
  const u = x * graphic.width / 2, v = y * graphic.height / 2;
  return [along + direction * (u * c - v * s), height + u * s + v * c];
 });
}

export function wallGraphicBounds(object: SceneObject, wall: WallSurface): Rect {
 const points = wallGraphicCorners(object, wall);
 return { minAlong: Math.min(...points.map(p => p[0])), maxAlong: Math.max(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])), maxY: Math.max(...points.map(p => p[1])) };
}

function paintRect(wall: WallSurface): Rect {
 const bounds = getPaintableBounds(wall.id) ?? { minY: .07, maxY: wall.height ?? 3.6 };
 return { minAlong: wall.min, maxAlong: wall.max, ...bounds };
}
function apertures(wall: WallSurface, room: RoomDefinition): Rect[] {
 const result = (wall.openings ?? []).map(o => ({ minAlong: o.min, maxAlong: o.max, minY: o.minY, maxY: o.maxY }));
 if (wall.id === room.door.wallId) result.push({ minAlong: room.door.center - room.door.width / 2, maxAlong: room.door.center + room.door.width / 2, minY: 0, maxY: room.door.height });
 if (wall.id === room.window.wallId) result.push({ minAlong: room.window.min, maxAlong: room.window.max, minY: room.window.sill, maxY: room.window.sill + room.window.height });
 return result;
}

/** Geometric pick clipping. Artwork alpha is tested by the renderer separately. */
export function isWallGraphicPointVisible(object: SceneObject, wall: WallSurface, along: number, y: number, room: RoomDefinition = ROOM): boolean {
 const rect = paintRect(wall);
 if (along < rect.minAlong || along > rect.maxAlong || y < rect.minY || y > rect.maxY) return false;
 if (apertures(wall, room).some(o => along > o.minAlong && along < o.maxAlong && y > o.minY && y < o.maxY)) return false;
 const g = wallGraphicFor(object), direction = wallGraphicDirection(wall), dx = (along - object.position[wall.axis === 'x' ? 2 : 0]) * direction, dy = y - object.position[1];
 const x = dx * Math.cos(g.angle) + dy * Math.sin(g.angle), v = -dx * Math.sin(g.angle) + dy * Math.cos(g.angle);
 return Math.abs(x) <= g.width / 2 + 1e-8 && Math.abs(v) <= g.height / 2 + 1e-8;
}

function clipped(points: Point[], rect: Rect): Point[] {
 let result = points;
 for (const [axis, edge, keepGreater] of [[0,rect.minAlong,true],[0,rect.maxAlong,false],[1,rect.minY,true],[1,rect.maxY,false]] as const) {
  const input = result; result = []; if (!input.length) break;
  for (let i = 0; i < input.length; i++) {
   const a = input[i], b = input[(i + 1) % input.length], insideA = keepGreater ? a[axis] >= edge : a[axis] <= edge, insideB = keepGreater ? b[axis] >= edge : b[axis] <= edge;
   if (insideA) result.push(a);
   if (insideA !== insideB) { const t = (edge - a[axis]) / (b[axis] - a[axis]); result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
 }
 return result;
}
function area(points: Point[]): number { return Math.abs(points.reduce((sum,p,i) => { const q = points[(i+1)%points.length]; return sum + p[0]*q[1] - q[0]*p[1]; },0)) / 2; }

/** Crop against plaster and the union of openings, including rotated graphics.
 * Partitioning at aperture edges avoids double subtraction of overlapping gaps. */
export function wallGraphicVisibleArea(object: SceneObject, wall: WallSurface, room: RoomDefinition = ROOM): number {
 const rect = paintRect(wall), points = clipped(wallGraphicCorners(object,wall),rect), gaps = apertures(wall,room);
 if (!points.length) return 0;
 const xs = [...new Set([rect.minAlong,rect.maxAlong,...gaps.flatMap(o=>[o.minAlong,o.maxAlong]).filter(x=>x>rect.minAlong&&x<rect.maxAlong)])].sort((a,b)=>a-b);
 const ys = [...new Set([rect.minY,rect.maxY,...gaps.flatMap(o=>[o.minY,o.maxY]).filter(y=>y>rect.minY&&y<rect.maxY)])].sort((a,b)=>a-b);
 let visible = 0;
 for (let i=0;i<xs.length-1;i++) for (let j=0;j<ys.length-1;j++) {
  const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2;
  if (gaps.some(o=>x>o.minAlong&&x<o.maxAlong&&y>o.minY&&y<o.maxY)) continue;
  visible += area(clipped(points,{minAlong:xs[i],maxAlong:xs[i+1],minY:ys[j],maxY:ys[j+1]}));
 }
 return visible;
}

/** Stable painter order: an equal layer keeps scene insertion order. */
export function sortedWallGraphics(objects: SceneObject[], wallId?: string): SceneObject[] {
 return objects.filter(o=>o.assetId==='corporateMotif'&&o.variant>0&&(!wallId||o.wallId===wallId)).sort((a,b)=>wallGraphicFor(a).layer-wallGraphicFor(b).layer);
}

/** Convert the former single shader parameter into an independent, editable
 * item without adding new art. An absent scalar never resurrects deleted items.
 * Unknown future surfaces stay untouched until architecture metadata is ready. */
export function upgradeWallGraphics(config: SceneConfig, surfaces: WallSurface[] = getPlacementSurfaces()): SceneConfig {
 const walls = new Map([...ROOM.walls,...hallWallSurfaces(),...surfaces].map(w=>[w.id,w]));
 let objects = config.objects, finishes = config.wallFinishes, changed = false;
 for (const [wallId,finish] of Object.entries(config.wallFinishes)) {
  if (!finish.motif) continue; const wall = walls.get(wallId); if (!wall) continue;
  const prefix = `legacy-corporate-motif-${wallId}`, existing = objects.find(o=>o.id===prefix&&o.assetId==='corporateMotif'&&o.wallId===wallId);
  if (!existing && (objects.length>=MAX_SCENE_OBJECTS || objects.filter(o=>o.assetId==='corporateMotif'&&o.variant>0&&o.wallId===wallId).length>=MAX_GRAPHICS_PER_WALL)) continue;
  if (!changed) { objects=[...objects]; finishes={...finishes}; changed=true; }
  if (!existing) {
   let id=prefix,suffix=2; while (objects.some(o=>o.id===id)) id=`${prefix}-${suffix++}`;
   const bounds=paintRect(wall),width=finish.motif===1?Math.max(.05,Math.min(3.24,wall.max-wall.min-.4)):finish.motif===2?2.4:1;
   const height=finish.motif===1?.491:finish.motif===2?2.4:1, bottom=finish.motif===1?Math.min(2.72,bounds.maxY-.55):finish.motif===2?.72:2;
   const along=(wall.min+wall.max)/2,inset=.0082;
   objects.push({id,assetId:'corporateMotif',variant:finish.motif,material:'eds-blue',wallId,regionId:wallRegion(wallId),position:wall.axis==='x'?[wall.coordinate+wall.normal[0]*inset,bottom+height/2,along]:[along,bottom+height/2,wall.coordinate+wall.normal[2]*inset],rotation:wall.normal[0]===1?Math.PI/2:wall.normal[0]===-1?-Math.PI/2:wall.normal[2]===-1?Math.PI:0,graphic:{width,height,angle:0,opacity:.88,layer:0,color:finish.accent}});
  }
  finishes[wallId]={...finish,motif:0};
 }
 return changed?{...config,objects,wallFinishes:finishes}:config;
}
