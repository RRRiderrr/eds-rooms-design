/** Normalize legally obtained source furniture/plants without distorting their proportions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, KHRTextureBasisu} from '@gltf-transform/extensions';
import {cloneDocument, dedup, getBounds, meshopt, prune, simplify, textureCompress, weld} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import {encodeToKTX2} from 'ktx2-encoder';
import sharp from 'sharp';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resourceRoot=process.env.ARCHVIZ_RESOURCES || 'E:/ArchViz_Resources';
const cache=path.join(resourceRoot,'RoomAtelier/real-models');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
await MeshoptEncoder.ready;await MeshoptDecoder.ready;await MeshoptSimplifier.ready;
await fs.mkdir(cache,{recursive:true});
const specifications=[
 {assetId:'armchair',variant:2,sourceId:'modern_arm_chair_01',scale:.9,label:'Дубове лаунж-крісло з м’якою оббивкою',finish:'pillow',defaultFinish:'oat',surface:'fabric'},
 {assetId:'plant',variant:1,sourceId:'potted_plant_01',maxFootprint:[.58,.58],label:'Листяна рослина у керамічному кашпо',finish:'pot',defaultFinish:'white',surface:'ceramic'},
 {assetId:'plant',variant:3,sourceId:'potted_plant_01',maxFootprint:[.36,.36],label:'Компактна листяна рослина у кашпо',finish:'pot',defaultFinish:'white',surface:'ceramic'},
 {assetId:'plant',variant:2,sourceId:'potted_plant_02',maxFootprint:[.65,.65],label:'Широколиста рослина у кашпо',finish:'pot',defaultFinish:'white',surface:'ceramic'},
 {assetId:'chair',variant:2,sourceId:'dining_chair_02',maxFootprint:[.51,.54],label:'Стілець з м’якою високою спинкою',finish:'dining_chair',defaultFinish:'oat',surface:'fabric'},
];
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const tiers=process.argv.find(arg=>arg.startsWith('--tiers='))?.slice(8).split(',')??['medium','low','high'];
const sizes={low:512,medium:1024,high:2048};
// Separate geometry LODs retain the source proportions, atlas UVs and cutout foliage.
// Plant scans contain dense pot/soil surfaces; reducing only their texture size is insufficient.
const lods={
 plant:{low:{ratio:.055,error:.015},medium:{ratio:.12,error:.009},high:{ratio:.33,error:.004}},
 armchair:{low:{ratio:.45,error:.002},medium:{ratio:.8,error:.0004},high:null},
 chair:{low:{ratio:.25,error:.003},medium:{ratio:.55,error:.001},high:null},
};
const triangles=document=>document.getRoot().listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
async function geometryLod(document,spec,quality){const options=lods[spec.assetId]?.[quality];if(options)await document.transform(weld(),simplify({simplifier:MeshoptSimplifier,...options}));return triangles(document);}
const imageDecoder=async bytes=>{const{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});return{data:new Uint8Array(data),width:info.width,height:info.height};};
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
function textureRoles(document){const result=new Map();for(const m of document.getRoot().listMaterials())for(const[role,texture]of [['baseColor',m.getBaseColorTexture()],['normal',m.getNormalTexture()],['orm',m.getMetallicRoughnessTexture()],['orm',m.getOcclusionTexture()]])if(texture)result.set(texture,role);return result;}
async function neutralize(texture){const image=texture?.getImage();if(!image)return;const{data,info}=await sharp(image).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});let mean=0;for(let i=0;i<data.length;i+=3)mean+=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;mean/=info.width*info.height;for(let i=0;i<data.length;i+=3){const y=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;const v=Math.max(90,Math.min(245,Math.round(205+(y-mean)*.55)));data[i]=data[i+1]=data[i+2]=v;}texture.setImage(await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).png().toBuffer()).setMimeType('image/png');}
async function encode(document,size){for(const[texture,role]of textureRoles(document)){const bytes=await sharp(texture.getImage()).resize(size,size,{fit:'inside',withoutEnlargement:true}).png().toBuffer();const encoded=await encodeToKTX2(new Uint8Array(bytes),{imageDecoder,isUASTC:role==='normal',qualityLevel:220,compressionLevel:1,uastcLDRQualityLevel:1,enableRDO:false,needSupercompression:true,generateMipmap:true,isNormalMap:role==='normal',isPerceptual:role==='baseColor',isSetKTX2SRGBTransferFunc:role==='baseColor'});texture.setImage(encoded).setMimeType('image/ktx2');}document.createExtension(KHRTextureBasisu).setRequired(true);}
const records=[];
for(const spec of specifications.filter(s=>!only||only.includes(`${s.assetId}-${s.variant}`))){
 const key=`${spec.assetId}-${spec.variant}`,sourceDirectory=path.join(resourceRoot,'PolyHaven',spec.sourceId);
 const document=await io.read(path.join(sourceDirectory,`${spec.sourceId}.gltf`));
 const scene=document.getRoot().listScenes()[0],bounds=getBounds(scene),size=bounds.max.map((v,i)=>v-bounds.min[i]);
 const scale=spec.scale??Math.min(spec.maxFootprint[0]/size[0],spec.maxFootprint[1]/size[2]);
 const center=[(bounds.min[0]+bounds.max[0])/2,bounds.min[1],(bounds.min[2]+bounds.max[2])/2];
 const normalizer=document.createNode(`${key}:source-normalization`).setScale([scale,scale,scale]).setTranslation(center.map(v=>-v*scale));
 for(const node of [...scene.listChildren()]){scene.removeChild(node);normalizer.addChild(node);}scene.addChild(normalizer);
 const dimensions=size.map(v=>v*scale);
 normalizer.setExtras({assetId:spec.assetId,variant:spec.variant,stableAssetId:spec.assetId,productionId:`${spec.assetId}:${spec.variant}`,roomUnits:'metres',placement:'floor',dimensions,sourcePbr:true,originalAuthoring:false,source:`Poly Haven / ${spec.sourceId}`,license:'CC0-1.0',sourceUrl:`https://polyhaven.com/a/${spec.sourceId}`});
 for(const material of document.getRoot().listMaterials()){
  const name=material.getName(),leaf=/leaves/i.test(name),finish=name.includes(spec.finish);
  if(leaf){const color=material.getBaseColorTexture();const alphaPath=path.join(sourceDirectory,'textures/leaves_alpha.png');if(!await exists(alphaPath))throw new Error(`${key}: alpha source missing`);const metadata=await sharp(color.getImage()).metadata();const alpha=await sharp(alphaPath).resize(metadata.width,metadata.height).greyscale().raw().toBuffer();const rgba=await sharp(color.getImage()).removeAlpha().joinChannel(alpha,{raw:{width:metadata.width,height:metadata.height,channels:1}}).png().toBuffer();color.setImage(rgba).setMimeType('image/png');material.setAlphaMode('MASK').setAlphaCutoff(.42).setDoubleSided(true);}
  if(finish&&!leaf)await neutralize(material.getBaseColorTexture());
  material.setExtras({sourcePbr:true,tintable:finish&&!leaf,surface:leaf?'leaf':finish?spec.surface:/legs|wood/i.test(name)?'wood':'ceramic',colorVariant:finish?spec.defaultFinish:leaf?'natural':'source',owned:true,sourceUrl:`https://polyhaven.com/a/${spec.sourceId}`,license:'CC0-1.0'});
 }
 const originalOutput=path.join(cache,`${key}.normalized.glb`);await io.write(originalOutput,document);
 const production=path.join(root,'public/assets/models',`${key}.glb`),backup=path.join(cache,`${key}.before-real-model.glb`);
 if(await exists(production)&&!await exists(backup))await fs.copyFile(production,backup);
 const fallback=cloneDocument(document);await geometryLod(fallback,spec,'medium');await fallback.transform(textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024]}),meshopt({encoder:MeshoptEncoder,level:'medium'}));await io.write(path.join(root,'public/assets/models',`${key}.fallback.glb`),fallback);
 const qualities={},qualityMetadata={};
 for(const quality of tiers){const optimized=cloneDocument(document);const triangleCount=await geometryLod(optimized,spec,quality);await encode(optimized,sizes[quality]);await optimized.transform(dedup({propertyTypes:['Accessor','Mesh','Texture']}),prune({keepLeaves:true,keepAttributes:true}),meshopt({encoder:MeshoptEncoder,level:'medium'}));const name=quality==='medium'?`${key}.glb`:`${key}.${quality}.glb`;const output=path.join(root,'public/assets/models',name);await io.write(output,optimized);qualities[quality]=`assets/models/${name}`;qualityMetadata[quality]={triangles:triangleCount,textureSize:sizes[quality],bytes:(await fs.stat(output)).size};console.log(`  ${key} ${quality}: ${triangleCount.toLocaleString()} triangles, ${qualityMetadata[quality].bytes.toLocaleString()} bytes`);}
 const finalBounds={min:[-dimensions[0]/2,0,-dimensions[2]/2],max:[dimensions[0]/2,dimensions[1],dimensions[2]/2],size:dimensions};
 const record={assetId:spec.assetId,variant:spec.variant,label:spec.label,sourceId:spec.sourceId,sourceUrl:`https://polyhaven.com/a/${spec.sourceId}`,license:'CC0-1.0',sourcePath:sourceDirectory,uniformScale:scale,dimensions,bounds:finalBounds,production:`assets/models/${key}.glb`,fallback:`assets/models/${key}.fallback.glb`,quality:qualities,qualityMetadata,hasLeafAlpha:spec.assetId==='plant',sourcePbr:true};records.push(record);
 console.log(`Real ${key}: ${dimensions.map(v=>v.toFixed(3)).join(' × ')}m; alpha=${record.hasLeafAlpha}`);
}
const reportPath=path.join(root,'assets-src/materials/real-models.json');const previous=await exists(reportPath)?JSON.parse(await fs.readFile(reportPath,'utf8')):[];for(const record of records){const index=previous.findIndex(r=>r.assetId===record.assetId&&r.variant===record.variant);if(index>=0)previous[index]={...previous[index],...record,quality:{...previous[index].quality,...record.quality}};else previous.push(record);}await fs.writeFile(reportPath,JSON.stringify(previous,null,2));
console.log(`Normalized ${records.length} real assets; source and temporary engineering files remain on E drive.`);
