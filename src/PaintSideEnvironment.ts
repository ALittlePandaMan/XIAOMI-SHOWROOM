import * as THREE from 'three';

// Two broad reflection sources at ±Z in world space. The car's length is X.
// Gaussian edges avoid rectangular highlights. Roughness broadens the sources
// while their integrated energy stays bounded; the original HDR remains intact.
export const paintSideEnvironmentGLSL=`
 uniform float showroomSideFill;
 float showroomSideRadiance(vec3 direction,float roughness){
  float horizontal=max(length(direction.xz),0.0001);
  float azimuth=acos(clamp(abs(direction.z)/horizontal,0.0,1.0));
  float elevation=atan(direction.y,horizontal);
  float width=sqrt(0.45*0.45+roughness*roughness*0.7);
  float height=sqrt(0.24*0.24+roughness*roughness*0.7);
  float energy=(0.45*0.24)/(width*height);
  return showroomSideFill*energy*exp(-0.5*pow(azimuth/width,2.0)-0.5*pow((elevation-0.22)/height,2.0));
 }
`;

export function paintEnvironmentChunk(){
 return THREE.ShaderChunk.envmap_physical_pars_fragment
  .replaceAll('envMapIntensity','envMapIntensity * envColor')
  .replace('return envMapColor.rgb * envMapIntensity * envColor;',
   'return (envMapColor.rgb + vec3(showroomSideRadiance(reflectVec,roughness))) * envMapIntensity * envColor;');
}
