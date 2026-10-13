import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OctaveMismatchDetector } from '../src/octave-selection.js';
import { midiToFrequency } from '../src/config.js';

function sing(detector, offset, { phase='performance', currentShift=0, count=42, singleNote=false, overrides={} }={}) {
  const results=[];
  for(let i=0;i<count;i++) {
    const writtenMidi=singleNote?67:(i<20?60:64);
    results.push(detector.observe({phase,currentShift,writtenMidi,noteId:singleNote?'n1':(i<20?'n1':'n2'),sample:{status:'accepted',clarity:.95,filteredMidi:writtenMidi+currentShift+offset,corroboratingFrequency:midiToFrequency(writtenMidi+currentShift+offset),capturedAt:i*50,...overrides}}));
  }
  return results.find(Boolean);
}
test('reliable singing across notes suggests one octave lower or higher',()=>{
  for(const offset of [-12,12]) {
    const suggestion=sing(new OctaveMismatchDetector(),offset);
    assert.equal(suggestion.shift,offset);assert.equal(suggestion.relativeShift,offset);assert.equal(suggestion.noteCount,2);
  }
});
test('preparation can suggest a stable starting-note octave without playing its preview',()=>{
  assert.equal(sing(new OctaveMismatchDetector(),-12,{phase:'preparation',singleNote:true}).shift,-12);
});
test('correct pitches, short blips and a single wrong performance note produce no suggestion',()=>{
  assert.equal(sing(new OctaveMismatchDetector(),0),undefined);
  assert.equal(sing(new OctaveMismatchDetector(),12,{count:10}),undefined);
  assert.equal(sing(new OctaveMismatchDetector(),12,{singleNote:true}),undefined);
  assert.equal(sing(new OctaveMismatchDetector(),7),undefined);
});
test('harmonic corrections, conflicting detectors, uncertain and visual-only frames are ignored',()=>{
  for(const overrides of [{octaveCorrection:-12},{clarity:.6},{status:'unreliable'},{visualOnly:true},{overloadActive:true},{corroboratingFrequency:null},{corroboratingFrequency:midiToFrequency(48)}]) {
    assert.equal(sing(new OctaveMismatchDetector(),12,{overrides}),undefined);
  }
});
test('suggestions account for the selected octave and respect supported target shifts',()=>{
  assert.equal(sing(new OctaveMismatchDetector(),12,{currentShift:-12}).shift,0);
  assert.equal(sing(new OctaveMismatchDetector(),-12,{currentShift:-12}).shift,-24);
  assert.equal(sing(new OctaveMismatchDetector(),12,{currentShift:12}),undefined);
});
test('dismissal suppresses the same suggestion until the score is reset',()=>{
  const detector=new OctaveMismatchDetector();assert.ok(sing(detector,-12));
  detector.dismiss(-12);assert.equal(sing(detector,-12),undefined);
  detector.clear();assert.ok(sing(detector,-12));
});
test('paused and count-in singing do not create octave suggestions',()=>{
  for(const phase of ['paused','count-in','review']) assert.equal(sing(new OctaveMismatchDetector(),12,{phase}),undefined);
});
