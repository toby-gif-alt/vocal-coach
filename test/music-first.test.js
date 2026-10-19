import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {RepertoireStore} from '../src/repertoire-store.js';
import {RepertoireCatalogue,standaloneDisplay} from '../src/repertoire-catalogue.js';
import {renderMeasureSelection} from '../src/score-overlay.js';
import {readFile} from 'node:fs/promises';
const included=Array.from({length:5},(_,i)=>({file:`music/${i}.xml`,title:`Included ${i}`}));
function session(){const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};}
async function catalogue(store,standalone=false,storage=session()) {const c=new RepertoireCatalogue({store,standalone,session:storage});c.included=included;await c.load();return c;}
test('browser included edits survive reload, reset for a new session, and never alter imported bytes or settings',async()=>{
 const store=new RepertoireStore(new IDBFactory()),storage=session();
 await store.add({id:'student',title:'My score',filename:'score.xml',bytes:new Blob(['original bytes'],{type:'application/xml'}),settings:{octaveShift:-12},importedAt:'2026'});
 const c=await catalogue(store,false,storage);assert.equal(c.rows(await store.list()).length,6);
 await c.customise('included:music/0.xml',{hidden:true});await c.customise('included:music/1.xml',{title:'Temporary title'});
 const reload=await catalogue(store,false,storage);assert.equal(reload.rows().length,4);assert.equal(reload.rows()[0].title,'Temporary title');
 const fresh=await catalogue(store,false,session());assert.equal(fresh.rows().length,5);assert.equal(fresh.rows()[1].title,'Included 1');
 const original=await store.get('student');assert.equal(await original.bytes.text(),'original bytes');assert.equal(original.bytes.type,'application/xml');assert.equal(original.settings.octaveShift,-12);
 (await store.ready).close();
});
test('standalone included edits persist and restore without deleting or resetting imported scores',async()=>{
 const store=new RepertoireStore(new IDBFactory());await store.add({id:'mine',title:'Renamed import',importedAt:'2026',selectedPartId:'tenor'});
 const c=await catalogue(store,true);await c.customise('included:music/0.xml',{hidden:true});await c.customise('included:music/1.xml',{title:'My included title'});
 const reopened=await catalogue(store,true);assert.equal(reopened.rows().length,4);assert.equal(reopened.rows()[0].title,'My included title');
 await reopened.restore();assert.equal(reopened.rows().length,5);assert.equal((await store.get('mine')).title,'Renamed import');assert.equal((await store.get('mine')).selectedPartId,'tenor');(await store.ready).close();
});
test('catalogue uses stable unique IDs for identical titles and both score sources',async()=>{
 const c=await catalogue({});const rows=c.rows([{id:'a',title:'Included 0'},{id:'b',title:'Included 0'}]);
 assert.equal(new Set(rows.map(r=>r.id)).size,7);assert.deepEqual(rows.slice(-2).map(r=>r.source),['imported','imported']);
});
test('ambiguous browser installation uses session rules; only actual standalone persists',()=>{
 assert.equal(standaloneDisplay({navigator:{},matchMedia:()=>({matches:false})}),false);
 assert.equal(standaloneDisplay({navigator:{standalone:true}}),true);
 assert.equal(standaloneDisplay({matchMedia:q=>({matches:q==='(display-mode: standalone)'})}),true);
 assert.equal(standaloneDisplay({matchMedia:q=>({matches:q==='(display-mode: fullscreen)'})}),false);
});
// Lightweight SVG fixture exercises the production renderer without a browser.
class Element {
 constructor(name,attrs={}){this.name=name;this.attrs=attrs;this.children=[];}
 setAttribute(k,v){this.attrs[k]=String(v);}
 append(...items){for(const e of items){e.parent=this;this.children.push(e);}}
 querySelector(selector){return this.children.find(e=>e.attrs.class?.split(' ').includes(selector.slice(1)))||null;}
 remove(){this.parent.children=this.parent.children.filter(e=>e!==this);}
 insertBefore(e,before){e.parent=this;this.children.splice(this.children.indexOf(before),0,e);}
}
test('production SVG renderer dims only outside bars, replaces bands after rerender and keeps whole piece clear',()=>{
 const old=globalThis.document;globalThis.document={createElementNS:(_,name)=>new Element(name)};
 try {
 const page=new Element('svg'),system={};const score={querySelectorAll:()=>[page]};
 const geometry=Array.from({length:5},(_,i)=>({system,pageIndex:0,measureNumber:i+1,xStart:i*100,xEnd:(i+1)*100,yStart:20,height:80}));
 const render=(start,end,wholePiece=false)=>renderMeasureSelection(score,geometry,{sectionStartMeasure:start,sectionEndMeasure:end,startMeasure:start,wholePiece});
 render(2,4);let layer=page.querySelector('.score-range-layer');
 assert.deepEqual(layer.children.filter(e=>e.attrs.class==='score-section-dim').map(e=>[e.attrs.x,e.attrs.width]),[['0','100'],['400','100']]);
 assert.ok(!layer.children.some(e=>e.attrs.class==='score-section-highlight'));
 render(3,4);assert.equal(page.children.length,1);assert.equal(page.querySelector('.score-range-layer').children[0].attrs.width,'200');
 render(1,5,true);assert.equal(page.querySelector('.score-range-layer').children.filter(e=>e.attrs.class==='score-section-dim').length,0);
 }finally{globalThis.document=old;}
});
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function functions(from,to,deps){return new Function(...Object.keys(deps),source.slice(source.indexOf(from),source.indexOf(to))+'; return {openFloatingReview,closeFloatingReview,showTakeFeedback,closeTakeFeedback};')(...Object.values(deps));}
test('feedback embeds a silent chunk player, then returns it to full review without deleting the take',()=>{
 const recording={url:'blob:take',take:{startQuarter:4,endQuarter:8,bpm:60}},state={recording,coachingSteps:[]},calls=[];
 const panel={hidden:true,open:false,show(){this.open=true;calls.push('feedback');},close(){this.open=false;}},player={hidden:true},nodes={};
 const node=id=>nodes[id]??= {focus(){},append(p){p.location=id==='#reviewCompanion'?'companion':'feedback';}};
 const fn=functions('function closeFloatingReview(', 'async function changeSingingPart()', {state,syncReviewLayout(){},usingMicrophone:()=>false,MODE_CONFIG:{},audio:{},els:{resultsPanel:panel,performancePlayback:player,performanceAudio:{currentTime:0},coachObservations:{replaceChildren(){}}},
  $:node,document:{body:{append:p=>{p.location='body';}}},updatePerformancePosition(){},updatePerformancePlaybackState(){},stopPerformanceReview:()=>calls.push('stop review')});
 fn.showTakeFeedback();assert.equal(calls[0],'feedback');assert.equal(player.location,'feedback');assert.equal(player.hidden,false);
 fn.closeTakeFeedback();assert.equal(panel.open,false);assert.equal(player.location,'companion');assert.equal(player.hidden,false);assert.equal(state.recording,recording);
 fn.closeFloatingReview();assert.equal(player.hidden,true);assert.equal(state.recording,recording);
 fn.openFloatingReview();assert.equal(player.hidden,false);assert.equal(state.recording,recording);
});
test('Listen back cannot open while a live take is playing',()=>{
 const player={hidden:true};const fn=functions('function closeFloatingReview(', 'async function changeSingingPart()', {state:{recording:{}},MODE_CONFIG:{},audio:{isPlaying:true},els:{performancePlayback:player},$:()=>({focus(){}}),stopPerformanceReview(){}});
 fn.openFloatingReview();assert.equal(player.hidden,true);
});
test('Hear previews immediately even before octave confirmation and never opens a selector',async()=>{
 const fnSource=source.slice(source.indexOf('async function hearStartingNote()'),source.indexOf('\nfunction updateVolume('));
 const calls=[],state={mode:'assisted',microphoneDecision:'skipped',startingConfirmedSession:false},audio={previewPitch:async midi=>calls.push(midi)};
 const deps={state,audio,MODE_CONFIG:{listen:{microphone:false}},calibrationDialog:{},els:{hearStartingNote:{disabled:false}},
  openStartingNote:async()=>{calls.push('selector');return true;},startingNoteForRange:()=>({midi:70}),effectiveOctaveShift:()=>-24,toast(){}};
 const hear=new Function(...Object.keys(deps),fnSource+'; return hearStartingNote;')(...Object.values(deps));
 await hear();await hear();assert.deepEqual(calls,[46,46]);assert.equal(state.startingConfirmedSession,false);
 state.startingConfirmedSession=false;await hear();assert.equal(calls.at(-1),46);
});
test('starting-note preview in either practice mode never requests a microphone',async()=>{
 const fnSource=source.slice(source.indexOf('async function hearStartingNote()'),source.indexOf('\nfunction updateVolume('));
 for(const mode of ['assisted','assessment']){
  const pitches=[],deps={state:{mode,microphoneDecision:'skipped'},audio:{previewPitch:async midi=>pitches.push(midi)},els:{hearStartingNote:{}},startingNoteForRange:()=>({midi:70}),effectiveOctaveShift:()=>-24,toast(){}};
  const hear=new Function(...Object.keys(deps),fnSource+';return hearStartingNote;')(...Object.values(deps));await hear();assert.deepEqual(pitches,[46]);
 }
});
test('standalone migration preserves old hidden included scores, while normal browser ignores them',async()=>{
 const store=new RepertoireStore(new IDBFactory());await store.setting('hidden-builtins',['music/0.xml']);
 assert.equal((await catalogue(store,true)).rows().length,4);assert.equal((await catalogue(store,false)).rows().length,5);
 const c=await catalogue(store,true);await c.restore();assert.equal((await catalogue(store,true)).rows().length,5);(await store.ready).close();
});
test('stopping an already completed take never finalises again or discards its saved recording',async()=>{
 let completed=0,stopped=0;const state={takeCompleted:true,mode:'assisted',samples:[{}]},recording={url:'blob:take'};state.recording=recording;
 const fnSource=source.slice(source.indexOf('async function stop('),source.indexOf('\nasync function restartTransport('));
 const deps={state,usingMicrophone:()=>true,MODE_CONFIG:{assisted:{microphone:true}},audio:{stop(){stopped++;}},finishAssessment:async()=>completed++,currentPracticeRange:()=>({startQuarter:4}),unlockSessionOctave(){},cancelAnimationFrame(){},setPlaybackState(){},setCursorToQuarter(){},updatePosition(){},setStatus(){}};
 const stop=new Function(...Object.keys(deps),fnSource+'; return stop;')(...Object.values(deps));await stop();assert.equal(completed,0);assert.equal(stopped,1);assert.equal(state.recording,recording);
});
test('navigation reflects the revised brief: evenly spaced actions and modes; music controls stay by the part',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
 const start=html.indexOf('id="studioHeaderControls"'),nav=html.slice(start,html.indexOf('</nav>',start));
 for(const text of ['newScoreButton','setupPanel','mixerPanel','studioTutorialButton','data-view="vocal"','data-view="full"','editPracticeButton','data-mode="assisted"','data-mode="assessment"'])assert.ok(nav.includes(text));
 for(const id of ['hearStartingNote','changeOctaveButton','transportDock','tempoPanel','listenBackButton'])assert.ok(!nav.includes(`id="${id}"`));
 assert.ok(!html.includes('id="finishButton"'));assert.ok(!html.includes('tolerance-legend'));
 assert.match(html,/class="session-data" hidden/);assert.match(html,/> Show previous take<|\/> Show previous take</);
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(80px,1fr\)\)/);
 assert.doesNotMatch(css,/label\[for\]:focus-within[^}]*outline:\s*3px/);
});

test('Repeat is inside the selection editor and previous take is beside Listen back',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const editor=html.slice(html.indexOf('id="practiceEditor"'),html.indexOf('</section>',html.indexOf('id="practiceEditor"')));
 assert.ok(editor.includes('id="repeatPractice"'));
 const controls=html.slice(html.indexOf('class="score-practice-controls"'),html.indexOf('class="score-secondary-controls"'));
 assert.ok(controls.indexOf('id="previousTakeControl"')>controls.indexOf('id="listenBackButton"'));
 assert.ok(!controls.includes('id="repeatPractice"'));
});
