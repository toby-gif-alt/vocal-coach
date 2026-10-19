import {colourForCents,midiToFrequency} from './config.js?v=32';
import {pitchName} from './starting-note.js?v=32';
import {pointForSample,traceSegments} from './score-overlay.js?v=32';
import {playbackRoutes} from './playback-routing.js?v=24';
import {correctionCents,singingTone} from './tutorial-demo.js?v=32';
const NS='http://www.w3.org/2000/svg';
const svg=(name,attrs)=>{const e=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
export function renderTutorialTrace(container,geometry,samples){
 const pages=[...container.querySelectorAll('svg[id^="osmdSvgPage"]')];
 const layers=pages.map(page=>{page.querySelector('.tutorial-demo-trace')?.remove();const layer=svg('g',{class:'tutorial-demo-trace','aria-label':'Demonstration trace — simulated singing'});page.append(layer);return layer;});
 for(const s of samples){const p=pointForSample(geometry.get(s.targetId),s);if(p)layers[p.pageIndex]?.append(svg('circle',{cx:p.x,cy:p.y,r:2,fill:colourForCents(s.cents)}));}
 for(const segment of traceSegments(samples,geometry))layers[segment.to.pageIndex]?.append(svg('line',{x1:segment.from.x,y1:segment.from.y,x2:segment.to.x,y2:segment.to.y,stroke:segment.colour,'stroke-width':3,'stroke-linecap':'round'}));
}
export function createDemoUI(bridge){
 const {state,audio,els,$}=bridge;let samples=[],lastSample=-1,lastIndex=-1,lastOctave=null,example=null,analysis=null;
 const textIds=['detectedNote','detectedFrequency','centsOutput','tuningPhase'];
 const uiEvent=(element,type)=>element.dispatchEvent(new Event(type,{bubbles:true}));
 function setControl(element,value){if(element.type==='checkbox')element.checked=value;else element.value=String(value);uiEvent(element,element.type==='checkbox'||element.tagName==='SELECT'?'change':'input');}
 return {
  blocked:()=>!state.score||state.finishingAssessment||state.transportPreparing||audio.isPlaying||audio.isPaused||audio.isCountingIn||state.microphonePreparing||bridge.calibration().active||bridge.octaves().active||state.reviewPlaying,
  capture(){
   state.tutorialDemoActive=true;audio.pausePitchSampling();
   return {guideByMode:structuredClone(state.guideByMode),guideVoice:state.guideVoice,guideVolume:state.guideVolume,partVolumes:{...state.partVolumes},partVoices:{...state.partVoices},enabledParts:[...state.enabledParts],tempo:audio.tempoPercent,cursor:state.cursorQuarter,follow:state.lastFollowSystem,
    panels:[$('#mixerPanel'),$('#tempoPanel')].map(e=>[e,e.open]),meter:{className:els.tuningMeter.className,style:els.tuningMeter.getAttribute('style'),label:els.tuningMeter.getAttribute('aria-label'),value:els.tuningMeter.getAttribute('aria-valuenow'),texts:textIds.map(id=>[$('#'+id),$('#'+id).textContent,$('#'+id).getAttribute('style')])},
    review:{hidden:$('#reviewCompanion').hidden,layout:document.querySelector('.studio-layout').classList.contains('has-review'),player:els.performancePlayback.hidden},repeat:$('#repeatPractice').checked};
  },
  async prepare(kind,isCurrent=()=>true){
   await audio.tone.start();if(!isCurrent()||!state.tutorialDemoActive)throw Error('Demo cancelled.');
   audio.ensurePlaybackEngines();
   await audio.ensureRoutesReady(playbackRoutes(state.score.parts,{vocalPartId:state.selectedPartId,guideEnabled:true,enabledPartIds:state.score.parts.filter(p=>p.id!==state.selectedPartId).map(p=>p.id)}));
   if(!isCurrent()||!state.tutorialDemoActive)throw Error('Demo cancelled.');
   const part=bridge.selectedPart(),range=bridge.range(),notes=part.vocalTimeline.filter(n=>n.onsetQuarters>=range.startQuarter&&n.onsetQuarters<range.endQuarter).slice(0,5);
   if(!notes.length)notes.push(...part.vocalTimeline.slice(0,5));
   if(!notes.length)throw Error('Choose a score with a vocal melody for this example.');
   const context=audio.tone.getContext().rawContext,shift=state.octaveShift;
   setControl($('#guideEnabled'),true);setControl(els.guideVolume,70);
   const accompaniment=state.score.parts.find(p=>p.id!==part.id&&/piano/i.test(p.name))||state.score.parts.find(p=>p.id!==part.id);
   samples=[];lastSample=-1;lastIndex=-1;lastOctave=null;
   if(['pitch','starting','phrase'].includes(kind))document.body.classList.add('tutorial-demo-meter');
   if(kind==='mixer'){
    $('#mixerPanel').open=true;document.body.classList.add('tutorial-demo-mixer');
    const source=audio.partEngines.get(accompaniment?.id)?.instrument.masterGain;
    if(source){const analyser=context.createAnalyser();analyser.fftSize=512;source.connect(analyser);analysis={source,analyser,buffer:new Float32Array(512)};}
   }
   if(kind==='tempo')$('#tempoPanel').open=true;
   if(kind==='octaves')void bridge.octaves().open({listen:false,chosen:true,demonstration:true});
   if(kind==='practice'){
    $('#repeatPractice').checked=true;bridge.previewRange(notes[0].measureNumber,notes[Math.min(1,notes.length-1)].measureNumber);
   }
   if(kind==='review'){
    const companion=$('#reviewCompanion');companion.hidden=false;document.querySelector('.studio-layout').classList.add('has-review');els.performancePlayback.hidden=true;
    example=document.createElement('section');example.className='tutorial-example-review';example.innerHTML='<small>Example take — simulated singing</small><h3>Listen to this bar</h3><p>The note began flat, then moved towards the centre. This example never becomes one of your takes.</p><p>Watch the score cursor and coloured line as the bar plays.</p>';companion.append(example);
   }
   bridge.layout();
   return {context,notes,shift,targetMidi:notes[0].midi+shift,accompaniment};
  },
  sound(kind,data,start,phrase){
   const voices=[],part=audio.partEngines.get(state.selectedPartId);
   const note=(midi,time,duration,velocity=.5)=>part?.instrument.triggerAttackRelease({midi,time,duration,velocity});
   if(kind==='starting')note(data.targetMidi,start,1);
   if(kind==='pitch')voices.push(singingTone(data.context,data.targetMidi,start,6.4,correctionCents));
   if(kind==='octaves'){note(data.notes[0].midi,start,1);note(data.notes[0].midi-12,start+2.2,1);}
   if(!['starting','pitch','octaves','mixer'].includes(kind))for(const entry of phrase){
    const duration=entry.end-entry.start;
    note(entry.note.midi+data.shift,start+entry.start,duration*.9,.4);
    voices.push(singingTone(data.context,entry.note.midi+data.shift,start+entry.start,duration,t=>entry.index%3===0?-35:entry.index%3===1?-35+37*t/duration:2));
   }
   return ()=>{audio.releaseAllPlaybackEngines();voices.forEach(stop=>stop());};
  },
  mix(stage,data){
   const part=data.accompaniment;if(!part)return;
   const volume=[95,30,30,40,40][stage],enabled=stage!==2;
   const slider=document.querySelector('[data-part-volume="'+CSS.escape(part.id)+'"]'),toggle=document.querySelector('[data-part-enabled="'+CSS.escape(part.id)+'"]');
   setControl(slider,volume);setControl(toggle,enabled);
   slider.closest('.part-mixer-row').classList.add('tutorial-mixer-target');slider.scrollIntoView({block:'nearest'});
   setControl(els.guideVolume,stage===4?80:40);
   if(stage===4){setControl(els.guideVoice,state.guideVoice==='human'?'synthetic-ah':'human');els.guideVoice.scrollIntoView({block:'nearest'});}
   const time=data.context.currentTime+.04,channel=audio.partEngines.get(part.id),source=part.notes.filter(n=>Number.isFinite(n.midi));
   for(let i=0;i<2;i++){
    if(enabled)channel?.instrument.triggerAttackRelease({midi:source[i%Math.max(1,source.length)]?.midi??data.notes[0].midi-12,time:time+i*.55,duration:.5,velocity:.65});
    audio.partEngines.get(state.selectedPartId)?.instrument.triggerAttackRelease({midi:data.notes[i%data.notes.length].midi+data.shift,time:time+i*.55,duration:.5,velocity:.45});
   }
  },
  display(kind,value,data,seconds){
   if(kind==='mixer'&&analysis){
    analysis.analyser.getFloatTimeDomainData(analysis.buffer);const rms=Math.sqrt(analysis.buffer.reduce((sum,v)=>sum+v*v,0)/analysis.buffer.length);
    const row=document.querySelector('[data-part-volume="'+CSS.escape(data.accompaniment.id)+'"]')?.closest('.part-mixer-row');
    if(row){row.dataset.demoRms=String(rms);row.dataset.demoGain=String(analysis.source.gain.value);let meter=row.querySelector('.tutorial-sound-level');if(!meter){meter=document.createElement('meter');meter.className='tutorial-sound-level';meter.min=0;meter.max=.12;meter.setAttribute('aria-label','Actual example accompaniment sound level');row.append(meter);}meter.value=rms;}
   }
   if(Number.isFinite(value.midi)&&['pitch','starting','phrase'].includes(kind)){
    const meter=els.tuningMeter,cents=value.cents,colour=colourForCents(cents);meter.classList.remove('is-inactive','is-listening','is-held');meter.style.setProperty('--tuner-position',`${50-Math.max(-50,Math.min(50,cents))}%`);meter.style.setProperty('--tuner-colour',colour);meter.setAttribute('aria-valuenow',String(Math.round(cents)));meter.setAttribute('aria-label',`Demonstration: ${Math.round(cents)} cents`);
    els.tuningPhase.textContent=`Demonstration — simulated singing · Target ${pitchName(value.targetMidi)}`;els.detectedNote.textContent=pitchName(value.midi);els.detectedFrequency.textContent=`${value.frequency.toFixed(1)} Hz · simulated`;els.centsOutput.textContent=`${Math.abs(Math.round(cents))} cents ${cents<0?'flat':cents>0?'sharp':'centred'}`;els.detectedNote.style.color=colour;
   }
   if(kind==='octaves'&&lastOctave!==value.shift){lastOctave=value.shift;bridge.octaves().selectDemo(value.shift);}
   if(value.note){
    if(seconds-lastSample>=.035){samples.push({...value});lastSample=seconds;renderTutorialTrace(els.scoreContainer,state.scoreGeometry,samples);}
    bridge.cursor(value.scoreQuarter,value.note);
    if(kind==='tempo'&&lastIndex!==value.index){setControl(els.tempoSlider,value.index<2?100:70);}
    lastIndex=value.index;
   }
  },
  restore(snapshot){
   state.guideByMode=snapshot.guideByMode;state.guideVolume=snapshot.guideVolume;state.guideVoice=snapshot.guideVoice;state.partVolumes=snapshot.partVolumes;state.partVoices=snapshot.partVoices;state.enabledParts=new Set(snapshot.enabledParts);
   audio.setGuideVolume(snapshot.guideVolume);audio.setGuideVoice(snapshot.guideVoice);
   for(const [id,volume]of Object.entries(snapshot.partVolumes)){audio.setPartVolume(id,volume);audio.setPartEnabled(id,state.enabledParts.has(id));}
   for(const [id,voice]of Object.entries(snapshot.partVoices))audio.setPartVoice(id,voice);
   audio.setTempo(snapshot.tempo);els.tempoSlider.value=String(snapshot.tempo);els.tempoOutput.textContent=`${snapshot.tempo}%`;$('#tempoSummary').textContent=els.tempoOutput.textContent;els.bpmLabel.textContent=`${Math.round(audio.bpm)} BPM`;
   bridge.renderMix();bridge.renderGuide();els.guideVoice.value=snapshot.guideVoice;
   for(const [panel,open]of snapshot.panels)panel.open=open;
   const m=snapshot.meter;els.tuningMeter.className=m.className;for(const [attr,value]of [['style',m.style],['aria-label',m.label],['aria-valuenow',m.value]]){if(value===null)els.tuningMeter.removeAttribute(attr);else els.tuningMeter.setAttribute(attr,value);}for(const [e,text,style]of m.texts){e.textContent=text;if(style===null)e.removeAttribute('style');else e.setAttribute('style',style);}
   $('#repeatPractice').checked=snapshot.repeat;$('#reviewCompanion').hidden=snapshot.review.hidden;els.performancePlayback.hidden=snapshot.review.player;document.querySelector('.studio-layout').classList.toggle('has-review',snapshot.review.layout);
   bridge.restoreCursor(snapshot.cursor);state.lastFollowSystem=snapshot.follow;bridge.restoreRange();
   state.tutorialDemoActive=false;if(audio.stream&&state.mode!=='listen')audio.startPitchSampling();
  },
  cleanup(){
   state.tutorialDemoActive=false;
   if(analysis){try{analysis.source.disconnect(analysis.analyser);}catch{}analysis.analyser.disconnect();analysis=null;}
   document.querySelectorAll('.tutorial-sound-level').forEach(e=>e.remove());
   samples=[];document.querySelectorAll('.tutorial-demo-trace').forEach(e=>e.remove());document.querySelectorAll('.tutorial-mixer-target').forEach(e=>e.classList.remove('tutorial-mixer-target'));document.body.classList.remove('tutorial-demo-meter','tutorial-demo-mixer');bridge.octaves().closeDemo();example?.remove();example=null;bridge.layout();
  },
 };
}
