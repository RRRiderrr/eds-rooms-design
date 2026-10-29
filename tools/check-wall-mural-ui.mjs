/** Isolated, real UI regression check; does not touch the user's browser draft. */
import './browser-path.mjs';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const base=process.argv.find(a=>a.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174/';
const output=new URL('../test-results/wall-mural-ui/',import.meta.url);
await mkdir(output,{recursive:true});
const report={url:base,startedAt:new Date().toISOString(),checks:[],errors:[],screenshots:[]};
const state=page=>page.evaluate(()=>window.__ROOM_ATELIER__.store.state);
async function saved(page){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('room-atelier-session',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise(resolve=>{const r=db.transaction('state').objectStore('state').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);});}finally{db.close();}});}
function pass(profile,name,details={}){report.checks.push({profile,name,...details});console.log('PASS',profile,name);}
async function drawer(page){
 if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches&&!document.querySelector('.atelier').classList.contains('drawer-open')))await page.locator('.mobile-dock [data-action=drawer]').click();
}
async function image(page,profile,name){
 const file=`${profile}-${name}.png`;await page.screenshot({path:fileURLToPath(new URL(file,output))});report.screenshots.push(file);
}
async function draftSaved(page){
 // Poll async reads in the test runner. A Promise returned from a browser-side
 // waitForFunction predicate can be accepted before its boolean is resolved.
 const signature=s=>s?JSON.stringify({presetId:s.presetId,updatedAt:s.updatedAt,wallFinishes:s.wallFinishes,regionPresets:s.regionPresets,objects:s.objects}):null;
 const expected=signature(await state(page));
 await expect.poll(async()=>signature(await saved(page)),{timeout:15000}).toBe(expected);
}
for(const [profile,options]of [
 ['desktop',{viewport:{width:1440,height:1000},deviceScaleFactor:1}],
 ['phone',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}]
]){
 if(process.argv.includes('--profile=desktop')&&profile!=='desktop'||process.argv.includes('--profile=phone')&&profile!=='phone')continue;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
  const context=await browser.newContext(options),page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push({type:'pageerror',message:e.message}));
  page.on('console',m=>{if(m.type()==='error')errors.push({type:'console',message:m.text()});});
  page.on('response',r=>{if(r.status()>=400)errors.push({type:'http',status:r.status(),url:r.url()});});
  page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')errors.push({type:'requestfailed',url:r.url(),message:r.failure()?.errorText});});
  await page.goto(new URL('?mode=editor',base).href);
  await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
  await drawer(page);await page.getByTestId('region-meeting').click();
  await page.getByTestId('preset-select').selectOption('builtin-0');
  await drawer(page);await page.getByTestId('finishes-tab').click();
  await page.getByTestId('finish-wall').selectOption('west');
  await page.locator('[data-action=wall-focus]').click();
  await expect(page.getByTestId('wall-mural-cards')).toBeVisible();
  await expect(page.locator('[data-action=wall-mural]')).toHaveCount(9);
  const preview=await page.locator('.mural-cards img').evaluateAll(images=>images.map(img=>({src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,complete:img.complete})));
  // Lazy previews below the fold load when their actual card is selected.
  const signatures=[];
  for(const index of [1,2,3,4,5,6,7,8]){
   const card=page.locator(`[data-action=wall-mural][data-value="${index}"]`);
   await card.click();await expect(card).toHaveAttribute('aria-pressed','true');
   await page.waitForFunction(i=>window.__ROOM_ATELIER__.store.state.wallFinishes.west.mural===i,index);
   await card.locator('img').evaluate(img=>img.decode());
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const bytes=await page.locator('#viewport canvas').screenshot();
   signatures.push(createHash('sha256').update(bytes).digest('hex'));
   await image(page,profile,`mural-${index}`);
  }
  assert.equal(new Set(signatures).size,8,'The canvas did not change for all eight mural choices');
  pass(profile,'Eight real mural cards update state and render distinct canvas frames',{signatures,previews:preview});
  await page.locator('[data-action=wall-mural][data-value="0"]').click();
  assert.equal((await state(page)).wallFinishes.west.mural,0);
  await page.locator('[data-action=wall-mural][data-value="8"]').click();
  await page.getByRole('button',{name:'Штрихи',exact:true}).click();
  assert.equal((await state(page)).wallFinishes.west.mural,0);assert.equal((await state(page)).wallFinishes.west.motif,1);
  await page.getByTestId('undo').click();
  assert.equal((await state(page)).wallFinishes.west.mural,8);assert.equal((await state(page)).wallFinishes.west.motif,0);
  await page.getByTestId('redo').click();
  assert.equal((await state(page)).wallFinishes.west.mural,0);assert.equal((await state(page)).wallFinishes.west.motif,1);
  pass(profile,'None, small motif selection, Undo and Redo work through actual UI');
  await page.locator('[data-action=wall-mural][data-value="8"]').click();
  const meetingFinish=structuredClone((await state(page)).wallFinishes.west);
  await drawer(page);await page.getByTestId('region-hall').click();
  await page.getByTestId('preset-select').selectOption('hall-preset-4');
  assert.deepEqual((await state(page)).wallFinishes.west,meetingFinish);
  pass(profile,'Changing the hall preset preserves the meeting mural');
  const expected=await state(page);
  const downloadPromise=page.waitForEvent('download');
  await page.getByTestId('export').click();const download=await downloadPromise;
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.deepEqual(exported.wallFinishes,expected.wallFinishes);
  assert.deepEqual(exported.objects,expected.objects);
  pass(profile,'An actual downloaded JSON contains mural state and all furniture');
  await draftSaved(page);await page.reload();
  await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
  assert.deepEqual((await state(page)).wallFinishes,expected.wallFinishes);
  assert.deepEqual((await state(page)).objects,expected.objects);
  pass(profile,'The actual IndexedDB draft and reload preserve murals');
  await drawer(page);await page.getByTestId('region-meeting').click();await page.getByTestId('finishes-tab').click();
  await page.getByTestId('finish-wall').selectOption('west');
  if(profile==='phone')await page.locator('[data-action=wall-mural][data-value="8"]').scrollIntoViewIfNeeded();
  await image(page,profile,'responsive-finishes');
  const layout=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,drawer:document.querySelector('.atelier').classList.contains('drawer-open'),cards:[...document.querySelectorAll('.mural-cards button')].map(b=>{const r=b.getBoundingClientRect();return{x:r.x,right:r.right,width:r.width,height:r.height};})}));
  assert(layout.documentWidth<=layout.width,'Page overflows the responsive viewport');
  assert(layout.cards.every(c=>c.x>=0&&c.right<=layout.width+1&&c.width>=95&&c.height>=44),'Mural controls are clipped or too small');
  if(profile==='phone')assert(layout.drawer,'Mobile finishes drawer is not open');
  pass(profile,'Responsive mural cards fit the viewport and mobile drawer',{layout});
  // Import a real pre-mural custom design through the file input, then reload.
  const legacy={...exported,presetId:'user-pre-mural-ui',basePresetId:'user-pre-mural-ui',name:'Власний дизайн до композицій',modified:true,wallFinishes:{west:{color:'#a2b8fe',motif:2,accent:'#0b30c1'}}};
  await page.getByTestId('import-input').setInputFiles({name:'old-custom.archpreset.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.waitForFunction(()=>window.__ROOM_ATELIER__.store.state.presetId==='user-pre-mural-ui');
  assert.deepEqual((await state(page)).wallFinishes,legacy.wallFinishes);
  await draftSaved(page);await page.reload();
  await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
  assert.deepEqual((await state(page)).wallFinishes,legacy.wallFinishes);
  pass(profile,'An older custom import and reloaded draft receive no forced mural');
  assert.deepEqual(errors,[],'Browser errors: '+JSON.stringify(errors));
  pass(profile,'No console, page, failed HTTP or network errors');
 }catch(error){report.errors.push({profile,message:error.stack??String(error)});console.error(profile,error.message);}
 finally{await browser?.close();}
}
report.finishedAt=new Date().toISOString();report.status=report.errors.length?'failed':'passed';
await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));
if(report.errors.length)process.exitCode=1;
