import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {FrameScheduler} from '../src/FrameScheduler.ts';
import {MainSceneBatch,SOURCE_LAYER} from '../src/MainSceneBatch.ts';
import {compareImages} from '../src/ImageComparison.ts';
import {PerformanceMonitor,summarize} from '../src/PerformanceMonitor.ts';
import {seatCacheShader,seatPrecomputeShader} from '../src/SeatSamplingCache.ts';
import {setRenderSettings} from '../src/RenderSettings.ts';
import {chooseBatching} from '../src/BatchCalibration.ts';

test('scheduler sleeps after settling, deduplicates input, and cancels hidden/disposed work',()=>{
 const frames=new Map(),timers=new Map();let id=0,now=0,remaining=2,scheduler;
 const clock={request:f=>{frames.set(++id,f);return id;},cancel:i=>frames.delete(i),now:()=>now,setTimer:(f,ms)=>{timers.set(++id,{f,ms});return id;},clearTimer:i=>timers.delete(i)};
 scheduler=new FrameScheduler(()=>{scheduler.wake();return remaining-->0;},clock);
 const frame=()=>{const [i,f]=frames.entries().next().value;frames.delete(i);f(now+=16.67);};
 scheduler.wake();scheduler.wake();assert.equal(frames.size,1);frame();frame();frame();assert.equal(frames.size,0);assert.equal(scheduler.callbacks,3);
 now+=5000;assert.equal(scheduler.callbacks,3);scheduler.wakeAt(now+1500);assert.equal(timers.size,1);
 scheduler.pause();assert.equal(timers.size,0);scheduler.wake();assert.equal(frames.size,0);scheduler.resume();assert.equal(frames.size,1);
 scheduler.dispose();assert.equal(frames.size,0);scheduler.wake();assert.equal(frames.size,0);
});

test('first reveal and same-size presentation redraw twice, then sleep without losing mid-frame requests',()=>{
 const frames=new Map();let id=0,now=0,presented=0,revealDuringFrame=false;
 const clock={request:f=>{frames.set(++id,f);return id;},cancel:i=>frames.delete(i),now:()=>now,setTimer:()=>++id,clearTimer:()=>{}};
 const scheduler=new FrameScheduler((_now,present)=>{if(present)presented++;if(revealDuringFrame){revealDuringFrame=false;scheduler.present();}return false;},clock);
 const frame=()=>{const [i,f]=frames.entries().next().value;frames.delete(i);f(now+=16.67);};
 scheduler.present();scheduler.present();assert.equal(frames.size,1);frame();frame();assert.equal(presented,2);assert.equal(frames.size,0);
 now+=5000;assert.equal(presented,2);
 scheduler.wake();revealDuringFrame=true;frame();assert.equal(frames.size,1);frame();frame();assert.equal(presented,4);assert.equal(frames.size,0);
 scheduler.pause();scheduler.present();assert.equal(frames.size,0);scheduler.resume();frame();frame();assert.equal(presented,6);assert.equal(frames.size,0);
 scheduler.dispose();scheduler.present();assert.equal(frames.size,0);
});

