require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  trelloEvidenceLines,
  patientRequestUrl,
} = require('../src/modules/feedbacks/trello-links');
const { addAudioEntries } = require('../scripts/backfill-trello-audio-entries');
const {
  FeedbacksService,
} = require('../src/modules/feedbacks/feedbacks.service');

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

test('creating feedback wires the persisted audio ID into the actual Trello description', async () => {
  let description;
  let shared;
  const guest = `https://feedback.example.test/listen#t=${'a'.repeat(43)}`;
  const repo = {
    count: async () => 0,
    create: (value) => value,
    save: async (value) => ({ ...value, id: 'feedback-id' }),
  };
  const request = {
    id: 'request-id',
    branch: 'Test',
    patient: { name: 'Test', phone: '' },
  };
  const service = new FeedbacksService(
    repo,
    {},
    { findOne: async () => ({ name: 'Test subcategory' }) },
    { findOne: async () => request, save: async (value) => value },
    {
      createCard: async (_list, _name, desc) => {
        description = desc;
        return null;
      },
    },
    {
      get: (key) =>
        ({
          TRELLO_LIST_NEW_COMPLAINTS: 'list-id',
          FRONTEND_URL: 'https://feedback.example.test',
        })[key],
    },
    {
      share: async (...args) => {
        shared = args;
        return { url: guest };
      },
    },
  );
  const feedback = await service.createComplaint(
    'request-id',
    {
      category: 'doctors',
      subcategory: 'Test subcategory',
      ratings: {},
      comment: 'Test note',
      evidence: [{ type: 'audio', mediaUrl: 'data:audio/ogg;base64,YXVkaW8=' }],
    },
    'operator-id',
  );
  assert.deepEqual(shared, [
    'operator-id',
    'v21',
    'feedback-id',
    feedback.evidenceMessages[0].id,
  ]);
  assert.ok(description.includes(guest));
  assert.ok(
    description.includes(
      'Карточка пациента (вход в аккаунт): https://feedback.example.test/patients/request-id',
    ),
  );
});
