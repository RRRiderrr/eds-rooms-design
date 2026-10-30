import './browser-path.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const url=process.argv.find(x=>x.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const out=path.resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'test-results/mobile-memory');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});const results=[];
try{
 for(const [name,phone] of [['desktop',false],['phone',true]]){
  const page=await browser.newPage({viewport:phone?{width:412,height:915}:{width:1280,height:800},deviceScaleFactor:phone?3.5:1,isMobile:phone,hasTouch:phone});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:'archviz',quality:'high',region:'hall'})));
  await page.goto(url);await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading'),null,{timeout:180000});
  const tiers=[];for(const tier of ['high','medium','low','high']){
   await page.evaluate(async tier=>{const v=window.__ROOM_ATELIER__.view;v.quality.setManual(tier);await v.tierRefresh;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},tier);
   const result=await page.evaluate(()=>{const v=window.__ROOM_ATELIER__.view,gl=v.renderer.getContext(),lamps=v.directLighting.group.children.filter(o=>o.isSpotLight);return{tier:v.quality.settings.level,samples:v.composer.renderTarget1.samples,quality:v.quality.settings,aa:v.aa.enabled,viewport:[v.renderer.domElement.width,v.renderer.domElement.height],textures:v.renderer.info.memory.textures,liveShadowMaps:lamps.filter(l=>l.shadow.map).length,casting:lamps.filter(l=>l.castShadow).length,glError:gl.getError()};});
   assert.equal(result.tier,tier);assert.equal(result.liveShadowMaps,result.casting,`${name}/${tier}: maps retained after shadow disabled`);assert.equal(result.casting,tier==='high'?6:tier==='medium'?2:0);assert.equal(result.glError,0);
   assert.equal(result.samples,Math.min(tier==='high'?(phone?2:4):tier==='medium'?2:0,await page.evaluate(()=>window.__ROOM_ATELIER__.view.renderer.capabilities.maxSamples)));
   assert.equal(result.aa,tier!=='low');tiers.push(result);if(tier==='high'&&tiers.length===1)await page.screenshot({path:path.join(out,`${name}-high.png`)});
  }
  assert.deepEqual(errors,[]);results.push({name,tiers,errors});console.log('PASS',name,tiers.map(x=>`${x.tier}:${x.liveShadowMaps} shadows/${x.samples} samples`).join(' '));await page.close();
 }
 await writeFile(path.join(out,'report.json'),JSON.stringify({url,status:'passed',results},null,2));
}finally{await browser.close();}
