/** Register only the four materials explicitly inspected as owned in the Fab UI.
 * This reads downloaded image files, not credentials or private app APIs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resources=process.env.ARCHVIZ_RESOURCES||'E:/ArchViz_Resources';
const library=path.join(resources,'FabDownloads/VaultCache/FabLibrary');
const specifications=[
 {id:'wall-painted',folder:'Painted_Plaster-c698e997',sourceId:'pjBoU0',label:'Painted Plaster',tileMeters:1,bytes:'19.39 MB',normalStrength:.08,note:'Owned Quixel/Fab fine painted-plaster scan, repainted to the photographed warm light finish. No stains or strong roughness are introduced.'},
 {id:'floor-commercial-grey',folder:'Smooth_Concrete-6c270df9',sourceId:'tezmdjno',label:'Smooth Concrete',tileMeters:2,bytes:'15.31 MB',normalStrength:.1,note:'Owned Quixel/Fab smooth low-relief scan; calibrated to the photographed neutral grey commercial floor, with 18% albedo variation. It is a representative surface, not a claim to identify the original flooring product.'},
 {id:'wood-oak',folder:'Oak_Veneer-b93dc40c',sourceId:'tfjcffgc',label:'Oak Veneer',tileMeters:[2,4],bytes:'5.25 MB',normalStrength:.18,note:'Owned Quixel/Fab furniture veneer with a restrained straight grain. Fab description scan area is 2x4 metres; runtime UV repeats preserve both dimensions.'},
 {id:'metal-painted',folder:'Painted_Metal_Door-c9661075',label:'Painted Metal Door',tileMeters:[2,1],bytes:'8.03 MB',normalStrength:.045,baseColorMode:'tint',note:'Owned Quixel/Fab intact painted metal. The runtime preserves authored paint colours and uses normal/roughness data only, so ceilings stay dark and frames stay white. This scan is painted metal; a specific powder-coating manufacture is not asserted.'},
];
async function walk(directory){const result=[];for(const item of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,item.name);if(item.isDirectory())result.push(...await walk(filename));else result.push(filename);}return result;}
const materials=[];
for(const spec of specifications){
 const files=await walk(path.join(library,spec.folder));
 const imageFiles={};for(const[role,suffix]of Object.entries({baseColor:'BaseColor',normal:'Normal',roughness:'Roughness',ao:'AO'})){const file=files.find(p=>new RegExp(`_${suffix}\\.(jpg|png|exr)$`,'i').test(p));if(file)imageFiles[role]=file;}
 if(!imageFiles.baseColor||!imageFiles.normal||!imageFiles.roughness)throw new Error(`Incomplete owned source ${spec.label}`);
 const metadataFile=files.find(p=>p.endsWith('.json'));const source=metadataFile?JSON.parse(await fs.readFile(metadataFile,'utf8')):null;
 const sourceId=spec.sourceId??source?.id;
 materials.push({id:spec.id,sourceId,sourceLabel:`Quixel Megascans ${spec.label} ${sourceId} - owned Fab library download`,license:'Fab Standard',licenseEvidence:`Epic Games Launcher / Fab UI showed Saved in library before Download Only, then On disk ${spec.bytes}; medium texture set downloaded 2026-10-17 without a purchase, login or new agreement. Local cache ${spec.folder}.`,tileMeters:spec.tileMeters,normalConvention:'opengl',normalStrength:spec.normalStrength,...(spec.baseColorMode?{baseColorMode:spec.baseColorMode}:{}),note:spec.note,files:imageFiles});
}
await fs.writeFile(path.join(root,'assets-src/materials/overrides.json'),JSON.stringify({materials},null,2));
console.log(materials.map(m=>({id:m.id,sourceId:m.sourceId,tileMeters:m.tileMeters,fileCount:Object.keys(m.files).length})));
