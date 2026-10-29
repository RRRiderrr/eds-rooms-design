import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import tracedData from '../../assets-src/signage/signage-data.json';
import {TIMELINE_YEARS,TIMELINE_HISTORY} from './corporate-signage-content';

export {TIMELINE_YEARS,TIMELINE_HISTORY};
export const TIMELINE_DESIGNS=[
 'Енергія віх','Нічний маршрут','Вертикаль прогресу','Лавандовий архів',
 'Інженерна сітка','Картки майбутнього','Діагональ розвитку','Лаймова система',
] as const;
export const UKRAINE_DESIGNS=[
 'Світлий баланс','Нічний імпульс','Лавандова географія','Модулі енергії',
 'Карта в центрі','Повітряний контур','Діагональ потужності','Панорама результатів',
] as const;
export const SHIPMENT_LABELS=['КТП','БЛОК ВРП','РЗіА','MVC (КСО)','ВРП X-LINE','ВРШ POWERLINE','ГРЩ STREEMLINE'] as const;
export const SHIPMENT_VALUES=['563','380','1420','3211','652','473','145'] as const;
export const SHIPMENT_DISPLAY_SYSTEMS=['insert-cards','magnetic-digits','e-ink','insert-cards','e-ink','insert-cards','magnetic-digits','e-ink'] as const;
type MetricModule={index:number;value:string;system:typeof SHIPMENT_DISPLAY_SYSTEMS[number];x:number;y:number;width:number;height:number;digits:{value:string;x:number;y:number;width:number;height:number}[]};

type Contour={outer:number[][];holes:number[][][];area?:number;layer?:number};
type Glyph={advance:number;commands:(string|number)[][]};
type Font={capHeight:number;glyphs:Record<string,Glyph>};
const data=tracedData as unknown as {fonts:Record<string,Font>;maps:{ukraine:{bounds:number[];shapes:Contour[];reliefPieces:Contour[]}}};
export const SIGNAGE_PALETTE={blue:'#0B30C1',lavender:'#A2B8FE',lime:'#A0FF3D',white:'#F0F0F0',black:'#000000'} as const;
type Color=keyof typeof SIGNAGE_PALETTE;
type PrintBlock={role:string;text:string;x:number;y:number;width:number;height:number;cap:number};

/** Code-native artwork with real raised contours and inert outlined text.
 * All fronts are local +Z; no canvas, remote font or renderer is needed. */
