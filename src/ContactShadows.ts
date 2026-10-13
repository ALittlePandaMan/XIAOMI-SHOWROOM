import * as THREE from 'three';
import {HorizontalBlurShader} from 'three/addons/shaders/HorizontalBlurShader.js';
import {VerticalBlurShader} from 'three/addons/shaders/VerticalBlurShader.js';

/** Ground contact is captured from the real vehicle, including open doors and boards. */
export class ContactShadows {
 readonly plane:THREE.Mesh;
 private target=new THREE.WebGLRenderTarget(1024,512);
 private ping=new THREE.WebGLRenderTarget(1024,512);
 private camera=new THREE.OrthographicCamera(-3.7,3.7,2.5,-2.5,.01,3.5);
 private depth=new THREE.MeshDepthMaterial({side:THREE.DoubleSide});
 private blurScene=new THREE.Scene();
 private blurCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);
 private quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));
 private horizontal=new THREE.ShaderMaterial(HorizontalBlurShader);
 private vertical=new THREE.ShaderMaterial(VerticalBlurShader);
 constructor(){
  this.camera.position.set(0,-.025,0);this.camera.up.set(0,0,1);this.camera.lookAt(0,1,0);
  // High door/body surfaces contribute less than tires and the underbody;
  // otherwise their projection becomes a nearly solid, hard-edged rectangle.
  this.depth.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );','gl_FragColor = vec4(0.0, 0.0, 0.0, min(1.0, pow(1.0 - fragCoordZ, 2.0) * 1.10));')};
  this.blurCamera.position.z=1;this.blurScene.add(this.quad);
  this.target.texture.repeat.y=-1;this.target.texture.offset.y=1;
  // This is a ground decal only 0.3 mm above the receiver. A geometric gap
  // alone loses depth precision at distant/top-down views. Bias its rasterized
  // depth while retaining depth testing, so the vehicle still occludes it.
  this.plane=new THREE.Mesh(new THREE.PlaneGeometry(7.4,5),new THREE.MeshBasicMaterial({map:this.target.texture,transparent:true,depthWrite:false,opacity:.90,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4}));
  this.plane.rotation.x=-Math.PI/2;this.plane.position.y=-.0057;this.plane.renderOrder=1;
 }
 update(renderer:THREE.WebGLRenderer,scene:THREE.Scene,vehicle:THREE.Object3D[]){
  const hidden=scene.children.filter(o=>!vehicle.includes(o)&&o.visible);hidden.forEach(o=>o.visible=false);
  const old={target:renderer.getRenderTarget(),color:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),bg:scene.background,fog:scene.fog,override:scene.overrideMaterial,shadow:renderer.shadowMap.enabled};
  try{
   scene.background=null;scene.fog=null;scene.overrideMaterial=this.depth;renderer.shadowMap.enabled=false;renderer.setClearColor(0,0);renderer.setRenderTarget(this.target);renderer.clear();renderer.render(scene,this.camera);
   for(const blur of [9.0,4.5]){
    this.quad.material=this.horizontal;this.horizontal.uniforms.tDiffuse.value=this.target.texture;this.horizontal.uniforms.h.value=blur/1024;renderer.setRenderTarget(this.ping);renderer.clear();renderer.render(this.blurScene,this.blurCamera);
    this.quad.material=this.vertical;this.vertical.uniforms.tDiffuse.value=this.ping.texture;this.vertical.uniforms.v.value=blur/512;renderer.setRenderTarget(this.target);renderer.clear();renderer.render(this.blurScene,this.blurCamera);
   }
  }finally{scene.background=old.bg;scene.fog=old.fog;scene.overrideMaterial=old.override;renderer.shadowMap.enabled=old.shadow;renderer.setRenderTarget(old.target);renderer.setClearColor(old.color,old.alpha);hidden.forEach(o=>o.visible=true)}
 }
 dispose(){this.target.dispose();this.ping.dispose();this.depth.dispose();this.horizontal.dispose();this.vertical.dispose();this.quad.geometry.dispose();this.plane.geometry.dispose();(this.plane.material as THREE.Material).dispose()}
}
