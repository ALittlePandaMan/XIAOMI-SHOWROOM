import * as THREE from 'three';
import finishes from './wheel-finishes.json';

type Role=keyof typeof finishes;
export type WheelEnvironments={studio:THREE.Texture;wheel:THREE.Texture;cover:THREE.Texture};

/** Original separate parts determine the finish, never a face-normal threshold. */
export function configureWheelFinish(material:THREE.MeshStandardMaterial,environments:WheelEnvironments){
 const source=String(material.userData.sourceMaterial??material.name);
 const role=(source.includes('轮胎')?'tire':source.match(/^原装轮毂_\d-(.+)$/)?.[1]) as Role|undefined;
 if(!role||!finishes[role])return false;
 const p=finishes[role];
 material.userData.wheelRole=role;
 material.color.fromArray(p.color);material.metalness=p.metalness;material.roughness=p.roughness;
 material.envMap=p.environment==='wheel'?environments.wheel:p.environment==='wheel-glass'?environments.cover:environments.studio;
 material.envMapIntensity=p.envMapIntensity;material.envMapRotation.set(...p.envMapRotation.slice(0,3) as [number,number,number]);
 material.aoMapIntensity=p.aoMapIntensity;
 // Tire AO was captured after GPU decoding (see textures/tires/source.json).
 // The original wheel atlases are still display-encoded; do not decode tire AO twice.
 if(material.aoMap){material.aoMap.colorSpace=role==='tire'?THREE.NoColorSpace:THREE.SRGBColorSpace;material.aoMap.needsUpdate=true;}
 material.transparent=p.transparent;material.opacity=p.opacity;material.depthWrite=p.depthWrite;
 if(material instanceof THREE.MeshPhysicalMaterial){
  material.clearcoat=p.clearcoat;material.clearcoatRoughness=p.clearcoatRoughness;material.ior=p.ior;
  material.specularIntensity=p.specularIntensity;material.specularColor.fromArray(p.specularColor);
 }
 material.onBeforeCompile=shader=>{
  shader.uniforms.wheelEnvTint={value:new THREE.Color(...p.envColor as [number,number,number])};
  shader.uniforms.wheelBottom={value:new THREE.Color(...p.ambientColorBot as [number,number,number])};
  shader.uniforms.wheelBottomIntensity={value:p.ambientColorBotIntensity};
  shader.uniforms.wheelDarkPower={value:p.fresnelPowerDark};
  shader.uniforms.wheelDarkColor={value:new THREE.Color(...p.fresnelColorDark as [number,number,number])};
  shader.fragmentShader='uniform vec3 wheelEnvTint,wheelBottom,wheelDarkColor;uniform float wheelBottomIntensity,wheelDarkPower;\n'+shader.fragmentShader;
  const env=THREE.ShaderChunk.envmap_physical_pars_fragment.replaceAll('envMapIntensity','envMapIntensity * wheelEnvTint');
  shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',env);
  const physical=THREE.ShaderChunk.lights_physical_fragment.replace('material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );',`material.diffuseContribution = diffuseColor.rgb * (1.0-metalnessFactor);
   float wheelEdge=1.0-max(dot(normalize(vViewPosition),normal),0.0);
   material.diffuseContribution=mix(material.diffuseContribution,wheelDarkColor,smoothstep(0.0,1.0,pow(max(wheelEdge,0.00001),wheelDarkPower)));
   material.diffuseContribution*=mix(wheelBottom,vec3(1.0),(normal.y+1.0)*0.5)*wheelBottomIntensity;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',physical);
  // Match the reference's blended metal/dielectric indirect BRDF across Three revisions.
  const brdf=THREE.ShaderChunk.lights_physical_pars_fragment.replace(/void RE_IndirectDiffuse_Physical\([\s\S]*?(?=void RE_IndirectSpecular_Physical)/,`void RE_IndirectDiffuse_Physical(const in vec3 irradiance,const in vec3 geometryPosition,const in vec3 geometryNormal,const in vec3 geometryViewDir,const in vec3 geometryClearcoatNormal,const in PhysicalMaterial material,inout ReflectedLight reflectedLight){reflectedLight.indirectDiffuse+=irradiance*BRDF_Lambert(material.diffuseContribution);}\n`)
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
  let lights=THREE.ShaderChunk.lights_fragment_begin.replace('getAmbientLightIrradiance( ambientLightColor )','vec3(6.8)');
  lights=lights.replace('RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );','');
  lights=lights.replaceAll('RE_Direct( directLight,',`directLight.color *= ${(p.receiveDirectLight?p.directLightIntensity:0).toFixed(4)}; RE_Direct( directLight,`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lights);
 };
 material.customProgramCacheKey=()=>`original-wheel-${role}-v1`;
 material.needsUpdate=true;
 return true;
}
