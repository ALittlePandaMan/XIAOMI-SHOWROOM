import * as THREE from 'three';
import profile from './lighting-profile.json';
import {renderSettings} from './RenderSettings';

/** Fixed surrounding daylight and asymmetric reflection panels, in linear radiance. */
export function createStudioEnvironment(settings:Omit<typeof profile,'paint'|'intensity'>=profile,width=2048){
 const height=width/2,data=new Float32Array(width*height*4);
 for(let j=0;j<height;j++)for(let i=0;i<width;i++){
  const u=i/width,elevation=-Math.cos(j/height*Math.PI);
  const skyBlend=THREE.MathUtils.clamp((elevation+.25)/.5,0,1);
  let radiance=THREE.MathUtils.lerp(settings.ground,settings.sky,skyBlend)
   +settings.horizon*Math.exp(-Math.pow((elevation-settings.horizonElevation)/settings.horizonHeight,2))
   +settings.ceiling*Math.exp(-Math.pow((elevation-.8)/.5,2));
  for(const panel of settings.panels){
   const distance=Math.min(Math.abs(u-panel.azimuth),1-Math.abs(u-panel.azimuth));
   radiance+=panel.strength*Math.exp(-Math.pow(distance/panel.width,2)-Math.pow((elevation-panel.elevation)/panel.height,2));
  }
  const at=(j*width+i)*4;
  data[at]=radiance;data[at+1]=radiance*1.005;data[at+2]=radiance*1.012;data[at+3]=1;
 }
 const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
 texture.mapping=THREE.EquirectangularReflectionMapping;texture.needsUpdate=true;
 return texture;
}

// RectAreaLight has no shadow occlusion. Route the cabin and exterior softboxes
// to their intended surfaces, preserving the material's other shader edits.
export function excludeCabinFill(material:THREE.MeshStandardMaterial,region:'none'|'exterior'|'cabin'|'seat'='none'){
 const previousCompile=material.onBeforeCompile;
 material.onBeforeCompile=(shader,renderer)=>{
  previousCompile.call(material,shader,renderer);
  const call='RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const filter=region==='none'?'':`{ vec3 lightWorld=cameraPosition+(vec4(rectAreaLight.position,0.0)*viewMatrix).xyz;
   bool cabinLight=abs(lightWorld.x)<3.0 && abs(lightWorld.z)<1.4 && lightWorld.y<2.5;
   bool seatLight=cabinLight && lightWorld.y>1.85;
   if(${region==='seat'?'seatLight':region==='cabin'?'cabinLight && !seatLight':'!cabinLight'}){${call}} }`;
  const settings=renderSettings(renderer);
  let selected=filter;
  // Cabin routing includes the existing camera-space reconstruction. Preserve
  // that path: replacing it with world-space constants failed cabin SSIM checks.
  // Exterior/no-fill materials have no contribution from these fixed softboxes.
  if(!settings.reference&&settings.staticLights&&(region==='none'||region==='exterior')){
   const indices=settings.areaLights.flatMap((light,index)=>{
    const p=light.position,cabin=Math.abs(p.x)<3&&Math.abs(p.z)<1.4&&p.y<2.5;
    return region==='exterior'&&!cabin?[index]:[];
   });
   selected=indices.length?`\n#if ${indices.map(i=>`UNROLLED_LOOP_INDEX == ${i}`).join(' || ')}\n${call}\n#endif\n`:'';
  }
  const chunk=THREE.ShaderChunk.lights_fragment_begin.replace(call,selected);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',chunk);
 };
}

export const studioIntensity=profile.intensity;
export const createPaintEnvironment=(width=2048)=>createStudioEnvironment(profile.paint,width);
