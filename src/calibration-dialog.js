import {AUDIO_CONFIG} from './config.js';
export function calibrationFailure(value) {
  if(value?.overloaded)return 'Your microphone signal was too strong. Move slightly farther away and sing naturally, without shouting.';
  if(!value)return 'The microphone check was cancelled. You can try again or use Listen mode.';
  if(value.sungRmsMedian<AUDIO_CONFIG.absoluteRmsFloor*1.35)return "We couldn't hear your voice clearly. Try moving a little closer.";
  if(value.signalToNoiseRatio<AUDIO_CONFIG.minimumSignalToNoiseRatio&&value.ambientRms>=AUDIO_CONFIG.absoluteRmsFloor)return 'Background sound is strong compared with your voice. Try somewhere quieter.';
  return "We couldn't find enough clear pitch samples. Try singing a comfortable, steady “Ah” again.";
}
export function microphoneError(error) {
  if(error?.name==='NotAllowedError')return 'Microphone permission was blocked. Enable microphone access for Vocal Coach in your browser or device settings, then try again.';
  if(error?.name==='NotFoundError')return 'No microphone was found. Connect or enable a microphone, or use Listen mode.';
  if(error?.name==='NotReadableError')return 'Your microphone is unavailable or in use by another app. Close that app and try again.';
  return error?.message||'The microphone could not start. Try again or use Listen mode.';
}
export function createCalibrationDialog({audio,onBusy=()=>{},onCancel=()=>{}}) {
  const dialog=document.querySelector('#calibrationDialog'),title=document.querySelector('#calibrationTitle'),copy=document.querySelector('#calibrationCopy'),progress=document.querySelector('#calibrationProgress'),level=document.querySelector('#calibrationLevel'),start=document.querySelector('#startCalibrationButton'),cancel=document.querySelector('#cancelCalibrationButton'),done=document.querySelector('#finishCalibrationButton'),intro=document.querySelector('#calibrationIntro');
  let pending=null,resolve=null,running=false,token=0,keepActive=false;
  function result(good,text) {running=false;onBusy(false);title.textContent=good?'Microphone ready!':'Let’s try that again';copy.textContent=text;progress.hidden=true;level.hidden=true;intro.hidden=true;start.hidden=good;start.disabled=false;start.textContent='Try again';cancel.hidden=good;done.hidden=!good;}
  function close(success) {token++;running=false;if(!success){audio.stopMicrophone({notify:false});onCancel();}onBusy(false);dialog.close();const complete=resolve;resolve=null;pending=null;complete?.(success);}
  async function run() {if(running||!pending)return;const attempt=++token;running=true;onBusy(true);intro.hidden=true;start.hidden=true;done.hidden=true;progress.hidden=false;progress.removeAttribute('value');
    title.textContent='Allow Vocal Coach to use your microphone';copy.textContent='Microphone audio is processed on this device and is not uploaded. Allow access if your browser asks.';
    try {const calibration=await audio.recheckMicrophone({keepActive});if(attempt!==token||!pending)return;
      result(calibration?.signalGood===true,calibration?.signalGood?'Your voice is coming through clearly. Vocal Coach is ready to listen.':calibrationFailure(calibration));
    } catch(error){if(attempt===token&&pending)result(false,microphoneError(error));}
  }
  start.addEventListener('click',()=>void run());cancel.addEventListener('click',()=>close(false));done.addEventListener('click',()=>close(true));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close(false);});
  return {
    open(options={}) {if(pending)return pending;keepActive=!!options.keepActive;title.textContent="Let's check your microphone";copy.textContent='Vocal Coach needs to hear your singing clearly so it can give you accurate feedback. This takes just a few seconds.';
      intro.hidden=false;start.hidden=false;start.disabled=false;start.textContent='Start microphone check';cancel.hidden=false;done.hidden=true;progress.hidden=true;level.hidden=true;
      pending=new Promise(r=>{resolve=r;});dialog.showModal();return pending;
    },
    state(status,details={}) {if(!running||!pending)return;
      if(status==='checking-room'||status==='checking-voice') {const voice=status==='checking-voice';title.textContent=voice?'Step 2 of 2 — Sing a comfortable note':'Step 1 of 2 — Stay quiet';
        copy.textContent=voice?'Sing “Ah” on any comfortable pitch. Start at your normal singing volume, then get a little louder. Sing naturally, not loudly or with force.':'Stay silent while Vocal Coach listens to the background noise in your room.';
        progress.max=details.durationMs;progress.value=0;progress.hidden=false;level.hidden=!voice;level.value=0;
      }
      if(status==='checking-progress') {progress.max=details.durationMs;progress.value=details.elapsedMs;level.value=Math.min(1,(details.rms||0)*12);}
    },
    get active(){return !!pending;},get running(){return running;},cancel(){if(pending)close(false);}
  };
}
