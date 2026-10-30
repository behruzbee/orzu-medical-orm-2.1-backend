require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');

test('resumed backfill rechecks saved guest destinations before publishing', async () => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
  const axios = require('axios');
  const { run } = require('../scripts/backfill-trello-audio-entries');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-backfill-'));
  const auditPath = path.join(directory, 'audit.json');
  const original = { create: axios.create, get: axios.get, put: axios.put };
  const feedbackId = '22222222-2222-4222-8222-222222222222';
  const id = '33333333-3333-4333-8333-333333333333';
  const cardId = 'a'.repeat(24),
    boardId = 'b'.repeat(24);
  const before = `Обращение и вложения: https://feedback.orzumedical.uz/patients/request\nFeedbackID: ${feedbackId}`;
  const entry = {
    id: cardId,
    boardId,
    feedbackId,
    requestId: 'request',
    before,
    status: 'preparing',
    links: [
      {
        id,
        feedbackId,
        url: `https://feedback.orzumedical.uz/listen#t=${'x'.repeat(43)}`,
      },
    ],
  };
  fs.writeFileSync(auditPath, JSON.stringify({ cards: [entry] }));
  let revoked = false;
  axios.create = () => ({
    post: async (url) => {
      if (url.endsWith('/revoke')) {
        revoked = true;
        return {};
      }
      assert.equal(url, '/audio-guest/status');
      return { data: { available: true, path: '/archive/wrong-file' } };
    },
  });
  axios.get = async () => ({ data: { idBoard: boardId, desc: before } });
  axios.put = async () => {
    throw Error('Must not write a mismatched link');
  };
  try {
    await assert.rejects(
      run({
        env: { TRELLO_BOARD_ID: boardId },
        auditPath,
        patients: [{ cardId, feedbackId, requestId: 'request', valid: true }],
        mapping: {
          evidence: [{ id, feedbackId, mimeType: 'audio/ogg', bytes: 1 }],
        },
      }),
      /Guest target unavailable before publishing/,
    );
    assert.equal(revoked, true);
  } finally {
    Object.assign(axios, original);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
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
