import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SESSION_MODES,PLAYBACK_CONFIG} from '../src/config.js';
import {guideSettings,practiceMode} from '../src/guide-settings.js';
import {createTakeMetadata} from '../src/review-playback.js';
import {createCalibrationDialog} from '../src/calibration-dialog.js';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const extract=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to));
const compile=(code,name,deps)=>new Function(...Object.keys(deps),code+';return '+name+';')(...Object.values(deps));

test('exactly Assisted and Assessment share enabled-guide defaults and legacy Listen maps to Assisted',()=>{
 assert.deepEqual(Object.keys(SESSION_MODES),['assisted','assessment']);
 for(const mode of Object.values(SESSION_MODES))assert.equal(mode.guide,true);
 for(const old of [undefined,'listen','invalid','assisted'])assert.equal(practiceMode(old),'assisted');
 assert.equal(practiceMode('assessment'),'assessment');
 assert.deepEqual(guideSettings(),{enabled:true,volume:PLAYBACK_CONFIG.defaultGuideVolume});
 assert.equal(createTakeMetadata({mode:'assisted'}).guideVolume,createTakeMetadata({mode:'assessment'}).guideVolume);
});
test('guide migration keeps deliberate choices and replaces automatic old mode defaults',()=>{
 const old={listen:{enabled:true,volume:92},assisted:{enabled:true,volume:92},assessment:{enabled:true,volume:70}};
 assert.deepEqual(guideSettings({mode:'assessment',guideByMode:old,guideVolume:70}),{enabled:true,volume:92});
 assert.deepEqual(guideSettings({mode:'assessment',guideByMode:{...old,assessment:{enabled:false,volume:70}}}),{enabled:false,volume:70});
 assert.deepEqual(guideSettings({mode:'assisted',guideByMode:{...old,assessment:{enabled:true,volume:46}}}),{enabled:true,volume:46});
 assert.deepEqual(guideSettings({mode:'listen',guideByMode:{...old,listen:{enabled:false,volume:0}}}),{enabled:false,volume:0});
 assert.deepEqual(guideSettings({mode:'assisted',guideVolume:58}),{enabled:true,volume:58});
 assert.deepEqual(guideSettings({guideSettings:{enabled:false,volume:24},guideByMode:old}),{enabled:false,volume:24});
 assert.deepEqual(guideSettings({guideSettings:{enabled:true,volume:120}}),{enabled:true,volume:100});
});
test('changing feedback mode does not change guide, octave or acquire a microphone; active takes stay locked',()=>{
 const guide={enabled:false,volume:38},state={mode:'assisted',guideSettings:guide,octaveShift:-24};
 const audio={},buttons=['assisted','assessment'].map(mode=>({dataset:{mode},classList:{toggle(){}},setAttribute(){}}));
 let permissions=0;
 const set=compile(extract('function setMode(','async function play('),'setMode',{state,audio,MODE_CONFIG:SESSION_MODES,els:{modeButtons:buttons},startingNoteDialog:{},calibrationDialog:{},renderGuideSettings(){},clearOctaveSuggestion(){},updateSetupSummary(){},updatePracticeMicrophoneUI(){},updatePosition(){},usingMicrophone:()=>false,musicOnlyStatus(){},activateMicrophonePreparation(){permissions++;}});
 set('assessment');assert.equal(state.mode,'assessment');set('assisted');assert.equal(state.guideSettings,guide);assert.equal(guide.volume,38);assert.equal(guide.enabled,false);assert.equal(state.octaveShift,-24);assert.equal(permissions,0);
 audio.isPlaying=true;set('assessment');assert.equal(state.mode,'assisted');
});
function playbackHarness(mode,microphone){
 const state={score:{},mode,microphoneDecision:microphone?'ready':'skipped',selectedPartId:'S',guideSettings:{enabled:false,volume:50},guideVoice:'human',visualTraceSamples:[],octaveShift:-24,enabledParts:new Set(['P']),partVolumes:{P:60},partVoices:{},samples:[],activeTake:null,countInBars:0};
 const calls={takes:0,clears:0},audio={hasMicrophoneStream:microphone,tempoPercent:100,bpm:72,play:async settings=>calls.play=settings,discardPerformanceRecording(){}};
 const deps={state,audio,startingNoteDialog:{},calibrationDialog:{},els:{studioView:{},resultsPanel:{},sampleCount:{}},$:()=>({}),cancelScoreSelection(){},closeTakeFeedback(){},closeFloatingReview(){},tutorial:{setActive(){}},updateSetupSummary(){},stopPerformanceReview(){},usingMicrophone:compile(extract('function usingMicrophone()','function updatePracticeMicrophoneUI()'),'usingMicrophone',{state,audio}),activateMicrophonePreparation(){throw Error('Skipped sessions must not request microphone');},currentPracticeRange:()=>({startQuarter:0,endQuarter:4,startMeasure:1,endMeasure:1}),lockSessionOctave:()=>-24,effectiveOctaveShift:()=>-24,archiveCompletedTrace:compile(extract('function archiveCompletedTrace()','function commitVisualTrace('),'archiveCompletedTrace',{state}),resetPitchDiagnostics(){},createTakeMetadata:settings=>{calls.takes++;return createTakeMetadata(settings);},renderTakeTraces(){},clearPerformancePlayback(){calls.clears++;},setTransportBusy(){},targetMidiAtQuarter(){},setPlaybackState(){},startSync(){}};
 return {state,calls,play:compile(extract('async function play(','function pause()'),'play',deps)};
}
test('both modes play without microphone capture and preserve the selected guide octave',async()=>{
 for(const mode of ['assisted','assessment']){
  const h=playbackHarness(mode,false);await h.play();assert.equal(h.calls.play.assessmentMode,false);assert.equal(h.calls.play.guideOctaveShift,-24);assert.equal(h.calls.play.guideEnabled,false);assert.equal(h.calls.takes,0);assert.equal(h.calls.clears,0);assert.equal(h.state.activeTake,null);assert.equal(h.state.takeUsesMicrophone,false);
 }
});
test('both modes use identical recorded-playback settings and immutable metadata when microphone is active',async()=>{
 for(const mode of ['assisted','assessment']){
  const h=playbackHarness(mode,true);await h.play();assert.equal(h.calls.play.assessmentMode,true);assert.equal(h.state.takeUsesMicrophone,true);assert.equal(h.calls.takes,1);assert.equal(h.state.activeTake.mode,mode);assert.equal(h.state.activeTake.guideEnabled,false);assert.equal(h.state.activeTake.guideOctaveShift,-24);assert.equal(h.state.activeTake.guideVolume,50);assert.ok(Object.isFrozen(h.state.activeTake));
 }
});
test('finishing music-only playback cannot fabricate an assessment or replace an existing recording',async()=>{
 const recording={url:'blob:previous'},state={takeUsesMicrophone:false,recording};
 const finish=compile(extract('async function finishAssessment()','function clearPerformancePlayback()'),'finishAssessment',{state});await finish();assert.equal(state.recording,recording);assert.equal(state.activeTake,undefined);
});
test('skip cancels pending activation and enabling later retains score, guide and chosen octave',async()=>{
 const state={microphoneActivationToken:3,microphoneDecision:'unchecked',microphoneCalibration:{signalGood:true},octaveShift:-24,score:{id:'score'},guideSettings:{enabled:false,volume:38}},audio={hasMicrophoneStream:false,stopMicrophone(){this.hasMicrophoneStream=false;},async startMicrophoneMonitoring(){this.hasMicrophoneStream=true;}};
 const deps={endStartingCheck(){},state,audio,tutorial:{setActive(){}},setTransportBusy(){},updatePracticeMicrophoneUI(){},musicOnlyStatus(){},calibrationDialog:{async open(){return true;}},targetMidiAtQuarter(){},updatePosition(){},setStatus(){}};
 const skip=compile(extract('function skipPracticeMicrophone()','async function activateMicrophonePreparation('),'skipPracticeMicrophone',deps);skip();assert.equal(state.microphoneDecision,'skipped');assert.equal(state.microphoneActivationToken,4);
 const enable=compile(extract('async function activateMicrophonePreparation(','function setMode('),'activateMicrophonePreparation',deps);assert.equal(await enable(++state.microphoneActivationToken,{recheck:true}),true);assert.equal(state.microphoneDecision,'ready');assert.equal(state.octaveShift,-24);assert.deepEqual(state.guideSettings,{enabled:false,volume:38});assert.equal(state.score.id,'score');
});
test('calibration failure offers retry/continue; successful retry enables only after explicit Continue',async()=>{
 const previous=globalThis.document,nodes=new Map();let attempts=0,cancels=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{handlers:{},hidden:false,addEventListener(event,fn){this.handlers[event]=fn;},removeAttribute(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 globalThis.document={querySelector:node};
 try{
  const dialog=createCalibrationDialog({audio:{async recheckMicrophone(){attempts++;return {signalGood:true};},stopMicrophone(){}},onCancel:()=>cancels++});
  const pending=dialog.open({keepActive:true,error:{name:'NotAllowedError'}});assert.equal(node('#calibrationTitle').textContent,'Continue without microphone?');assert.equal(node('#startCalibrationButton').textContent,'Try microphone again');assert.equal(attempts,0);
  node('#startCalibrationButton').handlers.click();await Promise.resolve();await Promise.resolve();assert.equal(node('#calibrationTitle').textContent,'Microphone ready!');assert.equal(dialog.active,true);node('#finishCalibrationButton').handlers.click();assert.equal(await pending,true);assert.equal(cancels,0);
  const skipped=dialog.open({error:{name:'NotFoundError'}});node('#cancelCalibrationButton').handlers.click();assert.equal(await skipped,false);assert.equal(cancels,1);
 }finally{globalThis.document=previous;}
});

test('a real recorded take opens compact review in Assisted and measured coaching only in Assessment',async()=>{
 for(const mode of ['assisted','assessment']){
  const take=createTakeMetadata({mode,bpm:72,guideOctaveShift:-24,octaveShift:-24,guideEnabled:true,guideVolume:50,startQuarter:0,endQuarter:4,startMeasure:1,endMeasure:1});
  const state={mode,takeUsesMicrophone:true,activeTake:take,samples:[{scoreQuarter:0,midi:46}],recordingAvailable:true},calls={review:0,coaching:0,analysis:0,recordings:0};
  const els=Object.fromEntries(['resultsKicker','coachLevel','coachObservations','detailedAnalysis','assessmentScope','coachIntro','resultsPanel'].map(key=>[key,{}]));
  const deps={endStartingCheck(){},state,els,audio:{currentQuarter:4,async finishPerformanceRecording(){return {url:'blob:voice'};},stop(){}},selectedPart:()=>({vocalTimeline:[{midi:70}]}),measureAtQuarter:()=>1,createTakeMetadata,usingMicrophone:()=>true,unlockSessionOctave(){},renderOctaveSuggestion(){},cancelAnimationFrame(){},setPlaybackState(){},setCursorToQuarter(){},updatePosition(){},attachPerformanceRecording(){calls.recordings++;},$:()=>({checked:false}),assessmentRangeLabel:()=> 'bars 1–1',openFloatingReview(){calls.review++;},setStatus(){},clipTimelineToRange:()=>[{midi:70}],midiToName:()=> 'B♭2',sampleWithinRange:()=>true,analysePerformance:()=>{calls.analysis++;return [];},renderResults(){},showTakeFeedback(){calls.coaching++;}};
  const finish=compile(extract('async function finishAssessment()','function clearPerformancePlayback()'),'finishAssessment',deps);await finish();
  assert.equal(calls.recordings,1);assert.equal(calls.review,mode==='assisted'?1:0);assert.equal(calls.coaching,mode==='assessment'?1:0);assert.equal(calls.analysis,mode==='assessment'?1:0);assert.equal(state.takeUsesMicrophone,false);assert.equal(state.takeCompleted,true);assert.equal(state.activeTake.guideOctaveShift,-24);
 }
});
