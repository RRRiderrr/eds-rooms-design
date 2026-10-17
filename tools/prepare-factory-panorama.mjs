/** Self-hosted full-sphere background. This converts an AI-generated LDR map;
 * Radiance encoding does not recover measured scene-referred HDR luminance. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resources=process.env.ARCHVIZ_RESOURCES||'E:/ArchViz_Resources';
const source=process.argv.find(a=>a.startsWith('--source='))?.slice(9)||path.join(resources,'RoomAtelier/environment/factory-panorama-generated-v1.png');
const output=path.join(root,'public/assets/environment');
await fs.mkdir(output,{recursive:true});
const bytes=await fs.readFile(source),metadata=await sharp(bytes).metadata();
if(!metadata.width||!metadata.height||metadata.width!==metadata.height*2)throw new Error('Factory panorama must be exact 2:1 full-sphere equirectangular.');
const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
function encodeChannel(values){
 const result=[];let i=0;
 while(i<values.length){let repeat=1;while(i+repeat<values.length&&repeat<127&&values[i+repeat]===values[i])repeat++;
  if(repeat>=4){result.push(128+repeat,values[i]);i+=repeat;continue;}
  const begin=i;i+=repeat;
  while(i<values.length&&i-begin<128){let n=1;while(i+n<values.length&&n<4&&values[i+n]===values[i])n++;if(n>=4)break;i+=Math.min(n,128-(i-begin));}
  result.push(i-begin,...values.subarray(begin,i));
 }return Buffer.from(result);
}
function radiance(rgb,width,height){
 const parts=[Buffer.from(`#?RADIANCE\n# Synthetic LDR panorama, sRGB decoded to linear; not measured HDR\nFORMAT=32-bit_rle_rgbe\nEXPOSURE=1.0\n\n-Y ${height} +X ${width}\n`)];
 for(let y=0;y<height;y++){
  const channels=Array.from({length:4},()=>new Uint8Array(width));
  for(let x=0;x<width;x++){
   const index=(y*width+x)*3,r=linear(rgb[index]),g=linear(rgb[index+1]),b=linear(rgb[index+2]),maximum=Math.max(r,g,b);
   if(maximum<1e-32)continue;
   const exponent=Math.floor(Math.log2(maximum))+1,scale=256/2**exponent;
   channels[0][x]=Math.floor(r*scale);channels[1][x]=Math.floor(g*scale);channels[2][x]=Math.floor(b*scale);channels[3][x]=exponent+128;
  }
  parts.push(Buffer.from([2,2,width>>8,width&255]),...channels.map(encodeChannel));
 }return Buffer.concat(parts);
}
const qualities={},qualityMetadata={};
// Native pixels remain native: do not advertise an upscaled LDR image as a 4K HDR capture.
for(const[quality,width]of[['low',512],['medium',1024],['high',metadata.width]]){
 const image=sharp(bytes).resize(width,width/2,{fit:'fill',kernel:'lanczos3'}).removeAlpha();
 const {data,info}=await image.clone().raw().toBuffer({resolveWithObject:true});
 const hdrName=`factory-panorama-${quality}.hdr`,imageName=`factory-panorama-${quality}.webp`;
 await fs.writeFile(path.join(output,hdrName),radiance(data,info.width,info.height));
 await image.webp({quality:90,effort:5}).toFile(path.join(output,imageName));
 qualities[quality]={hdr:`assets/environment/${hdrName}`,fallback:`assets/environment/${imageName}`};
 qualityMetadata[quality]={width:info.width,height:info.height,hdrBytes:(await fs.stat(path.join(output,hdrName))).size,imageBytes:(await fs.stat(path.join(output,imageName))).size};
}
const manifest={schemaVersion:1,id:'factory-panorama-generated-v1',projection:'equirectangular',coverageDegrees:[360,180],nativeDimensions:[metadata.width,metadata.height],
 provenance:{type:'synthetic generated architectural reconstruction',tool:'OpenAI built-in image_gen',createdAt:'2026-10-17',sourceImage:source.replaceAll('\\','/'),sourceSha256:createHash('sha256').update(bytes).digest('hex'),reference:'Office photograph codex-clipboard-150ced87-85c5-42c2-9bfe-69830e75ea65.png; only factory characteristics seen through its window were used as guidance.',license:'Project-generated image; not a third-party stock capture or a Quixel asset.'},
 radiometry:{source:'8-bit sRGB LDR',encoding:'sRGB EOTF to linear RGB, Radiance RGBE',range:[0,1],measuredHDR:false,lightRecovery:false,note:'HDR is the runtime file container only. No physically measured scene luminance or highlight recovery is claimed. The room continues to use its independent Cycles-baked GI.'},
 background:{rotationY:-Math.PI/2,intensity:.85,blur:0},qualities,qualityMetadata};
await fs.writeFile(path.join(output,'factory-panorama.json'),JSON.stringify(manifest,null,2));
await fs.mkdir(path.join(root,'assets-src/environment'),{recursive:true});
await fs.writeFile(path.join(root,'assets-src/environment/factory-panorama.source.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({projection:manifest.projection,source:manifest.nativeDimensions,qualityMetadata},null,2));
