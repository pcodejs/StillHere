import {test} from 'node:test';
import assert from 'node:assert/strict';
import {platformStatusLabel, platformStatusHint} from '../src/popup/status-label.js';

test('Facebook status copy never falls back to Zalo wording', () => {
  for (const status of ['waiting','live','connected','offline','reconnecting','background']) {
    const vi = platformStatusLabel(status, 'facebook', 'vi');
    const en = platformStatusLabel(status, 'facebook', 'en');
    assert.match(vi, /Facebook|Messenger|tin mới|thẻ nền/);
    assert.match(en, /Facebook|Messenger|messages|background/);
    assert.doesNotMatch(vi, /Zalo/);
    assert.doesNotMatch(en, /Zalo/);
    assert.doesNotMatch(platformStatusHint(status, 'facebook', 'vi'), /Zalo Web/);
  }
});

test('Zalo status copy retains the existing localized wording', () => {
  assert.equal(platformStatusLabel('connected', 'zalo', 'vi'), 'Đã kết nối Zalo Web');
  assert.equal(platformStatusLabel('connected', 'zalo', 'en'), 'Connected to Zalo Web');
});
