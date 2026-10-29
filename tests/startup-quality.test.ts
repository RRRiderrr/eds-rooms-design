import {afterEach,describe,it,expect,vi} from 'vitest';
import {AdaptiveQuality} from '../src/quality';

afterEach(()=>vi.unstubAllGlobals());
describe('Quality selection before initial interaction',()=>{
 it('settles automatic quality before ready without a delayed first tier change',()=>{
  vi.stubGlobal('devicePixelRatio',1);vi.stubGlobal('document',{hidden:false});
  const change=vi.fn(),quality=new AdaptiveQuality(change);quality.settleStartup('high',1000/60);const start=performance.now();
  for(let i=1;i<=420;i++)quality.tick(start+i*1000/60);
  expect(quality.manual).toBe('auto');expect(quality.measured).toBe(true);expect(quality.settings.level).toBe('high');expect(change).toHaveBeenCalledTimes(1);
 });
 it('retains an explicitly selected tier during startup calibration',()=>{
  vi.stubGlobal('devicePixelRatio',1);
  const quality=new AdaptiveQuality(()=>{});quality.setManual('high');quality.settleStartup('low',50);
  expect(quality.manual).toBe('high');expect(quality.settings.level).toBe('high');expect(quality.measured).toBe(true);
 });
});
