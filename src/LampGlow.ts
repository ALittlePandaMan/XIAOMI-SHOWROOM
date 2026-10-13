import * as THREE from 'three';
import {LampMaskBatch} from './LampMaskBatch';

/** A small optical halo from the original light faces, with the car as an occluder.
 * No extra light-strip geometry: tailgate lamps retain their existing transforms. */
export class LampGlow {
 private mask=new THREE.WebGLRenderTarget(1,1,{samples:4});
 private ping=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
 private batch=new LampMaskBatch();
 private dirty=true;
 private cameraMatrix=new THREE.Matrix4();
 private projectionMatrix=new THREE.Matrix4();
 private captures=0;
 private postScene=new THREE.Scene();
 private postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 private blur=new THREE.ShaderMaterial({
  uniforms:{source:{value:this.mask.texture},step:{value:new THREE.Vector2()}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`uniform sampler2D source;uniform vec2 step;varying vec2 vUv;
   void main(){vec3 c=texture2D(source,vUv).rgb*.227027;
    c+=(texture2D(source,vUv+step*1.384615).rgb+texture2D(source,vUv-step*1.384615).rgb)*.316216;
    c+=(texture2D(source,vUv+step*3.230769).rgb+texture2D(source,vUv-step*3.230769).rgb)*.070270;
    gl_FragColor=vec4(c,1.);}`,
  depthTest:false,depthWrite:false,toneMapped:false
 });
 private composite=new THREE.ShaderMaterial({
  uniforms:{source:{value:this.mask.texture}},
  vertexShader:this.blur.vertexShader,
  fragmentShader:`uniform sampler2D source;varying vec2 vUv;
   void main(){gl_FragColor=vec4(texture2D(source,vUv).rgb,1.);
    #include <colorspace_fragment>
    gl_FragColor.rgb*=.22;}`,
  transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false
 });
 private quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.blur);
 private width=1;private height=1;
 constructor(){this.quad.frustumCulled=false;this.postScene.add(this.quad);}
 prepare(roots:THREE.Object3D[],renderer:THREE.WebGLRenderer){this.batch.prepare(roots,renderer.extensions.has('WEBGL_multi_draw'));}
 invalidate(){this.dirty=true;}
 resize(width:number,height:number){
  const scale=Math.min(.75,1200/width);this.width=Math.max(1,Math.round(width*scale));this.height=Math.max(1,Math.round(height*scale));
  this.mask.setSize(this.width,this.height);this.ping.setSize(this.width,this.height);this.invalidate();
 }
 async warm(renderer:THREE.WebGLRenderer,_scene:THREE.Scene,camera:THREE.Camera,vehicle:THREE.Object3D){
  this.batch.sync(vehicle);
  await renderer.compileAsync(this.batch.scene,camera);
  for(const material of [this.blur,this.composite]){this.quad.material=material;await renderer.compileAsync(this.postScene,this.postCamera);}
 }
 render(renderer:THREE.WebGLRenderer,_scene:THREE.Scene,camera:THREE.Camera,vehicle:THREE.Object3D){
  const target=renderer.getRenderTarget(),autoClear=renderer.autoClear,clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),shadow=renderer.shadowMap.enabled;
  try{
   renderer.autoClear=true;renderer.shadowMap.enabled=false;renderer.setClearColor(0,0);
   if(this.dirty||!this.cameraMatrix.equals(camera.matrixWorld)||!this.projectionMatrix.equals(camera.projectionMatrix)){
    this.batch.sync(vehicle);renderer.setRenderTarget(this.mask);renderer.render(this.batch.scene,camera);
    this.quad.material=this.blur;this.blur.uniforms.source.value=this.mask.texture;this.blur.uniforms.step.value.set(.75/this.width,0);
    renderer.setRenderTarget(this.ping);renderer.render(this.postScene,this.postCamera);
    this.blur.uniforms.source.value=this.ping.texture;this.blur.uniforms.step.value.set(0,.75/this.height);
    renderer.setRenderTarget(this.mask);renderer.render(this.postScene,this.postCamera);
    this.cameraMatrix.copy(camera.matrixWorld);this.projectionMatrix.copy(camera.projectionMatrix);this.dirty=false;this.captures++;
   }
   renderer.setRenderTarget(target);renderer.autoClear=false;this.quad.material=this.composite;renderer.render(this.postScene,this.postCamera);
  }finally{renderer.setRenderTarget(target);renderer.autoClear=autoClear;renderer.shadowMap.enabled=shadow;renderer.setClearColor(clear,alpha);}
 }
 getDiagnostics(){return {captures:this.captures,width:this.width,height:this.height,...this.batch.getDiagnostics()};}
 dispose(){this.mask.dispose();this.ping.dispose();this.batch.dispose();this.blur.dispose();this.composite.dispose();this.quad.geometry.dispose();}
}