test('display batches preserve attributes, indices, animated sources, picking and material switches',()=>{
 const vehicle=new THREE.Group(),door=new THREE.Group();vehicle.position.set(.3,.01,-.1);vehicle.add(door);
 const material=new THREE.MeshStandardMaterial(),meshes=[];
 for(let i=0;i<4;i++){
  const g=new THREE.BoxGeometry(.3,.4,.02);g.clearGroups();g.setAttribute('cabinControl',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*4).fill(i*.1),4));
  const mesh=new THREE.Mesh(g,material);mesh.position.set(i*.4,.2,0);door.add(mesh);meshes.push(mesh);
 }
 vehicle.updateMatrixWorld(true);const positions=meshes.map(m=>m.geometry.attributes.position.array.slice()),indices=meshes.map(m=>m.geometry.index.array.slice());
 const batch=new MainSceneBatch();batch.prepare([vehicle],vehicle,true);batch.setEnabled(true);
 assert.equal(batch.diagnostics.groups,1);assert.equal(batch.diagnostics.instances,4);assert.equal(batch.diagnostics.minimumSavedDrawCalls,3);
 for(const angle of [0,.35,1,.7,0]){
  door.rotation.y=angle;vehicle.updateMatrixWorld(true);const before=meshes.map(m=>m.matrixWorld.elements.slice());batch.sync(vehicle);
  for(const [i,entry]of batch.groups[0].entries.entries()){
   assert.deepEqual(entry.source.matrixWorld.elements,before[i]);assert.deepEqual(entry.source.geometry.attributes.position.array,positions[i]);assert.deepEqual(entry.source.geometry.index.array,indices[i]);
   assert.equal(entry.source.layers.mask,1<<SOURCE_LAYER);assert.equal(batch.groups[0].batch.getVisibleAt(entry.instance),true);
   const expected=new THREE.Matrix4().copy(vehicle.matrixWorld).invert().multiply(entry.source.matrixWorld),actual=batch.groups[0].batch.getMatrixAt(entry.instance,new THREE.Matrix4());
   for(let j=0;j<16;j++)assert.ok(Math.abs(expected.elements[j]-actual.elements[j])<1e-6);
   const info=batch.groups[0].batch._geometryInfo[batch.groups[0].batch._instanceInfo[entry.instance].geometryIndex];
   for(const [name,attribute]of Object.entries(entry.source.geometry.attributes)){
    const copied=batch.groups[0].batch.geometry.attributes[name];for(let j=0;j<attribute.array.length;j++)assert.equal(copied.array[info.vertexStart*attribute.itemSize+j],attribute.array[j],name);
   }
   for(let j=0;j<info.indexCount;j++)assert.equal(batch.groups[0].batch.geometry.index.getX(info.indexStart+j)-info.vertexStart,entry.source.geometry.index.getX(j));
  }
 }
 const ray=new THREE.Raycaster(new THREE.Vector3(.3,.21,2),new THREE.Vector3(0,0,-1));ray.layers.enable(SOURCE_LAYER);assert.ok(ray.intersectObjects(meshes).length>0);
 meshes[0].visible=false;batch.sync(vehicle);assert.equal(batch.groups[0].batch.getVisibleAt(0),false);
 meshes[1].material=new THREE.MeshStandardMaterial();batch.sync(vehicle);assert.equal(meshes[1].layers.mask,1);assert.equal(batch.groups[0].batch.getVisibleAt(1),false);
 vehicle.remove(door);batch.sync(vehicle);assert.equal(batch.groups[0].batch.getVisibleAt(2),false);
 batch.dispose();assert.ok(meshes.every(m=>m.layers.mask===1));
 const fallback=new MainSceneBatch();fallback.prepare([vehicle],vehicle,false);assert.equal(fallback.diagnostics.instances,0);
});

test('unsupported, transparent, morphing, world-position and negative-scale parts retain native drawing',()=>{
 const vehicle=new THREE.Group(),safe=new THREE.MeshStandardMaterial();
 for(let i=0;i<6;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(),safe);m.geometry.clearGroups();m.scale.x=-1;vehicle.add(m);}
 vehicle.updateMatrixWorld(true);const batch=new MainSceneBatch();batch.prepare([vehicle],vehicle,true);assert.equal(batch.diagnostics.instances,0);batch.dispose();
 for(const m of vehicle.children)m.scale.x=1;safe.userData.batchUnsafe=true;vehicle.updateMatrixWorld(true);batch.prepare([vehicle],vehicle,true);assert.equal(batch.diagnostics.instances,0);
});

test('image comparison detects a color change confined to a small detail region',()=>{
 const a={width:32,height:32,data:new Uint8Array(32*32*4).fill(120)},b={...a,data:a.data.slice()};
 assert.equal(compareImages(a,b).ssim,1);b.data[(5*32+5)*4]=250;
 assert.ok(compareImages(a,b,{name:'glyph',x:4,y:4,width:4,height:4}).ssim<.999);assert.equal(compareImages(a,b).maxChannelDifference,130);
});

