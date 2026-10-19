import { test } from "node:test";
import assert from "node:assert/strict";
import { createOnboarding, tutorialPosition } from "../src/tutorial.js";
import { draftFromRange, dragRange, validateDraft, measureAtPoint } from "../src/practice-selection.js";
import { practiceBands } from "../src/score-overlay.js";

function onboarding(storage = new Map(), onStudioReady = () => {}) {
  const shown=[], jobs=new Map(); let next=0;
  const controller=createOnboarding({ storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}, schedule:(fn,delay)=>{jobs.set(++next,{fn,delay});return next;},unschedule:id=>jobs.delete(id),show:kind=>shown.push(kind),hide:()=>{},onStudioReady });
  return {controller,shown,jobs,storage,fire(){const job=[...jobs.values()][0];jobs.clear();job?.fn();}};
}
test('only opening a score launches the automatic Tutorial, and completion is remembered',()=>{
 const t=onboarding();t.controller.view('upload');assert.equal(t.jobs.size,0);assert.deepEqual(t.shown,[]);
 t.controller.view('parts');assert.deepEqual(t.shown,[]);t.controller.view('studio');assert.deepEqual(t.shown,['studio']);
 t.controller.skip('studio');const repeat=onboarding(t.storage);repeat.controller.view('studio');assert.deepEqual(repeat.shown,[]);
 assert.equal(repeat.controller.replay(),true);assert.deepEqual(repeat.shown,['studio']);
});
test('the same Tutorial can be replayed only in an idle studio',()=>{
 const t=onboarding();t.controller.view('upload');assert.equal(t.controller.replay(),false);
 t.controller.active(true);t.controller.view('studio');assert.deepEqual(t.shown,[]);assert.equal(t.controller.replay(),false);
 t.controller.active(false);assert.equal(t.controller.replay(),true);assert.deepEqual(t.shown,['studio']);
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
  const reasons=[];const t=onboarding(new Map([['vocal-coach:tutorial:v5','done']]),reason=>reasons.push(reason));
  t.controller.active(true);t.controller.view('studio');assert.deepEqual(reasons,[]);
});
test('tutorial card stays inside viewport and avoids a highlighted control',()=>{
 for(const width of [390,834,1440]){
  const target={left:width-120,right:width-20,top:70,bottom:114};
  const p=tutorialPosition(target,{width:300,height:210},{width,height:844});
  assert.ok(p.left>=8&&p.left+300<=width-8);assert.ok(p.top>=8&&p.top+210<=836);
  assert.ok(p.left+300<=target.left||p.left>=target.right||p.top>=target.bottom||p.top+210<=target.top);
 }
});
test('redesigned tour is offered once to a user who completed the previous version',()=>{
 const t=onboarding(new Map([['vocal-coach:studio-tour:v2','done']]));t.controller.view('studio');
 assert.deepEqual(t.shown,['studio']);t.controller.skip('studio');
 const reopened=onboarding(t.storage);reopened.controller.view('studio');assert.deepEqual(reopened.shown,[]);
});
