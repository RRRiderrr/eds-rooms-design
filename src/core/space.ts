import { getAsset,getVariant } from '../catalog/catalog';
import { ROOM } from './room';
import type { RoomDefinition,SceneObject,Vec3,WallSurface } from './types';
import {HALL_LAYOUT,hallWallSurfaces} from './hall';

export interface PlacementSurface extends WallSurface { label:string; }
interface Segment {wallId:string;a:[number,number];b:[number,number];thickness:number;minY:number;maxY:number;}
const aliases:PlacementSurface[]=ROOM.walls.map(w=>({...w,label:({west:'Переговорна · ліва стіна',east:'Переговорна · права стіна',near:'Переговорна · стіна біля входу',far:'Переговорна · стіна з вікном'} as Record<string,string>)[w.id]}));
export const SPACE:RoomDefinition={id:'existing-full-space',architectureId:'polycam-full-building-v1',width:49.6,depth:8.47,height:4.32,bounds:{minX:-25.7477145,maxX:23.8522855,minZ:-5.2209095,maxZ:3.2490905},walls:[...aliases],door:{...ROOM.door},window:{...ROOM.window},obstacles:[...ROOM.obstacles]};
let surfaces:PlacementSurface[]=[...aliases];
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function number(value:unknown,fallback=0):number{return typeof value==='number'&&Number.isFinite(value)?value:fallback;}
function vector(value:unknown,size:number):number[]|undefined{return Array.isArray(value)&&value.length===size&&value.every(v=>typeof v==='number'&&Number.isFinite(v))?value as number[]:undefined;}
function openings(wall:WallSurface,segments:Segment[]):NonNullable<WallSurface['openings']>{
 const spans=segments.filter(s=>s.wallId===wall.id).map(s=>{const a=wall.axis==='x'?s.a[1]:s.a[0],b=wall.axis==='x'?s.b[1]:s.b[0];return [Math.max(wall.min,Math.min(a,b)),Math.min(wall.max,Math.max(a,b))];}).sort((a,b)=>a[0]-b[0]);
 const result:NonNullable<WallSurface['openings']>=[];if(!spans.length)return result;
 let end=wall.min;for(const [min,max]of spans){if(min-end>.28)result.push({min:end,max:min,minY:0,maxY:2.1,kind:'door'});end=Math.max(end,max);}if(wall.max-end>.28)result.push({min:end,max:wall.max,minY:0,maxY:2.1,kind:'door'});
 // This exact opening belongs to the measured central-room wall. Remaining
 // apertures can be provided by later exports through wall.openings metadata.
 const far=ROOM.walls.find(w=>w.id==='far')!;
 if(wall.axis==='z'&&Math.abs(wall.coordinate-far.coordinate)<.025&&wall.min<=ROOM.window.min&&wall.max>=ROOM.window.max)result.push({min:ROOM.window.min,max:ROOM.window.max,minY:ROOM.window.sill,maxY:ROOM.window.sill+ROOM.window.height,kind:'window'});
 return result;
}
/** Configure from the existing-building export, never from a portable preset. */
export function configureSpace(manifest:unknown):RoomDefinition {
 if(!record(manifest)||manifest.schemaVersion!==1||!record(manifest.bounds))throw new Error('Некоректні метадані архітектури простору');
 const min=vector(manifest.bounds.min,3),max=vector(manifest.bounds.max,3);if(!min||!max||max[0]<=min[0]||max[2]<=min[2])throw new Error('Некоректні межі простору');
 const navigation=record(manifest.navigation)?manifest.navigation:{};
 const segments:Segment[]=(Array.isArray(navigation.wallSegments)?navigation.wallSegments:[]).flatMap(raw=>{if(!record(raw)||typeof raw.wallId!=='string')return[];const a=vector(raw.a,2),b=vector(raw.b,2);if(!a||!b)return[];return[{wallId:raw.wallId,a:a as [number,number],b:b as [number,number],thickness:Math.max(.015,number(raw.thickness,.1)),minY:number(raw.minY),maxY:number(raw.maxY,1.65)}];});
 const hallFaces=new Map(hallWallSurfaces().map(w=>[w.id,w]));
 const real:PlacementSurface[]=(Array.isArray(manifest.walls)?manifest.walls:[]).flatMap(raw=>{
  if(!record(raw)||typeof raw.id!=='string'||!/^wall-\d+$/.test(raw.id)||(raw.axis!=='x'&&raw.axis!=='z'))return[];
  const shared=HALL_LAYOUT.meetingRoom.walls.find(w=>w.sourceWallId===raw.id);
  const face=hallFaces.get(raw.id),normal=face?.normal??(shared?shared.normal.map(n=>-n) as Vec3:vector(raw.normal,3) as Vec3|undefined);if(!normal)return[];
  const thickness=Math.max(.015,number(raw.thickness,.1));const axis=raw.axis;
  const coordinate=face?.coordinate??(shared?shared.coordinate-shared.normal[axis==='x'?0:2]*thickness:number(raw.coordinate)+normal[axis==='x'?0:2]*thickness/2);
  const wall:PlacementSurface={id:raw.id,axis,coordinate,min:number(raw.min),max:number(raw.max),normal,height:number(raw.height,3.6),label:`Стіна ${raw.id.slice(5)} · ${axis.toUpperCase()} ${coordinate.toFixed(2)} м`};
  if(face)Object.assign(wall,{min:face.min,max:face.max,height:face.height});
  if(wall.max<=wall.min)return[];wall.openings=face?.openings?.map(o=>({...o}))??openings(wall,segments);
  if(shared&&!face){
   wall.height=shared.height;wall.openings=[];
   if(shared.id==='far'){const w=HALL_LAYOUT.meetingRoom.window;wall.openings.push({min:w.min,max:w.max,minY:w.sill,maxY:w.sill+w.height,kind:'window'});}
   if(shared.id==='near'){const d=HALL_LAYOUT.meetingRoom.door;wall.openings.push({min:d.openingMin,max:d.openingMax,minY:0,maxY:d.openingHeight,kind:'door'});}
  }
  if(Array.isArray(raw.openings))for(const gap of raw.openings){if(!record(gap)||(gap.kind!=='door'&&gap.kind!=='window'))continue;const opening={min:number(gap.min),max:number(gap.max),minY:number(gap.minY),maxY:number(gap.maxY),kind:gap.kind};if(opening.max>opening.min&&opening.maxY>opening.minY)wall.openings.push(opening as NonNullable<WallSurface['openings']>[number]);}
  return[wall];
 }).sort((a,b)=>Number(a.id.slice(5))-Number(b.id.slice(5)));
 const walls=segments.map((segment,index)=>({id:`${segment.wallId}-segment-${index}`,minX:Math.min(segment.a[0],segment.b[0])-segment.thickness/2,maxX:Math.max(segment.a[0],segment.b[0])+segment.thickness/2,minZ:Math.min(segment.a[1],segment.b[1])-segment.thickness/2,maxZ:Math.max(segment.a[1],segment.b[1])+segment.thickness/2,height:segment.maxY,kind:'wall' as const}));
 const semanticSourceRoots=new Set(HALL_LAYOUT.originalTables.flatMap(table=>[table.sourceRoot,table.sourceRoot.match(/^(?:East_)?Desk_\d+/)?.[0]??table.sourceRoot]));
 const structure:RoomDefinition['obstacles']=(Array.isArray(navigation.obstacles)?navigation.obstacles:[]).flatMap(raw=>{if(!record(raw)||typeof raw.id!=='string'||semanticSourceRoots.has(raw.id))return[];const [minX,maxX,minZ,maxZ,height]=[raw.minX,raw.maxX,raw.minZ,raw.maxZ,raw.height];if(![minX,maxX,minZ,maxZ,height].every(v=>typeof v==='number'&&Number.isFinite(v)))return[];return[{id:raw.id,minX:minX as number,maxX:maxX as number,minZ:minZ as number,maxZ:maxZ as number,height:height as number,kind:raw.kind==='column'?'column' as const:'structure' as const}];});
 Object.assign(SPACE,{id:typeof manifest.id==='string'?manifest.id:SPACE.id,architectureId:typeof manifest.architectureId==='string'?manifest.architectureId:SPACE.architectureId,width:max[0]-min[0],depth:max[2]-min[2],height:number(navigation.ceilingY,max[1]),bounds:{minX:min[0],maxX:max[0],minZ:min[2],maxZ:max[2]},walls:[...aliases,...real],obstacles:[...walls,...ROOM.obstacles,...structure]});surfaces=[...aliases,...real];return SPACE;
}
export function getPlacementSurfaces():PlacementSurface[]{return surfaces.map(w=>({...w}));}
export function getPlacementRoom(object:Pick<SceneObject,'position'|'wallId'> & Partial<Pick<SceneObject,'assetId'|'variant'|'rotation'>>):RoomDefinition {
 if(object.wallId)return /^wall-\d+$/.test(object.wallId)?SPACE:ROOM;
 const [x,,z]=object.position,b=ROOM.bounds;
 if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)return SPACE;
 // A shape that straddles the primary boundary uses the real wall segments,
 // rather than being rejected merely because it crosses an abstract room box.
 if(object.assetId&&object.variant){const asset=getAsset(object.assetId);if(asset.placement==='floor'){const [w,,d]=getVariant(object.assetId,object.variant).dimensions,c=Math.abs(Math.cos(object.rotation??0)),s=Math.abs(Math.sin(object.rotation??0)),hx=(w*c+d*s)/2,hz=(w*s+d*c)/2;
  // This custom console's mounting plates meet the measured window wall;
  // its 3 mm rear tabletop lip must not route it into unrelated hall surfaces.
  const attachedConsole=object.assetId==='windowBar'&&object.variant===2&&Math.cos(object.rotation??0)>.99999&&Math.abs(z+d/2-(b.maxZ+.003))<.001&&x-hx>=b.minX+.025&&x+hx<=b.maxX-.025;
  if(attachedConsole)return ROOM;
  if(x-hx<b.minX||x+hx>b.maxX||z-hz<b.minZ||z+hz>b.maxZ)return SPACE;}}
 return ROOM;
}
