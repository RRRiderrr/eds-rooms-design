import * as THREE from 'three';
import type {MaterialVariant,Vec3} from '../core/types';

interface Fold {angle:number; t:number; length:number; width:number; depth:number; bend:number}
const TAU=Math.PI*2;
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const wrapped=(x:number)=>Math.atan2(Math.sin(x),Math.cos(x));

// A handful of tapered, asymmetric tension folds. Their depths are in metres;
// none is a separate raised tube, intersecting cushion or decorative bulge.
const pearFolds:Fold[]=[
 {angle:.19,t:.16,length:.15,width:.021,depth:.008,bend:.22},
 {angle:.87,t:.25,length:.17,width:.023,depth:.010,bend:-.12},
 {angle:1.42,t:.49,length:.14,width:.020,depth:.007,bend:.20},
 {angle:2.02,t:.39,length:.19,width:.025,depth:.009,bend:-.23},
 {angle:2.67,t:.15,length:.11,width:.019,depth:.007,bend:.15},
 {angle:3.56,t:.22,length:.17,width:.025,depth:.008,bend:-.14},
 {angle:4.29,t:.69,length:.18,width:.020,depth:.006,bend:.11},
 {angle:5.37,t:.14,length:.14,width:.022,depth:.008,bend:.18},
 {angle:1.16,t:.73,length:.12,width:.015,depth:.004,bend:-.12},
 {angle:2.15,t:.79,length:.11,width:.018,depth:.004,bend:.18},
 {angle:4.88,t:.32,length:.12,width:.017,depth:.005,bend:.14},
 {angle:5.91,t:.41,length:.13,width:.019,depth:.005,bend:-.18},
];
const loungeFolds:Fold[]=[
 {angle:.16,t:.64,length:.20,width:.020,depth:.009,bend:-.32},
 {angle:.69,t:.70,length:.16,width:.018,depth:.008,bend:.20},
 {angle:1.29,t:.70,length:.22,width:.026,depth:.012,bend:-.25},
 {angle:1.93,t:.62,length:.18,width:.022,depth:.009,bend:.24},
 {angle:2.79,t:.67,length:.19,width:.021,depth:.009,bend:.28},
 {angle:3.43,t:.32,length:.16,width:.024,depth:.010,bend:-.22},
 {angle:4.02,t:.57,length:.17,width:.018,depth:.007,bend:.12},
 {angle:4.71,t:.73,length:.17,width:.024,depth:.008,bend:-.15},
 {angle:5.61,t:.30,length:.18,width:.021,depth:.009,bend:.22},
 {angle:3.91,t:.85,length:.10,width:.016,depth:.006,bend:.10},
 {angle:4.42,t:.86,length:.11,width:.020,depth:.008,bend:-.20},
 {angle:5.02,t:.83,length:.13,width:.015,depth:.007,bend:.18},
 {angle:5.47,t:.81,length:.10,width:.019,depth:.006,bend:-.12},
 {angle:1.02,t:.86,length:.11,width:.019,depth:.006,bend:.17},
];
const pillowFolds:Fold[]=[
 {angle:.14,t:.67,length:.18,width:.023,depth:.011,bend:-.20},
 {angle:.67,t:.75,length:.16,width:.020,depth:.009,bend:.20},
 {angle:1.18,t:.69,length:.22,width:.026,depth:.012,bend:.35},
 {angle:1.96,t:.74,length:.20,width:.024,depth:.011,bend:-.28},
 {angle:2.79,t:.63,length:.18,width:.022,depth:.010,bend:.20},
 {angle:3.50,t:.36,length:.18,width:.021,depth:.008,bend:-.24},
 {angle:4.12,t:.64,length:.19,width:.022,depth:.008,bend:.21},
 {angle:5.28,t:.63,length:.17,width:.025,depth:.009,bend:-.21},
 {angle:3.94,t:.82,length:.11,width:.020,depth:.008,bend:.22},
 {angle:4.48,t:.87,length:.11,width:.017,depth:.009,bend:-.14},
 {angle:5.09,t:.84,length:.11,width:.019,depth:.007,bend:.18},
 {angle:.98,t:.88,length:.11,width:.018,depth:.007,bend:-.22},
];

