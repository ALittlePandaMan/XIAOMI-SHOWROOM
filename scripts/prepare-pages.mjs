import {copyFile,mkdir,writeFile} from 'node:fs/promises';

// Pages has no SPA rewrite rule. Real entry files let shared URLs and refreshes
// load either view while preserving the model query and configuration hash.
for(const route of ['exterior','interior']){
 await mkdir(`dist/${route}`,{recursive:true});
 await copyFile('dist/index.html',`dist/${route}/index.html`);
}
await Promise.all([
 copyFile('LICENSE','dist/LICENSE'),
 copyFile('THIRD_PARTY_NOTICES.md','dist/THIRD_PARTY_NOTICES.md'),
 writeFile('dist/.nojekyll',''),
]);
console.log('GitHub Pages entry files ready: /, /exterior/, /interior/.');
