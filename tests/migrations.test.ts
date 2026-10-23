import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrateDatabase, type MigrationDatabase } from '../src/data/migrations.ts';

function connect(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  const db: MigrationDatabase = {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync<T>(sql: string) {
      return (sqlite.prepare(sql).get() as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, db };
}

test('bootstrap persists the schema version, enables foreign keys and creates no product tables', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hybrid-db-'));
  const filename = join(directory, 'bootstrap.db');
  let connection = connect(filename);
  try {
    await migrateDatabase(connection.db);
    assert.equal(connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 1);
    assert.equal(connection.sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
    assert.equal(connection.sqlite.prepare('PRAGMA journal_mode').get()?.journal_mode, 'wal');
    assert.equal(connection.sqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'").get()?.count, 0);
    connection.sqlite.close();
    connection = connect(filename);
    await migrateDatabase(connection.db);
    assert.equal(connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 1);
  } finally {
    connection.sqlite.close();
    rmSync(directory, { recursive: true });
  }
});

test('migrations run in order and are not repeated', async () => {
  const { sqlite, db } = connect();
  let runs = 0;
  const steps = [
    { version: 1, async up(db: MigrationDatabase) { runs++; await db.execAsync('CREATE TABLE test_fixture (id INTEGER)'); } },
    { version: 2, async up(db: MigrationDatabase) { runs++; await db.execAsync('INSERT INTO test_fixture VALUES (42)'); } },
  ];
  try {
    await migrateDatabase(db, steps);
    await migrateDatabase(db, steps);
    assert.equal(runs, 2);
    assert.equal(sqlite.prepare('SELECT id FROM test_fixture').get()?.id, 42);
    assert.equal(sqlite.prepare('PRAGMA user_version').get()?.user_version, 2);
  } finally { sqlite.close(); }
});

test('failed migration rolls back its SQL and version and can be retried', async () => {
  const { sqlite, db } = connect();
  try {
    await migrateDatabase(db);
    await assert.rejects(migrateDatabase(db, [
      { version: 1, async up() {} },
      { version: 2, async up(db) { await db.execAsync('CREATE TABLE test_fixture (id INTEGER); INVALID SQL'); } },
    ]));
    assert.equal(sqlite.prepare('PRAGMA user_version').get()?.user_version, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'test_fixture'").get()?.count, 0);
    await migrateDatabase(db, [
      { version: 1, async up() {} },
      { version: 2, async up(db) { await db.execAsync('CREATE TABLE test_fixture (id INTEGER)'); } },
    ]);
    assert.equal(sqlite.prepare('PRAGMA user_version').get()?.user_version, 2);
  } finally { sqlite.close(); }
});

test('newer databases are rejected without downgrading or deleting data', async () => {
  const { sqlite, db } = connect();
  try {
    sqlite.exec('PRAGMA user_version = 99; CREATE TABLE test_fixture (id INTEGER); INSERT INTO test_fixture VALUES (7)');
    await assert.rejects(migrateDatabase(db), /newer than this app/);
    assert.equal(sqlite.prepare('PRAGMA user_version').get()?.user_version, 99);
    assert.equal(sqlite.prepare('SELECT id FROM test_fixture').get()?.id, 7);
  } finally { sqlite.close(); }
});

test('invalid migration sequences are rejected before SQL executes', async () => {
  const { sqlite, db } = connect();
  try {
    await assert.rejects(migrateDatabase(db, [{ version: 2, async up() { throw new Error('must not run'); } }]), /consecutive/);
    assert.equal(sqlite.prepare('PRAGMA user_version').get()?.user_version, 0);
  } finally { sqlite.close(); }
});
