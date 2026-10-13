import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installationInstructions,setupInstallation} from '../src/pwa.js';

function harness({standalone=false,ua='Firefox/140.0'}={}) {
  const saved=Object.fromEntries(['navigator','window','matchMedia'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const win=new EventTarget(),mode=new EventTarget();mode.matches=standalone;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:ua}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:win});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>mode});
  const install=new EventTarget();install.hidden=true;install.disabled=false;
  const title={},copy={},dialog={opens:0,querySelector:id=>id.includes('Title')?title:copy,showModal(){this.opens++;}};
  setupInstallation({install,dialog});
  return {win,mode,install,dialog,copy,restore(){for(const [key,descriptor] of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('install stays visible without a prompt and opens honest browser instructions',()=>{
  const h=harness();try{assert.equal(h.install.hidden,false);assert.equal(h.install.textContent,'Install Vocal Coach');h.install.dispatchEvent(new Event('click'));assert.equal(h.dialog.opens,1);assert.match(h.copy.textContent,/may not support/);}finally{h.restore();}
});
test('dismissed native prompt leaves Install visible and available for later instructions',async()=>{
  const h=harness({ua:'Chrome/140.0'});try{
    const event=new Event('beforeinstallprompt',{cancelable:true});let calls=0;event.prompt=async()=>{calls++;};event.userChoice=Promise.resolve({outcome:'dismissed'});h.win.dispatchEvent(event);
    assert.ok(event.defaultPrevented);h.install.dispatchEvent(new Event('click'));await settle();assert.equal(calls,1);assert.equal(h.install.hidden,false);assert.equal(h.install.disabled,false);assert.match(h.copy.textContent,/Chrome/);
    h.install.dispatchEvent(new Event('click'));assert.equal(h.dialog.opens,2);assert.equal(calls,1);
  }finally{h.restore();}
});
test('accepted installation, appinstalled and standalone mode hide the control',async()=>{
  const h=harness();try{const event=new Event('beforeinstallprompt');event.prompt=async()=>{};event.userChoice=Promise.resolve({outcome:'accepted'});h.win.dispatchEvent(event);h.install.dispatchEvent(new Event('click'));await settle();assert.ok(h.install.hidden);}finally{h.restore();}
  const standalone=harness({standalone:true});try{assert.ok(standalone.install.hidden);}finally{standalone.restore();}
  const installed=harness();try{installed.win.dispatchEvent(new Event('appinstalled'));assert.ok(installed.install.hidden);}finally{installed.restore();}
});
test('failed prompt leaves a usable control and explains the browser fallback',async()=>{
  const h=harness();try{const event=new Event('beforeinstallprompt');event.prompt=async()=>{throw Error('Unavailable');};h.win.dispatchEvent(event);h.install.dispatchEvent(new Event('click'));await settle();assert.equal(h.install.hidden,false);assert.equal(h.install.disabled,false);assert.match(h.copy.textContent,/automatic install prompt is unavailable/);}finally{h.restore();}
});
test('instructions cover iOS, touch iPad, Android, Edge, Chrome and macOS Safari',()=>{
  assert.match(installationInstructions({userAgent:'iPhone Safari/605'}),/Share → Add to Home Screen/);
  assert.match(installationInstructions({userAgent:'Safari/605',platform:'MacIntel',maxTouchPoints:5}),/iPad/);
  assert.match(installationInstructions({userAgent:'Android Chrome/140'}),/Android/);
  assert.match(installationInstructions({userAgent:'Chrome/140 Edg/140'}),/Microsoft Edge/);
  assert.match(installationInstructions({userAgent:'Chrome/140'}),/Chrome/);
  assert.match(installationInstructions({userAgent:'Macintosh Safari/605'}),/Add to Dock/);
});
