import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messengerMedia} from '../src/core/messenger-media.js';
const image=(src,extra={})=>({src,width:200,height:200,alt:'Photo',...extra});
const node=(images=[],videos=[],stickers=[])=>({querySelectorAll:s=>s==='img'?images:s==='video'?videos:stickers});
const source='https://scontent.test.fbcdn.net/photo.jpg';
test('observed internal media viewer retains CDN photos without allowing external previews',()=>{
 const linked=href=>image(source,{closest:()=>({href})});
 assert.equal(messengerMedia(node([linked('https://www.facebook.com/messenger_media/?attachment_id=123')])).length,1);
 for(const href of ['https://external.test/messenger_media/','https://www.facebook.com/article/','https://www.facebook.com.evil.test/messenger_media/'])
  assert.equal(messengerMedia(node([linked(href)])).length,0);
 assert.equal(messengerMedia(node([image('https://external.test/photo',{closest:()=>({href:'https://www.facebook.com/messenger_media/'})})])).length,0);
});
test('rendered media excludes avatars, emoji, external previews and unapproved origins',()=>{
 const result=messengerMedia(node([image(source),image(source,{width:28,height:28}),image(source,{closest:()=>({href:'https://external.test/article'})}),image('https://external.test/image')]));
 assert.deepEqual(result,[{source,kind:'image',previewOnly:false}]);
});
test('observed semantic CSS stickers are captured without arbitrary backgrounds',()=>{
 const sticker=(label,url)=>({getAttribute:()=>label,clientWidth:96,clientHeight:96,ownerDocument:{defaultView:{getComputedStyle:()=>({backgroundImage:`url("${url}")`})}}});
 assert.deepEqual(messengerMedia(node([],[],[sticker('Cheeky text sticker',source)])),[{source,kind:'sticker',previewOnly:false}]);
 assert.deepEqual(messengerMedia(node([],[],[sticker('Profile',source),sticker('sticker','https://external.test/a.png')])),[]);
});
test('GIF and sticker labels are preserved and video poster is explicitly preview only',()=>{
 assert.equal(messengerMedia(node([image(source,{alt:'Nhãn dán'})]))[0].kind,'sticker');
 assert.equal(messengerMedia(node([image(source,{alt:'GIF'})]))[0].kind,'gif');
 assert.deepEqual(messengerMedia(node([],[{poster:source}])),[{source,kind:'image',previewOnly:true}]);
 const blob='blob:https://www.messenger.com/video-test';
 assert.deepEqual(messengerMedia(node([],[{currentSrc:blob,poster:source}])),[{source:blob,kind:'video',previewOnly:false}]);
});
