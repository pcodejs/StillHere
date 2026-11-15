import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {decodeBase64} from '../src/core/base64.js';
test('bounded base64 decode preserves bytes across block boundaries and padding',()=>{
 for(const size of [0,1,2,3,24575,24576,24577,1000000]){
  const bytes=randomBytes(size),encoded=bytes.toString('base64');
  assert.deepEqual(Buffer.from(decodeBase64(encoded)),bytes);
  assert.deepEqual(Buffer.from(decodeBase64(encoded.replace(/=+$/,''))),bytes);
 }
 for(const invalid of ['a','a===','ab=c','a b!'])assert.throws(()=>decodeBase64(invalid));
});
