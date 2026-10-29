import './browser-path.mjs';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const mapTest=process.argv.includes('--map-test');
const output=path.resolve(import.meta.dirname,'../test-results/wall-tiling-diagnostic/'+(mapTest?'shadow-map':'shadow-bias'));await mkdir(output,{recursive:true});
const cases=mapTest?[
 {id:'baseline',normalBias:.009,bias:-.00003,radius:3,near:.15,mapSize:1024},
 {id:'2048-n012-b100-r15-near30',normalBias:.012,bias:-.00010,radius:1.5,near:.30,mapSize:2048},
 {id:'2048-n012-b150-r10-near30',normalBias:.012,bias:-.00015,radius:1,near:.30,mapSize:2048},
 {id:'2048-n012-b150-r15-near50',normalBias:.012,bias:-.00015,radius:1.5,near:.50,mapSize:2048},
 {id:'2048-n020-b150-r15-near30',normalBias:.020,bias:-.00015,radius:1.5,near:.30,mapSize:2048},
 {id:'2048-n009-b30-r10-near15',normalBias:.009,bias:-.00003,radius:1,near:.15,mapSize:2048},
 {id:'no-shadows',normalBias:.009,bias:-.00003,radius:3,near:.15,mapSize:1024},
]:[
 {id:'baseline',normalBias:.009,bias:-.00003,radius:3,near:.15},
 {id:'n012-b100-r15-near30',normalBias:.012,bias:-.00010,radius:1.5,near:.30},
 {id:'n020-b150',normalBias:.020,bias:-.00015,radius:3,near:.15},
 {id:'n020-b300',normalBias:.020,bias:-.00030,radius:3,near:.15},
 {id:'n030-b150',normalBias:.030,bias:-.00015,radius:3,near:.15},
 {id:'n012-b100-r10-near30',normalBias:.012,bias:-.00010,radius:1,near:.30},
 {id:'no-display-dither',normalBias:.009,bias:-.00003,radius:3,near:.15},
 {id:'no-shadows',normalBias:.009,bias:-.00003,radius:3,near:.15},
];
const walls=[{id:'near',axis:'z',coordinate:-3.0488905,normal:[0,0,1],along:.137,y:1.557,distance:.4},
 {id:'hall23-close',axis:'z',coordinate:1.70492439,normal:[0,0,-1],along:-23.3,y:1.25,distance:.4},
 {id:'hall23-wide',axis:'z',coordinate:1.70492439,normal:[0,0,-1],along:-23.3,y:1.25,distance:1.8},
 {id:'hall38',axis:'z',coordinate:-5.1235115,normal:[0,0,1],along:-10,y:1.45,distance:.4},
];
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]}),report={cases,errors:[],results:[]};
try{
 const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto('http://127.0.0.1:4174/?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
 await page.evaluate(async()=>{const a=window.__ROOM_ATELIER__,config=structuredClone(a.store.state);config.objects=[];config.wallFinishes={};config.layers.grid=false;a.store.replace(config);a.select(null);a.view.quality.setManual('high');a.setMode('archviz');await a.view.archvizPromise;await a.view.tierRefresh;a.view.navigation.setEnabled(false);a.view.keepCameraSafe=()=>{};
  const walls=[];a.view.architecture.production.traverse(o=>{if(o.isMesh&&o.userData.archCategory==='walls')walls.push({o,receiveShadow:o.receiveShadow});});const output=a.view.composer.passes.find(p=>p.material?.fragmentShader?.includes('displayDither'));window.__WALL_SHADOW_DIAGNOSTIC__={walls,output,originalOutput:output.material.fragmentShader};
 });
 await page.addStyleTag({content:'.topbar,.library-panel,.footer,.mobile-dock,.viewport-area>:not(.viewport){display:none!important}.atelier,.workspace,.viewport-area{height:100vh!important;width:100vw!important;max-width:none!important;margin:0!important;padding:0!important}'});const panels=[];
 for(const [wi,wall]of walls.entries()){
  await page.evaluate(wall=>{const v=window.__ROOM_ATELIER__.view,Vec=v.camera.position.constructor,target=new Vec(wall.along,wall.y,wall.coordinate);v.camera.fov=62;v.camera.position.copy(target).addScaledVector(new Vec(...wall.normal),wall.distance);v.camera.lookAt(target);v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld(true);v.scene.updateMatrixWorld(true);v.shadowDirty=true;},wall);
  const result={wall:wall.id,settings:[]};report.results.push(result);
  for(const [ci,setting]of cases.entries()){
   const lamps=await page.evaluate(setting=>{const v=window.__ROOM_ATELIER__.view,d=window.__WALL_SHADOW_DIAGNOSTIC__;for(const {o,receiveShadow}of d.walls)o.receiveShadow=setting.id==='no-shadows'?false:receiveShadow;d.output.material.fragmentShader=setting.id==='no-display-dither'?d.originalOutput.replace('gl_FragColor.rgb += vec3(displayDither / 255.0);',''):d.originalOutput;d.output.material.needsUpdate=true;const lamps=[];v.directLighting.group.traverse(o=>{if(o.isLight&&o.shadow){Object.assign(o.shadow,{normalBias:setting.normalBias,bias:setting.bias,radius:setting.radius});const size=o.name.startsWith('Room_')?2048:(setting.mapSize??1024);if(o.shadow.mapSize.x!==size){o.shadow.map?.dispose();o.shadow.map=null;o.shadow.mapSize.set(size,size);}o.shadow.camera.near=setting.near;o.shadow.camera.updateProjectionMatrix();o.shadow.needsUpdate=true;if(o.castShadow)lamps.push({name:o.name,mapSize:o.shadow.mapSize.toArray(),near:o.shadow.camera.near,far:o.shadow.camera.far,normalBias:o.shadow.normalBias,bias:o.shadow.bias,radius:o.shadow.radius});}});v.shadowDirty=true;v.renderer.shadowMap.needsUpdate=true;return lamps;},setting);
   await page.waitForTimeout(230);const png=await page.locator('#viewport canvas').screenshot(),file=wall.id+'-'+setting.id+'.png';await writeFile(path.join(output,file),png);
   const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});const rowMeans=[];for(let y=150;y<info.height-150;y++){let sum=0;for(let x=200;x<info.width-200;x++){const i=(y*info.width+x)*3;sum+=(data[i]+data[i+1]+data[i+2])/3;}rowMeans.push(sum/(info.width-400));}
   let second=0,first=0;for(let i=1;i<rowMeans.length-1;i++){second+=(rowMeans[i-1]-2*rowMeans[i]+rowMeans[i+1])**2;first+=(rowMeans[i+1]-rowMeans[i])**2;}result.settings.push({id:setting.id,file,lamps,rowLaplacianRms:Math.sqrt(second/(rowMeans.length-2)),rowGradientRms:Math.sqrt(first/(rowMeans.length-2)),rowMeans});
   const small=await sharp(png).resize(400,300).toBuffer(),caption=Buffer.from(`<svg width="400" height="30"><rect width="400" height="30" fill="white"/><text x="8" y="20" font-family="Arial" font-size="14">${wall.id} · ${setting.id}</text></svg>`);panels.push({input:small,left:ci*400,top:wi*330+30},{input:caption,left:ci*400,top:wi*330});
  }
 }
 await sharp({create:{width:400*cases.length,height:330*walls.length,channels:3,background:'#fff'}}).composite(panels).png().toFile(path.join(output,'bias-comparison.png'));report.glError=await page.evaluate(()=>window.__ROOM_ATELIER__.view.renderer.getContext().getError());await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({errors:report.errors,glError:report.glError,results:report.results.map(r=>({wall:r.wall,settings:r.settings.map(({id,rowLaplacianRms,rowGradientRms})=>({id,rowLaplacianRms,rowGradientRms}))}))},null,2));
}finally{await browser.close();}
