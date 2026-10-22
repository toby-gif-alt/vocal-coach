import {MAX_SCORE_BYTES,validateScoreFile} from './file-safety.js';
const languageName=code=>({EN:'English',DE:'German',FR:'French',IT:'Italian',ES:'Spanish',RU:'Russian',LA:'Latin'})[code]||'';
const fold=s=>String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
export function searchMusic(scores,query){const terms=fold(query).trim().split(/\s+/).filter(Boolean);return scores.filter(s=>terms.every(t=>fold([s.title,s.composer,s.collection,s.language,languageName(s.language)].join(' ')).includes(t)));}
export function museScoreSearch(query){const url=new URL('https://musescore.com/sheetmusic');url.searchParams.set('text',String(query).trim());return url.href;}
export function openScoreUrl(entry,catalogue){
 if(!/^[a-f0-9]{40}$/.test(catalogue.commit)||!/^openscore:\d+$/.test(entry.id)||!entry.path?.startsWith('scores/')||entry.path.split('/').some(s=>['..','.',''].includes(s))||!entry.path.endsWith('/lc'+entry.id.split(':')[1]+'.mxl'))throw Error('This catalogue entry has no verified MusicXML download.');
 return 'https://raw.githubusercontent.com/OpenScore/Lieder/'+catalogue.commit+'/'+entry.path.split('/').map(encodeURIComponent).join('/');
}
export async function downloadOpenScore(entry,catalogue,fetcher=fetch){
 const url=openScoreUrl(entry,catalogue),response=await fetcher(url,{signal:AbortSignal.timeout(30000),credentials:'omit'});
 if(!response.ok)throw Error('This score could not be downloaded. Use the source link to download it, then Import Score.');
 if(Number(response.headers.get('content-length'))>MAX_SCORE_BYTES)throw Error('This score exceeds the 20 MB import limit.');
 const chunks=[];let total=0;
 if(response.body?.getReader){const reader=response.body.getReader();try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>MAX_SCORE_BYTES)throw Error('This score exceeds the 20 MB import limit.');chunks.push(value);}}catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}}
 else {const bytes=await response.arrayBuffer();if(bytes.byteLength>MAX_SCORE_BYTES)throw Error('This score exceeds the 20 MB import limit.');chunks.push(bytes);}
 const file=new File(chunks,entry.path.split('/').at(-1),{type:response.headers.get('content-type')?.split(';')[0]||'application/vnd.recordare.musicxml'});validateScoreFile(file);return file;
}
// Additional authorised collections supply a local manifest and their own bounded,
// allowlisted downloader. MuseScore deliberately has no download provider.
export const MUSIC_PROVIDERS=Object.freeze({openscore:{label:'OpenScore',manifest:'./src/openscore-catalogue.json',download:downloadOpenScore,scoreUrl:openScoreUrl,sourceUrl:(entry,data)=>{openScoreUrl(entry,data);return `https://github.com/OpenScore/Lieder/tree/${data.commit}/`+entry.path.split('/').slice(0,-1).map(encodeURIComponent).join('/');}}});
export function createFindMusic({library,onOpen,providers=MUSIC_PROVIDERS}){
 const $=s=>document.querySelector(s),form=$('#findMusicForm'),query=$('#findMusicQuery'),source=$('#findMusicSource'),status=$('#findMusicStatus'),results=$('#findMusicResults'),external=$('#museScoreSearch');
 const catalogues=new Map();let busy=false,limit=20;
 for(const [id,p] of Object.entries(providers))if(![...source.options].some(o=>o.value===id))source.add(new Option(p.label,id));
 async function load(id){if(!catalogues.has(id))catalogues.set(id,fetch(providers[id].manifest).then(r=>{if(!r.ok)throw Error('The catalogue is unavailable. Connect once to cache it for offline search.');return r.json();}).catch(e=>{catalogues.delete(id);throw e;}));return catalogues.get(id);}
 function sourceUI(){external.href=museScoreSearch(query.value);external.hidden=source.value!=='musescore';$('#museScoreInstructions').hidden=source.value!=='musescore';$('#findMusicSubmit').hidden=source.value==='musescore';results.replaceChildren();status.textContent=providers[source.value]?`Search ${providers[source.value].label} by title, composer, collection or language. New downloads need internet.`:source.value==='library'?'Search your scores saved on this device.':'MuseScore opens in a new tab. Your Vocal Coach library stays here.';}
 function link(label,url){const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
 async function search(){
  if(source.value==='library'){$('#librarySearch').value=query.value;$('#librarySearch').dispatchEvent(new Event('input'));$('#myRepertoireHeading').scrollIntoView({block:'start',behavior:'smooth'});return;}
  const provider=providers[source.value];if(!provider)return;
  const providerId=source.value;status.textContent=`Searching ${provider.label}…`;
  try{
   const data=await load(providerId),matches=searchMusic(data.scores,query.value),saved=await library.store.list().catch(()=>[]);if(source.value!==providerId)return;results.replaceChildren();
   status.textContent=`${matches.length} matching scores · ${data.source} · ${data.licence}. ${navigator.onLine?'Choose Add to Library to save a score to this device.':'Offline: open saved scores; new downloads require internet.'}`;
   for(const entry of matches.slice(0,limit)){
    const row=document.createElement('article'),h=document.createElement('h3'),meta=document.createElement('p'),actions=document.createElement('div'),button=document.createElement('button');row.className='find-music-result';h.textContent=entry.title;meta.textContent=[entry.composer,entry.collection,entry.language,`${data.source} · ${data.licence}`].filter(Boolean).join(' · ');
    const existing=saved.find(s=>s.sourceId===entry.id);button.type='button';button.textContent=existing?'Open saved score':'Add to Library';button.disabled=!existing&&!navigator.onLine;
    button.addEventListener('click',async()=>{
     if(busy)return;busy=true;button.disabled=true;status.textContent='Saving '+entry.title+' to this device…';
     try{
      if(existing){await onOpen(existing);return;}
      const file=await provider.download(entry,data),imported=await library.importFile(file,{id:entry.id,name:data.source,url:data.sourceUrl,licence:data.licence,downloadUrl:provider.scoreUrl(entry,data)});
      if(!imported?.record)throw Error('The score could not be saved. Check device storage and try again.');
      status.textContent='Saved to your library for offline practice.';await onOpen(imported.record);
     }catch(error){status.textContent=error.message||'Download unavailable. Use Download MXL, then Import Score.';}finally{busy=false;button.disabled=false;}
    });
    actions.append(button,link('Source ↗',provider.sourceUrl(entry,data)),link('Download MXL ↗',provider.scoreUrl(entry,data)));row.append(h,meta,actions);results.append(row);
   }
   if(matches.length>limit){const more=document.createElement('button');more.type='button';more.textContent='Show more';more.addEventListener('click',()=>{limit+=20;void search();});results.append(more);}
  }catch(error){status.textContent=error.message;}
 }
 form.addEventListener('submit',e=>{e.preventDefault();limit=20;void search();});source.addEventListener('change',sourceUI);query.addEventListener('input',()=>{external.href=museScoreSearch(query.value);});
 $('#findMusicImport').addEventListener('click',()=>$('#scoreInput').click());sourceUI();
}
