import {test} from 'node:test';
import assert from 'node:assert/strict';
import {feedbackPayload, feedbackEmailUrl, feedbackEmailText} from '../src/core/feedback.js';

const value = {message: 'Xin thêm bộ lọc hình ảnh', email: '', category: 'suggestion', consent: true, records: ['PRIVATE']};
test('feedback validates consent and only includes volunteered fields', () => {
  assert.throws(() => feedbackPayload({message:value.message}, '0.5.5'), /đồng ý/);
  assert.throws(() => feedbackPayload({...value,message:'ngắn'}, '0.5.5'), /10/);
  assert.throws(() => feedbackPayload({...value,email:'bad'}, '0.5.5'), /Email/);
  assert.deepEqual(feedbackPayload({...value,token:'secret'}, '0.5.5'), {
    message:value.message,category:'suggestion',email:'',version:'0.5.5'
  });
});
test('email composition keeps recipient fixed and encodes user content without header injection', () => {
  const url = new URL(feedbackEmailUrl({...value,message:'Xin hỗ trợ &bcc=attacker@example.test\nSubject: forged',email:'tester@example.test'}, '0.5.5'));
  assert.equal(url.protocol,'mailto:');
  assert.equal(url.pathname,'contact.nguyenxuanphu@gmail.com');
  assert.match(url.searchParams.get('subject'), /^\[StillHere\] /);
  assert.deepEqual([...url.searchParams.keys()],['subject','body']);
  assert.match(url.searchParams.get('body'),/tester@example.test/);
  assert.match(url.searchParams.get('body'),/&bcc=attacker/);
  assert(!url.href.includes('PRIVATE'));
});

test('local copy uses the selected language and includes only volunteered fields', () => {
  const draft = {...value, consent:false, token:'secret', category:'bug'};
  const text = feedbackEmailText(draft, '0.7.7', 'en');
  assert.match(text, /^To: contact\.nguyenxuanphu@gmail\.com\nSubject: \[StillHere\] Bug report\n/);
  assert(text.includes(value.message));
  assert.match(text, /Reply email: \(use sender email\)\nVersion: 0\.7\.7$/);
  assert(!text.includes('PRIVATE'));
  assert(!text.includes('secret'));
  assert.throws(() => feedbackEmailText({...draft,email:'bad'}, '0.7.7'), /Email/);
  assert.throws(() => feedbackEmailUrl(draft, '0.7.7', 'en'), /đồng ý/);
  const url = new URL(feedbackEmailUrl({...draft,consent:true}, '0.7.7', 'en'));
  assert.equal(url.searchParams.get('subject'), '[StillHere] Bug report');
});
