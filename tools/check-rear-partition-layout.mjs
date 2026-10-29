/** Read measured architecture + current presets; do not modify either. */
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'test-results/rear-partitions-layout');
await mkdir(output, { recursive: true });
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { HALL_PRESETS, BUILTIN_PRESETS } = await vite.ssrLoadModule('/src/catalog/presets.ts');
  const { rearPartitions, REAR_PARTITION_ROUTES } = await vite.ssrLoadModule('/src/catalog/rear-partitions.ts');
  const { HALL_LAYOUT, isInHallFloor } = await vite.ssrLoadModule('/src/core/hall.ts');
  const { getAsset, getVariant } = await vite.ssrLoadModule('/src/catalog/catalog.ts');
  const { rectanglesOverlap } = await vite.ssrLoadModule('/src/core/placement.ts');
  const rectangle = object => {
    const [w, , d] = object.assetId === 'botanicalDivider' ? [2, 2.3, .48] : getVariant(object.assetId, object.variant).dimensions;
    return { x: object.position[0], z: object.position[2], hx: w / 2, hz: d / 2, angle: object.rotation };
  };
  const corners = r => [[-r.hx,-r.hz],[r.hx,-r.hz],[r.hx,r.hz],[-r.hx,r.hz]].map(([x,z]) => [r.x+x*Math.cos(r.angle)+z*Math.sin(r.angle),r.z-x*Math.sin(r.angle)+z*Math.cos(r.angle)]);
  const distance = (p, r) => {
    const dx=p[0]-r.x,dz=p[1]-r.z,c=Math.cos(r.angle),s=Math.sin(r.angle);
    return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-r.hx),Math.max(0,Math.abs(dx*s+dz*c)-r.hz));
  };
  const rayHit = (a,b,r) => {
    const c=Math.cos(r.angle),s=Math.sin(r.angle),local=p=>[(p[0]-r.x)*c-(p[1]-r.z)*s,(p[0]-r.x)*s+(p[1]-r.z)*c];
    const aa=local(a),bb=local(b);let min=0,max=1;
    for(const [axis,half] of [[0,r.hx],[1,r.hz]]){
      const d=bb[axis]-aa[axis];if(Math.abs(d)<1e-10){if(Math.abs(aa[axis])>half)return false;continue;}
      const t=[(-half-aa[axis])/d,(half-aa[axis])/d].sort((x,y)=>x-y);min=Math.max(min,t[0]);max=Math.min(max,t[1]);if(min>max)return false;
    }
    return min<1&&max>0;
  };
  const rearDoors=HALL_LAYOUT.doors.filter(d=>['door-02','door-14','door-15'].includes(d.id));
  const approaches=[[-19,-.5],[-18,0],[-16,-1]],radius=.55,step=.05;
  for(const preset of [...HALL_PRESETS,...BUILTIN_PRESETS]){
    const screens=preset.objects.filter(o=>o.assetId==='botanicalDivider');
    if(screens.length!==2)throw new Error(`${preset.presetId}: expected exactly two modules`);
    const [a,b]=screens,dx=b.position[0]-a.position[0],dz=b.position[2]-a.position[2];
    if(a.rotation!==b.rotation||Math.abs(dx*Math.sin(a.rotation)+dz*Math.cos(a.rotation))>1e-8||Math.abs(Math.hypot(dx,dz)-2)>1e-8)throw new Error(`${preset.presetId}: modules are not adjacent in one straight row`);
  }
  const entries=[];
  for(const [style, preset] of HALL_PRESETS.entries()) {
    const screens=rearPartitions(style),rects=screens.map(rectangle);
    const furniture=preset.objects.filter(o=>o.variant>0&&o.assetId!=='botanicalDivider'&&getAsset(o.assetId).placement==='floor'&&!['cover','accessory'].includes(getAsset(o.assetId).collision)).map(o=>({object:o,rect:rectangle(o)}));
    const collisions=[];
    for(const [i,r]of rects.entries()){
      if(!corners(r).every(p=>isInHallFloor(p)))throw new Error(`${preset.presetId} screen ${i+1} outside measured floor`);
      for(const other of furniture)if(rectanglesOverlap(r,other.rect))collisions.push([screens[i].id,other.object.id]);
      for(let j=i+1;j<rects.length;j++)if(rectanglesOverlap(r,rects[j]))collisions.push([screens[i].id,screens[j].id]);
    }
    if(collisions.length)throw new Error(`${preset.presetId}: collisions ${JSON.stringify(collisions)}`);
    // Verify the short, reproducible live-camera routes as well as the grid
    // search below. A wide human body is swept along the whole path.
    for(const route of REAR_PARTITION_ROUTES)for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.025);
      for(let j=0;j<=steps;j++){
        const p=[a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps];
        if([...rects,...furniture.map(o=>o.rect)].some(r=>distance(p,r)<radius-.00001))throw new Error(`${preset.presetId}: obstructed recorded route to ${route.doorId}`);
        for(let angle=0;angle<16;angle++)if(!isInHallFloor([p[0]+Math.cos(angle*Math.PI/8)*radius,p[1]+Math.sin(angle*Math.PI/8)*radius]))throw new Error(`${preset.presetId}: recorded route leaves floor at ${p}`);
      }
    }
    const views=approaches.map(eye=>({eye,doors:rearDoors.map(door=>{
      const axis=door.normal[2]?0:1,center=[door.position[0],door.position[2]],visible=[];
      for(let i=0;i<41;i++){const sample=[...center];sample[axis]+=(i/40-.5)*1;if(!rects.some(r=>rayHit(eye,sample,r)))visible.push(sample);}
      return {id:door.id,samples:41,visible:visible.length};
    })}));
    if(views.some(view=>view.doors.some(door=>door.id==='door-14'?door.visible!==41:door.visible!==0)))throw new Error(`${preset.presetId}: row should screen only entry/team-room, while stairs remain visible ${JSON.stringify(views)}`);
    const blockers=[...rects,...furniture.map(o=>o.rect)],xmin=-25.2,zmin=-4.7,cols=129,rows=143;
    const cells=new Uint8Array(cols*rows),parents=new Int32Array(cols*rows).fill(-1);
    const point=index=>[xmin+(index%cols)*step,zmin+Math.floor(index/cols)*step];
    const free=index=>{if(cells[index])return cells[index]===1;const p=point(index);let valid=true;for(let i=0;i<16&&valid;i++){const a=i*Math.PI/8;valid=isInHallFloor([p[0]+Math.cos(a)*radius,p[1]+Math.sin(a)*radius]);}if(valid)valid=!blockers.some(r=>distance(p,r)<radius-.00001);cells[index]=valid?1:2;return valid;};
    const indexOf=p=>Math.round((p[0]-xmin)/step)+Math.round((p[1]-zmin)/step)*cols;
    const start=indexOf([-19,-1.6]),queue=[start];parents[start]=start;
    if(!free(start))throw new Error('Approach is not free');
    for(let head=0;head<queue.length;head++){
      const index=queue[head],x=index%cols,z=Math.floor(index/cols);
      for(const next of [x?index-1:-1,x<cols-1?index+1:-1,z?index-cols:-1,z<rows-1?index+cols:-1])if(next>=0&&parents[next]===-1&&free(next)){parents[next]=index;queue.push(next);}
    }
    const destinations=[['door-02',[-21.55,.95]],['door-14',[-22.70,-3.85]],['door-15',[-24.85,.35]]];
    const paths=destinations.map(([door,p])=>{let index=indexOf(p);if(parents[index]===-1)throw new Error(`${preset.presetId} no 1100mm pedestrian route to ${door}`);const points=[];while(parents[index]!==index){points.push(point(index));index=parents[index];}points.push(point(start));return {door,points:points.reverse()};});
    entries.push({presetId:preset.presetId,screens,collisions,views,paths,walkableRadius:radius});
  }
  const screenRects=entries[0].screens.map(rectangle),x=p=>(p[0]+26)*125+40,y=p=>(p[1]+5.3)*125+40;
  const polygon=points=>points.map(p=>`${x(p)},${y(p)}`).join(' ');
  const lines=HALL_LAYOUT.hallWalls.filter(w=>w.axis==='x'?w.coordinate<-18:w.min<-18).map(w=>{const a=w.axis==='x'?[w.coordinate,w.min]:[w.min,w.coordinate],b=w.axis==='x'?[w.coordinate,w.max]:[w.max,w.coordinate];return `<line x1="${x(a)}" y1="${y(a)}" x2="${x(b)}" y2="${y(b)}" stroke="#404547" stroke-width="7"/>`;}).join('');
  const doors=rearDoors.map(d=>{const p=[d.position[0],d.position[2]];return `<circle cx="${x(p)}" cy="${y(p)}" r="11" fill="#dc6b29"/><text x="${x(p)+15}" y="${y(p)-10}" font-size="17">${d.id}</text>`;}).join('');
  const screens=screenRects.map((r,i)=>`<polygon points="${polygon(corners(r))}" fill="${i===3?'#2e7b7a':'#467f45'}" stroke="#204429" stroke-width="3"/><text x="${x([r.x,r.z])+15}" y="${y([r.x,r.z])+7}" font-size="17">${i+1}</text>`).join('');
  const paths=entries[5].paths.map((p,i)=>`<polyline points="${polygon(p.points)}" fill="none" stroke="${['#a22bbf','#2697d0','#efb526'][i]}" stroke-width="4" opacity=".85"/>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="1120" viewBox="0 0 1160 1120"><rect width="1160" height="1120" fill="#f6f3eb"/><style>text{font-family:Arial, sans-serif;fill:#26352b}</style><text x="40" y="30" font-size="22">Entry/team-room planted row · measured plan</text><polygon points="${polygon(HALL_LAYOUT.hallFloorPolygon.outer)}" fill="#e0dfd5"/>${lines}${doors}${screens}${paths}<text x="850" y="240" font-size="20">Hall approach →</text><text x="850" y="270" font-size="17">2 × 2.0 × 2.3m</text><text x="850" y="300" font-size="17">One straight row</text><text x="850" y="330" font-size="17">1100mm walking test</text><text x="850" y="360" font-size="17">Stairs remain visible</text></svg>`;
  await writeFile(path.join(output,'plan.svg'),svg);
  await writeFile(path.join(output,'report.json'),JSON.stringify({builtAt:new Date().toISOString(),doorIds:rearDoors.map(d=>d.id),scope:'Two collinear footprints screen entry15/team-room02 from the central main-hall approach. Open planted designs deliberately allow views between foliage; the stairs14 aperture stays entirely outside the screen silhouettes. All doors remain accessible around the southwest end.',entries},null,2));
  console.log(JSON.stringify({hallPresets:entries.length,combinedPresets:BUILTIN_PRESETS.length,screenedDoorIds:['door-02','door-15'],unobstructedDoorId:'door-14',screenCount:2,screenSize:[2,2.3,.48],rowLength:4,walkingDiameter:radius*2,collisionCount:0,approaches:approaches.length,doorWidthSamplesPerView:41,output},null,2));
} finally { await vite.close(); }
