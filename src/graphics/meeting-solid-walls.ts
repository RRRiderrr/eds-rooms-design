import * as THREE from 'three';

/** Scoped correction of the measured hollow wall assemblies around the meeting
 * room. Surface coordinates and semantic wall IDs stay usable by paint/placement.
 * One exterior shell replaces each collection of thin parallel skins. */
export const MEETING_SOLID_WALL_IDS = {
 west: ['wall-2','wall-17','wall-22','wall-25','wall-28'],
 east: ['wall-1','wall-5','wall-10','wall-19','wall-26','wall-29','wall-32'],
} as const;
const EPS=1e-4;
const snap=(n:number)=>Math.round(n/EPS)*EPS;
interface SurfaceTriangle {points:THREE.Vector3[];normal:THREE.Vector3;uv:THREE.Vector2[];uv1:THREE.Vector2[];owner:THREE.Mesh;material:THREE.Material;}
interface Volume {min:THREE.Vector3;max:THREE.Vector3;triangles:SurfaceTriangle[];}
interface BuildPart {owner:THREE.Mesh;material:THREE.Material;fresh:boolean;role:'plaster'|'upper-band';position:number[];normal:number[];uv:number[];uv1:number[];}
export interface SolidWallRepairReport {assemblies:{name:string;sourceWallIds:string[];bounds:{min:number[];max:number[]};triangles:number;parts:number;volume:number;}[];entrancePlasterTop:number;filledCavities:{id:string;min:number[];max:number[]}[];}
const corners=(a:number[],axis:number,side:number,x:number[],y:number[],z:number[])=>{
 const grid=[x,y,z],u=(axis+1)%3,v=(axis+2)%3,p=a.map((n,i)=>grid[i][n]);p[axis]=grid[axis][a[axis]+(side>0?1:0)];
 const out:THREE.Vector3[]=[];for(const [du,dv]of [[0,0],[1,0],[1,1],[0,1]]){const q=[...p];q[u]=grid[u][a[u]+du];q[v]=grid[v][a[v]+dv];out.push(new THREE.Vector3(...q));}
 // (u,v) is cyclic, so its cross product points toward the positive axis.
 return side>0?out:[out[0],out[3],out[2],out[1]];
};
function triangles(mesh:THREE.Mesh):SurfaceTriangle[]{
 const geometry=mesh.geometry,positions=geometry.getAttribute('position'),index=geometry.index,uv=geometry.getAttribute('uv'),uv1=geometry.getAttribute('uv1'),result:SurfaceTriangle[]=[];
 const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
 for(let i=0;i<(index?.count??positions.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),points=ids.map(id=>{const point=new THREE.Vector3().fromBufferAttribute(positions,id).applyMatrix4(mesh.matrixWorld);return point.set(snap(point.x),snap(point.y),snap(point.z));});
  const normal=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize();
  if(!Number.isFinite(normal.x)||normal.lengthSq()<.9)continue;
  const group=geometry.groups.find(g=>i>=g.start&&i<g.start+g.count),material=materials[group?.materialIndex??0];
  result.push({points,normal,owner:mesh,material,uv:ids.map(id=>uv?new THREE.Vector2(uv.getX(id),uv.getY(id)):new THREE.Vector2()),uv1:ids.map(id=>uv1?new THREE.Vector2(uv1.getX(id),uv1.getY(id)):new THREE.Vector2())});
 }
 return result;
}
function barycentric(point:THREE.Vector3,t:SurfaceTriangle):THREE.Vector3|null{return THREE.Triangle.getBarycoord(point,t.points[0],t.points[1],t.points[2],new THREE.Vector3());}
function contains(point:THREE.Vector3,volume:Volume){
 if(point.x<volume.min.x||point.x>volume.max.x||point.y<volume.min.y||point.y>volume.max.y||point.z<volume.min.z||point.z>volume.max.z)return false;
 const heights:number[]=[];
 for(const t of volume.triangles){if(Math.abs(t.normal.y)<.99)continue;const plane=t.points[0].y;if(plane<point.y)continue;const p=new THREE.Vector3(point.x,plane,point.z),b=barycentric(p,t);if(b&&Math.min(b.x,b.y,b.z)>-EPS&&!heights.some(y=>Math.abs(y-plane)<EPS))heights.push(plane);}
 return heights.length%2===1;
}
/** Remove only the obsolete thin wall-top beams from the combined ceiling
 * batch. Trusses, deck and services outside those measured envelopes remain. */
