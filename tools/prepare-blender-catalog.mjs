import fs from 'node:fs/promises';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dequantize} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
const root=path.resolve(import.meta.dirname,'..');
const resources=process.env.ARCHVIZ_RESOURCES??'E:/ArchViz_Resources';
const output=path.join(resources,'exports/catalog-blender');await fs.mkdir(output,{recursive:true});
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const manifest=JSON.parse(await fs.readFile(path.join(root,'public/assets/models/manifest.json'),'utf8'));const mapping={};
for(const entry of manifest.assets){
 const key=`${entry.assetId}-${entry.variant}`;let source=path.join(root,'public',entry.production);
 if(entry.sourcePbr)source=path.join(resources,'RoomAtelier/real-models',`${key}.normalized.glb`);
 const document=await io.read(source);await document.transform(dequantize());
 for(const extension of [...document.getRoot().listExtensionsUsed()])if(extension.extensionName==='EXT_meshopt_compression')extension.dispose();
 const target=path.join(output,`${key}.glb`);await io.write(target,document);mapping[key]=target;
}
await fs.writeFile(path.join(root,'assets-src/catalog/blender-sources.json'),JSON.stringify(mapping,null,2));
console.log(`Prepared ${Object.keys(mapping).length} editable Blender assets on ${output}`);
