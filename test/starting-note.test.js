import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PitchDetector} from '../vendor/pitchy.mjs';
import {AUDIO_CONFIG,midiToFrequency,frequencyToMidi} from '../src/config.js';
import {StartingPitchModel,octaveCards,octaveMarkerPosition,pitchName} from '../src/starting-note.js';
import {OctaveMismatchDetector} from '../src/octave-selection.js';
import {StablePitchTracker,shouldCorroboratePitch} from '../src/pitch-tracker.js';
import {prepareOffline} from '../src/pwa.js';
import {readFile} from 'node:fs/promises';
const measured=(midi,time)=>({rawFrequency:midiToFrequency(midi),clarity:.98,gateOpen:true,capturedAt:time,rms:.1});
test('actual starting MIDI produces large descending four-octave choices',()=>{
  assert.deepEqual(octaveCards(70).map(c=>[c.shift,c.name]),[[12,'B♭5'],[0,'B♭4'],[-12,'B♭3'],[-24,'B♭2']]);
  assert.equal(octaveCards(58).at(-1).supported,true);assert.equal(octaveCards(46).at(-1).supported,false);
  assert.equal(pitchName(60),'C4');
});
test('live marker places a genuine two-octave difference and continuous intermediate pitches',()=>{
  const m=new StartingPitchModel();let result;
  for(let t=0;t<10000;t+=46)result=m.observe(measured(46,t),70);
  assert.equal(result.near,-24);assert.equal(result.suggested,-24);assert.equal(result.position,1);
  assert.equal(octaveMarkerPosition(64,70),.5);assert.equal(octaveMarkerPosition(82,70),0);
  assert.equal(octaveMarkerPosition(70,70),1/3);assert.equal(m.current(11000),null);
});
test('no selection, fake silence pitch or unreliable input is manufactured',()=>{
  const m=new StartingPitchModel();assert.equal(m.observe({...measured(46,0),gateOpen:false},70),null);
  assert.equal(m.observe({...measured(46,46),clarity:NaN},70),null);
  for(const t of [0,46,92])m.observe(measured(46,t),70);
  assert.equal(m.current(800),null);assert.equal(m.value,null);
  assert.equal(m.observe({...measured(20,1000)},70),null);
});
test('natural vibrato stays near the measured fundamental without score-led octave correction',()=>{
  const m=new StartingPitchModel();let result;
  for(let t=0;t<2000;t+=46)result=m.observe(measured(46+.15*Math.sin(t/50),t),70);
  assert.ok(Math.abs(result.midi-46)<.2);assert.equal(result.near,-24);
});
function tone(hz,rate,size,{harmonic=0}={}){return Float32Array.from({length:size},(_,i)=>.12*Math.sin(2*Math.PI*hz*i/rate)+harmonic*Math.sin(4*Math.PI*hz*i/rate));}
test('real vendored Pitchy recognises extended low fundamentals with an 8192-sample window',()=>{
  for(const rate of [44100,48000,96000])for(const hz of [41.203,49,55,58.27,65.406,116.54]){
    const frame=tone(hz,rate,AUDIO_CONFIG.lowAnalyserSize),[frequency,clarity]=PitchDetector.forFloat32Array(frame.length).findPitch(frame,rate);
    assert.ok(Math.abs(frequencyToMidi(frequency)-frequencyToMidi(hz))*100<15,`${rate}: ${hz} -> ${frequency}`);assert.ok(clarity>.95);
  }
});
test('low notes with a strong second harmonic still retain a real fundamental',()=>{
  for(const hz of [55,58.27,116.54]){
    const frame=tone(hz,48000,8192,{harmonic:.18}),[frequency]=PitchDetector.forFloat32Array(frame.length).findPitch(frame,48000);
    assert.ok(Math.abs(frequencyToMidi(frequency)-frequencyToMidi(hz))*100<15);
  }
});
test('normal-range detection retains its shorter window and ordinary tracker behaviour',()=>{
  for(const hz of [220,261.63,440,880]){const frame=tone(hz,48000,4096),[frequency,clarity]=PitchDetector.forFloat32Array(frame.length).findPitch(frame,48000);assert.ok(Math.abs(frequencyToMidi(frequency)-frequencyToMidi(hz))*100<15);assert.ok(clarity>.95);}
  const tracker=new StablePitchTracker();let sample;
  for(let t=0;t<1200;t+=46)sample=tracker.process({...measured(34,t),frequency:midiToFrequency(34),minimumClarity:.78,targetMidi:58});
  assert.equal(sample.status,'accepted');assert.ok(Math.abs(sample.filteredMidi-34)<.1);assert.equal(sample.octaveCorrection,0);
});
test('mismatch suggestions support two-octave differences without mutating the target',()=>{
  const detector=new OctaveMismatchDetector();let result;
  for(let t=0;t<3000;t+=46){result=detector.observe({sample:{...measured(46,t),filteredMidi:46,status:'accepted',corroboratingFrequency:midiToFrequency(46)},writtenMidi:70,currentShift:0,noteId:'first',phase:'preparation'})||result;}
  assert.equal(result.shift,-24);assert.equal(result.relativeShift,-24);
});
test('automatic preparation verifies existing assets and repairs only an incomplete active cache',async()=>{
  const calls=[],reg={active:{},async update(){calls.push('update');}};
  await prepareOffline(reg,async(worker,type)=>{calls.push(type);return {ready:true};});assert.deepEqual(calls,['VERIFY','update']);
  calls.length=0;await prepareOffline(reg,async(worker,type)=>{calls.push(type);return {ready:type==='DOWNLOAD'};});assert.deepEqual(calls,['VERIFY','DOWNLOAD','update']);
  await assert.rejects(prepareOffline(reg,async()=>({ready:false,error:'No space'})),/No space/);
});
test('studio has a single tutorial, a single visible transport and automatic device saving',async()=>{
  const html=await readFile('index.html','utf8'),app=await readFile('app.js','utf8'),tour=await readFile('src/tutorial.js','utf8');
  assert.match(html, /studioHeaderControls[\s\S]*studioTutorialButton/);
  assert.match(html,/changePartButton[^>]*>Change part/);
  assert.match(html,/legacy-transport" hidden aria-hidden="true"/);assert.equal((html.match(/id="transportDock"/g)||[]).length,1);
  const home=html.slice(0,html.indexOf('id="loadingView"'));assert.ok(!home.includes('downloadOfflineButton'));assert.ok(home.includes('installAppButton'));assert.ok(!html.includes('Retry offline setup'));assert.ok(!html.includes('id="offlineStatus"'));assert.ok(html.includes('Add Vocal Coach to this device'));
  assert.match(app,/listen:usingMicrophone\(\)/);assert.match(app,/sessionOctaveShift !== null \|\| audio.isPlaying/);
  assert.ok(!app.includes('OCTAVE_SELECTION_CONFIG.responseWindowMs'));assert.ok(!tour.includes('window.scrollTo'));
});

test('flat and sharp singing shades its octave area without claiming a precise match',()=>{
  for(const midi of [44.5,47.5]) {const m=new StartingPitchModel();let r;for(let t=0;t<1200;t+=46)r=m.observe(measured(midi,t),70);assert.equal(r.region,-24);assert.equal(r.near,null);assert.equal(r.suggested,null);assert.ok(Math.abs(r.midi-midi)<.01);}
});
test('steady one- and two-octave mismatch gets corroboration even after continuity catches up',()=>{
  assert.equal(shouldCorroboratePitch(46,46,70),true);assert.equal(shouldCorroboratePitch(58,58,70),true);assert.equal(shouldCorroboratePitch(70,70,70),false);
});

test('a lost update connection does not invalidate a fully verified offline app',async()=>{
  const reg={active:{},async update(){throw Error('Offline');}};await prepareOffline(reg,async()=>({ready:true}));
  await assert.rejects(prepareOffline({...reg,active:null},async()=>({ready:true})),/Offline/);
});
test('octave choices survive a database reopen independently for each score part',async()=>{
  const {RepertoireStore}=await import('../src/repertoire-store.js'),{IDBFactory}=await import('fake-indexeddb');
  const factory=new IDBFactory(),store=new RepertoireStore(factory),bytes=new Blob(['original score'],{type:'application/xml'});
  await store.add({id:'score',importedAt:'2026',bytes,settings:{octaveByPart:{soprano:{shift:-24,chosen:true},tenor:{shift:-12,chosen:true}}}});
  (await store.ready).close();const reopened=new RepertoireStore(factory),record=await reopened.get('score');
  assert.equal(record.settings.octaveByPart.soprano.shift,-24);assert.equal(record.settings.octaveByPart.tenor.shift,-12);assert.equal(record.settings.octaveByPart.soprano.chosen,true);assert.equal(await record.bytes.text(),'original score');(await reopened.ready).close();
});
