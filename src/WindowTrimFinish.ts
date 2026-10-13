import * as THREE from 'three';

/** The reference surround has a broad silver reflection, independent of the paint and badges. */
export function configureWindowTrim(m:THREE.MeshStandardMaterial,environment:THREE.Texture){
 // The standard N90 originally shared a black-plastic atlas here. Exporting
 // that colour image as AO darkened this otherwise shared silver finish.
 m.map=null;m.aoMap=null;m.metalnessMap=null;m.roughnessMap=null;
 m.color.setRGB(.3231432091,.3324515363,.3613067798);
 m.metalness=.7;m.roughness=.21;m.envMap=environment;m.envMapIntensity=3;
 m.envMapRotation.set(.52199627845,-.48608819366,-1.45695538128);
 if(m instanceof THREE.MeshPhysicalMaterial){
  m.clearcoat=1;m.clearcoatRoughness=.03;m.ior=1;m.specularIntensity=.3;
  m.specularColor.setRGB(.6514056374,.6653872983,.6938717613);
 }
 const previous=m.onBeforeCompile;
 m.onBeforeCompile=(shader,renderer)=>{
  previous.call(m,shader,renderer);
  // Official envMapBlur=1: blur the reflected environment without making the metal surface matte.
  const environmentChunk=THREE.ShaderChunk.envmap_physical_pars_fragment
   .replace('envMapRotation * reflectVec, roughness','envMapRotation * reflectVec, 1.0')
   .replaceAll('envMapColor.rgb * envMapIntensity','envMapColor.rgb * envMapIntensity * vec3(0.8227857544,0.8227857544,0.8796223969)');
  shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',environmentChunk);
 };
 m.customProgramCacheKey=()=> 'silver-window-surround-v1';m.needsUpdate=true;
}