/** One smooth, sewn and stuffed skin, facing the catalogue's local +Z. */
export function createBeanBagObject(dimensions:Vec3,variant:number,selected:MaterialVariant,proxy:boolean):THREE.Group {
 const [w,h,d]=dimensions,group=new THREE.Group();
 group.userData={assetId:'beanBag',variant,mode:proxy?'editor':'archviz',dimensions,placement:'floor',clothConstruction:'continuous stuffed skin; recessed tension folds',clothNormalStrength:.055};
 const angular=proxy?64:192,rows=proxy?32:112;
 const material=new THREE.MeshStandardMaterial({name:'Beanbag soft woven cover',color:selected.color,roughness:.96,metalness:0});
 material.userData={owned:true,surface:selected.surface,colorVariant:selected.id,color:selected.color,clothNormalStrength:.055,clothRoughness:.96};
 const folds=variant===1?pearFolds:variant===2?loungeFolds:pillowFolds;

 const base=(t:number,angle:number):THREE.Vector3=>{
  const c=Math.cos(angle),s=Math.sin(angle);
  if(variant===1){
   // A broad settling base and a rounded leaning back. The front cover sags
   // into the seat; monotone height prevents folds from turning inside out.
   const phi=Math.PI*t,r=Math.sin(phi)**.50*(.41+.115*Math.cos(phi));
   const front=Math.max(0,s),lean=-.20*smooth(.16,1,t);
   const seat=.280*front**3*Math.sin(phi)**2;
   const asymmetry=1+.016*Math.sin(angle+.65)*Math.sin(phi)**2;
   return new THREE.Vector3(c*r*asymmetry,Math.max(0,t-.07-seat),s*r+lean);
  }
  const phi=Math.PI*t,r=Math.sin(phi),vertical=-Math.cos(phi),upper=(1+vertical)/2;
  const square=variant===3,n=square?3.7:2.55;
  // A smooth polar superellipse keeps a broad pillow footprint without the
  // fractional cos/sin powers that previously pinched the axis vertices.
  const outline=(Math.abs(c)**n+Math.abs(s)**n)**(-1/n);
  const x=c*r*outline*.47,z=s*r*outline*.49;
  const rear=smooth(.035,.43,-z),side=smooth(.28,.50,Math.abs(x));
  const back=(square?.435:.525)*rear**(square?1.35:1.20)*Math.sqrt(upper);
  const arms=(square?.085:.055)*side**1.8*upper**.75*(1-.35*rear);
  const seat=(square?.068:.048)*Math.exp(-((x/.31)**2+((z-.075)/.31)**2))*upper**2;
  const y=.145*(1+vertical)+back+arms-seat;
  // A relaxed top edge leans back with the filling; it is part of the same
  // cover, with a rounded return down to the floor rather than a hard slab.
  return new THREE.Vector3(x,Math.max(0,y-.020),z-(square?.035:.065)*rear*upper);
 };

 const sample=(t:number,angle:number):THREE.Vector3=>{
  const point=base(t,angle);
  if(t<1e-5||t>1-1e-5||point.y<.00001)return point;
  const epsilon=.0001,dt=base(Math.min(1,t+epsilon),angle).sub(base(Math.max(0,t-epsilon),angle));
  const du=base(t,angle+epsilon).sub(base(t,angle-epsilon));
  const normal=dt.cross(du).normalize();
  const arcRadius=Math.max(.13,Math.hypot(point.x,point.z));
  let recess=0;
  if(variant===1){
   // Broad pressure hollow between the settled front and the taller back;
   // the pear remains a filled bag rather than an upholstered rigid shell.
   const across=wrapped(angle-Math.PI/2)/.82,down=(t-.62)/.19;
   recess-=.052*Math.exp(-across*across-down*down);
  }
  for(const fold of folds){
   const longitudinal=(t-fold.t)/fold.length;
   const center=fold.angle+fold.bend*(t-fold.t)/fold.length;
   const across=wrapped(angle-center)*arcRadius/fold.width;
   // A quartic length envelope fades each crease into flat cloth without
   // abrupt endpoints. Creases are sparse, not periodic uniform lobes.
   recess-=fold.depth*Math.exp(-across*across-longitudinal**4)*Math.sin(Math.PI*t);
  }
  // Gently recessed panel joins: submillimetre grooves, not the former 4 mm
  // diameter piping. The sparse production mesh never sprouts raised fins.
  const seamCount=variant===1?6:4;
  const seamAngle=TAU/seamCount;
  const dart=wrapped(angle/seamAngle*TAU)/TAU*seamAngle;
  recess-=.00055*Math.exp(-((dart*arcRadius/.012)**2))*Math.sin(Math.PI*t)**1.4;
  if(proxy)recess*=.7;
  return point.addScaledVector(normal,recess);
 };

 const positions:number[]=[],uv:number[]=[],indices:number[]=[];
 const push=(p:THREE.Vector3,u:number,v:number)=>{positions.push(p.x,p.y,p.z);uv.push(u,v);return positions.length/3-1;};
 // Singular poles are shared vertices, not stacked rings of zero-area faces.
 const bottom=push(sample(0,0),.5,0),ringStarts:number[]=[];
 for(let row=1;row<rows;row++){
  ringStarts.push(positions.length/3);const t=row/rows;
  for(let col=0;col<=angular;col++)push(sample(t,col/angular*TAU),col/angular*(w+d)*1.55,t*(h+d*.7));
 }
 const top=push(sample(1,0),.5,h+d*.7);
 for(let col=0;col<angular;col++)indices.push(bottom,ringStarts[0]+col,ringStarts[0]+col+1);
 for(let row=0;row<ringStarts.length-1;row++)for(let col=0;col<angular;col++){
  const a=ringStarts[row]+col,b=ringStarts[row+1]+col;
  indices.push(a,b,a+1,a+1,b,b+1);
 }
 for(let col=0;col<angular;col++)indices.push(ringStarts.at(-1)!+col,top,ringStarts.at(-1)!+col+1);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
 geometry.computeBoundingBox();const bounds=geometry.boundingBox!,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 geometry.translate(-center.x,-bounds.min.y,-center.z);geometry.scale(w/size.x,h/size.y,d/size.z);geometry.computeVertexNormals();
 // The UV seam has duplicate positions. Give both copies the same averaged
 // normal, retaining metre-scale UVs while removing the old visible hard edge.
 const normals=geometry.getAttribute('normal');
 for(const start of ringStarts){const a=new THREE.Vector3().fromBufferAttribute(normals,start),b=new THREE.Vector3().fromBufferAttribute(normals,start+angular);a.add(b).normalize();normals.setXYZ(start,a.x,a.y,a.z);normals.setXYZ(start+angular,a.x,a.y,a.z);}
 geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.userData={clothSkin:true,construction:'closed continuous cover',tensionFolds:folds.length,raisedPiping:false,geometryVersion:2};
 const skin=new THREE.Mesh(geometry,material);skin.name=`beanBag_${variant}_continuous_cloth`;skin.castShadow=!proxy;skin.receiveShadow=!proxy;skin.userData={assetId:'beanBag',clothSkin:true};group.add(skin);
 return group;
}
