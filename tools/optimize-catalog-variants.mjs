import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.argv.find(a=>a.startsWith('--variants='));if(!requested)throw new Error('Provide explicit --variants=asset:index,... to keep unrelated production sources untouched.');
const keys=new Set(requested.slice(11).split(',')),file=path.join(root,'public/assets/models/manifest.json');
const initial=JSON.parse(await readFile(file,'utf8'));await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder}),report=[];
for(const entry of initial.assets.filter(e=>keys.has(`${e.assetId}:${e.variant}`))){
 if(entry.sourcePbr||entry.productionOverride)throw new Error(`Imported production override ${entry.assetId}:${entry.variant} is protected.`);
 const bytes={};for(const role of ['production','proxy']){
  const relative=entry[role];if(!relative.startsWith('assets/')||relative.includes('..'))throw new Error('Invalid output path');const absolute=path.join(root,'public',relative),source=await readFile(absolute);
  const backup=path.join(root,'assets-src/exports/catalogue',relative);await mkdir(path.dirname(backup),{recursive:true});await writeFile(backup,source);
  const doc=await io.read(absolute);await doc.transform(dedup({propertyTypes:['Accessor','Mesh','Texture']}),weld(),prune({keepAttributes:true,keepLeaves:true}),meshopt({encoder:MeshoptEncoder,level:'medium'}));await io.write(absolute,doc);bytes[role]=(await readFile(absolute)).byteLength;
 }
 report.push({assetId:entry.assetId,variant:entry.variant,bytes});
}
// Merge into the latest manifest instead of writing an earlier catalogue copy.
const latest=JSON.parse(await readFile(file,'utf8'));for(const update of report){const entry=latest.assets.find(e=>e.assetId===update.assetId&&e.variant===update.variant);if(entry)entry.bytes={...entry.bytes,...update.bytes};}await writeFile(file,JSON.stringify(latest,null,2));
await mkdir(path.join(root,'assets-src/catalog'),{recursive:true});await writeFile(path.join(root,'assets-src/catalog/variant-update-report.json'),JSON.stringify({schemaVersion:1,updatedAt:new Date().toISOString(),assets:report},null,2));console.log(`Meshopt optimized ${report.length} selected variants without changing other assets.`);
