import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyEvents,DEFAULT_SETTINGS} from '../src/core/model.js';
const settings={...DEFAULT_SETTINGS,consent:true,enabled:true};
const base={platform:'facebook',event:'snapshot',conversationId:'1',messageId:'v1',kind:'video',text:'Video',source:'dom'};
test('late poster-only render cannot overwrite the retained original video',()=>{
 const original={source:'https://video.test.fbcdn.net/original.mp4',kind:'video'};
 let records=applyEvents([], [{...base,attachments:[original]}],settings);
 records=applyEvents(records,[{...base,kind:'image',attachments:[{source:'https://scontent.test.fbcdn.net/poster.jpg',kind:'image',previewOnly:true}]}],settings);
 assert.equal(records[0].kind,'video');assert.equal(records[0].attachments[0].source,original.source);
 records=applyEvents(records,[{...base,event:'recall',attachments:[]}],settings);
 assert.equal(records[0].attachments[0].source,original.source);assert.ok(records[0].recalledAt);
});
test('a real video can replace an earlier poster placeholder',()=>{
 let records=applyEvents([],[{...base,kind:'image',attachments:[{source:'https://scontent.test.fbcdn.net/poster.jpg',kind:'image',previewOnly:true}]}],settings);
 records=applyEvents(records,[{...base,attachments:[{source:'blob:https://www.messenger.com/video',kind:'video'}]}],settings);
 assert.equal(records[0].kind,'video');assert.equal(records[0].attachments[0].previewOnly,false);
});
