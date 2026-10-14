import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import * as THREE from 'three';
import {refineCabinNormals} from '../src/CabinNormals.ts';

test('N90 rear-seat smoothing removes latch shading fans without changing any mesh detail',async()=>{
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const document=await io.read('public/models/n90-standard/car.glb');
 let seats=0,changedSeats=0;
 for(const node of document.getRoot().listNodes()){
  if(!['mesh_60_33_nr','mesh_60_37_nr'].includes(node.getExtras().sourceObject))continue;
  const primitive=node.getMesh().listPrimitives().find(p=>p.getMaterial().getExtras().cabinSurface==='leather');
  const geometry=new THREE.BufferGeometry();
  for(const semantic of primitive.listSemantics()){
   const accessor=primitive.getAttribute(semantic),name={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',COLOR_0:'color'}[semantic]??semantic;
   geometry.setAttribute(name,new THREE.BufferAttribute(accessor.getArray().slice(),accessor.getElementSize(),accessor.getNormalized()));
  }
  geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray().slice(),1));
  const before=Object.fromEntries(Object.entries(geometry.attributes).map(([name,a])=>[name,a.array.slice()])),indices=geometry.index.array.slice();
  const material=new THREE.MeshPhysicalMaterial();material.userData={cabinSeat:true,cabinSurface:'leather'};
  refineCabinNormals(new THREE.Mesh(geometry,material));
  let changed=0;
  const original=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<geometry.attributes.normal.count;i++){
   original.fromArray(before.normal,i*3);normal.fromBufferAttribute(geometry.attributes.normal,i);
   assert.ok(Number.isFinite(normal.length())&&Math.abs(normal.length()-1)<.001);
   assert.ok(normal.dot(original)>.649,'authored hard edges and surface orientation survive');
   if(normal.distanceToSquared(original)>.0001)changed++;
  }
  if(changed>0)changedSeats++;
  for(const [name,array]of Object.entries(before))if(name!=='normal')assert.deepEqual(geometry.attributes[name].array,array,name);
  assert.deepEqual(geometry.index.array,indices);seats++;
 }
 assert.equal(seats,2);
 assert.ok(changedSeats>0,'the previously excluded second-row seat material must now be smoothed');
 // Animated surfaces and other materials keep their authored normal data.
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshPhysicalMaterial(),original=geometry.attributes.normal;
 refineCabinNormals(new THREE.Mesh(geometry,material));assert.equal(geometry.attributes.normal,original);
 material.userData={cabinSeat:true,cabinSurface:'leather'};geometry.morphAttributes.position=[geometry.attributes.position.clone()];
 refineCabinNormals(new THREE.Mesh(geometry,material));assert.equal(geometry.attributes.normal,original);
});
