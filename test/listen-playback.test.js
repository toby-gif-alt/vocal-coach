import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Replace only the CDN detector dependency: exercise the real playback method
// with a transport double, without requiring a browser audio device.
const url = new URL("../src/audio-engine.js", import.meta.url);
const source = (await readFile(url, "utf8"))
  .replace('"../vendor/pitchy.mjs"', '"data:text/javascript,export const PitchDetector = {}"')
  .replace(/from "(\.\/[^\"]+)"/g, (_, relative) => `from "${new URL(relative.split("?")[0], url).href}"`);
const { AudioEngine } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function playbackDouble() {
  return {
    score: { parts: [{ id: "voice", name: "Voice" }], initialTimeSignature: { beats: 4, beatType: 4 } },
    stopReview() {}, tone: { async start() {} }, ensurePlaybackEngines() {},
    async ensureRoutesReady() {}, async ensureGuideReady() {}, scheduleScore() {},
    bpm: 120, transport: { bpm: { value: 0 }, PPQ: 192, start() { this.started = true; } },
    async startMicrophone() { throw Object.assign(new Error("No device"), { name: "NotFoundError" }); },
  };
}

test("Microphone-free playback starts even when microphone acquisition would fail", async () => {
  const engine = playbackDouble();
  await AudioEngine.prototype.play.call(engine, { vocalPartId: "voice", guideEnabled: true, assessmentMode: false, countInBars: 0, startQuarter: 0 });
  assert.equal(engine.transport.started, true);
  assert.equal(engine.isPlaying, true);
});

test("microphone acquisition errors are marked for music-only fallback", async () => {
  await assert.rejects(AudioEngine.prototype.play.call(playbackDouble(), { vocalPartId: "voice", assessmentMode: true }), (error) => error.name === "NotFoundError" && error.microphoneUnavailable === true);
});

test('scheduler shifts only the selected guide, preserving vocal and piano accompaniment and source bytes',()=>{
 const parts=[{id:'S',name:'Soprano',notes:[{midi:72,onsetQuarters:0,durationQuarters:1}]},{id:'A',name:'Alto',notes:[{midi:60,onsetQuarters:0,durationQuarters:1}]},{id:'P',name:'Piano',notes:[{midi:48,onsetQuarters:0,durationQuarters:1}]}];
 const original=JSON.stringify(parts);
 for(const selected of ['S','P'])for(const shift of [-24,-12,0,12])for(const enabled of [true,false]){
  const heard=[],engine={score:{parts,durationQuarters:1},transport:{PPQ:192,cancel(){},schedule:fn=>fn(1)},partEngines:new Map(parts.map(p=>[p.id,{classification:p.id==='P'?'piano':'vocal',instrument:{triggerAttackRelease:r=>heard.push([p.id,r.midi])}}])),onPlaybackRoute(){}};
  AudioEngine.prototype.scheduleScore.call(engine,{vocalPartId:selected,guideEnabled:enabled,guideOctaveShift:shift,enabledPartIds:parts.filter(p=>p.id!==selected).map(p=>p.id),resumeQuarter:0,endQuarter:1,notifyEnd:false});
  assert.deepEqual(heard,parts.filter(p=>p.id!==selected||enabled).map(p=>[p.id,p.notes[0].midi+(p.id===selected?shift:0)]));
 }
 assert.equal(JSON.stringify(parts),original);
});

test('Music-only and resumed playback pass the explicitly locked guide octave to scheduling',async()=>{
 for(const paused of [false,true]){
  const engine=playbackDouble();engine.isPaused=paused;engine.currentQuarter=4;engine.scheduleScore=settings=>engine.scheduled=settings;
  await AudioEngine.prototype.play.call(engine,{vocalPartId:'voice',guideEnabled:true,guideOctaveShift:-12,assessmentMode:false,countInBars:0});
  assert.equal(engine.scheduled.guideOctaveShift,-12);
 }
});

test('review uses the immutable guide octave, with written-pitch compatibility for older takes',()=>{
 const engine={baseTempo:72,score:{durationQuarters:32}};
 const take={bpm:72,vocalPartId:'S',octaveShift:-12,guideOctaveShift:-12,startQuarter:4,endQuarter:8,enabledPartIds:['P']};
 const settings=AudioEngine.prototype.reviewSettingsAt.call(engine,1,take,{melody:true,accompaniment:true});
 assert.equal(settings.guideOctaveShift,-12);assert.deepEqual(settings.enabledPartIds,['P']);
 delete take.guideOctaveShift;assert.equal(AudioEngine.prototype.reviewSettingsAt.call(engine,0,take,{melody:true}).guideOctaveShift,0);
});

test('microphone availability requires a live audio track rather than a stale calibrated stream',()=>{
 const getter=Object.getOwnPropertyDescriptor(AudioEngine.prototype,'hasMicrophoneStream').get;
 for(const readyState of ['live','ended'])assert.equal(getter.call({stream:{getAudioTracks:()=>[{readyState}]},analyser:{},pitchDetector:{}}),readyState==='live');
 assert.equal(getter.call({}),false);
});
