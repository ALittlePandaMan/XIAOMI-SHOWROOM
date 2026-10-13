import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const results=[];
for(const name of ['studio','paint','glass','wheel','wheel-glass','window-trim']){
 const path=`public/environments/${name}`,source=await readFile(path+'.rgba16f'),compressed=gzipSync(source,{level:9});
 assert.deepEqual(gunzipSync(compressed),source,'Every HDR texel must decompress bit-for-bit');
 await writeFile(path+'.rgba16f.gz',compressed);
 const metadata=JSON.parse(await readFile(path+'.json','utf8'));metadata.compression='gzip';await writeFile(path+'.json',JSON.stringify(metadata,null,2)+'\n');
 results.push({name,originalBytes:source.length,compressedBytes:compressed.length,sha256:createHash('sha256').update(source).digest('hex')});
}
console.log(JSON.stringify(results,null,2));
