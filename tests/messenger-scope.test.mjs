import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMessengerScope} from '../src/core/messenger-scope.js';
test('retained message DOM cannot be reassigned after SPA conversation navigation',()=>{
 const accepts=createMessengerScope();let id='one';const node={getAttribute:()=>id};
 assert.equal(accepts(node,{conversationId:'a'}),true);
 assert.equal(accepts(node,{conversationId:'b'}),false);
 assert.equal(accepts(node,{conversationId:'a'}),true);
 id='two';assert.equal(accepts(node,{conversationId:'b'}),true);
 assert.equal(accepts({getAttribute:()=>id},{conversationId:'c'}),true);
 assert.equal(accepts(node,null),false);
});
