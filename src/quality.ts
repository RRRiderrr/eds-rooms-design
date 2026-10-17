export type QualityLevel = 'low' | 'medium' | 'high';
export interface QualitySettings { level:QualityLevel; scale:number; dpr:number; target:number; ao:boolean; shadows:boolean; anisotropy:number; }
export class AdaptiveQuality {
  settings:QualitySettings={level:'medium',scale:1,dpr:Math.min(devicePixelRatio,1.5),target:60,ao:false,shadows:true,anisotropy:4};
  private samples:number[]=[];private last=0;private elapsed=0;private warmup=0;private stable=0;
  fps=60; measured=false; manual:QualityLevel|'auto'='auto';
  constructor(private change:(settings:QualitySettings)=>void){}
  setManual(level:QualityLevel|'auto') {this.manual=level;if(level!=='auto')this.apply(level,1);else{this.warmup=0;this.measured=false;this.samples=[];}}
  private apply(level:QualityLevel,scale:number) {
    this.settings={level,scale,dpr:Math.min(devicePixelRatio,level==='high'?2:level==='medium'?1.5:1.1),target:level==='low'?30:60,ao:level==='high',shadows:level!=='low',anisotropy:level==='high'?16:level==='medium'?8:2};this.change({...this.settings});
  }
  tick(now:number) {
    if(document.hidden){this.last=now;return;}
    const dt=now-this.last;this.last=now;if(dt<=0||dt>180)return;
    this.samples.push(dt);if(this.samples.length>90)this.samples.shift();this.warmup+=dt;this.elapsed+=dt;
    if(this.samples.length>20)this.fps=1000/(this.samples.reduce((a,b)=>a+b,0)/this.samples.length);
    if(this.manual!=='auto'||this.elapsed<1600)return;this.elapsed=0;
    const ms=1000/this.fps;
    if(!this.measured&&this.warmup>4500){this.measured=true;this.apply(ms>29?'low':ms>20?'medium':'high',ms>38?.8:1);return;}
    if(!this.measured)return;
    const budget=1000/this.settings.target;
    if(ms>budget*1.2){this.stable=0;const scale=Math.max(.6,this.settings.scale-.1);if(scale===.6&&this.settings.level==='high')this.apply('medium',.85);else if(scale===.6&&this.settings.level==='medium')this.apply('low',.85);else this.apply(this.settings.level,scale);}
    else if(ms<budget*.86){if(++this.stable>=4&&this.settings.scale<1){this.apply(this.settings.level,Math.min(1,this.settings.scale+.05));this.stable=0;}}
    else this.stable=0;
  }
}
