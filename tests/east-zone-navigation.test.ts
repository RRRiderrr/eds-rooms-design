import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {HALL_PRESETS} from '../src/catalog/presets';
import {getAsset} from '../src/catalog/catalog';
import {isInHallFloor} from '../src/core/hall';
import {footprint} from '../src/core/placement';
import {configureSpace,getPlacementRoom} from '../src/core/space';

type Rect=ReturnType<typeof footprint>;
const clearance=(x:number,z:number,r:Rect)=>{
 const dx=x-r.x,dz=z-r.z,c=Math.cos(r.angle),s=Math.sin(r.angle);
 return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-r.hx),Math.max(0,Math.abs(dx*s+dz*c)-r.hz));
};

describe('East lounge planted zoning',()=>{
 beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));
 it('removes the marked pot and joins two matching cabinets in a straight continuous row',()=>{
  for(const config of HALL_PRESETS.slice(8)){
   expect(config.objects.find(o=>o.id==='hall-plant-east'),config.presetId).toBeUndefined();
   for(const [id,x,z] of [['hall-east-zone-work-divider',15.7,-.25],['hall-east-zone-door-divider',21.8,1.3]] as const){
    const o=config.objects.find(o=>o.id===id);expect(o,`${config.presetId}:${id}`).toBeDefined();
    expect(o).toMatchObject({assetId:'botanicalDivider',regionId:'hall',position:[x,0,z]});expect(o!.rotation).toBeCloseTo(Math.PI/2);
   }
   const second=config.objects.find(o=>o.id==='hall-east-zone-compact-divider');
   const first=config.objects.find(o=>o.id==='hall-east-zone-work-divider')!;
   expect(second,config.presetId).toMatchObject({assetId:'botanicalDivider',variant:first.variant,material:first.material,position:[15.7,0,1.75],regionId:'hall'});
   expect(second!.rotation).toBeCloseTo(Math.PI/2);
   const width=getAsset('botanicalDivider').variants.find(v=>v.index===first.variant)!.dimensions[0];
   expect(width).toBe(2);expect(second!.position[2]-first.position[2]).toBeCloseTo(width,6);
   expect(getAsset('botanicalDivider').variants.find(v=>v.index===14)?.dimensions).toEqual([1.2,1.59,.48]);
  }
 });
 it('keeps a continuous 96 cm-wide route from the hall to all three east doors in every new preset',()=>{
  const radius=.48,step=.1,minX=14,maxX=23.2,minZ=-4.5,maxZ=2.7;
  const nx=Math.round((maxX-minX)/step)+1,nz=Math.round((maxZ-minZ)/step)+1;
  const index=(x:number,z:number)=>Math.round((x-minX)/step)*nz+Math.round((z-minZ)/step);
  for(const config of HALL_PRESETS.slice(8)){
   const blockers=config.objects.filter(o=>o.variant>0&&getAsset(o.assetId).placement==='floor'&&!['cover','accessory'].includes(getAsset(o.assetId).collision)).map(footprint);
   for(const o of getPlacementRoom({position:[21,0,0]}).obstacles)blockers.push({x:(o.minX+o.maxX)/2,z:(o.minZ+o.maxZ)/2,hx:(o.maxX-o.minX)/2,hz:(o.maxZ-o.minZ)/2,angle:0});
   const allowed=(x:number,z:number)=>{
    if(!isInHallFloor([x,z]))return false;
    for(let a=0;a<16;a++)if(!isInHallFloor([x+radius*Math.cos(a*Math.PI/8),z+radius*Math.sin(a*Math.PI/8)]))return false;
    return blockers.every(r=>clearance(x,z,r)>=radius);
   };
   expect(allowed(16,-3.8),config.presetId).toBe(true);
   const start=index(16,-3.8),queue=[start],seen=new Set(queue);
   for(let q=0;q<queue.length;q++){
    const i=queue[q],ix=Math.floor(i/nz),iz=i%nz,x=minX+ix*step,z=minZ+iz*step;
    for(const [dx,dz] of [[0,1],[1,0],[0,-1],[-1,0]]){
     const jx=ix+dx,jz=iz+dz,j=jx*nz+jz;
     if(jx<0||jz<0||jx>=nx||jz>=nz||seen.has(j))continue;
     if(allowed(x+dx*step/2,z+dz*step/2)&&allowed(x+dx*step,z+dz*step)){seen.add(j);queue.push(j);}
    }
   }
   for(const [door,x,z] of [['WC-10',23.1,2.4],['11',23.1,-2],['12',23.1,-3.5]] as const){
    expect(allowed(x,z),`${config.presetId}:${door} approach`).toBe(true);
    expect(seen.has(index(x,z)),`${config.presetId}:${door} route`).toBe(true);
   }
  }
 });
 it('preserves an 84 cm-wide approach to the coffee machine in preset 12',()=>{
  const config=HALL_PRESETS[12],radius=.42,step=.1,minX=14,maxX=23.2,minZ=-4.5,maxZ=2.7;
  const nx=Math.round((maxX-minX)/step)+1,nz=Math.round((maxZ-minZ)/step)+1;
  const index=(x:number,z:number)=>Math.round((x-minX)/step)*nz+Math.round((z-minZ)/step);
  for(const secondPresent of [false,true]){
   const blockers=config.objects.filter(o=>o.variant>0&&(secondPresent||o.id!=='hall-east-zone-compact-divider')&&getAsset(o.assetId).placement==='floor'&&!['cover','accessory'].includes(getAsset(o.assetId).collision)).map(footprint);
   for(const o of getPlacementRoom({position:[21,0,0]}).obstacles)blockers.push({x:(o.minX+o.maxX)/2,z:(o.minZ+o.maxZ)/2,hx:(o.maxX-o.minX)/2,hz:(o.maxZ-o.minZ)/2,angle:0});
   const allowed=(x:number,z:number)=>{
    if(!isInHallFloor([x,z]))return false;
    for(let a=0;a<16;a++)if(!isInHallFloor([x+radius*Math.cos(a*Math.PI/8),z+radius*Math.sin(a*Math.PI/8)]))return false;
    return blockers.every(r=>clearance(x,z,r)>=radius);
   };
   expect(allowed(16,-3.8)).toBe(true);
   const start=index(16,-3.8),queue=[start],seen=new Set(queue);
   for(let q=0;q<queue.length;q++){
    const i=queue[q],ix=Math.floor(i/nz),iz=i%nz,x=minX+ix*step,z=minZ+iz*step;
    for(const [dx,dz] of [[0,1],[1,0],[0,-1],[-1,0]]){
     const jx=ix+dx,jz=iz+dz,j=jx*nz+jz;
     if(jx<0||jz<0||jx>=nx||jz>=nz||seen.has(j))continue;
     if(allowed(x+dx*step/2,z+dz*step/2)&&allowed(x+dx*step,z+dz*step)){seen.add(j);queue.push(j);}
    }
   }
   expect(allowed(18.5,1.6),`coffee approach; second=${secondPresent}`).toBe(true);
   expect(seen.has(index(18.5,1.6)),`coffee route; second=${secondPresent}`).toBe(true);
  }
 });
});
