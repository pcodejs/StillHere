import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourceSource,normalizeAttachments,resourcePermissions,resourcePermissionDetails} from '../src/core/resources.js';
import {normalizeEvent} from '../src/core/model.js';
test('Facebook resources are bounded and isolated from Zalo event resources',()=>{
 const source='https://scontent.fsgn2-11.fna.fbcdn.net/image.jpg?token=fixture';
 assert.equal(resourceSource(source,true,'facebook'),source);
 assert.equal(resourceSource(source,true,'zalo'),'');
 for(const bad of ['https://fbcdn.net.evil.test/a','https://evilfbcdn.net/a','https://user:pass@scontent.fbcdn.net/a','http://scontent.fbcdn.net/a','https://scontent.fbcdn.net:999/a','https://scontent.fbcdn.net/a#x'])assert.equal(resourceSource(bad,true,'facebook'),'');
 assert.equal(normalizeAttachments([{source,kind:'image'}],'facebook').length,1);
 assert.equal(normalizeAttachments([{source,kind:'image'}],'zalo').length,0);
 const event=normalizeEvent({platform:'facebook',conversationId:'1',messageId:'2',event:'snapshot',text:'a',senderAvatar:source,attachments:[{source,kind:'image'}]});
 assert.equal(event.senderAvatar,source);assert.equal(event.attachments.length,1);
 assert.equal(resourceSource('blob:https://www.messenger.com/fixture-id',true,'facebook'),'blob:https://www.messenger.com/fixture-id');
 assert.equal(resourceSource('blob:https://chat.zalo.me/fixture-id',true,'facebook'),'');
});
test('an existing Zalo CDN grant remains valid without granting Facebook access',async()=>{
 const zaloOnly=await resourcePermissions(async({origins})=>origins.every(origin=>/zadn|zdn|dlfl|zalo\.me/.test(origin)));
 assert.deepEqual(zaloOnly,{zalo:true,facebook:false});
 assert.equal(Object.values(zaloOnly).some(Boolean),true);
 const facebookOnly=await resourcePermissions(async({origins})=>origins.every(origin=>origin.includes('fbcdn.net')));
 assert.deepEqual(facebookOnly,{zalo:false,facebook:true});
 assert.deepEqual(await resourcePermissions(async()=>false),{zalo:false,facebook:false});
});
test('observed Facebook GIF CDN is bounded and partial upgrade grants keep existing files enabled',async()=>{
 const source='https://cdn.fbsbx.com/v/t59.2708-21/fixture.gif?token=fixture';
 assert.equal(resourceSource(source,true,'facebook'),source);
 assert.equal(resourceSource(source,true,'zalo'),'');
 for(const url of ['https://cdn.fbsbx.com/other','https://other.fbsbx.com/v/t59.2708-21/a.gif','https://cdn.fbsbx.com.evil.test/v/t59.2708-21/a.gif'])assert.equal(resourceSource(url,true,'facebook'),'');
 const grants=await resourcePermissionDetails(async({origins})=>origins[0]==='https://*.fbcdn.net/*');
 assert.deepEqual(grants.facebook,{available:true,complete:false});
});
