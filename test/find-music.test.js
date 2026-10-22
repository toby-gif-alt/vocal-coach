import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {searchMusic,museScoreSearch,openScoreUrl,downloadOpenScore} from '../src/find-music.js';
import {validateScoreFile,validateXMLText} from '../src/file-safety.js';
import {RepertoireStore,scoreRecord,fileHash} from '../src/repertoire-store.js';
import {indexedDB} from 'fake-indexeddb';
const catalogue=JSON.parse(await readFile(new URL('../src/openscore-catalogue.json',import.meta.url),'utf8')),entry=catalogue.scores[0];
test('local verified catalogue searches titles, composers, collections and language without remote search',()=>{
 assert.ok(catalogue.scores.length>1400);assert.equal(catalogue.licence,'CC0-1.0');
 assert.ok(searchMusic(catalogue.scores,'Just for Today').some(s=>s.id==='openscore:6583477'));
 assert.ok(searchMusic(catalogue.scores,'schubert').every(s=>s.composer.toLowerCase().includes('schubert')));
 assert.ok(searchMusic(catalogue.scores,'EN').length>0);assert.equal(new Set(catalogue.scores.map(s=>s.id)).size,catalogue.scores.length);
 for(const score of catalogue.scores)assert.ok(openScoreUrl(score,catalogue).startsWith('https://raw.githubusercontent.com/OpenScore/Lieder/'+catalogue.commit+'/scores/'));
});
test('MuseScore external search safely encodes arbitrary text and stays on its public website',()=>{
 const query='People Need the Lord & ü? #x <script>';
 const url=new URL(museScoreSearch(query));assert.equal(url.origin,'https://musescore.com');assert.equal(url.pathname,'/sheetmusic');assert.equal(url.searchParams.get('text'),query);
});
test('download preserves original MXL filename, MIME type and bytes and rejects broken or oversized responses',async()=>{
 const bytes=new Uint8Array([80,75,3,4,0,255]);
 const file=await downloadOpenScore(entry,catalogue,async url=>{assert.equal(url,openScoreUrl(entry,catalogue));return new Response(bytes,{headers:{'content-type':'application/octet-stream'}});});
 assert.equal(file.name,'lc6583477.mxl');assert.equal(file.type,'application/octet-stream');assert.deepEqual(new Uint8Array(await file.arrayBuffer()),bytes);
 await assert.rejects(downloadOpenScore(entry,catalogue,async()=>new Response('',{status:404})),/could not/);
 await assert.rejects(downloadOpenScore(entry,catalogue,async()=>new Response('',{headers:{'content-length':30*1024*1024}})),/20 MB/);
 assert.throws(()=>openScoreUrl({...entry,path:'scores/../lc6583477.mxl'},catalogue),/verified/);
 assert.throws(()=>validateScoreFile(new File(['x'],'x.mscz')),/MuseScore Studio/);assert.throws(()=>validateScoreFile(new File(['x'],'x.pdf')),/PDF/);
 assert.throws(()=>validateXMLText('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><x/>'),/entities/);
});
test('downloaded library data retains source identity, preferences and original bytes for offline reopening',async()=>{
 const store=new RepertoireStore(indexedDB),file=new File(['<score-partwise/>'],'source.musicxml',{type:'application/xml'}),hash=await fileHash(file);
 const record={...scoreRecord(file,{title:'Song',creator:'Composer'},hash),sourceId:entry.id,attribution:{licence:'CC0-1.0'},settings:{transposeSemitones:2}};
 await store.add(record);assert.equal((await store.findHash(hash)).id,record.id);
 const reopened=await store.get(record.id);assert.equal(reopened.sourceId,entry.id);assert.equal(reopened.settings.transposeSemitones,2);assert.equal(await reopened.bytes.text(),await file.text());
 const ui=await readFile(new URL('../src/library-ui.js',import.meta.url),'utf8');assert.ok(ui.includes('if(existing&&source)return {score,record:existing}'));
});
