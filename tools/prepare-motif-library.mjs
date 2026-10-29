/** Independent EDS paint motifs, extracted from the supplied vector identity.
 * Run before prepare-wall-murals.mjs, which packs these masks into its one atlas. */
import './browser-path.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'..'),brand=path.join(root,'public/assets/brand');
const out=path.join(brand,'motif-library'),notes=path.join(root,'assets-src/brand/motif-library');
const supplied='C:/Users/kakuc/Downloads/Telegram Desktop/EDS_RGB_design_elements (2).svg';
const sourceCopy=path.join(root,'assets-src/brand/eds-design-elements.svg');
const sourcePath=process.argv.find(arg=>arg.startsWith('--source='))?.slice(9)??await fs.access(supplied).then(()=>supplied,()=>sourceCopy);
const source=await fs.readFile(sourcePath,'utf8');
if(/<script\b|\bonload\s*=|https?:\/\/(?!www\.w3\.org)/i.test(source))throw new Error('The reference must be inert, self-contained SVG');
await Promise.all([fs.mkdir(out,{recursive:true}),fs.mkdir(notes,{recursive:true}),fs.mkdir(path.join(root,'public/assets/thumbnails'),{recursive:true})]);
await fs.writeFile(sourceCopy,source);
const browser=await chromium.launch({headless:true});let extracted;
try{
 const page=await browser.newPage();await page.setContent(source.replace(/<\?xml[^>]+\?>/,''));
 extracted=await page.locator('svg').evaluate(svg=>{
  const groups=[...svg.children].filter(element=>element.tagName.toLowerCase()==='g');
  const extract=(element,sourceElement)=>{
   const b=element.getBBox(),clone=element.cloneNode(true);
   for(const node of [clone,...clone.querySelectorAll('*')]){node.removeAttribute('class');node.removeAttribute('style');node.removeAttribute('id');node.setAttribute('fill','#000000');}
   return {sourceElement,bbox:[b.x,b.y,b.width,b.height],body:clone.outerHTML};
  };
  const children=[...svg.children];
  return {checker:extract(groups[1],'g[1]'),arrow:extract(children[13],'polygon[13]'),square:extract(groups[0],'g[0]'),cross:extract(groups[2],'g[2]'),target:extract(children[17],'path[17]')};
 });
}finally{await browser.close();}
const B='#000000',P='#0B30C1',BG='#f0f0eb';
const svg=(width,height,body)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
const actual=art=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.bbox.join(' ')}">${art.body}</svg>`;
const place=(art,x,y,size,rotation=0)=>`<g transform="rotate(${rotation} ${x+size/2} ${y+size/2})"><svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${art.bbox.join(' ')}">${art.body}</svg></g>`;
const old=await Promise.all([1,2,3].map(index=>fs.readFile(path.join(brand,`motif-${index}.svg`),'utf8')));
const definitions=[
 {index:1,label:'Діагональна штриховка',size:[3.24,.491],body:old[0],sourceElements:['g[3]']},
 {index:2,label:'Сітка хрестів',size:[2.4,2.4],body:old[1],sourceElements:['g[7]']},
 {index:3,label:'Парні чверті диска',size:[1,1],body:old[2],sourceElements:['g[4]']},
 {index:4,label:'Шаховий модуль',size:[.8,.8],body:actual(extracted.checker),sourceElements:['g[1]']},
 {index:5,label:'Стріла руху',size:[.9,.9],body:actual(extracted.arrow),sourceElements:['polygon[13]']},
 {index:6,label:'Квадрат у квадраті',size:[.8,.8],body:actual(extracted.square),sourceElements:['g[0]']},
 {index:7,label:'Точка перетину',size:[.8,.8],body:actual(extracted.cross),sourceElements:['g[2]']},
 {index:8,label:'Оптичний центр',size:[.9,.9],body:actual(extracted.target),sourceElements:['path[17]']},
 {index:9,label:'Модульна сходинка',size:[1.8,1.2],body:svg(1536,1024,[0,1,2].map(i=>place(extracted.checker,i*512,512-i*256,512)).join('')),sourceElements:['g[1]'],derived:true},
 {index:10,label:'Хвиля співдії',size:[2.1,.9],body:svg(2389,1024,[0,1,2].map(i=>`<g transform="translate(${i*790} 0)"><svg x="0" y="162" width="800" height="700" viewBox="${old[2].match(/viewBox="([^"]+)"/)[1]}" preserveAspectRatio="xMidYMid meet"><g transform="${i%2?'rotate(90 342.37 338.68)':''}">${old[2].replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'')}</g></svg></g>`).join('')),sourceElements:['g[4]'],derived:true},
 {index:11,label:'Векторний ритм',size:[2.4,.8],body:svg(3072,1024,[0,1,2].map(i=>place(extracted.arrow,i*1086,62,900)).join('')),sourceElements:['polygon[13]'],derived:true},
 {index:12,label:'Координатна рамка',size:[1.8,1.2],body:svg(1536,1024,`<path d="M96 240V96H360M1176 96H1440V240M1440 784V928H1176M360 928H96V784" fill="none" stroke="${B}" stroke-width="22"/>`+[[0,0],[1344,0],[0,832],[1344,832]].map(([x,y])=>place(extracted.cross,x,y,192)).join('')+place(extracted.target,620,364,296)),sourceElements:['g[2]','path[17]'],derived:true}
];
const items=[],previews=[];
for(const d of definitions){
 const id=`motif-${d.index}`,body=Buffer.from(d.body),b=await sharp(body).metadata();
 await fs.writeFile(path.join(out,id+'.svg'),body);
 const alpha=await sharp(body).resize({width:1536,height:1536,fit:'inside'}).png().toBuffer();await fs.writeFile(path.join(out,id+'.png'),alpha);
 const previewSvg=d.body.replaceAll('#000000',P);
 const shape=await sharp(Buffer.from(previewSvg)).resize({width:576,height:344,fit:'inside'}).png().toBuffer();
 const shapeMeta=await sharp(shape).metadata();
 const preview=await sharp({create:{width:640,height:400,channels:4,background:BG}}).composite([{input:shape,left:Math.round((640-shapeMeta.width)/2),top:Math.round((400-shapeMeta.height)/2)}]).png().toBuffer();
 await fs.writeFile(path.join(out,id+'-preview.png'),preview);
 const thumb=await sharp(preview).resize(400,250).extend({top:25,bottom:25,left:0,right:0,background:BG}).webp({quality:92}).toBuffer();
 const thumbnail=`assets/thumbnails/corporateMotif-${d.index}.webp`;await fs.writeFile(path.join(root,'public',thumbnail),thumb);
 const viewBox=d.body.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
 items.push({index:d.index,id,label:d.label,defaultSize:d.size,sourceAspect:viewBox[2]/viewBox[3],svg:`assets/brand/motif-library/${id}.svg`,png:`assets/brand/motif-library/${id}.png`,preview:`assets/brand/motif-library/${id}-preview.png`,thumbnail,sourceElements:d.sourceElements,derived:d.derived??false,geometrySHA256:createHash('sha256').update(d.body).digest('hex'),alphaMask:true});
 previews.push(preview);
}
const data={schemaVersion:1,texture:'assets/brand/murals/wall-print-atlas.webp',atlas:'assets/brand/murals/atlas.json',sourceBrandSHA256:createHash('sha256').update(source).digest('hex'),colorSpace:'srgb',alpha:'black RGB with alpha mask; runtime supplies chosen paint color',motifs:items};
await fs.writeFile(path.join(brand,'motif-library.json'),JSON.stringify(data,null,2)+'\n');
const thumbnailManifestPath=path.join(root,'public/assets/thumbnails/manifest.json');
const thumbnailManifest=JSON.parse(await fs.readFile(thumbnailManifestPath,'utf8'));
thumbnailManifest.images=[...thumbnailManifest.images.filter(image=>image.assetId!=='corporateMotif'),...items.map(motif=>({assetId:'corporateMotif',variant:motif.index,file:motif.thumbnail,size:[...motif.defaultSize,.0001],triangles:0,source:'Exact EDS vector alpha-mask preview; runtime wall albedo paint'}))];
await fs.writeFile(thumbnailManifestPath,JSON.stringify(thumbnailManifest,null,2)+'\n');
const sheet=await sharp({create:{width:1920,height:4*454,channels:4,background:BG}}).composite(previews.flatMap((input,i)=>{const x=(i%3)*640,y=Math.floor(i/3)*454;return[{input,left:x,top:y+54},{input:Buffer.from(svg(640,54,`<text x="24" y="37" fill="#172920" font-size="26" font-weight="600" font-family="DejaVu Sans,Arial,sans-serif">${i+1} / ${definitions[i].label}</text>`)),left:x,top:y}];})).png().toBuffer();
await fs.writeFile(path.join(notes,'contact-sheet.png'),sheet);
await fs.writeFile(path.join(notes,'source-elements.json'),JSON.stringify({source:sourcePath,sha256:data.sourceBrandSHA256,elements:extracted},null,2)+'\n');
await fs.writeFile(path.join(notes,'README.md'),'# Independent EDS wall paint motifs\n\nTwelve alpha-mask motifs are extracted or composed from the supplied EDS vector identity. Designs 1–3 retain the existing SVGs unchanged; 4–8 are additional exact checker, arrow, nested square, cross and crosshair outlines from the reference; 9–12 combine those original forms. Each is an independent colorable element with transparent negative space.\n\nRebuild: `node tools/prepare-motif-library.mjs`, then `node tools/prepare-wall-murals.mjs`. The second command embeds these masks and all 16 murals in one 4096² atlas. Standalone previews, alpha PNGs and SVGs are ordinary static assets. No external fonts, network service or regenerated logo is used.\n');
console.log(JSON.stringify({motifs:items.map(({index,label,defaultSize})=>({index,label,defaultSize})),contactSheet:path.join(notes,'contact-sheet.png')},null,2));
