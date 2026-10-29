import {describe,it,expect} from 'vitest';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {fileURLToPath} from 'node:url';
import {Box3,Matrix4,Vector3} from 'three';
import {createSourceDesk} from '../src/catalog/source-desks';
import {disposeAssetObject} from '../src/catalog/geometry';

interface Part {name:string;box:Box3;}
function check(parts:Part[]){
 const top=parts.find(p=>/White_(?:Rectangular_)?Top/.test(p.name));
 const frame=parts.find(p=>/Black_(?:U|Steel)_Frame/.test(p.name));
 expect(top).toBeDefined();expect(frame).toBeDefined();
 expect(top!.box.max.y).toBeCloseTo(.75,5);
 expect(top!.box.min.y).toBeCloseTo(.725,5);
 expect(frame!.box.min.y).toBeCloseTo(0,5);
 // A black support cannot protrude through the 25 mm white top. The only
 // formerly visible black objects were the superfluous raised cable caps.
 expect(frame!.box.max.y).toBeLessThanOrEqual(top!.box.min.y+.00002);
 expect(parts.some(p=>/Cable_Grommet/.test(p.name))).toBe(false);
 for(const part of parts.filter(p=>p!==top))expect(part.box.max.y).toBeLessThanOrEqual(top!.box.min.y+.00002);
}

describe('Continuous source hall desk surfaces',()=>{
 it('keeps all three synchronous Editor desks white and all supports beneath their tops',()=>{
  for(const variant of [1,2,3]){
   const object=createSourceDesk(variant,true);
   check(object.children.map(child=>({name:child.name,box:new Box3().setFromObject(child)})));
   expect(new Box3().setFromObject(object).getSize(new Vector3()).y).toBeCloseTo(.75,5);
   disposeAssetObject(object);
  }
 });
 it('verifies the actual production and proxy GLBs have no raised black cap or penetrating frame',async()=>{
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  for(const role of ['models','proxies'])for(const variant of [1,2,3]){
   const document=await io.read(fileURLToPath(new URL(`../public/assets/${role}/hallDesk-${variant}.glb`,import.meta.url)));
   const parts:Part[]=[];
   for(const node of document.getRoot().listNodes())if(node.getMesh()){
    const box=new Box3(),matrix=new Matrix4().fromArray(node.getWorldMatrix());
    for(const primitive of node.getMesh()!.listPrimitives()){
     const position=primitive.getAttribute('POSITION')!;
     const values:number[]=[];
     for(let i=0;i<position.getCount();i++){position.getElement(i,values);box.expandByPoint(new Vector3(values[0],values[1],values[2]).applyMatrix4(matrix));}
    }
    parts.push({name:node.getName(),box});
   }
   check(parts);
  }
 });
});
