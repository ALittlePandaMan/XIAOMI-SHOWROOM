import * as THREE from 'three';

/** Public showroom surface maps, restored to the local tires' original UV layout. */
export class TireFinish {
 private maps:THREE.Texture[]=[];
 private disposed=false;
 async load(anisotropy:number){
  const loader=new THREE.TextureLoader();
  const paths=['front-detail.png','rear-detail.png','rubber-occlusion.png'];
  const loaded=await Promise.allSettled(paths.map(p=>loader.loadAsync(`/textures/tires/${p}`)));
  const textures=loaded.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  const failure=loaded.find(r=>r.status==='rejected');
  if(this.disposed||failure){textures.forEach(t=>t.dispose());if(failure?.status==='rejected')throw failure.reason;return;}
  this.maps=textures;
  textures.forEach((t,i)=>{t.flipY=false;t.colorSpace=i<2?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=anisotropy;t.needsUpdate=true;});
  // Height reads unencoded values; share each decoded image with the color map.
  for(const t of textures.slice(0,2)){const height=t.clone();height.colorSpace=THREE.NoColorSpace;height.needsUpdate=true;this.maps.push(height);}
 }
 apply(material:THREE.MeshStandardMaterial,rear:boolean){
  if(this.maps.length!==5)return;
  material.map=this.maps[rear?1:0];material.aoMap=this.maps[2];material.aoMapIntensity=.85;
  // Replace the earlier generic tread with the lettering and tread relief on this atlas.
  material.normalMap=null;material.bumpMap=this.maps[rear?4:3];material.bumpScale=.0006;
  material.color.setRGB(.085,.085,.087);material.metalness=.4;material.roughness=.53;material.envMapIntensity=.8;
  material.userData.tireAxle=rear?'rear':'front';material.needsUpdate=true;
 }
 dispose(){this.disposed=true;this.maps.forEach(t=>t.dispose());this.maps=[];}
}
