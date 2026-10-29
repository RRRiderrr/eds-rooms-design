import './browser-path.mjs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'public/assets/preset-thumbnails');await mkdir(output,{recursive:true});
const vite=await createServer({root,server:{middlewareMode:true},appType:'custom'});
const {BUILTIN_PRESETS,HALL_PRESETS}=await vite.ssrLoadModule('/src/catalog/presets.ts');
const all=[...BUILTIN_PRESETS.map(p=>({region:'meeting',config:p,file:`preset-${p.presetId.split('-').pop()}.jpg`})),...HALL_PRESETS.map(p=>({region:'hall',config:p,file:`hall-${p.presetId.split('-').pop()}.jpg`}))];
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
const results=[];
try{
 const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});page.on('pageerror',error=>{throw error;});
 await page.goto('http://127.0.0.1:4174/?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
 await page.addStyleTag({content:'.topbar,.library-panel,.footer,.mobile-dock,.viewport-area>:not(.viewport){display:none!important}.atelier,.workspace,.viewport-area{height:100vh!important;width:100vw!important;max-width:none!important;margin:0!important;padding:0!important}'});
 await page.evaluate(async()=>{const a=window.__ROOM_ATELIER__;a.view.quality.setManual('medium');a.setMode('archviz');await a.view.archvizPromise;a.view.navigation.setEnabled(false);a.view.keepCameraSafe=()=>{};a.view.scene.background=null;});
 for(const entry of all){
  await page.evaluate(({region,config})=>{
   const {store,view:v}=window.__ROOM_ATELIER__;store.applyPreset(config);v.renderer.setPixelRatio(1);v.composer.setPixelRatio(1);v.resize();
   v.camera.fov=region==='meeting'?36:62;v.camera.updateProjectionMatrix();
   const eastStatement=!!config.wallFinishes?.east?.mural;
   if(region==='meeting'){v.camera.position.set(eastStatement?-7.2:7.2,9.7,-8);v.camera.lookAt(0,.4,0);}else{v.camera.position.set(-10.4,7.5,-7.1);v.camera.lookAt(-16,.3,.5);}v.camera.updateMatrixWorld();
   // Thumbnail cutaway uses layers on this offscreen view only. The production
   // application continues to protect and display all source architecture.
   const room=v.architecture.production.children[0],space=v.architecture.production.children[1];
   for(const group of [room,space])group?.traverse(o=>{const category=o.userData.archCategory,wallId=v.architecture.getMetadata(o)?.wallId;const hide=/ceiling|hvac|lighting/.test(category??'')||(region==='meeting'&&(group===space||[eastStatement?'wall-17':'wall-26','wall-21'].includes(wallId??'')||/door/.test(category??'')));o.layers.set(hide?2:0);});
  },entry);
  await page.waitForFunction(()=>[...window.__ROOM_ATELIER__.view.visuals.values()].every(v=>v.mode!=='archviz'||!!v.templateKey),null,{timeout:90000});
  await page.evaluate(region=>{const v=window.__ROOM_ATELIER__.view;for(const item of v.config.objects){const visual=v.visuals.get(item.id);if(visual)visual.root.traverse(o=>o.layers.set(item.regionId===region?0:2));}},entry.region);
  await page.waitForTimeout(160);const png=await page.locator('#viewport canvas').screenshot();await sharp(png).resize(500,375).jpeg({quality:88}).toFile(path.join(output,entry.file));results.push({region:entry.region,presetId:entry.config.presetId,file:entry.file});console.log('Rendered',entry.file);
 }
 await writeFile(path.join(output,'regions-manifest.json'),JSON.stringify({schemaVersion:1,source:'Actual current WebGL production assets, PBR, architecture and SceneState',renderedAt:new Date().toISOString(),images:results},null,2));
 await writeFile(path.join(output,'manifest.json'),JSON.stringify({source:'Actual current WebGL production assets, PBR, measured architecture and SceneState',renderedAt:new Date().toISOString(),items:results.map(r=>({presetId:r.presetId,image:`assets/preset-thumbnails/${r.file}`}))},null,2));
}finally{await browser.close();await vite.close();}
