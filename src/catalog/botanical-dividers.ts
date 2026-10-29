import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {MaterialVariant,Vec3} from '../core/types';

/** Freestanding botanical dividers. Shelves and trellises remain open between
 * their planting; only the felt screen and individual acoustic panels are solid. */
export function createBotanicalDivider(dimensions:Vec3,variant:number,selected:MaterialVariant,proxy=false):THREE.Group {
 const group=new THREE.Group(),batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),plantBatches=new Map<THREE.Material,THREE.BufferGeometry[]>();
 const v=Math.max(1,Math.min(6,Math.round(variant)));
 group.name=`botanicalDivider:${v}:${proxy?'editor':'archviz'}`;
 group.userData={assetId:'botanicalDivider',variant:v,dimensions,mode:proxy?'editor':'archviz',placement:'floor',originalAuthoring:true,screenConstruction:v===1?'felt-screen':v===6?'acoustic-panels':'open-planting'};
 function material(name:string,color:string,surface:string,roughness:number,metalness=0,vertexColors=false){
  const m=new THREE.MeshStandardMaterial({name,color,roughness,metalness,vertexColors});m.userData={owned:true,sourcePbr:true,preserveOriginal:true,surface,colorVariant:name,color,tintable:false};return m;
 }
 const frame=material('Botanical_frame_finish',selected.color,selected.surface,.65,selected.surface==='metal'?.55:0);
 frame.userData={...frame.userData,sourcePbr:false,preserveOriginal:false,colorVariant:selected.id,tintable:true};
 const oak=selected.surface==='wood'?frame:material('Botanical_oiled_oak','#967351','wood',.74);oak.userData.sourcePbr=false;oak.userData.preserveOriginal=false;
 const metal=material('Botanical_powdercoat',v===2?'#94634e':'#25342f','metal',.67,.32),porcelain=material('Botanical_ceramic','#ddd9c9','ceramic',.86),terracotta=material('Botanical_terracotta','#a3755c','ceramic',.93);
 const soil=material('Botanical_recessed_soil','#30271b','ceramic',1),leaves=material('Botanical_living_foliage','#ffffff','leaf',.78,0,true),stems=material('Botanical_connected_stems','#48643a','leaf',.86),veins=material('Botanical_leaf_midribs','#57794a','leaf',.83);
 const petals=material('Botanical_warm_white_petals','#ffffff','leaf',.83,0,true),anthers=material('Botanical_pollen','#c9ab5e','leaf',.9);
 leaves.side=THREE.DoubleSide;petals.side=THREE.DoubleSide;
 function add(g:THREE.BufferGeometry,m:THREE.Material,plant=false){if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv1');const map=plant?plantBatches:batches,list=map.get(m)??[];list.push(g);map.set(m,list);}
 function box(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material=frame,r=.009,rotation=0){
  const g=proxy||r===0?new THREE.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3));g.rotateZ(rotation);g.translate(x,y,z);
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i));uv.setXY(i,ny>.7?p.getX(i):nx>.7?p.getZ(i):p.getX(i),ny>.7?p.getZ(i):p.getY(i));}add(g,m);
 }
 function tube(points:THREE.Vector3[],radius:number,m=stems,plant=true){if(points.length<2)return;const curve=new THREE.CatmullRomCurve3(points);add(new THREE.TubeGeometry(curve,m===veins?4:proxy?3:6,radius,m===veins?3:4,false),m,plant);}
 function vessel(x:number,y:number,z:number,width:number,height:number,depth:number,m:THREE.Material){
  const t=.018;box(width,height,t,x,y+height/2,z+depth/2-t/2,m,.004);box(width,height,t,x,y+height/2,z-depth/2+t/2,m,.004);
  for(const sign of [-1,1])box(t,height,depth-t*2,x+sign*(width/2-t/2),y+height/2,z,m,.004);
  box(width-t*2,.018,depth-t*2,x,y+.009,z,m,.003);box(width-t*2,.009,depth-t*2,x,y+height-.026,z,soil,.002);
 }
 // Full footprint, floor contact and exact height remain identical for all designs.
 for(const x of [-.84,.84])box(.21,.035,.48,x,.0175,0,metal,.006);
 box(2,.035,.13,0,.085,0,metal,.006);
 if(v===1)box(1.94,2.175,.052,0,1.1225,0,material('Botanical_felt_screen','#b8bbb1','fabric',.98),.003);
 for(const x of [-.975,.975])box(.05,2.265,.065,x,1.1675,0,v<=3?metal:frame,.006);
 box(2,.05,.065,0,2.275,0,v<=3?metal:frame,.006);
 vessel(0,.045,0,1.96,.31,.42,v===4?terracotta:v===3?metal:oak);
 for(const face of [-1,1])box(1.85,.024,.006,0,.095,face*.214,frame,.002);
 let seed=16931+v*173;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const low=new THREE.Color('#1f492b'),high=new THREE.Color('#6c8b47');
 /** A pointed, bowed leaf with a real centre ridge and continuous UVs. */
 function leaf(start:THREE.Vector3,end:THREE.Vector3,width:number,face:number,heart=false,lobed=false){
  const along=proxy?6:lobed?20:12,across=proxy?2:lobed?6:4,yaw=(rand()-.5)*.85,side=new THREE.Vector3(Math.cos(yaw),(rand()-.5)*.32,Math.sin(yaw)).normalize(),normal=new THREE.Vector3(-Math.sin(yaw)*face,0,Math.cos(yaw)*face),len=end.distanceTo(start),bow=.025+rand()*.04,curve=new THREE.CubicBezierCurve3(start,start.clone().lerp(end,.3).addScaledVector(normal,bow),start.clone().lerp(end,.72).add(new THREE.Vector3(0,len*.07,face*bow)),end);
  const positions:number[]=[],uvs:number[]=[],colors:number[]=[],indices:number[]=[],shade=.84+rand()*.31;
  for(let j=0;j<=along;j++)for(let k=0;k<=across;k++){
   const t=j/along,u=k/across*2-1,profile=Math.pow(Math.sin(Math.PI*(.01+.98*t)),heart?.56:lobed?.64:.94)*(1-(heart?.55:.12)*t),q=curve.getPoint(t).addScaledVector(side,u*width*.5*profile).addScaledVector(normal,-u*u*.025*profile+.003*Math.sin(t*15+v)*u*u*profile);
   if(lobed){let cut=1;for(const notch of [.28,.47,.67])cut-=.57*Math.exp(-Math.pow((t-notch-(u>0?.022:0))/.028,2));q.addScaledVector(side,u*width*.5*profile*(Math.max(.21,cut)-1));}
   if(heart)q.y-=Math.exp(-Math.pow((t-.12)/.11,2))*Math.pow(Math.abs(u),.65)*width*.16;
   positions.push(q.x,q.y,q.z);uvs.push(k/across,t);const tone=.21+.36*Math.exp(-Math.abs(u)*17)+.06*Math.sin(t*41+u*7);const c=low.clone().lerp(high,tone).multiplyScalar(shade);colors.push(c.r,c.g,c.b);
   if(j<along&&k<across){const a=j*(across+1)+k,b=a+across+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();add(g,leaves,true);
  if(!proxy)tube(Array.from({length:6},(_,i)=>curve.getPoint(.04+i*.18).addScaledVector(normal,.001)),.0007,veins);
 }
 function plant(x:number,y:number,z:number,spread:number,height:number,face:number,kind='broad',flowers=false){
  const base=new THREE.Vector3(x,y,z),tip=base.clone().add(new THREE.Vector3((rand()-.5)*spread*.8,height,face*.015));
  const spine=Array.from({length:6},(_,i)=>base.clone().lerp(tip,i/5).add(new THREE.Vector3(Math.sin(i*.8)*height*.045,0,face*Math.sin(i*.6)*height*.025)));tube(spine,.0032);const spineCurve=new THREE.CatmullRomCurve3(spine);
  const count=proxy?2:kind==='fern'?6:kind==='monstera'?3:4;
  for(let i=0;i<count;i++){
   const t=.15+i/(count-1)*.76,start=spineCurve.getPoint(t),sign=i%2?1:-1,reach=spread*(.33+.14*rand())*(1-t*.4),end=start.clone().add(new THREE.Vector3(sign*reach,height*(kind==='monstera'?.35+rand()*.13:.09+rand()*.18),face*(.04+rand()*.04)));
   const bladeStart=start.clone().lerp(end,.17);tube([start,start.clone().lerp(bladeStart,.55),bladeStart],.0015);leaf(bladeStart,end,kind==='fern'?spread*.30:kind==='monstera'?spread*.59:spread*(.66+rand()*.20),face,kind==='heart',kind==='monstera');
  }
  if(flowers&&!proxy)flower(tip.clone().add(new THREE.Vector3(0,-.03,face*.025)),face);
 }
 function flower(center:THREE.Vector3,face:number){
  for(let flowerIndex=0;flowerIndex<3;flowerIndex++){
   const c=center.clone().add(new THREE.Vector3((flowerIndex-1)*.035,(flowerIndex%2)*.027,face*.008));tube([center.clone().add(new THREE.Vector3(0,-.07,0)),c],.0012);
   for(let p=0;p<5;p++){
    const angle=p*Math.PI*2/5+flowerIndex*.6,r=.025+rand()*.008,pos:number[]=[],uv:number[]=[],color:number[]=[],idx:number[]=[];
    for(let j=0;j<=4;j++)for(let k=0;k<=2;k++){const t=j/4,u=k-1,radial=t*r,width=Math.sin(Math.PI*(.025+.95*t))*r*.43,q=c.clone().add(new THREE.Vector3(Math.cos(angle)*radial-Math.sin(angle)*width*u,Math.sin(angle)*radial+Math.cos(angle)*width*u,face*(.008*Math.sin(t*Math.PI)-.003*u*u)));pos.push(...q.toArray());uv.push(k/2,t);const shade=.84+.15*t;color.push(shade,shade*.985,shade*.92);if(j<4&&k<2){const a=j*3+k;idx.push(a,a+3,a+1,a+3,a+4,a+1);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(pos.length),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.setIndex(idx);g.computeVertexNormals();add(g,petals,true);
   }
   const g=new THREE.SphereGeometry(.005,8,5);g.translate(c.x,c.y,c.z+face*.002);add(g,anthers,true);
  }
 }
 function vine(x:number,y:number,z:number,length:number,face:number){
  const points=Array.from({length:9},(_,j)=>new THREE.Vector3(x+Math.sin(j*.8+v)*.04,y-j/8*length,z+face*Math.sin(j*.4)*.027));
  tube(points,.0027);const path=new THREE.CatmullRomCurve3(points),count=proxy?3:6;
  for(let i=0;i<count;i++){const p=path.getPoint(.1+i/(count-1)*.82),end=p.clone().add(new THREE.Vector3((i%2?1:-1)*(.09+rand()*.03),-.12-rand()*.025,face*.04));leaf(p,end,.17+rand()*.06,face,true);}
 }
 function row(y:number,count:number,width:number,height:number,kind:string,flowers=false){
  for(const face of [-1,1])for(let i=0;i<count;i++)plant(-.83+i*(1.66/(count-1))+(rand()-.5)*.1,y+(rand()-.5)*.075,face*(.105+rand()*.018),width*(.78+rand()*.42),height*(.63+rand()*.37),face,kind,flowers&&i%3===0);
 }
 switch(v){
  case 1: // Exubia-inspired: quiet opaque panel, steel frame, fluted oak garden bed.
   for(const face of [-1,1])for(let i=0;i<32;i++)box(.025,.285,.013,-.94+i*.0606,.21,face*.216,oak,.004);
   row(.33,11,.33,.74,'heart',true);
   for(const face of [-1,1])for(const x of [-.82,.82])plant(x,.34,face*.115,.28,1.5,face,'fern');break;
  case 2: // Loopo-inspired warm terracotta steel shelving and ceramic planting troughs.
   for(const x of [-.93,-.31,.31,.93])box(.024,1.87,.22,x,1.28,0,metal,.004);
   for(const y of [.71,1.27,1.83])box(1.9,.027,.3,0,y,0,metal,.004);
   for(const face of [-1,1])for(let tier=0;tier<3;tier++)for(let col=0;col<3;col++){
    const x=(col-1)*.62,z=face*.115,y=.73+tier*.56;vessel(x,y,z,.4,.15,.16,porcelain);plant(x+(rand()-.5)*.08,y+.135,z,.41,.29+rand()*.11,face,col%2?'fern':'heart');if((tier+col)%2===0)vine(x+.12,y+.13,z+.017*face,.3+rand()*.13,face);
   }row(.33,6,.28,.34,'heart');break;
  case 3: // Biooffice-inspired black planter and an open grid for climbing foliage.
   for(const x of [-.91,-.455,0,.455,.91])box(.016,1.86,.025,x,1.29,.051,metal,.003);
   for(const y of [.61,1.01,1.41,1.81,2.2])box(1.84,.016,.025,0,y,.051,metal,.003);
   row(.33,9,.36,.62,'heart');
   for(const face of [-1,1])for(let i=0;i<5;i++){
    const x=-.79+i*.395+(rand()-.5)*.08;
    const vinePath=Array.from({length:12},(_,j)=>new THREE.Vector3(x+Math.sin(j*.82+i)*.055,.34+j*.158,face*.083));tube(vinePath,.004);
    for(let tier=0;tier<2;tier++)plant(x,.85+tier*.62+(rand()-.5)*.1,face*.105,.3,.43,face,'heart');
    plant(x+(rand()-.5)*.1,.34+rand()*.55,face*.105,.54,.6+rand()*.25,face,'monstera');
   }break;
  case 4: // Dense planting on an open framework and a fluted terracotta foot planter.
   for(const face of [-1,1])for(let i=0;i<33;i++)box(.026,.27,.014,-.94+i*.059,.216,face*.216,terracotta,.005);
   for(let tier=0;tier<4;tier++)row(.34+tier*.44,9,.36,.53,tier%2?'fern':'heart');
   for(const face of [-1,1])for(const [x,y]of[[-.62,.41],[.23,1.12],[.68,.6]])plant(x,y,face*.12,.48,.62,face,'monstera');break;
  case 5: // Open diagonal oak trellis with climbing jasmine.
   for(const face of [-1,1])for(let i=-5;i<=10;i++)for(const sign of [-1,1]){
    const a=new THREE.Vector2(-.91,.38+i*.36),b=new THREE.Vector2(.91,.38+i*.36+sign*1.82);
    const delta=b.clone().sub(a);
    // Trim rails parametrically to the vertical garden rectangle.
    const lo=Math.max(0,(.38-a.y)/delta.y),hi=Math.min(1,(2.2-a.y)/delta.y);const from=delta.y>0?lo:Math.max(0,(2.2-a.y)/delta.y),to=delta.y>0?hi:Math.min(1,(.38-a.y)/delta.y);
    if(to>from){const aa=a.clone().addScaledVector(delta,from),bb=a.clone().addScaledVector(delta,to),center=aa.clone().add(bb).multiplyScalar(.5);box(.026,aa.distanceTo(bb),.023,center.x,center.y,face*.058,oak,.003,-Math.atan2(bb.x-aa.x,bb.y-aa.y));}
   }
   row(.33,8,.29,.53,'heart',true);row(.98,6,.33,.56,'heart',true);row(1.6,7,.3,.54,'heart',true);break;
  case 6: // Calm acoustic panel composition with integrated tiered gardens.
   for(let i=0;i<4;i++)for(const face of [-1,1]){const x=-.705+i*.47;box(.438,1.79,.027,x,1.3,face*.043,i%3===0?frame:porcelain,.028);}
   for(const face of [-1,1])for(const [x,y,width]of[[-.45,.69,.87],[.45,1.25,.87],[-.45,1.76,.87]] as const){vessel(x,y,face*.12,width,.13,.18,metal);for(let i=0;i<3;i++)plant(x+(i-1)*.26,y+.11,face*.13,.29,.33,face,i%2?'fern':'heart');}
   row(.33,6,.3,.4,'heart');break;
 }
 // Botanical geometry stays clear of the fixed furniture envelope and floor.
 const plantBounds=new THREE.Box3();for(const list of plantBatches.values())for(const g of list){g.computeBoundingBox();plantBounds.union(g.boundingBox!);}
 const centre=plantBounds.getCenter(new THREE.Vector3()),size=plantBounds.getSize(new THREE.Vector3()),fitX=Math.min(1,1.88/size.x),fitZ=Math.min(1,.43/size.z),fitY=Math.min(1,1.92/size.y);
 for(const [m,list]of plantBatches)for(const g of list){g.translate(-centre.x,-plantBounds.min.y,-centre.z);g.scale(fitX,fitY,fitZ);g.translate(0,.335,0);add(g,m);}
 for(const [mat,list]of batches){const merged=mergeGeometries(list,false);if(!merged)throw new Error('Botanical divider merge failed');for(const g of list)g.dispose();merged.scale(dimensions[0]/2,dimensions[1]/2.3,dimensions[2]/.48);merged.computeBoundingBox();merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,mat);mesh.name=mat.name;mesh.castShadow=!proxy;mesh.receiveShadow=!proxy;mesh.userData={assetId:'botanicalDivider',surface:mat.userData.surface};group.add(mesh);}
 return group;
}
