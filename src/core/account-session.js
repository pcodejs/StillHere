// Missing identity in a later scan must not erase the last known account ID.
export function accountSession(previous,health) {
  const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,'').slice(0,max):'';
  const id=clean(health?.accountId,160),name=clean(health?.accountName,100);
  const comparableIds=!!(id&&previous?.id);
  const changed=previous && (comparableIds?id!==previous.id:!!(name&&previous.name&&name!==previous.name));
  if(health?.loggedOut===true || health?.accountChanging===true || changed)return {locked:true,pendingAccount:health?.loggedOut===true||health?.accountChanging===true?null:(id||name?{id,name}:null)};
  return {locked:false,account:id||name?{id:id||previous?.id||'',name:name||previous?.name||''}:null};
}

// Diagnostic categories only: never persist account names or identifiers here.
export function accountChangeReason(previous, health) {
 if (health?.loggedOut === true) return 'signed-out';
 if (health?.accountChanging === true) return 'switching';
 if (!accountSession(previous, health).locked) return null;
 return previous?.id && health?.accountId ? 'id-changed' : 'name-changed';
}
