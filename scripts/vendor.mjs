import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('vendor/licenses',{recursive:true});
for (const [pkg, file, output] of [
  ['opensheetmusicdisplay','build/opensheetmusicdisplay.min.js','osmd.js'],
  ['tone','build/Tone.js','tone.js'], ['jszip','dist/jszip.min.js','jszip.js'],
]) {
  await cp(`node_modules/${pkg}/${file}`,`vendor/${output}`);
  try { await cp(`node_modules/${pkg}/${file}.LICENSE.txt`, `vendor/licenses/${output}.LICENSE.txt`); } catch(error) { if(error.code!=='ENOENT') throw error; }
}
await build({entryPoints:['node_modules/pitchy/index.js'],bundle:true,format:'esm',platform:'browser',outfile:'vendor/pitchy.mjs',legalComments:'inline'});
for (const pkg of ['opensheetmusicdisplay','tone','jszip','pitchy','fft.js']) {
  const meta=JSON.parse(await readFile(`node_modules/${pkg}/package.json`));
  for (const name of ['LICENSE','LICENSE.txt','LICENSE.md','LICENSE.markdown']) {
    try { await cp(`node_modules/${pkg}/${name}`,`vendor/licenses/${pkg}-${name}`); } catch(error) { if(error.code!=='ENOENT') throw error; }
  }
  await writeFile(`vendor/licenses/${pkg}.json`,JSON.stringify({name:pkg,version:meta.version,license:meta.license,repository:meta.repository},null,2));
}
