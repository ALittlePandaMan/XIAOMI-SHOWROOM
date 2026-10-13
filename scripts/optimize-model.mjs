import {resolve, dirname} from 'node:path';
import {mkdir, stat} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, EXTMeshoptCompression} from '@gltf-transform/extensions';
import {dedup, prune, reorder} from '@gltf-transform/functions';
import {MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length || resolve(input) === resolve(output)) {
  throw new Error('Usage: npm run assets:optimize -- <input.raw.glb> <output.glb> (different files)');
}
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const document = await io.read(input);
// Reorder/compress without quantizing attributes or changing node transforms.
// Texture payloads, resolution, and morph targets are retained as supplied.
await document.transform(dedup(), prune(), reorder({encoder: MeshoptEncoder}));
document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
  method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
});
await mkdir(dirname(resolve(output)), {recursive: true});
await io.write(output, document);
console.log({input, output, inputBytes: (await stat(input)).size, outputBytes: (await stat(output)).size});
