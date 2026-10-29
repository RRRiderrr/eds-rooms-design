/**
 * Full-wall EDS compositions. All corporate shapes are the supplied vector
 * outlines; no generated logo, photo background or additional runtime sampler.
 * Run from any directory: node tools/prepare-wall-murals.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const brand=path.join(root,'public/assets/brand');
const out=path.join(brand,'murals');
const notes=path.join(root,'assets-src/brand/murals');
await Promise.all([fs.mkdir(out,{recursive:true}),fs.mkdir(notes,{recursive:true})]);
const [wordmark,diagonal,quarters,crosses]=await Promise.all([
 'eds-wordmark-original.svg','motif-1.svg','motif-3.svg','motif-2.svg'
].map(file=>fs.readFile(path.join(brand,file),'utf8')));
const palette=JSON.parse(await fs.readFile(path.join(brand,'palette.json'),'utf8'));
const C={blue:'#0B30C1',lavender:'#A2B8FE',lime:'#A0FF3D',white:'#F0F0F0',black:'#000000'};
const W=4096,H=2304;
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function art(svg,x,y,w,h,color,extra=''){
 const box=svg.match(/viewBox="([^"]+)"/)[1];
 const body=svg.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'').replaceAll('#000000',color);
 return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${box}" ${extra}>${body}</svg>`;
}
function text(s,x,y,size,fill=C.white,{weight=600,space=0,width,anchor='start',mono=false}={}){
 return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${space}" font-family="${mono?'Consolas,DejaVu Sans Mono,monospace':'Arial,DejaVu Sans,sans-serif'}"${width?` textLength="${width}" lengthAdjust="spacingAndGlyphs"`:''}>${xml(s)}</text>`;
}
const rect=(x,y,w,h,fill)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const line=(x,y,x2,y2,fill,width=8)=>`<path d="M${x} ${y}L${x2} ${y2}" stroke="${fill}" stroke-width="${width}"/>`;
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;

// A monumental logotype and diagonals occupy one wall field; a deliberately
// aligned typographic value wall occupies the other. Both are paint, not signs.
const mural1=svg(
 rect(0,0,W,H,C.white)+
 `<path d="M0 0H1720L0 1500Z" fill="${C.blue}"/>`+
 `<path d="M0 1650L1720 830V2304H0Z" fill="${C.lime}"/>`+
 `<path d="M0 940L1720 145V1250L0 2048Z" fill="${C.white}"/>`+
 // Source steel column covers the first ~4% of the painted wall. Keep the
 // artwork full bleed, but put these readable elements inside a 5.7% inset.
 art(wordmark,235,900,1350,420,C.black)+
 text('ЛЮДИ. ІДЕЇ. ЕНЕРГІЯ.',235,2060,63,C.black,{weight:600,width:1290})+
 rect(1720,0,2376,H,C.black)+
 text('EDS / КУЛЬТУРА СПІВДІЇ',1885,155,55,C.lavender,{space:5})+
 line(1885,210,3930,210,C.lavender,4)+
 text('Партнерство',1885,425,166,C.white,{mono:true,width:1860})+
 text('Надійність',2100,615,157,C.white,{mono:true,width:1640})+
 rect(1870,700,1010,150,C.white)+
 text('Чесність',1905,815,130,C.black,{mono:true,width:935})+
 text('ІННОВАЦІЇ',1900,1050,178,C.white,{weight:700,width:2030})+
 art(diagonal,3250,1135,680,104,C.lime)+
 text('Технології',1885,1270,145,C.white,{mono:true,width:1635})+
 art(wordmark,1895,1400,2040,635,C.white)+
 rect(2540,2090,1395,130,C.lime)+
 text('Сталість',2590,2190,110,C.black,{mono:true,width:1290})+
 text('ПОСЛІДОВНІСТЬ  /  ДОВІРА',1885,2280,57,C.white,{width:2040})
);

// A quiet light composition. Large geometric fields and a single oversized
// source mark retain their reading distance even behind a meeting table.
const mural2=svg(
 rect(0,0,W,H,C.white)+
 rect(0,0,98,H,C.lime)+
 `<path d="M2835 0H4096V1261C3400 1261 2835 696 2835 0Z" fill="${C.lavender}"/>`+
 art(quarters,3210,90,650,650,C.blue)+
 text('СПІЛЬНІ ІДЕЇ.',275,290,158,C.black,{weight:700,width:2060})+
 text('СИЛЬНІ РІШЕННЯ.',275,500,158,C.black,{weight:700,width:2470})+
 art(wordmark,270,840,3540,1100,C.blue)+
 rect(275,2040,1540,165,C.lime)+
 text('Технології,',315,2168,130,C.black,{weight:700,width:1455})+
 text('що об’єднують.',1980,2168,130,C.black,{weight:600,width:1840})+
 text('НАДІЙНІСТЬ',285,2280,47,C.blue,{space:6})+
 text('ПАРТНЕРСТВО',1550,2280,47,C.blue,{space:6})+
 text('ДОВІРА',3240,2280,47,C.blue,{space:6})+
 line(285,2225,3810,2225,C.blue,5)
);

// A dark type-led wall. Hierarchy is intentionally architectural: one very
// large wordmark, three broad value lines, then one contrasting corner field.
const mural3=svg(
 rect(0,0,W,H,C.black)+
 rect(0,0,120,H,C.lime)+
 text('ЛЮДИ. ІДЕЇ. ЕНЕРГІЯ.',295,240,110,C.white,{space:6,width:2680})+
 art(diagonal,3370,125,490,74,C.lime)+
 art(wordmark,290,435,3520,1094,C.white)+
 line(295,1645,3810,1645,C.lavender,7)+
 text('Надійність',295,1850,150,C.white,{mono:true,width:1620})+
 text('Інновації',2110,1850,150,C.lime,{mono:true,width:1685})+
 text('Партнерство',295,2075,150,C.lavender,{mono:true,width:1880})+
 rect(2310,1940,1500,190,C.blue)+
 text('Довіра',2380,2085,150,C.white,{mono:true,width:1360})+
 text('ПОСЛІДОВНІСТЬ',295,2280,80,C.white,{space:8,width:1760})+
 art(quarters,2235,2160,130,130,C.lime)+
 text('Сталість',2500,2280,112,C.white,{mono:true,width:1310})
);

// A conversational wall: a tall source-motif column balances an editorial
// headline and a low wordmark. The broad light field is deliberately quiet.
const mural4=svg(
 rect(0,0,W,H,C.white)+rect(0,0,1210,H,C.blue)+
 art(quarters,220,225,780,780,C.lavender)+
 art(diagonal,220,1655,770,117,C.lime)+
 text('ВІДКРИТІСТЬ',220,1980,70,C.white,{space:6,width:770})+
 text('ДОВІРА',220,2120,70,C.white,{space:6,width:770})+
 text('ПРОСТІР',1430,500,232,C.black,{weight:700,width:2420})+
 text('ДЛЯ ДІАЛОГУ.',1430,790,232,C.black,{weight:700,width:2420})+
 line(1430,1010,3850,1010,C.lavender,9)+
 text('Чуємо одне одного.',1430,1175,110,C.blue,{width:2420})+
 text('Знаходимо спільне рішення.',1430,1330,110,C.blue,{width:2420})+
 art(wordmark,1430,1535,2420,752,C.black)
);

// An engineering composition uses a handful of deliberate routing paths,
// registration points and the actual plus field, not a repetitive wallpaper.
const mural5=svg(
 rect(0,0,W,H,C.white)+rect(0,0,W,110,C.blue)+
 text('ІНЖЕНЕРІЯ',275,405,220,C.black,{weight:700,width:2360})+
 text('РІШЕНЬ.',275,675,220,C.blue,{weight:700,width:1760})+
 art(crosses,2980,285,810,810,C.lavender)+
 `<path d="M275 920H2360L2690 1250H3790M275 1040H2190L2520 1370H3790" fill="none" stroke="${C.blue}" stroke-width="12"/>`+
 `<circle cx="275" cy="920" r="28" fill="${C.lime}"/><circle cx="3790" cy="1370" r="28" fill="${C.blue}"/>`+
 art(wordmark,275,1300,2400,746,C.black)+
 text('ТОЧНІСТЬ',2980,1655,90,C.black,{space:3,width:810})+
 text('ДОСВІД',2980,1815,90,C.black,{space:3,width:810})+
 text('РЕЗУЛЬТАТ',2980,1975,90,C.black,{space:3,width:810})+
 rect(275,2180,3515,16,C.lime)
);

// Interlocking corporate quarter-discs and a shared baseline express
// partnership. This layout has an intentionally asymmetric black/light split.
const mural6=svg(
 rect(0,0,W,H,C.white)+rect(0,0,1800,H,C.black)+
 text('СИЛА',270,415,255,C.white,{weight:700,width:1260})+
 text('ПАРТНЕРСТВА',270,655,132,C.white,{weight:700,width:1260})+
 art(wordmark,270,1040,1260,392,C.white)+
 art(diagonal,270,1850,1260,191,C.lime)+
 art(quarters,2010,210,1840,1840,C.lavender)+
 art(quarters,2530,730,800,800,C.blue)+
 text('Разом створюємо більше.',2030,2150,105,C.black,{weight:600,width:1820})+
 rect(2030,2215,1820,18,C.lime)
);

// A calm composition for the biophilic/library/focus layouts. Large lavender
// geometry gives the whole wall an identity while leaving generous white air.
const mural7=svg(
 rect(0,0,W,H,C.white)+
 art(quarters,2220,130,1700,1700,C.lavender)+
 text('ФОКУС НА ГОЛОВНОМУ.',275,405,123,C.black,{weight:700,width:2480})+
 text('Люди. Ідеї. Енергія.',275,620,106,C.blue,{width:2050})+
 art(wordmark,275,1120,2420,752,C.black)+
 line(275,2065,3810,2065,C.lavender,7)+
 rect(275,2028,290,74,C.lime)+
 text('Спокій для думок. Простір для рішень.',275,2230,92,C.black,{width:3535})
);

// An energetic presentation wall uses the corporate blue as an architectural
// field. Its white source wordmark remains the sole centre of attention.
const mural8=svg(
 rect(0,0,W,H,C.blue)+
 text('ЕНЕРГІЯ МАЙБУТНЬОГО',275,325,136,C.white,{weight:700,width:2870})+
 art(quarters,3410,145,400,400,C.lime)+
 art(wordmark,275,660,3535,1099,C.white)+
 line(275,1940,3810,1940,C.lavender,7)+
 text('ІДЕЇ',275,2160,130,C.white,{weight:700,width:760})+
 text('ТЕХНОЛОГІЇ',1485,2160,130,C.white,{weight:700,width:1420})+
 art(diagonal,3260,2050,550,84,C.lime)+
 text('EDS / СПІЛЬНА ДІЯ',275,2280,52,C.lavender,{space:6,width:2630})
);

const definitions=[
 {id:'mural-1',index:1,label:'EDS · енергія та цінності',description:'Монументальний логотип, синя й лаймова діагоналі та чорна стіна цінностей.',body:mural1},
 {id:'mural-2',index:2,label:'EDS · спільні ідеї',description:'Світла композиція, великий синій логотип, лавандова геометрія та лаймовий акцент.',body:mural2},
 {id:'mural-3',index:3,label:'EDS · культура співдії',description:'Чорна типографічна стіна з білим логотипом, корпоративними цінностями й кольоровими полями.',body:mural3},
 {id:'mural-4',index:4,label:'EDS · простір для діалогу',description:'Синя колона з парними чвертями, редакційна типографіка та світле поле для відкритої розмови.',body:mural4},
 {id:'mural-5',index:5,label:'EDS · інженерія рішень',description:'Інженерні траси, точні знаки та великий чорний логотип на світлому полі.',body:mural5},
 {id:'mural-6',index:6,label:'EDS · сила партнерства',description:'Асиметрична чорна колона та великі взаємопов’язані лавандові й сині корпоративні форми.',body:mural6},
 {id:'mural-7',index:7,label:'EDS · спокійна енергія',description:'Повітряна світла композиція з великими лавандовими формами, чітким логотипом і невеликим лаймовим акцентом.',body:mural7},
 {id:'mural-8',index:8,label:'EDS · енергія майбутнього',description:'Монументальний білий логотип на корпоративному синьому полі з лаймовими геометричними акцентами.',body:mural8}
];
// Eight compositions keep the same single 4096² sampler and GPU allocation.
// Readable architectural type is laid out at 1328px per ~5.2m feature wall.
const atlasSize=4096,tileW=1328,tileH=747;
const positions=definitions.map((_,i)=>[16+(i%3)*(tileW+32),16+Math.floor(i/3)*(tileH+32)]);
const composites=[],tiles=[];
function tileMetadata(id,kind,x,y,width,height,extra={}){
 return{id,kind,pixelRectTopLeft:[x,y,width,height],uvRectBottomLeft:[x/atlasSize,(atlasSize-y-height)/atlasSize,width/atlasSize,height/atlasSize],...extra};
}
const previewBuffers=[];
for(let i=0;i<definitions.length;i++){
 const d=definitions[i],source=Buffer.from(d.body),[x,y]=positions[i];
 await fs.writeFile(path.join(out,`${d.id}.svg`),source);
 const tile=await sharp(source).resize(tileW,tileH,{fit:'fill'}).png().toBuffer();
 // Extend edge pixels into a 16-pixel gutter so mipmaps cannot pick up clear
 // adjacent atlas space. The stated UV rectangle excludes this gutter.
 const padded=await sharp(tile).extend({top:16,bottom:16,left:16,right:16,extendWith:'copy'}).png().toBuffer();
 composites.push({input:padded,left:x-16,top:y-16});
 tiles.push(tileMetadata(d.id,'mural',x,y,tileW,tileH,{index:d.index,label:d.label,description:d.description,sourceSvg:`assets/brand/murals/${d.id}.svg`,sourceAspect:W/H,opaque:true}));
 const preview=await sharp(source).resize(1200,675,{fit:'fill'}).png().toBuffer();
 await fs.writeFile(path.join(out,`${d.id}-preview.png`),preview);
 previewBuffers.push(preview);
}
for(let i=0;i<3;i++){
 const x=16+i*1040,y=2700;
 const input=await sharp(path.join(brand,`motif-${i+1}.png`)).resize(1024,1024,{fit:'fill'}).png().toBuffer();
 composites.push({input,left:x,top:y});
 tiles.push(tileMetadata(`motif-${i+1}`,'mask',x,y,1024,1024,{index:i+1,alphaMask:true,physicalTileMeters:palette.motifs[i+1].tileMeters}));
}
const atlas=await sharp({create:{width:atlasSize,height:atlasSize,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toBuffer();
await fs.writeFile(path.join(out,'wall-print-atlas.png'),atlas);
await sharp(atlas).webp({lossless:true,effort:6}).toFile(path.join(out,'wall-print-atlas.webp'));
const meta={schemaVersion:1,width:atlasSize,height:atlasSize,colorSpace:'srgb',alpha:'unpremultiplied',texture:'assets/brand/murals/wall-print-atlas.webp',png:'assets/brand/murals/wall-print-atlas.png',orientation:{source:'top-left image pixels',textureFlipY:true,uv:'bottom-left WebGL UV; sample uvRect.xy + localUV * uvRect.zw, localUV.y points up'},gutterPixels:16,sourceResolution:[W,H],sourceBrandSHA256:palette.source.sha256,wordmarkSHA256:createHash('sha256').update(wordmark).digest('hex'),tiles};
await fs.writeFile(path.join(out,'atlas.json'),JSON.stringify(meta,null,2)+'\n');
const sheet=await sharp({create:{width:2400,height:4*735,channels:4,background:C.white}}).composite(previewBuffers.flatMap((input,i)=>{const x=(i%2)*1200,y=Math.floor(i/2)*735;return[{input,left:x,top:y+60},{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="60">${rect(0,0,1200,60,C.white)}${text(`${i+1} / ${definitions[i].label}`,25,42,30,C.black,{weight:600})}</svg>`),left:x,top:y}];})).png().toBuffer();
await fs.writeFile(path.join(notes,'contact-sheet.png'),sheet);
await fs.writeFile(path.join(notes,'README.md'),`# EDS wall paintings\n\nThese are full-wall paint compositions, not mounted boards or raised signs. Eight vector-native designs use the exact user-supplied EDS wordmark paths, diagonal, plus-field and paired quarter-disc motifs. Original designs 1–3 retain their SVG sources unchanged; designs 4–8 add dialogue, engineering, partnership, calm and presentation compositions. Corporate colors are copied from the supplied identity: ${Object.values(C).join(', ')}.\n\nRebuild: \`node tools/prepare-wall-murals.mjs\`. This writes individual 4096 × 2304 SVG sources (16:9, matching 5.2 × 2.93 m painted wall below the structural black beam), previews, and one combined 4096² atlas for all eight murals and the existing three alpha-mask motifs. Each runtime mural tile is 1328 × 747 px with 16px edge extrusion; the atlas keeps the previous GPU allocation and uses one sampler. Ukrainian text is baked into runtime texture; SVG uses Arial/DejaVu Sans so its source remains editable.\n\nRGB is sRGB paint color; alpha is an unchanged mask only for motif tiles. Use \`atlas.json\` \`uvRectBottomLeft\` with Texture.flipY = true. Texture pixels never contain the floor, ceiling, furnishings or doorway imagery from the reference. Renderer must clip painting to actual wall surface (including openings and top black fascia), not create full rectangular geometry.\n\nThe supplied wordmark is preserved exactly; only uniform scale and placement change. Runtime atlas WebP is lossless, and a PNG alternative is included for local tools. No external fonts, web service, backend, or generated logo is required.\n`);
console.log(JSON.stringify({output:out,atlasBytes:(await fs.stat(path.join(out,'wall-print-atlas.webp'))).size,tiles:tiles.map(t=>({id:t.id,uv:t.uvRectBottomLeft})),contactSheet:path.join(notes,'contact-sheet.png')},null,2));
