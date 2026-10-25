import type { MigrationDatabase } from './migrations.ts';

export type BindValue = string | number | null;
export interface Database extends MigrationDatabase {
  runAsync(sql: string, ...params: BindValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, ...params: BindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: BindValue[]): Promise<T[]>;
}

/** All repository operations on a connection share a queue, including reads.
 * Expo withTransactionAsync also captures queries on the same connection;
 * serialization prevents unrelated repository calls joining a transaction.
 */
const queues = new WeakMap<Database, Promise<unknown>>();
export class Store {
  readonly db: Database;
  readonly now: () => string;
  constructor(db: Database, now: () => string = () => new Date().toISOString()) {
    this.db = db; this.now = now;
  }

  read<T>(task: (db: Database) => Promise<T>): Promise<T> {
    const result = (queues.get(this.db) ?? Promise.resolve()).then(() => task(this.db));
    queues.set(this.db, result.catch(() => {}));
    return result;
  }

  write<T>(task: (db: Database) => Promise<T>): Promise<T> {
    return this.read(async (db) => {
      let result!: T;
      await db.withTransactionAsync(async () => { result = await task(db); });
      return result;
    });
  }
}

export async function uuid(db: Database): Promise<string> {
  const row = await db.getFirstAsync<{ id: string }>(`SELECT lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' ||
    substr('89ab', (random() & 3) + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' ||
    lower(hex(randomblob(6))) AS id`);
  if (!row) throw new Error('Could not generate UUID.');
  return row.id;
}

export async function required<T>(db: Database, sql: string, ...params: BindValue[]): Promise<T> {
  const row = await db.getFirstAsync<T>(sql, ...params);
  if (!row) throw new Error('Record not found.');
  return row;
}

/** Internal SQL builder. Table/column names are constants in repository code;
 * values always use bound parameters. Never pass user-supplied identifiers. */
export async function insert(db: Database, table: string, row: Record<string, BindValue>): Promise<void> {
  const columns = Object.keys(row);
  await db.runAsync(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(row));
}
