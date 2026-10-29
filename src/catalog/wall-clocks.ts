import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import tracedData from '../../assets-src/signage/signage-data.json';

export const WALL_CLOCK_DIMENSIONS = [1.25,1.25,.035] as const;
export const WALL_CLOCK_VARIANTS = [
 {index:1,label:'1 / Цифри та слова',model:'clock-floating-words'},
 {index:2,label:'2 / Тонкі хвилинні риски',model:'clock-floating-ticks'},
 {index:3,label:'3 / EDS · енергія кольору',model:'clock-floating-energy'},
 {index:4,label:'4 / Римські цифри · сатин',model:'clock-floating-roman'},
 {index:5,label:'5 / Лавандовий мінімалізм',model:'clock-floating-minimal'},
 {index:6,label:'6 / EDS · графічні чверті',model:'clock-floating-quarters'},
] as const;

type Glyph={advance:number;commands:(string|number)[][]};
type Font={capHeight:number;glyphs:Record<string,Glyph>};
const fonts=(tracedData as unknown as {fonts:Record<string,Font>}).fonts;

/** Separate applied numerals, markers and hands. The actual plaster is the
 * dial: there is no backing disk, enclosure or continuous perimeter ring. */
export function createWallClock(variant:number,proxy=false):THREE.Group {
 const v=Math.max(1,Math.min(6,Math.round(variant))),root=new THREE.Group(),dial=new THREE.Group();
 root.name=`wallClock:${v}:${proxy?'editor':'archviz'}`;
 root.userData={assetId:'wallClock',variant:v,frameless:true,placement:'wall',sourcePbr:true,dimensions:[...WALL_CLOCK_DIMENSIONS],dialSupport:'actual-wall',originalAuthoring:true};
 dial.name='Clock_applied_numerals_and_markers';root.add(dial);
 const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
 const paint=(name:string,color:string,roughness=.56,metalness=.1)=>{
  const mat=new THREE.MeshStandardMaterial({name,color,roughness,metalness});
  mat.userData={owned:true,sourcePbr:true,preserveOriginal:true,tintable:false,surface:'metal',partColor:color};return mat;
 };
 const ink=paint('Clock_graphite','#171b20'),blue=paint('Clock_EDS_blue','#0B30C1'),lime=paint('Clock_EDS_lime','#A0FF3D'),lavender=paint('Clock_EDS_lavender','#A2B8FE'),steel=paint('Clock_satin_metal','#59626a',.36,.75);
 const main=v===4?steel:v===3?blue:ink,accent=v===5?lavender:v===6?lime:blue;
 function add(g:THREE.BufferGeometry,mat:THREE.Material,x=0,y=0,z=0,angle=0){
  g.rotateZ(angle);g.translate(x,y,z);if(g.index)g=g.toNonIndexed();g.clearGroups();
  const list=batches.get(mat)??[];list.push(g);batches.set(mat,list);
 }
 function tick(angle:number,radius:number,length:number,width:number,mat=main){
  add(new THREE.BoxGeometry(width,length,.004),mat,Math.sin(angle)*radius,Math.cos(angle)*radius,.004,-angle);
 }
 function text(value:string,x:number,y:number,cap:number,mat=main,maxWidth=.26,bold=true){
  const font=fonts[bold?'bold':'regular'],natural=cap/font.capHeight,advance=[...value].reduce((n,c)=>n+(font.glyphs[c]?.advance??.3),0),scale=Math.min(natural,maxWidth/Math.max(advance,.001));
  const shapes:THREE.Shape[]=[];let cursor=0;
  for(const character of value){const glyph=font.glyphs[character];if(!glyph){cursor+=.3;continue;}const p=new THREE.ShapePath();
   for(const command of glyph.commands){const c=command as [string,...number[]],n=(i:number)=>c[i] as number;
    if(c[0]==='M')p.moveTo((cursor+n(1))*scale,n(2)*scale);
    else if(c[0]==='L')p.lineTo((cursor+n(1))*scale,n(2)*scale);
    else if(c[0]==='Q')p.quadraticCurveTo((cursor+n(1))*scale,n(2)*scale,(cursor+n(3))*scale,n(4)*scale);
    else if(c[0]==='C')p.bezierCurveTo((cursor+n(1))*scale,n(2)*scale,(cursor+n(3))*scale,n(4)*scale,(cursor+n(5))*scale,n(6)*scale);
    else if(c[0]==='Z')p.currentPath?.closePath();
   }shapes.push(...p.toShapes(false));cursor+=glyph.advance;
  }
  if(!shapes.length)return;
  const g=new THREE.ExtrudeGeometry(shapes,{depth:.004,bevelEnabled:!proxy,bevelThickness:.0005,bevelSize:.0004,bevelSegments:1,curveSegments:proxy?2:6});
  g.computeBoundingBox();const centre=g.boundingBox!.getCenter(new THREE.Vector3());g.translate(-centre.x,-centre.y,.003);
  if(v===5&&mat===lavender){
   // A thin graphite edge on each applied numeral keeps pale corporate
   // lavender legible on light plaster without adding a common backing.
   const edge=g.clone();edge.scale(1.035,1.035,1);edge.translate(0,0,-.001);add(edge,ink,x,y);
  }
  add(g,mat,x,y);
 }
 const words:Record<number,string>={12:'дванадцять',3:'три',6:'шість',9:'дев’ять'};
 const roman=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
 if(v===1){
  for(let hour=1;hour<=12;hour++){const a=hour*Math.PI/6,word=words[hour],r=hour===7?.525:.54;
   text(word??String(hour),Math.sin(a)*r,Math.cos(a)*r,word?.033:hour===7?.15:.095,hour===7?blue:ink,word?.29:.18,!word);
  }
 }else if(v===2){
  for(let i=0;i<60;i++)tick(i*Math.PI/30,.576,i%5===0?.058:.021,i%5===0?.008:.0035,i%15===0?blue:ink);
  for(const hour of [12,3,6,9]){const a=hour*Math.PI/6;text(String(hour),Math.sin(a)*.46,Math.cos(a)*.46,.074,ink,.16,false);}
 }else if(v===3){
  for(let hour=1;hour<=12;hour++){const a=hour*Math.PI/6;text(String(hour),Math.sin(a)*.545,Math.cos(a)*.545,hour%3===0?.135:.088,hour%3===0?blue:ink,.2);}
  for(let i=0;i<12;i++){const a=(i+.5)*Math.PI/6;tick(a,.55,.033,.007,i%3===0?lime:lavender);}
  text('EDS',0,-.21,.032,blue,.17);
 }else if(v===4){
  for(let hour=0;hour<12;hour++){const a=hour*Math.PI/6;text(roman[hour],Math.sin(a)*.54,Math.cos(a)*.54,.081,steel,.21,false);}
  for(let i=0;i<60;i++)if(i%5!==0)tick(i*Math.PI/30,.59,.011,.003,steel);
 }else if(v===5){
  for(let hour=1;hour<=12;hour++){const a=hour*Math.PI/6;text(String(hour),Math.sin(a)*.54,Math.cos(a)*.54,hour%3===0?.125:.063,hour%3===0?lavender:ink,.19,false);}
  for(const i of [0,15,30,45])tick(i*Math.PI/30,.626,.028,.008,lavender);
 }else{
  for(const hour of [12,3,6,9]){const a=hour*Math.PI/6;text(String(hour),Math.sin(a)*.535,Math.cos(a)*.535,.17,hour===12||hour===6?blue:ink,.25);}
  for(let i=0;i<60;i++)if(i%15!==0)tick(i*Math.PI/30,.568,i%5===0?.042:.014,i%5===0?.008:.003,i%5===0?lime:blue);
 }
 for(const [mat,list]of batches){const geometry=mergeGeometries(list,false)!;const mesh=new THREE.Mesh(geometry,mat);mesh.name=mat.name;mesh.castShadow=true;mesh.receiveShadow=true;dial.add(mesh);list.forEach(g=>g.dispose());}
 // Precisely fit the installation template while keeping the centre mechanism
 // and independently pivoting hands at the true installation centre.
 const box=new THREE.Box3().setFromObject(dial),size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
 const sx=WALL_CLOCK_DIMENSIONS[0]/size.x,sy=WALL_CLOCK_DIMENSIONS[1]/size.y;
 for(const mesh of dial.children as THREE.Mesh[]){mesh.geometry.translate(-centre.x,-centre.y,0);mesh.geometry.scale(sx,sy,1);}
 function hand(kind:'hour'|'minute'|'second',length:number,width:number,z:number,material:THREE.Material){
  const shape=new THREE.Shape();shape.moveTo(-width*.35,-.034);shape.lineTo(width*.35,-.034);shape.lineTo(width/2,length*.26);shape.lineTo(width*.12,length);shape.lineTo(-width*.12,length);shape.lineTo(-width/2,length*.26);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.003,bevelEnabled:!proxy,bevelThickness:.00035,bevelSize:.0003,bevelSegments:1,curveSegments:2});
  const pivot=new THREE.Group();pivot.name=`Clock_hand_${kind}`;pivot.userData={clockHand:kind,rotationAxis:'z',zeroDirection:'+Y'};pivot.position.z=z;
  const mesh=new THREE.Mesh(geometry,material);mesh.name=`Clock_${kind}_hand_blade`;mesh.castShadow=true;mesh.receiveShadow=true;pivot.add(mesh);
  pivot.rotation.z=kind==='hour'?-Math.PI*2*(10+10/60)/12:kind==='minute'?-Math.PI/3:0;root.add(pivot);
 }
 hand('hour',.31,v===4?.013:.022,.017,main);hand('minute',.438,v===4?.009:.015,.024,main);
 if([2,3,6].includes(v))hand('second',.475,.0035,.029,accent);
 const hubGeometry=new THREE.CylinderGeometry(.018,.018,.035,proxy?16:48);hubGeometry.rotateX(Math.PI/2);hubGeometry.translate(0,0,.0175);
 const hub=new THREE.Mesh(hubGeometry,main);hub.name='Clock_small_central_mechanism';hub.castShadow=true;root.add(hub);
 root.updateMatrixWorld(true);return root;
}
