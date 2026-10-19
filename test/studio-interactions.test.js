import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {guideSettings} from '../src/guide-settings.js';
import {dragRange} from '../src/practice-selection.js';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));

test('score-view state and both accessible button states reset together',()=>{
 const buttons=['vocal','full'].map(view=>({dataset:{view},classList:{toggle(_,value){this.active=value;}},setAttribute(_,value){this.pressed=value;}}));
 const state={scoreView:'full'};
 const set=new Function('state','els',extract('function setScoreView(','async function renderScore()')+';return setScoreView;')(state,{viewButtons:buttons});
 for(const view of ['vocal','full','vocal']){set(view);assert.equal(state.scoreView,view);for(const button of buttons){assert.equal(button.classList.active,button.dataset.view===view);assert.equal(button.pressed,String(button.dataset.view===view));}}
});
test('legacy saved tempo and section cannot override fresh-session defaults or calibration',()=>{
 const calibration={signalGood:true},state={savedPreferences:{tempoPercent:150,sectionStartMeasure:3,sectionEndMeasure:6,startMeasure:4,octaveShift:-12,startingOctaveChosen:true},score:{parts:[]},selectedPartId:'voice',sectionStartMeasure:null,sectionEndMeasure:null,startMeasure:1,microphoneCalibration:calibration};
 const audio={tempoPercent:100,setTempo(){throw Error('Saved tempo must not be restored');}};
 const deps={state,audio,guideSettings,renderGuideSettings(){},MODE_CONFIG:{},DEFAULT_OCTAVE_SHIFT:0,renderAccompaniment(){},renderPracticeRangeControls(){},updateSetupSummary(){},setOctaveShift(shift){state.octaveShift=shift;}};
 const restore=new Function(...Object.keys(deps),extract('function restoreScorePreferences()','function scorePreferences()')+';return restoreScorePreferences;')(...Object.values(deps));
 restore();assert.equal(audio.tempoPercent,100);assert.equal(state.sectionStartMeasure,null);assert.equal(state.startMeasure,1);assert.equal(state.octaveShift,-12);assert.equal(state.microphoneCalibration,calibration);
});
function pointerHarness(){
 const handlers={},frames=new Map();let next=0,captured=null,commits=0,paints=0;
 const state={rangeSelectionMode:true,practiceDraft:{from:1,to:8,start:1}};
 const container={addEventListener:(type,fn)=>handlers[type]=fn,setPointerCapture:id=>captured=id,hasPointerCapture:id=>captured===id,releasePointerCapture(id){captured=null;handlers.lostpointercapture({pointerId:id});}};
 const deps={state,els:{scoreContainer:container,sectionFrom:{},sectionTo:{},practiceRangeStatus:{}},document:{addEventListener(){}},practiceLocked:()=>false,scoreMeasureAt:event=>event.measure??null,dragRange,
 requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),renderPracticeRangeOverlay:()=>paints++,updateDraftFields:()=>commits++};
 new Function(...Object.keys(deps),extract('function wirePracticePointers()','function renderAccompaniment()')+';wirePracticePointers();')(...Object.values(deps));
 const event=(measure,pointerType='mouse')=>({pointerId:1,measure,isPrimary:true,button:0,clientX:100,clientY:100,pointerType,preventDefault(){}});
 return {handlers,state,event,frames,get commits(){return commits;},get paints(){return paints;}};
}
test('a first forward or reverse drag commits once, even with synchronous lost capture',()=>{
 for(const [from,to] of [[2,7],[7,2]]){
  const t=pointerHarness();t.handlers.pointerdown(t.event(from));t.handlers.pointermove(t.event(to));
  assert.equal(t.commits,0);assert.equal(t.state.practiceDragging,true);
  t.handlers.pointerup(t.event(to));assert.deepEqual(t.state.practiceDraft,{from:2,to:7,start:2});assert.equal(t.commits,1);assert.equal(t.state.practiceDragging,false);assert.equal(t.frames.size,0);
 }
});
test('quick touch drag and cancellation retain the last preview instead of rolling back',()=>{
 const t=pointerHarness();t.handlers.pointerdown(t.event(3,'touch'));t.handlers.pointermove(t.event(6,'touch'));t.handlers.pointercancel(t.event(null,'touch'));
 assert.deepEqual(t.state.practiceDraft,{from:3,to:6,start:3});assert.equal(t.commits,1);assert.equal(t.frames.size,0);
});
test('slow drag previews can paint repeatedly without committing engine state until release',()=>{
 const t=pointerHarness();t.handlers.pointerdown(t.event(2));
 for(const bar of [3,4,5,6]){
  t.handlers.pointermove(t.event(bar));
  const [id,paint]=[...t.frames.entries()].at(-1);t.frames.delete(id);paint();
  assert.equal(t.commits,0);
 }
 t.handlers.pointerup(t.event(6));assert.equal(t.commits,1);assert.ok(t.paints>=5);assert.equal(t.frames.size,0);
});
import {measureAtPoint} from '../src/practice-selection.js';
test('bar hit testing distinguishes equal coordinates on different score pages',()=>{
 const region={xStart:10,xEnd:110,yStart:20,height:80};
 const geometry=[{...region,pageIndex:0,measureNumber:4},{...region,pageIndex:1,measureNumber:5}];
 assert.equal(measureAtPoint(geometry,0,50,50),4);assert.equal(measureAtPoint(geometry,1,50,50),5);
});
test('score reflow waits for an active drag and restores the current coaching target',async()=>{
 const jobs=new Map(),calls=[];let id=0;
 const item={targetQuarter:10,chunk:{startQuarter:8}},state={osmd:{},score:{},practiceDragging:true,coachingSteps:[item],coachingStep:0};
 const deps={state,els:{studioView:{hidden:false},resultsPanel:{open:true}},clearTimeout:key=>jobs.delete(key),setTimeout:fn=>{jobs.set(++id,fn);return id;},renderScore:async()=>calls.push('render'),markCoachingNote:(value,options)=>{assert.equal(value,item);assert.equal(options.scroll,true);calls.push('mark');},setCursorToQuarter:q=>calls.push(q)};
 const layout=new Function(...Object.keys(deps),extract('function scheduleScoreLayout()','function scheduleScoreTraceRefresh()')+';return scheduleScoreLayout;')(...Object.values(deps));
 layout();await jobs.get(id)();assert.deepEqual(calls,[]);
 state.practiceDragging=false;await jobs.get(id)();assert.deepEqual(calls,['render','mark',10]);
});

