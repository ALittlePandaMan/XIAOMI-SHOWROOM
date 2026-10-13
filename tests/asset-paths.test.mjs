import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assetUrl} from '../src/assetUrl.ts';

test('resources resolve from the deployment root, independent of the current view',()=>{
 for(const base of ['/','/XIAOMI-SHOWROOM/']){
  for(const view of ['','exterior/','interior/?model=n70#interior=black']){
   for(const file of ['models/n70/car.glb','textures/cabin/sand-6.png','environments/studio.rgba16f.gz','icons/official/reset.svg','images/official/wheel-1.png']){
    const url=new URL(assetUrl('/'+file,base),`https://example.com${base}${view}`);
    assert.equal(url.href,`https://example.com${base}${file}`);
   }
  }
 }
});
