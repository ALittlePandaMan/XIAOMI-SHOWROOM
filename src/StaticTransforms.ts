import type {Object3D} from 'three';

/** Local transforms stay exact. Animation owners call updateMatrix only when
 * they actually change a pose; descendants still inherit moving world matrices. */
export function freezeLocalTransforms(root:Object3D){
 root.traverse(object=>{object.updateMatrix();object.matrixAutoUpdate=false;});
 root.updateMatrixWorld(true);
}
