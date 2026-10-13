import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {freezeLocalTransforms} from '../src/StaticTransforms.ts';
import {LampMaskBatch} from '../src/LampMaskBatch.ts';
import {loadLosslessBinary} from '../src/LosslessRadiance.ts';
import {after} from 'node:test';
import {servePublic} from './helpers/static-server.mjs';

const server=await servePublic();
after(()=>server.close());

const scene=new THREE.Scene(),vehicle=new THREE.Group(),door=new THREE.Group();scene.add(vehicle);vehicle.add(door);
vehicle.position.set(.5,-.01,.3);vehicle.rotation.z=.006;door.position.set(1.1,.4,-.7);
const geometry=new THREE.BoxGeometry(.7,.6,.03),material=new THREE.MeshStandardMaterial();
const mesh=new THREE.Mesh(geometry,material);mesh.position.set(.35,0,0);door.add(mesh);
const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([k,v])=>[k,Array.from(v.array)])),indices=Array.from(geometry.index.array);
scene.updateMatrixWorld(true);const reference=scene.clone(true);freezeLocalTransforms(scene);
for(const angle of [0,.2,.6,1.4,.5,0]){
 door.rotation.y=angle;door.updateMatrix();reference.children[0].children[0].rotation.y=angle;
 scene.updateMatrixWorld();reference.updateMatrixWorld();
 assert.deepEqual(mesh.matrixWorld.elements,reference.children[0].children[0].children[0].matrixWorld.elements,'Animated world matrices must match unoptimized Three transforms');
}
const batch=new LampMaskBatch();batch.prepare([vehicle]);batch.sync(vehicle);
assert.equal(batch.entries.length,1);
const batched=batch.batch;
assert.deepEqual(Array.from(batched.geometry.attributes.position.array).slice(0,geometry.attributes.position.array.length),attributes.position,'Every original vertex must survive batching unchanged');
assert.deepEqual(Array.from(batched.geometry.index.array).slice(0,indices.length),indices,'Every original triangle index must survive batching unchanged');
for(const [name,values]of Object.entries(attributes))assert.deepEqual(Array.from(geometry.attributes[name].array),values,`Source ${name} must remain untouched`);
assert.deepEqual(Array.from(geometry.index.array),indices);
vehicle.visible=false;batch.sync(vehicle);assert.equal(batched.getVisibleAt(0),false);
vehicle.visible=true;batch.sync(vehicle);assert.equal(batched.getVisibleAt(0),true);
vehicle.remove(door);batch.sync(vehicle);assert.equal(batched.getVisibleAt(0),false);
vehicle.add(door);door.updateMatrixWorld(true);
assert.deepEqual(mesh.matrixWorld.elements,reference.children[0].children[0].children[0].matrixWorld.elements,'Reattached cached variants must inherit the vehicle alignment');
batch.dispose();
const fallbackMask=new LampMaskBatch();fallbackMask.prepare([vehicle],false);fallbackMask.sync(vehicle);
assert.equal(fallbackMask.batch,undefined,'Do not allocate batching buffers on GPUs without multi-draw');
assert.equal(fallbackMask.deformed[0].copy.geometry,mesh.geometry,'Fallback must use the exact original mesh geometry');
assert.deepEqual(fallbackMask.deformed[0].copy.matrix.elements,mesh.matrixWorld.elements);
fallbackMask.dispose();
const paths=['public/models/n90-explorer/car.glb','public/models/n70/car.glb','public/models/n90-standard/car.glb',...['1','2','3'].map(i=>`public/models/shared/wheels-${i}.glb`)];
const models=paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
const environments=[];
for(const name of ['studio','paint','glass','wheel','wheel-glass','window-trim']){
 const path=`environments/${name}.rgba16f`,bytes=await loadLosslessBinary(`${server.origin}/${path}`,`${server.origin}/${path}.gz`);
 assert.deepEqual(Buffer.from(bytes),readFileSync('public/'+path),'Browser loader must decode every HDR byte exactly');
 environments.push(name);
}
const fallback=await loadLosslessBinary(`${server.origin}/environments/studio.rgba16f`,`${server.origin}/environments/missing-test.rgba16f.gz`);
assert.deepEqual(Buffer.from(fallback),readFileSync('public/environments/studio.rgba16f'),'Missing compressed file must fall back to the original');
const result={passed:true,geometry:'all source attributes and triangle indices retained bit-for-bit',animation:'world matrices equal before/after static transform optimization',visibility:'hidden and detached wheel/door sources excluded',multiDrawFallback:true,environments:{lossless:true,tested:environments,rawFallback:true},models};
console.log(JSON.stringify(result,null,2));
