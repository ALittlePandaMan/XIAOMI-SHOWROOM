import * as THREE from 'three';
import {seatQuiltLighting} from './SeatUpholstery.ts';
import {renderSettings} from './RenderSettings.ts';

interface Binding {method:'pad'|'quilt';ready:{value:boolean};texture:{value:THREE.Texture|null}}
const broadLoop=/vec3 broad=vec3\(0\.\);[\s\S]*?broad\/=16\.;/;
const bandLoop=/vec3 band=vec3\(0\.\);[\s\S]*?band\/=24\.;/;
export function seatCacheShader(renderer:THREE.WebGLRenderer,material:THREE.Material){
 if(renderSettings(renderer).reference||material.userData.seatCacheDisabled)return undefined;
 const binding=material.userData.seatSampling as Binding;
 const originalBroad=seatQuiltLighting.match(broadLoop)![0],originalBand=seatQuiltLighting.match(bandLoop)![0];
 const lookup=`
 uniform bool showroomSeatCacheReady;
 uniform sampler2D showroomSeatCache;
 vec3 showroomSeatBroad(vec2 px){
  ivec2 a=ivec2(floor(px));vec2 f=fract(px);
  // FP32 texelFetch avoids requiring float-linear filtering on mobile GPUs.
  return mix(mix(texelFetch(showroomSeatCache,a,0).rgb,texelFetch(showroomSeatCache,a+ivec2(1,0),0).rgb,f.x),
   mix(texelFetch(showroomSeatCache,a+ivec2(0,1),0).rgb,texelFetch(showroomSeatCache,a+ivec2(1,1),0).rgb,f.x),f.y);
 }
 bool showroomSeatCacheSafe(vec2 px,vec4 region){vec2 edge=min(px-region.xy,region.zw-px);return showroomSeatCacheReady&&min(edge.x,edge.y)>1.;}
 `;
 const broad=`vec3 broad=vec3(0.);
 if(showroomSeatCacheSafe(px,region))broad=showroomSeatBroad(px);
 else{${originalBroad.replace('vec3 broad=','broad=')}}`;
 const band=`vec3 band=vec3(0.);
 if(showroomSeatCacheSafe(px,vec4(789.,857.,970.,987.)))band=showroomSeatBroad(px);
 else{${originalBand.replace('vec3 band=','band=')}}`;
 // Each material calls either the quilt or pad algorithm, never both in one region.
 return lookup+seatQuiltLighting.replace(broadLoop,broad).replace(bandLoop,binding.method==='pad'?band:originalBand);
}

const box=`float cabinBox(vec2 p,vec4 b){return step(b.x,p.x)*step(b.y,p.y)*step(p.x,b.z)*step(p.y,b.w);}`;
const region=`vec4 region=vec4(0.);
 if(cabinBox(px,vec4(526.,227.,675.,466.))>.5)region=vec4(526.,227.,675.,466.);
 else if(cabinBox(px,vec4(843.,451.,1003.,605.))>.5)region=vec4(843.,451.,1003.,605.);
 else if(cabinBox(px,vec4(522.,597.,680.,680.))>.5)region=vec4(522.,597.,680.,680.);
 else if(cabinBox(px,vec4(790.,857.,969.,985.))>.5)region=vec4(790.,857.,969.,985.);`;
export const seatPrecomputeShader=(method:'pad'|'quilt')=>`uniform sampler2D atlas;
 ${box}
 void main(){
  // Place interpolation knots at integer atlas coordinates. The original LOD
  // sample breakpoints and clamp edges are integer aligned, not at texel centres.
  vec2 px=gl_FragCoord.xy-.5;vec3 value=vec3(0.);
  ${method==='pad'?`if(cabinBox(px,vec4(789.,857.,970.,987.))>.5){
   ${seatQuiltLighting.match(bandLoop)![0]}
   value=band;
  }else`:''}{
   ${region}
   if(region.z>0.){
    vec2 low=region.xy+vec2(22.,12.),high=region.zw-vec2(22.,12.);
    ${seatQuiltLighting.match(broadLoop)![0]}
    value=broad;
   }
  }
  gl_FragColor=vec4(value,1.);
 }`;

