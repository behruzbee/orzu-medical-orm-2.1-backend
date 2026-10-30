require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  trelloEvidenceLines,
  patientRequestUrl,
} = require('../src/modules/feedbacks/trello-links');
const { addAudioEntries } = require('../scripts/backfill-trello-audio-entries');

test('new Trello audio entry opens the guest player, not a login-protected patient page', async () => {
  const calls = [];
  const url = `https://feedback.example.test/listen#t=${'a'.repeat(43)}`;
  const rendered = await trelloEvidenceLines(
    [
      {
        id: 'voice-one',
        type: 'audio',
        mediaData: Buffer.from('audio'),
        mediaUrl:
          'https://api.example.test/api/feedbacks/evidence/11111111-1111-4111-8111-111111111111/file',
      },
      { id: 'comment', type: 'text', text: 'Original note' },
    ],
    async (id) => {
      calls.push(id);
      return url;
    },
  );
  assert.deepEqual(calls, ['voice-one']);
  assert.ok(
    rendered.includes(
      `Слушать голосовое сообщение (один раз без входа): ${url}`,
    ),
  );
  assert.ok(rendered.includes('Original note'));
  assert.ok(!rendered.includes('/patients/'));
  assert.equal(
    patientRequestUrl('https://feedback.example.test', 'request'),
    'https://feedback.example.test/patients/request',
  );
});

test('every audio file has its own exact link; non-audio files are not published', async () => {
  const calls = [];
  const rendered = await trelloEvidenceLines(
    [
      { id: 'one', type: 'audio', mediaData: Buffer.from('one') },
      { id: 'two', type: 'audio', mediaData: Buffer.from('two') },
      { id: 'empty', type: 'audio', mediaData: Buffer.alloc(0) },
      {
        id: 'document',
        type: 'document',
        mediaData: Buffer.from('pdf'),
        mediaUrl:
          'https://api.test/api/feedbacks/evidence/11111111-1111-4111-8111-111111111111/file',
      },
    ],
    async (id) => {
      calls.push(id);
      return `https://feedback.example.test/listen#t=${id}`;
    },
  );
  assert.deepEqual(calls, ['one', 'two']);
  assert.ok(rendered.includes('#t=one'));
  assert.ok(rendered.includes('#t=two'));
  assert.ok(rendered.includes('Вложение доступно в обращении'));
});

test('backfill adds explicit audio links without publishing or replacing the patient record', () => {
  const patient = 'https://feedback.example.test/patients/request';
  const voice = `https://feedback.example.test/listen#t=${'a'.repeat(43)}`;
  const before = `Original clinical text\nОбращение и вложения: ${patient}\nFeedbackID: feedback`;
  const after = addAudioEntries(before, [{ url: voice }]);
  assert.ok(after.includes(`1. Слушать: ${voice}`));
  assert.ok(after.includes(`Карточка пациента (вход в аккаунт): ${patient}`));
  assert.ok(after.startsWith('Original clinical text\n'));
  assert.ok(after.endsWith('FeedbackID: feedback'));
  assert.throws(() => addAudioEntries('Unrelated card', [{ url: voice }]));
});
