import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
for(const name of ['space','space-editor']){
 const doc=await io.read(path.join(root,`public/assets/architecture/${name}.glb`));
 await doc.transform(dedup({propertyTypes:['Accessor','Mesh','Texture']}),prune({keepAttributes:true,keepLeaves:true}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
 await io.write(path.join(root,`public/assets/architecture/${name}.meshopt.glb`),doc);
}
console.log('Full real space Meshopt ready');
