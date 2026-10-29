import './browser-path.mjs';
import {chromium,firefox,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.argv.find(v=>v.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const out=new URL('../test-results/customer-revisions/',import.meta.url);await mkdir(out,{recursive:true});
const report={url,startedAt:new Date().toISOString(),checks:[],errors:[],screenshots:[]};
const state=page=>page.evaluate(()=>window.__ROOM_ATELIER__.store.state);
const check=(name,details={})=>{report.checks.push({name,...details});console.log('PASS',name);};
async function drawer(page){if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches&&!document.querySelector('.atelier').classList.contains('drawer-open')))await page.locator('.mobile-dock [data-action=drawer]').click();}
async function screenshot(page,file){await page.screenshot({path:new URL(file,out).pathname.replace(/^\/(\w:)/,'$1'),fullPage:false});report.screenshots.push(file);}
for(const [name,engine,profile]of [
 ['desktop',chromium,{viewport:{width:1440,height:1000},deviceScaleFactor:1}],
 ['phone',chromium,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
 ['safari',webkit,{viewport:{width:1180,height:820},hasTouch:true,deviceScaleFactor:1}],
 ['firefox',firefox,{viewport:{width:1440,height:900},deviceScaleFactor:1}],
]){
 let browser;
 try{
  browser=await engine.launch({headless:true,args:engine===chromium&&process.platform==='win32'?['--use-angle=d3d11']:[]});const page=await browser.newPage(profile);page.on('pageerror',e=>report.errors.push({name,error:e.message}));page.on('console',msg=>{if(msg.type()==='error')report.errors.push({name,error:msg.text()});});page.on('response',res=>{if(res.status()>=400)report.errors.push({name,url:res.url(),status:res.status()});});
  await page.goto(url+'?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
  const initial=await state(page);assert.equal(initial.schemaVersion,2);assert.equal(initial.objects.filter(o=>o.assetId==='hallDesk').length,26);
  const tablePositions=initial.objects.filter(o=>o.assetId==='hallDesk').map(o=>[o.id,o.position,o.rotation]);
  check(name+': source tables loaded as 26 semantic items');
  await drawer(page);await page.getByTestId('region-hall').click();
  await page.getByTestId('preset-select').selectOption('hall-preset-1');
  const hall=await state(page);assert.equal(hall.objects.filter(o=>o.assetId==='doorPlaque').length,14);assert.equal(hall.objects.filter(o=>o.assetId==='brandDoorPanel').length,14);assert(hall.objects.filter(o=>o.assetId==='beanBag').length>=3);
  assert.deepEqual(hall.objects.filter(o=>o.assetId==='hallDesk').map(o=>[o.id,o.position,o.rotation]),tablePositions);
  const hallSnapshot=JSON.stringify(hall.objects.filter(o=>o.regionId==='hall'));
  await drawer(page);await page.getByTestId('region-meeting').click();await page.getByTestId('preset-select').selectOption('builtin-6');
  const meeting=await state(page);assert.equal(JSON.stringify(meeting.objects.filter(o=>o.regionId==='hall')),hallSnapshot);assert(meeting.objects.some(o=>o.assetId==='board'&&o.variant===1));assert(!meeting.objects.some(o=>o.regionId==='meeting'&&o.assetId==='board'&&o.variant===3));
  const meetingSnapshot=JSON.stringify(meeting.objects.filter(o=>o.regionId==='meeting'));
  await drawer(page);await page.getByTestId('region-hall').click();await page.getByTestId('preset-select').selectOption('hall-preset-2');
  assert.equal(JSON.stringify((await state(page)).objects.filter(o=>o.regionId==='meeting')),meetingSnapshot);check(name+': independent room presets, 14 door pairs, whiteboard, original positions');
  if(name==='desktop'){
   const table=(await state(page)).objects.find(o=>o.assetId==='hallDesk');await page.evaluate(id=>window.__ROOM_ATELIER__.select(id),table.id);
   await page.getByTestId('delete').click();assert(!(await state(page)).objects.some(o=>o.id===table.id));await page.getByTestId('undo').click();assert((await state(page)).objects.some(o=>o.id===table.id));
   const sourceVisible=await page.evaluate(()=>{let found=false;window.__ROOM_ATELIER__.view.architecture.editor.traverse(o=>{if(o.name==='Space_existingFurniture'&&o.visible)found=true;});return found;});assert(!sourceVisible);check('desktop: source table delete/Undo without architectural duplicate');
   const plaque=(await state(page)).objects.find(o=>o.assetId==='doorPlaque');await page.evaluate(id=>window.__ROOM_ATELIER__.select(id),plaque.id);await page.getByTestId('plaque-label').fill('Проєктний відділ');await page.getByTestId('plaque-label').press('Tab');assert.equal((await state(page)).objects.find(o=>o.id===plaque.id).label,'Проєктний відділ');check('desktop: live per-instance Ukrainian plaque text');
  }
  await drawer(page);await page.getByTestId('region-meeting').click();await page.getByTestId('finishes-tab').click();await page.getByTestId('finish-wall').selectOption('east');await page.getByRole('button',{name:'Стіна: Лавандовий',exact:true}).click();await page.getByRole('button',{name:'Штрихи',exact:true}).click();
  const painted=await state(page);assert.equal(painted.wallFinishes.east.color.toLowerCase(),'#a2b8fe');assert.equal(painted.wallFinishes.east.motif,1);await screenshot(page,name+'-finishes.png');check(name+': wall paint and original SVG motif edited through UI');
  if(name==='desktop'){
   const downloadPromise=page.waitForEvent('download');await page.getByTestId('export').click();const download=await downloadPromise;const content=await (await import('node:fs/promises')).readFile(await download.path(),'utf8');const exported=JSON.parse(content);assert.deepEqual(exported.wallFinishes,painted.wallFinishes);check(name+': actual JSON download retains wall finishes');
  }
  await page.getByRole('button',{name:'ArchViz',exact:true}).click();await page.evaluate(()=>window.__ROOM_ATELIER__.view.quality.setManual('medium'));await page.waitForFunction(()=>window.__ROOM_ATELIER__.view.environmentReady===true,null,{timeout:120000});
  await page.evaluate(()=>window.__ROOM_ATELIER__.view.focusRegion('meeting'));await page.waitForTimeout(1200);await screenshot(page,name+'-meeting.png');
  await page.evaluate(()=>window.__ROOM_ATELIER__.view.focusRegion('hall'));await page.waitForTimeout(1200);await screenshot(page,name+'-hall.png');check(name+': production ArchViz compiled and rendered both regions');
 }catch(error){report.errors.push({name,error:error.stack??String(error)});console.error(name,error.message);}
 finally{await browser?.close();}
}
report.finishedAt=new Date().toISOString();report.status=report.errors.length?'failed':'passed';await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
