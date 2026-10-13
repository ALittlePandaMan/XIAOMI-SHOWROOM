import * as THREE from 'three';

/** Hinged panel and bezel move together; the ceiling cassette stays fixed. */
export class CabinTelevision {
 private screens:THREE.MeshStandardMaterial[]=[];
 private playback=0;
 private settledTime=0;
 private deployed=false;
 private position=new THREE.Vector3();
 private rotation=new THREE.Quaternion();
 private scale=new THREE.Vector3();
 private poseProgress=-1;
 constructor(readonly root:THREE.Object3D,private poses:number[][],private focus:number[]){
  root.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(m instanceof THREE.MeshStandardMaterial&&m.userData.n70Kind==='display'){
     m.color.setRGB(.002,.003,.004);m.emissive.set(0xffffff);m.toneMapped=false;this.screens.push(m);
    }
   }
  });
  this.update(0,false);
 }
 update(q:number,lit:boolean,dt=0,reducedMotion=false){
  if(q!==this.poseProgress){
  const f=q*(this.poses.length-1),i=Math.min(this.poses.length-2,Math.floor(f)),t=f-i,a=this.poses[i],b=this.poses[i+1],o=this.root;
  o.position.fromArray(a);this.position.fromArray(b);o.position.lerp(this.position,t);
  o.quaternion.fromArray(a,3);this.rotation.fromArray(b,3);o.quaternion.slerp(this.rotation,t);
  o.scale.fromArray(a,7);this.scale.fromArray(b,7);o.scale.lerp(this.scale,t);
  o.updateMatrix();this.poseProgress=q;
  }
  const before=this.playback;
  if(lit&&q===1){if(this.deployed)this.settledTime+=dt;this.deployed=true;this.playback=reducedMotion?1:THREE.MathUtils.smoothstep(this.settledTime,.10,.32);}
  else{this.deployed=false;this.settledTime=0;this.playback=0;}
  for(const m of this.screens)m.emissiveIntensity=.85*this.playback;
  return before!==this.playback;
 }
 get playbackSettled(){return !this.deployed||this.playback===1}
 getFocusPoint(target=new THREE.Vector3()){
  return this.root.parent!.localToWorld(target.fromArray(this.focus));
 }
 getDiagnostics(){return {playback:this.playback,screenMaterials:this.screens.length}}
}
