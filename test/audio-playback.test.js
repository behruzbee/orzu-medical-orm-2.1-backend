require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const {
  AudioPlaybackService,
} = require('../src/modules/archive/audio-playback.service');
const {
  AudioOriginGuard,
  AudioPlaybackController,
  AudioGuestController,
} = require('../src/modules/archive/audio-playback.controller');
const {
  ArchiveController,
} = require('../src/modules/archive/archive.controller');
const {
  FeedbacksController,
} = require('../src/modules/feedbacks/feedbacks.controller');
const { AdminGuard } = require('../src/common/guards/admin.guard');
const { audioMime } = require('../src/modules/archive/audio-policy');
const { replaceExact } = require('../scripts/trello-audio-shares');
const actor = '11111111-1111-4111-8111-111111111111';
const feedback = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const config = {
  get: () => 'https://feedback.example.test',
  getOrThrow: () => 'https://feedback.example.test',
};
const record = {
  mimeType: 'audio/ogg',
  bytes: 4,
  data: Buffer.from([0, 1, 254, 255]),
};

test('archive issuance and sharing require admin; playback requires an active JWT', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, AudioPlaybackController);
  assert.ok(guards.includes(AudioOriginGuard));
  assert.equal(guards.length, 2);
  for (const name of ['issueArchive', 'share', 'revokeShare'])
    assert.ok(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AudioPlaybackController.prototype[name],
      ).includes(AdminGuard),
    );
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AudioGuestController), [
    AudioOriginGuard,
  ]);
});

test('origin guard blocks cross-site, missing origin, form requests and ranges', () => {
  const guard = new AudioOriginGuard(config);
  const valid = {
    origin: 'https://feedback.example.test',
    'x-audio-playback': '1',
    'content-type': 'application/json',
  };
  const context = (headers) => ({
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({ set() {} }),
    }),
  });
  assert.equal(guard.canActivate(context(valid)), true);
  for (const bad of [
    { origin: undefined },
    { origin: 'https://evil.test' },
    { 'x-audio-playback': undefined },
    { 'content-type': 'text/plain' },
    { range: 'bytes=0-10' },
  ])
    assert.throws(() => guard.canActivate(context({ ...valid, ...bad })), {
      status: 403,
    });
});

test('download endpoints reject audio even with generic MIME', async () => {
  for (const evidence of [
    record,
    { type: 'audio', mimeType: 'application/octet-stream' },
  ]) {
    await assert.rejects(
      new ArchiveController({ evidence: async () => evidence }).download(
        'v2',
        feedback,
        id,
        {},
      ),
      { status: 403 },
    );
    await assert.rejects(
      new FeedbacksController({
        getEvidenceFile: async () => evidence,
      }).getFile(id, {}),
      { status: 403 },
    );
  }
});

test('tickets have 256-bit secrets; only a hash is stored, with actor and exact binding', async () => {
  const queries = [];
  const db = {
    query: async (sql, args) => {
      queries.push([sql, args]);
      return [{ attempts: 1 }];
    },
    transaction: async (fn) => fn(db),
  };
  const archive = {
    evidence: async (...args) => {
      assert.deepEqual(args, ['v2', feedback, id]);
      return record;
    },
  };
  const result = await new AudioPlaybackService(db, archive, config).issue(
    actor,
    'v2',
    feedback,
    id,
  );
  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(result.expiresIn, 60);
  const [sql, args] = queries.find(([sql]) =>
    sql.includes('INSERT INTO audio_playback_tickets'),
  );
  assert.match(sql, /60 seconds/);
  assert.deepEqual(args, [
    createHash('sha256').update(result.token).digest('hex'),
    actor,
    'v2',
    feedback,
    id,
    true,
  ]);
  assert.ok(!JSON.stringify(queries).includes(result.token));
});

