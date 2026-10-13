import * as THREE from 'three';
import {cabinDetailFunctions,cabinSurfaceRegions,n70DoorSurfaceRegions} from './CabinSurfaceDetails';
import {controlGlyphFunctions} from './CabinControls';
import {seatQuiltLighting} from './SeatUpholstery';
import {seatLeatherColor,seatSoftLighting} from './SeatLighting';
import {cabinFixtureRegions} from './CabinFixtureDetails';
import {seatCacheShader} from './SeatSamplingCache';

/** Color correction belongs to the leather pixels, not the chrome and black inserts
 * that share the same source atlas. The atlas already contains diffuse shading. */
export function configureBrownInterior(material:THREE.MeshStandardMaterial,steeringInscription?:THREE.Texture,sand={value:0},modelledControls=true,black={value:0}){
 const nativeAtlas=!!material.userData.cabinAtlas||Number(material.userData.n90Atlas??0)>=10000;
 const auditedStandard=material.userData.n70Kind==='cabin';
 const n70Door=!!material.userData.cabinAtlas&&/门板/.test(material.name);
 // Console, dashboard and front-seat islands retain the compatible layout.
 // N70 door atlases use different metal-strip positions.
 const originalRegions=!nativeAtlas||/中央扶手|仪表台|前排座椅|安全带/.test(material.name);
 const upper=material.userData.cabinZone==='body';
 const standard=Number(material.userData.n90Atlas??0)>0;
 // Atlas 10027 is the transplanted N70 seat/headrest atlas, not roof cloth.
 // Select upholstery by the panel's role so seated trim keeps its own palette.
 const roofUpholstery=standard&&(upper||/顶棚|遮阳板/.test(material.name));
 const door=/内饰_(前门板|后门板)$/.test(material.name);
 const controls=modelledControls&&(door||material.name.endsWith('内饰_方向盘'));
 const seat=/座椅|坐垫/.test(material.name);
 const softSeat=standard&&seat&&[19,10027].includes(Number(material.userData.n90Atlas));
 const cleanSeatQuilting=softSeat||Number(material.userData.n90Atlas)===19||Number(material.userData.cabinAtlas)===27;
 if(upper)material.userData.batchUnsafe=true;
 if(cleanSeatQuilting)material.userData.seatSampling={method:softSeat||Number(material.userData.n90Atlas)===19?'pad':'quilt',ready:{value:false},texture:{value:null}};
 const inscription=material.name.endsWith('内饰_方向盘')?steeringInscription:undefined;
 const uniforms={cabinBlack:black,cabinSand:sand,cabinBaseMap:{value:material.map},cabinLeatherGain:{value:standard?(seat?1.70:1.48):(seat?1.95:1.75)},cabinLeatherTint:{value:seat?new THREE.Color(1,.84,.70):new THREE.Color(1,.90,.83)}};
 material.userData.interiorColor=uniforms;
 material.envMapIntensity=1.6;material.roughness=.44;material.color.setRGB(1,1,1);
 if(softSeat){material.roughness=.52;if(material instanceof THREE.MeshPhysicalMaterial)material.specularIntensity=.8;}
 if(material instanceof THREE.MeshPhysicalMaterial){material.clearcoat=0;material.clearcoatRoughness=.3;}
 material.onBeforeCompile=(shader,renderer)=>{
  Object.assign(shader.uniforms,uniforms);
  if(upper){
   shader.vertexShader='varying float vCabinHeight;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCabinHeight=(modelMatrix*vec4(transformed,1.)).y;');
   shader.fragmentShader='varying float vCabinHeight;\n'+shader.fragmentShader;
  }
  if(inscription){shader.uniforms.cabinInscription={value:inscription};shader.fragmentShader='uniform sampler2D cabinInscription;\n'+shader.fragmentShader;}
  if(controls){
   shader.vertexShader='attribute vec4 cabinControl;varying vec4 vCabinControl;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCabinControl=cabinControl;');
   shader.fragmentShader='varying vec4 vCabinControl;\n'+controlGlyphFunctions+shader.fragmentShader;
  }
  shader.fragmentShader='uniform float cabinBlack,cabinSand;uniform sampler2D cabinBaseMap;uniform float cabinLeatherGain;uniform vec3 cabinLeatherTint;\n'+cabinDetailFunctions+shader.fragmentShader;
  if(cleanSeatQuilting){
   const cached=seatCacheShader(renderer,material);
   shader.fragmentShader=shader.fragmentShader.replace(cabinDetailFunctions,cabinDetailFunctions+(cached??seatQuiltLighting)+(softSeat?seatLeatherColor:''));
   if(cached){shader.uniforms.showroomSeatCacheReady=material.userData.seatSampling.ready;shader.uniforms.showroomSeatCache=material.userData.seatSampling.texture;}
  }
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   vec2 px=vMapUv*1024.0;
   ${softSeat?'vec3 seatAtlasColor=diffuseColor.rgb;':''}
   float inscriptionInk=0.0;
   ${inscription?`
   float inscriptionArea=cabinBox(px,vec4(74.,569.,190.,582.));
   vec3 inscriptionLeather=mix(texture2D(map,vec2(vMapUv.x,569.0/1024.0)).rgb,
    texture2D(map,vec2(vMapUv.x,583.0/1024.0)).rgb,clamp((px.y-569.0)/14.0,0.0,1.0));
   diffuseColor.rgb=mix(diffuseColor.rgb,inscriptionLeather,inscriptionArea);
   inscriptionInk=texture2D(cabinInscription,(px-vec2(74.,569.))/vec2(116.,13.)).a*inscriptionArea;`:''}
   ${modelledControls&&material.name.includes('前门板')?`
   // Stray silver mark baked into an otherwise uninterrupted leather UV island.
   // Interpolate the same leather immediately above/below it on both front doors.
   float strayMark=cabinRoundRect(px,vec2(553.5,156.5),vec2(24.5,7.5),3.0);
   vec3 cleanLeather=mix(texture2D(map,vec2(vMapUv.x,147.0/1024.0)).rgb,
    texture2D(map,vec2(vMapUv.x,166.0/1024.0)).rgb,clamp((px.y-147.0)/19.0,0.0,1.0));
   diffuseColor.rgb=mix(diffuseColor.rgb,cleanLeather,strayMark);`:''}
   float cabinMax=max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b);
   float cabinMin=min(min(diffuseColor.r,diffuseColor.g),diffuseColor.b);
   float cabinSaturation=(cabinMax-cabinMin)/max(cabinMax,0.001);
   // Use the matching brown atlas only as a leather mask. The selected sand
   // atlas supplies its own original pixels, including dark contrasting inserts.
   vec3 cabinMaskColor=mix(diffuseColor.rgb,texture2D(cabinBaseMap,vMapUv).rgb,cabinSand);
   float maskMax=max(max(cabinMaskColor.r,cabinMaskColor.g),cabinMaskColor.b);
   float maskMin=min(min(cabinMaskColor.r,cabinMaskColor.g),cabinMaskColor.b);
   float maskSaturation=(maskMax-maskMin)/max(maskMax,.001);
   float leatherMask=smoothstep(.14,.32,maskSaturation)*smoothstep(1.02,1.12,cabinMaskColor.r/max(cabinMaskColor.g,.001));
   float cabinMetal=(1.0-smoothstep(0.08,0.22,cabinSaturation))*smoothstep(0.10,0.22,cabinMax)*(1.0-leatherMask);
   diffuseColor.rgb*=mix(vec3(1.0),mix(cabinLeatherTint*cabinLeatherGain,vec3(1.10,1.09,1.06),cabinSand),leatherMask);
   float darkLeather=max(cabinBlack,${upper?'(1.-cabinSand)*smoothstep(1.16,1.20,vCabinHeight)':'0.'});
   vec3 leatherShadeSource=mix(diffuseColor.rgb,cabinMaskColor*cabinLeatherTint*${standard?(seat?'1.95':'1.75'):'cabinLeatherGain'},cabinBlack);
   float leatherShade=clamp(dot(leatherShadeSource,vec3(.2126,.7152,.0722))*4.0,.3,1.6);
   ${material.userData.cabinAtlas?`
   // The N70 has an authored black atlas with its own shadows and metalwork.
   diffuseColor.rgb*=mix(1.,1.12,cabinBlack*leatherMask);`: `
   // Charcoal leather retains visible midtones in the reference. The former
   // near-black multiplier crushed the already shaded brown atlas a second time.
   vec3 charcoal=mix(vec3(.018,.019,.020),vec3(.070,.075,.083),cabinBlack);
   diffuseColor.rgb=mix(diffuseColor.rgb,charcoal*leatherShade,leatherMask*darkLeather);`}
   ${cleanSeatQuilting&&!softSeat?`diffuseColor.rgb*=mix(1.,${Number(material.userData.n90Atlas)===19?'seatPadExposure':'seatQuiltExposure'}(map,px),leatherMask);`:''}
   ${softSeat?`
   // Neutralize the atlas's broad directional bake before applying shared light.
   // Keep its seams and fine quilt relief, without baking the old light twice.
   float seatReference=dot(textureLod(map,vec2(598.,290.)/1024.,4.).rgb,vec3(.2126,.7152,.0722));
   float seatRelief=dot(seatAtlasColor,vec3(.2126,.7152,.0722))*seatPadExposure(map,px)/max(seatReference,.003);
   float seatQuilt=max(max(cabinBox(px,vec4(526.,227.,675.,466.)),cabinBox(px,vec4(843.,451.,1003.,605.))),max(cabinBox(px,vec4(522.,597.,680.,680.)),cabinBox(px,vec4(789.,857.,970.,987.))));
   seatRelief=pow(clamp(seatRelief,.06,1.8),mix(.32,.68,seatQuilt));
   diffuseColor.rgb=mix(diffuseColor.rgb,seatLeatherAlbedo(cabinSand,cabinBlack)*seatRelief,leatherMask);
   `:''}
   vec3 cabinAuthored=diffuseColor.rgb;
   ${roofUpholstery?`
   // Normalize the baked brown cloth once before recoloring it. Multiplying
   // a dark charcoal by this already shaded atlas crushed visors and handles.
   // The saturation mask keeps lenses, button legends and metal untouched.
   float roofCloth=${upper?'smoothstep(1.18,1.22,vCabinHeight)':'1.'}*leatherMask;
   float clothLuminance=dot(cabinMaskColor,vec3(.2126,.7152,.0722));
   float clothShade=clamp(pow(max(clothLuminance,.0001)/.060,.75),.12,1.65);
   vec3 roofCharcoal=mix(vec3(.030,.032,.035),vec3(.035,.038,.043),cabinBlack);
   float darkRoof=max(1.-cabinSand,cabinBlack);
   diffuseColor.rgb=mix(diffuseColor.rgb,roofCharcoal*clothShade,roofCloth*darkRoof);
   diffuseColor.rgb*=mix(1.,1.50,roofCloth*cabinSand*(1.-cabinBlack));`:''}
   float detailMetal=0.0,detailGrille=0.0,detailBrushed=0.0,detailFabric=0.0,detailPerforated=0.0,detailTextile=0.0,detailPanel=0.0,detailWell=0.0,detailInset=0.0,detailVent=0.0,detailCup=0.0,detailLens=0.0;
   float controlMask=0.0,controlWell=0.0,controlInk=0.0,detailFixtureMetal=0.0;
   float fixtureShade=dot(texture2D(cabinBaseMap,vMapUv).rgb,vec3(.2126,.7152,.0722));
   ${originalRegions?cabinSurfaceRegions(material.name,auditedStandard,Number(material.userData.n90Atlas??0)):''}
   ${nativeAtlas?n70DoorSurfaceRegions(Number(material.userData.cabinAtlas??Number(material.userData.n90Atlas)-10000)):''}
   ${auditedStandard?cabinFixtureRegions(material.name,Number(material.userData.n90Atlas??material.userData.cabinAtlas)):''}
   leatherMask*=1.-max(detailCup,detailLens);
   detailTextile*=1.-max(detailLens,detailMetal);
   detailMetal=max(detailMetal,inscriptionInk);
   detailMetal=max(detailMetal,detailGrille);
   ${controls?`
   // The outer connected frame includes the leather surround. The metal rim
   // is the upper bevel of the separate switch well, not that leather frame.
   controlMask=step(1.5,vCabinControl.z);
   controlWell=(1.0-vCabinControl.w)*(1.0-step(0.4,abs(vCabinControl.z-2.0)));
   float windowSwitch=1.0-step(0.4,abs(vCabinControl.z-3.0));
   controlInk=controlWindow(vCabinControl.xy)*windowSwitch*vCabinControl.w;
   // Retain the original auxiliary-button symbols, separating their dark ink
   // from the baked silver glare instead of inventing different functions.
   float auxiliary=1.0-step(0.4,abs(vCabinControl.z-4.0));
   float symbolArea=(1.0-smoothstep(.35,.65,abs(vCabinControl.x)))*(1.0-smoothstep(.4,.8,abs(vCabinControl.y)));
   controlInk=max(controlInk,auxiliary*symbolArea*vCabinControl.w*(1.0-smoothstep(.12,.22,cabinMax)));
   // Original modelled steering symbols use their own geometry as the mask.
   controlInk=max(controlInk,1.0-step(0.4,abs(vCabinControl.z-6.0)));
   detailMetal=max(detailMetal,controlMask);
   leatherMask*=1.0-controlMask;`:''}
   float grilleHoles=cabinGrillePattern(vMapUv);
   diffuseColor.rgb=mix(diffuseColor.rgb,${auditedStandard&&!n70Door?'vec3(.16,.18,.20)':'vec3(.28,.265,.25)'},detailMetal);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.40,.41,.42),detailFixtureMetal);
   ${auditedStandard?'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.45,.47,.49),inscriptionInk);':''}
   ${auditedStandard?`
   // Dark perforated metal and graphite vent plates retain their silver rims.
   ${n70Door?'':'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.029,.034,.040),detailGrille);'}
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.028,.033,.039),detailInset);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.008,.010,.013),detailVent);`:''}
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.37,.35),controlMask);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.095,.09,.085),controlWell);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.018,.020,.022),controlInk);
   diffuseColor.rgb=mix(diffuseColor.rgb,${auditedStandard?'vec3(.005,.006,.008)':'vec3(.015,.014,.013)'},detailGrille*grilleHoles);
   diffuseColor.rgb*=1.0+detailBrushed*cabinBrushing(vMapUv)*0.035;
   // Broad console surfaces are brushed silver (mocha) / dark open-grain wood
   // (sand), not polished chrome. Retain the source's cavity and bevel shading.
   float panelShade=clamp(dot(cabinAuthored,vec3(.2126,.7152,.0722))*2.7,0.,1.);
   float finishGrain=cabinFinishGrain(vMapUv);
   vec3 panelColor=mix(${standard?'vec3(.17,.165,.153)':'vec3(.30,.295,.285)'},vec3(.038,.031,.025),cabinSand);
   panelColor*=mix(.58+.42*panelShade,.60+.40*panelShade,cabinSand);
   panelColor*=1.0+finishGrain*mix(.13,.38,cabinSand);
   diffuseColor.rgb=mix(diffuseColor.rgb,panelColor,detailPanel);
   vec3 wellColor=mix(${standard?'vec3(.17,.165,.153)':'vec3(.30,.29,.275)'},vec3(.019,.017,.015),cabinSand)*(.48+.52*panelShade);
   diffuseColor.rgb=mix(diffuseColor.rgb,wellColor,detailWell);
   // Neutralize fixture tint while preserving the source's bevels and cavity
   // gradients. A flat replacement color erased the cup lip and lamp reflector.
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.98,1.,1.02)*fixtureShade*.90,detailCup);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.98,1.,1.02)*(.006+fixtureShade*1.35),detailLens);
   vec3 fabricColor=diffuseColor.rgb*(1.0+cabinWeave(vMapUv)*0.16);
   diffuseColor.rgb=mix(diffuseColor.rgb,fabricColor,detailFabric);
   diffuseColor.rgb*=1.0-detailPerforated*leatherMask*grilleHoles*${softSeat?'.16':'.48'};
   float leatherPores=cabinPores(vMapUv);
   float cabinLeatherDetail=leatherMask*(1.0-detailMetal);
   float textileFibers=cabinPores(vMapUv*1.9)-0.5;
   diffuseColor.rgb*=1.0-cabinLeatherDetail*(leatherPores-0.5)*0.055+detailTextile*textileFibers*0.08;
   float cabinGrainHeight=cabinLeatherDetail*(leatherPores-0.5)*0.00007+detailFabric*cabinWeave(vMapUv)*0.00003+detailTextile*textileFibers*0.000035+detailPanel*finishGrain*0.000012;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   normal=cabinRelief(-vViewPosition,normal,cabinGrainHeight);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   roughnessFactor=mix(roughnessFactor,0.30,cabinMetal);
   roughnessFactor=mix(roughnessFactor,mix(0.34,0.42,detailBrushed),detailMetal);
   ${auditedStandard&&!n70Door?'roughnessFactor=mix(roughnessFactor,.48,max(detailGrille,detailInset));roughnessFactor=mix(roughnessFactor,.60,detailVent);':''}
   roughnessFactor=mix(roughnessFactor,mix(.58,.68,cabinSand),max(detailPanel,detailWell));
   roughnessFactor=mix(roughnessFactor,0.65,detailGrille*grilleHoles);
   roughnessFactor=mix(roughnessFactor,.50,detailCup);
   roughnessFactor=mix(roughnessFactor,.28,detailLens);
   ${roofUpholstery?'roughnessFactor=mix(roughnessFactor,.90,roofCloth*(1.-detailMetal)*(1.-detailLens));':''}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
   metalnessFactor=mix(metalnessFactor,0.55,cabinMetal);
   metalnessFactor=mix(metalnessFactor,0.82,detailMetal);
   ${auditedStandard&&!n70Door?'metalnessFactor=mix(metalnessFactor,.45,max(detailGrille,detailInset));metalnessFactor=mix(metalnessFactor,.08,detailVent);':''}
   metalnessFactor=mix(metalnessFactor,mix(.32,.04,cabinSand),max(detailPanel,detailWell));
   metalnessFactor*=1.0-controlInk;
   metalnessFactor*=1.0-detailGrille*grilleHoles;
   metalnessFactor=mix(metalnessFactor,.12,detailCup);
   metalnessFactor=mix(metalnessFactor,.05,detailLens);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
   ${softSeat?`
   ${seatSoftLighting}
   `:`
   reflectedLight.directDiffuse*=mix(0.0,0.25,detailMetal);
   reflectedLight.indirectDiffuse=diffuseColor.rgb*mix(0.80,0.20,detailMetal);
   reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,diffuseColor.rgb*.80,max(detailPanel,detailWell));
   ${controls?'reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,diffuseColor.rgb*mix(0.28,0.55,vCabinControl.w),controlMask);':''}
   reflectedLight.indirectSpecular*=mix(mix(.0625,.18,cabinBlack),.65,detailMetal);
   reflectedLight.directSpecular*=mix(mix(.12,.24,cabinBlack),.45,detailMetal);`}`);
 };
}
