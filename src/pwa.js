function message(worker,type) {return new Promise((resolve,reject)=>{if(!worker)return reject(Error('Offline worker is not ready yet.'));
  const channel=new MessageChannel();const timeout=setTimeout(()=>reject(Error('Offline verification is taking too long. Try again.')),90000);
  channel.port1.onmessage=e=>{clearTimeout(timeout);resolve(e.data);};worker.postMessage({type},[channel.port2]);
});}
export function setupPWA({canUpdate=()=>true,onStatus=()=>{}}={}) {
  const status=document.querySelector('#offlineStatus'),download=document.querySelector('#downloadOfflineButton'),update=document.querySelector('#updateAppButton'),install=document.querySelector('#installAppButton');
  let registration,downloadActive=false,verifiedReady=false;
  const watched=new WeakSet();
  function display(text) {if(status)status.textContent=text;onStatus(text);const warning=document.querySelector('#offlineWarning');if(warning){const problem=/incomplete|unavailable|failed|too long/i.test(text);warning.hidden=!problem||verifiedReady;warning.textContent=problem?(text.includes('unavailable')?'Saving for offline practice is unavailable in this browser. You can still practise online.':'Connect to the internet so your music and sounds can be saved on this device.'):'';}}
  function watch(reg) {registration=reg;const pending=reg.installing;
    if(pending){display('Downloading required files…');pending.addEventListener('statechange',()=>{if(pending.state==='redundant')display('Offline assets incomplete — reconnect and retry.');if(pending.state==='installed'&&reg.waiting&&navigator.serviceWorker.controller){update.hidden=false;display('Update available — apply when you finish practising.');}});}
    if(reg.waiting&&navigator.serviceWorker.controller){update.hidden=false;display('Update available — apply when you finish practising.');}
    if(!watched.has(reg)){watched.add(reg);reg.addEventListener('updatefound',()=>watch(reg));}
  }
  async function verify() {if(!registration?.active)return;
    try {const result=await message(registration.active,'VERIFY');verifiedReady=result.ready===true;display(result.ready?'Offline ready · piano + human voices + built-in scores':'Offline assets incomplete — download before going offline.');update.hidden=!registration.waiting;}
    catch(error){display(error.message);}
  }
  async function register() {if(!('serviceWorker' in navigator)||!globalThis.isSecureContext){display('Offline installation is unavailable in this browser or connection.');if(download)download.disabled=true;return;}
    try {watch(await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}));await verify();}
    catch(error){display('Offline assets incomplete — reconnect and retry.');console.warn(error);}
    return registration;
  }
  navigator.serviceWorker?.addEventListener('message',e=>{
    if(e.data?.type==='DOWNLOAD_PROGRESS')display(`Downloading required files · ${e.data.done}/${e.data.total}`);
    if(e.data?.type==='OFFLINE_STATUS')display('Offline ready · piano + human voices + built-in scores');
    if(e.data?.type==='OFFLINE_ERROR')display(`Offline assets incomplete · ${e.data.message}`);
  });
  navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(update.dataset.applying==='true')location.reload();else void verify();});
  async function prepare() {
    if(downloadActive)return;downloadActive=true;if(download)download.disabled=true;
    try {const reg=await register();if(reg)await prepareOffline(reg,message);await verify();}
    catch(error){display(`Offline assets incomplete · ${error.message}`);}finally{downloadActive=false;if(download)download.disabled=false;}
  }
  download?.addEventListener('click',()=>void prepare());
  update.addEventListener('click',async()=>{
    if(!canUpdate()){display('Stop playback, review and microphone checks before updating.');return;}
    if(!registration?.waiting){update.hidden=true;await verify();return;}
    try {update.dataset.applying='true';const result=await message(registration?.waiting,'UPDATE');if(result.error){update.dataset.applying='false';display(result.error);}}
    catch(error){update.dataset.applying='false';display(error.message);}
  });
  setupInstallation({install,dialog:document.querySelector('#installInstructionsDialog')});
  window.addEventListener('online',()=>void prepare());
  window.addEventListener('offline',()=>void verify());
  void prepare();return {verify,prepare};
}

export function installationInstructions(nav=navigator) {
  const ua=nav.userAgent||'',ios=/iPad|iPhone|iPod/.test(ua)||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);
  if(ios)return 'On iPhone or iPad, open Vocal Coach in Safari. Tap Share → Add to Home Screen → Add. Keep Open as Web App enabled if offered.';
  if(/Android/.test(ua))return 'On Android, open the browser menu and choose Install app or Add to Home screen if offered. If unavailable, open Vocal Coach in Chrome and try its install menu.';
  if(/Edg\//.test(ua))return 'In Microsoft Edge, open the menu → Apps → Install this site as an app. If already installed, use Open in app.';
  if(/Chrome\//.test(ua))return 'In Chrome, use the install icon in the address bar or menu → Cast, save and share → Install page as app. If already installed, use Open in app.';
  if(/Safari\//.test(ua)&&/Mac/.test(ua))return 'In Safari on macOS Sonoma or later, choose File → Add to Dock, or Share → Add to Dock. Older Safari versions can use Vocal Coach in a browser tab.';
  return 'This browser may not support installing web apps. Check its menu for Install app. On desktop, try Chrome or Edge; on iPhone or iPad, use Safari. You can also keep practising in this browser.';
}
export function setupInstallation({install,dialog}) {
  const mode=matchMedia('(display-mode: standalone)');let installed=false,prompt=null;
  const standalone=()=>mode.matches||navigator.standalone===true;
  const refresh=()=>{install.hidden=installed||standalone();install.textContent='Install Vocal Coach';const note=globalThis.document?.querySelector('#installDeviceNote');if(note)note.hidden=install.hidden;};
  function instructions(prefix='') {
    dialog.querySelector('#installInstructionsTitle').textContent='Install Vocal Coach';
    dialog.querySelector('#installInstructionsCopy').textContent=prefix+installationInstructions();
    dialog.showModal();
  }
  refresh();mode.addEventListener?.('change',refresh);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;refresh();});
  window.addEventListener('appinstalled',()=>{installed=true;prompt=null;refresh();});
  install.addEventListener('click',async()=>{
    if(installed||standalone())return;
    if(!prompt){instructions();return;}
    const current=prompt;prompt=null;install.disabled=true;
    try {await current.prompt();const result=await current.userChoice;if(result.outcome==='accepted')installed=true;else instructions('You can install later. ');}
    catch {instructions('The automatic install prompt is unavailable. ');}
    finally {install.disabled=false;refresh();}
  });
}

export async function prepareOffline(reg,send=message) {
  // Installation itself downloads a new inventory. Verify/repair the active
  // version separately; never activate a waiting update during practice.
  if(reg.active){const result=await send(reg.active,'VERIFY');if(!result.ready){const repaired=await send(reg.active,'DOWNLOAD');if(!repaired.ready)throw Error(repaired.error||'Reconnect to finish offline setup.');}}
  if(globalThis.navigator?.onLine!==false){try{await reg.update();}catch(error){if(!reg.active)throw error; /* A verified cached app still works when update checking loses network. */}}
}
