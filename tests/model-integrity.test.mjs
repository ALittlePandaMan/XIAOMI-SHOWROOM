import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import * as THREE from 'three';
import {freezeLocalTransforms} from '../src/StaticTransforms.ts';
import {LampMaskBatch} from '../src/LampMaskBatch.ts';

const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),results=[];
for(const model of ['n70','n90-standard','n90']){
 const base=model==='n90'?'public/models/n90-explorer':`public/models/${model}`;
 const document=await io.read(`${base}/car.glb`),manifest=JSON.parse(readFileSync(`${base}/manifest.json`,'utf8'));
 const scene=new THREE.Scene(),nodes=new Map(),records=[];
 for(const node of document.getRoot().listNodes()){
  const group=new THREE.Group();group.name=node.getName();group.userData={...node.getExtras()};
  group.position.fromArray(node.getTranslation());group.quaternion.fromArray(node.getRotation());group.scale.fromArray(node.getScale());nodes.set(node,group);
  for(const primitive of node.getMesh()?.listPrimitives()??[]){
   const geometry=new THREE.BufferGeometry();
   for(const [semantic,name]of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]){
    const accessor=primitive.getAttribute(semantic);if(accessor)geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(accessor.getArray()),accessor.getElementSize()));
   }
   if(primitive.getIndices())geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(primitive.getIndices().getArray()),1));
   for(const target of primitive.listTargets())for(const [semantic,name]of [['POSITION','position'],['NORMAL','normal']]){
    const accessor=target.getAttribute(semantic);if(accessor)(geometry.morphAttributes[name]??=[]).push(new THREE.BufferAttribute(new Float32Array(accessor.getArray()),accessor.getElementSize()));
   }
   geometry.morphTargetsRelative=true;
   const source=primitive.getMaterial(),material=new THREE.MeshStandardMaterial();material.name=source?.getName()??'';material.userData={...source?.getExtras()};material.transparent=source?.getAlphaMode()==='BLEND';
   const mesh=new THREE.Mesh(geometry,material);group.add(mesh);records.push(mesh);
  }
 }
 for(const node of nodes.keys())for(const child of node.listChildren())nodes.get(node).add(nodes.get(child));
 for(const child of document.getRoot().listScenes()[0].listChildren())scene.add(nodes.get(child));
 scene.updateMatrixWorld(true);const reference=scene.clone(true);freezeLocalTransforms(scene);
 const index=root=>{const result=new Map();root.traverse(o=>{if(o.userData.webId)result.set(o.userData.webId,o);});return result;};
 const actual=index(scene),expected=index(reference),manifestTracks=Object.entries(manifest.tracks).flatMap(([,parts])=>Object.entries(parts));
 // The export prunes empty source nodes. Showroom uses only tracks whose
 // webId is present in the loaded GLB; exercise exactly those live objects.
 const tracks=manifestTracks.filter(([id])=>actual.has(id));assert.ok(tracks.length>0);
 const apply=(object,poses,q,explicit)=>{
  const f=q*(poses.length-1),i=Math.min(poses.length-2,Math.floor(f)),t=f-i,a=poses[i],b=poses[i+1];
  object.position.fromArray(a).lerp(new THREE.Vector3().fromArray(b),t);object.quaternion.fromArray(a,3).slerp(new THREE.Quaternion().fromArray(b,3),t);object.scale.fromArray(a,7).lerp(new THREE.Vector3().fromArray(b,7),t);if(explicit)object.updateMatrix();
 };
 for(const q of [0,.1,.37,.83,1,.6,0]){
  for(const [id,poses]of tracks){assert.ok(actual.has(id),`Missing ${model} track ${id}`);apply(actual.get(id),poses,q,true);apply(expected.get(id),poses,q,false);}
  scene.updateMatrixWorld();reference.updateMatrixWorld();
  for(const [id,object]of actual)assert.deepEqual(object.matrixWorld.elements,expected.get(id).matrixWorld.elements,`${model}/${id} world pose changed at ${q}`);
 }
 const batch=new LampMaskBatch();batch.prepare([scene]);batch.sync(scene);
 for(const entry of batch.entries){
  const source=entry.source.geometry,range=batch.batch._geometryInfo[batch.batch._instanceInfo[entry.instance].geometryIndex];
  const original=source.attributes.position.array,copied=batch.batch.geometry.attributes.position.array;
  for(let i=0;i<original.length;i++)assert.equal(copied[range.vertexStart*3+i],original[i],`${model} position lost precision`);
  for(let i=0;i<range.indexCount;i++)assert.equal(batch.batch.geometry.index.getX(range.indexStart+i)-range.vertexStart,source.index?source.index.getX(i):i,`${model} triangle index changed`);
 }
 results.push({model,meshes:records.length,animatedParts:tracks.length,prunedEmptyTracks:manifestTracks.length-tracks.length,sampledPoses:7,allWorldMatricesIdentical:true,batchInstances:batch.entries.length,sourceVerticesAndTrianglesIdentical:true,originalMorphParts:batch.deformed.length});
 batch.dispose();
}
console.log(results);
