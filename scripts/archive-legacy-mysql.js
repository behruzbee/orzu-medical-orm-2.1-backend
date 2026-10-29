const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');

const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const digest = (value) => createHash('sha256').update(value).digest('hex');

function enumValues(type) {
  if (!type.startsWith('enum(') || !type.endsWith(')'))
    throw Error('Invalid enum');
  const body = type.slice(5, -1);
  const tokens = [...body.matchAll(/'((?:[^'\\]|'')*)'/g)];
  if (tokens.map((token) => token[0]).join(',') !== body) {
    throw Error('Unsupported enum escaping; manual schema review required');
  }
  return tokens.map((token) => token[1].replaceAll("''", "'"));
}

function columnType(column, enumName) {
  switch (column.DATA_TYPE) {
    case 'varchar':
      return `varchar(${Number(column.CHARACTER_MAXIMUM_LENGTH)})`;
    case 'text':
      return 'text';
    case 'int':
    case 'bigint':
      if (/unsigned/.test(column.COLUMN_TYPE))
        throw Error('Unsigned integer needs review');
      return column.DATA_TYPE === 'int' ? 'integer' : 'bigint';
    case 'datetime':
      return `timestamp(${Number(column.DATETIME_PRECISION || 0)}) without time zone`;
    case 'mediumblob':
      return 'bytea';
    case 'enum':
      return quote(enumName);
    default:
      throw Error(`Unsupported type: ${column.DATA_TYPE}`);
  }
}

function canonical(value, column) {
  if (value === null) return null;
  if (column.DATA_TYPE === 'mediumblob') {
    if (!Buffer.isBuffer(value))
      throw Error('Binary data was not returned as Buffer');
    return value.toString('hex');
  }
  if (column.DATA_TYPE === 'datetime') {
    const match = String(value).match(
      /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(?:\.(\d{1,6}))?$/,
    );
    if (!match || match[1].startsWith('0000')) throw Error('Invalid timestamp');
    return match[1] + '.' + (match[2] || '').padEnd(6, '0');
  }
  return String(value);
}

function rowDigest(row, columns) {
  return digest(
    JSON.stringify(
      columns.map((column) => canonical(row[column.COLUMN_NAME], column)),
    ),
  );
}

function groups(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const name = key(row);
    if (!result.has(name)) result.set(name, []);
    result.get(name).push(row);
  }
  return result;
}

