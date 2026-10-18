// Feedback keeps the analyser's evidence; this module only orders it and chooses
// bounded review windows. No recording or immutable take metadata is changed.
export function coachingReviewSequence(feedback, timeline, measures, take) {
  const first=Number(take.startQuarter)||0,last=Number(take.endQuarter)||first;
  const secondsPerQuarter=60/(Number(take.bpm)>0?take.bpm:120);
  return [...feedback.improvements,...feedback.strengths].map((item,index)=>{
    const note=timeline.find(n=>n.id===item.noteId);
    const measure=measures.find(m=>m.measureNumber===Number(item.measureNumber ?? note?.measureNumber));
    const fallback=[...measures].reverse().find(m=>m.startQuarter<last&&m.endQuarter>first);
    const bar=measure||fallback;
    const startQuarter=Math.max(first,bar?.startQuarter??first);
    const endQuarter=Math.min(last,bar?.endQuarter??last);
    return {...item,targetQuarter:note?.onsetQuarters??measure?.startQuarter??startQuarter,order:note?.onsetQuarters??measure?.startQuarter??Infinity,index,
      chunk:{startQuarter,endQuarter,startSeconds:(startQuarter-first)*secondsPerQuarter,
        endSeconds:(endQuarter-first)*secondsPerQuarter,measureNumber:bar?.measureNumber??take.startMeasure},
      general:!note&&!measure};
  }).filter(item=>item.chunk.endQuarter>item.chunk.startQuarter)
    .sort((a,b)=>a.order-b.order||a.index-b.index);
}
export function reviewChunkSeconds(chunk, seconds) {
  return Math.max(chunk?.startSeconds??0,Math.min(chunk?.endSeconds??Infinity,Number(seconds)||0));
}
