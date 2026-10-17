import {test,expect} from '@playwright/test';
import sharp from 'sharp';

test('High preserves opaque architecture with a panorama and four-sample AA',async({page},info)=>{
 test.setTimeout(120_000);await page.setViewportSize({width:980,height:720});const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready);
 await page.evaluate(()=>{const a=window.__ROOM_ATELIER__!;const config=structuredClone(a.store.state);config.objects=config.objects.filter(o=>o.assetId==='edsSignage'&&o.wallId==='wall-38');a.store.applyPreset(config);a.setMode('archviz');});
 await page.evaluate(()=>Reflect.get(window.__ROOM_ATELIER__!.view,'archvizPromise'));
 await page.locator('[data-property=quality]').selectOption('high');await page.evaluate(()=>Reflect.get(window.__ROOM_ATELIER__!.view,'tierRefresh'));await page.waitForTimeout(1000);
 const samples=await page.evaluate(()=>Reflect.get(window.__ROOM_ATELIER__!.view,'composer').renderTarget1.samples);expect(samples).toBeGreaterThanOrEqual(2);
 await page.evaluate(()=>{const v=window.__ROOM_ATELIER__!.view;cancelAnimationFrame(Reflect.get(v,'raf'));v.camera.position.set(0,1.65,-1.8);v.camera.lookAt(0,1.7,2.5);v.camera.updateMatrixWorld(true);});
 const points=await page.evaluate(()=>{const v=window.__ROOM_ATELIER__!.view,rect=v.renderer.domElement.getBoundingClientRect();return [[2.2,1.8,3.04],[1,0,2.6]].map(p=>{const s=v.camera.position.clone().set(p[0],p[1],p[2]).project(v.camera);return{x:rect.left+(s.x+1)*rect.width/2,y:rect.top+(1-s.y)*rect.height/2};});});
 const colors: number[][][]=[];
 for(const color of ['#ff00ff','#00ff00']){
  await page.evaluate(color=>{const v=window.__ROOM_ATELIER__!.view;let reference:any;v.architecture.production.traverse(o=>{if(!reference&&(o as any).isMesh)reference=Array.isArray((o as any).material)?(o as any).material[0]:(o as any).material;});v.scene.background=reference.color.clone().set(color);Reflect.get(v,'composer').render();},color);
  const buffer=await page.screenshot();const metadata=await sharp(buffer).metadata();const scale=metadata.width!/980;const values=[];
  for(const p of points){const x=Math.round(p.x*scale),y=Math.round(p.y*scale);expect(x).toBeGreaterThan(4);expect(y).toBeGreaterThan(4);const {data,info:raw}=await sharp(buffer).extract({left:x-2,top:y-2,width:5,height:5}).removeAlpha().raw().toBuffer({resolveWithObject:true});values.push([0,1,2].map(c=>{let total=0;for(let i=c;i<data.length;i+=raw.channels)total+=data[i];return total/25;}));}
  colors.push(values);
 }
 // The wall must occlude the changing background. Floor SSR may contribute a
 // bounded reflection, but must never replace the opaque floor with the sky.
 const wallDelta=Math.max(...colors[0][0].map((v,i)=>Math.abs(v-colors[1][0][i])));const floorDelta=Math.max(...colors[0][1].map((v,i)=>Math.abs(v-colors[1][1][i])));
 expect(wallDelta).toBeLessThan(5);expect(floorDelta).toBeLessThan(55);expect(errors).toEqual([]);
 await info.attach('opaque-architecture',{body:JSON.stringify({samples,points,colors,wallDelta,floorDelta,errors}),contentType:'application/json'});
});
