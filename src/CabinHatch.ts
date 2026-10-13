import * as THREE from 'three';
import {geometryIslands} from './GeometryIslands';

/** Move the original floor/cover assembly while keeping the surrounding headliner fixed. */
export class CabinHatch {
 readonly pivot=new THREE.Group();
 readonly mesh:THREE.Mesh;
 private angle=THREE.MathUtils.degToRad(28);
 private progress=0;
 private restPosition=new THREE.Vector3();

 private constructor(source:THREE.Mesh,vertices:number[],bounds:THREE.Box3){
  const original=source.geometry,index=original.index!,selected=new Set(vertices);
  const fixed:number[]=[],moving:number[]=[],remap=new Map(vertices.map((v,i)=>[v,i]));
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
   if(selected.has(a))moving.push(remap.get(a)!,remap.get(b)!,remap.get(c)!);else fixed.push(a,b,c);
  }
  const cover=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(original.attributes)){
   const values=new Float32Array(vertices.length*attribute.itemSize);
   vertices.forEach((v,i)=>{for(let c=0;c<attribute.itemSize;c++)values[i*attribute.itemSize+c]=attribute.getComponent(v,c);});
   cover.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));
  }
  cover.setIndex(moving);
  this.pivot.name='内舱天窗盖板铰链';
  this.pivot.position.set(bounds.max.x,(bounds.min.y+bounds.max.y)/2,0);
  this.restPosition.copy(this.pivot.position);
  cover.translate(-this.pivot.position.x,-this.pivot.position.y,0);
  cover.computeBoundingBox();cover.computeBoundingSphere();
  this.mesh=new THREE.Mesh(cover,source.material);this.mesh.name='内舱天窗原始盖板';
  this.mesh.castShadow=source.castShadow;this.mesh.receiveShadow=source.receiveShadow;
  this.pivot.add(this.mesh);source.add(this.pivot);
  // Clone the fixed geometry so its original glTF resource is not mutated.
  source.geometry=original.clone();source.geometry.setIndex(fixed);
  original.dispose();
 }

 static create(root:THREE.Object3D){
  let hatch:CabinHatch|undefined;
  const candidates:THREE.Mesh[]=[];
  root.traverse(o=>{if(o instanceof THREE.Mesh&&o.parent?.userData.sourceObject==='@ME9x1tr5_011')candidates.push(o);});
  for(const source of candidates){
   const panel=geometryIslands(source.geometry).find(({bounds,vertices})=>{
    const size=bounds.getSize(new THREE.Vector3());
    return vertices.length===52&&bounds.min.x>25&&bounds.max.x<175&&bounds.min.y>175&&size.x>135&&size.z>85&&size.y<8;
   });
   if(panel){hatch=new CabinHatch(source,panel.vertices,panel.bounds);break;}
  }
  return hatch;
 }

 attachFixture(fixture:THREE.Object3D){
  // Keep each part's exported closed position. The front cover, cassette and
  // animated screen all belong to the same hinged floor assembly.
  this.pivot.attach(fixture);
 }

 update(coverProgress:number){
  // The showroom starts this independent motion after the outer roof is open.
  this.progress=THREE.MathUtils.clamp(coverProgress,0,1);
  const q=THREE.MathUtils.smoothstep(this.progress,0,1);
  this.pivot.rotation.z=-this.angle*q;
  // The front edge needs 4 cm of clearance while passing the sloping canvas.
  // Both end positions retain the original fit; the whole assembly follows it.
  this.pivot.position.copy(this.restPosition);
  this.pivot.position.x+=4*Math.sin(Math.PI*this.progress)**2;
  this.pivot.updateMatrix();
 }

 get allowsProjector(){return Math.abs(this.pivot.rotation.z)<1e-6}

 getDiagnostics(){return {progress:this.progress,angleDegrees:-THREE.MathUtils.radToDeg(this.pivot.rotation.z),vertices:this.mesh.geometry.attributes.position.count};}
}
