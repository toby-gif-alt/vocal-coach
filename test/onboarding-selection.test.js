import { test } from "node:test";
import assert from "node:assert/strict";
import { createOnboarding, tutorialOverviewScale } from "../src/tutorial.js";
import { draftFromRange, dragRange, validateDraft, measureAtPoint } from "../src/practice-selection.js";
import { practiceBands } from "../src/score-overlay.js";

function onboarding(storage = new Map(), onStudioReady = () => {}) {
  const shown=[], jobs=new Map(); let next=0;
  const controller=createOnboarding({ storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}, schedule:(fn,delay)=>{jobs.set(++next,{fn,delay});return next;},unschedule:id=>jobs.delete(id),show:kind=>shown.push(kind),hide:()=>{},onStudioReady });
  return {controller,shown,jobs,storage,fire(){const job=[...jobs.values()][0];jobs.clear();job?.fn();}};
}
test("welcome waits two seconds, interaction cancels it, and first visit is remembered", () => {
  const t=onboarding();t.controller.view('upload');assert.equal(t.shown.length,0);assert.equal([...t.jobs.values()][0].delay,2000);
  t.controller.interact();assert.equal(t.jobs.size,0);t.fire();assert.equal(t.shown.length,0);
  const repeat=onboarding(t.storage);repeat.controller.view('upload');assert.equal(repeat.jobs.size,0);
});
test("welcome skip and studio next/skip persist separately; parts never get an automatic tour", () => {
  const t=onboarding();t.controller.view('upload');t.fire();assert.deepEqual(t.shown,['welcome']);t.controller.skip('welcome');
  t.controller.view('parts');assert.equal(t.shown.length,1);
  t.controller.view('studio');assert.equal(t.shown.at(-1),'studio');t.controller.skip('studio');
  const repeat=onboarding(t.storage);repeat.controller.view('studio');assert.equal(repeat.shown.length,0);repeat.controller.replay();assert.equal(repeat.shown[0],'studio');
});
test("loading cancels the timer and playback suppresses automatic and replayed tutorials", () => {
  const t=onboarding();t.controller.view('upload');t.controller.view('loading');assert.equal(t.jobs.size,0);
  t.controller.active(true);t.controller.view('studio');assert.equal(t.shown.length,0);assert.equal(t.controller.replay(),false);
  t.controller.active(false);assert.equal(t.controller.replay(),true);assert.equal(t.shown.at(-1),'studio');
});
const part={durationQuarters:12,measureStarts:Array.from({length:12},(_,i)=>({measureNumber:i+1,onsetQuarters:i}))};
const range={sectionStartMeasure:1,sectionEndMeasure:12,startMeasure:1};
test("double-click draft, forward/backward drag and typed fields share validation without committing", () => {
  const draft=draftFromRange(range,5);assert.deepEqual(draft,{from:5,to:5,start:5});
  assert.deepEqual(dragRange(draft,12,5),{from:5,to:12,start:5});
  assert.deepEqual(dragRange(draft,5,12),{from:5,to:12,start:5});
  assert.ok(validateDraft(part,{from:'5',to:'12',start:'8'}).valid);
  assert.ok(!validateDraft(part,{from:5,to:12,start:2}).valid);
  assert.ok(!validateDraft(part,{from:12,to:5,start:12}).valid);
  assert.deepEqual(range,{sectionStartMeasure:1,sectionEndMeasure:12,startMeasure:1});
});
test("hit testing works across systems/pages; whole piece has no bands; selected bars merge per line", () => {
  const systems=[{},{}];const geometry=Array.from({length:12},(_,i)=>({measureNumber:i+1,pageIndex:0,system:systems[Math.floor(i/6)],xStart:(i%6)*100,xEnd:(i%6+1)*100,yStart:Math.floor(i/6)*150,height:80}));
  assert.equal(measureAtPoint(geometry,0,450,40),5);assert.equal(measureAtPoint(geometry,0,550,190),12);
  assert.equal(measureAtPoint(geometry,1,550,190),null);
  assert.deepEqual(practiceBands(geometry,1,12,true),[]);
  const bands=practiceBands(geometry,5,12,false);assert.equal(bands.filter(x=>x.selected).length,2);
  assert.deepEqual(bands.filter(x=>x.selected).map(x=>[x.xStart,x.xEnd]),[[400,600],[0,600]]);
  assert.equal(bands.filter(x=>!x.selected).length,1);
});
test("single-bar drags, invalid typed bars and storage errors are handled safely", () => {
  assert.deepEqual(dragRange(draftFromRange(range),5,5),{from:5,to:5,start:5});
  for (const draft of [{from:0,to:5,start:1},{from:1.5,to:5,start:2},{from:1,to:15,start:1}]) assert.equal(validateDraft(part,draft).valid,false);
  const shown=[];const controller=createOnboarding({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},show:kind=>shown.push(kind),hide(){} });
  controller.view('studio');assert.deepEqual(shown,['studio']);controller.skip('studio');controller.destroy();
});

test("first studio tutorial ends with calibration suggestion; new app sessions remind again", () => {
  const reasons=[]; const t=onboarding(new Map(),reason=>reasons.push(reason));
  t.controller.view('studio'); assert.deepEqual(reasons,[]);
  t.controller.skip('studio'); assert.deepEqual(reasons,['first-tour']);
  t.controller.replay(); t.controller.skip('studio'); assert.deepEqual(reasons,['first-tour']);
  const reopened=onboarding(t.storage,reason=>reasons.push(reason));
  reopened.controller.view('studio'); assert.deepEqual(reasons,['first-tour','returning']);
});
test("microphone suggestion is suppressed during active playback", () => {
  const reasons=[];const t=onboarding(new Map([['vocal-coach:studio-tour:v2','done']]),reason=>reasons.push(reason));
  t.controller.active(true);t.controller.view('studio');assert.deepEqual(reasons,[]);
});
test("overview fits the screen without enlarging a short studio", () => {
  assert.equal(tutorialOverviewScale(300,1000,12,false),1);
  for (const compact of [true,false]) {
    const scale=tutorialOverviewScale(1200,844,12,compact);
    assert.ok(scale>0 && scale<1);
    assert.ok(1200*scale<=844-12-(compact?350:95));
  }
});
