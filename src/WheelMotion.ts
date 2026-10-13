import {Box3,Group,Mesh,Vector3} from 'three';
import {cubicInOut} from './StandardViews';

/** Official wheelAnimation: immediate variant swap, 360°, 0.75 s, Cubic.InOut. */
export class WheelMotion {
 private variants=new Map<Group,Group[]>();
 private discs:Group[]=[];
 private spinning:Group[]=[];
 private started:number|null=null;
 private angle=0;

 prepareWheels(root:Group,mounts?:number[][]){
  root.updateMatrixWorld(true);
  const parts=[...root.children];
  const tires=parts.filter(part=>{let tire=false;part.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(String(m.userData.sourceMaterial??m.name).includes('轮胎'))tire=true;});return tire;});
  if(tires.length!==4)throw new Error('车轮旋转轴缺失');
  const centers=tires.map(t=>root.worldToLocal(new Box3().setFromObject(t).getCenter(new Vector3())));
  const pivots=centers.map((center,i)=>{const p=new Group();p.name=`Wheel rotation ${i}`;p.position.copy(center);root.add(p);return p;});
  root.updateMatrixWorld(true);
  for(const part of parts){
   const center=root.worldToLocal(new Box3().setFromObject(part).getCenter(new Vector3()));
   const index=centers.reduce((best,c,i)=>center.distanceToSquared(c)<center.distanceToSquared(centers[best])?i:best,0);
   // Keep the original world geometry, UVs, scale and normals when adding a pivot.
   pivots[index].attach(part);
  }
  // Keep the donor's 21-inch geometry and UVs unchanged. Only translate each
  // complete assembly to this vehicle's measured axle and track position.
  if(mounts){
   if(mounts.length!==4)throw new Error('车型轮心数据缺失');
   for(let i=0;i<centers.length;i++){
    const target=mounts.find(p=>Math.sign(p[0])===Math.sign(centers[i].x)&&Math.sign(p[2])===Math.sign(centers[i].z));
    if(!target)throw new Error('车型轮心位置不匹配');
    pivots[i].position.fromArray(target);
   }
   root.updateMatrixWorld(true);
  }
  this.variants.set(root,pivots);
 }
 prepareBrakes(root:Group){
  root.updateMatrixWorld(true);
  const discs:Mesh[]=[];root.traverse(o=>{if(o instanceof Mesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.userData.sourceMaterial==='制动盘_金属'))discs.push(o);});
  for(const disc of discs){
   const pivot=new Group();pivot.name='Brake disc rotation';pivot.position.copy(root.worldToLocal(new Box3().setFromObject(disc).getCenter(new Vector3())));
   root.add(pivot);root.updateMatrixWorld(true);pivot.attach(disc);this.discs.push(pivot);
  }
 }
 start(root:Group,reducedMotion:boolean){
  this.reset();
  if(reducedMotion)return;
  this.spinning=[...(this.variants.get(root)??[]),...this.discs];this.started=performance.now();
 }
 private reset(){for(const pivot of this.spinning){pivot.rotation.set(0,0,0);pivot.updateMatrix();}this.spinning=[];this.started=null;this.angle=0;}
 get active(){return this.started!==null;}
 update(now:number){
  if(this.started===null)return false;
  const t=Math.min(1,Math.max(0,(now-this.started)/750));this.angle=cubicInOut(t)*Math.PI*2;
  // All exported assemblies share the vehicle's +Z axle (right geometry is
  // already mirrored). Calipers stay fixed, while tires, rims and discs rotate.
  for(const pivot of this.spinning){pivot.rotation.z=this.angle;pivot.updateMatrix();}
  if(t===1)this.reset(); // exact rest pose, including after rapid reselection
  return true;
 }
 getDiagnostics(){return {active:this.active,angle:this.angle,variants:this.variants.size,brakes:this.discs.length,pivots:this.spinning.length};}
 dispose(){this.reset();this.variants.clear();this.discs=[];}
}
