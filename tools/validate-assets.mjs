import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest=JSON.parse(await fs.readFile(path.join(root,'public/assets/materials/manifest.json'),'utf8'));
const failures=[], textures=[];
for(const material of manifest.materials) {
  const tile=Array.isArray(material.tileMeters)?material.tileMeters:[material.tileMeters,material.tileMeters];
  if(!material.id||!material.source||!material.license||tile.length!==2||!tile.every(v=>Number.isFinite(v)&&v>0)) failures.push(`${material.id}: invalid source metadata`);
  for(const [quality,maps] of Object.entries(material.qualities)) for(const role of ['baseColor','normal','orm']) {
    const filename=maps[role];
    if(!filename.startsWith('assets/')||filename.includes('..')) failures.push(`Unsafe/non-static path ${filename}`);
    const bytes=await fs.readFile(path.join(root,'public',filename));
    const signature=bytes.subarray(0,12).toString('hex');
    const width=bytes.readUInt32LE(20),height=bytes.readUInt32LE(24),levels=bytes.readUInt32LE(40);
    const dfd=bytes.readUInt32LE(48),transfer=bytes[dfd+14];
    if(signature!=='ab4b5458203230bb0d0a1a0a') failures.push(`${filename}: not KTX2`);
    if(width!==maps.size||height!==maps.size||levels!==Math.floor(Math.log2(maps.size))+1) failures.push(`${filename}: wrong dimensions or mip pyramid`);
    if(transfer!==(role==='baseColor'?2:1)) failures.push(`${filename}: incorrect colour-space transfer ${transfer}`);
    const fallback=maps.fallback?.[role];
    if(!fallback) failures.push(`${filename}: missing compatible image fallback`);
    else await fs.access(path.join(root,'public',fallback));
    textures.push({material:material.id,quality,role,width,height,levels,transfer,bytes:bytes.length});
  }
}
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const geometry=[];
for(const filename of ['room.meshopt.glb','room-editor.meshopt.glb']) {
  const file=path.join(root,'public/assets/architecture',filename);
  const doc=await io.read(file),nodes=doc.getRoot().listNodes();
  const hasDoor=nodes.some(n=>/Door.*Leaf/i.test(n.getName()) || n.getExtras().door_leaf===true);
  if(!hasDoor) failures.push(`${filename}: interactive door leaf node missing`);
  geometry.push({filename,bytes:(await fs.stat(file)).size,nodes:nodes.length,hasDoor});
}
const report={passed:!failures.length,materials:manifest.materials.length,textures,geometry,failures};
await fs.writeFile(path.join(root,'assets-src/materials/validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,materials:report.materials,textures:textures.length,geometry,failures},null,2));
if(failures.length) process.exitCode=1;
