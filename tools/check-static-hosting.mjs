import './browser-path.mjs';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'../dist');
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.wasm':'application/wasm','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ktx2':'image/ktx2','.json':'application/json','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),relative=decodeURIComponent(url.pathname.replace(/^\/eds\//,''));const file=path.resolve(root,relative);
 if(!url.pathname.startsWith('/eds/')||!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
 try{const bytes=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/eds/index.html`;
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});const report=[];
try{
 for(const basic of [false,true]){
  const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  if(basic)await page.addInitScript(()=>{const original=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_color_buffer_float'?null:original.call(this,name);};});
  await page.goto(url+'?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready);
  await page.getByRole('button',{name:'ArchViz',exact:true}).click();await page.evaluate(()=>Reflect.get(window.__ROOM_ATELIER__.view,'archvizPromise'));
  await page.waitForTimeout(250);const result=await page.evaluate(()=>({ready:window.__ROOM_ATELIER__.ready,hdrTargets:Reflect.get(window.__ROOM_ATELIER__.view,'hdrTargets'),objects:window.__ROOM_ATELIER__.view.architecture.production.children.length,mode:window.__ROOM_ATELIER__.getMode()}));
  report.push({basic,url,...result,errors});await page.close();
 }
 await fs.mkdir('test-results/review',{recursive:true});await fs.writeFile('test-results/review/static-hosting.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.some(r=>r.errors.length||!r.ready||r.mode!=='archviz'))process.exitCode=1;
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
