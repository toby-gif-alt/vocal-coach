import {midiToFrequency,colourForCents} from './config.js?v=34';
import {VOWEL_PRESETS} from './vocal-guide-instrument.js?v=34';
export const TUTORIAL_LESSONS=Object.freeze([
 {id:'starting',target:'#hearStartingNote',title:'Hear your starting note',copy:'Before singing, listen to your starting note. You can sing it back and use the pitch meter to check your voice.'},
 {id:'octaves',target:'#changeOctaveButton',title:'Choose your singing octave',copy:'Choose a comfortable register. The singing target and vocal guide change octave; the score and accompaniment stay as written.'},
 {id:'pitch',target:'#tuningMeter',title:'From flat to in tune',copy:'Listen and watch the singer gently raise their pitch towards the centre.'},
 {id:'phrase',target:'.score-viewport',title:'See your singing on the score',copy:'The line shows how your voice moves through the music. Its position shows your pitch, and the colour shows how accurately you’re singing.'},
 {id:'mixer',target:'#mixerPanel',title:'Balance your music',copy:'Bring the other parts in one at a time, then lower an accompaniment so your guide is easier to hear.'},
 {id:'tempo',target:'#tempoPanel',title:'Slow down the music',copy:'If a passage is difficult, slow it down. You can bring the speed back up when you’re ready.'},
 {id:'practice',target:'#editPracticeButton',title:'Practise a short section',copy:'Enter bar numbers or drag across the score. Repeat plays your selected bars again.'},
 {id:'views',target:'[data-view="vocal"]',title:'See the music your way',copy:'Vocal Focus shows your melody. Full Score shows how your part fits with the other voices and instruments.'},
 {id:'assisted',target:'[data-mode="assisted"]',title:'Practise with Assisted',copy:'Assisted helps you practise your singing and listen back to what you performed.'},
 {id:'assessment',target:'[data-mode="assessment"]',title:'Improve with Assessment',copy:'Assessment works like Assisted, but afterward it tells you what went well and what to improve.'},
]);
export function correctionCents(seconds){
 const progress=Math.max(0,Math.min(1,(seconds-2.4)/2));
 return -35+37*(progress*progress*(3-2*progress));
}
export function demoFrequency(midi,cents){return midiToFrequency(midi+cents/100);}
export function demoPhrase(notes,kind='phrase',bpm=80){
 const source=notes.slice(0,8);if(!source.length)return [];
 const first=source[0].onsetQuarters,end=Math.max(...source.map(n=>n.onsetQuarters+n.durationQuarters));
 const passes=kind==='practice'||kind==='tempo'||kind==='mixer'?2:1;
 let time=0;const entries=[];
 for(let pass=0;pass<passes;pass++){
  const rate=60/bpm/(kind==='tempo'&&pass===1?.7:1);
  for(let i=0;i<source.length;i++){
   const note=source[i],next=source[i+1]?.onsetQuarters??end;
   entries.push({note,start:time+(note.onsetQuarters-first)*rate,end:time+(next-first)*rate,duration:note.durationQuarters*rate,index:entries.length,pass,rate,endQuarter:next});
  }
  time+=(end-first)*rate;
 }
 return entries;
}
export function demoFrame(kind,seconds,data){
 const target=data.targetMidi;
 if(kind==='pitch'){
  const cents=correctionCents(seconds);return {target:'#tuningMeter',targetMidi:target,midi:target+cents/100,cents,frequency:demoFrequency(target,cents),colour:colourForCents(cents),message:seconds<2.4?'Here the singer is slightly flat.':seconds<4.4?'Now they’re raising their pitch.':'Green means they’re close to the correct note.'};
 }
 if(kind==='starting')return {target:seconds<1.2?'#hearStartingNote':'#tuningMeter',targetMidi:target,midi:target,cents:0,frequency:demoFrequency(target,0),message:seconds<1.2?'Listen to your starting note.':'Now sing that note! This pitch is a simulated example.'};
 if(kind==='octaves')return {target:'#startingNoteDialog',shift:seconds<2.2?0:-12,message:seconds<2.2?'Hear the written starting pitch.':'The singing target and guide now sound an octave lower. Accompaniment stays as written.'};
 if(kind==='views')return {target:seconds<2.5||seconds>=5?'[data-view="vocal"]':'[data-view="full"]',view:seconds<2.5||seconds>=5?'vocal':'full',message:seconds<2.5?'Follow only your singing part.':seconds<5?'The full score shows how your part fits into the harmony.':'Back to Vocal Focus.'};
 if(kind==='mixer')data.displayTarget='#mixerPanel .mixer-grid';
 if(kind==='tempo')data.displayTarget='#tempoPanel .tempo-field';
 const timeline=data.timeline||demoPhrase(data.notes,kind,data.bpm),entry=timeline.find(n=>seconds>=n.start&&seconds<n.end);
 if(!entry)return {message:kind==='assisted'||kind==='assessment'?'Count in…':''};
 const progress=Math.min(1,Math.max(0,(seconds-entry.start)/(entry.end-entry.start)));
 const voiceProgress=Math.min(1,Math.max(0,(seconds-entry.start)/Math.max(.001,entry.duration)));
 const cents=entry.index%3===0?-35:entry.index%3===1?-35+37*voiceProgress:2;
 return {voiced:seconds-entry.start<entry.duration,target:data.displayTarget,note:entry.note,targetId:entry.note.id,targetMidi:entry.note.midi+data.shift,midi:entry.note.midi+data.shift+cents/100,cents,frequency:demoFrequency(entry.note.midi+data.shift,cents),colour:colourForCents(cents),scoreQuarter:entry.note.onsetQuarters+(entry.endQuarter-entry.note.onsetQuarters)*progress,scoreSeconds:seconds,index:entry.index,pass:entry.pass,review:entry.review,observation:entry.observation,message:entry.review?'Example playback — simulated singing':kind==='tempo'?(entry.pass===0?'The melody at 100%.':'The same melody more slowly at 70%.'):kind==='practice'?`The selected bars repeat · pass ${entry.pass+1} of 2.`:'The line shows the pitch and accuracy of the simulated singer.'};
}
// Continuous audio uses the same cents function and audio-context clock as the
// visual frames. Its graph is output-only: never connected to a microphone.
export function singingTone(context,midi,start,duration,centsAt,destination=context.destination){
 const osc=context.createOscillator(),envelope=context.createGain(),nodes=[osc,envelope];osc.type='sawtooth';
 const count=Math.ceil(duration*120)+1;
 const curve=Float32Array.from({length:count},(_,i)=>demoFrequency(midi,centsAt(i*duration/(count-1))));
 osc.frequency.setValueCurveAtTime(curve,start,duration);
 for(const preset of VOWEL_PRESETS.ah.formants){const filter=context.createBiquadFilter(),gain=context.createGain();filter.type='bandpass';filter.frequency.value=preset.frequency;filter.Q.value=preset.frequency/preset.bandwidth;gain.gain.value=preset.gain*.12;osc.connect(filter);filter.connect(gain);gain.connect(envelope);nodes.push(filter,gain);}
 envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(.32,start+.04);envelope.gain.setValueAtTime(.32,start+Math.max(.04,duration-.08));envelope.gain.linearRampToValueAtTime(0,start+duration);envelope.connect(destination);osc.start(start);osc.stop(start+duration+.02);
 return ()=>{try{osc.stop();}catch{}for(const node of nodes)node.disconnect();};
}

