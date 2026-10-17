/** Rasterize our own vector ink, not a photograph: physical acrylic remains 3D. */
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createServer } from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try {
 const {createSignageObject}=await server.ssrLoadModule('/src/catalog/signage.ts');
 const object=createSignageObject('eds-timeline',false,true),width=1.68,height=1.82;
 const paths=[];
 object.traverse(mesh=>{
  if(!mesh.isMesh||!['sign-print-black','graphite-logo'].includes(mesh.material.name))return;
  const position=mesh.geometry.getAttribute('position'),normal=mesh.geometry.getAttribute('normal');let d='';
  for(let i=0;i<position.count;i+=3){
   if(normal.getZ(i)<.99)continue;
   for(let corner=0;corner<3;corner++)d+=(corner?'L':'M')+((position.getX(i+corner)+width/2)*1000).toFixed(3)+','+((height/2-position.getY(i+corner))*1000).toFixed(3);
   d+='Z';
  }
  paths.push(`<path fill="#${mesh.material.color.getHexString()}" d="${d}"/>`);
 });
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1680" height="1820" viewBox="0 0 1680 1820">${paths.join('')}</svg>`;
 const resources='E:/ArchViz_Resources/Signage/vector-print';await fs.mkdir(resources,{recursive:true});await fs.writeFile(path.join(resources,'timeline-ink.svg'),svg);
 await sharp(Buffer.from(svg)).resize({width:2048}).png({compressionLevel:9}).toFile(path.join(root,'public/assets/signage/timeline-ink.png'));
 console.log('VECTOR_PRINT_ATLAS_READY');
} finally {await server.close();}