test('atomic claim verifies actor, expiry, revocation, role and single use before fetching bytes', async () => {
  let claimed = false;
  let fetched = 0;
  const db = {
    query: async (sql, args) => {
      if (sql.includes('audio_playback_limits')) return [{ attempts: 1 }];
      if (sql.includes('WITH claimed')) {
        assert.match(sql, /actor_id = \$2/);
        assert.match(sql, /expires_at > now\(\)/);
        assert.match(sql, /consumed_at IS NULL AND revoked_at IS NULL/);
        assert.match(sql, /NOT requires_admin OR \$3/);
        assert.equal(args[1], actor);
        assert.equal(args[2], true);
        if (claimed) return [];
        claimed = true;
        return [{ source: 'v2', feedback_id: feedback, evidence_id: id }];
      }
      return [];
    },
  };
  const service = new AudioPlaybackService(
    db,
    {
      evidence: async (...args) => {
        fetched++;
        assert.deepEqual(args, ['v2', feedback, id, true]);
        return record;
      },
    },
    config,
  );
  assert.deepEqual(
    (await service.play(actor, 'a'.repeat(43), true)).data,
    record.data,
  );
  await assert.rejects(service.play(actor, 'a'.repeat(43), true), {
    status: 403,
  });
  assert.equal(fetched, 1);
});

test('guest preview never consumes, never exposes patient identity or file bytes', async () => {
  const service = new AudioPlaybackService(
    {
      query: async (sql) => {
        assert.ok(sql.trim().startsWith('SELECT'));
        assert.ok(!sql.includes('UPDATE'));
        return [
          {
            source: 'v2',
            feedback_id: feedback,
            evidence_id: id,
            available: true,
          },
        ];
      },
    },
    {},
    config,
  );
  assert.deepEqual(await service.guestStatus('a'.repeat(43)), {
    available: true,
    path: `/archive/v2/feedbacks/${feedback}/evidence/${id}`,
  });
});

test('guest playback is globally one-use, not based on cookies or browser storage', async () => {
  let used = false;
  const service = new AudioPlaybackService(
    {
      query: async (sql) => {
        assert.match(sql, /UPDATE audio_guest_links/);
        assert.match(sql, /consumed_at IS NULL/);
        assert.match(sql, /expires_at > now\(\)/);
        assert.match(sql, /revoked_at IS NULL/);
        if (used) return [];
        used = true;
        return [{ source: 'v2', feedback_id: feedback, evidence_id: id }];
      },
    },
    { evidence: async () => record },
    config,
  );
  await service.guestPlay('a'.repeat(43));
  await assert.rejects(service.guestPlay('a'.repeat(43)), { status: 403 });
});

test('guest links expire after 24 hours and secrets live in fragments, not URL paths or queries', async () => {
  const queries = [];
  const db = {
    query: async (sql, args) => {
      queries.push([sql, args]);
      return [{ attempts: 1, expires_at: 'expiry' }];
    },
    transaction: async (fn) => fn(db),
  };
  const shared = await new AudioPlaybackService(
    db,
    { evidence: async () => record },
    config,
  ).share(actor, 'v2', feedback, id);
  const url = new URL(shared.url);
  assert.equal(url.pathname, '/listen');
  assert.equal(url.search, '');
  assert.match(url.hash, /^#t=[A-Za-z0-9_-]{43}$/);
  assert.ok(queries.some(([sql]) => sql.includes('24 hours')));
  assert.ok(!JSON.stringify(queries).includes(url.hash.slice(3)));
});

test('rate limiting rejects excess requests before evidence is read', async () => {
  const service = new AudioPlaybackService(
    { query: async () => [{ attempts: 21 }] },
    {
      evidence: () => {
        throw Error('Must not load');
      },
    },
    config,
  );
  await assert.rejects(service.issue(actor, 'v2', feedback, id), {
    status: 429,
  });
});

test('active content, empty and oversized files cannot be served as audio', () => {
  for (const invalid of [
    { mimeType: 'text/html', bytes: 1 },
    { mimeType: 'audio/ogg', bytes: 0 },
    { mimeType: 'audio/ogg', bytes: 65 * 1024 * 1024 },
  ])
    assert.throws(() => audioMime(invalid), { status: 415 });
  assert.equal(audioMime(record), 'audio/ogg');
  assert.equal(audioMime({ mimeType: 'audio/x-m4a', bytes: 4 }), 'audio/mp4');
});

test('Trello migration changes exact audio URLs only, preserving all other text and links', () => {
  const original = 'https://feedback.example.test/archive/v2/feedbacks/abc/evidence/def';
  const replacement = `https://feedback.example.test/listen#t=${'a'.repeat(43)}`;
  const before = `FeedbackID: abc\n[audio](${original})\n${original}\n${original}?other=1\nKeep clinical text unchanged.`;
  assert.equal(replaceExact(before, new Map([[original, replacement]])), `FeedbackID: abc\n[audio](${replacement})\n${replacement}\n${original}?other=1\nKeep clinical text unchanged.`);
});
