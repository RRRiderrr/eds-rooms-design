import * as THREE from 'three';
import type {WallSurface} from '../core/types';
import {getPaintableBounds} from '../core/wall-paint';
import {ROOM} from '../core/room';

/** Editor-only surface selection. The print is wall albedo, so it cannot use
 * the movable objects' bounding-box helper. Keep real door/window holes open. */
export function createWallSelection(wall:WallSurface):THREE.Group {
 const root=new THREE.Group();root.name='Editor_WallSelection';root.userData.wallId=wall.id;
 const bounds=getPaintableBounds(wall.id)??{minY:.07,maxY:wall.height??3.6};
 const roomOpenings:NonNullable<WallSurface['openings']>=[];
 if(wall.id===ROOM.door.wallId)roomOpenings.push({min:ROOM.door.center-ROOM.door.width/2,max:ROOM.door.center+ROOM.door.width/2,minY:0,maxY:ROOM.door.height,kind:'door'});
 if(wall.id===ROOM.window.wallId)roomOpenings.push({min:ROOM.window.min,max:ROOM.window.max,minY:ROOM.window.sill,maxY:ROOM.window.sill+ROOM.window.height,kind:'window'});
 const openings=[...(wall.openings??[]),...roomOpenings].filter(o=>o.max>wall.min&&o.min<wall.max&&o.maxY>bounds.minY&&o.minY<bounds.maxY);
 const unique=(values:number[])=>[...new Set(values)].sort((a,b)=>a-b);
 const xs=unique([wall.min,wall.max,...openings.flatMap(o=>[Math.max(wall.min,o.min),Math.min(wall.max,o.max)])]);
 const ys=unique([bounds.minY,bounds.maxY,...openings.flatMap(o=>[Math.max(bounds.minY,o.minY),Math.min(bounds.maxY,o.maxY)])]);
 const fill:number[]=[],frame:number[]=[],edges=new Map<string,{a:[number,number];b:[number,number];count:number}>();
 const point=(along:number,y:number)=>wall.axis==='x'?[wall.coordinate+wall.normal[0]*.004,y,along]:[along,y,wall.coordinate+wall.normal[2]*.004];
 const quad=(dest:number[],a:[number,number],b:[number,number],c:[number,number],d:[number,number])=>{for(const v of [a,b,c,a,c,d])dest.push(...point(...v));};
 const edge=(a:[number,number],b:[number,number])=>{const key=[a,b].map(p=>p.map(v=>v.toFixed(6)).join(',')).sort().join('|');const old=edges.get(key);if(old)old.count++;else edges.set(key,{a,b,count:1});};
 for(let x=1;x<xs.length;x++)for(let y=1;y<ys.length;y++){
  const left=xs[x-1],right=xs[x],bottom=ys[y-1],top=ys[y],cx=(left+right)/2,cy=(bottom+top)/2;
  if(openings.some(o=>cx>o.min&&cx<o.max&&cy>o.minY&&cy<o.maxY))continue;
  const a:[number,number]=[left,bottom],b:[number,number]=[right,bottom],c:[number,number]=[right,top],d:[number,number]=[left,top];
  quad(fill,a,b,c,d);edge(a,b);edge(b,c);edge(c,d);edge(d,a);
 }
 for(const {a,b,count}of edges.values())if(count===1){
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.0001)continue;
  const dx=-(b[1]-a[1])/length*.009,dy=(b[0]-a[0])/length*.009;
  quad(frame,[a[0]+dx,a[1]+dy],[b[0]+dx,b[1]+dy],[b[0]-dx,b[1]-dy],[a[0]-dx,a[1]-dy]);
 }
 const mesh=(name:string,positions:number[],opacity:number,depthTest:boolean)=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  const material=new THREE.MeshBasicMaterial({color:'#22a48c',transparent:true,opacity,depthTest,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const object=new THREE.Mesh(geometry,material);object.name=name;object.renderOrder=101;object.userData.editorOnly=true;root.add(object);
 };
 mesh('WallSelection_Tint',fill,.10,true);mesh('WallSelection_Frame',frame,.95,false);return root;
}

export function disposeWallSelection(root:THREE.Group){root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])material.dispose();}});}
