import * as THREE from 'three';

/** Yield a browser paint/task turn; the timer also lets background tabs make
 * progress when requestAnimationFrame is suspended. It never advances progress. */
export function yieldStartupFrame():Promise<void>{
 return new Promise(resolve=>{
  let done=false,frame:number|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const finish=()=>{if(done)return;done=true;if(frame!==undefined&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame);if(timer!==undefined)clearTimeout(timer);resolve();};
  if(typeof requestAnimationFrame==='function'){
   frame=requestAnimationFrame(()=>{frame=undefined;if(timer!==undefined)clearTimeout(timer);timer=setTimeout(finish,0);});
   timer=setTimeout(finish,100);
  }else timer=setTimeout(finish,0);
 });
}

/** Only textures actually owned by the loaded scene, never the entire library.
 * Uploading them now removes image decode/transcode/upload from first visibility. */
export async function uploadSceneTextures(renderer:THREE.WebGLRenderer,scene:THREE.Object3D,onProgress:(completed:number,total:number)=>void=()=>{}):Promise<void>{
 const textures=new Set<THREE.Texture>(),visited=new Set<object>();
 const collect=(value:unknown)=>{
  if(!value||typeof value!=='object')return;
  if(value instanceof THREE.Texture){
   if(!value.isRenderTargetTexture&&!(value as THREE.Texture&{isDepthTexture?:boolean}).isDepthTexture)textures.add(value);
   return;
  }
  if(value instanceof THREE.Uniform){collect(value.value);return;}
  if(visited.has(value))return;visited.add(value);
  if(Array.isArray(value)){value.forEach(collect);return;}
  // Shader uniform records may hold texture arrays or nested { value } maps.
  // Do not descend into arbitrary Three objects, scene graphs, or DOM images.
  if(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)for(const child of Object.values(value))collect(child);
 };
 const material=(value:THREE.Material|THREE.Material[]|undefined)=>{
  for(const item of Array.isArray(value)?value:value?[value]:[]){
   for(const slot of Object.values(item))if(slot instanceof THREE.Texture)collect(slot);
   collect((item as THREE.ShaderMaterial).uniforms);
  }
 };
 scene.traverse(object=>{const mesh=object as THREE.Mesh;material(mesh.material);material(mesh.customDepthMaterial);material(mesh.customDistanceMaterial);});
 if(scene instanceof THREE.Scene){collect(scene.background);collect(scene.environment);material(scene.overrideMaterial??undefined);}
 const total=textures.size;let completed=0;onProgress(0,total);
 for(const texture of textures){
  renderer.initTexture(texture);completed++;onProgress(completed,total);
  if(completed%8===0)await yieldStartupFrame();
 }
 if(total>0&&completed%8!==0)await yieldStartupFrame();
}

/** Drain submitted preparation work without a main-thread gl.finish stall.
 * Fence-less drivers fall back to two yielded frame turns. */
export async function waitForGpu(renderer:THREE.WebGLRenderer):Promise<void>{
 const gl=renderer.getContext() as WebGL2RenderingContext;
 const checkContext=()=>{if(gl.isContextLost())throw new Error('WEBGL_CONTEXT_LOST');};
 checkContext();
 if(typeof gl.fenceSync!=='function'||typeof gl.clientWaitSync!=='function'){
  await yieldStartupFrame();await yieldStartupFrame();checkContext();return;
 }
 let sync:WebGLSync|null=null;
 try{sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);}catch{/* Some drivers expose, but cannot create, sync objects. */}
 if(!sync){await yieldStartupFrame();await yieldStartupFrame();checkContext();return;}
 try{
  gl.flush();const deadline=performance.now()+15000;
  while(true){
   checkContext();const status=gl.clientWaitSync(sync,0,0);
   if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return;
   if(status===gl.WAIT_FAILED){await yieldStartupFrame();await yieldStartupFrame();checkContext();return;}
   if(performance.now()>deadline)throw new Error('GPU_PREPARATION_TIMEOUT');
   await yieldStartupFrame();
  }
 }finally{gl.deleteSync(sync);}
}