function trimOldSpaceBeams(space:THREE.Group,envelopes:THREE.Box3[]){
 let removedTotal=0;
 space.traverse(object=>{
  if(!(object instanceof THREE.Mesh))return;
  let inCeilingBatch=false;for(let node:THREE.Object3D|null=object;node&&node!==space;node=node.parent)if(node.name.startsWith('Space_ceiling'))inCeilingBatch=true;
  if(!inCeilingBatch)return;
  const source=object.geometry as THREE.BufferGeometry,geometry=source.index?source.toNonIndexed():source.clone(),position=geometry.getAttribute('position');
  const materials=Array.isArray(object.material)?object.material:[object.material],keep:number[]=[],groups:{start:number;count:number;materialIndex:number}[]=[];
  for(let i=0;i<position.count;i+=3){
   const materialIndex=geometry.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex??0;
   const steel=/08_CEILING_STEEL/.test(materials[materialIndex]?.name??'');
   const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(position,i+j).applyMatrix4(object.matrixWorld));
   if(steel&&envelopes.some(box=>vertices.every(point=>box.containsPoint(point)))){removedTotal++;continue;}
   const start=keep.length;keep.push(i,i+1,i+2);const last=groups.at(-1);
   if(last&&last.materialIndex===materialIndex&&last.start+last.count===start)last.count+=3;else groups.push({start,count:3,materialIndex});
  }
  if(keep.length===position.count){geometry.dispose();return;}
  const trimmed=new THREE.BufferGeometry();for(const [name,attribute]of Object.entries(geometry.attributes)){
   const array=new Float32Array(keep.length*attribute.itemSize);for(let i=0;i<keep.length;i++)for(let c=0;c<attribute.itemSize;c++)array[i*attribute.itemSize+c]=attribute.getComponent(keep[i],c);
   trimmed.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize));
  }
  for(const group of groups)trimmed.addGroup(group.start,group.count,group.materialIndex);trimmed.computeBoundingBox();trimmed.computeBoundingSphere();object.geometry=trimmed;geometry.dispose();source.dispose();
 });
 space.userData.removedMeetingWallBeamTriangles=removedTotal;
}
/** Auto-cutaway must follow the visible shell face, not the old hollow
 * wall's nominal normal. New parts can retain a different semantic source ID. */