test('notation reflow keeps a stopped seek position and selected part/view while rebuilding geometry',async()=>{
 const calls=[],state={score:{parts:[{id:'voice'}]},scoreView:'full',selectedPartId:'voice',cursorQuarter:12,osmd:{Sheet:{Instruments:[{}]},setOptions(){},render(){calls.push('layout');}}};
 const deps={state,els:{scoreContainer:{setAttribute(){},removeAttribute(){},classList:{toggle(){}}},scoreHeading:{}},window:{opensheetmusicdisplay:{OpenSheetMusicDisplay:function(){}}},setScoreView:view=>assert.equal(view,'full'),indexCursorTimeline(){},resetCursor:()=>{state.cursorQuarter=0;},rebuildScoreTrace:()=>calls.push('geometry'),setCursorToQuarter:q=>calls.push(q),currentPracticeRange:()=>({startQuarter:0}),selectedPart:()=>({name:'Voice'}),tutorial:{refreshOverview(){}}};
 const render=new Function(...Object.keys(deps),extract('async function renderScore()','function rebuildScoreTrace()')+';return renderScore;')(...Object.values(deps));
 await render();assert.deepEqual(calls,['layout','geometry',12]);assert.equal(state.selectedPartId,'voice');assert.equal(state.scoreView,'full');
});
