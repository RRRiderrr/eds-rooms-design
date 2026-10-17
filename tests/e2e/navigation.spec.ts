import {test,expect} from '@playwright/test';
import type {Mesh} from 'three';

test('actual lounge and full-space windows block walking and raised flight',async({page})=>{
 test.setTimeout(120_000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?mode=editor');
 await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready===true);
 await page.locator('[data-property="quality"]').selectOption('low');
 await page.getByTestId('preset-select').selectOption('builtin-0');
 await page.evaluate(()=>window.__ROOM_ATELIER__!.setMode('archviz'));
 await page.evaluate(async()=>{await Reflect.get(window.__ROOM_ATELIER__!.view,'archvizPromise');});
 await page.waitForFunction(()=>{
  const view=window.__ROOM_ATELIER__?.view;
  return !!view&&(Reflect.get(view,'collisionMeshes') as Mesh[]).some(mesh=>mesh.userData.archCategory==='windows');
 },undefined,{timeout:60_000});
 const windows=await page.evaluate(()=>{
  const view=window.__ROOM_ATELIER__!.view;
  const groups=[view.architecture.production.getObjectByName('Window_06_Pane_1'),view.architecture.production.getObjectByName('Space_windows')];
  return groups.map((group,index)=>{
   if(!group)throw new Error(`Missing actual window group ${index}`);let pane:Mesh|undefined;
   group.traverse(node=>{
    if(pane||!('isMesh' in node)||!node.isMesh)return;
    const mesh=node as Mesh;
    if((Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>/^06_WINDOW_PANES/.test(String(m.userData.blenderMaterialName??m.name))))pane=mesh;
   });
   if(!pane)throw new Error(`Missing actual window ${index}`);
   pane.updateWorldMatrix(true,false);const attribute=pane.geometry.getAttribute('position'),indices=pane.geometry.index;
   for(let i=0;i<(indices?.count??attribute.count);i+=3){
    const vertices=[0,1,2].map(offset=>view.camera.position.clone().fromBufferAttribute(attribute,indices?indices.getX(i+offset):i+offset).applyMatrix4(pane!.matrixWorld));
    const normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
    if(normal.length()<.05||Math.abs(normal.normalize().z)<.9)continue;
    const point=vertices[0].add(vertices[1]).add(vertices[2]).multiplyScalar(1/3);
    return{name:pane.name,point:point.toArray()};
   }throw new Error(`Missing broad glazing face ${pane.name}`);
  });
 });
 for(const sample of windows)for(const height of [1.65,2.4]){
  await page.evaluate(({point,height})=>{
   const v=window.__ROOM_ATELIER__!.view;v.camera.position.set(point[0],height,point[2]-.5);v.camera.lookAt(point[0],height,point[2]+1);v.navigation.syncFromCamera();
  },{point:sample.point,height});
  await page.locator('canvas').focus();await page.keyboard.down('w');
  try{await page.evaluate(()=>{const v=window.__ROOM_ATELIER__!.view;for(let i=0;i<24;i++)v.navigation.update(.06);});}
  finally{await page.keyboard.up('w');}
  const camera=await page.evaluate(()=>window.__ROOM_ATELIER__!.view.camera.position.toArray());
  expect(camera[2],`${sample.name} at y=${height}: movement reached the pane`).toBeGreaterThan(sample.point[2]-.49);
  expect(camera[2],`${sample.name} at y=${height}: glass blocks passage`).toBeLessThan(sample.point[2]-.09);
  expect(camera[1]).toBeCloseTo(height,3);
 }
 expect(errors).toEqual([]);
});
