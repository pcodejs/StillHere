export function annotateRecord(records,id,patch){
 const index=records.findIndex(r=>r.id===id);
 if(index<0)throw Error('Message unavailable');
 if(patch.note!==undefined&&(typeof patch.note!=='string'||patch.note.length>2000))throw Error('Invalid note');
 if(patch.pinned!==undefined&&typeof patch.pinned!=='boolean')throw Error('Invalid pin');
 const next=records.slice();
 next[index]={...records[index],...(patch.note===undefined?{}:{note:patch.note}),...(patch.pinned===undefined?{}:{pinned:patch.pinned})};
 return next;
}
