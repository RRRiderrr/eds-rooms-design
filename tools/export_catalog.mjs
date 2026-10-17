import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { Box3, Vector3 } from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {attachSignagePrints} from './signage/attach_prints.mjs';

// GLTFExporter only needs this browser API to serialize buffer blobs. All model
// geometry is authored locally; no DOM, remote files or third-party artwork.
globalThis.FileReader ??= class FileReader {
  result = null;
  onload = null;
  onloadend = null;
  onerror = null;
  async readAsArrayBuffer(blob) { try { this.result = await blob.arrayBuffer(); this.onload?.({target:this}); this.onloadend?.({target:this}); } catch(error) { this.onerror?.(error); } }
  async readAsDataURL(blob) { try { const data=Buffer.from(await blob.arrayBuffer()); this.result=`data:${blob.type || 'application/octet-stream'};base64,${data.toString('base64')}`; this.onload?.({target:this}); this.onloadend?.({target:this}); } catch(error) { this.onerror?.(error); } }
};

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.join(root,'public','assets');
const onlyArg=process.argv.find(arg=>arg.startsWith('--only='));
const only=onlyArg?new Set(onlyArg.slice(7).split(',').filter(Boolean)):null;
const variantsArg=process.argv.find(arg=>arg.startsWith('--variants='));
const variants=variantsArg?new Set(variantsArg.slice(11).split(',').filter(Boolean)):null;
const proxiesOnly=process.argv.includes('--proxies-only');
await Promise.all(['models','proxies'].map(dir=>mkdir(path.join(destination,dir),{recursive:true})));
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try {
  const {ASSETS}=await server.ssrLoadModule('/src/catalog/catalog.ts');
  const {BUILTIN_PRESETS}=await server.ssrLoadModule('/src/catalog/presets.ts');
  const {createAssetObject,disposeAssetObject}=await server.ssrLoadModule('/src/catalog/geometry.ts');
  const {validateScene}=await server.ssrLoadModule('/src/core/placement.ts');
  const {configureSpace,getPlacementRoom}=await server.ssrLoadModule('/src/core/space.ts');
  configureSpace(JSON.parse(await readFile(path.join(root,'public/assets/architecture/scene-space.json'),'utf8')));
  const exporter=new GLTFExporter();
  let previous;try{previous=JSON.parse(await readFile(path.join(destination,'models','manifest.json'),'utf8'));}catch{previous={assets:[]};}
  const manifest=only||variants||proxiesOnly?previous:{schemaVersion:1,projectId:'polycam-lounge-room',generator:'EDS rooms design / original modular furniture',generatedAt:new Date().toISOString(),units:'metres',upAxis:'Y',assets:[]};
  manifest.generatedAt=new Date().toISOString();
  let totalBytes=0;
  let exported=0;
  for(const asset of ASSETS.filter(a=>!only||only.has(a.id))) for(const variant of asset.variants.filter(v=>v.index>0&&(!variants||variants.has(`${asset.id}:${v.index}`)))) {
    const old=previous.assets.find(e=>e.assetId===asset.id&&e.variant===variant.index);
    const preserveProduction=proxiesOnly||!!old?.sourcePbr||!!old?.productionOverride;
    const entry={...old,assetId:asset.id,variant:variant.index,label:variant.label,category:asset.category,placement:asset.placement,dimensions:variant.dimensions,materials:asset.materials,production:preserveProduction&&old?.production?old.production:`assets/models/${asset.id}-${variant.index}.glb`,proxy:`assets/proxies/${asset.id}-${variant.index}.glb`,quality:preserveProduction&&old?.quality?old.quality:{},bounds:preserveProduction&&old?.bounds?old.bounds:{},bytes:{...(preserveProduction?old?.bytes:{})}};
    for(const mode of preserveProduction?['editor']:['archviz','editor']) {
      const group=createAssetObject(asset.id,variant.index,asset.materials[0].id,mode);
      group.userData={...group.userData,stableAssetId:asset.id,variant:variant.index,productionId:`${asset.id}:${variant.index}`,roomUnits:'metres',placement:asset.placement,dimensions:variant.dimensions,originalAuthoring:true};
      group.updateMatrixWorld(true);
      const box=new Box3().setFromObject(group);
      if(mode==='archviz')entry.bounds={min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new Vector3()).toArray()};
      const binary=await exporter.parseAsync(group,{binary:true,onlyVisible:true,trs:false,includeCustomExtensions:true});
      if(!(binary instanceof ArrayBuffer))throw new Error(`Expected GLB ArrayBuffer for ${asset.id}`);
      const relative=mode==='archviz'?entry.production:entry.proxy;
      let bytes=new Uint8Array(binary);
      if(asset.id==='edsSignage'&&mode==='archviz'){
        const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);const document=await io.readBinary(bytes);
        await attachSignagePrints(document,path.join(root,'public'));bytes=await io.writeBinary(document);
      }
      await writeFile(path.join(root,'public',relative),bytes);
      entry.bytes[mode==='archviz'?'production':'proxy']=bytes.byteLength;
      totalBytes+=bytes.byteLength;
      disposeAssetObject(group);
    }
    // The low preset keeps the same recognisable furniture silhouettes. Texture
    // resolution and render scale are adapted separately from material identity.
    if(!preserveProduction)entry.quality={high:entry.production,medium:entry.production,low:entry.production};
    const existing=manifest.assets.findIndex(e=>e.assetId===entry.assetId&&e.variant===entry.variant);
    if(existing>=0)manifest.assets[existing]=entry;else manifest.assets.push(entry);
    exported++;
  }
  const issues=BUILTIN_PRESETS.flatMap(p=>validateScene(p.objects,getPlacementRoom).map(issue=>({preset:p.presetId,...issue})));
  if(issues.length)throw new Error(`Preset placement validation failed: ${JSON.stringify(issues)}`);
  await writeFile(path.join(destination,'models','manifest.json'),JSON.stringify(manifest,null,2));
  await mkdir(path.join(root,'assets-src','catalog'),{recursive:true});
  await mkdir(path.join(root,'assets-src','concepts'),{recursive:true});
  await writeFile(path.join(root,'assets-src','catalog','catalog.json'),JSON.stringify(ASSETS,null,2));
  await writeFile(path.join(root,'assets-src','concepts','presets.json'),JSON.stringify(BUILTIN_PRESETS,null,2));
  await writeFile(path.join(root,'assets-src','concepts','layout-validation.json'),JSON.stringify({schemaVersion:1,checkedAt:new Date().toISOString(),presets:BUILTIN_PRESETS.map(p=>({id:p.presetId,name:p.name,objects:p.objects.length,valid:true})),issues},null,2));
  console.log(`Processed ${exported} catalog variants (${(totalBytes/1024/1024).toFixed(2)} MiB written). Imported PBR production overrides are preserved. All ${BUILTIN_PRESETS.length} room configurations passed placement validation.`);
} finally {await server.close();}
