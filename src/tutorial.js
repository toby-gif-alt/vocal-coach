import {pitchName} from './starting-note.js?v=34';
import {TUTORIAL_LESSONS} from './tutorial-demo.js?v=34';
// Completing the previous tour does not hide this new, single tutorial. Offered once.
const TUTORIAL_KEY='vocal-coach:tutorial:v5';
export function tutorialPosition(target,card,viewport,blockers=[]) {
 const gap=12,edge=8;
 const candidates=[
  {left:(viewport.width-card.width)/2,top:(viewport.height-card.height)/2},
  {left:edge,top:viewport.height-card.height-edge},
  {left:viewport.width-card.width-edge,top:viewport.height-card.height-edge},
  {left:target.right+gap,top:target.top},
  {left:target.left-card.width-gap,top:target.top},
  {left:target.left,top:target.bottom+gap},
  {left:target.left,top:target.top-card.height-gap},
 ];
 const bounded=candidates.map(p=>({left:Math.max(edge,Math.min(p.left,viewport.width-card.width-edge)),top:Math.max(edge,Math.min(p.top,viewport.height-card.height-edge))}));
 const area=(p,r)=>Math.max(0,Math.min(p.left+card.width,r.right)-Math.max(p.left,r.left))*Math.max(0,Math.min(p.top+card.height,r.bottom)-Math.max(p.top,r.top));
 const overlap=p=>area(p,target)*10+blockers.reduce((sum,r)=>sum+area(p,r),0);
 return bounded.sort((a,b)=>overlap(a)-overlap(b))[0];
}

// State and timing are independent of the DOM, so first-use behaviour is testable.
export function createOnboarding({storage,show,hide,onStudioReady=()=>{}}){
 let done=false;try{done=storage?.getItem(TUTORIAL_KEY)==='done';}catch{}
 let view='upload',active=false;
 return {
  view(name){hide();view=name;if(active||name!=='studio')return;if(!done)show('studio');else onStudioReady('returning');},
  skip(){hide();const first=!done;done=true;try{storage?.setItem(TUTORIAL_KEY,'done');}catch{}if(first&&view==='studio'&&!active)onStudioReady('first-tour');},
  active(value){active=value;if(value)hide();},
  replay(){if(active||view!=='studio')return false;show('studio');return true;},
  destroy:hide,
 };
}

