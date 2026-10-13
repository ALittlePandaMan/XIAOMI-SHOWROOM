/** Audited regions in the original 1024 px UV atlases. Replace baked metal
 * highlights with a surface finish; never cover the latch recess or switch icons.
 * Coordinates follow glTF image UVs (origin at the top of the image). */
export function cabinSurfaceRegions(name:string,auditedStandard=false,atlas=0){
 if(name.includes('后门板'))return `
  detailMetal=max(cabinBox(px,vec4(127.,180.,265.,232.)),cabinBox(px,vec4(288.,180.,363.,231.)));
  detailMetal=max(detailMetal,cabinBox(px,vec4(602.,865.,982.,895.)));
  detailGrille=cabinRoundRect(px,vec2(232.,204.5),vec2(28.5,17.5),5.0);
  detailGrille=max(detailGrille,cabinCircle(px,vec2(408.,642.),38.0));
  detailFabric=cabinBox(px,vec4(88.,650.,368.,928.));
 `;
 if(name.includes('前门板'))return `
  detailMetal=max(cabinBox(px,vec4(291.,110.,444.,164.)),cabinBox(px,vec4(393.,260.,477.,313.)));
  detailMetal=max(detailMetal,cabinBox(px,vec4(597.,638.,985.,662.)));
  detailGrille=cabinRoundRect(px,vec2(404.5,136.5),vec2(32.,18.5),6.0);
  detailGrille=max(detailGrille,cabinCircle(px,vec2(169.,625.),42.0));
  detailFabric=cabinBox(px,vec4(230.,586.,522.,891.));
 `;
 if(name.includes('中央扶手'))return `
  detailMetal=max(cabinBox(px,vec4(7.,90.,181.,265.)),cabinBox(px,vec4(345.,93.,511.,264.)));
  detailMetal=max(detailMetal,cabinBox(px,vec4(359.,273.,527.,294.)));
  detailMetal=max(detailMetal,cabinBox(px,vec4(489.,17.,682.,92.)));
  detailMetal=max(detailMetal,cabinBox(px,vec4(775.,107.,964.,195.)));
  detailMetal=max(detailMetal,cabinBox(px,vec4(209.,9.,283.,84.)));
  detailMetal=max(detailMetal,cabinBox(px,vec4(939.,194.,1017.,274.)));
  detailBrushed=detailMetal;
  detailPanel=max(cabinBox(px,vec4(7.,90.,181.,265.)),cabinBox(px,vec4(345.,93.,511.,264.)));
  detailWell=max(cabinBox(px,vec4(489.,17.,682.,92.)),cabinBox(px,vec4(775.,107.,964.,195.)));
  detailWell=max(detailWell,cabinCircle(px,vec2(778.,57.),31.));
  detailWell=max(detailWell,cabinCircle(px,vec2(992.,147.),28.));
 `;
 if(name.includes('仪表台'))return `
  detailMetal=max(cabinBox(px,vec4(821.,806.,925.,1024.)),cabinBox(px,vec4(932.,822.,1017.,877.)));
  detailBrushed=detailMetal;
  detailPanel=max(cabinBox(px,vec4(821.,806.,925.,1024.)),cabinBox(px,vec4(932.,822.,1017.,877.)));
  detailPanel=max(detailPanel,cabinBox(px,vec4(373.,52.,459.,130.)));
  detailPanel=max(detailPanel,cabinBox(px,vec4(661.,569.,750.,586.)));
 `;
 if(!auditedStandard&&name.endsWith('内饰_座舱'))return 'detailMetal=cabinBox(px,vec4(637.,695.,660.,766.));';
 if(auditedStandard&&name.includes('内饰_座舱'))return `
  detailMetal=cabinRoundRect(px,vec2(648.5,730.5),vec2(11.5,35.5),3.);
  detailInset=cabinRoundRect(px,vec2(648.5,730.5),vec2(9.5,33.5),2.);
  detailVent=cabinRoundRect(px,vec2(648.,722.5),vec2(5.5,19.5),2.);
  detailVent=max(detailVent,cabinRoundRect(px,vec2(648.,753.),vec2(6.,6.),2.));
  detailGrille=cabinRoundRect(px,vec2(648.,753.),vec2(5.,5.),2.);
 `;
 if(name.includes('前排座椅'))return `
  ${auditedStandard&&atlas===19?`
  detailMetal=cabinRoundRect(px,vec2(414.,960.),vec2(16.,18.),5.);
  detailInset=cabinRoundRect(px,vec2(415.,960.),vec2(11.5,13.5),3.);
  `:''}
  detailPerforated=max(cabinBox(px,vec4(526.,227.,675.,466.)),cabinBox(px,vec4(843.,451.,1003.,605.)));
  detailPerforated=max(detailPerforated,cabinBox(px,vec4(522.,597.,680.,680.)));
  detailPerforated=max(detailPerforated,cabinBox(px,vec4(790.,857.,969.,985.)));
 `;
 if(name.includes('后排座椅'))return `
  detailFabric=max(cabinBox(px,vec4(518.,14.,878.,397.)),cabinBox(px,vec4(543.,449.,787.,757.)));
  detailFabric=max(detailFabric,cabinBox(px,vec4(367.,794.,545.,1024.)));
 `;
 if(name.includes('安全带'))return `
  detailFabric=cabinBox(px,vec4(20.,0.,385.,1024.));
 `;
 if(name.includes('顶棚与屏幕'))return `
  // Only warm upholstery: the same atlas also contains a projection image.
  detailTextile=leatherMask;
 `;
 return '';
}

