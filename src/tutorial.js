const WELCOME_KEY = "vocal-coach:welcome:v2", STUDIO_KEY = "vocal-coach:studio-tour:v3";
export const TOUR_STEPS = [
 ['#newScoreButton','Home','Return to your repertoire to choose another piece.'],
 ['#setupPanel > summary','Settings','Recheck your microphone, choose headphones or speakers, and set a count-in. Advanced holds maintenance and app information.'],
 ['[data-view="vocal"]','Vocal focus','Read just the line you sing. This is the default when opening a piece.'],
 ['[data-view="full"]','Full score','See your part together with the other voices and instruments.'],
 ['#mixerPanel > summary','Mixer','Choose each accompaniment sound, turn parts on or off, and balance their levels. The vocal guide has its own controls.'],
 ['#studioTutorialButton','Tutorial','Replay this guide whenever you need it. Skip or Done remembers your choice.'],
 ['#editPracticeButton','Select bars to practice','Type bar numbers or drag across the score. Outside bars dim. Repeat is inside these options; Cancel clears the selection.'],
 ['.mode-switch','Choose your mode','Listen needs no microphone. Assisted adds a guide and pitch trace. Assessment adds coaching after your take.'],
 ['#changePartButton','Your singing part','Click to choose another vocal line. If a take is running, you will be asked before it stops.'],
 ['#hearStartingNote','Hear starting note','In Listen, this plays your starting pitch immediately. Assisted and Assessment first help you check the microphone and choose a comfortable octave.'],
 ['#changeOctaveButton','Change octave','Choose a different singing octave before a take. Your confirmed octave stays fixed while recording.'],
 ['#transportDock .dock-controls','Restart, Play and Stop','Click the score to place the green line, then press Play. Stop finishes a microphone take and opens review.'],
 ['#tempoPanel > summary','Tempo','Slow down or speed up this piece. Each newly opened piece starts at 100%.'],
 ['#listenBackButton','Listen back','After a recorded take, reopen the player here. Voice, accompaniment and melody levels are available during review.'],
 ['#previousTakeControl','Show previous take','Compare your last take with the thin reference trace.'],
 ['.score-viewport','Sheet music and cursor','The green line follows playback. Selected practice bars stay clear while the other bars darken.'],
 ['#tuningMeter','Live tuning','In Assisted or Assessment, find your pitch here before Play and follow your trace while singing.'],
];

// Group controls by their actual vertical overlap, then read each row left to right.
// This follows wrapped mobile rows as well as the desktop navigation.
export function orderTourTargets(items) {
 const rows=[];
 for(const item of [...items].sort((a,b)=>a.rect.top-b.rect.top||a.rect.left-b.rect.left)){
  const row=rows.find(r=>Math.min(r.bottom,item.rect.bottom)-Math.max(r.top,item.rect.top)>Math.min(r.height,item.rect.height)*.45);
  if(row){row.items.push(item);row.top=Math.max(row.top,item.rect.top);row.bottom=Math.min(row.bottom,item.rect.bottom);}
  else rows.push({top:item.rect.top,bottom:item.rect.bottom,height:item.rect.height,items:[item]});
 }
 return rows.flatMap(row=>row.items.sort((a,b)=>a.rect.left-b.rect.left));
}
export function tutorialPosition(target,card,viewport) {
 const gap=12,edge=8;
 const candidates=[
  {left:target.right+gap,top:target.top},
  {left:target.left-card.width-gap,top:target.top},
  {left:target.left,top:target.bottom+gap},
  {left:target.left,top:target.top-card.height-gap},
 ];
 const bounded=candidates.map(p=>({left:Math.max(edge,Math.min(p.left,viewport.width-card.width-edge)),top:Math.max(edge,Math.min(p.top,viewport.height-card.height-edge))}));
 const overlap=p=>Math.max(0,Math.min(p.left+card.width,target.right)-Math.max(p.left,target.left))*Math.max(0,Math.min(p.top+card.height,target.bottom)-Math.max(p.top,target.top));
 return bounded.sort((a,b)=>overlap(a)-overlap(b))[0];
}

// State and timing are independent of the DOM, so first-use behaviour is testable.
export function createOnboarding({ storage, schedule = setTimeout, unschedule = clearTimeout, show, hide, onStudioReady = () => {} }) {
  const read = key => { try { return storage?.getItem(key) === "done"; } catch { return false; } };
  const save = key => { try { storage?.setItem(key, "done"); } catch { /* Storage is optional. */ } };
  let welcomeDone = read(WELCOME_KEY), studioDone = read(STUDIO_KEY), view = "upload", timer = null, active = false;
  const cancelTimer = () => { if (timer !== null) unschedule(timer); timer = null; };
  return {
    view(name) {
      cancelTimer(); hide(); view = name;
      if (active) return;
      if (name === "upload" && !welcomeDone) timer = schedule(() => { timer = null; if (view === "upload" && !active && !welcomeDone) show("welcome"); }, 2000);
      if (name === "studio") { if (!studioDone) show("studio"); else onStudioReady("returning"); }
    },
    interact() { if (view === "upload") { cancelTimer(); welcomeDone = true; save(WELCOME_KEY); hide(); } },
    skip(kind) { cancelTimer(); hide(); if (kind === "welcome") { welcomeDone = true; save(WELCOME_KEY); } else { const firstTour = !studioDone; studioDone = true; save(STUDIO_KEY); if (firstTour && view === "studio" && !active) onStudioReady("first-tour"); } },
    active(value) { active = value; if (value) { cancelTimer(); hide(); } },
    replay() { if (active) return false; cancelTimer(); show(view === "studio" ? "studio" : "welcome"); return true; },
    destroy() { cancelTimer(); hide(); },
  };
}

