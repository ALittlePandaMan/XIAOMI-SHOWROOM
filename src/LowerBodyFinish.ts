import * as THREE from 'three';

/** Original black bumper/sill finish, isolated from paint, silver skid plates and cabin light. */
export function configureLowerBodyFinish(m:THREE.MeshStandardMaterial,environment:THREE.Texture){
 const source=String(m.userData.sourceMaterial??m.name);
 if(source.startsWith('电动踏板_')){
  m.roughness=Math.max(m.roughness,.72);m.envMapIntensity=.12;
  if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=0;m.ior=1.25;m.specularIntensity=.15;}
  return;
 }
 if(source!=='车身下包围_原厂亮黑')return;
 m.envMap=environment;m.envMapIntensity=3.2;m.envMapRotation.set(.66,1.61,-.52);
 m.color.setScalar(.181164244239483);m.metalness=.85;m.roughness=.46;
 m.aoMapIntensity=.95;
 if(m.aoMap){m.aoMap.colorSpace=THREE.SRGBColorSpace;m.aoMap.needsUpdate=true;}
 if(m instanceof THREE.MeshPhysicalMaterial){
  // The original coat was almost a mirror at grazing angles: the white studio
  // floor overwhelmed the black pigment on the bumper corners.
  m.clearcoat=.28;m.clearcoatRoughness=.16;m.ior=1.46;m.specularIntensity=0;
  m.specularColor.setRGB(.3049873140591091,.3094689228067428,.3139887133649649);
 }
 m.onBeforeCompile=shader=>{
  const env=THREE.ShaderChunk.envmap_physical_pars_fragment.replaceAll('envMapIntensity','envMapIntensity * 0.07818742179702069');
  shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',env);
  // Reference black pigment varies with incidence. Use the smooth mean of its microscopic flakes.
  const physical=`float lowerFacing=clamp(dot(normalize(vViewPosition),normal)*0.56,0.0,1.0);
   float lowerFacing2=lowerFacing*lowerFacing;
   diffuseColor.rgb=lowerFacing*vec3(.0544802764,.0595112382,.0630100176)*.3
    +lowerFacing2*vec3(.2917706498,.3094689228,.376262123)*1.5
    +lowerFacing2*lowerFacing2*vec3(.0307134437,.0318960331,.0423114106)*1.1;
   `+THREE.ShaderChunk.lights_physical_fragment.replace('material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );',`material.diffuseContribution=diffuseColor.rgb*(1.0-metalnessFactor);
    float lowerEdge=1.0-max(dot(normalize(vViewPosition),normal),0.0);
    material.diffuseContribution*=1.0-smoothstep(0.0,1.0,lowerEdge);
    // Keep the underside shading in world space so orbiting cannot rotate the dark hemisphere.
    vec3 lowerWorldNormal=inverseTransformDirection(normal,viewMatrix);
    material.diffuseContribution*=clamp((lowerWorldNormal.y+1.0)*.5,0.0,1.0);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',physical);
  const brdf=THREE.ShaderChunk.lights_physical_pars_fragment
   .replace(/void RE_IndirectDiffuse_Physical\([\s\S]*?(?=void RE_IndirectSpecular_Physical)/,`void RE_IndirectDiffuse_Physical(const in vec3 irradiance,const in vec3 geometryPosition,const in vec3 geometryNormal,const in vec3 geometryViewDir,const in vec3 geometryClearcoatNormal,const in PhysicalMaterial material,inout ReflectedLight reflectedLight){reflectedLight.indirectDiffuse+=irradiance*BRDF_Lambert(material.diffuseContribution);}\n`)
   .replace(/void RE_IndirectSpecular_Physical\([\s\S]*?(?=#define RE_Direct\s)/,`void RE_IndirectSpecular_Physical(const in vec3 radiance,const in vec3 irradiance,const in vec3 clearcoatRadiance,const in vec3 geometryPosition,const in vec3 geometryNormal,const in vec3 geometryViewDir,const in vec3 geometryClearcoatNormal,const in PhysicalMaterial material,inout ReflectedLight reflectedLight){
    #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect+=clearcoatRadiance*EnvironmentBRDF(geometryClearcoatNormal,geometryViewDir,material.clearcoatF0,material.clearcoatF90,material.clearcoatRoughness);
    #endif
    vec3 singleScatter=vec3(0.0),multiScatter=vec3(0.0);
    computeMultiscattering(material.dfg,material.specularColorBlended,material.specularF90,singleScatter,multiScatter);
    vec3 totalScatter=singleScatter+multiScatter;
    vec3 diffuse=material.diffuseContribution*(1.0-max(max(totalScatter.r,totalScatter.g),totalScatter.b));
    reflectedLight.indirectSpecular+=radiance*singleScatter+multiScatter*irradiance*RECIPROCAL_PI;
    reflectedLight.indirectDiffuse+=diffuse*irradiance*RECIPROCAL_PI;
   }\n`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',brdf);
  const lights=THREE.ShaderChunk.lights_fragment_begin
   .replace('getAmbientLightIrradiance( ambientLightColor )','vec3(6.8)')
   .replace('RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );','')
   .replaceAll('RE_Direct( directLight,','directLight.color=vec3(0.0); RE_Direct( directLight,');
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lights);
  // The studio HDR has a bright floor. Suppress that reflected floor only on
  // downward-facing black trim; keep the visible bumper faces glossy.
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
   float lowerFloorVisibility=mix(.015,1.0,smoothstep(-.70,.05,inverseTransformDirection(normal,viewMatrix).y));
   reflectedLight.indirectSpecular*=lowerFloorVisibility;
   #ifdef USE_CLEARCOAT
   clearcoatSpecularIndirect*=lowerFloorVisibility;
   #endif`);
 };
 m.customProgramCacheKey=()=> 'original-lower-black-v3';m.needsUpdate=true;
}
