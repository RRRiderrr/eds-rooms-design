import './browser-path.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const output='test-results/hall-volume-logos';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']}),page=await browser.newPage({viewport:{width:1440,height:1000}}),report={presets:[],errors:[]};
page.on('pageerror',error=>report.errors.push(error.message));page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
try{
 await page.addInitScript(()=>localStorage.setItem('room-atelier-preferences',JSON.stringify({mode:'archviz',quality:'high',region:'hall'})));
 await page.goto('http://127.0.0.1:4174/');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready&&!document.querySelector('#loading'),null,{timeout:180000});
 for(const index of [1,4,6,7]){
  await page.getByTestId('preset-select').selectOption(`hall-preset-${index}`);
  await page.waitForFunction(()=>[...window.__ROOM_ATELIER__.view.visuals.values()].every(v=>v.mode!=='archviz'||!!v.templateKey),null,{timeout:120000});
  const result=await page.evaluate(()=>{
   const app=window.__ROOM_ATELIER__,v=app.view,c=app.store.state,object=c.objects.find(o=>o.id==='HallVolumeLogo'),root=v.visuals.get(object.id).root;
   root.updateWorldMatrix(true,true);const point=v.camera.position.clone(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let vertices=0;
   root.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);point.toArray().forEach((n,axis)=>{min[axis]=Math.min(min[axis],n);max[axis]=Math.max(max[axis],n);});vertices++;}});
   v.navigation.setEnabled(false);v.camera.position.set(object.position[0]-1.5,2.6,object.position[2]+2.4);v.camera.lookAt(...object.position);v.cameraSafe.copy(v.camera.position);v.navigation.syncFromCamera();v.navigation.setEnabled(false);
   return {id:object.id,assetId:object.assetId,variant:object.variant,position:object.position,vertices,depth:max[2]-min[2],desks:c.objects.filter(o=>o.assetId==='hallDesk'&&o.variant>0).length,approvedSigns:c.objects.filter(o=>['edsTimeline','edsUkraine'].includes(o.assetId)&&o.regionId==='hall').length,photoCaption:/з фотографій|як на фото/i.test(document.body.textContent)};
  });
  assert.equal(result.variant,6);assert(result.vertices>100&&result.depth>.06&&result.depth<.09);assert.equal(result.desks,26);assert.equal(result.approvedSigns,2);assert.equal(result.photoCaption,false);
  await page.waitForTimeout(100);await page.screenshot({path:`${output}/hall-${index}.png`});report.presets.push({index,...result});
 }
 assert.deepEqual(report.errors,[]);report.status='passed';console.log(JSON.stringify({status:report.status,presets:report.presets.map(p=>({index:p.index,depth:p.depth,desks:p.desks})),errors:report.errors}));
}catch(error){report.status='failed';report.failure=error.stack??String(error);console.error(report.failure);process.exitCode=1;}finally{await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser.close();}
