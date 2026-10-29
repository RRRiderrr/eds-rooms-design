import source from '../../assets-src/main-hall/layout-readable.json';
import type { SceneObject, Vec3, WallSurface } from './types';

export interface HallDoorAnchor {
  id: string; wallId: string; label: string; position: Vec3; rotation: number;
  plaquePosition: Vec3; colorElementPosition: Vec3; normal: Vec3;
}
export interface SourceHallTable extends SceneObject { dimensions: Vec3; sourceRoot: string; sourceMeshes: string[]; }
export interface HallLayout {
  schemaVersion: 1; originalTables: SourceHallTable[]; doors: HallDoorAnchor[];
  hallWalls: (Omit<WallSurface, 'openings'> & { openings?: { min: number; max: number; bottom: number; top: number; kind: 'door' | 'window' }[] })[];
  hallBounds: { min: Vec3; max: Vec3 }; hallFloorPolygon: { outer: [number,number][]; holes: [number,number][][]; numericalClosureTolerance: number };
  meetingRoom: {
    walls: (WallSurface & { sourceWallId:string })[];
    window: {min:number;max:number;sill:number;height:number};
    door: {openingMin:number;openingMax:number;openingHeight:number};
  };
}

/** Exported from the user's existing Blender scene; no room dimensions or
 * source furniture transforms are estimated by the preset generator. */
export const HALL_LAYOUT = source as unknown as HallLayout;
export function originalHallTables(): SceneObject[] {
  return HALL_LAYOUT.originalTables.map(table => ({
    id: table.id, assetId: table.assetId, variant: table.variant, material: table.material,
    position: [...table.position], rotation: table.rotation, regionId: 'hall',
  }));
}
export function hallWallSurfaces(): WallSurface[] {
  return HALL_LAYOUT.hallWalls.map(wall => ({
    id: wall.id, axis: wall.axis, coordinate: wall.coordinate, min: wall.min, max: wall.max,
    normal: [...wall.normal], height: wall.height,
    openings: (wall.openings ?? []).map(opening => ({
      min: opening.min, max: opening.max, minY: opening.bottom, maxY: opening.top, kind: opening.kind,
    })),
  }));
}
/** Includes numerical contact with the exported floor boundary (source tables
 * can meet it to sub-millimetre precision), but never the meeting-room cutout. */
export function isInHallFloor(point:[number,number],tolerance=.001):boolean {
  const contains=(polygon:[number,number][])=>{
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[j],b=polygon[i],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
      const t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/length)):0;
      if(Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dz)<=tolerance)return true;
      if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  };
  return contains(HALL_LAYOUT.hallFloorPolygon.outer)&&!HALL_LAYOUT.hallFloorPolygon.holes.some(contains);
}
