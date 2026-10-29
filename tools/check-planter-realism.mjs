import './browser-path.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),output='E:/ArchViz_Resources/qa/planter-realism';await mkdir(output,{recursive:true});
const html=`<!doctype html><html><head><style>body{margin:0}canvas{display:block}</style></head><body><script type="module">
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createPlanter} from '/src/catalog/planter.ts';
import {MaterialLibrary} from '/src/assets/materials.ts';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,900);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#cbd0c9');const camera=new THREE.PerspectiveCamera(38,4/3,.01,20);
scene.environment=new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.75;
scene.add(new THREE.HemisphereLight('#ffffff','#838c79',1.5));const key=new THREE.DirectionalLight('#fff6e7',3);key.position.set(-2,4,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=2;key.shadow.camera.bottom=-2;key.shadow.camera.near=.1;key.shadow.camera.far=10;key.shadow.normalBias=.002;key.shadow.bias=-.0001;scene.add(key);const fill=new THREE.DirectionalLight('#d8e7ff',1);fill.position.set(3,2,-2);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({color:'#b3b7ad',roughness:.95}));floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
const library=new MaterialLibrary(renderer);let active,lease;
window.renderPlanter=async(proxy,angle=0)=>{if(active)scene.remove(active);lease?.release();active=createPlanter([1.1,.9,.3],{id:'oat',label:'Вівсяна',color:'#c8bca8',surface:'fabric'},proxy);scene.add(active);const shell=active.getObjectByName('Planter_oiled_oak');lease=await library.acquire('wood-oak','high',{color:'#9b7353',metersPerUv:1,normalStrength:.1,anisotropy:8});shell.material=lease.material;
camera.position.set(...(angle===1?[.7,1.5,1.05]:angle===2?[-1.15,.8,-1.5]:[1.28,.98,1.65]));camera.lookAt(0,.45,0);camera.updateMatrixWorld();renderer.render(scene,camera);await new Promise(r=>requestAnimationFrame(r));renderer.render(scene,camera);return{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,bounds:new THREE.Box3().setFromObject(active).getSize(new THREE.Vector3()).toArray()};};window.ready=true;
</script></body></html>`;
const server=await createServer({root,server:{host:'127.0.0.1',port:0},appType:'custom',optimizeDeps:{noDiscovery:true},plugins:[{name:'planter-proof',configureServer(v){v.middlewares.use('/__planter',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await v.transformIndexHtml('/__planter',html));});}}]});
let browser;try{await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__planter`);await page.waitForFunction(()=>window.ready);const report=[];for(const [name,proxy,angle]of [['production',false,0],['production-top',false,1],['production-back',false,2],['editor',true,0]]){report.push({name,...await page.evaluate(([p,a])=>window.renderPlanter(p,a),[proxy,angle])});await page.locator('canvas').screenshot({path:path.join(output,name+'.png')});}if(errors.length)throw Error(errors.join('\n'));await writeFile(path.join(output,'report.json'),JSON.stringify({verifiedAt:new Date().toISOString(),browser:'Chromium WebGL2 / ANGLE D3D11',errors,report},null,2));console.log(JSON.stringify({output,report}));}finally{await browser?.close();await server.close();}
