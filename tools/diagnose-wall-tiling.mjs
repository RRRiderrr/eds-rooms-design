import './browser-path.mjs';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const output=path.resolve(import.meta.dirname,'../test-results/wall-tiling-diagnostic');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});const report={cases:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto('http://127.0.0.1:4174/?mode=editor');await page.waitForFunction(()=>window.__ROOM_ATELIER__?.ready,null,{timeout:120000});
 await page.evaluate(async()=>{const a=window.__ROOM_ATELIER__,config=structuredClone(a.store.state);config.objects=[];config.wallFinishes={};config.layers.grid=false;a.store.replace(config);a.select(null);a.view.quality.setManual('high');a.setMode('archviz');await a.view.archvizPromise;await a.view.tierRefresh;a.view.navigation.setEnabled(false);a.view.keepCameraSafe=()=>{};
  const saved=[];a.view.architecture.production.traverse(o=>{if(o.isMesh&&o.userData.archCategory==='walls')for(const m of Array.isArray(o.material)?o.material:[o.material])saved.push({o,m,fields:Object.fromEntries(['map','normalMap','roughnessMap','metalnessMap','aoMap','lightMap','lightMapIntensity'].map(k=>[k,m[k]])),receiveShadow:o.receiveShadow});});window.__WALL_DIAGNOSTIC__={saved};
 });
 await page.addStyleTag({content:'.topbar,.library-panel,.footer,.mobile-dock,.viewport-area>:not(.viewport){display:none!important}.atelier,.workspace,.viewport-area{height:100vh!important;width:100vw!important;max-width:none!important;margin:0!important;padding:0!important}'});
 const walls=[{id:'west',axis:'x',coordinate:-2.6018175,normal:[1,0,0]},{id:'east',axis:'x',coordinate:2.6018175,normal:[-1,0,0]},{id:'near',axis:'z',coordinate:-3.0488905,normal:[0,0,1]}],panels=[];
 for(const [wi,wall]of walls.entries()){
  const metrics=await page.evaluate(wall=>{
   const v=window.__ROOM_ATELIER__.view,Vec=v.camera.position.constructor;v.camera.fov=62;const target=new Vec(wall.axis==='x'?wall.coordinate:.137,1.557,wall.axis==='z'?wall.coordinate:.137);v.camera.position.copy(target).addScaledVector(new Vec(...wall.normal),.4);v.camera.lookAt(target);v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld(true);v.scene.updateMatrixWorld(true);v.shadowDirty=true;
   v.ray.set(v.camera.position,new Vec(...wall.normal).negate());const hits=v.ray.intersectObject(v.architecture.production,true).slice(0,8).map(hit=>{
    const mesh=hit.object,p=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv'),idx=mesh.geometry.index,face=hit.faceIndex,ids=idx?[idx.getX(face*3),idx.getX(face*3+1),idx.getX(face*3+2)]:[face*3,face*3+1,face*3+2],points=ids.map(i=>new Vec().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld)),uvs=ids.map(i=>[uv.getX(i),uv.getY(i)]),along=wall.axis==='x'?'z':'x',a=points[1][along]-points[0][along],b=points[1].y-points[0].y,c=points[2][along]-points[0][along],d=points[2].y-points[0].y,det=a*d-b*c,du1=uvs[1][0]-uvs[0][0],dv1=uvs[1][1]-uvs[0][1],du2=uvs[2][0]-uvs[0][0],dv2=uvs[2][1]-uvs[0][1],gradient=Math.abs(det)>1e-9?{duAlong:(du1*d-b*du2)/det,duY:(a*du2-du1*c)/det,dvAlong:(dv1*d-b*dv2)/det,dvY:(a*dv2-dv1*c)/det}:null,mat=Array.isArray(mesh.material)?mesh.material[hit.face.materialIndex]:mesh.material;
    return {name:mesh.name,metadata:v.architecture.getMetadata(mesh),distance:hit.distance,point:hit.point.toArray(),gradient,uvs,material:{name:mat.name,source:mat.userData.blenderMaterialName,normalScale:mat.normalScale?.toArray(),maps:Object.fromEntries(['map','normalMap','roughnessMap','metalnessMap','aoMap','lightMap'].map(k=>[k,mat[k]?{name:mat[k].name,source:mat[k].image?.src,repeat:mat[k].repeat.toArray(),wrapS:mat[k].wrapS,wrapT:mat[k].wrapT,channel:mat[k].channel,mipmaps:mat[k].mipmaps?.length}:null]))}};
   });return {wall:wall.id,hits};
  },wall);
  report.cases.push(metrics);
  const modes=['baseline','no-normal','no-surface-maps','no-lightmap','no-shadows','raw-render'];
  for(const [mi,mode]of modes.entries()){
   await page.evaluate(mode=>{const v=window.__ROOM_ATELIER__.view,{saved}=window.__WALL_DIAGNOSTIC__;for(const {o,m,fields,receiveShadow}of saved){Object.assign(m,fields);o.receiveShadow=receiveShadow;if(mode==='no-normal')m.normalMap=null;if(mode==='no-surface-maps')for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])m[k]=null;if(mode==='no-lightmap')m.lightMap=null;if(mode==='no-shadows')o.receiveShadow=false;m.needsUpdate=true;}v.shadowDirty=true;if(mode==='raw-render'){cancelAnimationFrame(v.raf);v.renderer.render(v.scene,v.camera);v.renderer.getContext().finish();}},mode);
   if(mode!=='raw-render')await page.waitForTimeout(180);const png=await page.locator('#viewport canvas').screenshot();const file=wall.id+'-'+mode+'.png';await writeFile(path.join(output,file),png);
   const small=await sharp(png).resize(480,360).toBuffer(),caption=Buffer.from(`<svg width="480" height="30"><rect width="480" height="30" fill="white"/><text x="10" y="21" font-family="Arial" font-size="17">${wall.id} · ${mode}</text></svg>`);panels.push({input:small,left:mi*480,top:wi*390+30},{input:caption,left:mi*480,top:wi*390});
   const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});const means=[];for(let y=30;y<info.height-30;y++){let sum=0;for(let x=30;x<info.width-30;x++){const i=(y*info.width+x)*3;sum+=(data[i]+data[i+1]+data[i+2])/3;}means.push(sum/(info.width-60));}metrics[mode]={file,rowMeans:means};
   if(mode==='raw-render')await page.evaluate(()=>window.__ROOM_ATELIER__.view.frame(performance.now()));
  }
 }
 await sharp({create:{width:480*6,height:390*3,channels:3,background:'#ffffff'}}).composite(panels).png().toFile(path.join(output,'isolation-contact-sheet.png'));
 report.glError=await page.evaluate(()=>window.__ROOM_ATELIER__.view.renderer.getContext().getError());await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({errors:report.errors,glError:report.glError,cases:report.cases.map(c=>({wall:c.wall,hits:c.hits.map(h=>({name:h.name,distance:h.distance,gradient:h.gradient,normalScale:h.material.normalScale,source:h.material.source}))}))},null,2));
}finally{await browser.close();}