export function createTutorial({ onStudioReady = () => {} } = {}) {
 let kind='welcome',index=0,target=null,steps=[];
 const card=document.createElement('section');card.className='tutorial-card';card.hidden=true;
 card.setAttribute('role','dialog');card.setAttribute('aria-labelledby','tutorialTitle');
 card.innerHTML='<small id="tutorialProgress"></small><h2 id="tutorialTitle"></h2><p id="tutorialCopy" aria-live="polite"></p><div class="tutorial-actions"><button type="button" data-tour="skip">Skip</button><button type="button" data-tour="back">Back</button><button type="button" data-tour="next">Next →</button></div>';
 document.body.append(card);
 const find=selector=>card.querySelector(selector);
 const visible=element=>element&&!element.closest('[hidden]')&&element.getBoundingClientRect().width>0&&getComputedStyle(element).visibility!=='hidden';
 function collect(){return orderTourTargets(TOUR_STEPS.map(step=>({step,element:document.querySelector(step[0])})).filter(item=>visible(item.element)).map(item=>({...item,rect:item.element.getBoundingClientRect()}))).map(item=>item.step);}
 function position(){
  if(card.hidden||!target)return;
  const rect=target.getBoundingClientRect(),height=card.getBoundingClientRect().height,width=card.getBoundingClientRect().width;
  const point=tutorialPosition(rect,{width,height},{width:innerWidth,height:innerHeight});
  card.style.left=`${point.left}px`;card.style.top=`${point.top}px`;
 }
 function hide(){target?.classList.remove('tutorial-target');target=null;card.hidden=true;document.body.classList.remove('tutorial-studio');}
 function render(){
  target?.classList.remove('tutorial-target');
  const [selector,title,copy]=kind==='welcome'?['.score-chooser','Welcome to Vocal Coach!','Choose repertoire or import a score to get started.']:steps[index];
  target=document.querySelector(selector);target?.classList.add('tutorial-target');
  card.hidden=false;document.body.classList.toggle('tutorial-studio',kind==='studio');
  find('#tutorialTitle').textContent=title;find('#tutorialCopy').textContent=copy;
  find('#tutorialProgress').textContent=kind==='welcome'?'Start with a score':`${index+1} of ${steps.length}`;
  find('[data-tour="back"]').hidden=kind==='welcome';find('[data-tour="back"]').disabled=index===0;
  find('[data-tour="next"]').hidden=kind==='welcome';find('[data-tour="next"]').textContent=index===steps.length-1?'Done':'Next →';
  if(target){
   const rect=target.getBoundingClientRect(),safeTop=document.querySelector('.topbar')?.getBoundingClientRect().bottom||0;
   if(rect.top<safeTop||rect.bottom>innerHeight)target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
   const after=target.getBoundingClientRect();if(after.top<safeTop)window.scrollBy({top:after.top-safeTop-8,behavior:'instant'});
  }
  position();
 }
 let storage;try{storage=localStorage;}catch{}
 const controller=createOnboarding({storage,show(value){kind=value;index=0;steps=collect();render();if(kind==='studio')find('[data-tour="next"]').focus({preventScroll:true});},hide,onStudioReady});
 function complete(){controller.skip(kind);if(kind==='studio'&&!document.querySelector('dialog[open]'))document.querySelector('#studioTutorialButton')?.focus({preventScroll:true});}
 card.addEventListener('click',event=>{
  const action=event.target.dataset.tour;
  if(action==='skip')complete();
  if(action==='back'){index=Math.max(0,index-1);render();}
  if(action==='next'){if(index===steps.length-1)complete();else{index++;render();}}
 });
 const interact=()=>controller.interact();
 document.addEventListener('pointerdown',interact,{passive:true});document.addEventListener('keydown',interact);document.addEventListener('change',interact);document.addEventListener('wheel',interact,{passive:true});
 const keys=event=>{
  if(card.hidden)return;
  if(event.key==='Escape'){event.preventDefault();complete();}
  if(event.key==='Tab'){
   const buttons=[...card.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled),first=buttons[0],last=buttons.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 };
 const resize=()=>{if(!card.hidden){const selector=steps[index]?.[0];steps=collect();index=Math.max(0,steps.findIndex(step=>step[0]===selector));render();}};
 document.addEventListener('keydown',keys);window.addEventListener('resize',resize);window.addEventListener('scroll',position,{passive:true});
 return {showView:name=>controller.view(name),setActive:value=>controller.active(value),replay:()=>controller.replay(),refreshOverview:position,
 destroy(){controller.destroy();document.removeEventListener('pointerdown',interact);document.removeEventListener('keydown',interact);document.removeEventListener('change',interact);document.removeEventListener('wheel',interact);document.removeEventListener('keydown',keys);window.removeEventListener('resize',resize);window.removeEventListener('scroll',position);card.remove();}};
}
