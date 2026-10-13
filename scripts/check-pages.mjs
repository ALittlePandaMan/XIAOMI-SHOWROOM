import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const base=process.argv[2];
assert.ok(base?.startsWith('/')&&base.endsWith('/'),'Pass the built site base path, e.g. /XIAOMI-SHOWROOM/');
const html=await readFile('dist/index.html','utf8');
for(const route of ['exterior','interior']){
 assert.equal(await readFile(`dist/${route}/index.html`,'utf8'),html,`${route}: missing static entry point`);
}
const references=new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]));
for(const file of await readdir('dist/assets')){
 if(!file.endsWith('.css'))continue;
 const css=await readFile(`dist/assets/${file}`,'utf8');
 for(const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g))if(!match[1].startsWith('data:'))references.add(match[1]);
}
for(const url of references){
 assert.ok(url.startsWith(base),`Resource escapes the deployment base: ${url}`);
 assert.ok((await stat(`dist/${url.slice(base.length)}`)).size>0,`Missing built resource: ${url}`);
}
const hashes=JSON.parse(await readFile('tests/fixtures/model-hashes.json','utf8'));
for(const [file,expected] of Object.entries(hashes)){
 const bytes=await readFile(file.replace(/^public\//,'dist/'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,`${file}: built model changed`);
}
console.log(`Pages build verified: 3 route entries, ${references.size} prefixed resources, ${Object.keys(hashes).length} unchanged models.`);