export function createTutorial({onStudioReady=()=>{},demos}={}){
 let kind='studio',index=0,target=null,run=0,audioBlocked=false,anchor=null;
 const card=document.createElement('section');card.className='tutorial-card';card.hidden=true;
 card.setAttribute('role','dialog');card.setAttribute('aria-labelledby','tutorialTitle');
 card.innerHTML='<div class="tutorial-lesson-body"><small id="tutorialProgress"></small><h2 id="tutorialTitle"></h2><p id="tutorialCopy"></p><p id="demoLabel">Demonstration — simulated singing</p><p id="demoStatus" role="status"></p><output id="demoPitch"></output></div><div class="tutorial-actions"><button type="button" data-tour="skip">Skip tutorial</button><button type="button" data-tour="back">Back</button><button type="button" data-tour="repeat">Repeat</button><button type="button" data-tour="next">Next →</button></div>';
 document.body.append(card);const find=selector=>card.querySelector(selector);
 const visible=e=>e&&!e.closest('[hidden]')&&e.getBoundingClientRect().width>0;
 function highlight(selector){
  const next=document.querySelector(selector);if(!visible(next)||next===target)return;
  target?.classList.remove('tutorial-target');target=next;target.classList.add('tutorial-target');position();
 }
 function position(){
  if(card.hidden)return;
  if(card.classList.contains('tutorial-centered')){
   card.style.setProperty('--tutorial-left','50%');card.style.setProperty('--tutorial-top','50%');return;
  }
  const rect=target?.getBoundingClientRect()||{left:16,right:16,top:80,bottom:80};
  const size=card.getBoundingClientRect();
  const viewport={width:innerWidth,height:innerHeight};
  // Stay put within a lesson unless its current subject would be covered.
  const overlaps=p=>p.left<rect.right&&p.left+size.width>rect.left&&p.top<rect.bottom&&p.top+size.height>rect.top;
  if(!anchor||overlaps(anchor)||anchor.left+size.width>innerWidth-8||anchor.top+size.height>innerHeight-8)
   anchor=tutorialPosition(rect,size,viewport);
  const point=anchor;
  card.style.setProperty('--tutorial-left',`${point.left}px`);card.style.setProperty('--tutorial-top',`${point.top}px`);
 }
 function hide(){run++;demos.stop();target?.classList.remove('tutorial-target');target=null;card.hidden=true;document.body.classList.remove('tutorial-studio');}
 function render(){
  const token=++run;demos.stop();audioBlocked=false;anchor=null;
  const lesson=TUTORIAL_LESSONS[index];
  card.classList.toggle('tutorial-centered',['phrase','tempo'].includes(lesson.id));
  target?.classList.remove('tutorial-target');target=null;
  card.hidden=false;document.body.classList.toggle('tutorial-studio',kind==='studio');
  find('#tutorialTitle').textContent=lesson.title;
  find('#tutorialCopy').textContent=lesson.copy;
  find('#tutorialProgress').textContent=`Tutorial · ${index+1} of ${TUTORIAL_LESSONS.length}`;
  find('#demoLabel').hidden=kind!=='studio';find('#demoStatus').textContent='';find('#demoPitch').textContent='';
  find('[data-tour="back"]').hidden=kind!=='studio';find('[data-tour="back"]').disabled=index===0;
  find('[data-tour="next"]').hidden=kind!=='studio';find('[data-tour="next"]').textContent=index===TUTORIAL_LESSONS.length-1?'Done':'Next →';
  highlight(lesson.target);position();
  if(kind==='studio'){
   find('[data-tour="next"]').focus({preventScroll:true});
   void demos.run(lesson.id,value=>{
    if(token!==run||card.hidden)return;
    if(value.audioBlocked){audioBlocked=true;find('#demoStatus').textContent='Click Next to hear this example, then Next again to continue.';}
    else if(!audioBlocked)find('#demoStatus').textContent=value.message||'';
    find('#demoPitch').textContent=Number.isFinite(value.frequency)?`Target ${pitchName(value.targetMidi)} · ${value.frequency.toFixed(1)} Hz`:'';
    if(value.target)highlight(value.target);
   }).then(()=>{if(token===run&&!card.hidden)find('[data-tour="next"]').focus({preventScroll:true});});
  }
 }
 let storage;try{storage=localStorage;}catch{}
 const controller=createOnboarding({storage,show(value){kind=value;index=0;render();},hide,onStudioReady});
 async function complete(){run++;card.hidden=true;await demos.stop();controller.skip(kind);if(kind==='studio'&&!document.querySelector('dialog[open]'))document.querySelector('#studioTutorialButton')?.focus({preventScroll:true});}
 card.addEventListener('click',event=>{
  const action=event.target.closest('[data-tour]')?.dataset.tour;
  if(action==='skip'){complete();return;}
  if(!['back','next','repeat'].includes(action))return;
  demos.unlock();
  if(action==='repeat'){render();return;}
  if(action==='next'&&audioBlocked){render();return;}
  if(action==='next'&&index===TUTORIAL_LESSONS.length-1){complete();return;}
  index=Math.max(0,index+(action==='back'?-1:1));render();
 });
 const keys=event=>{
  if(card.hidden)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();complete();}
  if(event.key==='Tab'){
   if(!card.contains(document.activeElement)){event.preventDefault();find('[data-tour="next"]').focus();return;}
   const buttons=[...card.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled),first=buttons[0],last=buttons.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 };
 document.addEventListener('keydown',keys,true);window.addEventListener('resize',position);
 return {showView:name=>controller.view(name),setActive:value=>controller.active(value),replay(){demos.unlock();return controller.replay();},refreshOverview(){demos.refresh?.();position();},
 destroy(){controller.destroy();document.removeEventListener('keydown',keys,true);window.removeEventListener('resize',position);card.remove();}};
}
