export const MAX_SCORE_BYTES=20*1024*1024,MAX_XML_BYTES=25*1024*1024;
export function validateScoreFile(file) {
  if(/\.mscz$/i.test(file?.name||''))throw Error('Open this MSCZ file in MuseScore Studio and export MusicXML, then import the MusicXML file here.');
  if(/\.pdf$/i.test(file?.name||''))throw Error('PDF cannot currently be imported as editable notation. Choose MusicXML or MXL instead.');
  if(!file||! /\.(musicxml|xml|mxl)$/i.test(file.name||''))throw Error('Choose a .musicxml, .xml or .mxl score.');
  if(!file.size||file.size>MAX_SCORE_BYTES)throw Error('Choose a score smaller than 20 MB.');
  const mime=(file.type||'').split(';')[0].toLowerCase();
  if(mime&&!['application/vnd.recordare.musicxml+xml','application/vnd.recordare.musicxml','application/xml','text/xml','application/zip','application/x-zip-compressed','application/octet-stream'].includes(mime))throw Error('This file type is not a MusicXML score.');
}
export function validateXMLText(text) {
  if(new TextEncoder().encode(text).length>MAX_XML_BYTES)throw Error('This score is too large to open safely (25 MB XML limit).');
  if(/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text))throw Error('Scores with internal XML entities are not supported. Export plain MusicXML.');
  if(/\son[a-z]+\s*=|<(?:\w+:)?(?:script|iframe|object|embed)\b|\s(?:[\w-]+:)?(?:src|href|source)\s*=\s*["'](?:https?:|javascript:|data:|\/\/)/i.test(text))throw Error('This score contains unsupported executable or external content.');
}
export function validateZipDirectory(buffer) {
  const view=new DataView(buffer);let end=-1;
  for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('This MXL archive is damaged.');
  const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);if(count>256||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)throw Error('This archive has too many entries or unsupported ZIP features.');
  let cursor=offset,total=0;
  for(let i=0;i<count;i++) {
    if(cursor+46>buffer.byteLength||view.getUint32(cursor,true)!==0x02014b50)throw Error('This MXL archive is damaged.');
    const nameLength=view.getUint16(cursor+28,true);
    if(cursor+46+nameLength+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true)>end)throw Error('This MXL archive is damaged.');
    const name=new TextDecoder().decode(new Uint8Array(buffer,cursor+46,nameLength));
    if (/^[/\\]|^[a-z]:|(?:^|[/\\])\.\.(?:[/\\]|$)/i.test(name))throw Error("This archive contains unsafe file paths.");
    const size=view.getUint32(cursor+24,true);total+=size;
    if(size>MAX_XML_BYTES||total>40*1024*1024||view.getUint16(cursor+8,true)&1)throw Error('This archive is too large or encrypted.');
    cursor+=46+view.getUint16(cursor+28,true)+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true);
  }
}
export function inflateBounded(entry,limit=MAX_XML_BYTES) {
  return new Promise((resolve,reject)=>{let size=0,failed=false;const chunks=[];const stream=entry.internalStream('uint8array');
    stream.on('data',chunk=>{size+=chunk.length;if(size>limit){failed=true;stream.pause();reject(Error('The uncompressed score exceeds its size limit.'));}else chunks.push(chunk);});
    stream.on('error',reject);stream.on('end',()=>{if(failed)return;const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}resolve(new TextDecoder().decode(bytes));});stream.resume();
  });
}
