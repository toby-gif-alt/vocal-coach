import { test } from "node:test";
import assert from "node:assert/strict";
import { analysePerformance } from "../src/analysis.js";
import { buildCoachingFeedback } from "../src/coaching.js";

function analyse(patterns, duration = 2) {
  const notes = patterns.map((p,i) => ({ id: `n${i}`, midi: p.midi ?? 60, displayPitch: p.pitch ?? "C4", measureNumber: i + 1, onsetQuarters: i * duration, durationQuarters: duration }));
  const samples = notes.flatMap((note,i) => Array.from({length:Math.round(duration / .05)}, (_,j) => ({ targetId: note.id, scoreSeconds: note.onsetQuarters + j * .05, cents: patterns[i].value(j * .05 / duration), clarity: .9, status: "accepted" })));
  return analysePerformance(notes, samples, 60);
}
const measuredIssues = results => buildCoachingFeedback(results).improvements.filter(x => !x.provisional);

test("flat and sharp sustained notes differ from entrances which recover", () => {
  for (const sign of [-1, 1]) {
    const held = analyse([{value: () => sign * 40}]);
    assert.ok(measuredIssues(held).some(x => x.category === "pitch-centre" && x.body.includes(sign < 0 ? "flat" : "sharp")));
    const recovered = analyse([{value:t => t < .2 ? sign * 45 : 0}]);
    assert.ok(measuredIssues(recovered).some(x => x.category === "entrance"));
    assert.ok(!measuredIssues(recovered).some(x => x.category === "pitch-centre"));
    assert.equal(recovered[0].onsetTimingSeconds, null);
  }
});
test("ascending leap landing flat outranks generic pitch and is not duplicated", () => {
  const results = analyse([{midi:60,pitch:"C4",value:()=>0},{midi:67,pitch:"G4",value:()=>-45},{midi:60,value:()=>0},{midi:67,pitch:"G4",value:()=>-42},{midi:62,value:()=>-30}]);
  const issues = measuredIssues(results);
  assert.equal(issues[0].category, "ascending-leap");
  assert.match(issues[0].exercise, /higher note first|higher.*first/);
  assert.equal(issues.filter(x => x.category === "ascending-leap").length, 1);
  assert.equal(new Set(issues.map(x => x.noteId)).size, issues.length);
});
test("descending leaps, repeated notes and separate strengths use measured evidence", () => {
  const fall = analyse([{midi:67,pitch:"G4",value:()=>0},{midi:60,value:()=>40}]);
  assert.equal(measuredIssues(fall)[0].category, "descending-leap");
  const accurate = buildCoachingFeedback(analyse([{value:()=>0},{value:()=>0},{midi:67,value:()=>0}]));
  assert.equal(accurate.observations.length, 5);
  assert.equal(accurate.strengths.length, 2);
  assert.ok(accurate.strengths.every(x => !x.provisional && x.noteId));
  assert.equal(new Set(accurate.strengths.map(x => x.category)).size, 2);
});
test("late ending drift is detected without diagnosing breath or phonation release", () => {
  const results = analyse([{value:t => t < .6 ? 0 : -(t-.6)*140}]);
  assert.ok(results[0].offsetReliable);
  assert.ok(measuredIssues(results).some(x => x.category === "sustain"));
  assert.equal(results[0].releaseEarlySeconds, null);
  assert.ok(!measuredIssues(results).some(x => /diaphragm|tension|air pressure/.test(x.body)));
});
test("short notes, clipped boundaries, low confidence and visual samples do not create false findings", () => {
  assert.equal(measuredIssues(analyse([{value:()=>-80}], .2)).length, 0);
  const results = analyse([{value:()=>-50}]); results[0].note.clippedAtRangeStart = true;
  const note = results[0].note;
  const sparse = analysePerformance([note], [{targetId:note.id,cents:-80,scoreSeconds:0,visualOnly:true},{targetId:note.id,cents:-80,scoreSeconds:.1,status:'unreliable'}],60);
  assert.equal(sparse[0].sampleCount, 0);
  assert.ok(buildCoachingFeedback(sparse).observations.every(x => x.provisional));
  const clipped = analysePerformance([{...note,clippedAtRangeEnd:true}], Array.from({length:40},(_,i)=>({targetId:note.id,cents:0,scoreSeconds:i*.05})),60);
  assert.equal(clipped[0].entranceReliable,false); assert.equal(clipped[0].offsetReliable,false);
});
test("natural vibrato and a brief slide do not become sustained wrong-pitch findings", () => {
  assert.equal(measuredIssues(analyse([{value:t => 35*Math.sin(t*Math.PI*20)}])).length, 0);
  assert.equal(measuredIssues(analyse([{value:t => t < .08 ? -70 + t*875 : 0}])).length, 0);
});
test("missing end samples do not imply early release or breath-support failure", () => {
  const note = {id:'n',midi:60,displayPitch:'C4',measureNumber:1,onsetQuarters:0,durationQuarters:2};
  const results = analysePerformance([note],Array.from({length:22},(_,i)=>({targetId:'n',cents:0,scoreSeconds:i*.05})),60);
  assert.equal(results[0].offsetReliable,false); assert.equal(results[0].releaseEarlySeconds,null);
  assert.ok(buildCoachingFeedback(results).observations.every(x=>x.provisional));
});
test("a sufficiently measured mixed performance yields three distinct findings and two real strengths", () => {
  const results=analyse([
    {midi:60,value:()=>0}, {midi:67,pitch:'G4',value:()=>-45},
    {midi:62,pitch:'D4',value:t=>t<.2?40:0},
    {midi:64,pitch:'E4',value:t=>t<.6?0:-(t-.6)*140},
    {midi:60,value:()=>0}, {midi:60,value:()=>0},
  ]);
  const feedback=buildCoachingFeedback(results);
  assert.equal(feedback.improvements.length,3);assert.equal(feedback.strengths.length,2);
  assert.ok(feedback.observations.every(item=>!item.provisional && item.noteId && item.exercise));
  assert.equal(new Set(feedback.improvements.map(item=>item.category)).size,3);
  assert.equal(feedback.improvements[0].category,'ascending-leap');
});
