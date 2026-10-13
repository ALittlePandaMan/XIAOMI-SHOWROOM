import type {Material,RectAreaLight,WebGLRenderer} from 'three';

export interface RenderSettings {reference:boolean;areaLights:readonly RectAreaLight[];staticLights:boolean}
const settings=new WeakMap<WebGLRenderer,RenderSettings>();
const tracked=new WeakMap<Material,()=>string>();
export const renderSettings=(renderer:WebGLRenderer):RenderSettings=>settings.get(renderer)??{reference:true,areaLights:[],staticLights:false};
export function setRenderSettings(renderer:WebGLRenderer,value:RenderSettings){settings.set(renderer,value);}
/** Both shader paths are cached separately; uniforms and resources keep their owners. */
export function trackRenderMaterial(material:Material,renderer:WebGLRenderer){
 if(tracked.get(material)===material.customProgramCacheKey)return;
 const key=material.customProgramCacheKey.bind(material);
 material.customProgramCacheKey=()=>`${key()}:render-${renderSettings(renderer).reference?'reference':'optimized'}:${Number(renderSettings(renderer).staticLights)}:seat-${Number(!!material.userData.seatCacheDisabled)}`;
 tracked.set(material,material.customProgramCacheKey);
}
