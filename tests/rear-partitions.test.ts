import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUILTIN_PRESETS, HALL_PRESETS } from '../src/catalog/presets';
import { getAsset, getVariant } from '../src/catalog/catalog';
import { rearPartitions, REAR_PARTITION_ROUTES } from '../src/catalog/rear-partitions';
import { HALL_LAYOUT, isInHallFloor, originalHallTables } from '../src/core/hall';
import { footprint, rectanglesOverlap, validatePlacement } from '../src/core/placement';
import { configureSpace, getPlacementRoom } from '../src/core/space';

type Rect = ReturnType<typeof footprint>;
type Point = [number, number];
const corners = (r: Rect): Point[] => [[-r.hx,-r.hz],[r.hx,-r.hz],[r.hx,r.hz],[-r.hx,r.hz]].map(([x,z])=>[r.x+x*Math.cos(r.angle)+z*Math.sin(r.angle),r.z-x*Math.sin(r.angle)+z*Math.cos(r.angle)]);
const pointDistance = (p: Point, r: Rect): number => {
  const dx=p[0]-r.x,dz=p[1]-r.z,c=Math.cos(r.angle),s=Math.sin(r.angle);
  return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-r.hx),Math.max(0,Math.abs(dx*s+dz*c)-r.hz));
};
const rayHits = (a: Point,b: Point,r: Rect): boolean => {
  const c=Math.cos(r.angle),s=Math.sin(r.angle),local=(p:Point):Point=>[(p[0]-r.x)*c-(p[1]-r.z)*s,(p[0]-r.x)*s+(p[1]-r.z)*c];
  const aa=local(a),bb=local(b);let min=0,max=1;
  for(const [axis,half] of [[0,r.hx],[1,r.hz]]){
    const d=bb[axis]-aa[axis];if(Math.abs(d)<1e-10){if(Math.abs(aa[axis])>half)return false;continue;}
    const t=[(-half-aa[axis])/d,(half-aa[axis])/d].sort((x,y)=>x-y);min=Math.max(min,t[0]);max=Math.min(max,t[1]);if(min>max)return false;
  }
  return min<1&&max>0;
};
const doorIds = ['door-02','door-14','door-15'];

describe('One planted row for entry15 and team-room02',()=>{
  beforeAll(()=>configureSpace(JSON.parse(readFileSync(new URL('../public/assets/architecture/scene-space.json',import.meta.url),'utf8'))));

  it('contains only two editable collinear modules in all 8 hall and 16 combined default presets',()=>{
    const allVariants=new Set<number>();
    for(const config of [...HALL_PRESETS,...BUILTIN_PRESETS]){
      const screens=config.objects.filter(o=>o.assetId==='botanicalDivider');
      expect(screens,config.presetId).toHaveLength(2);
      expect(screens.map(o=>o.id)).toEqual(['hall-rear-screen-1','hall-rear-screen-2']);
      expect(new Set(screens.map(o=>o.variant)).size).toBe(2);
      const [first,second]=screens,dx=second.position[0]-first.position[0],dz=second.position[2]-first.position[2];
      expect(second.rotation).toBe(first.rotation);
      expect(Math.hypot(dx,dz)).toBeCloseTo(2,9);
      expect(dx*Math.sin(first.rotation)+dz*Math.cos(first.rotation)).toBeCloseTo(0,9);
      for(const screen of screens){
        allVariants.add(screen.variant);expect(screen.regionId).toBe('hall');
        expect(getVariant(screen.assetId,screen.variant).dimensions).toEqual([2,2.3,.48]);
        expect(getAsset(screen.assetId).materials.some(m=>m.id===screen.material)).toBe(true);
      }
      expect(config.objects.filter(o=>o.assetId==='hallDesk')).toEqual(originalHallTables());
    }
    expect([...allVariants].sort()).toEqual([1,2,3,4,5,6]);
  });

  it('uses only the actual measured floor and never intersects existing furniture or source architecture',()=>{
    for(const [index,config]of HALL_PRESETS.entries())for(const screen of rearPartitions(index)){
      expect(corners(footprint(screen)).every(p=>isInHallFloor(p)),`${config.presetId}:${screen.id}`).toBe(true);
      expect(validatePlacement(screen,config.objects,getPlacementRoom(screen)),`${config.presetId}:${screen.id}`).toEqual({valid:true});
    }
  });

  it('leaves the complete one-metre inward swing square of all three doors clear',()=>{
    for(const door of HALL_LAYOUT.doors.filter(d=>doorIds.includes(d.id))){
      const wall=HALL_LAYOUT.hallWalls.find(w=>w.id===door.wallId)!;
      const along=door.position[wall.axis==='x'?2:0],normal=wall.normal;
      const swing:Rect={x:wall.axis==='x'?wall.coordinate+normal[0]*.5:along,z:wall.axis==='z'?wall.coordinate+normal[2]*.5:along,hx:.5,hz:.5,angle:0};
      for(const screen of rearPartitions(0))expect(rectanglesOverlap(footprint(screen),swing),`${door.id}:${screen.id}`).toBe(false);
    }
  });

  it('places only entry15/team-room02 behind the planted silhouettes and leaves stairs14 wholly visible',()=>{
    const screens=rearPartitions(0),rects=screens.map(footprint);
    // This checks placement, not artificial opacity. The open trellises and
    // shelves intentionally show glimpses between their leaves and frames.
    for(const eye of [[-19,-.5],[-18,0],[-16,-1]] as Point[]){
      for(const door of HALL_LAYOUT.doors.filter(d=>doorIds.includes(d.id))){
        const axis=door.normal[2]?0:1;
        for(let i=0;i<41;i++){
          const sample:Point=[door.position[0],door.position[2]];sample[axis]+=(i/40-.5);
          expect(rects.some(r=>rayHits(eye,sample,r)),`${door.id} sample ${i} from ${eye}`).toBe(door.id!=='door-14');
        }
      }
    }
    for(const screen of screens)expect(screen.position[1]+getVariant(screen.assetId,screen.variant).dimensions[1]).toBeGreaterThan(2.1);
  });

  it('keeps a direct stairs route and 1100 mm pedestrian paths around the free end to both screened doors',()=>{
    const radius=.55;
    for(const config of HALL_PRESETS){
      const blockers=config.objects.filter(o=>o.variant>0&&getAsset(o.assetId).placement==='floor'&&!['cover','accessory'].includes(getAsset(o.assetId).collision)).map(footprint);
      for(const {points:route} of REAR_PARTITION_ROUTES)for(let segment=1;segment<route.length;segment++){
        const a=route[segment-1],b=route[segment],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.025);
        for(let i=0;i<=steps;i++){
          const p:Point=[a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps];
          expect(blockers.every(r=>pointDistance(p,r)>=radius-.00001),`${config.presetId}:${p}`).toBe(true);
          for(let angle=0;angle<16;angle++)expect(isInHallFloor([p[0]+Math.cos(angle*Math.PI/8)*radius,p[1]+Math.sin(angle*Math.PI/8)*radius]),`${config.presetId}:${p}`).toBe(true);
        }
      }
    }
  });
});
