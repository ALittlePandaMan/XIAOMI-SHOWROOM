import * as THREE from 'three';

interface Probe {mesh:THREE.Mesh;material:THREE.MeshStandardMaterial;size:number;center:THREE.Vector3;normal:THREE.Vector3;filtered?:THREE.WebGLRenderTarget;dirty:boolean;exterior:boolean;captures:number}
/** Exact-size probes retain their images; only capture workspaces are shared. */
export class MirrorReflections {
 private probes:Probe[]=[];
 private workspaces=new Map<number,{target:THREE.WebGLCubeRenderTarget;camera:THREE.CubeCamera;filter:THREE.PMREMGenerator}>();
 private center=new THREE.Vector3();
 private normal=new THREE.Vector3();
 private normalMatrix=new THREE.Matrix3();
 private frustum=new THREE.Frustum();
 private projection=new THREE.Matrix4();
 constructor(private renderer:THREE.WebGLRenderer){}
 setup(car:THREE.Object3D){
  car.traverse(o=>{
   if(!(o instanceof THREE.Mesh)||Array.isArray(o.material)||!(o.material instanceof THREE.MeshStandardMaterial))return;
   if(!/内后视镜_清晰镜面|后视镜_镜面/.test(o.material.name)||String(o.userData.sourceObject).endsWith('@ME9x1tr5_040'))return;
   const material=o.material.clone();o.material=material;
   const exterior=!material.name.includes('内后视镜'),size=Math.min(exterior?512:2048,this.renderer.capabilities.maxCubemapSize);
   material.color.setRGB(.82,.84,.86);material.metalness=1;material.roughness=.018;material.envMapIntensity=1;material.userData.batchUnsafe=true;
   material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>','#include <lights_fragment_begin>\nreflectedLight.directSpecular=vec3(0.0);')};
   o.geometry.computeBoundingBox();
   const center=o.geometry.boundingBox!.getCenter(new THREE.Vector3()),normal=new THREE.Vector3(),sample=new THREE.Vector3(),normals=o.geometry.getAttribute('normal');
   for(let i=0;i<normals.count;i++)normal.add(sample.fromBufferAttribute(normals,i));normal.normalize();
   this.probes.push({mesh:o,material,size,center,normal,dirty:true,exterior,captures:0});
  });
 }
 invalidate(scope:'interior'|'all'='all'){for(const p of this.probes)if(scope==='all'||!p.exterior)p.dirty=true;}
 private workspace(size:number){
  let workspace=this.workspaces.get(size);
  if(!workspace){const target=new THREE.WebGLCubeRenderTarget(size,{type:THREE.HalfFloatType});workspace={target,camera:new THREE.CubeCamera(.015,150,target),filter:new THREE.PMREMGenerator(this.renderer)};this.workspaces.set(size,workspace);}
  return workspace;
 }
 async warm(scene:THREE.Scene,viewer:THREE.Camera){
  // Cube captures use linear-output shader variants. Compile them asynchronously
  // before a capture instead of linking dozens of programs in an interaction frame.
  const target=new THREE.WebGLRenderTarget(64,64,{type:THREE.HalfFloatType}),previous=this.renderer.getRenderTarget(),face=this.renderer.getActiveCubeFace(),mip=this.renderer.getActiveMipmapLevel();
  const visible=this.probes.map(p=>p.mesh.visible);
  try{
   this.probes.forEach(p=>p.mesh.visible=false);this.renderer.setRenderTarget(target);
   await this.renderer.compileAsync(scene,viewer);
   for(const size of new Set(this.probes.map(p=>p.size)))this.workspace(size).filter.compileCubemapShader();
  }finally{this.renderer.setRenderTarget(previous,face,mip);target.dispose();this.probes.forEach((p,i)=>p.mesh.visible=visible[i]);}
 }
 update(scene:THREE.Scene,background:THREE.Texture,viewer?:THREE.Camera,all=false){
  if(!this.probes.length)return 0;
  if(viewer){viewer.updateMatrixWorld();this.projection.multiplyMatrices(viewer.projectionMatrix,viewer.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projection);}
  const selected=this.probes.filter(p=>p.dirty&&(all||!viewer||this.frustum.intersectsObject(p.mesh)));
  if(!selected.length)return 0;
  const oldBackground=scene.background,oldTarget=this.renderer.getRenderTarget(),face=this.renderer.getActiveCubeFace(),mip=this.renderer.getActiveMipmapLevel();
  const visible=this.probes.map(p=>p.mesh.visible);
  try{
   scene.background=background;this.probes.forEach(p=>p.mesh.visible=false);
   for(const p of selected){
    const {target,camera,filter}=this.workspace(p.size);
    let vehicle:THREE.Object3D=p.mesh;while(vehicle.parent&&vehicle.parent!==scene)vehicle=vehicle.parent;
    const vehicleVisible=vehicle.visible;
    this.center.copy(p.center).applyMatrix4(p.mesh.matrixWorld);
    this.normal.copy(p.normal).applyNormalMatrix(this.normalMatrix.getNormalMatrix(p.mesh.matrixWorld));
    camera.position.copy(this.center).addScaledVector(this.normal,.06);
    try{if(p.exterior)vehicle.visible=false;camera.update(this.renderer,scene);}finally{vehicle.visible=vehicleVisible;}
    const previous=p.filtered;p.filtered=filter.fromCubemap(target.texture,previous);
    if(!previous){p.material.envMap=p.filtered.texture;p.material.needsUpdate=true;}
    p.dirty=false;p.captures++;
   }
  }finally{scene.background=oldBackground;this.renderer.setRenderTarget(oldTarget,face,mip);this.probes.forEach((p,i)=>p.mesh.visible=visible[i]);}
  return selected.length;
 }
 get count(){return this.probes.length;}
 get hasPending(){return this.probes.some(p=>p.dirty);}
 get diagnostics(){return {captures:this.probes.reduce((sum,p)=>sum+p.captures,0),pending:this.probes.filter(p=>p.dirty).length,
  probes:this.probes.map(p=>({name:p.material.name,faceSize:p.size,captures:p.captures,dirty:p.dirty})),workspaceCount:this.workspaces.size,
  estimatedImageMiB:Number((this.probes.reduce((sum,p)=>sum+(p.filtered?p.filtered.width*p.filtered.height*8:0),0)/1024**2).toFixed(2))};}
 contextRestored(){this.invalidate();}
 dispose(){for(const p of this.probes)p.filtered?.dispose();for(const w of this.workspaces.values()){w.target.dispose();w.filter.dispose();}this.workspaces.clear();this.probes=[];}
}
