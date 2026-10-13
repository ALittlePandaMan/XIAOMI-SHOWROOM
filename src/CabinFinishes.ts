import * as THREE from 'three';
import type {InteriorId} from './config';

// The source model ships paired, UV-identical 1024² atlases. Keep both originals;
// a leather tint alone would miss the dashboard, belt, headliner and wood inserts.
const atlasIds=[5,7,9,11,13,15,17,19,21,23,25,29];
export class CabinFinishes {
 readonly sand={value:0};
 readonly black={value:0};
 private variants=new Map<number,THREE.Texture>();
 private bindings:{material:THREE.MeshStandardMaterial;mocha:THREE.Texture;sand:THREE.Texture}[]=[];
 private disposed=false;
 private solid:THREE.MeshStandardMaterial[]=[];

 async load(standardRoof=false){
  const loader=new THREE.TextureLoader();
  const atlases=atlasIds.map(id=>({id,url:`/textures/cabin/sand-${id+1}.png`}));
  if(standardRoof)atlases.push(
   {id:10012,url:'/textures/n70/cabin-13.png'},
   {id:10015,url:'/textures/n70/cabin-16.png'},
   {id:10021,url:'/textures/n70/cabin-22.png'},
   {id:10027,url:'/textures/n70/cabin-28.png'},
  );
  await Promise.all(atlases.map(async ({id,url})=>{
   const texture=await loader.loadAsync(url);
   if(this.disposed){texture.dispose();return;}
   texture.name=`@ME9x1tr5_${id+1}`;this.variants.set(id,texture);
  }));
 }
 bind(root:THREE.Object3D,renderer:THREE.WebGLRenderer){
  const seen=new Set<THREE.Material>();
  root.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   for(const material of Array.isArray(o.material)?o.material:[o.material]){
    if(material instanceof THREE.MeshStandardMaterial&&material.userData.cabinSolid&&!this.solid.includes(material))this.solid.push(material);
    if(!(material instanceof THREE.MeshStandardMaterial)||!material.name.includes('棕色内饰')||!material.map||seen.has(material))continue;
    seen.add(material);
    const mocha=material.map,id=Number(material.userData.n90Atlas??mocha.name.match(/_(\d+)$/)?.[1]),sand=this.variants.get(id);
    if(!sand)throw new Error(`Missing original sand interior atlas: ${mocha.name}`);
    sand.flipY=mocha.flipY;sand.colorSpace=mocha.colorSpace;sand.channel=mocha.channel;
    sand.wrapS=mocha.wrapS;sand.wrapT=mocha.wrapT;sand.offset.copy(mocha.offset);sand.repeat.copy(mocha.repeat);sand.center.copy(mocha.center);sand.rotation=mocha.rotation;sand.matrix.copy(mocha.matrix);
    sand.magFilter=THREE.LinearFilter;sand.minFilter=THREE.LinearMipmapLinearFilter;sand.generateMipmaps=true;
    sand.anisotropy=renderer.capabilities.getMaxAnisotropy();sand.needsUpdate=true;
    this.bindings.push({material,mocha,sand});
   }
  });
 }
 apply(id:InteriorId){
  this.sand.value=Number(id!=='mocha');this.black.value=Number(id==='black');
  for(const binding of this.bindings)binding.material.map=binding[id==='sand'?'sand':'mocha'];
  for(const material of this.solid)material.color.setRGB(...(id==='sand'?[.5,.47,.41]:id==='black'?[.070,.075,.083]:[.24,.13,.068]) as [number,number,number]);
 }
 get textures(){return new Set([...this.variants.values(),...this.bindings.map(b=>b.mocha)])}
 dispose(){this.disposed=true;for(const texture of this.textures)texture.dispose();this.variants.clear();this.bindings=[];}
}
