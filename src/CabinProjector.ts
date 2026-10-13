import * as THREE from 'three';

export const projectorSources=new Set(['@ME9x1tr5_012','电动幕布_卷收幕面','电动幕布_齐平封口盖']);

/** Samples of the original Blender roller, folding supports and flush end cap. */
export class CabinProjector {
 private meshes:THREE.Mesh[]=[];
 private screens:THREE.MeshStandardMaterial[]=[];
 private playback={value:0};
 private deployed=false;
 private settledTime=0;
 constructor(readonly root:THREE.Group){
  root.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   this.meshes.push(o);o.frustumCulled=false;
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(!(m instanceof THREE.MeshStandardMaterial)||m.userData.sourceMaterial!=='电动幕布_画面随展开启用')continue;
    // Identify the display face from the fully deployed sheet, before it curls
    // into the cassette. The opposite face must stay silver during playback.
    const weights=o.morphTargetInfluences,saved=weights?.slice();
    if(weights){weights.fill(0);weights[weights.length-1]=1;}
    const faces=new Float32Array(o.geometry.attributes.position.count),point=new THREE.Vector3();
    for(let i=0;i<faces.length;i++){
     o.getVertexPosition(i,point);
     faces[i]=point.x-.01310158688*point.y-37.01013707;
    }
    if(weights&&saved)weights.splice(0,weights.length,...saved);
    o.geometry.setAttribute('projectionFace',new THREE.BufferAttribute(faces,1));
    m.emissiveMap=m.map;m.map=null;m.emissive.set(0xffffff);
    m.color.set('#b8bdc4');m.metalness=.12;m.roughness=.65;m.envMapIntensity=.55;m.toneMapped=false;
    if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=0;m.specularIntensity=0;}
    const compile=m.onBeforeCompile;
    m.onBeforeCompile=(shader,renderer)=>{
     compile.call(m,shader,renderer);
     shader.uniforms.screenPlayback=this.playback;
     shader.vertexShader='attribute float projectionFace;\nvarying float screenFace;\nvarying float screenHeight;\n'+shader.vertexShader;
     shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','screenHeight=transformed.y;screenFace=projectionFace;\n#include <project_vertex>');
     shader.fragmentShader='uniform float screenPlayback;\nvarying float screenFace;\nvarying float screenHeight;\n'+shader.fragmentShader;
     // The coiled portion is inside the cassette, above its 171.99 cm outlet.
     // Clip at that fixed local plane, which follows the roof with the assembly.
     shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(screenHeight>171.99)discard;');
     shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.008),screenPlayback*step(0.,screenFace));');
     shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>','totalEmissiveRadiance*=step(0.,screenFace);\n#include <lights_physical_fragment>');
    };
    m.customProgramCacheKey=()=> 'projector-silver-backing-v2';
    this.screens.push(m);
   }
  });
  this.update(0,false);
 }
 update(q:number,lit:boolean,dt=0,reducedMotion=false){
  for(const mesh of this.meshes){
   const weights=mesh.morphTargetInfluences;if(!weights)continue;
   weights.fill(0);const f=q*weights.length,index=Math.floor(f),t=f-index;
   if(index>0)weights[index-1]=1-t;if(index<weights.length)weights[index]=t;
  }
  const previous=this.playback.value;
  // Start timing AFTER the first fully deployed frame, never during the last
  // movement interval. Retraction or an interrupted opening cancels playback.
  if(lit&&q===1){
   if(this.deployed)this.settledTime+=Math.max(0,dt);
   this.deployed=true;
   this.playback.value=reducedMotion?Number(this.settledTime>=.12):THREE.MathUtils.smoothstep(this.settledTime,.12,.36);
  }else{
   this.deployed=false;this.settledTime=0;this.playback.value=0;
  }
  for(const m of this.screens)m.emissiveIntensity=.85*this.playback.value;
  return previous!==this.playback.value;
 }
 get playbackSettled(){return !this.deployed||this.playback.value===1}

 getFocusPoint(target=new THREE.Vector3()){
  // Original screen centre in exported model space, including the roof fixture's
  // current transform when the cabin cover has lifted.
  return this.root.localToWorld(target.set(.38,1.53,0));
 }
}
