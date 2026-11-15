import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTabConnector} from '../src/core/tab-connection.js';
function fixture(ready=false){const calls=[];return {calls,api:{tabs:{sendMessage:async()=>{if(ready)return {ready:true};throw Error('no receiver');}},scripting:{executeScript:async args=>{calls.push(args);}}}};}
test('reattaches existing Facebook and Messenger tabs without reloading',async()=>{
 for(const url of ['https://www.facebook.com/','https://www.messenger.com/']){
 const f=fixture();await createTabConnector(f.api).connect({id:1,url});assert.deepEqual(f.calls.map(c=>c.files),[['messenger-content.js']]);}
});
test('Zalo bridge is installed before isolated reader; concurrent requests deduplicated',async()=>{
 const f=fixture(),c=createTabConnector(f.api),tab={id:1,url:'https://chat.zalo.me/'};
 await Promise.all([c.connect(tab),c.connect(tab)]);
 assert.deepEqual(f.calls.map(c=>[c.world,c.files[0]]),[['MAIN','page-observer.js'],['ISOLATED','content.js']]);
});
test('healthy readers, discarded tabs and unsupported origins are not reinjected',async()=>{
 const f=fixture(true),c=createTabConnector(f.api);await c.connect({id:1,url:'https://www.facebook.com/'});assert.equal(f.calls.length,0);
 const g=fixture(),d=createTabConnector(g.api);await d.connect({id:1,url:'https://www.facebook.com/',discarded:true});await d.connect({id:2,url:'https://evil.test/'});assert.equal(g.calls.length,0);
});

test('sweep finds already-open web.facebook.com and connects without navigation',async()=>{
 const f=fixture();let queried;
 f.api.tabs.query=async query=>{queried=query.url;return queried.includes('https://web.facebook.com/*')?[{id:42,url:'https://web.facebook.com/'}]:[];};
 await createTabConnector(f.api).sweep();
 assert(queried.includes('https://web.facebook.com/*'));
 assert(!queried.some(origin=>origin.includes('fbcdn')));
 assert.deepEqual(f.calls.map(call=>[call.target.tabId,call.files]),[[42,['messenger-content.js']]]);
});
