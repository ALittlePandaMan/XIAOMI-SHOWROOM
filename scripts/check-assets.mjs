import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

async function filesIn(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]))).flat();
}

export async function checkAssets() {
  const required = new Set();
  const publicFiles = await filesIn('public');
  const sources = [...await filesIn('src'), 'index.html'];
  for (const file of sources) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/["'`]((?:\/(?:models|textures|images|icons|fonts|environments)\/|\/favicon)[^"'`\s]+)["'`]/g)) {
      if (!match[1].includes('${')) required.add(match[1]);
    }
  }
  for (const model of ['n70', 'n90-standard', 'n90-explorer']) {
    const base = `/models/${model}`;
    required.add(`${base}/car.glb`);
    required.add(`${base}/manifest.json`);
    const manifest = JSON.parse(await readFile(`public${base}/manifest.json`, 'utf8'));
    assert.ok(Object.keys(manifest.parts).length > 0, `${model}: missing parts`);
    assert.ok(Object.keys(manifest.tracks).length > 0, `${model}: missing animation tracks`);
    for (const wheel of manifest.wheels) if (wheel.source) required.add(wheel.source);
    for (const source of Object.values(manifest.wheelSources ?? {})) required.add(source);
  }
  required.add('/models/n90-explorer/projector.glb');
  for (const id of [1, 2, 3]) required.add(`/models/shared/wheels-${id}.glb`);
  for (const id of [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30]) required.add(`/textures/cabin/sand-${id}.png`);
  for (let id = 5; id <= 35; id += 3) {
    required.add(`/textures/n70/cabin-${id}.png`);
    required.add(`/textures/n70/cabin-${id + 2}.png`);
  }
  for (const id of [13, 16, 22, 28]) required.add(`/textures/n70/cabin-${id}.png`);
  for (const file of ['front-detail.png', 'rear-detail.png', 'rubber-occlusion.png']) required.add(`/textures/tires/${file}`);
  for (const file of ['roofOpen', 'roofClose', 'doorOpen', 'doorClose', 'rule', 'noRule', 'fullScreen', 'closeFullScreen', 'reset', 'arrowback']) required.add(`/icons/official/${file}.svg`);
  for (const name of ['body', 'brushed']) required.add(`/images/official/trim-${name}.png`);

  for (const name of ['studio', 'paint', 'glass', 'wheel', 'wheel-glass', 'window-trim']) {
    const base = `public/environments/${name}`;
    const metadata = JSON.parse(await readFile(`${base}.json`, 'utf8'));
    const original = await readFile(`${base}.rgba16f`);
    assert.equal(original.length, metadata.width * metadata.height * 4 * 2, `${name}: HDR size mismatch`);
    assert.deepEqual(gunzipSync(await readFile(`${base}.rgba16f.gz`)), original, `${name}: gzip data changed`);
  }
  for (const url of required) assert.ok((await stat(`public${url}`)).size > 0, `Missing/empty asset: ${url}`);

  const hashes = JSON.parse(await readFile('tests/fixtures/model-hashes.json', 'utf8'));
  for (const [file, expected] of Object.entries(hashes)) {
    const bytes = await readFile(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `${file}: model changed; review and update its checksum`);
    assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${file}: invalid GLB`);
    assert.equal(bytes.readUInt32LE(8), bytes.length, `${file}: truncated GLB`);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    for (const entry of [...json.buffers ?? [], ...json.images ?? []]) {
      assert.ok(!entry.uri || entry.uri.startsWith('data:'), `${file}: external GLB resource ${entry.uri}`);
    }
  }
  const sizes = await Promise.all(publicFiles.map(file => stat(file)));
  return {checkedReferences: required.size, modelChecksums: Object.keys(hashes).length, publicFiles: publicFiles.length,
    publicMiB: Number((sizes.reduce((sum, file) => sum + file.size, 0) / 1024 ** 2).toFixed(2))};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(await checkAssets());
}
