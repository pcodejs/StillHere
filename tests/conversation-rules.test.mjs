import {test} from 'node:test';import assert from 'node:assert/strict';
import {conversationAllowed,safeRules} from '../src/core/conversation-rules.js';
import {applyEvents} from '../src/core/model.js';
test('rules isolate platforms, handle empty include and do not erase existing records',()=>{
 const event={event:'snapshot',platform:'zalo',conversationId:'c',messageId:'m',kind:'text',text:'private'};
 const settings={consent:true,enabled:true,conversationRules:safeRules({mode:'include',entries:[]})};
 assert.equal(applyEvents([], [event],settings).length,0);
 settings.conversationRules=safeRules({mode:'exclude',entries:[{platform:'zalo',conversationId:'c'}]});
 assert.equal(conversationAllowed(settings,event),false);assert.equal(conversationAllowed(settings,{...event,platform:'facebook'}),true);
 const existing=applyEvents([],[event],{consent:true,enabled:true});
 assert.equal(applyEvents(existing,[{...event,event:'recall'}],settings)[0].recalledAt,null);
 assert.equal(applyEvents(existing,[],settings).length,1);
});
test('scoped rules never authorize another account; legacy exclusions remain protective',()=>{
 const a='a'.repeat(64),b='b'.repeat(64),event={platform:'zalo',conversationId:'c',accountScope:a};
 const settings={conversationRules:safeRules({mode:'include',entries:[{platform:'zalo',conversationId:'c',accountScope:a}]})};
 assert.equal(conversationAllowed(settings,event),true);
 assert.equal(conversationAllowed(settings,{...event,accountScope:b}),false);
 assert.equal(conversationAllowed(settings,{...event,accountScope:''}),false);
 settings.conversationRules=safeRules({mode:'include',entries:[{platform:'zalo',conversationId:'c'}]});
 assert.equal(conversationAllowed(settings,event),false);
 settings.conversationRules.mode='exclude';
 assert.equal(conversationAllowed(settings,event),false);
});
