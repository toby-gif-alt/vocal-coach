import {colourForCents,midiToFrequency} from './config.js?v=34';
import {pitchName} from './starting-note.js?v=34';
import {pointForSample,traceSegments} from './score-overlay.js?v=34';
import {playbackRoutes} from './playback-routing.js?v=34';
import {correctionCents,singingTone,demoPhrase,phraseReviewPlan} from './tutorial-demo.js?v=34';
const NS='http://www.w3.org/2000/svg';
const svg=(name,attrs)=>{const e=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
export function renderTutorialTrace(container,geometry,samples){
 const pages=[...container.querySelectorAll('svg[id^="osmdSvgPage"]')];
 const layers=pages.map(page=>{page.querySelector('.tutorial-demo-trace')?.remove();const layer=svg('g',{class:'tutorial-demo-trace','aria-label':'Demonstration trace — simulated singing'});page.append(layer);return layer;});
 for(const s of samples){const p=pointForSample(geometry.get(s.targetId),s);if(p)layers[p.pageIndex]?.append(svg('circle',{cx:p.x,cy:p.y,r:2,fill:colourForCents(s.cents)}));}
 for(const segment of traceSegments(samples,geometry))layers[segment.to.pageIndex]?.append(svg('line',{x1:segment.from.x,y1:segment.from.y,x2:segment.to.x,y2:segment.to.y,stroke:segment.colour,'stroke-width':3,'stroke-linecap':'round'}));
}
// Temporary output-only simulations use the real controls and notation. Real
// recordings, assessment arrays and preference stores are never written here.
export function createDemoUI(bridge){
 const {state,audio,els,$}=bridge;
 let samples=[],lastSample=-1,lastQuarter=-1,lastOctave=null,lastView=null,review=null,voiceGain=null,pointer=null,pointerTarget=null,pointerAnimation=null;
 const textIds=['detectedNote','detectedFrequency','centsOutput','tuningPhase'];
 const clamp=value=>Math.max(0,Math.min(1,value));
 function point(element,progress=.5){
  if(!element)return;pointer??=Object.assign(document.createElement('span'),{className:'tutorial-pointer',textContent:'☝'});
  if(!pointer.isConnected)document.body.append(pointer);
  const r=element.getBoundingClientRect(),left=r.left+r.width*progress,top=r.top+r.height*.6;
  pointer.style.left=`${left}px`;pointer.style.top=`${top}px`;
  if(pointerTarget!==element){
   pointerAnimation?.cancel();pointerTarget=element;
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches)pointerAnimation=pointer.animate([
    {transform:`translate(${innerWidth/2-left}px,${innerHeight/2-top}px)`},
    {transform:'translate(-20%,0)'},
   ],{duration:700,easing:'ease-out'});
  }
 }
 function control(element,value){if(!element)return;const existing=element.type==='checkbox'?element.checked:element.value;if(String(existing)===String(value))return;if(element.type==='checkbox')element.checked=value;else element.value=String(value);element.dispatchEvent(new Event(element.type==='checkbox'?'change':'input',{bubbles:true}));}
 function mode(value){state.mode=value;els.modeButtons.forEach(button=>{const selected=button.dataset.mode===value;button.classList.toggle('active',selected);button.setAttribute('aria-checked',String(selected));});}
 function isolateLabels(root){
  for(const element of [root,...root.querySelectorAll('[aria-labelledby],[aria-describedby]')])for(const attribute of ['aria-labelledby','aria-describedby']){
   const value=element.getAttribute(attribute);if(value)element.setAttribute(attribute,value.split(/\s+/).map(id=>id.startsWith('demo-')?id:'demo-'+id).join(' '));
  }
 }
 function makeReview(assessment,data){
  review?.remove();
  // Clone the production review surfaces, with unique IDs and isolated actions.
  // They cannot dispatch into a real recording or coaching session.
  review=document.createElement('section');review.className='tutorial-review-example';review.setAttribute('aria-label','Example take — simulated singing');
  const label=document.createElement('p');label.className='demo-review-label';label.textContent='Example take — simulated singing, not your results';review.append(label);
  const player=els.performancePlayback.cloneNode(true);player.hidden=false;player.classList.remove('floating-review');
  player.querySelector('audio')?.remove();
  player.querySelector('.performance-playback-head .kicker').textContent='Simulated example';
  for(const element of player.querySelectorAll('button,input,select'))element.disabled=true;for(const element of player.querySelectorAll('summary'))element.tabIndex=-1;player.querySelector('[data-review-layer="melody"]').checked=data.guideEnabled;
  for(const e of player.querySelectorAll('[id]'))e.id='demo-'+e.id;
  for(const e of player.querySelectorAll('[for]'))e.htmlFor='demo-'+e.htmlFor;
  player.removeAttribute('id');isolateLabels(player);
  if(assessment){
   const feedback=els.resultsPanel.cloneNode(true);feedback.removeAttribute('id');feedback.removeAttribute('open');feedback.hidden=false;feedback.classList.add('tutorial-feedback-example');
   for(const e of feedback.querySelectorAll('[id]'))e.id='demo-'+e.id;isolateLabels(feedback);
   feedback.querySelector('#demo-resultsKicker').textContent='Demonstration feedback';
   feedback.querySelector('#demo-resultsHeading').textContent='Example Assessment';feedback.querySelector('#demo-coachLevel').hidden=true;feedback.querySelector('#demo-coachIntro').textContent='Watch the marked note and hear its bar. These observations describe the simulated singer.';
   feedback.querySelector('#demo-assessmentScope').textContent='Three things to work on · two things done well · in score order';
   feedback.querySelector('#demo-detailedAnalysis').hidden=true;
   feedback.querySelector('#demo-feedbackAudioSlot').append(player);feedback.querySelector('#demo-coachObservations').after(feedback.querySelector('.coaching-step-controls'));
   for(const b of feedback.querySelectorAll('button'))b.disabled=true;
   review.append(feedback);$('#reviewCompanion').append(review);feedback.show();
  }else{review.append(player);$('#reviewCompanion').append(review);}
  $('#reviewCompanion').hidden=false;document.querySelector('.studio-layout').classList.add('has-review');
  player.querySelector('#demo-performancePlaybackHeading').textContent=assessment?'Hear the marked bar':'Listen to the example take';
  player.querySelector('.performance-playback-head > span').textContent='Synced to score';
  player.querySelector('.performance-playback > p')?.remove();
  const volumeInputs=player.querySelectorAll('[data-review-volume]');
  for(const input of volumeInputs)input.disabled=true;
  bridge.layout();document.querySelector('.tutorial-card [data-tour="next"]')?.focus({preventScroll:true});return player;
 }
 return {
  unlock(){void audio.tone.start().catch(()=>{});},
  blocked:()=>!state.score||state.finishingAssessment||state.transportPreparing||audio.isPlaying||audio.isPaused||audio.isCountingIn||state.microphonePreparing||bridge.calibration().active||bridge.octaves().active||state.reviewPlaying,
  capture(){
   state.tutorialDemoActive=true;audio.pausePitchSampling();
   const engineReview=audio.review,transportBpm=audio.transport?.bpm?.value;audio.review=null;audio.restorePerformanceVolumes?.();
   return {engineReview,transportBpm,guideSettings:{...state.guideSettings},guideVoice:state.guideVoice,partVolumes:{...state.partVolumes},partVoices:{...state.partVoices},enabledParts:[...state.enabledParts],tempo:audio.tempoPercent,cursor:state.cursorQuarter,follow:state.lastFollowSystem,mode:state.mode,view:state.scoreView,
    panels:[$('#setupPanel'),$('#mixerPanel'),$('#tempoPanel')].map(e=>[e,e.open]),
    practice:[$('#practiceEditor').hidden,els.sectionFrom.value,els.sectionTo.value,$('#practiceRangeStatus').textContent,$('#sectionValidation').textContent,$('#editPracticeButton').getAttribute('aria-expanded')],
    meter:{className:els.tuningMeter.className,style:els.tuningMeter.getAttribute('style'),label:els.tuningMeter.getAttribute('aria-label'),value:els.tuningMeter.getAttribute('aria-valuenow'),texts:textIds.map(id=>[$('#'+id),$('#'+id).textContent,$('#'+id).getAttribute('style')])},
    review:{hidden:$('#reviewCompanion').hidden,layout:document.querySelector('.studio-layout').classList.contains('has-review'),player:els.performancePlayback.hidden,feedback:els.resultsPanel.open},repeat:$('#repeatPractice').checked};
  },
  async prepare(kind,isCurrent=()=>true){
   $('#setupPanel').open=false;$('#mixerPanel').open=false;$('#tempoPanel').open=false;
   if(els.resultsPanel.open)els.resultsPanel.close();els.performancePlayback.hidden=true;$('#reviewCompanion').hidden=true;document.querySelector('.studio-layout').classList.remove('has-review');
   audio.ensurePlaybackEngines();
   await audio.ensureRoutesReady(playbackRoutes(state.score.parts,{vocalPartId:state.selectedPartId,guideEnabled:true,enabledPartIds:state.score.parts.filter(p=>p.id!==state.selectedPartId).map(p=>p.id)}));
   if(!isCurrent())throw Error('Example cancelled.');
   const part=bridge.selectedPart(),range=bridge.range();
   const available=part.vocalTimeline.filter(n=>n.onsetQuarters>=range.startQuarter&&n.onsetQuarters<range.endQuarter);
   const first=(available[0]||part.vocalTimeline[0]);if(!first)throw Error('Choose a score with a vocal melody.');
   const bars=[...new Set(part.vocalTimeline.filter(n=>n.onsetQuarters>=first.onsetQuarters).map(n=>n.measureNumber))].slice(0,2);
   const notes=part.vocalTimeline.filter(n=>n.onsetQuarters>=first.onsetQuarters&&bars.includes(n.measureNumber)).slice(0,8);
   const context=audio.tone.getContext().rawContext,shift=state.octaveShift;
   const data={context,notes,shift,targetMidi:first.midi+shift,bpm:audio.baseTempo||80,parts:state.score.parts.filter(p=>p.id!==part.id),guideEnabled:state.guideSettings.enabled,audioAvailable:context.state==='running'};
   samples=[];lastSample=-1;lastQuarter=-1;lastOctave=null;lastView=null;
   if(kind!=='assessment'){control($('#guideEnabled'),true);control(els.guideVolume,70);data.guideEnabled=true;}
   document.body.classList.add('tutorial-demo-meter');
   if(kind==='octaves')void bridge.octaves().open({listen:false,chosen:true,demonstration:true});
   if(kind==='mixer'){
    $('#mixerPanel').open=true;document.body.classList.add('tutorial-demo-mixer');
    for(const p of data.parts){control(document.querySelector(`[data-part-enabled="${CSS.escape(p.id)}"]`),true);control(document.querySelector(`[data-part-volume="${CSS.escape(p.id)}"]`),0);audio.setPartEnabled(p.id,true);audio.setPartVolume(p.id,0);}
   }
   if(kind==='tempo'){$('#tempoPanel').open=true;control(els.tempoSlider,100);}
   data.timeline=demoPhrase(notes,kind,data.bpm);
   if(kind==='phrase')Object.assign(data,phraseReviewPlan(notes,data.bpm));
   if(kind==='practice'){
    $('#practiceEditor').hidden=false;$('#editPracticeButton').setAttribute('aria-expanded','true');els.sectionFrom.value='';els.sectionTo.value='';$('#repeatPractice').checked=false;
    data.timeline=data.timeline.map(e=>({...e,start:e.start+2.2,end:e.end+2.2}));
   }
   bridge.layout();return data;
  },
  sound(kind,data,start,timeline){
   const voices=[],guide=audio.partEngines.get(state.selectedPartId)?.instrument;
   voiceGain=data.context.createGain();voiceGain.gain.value=1;voiceGain.connect(data.context.destination);
   const note=(midi,time,duration)=>guide?.triggerAttackRelease({midi,time,duration,velocity:.45});
   if(kind==='starting'){note(data.targetMidi,start,.8);voices.push(singingTone(data.context,data.targetMidi,start+1.3,1.3,()=>0,voiceGain));}
   if(kind==='assisted'||kind==='assessment')for(let beat=0;beat<2;beat++){
    const oscillator=data.context.createOscillator(),gain=data.context.createGain(),time=start+beat*60/data.bpm;oscillator.frequency.value=beat?660:880;gain.gain.setValueAtTime(.035,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.06);oscillator.connect(gain).connect(data.context.destination);oscillator.start(time);oscillator.stop(time+.07);voices.push(()=>{try{oscillator.stop();}catch{}oscillator.disconnect();gain.disconnect();});
   }
   if(kind==='pitch'){note(data.targetMidi,start,.7);voices.push(singingTone(data.context,data.targetMidi,start+.8,5.6,t=>correctionCents(t+.8),voiceGain));}
   if(kind==='octaves'){note(data.notes[0].midi,start,1);note(data.notes[0].midi-12,start+2.2,1);}
   if(!['starting','pitch','octaves','views'].includes(kind))for(const entry of timeline){
    const duration=Math.min(entry.duration,entry.end-entry.start),time=start+entry.start;
    if(data.guideEnabled)note(entry.note.midi+data.shift,time,duration*.9);
    if(kind!=='mixer')voices.push(singingTone(data.context,entry.note.midi+data.shift,time,duration,t=>entry.index%3===0?-35:entry.index%3===1?-35+37*t/duration:2,voiceGain));
    for(const p of data.parts){
     if(kind!=='mixer'&&!state.enabledParts.has(p.id))continue;
     for(const n of p.notes.filter(n=>Number.isFinite(n.midi)&&n.onsetQuarters>=entry.note.onsetQuarters&&n.onsetQuarters<entry.endQuarter))
      audio.partEngines.get(p.id)?.instrument.triggerAttackRelease({midi:n.midi,time:time+(n.onsetQuarters-entry.note.onsetQuarters)*entry.rate,duration:Math.min(n.durationQuarters,entry.endQuarter-n.onsetQuarters)*entry.rate*.9,velocity:.4});
    }
   }
   return ()=>{audio.releaseAllPlaybackEngines();voices.forEach(stop=>stop());voiceGain?.disconnect();voiceGain=null;};
  },
  async display(kind,value,data,seconds,isCurrent=()=>true){
   if(kind==='views'&&lastView!==value.view){lastView=value.view;point(document.querySelector(value.target));await bridge.view(value.view);if(!isCurrent())return;}
   if(kind==='starting')point(document.querySelector(value.target));
   if(kind==='octaves'&&lastOctave!==value.shift){lastOctave=value.shift;bridge.octaves().selectDemo(value.shift);point(document.querySelector(`[data-shift="${value.shift}"] .octave-card-choice`));}
   if(kind==='mixer'){
    const total=data.timeline.at(-1).end,bringIn=total*.65;
    data.parts.forEach((part,index)=>{
     const volume=Math.round(70*clamp((seconds-.4-index*bringIn/Math.max(1,data.parts.length))/Math.max(.3,bringIn/data.parts.length)));
     const reduced=index===0?Math.round(volume*(1-.6*clamp((seconds-total*.72)/(total*.15)))):volume;
     const slider=document.querySelector(`[data-part-volume="${CSS.escape(part.id)}"]`);
     if(slider&&Number(slider.value)!==reduced){control(slider,reduced);const pane=slider.closest('.mixer-grid'),rect=slider.getBoundingClientRect(),bounds=pane.getBoundingClientRect();if(rect.bottom>bounds.bottom-12)pane.scrollTop+=rect.bottom-bounds.bottom+24;else if(rect.top<bounds.top+12)pane.scrollTop-=bounds.top-rect.top+24;point(slider,reduced/100);slider.closest('.part-mixer-row').classList.add('tutorial-mixer-target');}
    });
    value.message=seconds<total*.7?'Listen as each accompaniment joins the guide.':'Lower the loudest accompaniment so the guide is clearer.';
   }
   if(kind==='practice'){
    const first=data.notes[0].measureNumber,last=data.notes.at(-1).measureNumber;
    $('#practiceRangeStatus').textContent=`Selected: bars ${first}–${seconds<1?first:last}`;$('#sectionValidation').textContent='Enter bar numbers, or click and drag across the score. Repeat plays this section again.';
    if(seconds<.4)point($('#editPracticeButton'));
    else if(seconds<1.6){
     els.sectionFrom.value=String(first);els.sectionTo.value=String(seconds<1?first:last);
     const regions=[...els.scoreContainer.querySelectorAll('.score-measure-region')],region=regions.find(r=>Number(r.dataset.measureNumber)===(seconds<1?first:last));point(region,clamp((seconds-.4)/1.2));
     bridge.previewRange(first,seconds<1?first:last);$('#practiceRangeStatus').textContent=`Selected: bars ${first}–${seconds<1?first:last}`;
    }else{$('#repeatPractice').checked=true;point($('#repeatPractice'));}
   }
   if(kind==='tempo'&&value.note){control(els.tempoSlider,value.pass===0?100:Math.round(100-30*clamp((seconds-data.timeline.find(e=>e.pass===1).start)/.3)));point(els.tempoSlider,value.pass===0?.5:.2);}
   if(Number.isFinite(value.midi)&&value.voiced!==false){
    const meter=els.tuningMeter,cents=value.cents,colour=colourForCents(cents);meter.classList.remove('is-inactive','is-listening','is-held');meter.style.setProperty('--tuner-position',`${50-Math.max(-50,Math.min(50,cents))}%`);meter.style.setProperty('--tuner-colour',colour);meter.setAttribute('aria-valuenow',String(Math.round(cents)));meter.setAttribute('aria-label',`Demonstration: ${Math.round(cents)} cents`);
    els.tuningPhase.textContent=`Demonstration — target ${pitchName(value.targetMidi)}`;els.detectedNote.textContent=pitchName(value.midi);els.detectedFrequency.textContent=`${value.frequency.toFixed(1)} Hz · simulated`;els.centsOutput.textContent=`${Math.abs(Math.round(cents))} cents ${cents<0?'flat':cents>0?'sharp':'centred'}`;els.detectedNote.style.color=colour;
   }
   if((kind==='assisted'||kind==='assessment')&&seconds<data.countInDuration){
    els.countInDisplay.hidden=false;$('#countInBar').textContent=`Example count-in · ${Math.max(1,2-Math.floor(seconds/(60/data.bpm)))}`;point($('#dockPlayPauseButton'));
   }else if(kind==='assisted'||kind==='assessment')els.countInDisplay.hidden=true;
   if(value.note){
    if(!value.review&&value.scoreQuarter<lastQuarter)samples=[];lastQuarter=value.scoreQuarter;
    if(!value.review&&value.voiced!==false&&seconds-lastSample>=.035){samples.push({...value});lastSample=seconds;renderTutorialTrace(els.scoreContainer,state.scoreGeometry,samples);}
    // Opening review reflows the notation; redraw the original take on its new geometry.
    if(value.review&&samples.length)renderTutorialTrace(els.scoreContainer,state.scoreGeometry,samples);
    bridge.cursor(value.scoreQuarter,value.note);
    if(value.review){
     const reviewMode=value.mode||kind;
     if(state.mode!==reviewMode||!review){mode(reviewMode);makeReview(reviewMode==='assessment',data);data.modeChangedAt=seconds;}
     value.target=seconds-data.modeChangedAt<1?`[data-mode="${reviewMode}"]`:'.tutorial-review-example';
     if(seconds-data.modeChangedAt<1){point(document.querySelector(value.target));value.message=`Select ${reviewMode==='assisted'?'Assisted to listen back':'Assessment for feedback in score order'}. Your singing line stays visible.`;}
     if(reviewMode==='assessment'){
      const observation=data.observations[value.observation];
      const list=review.querySelector('#demo-coachObservations');
      if(list.dataset.step!==String(value.observation)){
       list.dataset.step=String(value.observation);list.replaceChildren();
       if(observation){
        const card=document.createElement('article');card.className=`coach-card ${observation.tone}`;
        const title=document.createElement('strong');title.textContent=observation.title;
        const body=document.createElement('p');body.textContent=observation.body;card.append(title,body);list.append(card);
        review.querySelector('#demo-coachProgress').textContent=`${value.observation+1} of 5 · example feedback in score order`;
        bridge.mark({noteId:observation.note.id,measureNumber:observation.note.measureNumber});point(review.querySelector('#demo-feedbackContinueButton'));
       }else{
        review.querySelector('.tutorial-feedback-example').hidden=true;
        const player=review.querySelector('.performance-playback');review.append(player);player.querySelector('#demo-performancePlaybackHeading').textContent='Listen to the full example take';player.querySelector('.review-volumes').open=true;review.scrollTop=0;point(player.querySelector('#demo-performancePlay'));bridge.mark(null);
       }
      }
     }
     review.querySelector('#demo-performancePlay').innerHTML='⏸ <span>Playing example</span>';review.querySelector('#demo-performanceStop').disabled=true;
     const segment=data.timeline.filter(entry=>entry.review&&entry.observation===value.observation),begin=segment[0].start,duration=segment.at(-1).end-begin;
     review.querySelector('#demo-performanceCurrentTime').textContent=`${Math.floor(seconds-begin)}s`;review.querySelector('#demo-performanceDuration').textContent=`${Math.ceil(duration)}s`;
     const seek=review.querySelector('#demo-performanceSeek');seek.max=String(duration);seek.value=String(seconds-begin);
    }
   }
  },
  refresh(){if(samples.length)renderTutorialTrace(els.scoreContainer,state.scoreGeometry,samples);},
  finish(){
   if(review){review.querySelector('#demo-performancePlay').innerHTML='▶ <span>Example complete</span>';review.querySelector('.performance-playback-head > span').textContent='Repeat the tutorial example to hear it again';}
  },
  async restore(snapshot){
   state.guideSettings=snapshot.guideSettings;state.guideVoice=snapshot.guideVoice;state.partVolumes=snapshot.partVolumes;state.partVoices=snapshot.partVoices;state.enabledParts=new Set(snapshot.enabledParts);
   audio.setGuideVolume(snapshot.guideSettings.volume);audio.setGuideVoice(snapshot.guideVoice);
   for(const [id,volume]of Object.entries(snapshot.partVolumes)){audio.setPartVolume(id,volume);audio.setPartEnabled(id,state.enabledParts.has(id));}
   for(const [id,voice]of Object.entries(snapshot.partVoices))audio.setPartVoice(id,voice);
   audio.setTempo(snapshot.tempo);els.tempoSlider.value=String(snapshot.tempo);els.tempoOutput.textContent=`${snapshot.tempo}%`;$('#tempoSummary').textContent=els.tempoOutput.textContent;els.bpmLabel.textContent=`${Math.round(audio.bpm)} BPM`;
   bridge.renderMix();bridge.renderGuide();els.guideVoice.value=snapshot.guideVoice;mode(snapshot.mode);
   for(const [panel,open]of snapshot.panels)panel.open=open;
   const m=snapshot.meter;els.tuningMeter.className=m.className;for(const [attr,value]of [['style',m.style],['aria-label',m.label],['aria-valuenow',m.value]]){if(value===null)els.tuningMeter.removeAttribute(attr);else els.tuningMeter.setAttribute(attr,value);}for(const [e,text,style]of m.texts){e.textContent=text;if(style===null)e.removeAttribute('style');else e.setAttribute('style',style);}
   $('#repeatPractice').checked=snapshot.repeat;$('#practiceEditor').hidden=snapshot.practice[0];els.sectionFrom.value=snapshot.practice[1];els.sectionTo.value=snapshot.practice[2];$('#practiceRangeStatus').textContent=snapshot.practice[3];$('#sectionValidation').textContent=snapshot.practice[4];$('#editPracticeButton').setAttribute('aria-expanded',snapshot.practice[5]||'false');
   $('#reviewCompanion').hidden=snapshot.review.hidden;els.performancePlayback.hidden=snapshot.review.player;document.querySelector('.studio-layout').classList.toggle('has-review',snapshot.review.layout);
   if(snapshot.review.feedback){els.resultsPanel.show();bridge.mark(state.coachingSteps[state.coachingStep]);}
   if(state.scoreView!==snapshot.view)await bridge.view(snapshot.view);
   bridge.restoreCursor(snapshot.cursor);state.lastFollowSystem=snapshot.follow;bridge.restoreRange();
   audio.review=snapshot.engineReview;if(snapshot.engineReview){audio.applyReviewVolumes?.();if(audio.transport?.bpm&&Number.isFinite(snapshot.transportBpm))audio.transport.bpm.value=snapshot.transportBpm;}
   state.tutorialDemoActive=false;if(state.microphoneDecision==='ready'&&audio.hasMicrophoneStream)audio.startPitchSampling();
  },
  cleanup(){
   pointerAnimation?.cancel();pointerAnimation=null;pointerTarget=null;pointer?.remove();pointer=null;review?.remove();review=null;
   samples=[];lastQuarter=-1;els.countInDisplay.hidden=true;
   document.querySelectorAll('.tutorial-demo-trace').forEach(e=>e.remove());document.querySelectorAll('.tutorial-mixer-target').forEach(e=>e.classList.remove('tutorial-mixer-target'));document.body.classList.remove('tutorial-demo-meter','tutorial-demo-mixer');bridge.mark(null);bridge.octaves().closeDemo();bridge.layout();
  },
 };
}
