import {Color,SRGBColorSpace} from 'three';
import {getMaterial} from '../catalog/catalog';
import {getPlacementSurfaces} from '../core/space';
import {getPaintableBounds,getWallPaintRect} from '../core/wall-paint';
import {sortedWallGraphics,wallGraphicFor} from '../core/wall-graphics';
import type {SceneObject,WallFinish,WallSurface} from '../core/types';
import atlas from '../../public/assets/brand/murals/atlas.json';

export interface PortableWallPaintFace { finish?:WallFinish; wall:WallSurface; }
export interface PortableWallPaintBounds { minAlong:number; maxAlong:number; minY:number; maxY:number; }
const preferredPixelsPerMeter=128;
const maximumTexels=8_000_000;

export function portableWallPaintBounds(wall:WallSurface):PortableWallPaintBounds {
 const vertical=getPaintableBounds(wall.id)??{minY:.07,maxY:wall.height??3.6};
 return {minAlong:wall.min,maxAlong:wall.max,...vertical};
}

/** A single RGBA8 wall overlay for GPU drivers that cannot compile the layered
 * material. It contains two equal-height pages: face A at the top, B below.
 * Horizontal pixels run from increasing WORLD along, so the sampling shader
 * must not mirror X. Artwork is mirrored here for negative viewer-U normals.
 * With CanvasTexture.flipY=true, sample A at (u,.5+.5*v), B at (u,.5*v), where
 * v=(worldY-minY)/(maxY-minY). The shader must retain its plaster/normal mask.
 *
 * The supplied objects are candidates already scoped to this wall binding;
 * normal matching assigns opposite-side aliases to the appropriate face.
 * Openings remain actual holes in the original wall geometry, never quads.
 * No DOM insertion, network request, scene mutation or persistent cache occurs.
 */
