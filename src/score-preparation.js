import {validateXMLText} from './file-safety.js';
const STEPS=['C','D','E','F','G','A','B'],PC=[0,2,4,5,7,9,11];
const remove=node=>node?.parentNode?.removeChild(node);
const mod=(n,d)=>(n%d+d)%d;
export const children=(node,name)=>[...(node?.childNodes||[])].filter(n=>n.nodeType===1&&(!name||n.localName===name));
export const child=(node,name)=>children(node,name)[0];
export const all=(node,name)=>[...(node?.getElementsByTagNameNS('*',name)||[])];
const text=(node,name)=>child(node,name)?.textContent.trim();
function put(node,name,value){let el=child(node,name);if(!el){el=node.ownerDocument.createElementNS(node.namespaceURI,name);node.appendChild(el);}el.textContent=String(value);return el;}
export function parseScoreDocument(xml){
 validateXMLText(xml);const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(all(doc,'parsererror').length||doc.documentElement?.localName!=='score-partwise')throw Error('Use a valid partwise MusicXML score.');return doc;
}
export function transposeValue(value){const n=Number(value);if(!Number.isInteger(n)||n< -12||n>12)throw Error('Transpose must be between −12 and +12 semitones.');return n;}
// Choose a conventional enharmonic key, preferring fewer signature accidentals.
function newFifths(old,shift){
 if(shift%12===0)return old;
 const pc=mod(old*7+shift,12),options=Array.from({length:15},(_,i)=>i-7).filter(f=>mod(f*7,12)===pc);
 return options.sort((a,b)=>Math.abs(a)-Math.abs(b)||(old<0?a-b:b-a))[0];
}
function tonic(fifths){
 const step=mod(fifths*4,7),order=fifths>=0?[3,0,4,1,5,2,6]:[6,2,5,1,4,0,3];
 return {step,pc:PC[step]+(order.slice(0,Math.abs(fifths)).includes(step)?Math.sign(fifths):0)};
}
// Derive the matching diatonic interval as well as the requested chromatic one.
// This preserves scale spelling instead of replacing every note with a sharp name.
function interval(fifths,shift){
 const from=tonic(fifths),to=tonic(newFifths(fifths,shift));
 return to.step-from.step+7*((from.pc+shift-to.pc)/12);
}
function pitch(node,stepName,alterName,octaveName,shift,diatonic){
 const step=text(node,stepName),i=STEPS.indexOf(step),alter=Number(text(node,alterName)||0);
 if(i<0||!Number.isInteger(alter))throw Error('This score uses unsupported microtonal or nonstandard pitches. Export standard pitched MusicXML to transpose it.');
 const octave=octaveName?Number(text(node,octaveName)):4;
 if(!Number.isInteger(octave))throw Error('A pitched note has no valid octave.');
 const d=(octave+1)*7+i+diatonic,nextOctave=Math.floor(d/7)-1,nextStep=mod(d,7);
 const midi=(octave+1)*12+PC[i]+alter+shift,nextAlter=midi-((nextOctave+1)*12+PC[nextStep]);
 if(octaveName&&(midi<0||midi>127))throw Error('This transposition puts notes outside the supported MIDI pitch range.');
 if(Math.abs(nextAlter)>2)throw Error('This score needs unsupported accidental spellings at this transposition. Try a nearby key.');
 const stepEl=put(node,stepName,STEPS[nextStep]);stepEl.removeAttribute('text');
 if(nextAlter)put(node,alterName,nextAlter);else remove(child(node,alterName));
 if(octaveName)put(node,octaveName,nextOctave);
 // MusicXML requires step, alter, octave in this order.
 const alteration=child(node,alterName),before=octaveName?child(node,octaveName):stepEl.nextSibling;
 if(alteration&&alteration!==before)node.insertBefore(alteration,before);
 return nextAlter;
}
export function transposeDocument(doc,shift){
 shift=transposeValue(shift);if(!shift)return;
 if(all(doc,'key-step').length||all(doc,'key-alter').length||all(doc,'fret').length||all(doc,'staff-tuning').length||all(doc,'scordatura').length||all(doc,'double').some(n=>n.parentNode.localName==='transpose'))throw Error('This score uses nonstandard keys, tablature or doubled transposing instruments. Transposition is not supported for this notation.');
 const percussion=new Set(all(doc,'midi-instrument').filter(n=>text(n,'midi-channel')==='10').map(n=>n.getAttribute('id')));
 for(const part of children(doc.documentElement,'part')){
  const pitched=all(part,'pitch');if(!pitched.length)continue;
  const keys=new Map(),ties=new Map();
  for(const measure of children(part,'measure'))for(const el of children(measure)){
   if(el.localName==='attributes')for(const key of children(el,'key')){
    const fifths=Number(text(key,'fifths'));if(!child(key,'fifths')||!Number.isInteger(fifths)||Math.abs(fifths)>7)throw Error('This score has an unsupported key signature.');
    const number=key.getAttribute('number')||'all';keys.set(number,fifths);put(key,'fifths',newFifths(fifths,shift));remove(child(key,'cancel'));
   }
   const staff=text(el,'staff')||'1',fifths=keys.get(staff)??keys.get('all')??0,d=interval(fifths,shift);
   if(el.localName==='note'){
    const p=child(el,'pitch');if(!p||percussion.has(child(el,'instrument')?.getAttribute('id')))continue;
    const tieKey=[staff,text(el,'voice')||'1',text(p,'step'),text(p,'alter')||0,text(p,'octave')].join(':');
    const types=[...children(el,'tie'),...all(el,'tied')].map(n=>n.getAttribute('type'));
    let alter;
    if(types.includes('stop')&&ties.has(tieKey)){
     const saved=ties.get(tieKey);put(p,'step',saved.step);remove(child(p,'alter'));if(saved.alter)p.insertBefore(put(p,'alter',saved.alter),child(p,'octave'));put(p,'octave',saved.octave);alter=saved.alter;
    }else alter=pitch(p,'step','alter','octave',shift,d);
    if(types.includes('start'))ties.set(tieKey,{step:text(p,'step'),alter,octave:text(p,'octave')});else if(types.includes('stop'))ties.delete(tieKey);
    const acc=child(el,'accidental');if(acc)acc.textContent=({'-2':'flat-flat','-1':'flat',0:'natural',1:'sharp',2:'double-sharp'})[alter];
   }
   if(el.localName==='harmony')for(const [name,s,a] of [['root','root-step','root-alter'],['bass','bass-step','bass-alter']]){
    const node=child(el,name);if(node)pitch(node,s,a,null,shift,d);
   }
  }
 }
}
export function keyDescription(doc,shift=0){
 const descriptors=[];
 for(const part of children(doc.documentElement,'part')){
  if(!all(part,'pitch').length)continue;
  const keys=all(part,'key');if(!keys.length)return 'Not specified';
  for(const key of keys){const f=Number(text(key,'fifths')),mode=text(key,'mode');if(!child(key,'fifths')||!['major','minor'].includes(mode)||!Number.isInteger(f)||Math.abs(f)>7)return 'Key signature / tonality unspecified';
   const n=newFifths(f,shift),major=['C♭','G♭','D♭','A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯'][n+7],minor=['A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯','G♯','D♯','A♯'][n+7];descriptors.push(`${mode==='major'?major:minor} ${mode}`);
  }
 }
 return descriptors.length?new Set(descriptors).size===1?descriptors[0]:'Changes key':'Not specified';
}
// Hide only strongly identified exporter artefacts. Sound tempo events are never removed.
export function cleanTempoMarkings(doc){
 let fragments=0,labels=0;
 for(const measure of all(doc,'measure')){
  const candidates=[];
  for(const direction of children(measure,'direction')){
   const met=all(direction,'metronome'),sound=all(direction,'sound').find(n=>Number(n.getAttribute('tempo'))>0);
   if(met.length!==1||!sound)continue;
   const bpm=Number(sound.getAttribute('tempo')),integer=Number(text(met[0],'per-minute'));
   const words=all(direction,'words'),fraction=words.find(w=>/^\.\d+$/.test(w.textContent.trim())&&Math.abs(integer+Number(w.textContent.trim())-bpm)<1e-7);
   if(fraction){remove(fraction);fragments++;}
   candidates.push({direction,met:met[0],bpm,machine:!!fraction||!!child(direction,'offset'),fraction:!!fraction});
  }
  // Three or more monotonic fractional/offset events in one measure identify a ramp.
  if(candidates.length>=3&&candidates.filter(c=>c.fraction||!Number.isInteger(c.bpm)).length>=2&&candidates.every(c=>c.machine)&&candidates.slice(1).every((c,i)=>Math.abs(c.bpm-candidates[i].bpm)<=8)&&
   (candidates.every((c,i)=>!i||c.bpm<=candidates[i-1].bpm)||candidates.every((c,i)=>!i||c.bpm>=candidates[i-1].bpm))){
   candidates.forEach((c,i)=>{if(i===0&&measure===children(measure.parentNode,'measure')[0])return;remove(c.met);labels++;});
  }
 }
 return {fragments,labels};
}
export function prepareScoreXml(originalXml,shift=0){
 shift=transposeValue(shift);
 const doc=parseScoreDocument(originalXml),originalKey=keyDescription(doc),newKey=keyDescription(doc,shift);
 const cleanup=cleanTempoMarkings(doc);transposeDocument(doc,shift);
 return {transposeSemitones:shift,xmlText:new XMLSerializer().serializeToString(doc),originalKey,newKey,cleanup};
}
