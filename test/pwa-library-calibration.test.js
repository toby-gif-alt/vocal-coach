import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import JSZip from 'jszip';
import {RepertoireStore,openLibrary,fileHash,scoreRecord} from '../src/repertoire-store.js';
import {validateScoreFile,validateXMLText,validateZipDirectory,inflateBounded} from '../src/file-safety.js';
import {assetURL,verified,byteRange,digest} from '../src/offline-cache.js';
import {calibrationFailure,microphoneError} from '../src/calibration-dialog.js';
import {AudioEngine} from '../src/audio-engine.js';

test('repertoire bytes, part and settings survive database reopen; duplicates do not overwrite',async()=>{
  const factory=new IDBFactory(),store=new RepertoireStore(factory);
  for(const ext of ['musicxml','xml','mxl']) {
    const file=new File([`original-${ext}`],`score.${ext}`,{type:ext==='mxl'?'application/vnd.recordare.musicxml':'application/xml'});
    const hash=await fileHash(file),record=scoreRecord(file,{title:'Score',creator:'Composer'},hash);
    await store.add(record);await store.update(record.id,{title:'Renamed',selectedPartId:'P2',settings:{tempoPercent:75,mode:'assisted'}});
    const found=await store.findHash(hash);assert.equal(found.title,'Renamed');assert.equal(await found.bytes.text(),`original-${ext}`);
    await store.add({...record,id:crypto.randomUUID()});assert.equal((await store.get(record.id)).settings.tempoPercent,75);
  }
  (await store.ready).close();const reopened=new RepertoireStore(factory);assert.equal((await reopened.list()).length,6);
  assert.ok((await reopened.list()).some(r=>r.selectedPartId==='P2'));
  (await reopened.ready).close();
});
test('removing one imported score removes its preferences and preserves other scores and settings',async()=>{
  const store=new RepertoireStore(new IDBFactory());const first={id:'a',title:'A',importedAt:'2026',settings:{tempoPercent:75}},second={id:'b',title:'B',importedAt:'2026',settings:{tempoPercent:120}};
  await store.add(first);await store.add(second);await store.setting('global-calibration',{signalGood:true});await store.remove('a');
  assert.equal(await store.get('a'),undefined);assert.equal((await store.get('b')).settings.tempoPercent,120);assert.equal((await store.setting('global-calibration')).signalGood,true);
  await store.setting('hidden-builtins',['piece.xml']);assert.deepEqual(await store.setting('hidden-builtins'),['piece.xml']);await store.setting('hidden-builtins',[]);assert.deepEqual(await store.setting('hidden-builtins'),[]);
  (await store.ready).close();
});
test('unavailable IndexedDB fails clearly instead of claiming saved repertoire',async()=>{
  await assert.rejects(openLibrary(null),/unavailable/);
});
test('file validation accepts score extensions and rejects unsafe types, entities and remote content',()=>{
  for(const ext of ['xml','musicxml','mxl'])validateScoreFile(new File(['x'],`score.${ext}`));
  assert.throws(()=>validateScoreFile(new File(['x'],'score.html')),/Choose/);
  assert.throws(()=>validateScoreFile({name:'score.xml',size:30*1024*1024,type:''}),/20 MB/);
  for(const xml of ['<!ENTITY bomb "x">','<!DOCTYPE score [<!ENTITY x "a">]>','<script/>','<image source="https://example.com/a"/>','<note onclick="x"/>'])assert.throws(()=>validateXMLText(xml));
  validateXMLText('<!DOCTYPE score-partwise PUBLIC "MusicXML" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise/>');
});
test('MXL directory limits and bounded decompression preserve original contents',async()=>{
  const zip=new JSZip();zip.file('score.musicxml','<score-partwise/>');const bytes=await zip.generateAsync({type:'arraybuffer'});validateZipDirectory(bytes);
  const opened=await JSZip.loadAsync(bytes);assert.equal(await inflateBounded(opened.file('score.musicxml')),'<score-partwise/>');
  await assert.rejects(inflateBounded(opened.file('score.musicxml'),5),/size limit/);
  assert.throws(()=>validateZipDirectory(new ArrayBuffer(5)),/damaged/);
  const huge=new JSZip();for(let i=0;i<257;i++)huge.file(`a${i}`, 'x');const many=await huge.generateAsync({type:"arraybuffer"});assert.throws(()=>validateZipDirectory(many),/too many/);
});
test('offline verification checks actual bytes and hashes; audio range requests work offline',async()=>{
  const bytes=new TextEncoder().encode('abcdef'),asset={bytes:6,sha256:await digest(bytes)};
  assert.ok(await verified(new Response(bytes),asset));assert.equal(await verified(new Response('abcxyz'),asset),false);assert.equal(await verified(new Response('abc'),asset),false);
  const range=await byteRange(new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}}),'bytes=2-4');assert.equal(range.status,206);assert.equal(await range.text(),'cde');assert.equal(range.headers.get('Content-Range'),'bytes 2-4/6');
  assert.equal((await byteRange(new Response(bytes),'bytes=10-20')).status,416);
  assert.equal(assetURL('samples/piano/a.mp3?v=1','https://example.com/vocal-coach/'),'https://example.com/vocal-coach/samples/piano/a.mp3');
  assert.throws(()=>assetURL('/outside','https://example.com/vocal-coach/'));
});
test('PWA metadata has valid project-relative entry points and real sized icons',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.name,'Vocal Coach');assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
  for(const icon of manifest.icons){const bytes=await readFile(new URL(`../${icon.src}`,import.meta.url));assert.equal(bytes.readUInt32BE(16),Number(icon.sizes.split('x')[0]));}
  assert.equal(new URL(manifest.start_url,'https://example.com/vocal-coach/manifest.webmanifest').pathname,'/vocal-coach/');
});
test('calibration diagnostics use measured quiet/clipping/noise categories and accurate permissions',()=>{
  assert.match(calibrationFailure({overloaded:true}),/too strong/);assert.match(calibrationFailure({sungRmsMedian:0}),/closer/);
  assert.match(calibrationFailure({sungRmsMedian:.05,signalToNoiseRatio:1,ambientRms:.02}),/Background/);
  assert.match(calibrationFailure({sungRmsMedian:.05,signalToNoiseRatio:5,ambientRms:.001}),/pitch samples/);
  assert.match(microphoneError({name:'NotAllowedError'}),/permission/);assert.match(microphoneError({name:'NotFoundError'}),/No microphone/);
});
test('a failed or cancelled recheck keeps the previous successful calibration',async()=>{
  const previous={signalGood:true,openThreshold:.01};
  for(const result of [null,{signalGood:false}]) {
    const states=[];const engine={baseMicrophoneCalibration:previous,microphoneGeneration:1,tone:{async start(){}},pausePitchSampling(){},async ensureMicrophoneStream(){},async runMicrophoneCheck(){return result;},stopMicrophone(){},onMicrophoneState:s=>states.push(s)};
    await AudioEngine.prototype.recheckMicrophone.call(engine);assert.equal(engine.baseMicrophoneCalibration,previous);assert.ok(!states.includes('ready'));
  }
});
test('late microphone permission after cancellation stops the acquired tracks',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let acquire,stopped=0;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{acquire=resolve;})}}});
  try {
    const engine={microphoneGeneration:0,listeningSetup:'headphones',onMicrophoneState(){}};
    const pending=AudioEngine.prototype.ensureMicrophoneStream.call(engine);engine.microphoneGeneration++;
    acquire({getTracks:()=>[{stop(){stopped++;}}]});await assert.rejects(pending,{name:'AbortError'});assert.equal(stopped,1);assert.equal(engine.stream,undefined);
  } finally {if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});
