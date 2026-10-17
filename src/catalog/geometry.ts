import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getAsset, getMaterial, getVariant } from './catalog';
import { createSignageObject } from './signage';
import type { AppMode, MaterialVariant } from '../core/types';
export type MaterialPalette=Partial<Record<MaterialVariant['surface']|'black'|'glass'|'paper'|'soil',THREE.Material>>;
export function createAssetObject(assetId:string,variantIndex:number,materialId:string,mode:AppMode='archviz',palette:MaterialPalette={}):THREE.Group {
 const group=new THREE.Group();group.name=`${assetId}:${variantIndex}:${mode}`;group.userData={assetId,variant:variantIndex,mode};if(!variantIndex)return group;
 const asset=getAsset(assetId),variant=getVariant(assetId,variantIndex),selected=getMaterial(assetId,materialId),[w,h,d]=variant.dimensions;
 if(assetId==='edsSignage'){
  const sign=createSignageObject(variant.model,mode==='editor');sign.name=group.name;sign.userData={...group.userData,dimensions:[w,h,d],placement:'wall'};
  sign.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=mode==='archviz';o.receiveShadow=mode==='archviz';o.userData.assetId=assetId;}});return sign;
 }
 const simple=mode==='editor',quality=simple?12:96;const geometries=new Map<THREE.Material,THREE.BufferGeometry[]>();const owned=new Set<THREE.Material>();
 function material(key:string,color:string,roughness=.72,metalness=0):THREE.Material {const supplied=palette[key as keyof MaterialPalette];if(supplied)return supplied; const result=new THREE.MeshStandardMaterial({color,roughness,metalness});const surface=key==='black'?'metal':key==='glass'||key==='paper'?'plastic':key==='soil'?'ceramic':key;result.userData={surface,colorVariant:key===selected.surface?selected.id:key,color,owned:true};owned.add(result);return result;}
 const finish=material(selected.surface,selected.color,selected.surface==='fabric'?.94:selected.surface==='wood'?.48:.68,selected.surface==='metal'?.65:0);
 const black=material('black',simple?'#46515a':'#252b2f',.4,.65),wood=selected.surface==='wood'?finish:material('wood','#b5926b',.5),cloth=selected.surface==='fabric'?finish:material('fabric','#b8b4a8',.95),white=material('paper','#e9e7dd',.75),leaf=material('leaf','#426b43',.85),soil=material('soil','#362c22',1),glass=material('glass','#172e35',.24,.25);
 const tempMatrix=new THREE.Matrix4();const quaternion=new THREE.Quaternion();
 function add(geometry:THREE.BufferGeometry,mat:THREE.Material,x=0,y=0,z=0,rx=0,ry=0,rz=0,preserveUv=false):void {quaternion.setFromEuler(new THREE.Euler(rx,ry,rz));tempMatrix.compose(new THREE.Vector3(x,y,z),quaternion,new THREE.Vector3(1,1,1));geometry.applyMatrix4(tempMatrix);if(geometry.index)geometry=geometry.toNonIndexed();
  // Planar projection in physical metres, chosen independently per face. This keeps
  // texture scale consistent across modular furniture and rounded bevel surfaces.
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),uv=new Float32Array(positions.count*2);
  for(let i=0;i<positions.count;i++){const nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i)),nz=Math.abs(normals.getZ(i));uv[i*2]=ny>=nx&&ny>=nz?positions.getX(i):nx>=nz?positions.getZ(i):positions.getX(i);uv[i*2+1]=ny>=nx&&ny>=nz?positions.getZ(i):positions.getY(i);}
  if(!preserveUv)geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.deleteAttribute('uv1');const list=geometries.get(mat)??[];list.push(geometry);geometries.set(mat,list);}
 function box(bw:number,bh:number,bd:number,x:number,y:number,z:number,mat=finish,radius=.012,ry=0):void {const g=!simple&&radius>0?new RoundedBoxGeometry(bw,bh,bd,4,Math.min(radius,bw/3,bh/3,bd/3)):new THREE.BoxGeometry(bw,bh,bd);add(g,mat,x,y,z,0,ry);}
 function cushion(bw:number,bh:number,bd:number,x:number,y:number,z:number):void {
  if(simple){box(bw,bh,bd,x,y,z,cloth,.05);return;}
  const geometry=new RoundedBoxGeometry(bw,bh,bd,7,Math.min(.045,bw*.16,bh*.28,bd*.28));
  // A continuous manufactured cushion. Keep RoundedBox's analytic smooth
  // normals; deforming its split vertices created scalloped upholstery bulges.
  add(geometry,cloth,x,y,z);
 }
 function cyl(radius:number,height:number,x:number,y:number,z:number,mat=finish,radiusTop=radius):void {const g=new THREE.CylinderGeometry(radiusTop,radius,height,quality),p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');for(let i=0;i<p.count;i++){if(Math.abs(n.getY(i))>.9)uv.setXY(i,p.getX(i),p.getZ(i));else uv.setXY(i,uv.getX(i)*Math.PI*(radius+radiusTop),uv.getY(i)*height);}add(g,mat,x,y,z,0,0,0,true);}
 function sphere(sx:number,sy:number,sz:number,x:number,y:number,z:number,mat=finish,rz=0,ry=0):void {const g=new THREE.SphereGeometry(1,simple?8:32,simple?5:20);g.scale(sx,sy,sz);add(g,mat,x,y,z,0,ry,rz);}
 function rod(a:THREE.Vector3,b:THREE.Vector3,radius=.012,mat=black):void {const dir=b.clone().sub(a),g=new THREE.CylinderGeometry(radius,radius,dir.length(),simple?6:24);const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());g.applyQuaternion(q);const mid=a.clone().add(b).multiplyScalar(.5);add(g,mat,mid.x,mid.y,mid.z);}
 function legs(lw:number,ld:number,seatY:number,mat=black,inset=.065):void {for(const x of [-lw/2+inset,lw/2-inset])for(const z of [-ld/2+inset,ld/2-inset])rod(new THREE.Vector3(x,0,z),new THREE.Vector3(x*.86,seatY,z*.86),simple?.018:.014,mat);}
 function roundedTop(width:number,depth:number,thick:number,y:number,mat:THREE.Material,bevelRadius=.004):void {
  if(simple){const g=new THREE.CylinderGeometry(.5,.5,thick,quality);g.scale(width,1,depth);add(g,mat,0,y-thick/2,0);return;}
  const r=width/2,b=Math.min(bevelRadius,thick*.2),profile=[new THREE.Vector2(0,-thick/2),new THREE.Vector2(r-b,-thick/2)];
  for(let i=1;i<=5;i++){const a=-Math.PI/2+i*Math.PI/10;profile.push(new THREE.Vector2(r-b+b*Math.cos(a),-thick/2+b+b*Math.sin(a)));}
  profile.push(new THREE.Vector2(r,thick/2-b));for(let i=1;i<=5;i++){const a=i*Math.PI/10;profile.push(new THREE.Vector2(r-b+b*Math.cos(a),thick/2-b+b*Math.sin(a)));}profile.push(new THREE.Vector2(0,thick/2));
  const g=new THREE.LatheGeometry(profile,quality);g.scale(1,1,depth/width);const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');for(let i=0;i<p.count;i++){if(Math.abs(n.getY(i))>.9)uv.setXY(i,p.getX(i),p.getZ(i));else uv.setXY(i,uv.getX(i)*Math.PI*(width+depth)/2,p.getY(i));}add(g,mat,0,y-thick/2,0,0,0,0,true);
 }
 function table(height=h,shape='rect',topMaterial=finish):void {
  const thick=.028,underside=height-thick;
  if(shape==='round'||shape==='oval')roundedTop(w,d,thick,height,topMaterial);else box(w,thick,d,0,height-thick/2,0,topMaterial,.006);
  if(shape==='round'){
   const postHeight=underside+.008;cyl(.045,postHeight,0,postHeight/2,0,black);cyl(w*.32,.025,0,.0125,0,black);cyl(Math.min(.12,w*.2),.012,0,underside+.001,0,black);
  }else {
   // The leg centers sit inside the oval contour, not its rectangular AABB.
   const ix=shape==='oval'?w*.29:w/2-.07,iz=shape==='oval'?d*.31:d/2-.06,legHeight=underside+.007;
   for(const x of [-ix,ix]){for(const z of [-iz,iz])box(.03,legHeight,.03,x,legHeight/2,z,black,.004);box(.035,.025,iz*2+.03,x,.013,0,black,.004);box(.035,.018,iz*2+.03,x,underside-.004,0,black,.004);}
   for(const z of [-iz,iz])box(ix*2+.03,.032,.025,0,underside-.023,z,black,.004);
  }
 }
 switch(assetId) {
 case 'sofa': {
  const low=variantIndex===3,legH=low?.055:.14,seatH=low?.36:.42;
  for(const x of [-w/2+.13,w/2-.13])for(const z of [-d/2+.12,d/2-.12])cyl(.022,legH,x,legH/2,z,black);
  const baseH=Math.max(.17,seatH-.11-legH+.004);box(w-.06,baseH,d-.07,0,legH+baseH/2,0,variantIndex===2?wood:cloth,.045);
  const backH=h-legH-.16;box(w-.06,backH,.06,0,(h+legH+.12)/2,-d/2+.035,variantIndex===2?wood:cloth,.018);
  const arm=variantIndex===4?.09:.14,parts=variantIndex===2?3:2,inner=w-2*arm;
  for(let i=0;i<parts;i++) {const sx=-inner/2+(i+.5)*inner/parts;cushion(inner/parts-.013,.15,d-.19,sx,seatH-.035,.055);cushion(inner/parts-.012,h-seatH-.045,.16,sx,(h+seatH)/2-.02,-d/2+.09);}
  for(const x of [-w/2+arm/2,w/2-arm/2])box(arm,h*.66,d-.04,x,legH+h*.33-.02,0,variantIndex===2?wood:cloth,.045);
  break;
 }
 case 'armchair': {
  legs(w-.08,d-.06,.35,variantIndex===2?wood:black,.035);box(w-.13,.16,d-.14,0,.38,.025,cloth,.065);box(w-.14,h-.42,.15,0,.42+(h-.42)/2,-d/2+.085,cloth,.065,-.015);
  for(const x of [-w/2+.055,w/2-.055]){box(.09,.22,d-.08,x,.46,0,variantIndex===2?wood:cloth,.04);if(variantIndex===2)box(.055,.05,d-.06,x,.6,0,wood,.022);}
  break;
 }
 case 'pouf': {if(variantIndex===1){roundedTop(w,d,h-.025,h,cloth,.018);cyl(w*.46,.025,0,.0125,0,black);}else box(w,h-.025,d,0,(h+.025)/2,0,cloth,.075);break;}
 case 'bench': {legs(w,d,h-.09,black);box(w,.09,d,0,h-.045,0,variantIndex===1?wood:cloth,.04);if(variantIndex===1)box(w-.1,.06,d-.05,0,h-.01,0,cloth,.035);break;}
 case 'coffeeTable': {
  if(variantIndex<=3){table(h,variantIndex===1?'round':variantIndex===2?'oval':'rect');break;}
  if(variantIndex===4){
   // Thin furniture glass uses ordinary alpha blending and an environment
   // reflection; it does not require a screen-space transmission render pass.
   const pane=simple?material('glass','#a9c2c2',.22):new THREE.MeshPhysicalMaterial({color:'#d7e6e2',roughness:.08,metalness:.05,transparent:true,opacity:.34,depthWrite:false,clearcoat:1,clearcoatRoughness:.06});
   if(!simple){pane.userData={surface:'glass',colorVariant:'clear-glass',owned:true};owned.add(pane);}
   const top=new THREE.CylinderGeometry(.5,.5,.012,simple?16:64);top.scale(w,1,d);add(top,pane,0,h-.006,0);
   for(const angle of [-Math.PI/4,Math.PI/4]){const arch=new THREE.TorusGeometry(.15,.025,simple?4:16,simple?12:64,Math.PI);arch.computeBoundingBox();const bounds=arch.boundingBox!,size=bounds.getSize(new THREE.Vector3());arch.translate(0,-bounds.min.y,0);arch.scale(w*.75/size.x,(h-.012)/size.y,1);add(arch,finish,0,0,0,0,angle);}
   cyl(.052,.009,0,h-.014,0,black);break;
  }
  const points:THREE.Vector2[]=[];for(let i=0;i<(simple?20:72);i++){const angle=i/(simple?20:72)*Math.PI*2,r=1+.12*Math.cos(angle*3)-.055*Math.sin(angle*2);points.push(new THREE.Vector2(Math.cos(angle)*r,Math.sin(angle)*r));}
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),bevel=simple?0:.006;
  for(const point of points){point.x=(point.x-(minX+maxX)/2)/(maxX-minX)*(w-2*bevel);point.y=(point.y-(minY+maxY)/2)/(maxY-minY)*(d-2*bevel);}
  const shape=new THREE.Shape(points),top=new THREE.ExtrudeGeometry(shape,{depth:.03-2*bevel,bevelEnabled:!simple,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1});add(top,finish,0,h-.03+bevel,0,-Math.PI/2);
  for(const [x,z]of [[-w*.29,-d*.12],[w*.24,-d*.18],[w*.02,d*.26]]){const legHeight=h-.024;cyl(.055,legHeight,x,legHeight/2,z,finish,.045);cyl(.075,.012,x,h-.035,z,black);}
  break;
 }
 case 'meetingTable':table(h,variantIndex===1?'round':variantIndex===2?'oval':'rect');break;
 case 'sideTable': {if(variantIndex===1)table(h,'round');else if(variantIndex===2){box(w,.025,d,0,h-.0125,0);box(w,.02,d,0,.01,0,black);box(.025,h-.02,.025,-w/2+.015,h/2,-d/2+.015,black);box(.025,h-.02,.025,-w/2+.015,h/2,d/2-.015,black);}else box(w,h,d,0,h/2,0,finish,.025);break;}
 case 'barStool': {
  const seat=.75;
  if(variantIndex===1){
   legs(w-.035,d-.06,seat-.055,wood,.025);cyl(w*.48,.026,0,seat-.043,0,wood);cyl(w*.475,.035,0,seat-.0175,0,cloth);
   const ring=new THREE.TorusGeometry(w*.34,.009,simple?4:12,simple?12:64);add(ring,black,0,.28,0,Math.PI/2);
   const factor=1-.14*.28/(seat-.055),lx=((w-.035)/2-.025)*factor,lz=((d-.06)/2-.025)*factor;
   for(const sx of [-1,1])for(const sz of [-1,1]){const length=Math.hypot(lx,lz);rod(new THREE.Vector3(sx*lx/length*w*.34,.28,sz*lz/length*w*.34),new THREE.Vector3(sx*lx,.28,sz*lz),.008,black);}break;
  }
  if(variantIndex===2){
   // A continuous bent shell, rather than a box seat with a box backrest.
   const section=new THREE.Shape();section.moveTo(.21,.714);section.lineTo(-.075,.714);section.bezierCurveTo(-.21,.714,-.228,.79,-.229,.88);section.lineTo(-.23,1.012);section.quadraticCurveTo(-.23,1.025,-.214,1.025);section.lineTo(-.203,.88);section.bezierCurveTo(-.20,.80,-.16,.744,-.075,.744);section.lineTo(.21,.744);section.closePath();
   const shell=new THREE.ExtrudeGeometry(section,{depth:w-.035,bevelEnabled:!simple,bevelThickness:.006,bevelSize:.006,bevelSegments:2,steps:1,curveSegments:simple?4:18});
   // This is a rotation, determinant +1: a mirrored remap used to turn the
   // whole closed shell inside out and its seat disappeared from above.
   shell.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI/2));shell.translate((w-.035)/2,0,0);add(shell,cloth);
   for(const x of [-w*.4,w*.4]){
    const path=new THREE.CurvePath<THREE.Vector3>();
    path.add(new THREE.LineCurve3(new THREE.Vector3(x,.02,.19),new THREE.Vector3(x,.02,-.16)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(x,.02,-.16),new THREE.Vector3(x,.02,-.20),new THREE.Vector3(x,.06,-.20)));
    path.add(new THREE.LineCurve3(new THREE.Vector3(x,.06,-.20),new THREE.Vector3(x,.65,-.20)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(x,.65,-.20),new THREE.Vector3(x,.705,-.20),new THREE.Vector3(x,.705,-.145)));
    path.add(new THREE.LineCurve3(new THREE.Vector3(x,.705,-.145),new THREE.Vector3(x,.705,.17)));
    add(new THREE.TubeGeometry(path,simple?14:64,.012,simple?6:20,false),black);
    sphere(.012,.012,.012,x,.02,.19,black);sphere(.012,.012,.012,x,.705,.17,black);
    for(const z of [-.14,.14])box(.04,.009,.07,x,.0045,z,black,.003);
    rod(new THREE.Vector3(x,.29,-.20),new THREE.Vector3(x,.29,.16),.01,black);
    // Under-seat saddles physically connect the steel rails to the shell.
    box(.045,.022,.24,x,.71,.015,black,.005);
   }
   rod(new THREE.Vector3(-w*.4,.29,.16),new THREE.Vector3(w*.4,.29,.16),.01,black);break;
  }
  cyl(w*.47,.028,0,.014,0,black);cyl(.026,.672,0,.364,0,black);box(w-.035,.06,d-.045,0,seat-.03,.015,cloth,.045);
  const footrest=new THREE.TorusGeometry(w*.32,.011,simple?4:8,simple?12:32);add(footrest,black,0,.29,.025,Math.PI/2);
  for(let i=0;i<3;i++){const angle=i*Math.PI*2/3;rod(new THREE.Vector3(0,.29,0),new THREE.Vector3(Math.cos(angle)*w*.32,.29,.025+Math.sin(angle)*w*.32),.009,black);}
  for(const x of [-w*.33,w*.33])rod(new THREE.Vector3(x,.71,-d*.35),new THREE.Vector3(x,h-.02,-d*.38),.011,black);
  box(w-.045,h-.80,.065,0,.8+(h-.8)/2,-d*.37,cloth,.045);break;
 }
 case 'chair': {
  const seat=.45,office=variantIndex===3;
  if(office){cyl(.033,.4,0,.2,0,black);for(let i=0;i<5;i++){const a=i*pi2/5;rod(new THREE.Vector3(0,.12,0),new THREE.Vector3(Math.cos(a)*.24,.045,Math.sin(a)*.24),.014,black);sphere(.028,.025,.018,Math.cos(a)*.24,.027,Math.sin(a)*.24,black);}}
  else legs(w-.04,d-.03,seat-.025,variantIndex===1?wood:black,.045);
  box(w-.025,.06,d-.025,0,seat-.03,.01,variantIndex===1?wood:cloth,.055);
  if(variantIndex===1)box(w-.07,.022,d-.075,0,seat+.002,.01,cloth,.03);
  const backH=h-seat-.04;box(w-.035,backH,.055,0,seat+.025+backH/2,-d/2+.025,variantIndex===1?wood:cloth,.06);
  for(const x of office?[0]:[-w*.34,w*.34])box(office?.045:.025,h-seat-.02,.025,x,(h+seat-.02)/2,-d/2+.025,variantIndex===1?wood:black,.005);
  if(office){for(const x of [-w*.43,w*.43]){box(.028,.19,.028,x,.525,0,black);box(.035,.03,d*.64,x,.63,.015,black,.01);}}
  break;
 }
 case 'workDesk': {table();if(!simple){box(.18,.007,.065,w*.3,h+.002,-d*.25,black,.01);box(w-.12,.07,.035,0,h-.1,-d/2+.05,black); }break;}
 case 'windowBar': {
  box(w,.04,d,0,h-.02,0,finish,.02);
  if(variantIndex===1){for(const x of [-w/2+.13,w/2-.13]){box(.035,h-.035,.035,x,(h-.035)/2,d/2-.055,black);box(.035,h-.035,.035,x,(h-.035)/2,-d/2+.055,black);box(.04,.03,d-.05,x,.015,0,black);}box(w-.23,.04,.025,0,h-.1,d/2-.05,black);}
  else if(variantIndex===2){for(const x of [-w*.38,0,w*.38]){box(.04,.25,.03,x,h-.165,d/2-.018,black);rod(new THREE.Vector3(x,h-.04,-d/2+.05),new THREE.Vector3(x,h-.29,d/2-.02),.014,black);}}
  else {for(const x of [-w/2+.07,w/2-.07])box(.1,h-.04,d-.05,x,(h-.04)/2,0,finish,.012);box(w-.2,.12,.03,0,h-.1,d/2-.04,finish);}
  break;
 }
 case 'storage': {
  const shelf=variantIndex===2;box(w-.02,.035,d,0,.075,0);box(w-.02,.035,d,0,h-.0175,0);for(const x of [-w/2+.0175,w/2-.0175])box(.035,h-.11,d,x,(h+.04)/2,0);box(w-.04,h-.08,.018,0,(h+.04)/2,-d/2+.009,finish);
  if(shelf){for(let i=1;i<=3;i++){const y=.1+(h-.14)*i/4;box(w-.06,.025,d-.02,0,y,0);if(!simple){for(let j=0;j<3;j++){const bw=.06+.015*j,bh=.18+.03*(j%2);box(bw,bh,.18,-w*.3+j*.095,y+.0125+bh/2,0,j%2?white:cloth,.003);}}}}
  else {const n=variantIndex===1?3:2;for(let i=0;i<n;i++){const x=-w/2+(i+.5)*w/n;box(w/n-.008,h-.14,.025,x,(h+.02)/2,d/2+.005,finish,.007);box(.09,.012,.02,x,h*.64,d/2+.026,black,.004);}}
  for(const x of [-w/2+.08,w/2-.08])for(const z of [-d/2+.07,d/2-.07])box(.035,.06,.035,x,.03,z,black);break;
 }
 case 'floorLamp': {
  cyl(w*.38,.025,0,.0125,0,black);cyl(.012,h-.18,0,(h-.18)/2,0,black);
  const sh=h*.16,rt=variantIndex===1?w*.24:w*.14,rb=w*.5,t=.003;
  const shade=new THREE.LatheGeometry([new THREE.Vector2(rb,-sh/2),new THREE.Vector2(rt,sh/2),new THREE.Vector2(rt-t,sh/2),new THREE.Vector2(rb-t,-sh/2),new THREE.Vector2(rb,-sh/2)],quality);
  add(shade,finish,0,h-sh/2,0);cyl(w*.43,.007,0,h-sh+.008,0,white);sphere(.045,.045,.045,0,h-sh*.65,0,white);break;
 }
 case 'plant': {
  const potH=h*.23,potR=w*.26;cyl(potR,potH,0,potH/2,0,finish,potR*.85);cyl(potR*.85,.008,0,potH-.008,0,soil);
  const count=simple?7:variantIndex===2?28:21;
  for(let i=0;i<count;i++){const a=i*2.39996,level=(i+.5)/count;const ly=variantIndex===3?potH+(h-potH)*(.25+.4*level):potH+(h-potH)*(.2+.73*level);const radius=(variantIndex===3?.18:.30)*w*(.7+.3*Math.sin(i*3.2));const x=Math.cos(a)*radius,z=Math.sin(a)*radius;rod(new THREE.Vector3(0,potH*.9,0),new THREE.Vector3(x*.7,ly,z*.7),.006,wood);sphere(variantIndex===3?w*.09:w*.19,variantIndex===3?(h-potH)*.35:w*.11,.012,x,ly,z,leaf,variantIndex===3?Math.sin(i)*.14:Math.cos(a)*.8,a);}
  break;
 }
 case 'acousticPanel': {
  box(w,h,d,0,0,0,variantIndex===2?black:cloth,.025);
  if(variantIndex===2){const count=simple?7:13;for(let i=0;i<count;i++)box(w/count*.5,h-.035,.018,-w/2+(i+.5)*w/count,0,d/2+.007,wood,.003);box(w-.06,.018,.012,0,-h/2+.04,d/2+.008,finish,.003);}
  else if(!simple){for(let i=1;i<4;i++)box(.003,h-.05,.002,-w/2+i*w/4,0,d/2+.001,cloth,.001);}
  break;
 }
 case 'art': {
  box(w,h,d,0,0,0,black,.004);box(w-.035,h-.035,.008,0,0,d/2+.002,white,.001);
  if(variantIndex===1){box(w*.37,h*.6,.009,-w*.18,-h*.07,d/2+.008,cloth,.004);sphere(w*.17,h*.24,.006,w*.21,h*.13,d/2+.014,finish);box(w*.48,.015,.008,w*.09,-h*.28,d/2+.015,black,.001);}
  else if(variantIndex===2){for(const x of [-w*.23,w*.23]){box(w*.35,h*.72,.01,x,0,d/2+.012,cloth,.003);sphere(w*.09,h*.21,.007,x,0,d/2+.022,finish);}}
  else {box(w*.94,h*.28,.009,0,-h*.2,d/2+.008,cloth);sphere(w*.1,h*.16,.006,w*.2,h*.14,d/2+.014,finish);box(w*.94,.015,.009,0,-h*.03,d/2+.018,black);}
  break;
 }
 case 'sign': {
  // Each word is built from short solid strokes, avoiding font downloads or canvas textures.
  const letters=variantIndex===1?'COLLAB':'LOUNGE';const cw=w/letters.length,stroke=.018;
  const patterns:Record<string,string[]>={C:['t','b','l'],O:['t','b','l','r'],L:['l','b'],A:['t','l','r','m'],B:['t','b','l','r','m'],U:['l','r','b'],N:['l','r','q'],G:['t','b','l','e','m'],E:['t','b','l','m']};
  for(let i=0;i<letters.length;i++){const cx=-w/2+cw*(i+.5);for(const p of patterns[letters[i]]??['t','b']){if(['t','m','b'].includes(p))box(cw*.67,stroke,d,cx,p==='t'?h/2-stroke/2:p==='b'?-h/2+stroke/2:0,0,finish,.003);else if(p==='q') {const geo=new THREE.BoxGeometry(stroke,h,d);add(geo,finish,cx,0,0,0,0,-.35);}else box(stroke,p==='e'?h/2:h,d,cx+(p==='l'?-1:1)*cw*.335,p==='e'?-h/4:0,0,finish,.003);}}
  break;
 }
 case 'clock': {
  const geo=new THREE.CylinderGeometry(w/2,w/2,d,quality*2);add(geo,finish,0,0,0,pi/2);const face=new THREE.CylinderGeometry(w*.46,w*.46,.007,quality*2);add(face,white,0,0,d/2+.004,pi/2);
  for(let i=0;i<12;i++){const angle=i*pi2/12;const g=new THREE.BoxGeometry(.008,i%3===0?.03:.018,.004);add(g,black,Math.sin(angle)*w*.39,Math.cos(angle)*w*.39,d/2+.009,0,0,-angle);}
  box(.011,w*.28,.006,0,w*.11,d/2+.014,black,.002);const hand=new THREE.BoxGeometry(w*.27,.01,.006);add(hand,black,w*.1,0,d/2+.018,0,0,.32);break;
 }
 case 'board': {
  box(w,h,d,0,0,0,finish,.012);box(w-.035,h-.035,.008,0,0,d/2+.003,variantIndex===2?glass:variantIndex===3?cloth:white,.003);
  if(variantIndex===1){box(w*.38,.007,.004,-w*.2,h*.22,d/2+.01,finish);for(let i=0;i<3;i++)box(w*.65,.005,.004,-w*.1,h*.05-i*.08,d/2+.01,black);box(w*.9,.018,.045,0,-h/2-.012,d/2,black);}
  else if(variantIndex===2){box(w*.68,h*.48,.005,0,0,d/2+.01,black,.005);box(w*.45,.012,.004,-w*.07,-h*.2,d/2+.015,finish);}
  else {for(let i=0;i<5;i++)box(.12,.12,.003,-w*.35+(i%3)*.26,h*.2-Math.floor(i/3)*.25,d/2+.01,i%2?white:finish,.002);}
  break;
 }
 case 'television': {
  // The advertised depth includes an external VESA bracket and air gap.
  box(w*.32,h*.20,d*.15,0,0,-d*.425,black,.003);
  for(const x of [-w*.1,w*.1])box(.032,h*.28,d*.21,x,0,-d*.245,black,.003);
  box(w*.93,h*.87,d*.35,0,-.015,-d*.005,black,.008);box(w,h,d*.22,0,0,d*.28,finish,.006);
  const screen=material('screen','#15242b',.16,.04);(screen as THREE.MeshStandardMaterial).emissive.set('#09181d');(screen as THREE.MeshStandardMaterial).emissiveIntensity=.09;
  box(w-.025,h-.028,.004,0,.002,d*.43,screen,.002);box(w*.25,.03,.009,0,-h*.46,-d*.38,black,.004);
  if(!simple){for(let i=0;i<14;i++)box(.025,.003,.002,-w*.23+i*w*.035,-h*.44,d*.39,black,.001);const led=material('indicator','#a3d1ad',.25);add(new THREE.CylinderGeometry(.002,.002,.002,8),led,w*.38,-h*.477,d*.48,Math.PI/2);}
  break;
 }
 case 'coffeeMachine': {
  const chrome=material('chrome','#bfc7cb',.19,.92),coffee=material('coffee','#3c2518',.28),panel=material('screen','#13252b',.2,.05);
  box(w,.024,d,0,.012,0,black,.008);
  if(variantIndex===1){
   box(w*.91,h*.82,d*.6,0,h*.56,-d*.163,finish,.012);box(w*.95,.014,d*.6,0,h-.007,-d*.163,finish,.008);
   box(w*.83,h*.28,.01,0,h*.72,d*.15,finish,.008);box(.064,.035,.006,-w*.19,h*.76,d*.17,panel,.003);
   add(new THREE.CylinderGeometry(.025,.025,.025,quality),chrome,w*.24,h*.76,d*.18,Math.PI/2);
   add(new THREE.CylinderGeometry(.033,.033,.035,quality),chrome,0,h*.57,d*.18,Math.PI/2);
   add(new THREE.CylinderGeometry(.011,.014,.115,quality),black,0,h*.56,d*.34,Math.PI/2);
   cyl(.006,.034,-.012,h*.45,d*.22,chrome);cyl(.006,.034,.012,h*.45,d*.22,chrome);
   const wand=new THREE.CatmullRomCurve3([new THREE.Vector3(w*.37,h*.66,d*.09),new THREE.Vector3(w*.4,h*.5,d*.18),new THREE.Vector3(w*.34,h*.23,d*.28)]);add(new THREE.TubeGeometry(wand,simple?4:14,.004,simple?4:8),chrome);
  }else{
   box(w*.94,h*.81,d*.72,0,h*.46,-d*.1,finish,.014);box(w*.67,h*.3,.012,0,h*.66,d*.28,panel,.006);
   box(w*.47,h*.27,.014,0,h*.32,d*.28,black,.007);
   for(const x of [-w*.045,w*.045]){cyl(.008,.035,x,h*.39,d*.33,chrome);}
   const hopper=simple?material('glass','#9bb8b5',.3):new THREE.MeshPhysicalMaterial({color:'#aebfbb',roughness:.16,transparent:true,opacity:.37,depthWrite:false,clearcoat:.8});if(!simple){hopper.userData={surface:'glass',colorVariant:'smoked-glass',owned:true};owned.add(hopper);}
   box(w*.66,.058,d*.48,0,h-.031,-d*.13,hopper,.01);box(w*.68,.008,d*.5,0,h-.004,-d*.13,black,.004);
   if(!simple)for(let i=0;i<18;i++)sphere(.009,.004,.005,Math.sin(i*2.3)*w*.23,h-.035,Math.cos(i*2.1)*d*.15-d*.13,coffee,0,i);
   box(w*.34,.018,.003,0,h*.72,d*.3,white,.002);for(let i=0;i<3;i++)box(.012,.005,.003,-.028+i*.028,h*.62,d*.3,white,.001);
  }
  const trayZ=d*.29;box(w*.8,.018,d*.34,0,.034,trayZ,chrome,.005);
  if(!simple)for(let i=0;i<7;i++)box(w*.7,.002,.003,0,.045,trayZ-d*.13+i*d*.043,black,.001);
  const cupZ=d*.29,cupHeight=.073;add(new THREE.CylinderGeometry(.031,.025,cupHeight,quality),white,0,.045+cupHeight/2,cupZ);cyl(.027,.002,0,.045+cupHeight-.003,cupZ,coffee);
  const rim=new THREE.TorusGeometry(.029,.0025,simple?4:8,simple?12:24);add(rim,white,0,.045+cupHeight,cupZ,Math.PI/2);const handle=new THREE.TorusGeometry(.016,.004,simple?4:8,simple?10:20);add(handle,white,.04,.08,cupZ);
  break;
 }
 case 'accessory': {
  if(variantIndex===1){for(let i=0;i<3;i++)box(w*(1-i*.08),.035,d*(1-i*.13),0,.02+i*.035,0,i%2?cloth:white,.003,i*.08);cyl(.052,.045,w*.32,.13,0,finish);}
  else if(variantIndex===2){
   box(.29,.014,.21,-.035,.007,0,black,.004);
   const hingeZ=-.089,tilt=-.18,lidHeight=.205,lidY=.018+lidHeight/2*Math.cos(tilt),lidZ=hingeZ+lidHeight/2*Math.sin(tilt);
   const lid=new RoundedBoxGeometry(.285,lidHeight,.014,simple?1:4,.003);add(lid,black,-.035,lidY,lidZ,tilt);
   const display=new THREE.BoxGeometry(.259,.176,.002);add(display,glass,-.035,lidY-.001*Math.sin(tilt),lidZ+.008*Math.cos(tilt),tilt);
   for(const x of [-.14,.07]){const hinge=new THREE.CylinderGeometry(.008,.008,.027,simple?8:24);add(hinge,black,x,.017,hingeZ,0,0,Math.PI/2);}
   if(!simple){for(let row=0;row<4;row++)for(let col=0;col<10;col++)box(.018,.001,.012,-.143+col*.023,.0145,-.056+row*.018,white,.001);box(.083,.001,.043,-.035,.0147,.062,glass,.002);add(new THREE.BoxGeometry(.031,.012,.002),white,-.035,lidY+.008*Math.sin(tilt),lidZ-.008*Math.cos(tilt),tilt);}
   const mug=new THREE.LatheGeometry([new THREE.Vector2(.024,0),new THREE.Vector2(.032,.07),new THREE.Vector2(.029,.07),new THREE.Vector2(.021,.005),new THREE.Vector2(0,.005),new THREE.Vector2(0,0),new THREE.Vector2(.024,0)],quality);add(mug,finish,.16,0,.03);cyl(.027,.002,.16,.061,.03,black);add(new THREE.TorusGeometry(.014,.003,simple?4:10,simple?12:40),finish,.201,.04,.03);
  }
  else {cyl(w*.3,h*.85,0,h*.425,0,finish,w*.18);rod(new THREE.Vector3(0,h*.5,0),new THREE.Vector3(.025,h,0),.003,wood);sphere(.045,.02,.012,.035,h*.85,0,leaf);}
  break;
 }
 case 'rug': {if(variantIndex===3)cyl(w/2,h,0,h/2,0,cloth);else box(w,h,d,0,h/2,0,cloth,.004);if(!simple&&variantIndex!==3){for(const x of [-w/2+.035,w/2-.035])box(.012,.002,d-.03,x,h+.001,0,finish,.001);for(const z of [-d/2+.035,d/2-.035])box(w-.03,.002,.012,0,h+.001,z,finish,.001);}break;}
 case 'separator': {
  if(variantIndex===1){for(const x of [-w/2+.04,w/2-.04])box(.055,h,.055,x,h/2,0,wood);for(let i=1;i<9;i++)box(.025,h-.06,.04,-w/2+i*w/9,h/2,0,wood);box(w,.05,.05,0,h-.025,0,wood);box(w-.08,.12,.025,0,.18,.03,finish,.015);}
  else if(variantIndex===2)box(w,h-.15,.05,0,(h+.15)/2,0,cloth,.025);
  else {box(w,h*.5,d,0,h*.25,0,wood);box(w-.06,h*.25,.018,0,h*.25,d/2+.008,finish,.015);for(let i=0;i<9;i++)sphere(.08,h*.25,.03,-w*.4+i*w*.1,h*.72,0,leaf,Math.sin(i)*.4);}
  for(const x of [-w*.37,w*.37]){box(.04,.18,.04,x,.09,0,black);box(.2,.025,d,x,.0125,0,black);}break;
 }
 }
 // The pieces share materials and are merged, reducing a detailed asset to a few draw calls.
 for(const [mat,list] of geometries){const merged=mergeGeometries(list,false);list.forEach(g=>g.dispose());if(!merged)continue;merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=!simple&&asset.category!=='rugs';mesh.receiveShadow=!simple;mesh.frustumCulled=true;mesh.userData={assetId,surface:mat.userData.surface};group.add(mesh);}
 for(const mat of owned)if(!geometries.has(mat))mat.dispose();
 group.userData.dimensions=[w,h,d];group.userData.placement=asset.placement;return group;
}
const pi=Math.PI,pi2=Math.PI*2;
export function disposeAssetObject(object:THREE.Object3D):void {const materials=new Set<THREE.Material>();object.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.owned)materials.add(m);}});materials.forEach(m=>m.dispose());}
