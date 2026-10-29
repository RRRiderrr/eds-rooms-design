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
// The independent library and wall paintings share one GPU atlas. Rebuild its
// vector masks first so the generation command works from a clean checkout.
await import('./prepare-motif-library.mjs');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const brand=path.join(root,'public/assets/brand');
const out=path.join(brand,'murals');
const notes=path.join(root,'assets-src/brand/murals');
await Promise.all([fs.mkdir(out,{recursive:true}),fs.mkdir(notes,{recursive:true})]);
const [wordmark,diagonal,quarters,crosses]=await Promise.all([
 'eds-wordmark-original.svg','motif-1.svg','motif-3.svg','motif-2.svg'
].map(file=>fs.readFile(path.join(brand,file),'utf8')));
const palette=JSON.parse(await fs.readFile(path.join(brand,'palette.json'),'utf8'));
const motifLibrary=JSON.parse(await fs.readFile(path.join(brand,'motif-library.json'),'utf8'));
const [checker,arrow,nestedSquare,cross,target]=await Promise.all([4,5,6,7,8].map(index=>fs.readFile(path.join(brand,`motif-library/motif-${index}.svg`),'utf8')));
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

// A quiet lavender architectural field, with an ascending source-checker
// rhythm, gives a library or biophilic room a confident but gentle identity.
const mural9=svg(
 rect(0,0,W,H,C.lavender)+rect(0,0,128,H,C.blue)+
 text('ВІД ІДЕЇ',275,425,260,C.black,{weight:700,width:1900})+
 text('ДО ДІЇ.',275,755,260,C.blue,{weight:700,width:1900})+
 text('Розвиваємо можливості.',285,980,112,C.black,{width:2040})+
 art(checker,2730,1320,1040,1040,C.blue)+
 art(checker,2290,1760,600,600,C.lime)+
 art(quarters,3000,110,880,880,C.white)+
 art(wordmark,275,1450,1800,559,C.black)+
 line(285,2160,2200,2160,C.blue,8)+
 text('EDS / ТОЧКА ЗРОСТАННЯ',285,2280,68,C.black,{space:4,width:1920})
);

// A directional wall balances a single monumental arrow with generous white
// space. The lime is an accent line rather than a room-sized fluorescent field.
const mural10=svg(
 rect(0,0,W,H,C.white)+rect(2820,0,1276,H,C.blue)+
 text('РУХАЄМО',285,470,245,C.black,{weight:700,width:2220})+
 text('ЗМІНИ.',285,790,245,C.blue,{weight:700,width:1760})+
 rect(285,940,1100,24,C.lime)+
 text('Чіткий напрям. Спільна мета.',285,1160,101,C.black,{width:2220})+
 art(wordmark,285,1510,2180,678,C.black)+
 art(arrow,3025,290,810,810,C.white)+
 art(arrow,3025,1310,810,810,C.lavender)+
 text('EDS / НАПРЯМ РУХУ',285,2280,61,C.blue,{space:4,width:2170})
);

// Fine registration marks echo the reference's coordinate fields. One nested
// square and source wordmark organise the whole wall, rather than wallpapering it.
const mural11=svg(
 rect(0,0,W,H,C.white)+
 art(crosses,285,190,1000,1000,C.lavender)+
 art(nestedSquare,285,1210,840,840,C.blue)+
 text('ЗНАХОДИМО',1480,450,181,C.black,{weight:700,width:2300})+
 text('СПІЛЬНІ',1480,690,181,C.black,{weight:700,width:2300})+
 text('КООРДИНАТИ.',1480,930,181,C.blue,{weight:700,width:2300})+
 line(1480,1140,3810,1140,C.lavender,9)+
 art(wordmark,1480,1340,2330,724,C.black)+
 rect(1480,2215,300,18,C.lime)+
 text('ТОЧНІСТЬ  /  ВІДКРИТІСТЬ  /  ДОВІРА',1880,2250,54,C.blue,{width:1930})
);

