/** Actual production-canvas regression. Runs in a disposable browser context;
 * it never opens the user's browser or reads/modifies their saved draft. */
import './browser-path.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const url=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const output=path.resolve(process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)??'test-results/hall-composition');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
const context=await browser.newContext({viewport:{width:1440,height:950},deviceScaleFactor:1});
await context.addInitScript(()=>localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:'archviz',quality:'medium',region:'hall'})));
const page=await context.newPage(),errors=[],report={url,status:'running',presets:[],errors};
page.on('pageerror',error=>errors.push('page: '+error.message));
page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text());});
page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()} ${response.url()}`);});
page.on('requestfailed',request=>{if(request.failure()?.errorText!=='net::ERR_ABORTED')errors.push(`network ${request.failure()?.errorText} ${request.url()}`);});
const settle=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(120);};
const pose=async (x,fov=62)=>{await page.evaluate(({x,fov})=>{const v=window.__ROOM_ATELIER__.view;v.navigation.setEnabled(false);v.keepCameraSafe=()=>{};v.camera.fov=fov;v.camera.updateProjectionMatrix();v.camera.position.set(x,1.65,-4.92);v.camera.lookAt(x,1.65,-3.15);v.camera.updateMatrixWorld(true);v.shadowDirty=true;},{x,fov});await settle();};
const pixelDifference=async(a,b)=>{const [aRaw,bRaw]=await Promise.all([sharp(a).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sharp(b).ensureAlpha().raw().toBuffer()]);let changed=0;for(let i=0;i<aRaw.data.length;i+=4)if(Math.abs(aRaw.data[i]-bRaw[i])+Math.abs(aRaw.data[i+1]-bRaw[i+1])+Math.abs(aRaw.data[i+2]-bRaw[i+2])>30)changed++;return changed;};
try{
 await page.goto(url,{timeout:120000});await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading'),null,{timeout:240000});
 await page.getByTestId('region-hall').click();
 for(let index=0;index<8;index++){
  await page.getByTestId('preset-select').selectOption('hall-preset-'+index);
  await page.waitForFunction(index=>window.__ROOM_ATELIER__.store.state.regionPresets.hall.presetId==='hall-preset-'+index,index,{timeout:30000});
  const state=await page.evaluate(()=>{const a=window.__ROOM_ATELIER__,v=a.view,gl=v.renderer.getContext();return {motifs:a.store.state.objects.filter(o=>o.assetId==='corporateMotif'&&o.wallId==='wall-21'&&o.regionId==='hall').map(o=>({id:o.id,variant:o.variant,position:o.position,graphic:o.graphic})),mode:a.getMode(),glError:gl.getError(),build:[...document.scripts].map(s=>s.src)};});
  assert.equal(state.mode,'archviz');assert.equal(state.glError,0);assert(state.motifs.length>=4,`hall preset ${index}: expected four or more independently editable motifs`);
  assert(new Set(state.motifs.map(o=>`${o.graphic.width}:${o.graphic.height}`)).size>=2,`hall preset ${index}: motifs have same dimensions`);
  assert(state.motifs.some(o=>Math.abs(o.graphic.angle)>.01),`hall preset ${index}: no rotated motifs`);
  const before=[];for(const [n,x]of [['left',-1.25],['right',1.25]]){await pose(x);const bytes=await page.locator('#viewport canvas').screenshot();before.push(bytes);await fs.writeFile(path.join(output,`hall-${index}-${n}.png`),bytes);}
  await pose(0,95);await page.locator('#viewport canvas').screenshot({path:path.join(output,`hall-${index}-overview.png`)});
  await page.evaluate(ids=>ids.forEach(id=>window.__ROOM_ATELIER__.store.remove(id)),state.motifs.map(o=>o.id));await settle();
  const changed=[];for(const [i,x]of [-1.25,1.25].entries()){await pose(x);const without=await page.locator('#viewport canvas').screenshot();changed.push(await pixelDifference(before[i],without));}
  assert(changed.some(n=>n>1000),`hall preset ${index}: artwork did not change actual wall pixels (${changed})`);
  report.presets.push({index,count:state.motifs.length,motifs:state.motifs,changedPixels:changed,build:state.build});console.log('PASS hall-preset-'+index,'motifs',state.motifs.length,'pixels',changed.join('/'));
 }
 assert.deepEqual(errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack??String(error);console.error(report.failure);process.exitCode=1;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
