// Decode in bounded chunks; Uint8Array.from(string, callback) materializes
// expensive intermediate iteration state for large encrypted media envelopes.
export function decodeBase64(value){
 if(typeof value!=='string'||value.length%4===1||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Invalid base64');
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;
 const output=new Uint8Array(Math.floor(value.length*3/4)-padding);
 let offset=0;
 for(let start=0;start<value.length;start+=32768){
  const part=atob(value.slice(start,start+32768));
  for(let i=0;i<part.length;i++)output[offset++]=part.charCodeAt(i);
 }
 return output;
}
