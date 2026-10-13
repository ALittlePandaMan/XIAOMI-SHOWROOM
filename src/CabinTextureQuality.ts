import * as THREE from 'three';

export const isCabinMaterial=(name:string)=>/内饰|中控屏|电动幕布/.test(name);

/** Keep every original texel. Mips are retained only for minification, where
 * disabling them would produce crawling patterns instead of more detail. */
export function configureCabinTextureQuality(material:THREE.MeshStandardMaterial,renderer:THREE.WebGLRenderer){
 for(const value of Object.values(material))if(value instanceof THREE.Texture&&!value.isRenderTargetTexture&&value.mapping===THREE.UVMapping){
  value.anisotropy=renderer.capabilities.getMaxAnisotropy();
  value.magFilter=THREE.LinearFilter;value.minFilter=THREE.LinearMipmapLinearFilter;
  value.generateMipmaps=true;value.needsUpdate=true;
 }
 material.userData.textureQuality='original-lossless/full-resolution-cubic';
 const previous=material.onBeforeCompile;
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.fragmentShader=cabinTextureSampling+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
   #ifdef USE_MAP
    diffuseColor*=cabinSample(map,vMapUv);
   #endif`);
  // Separate source display materials use the same atlas in the emissive slot.
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
   #ifdef USE_EMISSIVEMAP
    totalEmissiveRadiance*=cabinSample(emissiveMap,vEmissiveMapUv).rgb;
   #endif`);
 };
}

// Catmull–Rom reconstruction at close range. Clamp overshoot to the local
// texel range so letters do not gain white halos. At a distance use the GPU's
// anisotropic mip filter; never force an artificially blurred atlas level.
const cabinTextureSampling=`
vec4 cabinCubicWeights(float t){
 float t2=t*t,t3=t2*t;
 return vec4(-.5*t+t2-.5*t3,1.-2.5*t2+1.5*t3,.5*t+2.*t2-1.5*t3,-.5*t2+.5*t3);
}
vec4 cabinSample(sampler2D image,vec2 uv){
 ivec2 size=textureSize(image,0);
 vec2 p=uv*vec2(size)-.5;
 float footprint=max(length(dFdx(p)),length(dFdy(p)));
 vec4 filtered=texture(image,uv);
 float closeWeight=1.-smoothstep(.7,1.25,footprint);
 if(closeWeight<=0.)return filtered;
 ivec2 base=ivec2(floor(p));vec2 f=fract(p);
 vec4 wx=cabinCubicWeights(f.x),wy=cabinCubicWeights(f.y);
 vec4 color=vec4(0.),low=vec4(1e5),high=vec4(-1e5);
 for(int y=0;y<4;y++)for(int x=0;x<4;x++){
  // Sampling exact texel centres also honours the source's repeat/mirror/clamp
  // wrapping. texelFetch with clamping would break UV islands outside [0,1].
  vec4 sampleValue=textureLod(image,(vec2(base+ivec2(x-1,y-1))+.5)/vec2(size),0.);
  color+=sampleValue*wx[x]*wy[y];
  if(x>=1&&x<=2&&y>=1&&y<=2){low=min(low,sampleValue);high=max(high,sampleValue);}
 }
 return mix(filtered,clamp(color,low,high),closeWeight);
}
`;
