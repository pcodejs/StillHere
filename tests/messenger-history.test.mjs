import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMessengerHistory} from '../src/core/messenger-history.js';
import {applyEvents, DEFAULT_SETTINGS} from '../src/core/model.js';

const settings = {...DEFAULT_SETTINGS, consent: true, enabled: true};
const snapshot = (messageId, messageFingerprint = '16:05\0You') => ({
  platform: 'facebook', conversationId: 'thread', event: 'snapshot',
  messageId, messageFingerprint, sender: 'You', isSelf: true,
  text: 'Original ' + messageId, kind: 'text', source: 'dom',
});
const recall = (messageId, fingerprint) => ({...snapshot(messageId, fingerprint), event: 'recall', text: '', kind: 'other'});

test('a replaced E2EE node retains its original through later scans and page reload', () => {
  const history = createMessengerHistory();
  const before = [snapshot('anchor', '16:00\0You'), snapshot('old')];
  const now = Date.now();
  let records = applyEvents([], history.reconcile(before, 'thread', now), settings, now);
  const replacement = [before[0], recall('new')];
  let events = history.reconcile(replacement, 'thread', now + 1);
  assert.equal(events[1].replacesMessageId, 'old');
  records = applyEvents(records, events, settings, now + 1);
  events = history.reconcile(replacement, 'thread', now + 2);
  records = applyEvents(records, events, settings, now + 2);
  // A newly loaded collector only knows the new Facebook ID.
  records = applyEvents(records, replacement, settings, now + 3);
  assert.equal(records.length, 2);
  assert.equal(records.find(item => item.messageId === 'old').text, 'Original old');
  assert.ok(records.find(item => item.messageId === 'old').recalledAt);
  assert.deepEqual(records.find(item => item.messageId === 'old').messageAliases, ['new']);
});

test('messages sharing a minute stay distinct and an unchanged neighbour disambiguates recall', () => {
  const history = createMessengerHistory();
  const before = [snapshot('first'), snapshot('second')];
  const now = Date.now();
  let records = applyEvents([], history.reconcile(before, 'thread', now), settings, now);
  assert.equal(records.length, 2);
  const events = history.reconcile([before[0], recall('replacement')], 'thread', now + 1);
  assert.equal(events[1].replacesMessageId, 'second');
  records = applyEvents(records, events, settings, now + 1);
  assert.equal(records.find(item => item.messageId === 'first').recalledAt, null);
  assert.equal(records.find(item => item.messageId === 'second').text, 'Original second');
});

test('ambiguous replacements, navigation, old removals and still-visible originals do not match', () => {
  const history = createMessengerHistory();
  const before = [snapshot('one'), snapshot('two')];
  history.reconcile(before, 'thread', 0);
  assert.equal(history.reconcile([recall('new-one'), recall('new-two')], 'thread', 1).some(e => e.replacesMessageId), false);
  history.reset();
  history.reconcile([snapshot('one')], 'thread', 0);
  assert.equal(history.reconcile([snapshot('one'), recall('other')], 'thread', 1)[1].replacesMessageId, undefined);
  assert.equal(history.reconcile([recall('other')], 'another-thread', 2)[0].replacesMessageId, undefined);
  history.reset();
  history.reconcile([snapshot('one')], 'thread', 0);
  history.reconcile([], 'thread', 1);
  assert.equal(history.reconcile([recall('other')], 'thread', 11000)[0].replacesMessageId, undefined);
});

test('a retry can join an already stored placeholder and another conversation remains isolated', () => {
  const now = Date.now();
  let records = applyEvents([], [snapshot('old'), recall('new'), {...snapshot('old'), conversationId: 'another-thread'}], settings, now);
  records = applyEvents(records, [{...recall('new'), replacesMessageId: 'old'}], settings, now + 1);
  assert.equal(records.length, 2);
  assert.equal(records.find(r => r.conversationId === 'thread').text, 'Original old');
  assert.equal(records.find(r => r.conversationId === 'another-thread').recalledAt, null);
});

test('a visible empty media slot survives a long-open actions menu without becoming a recall', () => {
  const history = createMessengerHistory();
  const before = [snapshot('before', '16:00\0You'), snapshot('image'), snapshot('after', '16:10\0You')];
  history.reconcile(before, 'thread', 0);
  const menu = history.reconcile([before[0], before[2]], 'thread', 15000, ['before', 'image', 'after']);
  assert.deepEqual(menu.map(event=>event.messageId), ['before','image','after']);
  assert.equal(menu[1].event, 'snapshot');
  const changed = history.reconcile([before[0], recall('replacement'), before[2]], 'thread', 30000, ['before','replacement','after']);
  assert.equal(changed[1].replacesMessageId, 'image');
  history.reset();
  history.reconcile([snapshot('old')], 'thread', 0);
  history.reconcile([], 'thread', 1, []);
  assert.equal(history.reconcile([recall('new')], 'thread', 15000, ['new'])[0].replacesMessageId, undefined);
});