export function createCorporateSignage(kind:'timeline'|'ukraine',variant:number,proxy=false):THREE.Group {
 const v=Math.max(1,Math.min(8,Math.round(variant))),timeline=kind==='timeline';
 const [w,h,d]=timeline?[1.68,1.82,.035]:[3.2,1.32,.04];
 const group=new THREE.Group(),batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),blocks:PrintBlock[]=[];
 const materials=new Map<string,THREE.MeshStandardMaterial>(),metricModules:MetricModule[]=[];
 const material=(color:Color,role='ink')=>{
  const key=`${color}:${role}`;let mat=materials.get(key);if(mat)return mat;
  const metal=role==='mount'||/replaceable-(rail|frame|steel)/.test(role);
  mat=new THREE.MeshStandardMaterial({name:`EDS_${kind}_${role}_${color}`,color:SIGNAGE_PALETTE[color],roughness:metal?.42:.8,metalness:metal?.6:0});
  mat.userData={owned:true,sourcePbr:true,preserveOriginal:true,surface:'plastic',corporateColor:SIGNAGE_PALETTE[color],printArtwork:role==='ink'||role.includes('print'),artworkRole:role};materials.set(key,mat);return mat;
 };
 const add=(g:THREE.BufferGeometry,color:Color,x=0,y=0,z=0,angle=0,role='ink')=>{
  g.rotateZ(angle).translate(x,y,z);if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}g.clearGroups();g.deleteAttribute('uv1');
  // Imported outline paths may repeat a closing point. Remove the resulting
  // zero-area edge triangles before exporting real relief geometry.
  const p=g.getAttribute('position'),keep:number[]=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);if(b.cross(c).lengthSq()>1e-22)keep.push(i,i+1,i+2);}
  if(keep.length!==p.count){const clean=new THREE.BufferGeometry();for(const [name,attribute]of Object.entries(g.attributes)){const values=new Float32Array(keep.length*attribute.itemSize);for(let i=0;i<keep.length;i++)for(let j=0;j<attribute.itemSize;j++)values[i*attribute.itemSize+j]=attribute.getComponent(keep[i],j);clean.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));}g.dispose();g=clean;}
  const mat=material(color,role),list=batches.get(mat)??[];list.push(g);batches.set(mat,list);
 };
 const box=(bw:number,bh:number,x:number,y:number,color:Color,z=-.004,depth=.004,role='panel')=>add(new THREE.BoxGeometry(bw,bh,depth),color,x,y,z,0,role);
 const line=(ax:number,ay:number,bx:number,by:number,color:Color,width=.004,z=.007)=>add(new THREE.BoxGeometry(Math.hypot(bx-ax,by-ay),width,.0012),color,(ax+bx)/2,(ay+by)/2,z,Math.atan2(by-ay,bx-ax));
 const disc=(r:number,x:number,y:number,color:Color,z=.008)=>add(new THREE.CylinderGeometry(r,r,.002,proxy?12:36).rotateX(Math.PI/2),color,x,y,z);
 const polygon=(points:number[][],color:Color,z=.004)=>{const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],p[1])));add(new THREE.ShapeGeometry(shape,1),color,0,0,z,0,'motif');};
 const cross=(x:number,y:number,size:number,color:Color)=>{box(size,size*.13,x,y,color,.009,.001,'motif');box(size*.13,size,x,y,color,.009,.001,'motif');};
 const marks=(x:number,y:number,cols:number,rows:number,color:Color,size=.016,step=.032)=>{for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)cross(x+c*step,y-r*step,size,color);};
 const font=data.fonts.bold,regular=data.fonts.regular;
 const advance=(value:string,cap:number,f=font)=>[...value].reduce((n,c)=>n+(f.glyphs[c]?.advance??f.glyphs['?']?.advance??.3),0)*cap/f.capHeight;
 function text(value:string,x:number,y:number,cap:number,color:Color,maxWidth:number,align:'left'|'center'|'right'='left',isRegular=false,role='heading',face?:{role:string;z:number;depth?:number;record?:boolean}){
  const f=isRegular?regular:font,width=Math.min(advance(value,cap,f),maxWidth),scale=width/Math.max(.000001,advance(value,cap,f))*cap/f.capHeight;
  const offset=align==='center'?-width/2:align==='right'?-width:0;let cursor=0;
  if(proxy&&isRegular){box(Math.max(.005,width),cap*.45,x+offset+width/2,y+cap*.3,color,.009,.001,'print-proxy');return;}
  const shapes:THREE.Shape[]=[];
  for(const character of value){const glyph=f.glyphs[character]??f.glyphs['?'];if(!glyph)continue;
   const path=new THREE.ShapePath();for(const command of glyph.commands){const c=command as [string,...number[]],p=(i:number)=>c[i] as number;
    if(c[0]==='M')path.moveTo((cursor+p(1))*scale+offset,p(2)*scale);
    else if(c[0]==='L')path.lineTo((cursor+p(1))*scale+offset,p(2)*scale);
    else if(c[0]==='Q')path.quadraticCurveTo((cursor+p(1))*scale+offset,p(2)*scale,(cursor+p(3))*scale+offset,p(4)*scale);
    else if(c[0]==='C')path.bezierCurveTo((cursor+p(1))*scale+offset,p(2)*scale,(cursor+p(3))*scale+offset,p(4)*scale,(cursor+p(5))*scale+offset,p(6)*scale);
    else if(c[0]==='Z')path.currentPath?.closePath();
   }shapes.push(...path.toShapes(false));cursor+=glyph.advance;
  }
  if(shapes.length)add(face?.depth?new THREE.ExtrudeGeometry(shapes,{depth:face.depth,bevelEnabled:false,curveSegments:5}):new THREE.ShapeGeometry(shapes,cap<.025?2:5),color,x,y,face?.z??.012,0,face?.role??'ink');
  if(face?.record!==false)blocks.push({role,text:value,x:x+offset,y:y-cap*.25,width,height:cap*1.35,cap});
 }
 function wrapped(value:string,cap:number,width:number){const words=value.split(/\s+/),lines:string[]=[];let line='';for(const word of words){const candidate=line?`${line} ${word}`:word;if(line&&advance(candidate,cap,regular)>width){lines.push(line);line=word;}else line=candidate;}if(line)lines.push(line);return lines;}
 function paragraph(value:string,x:number,top:number,width:number,height:number,color:Color,desired=.015){let cap=desired,lines=wrapped(value,cap,width);while(lines.length*cap*1.35>height&&cap>.0055){cap*=.94;lines=wrapped(value,cap,width);}for(let i=0;i<lines.length;i++)text(lines[i],x,top-cap-i*cap*1.35,cap,color,width,'left',true,'body');}
 /** Exact EDS corporate mark from the user-supplied SVG: same polygon/cubic
  * coordinates and plus-shaped counter, transformed once into wall XY. */
 function logo(x:number,y:number,width:number,color:Color){
  const scale=width/194.27,height=60.37*scale,transform=(sx:number,sy:number)=>new THREE.Vector2((sx-174.28)*scale-width/2,(899.64-sy)*scale-height/2);
  const shape=(points:number[][])=>new THREE.Shape(points.map(p=>transform(p[0],p[1])));
  const e=shape([[234.45,858.53],[234.45,839.36],[174.28,839.36],[174.28,899.54],[234.45,899.54],[234.45,880.37],[198.37,880.37],[198.37,877.81],[234.45,877.81],[234.45,861.09],[198.37,861.09],[198.37,858.53]]);
  const s=new THREE.Shape(),m=(a:number,b:number)=>{const p=transform(a,b);s.moveTo(p.x,p.y);},l=(a:number,b:number)=>{const p=transform(a,b);s.lineTo(p.x,p.y);},c=(...p:number[])=>{const a=transform(p[0],p[1]),b=transform(p[2],p[3]),cc=transform(p[4],p[5]);s.bezierCurveTo(a.x,a.y,b.x,b.y,cc.x,cc.y);};
  m(366.13,858.62);l(366.13,839.27);l(323.88,839.27);c(313.21,839.27,304.56,847.92,304.56,858.59);c(304.56,869.26,313.21,877.91,323.88,877.91);l(344.27,877.91);l(344.27,880.29);l(306.98,880.29);l(306.98,899.64);l(349.23,899.64);c(359.90,899.64,368.55,890.99,368.55,880.32);c(368.55,869.65,359.90,861,349.23,861);l(328.84,861);l(328.84,858.62);s.closePath();
  const dd=new THREE.Shape(),dp=(a:number,b:number)=>transform(a,b),p=dp(301.9,877.94);dd.moveTo(p.x,p.y);const dl=(a:number,b:number)=>{const p=dp(a,b);dd.lineTo(p.x,p.y);},dc=(...q:number[])=>{const a=dp(q[0],q[1]),b=dp(q[2],q[3]),c=dp(q[4],q[5]);dd.bezierCurveTo(a.x,a.y,b.x,b.y,c.x,c.y);};
  dl(301.9,860.97);dc(301.9,849.06,292.21,839.37,280.3,839.37);dl(241.72,839.37);dl(241.72,899.55);dl(280.3,899.55);dc(292.21,899.54,301.9,889.85,301.9,877.94);dd.closePath();
  dd.holes.push(new THREE.Path([[271.04,887.59],[268.48,887.59],[268.48,870.74],[251.63,870.74],[251.63,868.18],[268.48,868.18],[268.48,851.33],[271.04,851.33],[271.04,868.18],[287.89,868.18],[287.89,870.74],[271.04,870.74]].map(p=>dp(p[0],p[1]))));
  add(new THREE.ExtrudeGeometry([e,s,dd],{depth:.0015,bevelEnabled:false,curveSegments:proxy?3:8}),color,x,y,.010);
 }
 function map(x:number,y:number,width:number,height:number,colors:Color[],outline:Color='blue'){
  const fill=colors[(v-1)%colors.length];
  const trace=data.maps.ukraine,[x0,y0,x1,y1]=trace.bounds,scale=Math.min(width/(x1-x0),height/(y1-y0));
  const point=(p:number[])=>new THREE.Vector2((p[0]-(x0+x1)/2)*scale,((y0+y1)/2-p[1])*scale);
  const shape=(contour:Contour)=>{const s=new THREE.Shape(contour.outer.map(point));for(const hole of contour.holes)s.holes.push(new THREE.Path(hole.map(point)));return s;};
  for(const contour of trace.shapes)add(new THREE.ExtrudeGeometry(shape(contour),{depth:.005,bevelEnabled:false,curveSegments:1}),fill,x,y,.001,0,'3d-map');
  for(let i=0;i<trace.reliefPieces.length;i++){const contour=trace.reliefPieces[i];add(new THREE.ExtrudeGeometry(shape({...contour,holes:[]}),{depth:.002,bevelEnabled:false,curveSegments:1}),fill,x,y,.006+(i%3)*.0005,0,'3d-map');}
 }
 /** Real serviceable KPI hardware. Each card/digit is an independent closed
  * component, with a visible gap. Displays sit in front of the artwork within
  * the existing 40 mm total envelope. Static labels are not digit inserts. */
 function metric(index:number,x:number,baseline:number,cap:number,width:number,align:'left'|'center'|'right'='right'){
  const value=SHIPMENT_VALUES[index],system=SHIPMENT_DISPLAY_SYSTEMS[v-1];
  const height=cap*1.27,cy=baseline+cap*.43,left=x-(align==='right'?width:align==='center'?width/2:0),cx=left+width/2;
  const module:MetricModule={index,value,system,x:left,y:cy-height/2,width,height,digits:[]};
  // An inset steel strip or e-ink bezel is physically distinct from the sign.
  box(width,height,cx,cy,system==='e-ink'?'black':v===7?'lavender':'blue',system==='e-ink'?.0174:.0156,system==='e-ink'?.002:.0016,system==='e-ink'?'replaceable-frame':'replaceable-steel');
  const count=value.length,pad=system==='e-ink'?.014:.009,gap=system==='e-ink'?.003:.005,cell=(width-2*pad-gap*(count-1))/count,innerHeight=height-(system==='insert-cards'?.016:.012);
  if(system==='e-ink'){
   // Recessed electrophoretic screen with a real dark perimeter and lower
   // connector/status bezel. It has no emission, consistent with e-ink.
   box(width-.014,height-.012,cx,cy+.001,'white',.0182,.0012,'replaceable-screen');
   for(let n=0;n<3;n++)box(.0022,.0015,left+width-.022-n*.006,cy-height/2+.003,'lavender',.01895,.0004,'replaceable-connector');
  }
  for(let n=0;n<count;n++){
   const dx=left+pad+n*(cell+gap),digitX=dx+cell/2,digitCap=Math.min(cap*.88,cell/advance('8',1)*.80),digitY=cy-digitCap*.49;
   if(system==='insert-cards'){
    // White PVC cards slide into real upper/lower rails; the visible narrow
    // slots and open right end make the replacement path unambiguous.
    box(cell,innerHeight,digitX,cy,'white',.0171,.0022,'replaceable-card');
    box(cell*.23,.0012,digitX,cy+innerHeight/2-.003,'lavender',.01835,.0003,'replaceable-print');
   }
   text(value[n],digitX,digitY,digitCap,system==='magnetic-digits'?(v===7?'black':'lime'):'black',cell*.85,'center',false,'metric-digit',{
    role:system==='magnetic-digits'?'replaceable-magnetic-digit':'replaceable-print',
    z:system==='magnetic-digits'?.0168:system==='e-ink'?.0191:.01845,
    depth:system==='magnetic-digits'?.0017:undefined,record:false,
   });
   module.digits.push({value:value[n],x:dx,y:cy-innerHeight/2,width:cell,height:innerHeight});
  }
  if(system==='insert-cards'){
   for(const sy of [-1,1])box(width+.002,.006,cx,cy+sy*(height/2-.003),'blue',.0181,.0022,'replaceable-rail');
   // End-stop only on the left; right end remains accessible for card changes.
   box(.005,height,cx-width/2+.0025,cy,'blue',.0175,.0026,'replaceable-rail');
  }
  if(system==='magnetic-digits'){
   for(const sx of [-1,1])for(const sy of [-1,1])box(.003,.003,cx+sx*(width/2-.004),cy+sy*(height/2-.004),'black',.01665,.0005,'replaceable-frame');
  }
  blocks.push({role:'shipment-value',text:value,x:left+pad,y:cy-innerHeight/2,width:width-2*pad,height:innerHeight,cap});metricModules.push(module);
 }
 // Every version has honest physical bounds and real mounting details.
 const dark=timeline?[2,5].includes(v):[2,4,8].includes(v);
 const background:Color=dark?(v===5||v===4?'blue':'black'):v===4&&timeline||v===3&&!timeline?'lavender':v===8&&timeline?'lime':'white';
 const ink:Color=dark?'white':'black',accent:Color=dark?'lime':'blue';
 if(!timeline&&v===6){
  for(const x of [-w/2+.012,w/2-.012])for(const y of [-h/2+.012,h/2-.012]){box(.024,.024,x,y,'black',0,d,'mount');}
 }else{box(w,h,0,0,background,-.004,d-.008,'backing');for(const x of [-w/2+.015,w/2-.015])for(const y of [-h/2+.015,h/2-.015])box(.010,.010,x,y,dark?'white':'black',0,d,'mount');}
 if(timeline){
  const top=.64,bottom=-.82,rows=[6,7].includes(v)?3:5,cols=15/rows,cw=1.54/cols,ch=(top-bottom)/rows;
  if(v===1){polygon([[-.84,.91],[-.47,.91],[-.84,.54]],'blue',d/2+.0003);line(-.77,.70,.77,.70,'lime',.012);}
  if(v===2){line(-.76,.66,.76,.66,'lime',.004);marks(.40,.84,6,2,'lavender',.012,.036);}
  if(v===3){box(.10,1.52,-.79,-.075,'blue',d/2+.0003,.0006,'motif');marks(.49,.84,5,2,'blue',.014,.038);}
  if(v===4)for(let r=0;r<5;r++)box(1.58,ch-.012,0,top-(r+.5)*ch,r%2?'white':'lavender',d/2+.0003,.0006,'motif');
  if(v===5){for(let i=0;i<6;i++)line(-.77,top-i*ch,.77,top-i*ch,'lavender',.002);for(let i=0;i<4;i++)line(-.77+i*cw,bottom,-.77+i*cw,top,'lavender',.002);marks(.44,.84,5,2,'lime');}
  if(v===6){box(.60,.018,-.47,.69,'lime',d/2+.0003,.0006,'motif');marks(.51,.84,4,2,'blue');}
  if(v===7){polygon([[.71,.91],[.84,.91],[.84,.78]],'blue',d/2+.0003);polygon([[-.84,-.51],[-.84,-.91],[-.44,-.91]],'lime',d/2+.0003);}
  if(v===8){line(-.77,.69,.77,.69,'black',.008);marks(.43,.84,6,2,'black',.012,.032);}
  if(v===1)box(.46,.16,-.58,.80,'blue',d/2+.0003,.0006,'motif');
  logo(-.58,.80,.39,dark?'lime':v===1?'white':'black');text('ІСТОРІЯ EDS',-.27,.792,.047,ink,.73);text('2009 — 2025',.76,.732,.023,ink,.46,'right');
  for(let i=0;i<15;i++){
   const col=v===3?Math.floor(i/5):i%cols,row=v===3?i%5:Math.floor(i/cols),x=-.77+col*cw,y=top-row*ch;
   const px=x+.013,py=y-.012,pw=cw-.026,ph=ch-.023;
   let textColor=ink;
   if([1,2,6,7].includes(v)){const fill:Color=v===2?(i%3===0?'blue':'black'):v===6?'white':v===7?(i===0||i===14?'blue':'white'):'white';textColor=fill==='blue'||fill==='black'?'white':'black';box(pw,ph,px+pw/2,py-ph/2,fill,d/2+.0005,.0008,'card');}
   if(v===1){box(pw,.065,px+pw/2,py-.0325,'blue',d/2+.001,.0008,'year-band');textColor='black';}
   if(v===2){if(col<cols-1)line(px+pw,py-.025,px+pw+.026,py-.025,'lime',.003);disc(.005,px+.012,py-.030,'lime');}
   if(v===3){line(px+.006,py-.015,px+.006,py-ph+.01,'blue',.003);disc(.007,px+.006,py-.030,'lime');}
   if(v===5)cross(px+pw-.018,py-.025,.014,'lime');
   const header=rows===3?.051:.043,headerX=px+(v===3?.018:.012),yearColor:Color=v===1?'white':v===2||v===5?'lime':textColor;
   const yearBaseline=py-header*1.11-.005,bodyTop=yearBaseline-.018;
   text(TIMELINE_YEARS[i],headerX,yearBaseline,header,yearColor,pw-.024,'left',false,'year');
   paragraph(TIMELINE_HISTORY[i].join(' '),px+(v===3?.02:.012),bodyTop,pw-(v===3?.03:.024),bodyTop-(py-ph+.01),textColor,rows===3?.0135:.0145);
   if(v===8)line(px,py-ph+.004,px+pw,py-ph+.004,'black',.002);
  }
  text('ЕНЕРГІЯ ЛЮДЕЙ. СТАЛІСТЬ.',-.76,-.878,.018,ink,1.15);logo(.62,-.865,.22,ink);
 }else{
  const title=(x:number,y:number,width:number,color:Color=ink)=>text('ВІДВАНТАЖЕНО, од.',x,y,.055,color,width);
  const table=(x:number,top:number,width:number,step=.137,style=0)=>{for(let i=0;i<7;i++){const yy=top-i*step;if(style===1)box(width,step-.014,x+width/2,yy+.018,i%2?'blue':'black',d/2+.0003,.0006,'row');if(style===2)box(width,step-.012,x+width/2,yy+.018,i%2?'lavender':'white',d/2+.0003,.0006,'row');text(SHIPMENT_LABELS[i],x+.024,yy,.039,ink,width*.65,'left',false,'shipment-label');metric(i,x+width-.022,yy-.003,.069,width*.27);if(style===0)line(x,yy-.025,x+width,yy-.025,accent,.002);}};
  if(v===1){box(.018,1.09,-.02,-.055,'lime',d/2+.0003,.0006,'motif');logo(-1.28,.54,.39,'blue');title(-.04,.51,1.48);map(-.82,-.02,1.40,1.03,['blue','lavender','lime']);table(.06,.32,1.44,.135);marks(-1.45,-.54,5,1,'blue');}
  if(v===2){logo(-1.26,.53,.44,'lime');title(.02,.51,1.48);map(-.83,-.055,1.40,1.03,['blue','lavender'],'lime');table(.04,.31,1.47,.134,1);marks(-1.43,-.56,7,1,'lime');}
  if(v===3){logo(-1.26,.54,.43,'black');title(-1.49,.37,1.48);table(-1.50,.18,1.43,.119);map(.83,-.02,1.36,1.02,['white','blue','lime'],'black');line(.06,-.57,1.49,-.57,'blue',.014);}
  if(v===4){logo(-1.27,.53,.40,'lime');title(-1.49,.36,1.35);map(-.85,-.14,1.32,.85,['white','lavender','lime'],'black');for(let i=0;i<7;i++){const col=i%2,row=Math.floor(i/2),x=.05+col*.75,y=.38-row*.26;box(.70,.227,x+.35,y-.079,i%2?'black':'white',d/2+.0003,.0006,'kpi-card');const cardInk:Color=i%2?'white':'black';text(SHIPMENT_LABELS[i],x+.035,y-.018,.029,cardInk,.63,'left',false,'shipment-label');metric(i,x+.035,y-.131,.084,.61,'left');}marks(.86,-.50,6,2,'lime');}
  if(v===5){title(-.76,.53,1.72);logo(1.26,.53,.43,'blue');map(0,-.055,1.62,.99,['blue','lavender','lime']);for(let i=0;i<7;i++){const right=i>3,x=right?1.02:-1.51,y=.28-(right?i-4:i)*.235;box(.49,.204,x+.245,y-.043,i%2?'lavender':'white',d/2+.0003,.0006,'kpi-card');metric(i,x+.025,y-.012,.071,.44,'left');text(SHIPMENT_LABELS[i],x+.025,y-.085,.021,'black',.44,'left',false,'shipment-label');}line(-.89,-.56,.88,-.56,'lime',.012);}
  if(v===6){map(-.85,-.025,1.39,1.04,['blue','lavender','lime']);logo(.35,.51,.50,'blue');title(.68,.49,.86,'black');for(let i=0;i<7;i++){const yy=.32-i*.137;box(1.45,.111,.78,yy+.02,i%2?'lavender':'white',.001,.006,'row');text(SHIPMENT_LABELS[i],.095,yy,.037,'black',.89,'left',false,'shipment-label');metric(i,1.48,yy-.002,.065,.37);}marks(-1.49,.56,7,1,'blue');}
  if(v===7){polygon([[-1.60,.66],[-.93,.66],[-1.60,-.01]],'blue',d/2+.0003);polygon([[-1.60,-.66],[-.93,-.66],[-1.60,.01]],'lime',d/2+.0003);box(.54,.20,-1.25,.53,'blue',d/2+.0003,.0006,'motif');logo(-1.25,.53,.43,'white');title(.03,.51,1.47);map(-.79,-.035,1.31,1.01,['blue','lavender','lime']);table(.035,.31,1.48,.135,2);}
  if(v===8){logo(-1.28,.54,.43,'lime');title(-.61,.53,1.76);map(0,.065,1.78,.72,['white','lavender','lime'],'blue');for(let i=0;i<7;i++){const x=-1.52+i*.438;box(.405,.276,x+.2025,-.465,i%2?'blue':'black',d/2+.0003,.0006,'kpi-card');metric(i,x+.024,-.438,.073,.36,'left');text(SHIPMENT_LABELS[i],x+.024,-.54,.019,'white',.36,'left',false,'shipment-label');}marks(-1.45,.19,4,5,'lavender');marks(1.15,.19,4,5,'lavender');}
 }
 // The foreground is printed onto the face, not buried inside a backing plate.
 // Keep the same exact declared depth while preserving enough layers for shadows.
 for(const [mat,list]of batches){const geometry=mergeGeometries(list,false);if(!geometry)throw new Error('Cannot merge corporate artwork');
  const positions=geometry.getAttribute('position'),role=mat.userData.artworkRole;let zMin=Infinity,zMax=-Infinity;for(let i=0;i<positions.count;i++){zMin=Math.min(zMin,positions.getZ(i));zMax=Math.max(zMax,positions.getZ(i));}const zMid=(zMin+zMax)/2,zSpan=Math.max(.00001,zMax-zMin);for(let i=0;i<positions.count;i++){const z=positions.getZ(i);if(role==='backing'||role==='mount'||role.startsWith('replaceable-'))continue;let front:number;if(role==='3d-map')front=d/2-.007+z*.45;else if(role==='ink'||role==='print-proxy')front=d/2-.0015+(z-.010)*.2;else if(role==='year-band')front=d/2-.0035+(z-zMid)/zSpan*.0006;else if(/card|row/.test(role))front=d/2-.0045+(z-zMid)/zSpan*.0006;else front=d/2-.006+(z-zMid)/zSpan*.0006;positions.setZ(i,front);}
  positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();const mesh=new THREE.Mesh(geometry,mat);mesh.name=`${kind}-${v}/${mat.name}`;mesh.castShadow=!proxy&&!mat.userData.printArtwork;mesh.receiveShadow=!proxy;mesh.userData={sourcePbr:true,part:mat.name};group.add(mesh);for(const source of list)source.dispose();
 }
 group.name=`EDS-${kind}-${v}`;group.userData={assetId:timeline?'edsTimeline':'edsUkraine',variant:v,sourcePbr:true,corporateArtwork:true,placement:'wall',dimensions:[w,h,d],mode:proxy?'editor':'archviz',designName:(timeline?TIMELINE_DESIGNS:UKRAINE_DESIGNS)[v-1],textBlocks:blocks,...(timeline?{historyYears:TIMELINE_YEARS,historyEvents:TIMELINE_HISTORY}:{shipmentLabels:SHIPMENT_LABELS,shipmentValues:SHIPMENT_VALUES,replaceableMetrics:metricModules,shipmentDisplaySystem:SHIPMENT_DISPLAY_SYSTEMS[v-1],mapIncludesCrimea:true,mapRegions:data.maps.ukraine.reliefPieces.length})};
 return group;
}
