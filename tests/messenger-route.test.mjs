import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messengerConversation} from '../src/core/messenger-route.js';
test('selected Messenger conversation retains exact numeric ID without number precision loss', () => {
  const id='9999999999999999999';
  for (const prefix of ['https://web.facebook.com/messages/t/','https://web.facebook.com/messages/e2ee/t/','https://www.messenger.com/t/','https://www.messenger.com/e2ee/t/','https://www.facebook.com/messages/t/','https://www.facebook.com/messages/e2ee/t/']) {
    assert.equal(messengerConversation(prefix+id+'/?ref=test').conversationId,id);
  }
  assert.equal(messengerConversation('https://www.messenger.com/e2ee/t/123/').encryptedRoute,true);
});
test('inbox, arbitrary routes, unsupported hosts and non-HTTPS URLs do not become conversations', () => {
  for (const url of ['https://web.facebook.com/','https://web.facebook.com/t/123/','https://web.facebook.com.evil.test/messages/t/123/','https://www.messenger.com/','https://www.messenger.com/t/','https://www.messenger.com/requests/','https://www.facebook.com/t/123/','https://www.facebook.com/messages/t/123/other','https://www.messenger.com.evil.test/t/123/','http://www.messenger.com/t/123/']) assert.equal(messengerConversation(url),null);
});
