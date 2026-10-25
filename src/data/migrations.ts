import { mvpSchema } from './schema.ts';

/** Minimal async surface shared by expo-sqlite and the SQLite integration tests. */
export interface MigrationDatabase {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export interface Migration {
  version: number;
  up(db: MigrationDatabase): Promise<void>;
}

// Version 1 establishes versioning only. Domain tables and seeds belong to Phase 2.
export const migrations: readonly Migration[] = [
  { version: 1, async up() {} },
  { version: 2, async up(db) { await db.execAsync(mvpSchema); } },
];

export async function migrateDatabase(
  db: MigrationDatabase,
  steps: readonly Migration[] = migrations,
): Promise<void> {
  for (const [index, migration] of steps.entries()) {
    if (migration.version !== index + 1) {
      throw new Error('Migration versions must be consecutive, starting at 1.');
    }
  }
  const latestVersion = steps.length;
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (!row) throw new Error('Could not read the database schema version.');
    if (row.user_version > latestVersion) {
      throw new Error('Database schema is newer than this app. Update the app to continue.');
    }
    for (const migration of steps) {
      if (migration.version > row.user_version) {
        await migration.up(db);
        await db.execAsync(`PRAGMA user_version = ${migration.version}`);
      }
    }
  });
}
