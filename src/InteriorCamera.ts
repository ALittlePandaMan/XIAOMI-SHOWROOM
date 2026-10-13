import {CatmullRomCurve3,MathUtils,Matrix4,Quaternion,Spherical,Vector3} from 'three';
import type {PerspectiveCamera} from 'three';
import {vehicleInteriorSeats} from './InteriorSeats';
import type {InteriorSeatId} from './InteriorSeats';
import type {VehicleId} from './vehicles';

export type ViewMode='exterior'|'interior';
export const cabinEye=new Vector3(-.10,1.30,.25);
export const cabinTarget=new Vector3(-1.35,1.0,0);
export const cabinLens=75;
export const doorApproach=new Vector3(-.22,1.38,3.10);
export const doorPath=new CatmullRomCurve3([doorApproach,new Vector3(-.30,1.35,1.40),new Vector3(-.27,1.32,.75),cabinEye]);
export const lookRotation=(eye:Vector3,target:Vector3)=>new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(eye,target,new Vector3(0,1,0)));
export const cabinRotation=lookRotation(cabinEye,cabinTarget);
export const doorRotation=lookRotation(doorApproach,cabinEye);
export const responsiveLens=(lens:number,aspect:number)=>Math.min(105,MathUtils.radToDeg(2*Math.atan(Math.tan(MathUtils.degToRad(lens/2))*Math.max(1,1.08/aspect))));
export function seatCamera(id:InteriorSeatId,vehicle:VehicleId='n90'){
 const seat=vehicleInteriorSeats(vehicle).find(s=>s.id===id);
 if(!seat)return;
 const eye=new Vector3(...seat.eye),target=new Vector3(...seat.target);
 return {eye,rotation:lookRotation(eye,target),lens:seat.lens};
}
/** Route between the front seats through the centre aisle, clear of their backs. */
export function cabinPath(from:Vector3,to:Vector3){
 const height=Math.max(from.y,to.y),points=[from.clone()];
 if(Math.abs(from.x-to.x)>.25){
  for(const p of [new Vector3(from.x,height,0),new Vector3(to.x,height,0)]){
   if(p.distanceToSquared(points.at(-1)!)>.000001)points.push(p);
  }
 }
 if(points.length===1||to.distanceToSquared(points.at(-1)!)>.000001)points.push(to.clone());
 return new CatmullRomCurve3(points,false,'centripetal');
}

/** Fixed eye position: dragging looks around the cabin instead of orbiting out of it. */
export class InteriorLook {
 enabled=false;
 private yaw=0;
 private pitch=0;
 private targetYaw=0;
 private targetPitch=0;
 private lens=cabinLens;
 private targetLens=cabinLens;
 private pointers=new Map<number,{x:number;y:number}>();
 private direction=new Vector3();
 constructor(private camera:PerspectiveCamera,private element:HTMLElement,private reducedMotion:boolean,private onInput:()=>void=()=>{}){
  element.addEventListener('pointerdown',this.down);element.addEventListener('pointermove',this.move);
  element.addEventListener('pointerup',this.up);element.addEventListener('pointercancel',this.up);element.addEventListener('lostpointercapture',this.up);
  element.addEventListener('wheel',this.wheel,{passive:false});element.addEventListener('keydown',this.key);
  window.addEventListener('blur',this.clear);
 }
 get fieldOfView(){return this.lens}
 enable(lens=cabinLens){
  this.camera.getWorldDirection(this.direction);
  const s=new Spherical().setFromVector3(this.direction);
  this.yaw=this.targetYaw=s.theta;this.pitch=this.targetPitch=Math.PI/2-s.phi;
  this.lens=this.targetLens=lens;this.enabled=true;this.clear();
 }
 disable(){this.enabled=false;this.clear()}
 focus(target:Vector3){const s=new Spherical().setFromVector3(target.clone().sub(this.camera.position));this.targetYaw=this.yaw+Math.atan2(Math.sin(s.theta-this.yaw),Math.cos(s.theta-this.yaw));this.targetPitch=MathUtils.clamp(Math.PI/2-s.phi,-1.1,1.1);}
 reset(rotation=cabinRotation,lens=cabinLens){const s=new Spherical().setFromVector3(new Vector3(0,0,-1).applyQuaternion(rotation));this.targetYaw=this.yaw+Math.atan2(Math.sin(s.theta-this.yaw),Math.cos(s.theta-this.yaw));this.targetPitch=Math.PI/2-s.phi;this.targetLens=lens;}
 private clear=()=>{this.pointers.clear()};
 private down=(e:PointerEvent)=>{
  if(!this.enabled||e.button!==0)return;
  this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.element.setPointerCapture(e.pointerId);
 };
 private distance(){const [a,b]=[...this.pointers.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}
 private move=(e:PointerEvent)=>{
  const old=this.pointers.get(e.pointerId);if(!this.enabled||!old)return;
  const distance=this.distance(),dx=e.clientX-old.x,dy=e.clientY-old.y;
  this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(this.pointers.size===1){
   const scale=2/Math.max(300,this.element.clientHeight);
   this.targetYaw+=dx*scale;this.targetPitch=MathUtils.clamp(this.targetPitch+dy*scale,-1.1,1.1);
  }else if(this.pointers.size===2){const next=this.distance();if(next>1&&distance>1)this.targetLens=MathUtils.clamp(this.targetLens*distance/next,40,88);}
  this.onInput();
 };
 private up=(e:PointerEvent)=>{this.pointers.delete(e.pointerId)};
 private wheel=(e:WheelEvent)=>{if(!this.enabled)return;e.preventDefault();const units=e.deltaMode===1?16:e.deltaMode===2?this.element.clientHeight:1;this.targetLens=MathUtils.clamp(this.targetLens+MathUtils.clamp(e.deltaY*units,-120,120)*.08,40,88);this.onInput();};
 private key=(e:KeyboardEvent)=>{
  if(!this.enabled)return;
  if(e.key==='ArrowLeft')this.targetYaw-=.12;else if(e.key==='ArrowRight')this.targetYaw+=.12;
  else if(e.key==='ArrowUp')this.targetPitch=Math.min(1.1,this.targetPitch+.10);else if(e.key==='ArrowDown')this.targetPitch=Math.max(-1.1,this.targetPitch-.10);else return;
  e.preventDefault();
  this.onInput();
 };
 update(dt:number){
  if(!this.enabled)return false;
  if(Math.abs(this.yaw-this.targetYaw)+Math.abs(this.pitch-this.targetPitch)+Math.abs(this.lens-this.targetLens)<.00001)return false;
  const t=this.reducedMotion?1:1-Math.exp(-12*dt);
  this.yaw=MathUtils.lerp(this.yaw,this.targetYaw,t);this.pitch=MathUtils.lerp(this.pitch,this.targetPitch,t);this.lens=MathUtils.lerp(this.lens,this.targetLens,t);
  this.direction.setFromSphericalCoords(1,Math.PI/2-this.pitch,this.yaw);
  this.camera.lookAt(this.direction.add(this.camera.position));return true;
 }
 dispose(){
  this.disable();this.element.removeEventListener('pointerdown',this.down);this.element.removeEventListener('pointermove',this.move);
  this.element.removeEventListener('pointerup',this.up);this.element.removeEventListener('pointercancel',this.up);this.element.removeEventListener('lostpointercapture',this.up);
  this.element.removeEventListener('wheel',this.wheel);this.element.removeEventListener('keydown',this.key);window.removeEventListener('blur',this.clear);
 }
}
