import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderedBlob} from '../src/core/rendered-blob.js';
const origin='https://www.messenger.com';const source=`blob:${origin}/fixture`;
test('rendered blob only reads same-origin passive media while capture is current',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response(new Uint8Array([255,216,255,1]));};
 assert.equal(await renderedBlob(source,origin,()=>true,fetcher),'/9j/AQ==');
 for(const url of ['https://scontent.fbcdn.net/a','blob:https://www.facebook.com/fixture'])assert.equal(await renderedBlob(url,origin,()=>true,fetcher),null);
 assert.equal(await renderedBlob(source,origin,()=>false,fetcher),null);assert.equal(calls,1);
 assert.equal(await renderedBlob(source,origin,()=>true,async()=>new Response('<script>bad</script>')),null);
});
test('pause during blob read prevents forwarding bytes',async()=>{
 let current=true;
 const fetcher=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([255,216,255]));current=false;c.close();}}));
 assert.equal(await renderedBlob(source,origin,()=>current,fetcher),null);
});
