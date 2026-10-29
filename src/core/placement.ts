import { getAsset, getVariant } from '../catalog/catalog';
import { ROOM } from './room';
import type { PlacementResult, RoomDefinition, SceneObject, Vec3 } from './types';
type Rect = {x:number;z:number;hx:number;hz:number;angle:number};
export function footprint(object:SceneObject):Rect { const [w,,d]=getVariant(object.assetId,object.variant).dimensions; return {x:object.position[0],z:object.position[2],hx:w/2,hz:d/2,angle:object.rotation}; }
function corners(r:Rect):[number,number][] { const c=Math.cos(r.angle),s=Math.sin(r.angle); return [[-r.hx,-r.hz],[r.hx,-r.hz],[r.hx,r.hz],[-r.hx,r.hz]].map(([x,z])=>[r.x+x*c+z*s,r.z-x*s+z*c]); }
export function rectanglesOverlap(a:Rect,b:Rect,epsilon=.008):boolean {
 const ac=corners(a),bc=corners(b); const axes=[[Math.cos(a.angle),-Math.sin(a.angle)],[Math.sin(a.angle),Math.cos(a.angle)],[Math.cos(b.angle),-Math.sin(b.angle)],[Math.sin(b.angle),Math.cos(b.angle)]];
 return axes.every(([x,z])=>{const aa=ac.map(p=>p[0]*x+p[1]*z),bb=bc.map(p=>p[0]*x+p[1]*z); return Math.min(...aa)<Math.max(...bb)-epsilon && Math.min(...bb)<Math.max(...aa)-epsilon;});
}
export function snapPosition(position:Vec3,step:number,enabled=true):Vec3 { return enabled&&step>0 ? position.map(v=>Math.round(v/step)*step) as Vec3 : [...position]; }
export function snapAngle(angle:number,degrees=15,enabled=true):number { const step=degrees*Math.PI/180; return enabled&&step>0?Math.round(angle/step)*step:angle; }
export function wallAnchor(wallId:string,along:number,height:number,depth:number,room:RoomDefinition=ROOM):{position:Vec3;rotation:number;wallId:string} {
 const wall=room.walls.find(w=>w.id===wallId); if(!wall) throw new Error('Невідома поверхня стіни');
 const inset=depth/2+.008;
 return {wallId,position:wall.axis==='x'?[wall.coordinate+wall.normal[0]*inset,height,along]:[along,height,wall.coordinate+wall.normal[2]*inset], rotation: wall.normal[0]===1?Math.PI/2:wall.normal[0]===-1?-Math.PI/2:wall.normal[2]===-1?Math.PI:0};
}
type Point2=[number,number];
function pointInPolygon(point:Point2,polygon:Point2[]):boolean {
 let inside=false;const [x,z]=point;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [ax,az]=polygon[i],[bx,bz]=polygon[j];
  if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
 }
 return inside;
}
function pointSegmentDistance(p:Point2,a:Point2,b:Point2):number {
 const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
 const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length)):0;
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
}
function segmentDistance(a:Point2,b:Point2,c:Point2,d:Point2):number {
 const cross=(p:Point2,q:Point2,r:Point2)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;
 return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
function polygonSupports(points:Point2[],polygon:Point2[],clearance=.008):boolean {
 if(polygon.length<3||!points.every(point=>pointInPolygon(point,polygon)))return false;
 // Testing only corners is insufficient for concave L-shaped worktops: a
 // rotated accessory can have supported corners while its edge spans the cutout.
 return points.every((point,i)=>polygon.every((edge,j)=>segmentDistance(point,points[(i+1)%points.length],edge,polygon[(j+1)%polygon.length])>=clearance));
}
export function findAccessorySupport(object:SceneObject,objects:SceneObject[]):SceneObject|undefined {
  const accessoryCorners=corners(footprint(object));
  return objects.find(o=>{
   if(o.id===object.id||o.variant===0||!['tables','work','storage'].includes(getAsset(o.assetId).category))return false;
   const sv=getVariant(o.assetId,o.variant),[sw,sh,sd]=sv.dimensions;
   if(Math.abs(o.position[1]+sh-object.position[1])>.035)return false;
   const c=Math.cos(o.rotation),s=Math.sin(o.rotation),round=/round|oval/.test(sv.model);
   const local=accessoryCorners.map(([x,z])=>{const dx=x-o.position[0],dz=z-o.position[2];return[dx*c-dz*s,dx*s+dz*c] as Point2;});
   if(sv.supportPolygon)return polygonSupports(local,sv.supportPolygon);
   return local.every(([lx,lz])=>round?(lx/(sw/2-.008))**2+(lz/(sd/2-.008))**2<=1.001:Math.abs(lx)<=sw/2-.008&&Math.abs(lz)<=sd/2-.008);
  });
}
export function validatePlacement(object:SceneObject,objects:SceneObject[],room:RoomDefinition=ROOM,options:{freePlacement?:boolean}={}):PlacementResult {
 if(object.variant===0) return {valid:true};
 const asset=getAsset(object.assetId),variant=getVariant(object.assetId,object.variant),[w,h,d]=variant.dimensions;
 if(![...object.position,object.rotation].every(Number.isFinite)) return {valid:false,reason:'Некоректні координати'};
 if(options.freePlacement) return {valid:true};
 if(asset.placement==='wall') {
  const wall=room.walls.find(w=>w.id===object.wallId); if(!wall) return {valid:false,reason:'Виберіть стіну для настінного предмета'};
  const expected=wallAnchor(wall.id,wall.axis==='x'?object.position[2]:object.position[0],object.position[1],d,room);
  if(Math.abs(object.position[wall.axis==='x'?0:2]-expected.position[wall.axis==='x'?0:2])>.07) return {valid:false,reason:'Предмет має бути закріплений у площині стіни'};
  const along=wall.axis==='x'?object.position[2]:object.position[0];
  if(along-w/2<wall.min+.03||along+w/2>wall.max-.03||object.position[1]-h/2<(asset.wallClearance??.18)-.00001||object.position[1]+h/2>Math.min(room.height-.3,(wall.height??room.height)-(asset.wallTopClearance??.03))+.00001) return {valid:false,reason:'Предмет виходить за межі стіни'};
  for(const opening of wall.openings??[])if(along+w/2>opening.min&&along-w/2<opening.max&&object.position[1]+h/2>opening.minY&&object.position[1]-h/2<opening.maxY)return {valid:false,reason:opening.kind==='window'?'Тут розташований віконний отвір':'Тут розташований дверний отвір'};
  if(wall.id===room.window.wallId&&along+w/2>room.window.min&&along-w/2<room.window.max&&object.position[1]+h/2>room.window.sill&&object.position[1]-h/2<room.window.sill+room.window.height) return {valid:false,reason:'Тут розташований віконний отвір'};
  if(wall.id===room.door.wallId&&along+w/2>room.door.center-room.door.width/2&&along-w/2<room.door.center+room.door.width/2&&object.position[1]-h/2<room.door.height) return {valid:false,reason:'Тут розташований дверний отвір'};
  for(const other of objects) {if(other.id===object.id||other.variant===0||other.wallId!==object.wallId)continue; const a=getAsset(other.assetId);if(a.placement!=='wall'||a.wallLayer==='background'||asset.wallLayer==='background')continue; const [ow,oh]=getVariant(other.assetId,other.variant).dimensions;const oa=wall.axis==='x'?other.position[2]:other.position[0];if(Math.abs(along-oa)<(w+ow)/2-.01&&Math.abs(object.position[1]-other.position[1])<(h+oh)/2-.01)return {valid:false,reason:'Настінні предмети перетинаються',collidingId:other.id};}
  return {valid:true};
 }
 if(asset.collision==='accessory') {
  const support=findAccessorySupport(object,objects);
  if(!support)return {valid:false,reason:'Аксесуару потрібна опорна поверхня відповідного розміру та висоти'};
  for(const other of objects){if(other.id===object.id||other.variant===0||getAsset(other.assetId).collision!=='accessory')continue;const oh=getVariant(other.assetId,other.variant).dimensions[1];if(object.position[1]<other.position[1]+oh-.005&&other.position[1]<object.position[1]+h-.005&&rectanglesOverlap(footprint(object),footprint(other)))return {valid:false,reason:'Аксесуари перетинаються',collidingId:other.id};}
  return {valid:true};
 }
 if(Math.abs(object.position[1])>.025) return {valid:false,reason:'Підлоговий предмет має стояти на підлозі'};
 const rect=footprint(object),pts=corners(rect),b=room.bounds;
 // Only the purpose-built floating window bar may meet its mounting wall.
 // Its steel plates end 3 mm behind the declared tabletop rear edge. Keep the
 // normal 25 mm clearance for every other boundary and furniture model.
 const mountWall=room.walls.find(w=>w.id===room.window.wallId&&w.axis==='z'&&w.normal[2]===-1);
 const mountedWindowBar=object.assetId==='windowBar'&&object.variant===2&&Math.abs(Math.sin(object.rotation))<.00001&&Math.cos(object.rotation)>.99999&&!!mountWall&&Math.abs(mountWall.coordinate-b.maxZ)<.00001;
 const farLimit=mountedWindowBar?b.maxZ+.00301:b.maxZ-.025;
 if(pts.some(([x,z])=>x<b.minX+.025||x>b.maxX-.025||z<b.minZ+.025||z>farLimit))return {valid:false,reason:'Предмет виходить за межі простору'};
 for(const obstacle of room.obstacles)if(rectanglesOverlap(rect,{x:(obstacle.minX+obstacle.maxX)/2,z:(obstacle.minZ+obstacle.maxZ)/2,hx:(obstacle.maxX-obstacle.minX)/2,hz:(obstacle.maxZ-obstacle.minZ)/2,angle:0}))return {valid:false,reason:obstacle.kind==='wall'?'Предмет перетинає стіну':'Предмет перетинає несучу колону',collidingId:obstacle.id};
 if(asset.collision!=='cover') {
  const s=room.door.swing;if(rectanglesOverlap(rect,{x:(s.minX+s.maxX)/2,z:(s.minZ+s.maxZ)/2,hx:(s.maxX-s.minX)/2,hz:(s.maxZ-s.minZ)/2,angle:0}))return {valid:false,reason:'Залиште вільною зону відчинення дверей'};
  if(h>room.window.sill&&pts.some(([x,z])=>z>room.bounds.maxZ-.35&&x>room.window.min&&x<room.window.max))return {valid:false,reason:'Високий предмет перекриває віконний отвір'};
 }
 if(asset.collision==='cover')return {valid:true};
 for(const other of objects) {
  if(other.id===object.id||other.variant===0)continue;const oa=getAsset(other.assetId);
  if(oa.placement==='wall'||oa.collision==='cover'||oa.collision==='accessory')continue;
  if(rectanglesOverlap(rect,footprint(other)))return {valid:false,reason:`Перетин: ${oa.label}`,collidingId:other.id};
 }
 return {valid:true};
}
export function validateScene(objects:SceneObject[],room:RoomDefinition|((object:SceneObject)=>RoomDefinition)=ROOM):{id:string;reason:string}[] { return objects.flatMap(o=>{const r=validatePlacement(o,objects,typeof room==='function'?room(o):room);return r.valid?[]:[{id:o.id,reason:r.reason??'Неправильне розміщення'}];}); }
