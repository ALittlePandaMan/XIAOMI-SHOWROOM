#!/usr/bin/env bash
set -euo pipefail

image="${1:?Usage: bash scripts/smoke-container.sh IMAGE}"
container="$(docker run -d --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -p 127.0.0.1::8080 "$image")"
cleanup() {
  if [ "$?" -ne 0 ]; then docker logs "$container" || true; fi
  docker rm -f "$container" > /dev/null
}
trap cleanup EXIT

port="$(docker port "$container" 8080/tcp | awk -F: 'NR==1 {print $NF}')"
base="http://127.0.0.1:$port"
# A published port can reset connections briefly before Nginx finishes starting.
curl --fail --silent --show-error --max-time 3 --retry 30 --retry-delay 1 --retry-all-errors "$base/healthz"
test "$(docker exec "$container" id -u)" != 0
docker exec "$container" nginx -t

# Compare files actually served by Nginx with the checked-out model fingerprints.
SHOWROOM_TEST_URL="$base" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const base=process.env.SHOWROOM_TEST_URL;
for(const route of ['/','/exterior?model=n90','/interior?model=n70']) {
  const response=await fetch(base+route);
  assert.equal(response.status,200);
  assert.match(await response.text(),/id="root"/);
}
for(const path of ['/assets/missing.js','/models/missing.glb','/textures/missing.png','/environments/missing.rgba16f.gz']) {
  const response=await fetch(base+path);
  assert.equal(response.status,404,path);
  await response.arrayBuffer();
}
const index=await fetch(base+'/index.html');
assert.equal(index.headers.get('cache-control'),'no-cache');
const asset=(await index.text()).match(/\/assets\/[^" ]+\.js/)[0];
const bundle=await fetch(base+asset,{method:'HEAD'});
assert.equal(bundle.headers.get('cache-control'),'public, max-age=31536000, immutable');
const model=await fetch(base+'/models/n70/car.glb',{headers:{Range:'bytes=0-3'}});
assert.equal(model.status,206);
assert.equal(model.headers.get('cache-control'),'public, max-age=0, must-revalidate');
assert.equal(await model.text(),'glTF');
const hashes=JSON.parse(await readFile('tests/fixtures/model-hashes.json','utf8'));
for(const [file,expected] of Object.entries(hashes)) {
  const response=await fetch(base+'/'+file.replace(/^public\//,''));
  assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,file);
}
for(const name of ['studio','paint','glass','wheel','wheel-glass','window-trim']) {
  const response=await fetch(`${base}/environments/${name}.rgba16f.gz`);
  assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());
  const decoded=bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes):bytes;
  assert.deepEqual(decoded,await readFile(`public/environments/${name}.rgba16f`));
}
console.log('Container passed: routes, 404s, cache headers, byte ranges, 7 models, 6 HDR maps.');
NODE
