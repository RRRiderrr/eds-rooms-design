import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Box3,Vector3,Mesh,BufferGeometry,MeshStandardMaterial} from 'three';
import {getAsset,getVariant,CORPORATE_COLORS} from '../src/catalog/catalog';
import {createAssetObject,disposeAssetObject} from '../src/catalog/geometry';
import sourceDesks from '../assets-src/main-hall/editor-proxies.json';

function triangles(object:ReturnType<typeof createAssetObject>){let total=0;object.traverse(o=>{if(o instanceof Mesh)total+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;});return total;}
function bounds(geometry:BufferGeometry){geometry.computeBoundingBox();return geometry.boundingBox!;}

describe('Measured EDS furniture and door hardware',()=>{
 it('preserves exact beanbag footprints and floor contact in production and cheap recognizable proxies',()=>{
  const footprints:number[]=[];
  for(let variant=1;variant<=3;variant++){
   const production=createAssetObject('beanBag',variant,'eds-blue','archviz'),proxy=createAssetObject('beanBag',variant,'eds-blue','editor');
   for(const object of [production,proxy]){
    const box=new Box3().setFromObject(object),size=box.getSize(new Vector3());
    getVariant('beanBag',variant).dimensions.forEach((expected,i)=>expect(size.getComponent(i)).toBeCloseTo(expected,5));expect(box.min.y).toBeCloseTo(0,6);
    object.traverse(o=>{if(o instanceof Mesh){const normal=o.geometry.getAttribute('normal');for(let i=0;i<normal.count;i++)expect(Number.isFinite(normal.getX(i)+normal.getY(i)+normal.getZ(i))).toBe(true);}});
   }
   expect(triangles(proxy)).toBeLessThan(triangles(production)*.3);expect(triangles(proxy)).toBeGreaterThan(250);footprints.push(getVariant('beanBag',variant).dimensions[1]);
   disposeAssetObject(production);disposeAssetObject(proxy);
  }
  expect(new Set(footprints).size).toBe(3);
 });
 it('models a real4mm PMMA sheet and front-facing editable labels in both modes',()=>{
  for(const mode of ['editor','archviz'] as const)for(let variant=1;variant<=3;variant++){
   const object=createAssetObject('doorPlaque',variant,'eds-lime',mode),label=object.getObjectByName('DoorPlaque_Label') as Mesh;
   expect(label).toBeInstanceOf(Mesh);expect(label.geometry.getAttribute('normal').getZ(0)).toBeCloseTo(1);expect(label.position.y).toBe(0);
   expect(label.position.z).toBeGreaterThan(0);expect(label.geometry.getAttribute('uv').count).toBe(4);
   if(variant===1){let plate:Mesh|undefined;object.traverse(o=>{if(o instanceof Mesh&&(o.material as MeshStandardMaterial).userData.surface==='glass')plate=o;});expect(plate).toBeDefined();expect(bounds(plate!.geometry).getSize(new Vector3()).z).toBeCloseTo(.004,6);expect(new Box3().setFromObject(object).getSize(new Vector3()).z).toBeCloseTo(.034,6);}
   disposeAssetObject(object);
  }
 });
 it('keeps catalogue paint swatches flat with legacy nominal bounds and no duplicate number labels',()=>{
  const asset=getAsset('brandDoorPanel');expect(asset.wallLayer).toBe('background');expect(asset.wallTopClearance).toBe(0);
  for(let variant=1;variant<=3;variant++)for(const mode of ['archviz','editor'] as const){
   const object=createAssetObject(asset.id,variant,'eds-lime',mode);
   const box=new Box3().setFromObject(object);expect(box.min.y+asset.mountHeight!).toBeCloseTo(.07,5);expect(box.max.y+asset.mountHeight!).toBeCloseTo(3.6,5);expect(box.max.z-box.min.z).toBe(0);expect(object.getObjectByName('BrandDoorPanel_Label')).toBeUndefined();expect(object.children).toHaveLength(1);disposeAssetObject(object);
  }
 });
 it('uses corporate RGB values from the supplied SVG and offers absent variant0 for each new asset',()=>{
  expect(CORPORATE_COLORS.map(c=>c.color)).toEqual(['#0B30C1','#A2B8FE','#A0FF3D','#F0F0F0','#000000']);
  const palette=JSON.parse(readFileSync(new URL('../public/assets/brand/palette.json',import.meta.url),'utf8'));
  expect(palette.motifs.slice(1).map((m:{sourceGroup:number})=>m.sourceGroup)).toEqual([3,7,4]);
  for(const id of ['beanBag','doorPlaque','brandDoorPanel','hallDesk'])expect(getAsset(id).variants[0].index).toBe(0);
 });
 it('reuses the corrected source desk triangles without recoloring parts',()=>{
  for(let variant=1;variant<=3;variant++){
   const source=sourceDesks.variants[String(variant) as keyof typeof sourceDesks.variants],object=createAssetObject('hallDesk',variant,'original','editor');
   expect(object.children.length).toBe(source.parts.length);
   for(const [i,part]of source.parts.entries()){
    const mesh=object.children[i] as Mesh,mat=mesh.material as MeshStandardMaterial;
    expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(Array.from(new Float32Array(part.positions)));
    expect(mat.color.r).toBeCloseTo(part.material.color[0],7);expect(mat.color.g).toBeCloseTo(part.material.color[1],7);expect(mat.color.b).toBeCloseTo(part.material.color[2],7);expect(mat.userData.preserveOriginal).toBe(true);
   }
   disposeAssetObject(object);
  }
 });
});
