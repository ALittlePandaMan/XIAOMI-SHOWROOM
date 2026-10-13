import * as THREE from 'three';

/** N70's lamp carrier was also made emissive, widening the moving half of the
 * light around the shut line. The LED is the separate 155 part, as on N90. */
export function prepareTailLampBacking(root:THREE.Object3D){
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o.userData.tailLampBackingPrepared)return;
  let source=o.userData.sourceObject;
  for(let p=o.parent;!source&&p;p=p.parent)source=p.userData.sourceObject;
  if(source!=='@ME9x1tr5_153')return;
  const materials=Array.isArray(o.material)?o.material:[o.material];
  let changed=false;
  const next=materials.map(m=>{
   if(!(m instanceof THREE.MeshStandardMaterial)||!String(m.userData.sourceMaterial??m.name).includes('红色灯带'))return m;
   const backing=m.clone();backing.name='尾灯_不发光灯座';
   backing.userData={...backing.userData,sourceMaterial:backing.name,surfaceRole:'tail-lamp-backing'};
   backing.emissive.setScalar(0);backing.emissiveIntensity=0;changed=true;return backing;
  });
  if(changed){o.material=Array.isArray(o.material)?next:next[0];o.userData.tailLampBackingPrepared=true;}
 });
}

/** The front lower lip shares a silver material with unrelated rear trim.
 * Split its existing triangles before material preparation, without moving them. */
export function prepareFrontLowerTrim(root:THREE.Object3D){
 root.updateMatrixWorld(true);
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o.userData.frontLowerTrimPrepared)return;
  let source=o.userData.sourceObject;
  for(let p=o.parent;!source&&p;p=p.parent)source=p.userData.sourceObject;
  if(!['@ME9x1tr5_041','mesh_82_106_nr'].includes(String(source)))return;
  const g=o.geometry,position=g.getAttribute('position'),index=g.index;
  const materials=Array.isArray(o.material)?[...o.material]:[o.material];
  const groups=g.groups.length?g.groups:[{start:0,count:index?.count??position.count,materialIndex:0}];
  const indices:number[]=[],nextGroups:{start:number;count:number;materialIndex:number}[]=[];
  const point=new THREE.Vector3();let selected=0;
  for(const group of groups){
   const keep:number[]=[],front:number[]=[];
   for(let i=group.start;i<group.start+group.count;i+=3){
    const tri=[0,1,2].map(k=>index?index.getX(i+k):i+k);
    const isFront=tri.every(v=>{point.fromBufferAttribute(position,v).applyMatrix4(o.matrixWorld);return point.x< -2&&point.y<.36;});
    (isFront?front:keep).push(...tri);
   }
   if(keep.length){nextGroups.push({start:indices.length,count:keep.length,materialIndex:group.materialIndex??0});indices.push(...keep);}
   if(front.length){
    const m=materials[group.materialIndex??0].clone();m.name='前下饰板_石墨黑';
    m.userData={...m.userData,n70Kind:'surface',surfaceRole:'front-lower-trim'};
    nextGroups.push({start:indices.length,count:front.length,materialIndex:materials.length});
    materials.push(m);indices.push(...front);selected+=front.length/3;
   }
  }
  if(!selected)return;
  const copy=g.clone();copy.setIndex(indices);copy.clearGroups();
  for(const group of nextGroups)copy.addGroup(group.start,group.count,group.materialIndex);
  o.geometry=copy;o.material=materials;o.userData.frontLowerTrimPrepared=selected;
 });
}
