import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportPortable,importPortable,importPortableBundle} from '../src/core/vault.js';

test('portable media bundle encrypts sources and bytes, preserves legacy import and rejects tampering',async()=>{
 const records=[{text:'private fixture',messageId:'one'}];
 const media=[{source:'https://s120-ava-talk.zadn.vn/private.png',data:'cHJpdmF0ZSBtZWRpYQ=='}];
 const file=await exportPortable(records,'backup-pass',media);
 assert.ok(!JSON.stringify(file).includes('private'));
 assert.ok(!JSON.stringify(file).includes(media[0].data));
 assert.deepEqual(await importPortableBundle(file,'backup-pass'),{records,media});
 assert.deepEqual(await importPortable(file,'backup-pass'),records);
 const legacy=await exportPortable(records,'backup-pass');
 assert.deepEqual(await importPortableBundle(legacy,'backup-pass'),{records,media:[]});
 await assert.rejects(()=>importPortableBundle(file,'wrong-pass'));
 const changed=structuredClone(file);changed.envelope.data=(changed.envelope.data[0]==='A'?'B':'A')+changed.envelope.data.slice(1);
 await assert.rejects(()=>importPortableBundle(changed,'backup-pass'));
});
