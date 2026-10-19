import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionCents,demoFrequency,demoFrame,demoPhrase,singingTone,createTutorialDemos} from '../src/tutorial-demo.js';
import {guideSettings} from '../src/guide-settings.js';
import {PITCH_THRESHOLDS,colourForCents,frequencyToMidi} from '../src/config.js';
import {createTakeMetadata} from '../src/review-playback.js';
const notes=[0,1,2,3,4].map(i=>({id:String(i),midi:62+i,onsetQuarters:8+i,durationQuarters:1,measureNumber:i<3?3:4}));
const data={notes,shift:-12,targetMidi:50};
test('simulated flat and corrected audio frequencies agree with displayed cents and existing green threshold',()=>{
 assert.equal(correctionCents(0),-35);assert.equal(correctionCents(2.4),-35);
 let previous=-36;
 for(let t=0;t<=5.2;t+=.01){const frame=demoFrame('pitch',t,data);assert.ok(Math.abs((frequencyToMidi(frame.frequency)-data.targetMidi)*100-frame.cents)<.00001);assert.ok(frame.cents>=previous);previous=frame.cents;}
 assert.ok(Math.abs(correctionCents(5))<=PITCH_THRESHOLDS.green);assert.equal(colourForCents(correctionCents(5)),'#4ab982');assert.ok(demoFrequency(62,-35)<demoFrequency(62,0));
});
test('phrase cursor, simulated trace and actual sounding pitch use the same clock and preserve note IDs',()=>{
 const timeline=demoPhrase(notes);assert.equal(timeline.length,5);assert.equal(timeline[2].start,1.5);
 for(const entry of timeline){const f=demoFrame('phrase',entry.start+.2,data);assert.equal(f.targetId,entry.note.id);assert.equal(f.targetMidi,entry.note.midi-12);assert.ok(f.scoreQuarter>=entry.note.onsetQuarters&&f.scoreQuarter<=entry.note.onsetQuarters+1);assert.ok(Math.abs(frequencyToMidi(f.frequency)-f.midi)<1e-8);}
 assert.equal(demoPhrase(notes,'practice').length,4);assert.equal(demoPhrase(notes,'review').length,3);assert.ok(demoPhrase(notes,'tempo')[2].end-demoPhrase(notes,'tempo')[2].start>.75);
});
test('octave demo changes a temporary candidate; mixer plan reduces, mutes and restores independent layers',()=>{
 assert.equal(demoFrame('octaves',0,data).shift,0);assert.equal(demoFrame('octaves',3,data).shift,-12);
 assert.deepEqual([0,2.5,4.5,5.5,6.5].map(t=>demoFrame('mixer',t,data).mixStage),[0,1,2,3,4]);
});
function harness(){
 let now=0,callback=null;const calls=[],context={get currentTime(){return now;}};
 const adapter={blocked:()=>false,capture:()=>{calls.push('capture');return {original:1};},prepare:async()=>({...data,context}),sound:()=>{calls.push('audio');return ()=>calls.push('stop audio');},display(){calls.push('display');},mix(){},restore:s=>{assert.equal(s.original,1);calls.push('restore');},cleanup:()=>calls.push('cleanup')};
 const demo=createTutorialDemos(adapter,{request:fn=>{callback=fn;return 1;},cancel:()=>{callback=null;}});
 return {demo,adapter,calls,tick(seconds){now=seconds;callback?.();}};
}
test('demo does not start itself, and completion stops sound before restoring exactly once',async()=>{
 const h=harness();assert.equal(h.demo.active,false);assert.deepEqual(h.calls,[]);await h.demo.run('pitch');assert.equal(h.demo.active,true);h.tick(1);h.tick(7);assert.equal(h.demo.active,false);assert.equal(h.calls.filter(c=>c==='restore').length,1);assert.ok(h.calls.indexOf('stop audio')<h.calls.indexOf('restore'));h.demo.stop();assert.equal(h.calls.filter(c=>c==='restore').length,1);
});
test('Skip/Escape while asynchronous samples load cannot restart a cancelled demo',async()=>{
 const h=harness();let ready;h.adapter.prepare=()=>new Promise(resolve=>ready=resolve);const pending=h.demo.run('phrase');h.demo.stop();ready({...data,context:{currentTime:0}});assert.equal(await pending,false);assert.equal(h.demo.active,false);assert.ok(!h.calls.includes('audio'));assert.equal(h.calls.filter(c=>c==='restore').length,1);
});
test('blocked takes never enter demonstration state, and setup errors clean up',async()=>{
 const h=harness();h.adapter.blocked=()=>true;assert.equal(await h.demo.run('pitch'),false);assert.ok(!h.calls.includes('capture'));h.adapter.blocked=()=>false;h.adapter.prepare=async()=>{throw Error('unavailable');};let message;await h.demo.run('pitch',v=>message=v.message);assert.equal(message,'unavailable');assert.equal(h.demo.active,false);assert.equal(h.calls.filter(c=>c==='restore').length,1);
});
test('WebAudio curve is scheduled at the same frequencies as visual frames and disconnects every node',()=>{
 const nodes=[];class Node{constructor(){this.frequency={setValueCurveAtTime:(curve,start,duration)=>{this.curve=curve;this.curveStart=start;this.duration=duration;},value:0};this.gain={setValueAtTime(){},linearRampToValueAtTime(){},value:0};this.Q={value:0};nodes.push(this);}connect(){}disconnect(){this.disconnected=true;}start(){}stop(){}}
 const context={destination:{},createOscillator:()=>new Node(),createGain:()=>new Node(),createBiquadFilter:()=>new Node()};
 const stop=singingTone(context,62,10,5.2,correctionCents),osc=nodes.find(n=>n.curve);
 assert.ok(Math.abs(osc.curve[0]-demoFrequency(62,-35))<.001);assert.ok(Math.abs(osc.curve.at(-1)-demoFrequency(62,2))<.001);assert.equal(osc.curveStart,10);stop();assert.ok(nodes.every(n=>n.disconnected));
});
test('both practice modes start from the same shared enabled 92% guide',()=>{
 assert.deepEqual(guideSettings(),{enabled:true,volume:92});
 const restored=guideSettings({guideSettings:{enabled:false,volume:20}});assert.deepEqual(restored,{enabled:false,volume:20});
});
test('immutable take retains actual guide enabled, sound and volume without transposing accompaniment',()=>{
 const take=createTakeMetadata({mode:'assessment',guideEnabled:true,guideVoice:'synthetic-ah',guideVolume:70,guideOctaveShift:-12,octaveShift:-12,partVolumes:{piano:55}});assert.equal(take.guideOctaveShift,-12);assert.equal(take.guideVolume,70);assert.equal(take.guideEnabled,true);assert.equal(take.guideVoice,'synthetic-ah');assert.ok(Object.isFrozen(take));assert.equal(take.partVolumes.piano,55);assert.equal(createTakeMetadata({guideEnabled:false,guideVolume:0}).guideVolume,0);
});
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
test('all microphone sample paths return before touching live data during a demonstration',()=>{
 for(const [name,end]of [['handlePitchSample','handleRawPitchSample'],['handleRawPitchSample','handlePitchDiagnostic'],['handlePitchDiagnostic','handleMicrophoneState']]){
  const start=app.indexOf('function '+name+'(');const next=app.indexOf('\nfunction ',start+1);const fn=new Function('state',app.slice(start,next)+';return '+name+';')({tutorialDemoActive:true});assert.doesNotThrow(()=>fn({}));
 }
});
test('demo preferences cannot reach repertoire storage',async()=>{
 const source=app.slice(app.indexOf('async function persistScorePreferences()'),app.indexOf('\nasync function importAndOpen('));const save=new Function('state',source+';return persistScorePreferences;')({tutorialDemoActive:true});await assert.doesNotReject(save());
});

