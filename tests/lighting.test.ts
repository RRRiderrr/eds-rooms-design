import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera,SpotLight} from 'three';
import type {QualitySettings} from '../src/quality';
vi.mock('../src/graphics/architecture',()=>({assetUrl:(path:string)=>path}));
import {DirectLighting} from '../src/graphics/direct-lighting';
const fixtureManifest=JSON.parse(readFileSync(new URL('../public/assets/architecture/runtime-lighting.json',import.meta.url),'utf8'));
const high:QualitySettings={level:'high',scale:1,dpr:1,target:60,ao:true,shadows:true,anisotropy:16};
const snapshot=(rig:DirectLighting)=>rig.group.children.filter((o):o is SpotLight=>o instanceof SpotLight).map(l=>({id:l.name,position:l.position.toArray(),direction:l.target.position.toArray(),intensity:l.intensity,color:l.color.toArray(),visible:l.visible,shadow:l.castShadow}));
afterEach(()=>vi.unstubAllGlobals());
describe('Permanent fixture lighting',()=>{
 it('invalidates cached shadows when fixture loading finishes after early render frames',async()=>{vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>fixtureManifest}));const rig=new DirectLighting(),camera=new PerspectiveCamera();rig.update(camera,high);await rig.load();expect(rig.update(camera,high)).toBe(true);expect(rig.needsShadowRender).toBe(true);rig.dispose();});
 it('keeps all source fixtures and shadows unchanged while walking between lamps',async()=>{
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>fixtureManifest}));const rig=new DirectLighting(),camera=new PerspectiveCamera();await rig.load();rig.update(camera,high);const original=snapshot(rig);
  expect(original).toHaveLength(fixtureManifest.lights.length);expect(original.filter(l=>l.shadow)).toHaveLength(6);
  for(const position of [[-21,1.65,0],[0,1.65,0],[22,2,-4],[1,1.65,2]]){camera.position.set(position[0],position[1],position[2]);rig.update(camera,high);expect(snapshot(rig)).toEqual(original);}rig.dispose();
 });
 it('does not alter the base light field between quality tiers',async()=>{
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>fixtureManifest}));const rig=new DirectLighting(),camera=new PerspectiveCamera();await rig.load();rig.update(camera,high);const withoutShadows=()=>snapshot(rig).map(({shadow,...light})=>light);const original=withoutShadows();
  rig.update(camera,{...high,level:'low',shadows:false});expect(withoutShadows()).toEqual(original);expect(snapshot(rig).some(l=>l.shadow)).toBe(false);rig.dispose();
 });
});
