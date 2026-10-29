/** Extract actual EDS vector geometry, never regenerate the supplied artwork. */
import './browser-path.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourcePath=process.argv.find(a=>a.startsWith('--source='))?.slice(9)??'C:/Users/kakuc/Downloads/Telegram Desktop/EDS_RGB_design_elements (2).svg';
const source=await fs.readFile(sourcePath,'utf8');
const output=path.join(root,'public/assets/brand');
const sourceDir='E:/ArchViz_Resources/RoomAtelier/brand';
await Promise.all([fs.mkdir(output,{recursive:true}),fs.mkdir(sourceDir,{recursive:true}),fs.mkdir(path.join(root,'assets-src/brand'),{recursive:true})]);
await fs.copyFile(sourcePath,path.join(sourceDir,'EDS_RGB_design_elements.svg'));
const browser=await chromium.launch({headless:true});
let extracted;
try {
 const page=await browser.newPage();await page.setContent(source.replace(/<\?xml[^>]+\?>/,''));
 extracted=await page.locator('svg').evaluate(svg=>{
  const groups=[...svg.children].filter(e=>e.tagName.toLowerCase()==='g');
  const extract=(element,index)=>{
   const b=element.getBBox(),clone=element.cloneNode(true);
   for(const node of [clone,...clone.querySelectorAll('*')]){node.removeAttribute('class');node.removeAttribute('style');node.removeAttribute('id');node.setAttribute('fill','#000000');}
   return{sourceGroup:index,bbox:[b.x,b.y,b.width,b.height],body:clone.outerHTML};
  };
  return{motifs:[extract(groups[3],3),extract(groups[7],7),extract(groups[4],4)],logo:extract(groups[40].children[0].children[0],'40/0/0')};
 });
}finally{await browser.close();}
const svgFor=(art)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.bbox.join(' ')}">${art.body}</svg>`;
const names=['Діагональна штриховка','Сітка хрестів','Парні чверті диска'];
const tiles=[[3.24,.491],[2.4,2.4],[.6,.6]];
const motifs=[{index:0,id:'none',label:'0 / Немає'}];
const previews=[];
for(let i=0;i<extracted.motifs.length;i++){
 const art=extracted.motifs[i],svg=svgFor(art),base=`motif-${i+1}`;
 await fs.writeFile(path.join(output,base+'.svg'),svg);
 const height=Math.round(1024*art.bbox[3]/art.bbox[2]);
 const png=await sharp(Buffer.from(svg)).resize(1024,height).png().toBuffer();
 await fs.writeFile(path.join(output,base+'.png'),png);
 const preview=await sharp({create:{width:1024,height,channels:4,background:'#f0f0f0'}}).composite([{input:png}]).png().toBuffer();
 await fs.writeFile(path.join(output,base+'-preview.png'),preview);
 previews.push({input:await sharp(preview).resize(600,210,{fit:'contain',background:'#f0f0f0'}).toBuffer(),top:i*220,left:0});
 motifs.push({index:i+1,id:base,label:names[i],svg:`assets/brand/${base}.svg`,png:`assets/brand/${base}.png`,tileMeters:tiles[i],sourceGroup:art.sourceGroup,sourceBBox:art.bbox,format:'black RGB, alpha mask'});
}
const logoSvg=svgFor(extracted.logo);await fs.writeFile(path.join(output,'eds-wordmark-original.svg'),logoSvg);
await sharp(Buffer.from(logoSvg)).resize(1024).png().toFile(path.join(output,'eds-wordmark-original.png'));
const colors=[{id:'eds-blue',label:'EDS · синій',hex:'#0B30C1'},{id:'eds-lavender',label:'EDS · лавандовий',hex:'#A2B8FE'},{id:'eds-lime',label:'EDS · лаймовий',hex:'#A0FF3D'},{id:'eds-white',label:'EDS · білий',hex:'#F0F0F0'},{id:'eds-black',label:'EDS · чорний',hex:'#000000'}];
const metadata={schemaVersion:1,source:{path:sourcePath,sha256:createHash('sha256').update(source).digest('hex'),copyright:'User-supplied EDS corporate identity. Use only within this authorised project.',originalCopy:path.join(sourceDir,'EDS_RGB_design_elements.svg')},colors,motifs,wordmark:{svg:'assets/brand/eds-wordmark-original.svg',png:'assets/brand/eds-wordmark-original.png',sourceGroup:extracted.logo.sourceGroup}};
await fs.writeFile(path.join(output,'palette.json'),JSON.stringify(metadata,null,2));
await fs.writeFile(path.join(root,'assets-src/brand/source-provenance.json'),JSON.stringify(metadata,null,2));
await sharp({create:{width:600,height:660,channels:4,background:'#f0f0f0'}}).composite(previews).png().toFile(path.join(output,'motifs-preview.png'));
// Readable default prints, replaced by the runtime's inert per-object label.
// Font is used only for Ukrainian room text; the EDS mark remains source paths.
const logoBody=extracted.logo.body,b=extracted.logo.bbox;
for(const [file,color,label]of [['door-plaque-label','#20272d','01'],['brand-door-panel-label','#17201a','04']]){
 const sign=file.startsWith('door'),width=sign?1000:600,height=sign?410:300;
 const logoW=sign?180:170,logoH=logoW*b[3]/b[2],logoX=sign?(width-logoW)/2:45,logoY=sign?25:36;
 const body=logoBody.replaceAll('#000000',color);
 const print=sign?`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="410"><text x="500" y="220" dominant-baseline="middle" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-weight="600" font-size="240" fill="${color}">${label}</text></svg>`:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(${logoX} ${logoY}) scale(${logoW/b[2]}) translate(${-b[0]} ${-b[1]})">${body}</g><text x="${sign?width/2:420}" y="${sign?300:230}" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-weight="500" font-size="${sign?104:206}" fill="${color}">${label}</text></svg>`;
 await fs.writeFile(path.join(output,file+'.svg'),print);await sharp(Buffer.from(print)).png().toFile(path.join(output,file+'.png'));
}
console.log(`Extracted ${colors.length} corporate colors and 3 original vector motifs; source artwork preserved on E:.`);

// A single alpha atlas keeps High + six shadow maps within WebGL2's required
// minimum of 16 fragment texture units. Do not add one sampler per motif.
{
 const taskFolder=path.resolve('public/assets/brand');
 const taskTiles=await Promise.all([1,2,3].map(i=>sharp(path.join(taskFolder,`motif-${i}.png`)).resize(1024,1024,{fit:'fill'}).png().toBuffer()));
 await sharp({create:{width:3072,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(taskTiles.map((input,i)=>({input,left:i*1024,top:0}))).png().toFile(path.join(taskFolder,'motif-atlas.png'));
}