test('stale calibration frames cannot replace a successful saved result',async()=>{
  const oldRAF=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),0);
  const previous={signalGood:true},frames=Array.from({length:60},()=>({rms:.03,clarity:.9,frequency:220}));let writes=0;
  const engine={microphoneGeneration:0,baseMicrophoneCalibration:previous,onMicrophoneState(){},async collectMicrophoneCheckFrames(duration,voice){if(voice){this.microphoneGeneration++;return frames;}return Array(20).fill(.001);},setMicrophoneCalibration(){writes++;},onMicrophoneCalibration(){writes++;}};
  try {assert.equal(await AudioEngine.prototype.runMicrophoneCheck.call(engine),null);assert.equal(writes,0);assert.equal(engine.baseMicrophoneCalibration,previous);}
  finally{globalThis.requestAnimationFrame=oldRAF;}
});

test('cancelled recheck cannot publish a failure or stop a newer microphone stream',async()=>{
  const states=[];let stops=0;
  const engine={microphoneGeneration:1,tone:{async start(){}},pausePitchSampling(){},async ensureMicrophoneStream(){},async runMicrophoneCheck(){this.microphoneGeneration++;return null;},stopMicrophone(){stops++;},onMicrophoneState:s=>states.push(s)};
  assert.equal(await AudioEngine.prototype.recheckMicrophone.call(engine),null);assert.equal(stops,0);assert.deepEqual(states,[]);
});
test('concurrent microphone requests share one permission acquisition',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let acquire,calls=0,stops=0;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>{calls++;return new Promise(resolve=>{acquire=resolve;});}}}});
  try {
    const engine={microphoneGeneration:0,listeningSetup:'headphones',onMicrophoneState(){}};
    const first=AudioEngine.prototype.ensureMicrophoneStream.call(engine),second=AudioEngine.prototype.ensureMicrophoneStream.call(engine);
    const both=Promise.allSettled([first,second]);assert.equal(calls,1);engine.microphoneGeneration++;
    acquire({getTracks:()=>[{stop(){stops++;}}]});const results=await both;assert.ok(results.every(r=>r.status==='rejected'&&r.reason.name==='AbortError'));assert.equal(stops,1);
  }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

test('XML safety rejects protocol-relative and namespaced external references',()=>{
  assert.throws(()=>validateXMLText('<score-partwise><image source="//example.com/image.svg"/></score-partwise>'),/external content/);
  assert.throws(()=>validateXMLText('<score-partwise><image xlink:href="https://example.com/image.svg"/></score-partwise>'),/external content/);
});

test('cancelling during audio startup prevents a later microphone permission request',async()=>{
  let resume,requests=0;const engine={microphoneGeneration:0,tone:{start:()=>new Promise(resolve=>{resume=resolve;})},pausePitchSampling(){},async ensureMicrophoneStream(){requests++;}};
  const pending=AudioEngine.prototype.recheckMicrophone.call(engine);engine.microphoneGeneration++;resume();assert.equal(await pending,null);assert.equal(requests,0);
});
