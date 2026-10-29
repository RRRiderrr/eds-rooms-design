/** Actual UI + decoded runtime surface verification in isolated browser profiles. */
import './browser-path.mjs';
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const out=path.resolve('test-results/wall-selection-wayfinding');await mkdir(out,{recursive:true});
const report={url,startedAt:new Date().toISOString(),profiles:[],errors:[]};
const label=id=>id.includes('door-14-')?'Вихід':/door-(10|15)-/.test(id)?'WC':id.match(/door-(\d+)-/)[1];
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
 const profile={name,checks:[],errors:[]};report.profiles.push(profile);let browser;
 try{
  browser=await engine.launch({headless:true,args:engine===chromium&&process.platform==='win32'?['--use-angle=d3d11']:[]});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>profile.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')profile.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)profile.errors.push(r.status()+' '+r.url());});
  await page.goto(url+'?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
  await page.getByTestId('region-meeting').click();await page.getByTestId('finishes-tab').click();await page.getByTestId('finish-wall').selectOption('east');
  await page.locator('[data-action="wall-focus"]').click();await page.waitForTimeout(450);
  const clip=await page.locator('canvas[aria-label="Тривимірний простір"]').boundingBox();
  const selected=await page.screenshot({path:path.join(out,name+'-selected-wall.png'),clip});
  profile.selection=await page.evaluate(()=>{
   const a=window.__ROOM_ATELIER__,v=a.view,r=v.scene.getObjectByName('Editor_WallSelection'),Vec=v.camera.position.constructor,Ray=v.ray.constructor;
   const bounds=r?.children.map(o=>({name:o.name,visible:o.visible,vertices:o.geometry.getAttribute('position').count,depthTest:o.material.depthTest,opacity:o.material.opacity}));
   const p=new Vec(2.6018175,1.1,.65).project(v.camera),b=v.renderer.domElement.getBoundingClientRect();
   return {id:v.selectedWallId,visible:r?.visible,bounds,click:{x:b.x+(p.x+1)*b.width/2,y:b.y+(1-p.y)*b.height/2},mode:a.getMode()};
  });
  assert.equal(profile.selection.id,'east');assert.equal(profile.selection.visible,true);assert.equal(profile.selection.mode,'editor');assert(profile.selection.bounds.every(m=>m.vertices>0));
  await page.getByTestId('scene-tab').click();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>!!window.__ROOM_ATELIER__.view.scene.getObjectByName('Editor_WallSelection')),false);
  const unselected=await page.screenshot({path:path.join(out,name+'-unselected-wall.png'),clip});
  const [a,b]=await Promise.all([sharp(selected).ensureAlpha().raw().toBuffer(),sharp(unselected).ensureAlpha().raw().toBuffer()]);let changed=0,strong=0;
  for(let i=0;i<a.length;i+=4){const delta=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(delta>4)changed++;if(delta>30)strong++;}
  assert(changed>10000&&strong>500,`Selection must be visibly rendered: ${changed}/${strong}`);profile.selection.pixelChanges={changed,strong};
  await page.getByTestId('finishes-tab').click();await page.getByTestId('finish-wall').selectOption('west');
  await page.mouse.click(profile.selection.click.x,profile.selection.click.y);await page.waitForTimeout(120);
  assert.equal(await page.getByTestId('finish-wall').inputValue(),'east');assert.equal(await page.evaluate(()=>window.__ROOM_ATELIER__.view.selectedWallId),'east');
  profile.checks.push('Real wall click selects east composition; tint/frame change >10k actual canvas pixels; leaving finishes hides overlay.');
  await page.getByRole('combobox',{name:'Якість графіки'}).selectOption('high');await page.getByRole('button',{name:'ArchViz',exact:true}).click();await page.waitForFunction(()=>window.__ROOM_ATELIER__.view.environmentReady,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>window.__ROOM_ATELIER__.view.wallSelection?.visible??false),false);
  await page.getByTestId('region-hall').click();await page.getByTestId('preset-select').selectOption('hall-preset-3');
  await page.waitForFunction(()=>{const a=window.__ROOM_ATELIER__;return a.store.state.objects.filter(o=>o.assetId==='doorPlaque').every(o=>a.view.visuals.get(o.id)?.templateKey?.endsWith(':high'));},null,{timeout:120000});
  profile.wayfinding=await page.evaluate(()=>{
   const a=window.__ROOM_ATELIER__,v=a.view,plaques=a.store.state.objects.filter(o=>o.assetId==='doorPlaque').map(o=>{const r=v.visuals.get(o.id)?.root,l=r?.getObjectByName('DoorPlaque_Label');return {id:o.id,label:o.label,print:l?.material.userData.printedText,ink:l?.material.userData.inkColor};});
   const colors=[];for(const binding of v.wallFinishes.bindings.values()){const u=binding.uniforms;for(let i=0;i<u.paintStripCount.value;i++)colors.push(u.paintStripStyle.value[i].toArray().slice(0,3));}
   return {plaques,colors,glError:v.renderer.getContext().getError(),revision:a.store.state.doorLabelRevision};
  });
  assert.equal(profile.wayfinding.revision,1);assert.equal(profile.wayfinding.plaques.length,14);
  for(const p of profile.wayfinding.plaques){assert.equal(p.label,label(p.id));assert.equal(p.print,p.label);}
  assert(profile.wayfinding.colors.length>=14);for(const color of profile.wayfinding.colors){const srgb=color.map(c=>c<=.0031308?c*12.92:1.055*c**(1/2.4)-.055);assert(Math.min(...srgb)>.60&&Math.max(...srgb)-Math.min(...srgb)<.24,'Door paint should be pale desaturated pigment');}
  assert.equal(profile.wayfinding.glError,0);profile.checks.push('All14 actual production plaque prints use updated wayfinding; shader uniforms for every door use pale pigment colors.');
  await page.getByTestId('scene-tab').click();await page.locator('[data-object-id="hall-door-14-plaque"]').click();await page.getByTestId('focus').click();await page.locator('[data-action="clear-selection"]').last().click();await page.waitForTimeout(200);await page.screenshot({path:path.join(out,name+'-exit-pale-paint.png')});
  await page.reload();await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>window.__ROOM_ATELIER__.store.state.objects.find(o=>o.id==='hall-door-14-plaque').label),'Вихід');
  assert.deepEqual(profile.errors,[]);profile.status='passed';console.log('PASS',name,profile.checks.length,'wall selection and wayfinding checks');
 }catch(e){profile.status='failed';profile.error=e.stack??String(e);report.errors.push({name,error:profile.error});console.error(profile.error);}finally{await browser?.close();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
}
report.finishedAt=new Date().toISOString();report.status=report.errors.length?'failed':'passed';await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
