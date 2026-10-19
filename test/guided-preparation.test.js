import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('let startingCheckToken='),app.indexOf('\nfunction renderGuideSettings()'));
function check({microphone=true,preview=async()=>{}}={}){
 const calls=[],classes=new Set(),jobs=[];
 const state={octaveMismatchDetector:{clear:()=>calls.push('clear'),reset:()=>calls.push('reset')},samples:[],rawSamples:[],recording:{original:true}};
 const audio={previewPitch:preview,pausePitchSampling:()=>calls.push('pause'),startPitchSampling:()=>calls.push('listen'),pitchTracker:{reset:()=>calls.push('tracker reset')}};
 const els={hearStartingNote:{},tuningMeter:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},tuningPhase:{}};
 const deps={state,audio,els,usingMicrophone:()=>microphone,startingNoteForRange:()=>({midi:50}),effectiveOctaveShift:()=>-12,targetMidiAtQuarter:()=>50,clearOctaveSuggestion:()=>calls.push('dismiss'),toast:()=>calls.push('error'),setTimeout:(fn,ms)=>{jobs.push({fn,ms});return jobs.length;},clearTimeout:()=>{jobs.length=0;}};
 const fn=new Function(...Object.keys(deps),source+';return {hearStartingNote,endStartingCheck};')(...Object.values(deps));
 return {...fn,state,audio,els,calls,classes,jobs};
}
test('starting-note check waits for the selected preview and its decay before sampling, without recording',async()=>{
 const pitches=[],h=check({preview:async midi=>pitches.push(midi)});
 await h.hearStartingNote();assert.deepEqual(pitches,[38]);assert.ok(h.classes.has('starting-check'));
 assert.ok(h.calls.includes('pause'));assert.ok(!h.calls.includes('listen'));assert.equal(h.jobs[0].ms,1250);
 h.jobs[0].fn();assert.ok(h.calls.includes('listen'));assert.equal(h.els.tuningPhase.textContent,'Now sing that note!');assert.equal(h.audio.targetMidiAtQuarter(),null);
 assert.deepEqual(h.state.samples,[]);assert.deepEqual(h.state.rawSamples,[]);assert.deepEqual(h.state.recording,{original:true});
});
test('ending preparation cancels pending listening and leaves manual octave selection available',async()=>{
 const h=check();await h.hearStartingNote();const pending=h.jobs[0].fn;h.endStartingCheck();pending();assert.ok(!h.calls.includes('listen'));assert.equal(h.state.startingCheck,false);assert.equal(h.audio.octaveSetupActive,false);assert.ok(!h.classes.has('starting-check'));
});
test('microphone-free preview plays without requesting setup or starting observation',async()=>{
 const pitches=[],h=check({microphone:false,preview:async midi=>pitches.push(midi)});await h.hearStartingNote();assert.deepEqual(pitches,[38]);assert.equal(h.jobs.length,0);assert.ok(!h.calls.includes('listen'));assert.ok(!h.classes.has('starting-check'));
});
test('an octave confirmation is deferred during a recorded take',()=>{
 const text=app.slice(app.indexOf('function renderOctaveSuggestion()'),app.indexOf('\nfunction dismissOctaveSuggestion'));
 let shown=0;const elements=new Map();const $=s=>{if(!elements.has(s))elements.set(s,{showModal(){shown++;}});return elements.get(s);};
 const state={octaveShift:0,sessionOctaveShift:0,octaveSuggestion:{shift:-12,relativeShift:-12,writtenMidi:50,sungMidi:37}},audio={isPlaying:true};
 const fn=new Function('state','audio','$','document','pitchName',text+';return renderOctaveSuggestion;')(state,audio,$,{querySelector:()=>null},midi=>String(midi));
 fn();assert.equal(shown,0);audio.isPlaying=false;state.sessionOctaveShift=null;fn();assert.equal(shown,1);assert.equal($('#acceptOctaveSuggestion').textContent,'Switch to 38');
});
