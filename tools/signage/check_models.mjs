/** Visual/geometric QA of the real composite signs; never changes the user scene. */
import '../browser-path.mjs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exported = process.argv.includes('--exported');
const output = path.join(root, 'assets-src/signage/previews', exported ? 'exported' : ''); await fs.mkdir(output, { recursive: true });
const html = `<!doctype html><html><head><style>html,body{margin:0;background:#d3d4d2}canvas{display:block}</style></head><body><script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createSignageObject,SIGNAGE_MODELS } from '/src/catalog/signage.ts';
const useExported=${exported},gltfLoader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,900);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#d3d4d2');const camera=new THREE.PerspectiveCamera(36,1280/900,.001,50);scene.environment=new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.85;
scene.add(new THREE.HemisphereLight('#ffffff','#a4a69a',1.3));const light=new THREE.DirectionalLight('#fff7e8',3);light.position.set(-2.5,3,4);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-3;light.shadow.camera.right=3;light.shadow.camera.top=2;light.shadow.camera.bottom=-2;light.shadow.bias=-.00003;light.shadow.normalBias=.001;scene.add(light);
const wall=new THREE.Mesh(new THREE.PlaneGeometry(30,20),new THREE.MeshStandardMaterial({color:'#d2d2cb',roughness:.95}));wall.position.z=-.002;wall.receiveShadow=true;scene.add(wall);
let active;window.renderSignage=async(id,oblique=false,proxy=false)=>{
if(active){scene.remove(active);active.traverse(n=>{if(n.isMesh){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material]){m.map?.dispose();m.dispose();}}});}
active=useExported?(await gltfLoader.loadAsync('/assets/'+(proxy?'proxies':'models')+'/edsSignage-'+(SIGNAGE_MODELS.findIndex(model=>model.id===id)+1)+'.glb')).scene:createSignageObject(id,proxy);scene.add(active);const jobs=[];active.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(m.userData.printUri&&!proxy&&!useExported)jobs.push(new THREE.TextureLoader().loadAsync('/'+m.userData.printUri).then(texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;m.map=texture;m.needsUpdate=true;}));});await Promise.all(jobs);
const bounds=new THREE.Box3().setFromObject(active),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());wall.position.z=bounds.min.z-.002;const distance=Math.max(size.y/2/Math.tan(THREE.MathUtils.degToRad(18)),size.x/2/Math.tan(THREE.MathUtils.degToRad(18))/(1280/900))*1.14;camera.position.copy(center).add(new THREE.Vector3(oblique?.36:0,oblique?.15:0,1).normalize().multiplyScalar(distance));camera.lookAt(center);camera.updateProjectionMatrix();renderer.render(scene,camera);await new Promise(r=>requestAnimationFrame(r));renderer.render(scene,camera);
let vertices=0,invalid=0,triangles=0;active.traverse(n=>{if(n.isMesh){const p=n.geometry.getAttribute('position');vertices+=p.count;triangles+=(n.geometry.index?n.geometry.index.count:p.count)/3;for(const number of p.array)if(!Number.isFinite(number))invalid++;}});return {id,proxy,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},size:size.toArray(),vertices,invalid,triangles,renderTrianglesWithShadowPasses:renderer.info.render.triangles,drawCalls:renderer.info.render.calls};
};window.models=SIGNAGE_MODELS;window.ready=true;
</script></body></html>`;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, appType: 'custom', plugins: [{ name: 'signage-qc', configureServer(vite) { vite.middlewares.use('/__signage_qc', async (_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(await vite.transformIndexHtml('/__signage_qc', html)); }); } }] });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors=[];page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__signage_qc`); await page.waitForFunction(() => window.ready === true);
  const models = await page.evaluate(() => window.models), report=[];
  for (const model of models) {
    for (const mode of ['front', 'oblique', 'proxy']) {
      const stats = await page.evaluate(({id,mode}) => window.renderSignage(id,mode==='oblique',mode==='proxy'), { id:model.id,mode });
      await page.locator('canvas').screenshot({ path: path.join(output,`${model.id}-${mode}.png`) });
      if (mode !== 'oblique') report.push(stats);
    }
    console.log(`QC ${model.id}`);
  }
  const result={ generatedAt:new Date().toISOString(),source:'Actual createSignageObject geometry in Three.js WebGL2; original mapped ink only on real shape caps',models:report,errors };
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(result,null,2));
  if(errors.length||report.some(entry=>entry.invalid))throw new Error(JSON.stringify(result));
  console.log('SIGNAGE_GEOMETRY_AND_VISUAL_QA_READY');
} finally { await browser?.close();await server.close(); }