/** N70 uses a different door atlas. Share the Explorer's metal/perforation
 * shader, but keep the masks on the N70 speaker islands and out of latch holes. */
export function n70DoorSurfaceRegions(atlas:number){
 // N70 vent frame, vanes and recess now have distinct native materials.
 // The upper plate is solid metal; it must not be shaded as a speaker grille.
 if(atlas===18)return '';
 if(atlas===15)return `
  float upperPlate=cabinRoundRect(px,vec2(276.,556.),vec2(74.,27.),10.);
  float lowerPlate=cabinRoundRect(px,vec2(276.,619.),vec2(74.,25.),9.);
  float latchHoles=max(cabinRoundRect(px,vec2(308.,555.),vec2(30.,16.),6.),cabinRoundRect(px,vec2(308.,618.),vec2(30.,16.),6.));
  detailMetal=max(upperPlate,lowerPlate)*(1.-latchHoles);
  detailGrille=max(cabinRoundRect(px,vec2(239.,556.),vec2(31.,18.),5.),cabinRoundRect(px,vec2(239.,619.),vec2(31.,17.),5.));
  detailGrille=max(detailGrille,cabinCircle(px,vec2(150.,594.),43.));
  detailMetal=max(detailMetal,cabinCircle(px,vec2(150.,594.),49.));
  detailMetal=max(detailMetal,cabinBox(px,vec4(563.,897.,896.,907.)));
  detailFabric=cabinBox(px,vec4(196.,667.,434.,900.));
 `;
 if(atlas===12)return `
  float upperPlate=cabinRoundRect(px,vec2(132.,767.),vec2(77.,27.),9.);
  float lowerPlate=cabinRoundRect(px,vec2(133.,832.),vec2(79.,27.),9.);
  float latchHoles=max(cabinRoundRect(px,vec2(165.,767.),vec2(31.,16.),6.),cabinRoundRect(px,vec2(167.,831.),vec2(31.,16.),6.));
  detailMetal=max(upperPlate,lowerPlate)*(1.-latchHoles);
  detailGrille=max(cabinRoundRect(px,vec2(92.,768.),vec2(31.,18.),5.),cabinRoundRect(px,vec2(94.,832.),vec2(31.,18.),5.));
  detailGrille=max(detailGrille,cabinCircle(px,vec2(414.,790.),40.));
  detailMetal=max(detailMetal,cabinCircle(px,vec2(414.,790.),46.));
  detailFabric=cabinBox(px,vec4(693.,694.,934.,889.));
 `;
 return '';
}

