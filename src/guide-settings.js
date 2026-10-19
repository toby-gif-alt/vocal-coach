import {PLAYBACK_CONFIG} from './config.js?v=32';
export const GUIDE_DEFAULTS=Object.freeze({listen:Object.freeze({enabled:true,volume:PLAYBACK_CONFIG.defaultGuideVolume}),assisted:Object.freeze({enabled:true,volume:PLAYBACK_CONFIG.defaultGuideVolume}),assessment:Object.freeze({enabled:true,volume:70})});
export function guideSettings(saved={},legacyVolume){
 return Object.fromEntries(Object.entries(GUIDE_DEFAULTS).map(([mode,defaults])=>{
  const value=saved?.[mode]||{},volume=Number.isFinite(value.volume)?value.volume:(mode!=='assessment'&&Number.isFinite(legacyVolume)?legacyVolume:defaults.volume);
  return [mode,{enabled:value.enabled!==false,volume:Math.max(0,Math.min(100,volume))}];
 }));
}
