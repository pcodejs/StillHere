// Hashes partition keys; this is not encryption or proof of page identity.
export async function accountScope(platform,account,unknownToken){
 const identity=account?.id?['id',account.id]:account?.name?['name',account.name]:['unknown',unknownToken];
 if(!['zalo','facebook'].includes(platform)||!identity[1])throw Error('Missing account scope');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([platform,...identity])));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
