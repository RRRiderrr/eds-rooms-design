import {describe,it,expect} from 'vitest';
import {Box3,Mesh,MeshStandardMaterial,Vector3} from 'three';
import {createCorporateSignage,TIMELINE_DESIGNS,UKRAINE_DESIGNS,TIMELINE_YEARS,TIMELINE_HISTORY,SHIPMENT_VALUES,SHIPMENT_LABELS,SHIPMENT_DISPLAY_SYSTEMS,SIGNAGE_PALETTE} from '../src/catalog/corporate-signage';

describe('Corporate editions of the two retained EDS signs',()=>{
 it('provides eight physically distinct layouts of each sign, with exact metre-scale bounds in production and proxies',()=>{
  expect(TIMELINE_DESIGNS).toHaveLength(8);expect(UKRAINE_DESIGNS).toHaveLength(8);
  for(const kind of ['timeline','ukraine'] as const){const signatures=new Set<string>();for(let variant=1;variant<=8;variant++){
   for(const proxy of [false,true]){const group=createCorporateSignage(kind,variant,proxy),box=new Box3().setFromObject(group),size=box.getSize(new Vector3());
    const expected=kind==='timeline'?[1.68,1.82,.035]:[3.2,1.32,.04];expected.forEach((value,axis)=>expect(size.getComponent(axis),`${kind}:${variant}:${proxy} dimension ${axis}`).toBeCloseTo(value,4));
    expect(group.userData.designName).toBe((kind==='timeline'?TIMELINE_DESIGNS:UKRAINE_DESIGNS)[variant-1]);
    if(!proxy)signatures.add(group.children.map(node=>{const mesh=node as Mesh;return `${mesh.name}:${mesh.geometry.getAttribute('position').count}:${mesh.geometry.boundingBox?.min.toArray()}`;}).join('|'));
   }
  }expect(signatures.size).toBe(8);}
 });
 it('retains all fifteen history entries, including repeated years, with actual outlined body lettering in every design',()=>{
  expect(TIMELINE_YEARS).toHaveLength(15);expect(TIMELINE_HISTORY).toHaveLength(15);
  for(let variant=1;variant<=8;variant++){const group=createCorporateSignage('timeline',variant);expect(group.userData.historyYears).toEqual(TIMELINE_YEARS);expect(group.userData.historyEvents).toEqual(TIMELINE_HISTORY);
   const blocks=group.userData.textBlocks as {role:string;text:string;x:number;y:number;width:number;height:number}[];
   expect(blocks.filter(b=>b.role==='year').map(b=>b.text)).toEqual(TIMELINE_YEARS);
   expect(blocks.filter(b=>b.role==='body').length).toBeGreaterThan(70);
   for(const b of blocks){expect(b.x).toBeGreaterThanOrEqual(-.84-.005);expect(b.x+b.width).toBeLessThanOrEqual(.84+.005);expect(b.y).toBeGreaterThanOrEqual(-.91-.005);expect(b.y+b.height).toBeLessThanOrEqual(.91+.005);}
  }
 });
 it('retains the real Ukraine contour including Crimea, regional relief and every supplied shipment figure',()=>{
  for(let variant=1;variant<=8;variant++){const group=createCorporateSignage('ukraine',variant);expect(group.userData.mapIncludesCrimea).toBe(true);expect(group.userData.mapRegions).toBe(23);expect(group.userData.shipmentValues).toEqual(SHIPMENT_VALUES);expect(group.userData.shipmentLabels).toEqual(SHIPMENT_LABELS);expect(group.userData.textBlocks.filter((b:{role:string})=>b.role==='shipment-label').map((b:{text:string})=>b.text)).toEqual(SHIPMENT_LABELS);
   expect(group.userData.textBlocks.filter((b:{role:string})=>b.role==='shipment-value').map((b:{text:string})=>b.text)).toEqual(SHIPMENT_VALUES);
   expect(group.children.some(node=>node.name.includes('3d-map'))).toBe(true);
  }
 });
 it('provides five physically serviceable KPI modules in every design, including independent cards, magnetic digits and e-ink screens',()=>{
  expect(new Set(SHIPMENT_DISPLAY_SYSTEMS)).toEqual(new Set(['insert-cards','magnetic-digits','e-ink']));
  for(let variant=1;variant<=8;variant++)for(const proxy of [false,true]){
   const group=createCorporateSignage('ukraine',variant,proxy),system=SHIPMENT_DISPLAY_SYSTEMS[variant-1],modules=group.userData.replaceableMetrics;
   expect(group.userData.shipmentDisplaySystem).toBe(system);expect(modules).toHaveLength(5);expect(modules.map((m:{value:string})=>m.value)).toEqual(SHIPMENT_VALUES);
   const hardware=group.children.filter(node=>{const mesh=node as Mesh;return !Array.isArray(mesh.material)&&String(mesh.material.userData.artworkRole).startsWith('replaceable-');}) as Mesh[];
   const role=(value:string)=>hardware.filter(mesh=>!Array.isArray(mesh.material)&&mesh.material.userData.artworkRole===value);
   expect(hardware.length).toBeGreaterThan(1);
   for(const mesh of hardware){const box=new Box3().setFromObject(mesh);expect(box.min.z).toBeGreaterThan(.0125);expect(box.max.z).toBeLessThanOrEqual(.0195);}
   for(const module of modules){expect(module.system).toBe(system);expect(module.digits).toHaveLength(module.value.length);
    module.digits.forEach((digit:{value:string;x:number;y:number;width:number;height:number},index:number)=>{expect(digit.value).toBe(module.value[index]);expect(digit.width).toBeGreaterThan(.025);expect(digit.height).toBeGreaterThan(.055);if(index)expect(digit.x).toBeGreaterThan(module.digits[index-1].x+module.digits[index-1].width+.002);});
   }
   if(system==='insert-cards'){
    expect(role('replaceable-card')).toHaveLength(1);expect(role('replaceable-rail')).toHaveLength(1);
    // A disconnected closed box for every PVC digit card: 12 pieces, 12 triangles each.
    const geometry=role('replaceable-card')[0].geometry;expect(geometry.getAttribute('position').count/36).toBe(SHIPMENT_VALUES.join('').length);
   }else if(system==='magnetic-digits'){
    expect(role('replaceable-magnetic-digit')).toHaveLength(1);const box=new Box3().setFromObject(role('replaceable-magnetic-digit')[0]);expect(box.max.z-box.min.z).toBeCloseTo(.0017,5);expect(role('replaceable-card')).toHaveLength(0);
   }else{
    expect(role('replaceable-screen')).toHaveLength(1);const mesh=role('replaceable-screen')[0],mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;expect((mat as MeshStandardMaterial).emissive.getHex()).toBe(0);expect(mesh.geometry.getAttribute('position').count/36).toBe(5);expect(role('replaceable-card')).toHaveLength(0);
   }
  }
 });
 it('keeps year glyphs inside their coloured bands and all printed faces in front of cards, backing and map relief',()=>{
  const timeline=createCorporateSignage('timeline',1),years=timeline.userData.textBlocks.filter((b:{role:string})=>b.role==='year') as {y:number;height:number}[];
  years.forEach((year,index)=>{const top=.64-Math.floor(index/3)*(.64+.82)/5-.012;expect(year.y+year.height).toBeLessThan(top-.004);expect(year.y).toBeGreaterThan(top-.065);});
  const whiteInk=timeline.children.find(node=>{const mesh=node as Mesh;return !Array.isArray(mesh.material)&&mesh.material.userData.artworkRole==='ink'&&mesh.material.userData.corporateColor===SIGNAGE_PALETTE.white;}) as Mesh;
  const positions=whiteInk.geometry.getAttribute('position'),bands=Array.from({length:15},(_,i)=>{const left=-.77+i%3*(1.54/3)+.013,top=.64-Math.floor(i/3)*(.64+.82)/5-.012;return{left:left+.004,right:left+1.54/3-.026-.004,bottom:top-.065+.004,top:top-.004};});
  for(let i=0;i<positions.count;i++){const x=positions.getX(i),y=positions.getY(i);if(y>.7)continue;expect(bands.some(b=>x>=b.left&&x<=b.right&&y>=b.bottom&&y<=b.top),'Actual white year outline stays inside blue ink').toBe(true);}
  for(const kind of ['timeline','ukraine'] as const)for(let variant=1;variant<=8;variant++){
   const group=createCorporateSignage(kind,variant),bounds=(role:string)=>group.children.filter(node=>{const mesh=node as Mesh;return(!Array.isArray(mesh.material)&&mesh.material.userData.artworkRole===role);}).map(node=>new Box3().setFromObject(node));
   const ink=bounds('ink'),backing=bounds('backing'),panels=[...bounds('card'),...bounds('year-band'),...bounds('row'),...bounds('kpi-card'),...bounds('motif')],maps=bounds('3d-map');
   expect(ink.length).toBeGreaterThan(0);const minInk=Math.min(...ink.map(b=>b.min.z));
   for(const background of [...backing,...panels,...maps])expect(minInk,`${kind}:${variant} print in front of its surface`).toBeGreaterThan(background.max.z+.0001);
   for(const map of maps)for(const background of backing)expect(map.min.z).toBeGreaterThan(background.max.z+.001);
  }
 });
 it('contains finite unit normals and only protected corporate palette materials, without external texture dependencies',()=>{
  for(const kind of ['timeline','ukraine'] as const)for(let variant=1;variant<=8;variant++){
   const group=createCorporateSignage(kind,variant);let triangles=0;
   for(const child of group.children){const mesh=child as Mesh,n=mesh.geometry.getAttribute('normal');triangles+=(mesh.geometry.index?.count??n.count)/3;
    for(const attribute of Object.values(mesh.geometry.attributes))expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    for(let i=0;i<n.count;i+=Math.max(1,Math.floor(n.count/200)))expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,5);
    const mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;expect(mat.userData).toMatchObject({sourcePbr:true,preserveOriginal:true});expect(Object.values(SIGNAGE_PALETTE)).toContain(mat.userData.corporateColor);expect('map' in mat&&mat.map).toBeFalsy();
   }
   expect(triangles).toBeGreaterThan(10000);expect(triangles).toBeLessThan(450000);
  }
 });
});
