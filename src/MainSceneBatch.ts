import {BatchedMesh,BufferAttribute,BufferGeometry,Matrix4,Mesh,SkinnedMesh} from 'three';
import type {Material,Object3D} from 'three';

export const SOURCE_LAYER=30;
interface Entry {source:Mesh;material:Material;index:number;instance:number;matrix:Matrix4;layers:number;visible:boolean}
interface Group {batch:BatchedMesh;entries:Entry[]}
/** Display batching is opt-in per compatible material. Picking/animation use sources. */
export class MainSceneBatch {
 private groups:Group[]=[];
 private inverse=new Matrix4();
 private local=new Matrix4();
 private enabled=false;
 private instances=0;
 prepare(roots:Object3D[],parent:Object3D,supported:boolean){
  if(!supported)return;
  const groups=new Map<string,{material:Material;meshes:Mesh[]}>(),seen=new Set<Mesh>();
  for(const root of roots)root.traverse(o=>{
   if(!(o instanceof Mesh)||seen.has(o)||o instanceof SkinnedMesh||o.morphTargetInfluences||Array.isArray(o.material))return;
   seen.add(o);const m=o.material,g=o.geometry as BufferGeometry,p=g.getAttribute('position');
   // Multi-material groups and world-position custom shaders retain their native path.
   // Matrix-texture fetches are worthwhile for small parts, but can make large
   // high-detail panels slower on a bandwidth-bound GPU. Keep those native.
   if(!p||p.count>4096||m.transparent||!m.visible||m.userData.batchUnsafe||/后视镜.*镜面|内后视镜|电动幕布|中控屏/.test(m.name)||g.morphAttributes.position?.length||o.layers.mask!==1||o.renderOrder!==0)return;
   if(g.groups.length>1||g.groups.some(group=>group.materialIndex!==0||group.start!==0||group.count!==(g.index?.count??p.count))||Object.values(g.attributes).some(a=>'isInterleavedBufferAttribute' in a)||o.matrixWorld.determinant()<=0)return;
   const attributes=Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).join('|');
   const key=`${m.uuid}:${o.castShadow}:${o.receiveShadow}:${o.frustumCulled}:${attributes}`;
   let group=groups.get(key);if(!group){group={material:m,meshes:[]};groups.set(key,group);}group.meshes.push(o);
  });
  for(const {material,meshes}of groups.values()){
   if(meshes.length<3)continue;
   const geometries=meshes.map(source=>{
    const original=source.geometry,g=new BufferGeometry();
    for(const [name,attribute]of Object.entries(original.attributes))g.setAttribute(name,attribute);
    const total=original.index?.count??original.getAttribute('position').count,start=original.drawRange.start,end=Math.min(total,start+original.drawRange.count);
    const index=new Uint32Array(end-start);for(let i=start;i<end;i++)index[i-start]=original.index?original.index.getX(i):i;
    g.setIndex(new BufferAttribute(index,1));return g;
   });
   const batch=new BatchedMesh(meshes.length,geometries.reduce((sum,g)=>sum+g.getAttribute('position').count,0),geometries.reduce((sum,g)=>sum+g.index!.count,0),material);
   batch.name=`Display batch: ${material.name}`;batch.frustumCulled=false;batch.perObjectFrustumCulled=meshes[0].frustumCulled;batch.sortObjects=false;
   batch.castShadow=meshes[0].castShadow;batch.receiveShadow=meshes[0].receiveShadow;batch.visible=false;batch.matrixAutoUpdate=false;parent.add(batch);
   const entries=meshes.map((source,i)=>{const instance=batch.addInstance(batch.addGeometry(geometries[i]));batch.setVisibleAt(instance,false);return {source,material,index:0,instance,matrix:new Matrix4(),layers:source.layers.mask,visible:false};});
   this.groups.push({batch,entries});this.instances+=entries.length;
  }
 }
 private attached(source:Object3D,vehicle:Object3D){for(let p:Object3D|null=source;p;p=p.parent){if(!p.visible)return false;if(p===vehicle)return true;}return false;}
 sync(vehicle:Object3D){
  if(!this.enabled)return;this.inverse.copy(vehicle.matrixWorld).invert();
  for(const {batch,entries}of this.groups){
   for(const entry of entries){
    const visible=this.attached(entry.source,vehicle)&&entry.source.material===entry.material&&entry.material.visible;
    if(visible!==entry.visible){batch.setVisibleAt(entry.instance,visible);entry.visible=visible;}
    // Material switches (fascia variants) immediately re-enable the native source.
    entry.source.layers.mask=visible?1<<SOURCE_LAYER:entry.layers;
    if(!visible)continue;
    this.local.multiplyMatrices(this.inverse,entry.source.matrixWorld);
    if(!entry.matrix.equals(this.local)){entry.matrix.copy(this.local);batch.setMatrixAt(entry.instance,this.local);}
   }
  }
 }
 setEnabled(enabled:boolean){if(this.enabled===enabled)return;this.enabled=enabled;for(const {batch,entries}of this.groups){batch.visible=enabled;if(!enabled)for(const entry of entries)entry.source.layers.mask=entry.layers;}}
 get diagnostics(){return {enabled:this.enabled,groups:this.groups.length,instances:this.instances,minimumSavedDrawCalls:this.enabled?this.instances-this.groups.length:0};}
 dispose(){this.setEnabled(false);for(const {batch}of this.groups){batch.removeFromParent();batch.dispose();}this.groups=[];this.instances=0;}
}
