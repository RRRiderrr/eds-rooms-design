import {describe,it,expect} from 'vitest';
import {clonePreset} from '../src/catalog/presets';
import {currentDraft} from '../src/draft';

describe('Site update preserves custom work and refreshes built-ins',()=>{
 it('replaces an obsolete untouched built-in layout with the current TV design',()=>{
  const old=clonePreset(6);old.objects=old.objects.filter(o=>o.assetId!=='television');old.layers.ceiling=true;old.doorOpen=true;
  const fresh=currentDraft(old);expect(fresh.objects.some(o=>o.assetId==='television'&&o.variant===3)).toBe(true);expect(fresh.layers.ceiling).toBe(true);expect(fresh.doorOpen).toBe(true);
 });
 it('keeps modified drafts and saved user designs exactly as authored',()=>{
  const modified=clonePreset(6);modified.modified=true;modified.objects=[];expect(currentDraft(modified)).toBe(modified);
  const user={...clonePreset(6),presetId:'user-custom',modified:false};user.objects=[];expect(currentDraft(user)).toBe(user);
 });
});
