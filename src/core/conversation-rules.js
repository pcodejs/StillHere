export function safeRules(value){
 const mode=['all','include','exclude'].includes(value?.mode)?value.mode:'all';
 const entries=Array.isArray(value?.entries)?value.entries:[];
 if(entries.length>500)throw Error('Too many conversation rules');
 return {mode,entries:entries.filter(e=>e&&['zalo','facebook'].includes(e.platform)&&typeof e.conversationId==='string'&&e.conversationId.length>0&&e.conversationId.length<=160).map(e=>({platform:e.platform,conversationId:e.conversationId,...(typeof e.accountScope==='string'&&/^[a-f0-9]{64}$/.test(e.accountScope)?{accountScope:e.accountScope}:{})}))};
}
export function conversationAllowed(settings,event){
 const rules=settings?.conversationRules;if(!rules||rules.mode==='all')return true;
 const matched=rules.entries?.some(e=>e.platform===(event.platform||'zalo')&&e.conversationId===event.conversationId&&(e.accountScope?e.accountScope===event.accountScope:rules.mode==='exclude'||!event.accountScope));
 return rules.mode==='include'?!!matched:!matched;
}
