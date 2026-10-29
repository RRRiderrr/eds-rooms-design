import { test, expect, type Page, type TestInfo } from '@playwright/test';
import type { SceneConfig } from '../../src/core/types';
import type { Mesh, MeshStandardMaterial } from 'three';

async function configuration(page:Page):Promise<SceneConfig> { return page.evaluate(()=>window.__ROOM_ATELIER__!.store.state); }
async function settle(page:Page) { await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))); }
async function setMode(page:Page, mode:'Editor'|'ArchViz') {
  await page.getByRole('button',{name:mode,exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.getMode())).toBe(mode.toLowerCase());
}
async function panel(page:Page, tab:'library'|'scene'='library') {
  if(!await page.getByTestId(`${tab}-tab`).isVisible()) await page.locator('.mobile-dock [data-action="drawer"]').click();
  await page.getByTestId(`${tab}-tab`).click();
}
async function preset(page:Page,index:number) {
  if(!await page.getByTestId('preset-select').isVisible()) await panel(page);
  await page.getByTestId('preset-select').selectOption(`builtin-${index}`);
  await expect.poll(async()=>(await configuration(page)).presetId).toBe(`builtin-${index}`);
}
async function properties(page:Page) {
  const toggle=page.getByTestId('inspector-toggle');
  if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')!=='true') await toggle.click();
  await expect(page.getByTestId('variant-select')).toBeVisible();
}
async function addFromLibrary(page:Page,category:string,assetId:string) {
  await panel(page);
  await page.getByRole('button',{name:category,exact:true}).click();
  await page.getByTestId(`add-${assetId}`).click();
  await properties(page);
  return [...(await configuration(page)).objects].reverse().find(o=>o.assetId===assetId)!.id;
}
async function productionAsset(page:Page,id:string) {
  await expect.poll(()=>page.evaluate(objectId=>{
    const object=window.__ROOM_ATELIER__!.view.objects.getObjectByName(objectId);
    let importedMeshes=0;
    object?.traverse(node=>{if(node.userData.sharedGeometry) importedMeshes++;});
    return importedMeshes;
  },id),{timeout:45_000,message:`Optimized production GLB loaded for ${id}`}).toBeGreaterThan(0);
}
async function productionMaterials(page:Page,id:string) {
  return page.evaluate(objectId=>{
    const result:{surface:string;color:string;sourcePbr:boolean;tintable:boolean;map:boolean;normalMap:boolean;transparent:boolean;opacity:number;alphaTest:number}[]=[];
    window.__ROOM_ATELIER__!.view.objects.getObjectByName(objectId)?.traverse(node=>{
      if(!node.userData.sharedGeometry)return;
      const mesh=node as Mesh;
      for(const raw of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
        const material=raw as MeshStandardMaterial;
        result.push({surface:material.userData.surface,color:material.color.getHexString(),sourcePbr:!!material.userData.sourcePbr,tintable:!!material.userData.tintable,map:!!material.map,normalMap:!!material.normalMap,transparent:material.transparent,opacity:material.opacity,alphaTest:material.alphaTest});
      }
    });return result;
  },id);
}
async function attachBudget(page:Page,info:TestInfo) {
  const budget=await page.evaluate(()=>{const view=window.__ROOM_ATELIER__!.view;return {camera:view.camera.position.toArray(),drawCalls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,textures:view.renderer.info.memory.textures,geometries:view.renderer.info.memory.geometries,canvas:[view.renderer.domElement.width,view.renderer.domElement.height]};});
  await info.attach('render-budget',{body:JSON.stringify(budget,null,2),contentType:'application/json'});
}