// Filter the repeated detail analytically. Subpixel pores converge to their mean
// instead of flickering when looking around or zooming out.
export const cabinDetailFunctions=`
vec3 cabinRelief(vec3 p,vec3 n,float height){
 vec3 dx=dFdx(p),dy=dFdy(p);
 vec3 r1=cross(dy,n),r2=cross(n,dx);
 float det=dot(dx,r1);
 vec3 grad=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
 return normalize(abs(det)*n-grad+1e-12*n);
}
float cabinBox(vec2 p,vec4 b){return step(b.x,p.x)*step(b.y,p.y)*step(p.x,b.z)*step(p.y,b.w);}
float cabinRoundRect(vec2 p,vec2 c,vec2 h,float r){
 vec2 q=abs(p-c)-h+r;
 float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;
 return 1.0-smoothstep(-max(fwidth(d),0.25),max(fwidth(d),0.25),d);
}
float cabinCircle(vec2 p,vec2 c,float r){float d=length(p-c)-r;return 1.0-smoothstep(-max(fwidth(d),0.25),max(fwidth(d),0.25),d);}
float cabinPores(vec2 uv){
 vec2 grid=uv*2600.0;
 vec2 cell=floor(grid),f=fract(grid);f=f*f*(3.0-2.0*f);
 vec4 n=fract(sin(vec4(dot(cell,vec2(127.1,311.7)),dot(cell+vec2(1,0),vec2(127.1,311.7)),dot(cell+vec2(0,1),vec2(127.1,311.7)),dot(cell+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
 float footprint=max(length(dFdx(grid)),length(dFdy(grid)));
 return mix(mix(mix(n.x,n.y,f.x),mix(n.z,n.w,f.x),f.y),0.5,smoothstep(0.5,1.5,footprint));
}
float cabinGrillePattern(vec2 uv){
 vec2 grid=uv*900.0;
 grid.x+=mod(floor(grid.y),2.0)*0.5;
 float d=length(fract(grid)-0.5);
 float footprint=max(length(dFdx(grid)),length(dFdy(grid)));
 float holes=1.0-smoothstep(0.28-max(footprint*0.45,0.015),0.28+max(footprint*0.45,0.015),d);
 return mix(holes,0.2463,smoothstep(0.65,1.5,footprint));
}
float cabinBrushing(vec2 uv){
 float x=uv.x*6000.0;
 float attenuation=1.0-smoothstep(0.25,0.65,fwidth(x));
 return sin(x*6.2831853)*attenuation;
}
float cabinFinishNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
 return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y)-.5;
}
float cabinFinishGrain(vec2 uv){
 // Long, irregular fibres with filtered fine scratches, not repeated stripes.
 vec2 coarse=uv*vec2(1400.,12.),fine=uv*vec2(7500.,80.);
 float fade=1.-smoothstep(.35,1.2,max(length(dFdx(fine)),length(dFdy(fine))));
 float coarseFade=1.-smoothstep(.5,1.5,max(length(dFdx(coarse)),length(dFdy(coarse))));
 return cabinFinishNoise(coarse)*.9*coarseFade+cabinFinishNoise(fine)*.45*fade;
}
float cabinWeave(vec2 uv){
 vec2 g=uv*1300.0;
 float f=max(length(dFdx(g)),length(dFdy(g)));
 float direction=mix(-1.0,1.0,step(0.5,fract(floor(g.y/12.0)*0.5)));
 return cos((g.x+g.y*direction)*6.2831853)*(1.0-smoothstep(0.25,0.8,f));
}
`;
