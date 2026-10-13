export interface FrameClock {request:(callback:FrameRequestCallback)=>number;cancel:(id:number)=>void;now:()=>number;setTimer:(callback:()=>void,delay:number)=>number;clearTimer:(id:number)=>void}
/** One pending frame at most. No callback or polling continues while settled. */
export class FrameScheduler {
 private frame:number|null=null;
 private timer:number|null=null;
 private stopped=false;
 private disposed=false;
 private ticking=false;
 callbacks=0;
 private run:(now:number)=>boolean;
 private clock:FrameClock;
 constructor(run:(now:number)=>boolean,clock:FrameClock={request:f=>requestAnimationFrame(f),cancel:id=>cancelAnimationFrame(id),now:()=>performance.now(),setTimer:(f,ms)=>window.setTimeout(f,ms),clearTimer:id=>window.clearTimeout(id)}){this.run=run;this.clock=clock;}
 wake=()=>{if(this.disposed||this.stopped||this.ticking||this.frame!==null)return;this.frame=this.clock.request(this.tick);};
 private tick=(now:number)=>{this.frame=null;if(this.disposed||this.stopped)return;this.callbacks++;this.ticking=true;let continuing=false;try{continuing=this.run(now);}finally{this.ticking=false;}if(continuing)this.wake();};
 wakeAt(deadline:number){if(this.timer!==null)this.clock.clearTimer(this.timer);this.timer=null;if(Number.isFinite(deadline)&&!this.stopped&&!this.disposed)this.timer=this.clock.setTimer(()=>{this.timer=null;this.wake();},Math.max(0,deadline-this.clock.now()));}
 pause(){this.stopped=true;if(this.frame!==null)this.clock.cancel(this.frame);if(this.timer!==null)this.clock.clearTimer(this.timer);this.frame=this.timer=null;}
 resume(){if(this.disposed)return;this.stopped=false;this.wake();}
 get diagnostics(){return {callbacks:this.callbacks,framePending:this.frame!==null,timerPending:this.timer!==null,paused:this.stopped};}
 dispose(){this.pause();this.disposed=true;}
}
