import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

/** A faint, rough reflection of the actual vehicle, including animated parts. */
export class GroundReflection {
 readonly mesh:Reflector;
 private dirty=true;
 private cameraMatrix=new THREE.Matrix4();
 private projectionMatrix=new THREE.Matrix4();
 private captures=0;
 private ping=new THREE.WebGLRenderTarget(512,512,{type:THREE.HalfFloatType,depthBuffer:false});
 private filtered=new THREE.WebGLRenderTarget(512,512,{type:THREE.HalfFloatType,depthBuffer:false});
 private blurScene=new THREE.Scene();
 private blurCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 private blur=new THREE.ShaderMaterial({
  uniforms:{source:{value:null},step:{value:new THREE.Vector2()},premultiply:{value:true}},
  vertexShader:`varying vec2 sampleUv;
   void main(){sampleUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
  fragmentShader:`uniform sampler2D source;uniform vec2 step;uniform bool premultiply;varying vec2 sampleUv;
   void main(){
    vec4 sum=vec4(0.0);float weight=0.0;
    for(int i=-12;i<=12;i++){
     float w=exp(-float(i*i)/24.5);
     vec4 sampleColor=texture2D(source,sampleUv+float(i)*step);
     if(premultiply)sampleColor.rgb*=sampleColor.a;
     sum+=sampleColor*w;weight+=w;
    }
    gl_FragColor=sum/weight;
   }`,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false
 });
 private quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.blur);
 constructor(vehicle:THREE.Object3D,mainCamera:THREE.Camera){
  this.quad.frustumCulled=false;this.blurScene.add(this.quad);
  const shader={
   name:'Rough showroom floor',
   uniforms:{tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},color:{value:new THREE.Color(1,1,1)}},
   vertexShader:`uniform mat4 textureMatrix; varying vec4 reflectionUv;
    void main(){reflectionUv=textureMatrix*vec4(position,1.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
   fragmentShader:`uniform sampler2D tDiffuse;varying vec4 reflectionUv;
    void main(){
     vec2 uv=reflectionUv.xy/reflectionUv.w;
     vec4 reflection=texture2D(tDiffuse,uv);
     gl_FragColor=vec4(reflection.rgb/max(reflection.a,0.0001),reflection.a*0.14);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  };
  this.mesh=new Reflector(new THREE.PlaneGeometry(200,200),{textureWidth:512,textureHeight:512,multisample:4,clipBias:.001,shader});
  this.mesh.name='Soft vehicle floor reflection';this.mesh.rotation.x=-Math.PI/2;this.mesh.position.y=-.0059;
  const material=this.mesh.material as THREE.ShaderMaterial;material.transparent=true;material.depthWrite=false;
  // The reflection is another ground decal, just 0.1 mm above the floor.
  // Keep depth testing against the car, with enough bias to clear the receiver.
  material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-2;
  this.mesh.renderOrder=0; // Contact shadow (order 1) composites above the reflection.
  const capture=this.mesh.onBeforeRender;
  this.mesh.onBeforeRender=(renderer,scene,camera,geometry,material,group)=>{
   if(camera!==mainCamera)return;
   if(!this.dirty&&this.cameraMatrix.equals(camera.matrixWorld)&&this.projectionMatrix.equals(camera.projectionMatrix))return;
   const hidden=scene.children.filter(o=>o!==vehicle&&o!==this.mesh&&!(o instanceof THREE.Light)&&o.visible);
   const background=scene.background,alpha=renderer.getClearAlpha();
   try{
    hidden.forEach(o=>o.visible=false);scene.background=null;renderer.setClearAlpha(0);
    capture.call(this.mesh,renderer,scene,camera,geometry,material,group);
    this.filter(renderer);
    this.cameraMatrix.copy(camera.matrixWorld);this.projectionMatrix.copy(camera.projectionMatrix);this.dirty=false;this.captures++;
   }finally{hidden.forEach(o=>o.visible=true);scene.background=background;renderer.setClearAlpha(alpha);}
  };
 }
 invalidate(){this.dirty=true;}
 // Run before the main GPU timer. onBeforeRender reuses this exact capture.
 prepare(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera){
  if(this.mesh.visible)this.mesh.onBeforeRender(renderer,scene,camera,this.mesh.geometry,this.mesh.material as THREE.Material,null as never);
 }
 get captureCount(){return this.captures;}
 private filter(renderer:THREE.WebGLRenderer){
  const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),xr=renderer.xr.enabled,autoClear=renderer.autoClear;
  try{
   renderer.xr.enabled=false;renderer.autoClear=false;
   // Blur adjacent texels before projecting the reflection. Sparse screen-space taps
   // repeated bright wheel spokes as a moving grid; premultiplied alpha avoids halos.
   this.blur.uniforms.source.value=this.mesh.getRenderTarget().texture;
   this.blur.uniforms.step.value.set(1/512,0);this.blur.uniforms.premultiply.value=true;
   renderer.setRenderTarget(this.ping);renderer.render(this.blurScene,this.blurCamera);
   this.blur.uniforms.source.value=this.ping.texture;
   this.blur.uniforms.step.value.set(0,1/512);this.blur.uniforms.premultiply.value=false;
   renderer.setRenderTarget(this.filtered);renderer.render(this.blurScene,this.blurCamera);
   (this.mesh.material as THREE.ShaderMaterial).uniforms.tDiffuse.value=this.filtered.texture;
  }finally{renderer.setRenderTarget(target,face,mip);renderer.xr.enabled=xr;renderer.autoClear=autoClear;}
 }
 dispose(){this.mesh.dispose();this.mesh.geometry.dispose();this.ping.dispose();this.filtered.dispose();this.blur.dispose();this.quad.geometry.dispose();}
}
