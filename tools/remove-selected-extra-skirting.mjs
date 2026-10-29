import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

// Apply the user's explicit Blender deletion to the existing baked exports.
// Only the twelve triangles of that one measured box are removed. Vertex
// attributes, lightmap UVs, materials and all other triangle indices stay intact.
const root=path.resolve(import.meta.dirname,'..');
const sourceName='Wall_42_Skirting_0';
const box={min:[8.71992046,0,2.71686749],max:[8.84991962,.07,3.11312943]};
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hash=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
const reports=[];
for(const name of ['space','space-editor']){
 const file=path.join(root,`public/assets/architecture/${name}.glb`);
 const backup=path.join(root,`test-results/selected-extra-removal/${name}-before.glb`);
 const doc=await io.read(file);let removed=0;
 const attributes=doc.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives().flatMap(primitive=>primitive.listAttributes().map(accessor=>[accessor,hash(accessor.getArray())])));
 for(const node of doc.getRoot().listNodes()){
  if(node.getName()!=='Space_fixtures')continue;
  const mesh=node.getMesh(),matrix=node.getWorldMatrix();
  for(const primitive of mesh.listPrimitives()){
   if(primitive.getMaterial()?.getName()!=='13_SKIRTING_Plain_Mid_Grey')continue;
   const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices(),kept=[];
   const inside=index=>{
    const v=positions.getElement(index,[]);
    const world=[matrix[0]*v[0]+matrix[4]*v[1]+matrix[8]*v[2]+matrix[12],matrix[1]*v[0]+matrix[5]*v[1]+matrix[9]*v[2]+matrix[13],matrix[2]*v[0]+matrix[6]*v[1]+matrix[10]*v[2]+matrix[14]];
    return world.every((value,axis)=>value>=box.min[axis]-.00002&&value<=box.max[axis]+.00002);
   };
   for(let i=0;i<indices.getCount();i+=3){
    const triangle=[0,1,2].map(offset=>indices.getScalar(i+offset));
    if(triangle.every(inside))removed++;else kept.push(...triangle);
   }
   if(kept.length!==indices.getCount()){
    assert.equal(indices.listParents().filter(parent=>parent.propertyType==='Primitive').length,1,'Do not mutate shared indices');
    indices.setArray(new (indices.getArray().constructor)(kept));
   }
  }
  const extras=node.getExtras();
  if(typeof extras.sourceObjects==='string')node.setExtras({...extras,sourceObjects:JSON.stringify(JSON.parse(extras.sourceObjects).filter(value=>value!==sourceName))});
 }
 assert(removed===0||removed===12,`Unexpected target geometry: ${removed} triangles in ${name}`);
 for(const [accessor,before] of attributes)assert.equal(hash(accessor.getArray()),before,'Preserve every vertex attribute, including baked UVs');
 if(removed){await fs.mkdir(path.dirname(backup),{recursive:true});await fs.copyFile(file,backup,fs.constants.COPYFILE_EXCL);await io.write(file,doc);}
 reports.push({name,removedTriangles:removed,allVertexAttributesUnchanged:true,materialsAndLightmapsPreserved:true});
}
await fs.mkdir(path.join(root,'assets-src/analysis'),{recursive:true});
await fs.writeFile(path.join(root,'assets-src/analysis/selected-extra-web-removal.json'),JSON.stringify({sourceObject:sourceName,bounds:box,reports},null,2)+'\n');
console.log(JSON.stringify(reports));
