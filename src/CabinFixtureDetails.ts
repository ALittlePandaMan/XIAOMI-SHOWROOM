import * as THREE from 'three';

/** The reused N90 lamp housing extends 22 mm through the rebuilt lining,
 * hiding its silver lip. Fit only these two housings to a 2 mm inset profile
 * immediately below their existing lens plane; keep their footprint and UVs. */
export function prepareCabinFixtureGeometry(root:THREE.Object3D){
 root.updateMatrixWorld(true);
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o.userData.cabinFixtureClearance)return;
  const materials=Array.isArray(o.material)?o.material:[o.material];
  const lampSlots=new Set(materials.flatMap((m,i)=>Number(m.userData.n90Atlas)===10021?[i]:[]));
  const uv=o.geometry.getAttribute('uv');
  if(!lampSlots.size||!uv)return;
  const selected=new Set<number>(),index=o.geometry.index;
  const groups=o.geometry.groups.length?o.geometry.groups:[{start:0,count:index?.count??uv.count,materialIndex:0}];
  for(const group of groups){
   if(!lampSlots.has(group.materialIndex??0))continue;
   for(let i=group.start;i<group.start+group.count;i++){
    const v=index?index.getX(i):i,x=uv.getX(v)*1024,y=uv.getY(v)*1024;
    if(x>677&&x<719&&y>384&&y<465)selected.add(v);
   }
  }
  if(!selected.size)return;
  const geometry=o.geometry.clone(),position=geometry.getAttribute('position');
  const inverse=o.matrixWorld.clone().invert(),point=new THREE.Vector3();
  let low=Infinity,high=-Infinity;
  for(const i of selected){point.fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld);low=Math.min(low,point.y);high=Math.max(high,point.y);}
  for(const i of selected){
   point.fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld);
   point.y=low-.0023+(point.y-low)/Math.max(high-low,.0001)*.002;
   point.applyMatrix4(inverse);position.setXYZ(i,point.x,point.y,point.z);
  }
  position.needsUpdate=true;
  const originalNormals=geometry.getAttribute('normal')?.clone();
  geometry.computeVertexNormals();
  const normals=geometry.getAttribute('normal');
  if(originalNormals)for(let i=0;i<normals.count;i++)if(!selected.has(i))normals.setXYZ(i,originalNormals.getX(i),originalNormals.getY(i),originalNormals.getZ(i));
  normals.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
  o.geometry=geometry;o.userData.cabinFixtureClearance=true;
 });
}

/** Finishes on the source UV islands, shared by N70 and ordinary N90 Max.
 * These masks separate hardware from upholstery without repainting the atlas. */
export function cabinFixtureRegions(name:string,atlas:number){
 if(name.includes('中央扶手')&&[5,6].includes(atlas))return `
  // Rear cup walls and floors occupy different islands from the front wells.
  detailCup=max(cabinBox(px,vec4(6.,4.,207.,88.)),cabinBox(px,vec4(287.,4.,488.,86.)));
  detailCup=max(detailCup,cabinCircle(px,vec2(714.,58.),30.));
  detailCup=max(detailCup,cabinCircle(px,vec2(812.,685.),28.));
  // Silver lip and spring fingers retain a separate, neutral finish in all trims.
  float cupHardware=max(cabinCircle(px,vec2(245.5,45.5),35.),cabinCircle(px,vec2(992.,233.),35.));
  cupHardware=max(cupHardware,cabinBox(px,vec4(725.,551.,831.,655.)));
  cupHardware=max(cupHardware,cabinBox(px,vec4(978.,576.,1024.,711.)));
  cupHardware=max(cupHardware,cabinBox(px,vec4(850.,552.,891.,711.)));
  // Only the bezel: the touch display and its printed controls stay authored.
  float rearBezel=cabinRoundRect(px,vec2(532.,873.),vec2(68.,37.),9.)*(1.-cabinRoundRect(px,vec2(532.,873.),vec2(60.,28.5),5.));
  detailMetal=max(detailMetal,max(cupHardware,rearBezel));
 `;
 if(name.includes('顶棚')&&[21,10021].includes(atlas))return `
  // The shared roof lamp has three rounded-square lens islands. Their dark
  // tint is intentional; preserve a readable smoked lens instead of cloth.
  detailLens=max(cabinRoundRect(px,vec2(698.,405.),vec2(20.,21.),9.),cabinRoundRect(px,vec2(739.,405.),vec2(20.,21.),9.));
  detailLens=max(detailLens,cabinRoundRect(px,vec2(698.,444.),vec2(20.,21.),9.));
  float lampGlass=max(cabinRoundRect(px,vec2(698.3,404.6),vec2(16.3,16.3),12.3),cabinRoundRect(px,vec2(739.,404.6),vec2(16.3,16.3),12.3));
  lampGlass=max(lampGlass,cabinRoundRect(px,vec2(698.3,444.),vec2(16.3,16.3),12.3));
  detailFixtureMetal=detailLens*(1.-lampGlass);
  detailMetal=max(detailMetal,detailFixtureMetal);
  detailLens*=lampGlass;
 `;
 if(name.includes('顶棚')&&atlas===15)return `
  // Two mirrored overhead control strips: lens, switch and cloth surround.
  float roofLens=max(cabinRoundRect(px,vec2(470.,981.),vec2(10.,7.),3.),cabinRoundRect(px,vec2(470.,1009.),vec2(10.,7.),3.));
  detailLens=max(detailLens,roofLens);
  fixtureShade=.014+.045*pow(clamp(fixtureShade/.20,0.,2.),.75);
  float roofFrame=max(cabinRoundRect(px,vec2(470.,981.),vec2(13.,10.),4.),cabinRoundRect(px,vec2(470.,1009.),vec2(13.,10.),4.));
  detailMetal=max(detailMetal,roofFrame*(1.-roofLens));
 `;
 return '';
}
