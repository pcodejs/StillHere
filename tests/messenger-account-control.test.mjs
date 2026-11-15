import test from 'node:test';
import assert from 'node:assert/strict';
import {messengerAccount} from '../src/core/messenger-account.js';
function documentWith(labels){return {querySelectorAll(selector){if(selector.includes('dialog'))return [];return labels.map(label=>({getAttribute:()=>label,querySelectorAll:()=>[]}));}};}
test('explicit own-profile control identifies account without opening menu',()=>{
 for(const suffix of ['Cài đặt, trợ giúp và hơn thế nữa','Settings, help and more']) {
 const doc=documentWith(['Minh An @qa-example - '+suffix]);
 assert.deepEqual(messengerAccount(doc),{accountName:'Minh An'});
 assert.deepEqual(messengerAccount(documentWith(['Minh An @qa-example - '+suffix])),messengerAccount(doc));
 }
});
test('ambiguous or ordinary chat controls never assign an account',()=>{
 assert.deepEqual(messengerAccount(documentWith(['Conversation with Minh An'])),{});
 assert.deepEqual(messengerAccount(documentWith(['A @a - Settings, help and more','B @b - Settings, help and more'])),{});
});
