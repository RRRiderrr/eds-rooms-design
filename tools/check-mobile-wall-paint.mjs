/** Isolated browser regression, not a claim of testing a physical phone GPU. */
import './browser-path.mjs';
import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const url=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const output=path.resolve(process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)??'test-results/mobile-wall-paint');
const requested=process.argv.find(arg=>arg.startsWith('--profiles='))?.slice(11).split(',');
const definitions=[{name:'chromium-phone',engine:chromium,phone:true},{name:'webkit-phone',engine:webkit,phone:true},{name:'driver-recovery',engine:chromium,phone:false,recovery:true}].filter(p=>!requested||requested.includes(p.name));
await fs.mkdir(output,{recursive:true});
const report={url,startedAt:new Date().toISOString(),status:'running',profiles:[],errors:[]};
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));

async function inspect(page){
 return page.evaluate(()=>{
  const app=window.__ROOM_ATELIER__,view=app.view,gl=view.renderer.getContext(),materials=new Set(),wallPrograms=[];
  view.architecture.production.traverse(object=>{
   if(!object.isMesh||object.userData.archCategory!=='walls')return;
   for(const material of Array.isArray(object.material)?object.material:[object.material])if(/^01_WALLS|^15_WALLS/.test(String(material.userData.blenderMaterialName??material.name)))materials.add(material);
  });
  for(const material of materials){
   const current=view.renderer.properties.get(material).currentProgram;if(!current)continue;
   const program=current.program,names=[];let samplerCount=0;
   for(let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++){
    const uniform=gl.getActiveUniform(program,i);names.push(uniform.name);
    if([gl.SAMPLER_2D,gl.SAMPLER_CUBE,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_2D_ARRAY,gl.SAMPLER_2D_ARRAY_SHADOW].includes(uniform.type))samplerCount+=uniform.size;
   }
   wallPrograms.push({material:material.name,linked:gl.getProgramParameter(program,gl.LINK_STATUS),portable:names.includes('paintPortable'),layerTable:names.includes('paintGraphics'),stripUniforms:names.some(n=>/^paintStrip(Rect|Style)/.test(n)),samplerCount});
  }
  const canvases=[...view.wallFinishes.bindings.values()].filter(b=>b.portableTexture).map(b=>({width:b.portableTexture.image.width,height:b.portableTexture.image.height,type:b.portableTexture.type}));
  let cachedRejectedPrograms=0;for(const wrapper of view.renderer.info.programs??[])if(!gl.getProgramParameter(wrapper.program,gl.LINK_STATUS))cachedRejectedPrograms++;
  const glErrors=[];for(let i=0;i<8;i++){const error=gl.getError();if(!error)break;glErrors.push(error);}
  return {mode:app.getMode(),quality:view.quality.settings.level,backend:view.wallFinishes.backend,wallPrograms,canvases,cachedRejectedPrograms,glErrors,policy:{coarse:matchMedia('(pointer:coarse)').matches,reportedFragmentVectors:gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),actualFragmentVectors:window.__actualFragmentVectors??gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),injectedRejections:window.__injectedPaintRejections??0},build:[...document.scripts].map(s=>s.src).filter(Boolean)};
 });
}

async function pose(page,kind){
 await page.evaluate(kind=>{
  const view=window.__ROOM_ATELIER__.view;view.controls.enabled=false;view.navigation.setEnabled(false);view.keepCameraSafe=()=>{};
  const position=kind==='meeting'?[.4,1.65,-1]:[15.3,1.65,-2.3],target=kind==='meeting'?[-2.6,1.65,-1]:[15.3,1.65,-5.1235];
  view.camera.position.set(...position);view.camera.lookAt(...target);view.camera.updateMatrixWorld(true);view.controls.target.set(...target);view.cameraSafe.copy(view.camera.position);view.shadowDirty=true;
 },kind);await settle(page);
}

async function wallPixels(page,profile,tier,kind){
 await pose(page,kind);
 const canvas=page.locator('#viewport canvas'),visible=await canvas.screenshot();
 await fs.writeFile(path.join(output,`${profile}-${tier}-${kind}.png`),visible);
 await page.evaluate(()=>{
  const view=window.__ROOM_ATELIER__.view,hidden=[];
  view.architecture.production.traverse(object=>{if(!object.isMesh||object.userData.archCategory!=='walls')return;for(const material of Array.isArray(object.material)?object.material:[object.material])if(/^01_WALLS|^15_WALLS/.test(String(material.userData.blenderMaterialName??material.name))&&!hidden.some(v=>v.material===material)){hidden.push({material,visible:material.visible});material.visible=false;}});
  window.__hiddenPaintMaterials=hidden;
 });
 let absent;
 try{await settle(page);absent=await canvas.screenshot();}
 finally{await page.evaluate(()=>{for(const item of window.__hiddenPaintMaterials??[])item.material.visible=item.visible;delete window.__hiddenPaintMaterials;});await settle(page);}
 const before=await sharp(visible).ensureAlpha().raw().toBuffer({resolveWithObject:true}),after=await sharp(absent).ensureAlpha().raw().toBuffer();
 let changed=0,colored=0;const {width,height}=before.info;
 for(let y=Math.floor(height*.2);y<Math.ceil(height*.8);y++)for(let x=Math.floor(width*.15);x<Math.ceil(width*.85);x++){
  const i=(y*width+x)*4,r=before.data[i],g=before.data[i+1],b=before.data[i+2];
  if(Math.abs(r-after[i])+Math.abs(g-after[i+1])+Math.abs(b-after[i+2])<24)continue;
  changed++;if(kind==='meeting'?b>r+20&&b>g+15:g>r+20&&b>r+20)colored++;
 }
 assert(changed>500,`${profile}/${tier}/${kind}: the actual wall must change the center viewport`);
 assert(colored>300,`${profile}/${tier}/${kind}: blue/cyan albedo must appear on visible wall pixels`);
 return {kind,changedPixels:changed,coloredWallPixels:colored,width,height};
}

