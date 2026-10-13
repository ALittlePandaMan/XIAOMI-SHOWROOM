import type {WebGLRenderer} from 'three';

export const summarize=(values:readonly number[])=>{
 if(!values.length)return {samples:0,medianMs:null,p95Ms:null};
 const sorted=[...values].sort((a,b)=>a-b),at=(q:number)=>Number(sorted[Math.max(0,Math.ceil(q*sorted.length)-1)].toFixed(3));
 return {samples:sorted.length,medianMs:at(.5),p95Ms:at(.95)};
};
type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number};
type Sample={cpu:number[];gpu:number[];lastDrawCalls:number;lastTriangles:number};
/** Debug-only timers. GPU queries are polled asynchronously, never gl.finish(). */
export class PerformanceMonitor {
 private samples=new Map<string,Sample>();
 private intervals:number[]=[];
 private previousFrame=0;
 private expected=false;
 private gl:WebGL2RenderingContext;
 private extension:TimerExtension|null;
 private pending:{query:WebGLQuery;name:string}[]=[];
 private querying=false;
 private disjointSamples=0;
 readonly enabled:boolean;
 private renderer:WebGLRenderer;
 constructor(renderer:WebGLRenderer,enabled:boolean){
  this.enabled=enabled;this.renderer=renderer;
  this.gl=renderer.getContext() as WebGL2RenderingContext;
  this.extension=enabled?this.gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
 }
 private add(array:number[],value:number){array.push(value);if(array.length>8192)array.splice(0,4096);}
 private sample(name:string){let s=this.samples.get(name);if(!s){s={cpu:[],gpu:[],lastDrawCalls:0,lastTriangles:0};this.samples.set(name,s);}return s;}
 beginFrame(now:number){if(!this.enabled)return;if(this.expected&&this.previousFrame)this.add(this.intervals,now-this.previousFrame);this.previousFrame=now;this.poll();}
 endFrame(continuing:boolean){this.expected=continuing;}
 measure<T>(name:string,work:()=>T,gpu=true):T{
  if(!this.enabled)return work();
  const start=performance.now(),ext=this.extension,render=this.renderer.info?.render,draws=render?.calls??0,triangles=render?.triangles??0;
  const query=gpu&&ext&&!this.querying&&this.pending.length<32?this.gl.createQuery():null;
  if(query){this.gl.beginQuery(ext!.TIME_ELAPSED_EXT,query);this.querying=true;}
  try{return work();}finally{
   if(query){this.gl.endQuery(ext!.TIME_ELAPSED_EXT);this.querying=false;this.pending.push({query,name});}
   const sample=this.sample(name);this.add(sample.cpu,performance.now()-start);sample.lastDrawCalls=Math.max(0,(render?.calls??0)-(name==='frameCpuSubmission'?0:draws));sample.lastTriangles=Math.max(0,(render?.triangles??0)-(name==='frameCpuSubmission'?0:triangles));
  }
 }
 private poll(){
  if(!this.extension||this.gl.isContextLost())return;
  if(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)){
   this.disjointSamples+=this.pending.length;this.pending.forEach(p=>this.gl.deleteQuery(p.query));this.pending=[];return;
  }
  this.pending=this.pending.filter(p=>{
   if(!this.gl.getQueryParameter(p.query,this.gl.QUERY_RESULT_AVAILABLE))return true;
   this.add(this.sample(p.name).gpu,this.gl.getQueryParameter(p.query,this.gl.QUERY_RESULT)/1e6);
   this.gl.deleteQuery(p.query);return false;
  });
 }
 reset(){this.pending.forEach(p=>this.gl.deleteQuery(p.query));this.pending=[];this.samples.clear();this.intervals=[];this.expected=false;this.previousFrame=0;this.disjointSamples=0;}
 report(){
  this.poll();const intervals=summarize(this.intervals);
  return {enabled:this.enabled,gpuTiming:this.extension?'asynchronous GPU elapsed query':'unavailable — CPU submission is not GPU duration',
   frameInterval:intervals,estimatedFps:intervals.medianMs?Number((1000/intervals.medianMs).toFixed(1)):null,
   passes:Object.fromEntries([...this.samples].map(([name,s])=>[name,{cpuSubmission:summarize(s.cpu),gpuElapsed:summarize(s.gpu),lastDrawCalls:s.lastDrawCalls,lastTriangles:s.lastTriangles}])),
   pendingGpuQueries:this.pending.length,discardedDisjointQueries:this.disjointSamples};
 }
 contextRestored(){this.reset();this.extension=this.enabled?this.gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;}
 dispose(){this.reset();}
}
