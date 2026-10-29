import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {Architecture} from '../src/graphics/architecture';
import {solidWallCutawayVisible} from '../src/graphics/solid-wall-visibility';
import {DEFAULT_LAYERS} from '../src/core/types';

describe('Whole thick wall editor cutaway',()=>{
 it('hides the complete near assembly at every outside orbit angle, with the opposite side intact',()=>{
  const arch=new Architecture(),parent=new THREE.Group();arch.editor.add(parent);arch.root.add(arch.editor,arch.production);
  const groups=['west','east'].map(side=>{const group=new THREE.Group();group.name=`Meeting_Solid_${side}`;group.userData.solidWallAssembly=true;parent.add(group);
   for(const name of ['inside','outside','endcap','top','upper-band','outline']){const part=new THREE.Object3D();part.name=name;part.userData.solidAssemblyPart=true;part.userData.solidWallOutline=name==='outline';group.add(part);(arch as any).categories.set(part,{name,category:'walls',wallId:side==='west'?'wall-17':'wall-26'});}return group;});
  const visible=(node:THREE.Object3D)=>{for(let p:THREE.Object3D|null=node;p;p=p.parent)if(!p.visible)return false;return true;};
  const camera=new THREE.PerspectiveCamera(),layers={...DEFAULT_LAYERS,autoWalls:true};arch.setMode('editor');
  for(let step=0;step<16;step++){
   camera.position.set(Math.cos(step*Math.PI/8)*9,9,Math.sin(step*Math.PI/8)*9);arch.setLayers(layers,camera);
   for(const group of groups){const expected=solidWallCutawayVisible(group,camera.position);expect(group.visible).toBe(expected);expect(group.children.every(part=>visible(part)===expected)).toBe(true);}
  }
  layers.autoWalls=false;arch.setLayers(layers,camera);expect(groups.every(g=>g.children.every(visible))).toBe(true);
  layers.walls=false;arch.setLayers(layers,camera);expect(groups.every(g=>g.children.every(p=>!visible(p)))).toBe(true);
  arch.setMode('archviz');arch.setLayers(layers,camera);expect(arch.editor.visible).toBe(false);
 });
});
