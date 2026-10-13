import * as THREE from 'three';
import {geometryIslands} from './GeometryIslands';
import roundedCover from './generated/cabin-cover-rounded.json';

/** Extract the original front cover and repair the baked shadow under its old
 * projector mount. The caller attaches this part to the moving hatch assembly. */
export function repairCabinCeilingTrim(root:THREE.Object3D){
 const candidates:THREE.Mesh[]=[];
 root.traverse(o=>{if(o instanceof THREE.Mesh&&o.parent?.userData.sourceObject==='@ME9x1tr5_011')candidates.push(o)});
 for(const source of candidates){
  if(!(source.material instanceof THREE.MeshStandardMaterial))continue;
  const islands=geometryIslands(source.geometry);
  const part=islands.find(({vertices,bounds})=>{
   const size=bounds.getSize(new THREE.Vector3());
   return vertices.length===160&&bounds.min.x>-24&&bounds.max.x<37&&bounds.min.y>178&&bounds.max.y<182&&size.x>57&&size.z>82;
  });
  if(!part)continue;
  // The pull handle is a separate island in the fixed headliner. It must travel
  // with this cover, while retaining its own unmodified upholstery material.
  const handlePart=islands.find(({vertices,bounds})=>vertices.length===114&&bounds.min.x> -20&&bounds.max.x< -13&&bounds.min.y>179&&bounds.max.y<181&&bounds.min.z> -8&&bounds.max.z<8);
  const handleVertices=handlePart?.vertices??[],handleSelected=new Set(handleVertices);
  const original=source.geometry,index=original.index!,selected=new Set(part.vertices);
  const fixed:number[]=[];
  const handleRemap=new Map(handleVertices.map((v,i)=>[v,i])),handleIndices:number[]=[];
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
   if(selected.has(a))continue;
   if(handleSelected.has(a))handleIndices.push(handleRemap.get(a)!,handleRemap.get(b)!,handleRemap.get(c)!);
   else fixed.push(a,b,c);
  }
  // This is the original cover with its perimeter rounded in the editable
  // Blender scene. Share that mesh so browser and native geometry stay in sync.
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(roundedCover.position,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(roundedCover.normal,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(roundedCover.uv,2));
  geometry.setIndex(roundedCover.index);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const handleGeometry=new THREE.BufferGeometry();
  if(handlePart){
   for(const [name,attribute] of Object.entries(original.attributes)){
    const values=new Float32Array(handleVertices.length*attribute.itemSize);
    handleVertices.forEach((v,i)=>{for(let c=0;c<attribute.itemSize;c++)values[i*attribute.itemSize+c]=attribute.getComponent(v,c)});
    handleGeometry.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));
   }
   handleGeometry.setIndex(handleIndices);handleGeometry.computeBoundingBox();handleGeometry.computeBoundingSphere();
  }
  // Partition the existing triangles, rather than overlaying a coplanar patch.
  source.geometry=original.clone();source.geometry.setIndex(fixed);original.dispose();
  const base=source.material,material=base.clone(),compile=base.onBeforeCompile;
  material.name=base.name+'_前盖板边缘修复';
  material.onBeforeCompile=(shader,renderer)=>{
   compile.call(material,shader,renderer);
   shader.fragmentShader=shader.fragmentShader.replace('vec2 px=vMapUv*1024.0;',`vec2 px=vMapUv*1024.0;
    // Only this cover uses the repair. Sample adjacent authored upholstery and
    // retain its lateral shading, edge bevels and the rest of the original atlas.
    float bakedLip=1.0-smoothstep(156.0,194.0,px.x);
    vec3 cleanLip=cabinSample(map,vec2(194.0/1024.0,vMapUv.y)).rgb;
    diffuseColor.rgb=mix(diffuseColor.rgb,cleanLip,bakedLip);`);
   shader.fragmentShader=shader.fragmentShader.replace('float maskMax=',`cabinMaskColor=mix(cabinMaskColor,texture2D(cabinBaseMap,vec2(194.0/1024.0,vMapUv.y)).rgb,bakedLip*cabinSand);
    float maskMax=`);
  };
  material.customProgramCacheKey=()=>`${base.customProgramCacheKey()}:fixed-ceiling-lip-v1`;
  const mesh=new THREE.Mesh(geometry,material);mesh.name='内舱前部活动盖板';
  mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
  source.add(mesh);
  if(handlePart){
   const handle=new THREE.Mesh(handleGeometry,base);handle.name='内舱前盖板拉手';
   handle.castShadow=source.castShadow;handle.receiveShadow=source.receiveShadow;
   // Both geometries are in the source headliner's coordinates.
   mesh.add(handle);
  }else handleGeometry.dispose();
  return mesh;
 }
}
