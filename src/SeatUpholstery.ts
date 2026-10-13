/** Remove broad baked occlusion inside the original Explorer quilt islands.
 * Sample only within each island so black atlas padding cannot brighten its
 * edges. The full-resolution sample, stitching and perforation remain intact. */
export const seatQuiltLighting=`
float seatQuiltExposure(sampler2D atlas,vec2 px){
 vec4 region=vec4(0.);
 if(cabinBox(px,vec4(526.,227.,675.,466.))>.5)region=vec4(526.,227.,675.,466.);
 else if(cabinBox(px,vec4(843.,451.,1003.,605.))>.5)region=vec4(843.,451.,1003.,605.);
 else if(cabinBox(px,vec4(522.,597.,680.,680.))>.5)region=vec4(522.,597.,680.,680.);
 else if(cabinBox(px,vec4(790.,857.,969.,985.))>.5)region=vec4(790.,857.,969.,985.);
 else return 1.;
 vec2 low=region.xy+vec2(22.,12.),high=region.zw-vec2(22.,12.);
 vec3 broad=vec3(0.);
 for(int y=0;y<4;y++)for(int x=0;x<4;x++){
  vec2 q=clamp(px+(vec2(float(x),float(y))-1.5)*20.,low,high);
  broad+=textureLod(atlas,q/1024.,3.).rgb;
 }
 broad/=16.;
 vec3 reference=textureLod(atlas,vec2(598.,290.)/1024.,4.).rgb;
 float gain=clamp(pow(dot(reference,vec3(.2126,.7152,.0722))/max(dot(broad,vec3(.2126,.7152,.0722)),.003),.85),.94,2.2);
 vec2 edge=min(px-region.xy,region.zw-px);
 return mix(1.,gain,smoothstep(0.,4.,min(edge.x,edge.y)));
}

// The leg-support atlas includes a directional bake that falls almost to black
// on its turned-down face. Estimate that broad band across the complete row,
// retaining the full-resolution quilting and the darker underside transition.
float seatPadExposure(sampler2D atlas,vec2 px){
 if(cabinBox(px,vec4(789.,857.,970.,987.))<.5)return seatQuiltExposure(atlas,px);
 vec3 band=vec3(0.);
 for(int x=0;x<8;x++)for(int y=0;y<3;y++){
  float u=mix(804.,954.,(float(x)+.5)/8.);
  float dy=(float(y)-1.)*4.;
  band+=textureLod(atlas,vec2(u,clamp(px.y+dy,864.,979.))/1024.,2.).rgb;
 }
 band/=24.;
 vec3 reference=textureLod(atlas,vec2(598.,290.)/1024.,4.).rgb;
 float ratio=dot(reference,vec3(.2126,.7152,.0722))/max(dot(band,vec3(.2126,.7152,.0722)),.003);
 return clamp(pow(ratio,.88),.94,6.5);
}
`;
