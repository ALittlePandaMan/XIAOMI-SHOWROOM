import {PerspectiveCamera,Vector3} from 'three';
import type {Scene,WebGLRenderer} from 'three';
import type {MainSceneBatch} from './MainSceneBatch';

export interface BatchMeasurement {enabled:boolean;nativeCpuMs:number|null;batchCpuMs:number|null;nativeGpuMs:number|null;batchGpuMs:number|null;reason:string}
export function chooseBatching(nativeCpu:number|null,batchCpu:number|null,nativeGpu:number|null,batchGpu:number|null):BatchMeasurement{
 const known=nativeCpu!==null&&batchCpu!==null&&nativeGpu!==null&&batchGpu!==null&&nativeGpu>0;
 const enabled=known&&((batchGpu<=nativeGpu*.98&&batchCpu<=nativeCpu*1.05)||(batchCpu<=nativeCpu*.85&&batchGpu<=nativeGpu*1.02));
 return {enabled,nativeCpuMs:nativeCpu,batchCpuMs:batchCpu,nativeGpuMs:nativeGpu,batchGpuMs:batchGpu,
  reason:!known?'GPU timing unavailable; retain native drawing':enabled?'paired same-quality draws show a benefit':'paired draws do not show a safe benefit; retain native drawing'};
}
/** Small loading-time trial. Never enable fewer draw calls at the cost of slower frames. */
export async function calibrateBatching(renderer:WebGLRenderer,scene:Scene,batch:MainSceneBatch,vehicle:Scene['children'][number],cameras:Record<'exterior'|'interior',PerspectiveCamera>,cancelled:()=>boolean){
 const gl=renderer.getContext() as WebGL2RenderingContext,ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 const fallback=chooseBatching(null,null,null,null),result={exterior:fallback,interior:fallback};
 if(!ext||!batch.diagnostics.instances)return result;
 for(const mode of ['exterior','interior'] as const){
  const camera=cameras[mode],records:{query:WebGLQuery;batch:boolean;cpu:number}[]=[];
  try{
   // Both native and batched shader variants are warm before timing begins.
   for(const enabled of [false,true]){batch.setEnabled(enabled);scene.updateMatrixWorld();batch.sync(vehicle);await renderer.compileAsync(scene,camera);}
   for(let pair=0;pair<8;pair++)for(const enabled of pair%2?[true,false]:[false,true]){
    if(cancelled()||gl.isContextLost())return result;
    batch.setEnabled(enabled);scene.updateMatrixWorld();batch.sync(vehicle);
    const query=gl.createQuery();if(!query)return result;
    gl.beginQuery(ext.TIME_ELAPSED_EXT,query);const start=performance.now();renderer.render(scene,camera);const cpu=performance.now()-start;gl.endQuery(ext.TIME_ELAPSED_EXT);
    if(pair<2)gl.deleteQuery(query);else records.push({query,batch:enabled,cpu});
    await new Promise<void>(resolve=>setTimeout(resolve,0));
   }
   const deadline=performance.now()+5000;
   while(records.some(r=>!gl.getQueryParameter(r.query,gl.QUERY_RESULT_AVAILABLE))&&performance.now()<deadline&&!cancelled())await new Promise<void>(resolve=>setTimeout(resolve,8));
   if(cancelled()||gl.isContextLost()||gl.getParameter(ext.GPU_DISJOINT_EXT)||records.some(r=>!gl.getQueryParameter(r.query,gl.QUERY_RESULT_AVAILABLE)))continue;
   const mean=(enabled:boolean,gpu:boolean)=>{const selected=records.filter(r=>r.batch===enabled);return selected.reduce((sum,r)=>sum+(gpu?gl.getQueryParameter(r.query,gl.QUERY_RESULT)/1e6:r.cpu),0)/selected.length;};
   result[mode]=chooseBatching(mean(false,false),mean(true,false),mean(false,true),mean(true,true));
  }finally{for(const r of records)gl.deleteQuery(r.query);batch.setEnabled(false);}
 }
 return result;
}

export function calibrationCameras(main:PerspectiveCamera,interior:{eye:Vector3;rotation:PerspectiveCamera['quaternion'];lens:number}){
 const exterior=main.clone(),cabin=main.clone();cabin.position.copy(interior.eye);cabin.quaternion.copy(interior.rotation);cabin.fov=interior.lens;cabin.updateProjectionMatrix();
 return {exterior,interior:cabin};
}
