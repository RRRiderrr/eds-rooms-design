import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {normalizePlaqueLabel,MAX_PLAQUE_LABEL_LENGTH} from '../src/core/plaque-text';
import {layoutPlaqueText} from '../src/graphics/plaque-text-layout';
import {applyPlaqueLabel} from '../src/graphics/plaque-labels';
import {clonePreset} from '../src/catalog/presets';
import {parsePreset} from '../src/core/schema';
import {SceneStore} from '../src/core/store';
import type {SceneObject} from '../src/core/types';

const measure=(text:string,size:number)=>[...text].length*size*.6;
afterEach(()=>vi.unstubAllGlobals());

describe('Plain numeric and multiline door plaques',()=>{
 it('preserves explicit paragraphs, blank lines and user text through schema and Undo/Redo',()=>{
  const source=clonePreset(1),plaque=source.objects.find(o=>o.assetId==='doorPlaque')!;
  const label='15\nВхід\n\nПрийом відвідувачів\nПн–Пт: 09:00–18:00\n<Текст & символи> '+ 'Довгий опис '.repeat(20);
  const store=new SceneStore(source),oldLabel=plaque.label;
  store.updateObject(plaque.id,{label});
  const exported=JSON.stringify(store.state),imported=parsePreset(exported,{preserveIdentity:true}).config;
  expect(imported.objects.find(o=>o.id===plaque.id)?.label).toBe(label);
  expect(label.length).toBeGreaterThan(120);
  store.undo();expect(store.state.objects.find(o=>o.id===plaque.id)?.label).toBe(oldLabel);
  store.redo();expect(store.state.objects.find(o=>o.id===plaque.id)?.label).toBe(label);
  expect(normalizePlaqueLabel('01\r\nКімната\rПодробиці')).toBe('01\nКімната\nПодробиці');
  expect(normalizePlaqueLabel('x'.repeat(600))).toHaveLength(MAX_PLAQUE_LABEL_LENGTH);
 });
 it('lays out every explicit line and wraps long words within the physical print rectangle',()=>{
  const text='Перший рядок\n\nДругий рядок\nТретій\nЧетвертий\nП’ятий\nШостий\nСьомий';
  const layout=layoutPlaqueText(text,944,332,measure);
  expect(layout.lines).toEqual(text.split('\n'));expect(layout.lines.length).toBe(8);
  expect(layout.lines.length*layout.lineHeight).toBeLessThanOrEqual(332);
  const long='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(12),wrapped=layoutPlaqueText(long,944,332,measure);
  expect(wrapped.lines.join('')).toBe(long);
  expect(wrapped.lines.every(line=>measure(line,wrapped.fontSize)<=944)).toBe(true);
  expect(wrapped.lines.length*wrapped.lineHeight).toBeLessThanOrEqual(332);
 });
 it('prints only the supplied number or custom lines, without a forced EDS header or decorative footer',()=>{
  const calls:{text:string;x:number;y:number}[]=[],context={font:'',fillStyle:'',textAlign:'',textBaseline:'',clearRect:vi.fn(),measureText:(text:string)=>({width:measure(text,Number.parseFloat(context.font.split(' ')[1]))}),fillText:(text:string,x:number,y:number)=>calls.push({text,x,y})};
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
  const object:SceneObject={id:'plaque',assetId:'doorPlaque',variant:1,material:'eds-white',wallId:'east',position:[0,1.55,0],rotation:0,label:'15'};
  const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.PlaneGeometry(.158,.065),new THREE.MeshBasicMaterial());mesh.name='DoorPlaque_Label';root.add(mesh);
  applyPlaqueLabel(root,object,'#0b30c1');expect(calls.map(c=>c.text)).toEqual(['15']);
  expect((mesh.material as THREE.Material).userData).toMatchObject({printedText:'15',printedLines:['15'],inkColor:'#ffffff'});
  expect(calls[0].y).toBe(192);
  calls.length=0;object.label='15\nВхід\n\nТретій\nЧетвертий';applyPlaqueLabel(root,object,'#f0f0f0');
  expect(calls.map(c=>c.text)).toEqual(object.label.split('\n'));
  expect(calls.every(c=>c.y>=26&&c.y<=358)).toBe(true);
  calls.length=0;object.label='';applyPlaqueLabel(root,object);expect(calls.map(c=>c.text)).toEqual(['']);
  expect((mesh.material as THREE.MeshBasicMaterial).side).toBe(THREE.FrontSide);
 });
});