for(const definition of definitions){
 const entry={name:definition.name,status:'running',checks:[],errors:[],consoleErrors:[]};report.profiles.push(entry);let browser;
 try{
  browser=await definition.engine.launch({headless:true,args:definition.engine===chromium&&process.platform==='win32'?['--use-angle=d3d11']:[]});
  const context=await browser.newContext({viewport:definition.phone?{width:390,height:844}:{width:1280,height:900},deviceScaleFactor:1,isMobile:definition.phone,hasTouch:definition.phone});
  await context.addInitScript(({phone,recovery})=>{
   localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:'archviz',quality:'high',region:'meeting'}));
   if(phone){const original=WebGL2RenderingContext.prototype.getParameter;WebGL2RenderingContext.prototype.getParameter=function(parameter){const value=original.call(this,parameter);if(parameter===this.MAX_FRAGMENT_UNIFORM_VECTORS){window.__actualFragmentVectors=value;return 224;}return value;};}
   if(recovery){window.__injectedPaintRejections=0;const original=WebGL2RenderingContext.prototype.shaderSource;WebGL2RenderingContext.prototype.shaderSource=function(shader,source){if(source.includes('uniform sampler2D paintGraphics')){window.__injectedPaintRejections++;source+='\n#error test_unsupported_layered_paint\n';}return original.call(this,shader,source);};}
  },definition);
  const page=await context.newPage();page.on('pageerror',error=>entry.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')entry.consoleErrors.push(message.text());});page.on('response',response=>{if(response.status()>=400)entry.errors.push(`${response.status()} ${response.url()}`);});
  await page.goto(url);await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading'),null,{timeout:180000});
  const initial=await inspect(page);assert.equal(initial.backend,'rgba-paint');
  if(definition.phone){assert(initial.policy.coarse);assert.equal(initial.policy.reportedFragmentVectors,224);}else{assert.equal(initial.policy.coarse,false);assert(initial.policy.injectedRejections>0);}
  entry.checks.push({name:'Initial paint policy and real shader preparation',...initial});
  const originalObjects=await page.evaluate(()=>JSON.stringify(window.__ROOM_ATELIER__.store.state.objects));
  await page.evaluate(()=>{const store=window.__ROOM_ATELIER__.store;store.setWallFinish('west',{color:'#0b30c1',mural:0,motif:0});store.setWallFinish('wall-38',{color:'#00ffff',mural:0,motif:0});});
  for(const tier of ['high','medium','low']){
   await page.locator('#quality-select').selectOption(tier);
   await page.evaluate(async()=>{await window.__ROOM_ATELIER__.view.tierRefresh;});await settle(page);
   const pixels=[];for(const kind of ['meeting','hall'])pixels.push(await wallPixels(page,definition.name,tier,kind));
   const gpu=await inspect(page);assert.equal(gpu.quality,tier);assert.equal(gpu.backend,'rgba-paint');assert(gpu.wallPrograms.length>0);
   assert(gpu.wallPrograms.every(p=>p.linked&&p.portable&&!p.layerTable&&!p.stripUniforms&&p.samplerCount<=16));assert.deepEqual(gpu.glErrors,[]);
   assert(gpu.canvases.every(c=>c.width<=4096&&c.height<=4096&&c.width*c.height<=8_000_000));
   entry.checks.push({name:`Actual ${tier} ArchViz walls and portable shader resources`,pixels,...gpu});
  }
  await page.locator('.mode-switch [data-action="editor"]').click();await page.waitForFunction(()=>window.__ROOM_ATELIER__.getMode()==='editor');await settle(page);
  await page.locator('.mode-switch [data-action="archviz"]').click();await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&window.__ROOM_ATELIER__.getMode()==='archviz'&&!document.querySelector('#loading'));await settle(page);
  const roundtrip=await wallPixels(page,definition.name,'roundtrip','meeting');assert.equal(await page.evaluate(()=>JSON.stringify(window.__ROOM_ATELIER__.store.state.objects)),originalObjects);
  entry.checks.push({name:'Editor to ArchViz roundtrip retains walls and all furniture',...roundtrip});
  const unexpected=definition.recovery?entry.consoleErrors.filter(message=>!/test_unsupported_layered_paint|THREE\.WebGLProgram: Shader Error|not linked|useProgram.*not valid|useProgram.*program|VALIDATE_STATUS/i.test(message)):entry.consoleErrors;
  assert.deepEqual(unexpected,[]);assert.deepEqual(entry.errors,[]);entry.status='passed';console.log('PASS',entry.name);
 }catch(error){entry.status='failed';entry.failure=error.stack??String(error);report.errors.push({profile:entry.name,error:entry.failure});console.error('FAIL',entry.name,entry.failure);}
 finally{await browser?.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
}
report.finishedAt=new Date().toISOString();report.status=report.errors.length?'failed':'passed';await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