import {createDemoUI} from '../src/tutorial-demo-ui.js';
test('production demo adapter restores mixer, target, cursor and display without changing real take data',()=>{
 const previousDocument=globalThis.document;
 const element=(text='')=>({textContent:text,hidden:false,value:'',open:false,checked:false,className:'meter-original',attrs:new Map(),getAttribute(k){return this.attrs.get(k)??null;},setAttribute(k,v){this.attrs.set(k,v);},removeAttribute(k){this.attrs.delete(k);},classList:{contains:()=>false,toggle(){},remove(){}}});
 const ids=Object.fromEntries(['mixerPanel','tempoPanel','detectedNote','detectedFrequency','centsOutput','tuningPhase','repeatPractice','reviewCompanion','tempoSummary'].map(id=>[id,element(id)]));
 const tuningMeter=element(),performancePlayback=element(),tempoSlider=element(),tempoOutput=element(),bpmLabel=element(),guideVoice=element();
 const samples=[{midi:62}],previous=[{midi:60}],calibration={gate:.02},recording={take:createTakeMetadata({guideVolume:70})};
 const state={score:{parts:[]},guideSettings:guideSettings(),guideVoice:'human',partVolumes:{piano:65},partVoices:{piano:'human'},enabledParts:new Set(['piano']),cursorQuarter:8,lastFollowSystem:2,octaveShift:-12,samples,previousTakeTrace:previous,microphoneCalibration:calibration,recording};
 const calls=[],audio={tempoPercent:85,bpm:90,pausePitchSampling:()=>calls.push('pause'),setGuideVolume:v=>calls.push(['guide',v]),setGuideVoice(){},setPartVolume:(id,v)=>calls.push([id,v]),setPartEnabled(){},setPartVoice(){},setTempo(){}};
 const bridge={state,audio,els:{tuningMeter,performancePlayback,tempoSlider,tempoOutput,bpmLabel,guideVoice},$:s=>ids[s.slice(1)],renderMix(){},renderGuide(){},restoreCursor:q=>calls.push(['cursor',q]),restoreRange(){},layout(){},octaves:()=>({closeDemo(){}})};
 globalThis.document={querySelector:()=>element(),querySelectorAll:()=>[],body:element()};
 try{
  const ui=createDemoUI(bridge),snapshot=ui.capture();
  state.guideSettings.enabled=false;state.partVolumes.piano=30;state.guideVoice='synthetic-ah';state.enabledParts.clear();tuningMeter.className='demo';ids.detectedNote.textContent='simulated';
  ui.restore(snapshot);ui.cleanup();
  assert.equal(state.partVolumes.piano,65);assert.equal(state.guideSettings.enabled,true);assert.equal(state.guideVoice,'human');assert.deepEqual([...state.enabledParts],['piano']);assert.equal(state.octaveShift,-12);assert.equal(state.tutorialDemoActive,false);assert.equal(tuningMeter.className,'meter-original');assert.equal(ids.detectedNote.textContent,'detectedNote');assert.ok(calls.some(c=>Array.isArray(c)&&c[0]==='cursor'&&c[1]===8));
  assert.equal(state.samples,samples);assert.equal(state.previousTakeTrace,previous);assert.equal(state.microphoneCalibration,calibration);assert.equal(state.recording,recording);
 }finally{globalThis.document=previousDocument;}
});
