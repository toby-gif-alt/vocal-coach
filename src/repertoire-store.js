export const DATABASE_NAME='vocal-coach-library';
export function openLibrary(factory=globalThis.indexedDB) {
  return new Promise((resolve,reject)=>{
    if(!factory) return reject(new Error('Local repertoire storage is unavailable in this browser.'));
    const request=factory.open(DATABASE_NAME,1);
    request.onupgradeneeded=()=>{const db=request.result;
      if(!db.objectStoreNames.contains('scores')) {const scores=db.createObjectStore('scores',{keyPath:'id'});scores.createIndex('hash','hash',{unique:false});}
      if(!db.objectStoreNames.contains('settings')) db.createObjectStore('settings',{keyPath:'key'});
      if(!db.objectStoreNames.contains('incoming')) db.createObjectStore('incoming',{keyPath:'id'});
    };
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Close other Vocal Coach windows to enable local storage.'));
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
  });
}
export class RepertoireStore {
  constructor(factory=globalThis.indexedDB) {this.ready=openLibrary(factory);this.ready.catch(()=>{});}
  async run(store,mode,operation) {const db=await this.ready;return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode);let value;const object=tx.objectStore(store);
    tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Local storage operation was cancelled.'));
    operation(object,result=>{value=result;});
  });}
  list() {return this.run('scores','readonly',(s,done)=>{s.getAll().onsuccess=e=>done(e.target.result.sort((a,b)=>b.importedAt.localeCompare(a.importedAt)));});}
  get(id) {return this.run('scores','readonly',(s,done)=>{s.get(id).onsuccess=e=>done(e.target.result);});}
  findHash(hash) {return this.run('scores','readonly',(s,done)=>{s.index('hash').get(hash).onsuccess=e=>done(e.target.result);});}
  add(record) {return this.run('scores','readwrite',(s,done)=>{s.add(record);done(record);});}
  update(id,patch) {return this.run('scores','readwrite',(s,done)=>{s.get(id).onsuccess=e=>{const record=e.target.result;if(!record)return;const updated={...record,...patch,id:record.id};s.put(updated);done(updated);};});}
  remove(id) {return this.run('scores','readwrite',(s,done)=>{s.delete(id);done(true);});}
  setting(key,value) {return this.run('settings',value===undefined?'readonly':'readwrite',(s,done)=>{if(value===undefined)s.get(key).onsuccess=e=>done(e.target.result?.value);else{s.put({key,value});done(value);}});}
  async incoming() {return this.run('incoming','readonly',(s,done)=>{s.getAll().onsuccess=e=>done(e.target.result);});}
  consumeIncoming(id) {return this.run('incoming','readwrite',(s,done)=>{s.delete(id);done(true);});}
}
export async function fileHash(file) {const bytes=await file.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function scoreRecord(file,score,hash) {return {id:crypto.randomUUID(),title:score.title,filename:file.name.split(/[/\\]/).at(-1),composer:score.creator||'',importedAt:new Date().toISOString(),format:file.name.split('.').at(-1).toLowerCase(),hash,bytes:file,selectedPartId:null,settings:{},lastOpenedAt:null};}
export function storageMessage(error) {return error?.name==='QuotaExceededError'?'This device is out of space. Export a backup and remove scores you no longer need.':error?.message||'Your score could not be saved on this device.';}

// File metadata is explicit because some structured-clone implementations retain
// the Blob bytes/type but discard File.name. Older browser records remain readable.
export function incomingScoreFile(item) {
  const filename=item.filename||item.file?.name;
  if(!filename||!item.file)throw new Error('The shared score has no filename. Use Import Score to choose the original file.');
  return new File([item.file],filename,{type:item.mimeType??item.file.type??''});
}
