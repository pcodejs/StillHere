import {resourceSource,MAX_RESOURCE_BYTES,sniffResource} from './resources.js';

// Read only a blob already rendered by this document, never remote URLs or keys.
export async function renderedBlob(source, origin, isCurrent, fetcher=fetch) {
  if(!resourceSource(source,true,'facebook') || !source.startsWith(`blob:${origin}/`) || !isCurrent())return null;
  const response=await fetcher(source,{credentials:'omit',signal:AbortSignal.timeout(15000)});
  if(!response.ok || !response.body || Number(response.headers.get('content-length'))>MAX_RESOURCE_BYTES)return null;
  const reader=response.body.getReader();const chunks=[];let size=0;
  try {
    while(true) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.length;
      if(size>MAX_RESOURCE_BYTES || !isCurrent())return null;
      chunks.push(value);
    }
  } finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(!isCurrent() || !sniffResource(bytes))return null;
  let binary='';
  for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
  return btoa(binary);
}
