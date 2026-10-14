import * as THREE from 'three';

/** Area-weighted normals for the original cabin meshes. UV seams may duplicate
 * a vertex: weld normals only when both position and authored smoothing agree.
 * No positions, indices, UVs, hard edges or animated meshes are changed. */
export function refineCabinNormals(root:THREE.Object3D){
 const done=new Set<THREE.BufferGeometry>();
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||done.has(o.geometry)||o.geometry.morphAttributes.position?.length)return;
  const materials=Array.isArray(o.material)?o.material:[o.material];
  if(!materials.some(m=>/内饰_(前门板|后门板|仪表台|中央扶手|座舱)$/.test(m.name)||
   (m.userData.cabinSeat===true&&m.userData.cabinSurface==='leather')))return;
  const g=o.geometry,p=g.attributes.position,n=g.attributes.normal,index=g.index;
  if(!n||!index)return;done.add(g);
  const sums=new Float64Array(p.count*3),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<index.count;i+=3){
   const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
   a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);
   b.sub(a).cross(c.sub(a));
   for(const id of ids){sums[id*3]+=b.x;sums[id*3+1]+=b.y;sums[id*3+2]+=b.z;}
  }
  const welded=new Map<string,number[]>();
  for(let i=0;i<p.count;i++){
   const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e5)).join(',');
   const ids=welded.get(key);if(ids)ids.push(i);else welded.set(key,[i]);
  }
  const normal=new Float32Array(p.count*3);
  for(const ids of welded.values())for(const i of ids){
   a.fromBufferAttribute(n,i);b.set(0,0,0);
   for(const j of ids){c.fromBufferAttribute(n,j);if(a.dot(c)>.8)b.add(c.fromArray(sums,j*3));}
   if(b.lengthSq()<1e-16||b.normalize().dot(a)<.65)b.copy(a);
   b.toArray(normal,i*3);
  }
  g.setAttribute('normal',new THREE.BufferAttribute(normal,3));
 });
}
