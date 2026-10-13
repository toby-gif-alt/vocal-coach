import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {build} from 'esbuild';import {digest} from '../src/offline-cache.js';import {RepertoireStore,incomingScoreFile} from '../src/repertoire-store.js';import {IDBFactory} from 'fake-indexeddb';
const scope='https://example.com/vocal-coach/';
function cacheStorage(){const caches=new Map();return {caches,async keys(){return [...caches.keys()];},async delete(key){return caches.delete(key);},async open(key){if(!caches.has(key))caches.set(key,new Map());const map=caches.get(key);return {async match(url){return map.get(String(url))?.clone();},async put(url,response){map.set(String(url),response.clone());}};}};}
async function worker(version,storage,files,options={}) {
  const assets=[];for(const [path,content] of Object.entries(files)){const bytes=new TextEncoder().encode(content);assets.push({path,bytes:bytes.length,sha256:await digest(bytes)});}
  const source=await build({entryPoints:['src/service-worker.js'],bundle:true,format:'iife',platform:'browser',write:false,banner:{js:`const OFFLINE_BUILD=${JSON.stringify({version,assets})};`}});
  const handlers={},messages=[],clients=options.clients||[{url:scope,postMessage:m=>messages.push(m)}];let skipped=false;
  const self={registration:{scope},clients:{async matchAll(){return clients;},async claim(){}},addEventListener:(type,fn)=>handlers[type]=fn,async skipWaiting(){skipped=true;}};
  vm.runInNewContext(source.outputFiles[0].text,{self,caches:storage,crypto,Response,Request,Headers,URL,TextEncoder,TextDecoder,Uint8Array,indexedDB:options.factory||new IDBFactory(),structuredClone,console,fetch:async url=>{const path=new URL(url).pathname.slice('/vocal-coach/'.length);options.fetches?.push(path);if(options.bad===path)throw Error('Download failed');return new Response(files[path]||'bad');}});
  async function event(type,data={}){let pending;handlers[type]({...data,waitUntil:p=>pending=p});if(pending)await pending;}
  return {event,handlers,messages,get skipped(){return skipped;}};
}
test('service worker verifies every file before offline readiness and serves range audio from cache',async()=>{
  const storage=cacheStorage(),files={'index.html':'<html>Offline</html>','app.js':'app','sound.mp3':'abcdef'},w=await worker('one',storage,files);
  await w.event('install');await w.event('activate');assert.ok(w.messages.some(m=>m.type==='OFFLINE_STATUS'&&m.ready));
  let response;w.handlers.fetch({request:{url:new URL('sound.mp3',scope).href,method:'GET',mode:'cors',headers:new Headers({Range:'bytes=1-3'})},respondWith:p=>response=p});assert.equal(await(await response).text(),'bcd');
  let intercepted=false;w.handlers.fetch({request:{url:new URL('private-recording.wav',scope).href,method:'GET'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});
test('partial update cannot activate, delete the old cache, or erase student repertoire',async()=>{
  const storage=cacheStorage(),factory=new IDBFactory(),library=new RepertoireStore(factory);await library.add({id:'student',importedAt:'2026',title:'Saved score',settings:{tempoPercent:75}});
  const old=await worker('old',storage,{'index.html':'old','app.js':'old'}, {factory});await old.event('install');await old.event('activate');
  const update=await worker('new',storage,{'index.html':'new','app.js':'new'},{bad:'app.js',factory});await assert.rejects(update.event('install'));await assert.rejects(update.event('activate'));
  assert.ok(storage.caches.has('vocal-coach-app-old'));assert.equal((await library.get('student')).settings.tempoPercent,75);
  const good=await worker('new',storage,{'index.html':'new','app.js':'new'},{factory});await good.event('install');await good.event('activate');assert.ok(!storage.caches.has('vocal-coach-app-old'));assert.equal((await library.get('student')).title,'Saved score');(await library.ready).close();
});
test('missing or corrupted cached bytes cannot report Offline ready',async()=>{
  const storage=cacheStorage(),w=await worker('test',storage,{'index.html':'shell','app.js':'good'});await w.event('install');const cache=await storage.open('vocal-coach-app-test');await cache.put(new URL('app.js',scope),new Response('evil'));let result;
  await w.event('message',{data:{type:'VERIFY'},ports:[{postMessage:r=>result=r}]});assert.equal(result.ready,false);
});
test('update activation requires other app windows to close first',async()=>{
  const w=await worker('test',cacheStorage(),{'index.html':'shell'},{clients:[{url:scope,postMessage(){}},{url:scope,postMessage(){}}]});await w.event('install');let result;
  await w.event('message',{data:{type:'UPDATE'},ports:[{postMessage:r=>result=r}]});assert.match(result.error,/Close other/);assert.equal(w.skipped,false);
});
test('shared attachments are stored locally and redirected into the scoped importer',async()=>{
  const factory=new IDBFactory(),library=new RepertoireStore(factory);
  const w=await worker('share',cacheStorage(),{'index.html':'shell'},{factory});
  const form=new FormData();form.append('score',new File(['<score-partwise/>'],'teacher.musicxml',{type:'application/xml'}));
  let response;w.handlers.fetch({request:new Request(new URL('share-score',scope),{method:'POST',body:form}),respondWith:p=>response=p});
  const received=await response;assert.equal(received.status,303);assert.equal(received.headers.get('location'),`${scope}?shared=1`);
  const items=await library.incoming();assert.equal(items.length,1);assert.equal(items[0].filename,'teacher.musicxml');assert.equal(items[0].mimeType,'application/xml');
  const restored=incomingScoreFile(items[0]);assert.equal(restored.name,'teacher.musicxml');assert.equal(restored.type,'application/xml');assert.deepEqual(new Uint8Array(await restored.arrayBuffer()),new TextEncoder().encode('<score-partwise/>'));
  // Exercise the Node 20 Blob-only clone explicitly on every test runtime.
  const blobOnly=incomingScoreFile({...items[0],file:new Blob([await restored.arrayBuffer()],{type:restored.type})});assert.equal(blobOnly.name,restored.name);assert.equal(blobOnly.type,restored.type);assert.deepEqual(await blobOnly.arrayBuffer(),await restored.arrayBuffer());
  await library.consumeIncoming(items[0].id);assert.deepEqual(await library.incoming(),[]);(await library.ready).close();
});
test('share receipt rejects unrelated file types without saving incoming data',async()=>{
  const factory=new IDBFactory(),library=new RepertoireStore(factory),w=await worker('share',cacheStorage(),{'index.html':'shell'},{factory});
  const form=new FormData();form.append('score',new File(['script'],'unsafe.html'));let response;
  w.handlers.fetch({request:new Request(new URL('share-score',scope),{method:'POST',body:form}),respondWith:p=>response=p});assert.equal((await response).status,400);assert.deepEqual(await library.incoming(),[]);(await library.ready).close();
});

test('incoming attachment reconstruction supports older File records and exact binary MXL bytes',()=>{
  const original=new File([new Uint8Array([80,75,0,255,1,128])],'teacher.mxl',{type:'application/vnd.recordare.musicxml'});
  const legacy=incomingScoreFile({file:original});assert.equal(legacy.name,original.name);assert.equal(legacy.type,original.type);
  return Promise.all([legacy.arrayBuffer(),original.arrayBuffer()]).then(([a,b])=>assert.deepEqual(a,b));
});

test('updates reuse unchanged verified sound bytes while fetching changed app files',async()=>{
  const storage=cacheStorage(),before=await worker('before',storage,{'index.html':'old','sound.mp3':'sample'});await before.event('install');await before.event('activate');
  const fetches=[],after=await worker('after',storage,{'index.html':'new','sound.mp3':'sample'},{fetches});await after.event('install');assert.deepEqual(fetches,['index.html']);await after.event('activate');
  assert.equal(await(await(await storage.open('vocal-coach-app-after')).match(new URL('sound.mp3',scope))).text(),'sample');
});
