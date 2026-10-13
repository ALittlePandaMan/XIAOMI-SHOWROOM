import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import * as THREE from 'three';
import {prepareFrontLowerTrim,prepareTailLampBacking} from '../src/ExteriorDetailMaterials.ts';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),results=[];
for(const model of ['n70','n90-standard']){
 const doc=await io.read(`public/models/${model}/car.glb`),root=new THREE.Group(),records=[];
 for(const n of doc.getRoot().listNodes())for(const p of n.getMesh()?.listPrimitives()??[]){
  const g=new THREE.BufferGeometry();
  for(const [source,target,size] of [['POSITION','position',3],['NORMAL','normal',3],['TEXCOORD_0','uv',2]]){const a=p.getAttribute(source);if(a)g.setAttribute(target,new THREE.BufferAttribute(new Float32Array(a.getArray()),size));}
  if(p.getIndices())g.setIndex(new THREE.BufferAttribute(new Uint32Array(p.getIndices().getArray()),1));
  const material=new THREE.MeshStandardMaterial();material.userData={...p.getMaterial()?.getExtras()};material.name=p.getMaterial()?.getName();
  const mesh=new THREE.Mesh(g,material);mesh.userData={...n.getExtras()};mesh.matrix.fromArray(n.getWorldMatrix());mesh.matrixAutoUpdate=false;root.add(mesh);records.push({mesh,g,material});
 }
 prepareFrontLowerTrim(root);let faces=0,parts=0;
 for(const {mesh,g,material}of records){
  if(!mesh.userData.frontLowerTrimPrepared){assert.equal(mesh.geometry,g);assert.equal(mesh.material,material);continue;}
  faces+=mesh.userData.frontLowerTrimPrepared;parts++;
  for(const key of Object.keys(g.attributes))assert.deepEqual(mesh.geometry.getAttribute(key).array,g.getAttribute(key).array);
  assert.equal(mesh.geometry.index.count,g.index.count);
  assert.deepEqual([...mesh.geometry.index.array].sort((a,b)=>a-b),[...g.index.array].sort((a,b)=>a-b));
  for(const group of mesh.geometry.groups)if(mesh.material[group.materialIndex].userData.surfaceRole==='front-lower-trim')for(let i=group.start;i<group.start+group.count;i++){
   const v=new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'),mesh.geometry.index.getX(i)).applyMatrix4(mesh.matrixWorld);
   assert.ok(v.x< -2&&v.y<.36,'Only front lower lip is blackened');
  }
  const current=mesh.geometry;prepareFrontLowerTrim(root);assert.equal(mesh.geometry,current);
 }
 assert.equal(parts,1);assert.ok(faces>100);
 const lampRecords=records.filter(r=>r.mesh.userData.sourceObject==='@ME9x1tr5_153');
 prepareTailLampBacking(root);
 let restored=0;
 for(const {mesh,g,material} of lampRecords){
  assert.equal(mesh.geometry,g);
  if(material.userData.sourceMaterial.includes('红色灯带')){assert.equal(mesh.material.userData.surfaceRole,'tail-lamp-backing');assert.equal(mesh.material.emissiveIntensity,0);restored++;}
  else assert.equal(mesh.material,material);
 }
 for(const {mesh,material} of records.filter(r=>r.mesh.userData.sourceObject==='@ME9x1tr5_155'))assert.equal(mesh.material,material,'Actual tail LEDs are retained');
 assert.equal(restored,model==='n70'?1:0);
 results.push({model,parts,faces,geometryUVNormalsUnchanged:true,rearAndOtherMaterialsUnchanged:true,idempotent:true,lampBackingRestored:restored,actualTailLEDsRetained:true});
}
console.log(results);
