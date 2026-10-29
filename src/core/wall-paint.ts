import measured from '../../assets-src/main-hall/paintable-surfaces.json';
import {getVariant} from '../catalog/catalog';
import type {SceneObject,WallSurface} from './types';

export interface PaintableBounds { minY:number; maxY:number; }
export interface WallPaintRect extends PaintableBounds { minAlong:number; maxAlong:number; }
const hall=measured.hall as Record<string,PaintableBounds>;
const meeting=measured.meeting as Record<string,PaintableBounds>;
const roomAliases:Record<string,string>={'wall-17':'west','wall-26':'east','wall-21':'near','wall-16':'far'};
const repairedExteriorIds=new Set([1,2,5,10,17,19,21,22,25,26,28,29,32].map(id=>`wall-${id}`));

/** Measured plaster starts above the skirting and ends below the black steel.
 * Unknown future walls have no measured bounds; their own height is the fallback. */
export function getPaintableBounds(wallId:string):PaintableBounds|undefined {
 if(repairedExteriorIds.has(wallId))return {minY:.07,maxY:3};
 const bounds=meeting[wallId]??hall[wallId]??meeting[roomAliases[wallId]];
 return bounds?{minY:bounds.minY,maxY:bounds.maxY}:undefined;
}

/** A saved strip remains an ordinary semantic item, while its visible paint is
 * clipped to the actual wall. This also fixes old drafts without changing them. */
export function getWallPaintRect(object:SceneObject,wall:WallSurface):WallPaintRect {
 const [width,height]=getVariant(object.assetId,object.variant).dimensions;
 const along=object.position[wall.axis==='x'?2:0];
 const bounds=getPaintableBounds(wall.id)??{minY:.07,maxY:wall.height??3.6};
 const clip=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
 return {
  minAlong:clip(along-width/2,wall.min,wall.max),
  maxAlong:clip(along+width/2,wall.min,wall.max),
  minY:clip(object.position[1]-height/2,bounds.minY,bounds.maxY),
  maxY:clip(object.position[1]+height/2,bounds.minY,bounds.maxY),
 };
}
