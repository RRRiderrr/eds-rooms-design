import './browser-path.mjs';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'../dist');
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.wasm':'application/wasm','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ktx2':'image/ktx2','.json':'application/json','.jpg':'image/jpeg','.webp':'image/webp'};
const prefix='/eds-rooms-design/';
const remote=process.argv.find(argument=>argument.startsWith('--url='))?.slice(6);
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';const file=path.resolve(root,relative);
 if(!url.pathname.startsWith(prefix)||!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
 try{const bytes=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}
});if(!remote)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=remote??`http://127.0.0.1:${server.address().port}${prefix}`;
await fs.mkdir('test-results/review',{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});const report=[];
try{
 for(const profile of [{name:'desktop',basic:false,viewport:{width:1280,height:800}},{name:'desktop-basic',basic:true,viewport:{width:1280,height:800}},{name:'phone',basic:false,viewport:{width:390,height:844},isMobile:true,hasTouch:true}]){
  const {basic,...context}=profile;delete context.name;
  const page=await browser.newPage(context);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  if(basic)await page.addInitScript(()=>{const original=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_color_buffer_float'?null:original.call(this,name);};});
  await page.goto(url+'?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,undefined,{timeout:120000});
  await page.getByRole('button',{name:'ArchViz',exact:true}).click();
  // First ArchViz preparation now includes texture upload and real GPU frames
  // after architecture loading: await the public readiness gate, not its GLB promise.
  await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading'),undefined,{timeout:120000});
  const result=await page.evaluate(()=>({ready:window.__ROOM_ATELIER__.ready,hdrTargets:Reflect.get(window.__ROOM_ATELIER__.view,'hdrTargets'),objects:window.__ROOM_ATELIER__.view.architecture.production.children.length,mode:window.__ROOM_ATELIER__.getMode()}));
  report.push({profile:profile.name,basic,url,...result,errors});await page.screenshot({path:`test-results/review/${remote?'github-pages':'static-subpath'}-${profile.name}.png`});await page.close();
 }
 await fs.mkdir('test-results/review',{recursive:true});await fs.writeFile(`test-results/review/${remote?'github-pages':'static-hosting'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.some(r=>r.errors.length||!r.ready||r.mode!=='archviz'))process.exitCode=1;
}finally{await browser.close();if(!remote){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