// A horizontal composition leaves an airy upper half while a broad lavender
// plinth and offset quarter-discs integrate with long tables and low storage.
const mural12=svg(
 rect(0,0,W,H,C.white)+rect(0,1470,W,834,C.lavender)+
 art(quarters,230,235,1050,1050,C.blue)+
 text('ТОЧНІСТЬ У ДЕТАЛЯХ.',1530,430,139,C.black,{weight:700,width:2280})+
 text('МАСШТАБ У РІШЕННЯХ.',1530,650,139,C.blue,{weight:700,width:2280})+
 line(1530,880,3810,880,C.lavender,9)+
 art(wordmark,1530,1070,2280,708,C.black)+
 art(cross,285,1740,330,330,C.white)+
 text('БАЛАНС',790,1910,180,C.blue,{weight:700,width:1370})+
 text('ЕНЕРГІЇ',2310,2160,180,C.black,{weight:700,width:1500})+
 rect(790,2025,1370,20,C.lime)
);

// A strong but sparse dark wall uses the checkerboard as an architectural
// corner. Short values have their own cadence and avoid tiny dense body copy.
const mural13=svg(
 rect(0,0,W,H,C.black)+
 art(checker,0,0,1120,1120,C.blue)+
 art(checker,2976,1184,1120,1120,C.lavender)+
 text('КОЖЕН ВНЕСОК.',1310,420,180,C.white,{weight:700,width:2500})+
 text('СПІЛЬНИЙ',1310,660,180,C.white,{weight:700,width:2500})+
 text('РЕЗУЛЬТАТ.',1310,900,180,C.lime,{weight:700,width:2320})+
 art(wordmark,285,1280,2560,795,C.white)+
 art(diagonal,285,2180,820,124,C.lavender)+
 text('EDS / КОМАНДНИЙ РИТМ',1310,2260,72,C.white,{space:3,width:2300})
);

// A compact source crosshair provides a precise visual anchor. The lower blue
// field can sit behind a bench or a meeting table without losing the headline.
const mural14=svg(
 rect(0,0,W,H,C.white)+rect(0,1550,W,754,C.blue)+
 text('ЯСНІ ЦІЛІ.',285,425,240,C.black,{weight:700,width:2440})+
 text('ТОЧНІ РІШЕННЯ.',285,750,212,C.blue,{weight:700,width:2620})+
 art(target,3060,225,760,760,C.lavender)+
 line(285,1050,3810,1050,C.lavender,9)+
 text('Фокусуємо досвід на вашому результаті.',285,1285,104,C.black,{width:3535})+
 art(wordmark,285,1690,1780,553,C.white)+
 art(arrow,3190,1730,550,550,C.lime)
);

// The studio wall uses off-centre framing and one deliberate modular cluster;
// a restrained source-plus rhythm adds structure without looking like a grid UI.
const mural15=svg(
 rect(0,0,W,H,C.white)+rect(0,0,118,H,C.lavender)+
 rect(2720,0,1376,H,C.lavender)+
 text('МАЙСТЕРНЯ',285,415,206,C.black,{weight:700,width:2220})+
 text('ІДЕЙ.',285,710,270,C.blue,{weight:700,width:1160})+
 text('Досліджуємо. Створюємо. Втілюємо.',285,960,94,C.black,{width:2170})+
 art(wordmark,285,1480,2150,668,C.black)+
 art(checker,2895,250,1020,1020,C.blue)+
 art(cross,2900,1580,360,360,C.blue)+
 art(quarters,3440,1575,460,460,C.white)+
 rect(285,2240,870,20,C.lime)
);

// A geometric horizon offers an alternative to the logo-dominant walls. Three
// large overlapping fields are counterbalanced by a modest, exact source mark.
const mural16=svg(
 rect(0,0,W,H,C.white)+
 `<path d="M0 0H1460V1460C654 1460 0 806 0 0Z" fill="${C.lavender}"/>`+
 `<path d="M0 1550L1420 780V2304H0Z" fill="${C.blue}"/>`+
 art(quarters,310,250,750,750,C.white)+
 text('ПРОСТІР',1730,430,220,C.black,{weight:700,width:2080})+
 text('МОЖЛИВОСТЕЙ.',1730,710,166,C.blue,{weight:700,width:2080})+
 text('Відкрита думка.',1730,1020,116,C.black,{width:1910})+
 text('Сильна команда.',1730,1200,116,C.black,{width:1910})+
 rect(1730,1370,2080,17,C.lime)+
 art(wordmark,1730,1590,2080,646,C.black)+
 art(diagonal,285,2050,860,131,C.lime)
);

