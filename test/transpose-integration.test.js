import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AudioEngine} from '../src/audio-engine.js';
import {createTakeMetadata} from '../src/review-playback.js';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
test('active microphone take blocks transposition before parsing, stopping or changing targets',async()=>{
 const source=app.slice(app.indexOf('async function applyTransposition('),app.indexOf('\nfunction selectedPart()'));
 const state={score:{transposeSemitones:0},takeUsesMicrophone:true},audio={hasActivePerformanceRecording:true};let message;
 const deps={state,audio,calibrationDialog:{active:false},startingNoteDialog:{active:false},toast:m=>message=m,parseMusicXml(){throw Error('Must not parse during recording');}};
 const apply=new Function(...Object.keys(deps),source+';return applyTransposition;')(...Object.values(deps));await apply(2);assert.match(message,/Finish or stop/);assert.equal(state.score.transposeSemitones,0);
});
test('recording key context is immutable and blocks mismatched review until the key is restored',()=>{
 const take=createTakeMetadata({transposeSemitones:2,octaveShift:-12,guideOctaveShift:-12});assert.equal(take.transposeSemitones,2);assert.equal(take.guideOctaveShift,-12);assert.ok(Object.isFrozen(take));
 const state={recording:{take},score:{transposeSemitones:0}};
 const source=app.slice(app.indexOf('function recordingMatchesScore()'),app.indexOf('\nfunction renderTransposeSettings()'));
 const matches=new Function('state',source+';return recordingMatchesScore;')(state);assert.equal(matches(),false);state.score.transposeSemitones=2;assert.equal(matches(),true);state.score.transposeSemitones=-2;assert.equal(matches(),false);
});
test('changing engine score for transposition keeps Mixer settings and microphone stream',()=>{
 const calls=[],engine={partVolumes:new Map([['piano',37]]),partVoices:new Map([['voice','human']]),enabledPartIds:new Set(['piano']),stop:options=>calls.push(options),disposePlaybackEngines:()=>calls.push('dispose')};
 const volumes=engine.partVolumes,voices=engine.partVoices,enabled=engine.enabledPartIds,newScore={parts:[]};
 AudioEngine.prototype.setScore.call(engine,newScore,{preserveSettings:true});assert.equal(engine.score,newScore);assert.equal(calls[0].microphone,false);assert.equal(engine.partVolumes,volumes);assert.equal(engine.partVoices,voices);assert.equal(engine.enabledPartIds,enabled);
});
test('per-score preferences save transpose independently of the singer octave',()=>{
 const state={score:{transposeSemitones:3},guideSettings:{enabled:true},octaveByPart:{},selectedPartId:'voice',octaveShift:-12,partVolumes:{piano:37},partVoices:{},enabledParts:new Set(['piano'])};
 const source=app.slice(app.indexOf('function scorePreferences()'),app.indexOf('\nasync function persistScorePreferences()'));
 const saved=new Function('state','audio','$',source+';return scorePreferences();')(state,{tempoPercent:85},()=>({checked:true}));assert.equal(saved.transposeSemitones,3);assert.equal(saved.octaveShift,-12);assert.equal(saved.tempoPercent,85);assert.equal(saved.partVolumes.piano,37);
});
test('saved working preferences restore alongside transpose without resetting tempo or practice range',()=>{
 const state={savedPreferences:{tempoPercent:85,scoreView:'full',sectionStartMeasure:6,sectionEndMeasure:9,startMeasure:7,repeatPractice:true}};
 const els={tempoSlider:{},tempoOutput:{},bpmLabel:{}},repeat={checked:false},summary={};
 const audio={setTempo(p){this.tempoPercent=p;this.bpm=120*p/100;}};
 const deps={state,els,audio,$:id=>id==='#repeatPractice'?repeat:summary,setScoreView:v=>state.scoreView=v,selectedPart:()=>({}),validateSection:()=>({valid:true}),renderPracticeRangeControls(){}};
 const source=app.slice(app.indexOf('function restoreWorkingPreferences()'),app.indexOf('\nfunction scorePreferences()'));
 new Function(...Object.keys(deps),source+';restoreWorkingPreferences();')(...Object.values(deps));
 assert.equal(audio.tempoPercent,85);assert.equal(state.scoreView,'full');assert.equal(state.startMeasure,7);assert.equal(state.sectionStartMeasure,6);assert.equal(state.sectionEndMeasure,9);assert.equal(repeat.checked,true);
});
test('automatic preference saving skips a transposition until the new notation has rendered',async()=>{
 const source=app.slice(app.indexOf('async function persistScorePreferences()'),app.indexOf('\nasync function importAndOpen('));
 const save=new Function('state',source+';return persistScorePreferences;')({transposeBusy:true});await assert.doesNotReject(save());
});
