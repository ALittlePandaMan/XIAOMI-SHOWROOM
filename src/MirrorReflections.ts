import * as THREE from 'three';

/** Local reflection probes include the cabin and body rather than only the studio sky. */
export class MirrorReflections {
 private probes:{mesh:THREE.Mesh;material:THREE.MeshStandardMaterial;camera:THREE.CubeCamera;target:THREE.WebGLCubeRenderTarget;filter:THREE.PMREMGenerator;center:THREE.Vector3;normal:THREE.Vector3;filtered?:THREE.WebGLRenderTarget}[]=[];
 private filters=new Map<number,THREE.PMREMGenerator>();
 private center=new THREE.Vector3();
 private normal=new THREE.Vector3();
 private normalMatrix=new THREE.Matrix3();
 constructor(private renderer:THREE.WebGLRenderer){}
 setup(car:THREE.Object3D){
  car.traverse(o=>{
   if(!(o instanceof THREE.Mesh)||Array.isArray(o.material)||!(o.material instanceof THREE.MeshStandardMaterial))return;
   if(!/内后视镜_清晰镜面|后视镜_镜面/.test(o.material.name))return;
   if(String(o.userData.sourceObject).endsWith('@ME9x1tr5_040'))return;
   const material=o.material.clone();o.material=material;
   const requested=material.name.includes('内后视镜')?2048:512;
   const size=Math.min(requested,this.renderer.capabilities.maxCubemapSize);
   const target=new THREE.WebGLCubeRenderTarget(size,{type:THREE.HalfFloatType});
   let filter=this.filters.get(size);
   if(!filter){filter=new THREE.PMREMGenerator(this.renderer);this.filters.set(size,filter);}
   const camera=new THREE.CubeCamera(.015,150,target);
   material.color.setRGB(.82,.84,.86);material.metalness=1;material.roughness=.018;material.envMapIntensity=1;
   material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>','#include <lights_fragment_begin>\nreflectedLight.directSpecular=vec3(0.0);')};
   o.geometry.computeBoundingBox();
   const center=o.geometry.boundingBox!.getCenter(new THREE.Vector3()),normal=new THREE.Vector3(),sample=new THREE.Vector3(),normals=o.geometry.getAttribute('normal');
   for(let i=0;i<normals.count;i++)normal.add(sample.fromBufferAttribute(normals,i));
   normal.normalize();
   this.probes.push({mesh:o,material,camera,target,filter,center,normal});
  });
 }
 update(scene:THREE.Scene,background:THREE.Texture){
  if(!this.probes.length)return;
  scene.updateMatrixWorld(true);
  const oldBackground=scene.background,oldTarget=this.renderer.getRenderTarget();
  const visible=this.probes.map(p=>p.mesh.visible);
  try{
   scene.background=background;this.probes.forEach(p=>p.mesh.visible=false);
   for(const p of this.probes){
    // Exterior probes capture the studio and ground. At the mirror's small offset,
    // including the nearby body gives severe cubemap parallax on the curved glass.
    let vehicle:THREE.Object3D=p.mesh;while(vehicle.parent&&vehicle.parent!==scene)vehicle=vehicle.parent;
    const exterior=!p.material.name.includes('内后视镜'),vehicleVisible=vehicle.visible;
    this.center.copy(p.center).applyMatrix4(p.mesh.matrixWorld);
    this.normal.copy(p.normal).applyNormalMatrix(this.normalMatrix.getNormalMatrix(p.mesh.matrixWorld));
    p.camera.position.copy(this.center).addScaledVector(this.normal,.06);
    try{if(exterior)vehicle.visible=false;p.camera.update(this.renderer,scene)}finally{vehicle.visible=vehicleVisible}
    // Retain the full-resolution output and per-size convolution workspace.
    // Reallocating these on every cabin change briefly doubled the 2048-face
    // mirror's large HDR buffers and repeatedly compiled different-size shaders.
    const previous=p.filtered;
    p.filtered=p.filter.fromCubemap(p.target.texture,previous);
    if(!previous){p.material.envMap=p.filtered.texture;p.material.needsUpdate=true;}
   }
  }finally{scene.background=oldBackground;this.renderer.setRenderTarget(oldTarget);this.probes.forEach((p,i)=>p.mesh.visible=visible[i])}
 }
 get count(){return this.probes.length}
 dispose(){for(const p of this.probes){p.filtered?.dispose();p.target.dispose()}for(const filter of this.filters.values())filter.dispose();this.filters.clear();this.probes=[];}
}
