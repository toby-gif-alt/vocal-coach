import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const pointerSource = source.slice(source.indexOf('function wirePracticePointers()'), source.indexOf('\nfunction renderAccompaniment()'));
function setupClick(playing=false) {
  const calls=[], handlers={}, state={measureGeometry:[],scoreGeometry:new Map()}, audio={isPlaying:playing};
  const deps={state,audio,els:{scoreContainer:{addEventListener:(name,fn)=>{handlers[name]=fn;},querySelectorAll:()=>[{getScreenCTM:()=>({inverse:()=>({})})}]}},
    document:{addEventListener(){}},DOMPoint:class {matrixTransform(){return {x:50,y:50};}},
    scorePositionAtPoint:()=>({measure:4,quarter:13}),startingNoteDialog:{active:false},calibrationDialog:{active:false},
    stop:async()=>{calls.push('stop');audio.isPlaying=false;},currentPracticeRange:()=>({sectionStartMeasure:2,sectionEndMeasure:6}),
    setCursorToQuarter:q=>calls.push(['cursor',q]),updatePosition:q=>calls.push(['position',q]),renderPracticeRangeControls:()=>{},
    setPlaybackState:s=>calls.push(['state',s]),setStatus:()=>{},play:()=>{throw Error('Click must never start playback');}};
  new Function(...Object.keys(deps),pointerSource+'; wirePracticePointers();')(...Object.values(deps));
  return {click:handlers.click,state,calls,deps};
}
test('clicking the score positions the green line and waits for Play',async()=>{
  const {click,state,calls}=setupClick();await click({clientX:50,clientY:50});
  assert.equal(state.startMeasure,4);assert.equal(state.playbackStartQuarter,13);
  assert.deepEqual(calls,[['cursor',13],['position',13],['state','stopped']]);
});
test('clicking during playback stops before positioning and does not restart',async()=>{
  const {click,calls}=setupClick(true);await click({clientX:50,clientY:50});
  assert.equal(calls[0],'stop');assert.deepEqual(calls.at(-1),['state','stopped']);
});
test('Hear starting note plays the selected singing pitch without opening a dialog',async()=>{
  const fnSource=source.slice(source.indexOf('async function hearStartingNote()'),source.indexOf('\nfunction renderGuideSettings('));
  const pitches=[],button={disabled:false};
  const deps={audio:{previewPitch:async midi=>pitches.push(midi)},state:{mode:'assisted',microphoneDecision:'skipped',startingConfirmedSession:true},MODE_CONFIG:{listen:{microphone:false}},els:{hearStartingNote:button},
    startingNoteForRange:()=>({midi:70}),effectiveOctaveShift:()=>-12,toast:()=>{},openStartingNote:()=>{throw Error('Preview should play directly');}};
  const preview=new Function(...Object.keys(deps),'let startingCheckToken=0,startingCheckTimer=null;function endStartingCheck(){} function clearOctaveSuggestion(){} function usingMicrophone(){return false;} state.octaveMismatchDetector={clear(){}};'+fnSource+'; return hearStartingNote;')(...Object.values(deps));
  await preview();assert.deepEqual(pitches,[58]);assert.equal(Boolean(button.disabled),false);
});

test('score clicks while feedback is open seek review without changing practice range or starting playback',async()=>{
 const h=setupClick();h.state.recording={take:{}};
 // Build the pointer handler with a visible review and a review seek spy.
 const calls=[],deps={...h.deps,els:{...h.deps.els,resultsPanel:{open:true},performancePlayback:{hidden:false}},selectReviewScorePosition:q=>calls.push(q)};
 const handlers={};deps.els.scoreContainer={...h.deps.els.scoreContainer,addEventListener:(name,fn)=>handlers[name]=fn};
 new Function(...Object.keys(deps),pointerSource+';wirePracticePointers();')(...Object.values(deps));
 await handlers.click({clientX:50,clientY:50});assert.deepEqual(calls,[13]);
 assert.equal(h.state.playbackStartQuarter,undefined);assert.equal(h.state.scoreSeeking,false);
});

test('main Restart clears a clicked start and practice section before resetting the transport',async()=>{
 const state={playbackGeneration:2,playbackStartQuarter:13,sectionStartMeasure:3,sectionEndMeasure:6,startMeasure:4,samples:[1],rawSamples:[1],acceptedSamples:[1],visualTraceSamples:[1]};
 const calls=[],repeat={checked:true};
 const deps={state,$:()=>repeat,selectedPart:()=>({}),practiceLimits:()=>({firstMeasure:1}),currentPracticeRange:()=>({startQuarter:state.playbackStartQuarter??0,startMeasure:state.startMeasure}),audio:{hasActivePerformanceRecording:false,stop:settings=>calls.push(settings.resetQuarter),discardPerformanceRecording(){}},closeTakeFeedback(){},closeFloatingReview(){},renderPracticeRangeControls(){},usingMicrophone:()=>false,unlockSessionOctave(){},cancelAnimationFrame(){},archiveCompletedTrace(){},resetPitchDiagnostics(){},els:{sampleCount:{},resultsPanel:{}},clearPerformancePlayback(){},renderTakeTraces(){},setPlaybackState(){},setCursorToQuarter:q=>calls.push(q),updatePosition(){},setStatus(){}};
 const fn=source.slice(source.indexOf('async function restartTransport()'),source.indexOf('\nfunction setTransportBusy('));
 await new Function(...Object.keys(deps),fn+';return restartTransport();')(...Object.values(deps));
 assert.equal(state.startMeasure,1);assert.equal(state.playbackStartQuarter,null);assert.equal(state.sectionStartMeasure,null);assert.equal(state.sectionEndMeasure,null);assert.equal(repeat.checked,false);assert.deepEqual(calls,[0,0]);
});

test('adjusting tempo preserves a selected score position while refreshing playback duration',()=>{
 const start=source.indexOf('  els.tempoSlider.addEventListener("input", () => {'),end=source.indexOf('\n  });',start)+6;
 let input;const positions=[];const state={cursorQuarter:13};
 const els={tempoSlider:{value:'70',addEventListener:(name,fn)=>input=fn},tempoOutput:{},bpmLabel:{},totalTime:{},dockTotalTime:{}};
 const audio={setTempo(value){this.bpm=120*Number(value)/100;}};
 const deps={state,els,audio,$:()=>({}),currentPracticeRange:()=>({startQuarter:0,endQuarter:20}),formatTime:s=>s,updatePosition:q=>positions.push(q)};
 new Function(...Object.keys(deps),source.slice(start,end))(...Object.values(deps));input();
 assert.equal(audio.bpm,84);assert.deepEqual(positions,[13]);assert.equal(els.tempoOutput.textContent,'70%');assert.equal(els.totalTime.textContent,20*60/84);
});
