import {PLAYBACK_CONFIG} from './config.js?v=32';
export const GUIDE_DEFAULTS=Object.freeze({enabled:true,volume:PLAYBACK_CONFIG.defaultGuideVolume});
export const practiceMode=mode=>mode==='assessment'?'assessment':'assisted';
const validVolume=value=>Number.isFinite(value);
const normalise=value=>({enabled:value?.enabled!==false,volume:validVolume(value?.volume)?Math.max(0,Math.min(100,value.volume)):GUIDE_DEFAULTS.volume});

// Prefer the last-used deliberate choice, then another deliberate legacy choice.
// The old Assessment 70% default was automatic, so it becomes the shared 92%.
export function guideSettings(preferences={}){
 if(preferences.guideSettings)return normalise(preferences.guideSettings);
 const legacy=preferences.guideByMode||{},keys=[preferences.mode,'assisted','assessment','listen'].filter((key,index,all)=>key&&all.indexOf(key)===index);
 const deliberate=key=>legacy[key]&&(legacy[key].enabled===false||(validVolume(legacy[key].volume)&&legacy[key].volume!==(key==='assessment'?70:92)));
 const key=keys.find(deliberate);
 if(key)return normalise(legacy[key]);
 if(validVolume(preferences.guideVolume)&&preferences.guideVolume!==(preferences.mode==='assessment'?70:92))return normalise({volume:preferences.guideVolume});
 return {...GUIDE_DEFAULTS};
}
