import './browser-path.mjs';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'test-results','beanbag-realism');await mkdir(output,{recursive:true});
const html=`<!doctype html><html><style>body{margin:0;background:#deded8}canvas{display:block}</style><script type="module">
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createAssetObject,disposeAssetObject} from '/src/catalog/geometry.ts';
import {MaterialLibrary} from '/src/assets/materials.ts';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(800,750);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#deded8');const camera=new THREE.PerspectiveCamera(36,800/750,.01,100);
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.3;
scene.add(new THREE.HemisphereLight('#ffffff','#a7b1a3',1.3));const key=new THREE.DirectionalLight('#fff8eb',3);key.position.set(-3,5,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=2;key.shadow.camera.bottom=-2;key.shadow.normalBias=.003;scene.add(key);const fill=new THREE.DirectionalLight('#e5efff',.7);fill.position.set(3,2,-2);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#c3c4bb',roughness:.95}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=-.0005;scene.add(floor);
const library=new MaterialLibrary(renderer);let active,lease;
window.draw=async(variant,mode,cloth)=>{if(active){scene.remove(active);disposeAssetObject(active);lease?.release();lease=null;}active=createAssetObject('beanBag',variant,'eds-lavender',mode);scene.add(active);
if(cloth){lease=await library.acquire('fabric-woven','high',{color:'#a2b8fe',metersPerUv:1,normalStrength:.05,anisotropy:8});lease.material.roughness=.96;active.traverse(o=>{if(o.isMesh){const old=o.material;o.material=lease.material;old.dispose();}});}else active.traverse(o=>{if(o.isMesh)o.material.color.set('#a4a9aa');});
const bounds=new THREE.Box3().setFromObject(active),center=bounds.getCenter(new THREE.Vector3());camera.position.copy(center).add(new THREE.Vector3(1.25,.92,1.7).normalize().multiplyScalar(2.5));camera.lookAt(center);camera.updateProjectionMatrix();renderer.render(scene,camera);return {triangles:active.children[0].geometry.index.count/3,renderedTriangles:renderer.info.render.triangles,geometry:active.children[0].geometry.userData};};window.ready=true;
</script></html>`;
const server=await createServer({root,server:{host:'127.0.0.1',port:0},appType:'custom',plugins:[{name:'beanbag-proof',configureServer(vite){vite.middlewares.use('/__beanbag_proof',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/__beanbag_proof',html));});}}]});let browser;
try{await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});const page=await browser.newPage({viewport:{width:800,height:750}});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__beanbag_proof');await page.waitForFunction(()=>window.ready===true);const rows=[],report=[];
for(const cloth of [false,true]){const panels=[];for(const variant of [1,2,3]){const stats=await page.evaluate(async({variant,cloth})=>window.draw(variant,'archviz',cloth),{variant,cloth});const image=await page.locator('canvas').screenshot();await writeFile(path.join(output,'beanBag-'+variant+(cloth?'-fabric':'-clay')+'.png'),image);panels.push({input:await sharp(image).resize(600,562).toBuffer(),left:(variant-1)*600,top:0});report.push({variant,cloth,...stats});}rows.push(await sharp({create:{width:1800,height:562,channels:3,background:'#deded8'}}).composite(panels).png().toBuffer());}
await sharp({create:{width:1800,height:1124,channels:3,background:'#deded8'}}).composite(rows.map((input,i)=>({input,left:0,top:i*562}))).png().toFile(path.join(output,'source-contact-sheet.png'));if(errors.length)throw new Error(errors.join('\n'));await writeFile(path.join(output,'source-report.json'),JSON.stringify({errors,report},null,2));console.log(JSON.stringify({output,errors,report}));}finally{await browser?.close();await server.close();}
