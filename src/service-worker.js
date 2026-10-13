import {assetURL,verified,byteRange} from './offline-cache.js';
import {openLibrary} from './repertoire-store.js';
const CACHE=`vocal-coach-app-${OFFLINE_BUILD.version}`,SCOPE=self.registration.scope;
const allowed=new Map(OFFLINE_BUILD.assets.map(a=>[assetURL(a.path,SCOPE),a]));
let downloading=null;
async function broadcast(message) {for(const client of await self.clients.matchAll({includeUncontrolled:true})) if(client.url.startsWith(SCOPE))client.postMessage({...message,version:OFFLINE_BUILD.version});}
async function check() {const cache=await caches.open(CACHE);for(const [url,asset] of allowed) if(!await verified(await cache.match(url),asset))return false;return true;}
function download() {
  if(downloading)return downloading;
  downloading=(async()=>{const cache=await caches.open(CACHE);let done=0;const entries=[...allowed];
    const previousCaches=await Promise.all((await caches.keys()).filter(key=>key.startsWith('vocal-coach-app-')&&key!==CACHE).map(key=>caches.open(key)));
    async function worker() {while(entries.length){const [url,asset]=entries.shift();let response=await cache.match(url);
      if(!await verified(response,asset)){
        response=null;
        // Reuse only bytes matching this build, never an incompatible old file.
        for(const previous of previousCaches){const candidate=await previous.match(url);if(await verified(candidate,asset)){response=candidate;break;}}
        if(!response){response=await fetch(url,{cache:'reload',credentials:'same-origin'});if(!await verified(response,asset))throw Error(`Could not verify ${asset.path}`);}
        await cache.put(url,response);
      }
      done++;await broadcast({type:'DOWNLOAD_PROGRESS',done,total:allowed.size});
    }}
    await Promise.all(Array.from({length:4},worker));
    await cache.put(assetURL('offline-assets.json',SCOPE),new Response(JSON.stringify(OFFLINE_BUILD),{headers:{'Content-Type':'application/json'}}));
    if(!await check())throw Error('Offline verification failed');await broadcast({type:'OFFLINE_STATUS',ready:true});
  })().catch(async error=>{await broadcast({type:'OFFLINE_ERROR',message:error.message});throw error;}).finally(()=>{downloading=null;});return downloading;
}
self.addEventListener('install',event=>{event.waitUntil(download());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{if(!await check())throw Error('Incomplete offline assets');
  for(const key of await caches.keys())if(key.startsWith('vocal-coach-app-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();await broadcast({type:'OFFLINE_STATUS',ready:true});
})());});
self.addEventListener('message',event=>{
  const reply=value=>event.ports[0]?.postMessage(value);
  if(event.data?.type==='VERIFY')event.waitUntil(check().then(ready=>reply({ready,version:OFFLINE_BUILD.version})).catch(error=>reply({ready:false,error:error.message})));
  if(event.data?.type==='DOWNLOAD')event.waitUntil(download().then(()=>reply({ready:true})).catch(error=>reply({ready:false,error:error.message})));
  if(event.data?.type==='UPDATE')event.waitUntil((async()=>{
    const clients=(await self.clients.matchAll()).filter(c=>c.url.startsWith(SCOPE));
    if(clients.length>1){reply({error:'Close other Vocal Coach windows before updating.'});return;}
    if(!await check()){reply({error:'The update is not fully downloaded yet.'});return;}
    reply({updating:true});await self.skipWaiting();
  })());
});
async function acceptShared(request) {
  try {const form=await request.formData();const files=form.getAll('score');if(!files.length||files.length>10)throw Error('Share up to ten MusicXML files.');
    for(const file of files)if(!file.name||! /\.(xml|musicxml|mxl)$/i.test(file.name)||file.size>20*1024*1024)throw Error('Share MusicXML/XML/MXL files under 20 MB.');
    const db=await openLibrary();await new Promise((resolve,reject)=>{const tx=db.transaction('incoming','readwrite');for(const file of files)tx.objectStore('incoming').add({id:crypto.randomUUID(),filename:file.name,mimeType:file.type,file});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    return Response.redirect(new URL('./?shared=1',SCOPE),303);
  } catch(error){return new Response(`The score could not be received: ${error.message}. Open Vocal Coach and use Import Score.`,{status:400,headers:{'Content-Type':'text/plain'}});}
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==new URL(SCOPE).origin||!url.href.startsWith(SCOPE))return;
  if(event.request.method==='POST'&&url.pathname===new URL('share-score',SCOPE).pathname){event.respondWith(acceptShared(event.request));return;}
  if(event.request.method!=='GET')return;
  url.search='';url.hash='';const key=event.request.mode==='navigate'?assetURL('index.html',SCOPE):url.href;
  if(!allowed.has(key)&&key!==assetURL('offline-assets.json',SCOPE))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(key);
    if(cached)return byteRange(cached,event.request.headers.get('Range'));
    // Never mix an unverified network file into a cached application version.
    const response=await fetch(key,{cache:'no-store'});const asset=allowed.get(key);
    if(asset&&!await verified(response,asset))return new Response('App update needed. Reconnect and reopen Vocal Coach.',{status:503});
    if(response.ok&&asset)await cache.put(key,response.clone());return byteRange(response,event.request.headers.get('Range'));
  })().catch(()=>new Response('This file is not available offline yet. Reconnect and finish the offline download.',{status:503,headers:{'Content-Type':'text/plain'}})));
});
