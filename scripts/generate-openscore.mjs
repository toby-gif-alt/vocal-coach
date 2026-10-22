// Explicit maintainer refresh only; normal builds use the committed, offline catalogue.
import {writeFile} from 'node:fs/promises';
import {DOMParser} from '@xmldom/xmldom';
async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`${r.status}: ${url}`);return r.json();}
const repo='https://api.github.com/repos/OpenScore/Lieder';
const commit=(await json(repo+'/commits/main')).sha;
const [html,tree]=await Promise.all([fetch(`https://raw.githubusercontent.com/OpenScore/Lieder/${commit}/data/index.html`).then(r=>{if(!r.ok)throw Error('Catalogue unavailable');return r.text();}),json(`${repo}/git/trees/${commit}?recursive=1`)]);
if(tree.truncated)throw Error('OpenScore tree is truncated; cannot verify all files.');
const files=new Set(tree.tree.filter(e=>e.type==='blob').map(e=>e.path));
const plain=s=>new DOMParser().parseFromString('<x>'+s.replace(/<[^>]*>/g,'')+'</x>','application/xml').documentElement.textContent.trim();
const scores=[];let skipped=0;
for(const match of html.matchAll(/<tr>(.*?)<\/tr>/gs)){
 const cells=[...match[1].matchAll(/<td>(.*?)<\/td>/gs)].map(m=>m[1]);if(cells.length!==7)continue;
 const url=cells[5].match(/href="([^"]+\.mxl[^\"]*)"/i)?.[1];if(!url)continue;
 const path=decodeURIComponent(new URL(url).pathname.replace(/^\/OpenScore\/Lieder\/(?:refs\/heads\/main|main)\//,''));
 if(!files.has(path)){skipped++;continue;}
 const id=path.match(/lc(\d+)\.mxl$/)?.[1];if(!id)throw Error('Missing OpenScore ID');
 scores.push({id:'openscore:'+id,title:plain(cells[2]),composer:plain(cells[0]),collection:plain(cells[1]).replace(/^—$/,''),language:plain(cells[4]),path});
}
if(scores.length<100||new Set(scores.map(s=>s.id)).size!==scores.length)throw Error('Catalogue incomplete or duplicate IDs');
await writeFile('src/openscore-catalogue.json',JSON.stringify({source:'OpenScore Lieder',sourceUrl:'https://fourscoreandmore.org/openscore/lieder/',licence:'CC0-1.0',licenceUrl:'https://github.com/OpenScore/Lieder/blob/'+commit+'/LICENSE.txt',commit,scores}));
console.log(`Verified ${scores.length} MusicXML paths at ${commit}; omitted ${skipped} stale catalogue links.`);
