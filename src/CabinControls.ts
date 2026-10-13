import * as THREE from 'three';
import {geometryIslands} from './GeometryIslands';

// Original connected parts, in the source model's centimetres. Do not put a
// second surface over the switches: that would reintroduce coplanar flicker.
const doors=new Map([
 ['@ME9x1tr5_057',new Map([[146,1],[255,2],[84,4],[174,3]])],
 ['@ME9x1tr5_082',new Map([[155,1],[219,2],[172,3]])],
 ['@ME9x1tr5_104',new Map([[150,1],[346,2],[176,3],[48,4]])],
 ['@ME9x1tr5_121',new Map([[150,1],[346,2],[176,3],[48,4]])],
]);

export function prepareCabinControls(root:THREE.Object3D){
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  const materials=Array.isArray(o.material)?o.material:[o.material];
  if(!materials.some(m=>/内饰_(前门板|后门板|方向盘)$/.test(m.name)||m.userData.cabinPart==='方向盘'))return;
  const g=o.geometry,p=g.attributes.position,n=g.attributes.normal;
  const data=new Float32Array(p.count*4),types=doors.get(o.userData.sourceObject);
  let count=0;
  if(types)for(const part of geometryIslands(g)){
   const {min,max}=part.bounds,kind=types.get(part.vertices.length);
   const center=part.bounds.getCenter(new THREE.Vector3());
   if(!kind||min.y<96||max.y>101||Math.abs(center.x)>65||Math.abs(center.z)<70||Math.abs(center.z)>81)continue;
   for(const i of part.vertices){
    // Physical coordinates retain the same engraving size on each button.
    data[i*4]=(p.getZ(i)-center.z)*Math.sign(center.z);
    data[i*4+1]=p.getX(i)-center.x;
    data[i*4+2]=kind;
    data[i*4+3]=kind===2?THREE.MathUtils.smoothstep(p.getY(i),min.y+(max.y-min.y)*.55,max.y-(max.y-min.y)*.12):THREE.MathUtils.smoothstep(n.getY(i),.35,.8);
   }
   count++;
  }
  const source=String(o.userData.sourceObject),steering=['@ME9x1tr5_019','@ME9x1tr5_027','mesh_60_17_nr'].includes(source);
  if(steering)for(const part of geometryIslands(g)){
   // The shared N90 controls were exported in metres; the N70 has the same
   // switch tooling 14.7 cm forward. Classify in the donor's coordinate system.
   const scale=source==='mesh_60_17_nr'?100:1,offset=source==='@ME9x1tr5_027'?-14.7:0;
   const min=part.bounds.min.clone().multiplyScalar(scale),max=part.bounds.max.clone().multiplyScalar(scale);
   min.x+=offset;max.x+=offset;const size=max.clone().sub(min);
   // Front-side original switch bodies and embossed symbols. The rear spokes,
   // leather, rim and stitch geometry have separate bounds and stay authored.
   if(min.x<-65||max.x>-60||min.y<112.8||max.y>116.8)continue;
   const body=[112,151,64].includes(part.vertices.length)&&size.z>1.7;
   const glyph=part.vertices.length<100&&size.x<.5&&size.y<.55&&size.z<.65;
   if(!body&&!glyph)continue;
   for(const i of part.vertices){data[i*4+2]=body?5:6;data[i*4+3]=1;}
   count++;
  }
  g.setAttribute('cabinControl',new THREE.BufferAttribute(data,4));
  if(count)o.userData.cabinControlParts=count;
 });
}

export const controlGlyphFunctions=`
float controlStroke(vec2 p,vec2 a,vec2 b){
 vec2 pa=p-a,ba=b-a;
 float d=length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0));
 float aa=max(fwidth(d)*0.7,0.003);
 return 1.0-smoothstep(0.027-aa,0.027+aa,d);
}
float controlWindow(vec2 p){
 float a=controlStroke(p,vec2(-.40,-.28),vec2(.40,-.28));
 a=max(a,controlStroke(p,vec2(.40,-.28),vec2(.31,.28)));
 a=max(a,controlStroke(p,vec2(.31,.28),vec2(-.28,.28)));
 a=max(a,controlStroke(p,vec2(-.28,.28),vec2(-.40,-.28)));
 return max(a,controlStroke(p,vec2(-.33,.05),vec2(.34,.05)));
}
`;