/** Auxiliary FP32 radiance only; source images, mips and final color math stay intact. */
export class SeatSamplingCache {
 private entries=new Map<string,THREE.WebGLRenderTarget>();
 private scene=new THREE.Scene();
 private camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 private quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));
 private shaders=new Map<string,THREE.ShaderMaterial>();
 private materials:THREE.MeshStandardMaterial[]=[];
 private generation=0;
 private running?:Promise<void>;
 private disposed=false;
 private builds=0;
 private supported:boolean;
 private renderer:THREE.WebGLRenderer;
 private invalidate:()=>void;
 private fallbackReason?:string;
 constructor(renderer:THREE.WebGLRenderer,invalidate:()=>void,fallbackReason?:string){
  this.renderer=renderer;this.invalidate=invalidate;
  this.fallbackReason=fallbackReason;this.supported=!fallbackReason&&renderer.extensions.has('EXT_color_buffer_float');
  if(!this.supported&&!fallbackReason)this.fallbackReason='FP32 render targets unavailable';
  this.quad.frustumCulled=false;this.scene.add(this.quad);
 }
 bind(roots:THREE.Object3D[]){const seen=new Set<THREE.Material>();for(const root of roots)root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial&&m.userData.seatSampling&&!seen.has(m)){seen.add(m);this.materials.push(m);if(!this.supported)m.userData.seatCacheDisabled=true;}});}
 update(){
  this.generation++;
  // A changed palette falls back to the original shader until its own cache is ready.
  for(const m of this.materials){const b=m.userData.seatSampling as Binding;b.ready.value=false;}
  if(this.running)return this.running;
  this.running=this.buildCurrent().finally(()=>this.running=undefined);return this.running;
 }
 private async buildCurrent(){
  let completed=-1;
  while(!this.disposed&&completed!==this.generation){
   const version=this.generation,active=new Set<string>();
   for(const m of this.materials){
    const binding=m.userData.seatSampling as Binding,atlas=m.map;
    const image=atlas?.image as {width?:number;height?:number}|undefined;
    if(!this.supported||renderSettings(this.renderer).reference||!atlas||image?.width!==1024||image?.height!==1024)continue;
    const key=`${atlas.uuid}:${binding.method}`;active.add(key);
    if(!this.entries.has(key)){
     await new Promise<void>(resolve=>setTimeout(resolve,0));if(this.disposed)return;if(version!==this.generation)break;
     let shader=this.shaders.get(binding.method);
     if(!shader){shader=new THREE.ShaderMaterial({uniforms:{atlas:{value:atlas}},vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:seatPrecomputeShader(binding.method),depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.NoBlending});this.shaders.set(binding.method,shader);}
     shader.uniforms.atlas.value=atlas;this.quad.material=shader;
     const target=new THREE.WebGLRenderTarget(1024,1024,{type:THREE.FloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
     const previous=this.renderer.getRenderTarget(),face=this.renderer.getActiveCubeFace(),mip=this.renderer.getActiveMipmapLevel();
     try{this.renderer.initTexture(atlas);this.renderer.setRenderTarget(target);this.renderer.render(this.scene,this.camera);this.entries.set(key,target);this.builds++;}
     catch(error){target.dispose();this.disable('FP32 cache build failed');console.warn('Seat cache unavailable; retaining original sampling.',error);}
     finally{this.renderer.setRenderTarget(previous,face,mip);}
    }
    const target=this.entries.get(key);if(target&&version===this.generation){binding.texture.value=target.texture;binding.ready.value=true;}
   }
   if(version===this.generation){for(const [key,target]of this.entries)if(!active.has(key)){target.dispose();this.entries.delete(key);}completed=version;this.invalidate();}
  }
 }
 get diagnostics(){return {supported:this.supported,fallbackReason:this.fallbackReason,activeCaches:this.entries.size,builds:this.builds,estimatedMiB:this.entries.size*16,pending:!!this.running};}
 contextRestored(){for(const t of this.entries.values())t.dispose();this.entries.clear();return this.update();}
 disable(reason='Seat cache failed visual validation'){this.supported=false;this.fallbackReason=reason;for(const m of this.materials){(m.userData.seatSampling as Binding).ready.value=false;m.userData.seatCacheDisabled=true;m.needsUpdate=true;}for(const t of this.entries.values())t.dispose();this.entries.clear();this.invalidate();}
 dispose(){this.disposed=true;for(const t of this.entries.values())t.dispose();for(const m of this.shaders.values())m.dispose();this.quad.geometry.dispose();this.entries.clear();this.materials=[];}
}