export function renderPortableWallPaint(
 image:CanvasImageSource,
 faces:readonly PortableWallPaintFace[],
 strips:readonly SceneObject[],
 graphics:readonly SceneObject[],
 maxTextureSize=4096,
):HTMLCanvasElement|null {
 const pages=faces.slice(0,2);
 if(!pages.length)return null;
 const surfaces=new Map<string,WallSurface>(getPlacementSurfaces().map(wall=>[wall.id,wall]));
 for(const face of pages)if(!surfaces.has(face.wall.id))surfaces.set(face.wall.id,face.wall);
 const sourceWall=(object:SceneObject)=>surfaces.get(object.wallId??'');
 const matches=(object:SceneObject,face:PortableWallPaintFace)=>{
  const source=sourceWall(object);
  return !!source&&source.axis===face.wall.axis&&source.normal[0]*face.wall.normal[0]+source.normal[2]*face.wall.normal[2]>.65;
 };
 const orderedGraphics=sortedWallGraphics([...graphics]);
 const work=pages.map((face,index)=>({
  ...face,bounds:portableWallPaintBounds(face.wall),
  skip:index===1&&face.wall.normal[0]*pages[0].wall.normal[0]+face.wall.normal[2]*pages[0].wall.normal[2]>.999,
  strips:strips.filter(object=>object.assetId==='brandDoorPanel'&&object.variant>0&&matches(object,face)),
  graphics:orderedGraphics.filter(object=>wallGraphicFor(object).opacity>0&&matches(object,face)),
 }));
 if(!work.some(face=>!face.skip&&(face.finish?.color||face.finish?.mural||face.finish?.motif||face.strips.length||face.graphics.length)))return null;

 const maxSize=Math.max(2,Math.min(4096,Number.isFinite(maxTextureSize)?Math.floor(maxTextureSize):4096));
 const maxWidth=Math.max(.01,...work.map(face=>face.bounds.maxAlong-face.bounds.minAlong));
 const maxHeight=Math.max(.01,...work.map(face=>face.bounds.maxY-face.bounds.minY));
 let width=Math.min(maxSize,Math.max(16,Math.ceil(maxWidth*preferredPixelsPerMeter)));
 let faceHeight=Math.min(Math.floor(maxSize/2),Math.max(8,Math.ceil(maxHeight*preferredPixelsPerMeter)));
 if(width*faceHeight*2>maximumTexels){const factor=Math.sqrt(maximumTexels/(width*faceHeight*2));width=Math.max(1,Math.floor(width*factor));faceHeight=Math.max(1,Math.floor(faceHeight*factor));}
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=faceHeight*2;
 const context=canvas.getContext('2d');
 if(!context)throw new Error('Portable wall paint Canvas2D is unavailable');
 context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
 const scratch=document.createElement('canvas');
 let scratchContext:CanvasRenderingContext2D|null=null,scratchKey='';
 const tile=(kind:'motif'|'mural',index:number)=>atlas.tiles.find(entry=>entry.id===`${kind}-${index}`);
 const tinted=(index:number,color:string):HTMLCanvasElement|undefined=>{
  const entry=tile('motif',index);if(!entry)return;
  const key=`${index}:${color}`;if(key===scratchKey)return scratch;
  const [x,y,w,h]=entry.pixelRectTopLeft;
  if(scratch.width!==w||scratch.height!==h){scratch.width=w;scratch.height=h;scratchContext=null;}
  scratchContext??=scratch.getContext('2d');
  if(!scratchContext)throw new Error('Portable wall mask Canvas2D is unavailable');
  scratchContext.globalCompositeOperation='source-over';scratchContext.clearRect(0,0,w,h);
  scratchContext.drawImage(image,x,y,w,h,0,0,w,h);
  scratchContext.globalCompositeOperation='source-in';scratchContext.fillStyle=color;scratchContext.fillRect(0,0,w,h);
  scratchContext.globalCompositeOperation='source-over';scratchKey=key;return scratch;
 };
 const clip=(bounds:PortableWallPaintBounds)=>{
  context.beginPath();context.rect(bounds.minAlong,bounds.minY,bounds.maxAlong-bounds.minAlong,bounds.maxY-bounds.minY);context.clip();
 };
 const draw=(face:PortableWallPaintFace,index:number,kind:'motif'|'mural',center:number,y:number,w:number,h:number,color?:string,angle=0,opacity=1)=>{
  const entry=tile(kind,index);if(!entry||w<=0||h<=0||opacity<=0)return;
  const direction=face.wall.axis==='x'?-face.wall.normal[0]:face.wall.normal[2];
  context.save();context.globalAlpha=opacity;
  context.translate(center,y);context.scale(direction,1);context.rotate(angle);context.scale(1,-1);
  if(kind==='motif'){
   const mask=tinted(index,color??'#0b30c1');if(mask)context.drawImage(mask,-w/2,-h/2,w,h);
  }else{
   const [x,top,width,height]=entry.pixelRectTopLeft;context.drawImage(image,x,top,width,height,-w/2,-h/2,w,h);
  }
  context.restore();
 };

 for(let page=0;page<work.length;page++){
  const face=work[page],bounds=face.bounds,w=bounds.maxAlong-bounds.minAlong,h=bounds.maxY-bounds.minY;
  if(face.skip||w<=0||h<=0)continue;
  // Canvas native Y goes down. All subsequent drawing coordinates are metres,
  // with world Y up; individual image helpers invert their source image Y.
  context.save();context.beginPath();context.rect(0,page*faceHeight,width,faceHeight);context.clip();
  context.setTransform(width/w,0,0,-faceHeight/h,-bounds.minAlong*width/w,(page+1)*faceHeight+bounds.minY*faceHeight/h);
  clip(bounds);
  const finish=face.finish;
  if(finish?.color){context.fillStyle=finish.color;context.fillRect(bounds.minAlong,bounds.minY,w,h);}
  if(finish?.mural){
   const imageWidth=Math.max(w,h*16/9),imageHeight=imageWidth*9/16;
   draw(face,finish.mural,'mural',(bounds.minAlong+bounds.maxAlong)/2,(bounds.minY+bounds.maxY)/2,imageWidth,imageHeight);
  }
  if(finish?.motif){
   const motif=finish.motif,motifWidth=motif===1?Math.min(3.24,w-.4):motif===2?2.4:1,motifHeight=motif===1?.491:motif===2?2.4:1;
   const bottom=motif===1?Math.min(2.72,bounds.maxY-.55):motif===2?.72:2;
   draw(face,motif,'motif',(bounds.minAlong+bounds.maxAlong)/2,bottom+motifHeight/2,motifWidth,motifHeight,finish.accent,0,.88);
  }
  for(const object of face.strips){
   const source=sourceWall(object)!,rect=getWallPaintRect(object,source),stripWidth=rect.maxAlong-rect.minAlong,stripHeight=rect.maxY-rect.minY;
   if(stripWidth<=0||stripHeight<=0)continue;
   const center=(rect.minAlong+rect.maxAlong)/2,centerY=(rect.minY+rect.maxY)/2,color=getMaterial('brandDoorPanel',object.material).color;
   const direction=source.axis==='x'?-source.normal[0]:source.normal[2];
   context.save();clip(rect);
   if(object.variant===2){
    context.translate(center,centerY);context.scale(direction,1);
    context.beginPath();context.moveTo(-stripWidth/2,-stripHeight/2);context.lineTo(stripWidth/2,-stripHeight/2);
    context.lineTo(stripWidth/2,stripHeight*(.5-.42*.075));context.lineTo(stripWidth*.08,stripHeight/2);context.lineTo(-stripWidth/2,stripHeight/2);context.closePath();
    context.fillStyle=color;context.fill();
   }else{
    context.fillStyle=color;context.fillRect(rect.minAlong,rect.minY,stripWidth,stripHeight);
    if(object.variant===3){
     // Match the existing mask UV y*8 with its [0,1] bounds: the motif occupies
     // the lowest eighth, rather than repeating beyond that transparent mask.
     const dark=new Color(color).multiplyScalar(1-.38*.55).getStyle(SRGBColorSpace);
     draw(face,3,'motif',center,rect.minY+stripHeight/16,stripWidth,stripHeight/8,dark);
    }
   }
   context.restore();
  }
  for(const object of face.graphics){
   const source=sourceWall(object)!,g=wallGraphicFor(object),along=object.position[source.axis==='x'?2:0];
   context.save();clip(portableWallPaintBounds(source));
   draw(face,object.variant,'motif',along,object.position[1],g.width,g.height,g.color,g.angle,g.opacity);
   context.restore();
  }
  context.restore();
 }
 // The scratch mask is copied synchronously into the result on every draw.
 // Release its backing store instead of retaining one bitmap per motif/color.
 scratch.width=scratch.height=1;
 return canvas;
}
