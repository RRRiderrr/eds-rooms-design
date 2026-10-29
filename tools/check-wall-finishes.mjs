import './browser-path.mjs';
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const out=new URL('../test-results/customer-revisions/',import.meta.url);await mkdir(out,{recursive:true});
const report=[];
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
 const errors=[],browser=await engine.launch({headless:true,args:engine===chromium&&process.platform==='win32'?['--use-angle=d3d11']:[]});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:4174/?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
  await page.evaluate(()=>{const a=window.__ROOM_ATELIER__;a.store.setWallFinish('east',{color:'#0b30c1',motif:1,accent:'#a0ff3d'});a.view.focusWall('east');});
  const countBlue=async()=>{const bytes=await page.locator('#viewport canvas').screenshot();const {data}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});let count=0;for(let i=0;i<data.length;i+=3)if(data[i+2]>data[i]*1.5&&data[i+2]>data[i+1]*1.1&&data[i+2]>60)count++;return count;};
  const editorBlue=await countBlue();assert(editorBlue>15000,`Editor paint not visible: ${editorBlue}`);
  await page.evaluate(async()=>{const a=window.__ROOM_ATELIER__;a.setMode('archviz');a.view.quality.setManual('high');await a.view.archvizPromise;await a.view.tierRefresh;a.view.focusWall('east');});
  const highBlue=await countBlue();assert(highBlue>15000,`High paint not visible: ${highBlue}`);await page.screenshot({path:new URL(`${name}-paint-high.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
  await page.evaluate(()=>window.__ROOM_ATELIER__.store.clearWallFinish('east'));const clearedBlue=await countBlue();assert(clearedBlue<highBlue*.2,'Clearing paint did not restore source surface');
  await page.evaluate(()=>{const a=window.__ROOM_ATELIER__;a.setMode('editor');a.select('source-desk-west-01');});await page.locator('#viewport canvas').focus();
  const original=await page.evaluate(()=>window.__ROOM_ATELIER__.store.state.objects.find(o=>o.id==='source-desk-west-01').position);
  await page.keyboard.press('ArrowLeft');const moved=await page.evaluate(()=>window.__ROOM_ATELIER__.store.state.objects.find(o=>o.id==='source-desk-west-01').position);assert.notDeepEqual(moved,original);
  await page.keyboard.press('Control+z');const restored=await page.evaluate(()=>window.__ROOM_ATELIER__.store.state.objects.find(o=>o.id==='source-desk-west-01').position);assert.deepEqual(restored,original);
  const caps=await page.evaluate(()=>{const gl=window.__ROOM_ATELIER__.view.renderer.getContext();return {textureUnits:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),stats:window.__ROOM_ATELIER__.view.getStats()};});
  assert.equal(errors.length,0,errors.join('\n'));report.push({name,editorBlue,highBlue,clearedBlue,nudgeUndo:true,errors,...caps});console.log('PASS',name,'Editor/High actual paint pixels, clear, source desk keyboard move + Undo');
 }finally{await browser.close();}
}
await writeFile(new URL('wall-finishes-report.json',out),JSON.stringify(report,null,2));
