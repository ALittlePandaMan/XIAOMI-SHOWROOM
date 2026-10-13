import * as THREE from 'three';

export interface GeometryIsland {vertices:number[];bounds:THREE.Box3}

/** Connected parts, including duplicated vertices at UV seams. Positions and
 * indices stay untouched; callers can select a complete original component. */
export function geometryIslands(geometry:THREE.BufferGeometry):GeometryIsland[]{
 const p=geometry.attributes.position,index=geometry.index;
 if(!index)return [];
 const parents=Int32Array.from({length:p.count},(_,i)=>i);
 const find=(i:number):number=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 const join=(a:number,b:number)=>{parents[find(a)]=find(b);};
 const welded=new Map<string,number>();
 for(let i=0;i<p.count;i++){
  const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',');
  const other=welded.get(key);if(other===undefined)welded.set(key,i);else join(i,other);
 }
 for(let i=0;i<index.count;i+=3){join(index.getX(i),index.getX(i+1));join(index.getX(i),index.getX(i+2));}
 const parts=new Map<number,GeometryIsland>(),point=new THREE.Vector3();
 for(let i=0;i<p.count;i++){
  const id=find(i);let part=parts.get(id);
  if(!part){part={vertices:[],bounds:new THREE.Box3()};parts.set(id,part);}
  part.vertices.push(i);part.bounds.expandByPoint(point.fromBufferAttribute(p,i));
 }
 return [...parts.values()];
}
