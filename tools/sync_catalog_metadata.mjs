import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try{
 const {ASSETS}=await server.ssrLoadModule('/src/catalog/catalog.ts');
 const {BUILTIN_PRESETS}=await server.ssrLoadModule('/src/catalog/presets.ts');
 await writeFile(path.join(root,'assets-src/catalog/catalog.json'),JSON.stringify(ASSETS,null,2));
 await writeFile(path.join(root,'assets-src/concepts/presets.json'),JSON.stringify(BUILTIN_PRESETS,null,2));
 const file=path.join(root,'public/assets/models/manifest.json'),manifest=JSON.parse(await readFile(file,'utf8'));
 for(const entry of manifest.assets){const asset=ASSETS.find(a=>a.id===entry.assetId);if(!asset)continue;entry.label=asset.variants.find(v=>v.index===entry.variant)?.label??entry.label;entry.materials=asset.materials;}
 manifest.generator='EDS rooms design — original modular furniture';await writeFile(file,JSON.stringify(manifest,null,2));
 console.log('Updated catalogue labels and preset metadata without changing optimized GLBs.');
}finally{await server.close();}
