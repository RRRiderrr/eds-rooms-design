import { describe,expect,it } from 'vitest';
import { PARTITION_CAMERA_RADIUS,partitionMoveAllowed,partitionPointAllowed } from '../src/core/partition-navigation';
import { rearPartitions, REAR_PARTITION_ROUTES } from '../src/catalog/rear-partitions';
import type { SceneObject } from '../src/core/types';

const point=(x:number,z:number,y=1.65)=>({x,y,z});
const divider=(overrides:Partial<SceneObject>={}):SceneObject=>({id:'screen',assetId:'botanicalDivider',variant:1,material:'oak',position:[0,0,0],rotation:0,...overrides});

describe('movable botanical privacy partition navigation',()=>{
 it('blocks either face and its ends, including fast and backwards sweeps',()=>{
  const objects=[divider()];
  for(const[from,to]of[[point(0,-2),point(0,2)],[point(-4,0),point(4,0)],[point(-2,-1),point(2,1)]]as const){
   expect(partitionMoveAllowed(objects,from,to)).toBe(false);
   expect(partitionMoveAllowed(objects,to,from)).toBe(false);
  }
  expect(partitionPointAllowed(objects,point(0,0))).toBe(false);
  expect(partitionPointAllowed(objects,point(0,.24+PARTITION_CAMERA_RADIUS+.001))).toBe(true);
 });

 it('uses circular head clearance rather than a square expanded corner',()=>{
  const objects=[divider()];
  // Both points lie in the AABB expanded by .18 m; only the second touches
  // the true rounded corner. This keeps diagonal bypasses comfortable.
  expect(partitionPointAllowed(objects,point(1.14,.38))).toBe(true);
  expect(partitionPointAllowed(objects,point(1.12,.36))).toBe(false);
  expect(partitionMoveAllowed(objects,point(1.14,.38),point(1.5,.75))).toBe(true);
  expect(partitionMoveAllowed(objects,point(1.29,.2),point(.89,.6))).toBe(false);
 });

 it('follows the actual rotated OBB instead of a world-space enclosing box',()=>{
  const screen=divider({position:[-6,0,3],rotation:Math.PI/4});
  const world=(x:number,z:number)=>point(-6+x*Math.cos(screen.rotation)+z*Math.sin(screen.rotation),3-x*Math.sin(screen.rotation)+z*Math.cos(screen.rotation));
  expect(partitionMoveAllowed([screen],world(0,-2),world(0,2))).toBe(false);
  expect(partitionMoveAllowed([screen],world(-2,.45),world(2,.45))).toBe(true);
  const quarter=divider({rotation:Math.PI/2});
  expect(partitionMoveAllowed([quarter],point(-2,0),point(2,0))).toBe(false);
  expect(partitionMoveAllowed([quarter],point(.45,-3),point(.45,3))).toBe(true);
 });

 it('retains access behind screens and through a real side passage',()=>{
  const objects=[divider({position:[-21.35,0,-2]}),divider({id:'return',position:[-19.95,0,-3.4],rotation:Math.PI/2})];
  expect(partitionMoveAllowed(objects,point(-23,-2.6),point(-20.5,-2.6))).toBe(true);
  expect(partitionMoveAllowed(objects,point(-20.65,-2.6),point(-20.65,-4.6))).toBe(true);
  expect(partitionMoveAllowed(objects,point(-21.35,-3),point(-21.35,-1))).toBe(false);
 });

 it('preserves both door routes and direct stairs access around one collinear row in every style',()=>{
  for(let style=0;style<8;style++){
   const objects=rearPartitions(style);
   for(const {points:route} of REAR_PARTITION_ROUTES)for(let i=1;i<route.length;i++){
    expect(partitionMoveAllowed(objects,point(route[i-1][0],route[i-1][1]),point(route[i][0],route[i][1]))).toBe(true);
   }
   expect(partitionPointAllowed(objects,point(-20.6,-.25))).toBe(false);
   expect(partitionMoveAllowed(objects,point(-19.8,-1.05),point(-21.4,.55))).toBe(false);
  }
 });

 it('keeps narrow panel joints closed while allowing usable gaps',()=>{
  const gap=(width:number)=>[divider({id:'left',position:[-1-width/2,0,0]}),divider({id:'right',position:[1+width/2,0,0]})];
  expect(partitionMoveAllowed(gap(.02),point(0,-2),point(0,2))).toBe(false);
  expect(partitionMoveAllowed(gap(.32),point(0,-2),point(0,2))).toBe(false);
  expect(partitionMoveAllowed(gap(.38),point(0,-2),point(0,2))).toBe(true);
  expect(partitionMoveAllowed(gap(.6),point(.14,-2),point(.14,2))).toBe(false);
 });

 it('checks the occupied height continuously and permits flying over the top',()=>{
  const objects=[divider()];
  expect(partitionMoveAllowed(objects,point(0,-2,2.481),point(0,2,2.481))).toBe(true);
  expect(partitionMoveAllowed(objects,point(0,-2,2.47),point(0,2,2.47))).toBe(false);
  expect(partitionMoveAllowed(objects,point(0,0,3),point(0,0,1.65))).toBe(false);
  // Descending happens after the footprint has been crossed, not at its top.
  expect(partitionMoveAllowed(objects,point(0,-1,3.6),point(0,1,2.4))).toBe(true);
  expect(partitionMoveAllowed(objects,point(0,-1,2.4),point(0,1,1.2))).toBe(false);
  expect(partitionMoveAllowed([divider({position:[0,1,0]})],point(0,-2,.5),point(0,2,.5))).toBe(true);
  expect(partitionMoveAllowed(objects,point(0,-2,.22),point(0,2,.22))).toBe(false);
 });

 it('updates on move, rotation, deletion, and variant 0 without stale colliders',()=>{
  const screen=divider(),from=point(0,-2),to=point(0,2);
  expect(partitionMoveAllowed([screen],from,to)).toBe(false);
  screen.position=[4,0,0];expect(partitionMoveAllowed([screen],from,to)).toBe(true);
  screen.position=[0,0,0];screen.variant=0;expect(partitionMoveAllowed([screen],from,to)).toBe(true);
  expect(partitionMoveAllowed([],from,to)).toBe(true);
  for(const variant of[1,2,3,4,5,6])expect(partitionMoveAllowed([divider({variant})],from,to)).toBe(false);
 });

 it('keeps other furniture nonblocking and does not mutate inputs',()=>{
  const from=point(0,-2),to=point(0,2),objects=[divider({assetId:'sofa'}),divider({assetId:'separator',variant:3})];
  const before=structuredClone({objects,from,to});
  expect(partitionMoveAllowed(objects,from,to)).toBe(true);
  partitionMoveAllowed([divider()],from,to);
  expect({objects,from,to}).toEqual(before);
 });
});
