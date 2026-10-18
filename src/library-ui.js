import {RepertoireStore,fileHash,scoreRecord,storageMessage} from './repertoire-store.js';
import {RepertoireCatalogue} from './repertoire-catalogue.js';
import {readScoreFile} from './musicxml.js';
export function createLibraryUI({onOpen,onOpenBuiltIn,onRemoveCurrent,notify}) {
  const store=new RepertoireStore(),list=document.querySelector('#myRepertoireList'),search=document.querySelector('#librarySearch'),status=document.querySelector('#libraryStatus'),stats=document.querySelector('#storageInfo');
  const catalogue=new RepertoireCatalogue({store}),catalogueReady=catalogue.load();
  let records=[],imports=[];
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
      const meta=document.createElement('p');meta.textContent=[record.source==='included'?'Included':'My score',record.composer,record.filename,record.selectedPartName?`Singing: ${record.selectedPartName}`:'Choose vocal part when opening'].filter(Boolean).join(' · ');
      const actions=document.createElement('div');
      for(const [action,label] of [['open','Open'],['rename','Rename'],['export','Download to this device'],['remove','Remove']]) {const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=action;b.dataset.scoreId=record.id;b.setAttribute('aria-label',`${label} ${record.title}`);actions.append(b);}
      row.append(heading,meta,actions);list.append(row);
    }
    if(!list.children.length){const empty=document.createElement('p');empty.textContent=query?'No scores match this search.':'Import a score to save it here for next time.';list.append(empty);}
  }
  function renderChoices() {
    const select=document.querySelector('#repertoireSelect'),selected=select.value;
    select.replaceChildren(new Option('Select repertoire',''));
    for(const [kind,title] of [['included','Included with Vocal Coach'],['imported','My Scores']]) {
      const group=document.createElement('optgroup');group.label=title;
      for(const record of records.filter(r=>r.source===kind)) {
        const copies=records.filter(r=>r.source===kind&&r.title===record.title&&r.filename===record.filename);
        const suffix=copies.length>1?` · Copy ${copies.findIndex(r=>r.id===record.id)+1}`:'';
        group.append(new Option(`${record.title}${kind==='imported'?` · ${record.filename}${suffix}`:''}`,record.id));
      }
      if(group.children.length)select.append(group);
    }
    if(records.some(r=>r.id===selected))select.value=selected;
    select.disabled=!records.length;
  }
  async function refresh() {
    await catalogueReady;
    try { imports=await store.list(); }
    catch(error) { notify(storageMessage(error)); imports=[]; }
    records=catalogue.rows(imports);render();renderChoices();
    status.textContent=`${records.length} scores · included music and your saved scores`;
    document.querySelector("#repertoireStatus").textContent=`${records.length} scores in your library`;
    stats.textContent=`${imports.length} imported scores · ${(imports.reduce((n,r)=>n+(r.bytes?.size||0),0)/1024/1024).toFixed(2)} MB of original score files saved on this device.`;
  }
  async function open(record) {if(record.source==='included')await onOpenBuiltIn(record);else await onOpen(record);}
  list.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;const record=records.find(r=>r.id===button.dataset.scoreId);if(!record)return;
    try {
      if(button.dataset.action==='open')await open(record);
      if(button.dataset.action==='export'){if(record.source==='included'){const response=await fetch(record.file);if(!response.ok)throw new Error('The included score could not be downloaded.');download(await response.blob(),record.filename);}else download(record.bytes,record.filename);}
      if(button.dataset.action==='rename'){const choice=await ask({title:'Rename saved score',copy:'This changes its display title, not the original MusicXML file.',accept:'Save title',input:record.title});if(choice.action==='accept'&&choice.value){const patch={title:choice.value.slice(0,200)};if(record.source==='included')await catalogue.customise(record.id,patch);else await store.update(record.id,patch);}}
      if(button.dataset.action==='remove'){const choice=await ask({title:record.source==='included'?'Hide included score?':'Remove imported score?',copy:record.source==='included'?`Hide “${record.title}” from this library? Restore included scores in Settings.${catalogue.standalone?'':' It will return in a new browser session.'}`:`Remove “${record.title}” from Repertoire? This deletes your saved copy and settings from this device.`,accept:'Remove'});if(choice.action==='accept'){await onRemoveCurrent(record.id);if(record.source==='included')await catalogue.customise(record.id,{hidden:true});else await store.remove(record.id);notify(record.source==='included'?'Included score hidden.':'Saved score removed from this device.');}}
      await refresh();
    }catch(error){notify(storageMessage(error));}
  });
  search.addEventListener('input',render);
  document.querySelector('#exportAllScoresButton').addEventListener('click',async()=>{try{const zip=new window.JSZip();for(const record of imports)zip.file(`${record.id.slice(0,8)}-${record.filename}`,await record.bytes.arrayBuffer());zip.file('repertoire-metadata.json',JSON.stringify(imports.map(({bytes,...meta})=>meta),null,2));download(await zip.generateAsync({type:'blob'}),'Vocal-Coach-repertoire-backup.zip');}catch(error){notify(storageMessage(error));}});
  document.querySelector('#restoreBuiltinsButton').addEventListener('click',async()=>{try{await catalogue.restore();await refresh();notify('Included scores restored.');}catch(error){notify(storageMessage(error));}});
  void refresh();
  return {store,refresh,
    async setIncluded(entries){catalogue.included=entries;await refresh();},
    async openChoice(id){const record=records.find(r=>r.id===id);if(record)await open(record);},
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
