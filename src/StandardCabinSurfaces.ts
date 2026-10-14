import * as THREE from 'three';
import {seatLeatherColor,seatSoftLighting} from './SeatLighting';

/** Plain N90 panels keep their own shape and millimetre-scale leather grain.
 * Rear quilt panels use the fitted front-row atlas in InteriorLighting. */
export function configureStandardCabinSurface(material:THREE.MeshPhysicalMaterial,sand:{value:number},black={value:0}){
 const surface=String(material.userData.cabinSurface);
 const seat=material.userData.cabinSeat===true;
 material.clearcoat=0;material.envMapIntensity=1.2;
 if(surface==='mirror'){
  material.map=null;material.aoMap=null;material.color.setRGB(.55,.59,.63);
  material.metalness=1;material.roughness=.10;material.envMapIntensity=.16;
  return;
 }
 if(surface==='metal'){material.metalness=.8;material.roughness=.30;return;}
 material.metalness=0;material.specularIntensity=.3;
 material.roughness=['headliner','carpet','cargo-carpet','belt'].includes(surface)?.92:.68;
 if(seat){material.envMapIntensity=1.6;material.specularIntensity=.8;material.roughness=.52;}
 if(!['leather','headliner','carpet','cargo-carpet','cargo-back','cargo-base','quilt','belt','stitch','welt'].includes(surface))return;
 material.userData.interiorColor={cabinSand:sand};
 material.userData.batchUnsafe=true;
 material.onBeforeCompile=shader=>{
  shader.uniforms.standardCabinSand=sand;shader.uniforms.standardCabinBlack=black;
  shader.vertexShader='varying vec3 vCabinSurfacePosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\nvCabinSurfacePosition=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=seatLeatherColor+`varying vec3 vCabinSurfacePosition;
   uniform float standardCabinSand,standardCabinBlack;
   float n90Hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
   float n90Grain(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(n90Hash(i),n90Hash(i+vec3(1,0,0)),f.x),mix(n90Hash(i+vec3(0,1,0)),n90Hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(n90Hash(i+vec3(0,0,1)),n90Hash(i+vec3(1,0,1)),f.x),mix(n90Hash(i+vec3(0,1,1)),n90Hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
   `+shader.fragmentShader;
  // Calibrated against the front seat's tinted plain and perforated atlas.
  const seatColor=surface==='quilt'
   ?'diffuseColor.rgb*seatLeatherAlbedo(standardCabinSand,standardCabinBlack)'
   :'seatLeatherAlbedo(standardCabinSand,standardCabinBlack)';
  const color=seat?seatColor:['leather','cargo-back','cargo-base'].includes(surface)?'mix(vec3(.27,.142,.073),vec3(.53,.493,.425),standardCabinSand)':
   surface==='headliner'?'mix(vec3(.030,.032,.035),vec3(.29,.272,.237),standardCabinSand)':
   surface==='carpet'?'vec3(.019,.020,.021)':
   surface==='cargo-carpet'?'mix(vec3(.022,.014,.011),vec3(.017,.019,.021),standardCabinBlack)':
   surface==='belt'?'mix(vec3(.14,.096,.058),vec3(.33,.302,.25),standardCabinSand)':
   surface==='stitch'?'mix(vec3(.50,.32,.20),vec3(.58,.54,.47),standardCabinSand)':
   surface==='welt'?'mix(vec3(.22,.115,.062),vec3(.38,.348,.296),standardCabinSand)':
   'diffuseColor.rgb*mix(vec3(.27,.142,.073),vec3(.53,.493,.425),standardCabinSand)';
  const charcoal=seat?'seatLeatherAlbedo(standardCabinSand,1.)':surface==='headliner'?'vec3(.035,.038,.043)':
   surface==='belt'?'vec3(.032,.035,.039)':surface==='stitch'?'vec3(.135,.14,.15)':
   surface==='welt'?'vec3(.043,.046,.051)':'vec3(.070,.075,.083)';
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   vec3 quiltDetail=diffuseColor.rgb;
   diffuseColor.rgb=${color};
   ${['carpet','cargo-carpet'].includes(surface)?'':`diffuseColor.rgb=mix(diffuseColor.rgb,${charcoal}${surface==='quilt'?'*quiltDetail':''},standardCabinBlack);`}
   ${['cargo-back','cargo-base'].includes(surface)?`
   vec2 cargoQ=abs(vCabinSurfacePosition.zy-vec2(0.,${surface==='cargo-base'?'.677':'1.045'}))-vec2(${surface==='cargo-base'?'.575,.1':'.596,.267'})+${surface==='cargo-base'?'.015':'.026'};
   float cargoDistance=length(max(cargoQ,0.))+min(max(cargoQ.x,cargoQ.y),0.)-${surface==='cargo-base'?'.015':'.026'};
   float cargoBack=${surface==='cargo-base'?'smoothstep(1.834,1.836,vCabinSurfacePosition.x)':'smoothstep(1.520,1.522,vCabinSurfacePosition.x-.414*vCabinSurfacePosition.y)'};
   float cargoMask=(1.-smoothstep(-max(fwidth(cargoDistance),.0002),max(fwidth(cargoDistance),.0002),cargoDistance))*cargoBack;
   diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.035,.022,.017),vec3(.017,.019,.021),standardCabinBlack),cargoMask);`:''}
   float grainScale=${surface==='headliner'?2200:1500}.;
   float grainFade=1.-smoothstep(.3,1.4,max(length(dFdx(vCabinSurfacePosition*grainScale)),length(dFdy(vCabinSurfacePosition*grainScale))));
   float grain=(n90Grain(vCabinSurfacePosition*grainScale)-.5)*grainFade;
   diffuseColor.rgb*=1.+grain*.09;`);
  if(seat)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
   #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
    // Coarse baked AO fans out from the rear-seat latch across whole triangles.
    // Leather uses the curved surface's real lighting; only the cargo carpet
    // retains this bake. Keep the original vertex attribute unchanged.
    vec3 seatContact=vec3(1.);
    ${['cargo-back','cargo-base'].includes(surface)?'seatContact=mix(seatContact,vColor.rgb,cargoMask);':''}
    diffuseColor.rgb*=seatContact;
   #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 qx=dFdx(-vViewPosition),qy=dFdy(-vViewPosition);
   vec3 rx=cross(qy,normal),ry=cross(normal,qx);
   float det=dot(qx,rx);
   vec3 gradient=sign(det)*(dFdx(grain)*rx+dFdy(grain)*ry)*.000045;
   normal=normalize(abs(det)*normal-gradient);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
   ${seat?`
   ${['cargo-back','cargo-base'].includes(surface)?'vec3 cargoDiffuse=diffuseColor.rgb*.80;':''}
   ${seatSoftLighting}
   ${['cargo-back','cargo-base'].includes(surface)?`
   reflectedLight.directDiffuse*=1.-cargoMask;
   reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,cargoDiffuse,cargoMask);
   reflectedLight.directSpecular*=mix(1.,mix(.12,.24,standardCabinBlack)/.65,cargoMask);
   reflectedLight.indirectSpecular*=mix(1.,mix(.0625,.18,standardCabinBlack)/.40,cargoMask);`:''}
   `:`
   reflectedLight.directDiffuse*=.20;
   ${['headliner','stitch'].includes(surface)?'reflectedLight.indirectDiffuse=diffuseColor.rgb*.8;':'reflectedLight.indirectDiffuse*=.52;'}
   reflectedLight.directSpecular*=mix(.35,.5,standardCabinBlack);
   reflectedLight.indirectSpecular*=mix(.45,.65,standardCabinBlack);`}`);
 };
}
