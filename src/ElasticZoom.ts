import {MathUtils,Vector3} from 'three';
import type {PerspectiveCamera} from 'three';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';

/** Camera-distance easing and a resisted, one-metre rebound zone at either limit. */
export class ElasticZoom {
 private target:number|null=null;
 private velocity=0;
 private releaseTime=0;
 private rebounding=false;
 private offset=new Vector3();
 private touches=new Map<number,{x:number;y:number}>();
 private pinchDistance=0;
 private middle?:{id:number;y:number};
 private originalZoom:boolean;
 private originalTwoFingerAction:OrbitControls['touches']['TWO'];

 constructor(private camera:PerspectiveCamera,private controls:OrbitControls,private element:HTMLElement,private reducedMotion:boolean,private onInput:()=>void){
  this.originalZoom=controls.enableZoom;controls.enableZoom=false;
  // With both native zoom and pan disabled, OrbitControls otherwise retains
  // the previous one-finger rotation state when a second finger arrives.
  this.originalTwoFingerAction=controls.touches.TWO;controls.touches.TWO=null;
  element.addEventListener('wheel',this.wheel,{passive:false});
  element.addEventListener('pointerdown',this.down);
  element.addEventListener('pointermove',this.move);
  element.addEventListener('pointerup',this.up);
  element.addEventListener('pointercancel',this.up);
  element.addEventListener('lostpointercapture',this.up);
  window.addEventListener('blur',this.clearPointers);
 }
 get active(){return this.target!==null}
 private get distance(){return this.camera.position.distanceTo(this.controls.target)}
 private bounds(){
  const min=this.controls.minDistance,max=this.controls.maxDistance;
  const buffer=Math.min(1,(max-min)*.1);
  return {min,max,buffer,near:min+buffer,far:max-buffer};
 }
 private setDistance(distance:number){
  this.offset.subVectors(this.camera.position,this.controls.target);
  if(this.offset.lengthSq()<1e-12)return;
  this.camera.position.copy(this.controls.target).add(this.offset.setLength(distance));
 }
 private scale(factor:number){
  if(!this.controls.enabled||!Number.isFinite(factor)||factor<=0||factor===1)return;
  this.onInput();
  const {min,max,buffer,near,far}=this.bounds();
  const start=this.target??this.distance;
  let delta=start*(factor-1);
  // Further outward input loses force as it enters the boundary buffer.
  const penetration=delta<0?near-start:start-far;
  if(penetration>0&&buffer>0)delta*=.08+.92*(1-MathUtils.clamp(penetration/buffer,0,1))**4;
  const goal=MathUtils.clamp(start+delta,this.reducedMotion?near:min,this.reducedMotion?far:max);
  this.velocity=0;this.rebounding=false;this.releaseTime=0;
  if(this.reducedMotion){this.setDistance(goal);this.target=null;this.controls.update();return;}
  this.target=goal;
 }
 private wheel=(e:WheelEvent)=>{
  if(!this.controls.enabled)return;
  e.preventDefault();
  const units=e.deltaMode===1?16:e.deltaMode===2?this.element.clientHeight:1;
  const delta=MathUtils.clamp(e.deltaY*units*(e.ctrlKey?10:1),-120,120);
  // One full mouse notch matches the reference's 0.85 distance ratio;
  // small trackpad deltas retain proportional control.
  this.scale(Math.exp(-Math.log(.85)*delta/120*this.controls.zoomSpeed/.75));
 };
 private touchDistance(){
  if(this.touches.size!==2)return 0;
  const [a,b]=[...this.touches.values()];return Math.hypot(a.x-b.x,a.y-b.y);
 }
 private down=(e:PointerEvent)=>{
  if(!this.controls.enabled)return;
  if(e.pointerType==='touch'){
   this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});this.pinchDistance=this.touchDistance();
  }else if(e.button===1)this.middle={id:e.pointerId,y:e.clientY};
 };
 private move=(e:PointerEvent)=>{
  if(this.touches.has(e.pointerId)){
   this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});const distance=this.touchDistance();
   if(distance>1&&this.pinchDistance>1)this.scale(Math.pow(this.pinchDistance/distance,this.controls.zoomSpeed));
   this.pinchDistance=distance;
  }else if(this.middle?.id===e.pointerId){
   const delta=e.clientY-this.middle.y;this.middle.y=e.clientY;
   this.scale(Math.exp(MathUtils.clamp(delta,-80,80)*.004*this.controls.zoomSpeed));
  }
 };
 private up=(e:PointerEvent)=>{
  this.touches.delete(e.pointerId);this.pinchDistance=this.touchDistance();
  if(this.middle?.id===e.pointerId)this.middle=undefined;
 };
 private clearPointers=()=>{this.touches.clear();this.pinchDistance=0;this.middle=undefined;};
 cancel(){this.target=null;this.velocity=0;this.rebounding=false;this.releaseTime=0;}
 update(dt:number){
  if(this.target===null)return false;
  this.releaseTime+=dt;
  const {min,max,near,far}=this.bounds();
  if(!this.rebounding&&this.releaseTime>=.1&&this.touches.size<2&&!this.middle&&(this.target<near||this.target>far)){
   this.target=MathUtils.clamp(this.target,near,far);this.rebounding=true;this.velocity=0;
  }
  const current=this.distance;
  let next:number;
  if(this.rebounding){
   // Exact damped-spring step: consistent at 30, 60 and 144 Hz, with a small
   // overshoot confined to the safe distance range.
   const omega=14,damping=.72,a=omega*damping,b=omega*Math.sqrt(1-damping*damping);
   const x=current-this.target,c=(this.velocity+a*x)/b;
   const decay=Math.exp(-a*dt),cos=Math.cos(b*dt),sin=Math.sin(b*dt);
   next=this.target+decay*(x*cos+c*sin);
   this.velocity=decay*((-a*x+b*c)*cos+(-a*c-b*x)*sin);
  }else next=MathUtils.damp(current,this.target,5,dt);
  const clamped=MathUtils.clamp(next,min,max);if(clamped!==next)this.velocity=0;next=clamped;
  const inBuffer=this.target<near||this.target>far;
  if(!inBuffer&&Math.abs(next-this.target)<.0005&&Math.abs(this.velocity)<.003){next=this.target;this.cancel();}
  this.setDistance(next);return true;
 }
 getDiagnostics(){return {active:this.active,distance:this.distance,target:this.target,rebounding:this.rebounding,...this.bounds()}}
 dispose(){
  this.cancel();this.clearPointers();this.controls.enableZoom=this.originalZoom;this.controls.touches.TWO=this.originalTwoFingerAction;
  this.element.removeEventListener('wheel',this.wheel);
  this.element.removeEventListener('pointerdown',this.down);this.element.removeEventListener('pointermove',this.move);
  this.element.removeEventListener('pointerup',this.up);this.element.removeEventListener('pointercancel',this.up);this.element.removeEventListener('lostpointercapture',this.up);
  window.removeEventListener('blur',this.clearPointers);
 }
}
