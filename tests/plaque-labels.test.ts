import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {createAssetObject,disposeAssetObject} from '../src/catalog/geometry';
import {getAsset} from '../src/catalog/catalog';
import {setCanvasPrintUv} from '../src/graphics/plaque-labels';

function expectUpright(geometry:THREE.BufferGeometry){
 const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
 geometry.computeBoundingBox();const b=geometry.boundingBox!;
 for(let i=0;i<p.count;i++){
  expect(uv.getX(i)).toBeCloseTo((p.getX(i)-b.min.x)/(b.max.x-b.min.x),5);
  expect(uv.getY(i)).toBeCloseTo((p.getY(i)-b.min.y)/(b.max.y-b.min.y),5);
 }
}
describe('Dynamic plaque print orientation',()=>{
 it('keeps upright XY UVs for every authored Editor plaque variant',()=>{
  for(let variant=1;variant<=3;variant++){
   const object=createAssetObject('doorPlaque',variant,getAsset('doorPlaque').materials[0].id,'editor');
   const label=object.getObjectByName('DoorPlaque_Label') as THREE.Mesh;
   setCanvasPrintUv(label.geometry);expectUpright(label.geometry);
   const initial=Array.from(label.geometry.getAttribute('uv').array);
   setCanvasPrintUv(label.geometry);expect(Array.from(label.geometry.getAttribute('uv').array)).toEqual(initial);
   disposeAssetObject(object);
  }
 });
 it('corrects actual quantized production glTF top-origin UVs without mutating source data',async()=>{
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  for(let variant=1;variant<=3;variant++){
   const document=await io.read(new URL(`../public/assets/models/doorPlaque-${variant}.glb`,import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
   const node=document.getRoot().listNodes().find(n=>n.getName()==='DoorPlaque_Label')!;
   const primitive=node.getMesh()!.listPrimitives()[0],p=primitive.getAttribute('POSITION')!,sourceUV=primitive.getAttribute('TEXCOORD_0')!;
   expect(primitive.getExtras().signagePrintUVTopOrigin).toBe(true);
   const before=Array.from(sourceUV.getArray()!),geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.BufferAttribute(p.getArray()! as THREE.TypedArray,3,p.getNormalized()));
   geometry.setAttribute('uv',new THREE.BufferAttribute(sourceUV.getArray()! as THREE.TypedArray,2,sourceUV.getNormalized()));
   setCanvasPrintUv(geometry);expectUpright(geometry);
   expect(Array.from(sourceUV.getArray()!)).toEqual(before);
   geometry.dispose();
  }
 });
});
