const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  canonical,
  columnType,
  enumValues,
  rowDigest,
} = require('../scripts/archive-legacy-mysql');

test('enum conversion preserves labels and refuses unsupported expressions', () => {
  assert.deepEqual(enumValues("enum('saved','temporary','a,b','it''s')"), [
    'saved',
    'temporary',
    'a,b',
    "it's",
  ]);
  assert.throws(() => enumValues("enum('a',unsupported)"));
});

test('conversion preserves timestamp microseconds without timezone changes', () => {
  const column = { DATA_TYPE: 'datetime' };
  assert.equal(
    canonical('2026-05-01 23:59:59.123456', column),
    '2026-05-01 23:59:59.123456',
  );
  assert.equal(
    canonical('2026-05-01 23:59:59', column),
    '2026-05-01 23:59:59.000000',
  );
  assert.throws(() => canonical('0000-00-00 00:00:00', column));
});

test('binary integrity includes every byte, null and empty are different', () => {
  const fields = [{ COLUMN_NAME: 'data', DATA_TYPE: 'mediumblob' }];
  assert.notEqual(
    rowDigest({ data: null }, fields),
    rowDigest({ data: Buffer.alloc(0) }, fields),
  );
  assert.notEqual(
    rowDigest({ data: Buffer.from([0, 255]) }, fields),
    rowDigest({ data: Buffer.from([0, 254]) }, fields),
  );
  assert.equal(
    canonical('9223372036854775807', { DATA_TYPE: 'bigint' }),
    '9223372036854775807',
  );
});

test('unknown types and unsigned numeric columns fail closed', () => {
  assert.equal(columnType({ DATA_TYPE: 'mediumblob' }), 'bytea');
  assert.throws(() => columnType({ DATA_TYPE: 'geometry' }));
  assert.throws(() =>
    columnType({ DATA_TYPE: 'bigint', COLUMN_TYPE: 'bigint unsigned' }),
  );
});
