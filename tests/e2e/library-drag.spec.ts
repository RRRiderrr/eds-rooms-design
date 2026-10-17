import { test,expect,type Page } from '@playwright/test';

async function state(page:Page){return page.evaluate(()=>window.__ROOM_ATELIER__!.store.state);}
async function preview(page:Page){return page.evaluate(()=>window.__ROOM_ATELIER__!.view.getLibraryPlacement());}
async function library(page:Page,category?:string){
  if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches&&!document.querySelector('.atelier')!.classList.contains('drawer-open')))await page.locator('.mobile-dock [data-action="drawer"]').click();
  await page.getByTestId('library-tab').click();if(category)await page.getByRole('button',{name:category,exact:true}).click();
}
async function project(page:Page,point:[number,number,number]){return page.evaluate(point=>{const view=window.__ROOM_ATELIER__!.view;view.camera.updateMatrixWorld();const p=view.camera.position.clone().set(...point).project(view.camera),r=view.renderer.domElement.getBoundingClientRect();return{x:r.left+(p.x+1)/2*r.width,y:r.top+(1-p.y)/2*r.height};},point);}
async function startMouse(page:Page,assetId:string){const card=page.getByTestId(`add-${assetId}`),box=(await card.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+9,box.y+box.height/2,{steps:2});await expect(page.getByTestId('library-drag-label')).toBeVisible();}

