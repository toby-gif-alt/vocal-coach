import test from 'node:test';
import assert from 'node:assert/strict';
import {coachingReviewSequence,reviewChunkSeconds} from '../src/coaching-review.js';
const measures=Array.from({length:4},(_,i)=>({measureNumber:i+1,startQuarter:i*4,endQuarter:(i+1)*4}));
const timeline=[{id:'early',onsetQuarters:4,measureNumber:2},{id:'late',onsetQuarters:10,measureNumber:3}];
const take=Object.freeze({startQuarter:5,endQuarter:11,bpm:60,startMeasure:2});
test('click-through feedback mixes strengths and critiques in score order',()=>{
 const cards=coachingReviewSequence({improvements:[{noteId:'late',title:'Later priority'}],strengths:[{noteId:'early',title:'Earlier strength'}]},timeline,measures,take);
 assert.deepEqual(cards.map(c=>c.title),['Earlier strength','Later priority']);
 assert.deepEqual(cards.map(c=>[c.chunk.startQuarter,c.chunk.endQuarter]),[[5,8],[8,11]]);
 assert.deepEqual(cards.map(c=>[c.chunk.startSeconds,c.chunk.endSeconds]),[[0,3],[3,6]]);
 assert.deepEqual(take,{startQuarter:5,endQuarter:11,bpm:60,startMeasure:2});
});
test('general provisional guidance is explicit and does not invent a note location',()=>{
 const cards=coachingReviewSequence({improvements:[{provisional:true,title:'General tip'}],strengths:[{noteId:'early'}]},timeline,measures,take);
 assert.equal(cards.at(-1).general,true);assert.equal(cards.at(-1).noteId,undefined);assert.equal(cards.at(-1).chunk.measureNumber,3);
});
test('review windows preserve take offsets and tempo, and seeks stay inside the current bar',()=>{
 const card=coachingReviewSequence({improvements:[{noteId:'late'}],strengths:[]},timeline,measures,{...take,bpm:120})[0];
 assert.equal(card.chunk.startSeconds,1.5);assert.equal(card.chunk.endSeconds,3);
 assert.equal(reviewChunkSeconds(card.chunk,0),1.5);assert.equal(reviewChunkSeconds(card.chunk,20),3);assert.equal(reviewChunkSeconds(card.chunk,2),2);
});
test('no feedback items produce no invented findings',()=>{
 assert.deepEqual(coachingReviewSequence({improvements:[],strengths:[]},timeline,measures,take),[]);
});
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
test('the recording-clock animation stops voice and score layers at the chunk boundary',()=>{
 let frame,updated=0;const media={paused:false,currentTime:3.2,pause(){this.paused=true;}};
 const deps={state:{reviewPlaying:true,recording:{take:{}},reviewChunk:{endSeconds:3}},els:{performanceAudio:media},cancelAnimationFrame(){},requestAnimationFrame:cb=>{frame=cb;return 1;},updatePerformancePosition(){updated++;},updatePerformancePlaybackState(){}};
 const source=app.slice(app.indexOf('function startPerformanceReviewSync()'),app.indexOf('\nfunction updateReviewScorePosition('));
 const start=new Function(...Object.keys(deps),source+'; return startPerformanceReviewSync;')(...Object.values(deps));start();frame();
 assert.equal(media.paused,true);assert.equal(media.currentTime,3);assert.equal(updated,1);
});
test('chunk playback clips a copy of the immutable take while keeping its recording origin',()=>{
 const original=Object.freeze({startQuarter:5,endQuarter:15,bpm:90,octaveShift:-24});
 const source=app.slice(app.indexOf('function reviewPlaybackTake()'),app.indexOf('\nfunction stopReviewPlayback('));
 const get=new Function('state',source+'; return reviewPlaybackTake;')({recording:{take:original},reviewChunk:{endQuarter:8}});
 assert.deepEqual(get(),{...original,endQuarter:8});assert.equal(original.endQuarter,15);assert.notEqual(get(),original);
});

import {reviewSecondsAtQuarter,reviewQuarterAtSeconds} from '../src/review-playback.js';
test('score review seeks preserve recording origin and clamp to recorded material at every tempo',()=>{
 for(const bpm of [60,90,120]){
  const take={startQuarter:8,endQuarter:20,bpm};
  const seconds=reviewSecondsAtQuarter(12,take,100);
  assert.equal(reviewQuarterAtSeconds(seconds,bpm,8,20),12);
  assert.equal(reviewSecondsAtQuarter(0,take,100),0);
  assert.equal(reviewSecondsAtQuarter(99,take,2),2);
 }
});
test('selecting score playback clears feedback chunk, pauses audio and waits for Play',()=>{
 const calls=[],take={startQuarter:8,endQuarter:20,bpm:120};
 const state={recording:{take,durationSeconds:6},reviewChunk:{startSeconds:0,endSeconds:1}};
 const els={performanceAudio:{currentTime:0}};
 const deps={state,els,stopPerformanceReview:()=>calls.push('pause'),markCoachingNote:item=>calls.push(['mark',item]),$:()=>({}),reviewSecondsAtQuarter,reviewQuarterAtSeconds,updateReviewScorePosition:q=>calls.push(['cursor',q]),updatePerformancePosition(){},updatePerformancePlaybackState(){},setStatus(){},startReviewPlayback:()=>calls.push('play')};
 const source=app.slice(app.indexOf('function selectReviewScorePosition('),app.indexOf('\nfunction updateReviewLayers()'));
 const actions=new Function(...Object.keys(deps),source+';return {selectReviewScorePosition,restartPerformanceReview};')(...Object.values(deps));
 actions.selectReviewScorePosition(12);assert.equal(state.reviewChunk,null);assert.equal(els.performanceAudio.currentTime,2);assert.deepEqual(calls,['pause',['mark',null],['cursor',12]]);
 state.reviewChunk={startSeconds:4};calls.length=0;actions.restartPerformanceReview();assert.equal(els.performanceAudio.currentTime,0);assert.deepEqual(calls.at(-1),'play');assert.ok(calls.some(c=>Array.isArray(c)&&c[0]==='cursor'&&c[1]===8));
});
