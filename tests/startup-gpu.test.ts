import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {uploadSceneTextures,waitForGpu} from '../src/graphics/startup-gpu';

describe('Actual startup GPU preparation',()=>{
 it('uploads each loaded texture once, including uniforms and off-camera objects, without uploading render targets or depth textures',async()=>{
  const image=new THREE.Texture(),normal=new THREE.Texture(),print=new THREE.Texture(),background=new THREE.Texture(),environment=new THREE.Texture(),depth=new THREE.DepthTexture(1,1),target=new THREE.WebGLRenderTarget(1,1);
  const scene=new THREE.Scene();scene.background=background;scene.environment=environment;
  const first=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:image,normalMap:normal}));
  const uniforms:any={map:new THREE.Uniform(print),duplicates:{value:[image,print]},targets:{value:[target.texture,depth]}};uniforms.cycle={value:uniforms};
  const hidden=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.ShaderMaterial({uniforms}));hidden.visible=false;scene.add(first,hidden);
  const initTexture=vi.fn(),progress:{completed:number;total:number}[]=[];
  await uploadSceneTextures({initTexture} as unknown as THREE.WebGLRenderer,scene,(completed,total)=>progress.push({completed,total}));
  expect(new Set(initTexture.mock.calls.map(([texture])=>texture))).toEqual(new Set([image,normal,print,background,environment]));
  expect(initTexture).toHaveBeenCalledTimes(5);expect(progress[0]).toEqual({completed:0,total:5});expect(progress.at(-1)).toEqual({completed:5,total:5});
  expect(scene.children).toEqual([first,hidden]);expect(hidden.visible).toBe(false);target.dispose();
 });
 it('polls GPU completion asynchronously and always releases its fence',async()=>{
  const fence={},clientWaitSync=vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2),deleteSync=vi.fn(),flush=vi.fn();
  const gl={SYNC_GPU_COMMANDS_COMPLETE:0,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:1,WAIT_FAILED:4,isContextLost:()=>false,fenceSync:()=>fence,clientWaitSync,deleteSync,flush};
  await waitForGpu({getContext:()=>gl} as unknown as THREE.WebGLRenderer);
  expect(clientWaitSync).toHaveBeenCalledTimes(2);expect(clientWaitSync).toHaveBeenCalledWith(fence,0,0);expect(flush).toHaveBeenCalledOnce();expect(deleteSync).toHaveBeenCalledWith(fence);
 });
 it('handles sync failure without gl.finish and rejects a lost context',async()=>{
  const gl={SYNC_GPU_COMMANDS_COMPLETE:0,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,WAIT_FAILED:4,isContextLost:()=>false,fenceSync:()=>({}),clientWaitSync:()=>4,deleteSync:vi.fn(),flush:vi.fn(),finish:vi.fn()};
  await waitForGpu({getContext:()=>gl} as unknown as THREE.WebGLRenderer);expect(gl.finish).not.toHaveBeenCalled();expect(gl.deleteSync).toHaveBeenCalledOnce();
  await expect(waitForGpu({getContext:()=>({...gl,isContextLost:()=>true})} as unknown as THREE.WebGLRenderer)).rejects.toThrow('WEBGL_CONTEXT_LOST');
 });
});
