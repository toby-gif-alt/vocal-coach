import {midiToFrequency,colourForCents} from './config.js?v=32';
import {VOWEL_PRESETS} from './vocal-guide-instrument.js?v=24';

export const SINGING_LESSONS=Object.freeze([
 {id:'starting',section:'A · Getting started',target:'#hearStartingNote',title:'Hear your first pitch',copy:'Listen to the target before you sing. This example uses your selected vocal part.',try:'Hear the real starting note'},
 {id:'octaves',section:'A · Getting started',target:'#changeOctaveButton',title:'Choose a comfortable octave',copy:'Compare written pitch with an octave lower using the real octave cards. Demo choices are temporary.',try:'Choose my octave'},
 {id:'pitch',section:'B · Understanding your pitch',target:'#tuningMeter',title:'From flat to in tune',copy:'Watch and hear a simulated voice start 35 cents flat, then rise smoothly towards the target. No microphone is needed.',try:'Try singing with the tuner'},
 {id:'phrase',section:'B · Understanding your pitch',target:'.score-viewport',title:'See your singing on the score',copy:'The guide and simulated singer follow your chosen singing octave. Time moves across the page; colour shows pitch accuracy.',try:'Try an Assisted take'},
 {id:'mixer',section:'C · Controlling what you hear',target:'#mixerPanel',title:'Hear your part above the accompaniment',copy:'Listen as the real accompaniment level is lowered, muted and restored. Then find the independent guide level and voice sound.',try:'Try the Mixer'},
 {id:'tempo',section:'C · Controlling what you hear',target:'#tempoPanel',title:'Give yourself more time',copy:'Hear the same phrase at normal speed, then slower. The tempo control moves with the example.',try:'Set my tempo'},
 {id:'practice',section:'D · Practising and improving',target:'.score-viewport',title:'Repeat a small section',copy:'Watch a short section repeat twice. Outside bars darken. Your own practice range and Repeat choice are restored afterwards.',try:'Select my practice bars'},
 {id:'review',section:'D · Practising and improving',target:'#reviewCompanion',title:'Listen to one useful observation',copy:'Example feedback: the first note started flat. Hear just that bar and watch its trace. This is a simulated example, not an assessment of you.',try:'Try an Assessment'},
]);
export function correctionCents(seconds){
 const progress=Math.max(0,Math.min(1,(seconds-2.4)/2));
 return -35+37*(progress*progress*(3-2*progress));
}
export function demoFrequency(midi,cents){return midiToFrequency(midi+cents/100);}
export function demoPhrase(notes,kind='phrase'){
 const selected=notes.slice(0,5),source=kind==='practice'?selected.slice(0,2).concat(selected.slice(0,2)):kind==='tempo'?selected.slice(0,2).concat(selected.slice(0,2)):kind==='review'?selected.filter(n=>n.measureNumber===selected[0]?.measureNumber):selected;
 let start=0;
 return source.map((note,index)=>{
  const duration=kind==='tempo'&&index>=2?1.07:.75;
  const entry={note,start,end:start+duration,index};start+=duration;return entry;
 });
}
export function demoFrame(kind,seconds,data){
 const target=data.targetMidi;
 if(kind==='pitch'){
  const cents=correctionCents(seconds);return {targetMidi:target,midi:target+cents/100,cents,frequency:demoFrequency(target,cents),colour:colourForCents(cents),message:seconds<2.4?"You're singing slightly below the target note. This is called singing flat.":seconds<4.4?'Raise the pitch gently towards the centre.':'Now the pitch matches the target. Aim to keep your indicator near the centre.'};
 }
 if(kind==='starting')return {targetMidi:target,midi:target,cents:0,frequency:demoFrequency(target,0),message:'This is the note you are aiming to sing first.'};
 if(kind==='octaves')return {shift:seconds<2.2?0:-12,message:seconds<2.2?'Hear the written starting pitch.':'An octave lower gives you a lower singing target and guide, with the same intervals and written score.'};
 if(kind==='mixer')return {mixStage:seconds<2?0:seconds<4?1:seconds<5?2:seconds<6?3:4,message:seconds<2?'The accompaniment is covering the melody.':seconds<4?'Turn that part down to hear the guide more clearly.':seconds<5?'This part is muted.':seconds<6?'Unmute it at a comfortable level.':'The guide has its own level and sound.'};
 const phrase=demoPhrase(data.notes,kind),entry=phrase.find(n=>seconds>=n.start&&seconds<n.end)||phrase.at(-1);
 if(!entry)return {message:'This score has no notes for this example.'};
 const progress=Math.min(1,Math.max(0,(seconds-entry.start)/(entry.end-entry.start))),cents=entry.index%3===0?-35:entry.index%3===1?-35+37*progress:2;
 return {note:entry.note,targetId:entry.note.id,targetMidi:entry.note.midi+data.shift,midi:entry.note.midi+data.shift+cents/100,cents,frequency:demoFrequency(entry.note.midi+data.shift,cents),colour:colourForCents(cents),scoreQuarter:entry.note.onsetQuarters+entry.note.durationQuarters*progress,scoreSeconds:seconds,index:entry.index,message:kind==='tempo'?(entry.index<2?'The melody at 100%.':'The same melody more slowly at 70%.'):kind==='practice'?`The short section repeats · pass ${entry.index<2?1:2} of 2.`:kind==='review'?'Example observation: this note started flat. Listen to the bar again.':entry.index===0?'This is the melody you are following.':entry.index===1?'The moving line shows the pitch of your voice.':entry.index===2?'Green means you are close to the correct pitch.':'When the line moves away from the note, it shows where you sang sharp or flat.'};
}

