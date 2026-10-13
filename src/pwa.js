function message(worker,type) {return new Promise((resolve,reject)=>{if(!worker)return reject(Error('Offline worker is not ready yet.'));
  const channel=new MessageChannel();const timeout=setTimeout(()=>reject(Error('Offline verification is taking too long. Try again.')),90000);
  channel.port1.onmessage=e=>{clearTimeout(timeout);resolve(e.data);};worker.postMessage({type},[channel.port2]);
});}
export function setupPWA({canUpdate=()=>true,onStatus=()=>{}}={}) {
  const status=document.querySelector('#offlineStatus'),download=document.querySelector('#downloadOfflineButton'),update=document.querySelector('#updateAppButton'),install=document.querySelector('#installAppButton');
  let registration,installPrompt,downloadActive=false;
  const watched=new WeakSet();
  function display(text) {status.textContent=text;onStatus(text);}
  function watch(reg) {registration=reg;const pending=reg.installing;
    if(pending){display('Downloading required files…');pending.addEventListener('statechange',()=>{if(pending.state==='redundant')display('Offline assets incomplete — reconnect and retry.');if(pending.state==='installed'&&reg.waiting&&navigator.serviceWorker.controller){update.hidden=false;display('Update available — apply when you finish practising.');}});}
    if(reg.waiting&&navigator.serviceWorker.controller){update.hidden=false;display('Update available — apply when you finish practising.');}
    if(!watched.has(reg)){watched.add(reg);reg.addEventListener('updatefound',()=>watch(reg));}
  }
  async function verify() {if(!registration?.active)return;
    try {const result=await message(registration.active,'VERIFY');display(result.ready?'Offline ready · piano + human voices + built-in scores':'Offline assets incomplete — download before going offline.');update.hidden=!registration.waiting;}
    catch(error){display(error.message);}
  }
  async function register() {if(!('serviceWorker' in navigator)||!globalThis.isSecureContext){display('Offline installation is unavailable in this browser or connection.');download.disabled=true;return;}
    try {watch(await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}));await verify();}
    catch(error){display('Offline assets incomplete — reconnect and retry.');console.warn(error);}
  }
  navigator.serviceWorker?.addEventListener('message',e=>{
    if(e.data?.type==='DOWNLOAD_PROGRESS')display(`Downloading required files · ${e.data.done}/${e.data.total}`);
    if(e.data?.type==='OFFLINE_STATUS')display('Offline ready · piano + human voices + built-in scores');
    if(e.data?.type==='OFFLINE_ERROR')display(`Offline assets incomplete · ${e.data.message}`);
  });
  navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(update.dataset.applying==='true')location.reload();else void verify();});
  download.addEventListener('click',async()=>{if(downloadActive)return;downloadActive=true;download.disabled=true;
    try {await register();await registration?.update();if(registration?.active){const result=await message(registration.active,'DOWNLOAD');if(!result.ready)throw Error(result.error);await verify();}}
    catch(error){display(`Offline assets incomplete · ${error.message}`);}finally{downloadActive=false;download.disabled=false;}
  });
  update.addEventListener('click',async()=>{
    if(!canUpdate()){display('Stop playback, review and microphone checks before updating.');return;}
    if(!registration?.waiting){update.hidden=true;await verify();return;}
    try {update.dataset.applying='true';const result=await message(registration?.waiting,'UPDATE');if(result.error){update.dataset.applying='false';display(result.error);}}
    catch(error){update.dataset.applying='false';display(error.message);}
  });
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios&&!standalone()){install.hidden=false;install.textContent='Install on iPhone / iPad';}
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;if(!standalone()){install.hidden=false;install.textContent='Install Vocal Coach';}});
  window.addEventListener('appinstalled',()=>{install.hidden=true;installPrompt=null;});
  install.addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();const result=await installPrompt.userChoice;installPrompt=null;install.hidden=true;if(result.outcome!=='accepted')display('You can install later from your browser menu.');}
    else if(ios&&!standalone())document.querySelector('#installInstructionsDialog').showModal();
  });
  window.addEventListener('online',()=>{void verify();void registration?.update().catch(()=>{});});
  window.addEventListener('offline',()=>void verify());
  void register();return {verify};
}
