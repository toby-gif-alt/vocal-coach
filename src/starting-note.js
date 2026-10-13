import {frequencyToMidi,midiToFrequency,AUDIO_CONFIG} from './config.js?v=20';
import {closestOctaveCandidate} from './octave-selection.js?v=29';
export const OCTAVE_CARDS=[12,0,-12,-24];
const descriptions={12:'One octave higher',0:'Written octave','-12':'One octave lower','-24':'Two octaves lower'};
export function pitchName(midi) {
  const n=Math.round(midi),names=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
  return `${names[((n%12)+12)%12]}${Math.floor(n/12)-1}`;
}
export function octaveCards(writtenMidi) {
  return OCTAVE_CARDS.map(shift=>({shift,midi:writtenMidi+shift,name:pitchName(writtenMidi+shift),description:descriptions[shift],supported:midiToFrequency(writtenMidi+shift)>=AUDIO_CONFIG.minimumFrequency&&midiToFrequency(writtenMidi+shift)<=AUDIO_CONFIG.maximumFrequency}));
}
// Continuous position between card centres (0..1), rather than nearest-card snapping.
export function octaveMarkerPosition(midi,writtenMidi) {return Math.max(0,Math.min(1,(writtenMidi+12-midi)/36));}
export class StartingPitchModel {
  constructor(){this.reset();}
  reset(){this.frames=[];this.value=null;this.lastAt=-Infinity;this.candidate=null;}
  observe(sample,writtenMidi) {
    const frequency=sample.rawFrequency??sample.frequency,now=sample.capturedAt;
    if(!Number.isFinite(now)||!Number.isFinite(frequency)||frequency<AUDIO_CONFIG.minimumFrequency||frequency>AUDIO_CONFIG.maximumFrequency||(!Number.isFinite(sample.clarity)||sample.clarity<.82)||!(sample.gateOpen||sample.continuationGateOpen)||sample.overloadActive||sample.clipped)return null;
    if(now-this.lastAt>320){this.reset();}
    const midi=frequencyToMidi(frequency);this.lastAt=now;this.frames.push(midi);this.frames=this.frames.slice(-3);
    if(this.frames.length<3||Math.max(...this.frames)-Math.min(...this.frames)>1.2)return null;
    const centre=[...this.frames].sort((a,b)=>a-b)[1];
    // Only smooth measured neighbouring pitches. An actual octave move replaces history.
    this.value=this.value!==null&&Math.abs(centre-this.value)<1.2?this.value*.55+centre*.45:centre;
    const match=closestOctaveCandidate(this.value,writtenMidi);
    if(Math.abs(match.cents)<=50){if(this.candidate?.shift!==match.shift)this.candidate={shift:match.shift,since:now};}else this.candidate=null;
    return {midi:this.value,position:octaveMarkerPosition(this.value,writtenMidi),region:Math.abs(match.cents)<=600?match.shift:null,near:Math.abs(match.cents)<=50?match.shift:null,suggested:this.candidate&&now-this.candidate.since>=650?match.shift:null};
  }
  current(now){if(now-this.lastAt>320){this.reset();return null;}return this.value;}
}
export function createStartingNoteDialog({audio,getStarting,getShift,onSelect,onBusy,onClose}) {
  const dialog=document.querySelector('#startingNoteDialog'),cards=document.querySelector('#octaveCards'),label=document.querySelector('#octaveLiveLabel'),marker=document.querySelector('#octavePitchMarker'),hear=document.querySelector('#previewStartingNote'),done=document.querySelector('#continuePractice'),model=new StartingPitchModel();
  let pending=null,resolve=null,timer=null,starting=null,listening=false,selected=false,mutedUntil=0,unsupportedAt=-Infinity,token=0;
  function showLabel(text){if(label.textContent!==text)label.textContent=text;}
  function render(selectedShift=getShift(),suggestedShift=null) {
    cards.replaceChildren();
    for(const candidate of octaveCards(starting.midi)) {
      const row=document.createElement('div');row.className='octave-card';row.dataset.shift=candidate.shift;
      row.classList.toggle('selected',candidate.shift===selectedShift);row.classList.toggle('suggested',candidate.shift===suggestedShift);
      const choose=document.createElement('button');choose.type='button';choose.className='octave-card-choice';choose.setAttribute('aria-pressed',String(candidate.shift===selectedShift));choose.setAttribute('aria-label',`${candidate.name}, ${candidate.description}`);
      const name=document.createElement('strong');name.textContent=candidate.name;const copy=document.createElement('span');copy.textContent=candidate.description;const hint=document.createElement('small');hint.textContent=candidate.supported?'Tap to choose':'Outside live detector range — choose manually';choose.append(name,copy,hint);
      choose.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const options=[...cards.querySelectorAll('.octave-card-choice')],index=options.indexOf(choose);options[(index+(event.key==='ArrowDown'?1:options.length-1))%options.length].focus({preventScroll:true});});
      choose.addEventListener('click',()=>{onSelect(candidate.shift);selected=true;done.disabled=false;render();cards.querySelector(`[data-shift="${candidate.shift}"] .octave-card-choice`).focus({preventScroll:true});document.querySelector('#octaveSelectedCopy').textContent=`Selected ${candidate.name} · ${candidate.description}. Your accompaniment stays at written pitch.`;});
      const preview=document.createElement('button');preview.type='button';preview.className='octave-preview';preview.textContent='🔊';preview.setAttribute('aria-label',`Hear ${candidate.name}`);preview.addEventListener('click',()=>void play(candidate.midi,preview));row.append(choose,preview);cards.append(row);
    }
  }
  async function play(midi,button) {
    if(!pending)return;button.disabled=true;mutedUntil=performance.now()+1100;model.reset();marker.hidden=true;cards.querySelectorAll('.near,.suggested,.live-region').forEach(row=>row.classList.remove('near','suggested','live-region'));showLabel('Listen, then sing when the note finishes…');
    try{await audio.previewPitch(midi);}catch{showLabel('The note could not play. Try again or choose manually.');}finally{if(pending)button.disabled=false;}
  }
  function close(){if(!pending)return;token++;clearInterval(timer);timer=null;audio.octaveSetupActive=false;dialog.close();onBusy(false);onClose(listening);const complete=resolve;pending=null;resolve=null;complete?.(selected);}
  hear.addEventListener('click',()=>void play(starting.midi+getShift(),hear));done.addEventListener('click',close);document.querySelector('#closeStartingNote').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  return {get active(){return !!pending;},
    async open({listen=false,suggested=null,chosen=false}={}) {
      if(pending)return pending;starting=getStarting();if(!starting)return false;const attempt=++token;unsupportedAt=-Infinity;selected=chosen;listening=listen;model.reset();marker.hidden=true;hear.disabled=false;done.disabled=!selected;
      pending=new Promise(r=>{resolve=r;});const completion=pending;render(getShift(),suggested);document.querySelector('#octaveSelectedCopy').textContent=chosen?`Selected ${pitchName(starting.midi+getShift())}. You can keep this octave or choose another.`:'Choose a card, then continue to practice.';
      showLabel(listen?'Starting microphone…':'Choose manually, or use Assisted for live pitch.');dialog.showModal();onBusy(true);
      if(listen){audio.octaveSetupActive=true;try{await audio.startMicrophoneMonitoring(()=>null);if(attempt!==token)return completion;showLabel('Listening…');}catch{if(attempt===token){listening=false;showLabel('Microphone unavailable — preview and choose an octave manually.');}}}
      if(attempt===token)timer=setInterval(()=>{if(performance.now()>mutedUntil&&model.current(performance.now())===null){marker.hidden=true;if(listen&&performance.now()-unsupportedAt>320)showLabel('Listening…');cards.querySelectorAll('.near,.suggested,.live-region').forEach(row=>row.classList.remove('near','suggested','live-region'));}},100);
      return completion;
    },
    observe(sample){if(!pending||!listening||performance.now()<mutedUntil)return;
      const result=model.observe(sample,starting.midi);
      if(!result){if(sample.gateOpen&&sample.clarity>=.82&&sample.rawFrequency>0&&(sample.rawFrequency<AUDIO_CONFIG.minimumFrequency||sample.rawFrequency>AUDIO_CONFIG.maximumFrequency)){unsupportedAt=performance.now();showLabel(`Outside the supported ${AUDIO_CONFIG.minimumFrequency}–${AUDIO_CONFIG.maximumFrequency} Hz range — choose manually.`);marker.hidden=true;}return;}
      const centres=[...cards.children].map(row=>row.offsetTop+row.offsetHeight/2);const top=centres[0],bottom=centres.at(-1);marker.style.top=`${top+(bottom-top)*result.position}px`;marker.hidden=false;
      showLabel(`You’re singing: ${pitchName(result.midi)}${result.suggested!==null?' · Suggested octave — tap to choose':''}`);
      for(const row of cards.children){row.classList.toggle('live-region',Number(row.dataset.shift)===result.region);row.classList.toggle('near',Number(row.dataset.shift)===result.near);row.classList.toggle('suggested',Number(row.dataset.shift)===result.suggested);}
    },close};
}