test.describe('Direct placement from the asset library',()=>{
  let errors:string[]=[];
  test.beforeEach(async({page})=>{
    errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('response',response=>{if(response.status()>=400&&response.url().includes('/assets/'))errors.push(`HTTP ${response.status()}: ${response.url()}`);});
    await page.goto('/?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready===true,undefined,{timeout:60_000});
    await library(page);await page.getByTestId('preset-select').selectOption('builtin-0');
    await page.evaluate(()=>{const view=window.__ROOM_ATELIER__!.view;view.camera.position.set(4.8,7,-6);view.controls.target.set(0,.25,0);view.controls.update();});
  });
  test.afterEach(async({page},info)=>{expect(errors).toEqual([]);if(info.status!==info.expectedStatus)await info.attach('touch-event-log',{body:JSON.stringify(await page.evaluate(()=>Reflect.get(window,'__dragEvents')),null,2),contentType:'application/json'});});

  test('desktop card drag follows snapped and free floor positions, commits once, and supports undo',async({page},info)=>{
    test.skip(!!info.project.use.hasTouch,'Mouse gesture');
    const before=(await state(page)).objects.length;await library(page,'Дивани та крісла');await startMouse(page,'sofa');
    const a=await project(page,[-.73,0,-.48]);await page.mouse.move(a.x,a.y,{steps:8});
    await expect.poll(async()=>(await preview(page))?.valid).toBe(true);expect((await preview(page))!.object!.position[0]).toBeCloseTo(-.75);expect((await state(page)).objects).toHaveLength(before);
    const b=await project(page,[-.47,0,.27]);await page.mouse.move(b.x,b.y,{steps:5});await expect.poll(async()=>(await preview(page))?.object?.position[0]).toBeCloseTo(-.5);
    expect((await preview(page))!.object!.position[2]).toBeCloseTo(.25);await page.mouse.up();await expect.poll(async()=>(await state(page)).objects.length).toBe(before+1);
    expect((await state(page)).objects.filter(o=>o.assetId==='sofa')).toHaveLength(1);expect(await preview(page)).toBeNull();await expect(page.getByTestId('library-drag-label')).toHaveCount(0);
    await page.getByTestId('undo').click();expect((await state(page)).objects).toHaveLength(before);
    await page.getByTestId('snap').click();await library(page,'Дивани та крісла');await startMouse(page,'sofa');const smooth=await project(page,[-.637,0,-.413]);await page.mouse.move(smooth.x,smooth.y,{steps:8});await expect.poll(async()=>(await preview(page))?.valid).toBe(true);
    expect((await preview(page))!.object!.position[0]).toBeCloseTo(-.637,2);await page.mouse.up();expect((await state(page)).objects.filter(o=>o.assetId==='sofa')).toHaveLength(1);
    await info.attach('direct-floor-placement',{body:await page.screenshot(),contentType:'image/png'});
  });

  test('invalid release, Escape and outside release never add an asset or leave a ghost',async({page},info)=>{
    test.skip(!!info.project.use.hasTouch,'Mouse cancellation');
    await library(page,'Дивани та крісла');await page.getByTestId('add-sofa').click();const first=(await state(page)).objects.find(o=>o.assetId==='sofa')!,count=(await state(page)).objects.length;
    await library(page);await startMouse(page,'sofa');const collision=await project(page,first.position);await page.mouse.move(collision.x,collision.y,{steps:7});await expect.poll(async()=>(await preview(page))?.valid).toBe(false);await expect(page.getByTestId('library-drag-label')).toHaveAttribute('data-valid','false');await page.mouse.up();expect((await state(page)).objects).toHaveLength(count);
    await startMouse(page,'sofa');const empty=await project(page,[-1.1,0,1.5]);await page.mouse.move(empty.x,empty.y,{steps:7});await expect.poll(async()=>(await preview(page))?.valid).toBe(true);await page.keyboard.press('Escape');await page.mouse.up();expect((await state(page)).objects).toHaveLength(count);expect(await preview(page)).toBeNull();
    await startMouse(page,'sofa');await page.mouse.move(50,20,{steps:6});await page.mouse.up();expect((await state(page)).objects).toHaveLength(count);expect(await preview(page)).toBeNull();await expect(page.locator('body')).not.toHaveClass(/library-placing/);
    expect(await page.evaluate(()=>window.__ROOM_ATELIER__!.view.scene.getObjectByName('Library_Placement_Preview'))).toBeUndefined();
  });

  test('wall and support-top assets attach to the actual chosen surface before release',async({page},info)=>{
    test.skip(!!info.project.use.hasTouch,'Precise mouse surface coverage');
    await library(page,'Настінний декор');const before=(await state(page)).objects.length;await startMouse(page,'art');const wall=await project(page,[-2.6018175,1.65,.25]);await page.mouse.move(wall.x,wall.y,{steps:8});
    await expect.poll(async()=>(await preview(page))?.valid).toBe(true);expect((await preview(page))!.surface).toBe('wall');expect((await preview(page))!.object!.wallId).toBeTruthy();expect((await state(page)).objects).toHaveLength(before);await page.mouse.up();
    await library(page,'Робочі поверхні');await page.getByTestId('add-workDesk').click();const desk=(await state(page)).objects.find(o=>o.assetId==='workDesk')!;
    await library(page,'Аксесуари');await startMouse(page,'coffeeMachine');const top=await project(page,[desk.position[0],.74,desk.position[2]]);await page.mouse.move(top.x,top.y,{steps:8});await expect.poll(async()=>(await preview(page))?.valid).toBe(true);expect((await preview(page))!.surface).toBe('support');expect((await preview(page))!.object!.position[1]).toBe(.74);await page.mouse.up();
    const count=(await state(page)).objects.length;expect((await state(page)).objects.find(o=>o.assetId==='coffeeMachine')!.position[1]).toBe(.74);
    await library(page);await startMouse(page,'coffeeMachine');const floor=await project(page,[-1.5,0,1]);await page.mouse.move(floor.x,floor.y,{steps:8});await expect.poll(async()=>(await preview(page))?.valid).toBe(false);await page.mouse.up();expect((await state(page)).objects).toHaveLength(count);
    await info.attach('surface-aware-placement',{body:await page.screenshot(),contentType:'image/png'});
  });

  test('touch grip drags directly while the rest of the catalog still scrolls',async({page},info)=>{
    test.skip(!info.project.use.hasTouch||info.project.use.browserName!=='chromium','Native touch dispatch through Chromium CDP');
    await page.evaluate(()=>{const events:unknown[]=[];Reflect.set(window,'__dragEvents',events);for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','gotpointercapture','click'])window.addEventListener(type,event=>{const e=event as PointerEvent,t=e.target as HTMLElement;events.push({type,id:e.pointerId,x:e.clientX,y:e.clientY,target:t.className,touch:getComputedStyle(t).touchAction,preview:window.__ROOM_ATELIER__!.view.getLibraryPlacement(),placing:document.body.classList.contains('library-placing')});},true);});
    await library(page,'Дивани та крісла');const count=(await state(page)).objects.length,session=await page.context().newCDPSession(page),card=page.getByTestId('add-sofa');await card.scrollIntoViewIfNeeded();
    const initialScroll=await page.locator('#panel-content').evaluate(el=>el.scrollTop),box=(await card.boundingBox())!,panel=(await page.locator('#panel-content').boundingBox())!,x=box.x+box.width/2,y=Math.max(panel.y+15,Math.min(panel.y+panel.height-15,box.y+45));
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*16,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    expect((await state(page)).objects).toHaveLength(count);expect(await preview(page)).toBeNull();await expect.poll(()=>page.locator('#panel-content').evaluate(el=>el.scrollTop)).toBeGreaterThan(initialScroll);
    await page.locator('#panel-content').evaluate(el=>el.scrollTop=0);await card.scrollIntoViewIfNeeded();const grip=(await card.locator('[data-drag-handle]').boundingBox())!,gx=grip.x+grip.width/2,gy=grip.y+grip.height/2;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:gx,y:gy,id:2}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:gx-10,y:gy,id:2}]});await expect(page.getByTestId('library-drag-label')).toBeVisible();
    await page.waitForTimeout(300);const target=await project(page,[-.5,0,-.25]);await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x,y:target.y,id:2}]});await expect.poll(async()=>(await preview(page))?.valid).toBe(true);expect((await state(page)).objects).toHaveLength(count);
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();await expect.poll(async()=>(await state(page)).objects.length).toBe(count+1);expect((await state(page)).objects.filter(o=>o.assetId==='sofa')).toHaveLength(1);expect(await preview(page)).toBeNull();
    await info.attach('touch-library-drop',{body:await page.screenshot(),contentType:'image/png'});
  });
});