test('batching requires measured benefit and does not enable a GPU regression or unknown timing',()=>{
 assert.equal(chooseBatching(5,3,10,10).enabled,true);
 assert.equal(chooseBatching(5,5,10,8).enabled,true);
 assert.equal(chooseBatching(5,3,10,13).enabled,false);
 assert.equal(chooseBatching(5,7,10,8).enabled,false);
 assert.equal(chooseBatching(5,3,null,null).enabled,false);
});

test('GPU timing stays pending until available and invalid disjoint samples are discarded',()=>{
 let available=false,disjoint=false,next=0;const removed=[];
 const ext={TIME_ELAPSED_EXT:99,GPU_DISJOINT_EXT:98},gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,getExtension:()=>ext,createQuery:()=>++next,beginQuery:()=>{},endQuery:()=>{},isContextLost:()=>false,getParameter:()=>disjoint,getQueryParameter:(_,parameter)=>parameter===1?available:2e6,deleteQuery:q=>removed.push(q)};
 const monitor=new PerformanceMonitor({getContext:()=>gl},true);monitor.measure('mainScene',()=>{});
 assert.equal(monitor.report().passes.mainScene.gpuElapsed.samples,0);available=true;assert.equal(monitor.report().passes.mainScene.gpuElapsed.medianMs,2);
 available=false;monitor.measure('mirrors',()=>{});disjoint=true;const report=monitor.report();assert.equal(report.discardedDisjointQueries,1);assert.equal(report.passes.mirrors.gpuElapsed.samples,0);assert.equal(removed.length,2);
 assert.deepEqual(summarize([4,1,3,2]),{samples:4,medianMs:2,p95Ms:4});monitor.dispose();
});

test('seat cache retains original nonlinear formulas and supplies the original reference path',()=>{
 const renderer={},material=new THREE.MeshStandardMaterial();material.userData.seatSampling={method:'pad',ready:{value:false},texture:{value:null}};
 setRenderSettings(renderer,{reference:true,areaLights:[],staticLights:true});assert.equal(seatCacheShader(renderer,material),undefined);
 setRenderSettings(renderer,{reference:false,areaLights:[],staticLights:true});const shader=seatCacheShader(renderer,material);
 assert.match(shader,/texelFetch/);assert.match(shader,/pow\(ratio,\.88\)/);assert.match(shader,/for\(int x=0;x<8;x\+\+\)/);assert.match(shader,/showroomSeatCacheReady/);
 assert.match(seatPrecomputeShader('pad'),/gl_FragCoord.xy-\.5/);assert.match(seatPrecomputeShader('quilt'),/broad\/=16\./);
 material.userData.seatCacheDisabled=true;assert.equal(seatCacheShader(renderer,material),undefined,'rejected caches use the complete original shader');
});

test('integer-aligned FP32 cache interpolation reproduces the broad LOD samples, including clamp breakpoints',()=>{
 // A nontrivial synthetic LOD3 field. Its bilinear knots sit at atlas px=4+8n.
 const texel=(x,y)=>.2+.1*Math.sin(x*.71+y*.19)+.05*Math.cos(y*.57-x*.11);
 const sample=(x,y)=>{const u=x/8-.5,v=y/8-.5,ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;return (texel(ix,iy)*(1-fx)+texel(ix+1,iy)*fx)*(1-fy)+(texel(ix,iy+1)*(1-fx)+texel(ix+1,iy+1)*fx)*fy;};
 const broad=(px,py)=>{let sum=0;for(let y=0;y<4;y++)for(let x=0;x<4;x++)sum+=sample(Math.max(548,Math.min(653,px+(x-1.5)*20)),Math.max(239,Math.min(454,py+(y-1.5)*20)));return sum/16;};
 for(let i=0;i<500;i++){
  const x=528+(i*13.319)%145,y=229+(i*7.713)%234,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const cached=(broad(ix,iy)*(1-fx)+broad(ix+1,iy)*fx)*(1-fy)+(broad(ix,iy+1)*(1-fx)+broad(ix+1,iy+1)*fx)*fy;
  assert.ok(Math.abs(cached-broad(x,y))<1e-12);
 }
});
