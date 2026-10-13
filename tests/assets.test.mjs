import {test} from 'node:test';
import {checkAssets} from '../scripts/check-assets.mjs';

test('runtime assets resolve, GLBs are intact, and HDR transport is lossless', async () => {
  console.log(await checkAssets());
});