const definitions=[
 {id:'mural-1',index:1,label:'EDS · енергія та цінності',description:'Монументальний логотип, синя й лаймова діагоналі та чорна стіна цінностей.',body:mural1},
 {id:'mural-2',index:2,label:'EDS · спільні ідеї',description:'Світла композиція, великий синій логотип, лавандова геометрія та лаймовий акцент.',body:mural2},
 {id:'mural-3',index:3,label:'EDS · культура співдії',description:'Чорна типографічна стіна з білим логотипом, корпоративними цінностями й кольоровими полями.',body:mural3},
 {id:'mural-4',index:4,label:'EDS · простір для діалогу',description:'Синя колона з парними чвертями, редакційна типографіка та світле поле для відкритої розмови.',body:mural4},
 {id:'mural-5',index:5,label:'EDS · інженерія рішень',description:'Інженерні траси, точні знаки та великий чорний логотип на світлому полі.',body:mural5},
 {id:'mural-6',index:6,label:'EDS · сила партнерства',description:'Асиметрична чорна колона та великі взаємопов’язані лавандові й сині корпоративні форми.',body:mural6},
 {id:'mural-7',index:7,label:'EDS · спокійна енергія',description:'Повітряна світла композиція з великими лавандовими формами, чітким логотипом і невеликим лаймовим акцентом.',body:mural7},
 {id:'mural-8',index:8,label:'EDS · енергія майбутнього',description:'Монументальний білий логотип на корпоративному синьому полі з лаймовими геометричними акцентами.',body:mural8},
 {id:'mural-9',index:9,label:'EDS · точка зростання',description:'Лавандове архітектурне поле, сходинки шахового модуля та простора типографіка.',body:mural9},
 {id:'mural-10',index:10,label:'EDS · напрям руху',description:'Світле поле, дві монументальні стріли на синій колоні та стриманий лаймовий акцент.',body:mural10},
 {id:'mural-11',index:11,label:'EDS · відкриті координати',description:'Сітка координат, вкладений квадрат і чітка редакційна типографіка на світлій стіні.',body:mural11},
 {id:'mural-12',index:12,label:'EDS · баланс енергії',description:'Горизонтальний лавандовий пояс, великі парні чверті та спокійний ритм написів.',body:mural12},
 {id:'mural-13',index:13,label:'EDS · командний ритм',description:'Чорне поле, великі шахові модулі, виразний білий логотип і короткі командні цінності.',body:mural13},
 {id:'mural-14',index:14,label:'EDS · чіткий курс',description:'Велика світла зона, синій нижній пояс, оптичний центр і точний корпоративний знак.',body:mural14},
 {id:'mural-15',index:15,label:'EDS · майстерня ідей',description:'Світла студійна стіна з лавандовою колоною, шаховим модулем і простим ритмом форм.',body:mural15},
 {id:'mural-16',index:16,label:'EDS · простір можливостей',description:'Геометричний горизонт із синіх і лавандових полів, білим простором і великим точним логотипом.',body:mural16}
];
// Sixteen compositions and twelve independently positioned motifs share one
// 4096² sampler; the six-shadow High pipeline needs no extra texture unit.
const atlasSize=4096,tileW=992,tileH=558;
const positions=definitions.map((_,i)=>[16+(i%4)*1024,16+Math.floor(i/4)*590]);
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
for(let i=0;i<motifLibrary.motifs.length;i++){
 const motif=motifLibrary.motifs[i],x=16+(i%4)*1024,y=2496+Math.floor(i/4)*512;
 const input=await sharp(path.join(root,'public',motif.png)).resize(992,480,{fit:'fill'}).png().toBuffer();
 // A transparent gutter isolates alpha masks from their neighbours. Unlike
 // opaque murals, negative space must never be edge-extruded as solid paint.
 composites.push({input,left:x,top:y});
 const tile=tileMetadata(`motif-${i+1}`,'motif',x,y,992,480,{index:i+1,label:motif.label,alphaMask:true,physicalTileMeters:i<3?palette.motifs[i+1].tileMeters:motif.defaultSize,defaultSize:motif.defaultSize,sourceSvg:motif.svg});
 tiles.push(tile);Object.assign(motif,{pixelRectTopLeft:tile.pixelRectTopLeft,uvRectBottomLeft:tile.uvRectBottomLeft});
}
const atlas=await sharp({create:{width:atlasSize,height:atlasSize,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toBuffer();
await fs.writeFile(path.join(out,'wall-print-atlas.png'),atlas);
await sharp(atlas).webp({lossless:true,effort:6}).toFile(path.join(out,'wall-print-atlas.webp'));
const meta={schemaVersion:1,width:atlasSize,height:atlasSize,colorSpace:'srgb',alpha:'unpremultiplied',texture:'assets/brand/murals/wall-print-atlas.webp',png:'assets/brand/murals/wall-print-atlas.png',orientation:{source:'top-left image pixels',textureFlipY:true,uv:'bottom-left WebGL UV; sample uvRect.xy + localUV * uvRect.zw, localUV.y points up'},gutterPixels:16,sourceResolution:[W,H],sourceBrandSHA256:palette.source.sha256,wordmarkSHA256:createHash('sha256').update(wordmark).digest('hex'),tiles};
await fs.writeFile(path.join(out,'atlas.json'),JSON.stringify(meta,null,2)+'\n');
Object.assign(motifLibrary,{width:atlasSize,height:atlasSize,texture:meta.texture,png:meta.png,orientation:meta.orientation,gutterPixels:16});
await fs.writeFile(path.join(brand,'motif-library.json'),JSON.stringify(motifLibrary,null,2)+'\n');
const sheet=await sharp({create:{width:2400,height:8*735,channels:4,background:C.white}}).composite(previewBuffers.flatMap((input,i)=>{const x=(i%2)*1200,y=Math.floor(i/2)*735;return[{input,left:x,top:y+60},{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="60">${rect(0,0,1200,60,C.white)}${text(`${i+1} / ${definitions[i].label}`,25,42,30,C.black,{weight:600})}</svg>`),left:x,top:y}];})).png().toBuffer();
await fs.writeFile(path.join(notes,'contact-sheet.png'),sheet);
await fs.writeFile(path.join(notes,'README.md'),"# EDS wall paintings\n\nThese are full-wall paint compositions, not raised boards. Sixteen vector-native designs use the exact supplied EDS wordmark, diagonal, plus field, quarter-disc, checker, arrow, nested square and crosshair grammar. The original eight SVG sources retain their geometry and typography unchanged. Designs 9–16 add growth, direction, coordinates, balance, teamwork, precision, studio and possibility compositions. Corporate colors are #0B30C1, #A2B8FE, #A0FF3D, #F0F0F0 and #000000.\n\nRebuild: `node tools/prepare-wall-murals.mjs`; this also refreshes the independent motif library first. Sources remain editable 4096 × 2304 SVGs, with 1200 × 675 previews. One combined 4096² atlas holds all 16 opaque murals and 12 alpha-mask motifs. Each mural tile is 992 × 558 px with 16 px edge extrusion. Motif tiles are 992 × 480 with transparent gutters; runtime aspect follows each motif object's physical width and height. No additional art sampler is required.\n\nUse atlas.json uvRectBottomLeft with Texture.flipY=true. RGB is sRGB paint color; motif alpha is a mask tinted by the chosen object color. Murals and motifs must be clipped to the actual wall, its openings and its painted height below the black structural band. Nothing in these textures represents a photographed doorway, floor, ceiling or furniture.\n\nThe EDS wordmark is preserved exactly, only uniformly scaled and placed. WebP is lossless; PNG is retained for local tools. All runtime assets are local and need no font download, external service or backend. The vector reference copy is assets-src/brand/eds-design-elements.svg.\n");
console.log(JSON.stringify({output:out,atlasBytes:(await fs.stat(path.join(out,'wall-print-atlas.webp'))).size,tiles:tiles.map(t=>({id:t.id,uv:t.uvRectBottomLeft})),contactSheet:path.join(notes,'contact-sheet.png')},null,2));
