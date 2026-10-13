import * as THREE from 'three';
export interface VehicleDimensions {length:number;width:number;height:number}
const explorerDimensions={length:5285,width:1998,height:1925};

// Public showroom markers are flat strokes on horizontal/vertical planes,
// with outward chevrons and gaps for labels, rather than 3D cone arrows.
export function createDimensionMarkers(size:VehicleDimensions=explorerDimensions){
 const group=new THREE.Group();group.name='Vehicle dimension strokes';
 const material=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.87,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
 const positions:number[]=[],indices:number[]=[];
 const quad=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3)=>{
  const i=positions.length/3;positions.push(...a,...b,...c,...d);indices.push(i,i+1,i+2,i,i+2,i+3);
 };
 const stroke=(a:THREE.Vector3,b:THREE.Vector3,normal:THREE.Vector3,width:number)=>{
  const along=b.clone().sub(a).normalize(),side=new THREE.Vector3().crossVectors(normal,along).multiplyScalar(width/2);
  quad(a.clone().add(side),a.clone().sub(side),b.clone().sub(side),b.clone().add(side));
  // Round caps stay in the same plane, retaining the reference's foreshortening.
  for(const point of [a,b]){
   const center=positions.length/3;positions.push(...point);
   for(let n=0;n<=12;n++){const angle=n/12*Math.PI*2;positions.push(...point.clone().addScaledVector(along,Math.cos(angle)*width/2).addScaledVector(side,Math.sin(angle)));}
   for(let n=0;n<12;n++)indices.push(center,center+n+1,center+n+2);
  }
 };
 const dimension=(a:THREE.Vector3,b:THREE.Vector3,normal:THREE.Vector3,gap:number)=>{
  const length=a.distanceTo(b),direction=b.clone().sub(a).normalize(),side=new THREE.Vector3().crossVectors(normal,direction);
  for(const [tip,inward] of [[a,direction],[b,direction.clone().negate()]] as const){
   for(const sign of [-1,1])stroke(tip,tip.clone().addScaledVector(inward,.048).addScaledVector(side,sign*.030),normal,.020);
   // Mirror the dash layout at both ends, leaving a clean gap behind each head.
   for(let distance=.15;distance<(length-gap)/2;distance+=.16){
    const end=Math.min(distance+.052,(length-gap)/2);
    if(end>distance)stroke(tip.clone().addScaledVector(inward,distance),tip.clone().addScaledVector(inward,end),normal,.018);
   }
  }
 };
 const v=(x:number,y:number,z:number)=>new THREE.Vector3(x*size.length/5285,y*size.height/1925,z*size.width/1998),ground=new THREE.Vector3(0,1,0),vertical=new THREE.Vector3(1,0,0);
 dimension(v(-2.52,.016,1.895),v(2.52,.016,1.895),ground,.83);
 dimension(v(-3.525,.016,-.894),v(-3.525,.016,.894),ground,.25);
 dimension(v(2.625,.055,1.895),v(2.625,1.987,1.895),vertical,.24);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
 const strokes=new THREE.Mesh(geometry,material);strokes.name='Flat dimension arrows and dashes';group.add(strokes);
 // Thin extension rules fade toward the vehicle, like the reference graphic.
 const extend=(a:THREE.Vector3,b:THREE.Vector3,normal:THREE.Vector3)=>{
  const side=new THREE.Vector3().crossVectors(normal,b.clone().sub(a).normalize()).multiplyScalar(.005);
  const p=[a.clone().add(side),a.clone().sub(side),b.clone().sub(side),b.clone().add(side)];
  const geo=new THREE.BufferGeometry().setFromPoints(p);geo.setIndex([0,1,2,0,2,3]);geo.setAttribute('fade',new THREE.Float32BufferAttribute([0,0,1,1],1));
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,uniforms:{ink:{value:new THREE.Color('#ffffff')}},
   vertexShader:'attribute float fade; varying float opacity; void main(){opacity=fade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
   fragmentShader:`uniform vec3 ink;varying float opacity;
    void main(){gl_FragColor=vec4(ink,opacity*.8);
     #include <colorspace_fragment>
    }`,
  });
  group.add(new THREE.Mesh(geo,mat));
 };
 for(const x of [-2.60,2.60])extend(v(x,.016,1.0),v(x,.016,1.965),ground);
 for(const z of [-.972,.972])extend(v(-2.615,.016,z),v(-3.586,.016,z),ground);
 extend(v(2.625,2.033,.975),v(2.625,2.033,1.946),vertical);
 return group;
}

export const dimensionLabels=[
 {label:'5285mm',point:[0,.116,1.895]},
 {label:'1998mm',point:[-3.525,.116,0]},
 {label:'1925mm',point:[2.625,1.021,1.895]},
] as const;
export const labelsForDimensions=(size:VehicleDimensions)=>dimensionLabels.map((entry,i)=>({label:`${[size.length,size.width,size.height][i]}mm`,point:[entry.point[0]*size.length/5285,entry.point[1]*size.height/1925,entry.point[2]*size.width/1998] as [number,number,number]}));