export function solidPartViewingFace(position:number[],normal:number[]){
 const areas=new Map<string,{axis:'x'|'z';coordinate:number;normal:[number,number,number];area:number}>();
 for(let i=0;i<position.length;i+=9){if(Math.abs(normal[i+1])>.5)continue;const axis=Math.abs(normal[i])>.5?0:2,coordinate=position[i+axis],key=`${axis}:${normal[i+axis]}:${coordinate.toFixed(4)}`;
  const a=new THREE.Vector3(...position.slice(i,i+3) as [number,number,number]),b=new THREE.Vector3(...position.slice(i+3,i+6) as [number,number,number]),c=new THREE.Vector3(...position.slice(i+6,i+9) as [number,number,number]);
  const area=b.sub(a).cross(c.sub(a)).length()*.5,entry=areas.get(key)??{axis:axis===0?'x':'z',coordinate,normal:normal.slice(i,i+3) as [number,number,number],area:0};entry.area+=area;areas.set(key,entry);
 }
 const face=[...areas.values()].sort((a,b)=>b.area-a.area)[0];return face?{axis:face.axis,coordinate:face.coordinate,normal:face.normal}:undefined;
}
function assemble(name:string,meshes:THREE.Mesh[],fills:THREE.Box3[],parent:THREE.Object3D,steelMaterial:THREE.Material){
 const surfaces=meshes.flatMap(triangles),volumes:Volume[]=meshes.map(owner=>{const ts=surfaces.filter(t=>t.owner===owner),b=new THREE.Box3().setFromPoints(ts.flatMap(t=>t.points));return {min:b.min,max:b.max,triangles:ts};});
 const extents=[...volumes.map(v=>new THREE.Box3(v.min,v.max)),...fills],all=extents.flatMap(b=>[b.min,b.max]);
 const near=name.endsWith('near'),west=name.endsWith('west'),inner=west?-2.6018:2.6018;
 const grid=[0,1,2].map(axis=>{
  const values=[...surfaces.flatMap(t=>t.points.map(p=>snap(p.getComponent(axis)))),...all.map(p=>snap(p.getComponent(axis)))];
  if(axis===1)values.push(0,3,3.6,4.32);
  const min=Math.min(...values),max=axis===1?4.32:Math.max(...values);
  for(let value=Math.ceil(min/.75)*.75;value<max;value+=.75)values.push(snap(value));
  return [...new Set(values.filter(v=>axis!==1||v<=4.32))].sort((a,b)=>a-b);
 });
 const [x,y,z]=grid,nx=x.length-1,ny=y.length-1,nz=z.length-1,occupied=new Set<string>(),key=(i:number,j:number,k:number)=>`${i}:${j}:${k}`;
 let volume=0;
 for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){const p=new THREE.Vector3((x[i]+x[i+1])/2,(y[j]+y[j+1])/2,(z[k]+z[k+1])/2);const profile=p.clone();profile.y=near?Math.min(p.y,3.59):Math.min(.5,p.y);if(volumes.some(v=>contains(profile,v))||fills.some(b=>b.containsPoint(profile))){occupied.add(key(i,j,k));volume+=(x[i+1]-x[i])*(y[j+1]-y[j])*(z[k+1]-z[k]);}}
 const parts:BuildPart[]=[],boundary:number[]=[];
 for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){
  if(!occupied.has(key(i,j,k)))continue;
  for(let axis=0;axis<3;axis++)for(const side of [-1,1]){const adjacent=[i,j,k];adjacent[axis]+=side;if(occupied.has(key(...adjacent as [number,number,number])))continue;
   const points=corners([i,j,k],axis,side,x,y,z),centre=points.reduce((p,v)=>p.add(v),new THREE.Vector3()).multiplyScalar(.25),normal=new THREE.Vector3().setComponent(axis,side);
   const match=surfaces.find(t=>t.normal.dot(normal)>.999&&Math.abs(t.points[0].getComponent(axis)-centre.getComponent(axis))<EPS&&(()=>{const b=barycentric(centre,t);return b&&Math.min(b.x,b.y,b.z)>=-EPS;})());
   // Keep source semantic IDs while all rebuilt faces use the same world-
   // aligned UV scale and continuous irradiance, without obsolete UV1 bakes.
   const owner=match?.owner??meshes.reduce((best,m)=>new THREE.Box3().setFromObject(m).distanceToPoint(centre)<new THREE.Box3().setFromObject(best).distanceToPoint(centre)?m:best);
   const interior=!near&&axis===0&&Math.abs(centre.x-inner)<.001&&normal.x===(west?1:-1);
   const role:BuildPart['role']=centre.y>=(interior?3.6:3)-EPS?'upper-band':'plaster';
   const material=role==='upper-band'?steelMaterial:(Array.isArray(owner.material)?owner.material[0]:owner.material),fresh=true;
   let part=parts.find(p=>p.owner===owner&&p.role===role);if(!part){part={owner,material,fresh,role,position:[],normal:[],uv:[],uv1:[]};parts.push(part);}
   for(const index of [0,1,2,0,2,3]){const p=points[index];part.position.push(...p.toArray());part.normal.push(...normal.toArray());boundary.push(...p.toArray());const b=match?barycentric(p,match):null;
    // All adjacent faces use one metre coordinates, including newly closed
    // corners. No old UV island or rotated cap coordinates survive here.
    const uv=axis===1?new THREE.Vector2(p.x,p.z):new THREE.Vector2(axis===0?p.z:p.x,p.y);
    part.uv.push(...uv.toArray());part.uv1.push(...uv.toArray());}
  }
 }
 const assembly=new THREE.Group();assembly.name=name;assembly.userData={protected:true,solidWallAssembly:true,sourceWallIds:meshes.map(m=>m.userData.wallId),cutawayFace:near?{axis:'z',coordinate:-3.0489,normal:[0,0,1]}:{axis:'x',coordinate:inner,normal:[west?1:-1,0,0]}};parent.add(assembly);
 for(const [index,p]of parts.entries()){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p.position,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(p.normal,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(p.uv,2));geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(p.uv1,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,p.material.clone());mesh.name=p.owner.name+(p.fresh?'_SolidCaps':`_SolidSurface_${index}`);mesh.userData={...p.owner.userData,solidAssemblyPart:true,forceNoBake:true,continuousWallLighting:true,wallSurfaceRole:p.role,solidWallAssemblyId:name,sourceWallId:p.owner.userData.wallId,autoWallFace:solidPartViewingFace(p.position,p.normal)};assembly.add(mesh);}
 const outlineGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(boundary,3));const outline=new THREE.LineSegments(new THREE.EdgesGeometry(outlineGeometry,30),new THREE.LineBasicMaterial({color:'#839a8e',transparent:true,opacity:.42}));outline.name='Editor_Solid_Wall_Outline';outline.userData={protected:true,solidWallOutline:true,solidWallAssemblyId:name};outline.raycast=()=>{};assembly.add(outline);outlineGeometry.dispose();
 const bounds=new THREE.Box3().setFromObject(assembly);for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();}
 return {name,sourceWallIds:meshes.map(m=>String(m.userData.wallId)),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},triangles:boundary.length/9,parts:parts.length,volume};
}
/** Must run before architecture materials/metadata/edges are decorated. */
export function repairMeetingWallAssemblies(room:THREE.Group,space:THREE.Group):SolidWallRepairReport {
 room.updateMatrixWorld(true);space.updateMatrixWorld(true);
 // Preserve source provenance for unaffected objects. Rebuilt wall shells
 // explicitly opt out of their obsolete disconnected-skin bake islands.
 for(const [group,scope]of [[room,'room'],[space,'space']] as const)group.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.bakedAtlasScope=scope;});
 const report:SolidWallRepairReport={assemblies:[],entrancePlasterTop:3,filledCavities:[]};
 const steelSource=room.getObjectByName('Wall_21_Top_Steel_Beam') as THREE.Mesh|undefined;
 if(!steelSource)throw new Error('Meeting wall repair requires the source steel finish');
 const steelMaterial=(Array.isArray(steelSource.material)?steelSource.material[0]:steelSource.material);
 const sourceBeamBounds:THREE.Box3[]=[];

 const mesh=(id:number)=>[room,space].map(g=>g.getObjectByName(`Wall_${id}_Clean`)).find(o=>o instanceof THREE.Mesh) as THREE.Mesh|undefined;
 const box=(id:number)=>new THREE.Box3().setFromObject(mesh(id)!);
 for(const [name,ids]of Object.entries(MEETING_SOLID_WALL_IDS)){
  const list=ids.map(id=>mesh(Number(id.slice(5))));if(list.some(m=>!m))continue;
  for(const source of list){const b=new THREE.Box3().setFromObject(source!);b.min.y=3.595;b.max.y=4.325;b.min.x-=.015;b.max.x+=.015;b.min.z-=.015;b.max.z+=.015;sourceBeamBounds.push(b);}

  const inner=box(name==='west'?17:26),outer=box(name==='west'?2:19),height=4.32,fills:THREE.Box3[]=[];
  if(name==='west'){
   const turn=box(22);fills.push(new THREE.Box3(new THREE.Vector3(outer.max.x,0,inner.min.z),new THREE.Vector3(inner.min.x,height,outer.max.z)));
   fills.push(new THREE.Box3(new THREE.Vector3(turn.max.x,0,outer.max.z),new THREE.Vector3(inner.min.x,height,inner.max.z)));
  }else{
   const end=box(29),turn=box(32);fills.push(new THREE.Box3(new THREE.Vector3(inner.max.x,0,inner.min.z),new THREE.Vector3(outer.min.x,height,outer.max.z)));
   fills.push(new THREE.Box3(new THREE.Vector3(inner.max.x,0,outer.max.z),new THREE.Vector3(turn.min.x,height,end.max.z)));
  }
  report.filledCavities.push(...fills.map((b,index)=>({id:`meeting-solid-fill-${name}-${index}`,min:b.min.toArray(),max:b.max.toArray()})));
  report.assemblies.push(assemble(`Meeting_Solid_${name}`,list as THREE.Mesh[],fills,room,steelMaterial));
 }
 // The central entrance wall is rebuilt with the same flush exterior plane
 // and material split; the source door opening remains in the actual volume.
 const entrance=mesh(21);if(entrance)report.assemblies.push(assemble('Meeting_Solid_near',[entrance],[],room,steelMaterial));
 // Remove the obsolete thin beams: their overhangs and separate baked faces
 // caused the visible stepped corners after closing the lower cavities.
 for(const id of [17,21,26,29]){const original=room.getObjectByName(`Wall_${id}_Top_Steel_Beam`);if(original){original.removeFromParent();if(original instanceof THREE.Mesh)original.geometry.dispose();}}
 trimOldSpaceBeams(space,sourceBeamBounds);
 room.userData.meetingSolidWallReport=report;return report;
}

