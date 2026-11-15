import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadResource} from '../src/core/assets.js';

test('Facebook downloader validates the final CDN and grant after a redirect',async()=>{
  const originalFetch=globalThis.fetch;
  const originalChrome=globalThis.chrome;
  let destination='https://video.fixture.fbcdn.net/video.mp4';
  let grant=true;
  globalThis.chrome={permissions:{contains:async({origins})=>!origins[0].includes('video.fixture') || grant}};
  globalThis.fetch=async(source,options)=>{
    assert.equal(options.credentials,'omit');
    assert.equal(options.referrerPolicy,'no-referrer');
    assert.equal(options.redirect,'follow');
    const response=new Response(new Uint8Array([1,2,3]));
    Object.defineProperty(response,'url',{value:destination});
    return response;
  };
  try {
    assert.deepEqual(await downloadResource('https://scontent.fixture.fbcdn.net/video'),new Uint8Array([1,2,3]));
    grant=false;
    await assert.rejects(downloadResource('https://scontent.fixture.fbcdn.net/video'),/Unapproved/);
    grant=true;
    for(const url of ['https://outside.test/video','https://photo.zadn.vn/video','http://video.fixture.fbcdn.net/video','https://cdn.fbsbx.com/unapproved']){
      destination=url;
      await assert.rejects(downloadResource('https://scontent.fixture.fbcdn.net/video'),/Unapproved/);
    }
  } finally {
    globalThis.fetch=originalFetch;
    globalThis.chrome=originalChrome;
  }
});

test('Zalo video redirect requires a supported final host and its grant',async()=>{
  const originalFetch=globalThis.fetch;
  const originalChrome=globalThis.chrome;
  let destination='https://file-stal-2-te-vnso-pt-65.flchat.vn/gr/video';
  let grant=true;
  globalThis.chrome={permissions:{contains:async({origins})=>!origins[0].includes('flchat.vn')||grant}};
  globalThis.fetch=async(source,options)=>{
    assert.equal(options.credentials,'omit');
    assert.equal(options.referrerPolicy,'no-referrer');
    assert.equal(options.redirect,'follow');
    const response=new Response(new Uint8Array([1,2,3]));
    Object.defineProperty(response,'url',{value:destination});
    return response;
  };
  try {
    const source='https://file-stal-2.dlfl.vn/gr/video';
    assert.deepEqual(await downloadResource(source),new Uint8Array([1,2,3]));
    grant=false;
    await assert.rejects(downloadResource(source),/Unapproved/);
    grant=true;
    for(const url of ['https://outside.test/video','https://scontent.test.fbcdn.net/video','https://flchat.vn/video','https://other.flchat.vn/video']){
      destination=url;
      await assert.rejects(downloadResource(source),/Unapproved/);
    }
  } finally {
    globalThis.fetch=originalFetch;
    globalThis.chrome=originalChrome;
  }
});
