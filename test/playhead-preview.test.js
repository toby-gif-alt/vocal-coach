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
  return {click:handlers.click,state,calls};
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
  const fnSource=source.slice(source.indexOf('async function hearStartingNote()'),source.indexOf('\nfunction updateVolume('));
  const pitches=[],button={disabled:false};
  const deps={audio:{previewPitch:async midi=>pitches.push(midi)},state:{},els:{hearStartingNote:button},
    startingNoteForRange:()=>({midi:70}),effectiveOctaveShift:()=>-12,toast:()=>{},openStartingNote:()=>{throw Error('Preview should play directly');}};
  const preview=new Function(...Object.keys(deps),fnSource+'; return hearStartingNote;')(...Object.values(deps));
  await preview();assert.deepEqual(pitches,[58]);assert.equal(Boolean(button.disabled),false);
});
