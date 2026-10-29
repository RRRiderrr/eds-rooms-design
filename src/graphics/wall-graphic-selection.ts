import * as THREE from 'three';
import {getPlacementRoom,getPlacementSurfaces} from '../core/space';
import {wallGraphicFor,isWallGraphicPointVisible} from '../core/wall-graphics';
import type {SceneObject} from '../core/types';

/** Invisible pick surface; the actual ink is rendered inside the plaster albedo. */
export function createWallGraphicProxy(alphaHit:(variant:number,u:number,v:number)=>boolean):THREE.Group{
 const root=new THREE.Group();root.userData={wallGraphic:true,assetId:'corporateMotif'};
 const material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,transparent:true,opacity:0,side:THREE.FrontSide});material.userData.owned=true;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);mesh.name='CorporateMotif_PaintHit';mesh.castShadow=false;mesh.receiveShadow=false;
 const original=mesh.raycast.bind(mesh);
 mesh.raycast=(raycaster,hits)=>{
  const object=root.userData.graphicObject as SceneObject|undefined,wall=getPlacementSurfaces().find(w=>w.id===object?.wallId);if(!object||!wall||wallGraphicFor(object).opacity===0)return;
  const candidates:THREE.Intersection[]=[];original(raycaster,candidates);
  for(const hit of candidates)if(hit.uv&&alphaHit(object.variant,hit.uv.x,hit.uv.y)&&isWallGraphicPointVisible(object,wall,hit.point[wall.axis==='x'?'z':'x'],hit.point.y,getPlacementRoom(object)))hits.push(hit);
 };
 root.add(mesh);return root;
}

export function updateWallGraphicProxy(root:THREE.Group,object:SceneObject):void{
 root.userData.graphicObject=object;const wall=getPlacementSurfaces().find(w=>w.id===object.wallId),mesh=root.getObjectByName('CorporateMotif_PaintHit') as THREE.Mesh|undefined;if(!mesh||!wall)return;
 const graphic=wallGraphicFor(object);mesh.scale.set(graphic.width,graphic.height,1);mesh.rotation.z=graphic.angle;
 const world=new THREE.Vector3(wall.axis==='x'?wall.coordinate+wall.normal[0]*.0008:object.position[0],object.position[1],wall.axis==='z'?wall.coordinate+wall.normal[2]*.0008:object.position[2]);
 mesh.position.copy(world.sub(new THREE.Vector3(...object.position)).applyAxisAngle(new THREE.Vector3(0,1,0),-object.rotation));
}

/** A rotated outline and four visible handles identify the selected instance. */
export function createWallGraphicSelection(root:THREE.Group):THREE.Group{
 const selection=new THREE.Group();selection.name='CorporateMotif_Selection';selection.renderOrder=110;selection.userData.editorOverlay=true;
 const surface=root.getObjectByName('CorporateMotif_PaintHit') as THREE.Mesh;surface.updateWorldMatrix(true,false);
 const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y])=>new THREE.Vector3(x,y,.012).applyMatrix4(surface.matrixWorld));
 const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners),new THREE.LineBasicMaterial({color:'#26795e',depthTest:false,transparent:true,opacity:1}));line.renderOrder=110;line.raycast=()=>{};selection.add(line);
 const center=corners.reduce((point,p)=>point.add(p),new THREE.Vector3()).multiplyScalar(.25);
 for(const corner of corners){const scale=Math.max(.025,Math.min(.055,corners[0].distanceTo(corners[1])*.035));const geometry=new THREE.SphereGeometry(scale,8,6),material=new THREE.MeshBasicMaterial({color:'#26795e',depthTest:false});const handle=new THREE.Mesh(geometry,material);handle.position.copy(corner);handle.renderOrder=111;handle.raycast=()=>{};selection.add(handle);}
 selection.userData.center=center.toArray();return selection;
}

export function disposeWallGraphicSelection(selection:THREE.Group):void{
 selection.removeFromParent();selection.traverse(node=>{if(node instanceof THREE.Mesh||node instanceof THREE.Line){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});
}