/** Update only authoring surfaces/collision for the filled air spaces. The actual
 * room's inner dimensions and its door/window openings remain unchanged. */
export function repairMeetingWallManifest(manifest:{walls:unknown[]},report:SolidWallRepairReport){
 const data=manifest as unknown as {walls:Record<string,any>[];navigation?:{obstacles?:Record<string,any>[]};meetingSolidWallRevision?:number};
 for(const assembly of report.assemblies){
  if(assembly.name.endsWith('near'))continue;
  const west=assembly.name.endsWith('west'),ids=west?['wall-2','wall-17']:['wall-19','wall-26'];
  const outer=assembly.bounds[west?'min':'max'][0],inner=west?-2.6018175:2.6018175,width=Math.abs(outer-inner);
  for(const id of ids){const wall=data.walls.find(w=>w.id===id);if(!wall)continue;
   wall.coordinate=(outer+inner)/2;wall.thickness=width;wall.normal=[west?-1:1,0,0];
   wall.solidAssembly=assembly.name;wall.exteriorCoordinate=outer;
   if(wall.bounds){wall.bounds.min[0]=Math.min(outer,inner);wall.bounds.max[0]=Math.max(outer,inner);}
  }
 }
 data.navigation??={};const obstacles=data.navigation.obstacles??=[];
 for(const fill of report.filledCavities){const next={id:fill.id,minX:fill.min[0],maxX:fill.max[0],minZ:fill.min[2],maxZ:fill.max[2],height:fill.max[1],kind:'structure'};const existing=obstacles.findIndex(o=>o.id===next.id);if(existing<0)obstacles.push(next);else obstacles[existing]=next;}
 data.meetingSolidWallRevision=1;
}
