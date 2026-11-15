import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourceSource,normalizeAttachments,sniffResource,resourceId} from '../src/core/resources.js';
import {eventFromModel,readProfile} from '../src/core/adapter.js';

test('resource allowlist covers both Zalo CDN generations and rejects other origins',()=>{
  for(const url of ['https://s120-ava-talk.zadn.vn/a.jpg','https://avatar.talk.zdn.vn/a.jpg','https://file-stal-21.dlfl.vn/video.mp4','https://api.zalo.me/api/emoticon/sticker/webpc?eid=12'])assert.equal(resourceSource(url),url);
  for(const url of ['https://zadn.vn.attacker.test/a','https://api.zalo.me/login','https://user:pass@photo.zadn.vn/a','http://photo.zadn.vn/a','e2ee://photo.zadn.vn/a','https://photo.zadn.vn/a#key','file:///a','javascript:alert(1)'])assert.equal(resourceSource(url),'');
  assert.equal(resourceSource('blob:https://chat.zalo.me/abc-123'),'blob:https://chat.zalo.me/abc-123');
  assert.equal(resourceSource('blob:https://attacker.test/abc-123'),'');
  assert.equal(resourceSource('blob:https://chat.zalo.me/abc-123',false),'');
  assert.equal(resourceSource('https://file-stal-2.flchat.vn/gr/video',false,'zalo'),'https://file-stal-2.flchat.vn/gr/video');
  assert.equal(resourceSource('https://file-stal-2-te-vnso-pt-65.flchat.vn/gr/video',false,'zalo'),'https://file-stal-2-te-vnso-pt-65.flchat.vn/gr/video');
  for(const url of ['https://flchat.vn/gr/video','https://other.flchat.vn/gr/video','https://file-stal-2.flchat.vn.evil.test/gr/video'])assert.equal(resourceSource(url),'');
  assert.equal(resourceSource('https://file-stal-2.flchat.vn/gr/video',false,'facebook'),'');
});

test('sticker, album and video models retain bounded safe resource references',()=>{
  const base={msgId:'1',cliMsgId:'2',toUid:'g3',fromUid:'42',dName:'Lan'};
  const sticker=eventFromModel({...base,msgType:4,message:{id:7,stickerWebpUrl:'https://sticker.zadn.vn/a.webp'}});
  assert.equal(sticker.kind,'sticker');assert.equal(sticker.attachments[0].source,'https://sticker.zadn.vn/a.webp');
  const image=eventFromModel({...base,msgType:2503,message:[{normalUrl:'https://photo.zadn.vn/a.jpg'},{normalUrl:'https://photo.zadn.vn/b.jpg'}]});
  assert.equal(image.attachments.length,2);
  const gif=eventFromModel({...base,msgType:7,message:{oriUrl:'https://photo.zadn.vn/animated.gif'}});
  assert.equal(gif.kind,'gif');assert.equal(gif.attachments[0].kind,'gif');
  const video=eventFromModel({...base,msgType:18,message:{params:JSON.stringify({videoUrl:'https://video.zadn.vn/a.mp4'})}});
  assert.equal(video.attachments[0].kind,'video');
  const videoFile=eventFromModel({...base,msgType:19,message:{title:'clip.mp4',href:'https://video.zadn.vn/clip.mp4'}});
  assert.equal(videoFile.kind,'video');assert.equal(videoFile.attachments[0].kind,'video');
  const preview=eventFromModel({...base,msgType:18,message:{thumbUrl:'https://photo.zadn.vn/a.jpg'}});
  assert.equal(preview.attachments[0].previewOnly,true);assert.equal(preview.attachments[0].kind,'image');
  assert.equal(normalizeAttachments([{source:'https://photo.zadn.vn/a',kind:'image'},{source:'https://photo.zadn.vn/a',kind:'image'}]).length,1);
});

test('profile traversal merges late avatar information for the same exact identity',()=>{
  const el={__reactFiber$fixture:{memoizedProps:{user:{userId:'42',name:'Lan'}},return:{memoizedProps:{user:{userId:'42',avatar:'https://avatar.talk.zdn.vn/lan.jpg'}}}},parentElement:null};
  assert.deepEqual(readProfile(el,'42'),{name:'Lan',avatar:'https://avatar.talk.zdn.vn/lan.jpg',type:undefined});
  assert.equal(readProfile(el,'43'),null);
});

test('resource type sniffing rejects executable or ciphertext content',async()=>{
  assert.equal(sniffResource(Uint8Array.from([137,80,78,71,13,10,26,10,0])),'image/png');
  assert.equal(sniffResource(new TextEncoder().encode('GIF89a123456')),'image/gif');
  assert.equal(sniffResource(new TextEncoder().encode('RIFF1234WEBP1234')),'image/webp');
  assert.equal(sniffResource(new TextEncoder().encode('1234ftypisom1234')),'video/mp4');
  for(const text of ['<svg onload="alert(1)">','<!doctype html>','encrypted-content'])assert.equal(sniffResource(new TextEncoder().encode(text)),'');
  assert.equal(await resourceId('https://photo.zadn.vn/a'),await resourceId('https://photo.zadn.vn/a'));
  assert.notEqual(await resourceId('https://photo.zadn.vn/a'),await resourceId('https://photo.zadn.vn/b'));
});

test('Facebook blob origins are exact and platform-scoped',()=>{
 for(const host of ['facebook.com','www.facebook.com','web.facebook.com']){const value=`blob:https://${host}/abc-123`;assert.equal(resourceSource(value,true,'facebook'),value);assert.equal(resourceSource(value,true,'zalo'),'');assert.equal(resourceSource(value,false,'facebook'),'');}
 assert.equal(resourceSource('blob:https://web.facebook.com.evil.test/abc-123'), '');
});
