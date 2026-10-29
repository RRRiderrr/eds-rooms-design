import './browser-path.mjs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'test-results/plaque-labels');await mkdir(output,{recursive:true});
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}canvas{display:block}</style></head><body><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {createAssetObject} from '/src/catalog/geometry.ts';
import {getAsset} from '/src/catalog/catalog.ts';
import {applyPlaqueLabel} from '/src/graphics/plaque-labels.ts';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1024,384);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
window.testPrint=async(mode,variant,quarter,labelValue,underlayColor)=>{
 const root=mode==='editor'?createAssetObject('doorPlaque',variant,getAsset('doorPlaque').materials[0].id,'editor'):(await loader.loadAsync('/assets/models/doorPlaque-'+variant+'.glb')).scene;
 // Runtime production models share geometry with cache templates.
 if(mode==='production')root.traverse(o=>{if(o.isMesh)o.userData.sharedGeometry=true;});
 applyPlaqueLabel(root,{id:'test-print',assetId:'doorPlaque',variant,material:getAsset('doorPlaque').materials[0].id,label:labelValue??'03\\nПереговорна',position:[0,0,0],rotation:quarter*Math.PI/2},underlayColor);
 await new Promise(r=>setTimeout(r,100));
 const label=root.getObjectByName('DoorPlaque_Label');
 const scene=new THREE.Scene();scene.background=new THREE.Color(underlayColor??'#fff');const pivot=new THREE.Group();scene.add(pivot);pivot.add(label);
 const bounds=new THREE.Box3().setFromObject(label),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const camera=new THREE.OrthographicCamera(-size.x/2,size.x/2,size.y/2,-size.y/2,.001,10);
 pivot.rotation.y=quarter*Math.PI/2;const target=center.clone().applyAxisAngle(new THREE.Vector3(0,1,0),pivot.rotation.y);camera.position.copy(target).add(new THREE.Vector3(Math.sin(pivot.rotation.y),0,Math.cos(pivot.rotation.y)));camera.lookAt(target);camera.updateMatrixWorld();renderer.render(scene,camera);
 const expected=document.createElement('canvas');expected.width=1024;expected.height=384;const ctx=expected.getContext('2d');ctx.fillStyle=underlayColor??'#fff';ctx.fillRect(0,0,1024,384);ctx.drawImage(label.material.map.image,0,0);
 const a=new Uint8Array(1024*384*4);renderer.getContext().readPixels(0,0,1024,384,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,a);const b=ctx.getImageData(0,0,1024,384).data;let total=0,bad=0;
 for(let y=0;y<384;y++)for(let x=0;x<1024;x++){let delta=0;for(let k=0;k<3;k++)delta+=Math.abs(a[((383-y)*1024+x)*4+k]-b[(y*1024+x)*4+k]);total+=delta;if(delta>120)bad++;}
 const raw=label.material.map.image.getContext('2d').getImageData(0,0,1024,384).data;let alphaMinY=384,alphaMaxY=-1,inkPixels=0;for(let y=0;y<384;y++)for(let x=0;x<1024;x++)if(raw[(y*1024+x)*4+3]>16){alphaMinY=Math.min(alphaMinY,y);alphaMaxY=Math.max(alphaMaxY,y);inkPixels++;}const stats={mode,variant,quarter,meanError:total/(1024*384*3),badPixels:bad,textureFlipY:label.material.map.flipY,frontOnly:label.material.side===THREE.FrontSide,geometryOwned:!label.userData.sharedGeometry,printedText:label.material.userData.printedText,printedLines:label.material.userData.printedLines,inkColor:label.material.userData.inkColor,inkPixels,alphaMinY,alphaMaxY};
 root.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});return stats;
};window.ready=true;
</script></body></html>`;
const server=await createServer({root,server:{host:'127.0.0.1',port:0},appType:'custom',plugins:[{name:'plaque-print-test',configureServer(vite){vite.middlewares.use('/__plaque_print_test',async(_req,res)=>{res.statusCode=200;res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/__plaque_print_test',html));});}}]});
let browser;const report=[],tiles=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});const page=await browser.newPage({viewport:{width:1024,height:384},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__plaque_print_test');await page.waitForFunction(()=>window.ready===true);
 for(const mode of ['editor','production'])for(let variant=1;variant<=3;variant++)for(let quarter=0;quarter<4;quarter++){
  const result=await page.evaluate(([m,v,q])=>window.testPrint(m,v,q),[mode,variant,quarter]);report.push(result);assert(result.meanError<2.5,JSON.stringify(result));assert(result.frontOnly&&result.geometryOwned);
  const image=await page.locator('canvas').first().screenshot();tiles.push({input:await sharp(image).resize(512,192).png().toBuffer(),left:quarter*512,top:((mode==='editor'?0:3)+variant-1)*192});
 }
 const multiline=[],multilineTiles=[],text='15\nВхід\n\nКімната команди\nПонеділок–п’ятниця\n09:00–18:00\nПодробиці та контакти';
 for(let variant=1;variant<=3;variant++)for(const [index,value]of ['15',text,''].entries()){
  const result=await page.evaluate(([v,label])=>window.testPrint('production',v,0,label),[variant,value]);multiline.push(result);assert.equal(result.printedText,value);assert.deepEqual(result.printedLines,value.split('\n'));assert(result.meanError<2.5,JSON.stringify(result));if(!index){assert(result.alphaMinY>60&&result.alphaMaxY<324,'A number-only print must have no brand header or footer');assert(result.inkPixels>1000);}if(index===1)assert(result.alphaMinY>16&&result.alphaMaxY<368,'Multiline text clips outside print bounds');if(index===2)assert.equal(result.inkPixels,0,'An intentionally blank plaque must stay blank');
  multilineTiles.push({input:await sharp(await page.locator('canvas').first().screenshot()).resize(512,192).png().toBuffer(),left:index*512,top:(variant-1)*192});
 }
 const contrast=await page.evaluate(()=>window.testPrint('production',1,0,'15','#0b30c1'));assert.equal(contrast.inkColor,'#ffffff');assert.equal(contrast.printedText,'15');assert(contrast.meanError<2.5);multiline.push(contrast);
 await sharp({create:{width:1536,height:576,channels:3,background:'#fff'}}).composite(multilineTiles).png().toFile(path.join(output,'multiline-number-proofs.png'));
 assert.equal(errors.length,0,errors.join('\n'));await sharp({create:{width:2048,height:1152,channels:3,background:'#fff'}}).composite(tiles).png().toFile(path.join(output,'all-variants-four-walls.png'));await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,cases:report,multiline,errors},null,2));console.log('PASS 24 orientation renders + 10 plain/multiline/blank/contrast renders; actual WebGL pixels agree with upright per-instance canvas prints.');
}finally{await browser?.close();await server.close();}
