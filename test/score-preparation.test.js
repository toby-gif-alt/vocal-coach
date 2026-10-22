import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {prepareScoreXml,parseScoreDocument,all,child} from '../src/score-preparation.js';
import {parseMusicXml} from '../src/musicxml.js';
globalThis.DOMParser=DOMParser;globalThis.XMLSerializer=XMLSerializer;
export function fixture({fifths=0,mode='major',extra='',transpose='',notes='',second=''}={}){return `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Test song</work-title></work><part-list><score-part id="P1"><part-name>Voice</part-name></score-part><score-part id="P2"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>${fifths}</fifths><mode>${mode}</mode></key><time><beats>4</beats><beat-type>4</beat-type></time>${transpose}</attributes>${extra}${notes||'<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><lyric><text>Love</text></lyric></note>'}</measure>${second}</part><part id="P2"><measure number="1"><attributes><divisions>4</divisions><key><fifths>${fifths}</fifths><mode>${mode}</mode></key></attributes><note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration></note></measure></part></score-partwise>`;}
test('full-piece transposition changes parsed notes and key signatures from original each time',()=>{
 const xml=fixture(),original=parseMusicXml(xml);
 for(const shift of [1,2,-1,-12,12]){
  const score=parseMusicXml(xml,'Test',shift);assert.equal(score.originalXml,xml);
  for(let p=0;p<2;p++)assert.equal(score.parts[p].notes[0].midi,original.parts[p].notes[0].midi+shift);
  assert.equal(score.parts[0].notes[0].onsetQuarters,0);assert.equal(score.parts[0].notes[0].durationQuarters,1);
  assert.equal(all(score.documentNode,'lyric')[0].textContent,'Love');
 }
 assert.equal(parseMusicXml(xml,'',2).newKey,'D major');assert.equal(parseMusicXml(xml,'',-1).newKey,'B major');
 assert.equal(parseMusicXml(xml,'',3).parts[0].notes[0].midi,63);
 assert.equal(parseMusicXml(xml,'',0).parts[0].notes[0].midi,60);
});
test('all standard sharp/flat major and minor signatures and chromatic notes stay in agreement',()=>{
 for(const mode of ['major','minor'])for(let fifths=-7;fifths<=7;fifths++)for(let shift=-12;shift<=12;shift++){
  const xml=fixture({fifths,mode,notes:'<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><accidental>sharp</accidental></note>'});
  const score=parseMusicXml(xml,'',shift);assert.equal(score.parts[0].notes[0].midi,66+shift,`${fifths} ${mode} ${shift}`);
 }
 assert.equal(parseMusicXml(fixture({fifths:7})).originalKey,'C♯ major');
});
test('chords, slash harmony, tied notes, key changes and transposing instruments preserve intervals and time',()=>{
 const harmony='<harmony><root><root-step>C</root-step></root><kind>major</kind><bass><bass-step>E</bass-step></bass></harmony>';
 const notes='<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration></note>';
 const second='<measure number="2"><attributes><key><fifths>-2</fifths><mode>major</mode></key></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/></note></measure>';
 const original=parseMusicXml(fixture({extra:harmony,notes,second,transpose:'<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic><octave-change>-1</octave-change></transpose>'}));
 const score=parseMusicXml(original.originalXml,'',2);
 assert.equal(score.parts[0].notes[0].midi,48);assert.equal(score.parts[0].notes[0].durationQuarters,2);assert.equal(score.parts[0].notes[1].midi,52);
 assert.equal(score.originalKey,'Changes key');assert.equal(score.newKey,'Changes key');assert.equal(all(score.documentNode,'root-step')[0].textContent,'D');assert.equal(all(score.documentNode,'bass-step')[0].textContent,'F');assert.equal(all(score.documentNode,'bass-alter')[0].textContent,'1');
 assert.deepEqual(all(score.documentNode,'sound').map(n=>n.toString()),all(original.documentNode,'sound').map(n=>n.toString()));
 assert.equal(score.parts[0].notes[0].midi-12,36);assert.equal(score.parts[1].notes[0].midi,54);
});
test('unpitched notes and rhythms remain unchanged and ambiguous keys are not labelled major',()=>{
 const xml=fixture({mode:'none',notes:'<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>4</duration></note>'});
 const prepared=prepareScoreXml(xml,2);assert.ok(prepared.xmlText.includes('<display-step>C</display-step>'));assert.equal(prepared.newKey,'Key signature / tonality unspecified');
 assert.throws(()=>prepareScoreXml(fixture({notes:'<note><pitch><step>C</step><alter>0.5</alter><octave>4</octave></pitch><duration>4</duration></note>'}),2),/microtonal/);
 assert.throws(()=>prepareScoreXml(fixture({extra:'<attributes><key><key-step>C</key-step><key-alter>1</key-alter></key></attributes>'}),2),/nonstandard/);
 assert.throws(()=>prepareScoreXml(fixture(),13),/between/);
});
const tempo=(n,words='',offset='')=>`<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.trunc(n)}</per-minute></metronome></direction-type>${words?`<direction-type><words>${words}</words></direction-type>`:''}${offset!==''?`<offset>${offset}</offset>`:''}<sound tempo="${n}"/></direction>`;
test('tempo decimal cleanup requires a matching sound event; legitimate words are preserved',()=>{
 const xml=fixture({extra:tempo(57.6,'.6')+tempo(55.4,'.4')+'<direction><direction-type><words>.9</words><words>With warmth</words><rehearsal>A</rehearsal></direction-type></direction>'});
 const score=parseMusicXml(xml);assert.equal(score.cleanup.fragments,2);assert.deepEqual(all(score.documentNode,'words').map(n=>n.textContent),['.9','With warmth']);assert.equal(all(score.documentNode,'rehearsal')[0].textContent,'A');
 assert.deepEqual(all(score.documentNode,'sound').map(n=>n.getAttribute('tempo')),['57.6','55.4']);assert.equal(all(score.documentNode,'metronome').length,2);
});
test('dense automated tempo ramps lose printed labels while exact tempo metadata, rit. and a tempo survive',()=>{
 const ramp=[57.6,55.4,54,52.9,51.2].map((n,i)=>tempo(n,n%1?'.'+String(n).split('.')[1]:'',-14+i)).join('');
 const second='<measure number="2"><direction><direction-type><words>rit.</words></direction-type></direction>'+ramp+'<direction><direction-type><words>a tempo</words></direction-type></direction><note><rest/><duration>4</duration></note></measure>';
 const xml=fixture({extra:tempo(72),second}),score=parseMusicXml(xml,'',2);
 assert.equal(score.cleanup.labels,5);assert.equal(all(score.documentNode,'metronome').length,1);
 assert.deepEqual(all(score.documentNode,'sound').map(n=>n.getAttribute('tempo')),['72','57.6','55.4','54','52.9','51.2']);
 assert.deepEqual(all(score.documentNode,'words').map(n=>n.textContent),['rit.','a tempo']);assert.equal(score.originalTempo,72);
 assert.equal(parseMusicXml(xml,'',0).cleanup.labels,5);
});
test('ties retain the same enharmonic spelling across a key change',()=>{
 const xml=fixture({notes:'<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/></note>',second:'<measure number="2"><attributes><key><fifths>-2</fifths><mode>major</mode></key></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/></note></measure>'});
 const result=prepareScoreXml(xml,1),pitches=all(parseScoreDocument(result.xmlText),'pitch');
 assert.equal(child(pitches[0],'step').textContent,child(pitches[1],'step').textContent);assert.equal(child(pitches[0],'alter').textContent,child(pitches[1],'alter').textContent);
});
