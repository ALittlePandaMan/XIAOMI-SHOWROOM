import * as THREE from 'three';

export type WindowGlassRole='front'|'privacy'|'roof';

/** One finish shared with the Explorer. Exported material names are not a reliable
 * glass classification: the N70 roof used to lose its privacy flag on export. */
export function configureWindowGlass(material:THREE.MeshStandardMaterial,environment:THREE.Texture,role:WindowGlassRole){
 material.userData.glassRole=role;
 material.userData.privacy=role!=='front';
 material.transparent=true;material.depthWrite=false;
 material.color.setRGB(.05,.057,.067);material.opacity=role==='front'?.90:.985;
 material.metalness=.85;material.roughness=.05;
 material.envMap=environment;material.envMapRotation.set(0,1.8,0);material.envMapIntensity=.7;
 // Reconstructed assets can carry these channels over from an unrelated shader.
 material.map=null;material.alphaMap=null;material.aoMap=null;material.normalMap=null;
 material.roughnessMap=null;material.metalnessMap=null;material.emissiveMap=null;
 material.emissive.setRGB(0,0,0);
 if(material instanceof THREE.MeshPhysicalMaterial){material.clearcoat=0;material.specularIntensity=1;material.transmission=0;material.thickness=0;}
 configureWindowGlassView(material,role!=='front');
}

/** Thin automotive glazing must be visible from both sides. Keep the authored
 * exterior reflections; the interior sees neutral tint and weaker reflections. */
export function configureWindowGlassView(material:THREE.MeshStandardMaterial,privacy:boolean){
 material.side=THREE.DoubleSide;
 material.forceSinglePass=true;
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   bool inCabin=cameraPosition.x> -1.8 && cameraPosition.x<2.25 && abs(cameraPosition.z)<.88 && cameraPosition.y>.65 && cameraPosition.y<1.8;
   if(!inCabin && !gl_FrontFacing)discard;
   if(inCabin){
    // Keep only the reverse of the outer sheet. Some imported windows also
    // contain a separately modelled inner sheet; blending both doubles the tint.
    if(gl_FrontFacing)discard;
    // A reflective, smoke-grey film, with deeper tint on rear/privacy windows.
    float grazing=pow(1.-abs(dot(normal,normalize(vViewPosition))),3.);
    outgoingLight=mix(vec3(.095,.105,.112),outgoingLight,${privacy?'.25':'.32'});
    diffuseColor.a=mix(${privacy?'.56':'.32'},${privacy?'.68':'.49'},grazing);
   }
   #include <opaque_fragment>`);
 };
}