// A generation owns its snapshot and all output-only audio. No live take data.
export function createTutorialDemos(adapter,{request=requestAnimationFrame,cancel=cancelAnimationFrame,now=()=>performance.now()/1000}={}){
 let generation=0,frame=null,active=false,snapshot=null,disposeAudio=null,restoring=Promise.resolve();
 function stop(){
  generation++;if(frame!==null)cancel(frame);frame=null;disposeAudio?.();disposeAudio=null;
  const saved=snapshot,owned=active||snapshot!==null;snapshot=null;active=false;
  if(owned)adapter.cleanup();
  if(saved!==null)restoring=Promise.resolve(adapter.restore(saved));
  return restoring;
 }
 function unlock(){adapter.unlock?.();}
 async function run(kind,onUpdate=()=>{}){
  stop();const token=++generation;await restoring;if(token!==generation||adapter.blocked())return false;
  active=true;
  try{
   snapshot=adapter.capture();
   const data=await adapter.prepare(kind,()=>token===generation);if(token!==generation)return false;
   data.timeline??=demoPhrase(data.notes,kind,data.bpm);
   const context=data.context,start=context.currentTime+.06,wallStart=now()+.06;
   const duration=data.duration??(kind==='pitch'?6.4:kind==='starting'?3:kind==='octaves'?4.6:kind==='views'?7.5:(data.timeline.at(-1)?.end||1)+.2);
   if(data.audioAvailable===false)onUpdate({audioBlocked:true});
   else disposeAudio=adapter.sound(kind,data,start,data.timeline);
   const tick=async()=>{
    if(token!==generation)return;
    const seconds=Math.max(0,data.audioAvailable===false?now()-wallStart:context.currentTime-start);
    const value=demoFrame(kind,seconds,data);
    await adapter.display(kind,value,data,seconds,()=>token===generation);
    if(token!==generation)return;
    onUpdate({...value,seconds,duration});
    if(seconds>=duration){stop();await restoring;if(token+1===generation)onUpdate({done:true,message:'Example complete. Continue when you’re ready.'});return;}
    frame=request(tick);
   };frame=request(tick);return true;
  }catch(error){if(token===generation){stop();onUpdate({done:true,message:error.message||'This example could not play. Use Back and Next to try again.'});}return false;}
 }
 return {get active(){return active;},run,stop,unlock};
}
