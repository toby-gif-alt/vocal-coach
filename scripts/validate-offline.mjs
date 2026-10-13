import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('dist/manifest.webmanifest'));
assert.equal(manifest.name,'Vocal Coach');assert.equal(manifest.display,'standalone');
const base='https://toby-gif-alt.github.io/vocal-coach/manifest.webmanifest';
for(const path of [manifest.start_url,manifest.scope,manifest.share_target.action,...manifest.file_handlers.map(f=>f.action)])assert.ok(new URL(path,base).pathname.startsWith('/vocal-coach/'));
for(const icon of manifest.icons){const bytes=await readFile(`dist/${icon.src}`);const [size]=icon.sizes.split('x').map(Number);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
const assets=JSON.parse(await readFile('dist/offline-assets.json'));
for(const asset of assets.assets){assert.ok(!asset.path.split('/').some(segment=>segment.startsWith('.')),`Pages excludes hidden asset: ${asset.path}`);const bytes=await readFile(`dist/${asset.path}`);assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);}
for(const essential of ['index.html','app.js','vendor/osmd.js','vendor/tone.js','vendor/jszip.js','vendor/pitchy.mjs','samples/vocal-guide/index.json'])assert.ok(assets.assets.some(a=>a.path===essential));
assert.ok(assets.assets.some(a=>a.path.startsWith('samples/piano/salamander/')&&a.path.endsWith('.mp3')));
assert.ok(assets.assets.some(a=>a.path.startsWith('repertoire/')));
const html=await readFile('dist/index.html','utf8');assert.ok(!/<script[^>]+src=["']https?:/i.test(html));
for(const asset of assets.assets.filter(a=>a.path.startsWith('src/')&&a.path.endsWith('.js'))){const source=await readFile(`dist/${asset.path}`,'utf8');assert.ok(!/\b(?:import|export)[\s\S]*?\bfrom\s*["']https?:/.test(source),asset.path);}
const worker=await readFile('dist/service-worker.js','utf8');assert.ok(worker.includes(assets.version));
console.log(`Offline validation passed: ${assets.assets.length} verified files, ${(assets.totalBytes/1024/1024).toFixed(1)} MB; project-path URLs valid.`);
