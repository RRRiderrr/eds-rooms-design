/** Actual corrected hall desks, isolated storage. Optional --dev for current source. */
import './browser-path.mjs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='test-results/desk-surfaces';await fs.mkdir(out,{recursive:true});
let server,browser;const report={checkedAt:new Date().toISOString(),checks:[],errors:[]};
try{
 let url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
 if(process.argv.includes('--dev')){server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();url=`http://127.0.0.1:${server.httpServer.address().port}/`;}
 report.url=url;browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(()=>localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:'archviz',quality:'high',region:'hall'})));
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(url);await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.getElementById('loading'),null,{timeout:180000});
 const original=await page.evaluate(()=>JSON.stringify(window.__ROOM_ATELIER__.store.state));
 for(const mode of ['archviz','editor']){
  if(mode==='editor'){await page.locator('.mode-switch [data-action="editor"]').click();await page.waitForFunction(()=>window.__ROOM_ATELIER__.getMode()==='editor');}
  const tables=await page.evaluate(()=>{
   const app=window.__ROOM_ATELIER__,v=app.view;v.navigation.setEnabled(false);v.controls.enabled=false;
   return app.store.state.objects.filter(o=>o.assetId==='hallDesk'&&o.variant>0).map(o=>{
    const root=v.visuals.get(o.id).root,parts=[];root.updateMatrixWorld(true);
    root.traverse(mesh=>{if(!mesh.isMesh||!/Black_.*Frame|Cable_Grommet|White_.*Top|Pedestal/.test(mesh.name))return;
     const points=mesh.geometry.getAttribute('position'),p=v.camera.position.clone();let minY=Infinity,maxY=-Infinity;
     for(let i=0;i<points.count;i++){p.fromBufferAttribute(points,i).applyMatrix4(mesh.matrixWorld);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
     parts.push({name:mesh.name,minY,maxY});
    });return {id:o.id,variant:o.variant,position:o.position,rotation:o.rotation,parts};
   });
  });
  assert.equal(tables.length,26);
  for(const table of tables){
   const top=table.parts.find(p=>/White_.*Top/.test(p.name)),frame=table.parts.find(p=>/Black_.*Frame/.test(p.name));
   assert(top&&frame,table.id+' missing source parts');assert.equal(table.parts.some(p=>/Cable_Grommet/.test(p.name)),false);
   assert(Math.abs(top.maxY-table.position[1]-.75)<.00002,table.id+' top height');assert(frame.maxY<=top.minY+.00002,table.id+' support penetrates top');
   for(const part of table.parts.filter(p=>p!==top))assert(part.maxY<=top.minY+.00002,table.id+' raised dark geometry');
  }
  report.checks.push({mode,tables});
  for(const variant of [1,2,3]){
   await page.evaluate(variant=>{
    const app=window.__ROOM_ATELIER__,v=app.view,table=app.store.state.objects.find(o=>o.assetId==='hallDesk'&&o.variant===variant),p=table.position;
    v.controls.enabled=false;v.navigation.setEnabled(false);v.camera.position.set(p[0]+1,2,p[2]-1.6);v.camera.lookAt(p[0],.72,p[2]);v.cameraSafe.copy(v.camera.position);v.controls.target.set(p[0],.72,p[2]);v.navigation.syncFromCamera();v.navigation.setEnabled(false);
   },variant);
   await page.waitForTimeout(250);await page.screenshot({path:`${out}/${mode}-variant-${variant}.png`});
  }
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__ROOM_ATELIER__.store.state)),original);
 assert.deepEqual(report.errors,[]);report.status='passed';console.log('PASS: 26 desks in both modes; all supports below 25 mm continuous white tops, no raised black caps, unchanged transforms/state.');
}catch(error){report.status='failed';report.failure=error.stack??String(error);process.exitCode=1;console.error(report.failure);}finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();await server?.close();}
