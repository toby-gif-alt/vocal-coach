import {RepertoireStore,fileHash,scoreRecord,storageMessage} from './repertoire-store.js';
import {readScoreFile} from './musicxml.js';
export function createLibraryUI({onOpen,onRemoveCurrent,notify}) {
  const store=new RepertoireStore(),list=document.querySelector('#myRepertoireList'),search=document.querySelector('#librarySearch'),status=document.querySelector('#libraryStatus'),stats=document.querySelector('#storageInfo');
  let records=[],hiddenBuiltins=[];
  async function ask({title,copy,accept,secondary,input}) {
    const dialog=document.querySelector('#libraryActionDialog');dialog.returnValue='cancel';
    document.querySelector('#libraryActionTitle').textContent=title;document.querySelector('#libraryActionCopy').textContent=copy;
    const field=document.querySelector('#libraryActionInput');field.hidden=input===undefined;field.value=input||'';
    const yes=document.querySelector('#libraryActionAccept'),other=document.querySelector('#libraryActionSecondary');yes.textContent=accept;other.hidden=!secondary;other.textContent=secondary||'';
    return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve({action:dialog.returnValue,value:field.value.trim()}),{once:true});dialog.showModal();});
  }
  function download(blob,name) {const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
  function render() {list.replaceChildren();const query=search.value.toLowerCase();
    for(const record of records.filter(r=>`${r.title} ${r.composer} ${r.filename}`.toLowerCase().includes(query))) {
      const row=document.createElement('article');row.className='library-score';const heading=document.createElement('h3');heading.textContent=record.title;
      const meta=document.createElement('p');meta.textContent=[record.composer,record.filename,record.selectedPartName?`Singing: ${record.selectedPartName}`:'Choose vocal part when opening'].filter(Boolean).join(' · ');
      const actions=document.createElement('div');
      for(const [action,label] of [['open','Open'],['rename','Rename'],['export','Export original'],['remove','Remove']]) {const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=action;b.dataset.scoreId=record.id;b.setAttribute('aria-label',`${label} ${record.title}`);actions.append(b);}
      row.append(heading,meta,actions);list.append(row);
    }
    if(!list.children.length){const empty=document.createElement('p');empty.textContent=query?'No saved scores match this search.':'Import a score to save it here for next time.';list.append(empty);}
  }
  async function refresh() {try {records=await store.list();hiddenBuiltins=await store.setting('hidden-builtins')||[];render();status.textContent=`${records.length} saved ${records.length===1?'score':'scores'} · stored on this device`;
    const scoreBytes=records.reduce((n,r)=>n+(r.bytes?.size||0),0);let estimate;try{estimate=await navigator.storage?.estimate();}catch{}
    stats.textContent=`${records.length} saved scores · ${(scoreBytes/1024/1024).toFixed(2)} MB of score files${Number.isFinite(estimate?.usage)?` · about ${(estimate.usage/1024/1024).toFixed(1)} MB used by this app's site, including offline sounds`:''}.`;
  }catch(error){status.textContent=storageMessage(error);stats.textContent='Storage information unavailable. You can still open a score for this session.';}}
  list.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;const record=records.find(r=>r.id===button.dataset.scoreId);if(!record)return;
    try {
      if(button.dataset.action==='open')await onOpen(record);
      if(button.dataset.action==='export')download(record.bytes,record.filename);
      if(button.dataset.action==='rename'){const choice=await ask({title:'Rename saved score',copy:'This changes its display title, not the original MusicXML file.',accept:'Save title',input:record.title});if(choice.action==='accept'&&choice.value)await store.update(record.id,{title:choice.value.slice(0,200)});}
      if(button.dataset.action==='remove'){const choice=await ask({title:'Remove imported score?',copy:`Remove “${record.title}” from My Repertoire? This will delete your saved copy and its score settings from this device.`,accept:'Remove'});if(choice.action==='accept'){await onRemoveCurrent(record.id);await store.remove(record.id);notify('Saved score removed from this device.');}}
      await refresh();
    }catch(error){notify(storageMessage(error));}
  });
  search.addEventListener('input',render);
  document.querySelector('#exportAllScoresButton').addEventListener('click',async()=>{try{const zip=new window.JSZip();for(const record of records)zip.file(`${record.id.slice(0,8)}-${record.filename}`,await record.bytes.arrayBuffer());zip.file('repertoire-metadata.json',JSON.stringify(records.map(({bytes,...meta})=>meta),null,2));download(await zip.generateAsync({type:'blob'}),'Vocal-Coach-repertoire-backup.zip');}catch(error){notify(storageMessage(error));}});
  document.querySelector('#restoreBuiltinsButton').addEventListener('click',async()=>{try{hiddenBuiltins=[];await store.setting('hidden-builtins',[]);window.dispatchEvent(new Event('repertoirevisibilitychange'));}catch(error){notify(storageMessage(error));}});
  void refresh();
  return {store,refresh,async hidden(){await store.ready;return await store.setting('hidden-builtins')||[];},
    async importFile(file) {
      const score=await readScoreFile(file);
      try {
        const hash=await fileHash(file),existing=await store.findHash(hash);
        if(existing){const choice=await ask({title:'This score is already saved',copy:`You already have “${existing.title}”. Open it or save a separate copy?`,accept:'Open existing',secondary:'Keep a separate copy'});
          if(choice.action==='cancel'||!['accept','secondary'].includes(choice.action))return null;
          if(choice.action==='accept')return {score,record:existing};
        }
        const record=scoreRecord(file,score,hash);await store.add(record);await refresh();
        try{await navigator.storage?.persist?.();}catch{}
        return {score,record};
      }catch(error){notify(`${storageMessage(error)} Opened for this session only; it has not been saved.`);return {score,record:null};}
    }
  };
}
