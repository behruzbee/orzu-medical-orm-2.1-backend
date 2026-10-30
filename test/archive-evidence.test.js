require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { AdminGuard } = require('../src/common/guards/admin.guard');
const {
  ArchiveController,
} = require('../src/modules/archive/archive.controller');
const { ArchiveService } = require('../src/modules/archive/archive.service');

const feedbackId = '6eac5bd4-fe33-406a-9532-f32c9d93481a';
const id = 'b8d71a7e-0e41-4dd8-aed3-c4761b70b4d8';

test('archive metadata and files require JWT and admin', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, ArchiveController);
  assert.equal(guards.length, 2);
  assert.ok(guards.includes(AdminGuard));
});

test('unknown source and malformed identifiers never open a database', async () => {
  const service = new ArchiveService({
    get() {
      throw Error('Config must not be read');
    },
  });
  for (const source of ['postgres', '__proto__', 'constructor', 'v2/../../']) {
    await assert.rejects(service.evidence(source, feedbackId, id), {
      status: 404,
    });
  }
  await assert.rejects(service.evidence('v2', "' OR true --", id), {
    status: 404,
  });
});

test('each version binds both file and feedback IDs and omits blob from metadata', async () => {
  const service = new ArchiveService({});
  for (const source of ['v1', 'v2', 'v21']) {
    service.pools.set(source, {
      async query(sql, values) {
        assert.deepEqual(values, [id, feedbackId]);
        assert.match(sql, /e.id = \$1 AND f.id = \$2/);
        assert.doesNotMatch(sql, /AS data/);
        if (source === 'v21') assert.match(sql, /r\."deletedAt" IS NULL/);
        return { rows: [{ id, feedbackId, bytes: 123 }] };
      },
    });
    assert.equal(
      (await service.evidence(source, feedbackId, id)).source,
      source,
    );
  }
});

test('wrong feedback binding is not found; database failures expose no credentials', async () => {
  const service = new ArchiveService({});
  service.pools.set('v2', {
    async query() {
      return { rows: [] };
    },
  });
  await assert.rejects(service.evidence('v2', feedbackId, id), { status: 404 });
  service.pools.set('v2', {
    async query() {
      throw Error('private connection detail');
    },
  });
  await assert.rejects(
    service.evidence('v2', feedbackId, id),
    (error) => error.status === 503 && !error.message.includes('private'),
  );
});

test('download preserves bytes, rejects active-content MIME, and disables caching', async () => {
  const bytes = Buffer.from([0, 255, 10, 39]);
  const controller = new ArchiveController({
    async evidence(source, feedback, evidence, file) {
      assert.deepEqual(
        [source, feedback, evidence, file],
        ['v2', feedbackId, id, true],
      );
      return { data: bytes, mimeType: 'text/html' };
    },
  });
  let headers;
  const file = await controller.download('v2', feedbackId, id, {
    set(value) {
      headers = value;
    },
  });
  const chunks = [];
  for await (const chunk of file.getStream()) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), bytes);
  assert.equal(headers['Content-Type'], 'application/octet-stream');
  assert.equal(headers['Cache-Control'], 'no-store, private');
  assert.match(headers['Content-Disposition'], /^attachment;/);
});
