export function assetURL(path,scope) {const url=new URL(path,scope);url.search='';url.hash='';if(url.origin!==new URL(scope).origin||!url.pathname.startsWith(new URL(scope).pathname)) throw Error('Asset outside application scope');return url.href;}
export async function digest(bytes) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function verified(response,asset) {if(!response?.ok)return false;const bytes=await response.clone().arrayBuffer();return bytes.byteLength===asset.bytes&&await digest(bytes)===asset.sha256;}
export async function byteRange(response,header) {
  if(!header)return response;
  const bytes=await response.arrayBuffer(),size=bytes.byteLength;const match=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  const from=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  const to=match[1]?(match[2]?Math.min(size-1,Number(match[2])):size-1):size-1;
  if(from>to||from>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  const headers=new Headers(response.headers);headers.set('Content-Range',`bytes ${from}-${to}/${size}`);headers.set('Content-Length',to-from+1);headers.set('Accept-Ranges','bytes');
  return new Response(bytes.slice(from,to+1),{status:206,headers});
}
