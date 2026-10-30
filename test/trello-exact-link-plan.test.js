const test = require('node:test');
const assert = require('node:assert/strict');
const { planCard } = require('../scripts/trello-exact-link-plan');
const id = '11111111-1111-4111-8111-111111111111';
const feedbackId = '22222222-2222-4222-8222-222222222222';
const old = `https://orzu-medical-feedbacks-20-backend-production.up.railway.app/api/feedbacks/evidence/${id}/file`;
const records = { v2: [{ id, feedbackId, bytes: 8, checksum: 'abcd' }] };
const card = {
  id: 'card',
  idBoard: 'board',
  desc: `Original text\n[Recording](${old})\nFeedbackID: ${feedbackId}\nUnrelated https://example.org/keep`,
};

test('only exact URL changes; description, labels, patient association stay unchanged', () => {
  const result = planCard(card, records, 'https://feedback.example');
  assert.equal(result.replacements.length, 1);
  assert.equal(
    result.after,
    card.desc.replace(
      old,
      `https://feedback.example/archive/v2/feedbacks/${feedbackId}/evidence/${id}`,
    ),
  );
  assert.equal(result.unresolved.length, 0);
});

test('same UUID in another database must not match', () => {
  const result = planCard(
    card,
    { v21: records.v2 },
    'https://feedback.example',
  );
  assert.equal(result.after, card.desc);
  assert.equal(result.replacements.length, 0);
});

test('missing, ambiguous, or conflicting feedback IDs are left unchanged', () => {
  for (const desc of [
    old,
    `${old}\nFeedbackID: ${id}`,
    `${card.desc}\nFeedbackID: ${id}`,
  ]) {
    const result = planCard(
      { ...card, desc },
      records,
      'https://feedback.example',
    );
    assert.equal(result.after, desc);
    assert.equal(result.replacements.length, 0);
  }
  assert.equal(
    planCard(
      card,
      { v2: [...records.v2, ...records.v2] },
      'https://feedback.example',
    ).after,
    card.desc,
  );
});

test('unknown old file, query strings, and lookalike domains are not guessed', () => {
  for (const url of [
    old + '?other=1',
    old.replace('.app/', '.app.attacker.test/'),
    old.replace(id, feedbackId),
  ]) {
    const changed = { ...card, desc: card.desc.replace(old, url) };
    assert.equal(
      planCard(changed, records, 'https://feedback.example').after,
      changed.desc,
    );
  }
});

test('old numeric voice links require exact original URL and matching feedback', () => {
  const voice =
    'https://orzu-med-complaints-server-production.up.railway.app/voice/30';
  const changed = { ...card, desc: card.desc.replace(old, voice) };
  assert.equal(
    planCard(
      changed,
      { v1: [{ ...records.v2[0], originalUrl: voice }] },
      'https://feedback.example',
    ).replacements.length,
    1,
  );
  assert.equal(
    planCard(
      changed,
      { v1: [{ ...records.v2[0], originalUrl: voice + '0' }] },
      'https://feedback.example',
    ).replacements.length,
    0,
  );
});
