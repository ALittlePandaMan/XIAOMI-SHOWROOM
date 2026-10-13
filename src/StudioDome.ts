import * as THREE from 'three';
import {assetUrl} from './assetUrl';
import {loadLosslessBinary} from './LosslessRadiance';

/** World-space backdrop. It supplies the horizon in every camera and mirror view. */
export function createStudioDome(){
 const material=new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,toneMapped:false,
  vertexShader:`varying vec3 domePosition;
   void main(){domePosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`varying vec3 domePosition;
   void main(){
    vec3 direction=normalize(domePosition);float elevation=max(0.0,direction.y);
    vec3 horizon=vec3(0.638,0.644,0.638),sky=vec3(0.084,0.145,0.253);
    float falloff=exp(-pow(elevation/0.13,0.85));
    vec3 color=mix(sky,horizon,falloff);
    float azimuth=atan(direction.z,direction.x);
    float cloud=sin(elevation*390.0+sin(azimuth*3.0)*1.7)*sin(elevation*180.0+azimuth*5.0);
    color+=cloud*0.007*exp(-elevation/0.025);
    gl_FragColor=vec4(color,1.0);
    #include <colorspace_fragment>
   }`
 });
 const dome=new THREE.Mesh(new THREE.SphereGeometry(65,96,48,0,Math.PI*2,0,Math.PI/2),material);
 dome.name='Studio hemisphere backdrop';dome.scale.y=73/65;dome.position.y=-.01;dome.renderOrder=-2;
 return dome;
}

export async function loadStudioRadiance(name:'studio'|'paint'|'glass'|'wheel'|'wheel-glass'|'window-trim'){
 const path=assetUrl(`/environments/${name}`);
 const [metadataResponse,buffer]=await Promise.all([fetch(`${path}.json`),loadLosslessBinary(`${path}.rgba16f`,`${path}.rgba16f.gz`)]);
 if(!metadataResponse.ok)throw new Error('展厅环境载入失败');
 const meta=await metadataResponse.json() as {width:number;height:number;flipY:boolean};
 const data=new Uint16Array(buffer);
 if(data.length!==meta.width*meta.height*4)throw new Error('展厅环境数据不完整');
 const texture=new THREE.DataTexture(data,meta.width,meta.height,THREE.RGBAFormat,THREE.HalfFloatType);
 texture.name=`Studio ${name} radiance`;texture.mapping=THREE.EquirectangularReflectionMapping;
 texture.colorSpace=THREE.LinearSRGBColorSpace;texture.flipY=meta.flipY;texture.needsUpdate=true;
 return texture;
}
