/** Reproducible local microdetail for the cabinet planter. */
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('public/assets/materials/planter');await mkdir(out,{recursive:true});
const fract=x=>x-Math.floor(x),noise=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453123),clamp=x=>Math.max(0,Math.min(255,Math.round(x)));
const size=1024,leaf=Buffer.alloc(size*size*3),soil=Buffer.alloc(size*size*3);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const u=x/(size-1),v=y/(size-1),center=Math.abs(u-.5),micro=noise(x,y),fine=noise(Math.floor(x/2),Math.floor(y/2));
 const midrib=Math.exp(-center*240),diagonal=Math.abs(fract(v*13-center*7)-.5),vein=Math.exp(-diagonal*65)*(1-Math.exp(-center*12));
 const irregular=.5+.5*Math.sin(u*37+v*29+Math.sin(v*17)*2),mottle=.5+.5*Math.sin(u*29+Math.sin(v*20)*2.3)*Math.sin(v*26+u*11);
 const brightness=231+10*irregular+10*mottle+(micro-.5)*12+(fine-.5)*7-55*midrib-43*vein;
 let i=(y*size+x)*3;leaf[i]=clamp(brightness*.96);leaf[i+1]=clamp(brightness);leaf[i+2]=clamp(brightness*.94);
 const grain=noise(x,y),coarse=noise(Math.floor(x/4),Math.floor(y/4)),small=noise(Math.floor(x/9),Math.floor(y/9));
 const tone=20+12*grain+22*coarse+12*small,chip=coarse>.91?26:0;
 soil[i]=clamp(tone*1.32+chip);soil[i+1]=clamp(tone*.90+chip*.72);soil[i+2]=clamp(tone*.58+chip*.40);
}
await Promise.all([sharp(leaf,{raw:{width:size,height:size,channels:3}}).png().toFile(path.join(out,'pothos-leaf.png')),sharp(soil,{raw:{width:size,height:size,channels:3}}).png().toFile(path.join(out,'soil.png'))]);
console.log('Prepared detailed local leaf and soil textures.');
