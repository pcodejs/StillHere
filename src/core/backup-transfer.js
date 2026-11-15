// Only serialized encrypted backups belong here. Transfers never persist to disk.
export const BACKUP_CHUNK_SIZE=512*1024;
export function createBackupTransfers({maxBytes=200*1024*1024,ttl=5*60*1000,now=Date.now,id=()=>crypto.randomUUID()}={}){
 const sessions=new Map();
 function sweep(){for(const [key,value] of sessions)if(now()-value.updated>=ttl)sessions.delete(key);}
 function get(token,owner){sweep();const value=sessions.get(token);if(!value||value.owner!==owner)throw Error('Backup transfer expired');return value;}
 function begin(owner,size){
  sweep();if(typeof owner!=='string'||!owner||!Number.isSafeInteger(size)||size<1||size>maxBytes)throw Error('Invalid backup size');
  // One bounded transfer globally avoids multiple pages exhausting memory.
  if(sessions.size)throw Error('Backup transfer already active');
  const token=id();sessions.set(token,{owner,size,received:0,parts:[],updated:now()});return token;
 }
 return {
  begin,
  offer(owner,text){
   if(typeof text!=='string')throw Error('Invalid backup');
   const token=begin(owner,text.length),value=get(token,owner);
   value.output=text;return {token,size:text.length};
  },
  read(token,owner,offset){
   const value=get(token,owner);
   if(typeof value.output!=='string'||!Number.isSafeInteger(offset)||offset<0||offset>=value.size)throw Error('Invalid backup offset');
   value.updated=now();return value.output.slice(offset,offset+BACKUP_CHUNK_SIZE);
  },
  append(token,owner,index,part){
   const value=get(token,owner);
   if(value.output!==undefined||index!==value.parts.length||typeof part!=='string'||!part.length||part.length>BACKUP_CHUNK_SIZE||value.received+part.length>value.size)throw Error('Invalid backup chunk');
   value.parts.push(part);value.received+=part.length;value.updated=now();return value.received;
  },
  finish(token,owner){const value=get(token,owner);if(value.output!==undefined||value.received!==value.size)throw Error('Incomplete backup transfer');sessions.delete(token);return value.parts.join('');},
  cancel(token,owner){get(token,owner);sessions.delete(token);},
  clear(){sessions.clear();}
 };
}