async function migrate(options) {
  if (fs.existsSync(options.audit))
    throw Error('Audit already exists; refusing rerun');
  const mysql = require(options['mysql-client']);
  const { Client, types } = require('pg');
  types.setTypeParser(1114, (value) => value);
  const env = require('dotenv').parse(fs.readFileSync(options['mysql-env']));
  const target = JSON.parse(fs.readFileSync(options['target-config'])).find(
    (config) => config.database === options['target-database'],
  );
  if (!target || !target.database.startsWith('orzu_legacy_'))
    throw Error('Archive destination required');
  const source = await mysql.createConnection({
    host: env.DB_HOSTNAME,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  const destination = new Client({
    ...target,
    host: options['target-host'],
    port: Number(options['target-port']),
  });
  let committed = false;
  try {
    await destination.connect();
    await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    await destination.query('BEGIN');
    await destination.query("SET LOCAL TIME ZONE 'UTC'");
    await destination.query('SET LOCAL standard_conforming_strings = on');
    const existing = await destination.query(
      "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",
    );
    if (Number(existing.rows[0].count))
      throw Error('Destination is not empty; refusing overwrite');
    for (const [table, schemaColumn] of [
      ['ROUTINES', 'ROUTINE_SCHEMA'],
      ['TRIGGERS', 'TRIGGER_SCHEMA'],
      ['EVENTS', 'EVENT_SCHEMA'],
    ]) {
      const [rows] = await source.query(
        `SELECT count(*) AS total FROM information_schema.${table} WHERE ${schemaColumn}=DATABASE()`,
      );
      if (Number(rows[0].total)) throw Error(`${table} need manual migration`);
    }
    const [columns] = await source.query(
      'SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION',
    );
    const [indexes] = await source.query(
      'SELECT * FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX',
    );
    const [keys] = await source.query(
      'SELECT k.*,r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION',
    );
    const tables = groups(columns, (column) => column.TABLE_NAME);
    const expected = [
      'call_statuses',
      'feedbacks',
      'patients',
      'points',
      'text_messages',
      'trello_cards',
      'users',
      'voice_messages',
    ];
    if (JSON.stringify([...tables.keys()].sort()) !== JSON.stringify(expected))
      throw Error('Unexpected source tables');
    const audit = {
      startedAt: new Date().toISOString(),
      destination: target.database,
      tables: [],
      schema: { columns, indexes, keys },
      notes: [
        'Separate archive, not an application cutover.',
        'MySQL collation behavior is not emulated; PostgreSQL native collation is used.',
      ],
    };
    for (const [table, fields] of tables) {
      const definitions = [];
      for (const column of fields) {
        const enumName = `${table}_${column.COLUMN_NAME}_enum`;
        if (column.DATA_TYPE === 'enum')
          await destination.query(
            `CREATE TYPE ${quote(enumName)} AS ENUM (${enumValues(column.COLUMN_TYPE).map(literal).join(',')})`,
          );
        if (column.GENERATION_EXPRESSION)
          throw Error('Generated column needs review');
        let definition = `${quote(column.COLUMN_NAME)} ${columnType(column, enumName)}`;
        if (column.EXTRA === 'auto_increment')
          definition += ' GENERATED BY DEFAULT AS IDENTITY';
        else if (column.COLUMN_DEFAULT !== null) {
          definition += /^CURRENT_TIMESTAMP(?:\(\d\))?$/.test(
            column.COLUMN_DEFAULT,
          )
            ? ` DEFAULT LOCALTIMESTAMP(${Number(column.DATETIME_PRECISION || 0)})`
            : ` DEFAULT ${literal(column.COLUMN_DEFAULT)}`;
        }
        if (column.IS_NULLABLE === 'NO') definition += ' NOT NULL';
        definitions.push(definition);
      }
      await destination.query(
        `CREATE TABLE ${quote(table)} (${definitions.join(',')})`,
      );
      const primary = indexes.filter(
        (index) => index.TABLE_NAME === table && index.INDEX_NAME === 'PRIMARY',
      );
      if (primary.length !== 1 || primary[0].COLUMN_NAME !== 'id')
        throw Error('Expected single id primary key');
      const hashes = [];
      let cursor;
      let count = 0;
      const numericId =
        fields.find((column) => column.COLUMN_NAME === 'id').DATA_TYPE ===
        'int';
      const order = numericId ? '`id`' : 'BINARY `id`';
      while (true) {
        const [rows] = await source.query(
          `SELECT * FROM \`${table}\` ${cursor === undefined ? '' : `WHERE ${order} > ?`} ORDER BY ${order} LIMIT 100`,
          cursor === undefined ? [] : [cursor],
        );
        if (!rows.length) break;
        const values = [];
        const placeholders = rows.map(
          (row) =>
            '(' +
            fields
              .map((column) => {
                const value = row[column.COLUMN_NAME];
                if (column.DATA_TYPE === 'datetime' && value !== null)
                  canonical(value, column);
                values.push(value);
                return '$' + values.length;
              })
              .join(',') +
            ')',
        );
        await destination.query(
          `INSERT INTO ${quote(table)} (${fields.map((column) => quote(column.COLUMN_NAME)).join(',')}) VALUES ${placeholders.join(',')}`,
          values,
        );
        hashes.push(...rows.map((row) => rowDigest(row, fields)));
        count += rows.length;
        cursor = rows.at(-1).id;
      }
      const copiedHashes = [];
      cursor = undefined;
      while (true) {
        const sort = numericId ? '"id"' : '"id" COLLATE "C"';
        const { rows } = await destination.query(
          `SELECT * FROM ${quote(table)} ${cursor === undefined ? '' : `WHERE ${sort} > $1`} ORDER BY ${sort} LIMIT 100`,
          cursor === undefined ? [] : [cursor],
        );
        if (!rows.length) break;
        copiedHashes.push(...rows.map((row) => rowDigest(row, fields)));
        cursor = rows.at(-1).id;
      }
      const sourceHash = digest(hashes.sort().join(''));
      const targetHash = digest(copiedHashes.sort().join(''));
      if (count !== copiedHashes.length || sourceHash !== targetHash)
        throw Error(`Content mismatch: ${table}`);
      audit.tables.push({
        table,
        rows: count,
        checksum: sourceHash,
        verified: true,
      });
      console.log(JSON.stringify({ table, rows: count, contentsMatch: true }));
    }
    for (const index of groups(
      indexes,
      (row) => row.TABLE_NAME + ':' + row.INDEX_NAME,
    ).values()) {
      if (
        index.some((row) => row.SUB_PART !== null || row.INDEX_TYPE !== 'BTREE')
      )
        throw Error('Special index needs review');
      const first = index[0];
      const fields = index.map((row) => quote(row.COLUMN_NAME)).join(',');
      if (first.INDEX_NAME === 'PRIMARY')
        await destination.query(
          `ALTER TABLE ${quote(first.TABLE_NAME)} ADD PRIMARY KEY (${fields})`,
        );
      else
        await destination.query(
          `CREATE ${first.NON_UNIQUE ? '' : 'UNIQUE '}INDEX ${quote(first.INDEX_NAME)} ON ${quote(first.TABLE_NAME)} (${fields})`,
        );
    }
    for (const key of groups(
      keys.filter((row) => row.REFERENCED_TABLE_NAME),
      (row) => row.TABLE_NAME + ':' + row.CONSTRAINT_NAME,
    ).values()) {
      const first = key[0];
      if (
        ![first.UPDATE_RULE, first.DELETE_RULE].every((rule) =>
          ['CASCADE', 'RESTRICT', 'NO ACTION', 'SET NULL'].includes(rule),
        )
      )
        throw Error('Unsupported foreign key action');
      await destination.query(
        `ALTER TABLE ${quote(first.TABLE_NAME)} ADD CONSTRAINT ${quote(first.CONSTRAINT_NAME)} FOREIGN KEY (${key.map((row) => quote(row.COLUMN_NAME)).join(',')}) REFERENCES ${quote(first.REFERENCED_TABLE_NAME)} (${key.map((row) => quote(row.REFERENCED_COLUMN_NAME)).join(',')}) ON UPDATE ${first.UPDATE_RULE} ON DELETE ${first.DELETE_RULE}`,
      );
    }
    for (const column of columns) {
      if (column.EXTRA === 'auto_increment') {
        const [next] = await source.query(
          'SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
          [column.TABLE_NAME],
        );
        await destination.query(
          'SELECT setval(pg_get_serial_sequence($1,$2),$3,false)',
          [
            quote(column.TABLE_NAME),
            column.COLUMN_NAME,
            next[0].AUTO_INCREMENT,
          ],
        );
      }
      if (/on update CURRENT_TIMESTAMP/i.test(column.EXTRA)) {
        const fn = quote(
          `${column.TABLE_NAME}_${column.COLUMN_NAME}_on_update`,
        );
        const field = quote(column.COLUMN_NAME);
        await destination.query(
          `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW IS DISTINCT FROM OLD AND NEW.${field} IS NOT DISTINCT FROM OLD.${field} THEN NEW.${field} := LOCALTIMESTAMP(6); END IF; RETURN NEW; END $$`,
        );
        await destination.query(
          `CREATE TRIGGER ${fn} BEFORE UPDATE ON ${quote(column.TABLE_NAME)} FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
        );
      }
    }
    await destination.query('COMMIT');
    committed = true;
    await source.query('COMMIT');
    audit.completedAt = new Date().toISOString();
    fs.writeFileSync(options.audit, JSON.stringify(audit, null, 2), {
      mode: 0o600,
      flag: 'wx',
    });
    console.log(
      JSON.stringify({
        committed,
        tables: audit.tables.length,
        rows: audit.tables.reduce((sum, row) => sum + row.rows, 0),
      }),
    );
  } finally {
    if (!committed) await destination.query('ROLLBACK').catch(() => {});
    await destination.end().catch(() => {});
    await source.end();
  }
}

if (require.main === module) {
  const names = [
    'mysql-client',
    'mysql-env',
    'target-config',
    'target-database',
    'target-host',
    'target-port',
    'audit',
  ];
  const { values } = parseArgs({
    options: Object.fromEntries(
      names.map((name) => [name, { type: 'string' }]),
    ),
  });
  if (names.some((name) => !values[name]))
    throw Error('Missing required archive migration option');
  migrate(values).catch((error) => {
    console.error(
      `Migration failed (${error.code || error.name}); no row data or credentials logged.`,
    );
    process.exitCode = 1;
  });
}

module.exports = { canonical, columnType, enumValues, rowDigest };
