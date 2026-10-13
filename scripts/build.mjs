import { cp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const file of ['index.html','app.js','styles.css','manifest.webmanifest','icons','src','vendor','samples','repertoire','og.png']) await cp(file,`dist/${file}`,{recursive:true,filter:source=>!source.split('/').some(segment=>segment.startsWith('.'))});
async function walk(dir) { const files=[];for(const entry of await readdir(dir,{withFileTypes:true})) {const path=`${dir}/${entry.name}`;files.push(...(entry.isDirectory()?await walk(path):[path]));}return files; }
const assets=[];
for(const file of (await walk('dist')).sort()) {const bytes=await readFile(file);assets.push({path:file.slice(5),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,20);
const manifest={version,assets,totalBytes:assets.reduce((n,a)=>n+a.bytes,0)};
await writeFile('dist/offline-assets.json',JSON.stringify(manifest));
await build({entryPoints:['src/service-worker.js'],bundle:true,format:'iife',platform:'browser',outfile:'dist/service-worker.js',banner:{js:`const OFFLINE_BUILD = ${JSON.stringify(manifest)};`}});
console.log(`Built ${assets.length} offline files, ${(manifest.totalBytes/1024/1024).toFixed(1)} MB; version ${version}`);
