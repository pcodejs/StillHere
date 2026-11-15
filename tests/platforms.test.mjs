import {test} from 'node:test';
import assert from 'node:assert/strict';
import {platformFromUrl, platformRecords} from '../src/core/platforms.js';

test('Facebook tabs are recognized while non-platform origins remain excluded', () => {
  for (const url of ['https://web.facebook.com/', 'https://web.facebook.com/messages/t/123', 'https://www.facebook.com/', 'https://www.messenger.com/', 'https://www.messenger.com/e2ee/t/123', 'https://www.facebook.com/messages/t/123']) {
    assert.equal(platformFromUrl(url), 'facebook');
  }
  for (const url of ['https://web.facebook.com.evil.test/', 'http://web.facebook.com/', 'https://www.facebook.com.evil.test/', 'https://www.messenger.com.evil.test/', 'http://www.messenger.com/', 'invalid']) {
    assert.equal(platformFromUrl(url), null);
  }
  assert.equal(platformFromUrl('https://chat.zalo.me/'), 'zalo');
});

test('legacy Zalo messages stay out of the Facebook menu even when message IDs overlap', () => {
  const oldZalo = {id: '123', text: 'Legacy Zalo'};
  const facebook = {id: '123', platform: 'facebook', text: 'Facebook'};
  const unknown = {id: '123', platform: 'unknown'};
  assert.deepEqual(platformRecords([oldZalo, facebook, unknown], 'zalo'), [oldZalo]);
  assert.deepEqual(platformRecords([oldZalo, facebook, unknown], 'facebook'), [facebook]);
  assert.deepEqual(platformRecords([oldZalo, facebook], 'unknown'), []);
});

import {applyEvents, normalizeEvent} from '../src/core/model.js';
test('a Facebook recall cannot alter a legacy Zalo message with matching server and client IDs', () => {
  const settings = {consent:true, enabled:true, retentionDays:30};
  const now = Date.now();
  const common = {conversationId:'thread', messageId:'message', clientId:'client', kind:'text'};
  const old = {id:'legacy', ...common, text:'Zalo original', firstSeen:now, hasOriginal:true, recalledAt:null};
  let records = applyEvents([old], [{...common, platform:'facebook', event:'snapshot', text:'Facebook original'}], settings, now);
  records = applyEvents(records, [{...common, platform:'facebook', event:'recall'}], settings, now+1);
  assert.equal(records.length, 2);
  assert.equal(records.find(r=>r.id==='legacy').recalledAt, null);
  const facebook = records.find(r=>r.platform==='facebook');
  assert.equal(facebook.text, 'Facebook original');
  assert.equal(facebook.recalledAt, now+1);
  assert.equal(normalizeEvent({...common,event:'snapshot',text:'x',platform:'unknown'}), null);
});