// Continuous audio uses the same cents function and audio-context clock as the
// visual frames. Its graph is output-only: never connected to a microphone.
export function singingTone(context,midi,start,duration,centsAt){
 const osc=context.createOscillator(),envelope=context.createGain(),nodes=[osc,envelope];osc.type='sawtooth';
 const count=Math.ceil(duration*120)+1;
 const curve=Float32Array.from({length:count},(_,i)=>demoFrequency(midi,centsAt(i*duration/(count-1))));
 osc.frequency.setValueCurveAtTime(curve,start,duration);
 for(const preset of VOWEL_PRESETS.ah.formants){const filter=context.createBiquadFilter(),gain=context.createGain();filter.type='bandpass';filter.frequency.value=preset.frequency;filter.Q.value=preset.frequency/preset.bandwidth;gain.gain.value=preset.gain*.12;osc.connect(filter);filter.connect(gain);gain.connect(envelope);nodes.push(filter,gain);}
 envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(.32,start+.04);envelope.gain.setValueAtTime(.32,start+Math.max(.04,duration-.08));envelope.gain.linearRampToValueAtTime(0,start+duration);envelope.connect(context.destination);osc.start(start);osc.stop(start+duration+.02);
 return ()=>{try{osc.stop();}catch{}for(const node of nodes)node.disconnect();};
}

// Only adapters can touch the application. No sample arrays, recorder or store
// are accepted by this deterministic controller.
export function createTutorialDemos(adapter,{request=requestAnimationFrame,cancel=cancelAnimationFrame}={}){
 let active=false,generation=0,frame=null,snapshot=null,disposeAudio=null;
 function stop(){generation++;cancel(frame);frame=null;disposeAudio?.();disposeAudio=null;if(snapshot!==null){adapter.restore(snapshot);snapshot=null;}active=false;adapter.cleanup();}
 async function run(kind,onUpdate=()=>{}){
  stop();if(adapter.blocked())return false;
  active=true;const token=++generation;
  try{
   snapshot=adapter.capture();
   const data=await adapter.prepare(kind,()=>token===generation);if(token!==generation)return false;
   const context=data.context,start=context.currentTime+.06,phrase=demoPhrase(data.notes,kind);
   const duration=kind==='pitch'?6.4:kind==='starting'?1.6:kind==='octaves'?4.6:kind==='mixer'?7.8:(phrase.at(-1)?.end||1)+.2;
   disposeAudio=adapter.sound(kind,data,start,phrase);
   let lastStage=-1;
   const tick=()=>{
    if(token!==generation)return;
    const seconds=Math.max(0,context.currentTime-start),value=demoFrame(kind,seconds,data);
    adapter.display(kind,value,data,seconds);
    if(value.mixStage!==undefined&&value.mixStage!==lastStage){lastStage=value.mixStage;adapter.mix(lastStage,data);}
    onUpdate({...value,seconds,duration});
    if(seconds>=duration){stop();onUpdate({done:true,message:'Demo complete — your settings and work have been restored.'});return;}
    frame=request(tick);
   };frame=request(tick);return true;
  }catch(error){if(token===generation){stop();onUpdate({done:true,message:error.message||'The demonstration could not play. Try again.'});}return false;}
 }
 return {get active(){return active;},run,stop};
}
