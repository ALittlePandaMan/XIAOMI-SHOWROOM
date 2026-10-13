import * as THREE from 'three';
import type {InteriorId} from './config';

/** Three original N70 atlas sets, all loaded at their supplied resolution. */
export class N70CabinFinishes {
 private maps=new Map<number,THREE.Texture>();
 private bindings:{material:THREE.MeshStandardMaterial;atlas:number;mocha:THREE.Texture}[]=[];
 private disposed=false;
 readonly sand={value:0};
 // Select the supplied black atlas, then apply its independent tone calibration.
 readonly black={value:0};
 async load(){
  const loader=new THREE.TextureLoader();
  const ids=Array.from({length:11},(_,i)=>5+i*3).flatMap(i=>[i,i+2]);
  const results=await Promise.allSettled(ids.map(async id=>{
   const t=await loader.loadAsync(`/textures/n70/cabin-${id}.png`);
   if(this.disposed)t.dispose();else this.maps.set(id,t);
  }));
  const error=results.find(r=>r.status==='rejected');if(error?.status==='rejected')throw error.reason;
 }
 bind(root:THREE.Object3D,renderer:THREE.WebGLRenderer){
  const seen=new Set<THREE.Material>();
  root.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(!(m instanceof THREE.MeshStandardMaterial)||!m.userData.cabinAtlas||!m.map||seen.has(m))continue;
    seen.add(m);const atlas=Number(m.userData.cabinAtlas),mocha=m.map;
    for(const id of [atlas-1,atlas+1]){
     const t=this.maps.get(id);if(!t)throw new Error(`Missing N70 interior texture ${id}`);
     t.flipY=mocha.flipY;t.colorSpace=mocha.colorSpace;t.channel=mocha.channel;t.wrapS=mocha.wrapS;t.wrapT=mocha.wrapT;
     t.offset.copy(mocha.offset);t.repeat.copy(mocha.repeat);t.center.copy(mocha.center);t.rotation=mocha.rotation;
     t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.needsUpdate=true;
    }
    this.bindings.push({material:m,atlas,mocha});
   }
  });
 }
 apply(id:InteriorId){
  this.sand.value=Number(id!=='mocha');
  this.black.value=Number(id==='black');
  for(const b of this.bindings)b.material.map=id==='mocha'?b.mocha:this.maps.get(b.atlas+(id==='sand'?1:-1))!;
 }
 get textures(){return new Set([...this.maps.values(),...this.bindings.map(b=>b.mocha)])}
 dispose(){this.disposed=true;for(const t of this.textures)t.dispose();this.maps.clear();this.bindings=[];}
}
