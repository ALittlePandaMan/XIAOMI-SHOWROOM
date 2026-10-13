import * as THREE from 'three';

/** Shared linear leather albedo and soft cabin lighting for all N90 Max rows.
 * The texture contributes local quilting; window lights shade the actual form. */
export const seatLeatherColor=`
vec3 seatLeatherAlbedo(float sand,float black){
 return mix(mix(vec3(.31,.167,.088),vec3(.32,.305,.277),sand),vec3(.056,.060,.066),black);
}
`;

export const seatSoftLighting=`
 reflectedLight.directDiffuse*=1.25;
 reflectedLight.indirectDiffuse*=.12;
 reflectedLight.directSpecular*=.65;
 reflectedLight.indirectSpecular*=.40;
`;

/** Large emitters sit above the headrests instead of intersecting the seats.
 * StudioLighting routes these (1.85–2.5 m high) to N90 upholstery only. */
export function addSeatSoftboxes(scene:THREE.Scene){
 const roof=new THREE.RectAreaLight('#fffaf5',.65,4.0,1.6);
 roof.name='N90 seat ceiling softbox';roof.position.set(.5,2.25,0);
 roof.lookAt(.5,.7,0);scene.add(roof);
 for(const side of [-1,1]){
  const window=new THREE.RectAreaLight('#fffdf9',.85,4.0,1.6);
  window.name=`N90 seat window softbox ${side}`;window.position.set(.5,1.95,side*1.25);
  window.lookAt(.5,1.0,0);scene.add(window);
 }
}
