import { test, expect, type Page, type TestInfo } from '@playwright/test';
import type { SceneConfig } from '../../src/core/types';

async function state(page:Page):Promise<SceneConfig> {return page.evaluate(()=>window.__ROOM_ATELIER__!.store.state);}
async function waitReady(page:Page):Promise<void> {
 await page.goto('/?mode=editor');
 await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready===true||document.querySelector('.limited')!==null,{},{timeout:60_000});
 await expect(page.locator('.fallback-notice')).toHaveCount(0);
 await expect(page.locator('canvas')).toBeVisible();await page.locator('[data-property=quality]').selectOption('medium');
}
async function mode(page:Page,name:'Editor'|'ArchViz'):Promise<void> {await page.getByRole('button',{name,exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.getMode().toLowerCase())).toBe(name.toLowerCase());}
async function panel(page:Page,tab:'library'|'scene'|'layers'='library'):Promise<void> {const button=page.getByTestId(`${tab}-tab`);if(!(await button.isVisible()))await page.locator(`.mobile-dock [data-action="${tab==='scene'?'scene-drawer':'drawer'}"]`).click();await button.click();}
async function inspector(page:Page,expanded=true):Promise<void>{const button=page.getByTestId('inspector-toggle');if(await button.isVisible()&&((await button.getAttribute('aria-expanded'))==='true')!==expanded)await button.click();}
async function preset(page:Page,index:number):Promise<void> {if(!(await page.getByTestId('preset-select').isVisible()))await panel(page);await page.getByTestId('preset-select').selectOption(`builtin-${index}`);await expect.poll(async()=>(await state(page)).presetId).toBe(`builtin-${index}`);}
async function selectObject(page:Page,id:string):Promise<void> {await panel(page,'scene');await page.locator(`[data-object-id="${id}"]`).click();await inspector(page);await expect(page.getByTestId('variant-select')).toBeVisible();}
async function settle(page:Page):Promise<void> {await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function freePlacement(page:Page,enabled=true):Promise<void> {const details=page.locator('details.advanced');if(await details.count()&&(await details.getAttribute('open'))===null)await details.locator('summary').click();if(enabled)await page.getByTestId('free-placement').check();else await page.getByTestId('free-placement').uncheck();}
async function productionReady(page:Page):Promise<void> {await page.waitForFunction(()=>{const app=window.__ROOM_ATELIER__;if(!app||app.getMode()!=='archviz')return false;const visuals=Reflect.get(app.view,'visuals') as Map<string,{root:{children:{type:string}[]};disposed:boolean}>;return [...visuals.values()].every(v=>v.disposed||v.root.children.some(c=>c.type==='Group'));},{},{timeout:40_000});await settle(page);}
async function attachState(page:Page,info:TestInfo,name:string):Promise<void> {await info.attach(name,{body:JSON.stringify(await state(page),null,2),contentType:'application/json'});}

test.describe('Measured lounge / production editor',()=>{
 const errors:string[]=[];
 test.beforeEach(async({page})=>{errors.length=0;page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('response',response=>{if(response.status()>=400&&response.url().includes('/assets/'))errors.push(`Asset HTTP ${response.status()}: ${response.url()}`);});await waitReady(page);});
 test.afterEach(async({page},info)=>{
  await info.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'});
  const budget=await page.evaluate(()=>{const canvas=document.querySelector('canvas');const view=window.__ROOM_ATELIER__?.view as {renderer?:{info?:unknown};stats?:unknown}|undefined;return {viewport:[innerWidth,innerHeight],canvas:canvas?[canvas.width,canvas.height]:null,renderer:view?.renderer?.info??view?.stats??null};});
  await info.attach('render-budget',{body:JSON.stringify(budget),contentType:'application/json'});expect(errors).toEqual([]);if(info.status!==info.expectedStatus)await attachState(page,info,'failed-state').catch(()=>{});
 });

 test('all16 presets, empty0, both modes and actual room remain coherent',async({page},info)=>{
  test.setTimeout(180_000);
  await mode(page,'Editor');
  for(let index=0;index<=15;index++){
   await preset(page,index);const config=await state(page);expect(config.roomId).toBe('lounge-room-01');expect(config.objects.some(o=>o.id==='RoomSign')).toBe(false);
   const signs=config.objects.filter(o=>['edsTimeline','edsUkraine'].includes(o.assetId)&&o.wallId==='wall-38');expect(signs).toHaveLength(2);expect(signs.map(o=>o.assetId).sort()).toEqual(['edsTimeline','edsUkraine']);
   if(index===0){expect(config.objects.filter(o=>o.regionId==='meeting')).toHaveLength(0);}else expect(config.objects.filter(o=>o.variant>0&&o.wallId!=='wall-38').length).toBeGreaterThanOrEqual(12);
   await settle(page);await info.attach(`preset-${index}-editor`,{body:await page.screenshot(),contentType:'image/png'});
   await mode(page,'ArchViz');await productionReady(page);await info.attach(`preset-${index}-archviz`,{body:await page.screenshot(),contentType:'image/png'});await mode(page,'Editor');
  }
  await preset(page,1);await mode(page,'ArchViz');await settle(page);await info.attach('archviz-production',{body:await page.screenshot(),contentType:'image/png'});await mode(page,'Editor');
  const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);expect(horizontalOverflow).toBe(false);
 });

 test('independent absent/model/material variants and history work through UI',async({page})=>{
  await mode(page,'Editor');await preset(page,4);await selectObject(page,'MainSofa');
  await page.getByTestId('variant-select').selectOption('0');await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='MainSofa')?.variant).toBe(0);
  await page.getByTestId('variant-select').selectOption('1');await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='MainSofa')?.variant).toBe(1);
  await page.getByTestId('material-select').selectOption('sage');await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='MainSofa')?.material).toBe('sage');expect((await state(page)).modified).toBe(true);
  await page.getByTestId('undo').click();await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='MainSofa')?.material).not.toBe('sage');await page.getByTestId('redo').click();await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='MainSofa')?.material).toBe('sage');
  await panel(page);await page.getByTestId('reset').click();await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='MainSofa')?.variant).toBe(2);
 });

 test('placement protections, free override, duplicate and delete are functional',async({page})=>{
  await mode(page,'Editor');await preset(page,1);await selectObject(page,'MainSofa');const before=(await state(page)).objects.find(o=>o.id==='MainSofa')!;
  const x=page.locator('input[data-axis="x"]');await x.fill('100');await x.press('Enter');await x.blur();expect((await state(page)).objects.find(o=>o.id==='MainSofa')!.position[0]).toBe(before.position[0]);
  await freePlacement(page);await page.getByTestId('snap').click();await x.fill('0.35');await x.press('Enter');await x.blur();await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='MainSofa')!.position[0]).toBeCloseTo(.35,2);
  const count=(await state(page)).objects.length;await page.getByTestId('duplicate').click();await expect.poll(async()=>(await state(page)).objects.length).toBe(count+1);await inspector(page);await page.getByTestId('delete').click();await expect.poll(async()=>(await state(page)).objects.length).toBe(count);
  await page.getByTestId('undo').click();await expect.poll(async()=>(await state(page)).objects.length).toBe(count+1);
 });

 test('grid, snapping, layers and interactive door state survive mode changes',async({page})=>{
  await mode(page,'Editor');await preset(page,1);const gridBefore=(await state(page)).layers.grid;await page.getByTestId('grid').click();await expect.poll(async()=>(await state(page)).layers.grid).toBe(!gridBefore);await page.getByTestId('grid').click();
  await page.getByTestId('snap').click();await page.getByTestId('snap').click();await panel(page,'layers');
  const ceiling=page.locator('input[data-layer="ceiling"]');await ceiling.check();await expect.poll(async()=>(await state(page)).layers.ceiling).toBe(true);await ceiling.uncheck();
  const door=page.getByTestId('door');await door.click();await expect.poll(async()=>(await state(page)).doorOpen).toBe(true);await mode(page,'ArchViz');await expect.poll(async()=>(await state(page)).doorOpen).toBe(true);await door.click();await expect.poll(async()=>(await state(page)).doorOpen).toBe(false);
 });

 test('wall assets stay attached and floor furniture stays grounded',async({page})=>{
  await mode(page,'Editor');await preset(page,1);await selectObject(page,'Artwork');await page.getByTestId('wall-select').selectOption('west');await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='Artwork')?.wallId).toBe('west');
  const artwork=(await state(page)).objects.find(o=>o.id==='Artwork')!;expect(artwork.position[0]).toBeLessThan(-2.5);expect(artwork.position[1]).toBeGreaterThan(.5);
  await selectObject(page,'MainSofa');const y=page.locator('input[data-axis="y"]');if(await y.isEnabled()){await y.fill('1.5');await y.press('Enter');await y.blur();expect((await state(page)).objects.find(o=>o.id==='MainSofa')!.position[1]).toBe(0);}
 });

 test('the actual door mesh opens on pointer or touch interaction',async({page},info)=>{
  await mode(page,'Editor');await preset(page,0);await mode(page,'ArchViz');
  const point=await page.evaluate(()=>{
   const view=window.__ROOM_ATELIER__!.view as unknown as {camera:{position:{set:(x:number,y:number,z:number)=>void};updateMatrixWorld:()=>void;matrixWorldInverse:{elements:number[]};projectionMatrix:{elements:number[]}};controls:{target:{set:(x:number,y:number,z:number)=>void};update:()=>void};renderer:{domElement:HTMLCanvasElement}};
   view.camera.position.set(.3,1.65,-1.1);view.controls.target.set(1.95,1,-3.07);view.controls.update();view.camera.updateMatrixWorld();
   const mul=(m:number[],v:number[])=>[0,1,2,3].map(r=>m[r]*v[0]+m[r+4]*v[1]+m[r+8]*v[2]+m[r+12]*v[3]);
   const clip=mul(view.camera.projectionMatrix.elements,mul(view.camera.matrixWorldInverse.elements,[1.95,1,-3.09,1]));const rect=view.renderer.domElement.getBoundingClientRect();return {x:rect.left+(clip[0]/clip[3]+1)/2*rect.width,y:rect.top+(1-clip[1]/clip[3])/2*rect.height};
  });
  await settle(page);if(info.project.use.hasTouch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
  await expect.poll(async()=>(await state(page)).doorOpen).toBe(true);
 });

 test('mouse or native touch drag applies grid snap and supports smooth movement',async({page},info)=>{
  await mode(page,'Editor');await preset(page,0);await panel(page);await page.getByTestId('add-sofa').click();const created=(await state(page)).objects.find(o=>o.assetId==='sofa')!;expect(created).toBeTruthy();await selectObject(page,created.id);await freePlacement(page);await inspector(page,false);await page.getByTestId('focus').click();await settle(page);
  const center=async()=>page.evaluate(id=>{
   const app=window.__ROOM_ATELIER__!,obj=app.store.state.objects.find(o=>o.id===id)!;
   const view=app.view as unknown as {camera:{matrixWorldInverse:{elements:number[]};projectionMatrix:{elements:number[]};updateMatrixWorld:()=>void};renderer:{domElement:HTMLCanvasElement}};view.camera.updateMatrixWorld();
   const mul=(m:number[],v:number[])=>[0,1,2,3].map(r=>m[r]*v[0]+m[r+4]*v[1]+m[r+8]*v[2]+m[r+12]*v[3]);const clip=mul(view.camera.projectionMatrix.elements,mul(view.camera.matrixWorldInverse.elements,[obj.position[0],.42,obj.position[2],1]));const rect=view.renderer.domElement.getBoundingClientRect();return {x:rect.left+(clip[0]/clip[3]+1)/2*rect.width,y:rect.top+(1-clip[1]/clip[3])/2*rect.height};
  },created.id);
  const drag=async(distance:number)=>{
   const p=await center();
   if(info.project.use.hasTouch){const session=await page.context().newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+distance*i/8,y:p.y,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
   else {await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+distance,p.y,{steps:8});await page.mouse.up();}
  };
  // Chromium exposes native touch dispatch through CDP. WebKit uses the pointer
  // path here, while separate tests exercise its actual touchscreen tap events.
  if(info.project.use.hasTouch&&info.project.use.browserName!=='chromium')return;
  await drag(60);const snapped=(await state(page)).objects.find(o=>o.id===created.id)!;expect(snapped.position).not.toEqual(created.position);expect(snapped.position[0]/.25).toBeCloseTo(Math.round(snapped.position[0]/.25),4);expect(snapped.position[2]/.25).toBeCloseTo(Math.round(snapped.position[2]/.25),4);
  await page.getByTestId('snap').click();const previous=[...snapped.position];await drag(37);const smooth=(await state(page)).objects.find(o=>o.id===created.id)!;expect(smooth.position).not.toEqual(previous);expect(Math.abs(smooth.position[0]/.25-Math.round(smooth.position[0]/.25))+Math.abs(smooth.position[2]/.25-Math.round(smooth.position[2]/.25))).toBeGreaterThan(.01);
 });

 test('IndexedDB save/reload and portable export/import preserve design',async({page})=>{
  await mode(page,'Editor');await preset(page,4);await selectObject(page,'MainSofa');await page.getByTestId('material-select').selectOption('clay');
  await page.getByTestId('save').click();await page.getByTestId('save-name').fill('QA — local portable design');await page.getByTestId('save-confirm').click();await expect.poll(async()=>(await state(page)).presetId).toMatch(/^user-/);const saved=await state(page);
  await page.reload();await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready===true);expect((await state(page)).objects).toEqual(saved.objects);
  await mode(page,'Editor');const downloadEvent=page.waitForEvent('download');await page.getByTestId('export').click();const download=await downloadEvent;expect(download.suggestedFilename()).toContain('.archpreset.json');const file=await download.path();expect(file).toBeTruthy();await preset(page,0);await page.getByTestId('import-input').setInputFiles(file!);await expect.poll(async()=>(await state(page)).objects.length).toBe(saved.objects.length);expect((await state(page)).objects).toEqual(saved.objects);
  const before=(await state(page)).objects;await page.getByTestId('import-input').setInputFiles({name:'foreign.archpreset.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...saved,projectId:'another-building'}))});await settle(page);expect((await state(page)).objects).toEqual(before);
 });

 test('tabletop accessories follow their support and never remain floating after deletion',async({page})=>{
  await mode(page,'Editor');await preset(page,1);await selectObject(page,'CoffeeTable');
  const x=page.locator('input[data-axis="x"]');await x.fill('-1.25');await x.press('Enter');await x.blur();
  await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='CoffeeBooks')!.position[0]).toBe(-1.25);
  await page.getByTestId('variant-select').selectOption('3');await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='CoffeeBooks')!.position[1]).toBe(.42);
  for(const [variant,height]of [[4,.4],[5,.39]]){await page.getByTestId('variant-select').selectOption(String(variant));await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='CoffeeBooks')!.position[1]).toBe(height);expect((await state(page)).objects.find(o=>o.id==='CoffeeBooks')!.variant).toBe(1);}
  await page.getByTestId('delete').click();await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='CoffeeBooks')!.variant).toBe(0);
  await page.getByTestId('undo').click();await expect.poll(async()=>(await state(page)).objects.find(o=>o.id==='CoffeeBooks')!.variant).toBeGreaterThan(0);
 });

 test('the Ukrainian EDS interface uses real thumbnails and protected full-space placement',async({page})=>{
  await expect(page).toHaveTitle('EDS rooms design');expect(await page.locator('html').getAttribute('lang')).toBe('uk');
  await mode(page,'Editor');await preset(page,0);await panel(page);await expect(page.getByText('0 / Немає',{exact:true}).first()).toBeVisible();await expect(page.locator('.asset-thumb').first()).toBeVisible();expect(await page.locator('.asset-thumb').first().evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
  await page.getByTestId('add-sofa').click();const sofa=(await state(page)).objects.find(o=>o.assetId==='sofa')!;await selectObject(page,sofa.id);
  const x=page.locator('input[data-axis="x"]');await x.fill('-12');await x.press('Enter');await x.blur();await expect.poll(async()=>(await state(page)).objects.find(o=>o.id===sofa.id)!.position[0]).toBe(-12);
  await x.fill('3.5');await x.press('Enter');await x.blur();expect((await state(page)).objects.find(o=>o.id===sofa.id)!.position[0]).toBe(-12);
  await panel(page);await page.getByRole('button',{name:'Настінний декор',exact:true}).click();await page.getByTestId('add-art').click();const art=(await state(page)).objects.find(o=>o.assetId==='art')!;await selectObject(page,art.id);await expect(page.getByTestId('wall-select').locator('option')).toHaveCount(42);await page.getByTestId('wall-select').selectOption('wall-0');await expect.poll(async()=>(await state(page)).objects.find(o=>o.id===art.id)?.wallId).toBe('wall-0');
  expect((await state(page)).objects.find(o=>o.id===art.id)!.position[0]).toBeLessThan(-23);
 });

 test('desktop FPS supports pointer look, WASD, height changes and ignores furniture',async({page},info)=>{
  test.skip(!!info.project.use.hasTouch,'Desktop keyboard navigation is tested on mouse projects');
  await mode(page,'Editor');await preset(page,1);await mode(page,'ArchViz');await expect(page.getByTestId('fps-joystick')).toBeHidden();await expect(page.locator('.mobile-dock')).toBeHidden();
  await page.evaluate(()=>{const view=window.__ROOM_ATELIER__!.view;view.camera.position.set(-.95,1.65,-2.5);view.camera.lookAt(-.95,1.65,2);Reflect.get(view,'navigation').syncFromCamera();});await page.locator('canvas').focus();
  const before=await page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.toArray());
  await page.keyboard.down('w');try{await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.z)).toBeGreaterThan(before[2]+.3);}finally{await page.keyboard.up('w');}
  const y=await page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.y);await page.keyboard.down('Space');try{await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.y)).toBeGreaterThan(y+.12);}finally{await page.keyboard.up('Space');}
  const high=await page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.y);await page.keyboard.down('Control');try{await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.y)).toBeLessThan(high-.12);}finally{await page.keyboard.up('Control');}
  await page.getByTestId('fps-look').click();await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.tagName)).toBe('CANVAS');const quaternion=await page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.quaternion.toArray());await page.mouse.move(80,50);await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.quaternion.toArray())).not.toEqual(quaternion);await page.keyboard.press('Escape');
 });

 test('touch FPS exposes a native joystick and separates it from editor controls',async({page},info)=>{
  test.skip(!info.project.use.hasTouch,'Touch controls are tested on touch projects');await mode(page,'ArchViz');await expect(page.getByTestId('fps-joystick')).toBeVisible();await expect(page.getByTestId('fps-look')).toBeHidden();await expect(page.locator('.mobile-dock')).toBeVisible();
  if(info.project.use.browserName==='chromium'){
   const box=await page.getByTestId('fps-joystick').boundingBox();expect(box).toBeTruthy();const initial=await page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.z),session=await page.context().newCDPSession(page);const point={x:box!.x+box!.width/2,y:box!.y+box!.height/2,id:1};
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,y:point.y-30}]});try{await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.z)).toBeGreaterThan(initial+.12);}finally{await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
  }
  await mode(page,'Editor');await expect(page.getByTestId('fps-joystick')).toBeHidden();
 });
});

test('WebGL2 unavailable shows usable limited view instead of a blank screen',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;const wrapped=function(this:HTMLCanvasElement,type:string,...args:unknown[]):RenderingContext|null {if(type==='webgl2')return null;return (original as unknown as (this:HTMLCanvasElement,type:string,...args:unknown[])=>RenderingContext|null).call(this,type,...args);};HTMLCanvasElement.prototype.getContext=wrapped as typeof original;});
 await page.goto('/');await expect(page.getByText(/WebGL|Полегшений перегляд/i).first()).toBeVisible({timeout:30_000});await expect(page.locator('img').first()).toBeVisible();await expect(page.getByTestId('preset-select')).toBeDisabled();await expect(page.getByRole('button',{name:'Editor',exact:true})).toBeDisabled();
});
