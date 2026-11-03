const test = require('node:test');
const assert = require('node:assert/strict');
const { sendPublicAudio } = require('../src/modules/archive/public-audio-response');
const { PublicFeedbackController } = require('../src/modules/feedbacks/public-feedback.controller');
const { createPublicFeedbackToken } = require('../src/modules/feedbacks/public-feedback-link');

function response() {
  return { code: 200, headers: {}, set(key, value) { Object.assign(this.headers, typeof key === 'string' ? { [key]: value } : key); return this; }, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, end() { return this; } };
}
test('browser audio supports full, seek, suffix and invalid ranges', () => {
  const record = { data: Buffer.from('0123456789'), mimeType: 'audio/ogg' };
  for (const [range, code, body] of [[undefined, 200, '0123456789'], ['bytes=2-5', 206, '2345'], ['bytes=-3', 206, '789'], ['bytes=10-', 416, undefined], ['bytes=-0', 416, undefined]]) {
    const res = response(); sendPublicAudio(res, record, range);
    assert.equal(res.code, code); assert.equal(res.body?.toString(), body);
  }
});
test('public card audio stays bound to the signed feedback and archive source', async () => {
  const feedbackId = '86ecd56e-b85b-4e15-b943-0ae95308c9ff';
  const secret = 'test-secret';
  let binding;
  const controller = new PublicFeedbackController({}, { get: () => secret }, { evidence: async (...args) => { binding = args; return { data: Buffer.from('voice'), mimeType: 'audio/ogg', bytes: 5 }; } });
  const token = createPublicFeedbackToken(secret, feedbackId, 30, 'v2');
  await controller.audio(token, 'evidence-id', { headers: {} }, response());
  assert.deepEqual(binding, ['v2', feedbackId, 'evidence-id', true]);
  await assert.rejects(() => controller.audio(token + 'x', 'other', { headers: {} }, response()));
});
