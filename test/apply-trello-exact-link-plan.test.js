const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const axios = require('axios');
const { run } = require('../scripts/apply-trello-exact-link-plan');

async function fixture(action) {
  const original = { create: axios.create, get: axios.get, put: axios.put };
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'trello-exact-test-'),
  );
  const bytes = Buffer.from('exact recording');
  const record = {
    source: 'v2',
    id: '11111111-1111-4111-8111-111111111111',
    feedbackId: '22222222-2222-4222-8222-222222222222',
    bytes: bytes.length,
    checksum: createHash('sha256').update(bytes).digest('hex'),
    oldUrl: 'https://old.example/file',
  };
  record.newUrl = `https://feedback.example/archive/v2/feedbacks/${record.feedbackId}/evidence/${record.id}`;
  const plan = {
    cardId: 'a'.repeat(24),
    boardId: 'b'.repeat(24),
    before: `Recording ${record.oldUrl}`,
    after: `Recording ${record.newUrl}`,
    replacements: [record],
  };
  let current = plan.before;
  let writes = 0;
  axios.create = () => ({
    get: async (url) => ({
      data: url.endsWith('/file') ? bytes : { ...record },
    }),
  });
  axios.get = async () => ({ data: { idBoard: plan.boardId, desc: current } });
  axios.put = async (_, body) => {
    const audit = JSON.parse(
      fs.readFileSync(path.join(directory, fs.readdirSync(directory)[0])),
    );
    assert.equal(audit.cards[0].before, plan.before);
    assert.equal(audit.cards[0].status, 'pending');
    writes++;
    current = body.desc;
    return { data: {} };
  };
  const options = {
    plans: [plan],
    env: {
      ADMIN_BEARER_TOKEN: 'test',
      API_BASE_URL: 'https://api.example',
      FRONTEND_URL: 'https://feedback.example',
      TRELLO_BOARD_ID: plan.boardId,
    },
    auditDirectory: directory,
    apply: true,
  };
  try {
    await action({
      options,
      plan,
      record,
      writes: () => writes,
      setCurrent: (value) => {
        current = value;
      },
    });
  } finally {
    Object.assign(axios, original);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('file verification and private original backup precede card write; result is reread', () =>
  fixture(async ({ options, writes }) => {
    const result = await run(options);
    assert.equal(writes(), 1);
    assert.equal(result.cards[0].status, 'updated-and-reread');
    assert.equal(fs.statSync(result.auditPath).mode & 0o777, 0o600);
  }));

test('content mismatch aborts before card mutation', () =>
  fixture(async ({ options, record, writes }) => {
    record.checksum = '0'.repeat(64);
    await assert.rejects(run(options), /content mismatch/);
    assert.equal(writes(), 0);
  }));

test('concurrent user changes are preserved', () =>
  fixture(async ({ options, setCurrent, writes }) => {
    setCurrent('New user description');
    const result = await run(options);
    assert.equal(writes(), 0);
    assert.equal(result.cards[0].status, 'skipped-concurrent-edit');
  }));

test('already-updated cards are not modified again', () =>
  fixture(async ({ options, plan, setCurrent, writes }) => {
    setCurrent(plan.after);
    const result = await run(options);
    assert.equal(writes(), 0);
    assert.equal(result.cards[0].status, 'already-updated');
  }));

test('changes outside URLs are rejected before mutation', () =>
  fixture(async ({ options, plan, writes }) => {
    plan.after += '\nChanged patient';
    await assert.rejects(run(options), /beyond exact URLs/);
    assert.equal(writes(), 0);
  }));
