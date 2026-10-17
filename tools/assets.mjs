/** Reproducible offline-after-first-run material + Meshopt production pipeline. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceRoot = path.join(root, 'assets-src/materials');
const resourceRoot = process.env.ARCHVIZ_RESOURCES || (process.platform === 'win32' && await exists('E:/ArchViz_Resources') ? 'E:/ArchViz_Resources' : null);
const materialCache = resourceRoot ? path.join(resourceRoot, 'RoomAtelier/materials') : sourceRoot;
const publicRoot = path.join(root, 'public/assets');
const config = JSON.parse(await fs.readFile(path.join(sourceRoot, 'sources.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const qualitySizes = { low: 512, medium: 1024, high: 2048 };
const headers = { 'User-Agent': 'Room-Atelier-ArchViz-local-asset-pipeline/1.0', Referer: 'https://room-atelier.local/' };
await fs.mkdir(path.join(publicRoot, 'materials'), { recursive: true });

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
async function json(p, value) { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(value, null, 2)); }
async function fetchCached(url, output) {
  if (await exists(output)) return output;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength > 64 * 1024 * 1024) throw new Error(`Source too large: ${url}`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, data);
  return output;
}

const localFabric = 'E:/Megascans Library/Downloaded/surface/fabric_furniture fabric_sjfvce3c';
if (await exists(`${localFabric}/sjfvce3c_2K_Albedo.jpg`)) {
  const fabric = config.materials.find(m => m.id === 'fabric-woven');
  fabric.files = { baseColor: `${localFabric}/sjfvce3c_2K_Albedo.jpg`, normal: `${localFabric}/sjfvce3c_2K_Normal.jpg`, roughness: `${localFabric}/sjfvce3c_2K_Roughness.jpg` };
  fabric.sourceLabel = 'Local user-provided Quixel Megascans Furniture Fabric sjfvce3c';
  fabric.license = 'User-authorized local Megascans resource; acquisition license is not encoded in downloaded metadata';
  fabric.licenseEvidence = 'User explicitly authorized use of the existing local library for this project. No claim of Fab Standard entitlement is made.';
  fabric.tileMeters = 1;
  fabric.note = 'Original 2K source is kept on the E resource drive; assets-src holds provenance only. Metadata does not state UE-only. Check acquisition entitlement before publicly distributing this material; offline CC0 fabric fallback can be enabled by removing the local override.';
}
const overridePath = path.join(sourceRoot, 'overrides.json');
if (await exists(overridePath)) {
  const overrides = JSON.parse(await fs.readFile(overridePath, 'utf8'));
  for (const override of overrides.materials ?? []) {
    if (!override.license || !override.licenseEvidence) throw new Error(`Material ${override.id}: license and licenseEvidence are required.`);
    const material = config.materials.find(m => m.id === override.id);
    if (!material) throw new Error(`Unknown material override: ${override.id}`);
    Object.assign(material, override);
  }
}

async function materialSources(material) {
  const sourceIdentity = JSON.stringify({files:material.files,source:material.sourceLabel,polyhaven:material.polyhaven,procedural:material.procedural});
  const sourceKey=createHash('sha256').update(sourceIdentity).digest('hex').slice(0,12);
  const dir = path.join(materialCache, material.id, 'original',sourceKey);
  await fs.mkdir(dir, { recursive: true });
  if (material.files) {
    const files = {};
    for (const [role, source] of Object.entries(material.files)) {
      const absolute = path.isAbsolute(source) ? source : path.join(root, source);
      const output = path.join(dir, `${role}${path.extname(source)}`);
      await fs.copyFile(absolute, output);
      files[role] = output;
    }
    return { files, source: material.sourceLabel, license: material.license, licenseEvidence: material.licenseEvidence };
  }
  if (material.procedural) return { files: await powderCoat(dir), source: 'Original Room Atelier deterministic powder-coat PBR material', license: 'Project original / CC0', url: null };
  const apiPath = path.join(dir, 'polyhaven-files.json');
  const infoPath = path.join(dir, 'polyhaven-info.json');
  await fetchCached(`https://api.polyhaven.com/files/${material.polyhaven}`, apiPath);
  await fetchCached(`https://api.polyhaven.com/info/${material.polyhaven}`, infoPath);
  const metadata = JSON.parse(await fs.readFile(apiPath, 'utf8'));
  const files = {};
  for (const [role, names] of Object.entries({ baseColor: ['Diffuse', 'diff', 'diffuse'], normal: ['nor_gl'], orm: ['arm'] })) {
    const key = names.find(n => metadata[n]);
    const variants = metadata[key]?.['2k'] ?? metadata[key]?.['1k'];
    const entry = variants?.jpg ?? variants?.png;
    if (!entry) throw new Error(`${material.polyhaven} missing ${role}`);
    const output = path.join(dir, `${role}${path.extname(new URL(entry.url).pathname)}`);
    await fetchCached(entry.url, output);
    const bytes = await fs.readFile(output);
    if (entry.md5 && createHash('md5').update(bytes).digest('hex') !== entry.md5) throw new Error(`Checksum mismatch: ${entry.url}`);
    files[role] = output;
  }
  return { files, source: `Poly Haven / ${material.polyhaven}`, license: 'CC0-1.0', url: `https://polyhaven.com/a/${material.polyhaven}` };
}

async function powderCoat(dir) {
  const size = 1024;
  const albedo = Buffer.alloc(size * size * 3), normal = Buffer.alloc(size * size * 3), orm = Buffer.alloc(size * size * 3);
  let seed = 9341527;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const n = (seed >>> 24) / 255;
    albedo[i*3] = 40 + Math.round(n * 3); albedo[i*3+1] = 46 + Math.round(n * 3); albedo[i*3+2] = 51 + Math.round(n * 3);
    normal[i*3] = 127 + Math.round((n-.5)*8); normal[i*3+1] = 127 + Math.round((n-.5)*8); normal[i*3+2] = 255;
    orm[i*3] = 255; orm[i*3+1] = 135 + Math.round(n * 12); orm[i*3+2] = 20;
  }
  const files = {};
  for (const [role, data] of Object.entries({ baseColor: albedo, normal, orm })) {
    const output = path.join(dir, `${role}.png`);
    await sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toFile(output);
    files[role] = output;
  }
  return files;
}

const imageDecoder = async (input) => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
async function prepareImage(material, files, role, size) {
  if (role === 'orm' && !files.orm) {
    const [ao, rough, metal] = await Promise.all([
      files.ao ? sharp(files.ao).resize(size,size).greyscale().raw().toBuffer() : Buffer.alloc(size*size,255),
      files.roughness ? sharp(files.roughness).resize(size,size).greyscale().raw().toBuffer() : Buffer.alloc(size*size,Math.round(material.roughness*255)),
      files.metalness ? sharp(files.metalness).resize(size,size).greyscale().raw().toBuffer() : Buffer.alloc(size*size,Math.round(material.metalness*255))
    ]);
    const rgb = Buffer.alloc(size*size*3);
    for (let i=0; i<size*size; i++) {
      rgb[i*3]=material.finish?Math.round(255-(255-ao[i])*.2):ao[i];
      rgb[i*3+1]=material.finish?Math.max(0,Math.min(255,Math.round(material.roughness*255+(rough[i]-128)*.12))):rough[i];
      rgb[i*3+2]=material.finish?Math.round(material.metalness*255):metal[i];
    }
    return sharp(rgb,{ raw:{ width:size,height:size,channels:3 } }).png().toBuffer();
  }
  let pipeline = sharp(files[role]).resize(size,size,{ fit:'fill', kernel:'lanczos3' }).removeAlpha();
  if(role==='normal' && material.normalConvention==='directx') pipeline=pipeline.linear([1,-1,1],[0,255,0]);
  if(role==='orm' && material.finish) {
    const {data,info}=await pipeline.toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
    for(let i=0;i<data.length;i+=info.channels) {
      data[i]=Math.round(255-(255-data[i])*.2);
      data[i+1]=Math.max(0,Math.min(255,Math.round(material.roughness*255+(data[i+1]-128)*.12)));
      data[i+2]=Math.round(material.metalness*255);
    }
    return sharp(data,{raw:{width:size,height:size,channels:info.channels}}).png().toBuffer();
  }
  if(role==='baseColor' && material.finish) {
    const {data,info}=await pipeline.toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
    let mean=0;
    for(let i=0;i<data.length;i+=info.channels) mean+=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
    mean/=size*size;
    const target=material.finish.target;
    for(let i=0;i<data.length;i+=info.channels) {
      const luminance=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
      const detail=(luminance-mean)*material.finish.variation;
      for(let c=0;c<3;c++) data[i+c]=Math.max(0,Math.min(255,Math.round(target[c]+detail)));
    }
    return sharp(data,{raw:{width:size,height:size,channels:info.channels}}).png().toBuffer();
  }
  if (role === 'baseColor' && material.neutralize) pipeline = pipeline.greyscale().toColourspace('srgb').normalise({ lower: 1, upper:99 }).linear(0.35,155);
  return pipeline.png().toBuffer();
}

async function buildMaterials() {
  const only=process.argv.find(a=>a.startsWith('--only-material='))?.slice(16).split(',');
  const previousPath=path.join(publicRoot,'materials/manifest.json');
  const previous=only&&await exists(previousPath)?JSON.parse(await fs.readFile(previousPath,'utf8')):{materials:[]};
  const manifest = { schemaVersion:1, generatedAt:new Date().toISOString(), architectureMapping:config.architectureMapping, colorSpaces:{baseColor:'sRGB',normal:'linear',orm:'linear'}, ormPacking:{r:'ambient occlusion',g:'roughness',b:'metalness'}, materials:previous.materials };
  const cachePaths={resourceRoot:materialCache,processed:{}};
  for (const material of config.materials.filter(m=>!only||only.includes(m.id))) {
    console.log(`Material ${material.id}: preparing source`);
    const source = await materialSources(material);
    const entry = { ...material, ...source, qualities:{}, uvUnits:'meters' };
    delete entry.files; delete entry.polyhaven; delete entry.procedural;
    for (const [quality,size] of Object.entries(qualitySizes)) {
      const outputDir = path.join(publicRoot,'materials',material.id,quality);
      const intermediate = path.join(materialCache, material.id, 'processed',quality);
      await fs.mkdir(outputDir,{recursive:true}); await fs.mkdir(intermediate,{recursive:true});
      const maps = { size, estimatedGpuBytes:Math.round(size*size*3*4/3), fallback:{} };
      for (const role of ['baseColor','normal','orm']) {
        const png = await prepareImage(material,source.files,role,size);
        const isUASTC=role==='normal'||material.id==='wall-painted';
        const digest=createHash('sha256').update(png).update(isUASTC?'encoder-v4-uastc-walls':'encoder-v3-ormetc1s-webpdata').digest('hex');
        const processed=path.join(intermediate,`${role}.png`);
        const output=path.join(outputDir,`${role}.ktx2`);
        const hashPath=path.join(intermediate,`${role}.sha256`);
        const previous=await exists(hashPath)?(await fs.readFile(hashPath,'utf8')):'';
        if (!await exists(output) || previous!==digest || args.has('--force')) {
          await fs.writeFile(processed,png);
          const data = await encodeToKTX2(new Uint8Array(png),{
            imageDecoder, isUASTC, qualityLevel:220, compressionLevel:1,
            uastcLDRQualityLevel:material.id==='wall-painted'?3:1, enableRDO:false, needSupercompression:true,
            generateMipmap:true, isNormalMap:role==='normal',
            isPerceptual:role==='baseColor', isSetKTX2SRGBTransferFunc:role==='baseColor',
            kvData:{source:String(source.source),license:String(source.license),role,tileMeters:String(material.tileMeters)}
          });
          await fs.writeFile(output,data); await fs.writeFile(hashPath,digest);
        }
        const fallbackName = `${role}.webp`;
        const fallbackOutput = path.join(outputDir,fallbackName);
        if (!await exists(fallbackOutput) || previous!==digest || args.has('--force')) {
          let image=sharp(png); image=image.webp({quality:role==='baseColor'?85:97,nearLossless:role!=='baseColor',smartSubsample:false});
          await image.toFile(fallbackOutput);
        }
        // Migrate only known generated legacy fallback files out of the production tree.
        const legacyPng=path.join(outputDir,`${role}.png`);
        if(await exists(legacyPng)) await fs.rename(legacyPng,path.join(intermediate,`${role}.legacy-fallback.png`));
        maps[role]=`assets/materials/${material.id}/${quality}/${role}.ktx2`;
        maps.fallback[role]=`assets/materials/${material.id}/${quality}/${fallbackName}`;
      }
      entry.qualities[quality]=maps;
      console.log(`  ${quality} ${size}px ✓`);
    }
    const index=manifest.materials.findIndex(m=>m.id===entry.id);
    if(index>=0)manifest.materials[index]=entry;else manifest.materials.push(entry);
    cachePaths.processed[material.id]=path.join(materialCache,material.id,'processed');
    await json(path.join(sourceRoot,material.id,'provenance.json'),{...source,files:Object.fromEntries(Object.entries(source.files).map(([k,v])=>[k,path.relative(root,v).replaceAll('\\','/')])),tileMeters:material.tileMeters,note:material.note??null});
  }
  await json(path.join(publicRoot,'materials/manifest.json'),manifest);
  await json(path.join(sourceRoot,'material-cache.json'),cachePaths);
  return manifest;
}

async function copyDecoders() {
  const destination=path.join(publicRoot,'decoders/basis');
  await fs.mkdir(destination,{recursive:true});
  for (const name of ['basis_transcoder.js','basis_transcoder.wasm']) await fs.copyFile(path.join(root,'node_modules/three/examples/jsm/libs/basis',name),path.join(destination,name));
  const license=path.join(root,'node_modules/three/examples/jsm/libs/basis/README.md');
  if(await exists(license)) await fs.copyFile(license,path.join(destination,'README.md'));
}

async function optimizeGeometry() {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
  const inputDir=path.join(root,'assets-src/exports');
  const productionDir=path.join(publicRoot,'architecture');
  const inputs=await exists(inputDir)?(await fs.readdir(inputDir)).filter(n=>n.endsWith('.glb')):[];
  if(await exists(productionDir)) {
    for(const name of (await fs.readdir(productionDir)).filter(n=>n.endsWith('.glb')&&!n.endsWith('.meshopt.glb'))) {
      const current=path.join(productionDir,name),saved=path.join(inputDir,name);
      if(!await exists(saved)||(await fs.stat(current)).mtimeMs>(await fs.stat(saved)).mtimeMs) {
        await fs.mkdir(inputDir,{recursive:true}); await fs.copyFile(current,saved);
      }
      if(!inputs.includes(name)) inputs.push(name);
    }
  }
  const report=[];
  for(const name of inputs) {
    const input=path.join(inputDir,name),output=path.join(productionDir,name.replace('.glb','.meshopt.glb'));
    const document=await io.read(input);
    // Keep node names, scene graph, hinge pivots, UV0 metres and UV1 atlas intact.
    await document.transform(dedup(),prune({keepAttributes:true,keepLeaves:true}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
    await io.write(output,document);
    report.push({input:path.relative(root,input),output:path.relative(root,output),bytesBefore:(await fs.stat(input)).size,bytesAfter:(await fs.stat(output)).size});
  }
  await json(path.join(sourceRoot,'geometry-report.json'),report);
  console.log(`Meshopt: ${report.length} architecture exports optimized`);
}

async function optimizeCatalogue() {
  const manifestPath=path.join(publicRoot,'models/manifest.json');
  if(!await exists(manifestPath)) return;
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  const statePath=path.join(sourceRoot,'catalogue-encoding-state.json');
  const previous=await exists(statePath)?JSON.parse(await fs.readFile(statePath,'utf8')):{};
  const report=[];
  for(const asset of manifest.assets) for(const role of ['production','proxy']) {
    const relative=asset[role];
    if(typeof relative!=='string'||!relative.startsWith('assets/')||relative.includes('..')) throw new Error('Invalid catalogue export path');
    const output=path.join(root,'public',relative);
    const original=path.join(root,'assets-src/exports/catalogue',relative);
    const current=await fs.readFile(output),currentHash=createHash('sha256').update(current).digest('hex');
    if(previous[relative]?.outputHash!==currentHash||!await exists(original)) {
      await fs.mkdir(path.dirname(original),{recursive:true}); await fs.writeFile(original,current);
    }
    const document=await io.read(original);
    // Keep distinct material extras (surface role / curated colour) intact.
    await document.transform(dedup({propertyTypes:['Accessor','Mesh','Texture']}),prune({keepAttributes:true,keepLeaves:true}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
    await io.write(output,document);
    const encoded=await fs.readFile(output);
    previous[relative]={outputHash:createHash('sha256').update(encoded).digest('hex')};
    asset.bytes??={}; asset.bytes[role]=encoded.length;
    report.push({assetId:asset.assetId,variant:asset.variant,role,bytesBefore:(await fs.stat(original)).size,bytesAfter:encoded.length});
  }
  await json(manifestPath,manifest); await json(statePath,previous);
  await json(path.join(sourceRoot,'catalogue-geometry-report.json'),report);
  console.log(`Meshopt: ${report.length} catalogue GLB exports optimized in place`);
}

if(!args.has('--geometry-only')&&!args.has('--decoders-only')&&!args.has('--catalogue-only')) await buildMaterials();
await copyDecoders();
if(!args.has('--materials-only')&&!args.has('--decoders-only')&&!args.has('--catalogue-only')) await optimizeGeometry();
if(!args.has('--materials-only')&&!args.has('--decoders-only')) await optimizeCatalogue();
console.log('Assets ready. All URLs are relative to Vite BASE_URL; production needs only static HTTP.');
