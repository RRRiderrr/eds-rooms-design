import './browser-path.mjs';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:900,height:600},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__factory_qa__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"></body></html>'}));
await page.goto('http://127.0.0.1:5186/__factory_qa__');
const report=await page.evaluate(async()=>{
 const THREE=await import('/node_modules/three/build/three.module.js');
 const {HDRLoader}=await import('/node_modules/three/examples/jsm/loaders/HDRLoader.js');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,600);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.78;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(70,1.5,.1,50),loader=new HDRLoader();
 const manifest=await fetch('/assets/environment/factory-panorama.json').then(r=>r.json());const tiers=[];
 for(const quality of ['low','medium','high']){const t=await loader.loadAsync('/'+manifest.qualities[quality].hdr);tiers.push({quality,width:t.image.width,height:t.image.height,mapping:'equirectangular',container:'RGBE',sourceRadiometry:manifest.radiometry.source});if(quality==='high'){t.mapping=THREE.EquirectangularReflectionMapping;scene.background=t;}else t.dispose();}
 scene.backgroundIntensity=.85;scene.backgroundRotation.y=-Math.PI/2;
 const pmrem=new THREE.PMREMGenerator(renderer),reflection=pmrem.fromEquirectangular(scene.background);const sphere=new THREE.Mesh(new THREE.SphereGeometry(.45,48,24),new THREE.MeshPhysicalMaterial({color:0xffffff,metalness:0,roughness:.065,transmission:.8,thickness:.006,ior:1.5,envMap:reflection.texture,envMapIntensity:.9}));sphere.position.set(0,-.7,-2);scene.add(sphere);camera.lookAt(0,0,-1);renderer.render(scene,camera);
 globalThis.factoryQA={renderer,scene,camera,sphere,reflection,pmrem};return{tiers,reflection:!!reflection.texture,errors:renderer.getContext().getError()};
});
const out=path.join(root,'assets-src/previews');await fs.mkdir(out,{recursive:true});
const views=[['front',[0,0,-1]],['right',[1,0,0]],['back',[0,0,1]],['left',[-1,0,0]],['zenith',[0,.999,-.001]],['nadir',[0,-.999,-.001]]];
const thumbnails=[];
for(const [name,direction]of views){await page.evaluate(direction=>{const q=globalThis.factoryQA;q.camera.lookAt(...direction);q.renderer.render(q.scene,q.camera);},direction);const screenshot=await page.screenshot();thumbnails.push({input:await sharp(screenshot).resize(600,400).png().toBuffer(),left:(thumbnails.length%3)*600,top:Math.floor(thumbnails.length/3)*400});}
await sharp({create:{width:1800,height:800,channels:3,background:'#262b2d'}}).composite(thumbnails).png().toFile(path.join(out,'factory-panorama-six-views.png'));
const result={...report,pageErrors:errors};await fs.writeFile(path.join(root,'assets-src/environment/factory-panorama-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
if(errors.length||report.errors!==0||report.tiers.some(t=>t.width!==t.height*2))process.exitCode=1;