test.describe('EDS furniture, navigation, signage and identity regression',()=>{
  let errors:string[]=[];
  test.beforeEach(async({page})=>{
    errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'||message.type()==='warning'&&message.text().includes('Generated production mesh retained')) errors.push(message.text());});
    page.on('response',response=>{if(response.status()>=400&&response.url().includes('/assets/')) errors.push(`${response.status()} ${response.url()}`);});
    await page.goto('/?mode=editor');
    await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready===true||document.querySelector('.limited')!==null,undefined,{timeout:60_000});
    await expect(page.locator('.fallback-notice')).toHaveCount(0);
    await page.locator('[data-property="quality"]').selectOption('medium');
    await expect(page.locator('canvas')).toBeVisible();
  });
  test.afterEach(async({page},info)=>{
    await info.attach('browser-errors',{body:JSON.stringify(errors,null,2),contentType:'application/json'});
    await attachBudget(page,info).catch(()=>{});
    expect(errors).toEqual([]);
  });

  test('right-clicking actual floor outside the lounge launches ArchViz at that point',async({page},info)=>{
    test.skip(!!info.project.use.hasTouch,'Context menu is the desktop action; touch navigation has separate coverage.');
    await preset(page,0);
    const point=await page.evaluate(()=>{
      const view=window.__ROOM_ATELIER__!.view;
      view.camera.position.set(10,10,-10);view.controls.target.set(10,0,-3.6);view.controls.update();view.camera.updateMatrixWorld();
      const world=view.camera.position.clone().set(10,.015,-3.6),ndc=world.clone().project(view.camera),rect=view.renderer.domElement.getBoundingClientRect();
      return {world:world.toArray(),x:rect.left+(ndc.x+1)/2*rect.width,y:rect.top+(1-ndc.y)/2*rect.height};
    });
    await settle(page);
    await page.mouse.click(point.x,point.y,{button:'right'});
    await expect(page.getByTestId('launch-archviz-here')).toBeVisible();
    await expect(page.getByTestId('launch-archviz-here')).toHaveText('Запустити ArchViz тут');
    await page.getByTestId('launch-archviz-here').click();
    await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.getMode())).toBe('archviz');
    await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.x),{timeout:45_000}).toBeCloseTo(point.world[0],1);
    const camera=await page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.toArray());
    expect(camera[2]).toBeCloseTo(point.world[2],1);expect(camera[1]).toBeCloseTo(1.65,1);expect(Math.abs(camera[0])).toBeGreaterThan(3);
    await info.attach('launched-hall-view',{body:await page.screenshot(),contentType:'image/png'});
  });

  test('all fixed direct fixtures retain position, intensity and target while walking',async({page},info)=>{
    test.skip(!!info.project.use.hasTouch,'Keyboard walking regression runs on desktop projects.');
    await preset(page,0);await setMode(page,'ArchViz');
    await page.waitForFunction(()=>window.__ROOM_ATELIER__!.view.scene.getObjectByName('Runtime_Direct_Lighting')?.children.filter(n=>'isLight' in n).length===25,undefined,{timeout:45_000});
    const fixtures=()=>page.evaluate(()=>{
      const group=window.__ROOM_ATELIER__!.view.scene.getObjectByName('Runtime_Direct_Lighting')!;
      return group.children.filter(node=>'isLight' in node).map(node=>{
        const light=node as unknown as {name:string;position:{toArray:()=>number[]};intensity:number;visible:boolean;target:{position:{toArray:()=>number[]}}};
        return {id:light.name,position:light.position.toArray(),intensity:light.intensity,visible:light.visible,target:light.target.position.toArray()};
      }).sort((a,b)=>a.id.localeCompare(b.id));
    });
    const before=await fixtures();expect(before).toHaveLength(25);expect(before.every(l=>l.intensity>0)).toBe(true);
    expect(await page.evaluate(()=>window.__ROOM_ATELIER__!.view.enterAt([10,0,-3.6]))).toBe(true);
    await page.evaluate(()=>{const view=window.__ROOM_ATELIER__!.view;view.camera.lookAt(12,1.65,-3.6);view.navigation.syncFromCamera();});
    await page.locator('canvas').focus();const start=await page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.x);
    await page.keyboard.down('w');try{await expect.poll(()=>page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.x)).toBeGreaterThan(start+.3);}finally{await page.keyboard.up('w');}
    expect(await fixtures()).toEqual(before);
    expect(await page.evaluate(()=>window.__ROOM_ATELIER__!.view.enterAt([-12,0,-3.6]))).toBe(true);
    await settle(page);expect(await fixtures()).toEqual(before);
    await info.attach('fixed-light-sources',{body:JSON.stringify(before,null,2),contentType:'application/json'});
  });

  test('header actions never overlap and the help action remains reachable',async({page},info)=>{
    const layout=await page.locator('.topbar').evaluate(header=>{
      const elements=[...header.querySelectorAll<HTMLElement>('.brand,.mode-switch button,.top-actions button')].filter(el=>el.getBoundingClientRect().width>0);
      const rectangles=elements.map(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label:el.getAttribute('aria-label')||el.textContent?.trim(),x:r.x,y:r.y,width:r.width,height:r.height,reachable:!!hit&&el.contains(hit)};});
      const overlaps:unknown[]=[];for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){const a=rectangles[i],b=rectangles[j];if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1)overlaps.push([a.label,b.label]);}
      return {rectangles,overlaps,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    expect(layout.overlaps).toEqual([]);expect(layout.rectangles.every(r=>r.reachable)).toBe(true);expect(layout.overflow).toBe(false);
    if(info.project.use.hasTouch)for(const rect of layout.rectangles.filter(r=>r.label!=='rooms design — головна')){expect(rect.width).toBeGreaterThanOrEqual(43);expect(rect.height).toBeGreaterThanOrEqual(43);}
    const help=page.locator('.top-actions [data-action="help"]');
    if(await help.isVisible()) {
      await help.click();await expect(page.locator('dialog[open]')).toBeVisible();
      await page.locator('dialog [data-action="dialog-close"]').click();await expect(page.locator('dialog[open]')).toHaveCount(0);
    } else expect(!!info.project.use.hasTouch).toBe(true);
    await info.attach('header-layout',{body:JSON.stringify(layout,null,2),contentType:'application/json'});
    await info.attach('editor-interface',{body:await page.screenshot(),contentType:'image/png'});
  });

  test('the favicon, touch icon and install icons use the real EDS PNG identity',async({page})=>{
    await expect(page).toHaveTitle('EDS rooms design');
    const favicon=page.locator('link[rel="icon"]');await expect(favicon).toHaveAttribute('type','image/png');await expect(favicon).toHaveAttribute('href',/assets\/brand\/eds-32\.png$/);
    const icon=await page.request.get(await favicon.evaluate((node:HTMLLinkElement)=>node.href));expect(icon.ok()).toBe(true);const bytes=await icon.body();expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(bytes.readUInt32BE(16)).toBe(32);expect(bytes.readUInt32BE(20)).toBe(32);
    const touch=await page.request.get(await page.locator('link[rel="apple-touch-icon"]').evaluate((node:HTMLLinkElement)=>node.href));expect((await touch.body()).readUInt32BE(16)).toBe(180);
    const manifest=await (await page.request.get(await page.locator('link[rel="manifest"]').evaluate((node:HTMLLinkElement)=>node.href))).json();expect(manifest.name).toBe('EDS rooms design');expect(manifest.icons.map((i:{src:string})=>i.src)).toEqual(['assets/brand/eds-192.png','assets/brand/eds-512.png']);
    expect(await page.locator('.brand img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
  });

  test('new furniture variants swap actual optimized models and coffee machines stay on their support',async({page},info)=>{
    test.setTimeout(180_000);await preset(page,0);
    const examples=[{assetId:'coffeeTable',category:'Столи',variants:[4,5]},{assetId:'barStool',category:'Стільці',variants:[1,2,3]},{assetId:'television',category:'Дошки й екрани',variants:[1,2]},{assetId:'coffeeMachine',category:'Аксесуари',variants:[1,2]}];
    const models=await (await page.request.get('/assets/models/manifest.json')).json();const thumbnails=await (await page.request.get('/assets/thumbnails/manifest.json')).json();const results:unknown[]=[];
    for(const example of examples){
      await setMode(page,'Editor');const id=await addFromLibrary(page,example.category,example.assetId);
      await expect(page.getByTestId('variant-select').locator('option').first()).toHaveAttribute('value','0');
      for(const variant of example.variants){
        await setMode(page,'Editor');await properties(page);await page.getByTestId('variant-select').selectOption(String(variant));await expect.poll(async()=>(await configuration(page)).objects.find(o=>o.id===id)?.variant).toBe(variant);
        if(example.assetId==='coffeeTable'&&variant===4)await page.getByTestId('material-select').selectOption('walnut');
        const entry=models.assets.find((a:{assetId:string;variant:number})=>a.assetId===example.assetId&&a.variant===variant);expect(entry).toBeTruthy();expect(entry.bytes.production).toBeGreaterThan(1000);expect(entry.bytes.proxy).toBeLessThan(entry.bytes.production);
        const thumb=thumbnails.images.find((a:{assetId:string;variant:number})=>a.assetId===example.assetId&&a.variant===variant);expect(thumb).toBeTruthy();expect(thumb.triangles).toBeGreaterThan(50);
        if(example.assetId==='television')expect((await configuration(page)).objects.find(o=>o.id===id)?.wallId).toBeTruthy();
        if(example.assetId==='coffeeMachine'){const config=await configuration(page),machine=config.objects.find(o=>o.id===id)!,support=config.objects.find(o=>o.assetId==='coffeeTable')!;expect(machine.position[1]).toBeCloseTo(.39);expect(machine.position[0]).toBeCloseTo(support.position[0]);expect(machine.position[2]).toBeCloseTo(support.position[2]);}
        await setMode(page,'ArchViz');await productionAsset(page,id);
        if(example.assetId==='coffeeTable'&&variant===4||example.assetId==='coffeeMachine'&&variant===2){
          const materials=await productionMaterials(page,id),glass=materials.filter(m=>m.surface==='glass');
          expect(glass.length).toBeGreaterThan(0);expect(glass.every(m=>m.transparent&&m.opacity>.1&&m.opacity<.6)).toBe(true);
          if(example.assetId==='coffeeTable')expect(glass.every(m=>m.color!=='604533')).toBe(true);
        }
        results.push({assetId:example.assetId,variant,bytes:entry.bytes});
      }
    }
    await info.attach('optimized-new-variants',{body:JSON.stringify(results,null,2),contentType:'application/json'});
    await info.attach('new-furniture-archviz',{body:await page.screenshot(),contentType:'image/png'});
  });

  test('imported source PBR foliage keeps its maps and cutout while only the pot finish changes',async({page},info)=>{
    test.setTimeout(120_000);await preset(page,0);
    const id=await addFromLibrary(page,'Рослини','plant');await setMode(page,'ArchViz');await productionAsset(page,id);
    const before=await productionMaterials(page,id),leaves=before.filter(m=>m.sourcePbr&&m.surface==='leaf');
    expect(leaves.length).toBeGreaterThan(0);expect(leaves.every(m=>m.map&&m.alphaTest>0)).toBe(true);expect(before.some(m=>m.sourcePbr&&m.tintable&&m.map)).toBe(true);
    await setMode(page,'Editor');await properties(page);await page.getByTestId('material-select').selectOption('clay');
    await setMode(page,'ArchViz');await productionAsset(page,id);const after=await productionMaterials(page,id);
    expect(after.filter(m=>m.sourcePbr&&m.surface==='leaf')).toEqual(leaves);
    expect(after.filter(m=>m.sourcePbr&&m.tintable).every(m=>m.color==='b47c65'&&m.map)).toBe(true);
    await info.attach('source-pbr-before-after',{body:JSON.stringify({before,after},null,2),contentType:'application/json'});
  });

  test('every builtin uses the two approved corporate sign families with eight design options',async({page},info)=>{
    test.setTimeout(120_000);const summary:unknown[]=[];
    for(let index=0;index<=15;index++){
      await preset(page,index);const config=await configuration(page),signs=config.objects.filter(o=>['edsTimeline','edsUkraine'].includes(o.assetId)&&o.wallId==='wall-38'&&o.variant>0);
      expect(signs,`Preset ${index} signs`).toHaveLength(2);expect(new Set(signs.map(o=>o.id)).size).toBe(2);expect(signs.map(o=>o.assetId).sort()).toEqual(['edsTimeline','edsUkraine']);
      expect(signs.every(o=>o.wallId==='wall-38')).toBe(true);expect(signs.every(o=>Math.abs(o.position[0])>2.7||Math.abs(o.position[2])>3.1)).toBe(true);
      if(index===0)expect(config.objects.filter(o=>o.variant>0&&o.regionId==='meeting')).toHaveLength(0);
      summary.push({preset:config.presetId,signs:signs.map(o=>({id:o.id,variant:o.variant,wallId:o.wallId,position:o.position}))});
    }
    await panel(page,'scene');const first=(await configuration(page)).objects.find(o=>o.assetId==='edsTimeline')!;await page.locator(`[data-object-id="${first.id}"]`).click();await properties(page);
    await expect(page.getByTestId('variant-select').locator('option')).toHaveCount(9);await expect(page.getByTestId('variant-select').locator('option').first()).toHaveAttribute('value','0');
    await page.getByTestId('variant-select').selectOption('0');await expect.poll(async()=>(await configuration(page)).objects.find(o=>o.id===first.id)?.variant).toBe(0);
    await info.attach('all-preset-corridor-signage',{body:JSON.stringify(summary,null,2),contentType:'application/json'});
  });
});
