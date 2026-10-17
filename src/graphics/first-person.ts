import * as THREE from 'three';
import './first-person.css';

/** First person navigation. Furniture never participates in its collision query. */
export class FirstPersonNavigation {
 enabled=false;private keys=new Set<string>();private yaw=0;private pitch=0;
 private look?:{id:number;x:number;y:number};private stick=new THREE.Vector2();private up=0;private stickId?:number;
 private mobile:HTMLElement;private desktop:HTMLElement;private crosshair:HTMLElement;private knob:HTMLElement;
 constructor(private camera:THREE.PerspectiveCamera,private canvas:HTMLCanvasElement,private allow:(from:THREE.Vector3,to:THREE.Vector3)=>boolean){
  const parent=canvas.parentElement!.parentElement!;
  this.desktop=document.createElement('div');this.desktop.className='fps-desktop';this.desktop.innerHTML='<button type="button" data-testid="fps-look">Огляд мишею</button><span>W A S D — рух · Пробіл ↑ · Ctrl ↓ · Esc — курсор</span>';parent.append(this.desktop);
  this.desktop.querySelector('button')!.onclick=()=>{if(document.pointerLockElement===canvas)document.exitPointerLock();else void canvas.requestPointerLock?.();};
  this.mobile=document.createElement('div');this.mobile.className='fps-mobile';this.mobile.innerHTML='<div class="fps-stick" data-testid="fps-joystick" aria-label="Джойстик руху"><span></span></div><div class="fps-height"><button type="button" data-testid="fps-up" aria-label="Піднятися">↑</button><button type="button" data-testid="fps-down" aria-label="Опуститися">↓</button></div>';parent.append(this.mobile);
  this.crosshair=document.createElement('div');this.crosshair.className='fps-crosshair';this.crosshair.setAttribute('aria-hidden','true');parent.append(this.crosshair);
  const stick=this.mobile.querySelector<HTMLElement>('.fps-stick')!;this.knob=stick.querySelector<HTMLElement>('span')!;
  stick.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.stickId=e.pointerId;stick.setPointerCapture(e.pointerId);this.moveStick(e,stick);});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===this.stickId){e.preventDefault();this.moveStick(e,stick);}});
  const endStick=()=>{this.stickId=undefined;this.stick.set(0,0);this.knob.style.transform='translate(0,0)';};stick.addEventListener('pointerup',endStick);stick.addEventListener('pointercancel',endStick);
  for(const [selector,delta]of [['[data-testid=fps-up]',1],['[data-testid=fps-down]',-1]] as const){const button=this.mobile.querySelector<HTMLElement>(selector)!;button.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();button.setPointerCapture(e.pointerId);this.up=delta;});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{this.up=0;});}
  canvas.addEventListener('pointerdown',e=>{if(!this.enabled||e.button!==0&&e.button!==2||document.pointerLockElement===canvas)return;this.look={id:e.pointerId,x:e.clientX,y:e.clientY};});
  window.addEventListener('pointermove',e=>{if(!this.enabled)return;if(document.pointerLockElement===canvas){this.rotate(e.movementX,e.movementY);return;}if(this.look?.id===e.pointerId){this.rotate(e.clientX-this.look.x,e.clientY-this.look.y);this.look.x=e.clientX;this.look.y=e.clientY;}});
  const endLook=(e:PointerEvent)=>{if(e.pointerId===this.look?.id)this.look=undefined;};window.addEventListener('pointerup',endLook);window.addEventListener('pointercancel',endLook);
  window.addEventListener('keydown',e=>{if(!this.enabled||this.editing())return;const key=e.code;if(['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(key)){if(key==='Space')e.preventDefault();this.keys.add(key);}});
  window.addEventListener('keyup',e=>this.keys.delete(e.code));window.addEventListener('blur',()=>{this.keys.clear();this.stick.set(0,0);this.up=0;});
  document.addEventListener('pointerlockchange',()=>this.crosshair.classList.toggle('locked',document.pointerLockElement===canvas));
  this.syncFromCamera();this.setEnabled(false);
 }
 private editing(){return !!document.activeElement?.matches('input,select,textarea')||!!document.querySelector('dialog[open]');}
 private moveStick(e:PointerEvent,element:HTMLElement){const r=element.getBoundingClientRect();const x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;const length=Math.hypot(x,y),factor=Math.min(1,34/Math.max(length,.001));this.stick.set(x*factor/34,y*factor/34);this.knob.style.transform=`translate(${x*factor}px,${y*factor}px)`;}
 private rotate(dx:number,dy:number){this.yaw-=dx*.0025;this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.0025,-1.48,1.48);this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch,this.yaw,0,'YXZ'));}
 syncFromCamera(){const e=new THREE.Euler().setFromQuaternion(this.camera.quaternion,'YXZ');this.yaw=e.y;this.pitch=e.x;}
 setEnabled(enabled:boolean){this.enabled=enabled;this.desktop.hidden=!enabled;this.mobile.hidden=!enabled;this.crosshair.hidden=!enabled;if(!enabled){this.keys.clear();this.stick.set(0,0);this.up=0;if(document.pointerLockElement===this.canvas)document.exitPointerLock();}else this.syncFromCamera();}
 update(dt:number){if(!this.enabled||this.editing())return;const x=(this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0)+this.stick.x;const z=(this.keys.has('KeyW')?1:0)-(this.keys.has('KeyS')?1:0)-this.stick.y;const y=(this.keys.has('Space')?1:0)-(this.keys.has('ControlLeft')||this.keys.has('ControlRight')?1:0)+this.up;
  const input=new THREE.Vector2(x,z);if(input.length()>1)input.normalize();const speed=(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?4.8:2.6)*dt;
  const movement=new THREE.Vector3((input.x*Math.cos(this.yaw)-input.y*Math.sin(this.yaw))*speed,y*dt*1.7,(-input.x*Math.sin(this.yaw)-input.y*Math.cos(this.yaw))*speed);
  // Slide along walls rather than stopping all movement at a diagonal contact.
  for(const axis of ['x','z','y'] as const){if(!movement[axis])continue;const next=this.camera.position.clone();next[axis]+=movement[axis];if(this.allow(this.camera.position,next))this.camera.position.copy(next);}
 }
}
