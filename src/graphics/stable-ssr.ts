import * as THREE from 'three';
import {SSRPass} from 'three/addons/postprocessing/SSRPass.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

/** SSR contributes reflections; it never replaces the multisampled opaque image.
 * A single-sample depth target also avoids driver-dependent MSAA/transmission
 * depth resolves when a panorama is visible through the glass. */
export class StableSSRPass extends SSRPass {
 private layer?:THREE.WebGLRenderTarget;
 private blend:THREE.ShaderMaterial;
 private quad:FullScreenQuad;
 constructor(options:ConstructorParameters<typeof SSRPass>[0]){
  super(options);this.output=SSRPass.OUTPUT.SSR;
  this.layer=new THREE.WebGLRenderTarget(1,1,{type:options.renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,depthBuffer:false});
  this.blend=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{base:{value:null},reflection:{value:null},texel:{value:new THREE.Vector2(1/640,1/480)}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D base;uniform sampler2D reflection;uniform vec2 texel;varying vec2 vUv;
   void main(){vec4 b=texture2D(base,vUv);vec2 s=texel*12.;
    vec4 r=texture2D(reflection,vUv)*.25;
    r+=(texture2D(reflection,vUv+vec2(s.x,0.))+texture2D(reflection,vUv-vec2(s.x,0.))+texture2D(reflection,vUv+vec2(0.,s.y))+texture2D(reflection,vUv-vec2(0.,s.y)))*.125;
    r+=(texture2D(reflection,vUv+s)+texture2D(reflection,vUv-s)+texture2D(reflection,vUv+vec2(s.x,-s.y))+texture2D(reflection,vUv+vec2(-s.x,s.y)))*.0625;
    gl_FragColor=vec4(mix(b.rgb,r.rgb,clamp(r.a,0.,.04)),b.a);
   }`});
  this.quad=new FullScreenQuad(this.blend);
 }
 override setSize(width:number,height:number){super.setSize(width,height);this.layer?.setSize(width,height);this.blend?.uniforms.texel.value.set(1/width,1/height);}
 override render(renderer:THREE.WebGLRenderer,writeBuffer:THREE.WebGLRenderTarget,readBuffer?:THREE.WebGLRenderTarget){
  if(!readBuffer||!this.layer)return;
  const screen=this.renderToScreen;this.renderToScreen=false;
  try{super.render(renderer,this.layer,readBuffer,0,false);}finally{this.renderToScreen=screen;}
  this.blend.uniforms.base.value=readBuffer.texture;this.blend.uniforms.reflection.value=this.layer.texture;
  renderer.setRenderTarget(screen?null:writeBuffer);this.quad.render(renderer);
 }
 override dispose(){super.dispose();this.layer?.dispose();this.blend.dispose();this.quad.dispose();}
}
