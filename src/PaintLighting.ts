import * as THREE from 'three';
import settings from './paint-lighting.json';
import calibration from './paint-calibration.json';
import {paintEnvironmentChunk,paintSideEnvironmentGLSL} from './PaintSideEnvironment';
import type {PaintId} from './config';

export function configurePaintLight(material:THREE.MeshPhysicalMaterial,id:PaintId){
 const p=settings[id],fit=calibration[id];
 material.color.fromArray(p.color);material.metalness=p.metalness;material.roughness=p.roughness;
 material.clearcoat=p.clearcoat;material.clearcoatRoughness=Math.max(p.clearcoatRoughness,.055);
 // Observed source values stay in paint-lighting.json. Renderer/PMREM calibration
 // is separate so it cannot be mistaken for the original showroom's settings.
 material.envMapIntensity=p.envMapIntensity*fit.environment;
 material.envMapRotation.set(p.rotation[0]+fit.rotation[0],p.rotation[1]+fit.rotation[1],p.rotation[2]+fit.rotation[2]);material.ior=p.ior;
 material.specularColor.fromArray(p.specularColor);material.specularIntensity=p.specularIntensity;
 const names=['envColor','fresnelColorDark','fresnelColorLight','ambientColorBot','paintColorBase','paintColorMid','paintColorSpecular'] as const;
 const scalarNames=['fresnelPowerDark','fresnelPowerLight','fresnelFalloff','ambientColorBotIntensity','paintColorBaseWeight','paintColorMidWeight','paintColorSpecularWeight','normalPerturbation','microflakePerturbationA'] as const;
 if(!material.userData.paintLighting){
  const uniforms:Record<string,{value:THREE.Color|number}>={};
  for(const n of names)uniforms[n]={value:new THREE.Color()};
  for(const n of scalarNames)uniforms[n]={value:1};
  uniforms.paintAngleBlend={value:1};
  uniforms.paintChroma={value:1};
  uniforms.showroomAmbient={value:1};
  uniforms.showroomSideFill={value:0};
  material.userData.paintLighting=uniforms;
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,uniforms);
   shader.fragmentShader=`uniform vec3 envColor,fresnelColorDark,fresnelColorLight,ambientColorBot,paintColorBase,paintColorMid,paintColorSpecular;
    uniform float fresnelPowerDark,fresnelPowerLight,fresnelFalloff,ambientColorBotIntensity,showroomAmbient;
    uniform float paintChroma,paintAngleBlend,paintColorBaseWeight,paintColorMidWeight,paintColorSpecularWeight,normalPerturbation,microflakePerturbationA;\n`+paintSideEnvironmentGLSL+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',paintEnvironmentChunk());
   // Average the microscopic flake normals; preserve its three angle-dependent
   // pigment layers without adding subpixel sparkles during mouse orbit.
   const physical=`if(paintAngleBlend>0.5){
    float facing=clamp(dot(normalize(vViewPosition),normal)*(normalPerturbation+microflakePerturbationA),0.0,1.0);
    float facing2=facing*facing;
    diffuseColor.rgb=facing*paintColorBase*paintColorBaseWeight+facing2*paintColorMid*paintColorMidWeight+facing2*facing2*paintColorSpecular*paintColorSpecularWeight;
   }\n`+THREE.ShaderChunk.lights_physical_fragment.replace('material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );',`material.diffuseContribution = diffuseColor.rgb * (1.0-metalnessFactor);
    float edge=1.0-max(dot(normalize(vViewPosition),normal),0.0);
    float dark=smoothstep(0.0,fresnelFalloff,pow(edge,fresnelPowerDark));
    float light=smoothstep(0.0,fresnelFalloff,pow(edge,fresnelPowerLight));
    material.diffuseContribution=mix(material.diffuseContribution,fresnelColorDark,dark)+fresnelColorLight*light;
    vec3 worldPaintNormal=inverseTransformDirection(normal,viewMatrix);
    material.diffuseContribution*=mix(ambientColorBot,vec3(1.0),(worldPaintNormal.y+1.0)*0.5)*ambientColorBotIntensity;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',physical);
   // The reference uses the older blended-F0 indirect BRDF. r186 splits metal
   // and dielectric scattering, which changes these authored paint colors.
   const brdf=THREE.ShaderChunk.lights_physical_pars_fragment.replace(/void RE_IndirectDiffuse_Physical\([\s\S]*?(?=void RE_IndirectSpecular_Physical)/,`void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
    reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert(material.diffuseContribution);
   }\n`).replace(/void RE_IndirectSpecular_Physical\([\s\S]*?(?=#define RE_Direct\s)/,`void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
    #ifdef USE_CLEARCOAT
     clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF(geometryClearcoatNormal,geometryViewDir,material.clearcoatF0,material.clearcoatF90,material.clearcoatRoughness);
    #endif
    vec3 singleScatter=vec3(0.0),multiScatter=vec3(0.0);
    computeMultiscattering(material.dfg,material.specularColorBlended,material.specularF90,singleScatter,multiScatter);
    vec3 totalScatter=singleScatter+multiScatter;
    vec3 diffuse=material.diffuseContribution*(1.0-max(max(totalScatter.r,totalScatter.g),totalScatter.b));
    vec3 weightedIrradiance=irradiance*RECIPROCAL_PI;
    reflectedLight.indirectSpecular += radiance*singleScatter+multiScatter*weightedIrradiance;
    reflectedLight.indirectDiffuse += diffuse*weightedIrradiance;
   }\n`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',brdf);
   const lights=THREE.ShaderChunk.lights_fragment_begin.replace('getAmbientLightIrradiance( ambientLightColor )','vec3(showroomAmbient)').replace('RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );','');
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lights);
   // The authored black uses a blue F0 in the old renderer. Match the neutral
   // charcoal reference in r186 without altering its reflection luminance.
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
    'outgoingLight=mix(vec3(dot(outgoingLight,vec3(.2126,.7152,.0722))),outgoingLight,paintChroma);\n#include <opaque_fragment>');
  };
  material.needsUpdate=true;
 }
 material.customProgramCacheKey=()=> 'showroom-paint-fixed-side-environment-v5';
 material.userData.paintLighting.paintChroma.value='chroma' in fit?fit.chroma:1;
 material.userData.paintLighting.showroomAmbient.value=fit.ambient;
 material.userData.paintLighting.showroomSideFill.value=fit.sideFill;
 material.userData.paintLighting.paintAngleBlend.value=p.flakeEnable?1:0;
 for(const n of names)(material.userData.paintLighting[n].value as THREE.Color).fromArray(p[n]);
 (material.userData.paintLighting.envColor.value as THREE.Color).multiply(new THREE.Color(...fit.tint as [number,number,number]));
 for(const n of scalarNames)material.userData.paintLighting[n].value=p[n];
}
