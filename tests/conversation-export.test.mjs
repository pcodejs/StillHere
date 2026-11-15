import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conversationExport} from '../src/core/conversation-export.js';
test('conversation exports isolate platform and conversation and escape hostile HTML',()=>{
 const r={platform:'zalo',conversationId:'x',conversationName:'<script>alert(1)</script>',sender:'<img src=x onerror=alert(1)>',text:'</p><script>alert(2)</script>',hasOriginal:true,kind:'text',firstSeen:1000,recalledAt:2000};
 const records=[r,{...r,platform:'facebook'},{...r,conversationId:'y'}];
 const json=JSON.parse(conversationExport(records,'zalo','x').content);
 assert.equal(json.messages.length,1);assert.equal(json.messages[0].text,r.text);
 const html=conversationExport(records,'zalo','x','html').content;
 assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;script&gt;'));assert(html.includes("default-src 'none'"));
 assert.throws(()=>conversationExport(records,'zalo','missing'));
});

test('conversation JSON imports into local archive without password and preserves scope',async()=>{
 const {readConversationJSON,mergeArchive}=await import('../src/core/archive-import.js');
 const row={platform:'facebook',conversationId:'thread',conversationName:'QA',conversationType:'group',messageId:'message',sender:'QA',text:'Original',hasOriginal:true,isSelf:true,kind:'text',firstSeen:1000,recalledAt:2000};
 const file=JSON.parse(conversationExport([row],'facebook','thread').content);
 const imported=mergeArchive([],readConversationJSON(file),3000);
 assert.equal(imported[0].text,'Original');assert.equal(imported[0].platform,'facebook');assert.equal(imported[0].isSelf,true);assert.equal(imported[0].conversationType,'group');
 assert.throws(()=>readConversationJSON({...file,platform:'evil'}));
});
