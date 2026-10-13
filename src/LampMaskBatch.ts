import * as THREE from 'three';

interface Entry {source:THREE.Mesh;materialIndex:number;instance:number;matrix:THREE.Matrix4;color:THREE.Color;visible:boolean}
interface DeformedEntry {source:THREE.Mesh;copy:THREE.Mesh}

/** Only the unlit lamp/occlusion pass is batched. Original model buffers,
 * material shaders and picking objects remain the displayed vehicle. */
export class LampMaskBatch {
 readonly scene=new THREE.Scene();
 private batch?:THREE.BatchedMesh;
 private entries:Entry[]=[];
 private deformed:DeformedEntry[]=[];
 private white=new THREE.MeshBasicMaterial({color:'#e3f1ff',side:THREE.DoubleSide,toneMapped:false});
 private red=new THREE.MeshBasicMaterial({color:'#ef001b',side:THREE.DoubleSide,toneMapped:false});
 private black=new THREE.MeshBasicMaterial({color:0,side:THREE.DoubleSide,toneMapped:false});
 private hidden=new THREE.MeshBasicMaterial({visible:false});
 private color=new THREE.Color();
 prepare(roots:THREE.Object3D[],useMultiDraw=true){
  const meshes=new Set<THREE.Mesh>();
  for(const root of roots)root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.add(o);});
  const parts:{mesh:THREE.Mesh;materialIndex:number;geometry:THREE.BufferGeometry}[]=[];
  for(const mesh of meshes){
   // Preserve the actual morph/skinning shader for deforming roof and screen parts.
   if(!useMultiDraw||mesh.morphTargetInfluences||mesh instanceof THREE.SkinnedMesh){
    const copy=mesh.clone(false);copy.matrixAutoUpdate=false;copy.frustumCulled=mesh.frustumCulled;
    this.scene.add(copy);this.deformed.push({source:mesh,copy});continue;
   }
   const source=mesh.geometry,position=source.getAttribute('position');if(!position)continue;
   const total=source.index?.count??position.count;
   const groups=Array.isArray(mesh.material)?source.groups:[{start:0,count:total,materialIndex:0}];
   for(const group of groups){
    const start=Math.max(group.start,source.drawRange.start),end=Math.min(group.start+group.count,source.drawRange.start+source.drawRange.count,total);
    if(end<=start)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',position);
    // Copy the original indices verbatim. There is no welding, decimation,
    // quantization or coordinate baking, including at animated door pivots.
    const indices=new Uint32Array(end-start);
    for(let i=start;i<end;i++)indices[i-start]=source.index?source.index.getX(i):i;
    geometry.setIndex(new THREE.BufferAttribute(indices,1));
    parts.push({mesh,materialIndex:group.materialIndex??0,geometry});
   }
  }
  if(!parts.length)return;
  this.batch=new THREE.BatchedMesh(parts.length,parts.reduce((n,p)=>n+p.geometry.getAttribute('position').count,0),parts.reduce((n,p)=>n+p.geometry.index!.count,0),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false}));
  this.batch.name='Full-detail lamp occlusion batch';this.batch.frustumCulled=false;this.batch.sortObjects=false;
  this.scene.add(this.batch);
  for(const {mesh,materialIndex,geometry}of parts){
   const id=this.batch.addInstance(this.batch.addGeometry(geometry));
   this.entries.push({source:mesh,materialIndex,instance:id,matrix:new THREE.Matrix4().set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0),color:new THREE.Color(-1,-1,-1),visible:false});
   this.batch.setVisibleAt(id,false);
   // Temporary geometry only shares the source attribute; do not dispose it.
  }
 }
 private visible(mesh:THREE.Object3D,vehicle:THREE.Object3D){
  for(let p:THREE.Object3D|null=mesh;p;p=p.parent){if(!p.visible)return false;if(p===vehicle)return true;}
  return false; // A preloaded wheel variant is currently detached from the vehicle.
 }
 private replacement(material:THREE.Material){
  if(material.transparent)return this.hidden;
  const m=material as THREE.MeshStandardMaterial;
  if(m.emissiveIntensity>0&&m.userData.onIntensity)return m.userData.sourceMaterial==='尾灯_细红灯带'?this.red:this.white;
  return this.black;
 }
 sync(vehicle:THREE.Object3D){
  for(const entry of this.entries){
   const materials=entry.source.material,material=Array.isArray(materials)?materials[entry.materialIndex]:materials;
   const replacement=this.replacement(material),visible=this.visible(entry.source,vehicle)&&replacement!==this.hidden;
   if(visible!==entry.visible){this.batch!.setVisibleAt(entry.instance,visible);entry.visible=visible;}
   if(!visible)continue;
   if(!entry.matrix.equals(entry.source.matrixWorld)){entry.matrix.copy(entry.source.matrixWorld);this.batch!.setMatrixAt(entry.instance,entry.matrix);}
   this.color.copy(replacement.color);
   if(!entry.color.equals(this.color)){entry.color.copy(this.color);this.batch!.setColorAt(entry.instance,entry.color);}
  }
  for(const {source,copy}of this.deformed){
   copy.visible=this.visible(source,vehicle);copy.matrix.copy(source.matrixWorld);copy.matrixWorldNeedsUpdate=true;
   if(copy.morphTargetInfluences&&source.morphTargetInfluences)copy.morphTargetInfluences.splice(0,copy.morphTargetInfluences.length,...source.morphTargetInfluences);
   copy.material=Array.isArray(source.material)?source.material.map(m=>this.replacement(m)):this.replacement(source.material);
  }
 }
 getDiagnostics(){return {instances:this.entries.length,separateMeshes:this.deformed.length};}
 dispose(){this.batch?.dispose();if(this.batch)(this.batch.material as THREE.Material).dispose();this.white.dispose();this.red.dispose();this.black.dispose();this.hidden.dispose();this.scene.clear();this.entries=[];this.deformed=[];}
}
