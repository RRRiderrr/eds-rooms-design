import {describe,it,expect} from 'vitest';
import {clonePreset} from '../src/catalog/presets';
import {currentDraft} from '../src/draft';
import {SceneStore} from '../src/core/store';
import {objectRegion} from '../src/core/regions';

describe('Site update preserves custom work and refreshes built-ins',()=>{
 it('replaces an obsolete untouched built-in layout with the current TV design',()=>{
  const old=clonePreset(6);old.objects=old.objects.filter(o=>o.assetId!=='television');old.layers.ceiling=true;old.doorOpen=true;
  const fresh=currentDraft(old);expect(fresh.objects.some(o=>o.assetId==='television'&&o.variant===3)).toBe(true);expect(fresh.layers.ceiling).toBe(true);expect(fresh.doorOpen).toBe(true);
 });
 it('keeps modified drafts and saved user designs exactly as authored',()=>{
  const modified=clonePreset(6);modified.modified=true;modified.objects=[];expect(currentDraft(modified)).toBe(modified);
  const user={...clonePreset(6),presetId:'user-custom',modified:false};user.objects=[];expect(currentDraft(user)).toBe(user);
 });
 it('refreshes a selected built-in region on explicit reset, preserving the other region and allowing Undo',()=>{
  const store=new SceneStore(clonePreset(1));
  store.applyRegionPreset('hall','hall-preset-8');
  store.remove('MainSofa');
  // A draft produced by an older release can contain an older built-in hall.
  const old=structuredClone(store.state);old.objects=old.objects.filter(o=>o.id!=='hall-zoning-cabinet');
  const reloaded=new SceneStore(currentDraft(old));
  expect(reloaded.state.objects.some(o=>o.id==='hall-zoning-cabinet')).toBe(false);
  const meeting=structuredClone(reloaded.state.objects.filter(o=>objectRegion(o)==='meeting'));
  reloaded.resetRegionToPreset('hall');
  expect(reloaded.state.objects.some(o=>o.id==='hall-zoning-cabinet')).toBe(true);
  expect(reloaded.state.objects.filter(o=>objectRegion(o)==='meeting')).toEqual(meeting);
  reloaded.undo();expect(reloaded.state.objects.some(o=>o.id==='hall-zoning-cabinet')).toBe(false);
 });
});
